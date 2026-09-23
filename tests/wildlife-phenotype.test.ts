import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveWildlifeMorphology,
  founderWildlifePhenotype,
  inheritWildlifePhenotype,
  normalizeWildlifePhenotype,
  wildlifeBehaviorThresholds,
  wildlifeFunctionalPhenotype
} from '../src/world/wildlifePhenotype.js';

test('founder wildlife phenotype is deterministic and bounded around the species baseline',()=>{
  const a=founderWildlifePhenotype('rabbit_founder_1');
  const b=founderWildlifePhenotype('rabbit_founder_1');
  assert.deepEqual(a,b);

  for(const value of Object.values(a.morphology))assert.ok(value>=.75&&value<=1.25);
  for(const value of Object.values(a.behavior))assert.ok(value>=.70&&value<=1.30);
  assert.deepEqual(normalizeWildlifePhenotype(undefined,'rabbit_founder_1'),a);
});

test('offspring phenotype deterministically inherits parental midpoint with bounded mutation',()=>{
  const mother={
    morphology:{bodyLength:.9,bodyHeight:.9,legLength:.9,headScale:.9,tailScale:.9},
    behavior:{forageDrive:.8,migrationDrive:.8,riskTolerance:.8,recoveryDrive:.8}
  };
  const father={
    morphology:{bodyLength:1.1,bodyHeight:1.1,legLength:1.1,headScale:1.1,tailScale:1.1},
    behavior:{forageDrive:1.2,migrationDrive:1.2,riskTolerance:1.2,recoveryDrive:1.2}
  };
  const child=inheritWildlifePhenotype(mother,father,'offspring_1');
  assert.deepEqual(child,inheritWildlifePhenotype(mother,father,'offspring_1'));
  for(const value of Object.values(child.morphology))assert.ok(Math.abs(value-1)<=.046);
  for(const value of Object.values(child.behavior))assert.ok(Math.abs(value-1)<=.056);
});

test('morphology genes scale constrained procedural dimensions without changing species features',()=>{
  const phenotype=normalizeWildlifePhenotype({
    morphology:{bodyLength:1.2,bodyHeight:.9,legLength:1.1,headScale:.85,tailScale:1.2},
    behavior:{forageDrive:1,migrationDrive:1,riskTolerance:1,recoveryDrive:1}
  },'badger_shape');
  const effective=effectiveWildlifeMorphology('badger',phenotype);
  const neutral=effectiveWildlifeMorphology('badger',normalizeWildlifePhenotype({
    morphology:{bodyLength:1,bodyHeight:1,legLength:1,headScale:1,tailScale:1},
    behavior:{forageDrive:1,migrationDrive:1,riskTolerance:1,recoveryDrive:1}
  },'badger_neutral'));
  assert.ok(effective.bodyX>neutral.bodyX);
  assert.ok(effective.bodyY<neutral.bodyY);
  assert.ok(effective.legHeight>neutral.legHeight);
  assert.ok(effective.headSize<neutral.headSize);
  assert.ok((effective.tailLength||0)>(neutral.tailLength||0));
  assert.deepEqual(effective.features,neutral.features);
});

test('behavior phenotype thresholds change bounded fallback tendencies monotonically',()=>{
  const cautious=normalizeWildlifePhenotype({
    morphology:{bodyLength:1,bodyHeight:1,legLength:1,headScale:1,tailScale:1},
    behavior:{forageDrive:.75,migrationDrive:.75,riskTolerance:.7,recoveryDrive:.75}
  },'cautious');
  const bold=normalizeWildlifePhenotype({
    morphology:{bodyLength:1,bodyHeight:1,legLength:1,headScale:1,tailScale:1},
    behavior:{forageDrive:1.25,migrationDrive:1.25,riskTolerance:1.3,recoveryDrive:1.25}
  },'bold');
  const a=wildlifeBehaviorThresholds(cautious);
  const b=wildlifeBehaviorThresholds(bold);
  assert.ok(a.fleeDistance>b.fleeDistance);
  assert.ok(a.hungerThreshold>b.hungerThreshold);
  assert.ok(a.migrationGain>b.migrationGain);
  assert.ok(a.diseaseRestThreshold>b.diseaseRestThreshold);
  assert.ok(a.energyRestThreshold<b.energyRestThreshold);
});

test('functional phenotype exposes bounded speed-efficiency trade-offs instead of pure buffs',()=>{
  const neutral=wildlifeFunctionalPhenotype(normalizeWildlifePhenotype({
    morphology:{bodyLength:1,bodyHeight:1,legLength:1,headScale:1,tailScale:1},
    behavior:{forageDrive:1,migrationDrive:1,riskTolerance:1,recoveryDrive:1}
  },'neutral_function'));
  const longLegged=wildlifeFunctionalPhenotype(normalizeWildlifePhenotype({
    morphology:{bodyLength:1,bodyHeight:1,legLength:1.2,headScale:1,tailScale:1},
    behavior:{forageDrive:1,migrationDrive:1,riskTolerance:1,recoveryDrive:1}
  },'long_legged_function'));
  const bulky=wildlifeFunctionalPhenotype(normalizeWildlifePhenotype({
    morphology:{bodyLength:1.2,bodyHeight:1.18,legLength:.8,headScale:1.1,tailScale:1},
    behavior:{forageDrive:1,migrationDrive:1,riskTolerance:1,recoveryDrive:1}
  },'bulky_function'));
  assert.ok(longLegged.movementSpeedMultiplier>neutral.movementSpeedMultiplier);
  assert.ok(longLegged.movementEnergyMultiplier>neutral.movementEnergyMultiplier,'speed gain must carry a locomotion cost');
  assert.ok(bulky.maintenanceMultiplier>neutral.maintenanceMultiplier);
  assert.ok(bulky.movementSpeedMultiplier<neutral.movementSpeedMultiplier);
  for(const profile of [neutral,longLegged,bulky]){
    assert.ok(profile.movementSpeedMultiplier>=.88&&profile.movementSpeedMultiplier<=1.12);
    assert.ok(profile.movementEnergyMultiplier>=.90&&profile.movementEnergyMultiplier<=1.14);
    assert.ok(profile.maintenanceMultiplier>=.90&&profile.maintenanceMultiplier<=1.12);
  }
});

test('forage and recovery function remain narrow deterministic efficiencies',()=>{
  const low=wildlifeFunctionalPhenotype(normalizeWildlifePhenotype({
    morphology:{bodyLength:1,bodyHeight:1.1,legLength:1,headScale:.85,tailScale:1},
    behavior:{forageDrive:.75,migrationDrive:1,riskTolerance:1,recoveryDrive:.75}
  },'low_efficiency'));
  const high=wildlifeFunctionalPhenotype(normalizeWildlifePhenotype({
    morphology:{bodyLength:1,bodyHeight:.9,legLength:1,headScale:1.15,tailScale:1},
    behavior:{forageDrive:1.25,migrationDrive:1,riskTolerance:1,recoveryDrive:1.25}
  },'high_efficiency'));
  assert.ok(high.forageEfficiency>low.forageEfficiency);
  assert.ok(high.recoveryEfficiency>low.recoveryEfficiency);
  assert.ok(low.forageEfficiency>=.92&&high.forageEfficiency<=1.08);
  assert.ok(low.recoveryEfficiency>=.92&&high.recoveryEfficiency<=1.08);
});

