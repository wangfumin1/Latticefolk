import type { WildlifeSpecies } from '../types.js';
import { WILDLIFE_SPECIES, wildlifeSpeciesProfile } from './wildlifeSpecies.js';

export interface WildlifeLifeHistory {
  adultAge: number;
  maxAge: number;
  gestationDays: number;
  birthCooldown: number;
  litterMin: number;
  litterMax: number;
}

export const WILDLIFE_LIFE_HISTORY:Record<WildlifeSpecies,WildlifeLifeHistory>=Object.fromEntries(
  WILDLIFE_SPECIES.map(species=>[species,wildlifeSpeciesProfile(species).lifeHistory])
) as Record<WildlifeSpecies,WildlifeLifeHistory>;

export function wildlifeLifeHistory(species:WildlifeSpecies){
  return wildlifeSpeciesProfile(species).lifeHistory;
}
