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

const RACCOON: WildlifeAssetDefinition = {
  species: 'raccoon',
  asset: '/assets/quaternius/wildlife/Raccoon.glb',
  license: 'CC0',
  source: 'Quaternius Ultimate Animated Animals / fixed pinned mirror provenance',
  clips: {
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
    eat: 'Idle_Eating',
    death: 'Death',
  },
};

export function resolveWildlifeAsset(species: string): WildlifeAssetResolution {
  if (species !== RACCOON.species) {
    return { status: 'unsupported', reason: `no authored asset mapping for ${species}` };
  }
  return { status: 'ready', definition: RACCOON };
}
