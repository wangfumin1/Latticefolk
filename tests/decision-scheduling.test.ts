import test from 'node:test';
import assert from 'node:assert/strict';
import type { CoarseChunkState } from '../src/types.js';
import {
  boundedDecisionIdWindow,
  captureChunkDecisionSignal,
  chunkDecisionPressure,
  chunkDecisionSurprise,
  nextChunkDecisionDelay,
  rankChunkDecisionCandidates
} from '../src/world/decisionScheduling.js';

const chunk=(id:string,overrides:Partial<CoarseChunkState>={}):CoarseChunkState=>({
  id,cx:0,cz:0,biome:'plains',settlementLevel:0,population:12,
  food:70,wood:70,water:70,ecology:75,danger:20,prosperity:50,
  strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',
  lastDecisionAt:1_000_000,decisionVersion:1,
  ...overrides
});

test('decision scheduler prioritizes uninitialized chunks and excludes materialized fine chunks',()=>{
  const now=1_010_000;
  const stable=chunk('stable');
  const fresh=chunk('fresh',{decisionVersion:0,lastDecisionAt:0});
  const fine=chunk('fine',{decisionVersion:0,lastDecisionAt:0});
  const baselines=new Map([[stable.id,captureChunkDecisionSignal(stable,now-1000)]]);
  const ranked=rankChunkDecisionCandidates([stable,fresh,fine],baselines,now,new Set(['fine']),8);
  assert.deepEqual(ranked.map(x=>x.chunk.id),['fresh','stable']);
  assert.equal(ranked[0]?.needsBaseline,true);
});

test('state surprise raises urgency without changing authoritative chunk state',()=>{
  const now=2_000_000;
  const stable=chunk('stable',{lastDecisionAt:now-10_000});
  const changed=chunk('changed',{lastDecisionAt:now-10_000});
  const stableBaseline=captureChunkDecisionSignal(stable,now-10_000);
  const changedBaseline=captureChunkDecisionSignal(changed,now-10_000);
  changed.food=35;
  changed.water=40;
  changed.danger=65;
  const before={food:changed.food,water:changed.water,danger:changed.danger};
  const baselines=new Map([[stable.id,stableBaseline],[changed.id,changedBaseline]]);
  const ranked=rankChunkDecisionCandidates([stable,changed],baselines,now,new Set(),2);
  assert.equal(ranked[0]?.chunk.id,'changed');
  assert.ok((ranked[0]?.surprise||0)>8);
  assert.deepEqual({food:changed.food,water:changed.water,danger:changed.danger},before);
});

test('pressure includes scarcity, instability and bounded decision staleness',()=>{
  const now=3_000_000;
  const calm=chunk('calm',{lastDecisionAt:now-5_000});
  const stressed=chunk('stressed',{food:15,water:20,ecology:25,danger:80,lastDecisionAt:now-180_000});
  assert.ok(chunkDecisionPressure(stressed,now)>chunkDecisionPressure(calm,now));
  const baseline=captureChunkDecisionSignal(calm,now);
  assert.equal(chunkDecisionSurprise(calm,baseline),0);
});

test('adaptive delay wakes quickly for surprise and backs off for calm state',()=>{
  const now=4_000_000;
  const calm=chunk('calm',{food:95,water:95,ecology:95,danger:0,lastDecisionAt:now});
  const calmBaseline=new Map([[calm.id,captureChunkDecisionSignal(calm,now)]]);
  const calmRanked=rankChunkDecisionCandidates([calm],calmBaseline,now,new Set(),1);
  assert.equal(nextChunkDecisionDelay(calmRanked),30_000);

  const surprised=chunk('surprised',{food:30,water:35,ecology:55,danger:60,lastDecisionAt:now});
  const old=captureChunkDecisionSignal(chunk('old',{food:90,water:90,ecology:90,danger:5,lastDecisionAt:now}),now);
  const urgent=rankChunkDecisionCandidates([surprised],new Map([[surprised.id,old]]),now,new Set(),1);
  assert.equal(nextChunkDecisionDelay(urgent),4_000);
});


test('bounded decision scan rotates through discovered ids without starvation',()=>{
  const ids=Array.from({length:10},(_,i)=>`chunk_${i}`);
  const first=boundedDecisionIdWindow(ids,0,4);
  assert.deepEqual(first.ids,['chunk_0','chunk_1','chunk_2','chunk_3']);
  assert.equal(first.nextCursor,4);
  const second=boundedDecisionIdWindow(ids,first.nextCursor,4);
  const third=boundedDecisionIdWindow(ids,second.nextCursor,4);
  assert.deepEqual(second.ids,['chunk_4','chunk_5','chunk_6','chunk_7']);
  assert.deepEqual(third.ids,['chunk_8','chunk_9','chunk_0','chunk_1']);
  assert.equal(third.nextCursor,2);
  assert.equal(third.total,10);
});

test('bounded decision scan preserves full-world behavior below the cap',()=>{
  const ids=['chunk_b','chunk_a','chunk_c'];
  const window=boundedDecisionIdWindow(ids,2,256);
  assert.deepEqual(window.ids,ids);
  assert.equal(window.nextCursor,0);
  assert.equal(window.scanned,3);
});
