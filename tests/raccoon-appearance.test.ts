import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { WildlifeVisualRuntime, type WildlifeVisualAction } from '../src/scene/wildlifeVisualRuntime';
import { WildlifePresentation } from '../src/scene/wildlifePresentation';
import { sourceGltf } from './helpers/source-gltf';
import { neutralRaccoonAppearance } from './helpers/raccoon-appearance';

const asset = () => sourceGltf('quaternius/wildlife/Raccoon.glb');
const skinned = (root: THREE.Object3D) => root.getObjectByProperty('type', 'SkinnedMesh') as THREE.SkinnedMesh;
function points(root: THREE.Object3D, region?: string) {
  root.updateMatrixWorld(true);
  const mesh = skinned(root);
  mesh.skeleton.update();
  const result: THREE.Vector3[] = [];
  for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
    const bone = mesh.skeleton.bones[mesh.geometry.getAttribute('skinIndex').getX(i)];
    if (!region || bone.name === region) result.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
  }
  return result;
}
const span = (values: THREE.Vector3[], axis: THREE.Vector3) => {
  const projected = values.map(p => p.dot(axis));
  return Math.max(...projected)-Math.min(...projected);
};
const close = (a: number, b: number, tolerance = 2e-5) => assert.ok(Math.abs(a-b) < tolerance, `${a} != ${b}`);
function fingerprint(source: Awaited<ReturnType<typeof asset>>) {
  const mesh = skinned(source.scene);
  return JSON.stringify({
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, value]) => [key, Array.from(value.array)])),
    indices: Array.from(mesh.geometry.index!.array),
    inverse: mesh.skeleton.boneInverses.map(matrix => matrix.toArray()),
    bones: mesh.skeleton.bones.map(bone => [bone.position.toArray(), bone.quaternion.toArray(), bone.scale.toArray()]),
    material: (mesh.material as THREE.Material).toJSON(),
    clips: source.animations.map(clip => THREE.AnimationClip.toJSON(clip)),
  });
}

test('neutral authored appearance is exactly source-identical and keeps shared resources immutable', async () => {
  const source = await asset();
  const before = fingerprint(source);
  const runtime = new WildlifeVisualRuntime({ load: async () => source });
  await runtime.load('raccoon');
  const unchanged = runtime.createInstance('raccoon', 0)!;
  const neutral = runtime.createInstance('raccoon', 0, 1, neutralRaccoonAppearance())!;
  assert.equal(skinned(neutral).geometry, skinned(source.scene).geometry);
  assert.equal(skinned(neutral).material, skinned(source.scene).material);
  assert.deepEqual(points(neutral).map(p => p.toArray()), points(unchanged).map(p => p.toArray()));
  for (const action of ['idle', 'walk', 'run', 'eat', 'death'] as WildlifeVisualAction[]) {
    runtime.play(neutral, action); runtime.play(unchanged, action);
    for (const dt of [.03, .12, .4]) {
      runtime.update(neutral, dt); runtime.update(unchanged, dt);
      assert.deepEqual(points(neutral).map(p => p.toArray()), points(unchanged).map(p => p.toArray()));
    }
  }
  runtime.dispose(neutral); runtime.dispose(unchanged);
  assert.equal(fingerprint(source), before);
});

