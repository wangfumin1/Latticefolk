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

/** Name the container explicitly; the existing item translation names its contents. */
export function droppedParcelLabel(locale: string, item: string, count: number): string {
  const language = locale.toLowerCase().split('-')[0];
  const labels: Record<string, string> = { en: 'Parcel', zh: '包裹', ja: '小包', es: 'Paquete' };
  return `${labels[language] ?? labels.en} · ${item} ×${count}`;
}
