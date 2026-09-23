import type {
  WildlifeDomesticationCommand,
  WildlifeDomesticationState,
  WildlifeSpecies,
  WildlifeState
} from '../types.js';
import { wildlifeSpeciesProfile } from './wildlifeSpecies.js';

export const WILDLIFE_TAME_THRESHOLD=100;
export const WILDLIFE_TAME_FEED_STEP=25;

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const finiteDay=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:undefined;
const commands:readonly WildlifeDomesticationCommand[]=['none','follow','stay','graze'];

export function isWildlifeDomesticationEligible(species:WildlifeSpecies){
  return wildlifeSpeciesProfile(species).form.kind==='domesticated';
}

export function normalizeWildlifeDomestication(
  species:WildlifeSpecies,
  value?:WildlifeDomesticationState
):WildlifeDomesticationState|undefined {
  if(!isWildlifeDomesticationEligible(species))return undefined;
  const rawProgress=typeof value?.tameProgress==='number'&&Number.isFinite(value.tameProgress)?value.tameProgress:0;
  const tameProgress=clamp(rawProgress,0,WILDLIFE_TAME_THRESHOLD);
  const rawOwner=typeof value?.ownerId==='string'&&value.ownerId.trim()?value.ownerId.trim():undefined;
  const ownerId=tameProgress>=WILDLIFE_TAME_THRESHOLD?rawOwner:undefined;
  const requestedCommand=value?.command;
  const command=ownerId&&requestedCommand&&commands.includes(requestedCommand)?requestedCommand:'none';
  return {
    tameProgress:ownerId?WILDLIFE_TAME_THRESHOLD:tameProgress,
    ownerId,
    command,
    breedingAllowed:Boolean(ownerId&&value?.breedingAllowed),
    claimedDay:ownerId?finiteDay(value?.claimedDay):undefined,
    lastInteractionDay:finiteDay(value?.lastInteractionDay)
  };
}

export interface WildlifeTamingFeedResult {
  state:WildlifeDomesticationState|undefined;
  applied:boolean;
  claimed:boolean;
  reason:'applied'|'ineligible'|'owned_by_other'|'already_owned';
}

export function feedWildlifeForTaming(
  species:WildlifeSpecies,
  current:WildlifeDomesticationState|undefined,
  ownerId:string,
  currentDay:number,
  feedUnits=1
):WildlifeTamingFeedResult {
  const state=normalizeWildlifeDomestication(species,current);
  if(!state)return {state:undefined,applied:false,claimed:false,reason:'ineligible'};
  if(state.ownerId&&state.ownerId!==ownerId)return {state,applied:false,claimed:false,reason:'owned_by_other'};
  if(state.ownerId===ownerId)return {state,applied:false,claimed:false,reason:'already_owned'};
  const amount=Math.max(1,Math.floor(feedUnits));
  const tameProgress=clamp(state.tameProgress+WILDLIFE_TAME_FEED_STEP*amount,0,WILDLIFE_TAME_THRESHOLD);
  const claimed=tameProgress>=WILDLIFE_TAME_THRESHOLD;
  return {
    state:{
      ...state,
      tameProgress,
      ownerId:claimed?ownerId:undefined,
      command:'none',
      breedingAllowed:false,
      claimedDay:claimed?currentDay:undefined,
      lastInteractionDay:currentDay
    },
    applied:true,
    claimed,
    reason:'applied'
  };
}

export function setWildlifeDomesticationCommand(
  species:WildlifeSpecies,
  current:WildlifeDomesticationState|undefined,
  ownerId:string,
  command:WildlifeDomesticationCommand,
  currentDay:number
):WildlifeDomesticationState|undefined {
  const state=normalizeWildlifeDomestication(species,current);
  if(!state||state.ownerId!==ownerId||state.tameProgress<WILDLIFE_TAME_THRESHOLD)return undefined;
  if(!commands.includes(command))return undefined;
  return {...state,command,lastInteractionDay:currentDay};
}

export function setWildlifeBreedingPermission(
  species:WildlifeSpecies,
  current:WildlifeDomesticationState|undefined,
  ownerId:string,
  breedingAllowed:boolean,
  currentDay:number
):WildlifeDomesticationState|undefined {
  const state=normalizeWildlifeDomestication(species,current);
  if(!state||state.ownerId!==ownerId||state.tameProgress<WILDLIFE_TAME_THRESHOLD)return undefined;
  return {...state,breedingAllowed,lastInteractionDay:currentDay};
}

export function wildlifeBreedingAllowed(state:WildlifeState){
  const domestication=normalizeWildlifeDomestication(state.species,state.domestication);
  return !domestication?.ownerId||domestication.breedingAllowed;
}

export function wildlifePairBreedingAllowed(a:WildlifeState,b:WildlifeState){
  const left=normalizeWildlifeDomestication(a.species,a.domestication);
  const right=normalizeWildlifeDomestication(b.species,b.domestication);
  const leftOwner=left?.ownerId;
  const rightOwner=right?.ownerId;
  if(!leftOwner&&!rightOwner)return true;
  return Boolean(leftOwner&&rightOwner&&leftOwner===rightOwner&&left?.breedingAllowed&&right?.breedingAllowed);
}

export function inheritedWildlifeDomestication(
  species:WildlifeSpecies,
  mother:WildlifeDomesticationState|undefined,
  father:WildlifeDomesticationState|undefined,
  birthDay:number
):WildlifeDomesticationState|undefined {
  const m=normalizeWildlifeDomestication(species,mother);
  const f=normalizeWildlifeDomestication(species,father);
  if(!m?.ownerId||m.ownerId!==f?.ownerId||!m.breedingAllowed||!f.breedingAllowed)return undefined;
  return {
    tameProgress:WILDLIFE_TAME_THRESHOLD,
    ownerId:m.ownerId,
    command:'none',
    breedingAllowed:false,
    claimedDay:birthDay
  };
}

export function wildlifeHasActiveOwnerCommand(state:WildlifeState){
  const domestication=normalizeWildlifeDomestication(state.species,state.domestication);
  return Boolean(domestication?.ownerId&&domestication.command!=='none');
}
