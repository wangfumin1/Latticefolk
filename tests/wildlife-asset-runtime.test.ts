import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolveWildlifeAsset } from '../src/scene/wildlifeAssetResolver';
import { WildlifeVisualRuntime } from '../src/scene/wildlifeVisualRuntime';

const fullClip = (name: string) => `AnimalArmature|AnimalArmature|AnimalArmature|${name}`;

function fixtureLoader(counter: { calls: number }, clips = Object.values({
  idle: fullClip('Idle'),
  walk: fullClip('Walk'),
  run: fullClip('Run'),
  eat: fullClip('Idle_Eating'),
  death: fullClip('Death'),
})) {
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

function parseGlbAnimationNames(buffer: Buffer): string[] {
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
  const jsonLength = buffer.readUInt32LE(12);
  const jsonStart = 20;
  const json = JSON.parse(buffer.toString('utf8', jsonStart, jsonStart + jsonLength));
  return (json.animations ?? []).map((animation: { name?: string }) => animation.name);
}

test('raccoon resolver uses authored glb clip names', () => {
  const result = resolveWildlifeAsset('raccoon');
  assert.equal(result.definition?.clips.walk, fullClip('Walk'));
  assert.equal(result.definition?.clips.death, fullClip('Death'));
});

test('checked-in raccoon glb metadata matches resolver contract', () => {
  const bytes = readFileSync('public/assets/quaternius/wildlife/Raccoon.glb');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '4844072432a3e474ef32426d3d74be895fe9e203d643d26670e5a23da6d7fc5a');
  const names = parseGlbAnimationNames(bytes);
  for (const clip of Object.values(resolveWildlifeAsset('raccoon').definition!.clips)) {
    assert.equal(names.filter(name => name === clip).length, 1);
  }
});

test('missing or duplicate authored clips fail before ready', async () => {
  const missing = new WildlifeVisualRuntime(fixtureLoader({ calls: 0 }, [fullClip('Idle')]));
  await missing.load('raccoon');
  assert.equal(missing.getState('raccoon')?.status, 'failed');
  assert.match(missing.getState('raccoon')?.reason ?? '', /missing|invalid|clip/i);
  assert.equal(missing.createInstance('raccoon', 0), undefined);

  const duplicate = new WildlifeVisualRuntime(fixtureLoader({ calls: 0 }, [fullClip('Idle'), fullClip('Idle'), fullClip('Walk'), fullClip('Run'), fullClip('Idle_Eating'), fullClip('Death')])));
  await duplicate.load('raccoon');
  assert.equal(duplicate.getState('raccoon')?.status, 'failed');
  assert.match(duplicate.getState('raccoon')?.reason ?? '', /duplicate|invalid|clip/i);
});

test('controlled loader, deduplication, and grounding remain valid with authored clips', async () => {
  const counter = { calls: 0 };
  const runtime = new WildlifeVisualRuntime(fixtureLoader(counter));
  await Promise.all([runtime.load('raccoon'), runtime.load('raccoon')]);
  assert.equal(counter.calls, 1);
  assert.equal(new THREE.Box3().setFromObject(runtime.createInstance('raccoon', 10, 0.5)!).min.y, 10);
  assert.equal(new THREE.Box3().setFromObject(runtime.createInstance('raccoon', 20, 2)!).min.y, 20);
});

test('failed loader keeps observable failure and no instance', async () => {
  const runtime = new WildlifeVisualRuntime({ load: async () => { throw new Error('fixture load failed'); } });
  await runtime.load('raccoon');
  assert.equal(runtime.getState('raccoon')?.status, 'failed');
  assert.match(runtime.getState('raccoon')?.reason ?? '', /fixture load failed/);
  assert.equal(runtime.createInstance('raccoon', 0), undefined);
});

test('real mixer animation has exact progress, death clamp, and instance isolation', async () => {
  const runtime = new WildlifeVisualRuntime(fixtureLoader({ calls: 0 }));
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
  assert.equal(first.parent, null);
  assert.equal(runtime.play(first, 'walk'), false);
  runtime.update(second, 0.25);
  assert.ok(Math.abs(second.position.x - 2) < 0.001);
  const recreated = runtime.createInstance('raccoon', 0)!;
  assert.ok(runtime.play(recreated, 'walk'));
  runtime.update(recreated, 0.25);
  assert.ok(recreated.position.x > 0);
});
