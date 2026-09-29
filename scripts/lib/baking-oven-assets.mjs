import fs from 'node:fs';
import { createHash } from 'node:crypto';

export const BAKING_OVEN_ARCHIVE_SHA256 = 'ea72cf242b76d25e70aff9e3b5277d7f232bf2feac9e137b69595e430f3b87db';
export const BAKING_OVEN_SOURCE_HASHES = Object.freeze({
  'CastIronStove.source.gltf':'84b2ade29c28dc2c48c3e53860bcfb49534958223c7de1666894c97e95ec24c8',
  'CastIronStove.bin':'de112c860dab68c5ff985a00055cc2b267de531ae38357c710ed2e1ded01652e',
  'CastIronStoveTex.png':'7c00423d5e6a3e74ed568e099b272b7a90bd4d2fcf8a9060c34363d5dcca010a',
  'FriedEggTexture.png':'c467effdc947981a9cb5677eb87ff30243bc4330ae768c9a928ac407bf835c3f'
});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Select the author's complete closed-door oven, not the overlapping second variant
 * or the cookware. Source nodes, vertex/index buffers, materials and transforms stay intact.
 */
export function normalizeBakingOven(sourceBytes) {
  if(sha256(sourceBytes)!==BAKING_OVEN_SOURCE_HASHES['CastIronStove.source.gltf']){
    throw new Error('Baking oven source descriptor hash mismatch');
  }
  const source=JSON.parse(sourceBytes.toString('utf8'));
  if(source.scene!==0||source.nodes[0]?.name!=='CastIronStove'||source.nodes[0]?.mesh!==0){
    throw new Error('Baking oven source scene identity changed');
  }
  source.scenes[0].nodes=[0];
  return Buffer.from(`${JSON.stringify(source,null,2)}\n`);
}

export function prepareBakingOven(root) {
  for(const [name,expected] of Object.entries(BAKING_OVEN_SOURCE_HASHES)){
    if(sha256(fs.readFileSync(new URL(name,root)))!==expected)throw new Error(`Baking oven source hash mismatch: ${name}`);
  }
  const bytes=normalizeBakingOven(fs.readFileSync(new URL('CastIronStove.source.gltf',root)));
  const target=new URL('CastIronStove.gltf',root);
  if(fs.existsSync(target)&&fs.readFileSync(target).equals(bytes))return false;
  const temporary=new URL(`CastIronStove.gltf.tmp-${process.pid}`,root);
  try {fs.writeFileSync(temporary,bytes);fs.renameSync(temporary,target);}
  finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  return true;
}
