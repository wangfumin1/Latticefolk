import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWildlifeAsset } from '../src/scene/wildlifeAssetResolver';

test('raccoon resolves only to pinned authored asset', () => {
  const result = resolveWildlifeAsset('raccoon');
  assert.equal(result.status, 'ready');
  assert.equal(result.definition?.asset, '/assets/quaternius/wildlife/Raccoon.glb');
  assert.equal(result.definition?.license, 'CC0');
  assert.equal(result.definition?.clips.eat, 'Idle_Eating');
});

test('unsupported species does not get a visible fallback asset', () => {
  const result = resolveWildlifeAsset('dog');
  assert.equal(result.status, 'unsupported');
  assert.equal(result.definition, undefined);
});
