import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Box3, Mesh, type Material } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { normalizeLegacyWell, WELL_SOURCE_SHA256, WELL_RUNTIME_SHA256, WELL_MATERIAL_COUNT } from '../scripts/lib/well-materials.mjs';

const sourceFile = new URL('../public/assets/quaternius/medieval-village/Well.source.fbx', import.meta.url);
const digest = (bytes:Buffer) => createHash('sha256').update(bytes).digest('hex');
const parse = (bytes:Buffer) => new FBXLoader().parse(Uint8Array.from(bytes).buffer, '');
function materials(scene:ReturnType<typeof parse>) {
  const result = new Set<Material>();
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) result.add(material);
  });
  return [...result];
}

test('legacy well reproduces invisible materials and the adapted asset is fully opaque in the actual FBX loader', () => {
  const source = fs.readFileSync(sourceFile);
  assert.equal(digest(source), WELL_SOURCE_SHA256);
  const originalMaterials = materials(parse(source));
  assert.equal(originalMaterials.length, WELL_MATERIAL_COUNT);
  assert.ok(originalMaterials.every(material => material.opacity === 0 && material.transparent), 'record the real loader failure, not only bounds');
  const adaptedMaterials = materials(parse(normalizeLegacyWell(source)));
  assert.equal(adaptedMaterials.length, WELL_MATERIAL_COUNT);
  assert.ok(adaptedMaterials.every(material => material.opacity === 1 && !material.transparent && material.visible));
});

test('well adaptation preserves source bytes, geometry, transforms and bounds', () => {
  const source = fs.readFileSync(sourceFile);
  const originalCopy = Buffer.from(source);
  const adapted = normalizeLegacyWell(source);
  assert.deepEqual(source, originalCopy);
  assert.equal(digest(adapted), WELL_RUNTIME_SHA256);
  assert.equal(adapted.length, source.length);
  assert.equal(source.reduce((count, byte, index) => count + Number(byte !== adapted[index]), 0), 30);
  const before = parse(source), after = parse(adapted);
  before.updateMatrixWorld(true); after.updateMatrixWorld(true);
  assert.deepEqual(new Box3().setFromObject(after), new Box3().setFromObject(before));
  const meshes = (root:typeof before) => {
    const result:Mesh[] = []; root.traverse(object => { if(object instanceof Mesh)result.push(object); }); return result;
  };
  const originalMeshes = meshes(before), adaptedMeshes = meshes(after);
  assert.ok(originalMeshes.length > 0);
  assert.equal(adaptedMeshes.length, originalMeshes.length);
  originalMeshes.forEach((mesh,index) => {
    const next = adaptedMeshes[index]!;
    assert.deepEqual(next.matrixWorld.elements, mesh.matrixWorld.elements);
    assert.deepEqual(next.geometry.index?.array, mesh.geometry.index?.array);
    assert.deepEqual(Object.keys(next.geometry.attributes), Object.keys(mesh.geometry.attributes));
    for(const name of Object.keys(mesh.geometry.attributes)) {
      assert.deepEqual(next.geometry.getAttribute(name).array, mesh.geometry.getAttribute(name).array);
    }
  });
});

test('well adaptation rejects unknown or already-adapted assets instead of changing other materials', () => {
  const source = fs.readFileSync(sourceFile);
  const corrupt = Buffer.from(source); corrupt[100] = corrupt[100]! ^ 1;
  assert.throws(() => normalizeLegacyWell(corrupt), /Unrecognized well source/);
  assert.throws(() => normalizeLegacyWell(normalizeLegacyWell(source)), /Unrecognized well source/);
});

test('scene preparation is local, reproducible and does not rewrite a correct cached asset', () => {
  const script = fileURLToPath(new URL('../scripts/prepare-scene-assets.mjs', import.meta.url));
  const output = new URL('../public/assets/quaternius/medieval-village/Well.fbx', import.meta.url);
  execFileSync(process.execPath, [script], {timeout:10_000});
  assert.equal(digest(fs.readFileSync(output)), WELL_RUNTIME_SHA256);
  const modified = fs.statSync(output, {bigint:true}).mtimeNs;
  execFileSync(process.execPath, [script], {timeout:10_000});
  assert.equal(fs.statSync(output, {bigint:true}).mtimeNs, modified);
  assert.equal(digest(fs.readFileSync(sourceFile)), WELL_SOURCE_SHA256);
});
