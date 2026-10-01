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

      const track = new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 4]);
      const clips = ['Idle', 'Walk', 'Run', 'Idle_Eating', 'Death'].map(name =>
        new THREE.AnimationClip(name, 1, [track]),
      );
      return { scene, animations: clips };
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

test('real mixer animation progresses, repeated play is stable, death clamps, and instances isolate', async () => {
  const runtime = new WildlifeVisualRuntime(fixtureLoader({ calls: 0 }));
  await runtime.load('raccoon');

  const first = runtime.createInstance('raccoon', 0)!;
  const second = runtime.createInstance('raccoon', 0)!;
  assert.ok(runtime.play(first, 'walk'));

  const firstStart = first.position.x;
  runtime.update(first, 0.25);
  const firstProgress = first.position.x;
  assert.notEqual(firstProgress, firstStart);

  runtime.update(first, 0.25);
  const beforeRepeat = first.position.x;
  assert.ok(runtime.play(first, 'walk'));
  runtime.update(first, 0.25);
  assert.notEqual(first.position.x, beforeRepeat);

  assert.ok(runtime.play(first, 'death'));
  runtime.update(first, 2);
  const deathFrame = first.position.x;
  runtime.update(first, 1);
  assert.equal(first.position.x, deathFrame);

  const secondBefore = second.position.x;
  runtime.dispose(first);
  assert.ok(runtime.play(second, 'walk'));
  runtime.update(second, 0.25);
  assert.notEqual(second.position.x, secondBefore);

  runtime.dispose(second);
  const recreated = runtime.createInstance('raccoon', 0)!;
  assert.ok(runtime.play(recreated, 'walk'));
  runtime.update(recreated, 0.25);
  assert.notEqual(recreated.position.x, 0);
  runtime.dispose(recreated);
});
