import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WildlifeVisualRuntime } from '../src/scene/wildlifeVisualRuntime';
import { resolveWildlifeAsset } from '../src/scene/wildlifeAssetResolver';

const fullClip = (name: string) => `AnimalArmature|AnimalArmature|AnimalArmature|${name}`;

function fixtureLoader(counter: { calls: number }, clips = Object.values({ idle: fullClip('Idle'), walk: fullClip('Walk'), run: fullClip('Run'), eat: fullClip('Idle_Eating'), death: fullClip('Death') })) {
  return {
    load: async () => {
      counter.calls++;
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()));
      return {
        scene,
        animations: clips.map(name => new THREE.AnimationClip(name, 1, [
          new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 4]),
        ])),
      };
    },
  };
}

test('raccoon resolver uses authored glb clip names', () => {
  const result = resolveWildlifeAsset('raccoon');
  assert.equal(result.definition?.clips.walk, fullClip('Walk'));
  assert.equal(result.definition?.clips.death, fullClip('Death'));
});

test('missing or duplicate authored clips fail before ready', async () => {
  const missing = new WildlifeVisualRuntime(fixtureLoader({ calls: 0 }, [fullClip('Idle')])));
  await missing.load('raccoon');
  assert.equal(missing.getState('raccoon')?.status, 'failed');
  assert.equal(missing.createInstance('raccoon', 0), undefined);

  const duplicate = new WildlifeVisualRuntime(fixtureLoader({ calls: 0 }, [fullClip('Idle'), fullClip('Idle'), fullClip('Walk'), fullClip('Run'), fullClip('Idle_Eating'), fullClip('Death')])));
  await duplicate.load('raccoon');
  assert.equal(duplicate.getState('raccoon')?.status, 'failed');
});

function makeRuntime() {
  return new WildlifeVisualRuntime(fixtureLoader({ calls: 0 }));
}

test('controlled loader and grounding remain valid with authored clips', async () => {
  const runtime = makeRuntime();
  await Promise.all([runtime.load('raccoon'), runtime.load('raccoon')]);
  const a = runtime.createInstance('raccoon', 10, 0.5)!;
  assert.equal(new THREE.Box3().setFromObject(a).min.y, 10);
});

test('failed loader keeps observable failure and no instance', async () => {
  const runtime = new WildlifeVisualRuntime({ load: async () => { throw new Error('fixture load failed'); } });
  await runtime.load('raccoon');
  assert.equal(runtime.getState('raccoon')?.status, 'failed');
  assert.equal(runtime.createInstance('raccoon', 0), undefined);
});

test('real mixer animation has exact progress, death clamp, and instance isolation', async () => {
  const runtime = makeRuntime();
  await runtime.load('raccoon');
  const parent = new THREE.Group();
  const first = runtime.createInstance('raccoon', 0)!;
  const second = runtime.createInstance('raccoon', 0)!;
  parent.add(first);
  assert.ok(runtime.play(first, 'walk'));
  runtime.update(first, 0.25);
  assert.ok(Math.abs(first.position.x - 1) < 0.001);
  runtime.update(first, 0.25);
  assert.ok(Math.abs(first.position.x - 2) < 0.001);
  assert.ok(runtime.play(first, 'walk'));
  runtime.update(first, 0.25);
  assert.ok(Math.abs(first.position.x - 3) < 0.001);
  assert.ok(runtime.play(first, 'death'));
  runtime.update(first, 1.25);
  assert.ok(Math.abs(first.position.x - 4) < 0.001);
  runtime.update(first, 0.37);
  assert.ok(Math.abs(first.position.x - 4) < 0.001);
  runtime.play(second, 'walk');
  runtime.update(second, 0.25);
  assert.ok(Math.abs(second.position.x - 1) < 0.001);
  runtime.dispose(first);
  runtime.update(second, 0.25);
  assert.ok(Math.abs(second.position.x - 2) < 0.001);
  assert.equal(runtime.play(first, 'walk'), false);
});
