import type {CoarseChunkState,NpcState,PersistedWildlifeTransfer,Vec2,WildlifeLineageRecord,WildlifeSpecies,WildlifeState,WorldRandomness} from '../types.js';
import type {StreamedLayout} from './streamedLayouts.js';
import {projectFineActors} from './actorGeneration.js';
import {findActorSpawn,pendingEntryPosition,wildlifeBodyRadius,type ActorContact} from './actorPlacement.js';
import {NPC_BODY_RADIUS} from './characterContact.js';
import {keyedRandom} from './worldRandom.js';

export interface PendingActorEntry {transfer:PersistedWildlifeTransfer;weight:number;position:Vec2;}
export function selectPendingActors(chunk:CoarseChunkState,transfers:readonly PersistedWildlifeTransfer[],lineage:ReadonlyMap<string,WildlifeLineageRecord>,fixed:ReadonlyMap<string,number>=new Map()) {
  const remaining=new Map((chunk.wildlife||[]).map(population=>[population.species,Math.max(0,population.count)]));
  for(const [id,weight] of fixed){
    const species=lineage.get(id)?.species;if(species)remaining.set(species,Math.max(0,(remaining.get(species)||0)-weight));
  }
  const selected:Array<{transfer:PersistedWildlifeTransfer;weight:number}>=[];
  for(const transfer of [...transfers].filter(t=>t.toChunkId===chunk.id).sort((a,b)=>a.transferredDay-b.transferredDay||a.entityId.localeCompare(b.entityId))){
    if(lineage.get(transfer.entityId)?.deathDay!==undefined)continue;
    const species=transfer.state.species,weight=Math.min(Math.max(0,transfer.representedPopulation),remaining.get(species)||0);
    if(weight<=.01)continue;
    selected.push({transfer,weight});remaining.set(species,(remaining.get(species)||0)-weight);
  }
  return selected;
}

/** Pure preflight: a first owner is activated only when its whole founding batch can fit. */
export function prepareFirstActors(chunk:CoarseChunkState,layout:StreamedLayout,randomness:WorldRandomness,day:number,
  transfers:readonly PersistedWildlifeTransfer[],lineage:ReadonlyMap<string,WildlifeLineageRecord>,contact:ActorContact) {
  const plan=projectFineActors(chunk,layout,randomness),npcs:Array<{state:NpcState;asset:string}>=[],wildlife:WildlifeState[]=[],pending:PendingActorEntry[]=[];
  const local={...contact,dynamic:[...contact.dynamic]};
  for(const p of plan.residents){
    const position=findActorSpawn({x:p.x,z:p.z},chunk,NPC_BODY_RADIUS,local,p.characterAsset);
    if(!position)return undefined;
    const random=keyedRandom(randomness,'fine-npc',p.id);
    const state:NpcState={id:p.id,chunkId:chunk.id,name:p.name,role:p.role,position,home:{...position},
      mood:p.mood,hunger:25+random()*24,energy:62+random()*28,social:42+random()*32,
      money:Math.max(2,Math.round(3+chunk.prosperity/7)),inventory:structuredClone(p.inventory),
      relationships:{},memories:[],currentAction:'idle',goal:'在这里生活并照顾自己的日常需要',lastDecisionAt:0};
    npcs.push({state,asset:p.characterAsset});
    local.dynamic.push({id:`npc:${state.id}`,x:position.x,z:position.z,radius:NPC_BODY_RADIUS});
  }
  const selected=selectPendingActors(chunk,transfers,lineage),incomingIds=new Set(transfers.map(transfer=>transfer.entityId));
  const selectedIds=new Set(selected.map(entry=>entry.transfer.entityId));
  const replacements=new Map<WildlifeSpecies,number>();
  for(const {transfer} of selected)replacements.set(transfer.state.species,(replacements.get(transfer.state.species)||0)+1);
  for(const p of plan.wildlife)if(selectedIds.has(p.id))replacements.set(p.species,Math.max(0,(replacements.get(p.species)||0)-1));
  for(const p of plan.wildlife){
    // Queued authority owns its ID even when this owner cannot admit it yet.
    if(incomingIds.has(p.id))continue;
    const replacement=replacements.get(p.species)||0;
    if(replacement){replacements.set(p.species,replacement-1);continue;}
    if(lineage.get(p.id)?.deathDay!==undefined)continue;
    const population=chunk.wildlife?.find(row=>row.species===p.species),random=keyedRandom(randomness,'fine-wildlife',p.id);
    const state:WildlifeState={id:p.id,chunkId:chunk.id,species:p.species,position:{x:p.x,z:p.z},ageDays:p.ageDays,
      health:Math.max(0,Math.min(100,(population?.health??82)+(random()-.5)*8)),hunger:20+random()*28,thirst:18+random()*30,energy:62+random()*28,
      diseaseLoad:population?.diseaseLoad??0,sex:p.sex,generation:p.generation,traits:structuredClone(p.traits),currentAction:'wander',
      lastDecisionAt:0,birthDay:Math.max(1,day-Math.floor(p.ageDays))};
    const position=findActorSpawn(state.position,chunk,wildlifeBodyRadius(state),contact);
    if(!position)return undefined;
    state.position=position;wildlife.push(state);
  }
  for(const entry of selected){
    const position=pendingEntryPosition(entry.transfer.state,chunk,randomness,contact);
    if(!position)return undefined;
    pending.push({...entry,position});
  }
  return {archetype:plan.archetype,npcs,wildlife,pending};
}
