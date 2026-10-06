import {worldObjectRigidBody} from './movablePhysics.js';
import type {CoarseChunkState,InteractionCapability,ItemKind,ObjectKind,PersistedFineChunk,Vec2,WorldObjectState} from '../types.js';
import {BUILDINGS,planFineChunk,type FineBuildingPlan,type FineRoadPlan,type SettlementArchetype} from './materialization.js';
import {streamedUnitAt,streamedUnitOwnerCells,type StreamedUnit} from './streamedUnits.js';

export interface LayoutBuilding extends Omit<FineBuildingPlan,'color'> {
  ownerCellId:string;
  frontage:Vec2;
  provenance:'generated'|'legacy-inferred';
}
export interface LayoutRoad extends FineRoadPlan {ownerCellId:string;provenance:'generated'|'legacy-inferred';}
export interface LayoutObject {
  id:string;ownerCellId:string;kind:ObjectKind;name:string;anchor:Vec2;tags:string[];
  capabilities:InteractionCapability[];item?:ItemKind;asset?:string;height?:number;rotationY:number;
  provenance:'generated'|'legacy-inferred';
}
export interface StreamedLayout {
  version:1;
  unit:StreamedUnit;
  seed:string;
  ownerCellIds:string[];
  buildings:LayoutBuilding[];
  roads:LayoutRoad[];
  objects:LayoutObject[];
}
export interface GeneratedStreamedLayout {
  layout:StreamedLayout;
  /** Initial mutable state is stored with its owner, not in the immutable layout. */
  objectStates:WorldObjectState[];
}

export class StreamedLayoutValidationError extends Error {}
const ownerAt=(p:Vec2)=>`chunk_${Math.floor((p.x+12)/24)}_${Math.floor((p.z+12)/24)}`;
const archetypes=Object.keys(BUILDINGS) as SettlementArchetype[];
const archetypeOf=(saved:PersistedFineChunk)=>saved.objectStates.flatMap(s=>s.tags).find(t=>archetypes.includes(t as SettlementArchetype)) as SettlementArchetype|undefined;

/** Old saves record building frontage, but do not record body dimensions or asset.
 * Prefer the saved archetype/name over the current coarse strategy and keep that
 * inference explicit. The saved frontage itself is never recomputed. */
function legacyBuilding(state:WorldObjectState,ownerCellId:string,archetype?:SettlementArchetype):LayoutBuilding {
  const name=state.name.split(' · ')[0];
  const catalog=archetype?BUILDINGS[archetype]:Object.values(BUILDINGS).flat();
  const index=Number(state.id.match(/_building_(\d+)$/)?.[1]??0);
  const indexed=archetype?catalog[index]:undefined;
  const def=(indexed?.[0]===name?indexed:catalog.find(d=>d[0]===name))??BUILDINGS.farmstead[1];
  const [,asset,w,d,height]=def;
  const rotationY=index<2?0:Math.PI;
  const frontage={...state.position},offset=d/2+1.15;
  return {id:state.id,name:state.name,ownerCellId,asset,w,d,height,rotationY,
    x:frontage.x-Math.sin(rotationY)*offset,z:frontage.z-Math.cos(rotationY)*offset,
    frontage,provenance:'legacy-inferred'};
}

function objectLayout(state:WorldObjectState,ownerCellId:string,provenance:LayoutObject['provenance'],asset?:string,height?:number,rotationY=0):LayoutObject {
  return {id:state.id,ownerCellId,kind:state.kind,name:state.name,anchor:{...state.position},
    tags:[...state.tags],capabilities:[...(state.capabilities||[])],item:state.item,asset,height,rotationY,provenance};
}
function legacyObjectAsset(state:WorldObjectState):{asset?:string;height?:number;rotationY?:number} {
  if(state.kind==='rock')return {asset:'rock',height:1};
  if(state.kind==='bush')return {asset:'bush',height:1};
  if(state.kind==='flower')return {asset:'flowers',height:.8};
  if(state.kind==='tool_prop')return {asset:state.tags.includes('farm')?'shovel':'axe',height:.9};
  if(state.kind==='cart')return {asset:'cart',height:1.3,rotationY:Math.PI/2};
  return {};
}

/** Preserve visited lots and connect the shared edge ports through their free
 * space. Existing narrow streets retain their geometry; new roads do not move
 * resources, stores or buildings to make a straight boulevard fit. */
