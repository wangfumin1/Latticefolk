import type { CoarseChunkState, InventoryItem, Mood, NpcRole, WorldObjectState } from '../types';

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

export interface FineObjectPlan {
  state: WorldObjectState;
  asset?: string;
  height?: number;
  rotationY?: number;
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
  buildings: FineBuildingPlan[];
  objects: FineObjectPlan[];
  residents: FineResidentPlan[];
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

function roleFor(index:number,level:number,biome:CoarseChunkState['biome']):NpcRole {
  const rural:NpcRole[]=['farmer','farmer','resident','maker','guard','resident'];
  const town:NpcRole[]=['farmer','baker','shopkeeper','guard','maker','resident','resident'];
  const list=level>=2?town:rural;
  if(biome==='hills'&&index%4===0)return 'maker';
  if(biome==='forest'&&index%5===0)return 'maker';
  return list[index%list.length];
}

function inventoryFor(role:NpcRole):InventoryItem[] {
  if(role==='farmer')return [{kind:'grain',count:2},{kind:'apple',count:1}];
  if(role==='baker')return [{kind:'bread',count:2},{kind:'grain',count:1}];
  if(role==='maker')return [{kind:'wood',count:2},{kind:'stone',count:1}];
  if(role==='shopkeeper')return [{kind:'bread',count:2},{kind:'apple',count:2}];
  if(role==='guard')return [{kind:'bread',count:1},{kind:'water',count:1}];
  return [{kind:'water',count:1}];
}

export function planFineChunk(chunk:CoarseChunkState,chunkSize=24):FineChunkPlan {
  const random=rng(chunk.id);
  const centerX=chunk.cx*chunkSize,centerZ=chunk.cz*chunkSize;
  const buildings:FineBuildingPlan[]=[];
  const objects:FineObjectPlan[]=[];
  const residents:FineResidentPlan[]=[];

  const settlementCount=chunk.settlementLevel===0?0:Math.min(4,1+chunk.settlementLevel);
  const buildingDefs=[
    ['民居','houseA',9,8,8.2,0x9d744f],
    ['民居','houseB',10,9,6.2,0xb28c75],
    ['市场','marketBuilding',10,8,3.2,0x79a3a8],
    ['仓库','storageBuilding',10,8,5.2,0x8a795d],
    ['守卫所','barracksBuilding',10,8,7.0,0x8a7868],
  ] as const;

  for(let i=0;i<settlementCount;i++){
    const [baseName,asset,w,d,height,color]=buildingDefs[i%buildingDefs.length];
    const angle=(i/Math.max(1,settlementCount))*Math.PI*2+random()*.35;
    const radius=5.7+random()*2.2;
    buildings.push({
      id:`${chunk.id}_building_${i}`,
      name:`${baseName} · ${chunk.cx},${chunk.cz}`,
      x:centerX+Math.cos(angle)*radius,
      z:centerZ+Math.sin(angle)*radius,
      w,d,color,asset,height,rotationY:-angle+Math.PI/2
    });
  }

  const add=(suffix:string,kind:WorldObjectState['kind'],name:string,x:number,z:number,tags:string[],capabilities:NonNullable<WorldObjectState['capabilities']>,extra:Partial<WorldObjectState>={},asset?:string,height?:number,rotationY=0)=>{
    objects.push({
      state:{
        id:`${chunk.id}_${suffix}`,
        chunkId:chunk.id,
        kind,name,position:{x,z},tags,usable:true,pickupable:false,capabilities,
        ...extra
      },
      asset,height,rotationY
    });
  };

  if(chunk.settlementLevel>0){
    add('well','well','聚落水井',centerX,centerZ,['water','settlement','social'],['inspect','draw_water','drink','wash'],{},'wellAsset',3.4);
    add('farm','farm_plot','公共农地',centerX-6,centerZ+7,['work','farm','food'],['inspect','harvest','work'],{
      item:'grain',resourceAmount:Math.max(3,Math.round(chunk.food/12))
    });
    add('market','food_stall','乡间摊位',centerX+6,centerZ-6,['food','trade','market'],['inspect','buy','sell','trade'],{item:'bread'});
    if(chunk.settlementLevel>=2){
      add('workshop','workstation','公共工坊',centerX+7,centerZ+6,['work','maker','craft'],['inspect','work','craft']);
      add('guard','workstation','巡逻岗',centerX-7,centerZ-6,['work','guard','safety'],['inspect','work']);
    }
  }

  const natureCount=8+Math.round(chunk.ecology/13);
  for(let i=0;i<natureCount;i++){
    const x=centerX+(random()-.5)*(chunkSize-3),z=centerZ+(random()-.5)*(chunkSize-3);
    if(Math.hypot(x-centerX,z-centerZ)<4&&chunk.settlementLevel>0)continue;

    if(chunk.biome==='forest'||(chunk.biome==='plains'&&random()>.48)){
      const apple=random()>.72;
      add(`tree_${i}`,'tree',apple?'野生果树':'林木',x,z,['nature','wood',...(apple?['apple']:[])],['inspect','harvest','chop'],{
        item:apple?'apple':'wood',resourceAmount:3+Math.floor(random()*4)
      },['tree1','tree2','tree3'][i%3],3.5+random()*.8,random()*Math.PI*2);
    }else if(chunk.biome==='hills'||random()>.64){
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
    baker:`${chunk.id}_market`,
    shopkeeper:`${chunk.id}_market`,
    guard:`${chunk.id}_guard`,
    maker:`${chunk.id}_workshop`,
    resident:undefined
  };

  for(let i=0;i<activeResidents;i++){
    const role=roleFor(i,chunk.settlementLevel,chunk.biome);
    const angle=random()*Math.PI*2,radius=2.5+random()*7;
    const name=`${familyNames[Math.floor(random()*familyNames.length)]}${givenNames[Math.floor(random()*givenNames.length)]}`;
    residents.push({
      id:`${chunk.id}_npc_${String(i).padStart(2,'0')}`,
      name,role,
      x:centerX+Math.cos(angle)*radius,
      z:centerZ+Math.sin(angle)*radius,
      workAt:workIds[role],
      mood:(['calm','neutral','curious','happy'] as Mood[])[Math.floor(random()*4)],
      inventory:inventoryFor(role),
      characterAsset:['female1','female2','male1','male2'][i%4]
    });
  }

  return {chunkId:chunk.id,buildings,objects,residents};
}
