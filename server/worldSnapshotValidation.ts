import type { WorldPersistenceSnapshot } from '../src/types.js';

export type WorldSnapshotValidationIssue={path:string;message:string};

export const WORLD_SNAPSHOT_LIMITS={
  serializedBytes:48*1024*1024,coarseChunks:100_000,fineChunks:4_096,homeNpcs:2_048,
  homeObjects:16_384,fineNpcs:4_096,fineObjects:16_384,fineWildlife:8_192,lineage:250_000,
  transfers:32_768,issues:64
} as const;

export class WorldSnapshotValidationError extends Error{
  readonly issues:WorldSnapshotValidationIssue[];
  constructor(issues:WorldSnapshotValidationIssue[]){
    super(issues.map(x=>x.path+': '+x.message).join('; ')||'Invalid world persistence payload');
    this.name='WorldSnapshotValidationError';this.issues=issues;
  }
}

type Obj=Record<string,unknown>;
const sets={
  npcRole:new Set(['farmer','baker','shopkeeper','guard','maker','resident']),
  mood:new Set(['happy','calm','neutral','sad','annoyed','curious','tired']),
  action:new Set(['idle','wander','talk','work','rest','eat','pickup','use_object','inspect','drop_item','harvest','craft','trade','gift','deliver','fetch_water','patrol','visit','sleep','explore']),
  object:new Set(['bed','bench','workstation','food_stall','tree','crate','well','water_patch','farm_plot','building','road','bush','rock','flower','cart','tool_prop','dropped_item']),
  capability:new Set(['inspect','rest','sit','sleep','draw_water','drink','wash','harvest','forage','chop','mine','craft','work','buy','sell','trade','store','take','load','unload','pickup','visit']),
  item:new Set(['apple','bread','wood','coin','flower','grain','flour','water','stone','plank','tool']),
  biome:new Set(['plains','forest','hills','wetlands','dryland']),
  strategy:new Set(['sustain','grow_settlement','conserve','extract_resources','fortify','trade_route']),
  migration:new Set(['attract','retain','release','evacuate']),
  ecology:new Set(['recover','balance','harvest','protect']),
  species:new Set(['rabbit','deer','boar','goat','fox','wolf','badger','lynx','bison','raccoon','sheep','warg']),
  wildlifeAction:new Set(['graze','forage','drink','rest','flee','hunt','wander','seek_mate','migrate']),
  sex:new Set(['female','male']),command:new Set(['none','follow','stay','graze']),
  provenance:new Set(['birth','founder_seed','legacy_upgrade']),
  death:new Set(['predation','starvation','dehydration','disease','senescence','other']),
  migrationReason:new Set(['behavioral_migration','owner_follow']),
  family:new Set(['lagomorph','cervid','suiform','caprine','canid','mustelid','felid','bovid','procyonid'])
};

class V{
  issues:WorldSnapshotValidationIssue[]=[];
  bad(path:string,message:string){if(this.issues.length<WORLD_SNAPSHOT_LIMITS.issues)this.issues.push({path,message});}
  obj(x:unknown,p:string):Obj|undefined{if(!x||typeof x!=='object'||Array.isArray(x)){this.bad(p,'must be an object');return;}return x as Obj;}
  arr(x:unknown,p:string,max:number,opt=false):unknown[]|undefined{
    if(x===undefined&&opt)return;if(!Array.isArray(x)){this.bad(p,'must be an array');return;}
    if(x.length>max)this.bad(p,'exceeds '+max+' entries');return x;
  }
  str(x:unknown,p:string,opt=false):string|undefined{
    if(x===undefined&&opt)return;if(typeof x!=='string'||!x.length){this.bad(p,'must be a non-empty string');return;}
    if(x.length>16384)this.bad(p,'string is too long');return x;
  }
  num(x:unknown,p:string,opt:{optional?:boolean,min?:number,int?:boolean,positive?:boolean}={}):number|undefined{
    if(x===undefined&&opt.optional)return;if(typeof x!=='number'||!Number.isFinite(x)){this.bad(p,'must be a finite number');return;}
    if(opt.int&&!Number.isInteger(x))this.bad(p,'must be an integer');
    if(opt.min!==undefined&&x<opt.min)this.bad(p,'must be >= '+opt.min);
    if(opt.positive&&x<=0)this.bad(p,'must be > 0');return x;
  }
  bool(x:unknown,p:string,opt=false){if(x===undefined&&opt)return;if(typeof x!=='boolean')this.bad(p,'must be a boolean');}
  en(x:unknown,p:string,s:Set<string>,opt=false):string|undefined{
    if(x===undefined&&opt)return;if(typeof x!=='string'||!s.has(x)){this.bad(p,'unsupported value');return;}return x;
  }
  uniq(x:string|undefined,p:string,s:Set<string>,label:string){if(!x)return;if(s.has(x))this.bad(p,'duplicate '+label+' '+x);else s.add(x);}
}

