import test from 'node:test';
import assert from 'node:assert/strict';
import { WILDLIFE_MOVEMENT_ARCHETYPES } from '../src/world/wildlifeArchetypes.js';
import { approachWildlifeHeading, stepWildlifeMovementController } from '../src/world/wildlifeMovementController.js';

test('wildlife controller accelerates toward max speed instead of teleporting to full velocity',()=>{
  const profile=WILDLIFE_MOVEMENT_ARCHETYPES.generalist;
  const step=stepWildlifeMovementController({
    x:0,z:0,targetX:0,targetZ:10,maxSpeed:4,dt:.1,profile,
    state:{speed:0,heading:0}
  });
  assert.equal(step.arrived,false);
  assert.ok(step.speed>0);
  assert.ok(step.speed<=4*profile.accelerationRate*.1+1e-9);
  assert.ok(step.speed<4);
  assert.ok(step.dz>0);
  assert.ok(Math.abs(step.dx)<1e-9);
});

test('movement archetype turn rates create deterministic controller differences',()=>{
  const heavy=WILDLIFE_MOVEMENT_ARCHETYPES.heavyGrazer;
  const nimble=WILDLIFE_MOVEMENT_ARCHETYPES.dexterousForager;
  const base={x:0,z:0,targetX:10,targetZ:0,maxSpeed:3,dt:.1,state:{speed:1,heading:0}};
  const heavyStep=stepWildlifeMovementController({...base,profile:heavy});
  const nimbleStep=stepWildlifeMovementController({...base,profile:nimble});
  assert.ok(heavyStep.heading>0);
  assert.ok(nimbleStep.heading>heavyStep.heading);
  assert.ok(Math.abs(heavyStep.heading-heavy.turnRate*.1)<1e-9);
  assert.ok(Math.abs(nimbleStep.heading-nimble.turnRate*.1)<1e-9);
});

test('controller slows during sharp turns and never exceeds configured max speed',()=>{
  const profile=WILDLIFE_MOVEMENT_ARCHETYPES.cursorial;
  const step=stepWildlifeMovementController({
    x:0,z:0,targetX:10,targetZ:0,maxSpeed:5,dt:.1,profile,
    state:{speed:5,heading:0}
  });
  assert.ok(step.speed<5);
  assert.ok(step.speed>=0);
  assert.ok(Math.hypot(step.dx,step.dz)<=step.speed*.1+1e-9);
});

test('controller accepts a waypoint inside the movement-specific arrival radius',()=>{
  const profile=WILDLIFE_MOVEMENT_ARCHETYPES.heavyGrazer;
  const step=stepWildlifeMovementController({
    x:0,z:0,targetX:profile.arrivalRadius*.8,targetZ:0,maxSpeed:3,dt:.05,profile,
    state:{speed:2,heading:0}
  });
  assert.equal(step.arrived,true);
  assert.equal(step.dx,0);
  assert.equal(step.dz,0);
  assert.equal(step.speed,0);
  assert.equal(step.gait,'trudge');
});

test('heading approach uses the shortest wrapped angular path',()=>{
  const start=Math.PI-.05;
  const target=-Math.PI+.05;
  const next=approachWildlifeHeading(start,target,.04);
  assert.ok(next<0||next>Math.PI-.02);
  const remaining=Math.atan2(Math.sin(target-next),Math.cos(target-next));
  assert.ok(Math.abs(remaining)<.11);
});
