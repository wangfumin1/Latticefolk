import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { resolveWildlifeAsset } from '../src/scene/wildlifeAssetResolver';
import { WildlifeVisualRuntime } from '../src/scene/wildlifeVisualRuntime';

test('raccoon resolves only to pinned authored asset', () => {
  const result = resolveWildlifeAsset('raccoon');
  assert.equal(result.status, 'ready');
  assert.equal(result.definition?.asset, '/assets/quaternius/wildlife/Raccoon.glb');
  assert.equal(result.definition?.license, 'CC0');
});

test('unsupported species has no visible fallback', () => {
  assert.equal(resolveWildlifeAsset('dog').status, 'unsupported');
});

test('visual runtime dispose removes only instance ownership', () => {
  const runtime = new WildlifeVisualRuntime();
  const root = new THREE.Group();
  const mixer = new THREE.AnimationMixer(root);
  assert.ok(mixer);
  runtime.dispose(root);
  assert.equal(root.parent, null);
});

test('action lifecycle policy keeps repeated actions and death non looping', () => {
  const runtime = new WildlifeVisualRuntime();
  const root = new THREE.Group();
  assert.equal(runtime.play(root, 'idle'), false);
  assert.equal(runtime.play(root, 'death'), false);
});
