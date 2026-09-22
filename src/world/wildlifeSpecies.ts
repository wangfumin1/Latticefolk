import type { ChunkBiome, WildlifeSpecies, WildlifeTraits, WorldSeason } from '../types.js';

export type WildlifeTrophicRole='herbivore'|'omnivore'|'predator';
export type WildlifeNicheAxis='grass'|'shrub'|'fruit'|'crop'|'prey'|'space';

export interface WildlifeSpeciesProfile {
  trophicRole: WildlifeTrophicRole;
  biomeAffinity: Record<ChunkBiome,number>;
  seasonalBiomeAffinity: Record<WorldSeason,Record<ChunkBiome,number>>;
  niche: Record<WildlifeNicheAxis,number>;
  plantDiet: {grass:number;shrub:number;fruit:number;crop:number};
  baseCapacity: number;
  growthRate: number;
  plantConsumptionRate: number;
  preyPreferences: Partial<Record<WildlifeSpecies,number>>;
  predationRate: number;
  fineAttackDamage: number;
  fineForageAction: 'graze'|'forage'|'hunt';
  fineForageTags: string[];
  fine: WildlifeTraits & {maxFine:number;seedAgeMax:number};
  visual: {body:number;accent:number;morphology:'rodent'|'rabbit'|'deer'|'boar'|'canid'};
}

export const WILDLIFE_SPECIES:WildlifeSpecies[]=['mouse','rabbit','deer','boar','fox','wolf'];
export const WILDLIFE_NICHE_AXES:WildlifeNicheAxis[]=['grass','shrub','fruit','crop','prey','space'];