test('all five morphology genes preserve their existing axes and authored regions at both bounds', async () => {
  const source = await asset();
  const before = fingerprint(source);
  const runtime = new WildlifeVisualRuntime({ load: async () => source });
  await runtime.load('raccoon');
  const neutral = runtime.createInstance('raccoon', 0, 1, neutralRaccoonAppearance())!;
  const x = new THREE.Vector3(1,0,0), y = new THREE.Vector3(0,1,0), z = new THREE.Vector3(0,0,1);
  const tailBones = skinned(neutral).skeleton.bones;
  const tailAxis = tailBones.find(b => b.name === 'Tail_end')!.getWorldPosition(new THREE.Vector3())
    .sub(tailBones.find(b => b.name === 'Tail')!.getWorldPosition(new THREE.Vector3())).normalize();
  const cases = [
    ['bodyLength', .78, 1.22, 'Body', x],
    ['bodyHeight', .82, 1.18, 'Body', y],
    ['legLength', .78, 1.22, 'FrontLegL', y],
    ['headScale', .82, 1.18, 'Head', x],
    ['tailScale', .75, 1.25, 'Tail', tailAxis],
  ] as const;
  for (const [gene, lower, upper, region, axis] of cases) {
    for (const value of [lower, upper]) {
      const appearance = neutralRaccoonAppearance(); appearance.phenotype.morphology[gene] = value;
      const root = runtime.createInstance('raccoon', 0, 1, appearance)!;
      close(span(points(root, region), axis)/span(points(neutral, region), axis), value);
      if (gene === 'bodyLength' || gene === 'bodyHeight') {
        close(span(points(root, 'Body'), z)/span(points(neutral, 'Body'), z), Math.sqrt(value));
        // Torso adaptation must not stretch the independent head mesh.
        for (const headAxis of [x,y,z]) close(span(points(root, 'Head'), headAxis)/span(points(neutral, 'Head'), headAxis), 1);
      }
      const vertices = points(root);
      assert.ok(vertices.every(p => p.toArray().every(Number.isFinite)));
      close(Math.min(...vertices.map(p => p.y)), 0);
      assert.deepEqual(Array.from(skinned(root).geometry.index!.array), Array.from(skinned(source.scene).geometry.index!.array));
      for (const attribute of ['uv', 'skinIndex', 'skinWeight']) {
        assert.deepEqual(Array.from(skinned(root).geometry.getAttribute(attribute).array), Array.from(skinned(source.scene).geometry.getAttribute(attribute).array));
      }
      runtime.dispose(root);
    }
  }
  runtime.dispose(neutral);
  assert.equal(fingerprint(source), before);
});

test('extreme adapted rigs retain finite skinned animation through every mapped clip and crossfade', async () => {
  const source = await asset();
  const runtime = new WildlifeVisualRuntime({ load: async () => source });
  await runtime.load('raccoon');
  for (const high of [false, true]) {
    const appearance = neutralRaccoonAppearance();
    appearance.phenotype.morphology = high
      ? { bodyLength:1.22, bodyHeight:1.18, legLength:1.22, headScale:1.18, tailScale:1.25 }
      : { bodyLength:.78, bodyHeight:.82, legLength:.78, headScale:.82, tailScale:.75 };
    const root = runtime.createInstance('raccoon', 0, .474208/1.4020539130878025, appearance)!;
    const mesh = skinned(root);
    for (const action of ['idle', 'walk', 'run', 'eat', 'death'] as WildlifeVisualAction[]) {
      assert.ok(runtime.play(root, action));
      const start = points(root);
      let changed = false;
      for (let frame = 0; frame < 90; frame++) {
        runtime.update(root, 1/30);
        const vertices = points(root);
        assert.ok(vertices.every(p => p.toArray().every(Number.isFinite)));
        assert.ok(vertices.every(p => p.length() < 3), `${action} escaped its bounded model envelope`);
        if (vertices.some((p,i) => p.distanceTo(start[i]) > 1e-5)) changed = true;
        // Skin remains bound to the adapted rig, including real animated feet.
        const feet = points(root).filter((_,i) => mesh.skeleton.bones[mesh.geometry.getAttribute('skinIndex').getX(i)].name.includes('Leg'));
        assert.ok(Math.min(...feet.map(p => p.y)) > -.04);
      }
      assert.ok(changed, `${action} did not animate`);
    }
    runtime.dispose(root);
  }
});

