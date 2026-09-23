import type { WildlifeSpecies } from '../types.js';

export const WILDLIFE_SPECIES:readonly WildlifeSpecies[]=['rabbit','deer','boar','goat','fox','wolf'];
export const WILDLIFE_HERBIVORES:readonly WildlifeSpecies[]=['rabbit','deer','boar','goat'];
export const WILDLIFE_PREDATORS:readonly WildlifeSpecies[]=['fox','wolf'];

const PREY:Record<WildlifeSpecies,readonly WildlifeSpecies[]>={
  rabbit:[],
  deer:[],
  boar:[],
  goat:[],
  fox:['rabbit','deer'],
  wolf:['rabbit','deer','boar','goat','fox']
};

const PREDATION_PREFERENCE:Partial<Record<WildlifeSpecies,Partial<Record<WildlifeSpecies,number>>>>={
  fox:{rabbit:1,deer:.22},
  wolf:{rabbit:.34,deer:.72,boar:.48,goat:.68,fox:.08}
};

const PREDATION_DAMAGE:Partial<Record<WildlifeSpecies,Partial<Record<WildlifeSpecies,number>>>>={
  fox:{rabbit:100,deer:45},
  wolf:{rabbit:100,deer:78,boar:58,goat:86,fox:72}
};

const HUNGER_RELIEF:Partial<Record<WildlifeSpecies,Partial<Record<WildlifeSpecies,number>>>>={
  fox:{rabbit:48,deer:30},
  wolf:{rabbit:34,deer:52,boar:44,goat:50,fox:24}
};

export function wildlifePreySpecies(species:WildlifeSpecies){
  return PREY[species];
}

export function isWildlifePredator(species:WildlifeSpecies){
  return WILDLIFE_PREDATORS.includes(species);
}

export function canWildlifePredate(predator:WildlifeSpecies,prey:WildlifeSpecies){
  return PREY[predator].includes(prey);
}


export function wildlifePredationPreference(predator:WildlifeSpecies,prey:WildlifeSpecies){
  return PREDATION_PREFERENCE[predator]?.[prey]||0;
}

export function wildlifePredationDamage(predator:WildlifeSpecies,prey:WildlifeSpecies){
  return PREDATION_DAMAGE[predator]?.[prey]||0;
}

export function wildlifeHungerRelief(predator:WildlifeSpecies,prey:WildlifeSpecies){
  return HUNGER_RELIEF[predator]?.[prey]||0;
}