function connectLegacyRoads(unit:StreamedUnit,buildings:LayoutBuilding[],objects:LayoutObject[],states:readonly WorldObjectState[]):LayoutRoad[]{
  const {minX,maxX,minZ,maxZ}=unit.bounds,center={x:unit.ux*72,z:unit.uz*72};
  const movable=new Set(states.filter(state=>worldObjectRigidBody(state)).map(state=>state.id));
  const occupied=[...buildings.map(b=>({x:b.x,z:b.z,hx:b.w/2,hz:b.d/2})),...objects.filter(o=>!movable.has(o.id)).map(o=>{
    const footprint:Partial<Record<ObjectKind,[number,number]>>={tree:[.8,.8],well:[.7,1],farm_plot:[2,1.35],water_patch:[2.5,1.5],
      workstation:[1.5,1],cart:[1.05,.52],food_stall:[1.15,.6],bench:[1,.35],bed:[1,.5],crate:[.38,.38]};
    const [hx,hz]=footprint[o.kind]||[.45,.45];return{x:o.anchor.x,z:o.anchor.z,hx,hz};
  })];
  const clear=(x:number,z:number)=>!occupied.some(o=>Math.abs(x-o.x)<o.hx+.4&&Math.abs(z-o.z)<o.hz+.4);
  const candidates:Vec2[]=[];for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++)if(clear(x,z))candidates.push({x,z});
  candidates.sort((a,b)=>Math.abs(a.x-center.x)+Math.abs(a.z-center.z)-Math.abs(b.x-center.x)-Math.abs(b.z-center.z)||a.z-b.z||a.x-b.x);
  const goal=candidates[0];if(!goal)throw new StreamedLayoutValidationError('Saved lots leave no road junction');
  const ports=[{side:'west',x:minX,z:center.z},{side:'east',x:maxX,z:center.z},{side:'north',x:center.x,z:minZ},{side:'south',x:center.x,z:maxZ}];
  const result:LayoutRoad[]=[];
  for(const port of ports){
    type Node=Vec2&{cost:number;score:number;parent?:Node};
    const heuristic=(p:Vec2)=>Math.abs(p.x-goal.x)+Math.abs(p.z-goal.z);
    const open:Node[]=[{...port,cost:0,score:heuristic(port)}],best=new Map<string,number>([[`${port.x},${port.z}`,0]]);
    let reached:Node|undefined;
    while(open.length){
      open.sort((a,b)=>a.score-b.score||a.cost-b.cost);const node=open.shift()!;
      if(node.x===goal.x&&node.z===goal.z){reached=node;break;}
      for(const [dx,dz] of [[1,0],[0,1],[-1,0],[0,-1]]){
        const x=node.x+dx,z=node.z+dz,cost=node.cost+1,key=`${x},${z}`;
        if(x<minX||x>maxX||z<minZ||z>maxZ||(best.get(key)??Infinity)<=cost||!clear(x,z)||!clear(node.x+dx*.5,node.z+dz*.5))continue;
        best.set(key,cost);open.push({x,z,cost,score:cost+heuristic({x,z}),parent:node});
      }
    }
    if(!reached)throw new StreamedLayoutValidationError(`Saved lots block the ${port.side} road connection`);
    const path:Vec2[]=[];for(let node:Node|undefined=reached;node;node=node.parent)path.push(node);path.reverse();
    const add=(x:number,z:number,w:number,d:number)=>{
      const x0=Math.max(minX,x-w/2),x1=Math.min(maxX,x+w/2),z0=Math.max(minZ,z-d/2),z1=Math.min(maxZ,z+d/2);
      const position={x:(x0+x1)/2,z:(z0+z1)/2};
      result.push({id:`${unit.id}_link_${port.side}_${result.length}`,ownerCellId:ownerAt(position),name:'聚落连接路',...position,w:x1-x0,d:z1-z0,provenance:'generated',tags:['road','travel','connection']});
    };
    // Clip the shared 4m edge apron into this unit, then follow the saved free space.
    add(port.x,port.z,port.side==='west'||port.side==='east'?.4:4,port.side==='west'||port.side==='east'?4:.4);
    let start=0;
    for(let i=1;i<path.length;i++){
      const a=path[i-1]!,b=path[i]!,next=path[i+1];
      const turns=next&&(b.x-a.x!==next.x-b.x||b.z-a.z!==next.z-b.z);
      const ownerEdge=b.x!==a.x?(b.x+12)%24===0:(b.z+12)%24===0;
      if(next&&!turns&&!ownerEdge)continue;
      const from=path[start]!;add((from.x+b.x)/2,(from.z+b.z)/2,Math.abs(from.x-b.x)+.8,Math.abs(from.z-b.z)+.8);start=i;
    }
  }
  return result;
}