test('all 32 gene corners retain the measured authored foot envelope through complete clips', async () => {
  const source=await asset();
  const runtime=new WildlifeVisualRuntime({load:async()=>source});
  await runtime.load('raccoon');
  const keys=['bodyLength','bodyHeight','legLength','headScale','tailScale'] as const;
  const lower=[.78,.82,.78,.82,.75],upper=[1.22,1.18,1.22,1.18,1.25];
  // Real source feet already penetrate during Walk (~17.6 mm) and Idle/eat
  // (~1.4 mm). Adapted corner sampling adds at most ~6.7 mm on Walk. These
  // bounds preserve that authored contact envelope; they do not claim foot IK.
  const minimum:Record<WildlifeVisualAction,number>={idle:-.0025,walk:-.025,run:-.003,eat:-.0025,death:-.04};
  const clipName={idle:'Idle',walk:'Walk',run:'Run',eat:'Idle_Eating',death:'Death'};
  for(let mask=-1;mask<32;mask++){
    for(const action of Object.keys(minimum) as WildlifeVisualAction[]){
      const appearance=neutralRaccoonAppearance();
      if(mask>=0)keys.forEach((key,i)=>{appearance.phenotype.morphology[key]=mask&(1<<i)?upper[i]:lower[i];});
      const root=runtime.createInstance('raccoon',0,.474208/1.4020539130878025,appearance)!;
      const mesh=skinned(root),skin=mesh.geometry.getAttribute('skinIndex');
      const feet=Array.from({length:skin.count},(_,i)=>i).filter(i=>mesh.skeleton.bones[skin.getX(i)].name.includes('Leg'));
      const clip=source.animations.find(clip=>clip.name.endsWith(`|${clipName[action]}`))!;
      const frames=Math.ceil((clip.duration+.2)*30);
      const vertex=new THREE.Vector3();
      runtime.play(root,action);
      for(let frame=0;frame<=frames;frame++){
        runtime.update(root,frame===0?0:1/30);root.updateMatrixWorld(true);mesh.skeleton.update();
        let footY=Infinity;
        for(const i of feet){
          mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld);
          assert.ok(vertex.toArray().every(Number.isFinite));
          footY=Math.min(footY,vertex.y);
        }
        assert.ok(footY>=minimum[action],`${action} corner ${mask} frame ${frame}: foot Y ${footY}`);
        if(frame===0)close(footY,0);
      }
      runtime.dispose(root);
    }
  }
});

test('torso genes do not shear the independently animated head during eating', async () => {
  const source=await asset();
  const runtime=new WildlifeVisualRuntime({load:async()=>source});
  await runtime.load('raccoon');
  const appearance=neutralRaccoonAppearance();
  appearance.phenotype.morphology.bodyLength=1.22;
  appearance.phenotype.morphology.bodyHeight=.82;
  const changed=runtime.createInstance('raccoon',0,1,appearance)!;
  const neutral=runtime.createInstance('raccoon',0,1,neutralRaccoonAppearance())!;
  runtime.play(changed,'eat');runtime.play(neutral,'eat');
  for(let i=0;i<40;i++){
    runtime.update(changed,.1);runtime.update(neutral,.1);
    const a=points(changed,'Head'),b=points(neutral,'Head');
    for(let vertex=1;vertex<a.length;vertex+=37)close(a[vertex].distanceTo(a[0]),b[vertex].distanceTo(b[0]));
  }
  runtime.dispose(changed);runtime.dispose(neutral);
});