const vec=(v:V,x:unknown,p:string)=>{const o=v.obj(x,p);if(o){v.num(o.x,p+'.x');v.num(o.z,p+'.z');}};
const traits=(v:V,x:unknown,p:string)=>{const o=v.obj(x,p);if(o)for(const k of ['speed','size','fertility','wariness'])v.num(o[k],p+'.'+k,{min:0});};
const finiteMap=(v:V,x:unknown,p:string,opt=false)=>{if(x===undefined&&opt)return;const o=v.obj(x,p);if(o)for(const [k,n]of Object.entries(o))v.num(n,p+'.'+k,{min:0});};
const phenotype=(v:V,x:unknown,p:string)=>{
  const o=v.obj(x,p);if(!o)return;
  const m=v.obj(o.morphology,p+'.morphology');if(m)for(const k of ['bodyLength','bodyHeight','legLength','headScale','tailScale'])v.num(m[k],p+'.morphology.'+k,{positive:true});
  const b=v.obj(o.behavior,p+'.behavior');if(b)for(const k of ['forageDrive','migrationDrive','riskTolerance','recoveryDrive'])v.num(b[k],p+'.behavior.'+k,{min:0});
};
const genome=(v:V,x:unknown,p:string)=>{
  const o=v.obj(x,p);if(!o)return;v.en(o.family,p+'.family',sets.family);
  for(const [name,keys]of [['material',['hueShift','lightnessShift','accentShift']],['niche',['grass','shrub','fruit','crop']],['locomotion',['stride','endurance']]]as const){
    const s=v.obj(o[name],p+'.'+name);if(s)for(const k of keys)v.num(s[k],p+'.'+name+'.'+k);
  }
};
const domestication=(v:V,x:unknown,p:string)=>{const o=v.obj(x,p);if(!o)return;v.num(o.tameProgress,p+'.tameProgress',{min:0});v.en(o.command,p+'.command',sets.command);v.bool(o.breedingAllowed,p+'.breedingAllowed');v.str(o.ownerId,p+'.ownerId',true);v.num(o.claimedDay,p+'.claimedDay',{optional:true,min:0});v.num(o.lastInteractionDay,p+'.lastInteractionDay',{optional:true,min:0});};
const inventory=(v:V,x:unknown,p:string,all=false)=>{
  const o=v.obj(x,p);if(!o)return;for(const [k,n]of Object.entries(o))v.num(n,p+'.'+k,{min:0,int:true});
  if(all)for(const k of sets.item)if(!(k in o))v.bad(p+'.'+k,'is required');
};
const itemArray=(v:V,x:unknown,p:string)=>{
  v.arr(x,p,1024)?.forEach((e,i)=>{const o=v.obj(e,p+'['+i+']');if(o){v.en(o.kind,p+'['+i+'].kind',sets.item);v.num(o.count,p+'['+i+'].count',{min:0,int:true});}});
};