/** One plan spans the whole unit; legacy cells reserve their existing entities first. */
export function createStreamedLayout(ux:number,uz:number,cells:readonly CoarseChunkState[],saved:readonly PersistedFineChunk[],seed='latticefolk-default'):GeneratedStreamedLayout {
  const unit=streamedUnitAt(ux,uz);
  if(unit.isHome)throw new StreamedLayoutValidationError('The authored home unit has no generated layout');
  const owners=streamedUnitOwnerCells(ux,uz),byId=new Map(cells.map(c=>[c.id,c]));
  if(owners.some(c=>!byId.has(c.id)))throw new StreamedLayoutValidationError('All nine coarse owners are required');
  if(typeof seed!=='string'||!seed.trim()||seed.length>256)throw new StreamedLayoutValidationError('Invalid layout seed');
  const ownerCellIds=owners.map(c=>c.id),legacy=new Map(saved.filter(s=>ownerCellIds.includes(s.chunkId)).map(s=>[s.chunkId,s]));
  const buildings:LayoutBuilding[]=[],roads:LayoutRoad[]=[],objects:LayoutObject[]=[],objectStates:WorldObjectState[]=[];
  for(const [owner,row] of legacy){
    for(const state of row.objectStates){
      objectStates.push(structuredClone(state));
      if(state.kind==='dropped_item')continue;
      if(state.kind==='building'){buildings.push(legacyBuilding(state,owner,archetypeOf(row)));continue;}
      if(state.kind==='road'){
        const vertical=state.id.includes('_ns'),trail=state.tags.includes('trail'),width=state.id.includes('_cross_')?1.5:1.7;
        roads.push({id:state.id,ownerCellId:owner,provenance:'legacy-inferred',name:state.name,x:state.position.x,z:state.position.z,w:vertical?width:23,d:vertical?23:trail?1.15:width,tags:[...state.tags]});
        continue;
      }
      const visual=legacyObjectAsset(state);
      objects.push(objectLayout(state,owner,'legacy-inferred',visual.asset,visual.height,visual.rotationY));
    }
  }
  const center=byId.get(`chunk_${ux*3}_${uz*3}`)!;
  const average=(key:'population'|'food'|'wood'|'water'|'ecology'|'danger'|'prosperity')=>owners.reduce((sum,o)=>sum+byId.get(o.id)![key],0)/9;
  const aggregate:CoarseChunkState={...structuredClone(center),id:unit.id,cx:ux,cz:uz,
    settlementLevel:Math.max(...owners.map(o=>byId.get(o.id)!.settlementLevel)),
    population:average('population'),food:average('food'),wood:average('wood'),water:average('water'),
    ecology:average('ecology'),danger:average('danger'),prosperity:average('prosperity')};
  const generated=planFineChunk(aggregate,72,seed);
  const blocked=(x:number,z:number,padding=1)=>buildings.some(b=>Math.abs(x-b.x)<b.w/2+padding&&Math.abs(z-b.z)<b.d/2+padding);
  for(const b of generated.buildings){
    const owner=ownerAt(b);if(legacy.has(owner)||blocked(b.x,b.z,Math.max(b.w,b.d)/2+1))continue;
    const {color:_,...geometry}=b,offset=b.d/2+1.15;
    buildings.push({...geometry,ownerCellId:owner,frontage:{x:b.x+Math.sin(b.rotationY)*offset,z:b.z+Math.cos(b.rotationY)*offset},provenance:'generated'});
  }
  for(const p of generated.objects){
    const owner=ownerAt(p.state.position);if(legacy.has(owner)||blocked(p.state.position.x,p.state.position.z))continue;
    p.state.chunkId=owner;objects.push(objectLayout(p.state,owner,'generated',p.asset,p.height,p.rotationY));objectStates.push(structuredClone(p.state));
  }
  // Split shared arterial roads by the old owner cells so state ownership remains 24 m.
  if(legacy.size)roads.push(...connectLegacyRoads(unit,buildings,objects,objectStates));
  else for(const road of generated.roads)for(const owner of owners){
    if(legacy.has(owner.id))continue;
    const horizontal=road.w>road.d;
    if(horizontal&&owner.cz!==uz*3||!horizontal&&owner.cx!==ux*3)continue;
    roads.push({...road,id:`${road.id}_${owner.cx}_${owner.cz}`,ownerCellId:owner.id,provenance:'generated',
      x:owner.cx*24,z:owner.cz*24,w:horizontal?24:4,d:horizontal?4:24});
  }
  return {layout:{version:1,unit,seed,ownerCellIds,buildings,roads,objects},objectStates};
}