export const WILDLIFE_SPECIES_PROFILES:Record<WildlifeSpecies,WildlifeSpeciesProfile>={
  mouse:{
    trophicRole:'herbivore',
    biomeAffinity:{plains:.92,forest:.82,hills:.68,wetlands:.75,dryland:.55},
    seasonalBiomeAffinity:{
      spring:{plains:1.08,forest:1.00,hills:.92,wetlands:1.02,dryland:.82},
      summer:{plains:1.02,forest:.98,hills:.90,wetlands:1.04,dryland:.78},
      autumn:{plains:1.10,forest:1.04,hills:.92,wetlands:.96,dryland:.84},
      winter:{plains:.94,forest:1.00,hills:.88,wetlands:.86,dryland:.76}
    },
    niche:{grass:.24,shrub:.18,fruit:.18,crop:.40,prey:0,space:.08},
    plantDiet:{grass:.24,shrub:.18,fruit:.18,crop:.40},
    baseCapacity:64,growthRate:.014,plantConsumptionRate:.0035,
    preyPreferences:{},predationRate:0,fineAttackDamage:0,
    fineForageAction:'forage',fineForageTags:['forage','food','farm','grain'],
    fine:{speed:2.1,size:.30,fertility:.96,wariness:.93,maxFine:4,seedAgeMax:420},
    visual:{body:0x81766d,accent:0xc3b9ad,morphology:'rodent'}
  },
  rabbit:{
    trophicRole:'herbivore',
    biomeAffinity:{plains:1,forest:.82,hills:.65,wetlands:.72,dryland:.35},
    seasonalBiomeAffinity:{
      spring:{plains:1.10,forest:1.00,hills:.92,wetlands:1.04,dryland:.76},
      summer:{plains:.98,forest:1.02,hills:.92,wetlands:1.08,dryland:.72},
      autumn:{plains:1.04,forest:1.06,hills:.96,wetlands:.94,dryland:.78},
      winter:{plains:.88,forest:1.02,hills:.90,wetlands:.82,dryland:.68}
    },
    niche:{grass:.58,shrub:.30,fruit:0,crop:.12,prey:0,space:.15},
    plantDiet:{grass:.58,shrub:.30,fruit:0,crop:.12},
    baseCapacity:36,growthRate:.010,plantConsumptionRate:.008,
    preyPreferences:{},predationRate:0,fineAttackDamage:0,
    fineForageAction:'graze',fineForageTags:['nature','food','grass'],
    fine:{speed:2.4,size:.55,fertility:.90,wariness:.88,maxFine:3,seedAgeMax:500},
    visual:{body:0xb8a48d,accent:0xe4d4c1,morphology:'rabbit'}
  },
  deer:{
    trophicRole:'herbivore',
    biomeAffinity:{plains:.72,forest:1,hills:.82,wetlands:.55,dryland:.28},
    seasonalBiomeAffinity:{
      spring:{plains:1.02,forest:1.04,hills:1.00,wetlands:.88,dryland:.70},
      summer:{plains:.92,forest:.98,hills:1.12,wetlands:.84,dryland:.66},
      autumn:{plains:.90,forest:1.14,hills:.98,wetlands:.80,dryland:.68},
      winter:{plains:.84,forest:1.10,hills:.92,wetlands:.72,dryland:.64}
    },
    niche:{grass:.38,shrub:.38,fruit:.24,crop:0,prey:0,space:.15},
    plantDiet:{grass:.38,shrub:.38,fruit:.24,crop:0},
    baseCapacity:16,growthRate:.005,plantConsumptionRate:.018,
    preyPreferences:{},predationRate:0,fineAttackDamage:0,
    fineForageAction:'graze',fineForageTags:['nature','food','grass'],
    fine:{speed:2.8,size:1.15,fertility:.48,wariness:.82,maxFine:2,seedAgeMax:3200},
    visual:{body:0x9a6945,accent:0xd2b28f,morphology:'deer'}
  },
  boar:{
    trophicRole:'omnivore',
    biomeAffinity:{plains:.68,forest:1,hills:.62,wetlands:.84,dryland:.25},
    seasonalBiomeAffinity:{
      spring:{plains:.94,forest:1.08,hills:.90,wetlands:1.04,dryland:.66},
      summer:{plains:.88,forest:1.02,hills:.86,wetlands:1.14,dryland:.60},
      autumn:{plains:.90,forest:1.16,hills:.92,wetlands:1.00,dryland:.64},
      winter:{plains:.80,forest:1.10,hills:.86,wetlands:.88,dryland:.58}
    },
    niche:{grass:0,shrub:.28,fruit:.34,crop:.38,prey:0,space:.15},
    plantDiet:{grass:0,shrub:.28,fruit:.34,crop:.38},
    baseCapacity:12,growthRate:.005,plantConsumptionRate:.020,
    preyPreferences:{},predationRate:0,fineAttackDamage:0,
    fineForageAction:'forage',fineForageTags:['forage','food','farm'],
    fine:{speed:1.9,size:1.0,fertility:.55,wariness:.58,maxFine:2,seedAgeMax:3200},
    visual:{body:0x5d4a3c,accent:0x796354,morphology:'boar'}
  },
  fox:{
    trophicRole:'predator',
    biomeAffinity:{plains:.9,forest:.92,hills:.78,wetlands:.56,dryland:.48},
    seasonalBiomeAffinity:{
      spring:{plains:1.05,forest:1.03,hills:.96,wetlands:.88,dryland:.76},
      summer:{plains:1.02,forest:1.00,hills:.98,wetlands:.90,dryland:.74},
      autumn:{plains:1.00,forest:1.08,hills:1.00,wetlands:.84,dryland:.76},
      winter:{plains:.94,forest:1.06,hills:.98,wetlands:.78,dryland:.72}
    },
    niche:{grass:0,shrub:0,fruit:0,crop:0,prey:.75,space:.25},
    plantDiet:{grass:0,shrub:0,fruit:0,crop:0},
    baseCapacity:7,growthRate:.0032,plantConsumptionRate:0,
    preyPreferences:{mouse:1,rabbit:1,deer:.15},predationRate:.015,fineAttackDamage:90,
    fineForageAction:'hunt',fineForageTags:['forage','food'],
    fine:{speed:2.7,size:.70,fertility:.42,wariness:.76,maxFine:1,seedAgeMax:1800},
    visual:{body:0xc86f35,accent:0xf0d0a5,morphology:'canid'}
  },
  wolf:{
    trophicRole:'predator',
    biomeAffinity:{plains:.72,forest:1,hills:.95,wetlands:.55,dryland:.40},
    seasonalBiomeAffinity:{
      spring:{plains:.92,forest:1.06,hills:1.04,wetlands:.78,dryland:.68},
      summer:{plains:.86,forest:1.00,hills:1.08,wetlands:.72,dryland:.62},
      autumn:{plains:.88,forest:1.10,hills:1.06,wetlands:.70,dryland:.66},
      winter:{plains:.90,forest:1.12,hills:1.08,wetlands:.66,dryland:.64}
    },
    niche:{grass:0,shrub:0,fruit:0,crop:0,prey:.78,space:.22},
    plantDiet:{grass:0,shrub:0,fruit:0,crop:0},
    baseCapacity:4,growthRate:.0024,plantConsumptionRate:0,
    preyPreferences:{mouse:.05,rabbit:.40,deer:1,boar:.75,fox:.12},predationRate:.010,fineAttackDamage:110,
    fineForageAction:'hunt',fineForageTags:['forage','food'],
    fine:{speed:3.0,size:1.20,fertility:.35,wariness:.70,maxFine:1,seedAgeMax:2500},
    visual:{body:0x64676b,accent:0xaeb3b8,morphology:'canid'}
  }
};

export function wildlifeSpeciesProfile(species:WildlifeSpecies){
  return WILDLIFE_SPECIES_PROFILES[species];
}

export function wildlifeIsPredator(species:WildlifeSpecies){
  return wildlifeSpeciesProfile(species).trophicRole==='predator';
}

export function wildlifeCanPredate(predator:WildlifeSpecies,prey:WildlifeSpecies){
  return (wildlifeSpeciesProfile(predator).preyPreferences[prey]||0)>0;
}

export function wildlifePreyPreference(predator:WildlifeSpecies,prey:WildlifeSpecies){
  return wildlifeSpeciesProfile(predator).preyPreferences[prey]||0;
}

export function wildlifePlantDietTotal(species:WildlifeSpecies){
  const diet=wildlifeSpeciesProfile(species).plantDiet;
  return diet.grass+diet.shrub+diet.fruit+diet.crop;
}

export function emptyWildlifeNumberRecord(){
  return Object.fromEntries(WILDLIFE_SPECIES.map(species=>[species,0])) as Record<WildlifeSpecies,number>;
}
