import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { CoarseChunkState, WorldObjectState } from '../src/types.js';
import { planFineChunk, type FineBuildingPlan } from '../src/world/materialization.js';
import { restoreBuildingForLayout } from '../src/world/buildingRestore.js';
import { FinePhysicsAuthority } from '../src/world/finePhysics.js';
import { bakingOvenPhysics, bakingOvenVisualSpec } from '../src/scene/bakingOven.js';

const chunk:CoarseChunkState={id:'chunk_2_-1',cx:2,cz:-1,biome:'plains',settlementLevel:2,population:23,
  food:68,wood:57,water:71,ecology:73,danger:18,prosperity:66,strategy:'trade_route',
  migrationPolicy:'attract',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:3};

const source=JSON.parse(readFileSync(new URL('../public/assets/firefly-in-the-dusk/cast-iron-stove/CastIronStove.source.gltf',import.meta.url),'utf8'));
const positions=source.meshes[0].primitives.map((primitive:{attributes:{POSITION:number}})=>source.accessors[primitive.attributes.POSITION]);
const size=[0,1,2].map(axis=>Math.max(...positions.map((a:{max:number[]})=>a.max[axis]!))-Math.min(...positions.map((a:{min:number[]})=>a.min[axis]!)));

function buildingBounds(building:FineBuildingPlan,chunkId:string){
  const c=Math.abs(Math.cos(building.rotationY)),s=Math.abs(Math.sin(building.rotationY));
  const hx=(building.w*c+building.d*s)/2,hz=(building.w*s+building.d*c)/2;
  return {id:`building:${building.id}`,minX:building.x-hx,maxX:building.x+hx,minZ:building.z-hz,maxZ:building.z+hz,chunkId};
}

function physicalBakeryApproach(input:CoarseChunkState){
  const plan=planFineChunk(input,24);
  const oven=plan.objects.find(item=>item.state.id===`${input.id}_bakery`)!.state;
  const target=bakingOvenVisualSpec(oven)!;
  const scale=Math.min(target.height/size[1]!,target.width/size[0]!,target.depth/size[2]!);
  const halfX=size[0]!*scale/2,halfZ=size[2]!*scale/2;
  const bounds={minX:oven.position.x-halfX,maxX:oven.position.x+halfX,minZ:oven.position.z-halfZ,maxZ:oven.position.z+halfZ};
  const physics=new FinePhysicsAuthority();
  const buildings=plan.buildings.map(building=>buildingBounds(building,input.id));
  buildings.forEach(building=>physics.registerStatic(building));
  const spec=bakingOvenPhysics(oven,bounds);
  physics.registerStatic(spec.collider);physics.registerTrigger(spec.trigger);
  const start={x:oven.position.x,z:oven.position.z+3.2};
  const movement=physics.moveKinematic({id:'player',position:start,displacement:{x:0,z:-5},radius:.3,maxSubstep:.025});
  return {plan,oven,bounds,physics,buildings,start,movement};
}

test('the existing generated bakery and unchanged approach coordinates are outside building bodies',()=>{
  const {oven,bounds,physics,buildings,start,movement}=physicalBakeryApproach(chunk);
  assert.deepEqual(oven.position,{x:40.6,z:-25.7});
  assert.deepEqual(start,{x:40.6,z:-22.5});
  assert.equal(physics.isBlocked(start.x,start.z,.3),false,'the saved approach point must not be inside a generated building');
  assert.ok(buildings.every(b=>b.maxX<=bounds.minX||b.minX>=bounds.maxX||b.maxZ<=bounds.minZ||b.minZ>=bounds.maxZ),'the actual oven envelope must not intersect any building body');
  assert.deepEqual(movement.staticHits,[`object:${oven.id}`],'only the oven, not a building, stops the approach');
  assert.ok(movement.displacement.z<-2.3);
  assert.ok(physics.overlappingTriggers(movement.position,.3).some(trigger=>trigger.id===`object-trigger:${oven.id}`));
});

