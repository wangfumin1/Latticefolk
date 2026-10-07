import type {CoarseChunkState,Mood,WorldRandomness} from '../types.js';
import {BUILDINGS,familyNames,fineResidentCount,fineWildlifeCount,givenNames,inventoryFor,roleFor,
  type FineResidentPlan,type FineWildlifePlan,type SettlementArchetype} from './materialization.js';
import {layoutIdentity,type StreamedLayout} from './streamedLayouts.js';
import {STREAMED_UNIT_COARSE_SIZE} from './streamedUnits.js';
import {keyedRandom,readWorldRandomness} from './worldRandom.js';
import {wildlifeSpeciesProfile} from './wildlifeSpecies.js';

export const ACTOR_GENERATION_VERSION=1;

/** Missing legacy metadata always selects v1, even after other algorithms exist. */
export function readActorGenerationVersion(value:unknown):1 {
  if(value===undefined||value===1)return 1;
  throw new Error('Unsupported actor generation version');
}

function layoutArchetype(layout:StreamedLayout,owner:string):SettlementArchetype {
  const entries=[...layout.objects,...layout.roads].sort((a,b)=>a.id.localeCompare(b.id));
  const tagged=(local:boolean)=>entries.filter(entry=>!local||entry.ownerCellId===owner)
    .flatMap(entry=>entry.tags).find(tag=>Object.hasOwn(BUILDINGS,tag)) as SettlementArchetype|undefined;
  return tagged(true)??tagged(false)??(layout.buildings.length?'farmstead':'wilderness');
}

/** Mutable coarse values select membership only. Surviving slots keep their descriptors. */
export function projectFineActors(chunk:CoarseChunkState,layout:StreamedLayout,randomness:WorldRandomness):{
  archetype:SettlementArchetype;residents:FineResidentPlan[];wildlife:FineWildlifePlan[]
} {
  const authority=readWorldRandomness(randomness);
  if(layout.version!==1||layout.seed!==authority.seed||chunk.id!==`chunk_${chunk.cx}_${chunk.cz}`||!layout.ownerCellIds.includes(chunk.id))throw new Error('Actor layout does not own this world cell');
  const identity=layoutIdentity(layout),archetype=layoutArchetype(layout,chunk.id);
  const source=(id:string,domain:string)=>keyedRandom(authority,'actor-generation',ACTOR_GENERATION_VERSION,identity,id,domain);
  const centerX=chunk.cx*STREAMED_UNIT_COARSE_SIZE,centerZ=chunk.cz*STREAMED_UNIT_COARSE_SIZE;
  const level=layout.buildings.length>=3?2:layout.buildings.length?1:0;
  const biome=archetype==='timber_camp'?'forest':archetype==='wetland_hamlet'?'wetlands':archetype==='quarry_outpost'?'hills':'plains';
  const residents:FineResidentPlan[]=[],wildlife:FineWildlifePlan[]=[];
  for(let i=0;i<fineResidentCount(chunk);i++){
    const id=`${chunk.id}_npc_${String(i).padStart(2,'0')}`,random=source(id,'identity'),position=source(id,'anchor');
    const role=roleFor(i,level,biome,archetype),angle=position()*Math.PI*2,radius=3+position()*6;
    residents.push({id,name:`${familyNames[Math.floor(random()*familyNames.length)]}${givenNames[Math.floor(random()*givenNames.length)]}`,
      role,x:centerX+Math.cos(angle)*radius,z:centerZ+Math.sin(angle)*radius,
      mood:(['calm','neutral','curious','happy'] as Mood[])[Math.floor(random()*4)]!,
      inventory:inventoryFor(role),characterAsset:['female1','female2','male1','male2'][i%4]!});
  }
  for(const population of [...(chunk.wildlife||[])].sort((a,b)=>a.species.localeCompare(b.species))){
    const base=wildlifeSpeciesProfile(population.species).fine;
    for(let i=0;i<fineWildlifeCount(population);i++){
      const id=`${chunk.id}_wild_${population.species}_${i}`,random=source(id,'identity'),position=source(id,'anchor'),traits=source(id,'traits');
      const variance=(amount:number)=>amount*(.88+traits()*.24);
      wildlife.push({id,species:population.species,x:centerX+(position()-.5)*(STREAMED_UNIT_COARSE_SIZE-3),z:centerZ+(position()-.5)*(STREAMED_UNIT_COARSE_SIZE-3),
        ageDays:Math.floor(20+random()*base.maxInitialAge),sex:random()>.5?'female':'male',generation:0,
        traits:{speed:variance(base.speed),size:variance(base.size),fertility:Math.min(1,variance(base.fertility)),wariness:Math.min(1,variance(base.wariness))}});
    }
  }
  return {archetype,residents,wildlife};
}
