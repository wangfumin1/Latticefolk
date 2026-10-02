export type WildlifeAssetStatus = 'unsupported' | 'loading' | 'ready' | 'failed';

export interface WildlifeAssetDefinition {
  species: string;
  asset: string;
  license: 'CC0';
  source: string;
  clips: Record<string, string>;
}

export interface WildlifeAssetResolution {
  status: WildlifeAssetStatus;
  definition?: WildlifeAssetDefinition;
  reason?: string;
}

const RACCOON_CLIP_PREFIX = 'AnimalArmature|AnimalArmature|AnimalArmature|';

const RACCOON: WildlifeAssetDefinition = {
  species: 'raccoon',
  asset: '/assets/quaternius/wildlife/Raccoon.glb',
  license: 'CC0',
  source: 'Quaternius Ultimate Animated Animals / fixed pinned mirror provenance. Logical action names map to the authored GLB clip names.',
  clips: {
    idle: `${RACCOON_CLIP_PREFIX}Idle`,
    walk: `${RACCOON_CLIP_PREFIX}Walk`,
    run: `${RACCOON_CLIP_PREFIX}Run`,
    eat: `${RACCOON_CLIP_PREFIX}Idle_Eating`,
    death: `${RACCOON_CLIP_PREFIX}Death`,
  },
};

export function resolveWildlifeAsset(species: string): WildlifeAssetResolution {
  if (species !== RACCOON.species) {
    return { status: 'unsupported', reason: `no authored asset mapping for ${species}` };
  }
  return { status: 'ready', definition: RACCOON };
}
