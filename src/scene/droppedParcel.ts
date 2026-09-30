import type { WorldObjectState } from '../types.js';

// Existing licensed Quaternius container, not a model of the enclosed food/material.
// Payload identity and quantity remain on the semantic dropped_item entity.
export const DROPPED_PARCEL_ASSET = 'crate_rts';
export const DROPPED_PARCEL_SOURCE = 'quaternius/ultimate-fantasy-rts/Crate.gltf';
export const DROPPED_PARCEL_HEIGHT = .4;

export function droppedParcelSpec(state: WorldObjectState) {
  if (state.kind !== 'dropped_item') return undefined;
  return { asset: DROPPED_PARCEL_ASSET, height: DROPPED_PARCEL_HEIGHT };
}