test('distinct inherited palettes coexist, retain source detail contrast and dispose only owned resources', async () => {
  const source = await asset();
  const before = fingerprint(source);
  const runtime = new WildlifeVisualRuntime({ load: async () => source });
  await runtime.load('raccoon');
  const a = neutralRaccoonAppearance(), b = neutralRaccoonAppearance();
  a.genome.material = { hueShift:.02, lightnessShift:.08, accentShift:.025 };
  b.genome.material = { hueShift:-.02, lightnessShift:-.08, accentShift:-.025 };
  a.phenotype.morphology.legLength = 1.22; b.phenotype.morphology.headScale = .82;
  const first = runtime.createInstance('raccoon', 0, 1, a)!;
  const second = runtime.createInstance('raccoon', 0, 1, b)!;
  const firstMesh = skinned(first), secondMesh = skinned(second), template = skinned(source.scene);
  assert.notEqual(firstMesh.geometry, secondMesh.geometry);
  assert.notEqual(firstMesh.geometry, template.geometry);
  assert.equal(firstMesh.material, template.material);
  assert.notDeepEqual(Array.from(firstMesh.geometry.getAttribute('color').array), Array.from(secondMesh.geometry.getAttribute('color').array));
  for (const mesh of [firstMesh, secondMesh]) {
    const uv = mesh.geometry.getAttribute('uv'), color = mesh.geometry.getAttribute('color');
    const rgb = new Map([[.6501554250717163,0x674d3b],[.7190573215484619,0x3c2815],[.7811921238899231,0x45433b],[.8445572853088379,0x343434]]);
    const lightness = new Map<number, number>();
    for (let i = 0; i < uv.count; i++) {
      const u = [...rgb.keys()].find(u => Math.abs(u-uv.getX(i)) < 1e-6)!;
      const sourceColor = new THREE.Color(rgb.get(u)!);
      const actual = sourceColor.multiply(new THREE.Color().setRGB(color.getX(i),color.getY(i),color.getZ(i)));
      lightness.set(u, actual.getHSL({h:0,s:0,l:0}).l);
      assert.ok(actual.toArray().every(v => Number.isFinite(v) && v >= 0 && v <= 1));
      assert.equal(color.getW(i), 1);
    }
    const ordered = [...rgb].sort((a,b) => new THREE.Color(a[1]).getHSL({h:0,s:0,l:0}).l-new THREE.Color(b[1]).getHSL({h:0,s:0,l:0}).l);
    for (let i = 1; i < ordered.length; i++) assert.ok(lightness.get(ordered[i][0])! > lightness.get(ordered[i-1][0])!);
  }
  let ownedDisposed=0, siblingDisposed=0, templateDisposed=0, materialDisposed=0;
  firstMesh.geometry.addEventListener('dispose',()=>ownedDisposed++);
  secondMesh.geometry.addEventListener('dispose',()=>siblingDisposed++);
  template.geometry.addEventListener('dispose',()=>templateDisposed++);
  (template.material as THREE.Material).addEventListener('dispose',()=>materialDisposed++);
  const siblingBefore = Array.from(secondMesh.geometry.getAttribute('color').array);
  runtime.dispose(first); runtime.dispose(first);
  assert.equal(ownedDisposed,1); assert.equal(siblingDisposed,0); assert.equal(templateDisposed,0); assert.equal(materialDisposed,0);
  assert.deepEqual(Array.from(secondMesh.geometry.getAttribute('color').array),siblingBefore);
  runtime.play(second,'walk'); runtime.update(second,.3);
  assert.ok(points(second).every(p=>p.toArray().every(Number.isFinite)));
  const recreated=runtime.createInstance('raccoon',0,1,a)!;
  assert.deepEqual(Array.from(skinned(recreated).geometry.getAttribute('color').array), Array.from(firstMesh.geometry.getAttribute('color').array));
  runtime.dispose(recreated);runtime.dispose(second);
  assert.equal(fingerprint(source),before);
  assert.equal(createHash('sha256').update(readFileSync('public/assets/quaternius/wildlife/Raccoon.glb')).digest('hex'), '4844072432a3e474ef32426d3d74be895fe9e203d643d26670e5a23da6d7fc5a');
});

