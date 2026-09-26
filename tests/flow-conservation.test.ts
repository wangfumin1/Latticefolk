import test from 'node:test';
import assert from 'node:assert/strict';
import type { CoarseChunkState } from '../src/types.js';
import { applyConservedFlows, type WorldFlowKind, type WorldFlowRecord } from '../src/world/flows.js';

const bounded = ['food','wood','water','ecology'] as const;
const kinds:Record<typeof bounded[number],WorldFlowKind> = {
  food:'food_trade',wood:'wood_trade',water:'water_trade',ecology:'ecology_spread'
};
const chunk=(id:string,value=50):CoarseChunkState=>({
  id,cx:0,cz:0,biome:'plains',settlementLevel:1,population:value,
  food:value,wood:value,water:value,ecology:value,danger:20,prosperity:50,
  strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',lastDecisionAt:0,decisionVersion:0
});
const flow=(kind:WorldFlowKind,amount:number,fromChunkId='a',toChunkId='b'):WorldFlowRecord=>({
  id:'transfer',kind,amount,fromChunkId,toChunkId,day:3,minuteOfDay:600,reason:'test_transfer'
});
const close=(actual:number,expected:number,tolerance=1e-10)=>
  assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);

for(const resource of bounded){
  test(`${resource}: capacity bounds debit, credit and provenance to the same actual amount`,()=>{
    const a=chunk('a',50),b=chunk('b',99);
    const request=flow(kinds[resource],10);
    const receipts=applyConservedFlows(new Map([['a',a],['b',b]]),[request]);
    assert.equal(a[resource],49);
    assert.equal(b[resource],100);
    assert.deepEqual(receipts,[{...request,amount:1}]);
    assert.equal(request.amount,10,'planning records must not be rewritten');
    assert.deepEqual(applyConservedFlows(new Map([['a',a],['b',b]]),[request]),[]);
    assert.equal(a[resource],49,'full destinations must not consume source stock');
  });
}

for(const [resource,kind] of [...bounded.map(r=>[r,kinds[r]] as const),['population','migration'] as const]){
  test(`${resource}: transfers preserve existing sub-mill precision`,()=>{
    const a=chunk('a',1.0004),b=chunk('b',2.0004);
    const receipt=applyConservedFlows(new Map([['a',a],['b',b]]),[flow(kind,.1)])[0]!;
    close(a[resource],.9004);
    close(b[resource],2.1004);
    close(a[resource]+b[resource],3.0008);
    close(1.0004-a[resource],receipt.amount);
    close(b[resource]-2.0004,receipt.amount);
  });
}

test('sequential requests respect both current source stock and current destination room',()=>{
  const a=chunk('a',.75),b=chunk('b',99),c=chunk('c',20);
  const chunks=new Map([['a',a],['b',b],['c',c]]);
  const requests=[flow('food_trade',5),flow('food_trade',5),flow('food_trade',5,'c','b')];
  const receipts=applyConservedFlows(chunks,requests);
  assert.deepEqual(receipts.map(r=>r.amount),[.75,.25]);
  assert.equal(a.food,0);
  assert.equal(b.food,100);
  assert.equal(c.food,19.75);
  close(a.food+b.food+c.food,119.75);
});

test('invalid, self, aliased, nonfinite and missing transfers are mutation-free',()=>{
  const a=chunk('a',2.0004),b=chunk('b',3.0004);
  const chunks=new Map([['a',a],['b',b],['alias',a]]);
  const before=structuredClone([a,b]);
  const requests=[
    ...[NaN,Infinity,-Infinity,0,-1].map(amount=>flow('food_trade',amount)),
    flow('food_trade',.1,'a','a'),flow('migration',.1,'a','alias'),
    flow('water_trade',1,'missing','b'),flow('unknown' as WorldFlowKind,1)
  ];
  assert.deepEqual(applyConservedFlows(chunks,requests),[]);
  assert.deepEqual([a,b],before);
});

test('corrupt balances and unrepresentable population credits cannot cause partial debits',()=>{
  for(const value of [NaN,Infinity,-1,101]){
    const a=chunk('a',50),b=chunk('b',value);
    const before=structuredClone([a,b]);
    assert.deepEqual(applyConservedFlows(new Map([['a',a],['b',b]]),[flow('wood_trade',10)]),[]);
    assert.deepEqual([a,b],before);
    assert.deepEqual(applyConservedFlows(new Map([['a',b],['b',a]]),[flow('wood_trade',10)]),[]);
    assert.deepEqual([a,b],before);
  }
  for(const [source,target,amount] of [[10,Number.MAX_VALUE,1],[Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE]] as const){
    const a=chunk('a',source),b=chunk('b',target);
    assert.deepEqual(applyConservedFlows(new Map([['a',a],['b',b]]),[flow('migration',amount)]),[]);
    assert.equal(a.population,source);
    assert.equal(b.population,target);
  }
});

test('migration uses source availability without inventing a new population capacity',()=>{
  const a=chunk('a',4.1254),b=chunk('b',200);
  const receipts=applyConservedFlows(new Map([['a',a],['b',b]]),[flow('migration',20)]);
  assert.equal(a.population,0);
  close(b.population,204.1254);
  assert.equal(receipts[0]?.amount,4.1254);
});

test('deterministic mixed transfer stress preserves unrounded totals and bounded resources',()=>{
  let seed=123456789;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const states=Array.from({length:12},(_,i)=>chunk(`c${i}`,random()*100));
  const chunks=new Map(states.map(c=>[c.id,c]));
  const resources=[...bounded,'population'] as const;
  const total=(r:typeof resources[number])=>states.reduce((sum,c)=>sum+c[r],0);
  const before=resources.map(total);
  for(let i=0;i<4000;i++){
    const source=states[Math.floor(random()*states.length)]!;
    const target=states[Math.floor(random()*states.length)]!;
    const resource=resources[i%resources.length]!;
    const request=flow(resource==='population'?'migration':kinds[resource],random()*150,source.id,target.id);
    const oldSource=source[resource],oldTarget=target[resource];
    for(const receipt of applyConservedFlows(chunks,[request])){
      close(oldSource-source[resource],receipt.amount);
      close(target[resource]-oldTarget,receipt.amount);
    }
  }
  resources.forEach((r,i)=>close(total(r),before[i]!,1e-8));
  for(const state of states){
    for(const r of bounded)assert.ok(state[r]>=0&&state[r]<=100);
    assert.ok(Number.isFinite(state.population)&&state.population>=0);
  }
});
