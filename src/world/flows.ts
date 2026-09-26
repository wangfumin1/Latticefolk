import type { CoarseChunkState } from '../types';
import { CoarseChunkSpatialIndex, type CoarseChunkCoordinateLookup } from './coarseSpatialIndex';

export type WorldFlowKind = 'migration' | 'food_trade' | 'wood_trade' | 'water_trade' | 'ecology_spread';

export interface WorldFlowRecord {
  id: string;
  kind: WorldFlowKind;
  fromChunkId: string;
  toChunkId: string;
  amount: number;
  day: number;
  minuteOfDay: number;
  reason: string;
}

export interface FlowContext {
  day: number;
  minuteOfDay: number;
  materialized?: ReadonlySet<string>;
}

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const round=(v:number)=>Math.round(v*1000)/1000;

function pairId(a:CoarseChunkState,b:CoarseChunkState){
  return a.id<b.id?`${a.id}|${b.id}`:`${b.id}|${a.id}`;
}

function migrationPressure(chunk:CoarseChunkState){
  const policy=chunk.migrationPolicy==='evacuate'?55:chunk.migrationPolicy==='release'?24:chunk.migrationPolicy==='attract'?-18:0;
  const scarcity=Math.max(0,42-chunk.food)*.55+Math.max(0,38-chunk.water)*.65;
  return policy+chunk.danger*.42+scarcity-chunk.prosperity*.18;
}

function attraction(chunk:CoarseChunkState){
  const policy=chunk.migrationPolicy==='attract'?30:chunk.migrationPolicy==='retain'?8:chunk.migrationPolicy==='release'?-8:-30;
  return policy+chunk.prosperity*.38+chunk.food*.16+chunk.water*.16-chunk.danger*.38-chunk.population*.12;
}

function resourceFlow(
  kind:Extract<WorldFlowKind,'food_trade'|'wood_trade'|'water_trade'>,
  resource:'food'|'wood'|'water',
  a:CoarseChunkState,b:CoarseChunkState,ctx:FlowContext
):WorldFlowRecord|undefined {
  const tradeEnabled=a.strategy==='trade_route'||b.strategy==='trade_route'||(a.settlementLevel>0&&b.settlementLevel>0);
  if(!tradeEnabled)return undefined;

  let source=a,target=b;
  if(b[resource]>a[resource]){source=b;target=a;}
  const gap=source[resource]-target[resource];
  if(gap<24||source[resource]<58||target[resource]>46)return undefined;
  const amount=round(Math.min(1.6,(gap-18)*.045,Math.max(0,source[resource]-52)*.07));
  if(amount<=0)return undefined;
  return {
    id:`${ctx.day}:${Math.floor(ctx.minuteOfDay)}:${pairId(a,b)}:${kind}`,
    kind,fromChunkId:source.id,toChunkId:target.id,amount,day:ctx.day,minuteOfDay:ctx.minuteOfDay,
    reason:`${resource}_surplus_to_deficit`
  };
}

