import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialHashIndex } from '../src/world/spatialHash.js';

type Entry={id:string;minX:number;maxX:number;minZ:number;maxZ:number;kind?:string};

test('spatial hash finds overlapping entries across cell boundaries without duplicates',()=>{
  const index=new SpatialHashIndex<Entry>(4);
  index.upsert({id:'large',minX:-1,maxX:9,minZ:-1,maxZ:1});
  index.upsert({id:'east',minX:8.5,maxX:9.5,minZ:-.5,maxZ:.5});
  const hits=index.query({minX:8,maxX:9,minZ:-1,maxZ:1});
  assert.deepEqual(hits.map(x=>x.id),['east','large']);
  assert.equal(hits.filter(x=>x.id==='large').length,1);
});

test('spatial hash upsert removes stale memberships before reindexing',()=>{
  const index=new SpatialHashIndex<Entry>(4);
  index.upsert({id:'moving',minX:0,maxX:1,minZ:0,maxZ:1});
  assert.deepEqual(index.query({minX:-1,maxX:2,minZ:-1,maxZ:2}).map(x=>x.id),['moving']);
  index.upsert({id:'moving',minX:20,maxX:21,minZ:20,maxZ:21});
  assert.deepEqual(index.query({minX:-1,maxX:2,minZ:-1,maxZ:2}),[]);
  assert.deepEqual(index.query({minX:19,maxX:22,minZ:19,maxZ:22}).map(x=>x.id),['moving']);
});

test('spatial hash normalizes reversed bounds and supports explicit removal',()=>{
  const index=new SpatialHashIndex<Entry>(5);
  const stored=index.upsert({id:'reversed',minX:3,maxX:-2,minZ:4,maxZ:-1});
  assert.deepEqual({minX:stored.minX,maxX:stored.maxX,minZ:stored.minZ,maxZ:stored.maxZ},{minX:-2,maxX:3,minZ:-1,maxZ:4});
  assert.equal(index.size,1);
  assert.equal(index.remove('reversed'),true);
  assert.equal(index.size,0);
  assert.equal(index.cellCount,0);
});

test('spatial hash query order is deterministic by id',()=>{
  const index=new SpatialHashIndex<Entry>(8);
  index.upsert({id:'zeta',minX:0,maxX:1,minZ:0,maxZ:1});
  index.upsert({id:'alpha',minX:0,maxX:1,minZ:0,maxZ:1});
  index.upsert({id:'mid',minX:0,maxX:1,minZ:0,maxZ:1});
  assert.deepEqual(index.query({minX:-1,maxX:2,minZ:-1,maxZ:2}).map(x=>x.id),['alpha','mid','zeta']);
});
