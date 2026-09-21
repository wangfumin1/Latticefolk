import test from 'node:test';
import assert from 'node:assert/strict';
import type { CoarseChunkState } from '../src/types.js';
import { applyConservedFlows, flowTotals, planConservedFlows } from '../src/world/flows.js';

const make=(id:string,cx:number,patch:Partial<CoarseChunkState>):CoarseChunkState=>({
  id,cx,cz:0,biome:'plains',settlementLevel:1,population:20,food:50,wood:50,water:50,
  ecology:60,danger:20,prosperity:50,strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',
  lastDecisionAt:0,decisionVersion:0,...patch
});

test('planned cross-chunk transfers conserve population and transferable resources',()=>{
  const a=make('a',0,{population:30,food:82,wood:76,water:72,ecology:82,danger:75,prosperity:28,migrationPolicy:'evacuate',strategy:'trade_route'});
  const b=make('b',1,{population:10,food:18,wood:25,water:22,ecology:35,danger:8,prosperity:76,migrationPolicy:'attract',strategy:'trade_route'});
  const chunks=new Map([[a.id,a],[b.id,b]]);
  const before=flowTotals(chunks.values());
  const planned=planConservedFlows(chunks.values(),{day:3,minuteOfDay:600});
  assert.ok(planned.some(x=>x.kind==='migration'));
  assert.ok(planned.some(x=>x.kind==='food_trade'));
  assert.ok(planned.some(x=>x.kind==='wood_trade'));
  assert.ok(planned.some(x=>x.kind==='water_trade'));
  assert.ok(planned.some(x=>x.kind==='ecology_spread'));
  const applied=applyConservedFlows(chunks,planned);
  assert.ok(applied.length>=5);
  const after=flowTotals(chunks.values());
  assert.deepEqual(after,before);
});

test('materialized chunks are excluded from coarse flow planning',()=>{
  const a=make('a',0,{food:90,migrationPolicy:'release'});
  const b=make('b',1,{food:10,migrationPolicy:'attract',strategy:'trade_route'});
  const flows=planConservedFlows([a,b],{day:1,minuteOfDay:100,materialized:new Set(['a'])});
  assert.equal(flows.length,0);
});
