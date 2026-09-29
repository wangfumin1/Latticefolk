import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

// Immutable upstream Git blob identities recorded during asset selection. A material-only
// adaptation must never silently replace source geometry with generated placeholder meshes.
const sourceBuffers = {
  Bench:'9400218eed6b0e01f789a982707a258a80164cd3',
  Bed_Twin1:'e41e2cc45b3148c155f579cdc42c9b6a6ccc1240',
  Stall_Empty:'6397d1c59c965507b5a15db61cde3daa45a069a8',
  Workbench:'78efeb92b5a67d6c2fd386ea26e02ca7b56b9697',
  WeaponStand:'4a643819db5bd7baff25bf07f9eb72c2b95bcb19'
};
interface Asset {
  asset:{version:string};
  buffers:Array<{byteLength:number;uri?:string}>;
  bufferViews?:Array<{buffer:number;byteOffset?:number;byteLength:number}>;
  accessors:Array<{count:number;min?:number[];max?:number[]}>;
  meshes:Array<{primitives:Array<{attributes:{POSITION:number}}>}>;
  images?:Array<{uri?:string;bufferView?:number}>;
}
function checkViews(asset:Asset,length:number) {
  for(const view of asset.bufferViews??[]){
    assert.equal(view.buffer,0);
    assert.ok((view.byteOffset??0)>=0);
    assert.ok((view.byteOffset??0)+view.byteLength<=length,'buffer view exceeds source bytes');
  }
  for(const mesh of asset.meshes)for(const primitive of mesh.primitives){
    const accessor=asset.accessors[primitive.attributes.POSITION];
    assert.ok(accessor&&accessor.count>0,'rendered primitive requires real vertex data');
    assert.ok(accessor.min?.every(Number.isFinite)&&accessor.max?.every(Number.isFinite));
  }
}
for(const [name,expected] of Object.entries(sourceBuffers)){
  test(`licensed ${name} retains upstream geometry and complete local glTF dependencies`,()=>{
    const base=new URL('../public/assets/quaternius/fantasy-props-standard/',import.meta.url);
    const asset=JSON.parse(fs.readFileSync(new URL(`${name}.gltf`,base),'utf8')) as Asset;
    const bytes=fs.readFileSync(new URL(`${name}.bin`,base));
    assert.equal(asset.asset.version,'2.0');
    assert.equal(asset.buffers.length,1);
    assert.equal(asset.buffers[0]!.uri,`${name}.bin`);
    assert.equal(asset.buffers[0]!.byteLength,bytes.length);
    const digest=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(digest,expected,'geometry must remain the licensed source, not a substitute');
    assert.equal(asset.images?.length??0,0,'flat-material adaptation must not leave missing atlas dependencies');
    assert.ok(asset.meshes.length>0);
    checkViews(asset,bytes.length);
  });
}
for(const name of ['crops_dirtDoubleRow','crops_wheatStageB']){
  test(`licensed ${name} GLB is complete and contains no runtime remote dependency`,()=>{
    const bytes=fs.readFileSync(new URL(`../public/assets/kenney/nature/${name}.glb`,import.meta.url));
    assert.equal(bytes.readUInt32LE(0),0x46546c67);
    assert.equal(bytes.readUInt32LE(4),2);
    assert.equal(bytes.readUInt32LE(8),bytes.length);
    assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
    const jsonLength=bytes.readUInt32LE(12);
    const asset=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8')) as Asset;
    const binaryOffset=20+jsonLength;
    assert.equal(bytes.readUInt32LE(binaryOffset+4),0x004e4942);
    const binaryLength=bytes.readUInt32LE(binaryOffset);
    assert.equal(binaryOffset+8+binaryLength,bytes.length);
    assert.equal(asset.buffers.length,1);
    assert.equal(asset.buffers[0]!.uri,undefined);
    assert.ok(asset.buffers[0]!.byteLength<=binaryLength);
    assert.ok(binaryLength-asset.buffers[0]!.byteLength<4);
    for(const image of asset.images??[])assert.ok(image.bufferView!==undefined&&!image.uri);
    checkViews(asset,binaryLength);
  });
}
