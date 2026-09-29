import fs from 'node:fs';
import { createHash } from 'node:crypto';

export const NATURE_SOURCE_HASHES = {
  crops_dirtDoubleRow:'b5c330d81a4efe0944caf5f1d1dd0c0d50227c93f2a4a57ec2425d2c9b7a2d84',
  crops_wheatStageB:'589db4d6fe0bd7616c1f1c2f10a335704b2dad5d24638dc08a5b2e5334c68852'
};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

// These two reviewed exports mark soil/stalks/grain as fully metallic. Correct that
// PBR property only: no recolor, added geometry, atlas replacement or global override.
export function normalizeNatureMaterials(source,name) {
  if(!Buffer.isBuffer(source)||!NATURE_SOURCE_HASHES[name]||sha256(source)!==NATURE_SOURCE_HASHES[name]){
    throw new Error(`Unrecognized nature source: ${name}`);
  }
  if(source.readUInt32LE(0)!==0x46546c67||source.readUInt32LE(4)!==2||source.readUInt32LE(8)!==source.length||source.readUInt32LE(16)!==0x4e4f534a){
    throw new Error(`Invalid nature GLB: ${name}`);
  }
  const oldLength=source.readUInt32LE(12);
  const json=JSON.parse(source.subarray(20,20+oldLength).toString('utf8'));
  if(json.materials.length!==2||json.materials.some(material=>material.pbrMetallicRoughness?.metallicFactor!==1)){
    throw new Error(`Unexpected nature materials: ${name}`);
  }
  for(const material of json.materials)material.pbrMetallicRoughness.metallicFactor=0;
  const text=Buffer.from(JSON.stringify(json));
  const padded=Buffer.alloc(Math.ceil(text.length/4)*4,0x20);text.copy(padded);
  const header=Buffer.from(source.subarray(0,20));
  header.writeUInt32LE(20+padded.length+source.length-20-oldLength,8);
  header.writeUInt32LE(padded.length,12);
  // Retain the complete following BIN chunk byte-for-byte, including its header/padding.
  return Buffer.concat([header,padded,source.subarray(20+oldLength)]);
}

export function prepareNatureMaterials(root) {
  let prepared=0;
  for(const name of Object.keys(NATURE_SOURCE_HASHES)){
    const target=new URL(`${name}.glb`,root);
    const bytes=normalizeNatureMaterials(fs.readFileSync(new URL(`${name}.source.glb`,root)),name);
    if(fs.existsSync(target)&&fs.readFileSync(target).equals(bytes))continue;
    const temporary=new URL(`${name}.glb.tmp-${process.pid}`,root);
    try {fs.writeFileSync(temporary,bytes);fs.renameSync(temporary,target);prepared++;}
    finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }
  return prepared;
}
