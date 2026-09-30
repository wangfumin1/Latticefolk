import type { WorldObjectState } from '../types.js';

export const WATER_PATCH_ASSET = 'waterPatchAsset';
export const WATER_PATCH_SOURCE = 'kenney/nature/ground_riverOpen.glb';
export const WATER_PATCH_ORIGINAL_SOURCE = 'kenney/nature/ground_riverOpen.source.glb';
export const WATER_PATCH_UPSTREAM_BLOB = 'd5535f96668b8f14174ced652b978646da3c8d0a';
export const WATER_PATCH_WIDTH = 3.4;
export const WATER_PATCH_DEPTH = 3.4;
export const WATER_PATCH_SURFACE_Y = .018;

/**
 * Presentation-only contract for deterministic semantic water patches.
 * Geometry/materials come from the unchanged pinned Kenney Nature Kit source.
 */
export function waterPatchVisualSpec(state: WorldObjectState) {
  if (state.kind !== 'water_patch') return undefined;
  return {
    asset: WATER_PATCH_ASSET,
    source: WATER_PATCH_SOURCE,
    height: .05,
    width: WATER_PATCH_WIDTH,
    depth: WATER_PATCH_DEPTH,
    surfaceY: WATER_PATCH_SURFACE_Y
  };
}
