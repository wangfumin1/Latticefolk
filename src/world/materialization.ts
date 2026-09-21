import type { CoarseChunkState, InteractionCapability, InventoryItem, Mood, NpcRole, WildlifeSpecies, WildlifeTraits, WorldObjectState } from '../types';

export type SettlementArchetype =
  | 'wilderness'
  | 'farmstead'
  | 'market_hamlet'
  | 'timber_camp'
  | 'quarry_outpost'
  | 'wetland_hamlet'
  | 'refuge';

export interface FineBuildingPlan {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  color: number;
  asset: string;
  height: number;
  rotationY: number;
}

export interface FineRoadPlan {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  tags: string[];
}

export interface FineObjectPlan {
  state: WorldObjectState;
  asset?: string;
  height?: number;
  rotationY?: number;
}

export interface FineWildlifePlan {
  id: string;
  species: WildlifeSpecies;
  x: number;
  z: number;
  ageDays: number;
  sex: 'female' | 'male';
  generation: number;
  traits: WildlifeTraits;
}

export interface FineResidentPlan {
  id: string;
  name: string;
  role: NpcRole;
  x: number;
  z: number;
  workAt?: string;
  mood: Mood;
  inventory: InventoryItem[];
  characterAsset: string;
}

export interface FineChunkPlan {
  chunkId: string;
  archetype: SettlementArchetype;
  roads: FineRoadPlan[];
  buildings: FineBuildingPlan[];
  objects: FineObjectPlan[];
  residents: FineResidentPlan[];
  wildlife: FineWildlifePlan[];
}

function hash(text:string) {
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}

