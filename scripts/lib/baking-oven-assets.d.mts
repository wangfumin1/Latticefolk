import type { Buffer } from 'node:buffer';
export const BAKING_OVEN_ARCHIVE_SHA256:string;
export const BAKING_OVEN_SOURCE_HASHES:Readonly<Record<string,string>>;
export function sha256(bytes:Buffer):string;
export function normalizeBakingOven(source:Buffer):Buffer;
export function prepareBakingOven(root:URL):boolean;
