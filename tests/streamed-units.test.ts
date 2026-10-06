import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CoarseWorldRuntime } from '../src/world/coarseWorld.js';
import { fineTerrainSurfaceForChunk, homeTerrainSurface } from '../src/world/fineTerrain.js';
import {
  STREAMED_UNIT_SIZE, STREAMED_UNIT_COARSE_SIZE, STREAMED_MAIN_ROAD_WIDTH,
  isHomeStreamedUnit, streamedUnitAt, streamedUnitAtWorld, streamedUnitBounds,
  streamedUnitForCoarseCell, streamedUnitId, streamedUnitOwnerCells,
  streamedUnitRoadConnection, streamedUnitRoadEdgeKey, type StreamedUnitSide
} from '../src/world/streamedUnits.js';

test('72 m home unit exactly covers the authored town and its nine legacy owner cells',()=>{
  assert.equal(STREAMED_UNIT_SIZE,72);
  assert.equal(STREAMED_UNIT_COARSE_SIZE,24);
  assert.deepEqual(streamedUnitAtWorld(0,0),{
    id:'unit_0_0',ux:0,uz:0,bounds:{minX:-36,maxX:36,minZ:-36,maxZ:36},isHome:true
  });
  const terrain=homeTerrainSurface(72);
  assert.deepEqual(streamedUnitBounds(0,0),{
    minX:terrain.minX,maxX:terrain.maxX,minZ:terrain.minZ,maxZ:terrain.maxZ
  });
  assert.deepEqual(streamedUnitOwnerCells(0,0),[
    {id:'chunk_-1_-1',cx:-1,cz:-1},{id:'chunk_0_-1',cx:0,cz:-1},{id:'chunk_1_-1',cx:1,cz:-1},
    {id:'chunk_-1_0',cx:-1,cz:0},{id:'chunk_0_0',cx:0,cz:0},{id:'chunk_1_0',cx:1,cz:0},
    {id:'chunk_-1_1',cx:-1,cz:1},{id:'chunk_0_1',cx:0,cz:1},{id:'chunk_1_1',cx:1,cz:1}
  ]);
  assert.equal(isHomeStreamedUnit(0,0),true);
  for(const [ux,uz] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1]]){
    assert.equal(isHomeStreamedUnit(ux,uz),false);
    assert.equal(streamedUnitAt(ux,uz).isHome,false);
  }
});

test('all four home edges and corners use the same half-open ownership rule',()=>{
  const cases=[
    [-36,0,0,0],[36,0,1,0],[0,-36,0,0],[0,36,0,1],
    [-36,-36,0,0],[36,-36,1,0],[-36,36,0,1],[36,36,1,1]
  ];
  for(const [x,z,ux,uz] of cases){
    assert.deepEqual(streamedUnitAtWorld(x,z),streamedUnitAt(ux,uz),`${x},${z}`);
  }
  for(const x of [-35.999999,0,35.999999]){
    for(const z of [-35.999999,0,35.999999])assert.equal(streamedUnitAtWorld(x,z).isHome,true);
  }
});

test('world mapping crosses ±36 and ±108 consistently on both axes, including negatives',()=>{
  const epsilon=1e-6;
  for(const [boundary,lower,upper] of [[-108,-2,-1],[-36,-1,0],[36,0,1],[108,1,2]]){
    for(const [offset,expected] of [[-epsilon,lower],[0,upper],[epsilon,upper]]){
      const coordinate=boundary+offset;
      assert.equal(streamedUnitAtWorld(coordinate,0).ux,expected);
      assert.equal(streamedUnitAtWorld(0,coordinate).uz,expected);
      assert.deepEqual(streamedUnitAtWorld(coordinate,coordinate),streamedUnitAt(expected,expected));
    }
  }
  assert.equal(streamedUnitId(-2,3),'unit_-2_3');
  assert.deepEqual(streamedUnitAt(-0,-0),streamedUnitAt(0,0));
});

test('adjacent unit bounds meet exactly with no overlap or gaps in either direction',()=>{
  for(let ux=-3;ux<=3;ux++){
    for(let uz=-3;uz<=3;uz++){
      const unit=streamedUnitBounds(ux,uz);
      const east=streamedUnitBounds(ux+1,uz);
      const south=streamedUnitBounds(ux,uz+1);
      assert.equal(unit.maxX-unit.minX,72);
      assert.equal(unit.maxZ-unit.minZ,72);
      assert.equal(unit.maxX,east.minX);
      assert.equal(unit.minZ,east.minZ);
      assert.equal(unit.maxZ,east.maxZ);
      assert.equal(unit.maxZ,south.minZ);
      assert.equal(unit.minX,south.minX);
      assert.equal(unit.maxX,south.maxX);
      assert.equal(streamedUnitAtWorld(unit.maxX,uz*72).id,streamedUnitId(ux+1,uz));
      assert.equal(streamedUnitAtWorld(ux*72,unit.maxZ).id,streamedUnitId(ux,uz+1));
    }
  }
});

