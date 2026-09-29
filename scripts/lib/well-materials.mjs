import { createHash } from 'node:crypto';

export const WELL_SOURCE_SHA256 = '4a634278d8db32dc46c180de54b29132c0d9ac17d6ab12bf55ccf56120966595';
export const WELL_RUNTIME_SHA256 = 'e8af9aefa25f001c24756826343ae960ade4feab3b774cccdf700ec82a1c2b0f';
export const WELL_MATERIAL_COUNT = 5;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fbxString = value => {
  const text = Buffer.from(value, 'utf8');
  const header = Buffer.alloc(5);
  header[0] = 0x53;
  header.writeUInt32LE(text.length, 1);
  return Buffer.concat([header, text]);
};

// Compatibility adaptation for one hash-pinned, licensed FBX export, not a generic
// material policy. Never make arbitrary transparent assets opaque.
export function normalizeLegacyWell(source) {
  if (!Buffer.isBuffer(source) || sha256(source) !== WELL_SOURCE_SHA256) {
    throw new Error('Unrecognized well source; review asset provenance before regenerating it.');
  }
  const propertyHeader = Buffer.concat(['TransparentColor', 'Color', '', 'A'].map(fbxString));
  const one = Buffer.alloc(9);
  one[0] = 0x44;
  one.writeDoubleLE(1, 1);
  const property = Buffer.concat([propertyHeader, one, one, one]);
  const result = Buffer.from(source);
  let count = 0;
  let cursor = 0;
  for (;;) {
    const position = source.indexOf(property, cursor);
    if (position < 0) break;
    for (let channel = 0; channel < 3; channel++) {
      result.writeDoubleLE(0, position + propertyHeader.length + channel * 9 + 1);
    }
    count++;
    cursor = position + property.length;
  }
  if (count !== WELL_MATERIAL_COUNT || sha256(result) !== WELL_RUNTIME_SHA256) {
    throw new Error('Well material adaptation did not match the reviewed output.');
  }
  return result;
}
