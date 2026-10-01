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
      const clips = [
        'Idle', 'Walk', 'Run', 'Idle_Eating', 'Death'
      ].map(name => new THREE.AnimationClip(name, 1, []));
      return { scene, animations: clips };
    }
  };
}

test('controlled loader is deduplicated and grounding uses post-scale bounds', async () => {
  const counter = { calls: 0 };
  const runtime = new WildlifeVisualRuntime(fixtureLoader(counter));
  await Promise.all([runtime.load('raccoon'), runtime.load('raccoon')]);
  assert.equal(counter.calls, 1);
  const a = runtime.createInstance('raccoon', 10, .5)!;
  const b = runtime.createInstance('raccoon', 20, 2)!;
  assert.ok(a);
  assert.ok(b);
  const boxA = new THREE.Box3().setFromObject(a);
  const boxB = new THREE.Box3().setFromObject(b);
  assert.equal(boxA.min.y, 10);
  assert.equal(boxB.min.y, 20);
});

test('failed loader keeps observable failure and no instance', async () => {
  const runtime = new WildlifeVisualRuntime(fixtureLoader({ calls: 0 }, true));
  await runtime.load('raccoon');
  assert.equal(runtime.getState('raccoon')?.status, 'failed');
  assert.match(runtime.getState('raccoon')?.reason ?? '', /fixture load failed/);
  assert.equal(runtime.createInstance('raccoon', 0), undefined);
});

test('two instances are isolated and repeated action is idempotent', async () => {
  const runtime = new WildlifeVisualRuntime(fixtureLoader({ calls: 0 }));
  await runtime.load('raccoon');
  const first = runtime.createInstance('raccoon', 0)!;
  const second = runtime.createInstance('raccoon', 0)!;
  assert.ok(runtime.play(first, 'idle'));
  assert.ok(runtime.play(first, 'idle'));
  assert.ok(runtime.play(first, 'death'));
  runtime.dispose(first);
  assert.equal(runtime.play(first, 'idle'), false);
  assert.ok(runtime.play(second, 'walk'));
  runtime.dispose(second);
});