function rng(seed:string) {
  let s=hash(seed)||1;
  return ()=>{
    s+=0x6D2B79F5;
    let t=s;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

const givenNames=['澪','岚','葵','凛','悠','茜','晴','陆','纱','枫','朔','琴','灯','遥','真','铃','森','夏','冬','千'];
const familyNames=['森','川','谷','原','石','藤','山','井','高','月','白','水'];

function archetypeFor(chunk:CoarseChunkState):SettlementArchetype {
  if(chunk.settlementLevel===0)return 'wilderness';
  if(chunk.strategy==='fortify'||chunk.danger>=66)return 'refuge';
  if(chunk.strategy==='trade_route'||chunk.prosperity>=68)return 'market_hamlet';
  if(chunk.biome==='forest'&&(chunk.strategy==='extract_resources'||chunk.wood>=72))return 'timber_camp';
  if((chunk.biome==='hills'||chunk.biome==='dryland')&&(chunk.strategy==='extract_resources'||chunk.wood<45))return 'quarry_outpost';
  if(chunk.biome==='wetlands')return 'wetland_hamlet';
  return 'farmstead';
}

function roleFor(index:number,level:number,biome:CoarseChunkState['biome'],archetype:SettlementArchetype):NpcRole {
  const archetypeRoles:Record<SettlementArchetype,NpcRole[]>={
    wilderness:['resident','maker'],
    farmstead:['farmer','farmer','resident','baker','guard','maker'],
    market_hamlet:['shopkeeper','baker','resident','guard','farmer','maker'],
    timber_camp:['maker','maker','resident','guard','farmer'],
    quarry_outpost:['maker','guard','maker','resident','shopkeeper'],
    wetland_hamlet:['farmer','resident','baker','maker','guard'],
    refuge:['guard','guard','resident','maker','farmer','baker']
  };
  const list=archetypeRoles[archetype];
  if(level>=2&&index===2&&archetype!=='wilderness')return 'shopkeeper';
  if(biome==='forest'&&index%5===0)return 'maker';
  return list[index%list.length]!;
}

function inventoryFor(role:NpcRole):InventoryItem[] {
  if(role==='farmer')return [{kind:'grain',count:2},{kind:'apple',count:1}];
  if(role==='baker')return [{kind:'bread',count:2},{kind:'flour',count:1},{kind:'water',count:1}];
  if(role==='maker')return [{kind:'wood',count:2},{kind:'stone',count:1}];
  if(role==='shopkeeper')return [{kind:'bread',count:2},{kind:'apple',count:2}];
  if(role==='guard')return [{kind:'bread',count:1},{kind:'water',count:1}];
  return [{kind:'water',count:1}];
}

type BuildingDef=readonly [name:string,asset:string,w:number,d:number,height:number,color:number];

const BUILDINGS:Record<SettlementArchetype,BuildingDef[]>={
  wilderness:[],
  farmstead:[
    ['农舍','farmBuilding',8.4,7.5,7.4,0x96704f],
    ['民居','houseA',8.2,7.2,7.8,0x9d744f],
    ['仓库','storageBuilding',8.5,7.2,4.8,0x8a795d],
    ['风车','windmill',8.0,8.0,9.0,0x9a805f]
  ],
  market_hamlet:[
    ['市场','marketBuilding',8.5,7.4,3.0,0x79a3a8],
    ['旅店','houseB',8.2,7.4,5.8,0xb28c75],
    ['仓库','storageBuilding',8.3,7.1,4.8,0x8a795d],
    ['民居','houseA',8.0,7.0,7.5,0xa77c61]
  ],
  timber_camp:[
    ['工坊','storageBuilding',8.5,7.0,4.9,0x7f8796],
    ['仓库','storageBuilding',8.2,7.0,4.7,0x8a795d],
    ['民居','houseA',8.0,7.0,7.5,0x9d744f],
    ['守卫所','barracksBuilding',8.2,7.0,6.3,0x8a7868]
  ],
  quarry_outpost:[
    ['工坊','storageBuilding',8.5,7.0,4.9,0x7f8796],
    ['守卫所','barracksBuilding',8.2,7.0,6.3,0x8a7868],
    ['仓库','storageBuilding',8.2,7.0,4.7,0x8a795d],
    ['民居','houseB',8.0,7.0,5.6,0xb28c75]
  ],
  wetland_hamlet:[
    ['民居','houseB',8.0,7.0,5.6,0xb28c75],
    ['市场','marketBuilding',8.4,7.2,3.0,0x79a3a8],
    ['仓库','storageBuilding',8.2,7.0,4.7,0x8a795d],
    ['守卫所','barracksBuilding',8.0,7.0,6.2,0x8a7868]
  ],
  refuge:[
    ['守卫所','barracksBuilding',8.4,7.2,6.5,0x8a7868],
    ['仓库','storageBuilding',8.2,7.0,4.7,0x8a795d],
    ['民居','houseA',8.0,7.0,7.5,0x9d744f],
    ['民居','houseB',8.0,7.0,5.6,0xb28c75]
  ]
};

export function planFineChunk(chunk:CoarseChunkState,chunkSize=24):FineChunkPlan {
  const random=rng(chunk.id);
  const centerX=chunk.cx*chunkSize,centerZ=chunk.cz*chunkSize;
  const archetype=archetypeFor(chunk);
  const roads:FineRoadPlan[]=[];
  const buildings:FineBuildingPlan[]=[];
  const objects:FineObjectPlan[]=[];
  const residents:FineResidentPlan[]=[];
  const wildlife:FineWildlifePlan[]=[];

  const addRoad=(suffix:string,name:string,x:number,z:number,w:number,d:number,tags:string[])=>{
    roads.push({id:`${chunk.id}_road_${suffix}`,name,x,z,w,d,tags:['road','travel',archetype,...tags]});
  };

  if(chunk.settlementLevel>0){
    const horizontal=hash(`${chunk.id}:road-axis`)%2===0;
    if(horizontal)addRoad('main_ew','聚落主路',centerX,centerZ,chunkSize-1.0,1.7,['settlement','main']);
    else addRoad('main_ns','聚落主路',centerX,centerZ,1.7,chunkSize-1.0,['settlement','main']);
    if(chunk.settlementLevel>=2||archetype==='market_hamlet'){
      if(horizontal)addRoad('cross_ns','聚落支路',centerX,centerZ,1.5,chunkSize-1.0,['settlement','cross']);
      else addRoad('cross_ew','聚落支路',centerX,centerZ,chunkSize-1.0,1.5,['settlement','cross']);
    }
  } else if(chunk.strategy==='trade_route'){
    addRoad('trail','荒野商路',centerX,centerZ,chunkSize-1.0,1.15,['trail','trade']);
  }

  const defs=BUILDINGS[archetype];
  const settlementCount=chunk.settlementLevel===0?0:Math.min(defs.length,1+chunk.settlementLevel);
  const lotOffsets:[number,number][]=[[-6.0,-6.0],[6.0,-6.0],[-6.0,6.0],[6.0,6.0]];
  for(let i=0;i<settlementCount;i++){
    const [baseName,asset,w,d,height,color]=defs[i]!;
    const [ox,oz]=lotOffsets[i]!;
    const jitterX=(random()-.5)*.7,jitterZ=(random()-.5)*.7;
    const x=centerX+ox+jitterX,z=centerZ+oz+jitterZ;
    const rotationY=Math.atan2(centerX-x,centerZ-z);
    buildings.push({
      id:`${chunk.id}_building_${i}`,
      name:`${baseName} · ${chunk.cx},${chunk.cz}`,
      x,z,w,d,color,asset,height,rotationY
    });
  }

  const add=(suffix:string,kind:WorldObjectState['kind'],name:string,x:number,z:number,tags:string[],capabilities:InteractionCapability[],extra:Partial<WorldObjectState>={},asset?:string,height?:number,rotationY=0)=>{
    objects.push({
      state:{
        id:`${chunk.id}_${suffix}`,chunkId:chunk.id,kind,name,position:{x,z},tags:[...tags,archetype],
        usable:true,pickupable:false,capabilities,...extra
      },
      asset,height,rotationY
    });
  };

  if(chunk.settlementLevel>0){
    add('well','well','聚落水井',centerX+2.4,centerZ+2.4,['water','settlement','social'],['inspect','draw_water','drink','wash'],{},'wellAsset',3.2);
    add('farm','farm_plot','公共农地',centerX-8.0,centerZ+1.8,['work','farm','food'],['inspect','harvest','work'],{
      item:'grain',resourceAmount:Math.max(3,Math.round(chunk.food/12))
    });
    if(['market_hamlet','wetland_hamlet','farmstead'].includes(archetype)){
      add('market','food_stall','乡间摊位',centerX+7.2,centerZ-1.8,['food','trade','market'],['inspect','buy','sell','trade'],{item:'bread'});
    }
    if(archetype==='farmstead') add('mill','workstation','谷物磨坊',centerX-7.4,centerZ-1.7,['work','farm','grain','mill'],['inspect','work','craft']);
    if(archetype==='market_hamlet'||archetype==='wetland_hamlet') add('bakery','workstation','公共烤炉',centerX-7.4,centerZ-1.7,['work','baker','oven'],['inspect','work','craft']);
    if(archetype==='timber_camp') add('sawmill','workstation','木材加工台',centerX-7.4,centerZ-1.7,['work','maker','sawmill'],['inspect','work','craft']);
    if(['timber_camp','quarry_outpost','refuge'].includes(archetype)||chunk.settlementLevel>=2){
      add('workshop','workstation','公共工坊',centerX+2.6,centerZ-7.8,['work','maker','craft'],['inspect','work','craft']);
      add('guard','workstation','巡逻岗',centerX-2.6,centerZ-7.8,['work','guard','safety'],['inspect','work']);
    }
    add('supply','crate','公共补给箱',centerX-2.7,centerZ+2.5,['storage','supply'],['inspect','store','take'],{storage:[]},'crate_rts',1.05,.2);
    add('cart','cart','运输推车',centerX+4.7,centerZ+1.2,['transport','storage','trade'],['inspect','load','unload'],{storage:[]},'cart',1.3,Math.PI/2);
  }

  if(archetype==='quarry_outpost'){
    add('quarry','workstation','采石场',centerX+8.5,centerZ+8.0,['work','resource','stone','mine'],['inspect','work','mine'],{item:'stone',resourceAmount:Math.max(5,Math.round(chunk.wood/10))},'mineAsset',4.2,Math.PI);
  }
  if(archetype==='timber_camp'){
    add('tool','tool_prop','伐木工具',centerX+7.0,centerZ+6.4,['tool','wood'],['inspect','pickup'],{item:'tool',pickupable:true},'axe',.9,-.4);
  }

  const reserved=(x:number,z:number)=>{
    const lx=x-centerX,lz=z-centerZ;
    if(roads.some(r=>Math.abs(x-r.x)<=r.w/2+.8&&Math.abs(z-r.z)<=r.d/2+.8))return true;
    if(buildings.some(b=>Math.abs(x-b.x)<=b.w/2+1.0&&Math.abs(z-b.z)<=b.d/2+1.0))return true;
    return Math.hypot(lx,lz)<3.8&&chunk.settlementLevel>0;
  };

  const natureCount=9+Math.round(chunk.ecology/10);
  let placed=0,attempts=0;
  while(placed<natureCount&&attempts<natureCount*8){
    attempts++;
    const x=centerX+(random()-.5)*(chunkSize-2.4),z=centerZ+(random()-.5)*(chunkSize-2.4);
    if(reserved(x,z))continue;
    const i=placed++;
    if(chunk.biome==='forest'||(chunk.biome==='plains'&&random()>.48)){
      const apple=random()>.72;
      add(`tree_${i}`,'tree',apple?'野生果树':'林木',x,z,['nature','wood',...(apple?['apple']:[])],['inspect','harvest','chop'],{
        item:apple?'apple':'wood',resourceAmount:3+Math.floor(random()*4)
      },['tree1','tree2','tree3'][i%3],3.5+random()*.8,random()*Math.PI*2);
    }else if(chunk.biome==='hills'||chunk.biome==='dryland'||random()>.66){
      add(`rock_${i}`,'rock','岩石',x,z,['nature','resource','stone'],['inspect','mine'],{
        item:'stone',resourceAmount:4+Math.floor(random()*5)
      },'rock',.75+random()*.5,random()*Math.PI*2);
    }else if(random()>.5){
      add(`bush_${i}`,'bush','灌木丛',x,z,['nature','forage'],['inspect','forage'],{
        item:'flower',resourceAmount:2+Math.floor(random()*3)
      },'bush',.9+random()*.25,random()*Math.PI*2);
    }else{
      add(`flower_${i}`,'flower','野花',x,z,['nature','flower'],['inspect','harvest'],{
        item:'flower',resourceAmount:2+Math.floor(random()*3)
      },'flowers',.7+random()*.25,random()*Math.PI*2);
    }
  }

  const activeResidents=Math.min(Math.round(chunk.population),6+chunk.settlementLevel*3,12);
  const workIds:Record<NpcRole,string|undefined>={
    farmer:`${chunk.id}_farm`,
    baker:(archetype==='market_hamlet'||archetype==='wetland_hamlet')?`${chunk.id}_bakery`:`${chunk.id}_market`,
    shopkeeper:`${chunk.id}_market`,
    guard:`${chunk.id}_guard`,
    maker:archetype==='quarry_outpost'?`${chunk.id}_quarry`:archetype==='timber_camp'?`${chunk.id}_sawmill`:`${chunk.id}_workshop`,
    resident:undefined
  };

  for(let i=0;i<activeResidents;i++){
    const role=roleFor(i,chunk.settlementLevel,chunk.biome,archetype);
    const angle=random()*Math.PI*2,radius=3+random()*6;
    const name=`${familyNames[Math.floor(random()*familyNames.length)]}${givenNames[Math.floor(random()*givenNames.length)]}`;
    residents.push({
      id:`${chunk.id}_npc_${String(i).padStart(2,'0')}`,
      name,role,
      x:centerX+Math.cos(angle)*radius,
      z:centerZ+Math.sin(angle)*radius,
      workAt:workIds[role],
      mood:(['calm','neutral','curious','happy'] as Mood[])[Math.floor(random()*4)]!,
      inventory:inventoryFor(role),
      characterAsset:['female1','female2','male1','male2'][i%4]!
    });
  }


  const speciesBase:Record<WildlifeSpecies,{speed:number;size:number;fertility:number;wariness:number;maxFine:number}>={
    rabbit:{speed:2.4,size:.55,fertility:.9,wariness:.88,maxFine:3},
    deer:{speed:2.8,size:1.15,fertility:.48,wariness:.82,maxFine:2},
    boar:{speed:1.9,size:1.0,fertility:.55,wariness:.58,maxFine:2},
    fox:{speed:2.7,size:.7,fertility:.42,wariness:.76,maxFine:1}
  };
  for(const population of chunk.wildlife||[]){
    const base=speciesBase[population.species];
    if(!base||population.count<.35)continue;
    const count=Math.min(base.maxFine,Math.max(1,Math.round(population.count/Math.max(2,population.carryingCapacity/Math.max(1,base.maxFine)))));
    for(let i=0;i<count;i++){
      let x=centerX,z=centerZ;
      for(let attempt=0;attempt<12;attempt++){
        const tx=centerX+(random()-.5)*(chunkSize-3),tz=centerZ+(random()-.5)*(chunkSize-3);
        if(!reserved(tx,tz)){x=tx;z=tz;break;}
      }
      const variance=(amount:number)=>amount*(.88+random()*.24);
      wildlife.push({
        id:`${chunk.id}_wild_${population.species}_${i}`,
        species:population.species,x,z,
        ageDays:Math.floor(20+random()*(population.species==='rabbit'?500:population.species==='fox'?1800:3200)),
        sex:random()>.5?'female':'male',
        generation:0,
        traits:{
          speed:variance(base.speed),size:variance(base.size),
          fertility:Math.min(1,variance(base.fertility)),wariness:Math.min(1,variance(base.wariness))
        }
      });
    }
  }

  return {chunkId:chunk.id,archetype,roads,buildings,objects,residents,wildlife};
}
