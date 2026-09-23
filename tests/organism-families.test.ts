import test from 'node:test';
import assert from 'node:assert/strict';
import type { WildlifeOrganismGenome } from '../src/types.js';
import {
  founderWildlifeOrganismGenome,
  inheritWildlifeOrganismGenome,
  normalizeWildlifeOrganismGenome,
  wildlifeGenomePlantForageWeights,
  wildlifeOrganismFamily,
  wildlifeOrganismLocomotion,
  wildlifeResourceNicheScore
} from '../src/world/organismFamilies.js';

test('founder organism genomes are deterministic and family constrained',()=>{
  const a=founderWildlifeOrganismGenome('rabbit','rabbit_seed');
  const b=founderWildlifeOrganismGenome('rabbit','rabbit_seed');
  const c=founderWildlifeOrganismGenome('rabbit','rabbit_other');
  assert.deepEqual(a,b);
  assert.equal(a.family,'lagomorph');
  assert.equal(wildlifeOrganismFamily('wolf'),'canid');
  assert.notDeepEqual(a,c);
  assert.ok(a.locomotion.stride>=.90&&a.locomotion.stride<=1.12);
  assert.ok(a.material.hueShift>=-.035&&a.material.hueShift<=.035);
});

test('normalization cannot move a genome outside its species family or legal envelope',()=>{
  const invalid={
    family:'canid',
    material:{hueShift:5,lightnessShift:-5,accentShift:4},
    niche:{grass:9,shrub:-2,fruit:8,crop:7},
    locomotion:{stride:5,endurance:-5}
  } as unknown as WildlifeOrganismGenome;
  const normalized=normalizeWildlifeOrganismGenome('rabbit',invalid,'rabbit_invalid');
  assert.equal(normalized.family,'lagomorph');
  assert.equal(normalized.material.hueShift,.035);
  assert.equal(normalized.material.lightnessShift,-.07);
  assert.equal(normalized.niche.grass,1.12);
  assert.equal(normalized.niche.shrub,.90);
  assert.equal(normalized.niche.fruit,1,'unsupported family axis stays neutral');
  assert.equal(normalized.locomotion.stride,1.12);
  assert.equal(normalized.locomotion.endurance,.90);
});

test('inheritance remains bounded and preserves species family',()=>{
  const mother=founderWildlifeOrganismGenome('badger','badger_mother');
  const father=founderWildlifeOrganismGenome('badger','badger_father');
  const child=inheritWildlifeOrganismGenome('badger',mother,father,'badger_child');
  assert.equal(child.family,'mustelid');
  assert.ok(child.niche.shrub>=.88&&child.niche.shrub<=1.14);
  assert.ok(child.niche.fruit>=.88&&child.niche.fruit<=1.14);
  assert.ok(child.locomotion.endurance>=.96&&child.locomotion.endurance<=1.14);
  assert.ok(child.material.lightnessShift>=-.065&&child.material.lightnessShift<=.065);
});

test('locomotion genome encodes stride/endurance trade-offs rather than free speed',()=>{
  const base=founderWildlifeOrganismGenome('goat','goat_base');
  const longStride=normalizeWildlifeOrganismGenome('goat',{
    ...base,locomotion:{stride:1.12,endurance:1}
  },'long_stride');
  const endurance=normalizeWildlifeOrganismGenome('goat',{
    ...base,locomotion:{stride:1,endurance:1.12}
  },'endurance');
  const fast=wildlifeOrganismLocomotion(longStride);
  const efficient=wildlifeOrganismLocomotion(endurance);
  assert.ok(fast.speedMultiplier>1);
  assert.ok(fast.energyMultiplier>1);
  assert.ok(efficient.speedMultiplier<1);
  assert.ok(efficient.energyMultiplier<1);
  assert.ok(fast.speedMultiplier<=1.06&&fast.energyMultiplier<=1.08);
  assert.ok(efficient.speedMultiplier>=.94&&efficient.energyMultiplier>=.92);
});

test('individual niche genes redistribute only legal plant-use axes',()=>{
  const base=founderWildlifeOrganismGenome('badger','badger_niche');
  const fruitBiased=normalizeWildlifeOrganismGenome('badger',{
    ...base,niche:{grass:.94,shrub:.88,fruit:1.14,crop:.90}
  },'fruit_biased');
  const weights=wildlifeGenomePlantForageWeights('badger',fruitBiased);
  const total=weights.grass+weights.shrub+weights.fruit+weights.crop;
  assert.ok(Math.abs(total-1)<1e-9,'fine niche redistributes preference without creating extra plant demand');
  assert.ok(weights.fruit>weights.shrub);
  const fruitScore=wildlifeResourceNicheScore('badger',fruitBiased,['food','forage','fruit','apple'],3);
  const shrubScore=wildlifeResourceNicheScore('badger',fruitBiased,['food','forage','nature'],3);
  assert.ok(fruitScore>shrubScore);

  const wolf=founderWildlifeOrganismGenome('wolf','wolf_niche');
  const wolfWeights=wildlifeGenomePlantForageWeights('wolf',wolf);
  assert.deepEqual(wolfWeights,{grass:0,shrub:0,fruit:0,crop:0},'predator genome cannot invent herbivory');
});
