export const NATURE_SOURCE_HASHES: Readonly<Record<string,string>>;
export const NATURE_SOURCE_MATERIAL_COUNTS: Readonly<Record<string,number>>;
export function normalizeNatureMaterials(source:Buffer,name:string):Buffer;
export function prepareNatureMaterials(root:URL):number;