test('accentShift alone changes authored head accents and features while preserving body fur and neutral eyes', async () => {
  const source=await asset();
  const runtime=new WildlifeVisualRuntime({load:async()=>source});
  await runtime.load('raccoon');
  for(const accentShift of [-.025,.025]){
    const appearance=neutralRaccoonAppearance();appearance.genome.material.accentShift=accentShift;
    const root=runtime.createInstance('raccoon',0,1,appearance)!;
    const mesh=skinned(root),uv=mesh.geometry.getAttribute('uv'),colors=mesh.geometry.getAttribute('color');
    const counts={body:0,accent:0,feature:0,eyes:0};
    for(let i=0;i<uv.count;i++){
      const region=mesh.skeleton.bones[mesh.geometry.getAttribute('skinIndex').getX(i)].name;
      const color=[colors.getX(i),colors.getY(i),colors.getZ(i)];
      if(Math.abs(uv.getX(i)-.6501554250717163)<1e-6){
        if(region==='Head'){assert.notDeepEqual(color,[1,1,1]);counts.accent++;}
        else{assert.deepEqual(color,[1,1,1]);counts.body++;}
      }else if(Math.abs(uv.getX(i)-.7190573215484619)<1e-6){
        assert.notDeepEqual(color,[1,1,1]);counts.feature++;
      }else if(Math.abs(uv.getX(i)-.7811921238899231)<1e-6){
        assert.notDeepEqual(color,[1,1,1]);counts.accent++;
      }else{
        assert.deepEqual(color,[1,1,1]);counts.eyes++;
      }
    }
    assert.deepEqual(counts,{body:645,accent:448,feature:987,eyes:160});
    runtime.dispose(root);
  }
});

test('presentation normalizes actual owner appearance and fallback without mutating authoritative state', async () => {
  const source = await asset();
  const runtime = new WildlifeVisualRuntime({ load: async () => source });
  const presentation = new WildlifePresentation(runtime);
  const owners = ['founder-a','founder-b'].map(id=>({state:{id,species:'raccoon' as const,traits:{size:.58,speed:1,fertility:1,wariness:1}},mesh:new THREE.Group()}));
  const before = structuredClone(owners.map(owner=>owner.state));
  for (const owner of owners) presentation.register(owner);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(owners.map(owner=>owner.state),before);
  assert.notDeepEqual(Array.from(skinned(owners[0].mesh).geometry.getAttribute('position').array),Array.from(skinned(owners[1].mesh).geometry.getAttribute('position').array));
  assert.notDeepEqual(Array.from(skinned(owners[0].mesh).geometry.getAttribute('color').array),Array.from(skinned(owners[1].mesh).geometry.getAttribute('color').array));
  owners.forEach(owner=>presentation.remove(owner));
});

test('adaptation failure is observable and releases owned resources without poisoning the loaded template', async () => {
  const source=await asset();
  const template=skinned(source.scene);
  template.geometry=template.geometry.clone();
  template.geometry.getAttribute('uv').setXY(0,0,0); // Deliberately unsupported fixture swatch.
  const runtime=new WildlifeVisualRuntime({load:async()=>source});
  const presentation=new WildlifePresentation(runtime);
  const owner={state:{id:'bad-atlas',species:'raccoon' as const,traits:{size:.58,speed:1,fertility:1,wariness:1}},mesh:new THREE.Group()};
  const disposeGeometry=THREE.BufferGeometry.prototype.dispose;
  const disposeSkeleton=THREE.Skeleton.prototype.dispose;
  let geometries=0,skeletons=0,templateDisposed=0;
  template.geometry.addEventListener('dispose',()=>templateDisposed++);
  THREE.BufferGeometry.prototype.dispose=function(){geometries++;disposeGeometry.call(this);};
  THREE.Skeleton.prototype.dispose=function(){skeletons++;disposeSkeleton.call(this);};
  try {
    presentation.register(owner);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(presentation.getDiagnostics()[0].status,'failed');
    assert.match(presentation.getDiagnostics()[0].reason!,/source atlas swatch/);
    assert.equal(owner.mesh.children.length,0);
    assert.equal(runtime.getState('raccoon')?.status,'ready');
    assert.equal(geometries,1);assert.equal(skeletons,1);assert.equal(templateDisposed,0);
    const independent=runtime.createInstance('raccoon',0,1,neutralRaccoonAppearance())!;
    assert.ok(runtime.play(independent,'walk'));
    runtime.update(independent,.2);
    assert.ok(points(independent).every(p=>p.toArray().every(Number.isFinite)));
    runtime.dispose(independent);
  } finally {
    THREE.BufferGeometry.prototype.dispose=disposeGeometry;
    THREE.Skeleton.prototype.dispose=disposeSkeleton;
    presentation.remove(owner);
  }
});