for(const biome of ['plains','wetlands'] as const){
  test(`${biome} bakery access stays clear across deterministic building jitter and settlement levels`,()=>{
    for(let i=0;i<96;i++){
      const input={...chunk,id:`chunk_${i+4}_${-i-3}`,cx:i+4,cz:-i-3,biome,
        settlementLevel:1+i%3,strategy:biome==='wetlands'?'sustain' as const:'trade_route' as const};
      const {plan,oven,bounds,physics,buildings,start,movement}=physicalBakeryApproach(input);
      assert.equal(plan.archetype,biome==='wetlands'?'wetland_hamlet':'market_hamlet');
      assert.ok(plan.buildings.every(building=>building.rotationY===0||building.rotationY===Math.PI));
      assert.deepEqual(oven.position,{x:input.cx*24-7.4,z:input.cz*24-1.7});
      assert.ok(plan.residents.filter(npc=>npc.role==='baker').every(npc=>npc.workAt===oven.id));
      assert.equal(physics.isBlocked(start.x,start.z,.3),false,`${input.id}: invalid unchanged approach point`);
      assert.ok(buildings.every(b=>b.maxX<=bounds.minX||b.minX>=bounds.maxX||b.maxZ<=bounds.minZ||b.minZ>=bounds.maxZ),`${input.id}: covered oven`);
      assert.deepEqual(movement.staticHits,[`object:${oven.id}`],`${input.id}: obstructed approach`);
      assert.ok(physics.overlappingTriggers(movement.position,.3).some(trigger=>trigger.id===`object-trigger:${oven.id}`));
    }
  });
}


test('old saved building frontage follows current layout without losing stored resources or identity',()=>{
  const plan=planFineChunk(chunk,24),building=plan.buildings[0]!;
  const distance=building.d/2+1.15;
  const current:WorldObjectState={id:building.id,chunkId:chunk.id,kind:'building',name:building.name,
    position:{x:building.x+Math.sin(building.rotationY)*distance,z:building.z+Math.cos(building.rotationY)*distance},
    tags:['building','storage'],usable:true,pickupable:false,capabilities:['inspect','store','take'],storage:[]};
  const oldYaw=Math.atan2(chunk.cx*24-building.x,chunk.cz*24-building.z);
  const saved:WorldObjectState={...structuredClone(current),
    position:{x:building.x+Math.sin(oldYaw)*distance,z:building.z+Math.cos(oldYaw)*distance},
    storage:[{kind:'flour',count:7},{kind:'water',count:3}],resourceAmount:5,resourceCapacity:8};
  const originalCurrent=structuredClone(current),originalSaved=structuredClone(saved);
  const restored=restoreBuildingForLayout(current,saved);
  assert.deepEqual(current,originalCurrent);assert.deepEqual(saved,originalSaved);
  assert.notDeepEqual(saved.position,current.position,'this fixture must contain the legacy diagonal frontage');
  assert.deepEqual(restored,{...saved,position:current.position});
  assert.equal(restored.id,building.id);assert.equal(restored.chunkId,chunk.id);
  assert.deepEqual(restoreBuildingForLayout(current,JSON.parse(JSON.stringify(restored))),restored);
  restored.storage![0]!.count=0;assert.equal(saved.storage![0]!.count,7,'restoration must not alias saved inventory');
  restored.position.x=0;assert.deepEqual(current,originalCurrent);
  assert.throws(()=>restoreBuildingForLayout(current,{...saved,id:'other'}),/Mismatched building/);
  assert.throws(()=>restoreBuildingForLayout({...current,kind:'crate'},saved),/Mismatched building/);
});

test('home building restoration keeps layout frontage independent of the unmoved body anchor',()=>{
  const center={x:-10,z:-18},frontage={x:-10+Math.sin(-.08)*5.65,z:-18+Math.cos(-.08)*5.65};
  const current:WorldObjectState={id:'building_面包房',kind:'building',name:'面包房',position:frontage,
    tags:['building','baker'],usable:true,pickupable:false,capabilities:['inspect','visit','store','take'],storage:[]};
  const saved={...structuredClone(current),position:{x:123,z:456},storage:[{kind:'flour' as const,count:7}]};
  const restored=restoreBuildingForLayout(current,saved);
  assert.equal(restored.chunkId,undefined);assert.deepEqual(restored.position,frontage);
  assert.notDeepEqual(restored.position,center,'semantic frontage must never be used as the building body center');
  assert.deepEqual(restored.storage,[{kind:'flour',count:7}]);assert.equal(restored.id,current.id);
});
