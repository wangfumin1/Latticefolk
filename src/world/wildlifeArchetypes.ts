import type { ChunkBiome, WildlifeAction, WildlifeOrganismFamily, WildlifeSpecies, WorldSeason } from '../types.js';
import type {
  WildlifeFineProfile, WildlifeLifeHistoryProfile, WildlifeMorphologyProfile, WildlifeMovementProfile,
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
  organismFamily:WildlifeOrganismFamily;
  fine:WildlifeFineProfile;
  morphology:WildlifeMorphologyProfile;
}

export interface WildlifeMovementArchetype extends WildlifeMovementProfile {}

export interface WildlifeCapabilityArchetype {
  id:string;
  actions:readonly WildlifeAction[];
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
  movement:WildlifeMovementArchetype;
  capabilities:WildlifeCapabilityArchetype;
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
  },
  openPlains:{
    id:'open_plains',
    biomeAffinity:{plains:1,forest:.38,hills:.68,wetlands:.42,dryland:.52},
    seasonalBiomeAffinity:seasonal(
      {plains:1.10,forest:.72,hills:.96,wetlands:.82,dryland:.86},
      {plains:1.05,forest:.68,hills:.92,wetlands:.76,dryland:.82},
      {plains:1.08,forest:.72,hills:.98,wetlands:.74,dryland:.84},
      {plains:.94,forest:.66,hills:.88,wetlands:.66,dryland:.74}
    )
  },
  forestWetlandEdge:{
    id:'forest_wetland_edge',
    biomeAffinity:{plains:.56,forest:.92,hills:.52,wetlands:1,dryland:.24},
    seasonalBiomeAffinity:seasonal(
      {plains:.86,forest:1.04,hills:.78,wetlands:1.08,dryland:.56},
      {plains:.80,forest:1.00,hills:.74,wetlands:1.12,dryland:.52},
      {plains:.84,forest:1.08,hills:.80,wetlands:1.02,dryland:.56},
      {plains:.74,forest:.96,hills:.72,wetlands:.90,dryland:.48}
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
  },
  largeGrazer:{
    id:'large_grazer',
    trophicRole:'herbivore',
    niche:{grass:.72,shrub:.18,fruit:0,crop:.10,prey:0,space:.34},
    plantForageWeights:{grass:.78,shrub:.16,fruit:0,crop:.06},
    plantConsumptionWeights:{grass:.78,shrub:.18,fruit:0,crop:.04},
    baseCarryingCapacity:9,growthRate:.0035,herbivoryRate:.025,predationRate:0,huntEnergyCost:0,rainMortality:0,
    feedingAction:'graze',forageTags:['nature','food','grass']
  },
  smallOpportunisticOmnivore:{
    id:'small_opportunistic_omnivore',
    trophicRole:'omnivore',
    niche:{grass:.04,shrub:.20,fruit:.30,crop:.18,prey:.14,space:.14},
    plantForageWeights:{grass:.04,shrub:.28,fruit:.46,crop:.22},
    plantConsumptionWeights:{grass:.02,shrub:.08,fruit:.14,crop:.08},
    baseCarryingCapacity:10,growthRate:.0048,herbivoryRate:.007,predationRate:.006,huntEnergyCost:6,rainMortality:0,
    feedingAction:'forage',forageTags:['forage','food','nature','farm']
  }
} satisfies Record<string,WildlifeEcologyArchetype>;

