import type {
  WildlifeBehaviorPhenotype, WildlifeMorphologyPhenotype, WildlifePhenotype, WildlifeSpecies
} from '../types.js';
import { wildlifeSpeciesProfile } from './wildlifeSpecies.js';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

const unit=(key:string)=>{
  let h=2166136261;
  for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0)/4294967295;
};

const morphologyBounds:Record<keyof WildlifeMorphologyPhenotype,[number,number]>={
  bodyLength:[.78,1.22],
  bodyHeight:[.82,1.18],
  legLength:[.78,1.22],
  headScale:[.82,1.18],
  tailScale:[.75,1.25]
};

const behaviorBounds:Record<keyof WildlifeBehaviorPhenotype,[number,number]>={
  forageDrive:[.75,1.25],
  migrationDrive:[.75,1.25],
  riskTolerance:[.70,1.30],
  recoveryDrive:[.75,1.25]
};

export const WILDLIFE_MORPHOLOGY_GENES=Object.keys(morphologyBounds) as Array<keyof WildlifeMorphologyPhenotype>;
export const WILDLIFE_BEHAVIOR_GENES=Object.keys(behaviorBounds) as Array<keyof WildlifeBehaviorPhenotype>;

const founderGene=(seed:string,key:string,spread:number)=>{
  return 1+(unit(`${seed}:${key}`)-.5)*2*spread;
};

export function founderWildlifePhenotype(seed:string):WildlifePhenotype {
  const morphology={} as WildlifeMorphologyPhenotype;
  const behavior={} as WildlifeBehaviorPhenotype;
  for(const key of WILDLIFE_MORPHOLOGY_GENES){
    const [min,max]=morphologyBounds[key];
    morphology[key]=clamp(founderGene(seed,`morphology:${key}`,.06),min,max);
  }
  for(const key of WILDLIFE_BEHAVIOR_GENES){
    const [min,max]=behaviorBounds[key];
    behavior[key]=clamp(founderGene(seed,`behavior:${key}`,.08),min,max);
  }
  return {morphology,behavior};
}

export function normalizeWildlifePhenotype(value:WildlifePhenotype|undefined,seed:string):WildlifePhenotype {
  const fallback=founderWildlifePhenotype(seed);
  const morphology={} as WildlifeMorphologyPhenotype;
  const behavior={} as WildlifeBehaviorPhenotype;
  for(const key of WILDLIFE_MORPHOLOGY_GENES){
    const [min,max]=morphologyBounds[key];
    const candidate=Number(value?.morphology?.[key]);
    morphology[key]=clamp(Number.isFinite(candidate)?candidate:fallback.morphology[key],min,max);
  }
  for(const key of WILDLIFE_BEHAVIOR_GENES){
    const [min,max]=behaviorBounds[key];
    const candidate=Number(value?.behavior?.[key]);
    behavior[key]=clamp(Number.isFinite(candidate)?candidate:fallback.behavior[key],min,max);
  }
  return {morphology,behavior};
}

const inheritGene=(a:number,b:number,key:string,bounds:[number,number],mutation:number)=>{
  const [min,max]=bounds;
  const mutated=(a+b)/2+(unit(key)-.5)*2*mutation;
  return clamp(mutated,min,max);
};

export function inheritWildlifePhenotype(
  mother:WildlifePhenotype,
  father:WildlifePhenotype,
  seed:string
):WildlifePhenotype {
  const morphology={} as WildlifeMorphologyPhenotype;
  const behavior={} as WildlifeBehaviorPhenotype;
  for(const key of WILDLIFE_MORPHOLOGY_GENES){
    morphology[key]=inheritGene(mother.morphology[key],father.morphology[key],`${seed}:morphology:${key}`,morphologyBounds[key],.045);
  }
  for(const key of WILDLIFE_BEHAVIOR_GENES){
    behavior[key]=inheritGene(mother.behavior[key],father.behavior[key],`${seed}:behavior:${key}`,behaviorBounds[key],.055);
  }
  return {morphology,behavior};
}

export function effectiveWildlifeMorphology(species:WildlifeSpecies,phenotype:WildlifePhenotype){
  const base=wildlifeSpeciesProfile(species).morphology;
  return {
    ...base,
    bodyX:base.bodyX*phenotype.morphology.bodyLength,
    bodyY:base.bodyY*phenotype.morphology.bodyHeight,
    bodyZ:base.bodyZ*Math.sqrt(phenotype.morphology.bodyLength*phenotype.morphology.bodyHeight),
    headSize:base.headSize*phenotype.morphology.headScale,
    legHeight:base.legHeight*phenotype.morphology.legLength,
    tailLength:(base.tailLength??.6)*phenotype.morphology.tailScale
  };
}

export function wildlifeBehaviorThresholds(phenotype:WildlifePhenotype){
  const b=phenotype.behavior;
  return {
    fleeDistance:clamp(5-(b.riskTolerance-1)*2,4.4,5.6),
    hungerThreshold:clamp(68-(b.forageDrive-1)*20,63,73),
    migrationGain:clamp(8/b.migrationDrive,6.4,10.7),
    diseaseRestThreshold:clamp(65-(b.recoveryDrive-1)*20,60,70),
    energyRestThreshold:clamp(24+(b.recoveryDrive-1)*16,20,28)
  };
}