/** Canonical keys allow an equivalent JSON object order without allowing layout replacement. */
export function layoutIdentity(value:unknown):string {
  const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
    ?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
  return JSON.stringify(canonical(value));
}

export function readStreamedLayout(value:unknown):StreamedLayout {
  const fail=(field:string):never=>{throw new StreamedLayoutValidationError(`Invalid streamed layout: ${field}`);};
  const record=(v:unknown,field:string):Record<string,any>=>{
    if(!v||typeof v!=='object'||Array.isArray(v))return fail(field);
    return v as Record<string,any>;
  };
  const text=(v:unknown,field:string,max=256)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail(field);};
  const finite=(v:unknown,field:string,positive=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER||positive&&v<=0)fail(field);};
  const list=(v:unknown,field:string,max=2000):any[]=>{if(!Array.isArray(v)||v.length>max)return fail(field);return v;};
  const point=(p:unknown,field:string)=>{const v=record(p,field);finite(v.x,`${field}.x`);finite(v.z,`${field}.z`);};
  const layout=record(value,'root'),unit=record(layout.unit,'unit');
  if(layout.version!==1)fail('version');text(layout.seed,'seed');
  let expected:StreamedUnit;try{expected=streamedUnitAt(unit.ux,unit.uz);}catch{return fail('unit coordinates');}
  if(expected.isHome||layoutIdentity(unit)!==layoutIdentity(expected))fail('unit bounds/identity');
  const owners=streamedUnitOwnerCells(unit.ux,unit.uz).map(c=>c.id);
  if(layoutIdentity(layout.ownerCellIds)!==layoutIdentity(owners))fail('ownerCellIds');
  const inside=(p:{x:number;z:number},hx=0,hz=0)=>p.x-hx>=expected.bounds.minX-1e-8&&p.x+hx<=expected.bounds.maxX+1e-8&&p.z-hz>=expected.bounds.minZ-1e-8&&p.z+hz<=expected.bounds.maxZ+1e-8;
  const ids=new Set<string>();
  const entity=(v:unknown,field:string)=>{
    const e=record(v,field);text(e.id,`${field}.id`);if(ids.has(e.id))fail('duplicate entity id');ids.add(e.id);
    if(!owners.includes(e.ownerCellId))fail(`${field}.ownerCellId`);text(e.name,`${field}.name`);return e;
  };
  for(const [i,b] of list(layout.buildings,'buildings',128).entries()){
    const e=entity(b,`buildings[${i}]`);for(const k of ['x','z','rotationY'])finite(e[k],k);
    for(const k of ['w','d','height']){finite(e[k],k,true);if(e[k]>72)fail(k);}if(!Object.values(BUILDINGS).flat().some(b=>b[1]===e.asset))fail('building asset');point(e.frontage,'frontage');
    if(!['generated','legacy-inferred'].includes(e.provenance))fail('building provenance');
    if(e.provenance==='generated'){
      const c=Math.abs(Math.cos(e.rotationY)),s=Math.abs(Math.sin(e.rotationY));
      if(!inside(e as {x:number;z:number},(e.w*c+e.d*s)/2,(e.w*s+e.d*c)/2)||!inside(e.frontage)||ownerAt(e as Vec2)!==e.ownerCellId)fail('building footprint/owner');
    }
  }
  for(const [i,r] of list(layout.roads,'roads',2000).entries()){
    const e=entity(r,`roads[${i}]`);for(const k of ['x','z'])finite(e[k],k);for(const k of ['w','d']){finite(e[k],k,true);if(e[k]>72)fail(k);}
    for(const tag of list(e.tags,'road tags',128))text(tag,'tag');
    if(!['generated','legacy-inferred'].includes(e.provenance))fail('road provenance');
    if(e.provenance==='generated'&&(!inside(e as {x:number;z:number},e.w/2,e.d/2)||ownerAt(e as Vec2)!==e.ownerCellId))fail('road footprint/owner');
  }
  const assetKeys=new Set([...Object.values(BUILDINGS).flat().map(b=>b[1]),'rock','bush','flowers','axe','shovel','cart','wellAsset','mineAsset','crate_rts','tree1','tree2','tree3']);
  const caps=new Set(['inspect','rest','sit','sleep','draw_water','drink','wash','harvest','forage','chop','mine','craft','work','buy','sell','trade','store','take','load','unload','pickup','visit']);
  const items=new Set(['apple','bread','wood','coin','flower','grain','flour','water','stone','plank','tool']);
  const kinds=['bed','bench','workstation','food_stall','tree','crate','well','water_patch','farm_plot','bush','rock','flower','cart','tool_prop'];
  for(const [i,o] of list(layout.objects,'objects').entries()){
    const e=entity(o,`objects[${i}]`);if(!kinds.includes(e.kind))fail('object kind');point(e.anchor,'anchor');finite(e.rotationY,'rotationY');
    if(e.asset!==undefined&&!assetKeys.has(e.asset))fail('asset');if(e.item!==undefined&&!items.has(e.item))fail('item');if(e.height!==undefined){finite(e.height,'height',true);if(e.height>72)fail('height');}
    for(const tag of list(e.tags,'object tags',128))text(tag,'tag');for(const cap of list(e.capabilities,'capabilities',128))if(!caps.has(cap))fail('capability');
    if(!['generated','legacy-inferred'].includes(e.provenance))fail('object provenance');
    if(e.provenance==='generated'&&(!inside(e.anchor)||ownerAt(e.anchor)!==e.ownerCellId))fail('object anchor/owner');
  }
  return value as StreamedLayout;
}