function npc(v:V,x:unknown,p:string,ids:Set<string>){
  const o=v.obj(x,p);if(!o)return;const id=v.str(o.id,p+'.id');v.uniq(id,p+'.id',ids,'NPC id');
  v.str(o.chunkId,p+'.chunkId',true);v.str(o.name,p+'.name');v.en(o.role,p+'.role',sets.npcRole);vec(v,o.position,p+'.position');vec(v,o.home,p+'.home');
  v.str(o.workAt,p+'.workAt',true);v.en(o.mood,p+'.mood',sets.mood);
  for(const k of ['hunger','energy','social','money'])v.num(o[k],p+'.'+k,{min:0});
  itemArray(v,o.inventory,p+'.inventory');
  const rel=v.obj(o.relationships,p+'.relationships');if(rel)for(const [id2,r]of Object.entries(rel)){const q=v.obj(r,p+'.relationships.'+id2);if(q)for(const k of ['affinity','trust','familiarity'])v.num(q[k],p+'.relationships.'+id2+'.'+k);}
  v.arr(o.memories,p+'.memories',4096)?.forEach((e,i)=>{const m=v.obj(e,p+'.memories['+i+']');if(m){v.str(m.id,p+'.memories['+i+'].id');v.num(m.at,p+'.memories['+i+'].at',{min:0});v.str(m.summary,p+'.memories['+i+'].summary');v.num(m.importance,p+'.memories['+i+'].importance');}});
  v.en(o.currentAction,p+'.currentAction',sets.action);v.str(o.targetNpcId,p+'.targetNpcId',true);v.str(o.targetObjectId,p+'.targetObjectId',true);v.str(o.goal,p+'.goal');v.num(o.lastDecisionAt,p+'.lastDecisionAt',{min:0});v.str(o.lastDialogue,p+'.lastDialogue',true);
}
function objectState(v:V,x:unknown,p:string,ids:Set<string>){
  const o=v.obj(x,p);if(!o)return;const id=v.str(o.id,p+'.id');v.uniq(id,p+'.id',ids,'object id');
  v.str(o.chunkId,p+'.chunkId',true);v.en(o.kind,p+'.kind',sets.object);v.str(o.name,p+'.name');vec(v,o.position,p+'.position');
  const tags=v.arr(o.tags,p+'.tags',4096);tags?.forEach((t,i)=>v.str(t,p+'.tags['+i+']'));v.bool(o.usable,p+'.usable');v.bool(o.pickupable,p+'.pickupable');
  if(o.rigidBodyArchetype!==undefined&&o.rigidBodyArchetype!=='cart')v.bad(p+'.rigidBodyArchetype','unsupported rigid body archetype');
  v.bool(o.movable,p+'.movable',true);v.num(o.physicsRadius,p+'.physicsRadius',{optional:true,positive:true});v.en(o.item,p+'.item',sets.item,true);
  if(o.capabilities!==undefined)v.arr(o.capabilities,p+'.capabilities',128)?.forEach((c,i)=>v.en(c,p+'.capabilities['+i+']',sets.capability));
  if(o.storage!==undefined)itemArray(v,o.storage,p+'.storage');
  const amount=v.num(o.resourceAmount,p+'.resourceAmount',{optional:true,min:0}),capacity=v.num(o.resourceCapacity,p+'.resourceCapacity',{optional:true,min:0});
  if(amount!==undefined&&capacity!==undefined&&amount>capacity)v.bad(p+'.resourceAmount','must not exceed resourceCapacity');
  v.num(o.respawnAt,p+'.respawnAt',{optional:true,min:0});v.str(o.occupiedBy,p+'.occupiedBy',true);
}
function wildlife(v:V,x:unknown,p:string,ids:Set<string>){
  const o=v.obj(x,p);if(!o)return;const id=v.str(o.id,p+'.id');v.uniq(id,p+'.id',ids,'wildlife id');
  v.str(o.chunkId,p+'.chunkId');v.en(o.species,p+'.species',sets.species);vec(v,o.position,p+'.position');
  for(const k of ['ageDays','health','hunger','thirst','energy'])v.num(o[k],p+'.'+k,{min:0});
  v.en(o.sex,p+'.sex',sets.sex);v.num(o.generation,p+'.generation',{min:0,int:true});traits(v,o.traits,p+'.traits');
  if(o.phenotype!==undefined)phenotype(v,o.phenotype,p+'.phenotype');if(o.organismGenome!==undefined)genome(v,o.organismGenome,p+'.organismGenome');if(o.domestication!==undefined)domestication(v,o.domestication,p+'.domestication');
  v.en(o.currentAction,p+'.currentAction',sets.wildlifeAction);for(const k of ['targetObjectId','targetWildlifeId','targetChunkId','motherId','fatherId','pregnantById'])v.str(o[k],p+'.'+k,true);
  v.num(o.lastDecisionAt,p+'.lastDecisionAt',{min:0});v.num(o.birthDay,p+'.birthDay',{min:0});for(const k of ['diseaseLoad','pregnantUntilDay','lastBirthDay'])v.num(o[k],p+'.'+k,{optional:true,min:0});v.num(o.representedPopulation,p+'.representedPopulation',{optional:true,positive:true});
  if(id&&(o.motherId===id||o.fatherId===id||o.pregnantById===id||o.targetWildlifeId===id))v.bad(p,'wildlife may not reference itself');
}
function pressure(v:V,x:unknown,p:string,kind:'competition'|'disease'|'predator'){
  const o=v.obj(x,p);if(!o)return;
  for(const k of Object.keys(o))if(k.endsWith('Pressure')&&typeof o[k]!=='object')v.num(o[k],p+'.'+k,{min:0});
  for(const k of ['speciesPressure','localContactPressure','crossSpeciesPressure','importedPressure'])if(o[k]!==undefined)finiteMap(v,o[k],p+'.'+k);
  if(o.meanPressure!==undefined)v.num(o.meanPressure,p+'.meanPressure',{min:0});
  const pair=(e:unknown,q:string)=>{const r=v.obj(e,q);if(!r)return;
    if(kind==='competition'){v.en(r.speciesA,q+'.speciesA',sets.species);v.en(r.speciesB,q+'.speciesB',sets.species);v.num(r.nicheOverlap,q+'.nicheOverlap',{min:0});}
    else if(kind==='disease'){v.en(r.fromSpecies,q+'.fromSpecies',sets.species);v.en(r.toSpecies,q+'.toSpecies',sets.species);}
    else{v.en(r.predatorSpecies,q+'.predatorSpecies',sets.species);v.en(r.preySpecies,q+'.preySpecies',sets.species);}
    v.num(r.pressure,q+'.pressure',{min:0});
  };
  if(o.pairs!==undefined)v.arr(o.pairs,p+'.pairs',1024)?.forEach((e,i)=>pair(e,p+'.pairs['+i+']'));if(o.strongestPair!==undefined)pair(o.strongestPair,p+'.strongestPair');
}
function coarse(v:V,x:unknown,p:string,ids:Set<string>,coords:Set<string>){
  const o=v.obj(x,p);if(!o)return;const id=v.str(o.id,p+'.id');v.uniq(id,p+'.id',ids,'coarse chunk id');
  const cx=v.num(o.cx,p+'.cx',{int:true}),cz=v.num(o.cz,p+'.cz',{int:true});if(cx!==undefined&&cz!==undefined)v.uniq(cx+','+cz,p,coords,'coarse coordinate');
  v.en(o.biome,p+'.biome',sets.biome);for(const k of ['settlementLevel','population','food','wood','water','ecology','danger','prosperity'])v.num(o[k],p+'.'+k,{min:0});
  v.en(o.strategy,p+'.strategy',sets.strategy);v.en(o.migrationPolicy,p+'.migrationPolicy',sets.migration);v.en(o.ecologyPolicy,p+'.ecologyPolicy',sets.ecology);v.num(o.lastDecisionAt,p+'.lastDecisionAt',{min:0});v.num(o.decisionVersion,p+'.decisionVersion',{min:0,int:true});
  if(o.plants!==undefined){const r=v.obj(o.plants,p+'.plants');if(r)for(const k of ['grass','shrub','fruit','crop'])v.num(r[k],p+'.plants.'+k,{min:0});}
  if(o.trophicFlux!==undefined){const r=v.obj(o.trophicFlux,p+'.trophicFlux');if(r)for(const k of ['primaryProduction','herbivory','predation','mortalityReturn'])v.num(r[k],p+'.trophicFlux.'+k,{min:0});}
  if(o.nicheCompetition!==undefined)pressure(v,o.nicheCompetition,p+'.nicheCompetition','competition');if(o.wildlifeDisease!==undefined)pressure(v,o.wildlifeDisease,p+'.wildlifeDisease','disease');if(o.wildlifePredatorPressure!==undefined)pressure(v,o.wildlifePredatorPressure,p+'.wildlifePredatorPressure','predator');
  if(o.wildlife!==undefined){const seen=new Set<string>();v.arr(o.wildlife,p+'.wildlife',sets.species.size)?.forEach((e,i)=>{const r=v.obj(e,p+'.wildlife['+i+']');if(!r)return;const s=v.en(r.species,p+'.wildlife['+i+'].species',sets.species);v.uniq(s,p+'.wildlife['+i+'].species',seen,'species');for(const k of ['count','carryingCapacity','health'])v.num(r[k],p+'.wildlife['+i+'].'+k,{min:0});for(const k of ['diseaseLoad','competitionPressure','importedDiseasePressure','predatorPressure'])v.num(r[k],p+'.wildlife['+i+'].'+k,{optional:true,min:0});});}
}
function habitat(v:V,x:unknown,p:string){
  const o=v.obj(x,p);if(!o)return;v.en(o.biome,p+'.biome',sets.biome);for(const k of ['ecology','food','water','danger','settlementLevel','plantBiomass'])v.num(o[k],p+'.'+k,{min:0});for(const k of ['competitionPressure','seasonalSuitability','diseasePressure','predatorPressure'])v.num(o[k],p+'.'+k,{optional:true,min:0});
}
function lineage(v:V,x:unknown,p:string,ids:Set<string>){
  const o=v.obj(x,p);if(!o)return;const id=v.str(o.entityId,p+'.entityId');v.uniq(id,p+'.entityId',ids,'lineage id');v.en(o.species,p+'.species',sets.species);
  const mother=v.str(o.motherId,p+'.motherId',true),father=v.str(o.fatherId,p+'.fatherId',true);if(id&&(mother===id||father===id))v.bad(p,'lineage entity may not be its own parent');
  const birth=v.num(o.birthDay,p+'.birthDay',{min:0}),death=v.num(o.deathDay,p+'.deathDay',{optional:true,min:0});if(birth!==undefined&&death!==undefined&&death<birth)v.bad(p+'.deathDay','must be >= birthDay');
  v.en(o.deathReason,p+'.deathReason',sets.death,true);v.num(o.generation,p+'.generation',{min:0,int:true});v.str(o.birthChunk,p+'.birthChunk');v.str(o.deathChunk,p+'.deathChunk',true);traits(v,o.traitsAtBirth,p+'.traitsAtBirth');if(o.traitsAtDeath!==undefined)traits(v,o.traitsAtDeath,p+'.traitsAtDeath');
  if(o.phenotypeAtBirth!==undefined)phenotype(v,o.phenotypeAtBirth,p+'.phenotypeAtBirth');if(o.phenotypeAtDeath!==undefined)phenotype(v,o.phenotypeAtDeath,p+'.phenotypeAtDeath');v.en(o.phenotypeProvenance,p+'.phenotypeProvenance',sets.provenance,true);
  if(o.organismGenomeAtBirth!==undefined)genome(v,o.organismGenomeAtBirth,p+'.organismGenomeAtBirth');if(o.organismGenomeAtDeath!==undefined)genome(v,o.organismGenomeAtDeath,p+'.organismGenomeAtDeath');v.en(o.organismGenomeProvenance,p+'.organismGenomeProvenance',sets.provenance,true);
  if(o.domesticationAtBirth!==undefined)domestication(v,o.domesticationAtBirth,p+'.domesticationAtBirth');if(o.domesticationAtDeath!==undefined)domestication(v,o.domesticationAtDeath,p+'.domesticationAtDeath');if(o.birthHabitat!==undefined)habitat(v,o.birthHabitat,p+'.birthHabitat');if(o.deathHabitat!==undefined)habitat(v,o.deathHabitat,p+'.deathHabitat');
  if(o.habitatExposure!==undefined){const e=v.obj(o.habitatExposure,p+'.habitatExposure');if(e){v.num(e.observedDays,p+'.habitatExposure.observedDays',{min:0});finiteMap(v,e.biomeDays,p+'.habitatExposure.biomeDays');finiteMap(v,e.chunkDays,p+'.habitatExposure.chunkDays');v.num(e.observedTransitions,p+'.habitatExposure.observedTransitions',{min:0,int:true});}}
  if(o.migrationHistory!==undefined)v.arr(o.migrationHistory,p+'.migrationHistory',32768)?.forEach((e,i)=>{const q=p+'.migrationHistory['+i+']',r=v.obj(e,q);if(!r)return;const from=v.str(r.fromChunkId,q+'.fromChunkId'),to=v.str(r.toChunkId,q+'.toChunkId');if(from&&to&&from===to)v.bad(q,'migration must cross chunks');v.num(r.day,q+'.day',{min:0});v.en(r.fromBiome,q+'.fromBiome',sets.biome);v.en(r.toBiome,q+'.toBiome',sets.biome);v.num(r.representedPopulation,q+'.representedPopulation',{positive:true});v.en(r.reason,q+'.reason',sets.migrationReason);});
  if(o.origin!==undefined&&o.origin!=='founder'&&o.origin!=='reproduction')v.bad(p+'.origin','unsupported value');v.num(o.offspringCount,p+'.offspringCount',{min:0,int:true});v.bool(o.reproductiveSuccess,p+'.reproductiveSuccess');
}
export function validateWorldPersistenceSnapshot(input:unknown):WorldPersistenceSnapshot{
  const v=new V();
  try{const s=JSON.stringify(input);if(s===undefined)v.bad('$','must be JSON-serializable');else if(Buffer.byteLength(s,'utf8')>WORLD_SNAPSHOT_LIMITS.serializedBytes)v.bad('$','payload is too large');}catch{v.bad('$','must be JSON-serializable');}
  const root=v.obj(input,'$');if(!root)throw new WorldSnapshotValidationError(v.issues);if(root.version!==1)v.bad('$.version','must equal 1');
  const meta=v.obj(root.meta,'$.meta');if(meta){v.num(meta.day,'$.meta.day',{min:0});v.num(meta.minuteOfDay,'$.meta.minuteOfDay',{min:0});v.str(meta.weather,'$.meta.weather');vec(v,meta.playerPosition,'$.meta.playerPosition');inventory(v,meta.playerInventory,'$.meta.playerInventory',true);}
  const npcIds=new Set<string>(),objectIds=new Set<string>(),wildlifeIds=new Set<string>(),coarseIds=new Set<string>(),coords=new Set<string>(),fineIds=new Set<string>(),lineageIds=new Set<string>(),transferIds=new Set<string>();
  v.arr(root.coarseChunks,'$.coarseChunks',WORLD_SNAPSHOT_LIMITS.coarseChunks)?.forEach((e,i)=>coarse(v,e,'$.coarseChunks['+i+']',coarseIds,coords));
  v.arr(root.fineChunks,'$.fineChunks',WORLD_SNAPSHOT_LIMITS.fineChunks)?.forEach((e,i)=>{const p='$.fineChunks['+i+']',o=v.obj(e,p);if(!o)return;const id=v.str(o.chunkId,p+'.chunkId');v.uniq(id,p+'.chunkId',fineIds,'fine chunk id');v.arr(o.npcStates,p+'.npcStates',WORLD_SNAPSHOT_LIMITS.fineNpcs)?.forEach((n,j)=>npc(v,n,p+'.npcStates['+j+']',npcIds));v.arr(o.objectStates,p+'.objectStates',WORLD_SNAPSHOT_LIMITS.fineObjects)?.forEach((n,j)=>objectState(v,n,p+'.objectStates['+j+']',objectIds));v.arr(o.wildlifeStates,p+'.wildlifeStates',WORLD_SNAPSHOT_LIMITS.fineWildlife,true)?.forEach((n,j)=>wildlife(v,n,p+'.wildlifeStates['+j+']',wildlifeIds));});
  v.arr(root.homeNpcs,'$.homeNpcs',WORLD_SNAPSHOT_LIMITS.homeNpcs)?.forEach((e,i)=>npc(v,e,'$.homeNpcs['+i+']',npcIds));v.arr(root.homeObjects,'$.homeObjects',WORLD_SNAPSHOT_LIMITS.homeObjects)?.forEach((e,i)=>objectState(v,e,'$.homeObjects['+i+']',objectIds));
  v.arr(root.wildlifeLineage,'$.wildlifeLineage',WORLD_SNAPSHOT_LIMITS.lineage,true)?.forEach((e,i)=>lineage(v,e,'$.wildlifeLineage['+i+']',lineageIds));
  v.arr(root.wildlifeTransfers,'$.wildlifeTransfers',WORLD_SNAPSHOT_LIMITS.transfers,true)?.forEach((e,i)=>{const p='$.wildlifeTransfers['+i+']',o=v.obj(e,p);if(!o)return;const id=v.str(o.entityId,p+'.entityId');v.uniq(id,p+'.entityId',transferIds,'transfer id');const from=v.str(o.fromChunkId,p+'.fromChunkId'),to=v.str(o.toChunkId,p+'.toChunkId');if(from&&to&&from===to)v.bad(p,'transfer must cross chunks');const amount=v.num(o.representedPopulation,p+'.representedPopulation',{positive:true});v.num(o.transferredDay,p+'.transferredDay',{min:0});const local=new Set<string>();wildlife(v,o.state,p+'.state',local);const s=o.state&&typeof o.state==='object'&&!Array.isArray(o.state)?o.state as Obj:undefined;if(s){if(id&&s.id!==id)v.bad(p+'.state.id','must match transfer entityId');if(to&&s.chunkId!==to)v.bad(p+'.state.chunkId','must match transfer toChunkId');if(amount!==undefined&&s.representedPopulation!==amount)v.bad(p+'.state.representedPopulation','must match transfer representedPopulation');}if(id&&wildlifeIds.has(id))v.bad(p+'.entityId','cannot also be materialized in a fine chunk');});
  v.num(root.savedAt,'$.savedAt',{optional:true,min:0});if(v.issues.length)throw new WorldSnapshotValidationError(v.issues);return input as WorldPersistenceSnapshot;
}
