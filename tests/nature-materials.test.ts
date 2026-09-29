import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { normalizeNatureMaterials, prepareNatureMaterials, NATURE_SOURCE_HASHES } from '../scripts/lib/nature-materials.mjs';
import { sourceGltf } from './helpers/source-gltf.js';

const root=new URL('../public/assets/kenney/nature/',import.meta.url);
function glb(bytes:Buffer){
  const length=bytes.readUInt32LE(12);
  return {json:JSON.parse(bytes.subarray(20,20+length).toString('utf8')),bin:bytes.subarray(20+length)};
}
for(const name of Object.keys(NATURE_SOURCE_HASHES)){
  test(`${name} fixes only the four reviewed metallic factors and preserves all source data`,async()=>{
    const bytes=fs.readFileSync(new URL(`${name}.source.glb`,root));
    const source=glb(bytes);
    const output=normalizeNatureMaterials(bytes,name);
    assert.equal(output.readUInt32LE(8),output.length);
    const normalized=glb(output);
    assert.deepEqual(normalized.bin,source.bin,'unchanged vertices, normals, indices and UV buffer');
    assert.equal(normalized.json.materials.length,2);
    for(const material of normalized.json.materials){
      assert.equal(material.pbrMetallicRoughness.metallicFactor,0);
      material.pbrMetallicRoughness.metallicFactor=1;
    }
    assert.deepEqual(normalized.json,source.json,'the only permitted edits are material metallic factors');
    assert.throws(()=>normalizeNatureMaterials(Buffer.concat([bytes,Buffer.from([0])]),name),/Unrecognized nature source/);
    // Inspect actual GLTFLoader materials, not merely a JSON counter.
    const loaded=await sourceGltf(`kenney/nature/${name}.glb`);
    let count=0;
    loaded.scene.traverse(child=>{
      const mesh=child as THREE.Mesh;
      if(!mesh.isMesh)return;
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        assert.equal((material as THREE.MeshStandardMaterial).metalness,0);count++;
      }
    });
    assert.equal(count,2);
  });
}

test('nature material preparation is idempotent and preserves output when the source is invalid',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-nature-'));
  const target=pathToFileURL(`${dir}${path.sep}`);
  try {
    for(const name of Object.keys(NATURE_SOURCE_HASHES))fs.copyFileSync(new URL(`${name}.source.glb`,root),new URL(`${name}.source.glb`,target));
    assert.equal(prepareNatureMaterials(target),2);assert.equal(prepareNatureMaterials(target),0);
    const before=fs.readFileSync(new URL('crops_dirtDoubleRow.glb',target));
    fs.appendFileSync(new URL('crops_dirtDoubleRow.source.glb',target),'corrupt');
    assert.throws(()=>prepareNatureMaterials(target),/Unrecognized/);
    assert.deepEqual(fs.readFileSync(new URL('crops_dirtDoubleRow.glb',target)),before);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
