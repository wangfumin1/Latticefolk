import test from 'node:test';
import assert from 'node:assert/strict';
import { WILDLIFE_MOVEMENT_ARCHETYPES } from '../src/world/wildlifeArchetypes.js';
import { stepWildlifeMovementController } from '../src/world/wildlifeMovement.js';

test('cursorial controller accelerates faster than heavy grazer on the same legal path segment',()=>{
  const cursorial=stepWildlifeMovementController(
    {speed:0,heading:0},WILDLIFE_MOVEMENT_ARCHETYPES.cursorial,3,0,8,.10
  );
  const heavy=stepWildlifeMovementController(
    {speed:0,heading:0},WILDLIFE_MOVEMENT_ARCHETYPES.heavyGrazer,3,0,8,.10
  );
  assert.ok(cursorial.speed>heavy.speed);
  assert.ok(cursorial.travelDistance>heavy.travelDistance);
  assert.equal(cursorial.arrived,false);
  assert.equal(heavy.arrived,false);
});

test('movement archetypes bound visual turning without changing path translation direction',()=>{
  const cursorial=stepWildlifeMovementController(
    {speed:1,heading:0},WILDLIFE_MOVEMENT_ARCHETYPES.cursorial,2,Math.PI/2,5,.10
  );
  const heavy=stepWildlifeMovementController(
    {speed:1,heading:0},WILDLIFE_MOVEMENT_ARCHETYPES.heavyGrazer,2,Math.PI/2,5,.10
  );
  assert.ok(cursorial.heading>heavy.heading);
  assert.ok(cursorial.heading<=WILDLIFE_MOVEMENT_ARCHETYPES.cursorial.turnRate*.10+1e-9);
  assert.ok(heavy.heading<=WILDLIFE_MOVEMENT_ARCHETYPES.heavyGrazer.turnRate*.10+1e-9);
  assert.ok(cursorial.travelDistance>0);
  assert.ok(heavy.travelDistance>0);
});

test('controller brakes into waypoint radius without overshooting the legal segment',()=>{
  const movement=WILDLIFE_MOVEMENT_ARCHETYPES.cursorial;
  const distance=.20;
  const step=stepWildlifeMovementController(
    {speed:3,heading:0},movement,3,0,distance,.10
  );
  const legalTravel=distance-movement.arrivalRadius;
  assert.ok(step.speed<3);
  assert.ok(step.travelDistance<=legalTravel+1e-9);
  assert.equal(step.arrived,true);
});

test('controller step is deterministic and clamps oversized frame deltas',()=>{
  const movement=WILDLIFE_MOVEMENT_ARCHETYPES.dexterousForager;
  const input={speed:.7,heading:-2.9};
  const a=stepWildlifeMovementController(input,movement,2.4,2.8,4,.25);
  const b=stepWildlifeMovementController(input,movement,2.4,2.8,4,.10);
  const c=stepWildlifeMovementController(input,movement,2.4,2.8,4,.25);
  assert.deepEqual(a,b,'controller clamps dt to 100ms');
  assert.deepEqual(a,c,'same state and inputs produce the same motion step');
  assert.ok(a.speedRatio>=0&&a.speedRatio<=1.25);
});

test('controller recognizes an already-reached waypoint and decelerates without translation',()=>{
  const movement=WILDLIFE_MOVEMENT_ARCHETYPES.generalist;
  const step=stepWildlifeMovementController(
    {speed:1.2,heading:.4},movement,2,.4,movement.arrivalRadius*.5,.05
  );
  assert.equal(step.arrived,true);
  assert.equal(step.travelDistance,0);
  assert.ok(step.speed<1.2);
});