export function planConservedFlows(
  chunks:Iterable<CoarseChunkState>,
  ctx:FlowContext,
  spatialIndex?:CoarseChunkCoordinateLookup
):WorldFlowRecord[] {
  const list=spatialIndex?chunks:[...chunks];
  const neighborLookup=spatialIndex??new CoarseChunkSpatialIndex(list);
  const materialized=ctx.materialized??new Set<string>();
  const flows:WorldFlowRecord[]=[];

  const processPair=(a:CoarseChunkState,b:CoarseChunkState)=>{
    if(materialized.has(a.id)||materialized.has(b.id))return;

    const aPressure=migrationPressure(a),bPressure=migrationPressure(b);
    const aAttract=attraction(a),bAttract=attraction(b);
    let source:CoarseChunkState|undefined,target:CoarseChunkState|undefined;
    if(aPressure>bPressure+12&&bAttract>aAttract+8){source=a;target=b;}
    else if(bPressure>aPressure+12&&aAttract>bAttract+8){source=b;target=a;}

    if(source&&target&&source.population>1){
      const policyScale=source.migrationPolicy==='evacuate'?1.8:source.migrationPolicy==='release'?1.0:.45;
      const amount=round(Math.min(source.population*.025,1.25,Math.max(.08,(Math.abs(aPressure-bPressure)-8)*.012))*policyScale);
      if(amount>0)flows.push({
        id:`${ctx.day}:${Math.floor(ctx.minuteOfDay)}:${pairId(a,b)}:migration`,
        kind:'migration',fromChunkId:source.id,toChunkId:target.id,amount,day:ctx.day,minuteOfDay:ctx.minuteOfDay,
        reason:`${source.migrationPolicy}_to_${target.migrationPolicy}`
      });
    }

    for(const flow of [
      resourceFlow('food_trade','food',a,b,ctx),
      resourceFlow('wood_trade','wood',a,b,ctx),
      resourceFlow('water_trade','water',a,b,ctx)
    ]) if(flow)flows.push(flow);

    let ecoSource=a,ecoTarget=b;
    if(b.ecology>a.ecology){ecoSource=b;ecoTarget=a;}
    const ecoGap=ecoSource.ecology-ecoTarget.ecology;
    if(ecoGap>30&&ecoSource.ecology>65&&ecoTarget.ecology<52){
      const amount=round(Math.min(.55,(ecoGap-20)*.012));
      if(amount>0)flows.push({
        id:`${ctx.day}:${Math.floor(ctx.minuteOfDay)}:${pairId(a,b)}:ecology`,
        kind:'ecology_spread',fromChunkId:ecoSource.id,toChunkId:ecoTarget.id,amount,day:ctx.day,minuteOfDay:ctx.minuteOfDay,
        reason:'biological_spread'
      });
    }
  };

  // Only visit east/south edges. This is O(n) in known chunks instead of O(n²).
  for(const a of list){
    if(materialized.has(a.id))continue;
    const east=neighborLookup.get(a.cx+1,a.cz);
    const south=neighborLookup.get(a.cx,a.cz+1);
    if(east)processPair(a,east);
    if(south)processPair(a,south);
  }
  return flows;
}

export function applyConservedFlows(chunks:Map<string,CoarseChunkState>,flows:WorldFlowRecord[]) {
  const applied:WorldFlowRecord[]=[];
  for(const flow of flows){
    const from=chunks.get(flow.fromChunkId),to=chunks.get(flow.toChunkId);
    if(!from||!to||flow.amount<=0)continue;
    const amount=Math.max(0,flow.amount);
    switch(flow.kind){
      case 'migration': {
        const actual=Math.min(amount,Math.max(0,from.population));
        from.population=round(from.population-actual);
        to.population=round(to.population+actual);
        if(actual>0)applied.push({...flow,amount:actual});
        break;
      }
      case 'food_trade':
      case 'wood_trade':
      case 'water_trade': {
        const resource=flow.kind==='food_trade'?'food':flow.kind==='wood_trade'?'wood':'water';
        const actual=Math.min(amount,Math.max(0,from[resource]));
        from[resource]=round(clamp(from[resource]-actual,0,100));
        to[resource]=round(clamp(to[resource]+actual,0,100));
        if(actual>0)applied.push({...flow,amount:actual});
        break;
      }
      case 'ecology_spread': {
        const actual=Math.min(amount,Math.max(0,from.ecology));
        from.ecology=round(clamp(from.ecology-actual,0,100));
        to.ecology=round(clamp(to.ecology+actual,0,100));
        if(actual>0)applied.push({...flow,amount:actual});
        break;
      }
    }
  }
  return applied;
}

export function flowTotals(chunks:Iterable<CoarseChunkState>){
  const list=[...chunks];
  return {
    population:round(list.reduce((s,c)=>s+c.population,0)),
    food:round(list.reduce((s,c)=>s+c.food,0)),
    wood:round(list.reduce((s,c)=>s+c.wood,0)),
    water:round(list.reduce((s,c)=>s+c.water,0)),
    ecology:round(list.reduce((s,c)=>s+c.ecology,0))
  };
}
