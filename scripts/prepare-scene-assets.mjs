import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeLegacyWell, WELL_MATERIAL_COUNT } from './lib/well-materials.mjs';

const source = new URL('../public/assets/quaternius/medieval-village/Well.source.fbx', import.meta.url);
const target = new URL('../public/assets/quaternius/medieval-village/Well.fbx', import.meta.url);
const temporary = new URL(`../public/assets/quaternius/medieval-village/Well.fbx.tmp-${process.pid}`, import.meta.url);
try {
  const bytes = normalizeLegacyWell(fs.readFileSync(source));
  const unchanged = fs.existsSync(target) && fs.readFileSync(target).equals(bytes);
  if (!unchanged) {
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, target);
  }
  console.log(`[assets] Well.fbx ${unchanged ? 'verified' : 'prepared'}: ${bytes.length} bytes, ${WELL_MATERIAL_COUNT} opaque source materials`);
} catch (error) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  console.error(`[assets] ${fileURLToPath(source)}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

// Keep the existing hash-pinned Well.source.fbx normalization above unchanged.
try {
  const { prepareBakingOven } = await import('./lib/baking-oven-assets.mjs');
  const root = new URL('../public/assets/firefly-in-the-dusk/cast-iron-stove/', import.meta.url);
  const prepared = prepareBakingOven(root);
  console.log(`[assets] CastIronStove.gltf ${prepared ? 'prepared' : 'verified'}: original closed-door oven, no duplicate variant or cookware`);
} catch (error) {
  console.error(`[assets] baking oven: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
