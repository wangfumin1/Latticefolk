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

export function wildlifePreySpecies(species:WildlifeSpecies){
  return PREY[species];
}

export function isWildlifePredator(species:WildlifeSpecies){
  return WILDLIFE_PREDATORS.includes(species);
}

export function canWildlifePredate(predator:WildlifeSpecies,prey:WildlifeSpecies){
  return PREY[predator].includes(prey);
}
