import type { ChunkBiome, WildlifeSpecies, WorldSeason } from '../types.js';
import type {
  WildlifeFineProfile, WildlifeLifeHistoryProfile, WildlifeMorphologyProfile,
  WildlifeNicheAxis, WildlifeSpeciesProfile, WildlifeTrophicRole
} from './wildlifeSpecies.js';

type PlantAxis='grass'|'shrub'|'fruit'|'crop';

export interface WildlifeHabitatArchetype {
  id:string;
  biomeAffinity:Record<ChunkBiome,number>;
  seasonalBiomeAffinity:Record<WorldSeason,Record<ChunkBiome,number>>;
}

export interface WildlifeEcologyArchetype {
  id:string;
  trophicRole:WildlifeTrophicRole;
  niche:Record<WildlifeNicheAxis,number>;
  plantForageWeights:Record<PlantAxis,number>;
  plantConsumptionWeights:Record<PlantAxis,number>;
  baseCarryingCapacity:number;
  growthRate:number;
  herbivoryRate:number;
  predationRate:number;
  huntEnergyCost:number;
  rainMortality:number;
  feedingAction:'graze'|'forage';
  forageTags:readonly string[];
}

export interface WildlifeBodyArchetype {
  id:string;
  fine:WildlifeFineProfile;
  morphology:WildlifeMorphologyProfile;
}

export interface WildlifeLifeArchetype {
  id:string;
  lifeHistory:WildlifeLifeHistoryProfile;
}

export interface WildlifeSpeciesArchetypeRecipe {
  id:string;
  habitat:WildlifeHabitatArchetype;
  ecology:WildlifeEcologyArchetype;
  body:WildlifeBodyArchetype;
  life:WildlifeLifeArchetype;
  prey?:Partial<Record<WildlifeSpecies,{preference:number;damage:number;hungerRelief:number}>>;
}

const seasonal=(
  spring:Record<ChunkBiome,number>,summer:Record<ChunkBiome,number>,
  autumn:Record<ChunkBiome,number>,winter:Record<ChunkBiome,number>
):Record<WorldSeason,Record<ChunkBiome,number>>=>({spring,summer,autumn,winter});

export const WILDLIFE_HABITAT_ARCHETYPES={
  temperateForestHills:{
    id:'temperate_forest_hills',
    biomeAffinity:{plains:.58,forest:1,hills:.94,wetlands:.36,dryland:.30},
    seasonalBiomeAffinity:seasonal(
      {plains:.82,forest:1.08,hills:1.02,wetlands:.66,dryland:.58},
      {plains:.74,forest:1.02,hills:1.04,wetlands:.60,dryland:.54},
      {plains:.78,forest:1.12,hills:1.06,wetlands:.58,dryland:.56},
      {plains:.72,forest:1.10,hills:1.08,wetlands:.52,dryland:.50}
    )
  }
} satisfies Record<string,WildlifeHabitatArchetype>;

export const WILDLIFE_ECOLOGY_ARCHETYPES={
  mediumAmbushPredator:{
    id:'medium_ambush_predator',
    trophicRole:'predator',
    niche:{grass:0,shrub:0,fruit:0,crop:0,prey:.84,space:.32},
    plantForageWeights:{grass:0,shrub:0,fruit:0,crop:0},
    plantConsumptionWeights:{grass:0,shrub:0,fruit:0,crop:0},
    baseCarryingCapacity:5.5,
    growthRate:.0028,
    herbivoryRate:0,
    predationRate:.018,
    huntEnergyCost:9,
    rainMortality:0,
    feedingAction:'forage',
    forageTags:['forage','food']
  }
} satisfies Record<string,WildlifeEcologyArchetype>;

export const WILDLIFE_BODY_ARCHETYPES={
  mediumFelid:{
    id:'medium_felid',
    fine:{speed:3.05,size:.80,fertility:.34,wariness:.82,maxFine:1,maxInitialAge:2100},
    morphology:{
      body:0x9a815f,accent:0xd7c3a3,bodyX:1.16,bodyY:.62,bodyZ:.58,
      headSize:.47,legHeight:.52,features:['tail','ear_tufts'],featureColor:0x4b4034,tailLength:.50
    }
  }
} satisfies Record<string,WildlifeBodyArchetype>;

export const WILDLIFE_LIFE_ARCHETYPES={
  mediumSolitaryPredator:{
    id:'medium_solitary_predator',
    lifeHistory:{adultAge:280,maxAge:3000,gestationDays:9,birthCooldown:22,litterMin:1,litterMax:2}
  }
} satisfies Record<string,WildlifeLifeArchetype>;

export function composeWildlifeSpeciesProfile(recipe:WildlifeSpeciesArchetypeRecipe):WildlifeSpeciesProfile {
  return {
    archetypeId:recipe.id,
    trophicRole:recipe.ecology.trophicRole,
    biomeAffinity:{...recipe.habitat.biomeAffinity},
    seasonalBiomeAffinity:{
      spring:{...recipe.habitat.seasonalBiomeAffinity.spring},
      summer:{...recipe.habitat.seasonalBiomeAffinity.summer},
      autumn:{...recipe.habitat.seasonalBiomeAffinity.autumn},
      winter:{...recipe.habitat.seasonalBiomeAffinity.winter}
    },
    niche:{...recipe.ecology.niche},
    plantForageWeights:{...recipe.ecology.plantForageWeights},
    plantConsumptionWeights:{...recipe.ecology.plantConsumptionWeights},
    baseCarryingCapacity:recipe.ecology.baseCarryingCapacity,
    growthRate:recipe.ecology.growthRate,
    herbivoryRate:recipe.ecology.herbivoryRate,
    predationRate:recipe.ecology.predationRate,
    huntEnergyCost:recipe.ecology.huntEnergyCost,
    rainMortality:recipe.ecology.rainMortality,
    feedingAction:recipe.ecology.feedingAction,
    forageTags:[...recipe.ecology.forageTags],
    fine:{...recipe.body.fine},
    morphology:{...recipe.body.morphology,features:[...recipe.body.morphology.features]},
    lifeHistory:{...recipe.life.lifeHistory},
    prey:{...(recipe.prey||{})}
  };
}