/** Mutable rows may be omitted by compact writes; a supplied row cannot erase
 * an established static entity while retaining the layout that refers to it. */
export function assertStreamedLayoutStates(layouts:readonly StreamedLayout[],rows:readonly PersistedFineChunk[],partial=false){
  const byOwner=new Map(rows.map(row=>[row.chunkId,row])),ids=new Set<string>();
  for(const layout of layouts)for(const owner of layout.ownerCellIds){
    const row=byOwner.get(owner);if(!row&&partial)continue;
    if(!row||typeof row.dynamicActivated!=='boolean')throw new StreamedLayoutValidationError(`Missing owner activation state: ${owner}`);
  }
  for(const layout of layouts)for(const entry of [...layout.buildings.map(plan=>({plan,kind:'building'})),
    ...layout.roads.map(plan=>({plan,kind:'road'})),...layout.objects.map(plan=>({plan,kind:plan.kind}))]){
    const {plan,kind}=entry;
    if(ids.has(plan.id))throw new StreamedLayoutValidationError(`Duplicate static identity: ${plan.id}`);
    ids.add(plan.id);
    const row=byOwner.get(plan.ownerCellId);if(!row&&partial)continue;
    const state=row?.objectStates.find(object=>object.id===plan.id);
    if(!state||state.chunkId!==plan.ownerCellId||state.kind!==kind)throw new StreamedLayoutValidationError(`Missing or mismatched static state: ${plan.id}`);
    const anchor='frontage' in plan?plan.frontage:'anchor' in plan?plan.anchor:{x:plan.x,z:plan.z};
    if(!worldObjectRigidBody(state)&&(Math.abs(anchor.x-state.position.x)>1e-8||Math.abs(anchor.z-state.position.z)>1e-8))throw new StreamedLayoutValidationError(`Static anchor differs from saved owner state: ${plan.id}`);
  }
}

function freezeLayout(layout:StreamedLayout):StreamedLayout {
  const freeze=(value:unknown)=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}};
  freeze(layout);return layout;
}

export class StreamedLayoutRegistry {
  private readonly layouts=new Map<string,StreamedLayout>();
  constructor(readonly seed:string){}

  get(unitId:string){return this.layouts.get(unitId);}
  snapshot(){return [...this.layouts.values()].map(layout=>structuredClone(layout));}

  restore(values:readonly StreamedLayout[]){
    const checked=new Map<string,StreamedLayout>(),entities=new Set<string>();
    for(const value of values){
      const layout=readStreamedLayout(value);
      if(layout.seed!==this.seed||checked.has(layout.unit.id))throw new StreamedLayoutValidationError('Duplicate unit or mismatched world seed');
      for(const entry of [...layout.buildings,...layout.roads,...layout.objects]){
        if(entities.has(entry.id))throw new StreamedLayoutValidationError(`Duplicate static identity: ${entry.id}`);entities.add(entry.id);
      }
      checked.set(layout.unit.id,freezeLayout(structuredClone(layout)));
    }
    this.layouts.clear();for(const [id,layout] of checked)this.layouts.set(id,layout);
  }

  establish(ux:number,uz:number,cells:readonly CoarseChunkState[],saved:readonly PersistedFineChunk[]):GeneratedStreamedLayout {
    const unit=streamedUnitAt(ux,uz),existing=this.layouts.get(unit.id);
    if(existing)return {layout:existing,objectStates:[]};
    const generated=createStreamedLayout(ux,uz,cells,saved,this.seed);
    readStreamedLayout(generated.layout);this.layouts.set(unit.id,freezeLayout(generated.layout));return generated;
  }
}
