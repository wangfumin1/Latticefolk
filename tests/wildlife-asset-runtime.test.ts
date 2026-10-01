import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WildlifeVisualRuntime } from '../src/scene/wildlifeVisualRuntime';

function fixtureLoader(counter: { calls: number }, fail = false) {
  return {
    load: async () => {
      counter.calls++;
      if (fail) throw new Error('fixture load failed');

      const scene = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
      mesh.position.y = 2;
      scene.add(mesh);

      const makeClip = (name: string) => new THREE.AnimationClip(name, 1, [
        new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 4]),
      ]);
      return {
        scene,
        animations: ['Idle', 'Walk', 'Run', 'Idle_Eating', 'Death'].map(makeClip),
      };
    },
  };
}

test('controlled loader is deduplicated and grounding uses post-scale bounds', async () => {
  const counter = { calls: 0 };
  const runtime = new WildlifeVisualRuntime(fixtureLoader(counter));
  await Promise.all([runtime.load('raccoon'), runtime.load('raccoon')]);
  assert.equal(counter.calls, 1);

  const a = runtime.createInstance('raccoon', 10, 0.5)!;
  const b = runtime.createInstance('raccoon', 20, 2)!;
  assert.equal(new THREE.Box3().setFromObject(a).min.y, 10);
  assert.equal(new THREE.Box3().setFromObject(b).min.y, 20);
});

test('failed loader keeps observable failure and no instance', async () => {
  const runtime = new WildlifeVisualRuntime(fixtureLoader({ calls: 0 }, true));
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
  const disposedX = first.position.x;
  runtime.update(first, 1);
  assert.equal(first.position.x, disposedX);

  runtime.update(second, 0.25);
  assert.ok(Math.abs(second.position.x - 2) < 0.001);

  const recreated = runtime.createInstance('raccoon', 0)!;
  assert.ok(runtime.play(recreated, 'walk'));
  runtime.update(recreated, 0.25);
  assert.ok(recreated.position.x > 0);
  runtime.dispose(second);
  runtime.dispose(recreated);
});