test('each unit partitions into exactly nine unchanged 24 m owner footprints',()=>{
  const seen=new Set<string>();
  for(let ux=-2;ux<=2;ux++){
    for(let uz=-2;uz<=2;uz++){
      const unit=streamedUnitAt(ux,uz);
      const cells=streamedUnitOwnerCells(ux,uz);
      assert.equal(cells.length,9);
      assert.equal(new Set(cells.map(cell=>cell.id)).size,9);
      let area=0;
      for(const cell of cells){
        assert.equal(seen.has(cell.id),false,`${cell.id} has one unit owner`);
        seen.add(cell.id);
        assert.deepEqual(streamedUnitForCoarseCell(cell.cx,cell.cz),unit);
        const bounds=fineTerrainSurfaceForChunk(cell,24);
        area+=(bounds.maxX-bounds.minX)*(bounds.maxZ-bounds.minZ);
        assert.ok(bounds.minX>=unit.bounds.minX&&bounds.maxX<=unit.bounds.maxX);
        assert.ok(bounds.minZ>=unit.bounds.minZ&&bounds.maxZ<=unit.bounds.maxZ);
        for(const dx of [-11.999999,0,11.999999]){
          for(const dz of [-11.999999,0,11.999999]){
            assert.deepEqual(streamedUnitAtWorld(cell.cx*24+dx,cell.cz*24+dz),unit);
          }
        }
      }
      assert.equal(area,72*72);
    }
  }
  assert.equal(seen.size,25*9);
});

test('unit grouping preserves CoarseWorldRuntime ownership and chunk IDs at boundaries',()=>{
  const coarse=new CoarseWorldRuntime(new THREE.Scene(),'streamed-unit-ownership');
  assert.equal(coarse.chunkSize,24);
  const coordinates=[-108.000001,-108,-107.999999,-36.000001,-36,-35.999999,-12,0,12,
    35.99999999999999,36,36.000001,107.999999,108,108.000001];
  for(const x of coordinates){
    for(const z of coordinates){
      const cx=Math.floor((x+12)/24);
      const cz=Math.floor((z+12)/24);
      const unit=streamedUnitAtWorld(x,z);
      assert.ok(streamedUnitOwnerCells(unit.ux,unit.uz).some(cell=>cell.cx===cx&&cell.cz===cz));
      const expectedHome=Math.abs(cx)<=1&&Math.abs(cz)<=1;
      assert.equal(unit.isHome,expectedHome);
      const expected=coarse.ensureChunk(cx,cz);
      assert.equal(coarse.chunkAtWorld(x,z),expected);
      if(expectedHome)assert.equal(expected,undefined);
      else assert.equal(expected?.id,`chunk_${cx}_${cz}`);
    }
  }
});

test('neighboring units share centered 4 m road connections and canonical edge keys',()=>{
  assert.equal(STREAMED_MAIN_ROAD_WIDTH,4);
  for(let ux=-2;ux<=2;ux++){
    for(let uz=-2;uz<=2;uz++){
      const bounds=streamedUnitBounds(ux,uz);
      const west=streamedUnitRoadConnection(ux,uz,'west');
      const east=streamedUnitRoadConnection(ux,uz,'east');
      const north=streamedUnitRoadConnection(ux,uz,'north');
      const south=streamedUnitRoadConnection(ux,uz,'south');
      assert.deepEqual(west,streamedUnitRoadConnection(ux-1,uz,'east'));
      assert.deepEqual(east,streamedUnitRoadConnection(ux+1,uz,'west'));
      assert.deepEqual(north,streamedUnitRoadConnection(ux,uz-1,'south'));
      assert.deepEqual(south,streamedUnitRoadConnection(ux,uz+1,'north'));
      assert.deepEqual([west.x,east.x,north.z,south.z],[bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ]);
      assert.deepEqual([west.z,east.z,north.x,south.x],[uz*72,uz*72,ux*72,ux*72]);
      assert.deepEqual([west.axis,east.axis,north.axis,south.axis],['x','x','z','z']);
      assert.ok([west,east,north,south].every(connection=>connection.width===4));
      assert.equal(new Set([west,east,north,south].map(connection=>connection.edgeKey)).size,4);
      for(const side of ['west','east','north','south'] as const){
        assert.equal(streamedUnitRoadEdgeKey(ux,uz,side),streamedUnitRoadConnection(ux,uz,side).edgeKey);
      }
    }
  }
  assert.deepEqual(streamedUnitRoadConnection(0,0,'east'),{
    edgeKey:'unit-edge:x:1:0',x:36,z:0,width:4,axis:'x'
  });
});

test('invalid nonfinite world positions and noninteger or unrepresentable cell/unit indices are rejected',()=>{
  for(const value of [NaN,Infinity,-Infinity,Number.MAX_VALUE]){
    assert.throws(()=>streamedUnitAtWorld(value,0),RangeError);
    assert.throws(()=>streamedUnitAtWorld(0,value),RangeError);
  }
  for(const value of [NaN,Infinity,-Infinity,.5,-.5,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1]){
    for(const fn of [streamedUnitAt,streamedUnitId,streamedUnitBounds,streamedUnitOwnerCells,isHomeStreamedUnit]){
      assert.throws(()=>fn(value,0),RangeError);
      assert.throws(()=>fn(0,value),RangeError);
    }
    assert.throws(()=>streamedUnitForCoarseCell(value,0),RangeError);
    assert.throws(()=>streamedUnitForCoarseCell(0,value),RangeError);
    assert.throws(()=>streamedUnitRoadConnection(value,0,'east'),RangeError);
    assert.throws(()=>streamedUnitRoadConnection(0,value,'north'),RangeError);
    assert.throws(()=>isHomeStreamedUnit(1,value),RangeError);
  }
  assert.throws(()=>streamedUnitRoadConnection(0,0,'invalid' as StreamedUnitSide),RangeError);
});
