import type { WildlifeSpecies } from '../types.js';

export interface WildlifeLifeHistory {
  adultAge: number;
  maxAge: number;
  gestationDays: number;
  birthCooldown: number;
  litterMin: number;
  litterMax: number;
}

export const WILDLIFE_LIFE_HISTORY:Record<WildlifeSpecies,WildlifeLifeHistory>={
  rabbit:{adultAge:90,maxAge:2200,gestationDays:5,birthCooldown:8,litterMin:1,litterMax:3},
  deer:{adultAge:300,maxAge:5200,gestationDays:18,birthCooldown:32,litterMin:1,litterMax:1},
  boar:{adultAge:260,maxAge:4300,gestationDays:12,birthCooldown:24,litterMin:1,litterMax:2},
  fox:{adultAge:240,maxAge:1900,gestationDays:8,birthCooldown:20,litterMin:1,litterMax:2}
};

export function wildlifeLifeHistory(species:WildlifeSpecies){
  return WILDLIFE_LIFE_HISTORY[species];
}
