import type {
  WildlifeAction, WildlifeDomesticationCommand, WildlifeDomesticationOwnerKind,
  WildlifeDomesticationState, WildlifeSpecies, WildlifeState
} from '../types.js';
import { wildlifeSpeciesProfile } from './wildlifeSpecies.js';

const clamp=(value:number,min=0,max=100)=>Math.max(min,Math.min(max,value));

export type WildlifeDomesticationInteraction =
  | 'inspect'
  | 'feed_tame'
  | 'command_follow'
  | 'command_stay'
  | 'command_graze'
  | 'release';

export function canSpeciesBeDomesticated(species:WildlifeSpecies) {
  return wildlifeSpeciesProfile(species).form.kind==='domesticated';
}

export function normalizeWildlifeDomestication(
  species:WildlifeSpecies,
  value?:WildlifeDomesticationState
):WildlifeDomesticationState|undefined {
  if(!canSpeciesBeDomesticated(species))return undefined;
  const stage=value?.stage==='bonded'||value?.stage==='taming'?value.stage:'feral';
  const progress=clamp(Number(value?.progress)||0);
  const ownerKind=value?.ownerKind;
  const ownerId=typeof value?.ownerId==='string'&&value.ownerId?value.ownerId:undefined;
  const bonded=stage==='bonded'&&Boolean(ownerKind&&ownerId);
  const command:WildlifeDomesticationCommand=
    bonded&&['follow','stay','graze','autonomous'].includes(value?.command||'')
      ?value!.command
      :'autonomous';
  return {
    stage:bonded?'bonded':progress>0?'taming':'feral',
    progress:bonded?100:progress,
    ownerKind:bonded?ownerKind:undefined,
    ownerId:bonded?ownerId:undefined,
    command,
    bondedDay:bonded&&Number.isFinite(value?.bondedDay)?value?.bondedDay:undefined,
    lastInteractionDay:Number.isFinite(value?.lastInteractionDay)?value?.lastInteractionDay:undefined
  };
}

export function wildlifeDomesticationFeedGain(
  animal:Pick<WildlifeState,'health'|'traits'>
) {
  const healthBonus=clamp(animal.health,0,100)*.035;
  const warinessPenalty=clamp(animal.traits.wariness,0,1.5)*7;
  return clamp(27+healthBonus-warinessPenalty,16,30);
}

export function advanceWildlifeDomestication(
  animal:Pick<WildlifeState,'species'|'health'|'traits'|'domestication'>,
  day:number,
  ownerKind:WildlifeDomesticationOwnerKind,
  ownerId:string
):WildlifeDomesticationState|undefined {
  const current=normalizeWildlifeDomestication(animal.species,animal.domestication);
  if(!current)return undefined;
  if(current.stage==='bonded'){
    if(current.ownerKind!==ownerKind||current.ownerId!==ownerId)return current;
    return {...current,lastInteractionDay:day};
  }
  const progress=clamp(current.progress+wildlifeDomesticationFeedGain(animal));
  if(progress<100)return {...current,stage:'taming',progress,command:'autonomous',lastInteractionDay:day};
  return {
    stage:'bonded',progress:100,ownerKind,ownerId,command:'follow',
    bondedDay:day,lastInteractionDay:day
  };
}

export function releaseWildlifeDomestication(
  species:WildlifeSpecies,
  value?:WildlifeDomesticationState,
  day?:number
):WildlifeDomesticationState|undefined {
  if(!canSpeciesBeDomesticated(species))return undefined;
  const current=normalizeWildlifeDomestication(species,value);
  return {
    stage:'feral',progress:0,command:'autonomous',
    lastInteractionDay:Number.isFinite(day)?day:current?.lastInteractionDay
  };
}

export function canIssueWildlifeDomesticationCommand(
  species:WildlifeSpecies,
  value:WildlifeDomesticationState|undefined,
  ownerKind:WildlifeDomesticationOwnerKind,
  ownerId:string
) {
  const current=normalizeWildlifeDomestication(species,value);
  return current?.stage==='bonded'&&current.ownerKind===ownerKind&&current.ownerId===ownerId;
}

export function setWildlifeDomesticationCommand(
  species:WildlifeSpecies,
  value:WildlifeDomesticationState|undefined,
  command:Exclude<WildlifeDomesticationCommand,'autonomous'>,
  day:number,
  ownerKind:WildlifeDomesticationOwnerKind,
  ownerId:string
):WildlifeDomesticationState|undefined {
  const current=normalizeWildlifeDomestication(species,value);
  if(!current||!canIssueWildlifeDomesticationCommand(species,current,ownerKind,ownerId))return current;
  return {...current,command,lastInteractionDay:day};
}

export interface WildlifeRepresentativeIndividualization {
  nextInitialOrdinaryCount:number;
  nextFixedWeight:number;
}

export function individualizeWildlifeRepresentative(
  initialOrdinaryCount:number,
  existingFixedWeight:number,
  countedInInitialOrdinary=true
):WildlifeRepresentativeIndividualization|undefined {
  const ordinary=Math.max(0,Math.floor(initialOrdinaryCount));
  const fixed=Math.max(0,existingFixedWeight);
  if(fixed>1.0001)return undefined;
  if(fixed>0)return {nextInitialOrdinaryCount:ordinary,nextFixedWeight:1};
  if(!countedInInitialOrdinary)return {nextInitialOrdinaryCount:ordinary,nextFixedWeight:1};
  if(ordinary<=0)return undefined;
  return {nextInitialOrdinaryCount:ordinary-1,nextFixedWeight:1};
}

export function wildlifeDomesticationInteractions(
  animal:Pick<WildlifeState,'species'|'domestication'|'representedPopulation'>,
  ownerKind:WildlifeDomesticationOwnerKind='player',
  ownerId='player'
):WildlifeDomesticationInteraction[] {
  const actions:WildlifeDomesticationInteraction[]=['inspect'];
  const current=normalizeWildlifeDomestication(animal.species,animal.domestication);
  if(!current)return actions;
  if(current.stage!=='bonded'){
    if((animal.representedPopulation||1)<=1.0001)actions.push('feed_tame');
    return actions;
  }
  if(current.ownerKind===ownerKind&&current.ownerId===ownerId){
    actions.push('command_follow','command_stay','command_graze','release');
  }
  return actions;
}

export function domesticationCommandAllowedActions(
  species:WildlifeSpecies,
  value:WildlifeDomesticationState|undefined,
  actions:readonly WildlifeAction[]
):WildlifeAction[] {
  const current=normalizeWildlifeDomestication(species,value);
  if(current?.stage!=='bonded'||current.command==='autonomous')return [...actions];
  const feeding=wildlifeSpeciesProfile(species).feedingAction;
  const allowed=new Set<WildlifeAction>(['flee','drink','rest',feeding]);
  if(current.command==='follow')allowed.add('wander');
  return actions.filter(action=>allowed.has(action));
}

export function domesticationPreservesSurvivalAction(
  animal:Pick<WildlifeState,'hunger'|'thirst'|'energy'|'health'|'diseaseLoad'>,
  action:WildlifeAction
) {
  if(action==='flee')return true;
  if(action==='drink')return animal.thirst>=68;
  if(action==='graze'||action==='forage')return animal.hunger>=68;
  if(action==='rest')return animal.energy<=32||animal.health<50||(animal.diseaseLoad||0)>=58;
  return false;
}