export const WILDLIFE_BODY_ARCHETYPES={
  mediumFelid:{
    id:'medium_felid',
    organismFamily:'felid',
    fine:{speed:3.05,size:.80,fertility:.34,wariness:.82,maxFine:1,maxInitialAge:2100},
    morphology:{
      body:0x9a815f,accent:0xd7c3a3,bodyX:1.16,bodyY:.62,bodyZ:.58,
      headSize:.47,legHeight:.52,features:['tail','ear_tufts'],featureColor:0x4b4034,tailLength:.50
    }
  },
  largeBovid:{
    id:'large_bovid',
    organismFamily:'bovid',
    fine:{speed:2.35,size:1.45,fertility:.34,wariness:.72,maxFine:1,maxInitialAge:3600},
    morphology:{
      body:0x5f4935,accent:0x3f3328,bodyX:1.36,bodyY:.84,bodyZ:.72,
      headSize:.54,legHeight:.56,features:['horns','tail'],featureColor:0x2f2923,tailLength:.45
    }
  },
  smallMaskedForager:{
    id:'small_masked_forager',
    organismFamily:'procyonid',
    fine:{speed:2.35,size:.58,fertility:.50,wariness:.66,maxFine:2,maxInitialAge:1600},
    morphology:{
      body:0x77736b,accent:0xb8b1a5,bodyX:1.08,bodyY:.56,bodyZ:.52,
      headSize:.44,legHeight:.40,features:['ringed_tail','face_mask'],featureColor:0x2c2d2d,tailLength:.72
    }
  }
} satisfies Record<string,WildlifeBodyArchetype>;

export const WILDLIFE_LIFE_ARCHETYPES={
  mediumSolitaryPredator:{
    id:'medium_solitary_predator',
    lifeHistory:{adultAge:280,maxAge:3000,gestationDays:9,birthCooldown:22,litterMin:1,litterMax:2}
  },
  largeHerdHerbivore:{
    id:'large_herd_herbivore',
    lifeHistory:{adultAge:420,maxAge:6200,gestationDays:24,birthCooldown:38,litterMin:1,litterMax:1}
  },
  smallGeneralistOmnivore:{
    id:'small_generalist_omnivore',
    lifeHistory:{adultAge:180,maxAge:2400,gestationDays:8,birthCooldown:18,litterMin:1,litterMax:3}
  }
} satisfies Record<string,WildlifeLifeArchetype>;

export const WILDLIFE_MOVEMENT_ARCHETYPES={
  generalist:{id:'generalist',mode:'generalist',speedMultiplier:1,energyMultiplier:1,fastActionMultiplier:1},
  cursorial:{id:'cursorial',mode:'cursorial',speedMultiplier:1.04,energyMultiplier:1.03,fastActionMultiplier:.98},
  ambush:{id:'ambush',mode:'ambush',speedMultiplier:.98,energyMultiplier:.96,fastActionMultiplier:1.03},
  sturdy:{id:'sturdy',mode:'sturdy',speedMultiplier:.96,energyMultiplier:.95,fastActionMultiplier:1.02},
  heavyGrazer:{id:'heavy_grazer',mode:'heavy_grazer',speedMultiplier:.92,energyMultiplier:1.04,fastActionMultiplier:1.08},
  dexterousForager:{id:'dexterous_forager',mode:'dexterous_forager',speedMultiplier:1.01,energyMultiplier:.97,fastActionMultiplier:1}
} satisfies Record<string,WildlifeMovementArchetype>;

export const WILDLIFE_CAPABILITY_ARCHETYPES={
  grazer:{id:'grazer',actions:['wander','rest','drink','flee','graze','seek_mate','migrate']},
  forager:{id:'forager',actions:['wander','rest','drink','flee','forage','seek_mate','migrate']},
  predatorForager:{id:'predator_forager',actions:['wander','rest','drink','flee','forage','hunt','seek_mate','migrate']},
  omnivoreForager:{id:'omnivore_forager',actions:['wander','rest','drink','flee','forage','hunt','seek_mate','migrate']}
} satisfies Record<string,WildlifeCapabilityArchetype>;

export function composeWildlifeSpeciesProfile(recipe:WildlifeSpeciesArchetypeRecipe):WildlifeSpeciesProfile {
  return {
    archetypeId:recipe.id,
    organismFamily:recipe.body.organismFamily,
    movement:{...recipe.movement},
    capabilities:[...recipe.capabilities.actions],
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
