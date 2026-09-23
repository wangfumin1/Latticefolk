import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WILDLIFE_HERBIVORES,
  WILDLIFE_PREDATORS,
  WILDLIFE_SPECIES,
  canWildlifePredate,
  wildlifeHungerRelief,
  wildlifePredationDamage,
  wildlifePredationPreference,
  wildlifeSpeciesProfile
} from '../src/world/wildlifeSpecies.js';
import { wildlifeLifeHistory } from '../src/world/wildlifeLifeHistory.js';

test('wildlife species profiles cover every configured species and biome/season axis',()=>{
  assert.ok(WILDLIFE_SPECIES.includes('badger'));
  assert.ok(WILDLIFE_SPECIES.includes('lynx'));
  for(const species of WILDLIFE_SPECIES){
    const profile=wildlifeSpeciesProfile(species);
    for(const biome of ['plains','forest','hills','wetlands','dryland'] as const){
      assert.ok(profile.biomeAffinity[biome]>=0);
      for(const season of ['spring','summer','autumn','winter'] as const){
        assert.ok(profile.seasonalBiomeAffinity[season][biome]>=0);
      }
    }
    assert.ok(profile.baseCarryingCapacity>0);
    assert.ok(profile.growthRate>0);
    assert.equal(wildlifeLifeHistory(species),profile.lifeHistory);
    assert.ok(profile.fine.maxFine>=1);
    assert.ok(profile.morphology.bodyX>0&&profile.morphology.bodyY>0&&profile.morphology.bodyZ>0);
    assert.ok(profile.capabilities.includes('wander'));
    assert.ok(profile.capabilities.includes('rest'));
    assert.ok(profile.capabilities.includes('drink'));
    assert.ok(profile.capabilities.includes(profile.feedingAction));
    assert.equal(profile.capabilities.includes('hunt'),Object.keys(profile.prey).length>0);
    assert.ok(profile.movement.speedMultiplier>.8&&profile.movement.speedMultiplier<1.2);
    assert.ok(profile.movement.energyMultiplier>.8&&profile.movement.energyMultiplier<1.2);
    assert.ok(['wild','domesticated','monster'].includes(profile.form.kind));
    assert.ok(profile.form.settlementSensitivity>=0);
    assert.ok(profile.form.dangerSensitivity>=0);
  }
});

test('badger profile is a true omnivore with both forage and predation semantics',()=>{
  const badger=wildlifeSpeciesProfile('badger');
  assert.equal(badger.trophicRole,'omnivore');
  assert.equal(badger.feedingAction,'forage');
  assert.ok(badger.plantForageWeights.fruit>0);
  assert.ok(badger.herbivoryRate>0);
  assert.ok(badger.predationRate>0);
  assert.ok(badger.forageTags.includes('forage'));
  assert.ok(badger.morphology.features.includes('dorsal_stripe'));
  assert.ok(badger.morphology.features.includes('tail'));

  assert.ok(WILDLIFE_PREDATORS.includes('badger'));
  assert.ok(!WILDLIFE_HERBIVORES.includes('badger'));
  assert.ok(canWildlifePredate('badger','rabbit'));
  assert.ok(wildlifePredationPreference('badger','rabbit')>0);
  assert.ok(wildlifePredationDamage('badger','rabbit')>0);
  assert.ok(wildlifeHungerRelief('badger','rabbit')>0);
  assert.ok(canWildlifePredate('wolf','badger'));
});

test('lynx validates reusable generated archetype composition without species-specific simulation branches',()=>{
  const lynx=wildlifeSpeciesProfile('lynx');
  assert.equal(lynx.archetypeId,'temperate_felid_mesopredator');
  assert.equal(lynx.trophicRole,'predator');
  assert.equal(lynx.herbivoryRate,0);
  assert.deepEqual(lynx.plantConsumptionWeights,{grass:0,shrub:0,fruit:0,crop:0});
  assert.ok(lynx.biomeAffinity.forest>lynx.biomeAffinity.plains);
  assert.ok(lynx.biomeAffinity.hills>lynx.biomeAffinity.wetlands);
  assert.ok(lynx.morphology.features.includes('tail'));
  assert.ok(lynx.morphology.features.includes('ear_tufts'));
  assert.ok(lynx.fine.speed>2.8);
  assert.ok(canWildlifePredate('lynx','rabbit'));
  assert.ok(canWildlifePredate('lynx','goat'));
  assert.ok(canWildlifePredate('wolf','lynx'));
  assert.ok(WILDLIFE_PREDATORS.includes('lynx'));
  assert.ok(!WILDLIFE_HERBIVORES.includes('lynx'));
});

test('bison composes a large grazer with heavy movement and no invented predation capability',()=>{
  const bison=wildlifeSpeciesProfile('bison');
  assert.equal(bison.archetypeId,'open_plains_large_grazer');
  assert.equal(bison.organismFamily,'bovid');
  assert.equal(bison.trophicRole,'herbivore');
  assert.equal(bison.movement.mode,'heavy_grazer');
  assert.ok(bison.capabilities.includes('graze'));
  assert.ok(!bison.capabilities.includes('hunt'));
  assert.ok(bison.plantConsumptionWeights.grass>bison.plantConsumptionWeights.shrub);
  assert.ok(bison.biomeAffinity.plains>bison.biomeAffinity.forest);
  assert.ok(bison.fine.size>1.2);
  assert.ok(bison.morphology.features.includes('horns'));
  assert.ok(WILDLIFE_HERBIVORES.includes('bison'));
  assert.ok(!WILDLIFE_PREDATORS.includes('bison'));
});

test('raccoon composes a small omnivore with legal forage and hunt capabilities',()=>{
  const raccoon=wildlifeSpeciesProfile('raccoon');
  assert.equal(raccoon.archetypeId,'forest_wetland_small_omnivore');
  assert.equal(raccoon.organismFamily,'procyonid');
  assert.equal(raccoon.trophicRole,'omnivore');
  assert.equal(raccoon.movement.mode,'dexterous_forager');
  assert.ok(raccoon.capabilities.includes('forage'));
  assert.ok(raccoon.capabilities.includes('hunt'));
  assert.ok(raccoon.plantForageWeights.fruit>raccoon.plantForageWeights.grass);
  assert.ok(raccoon.biomeAffinity.wetlands>raccoon.biomeAffinity.dryland);
  assert.ok(raccoon.morphology.features.includes('face_mask'));
  assert.ok(raccoon.morphology.features.includes('ringed_tail'));
  assert.ok(canWildlifePredate('raccoon','rabbit'));
  assert.ok(canWildlifePredate('lynx','raccoon'));
  assert.ok(canWildlifePredate('wolf','raccoon'));
  assert.ok(WILDLIFE_PREDATORS.includes('raccoon'));
});

test('organism family ownership is a single species-profile source for composed species',()=>{
  assert.equal(wildlifeSpeciesProfile('lynx').organismFamily,'felid');
  assert.equal(wildlifeSpeciesProfile('bison').organismFamily,'bovid');
  assert.equal(wildlifeSpeciesProfile('raccoon').organismFamily,'procyonid');
});

test('sheep validates domesticated form composition without claiming ownership state',()=>{
  const sheep=wildlifeSpeciesProfile('sheep');
  assert.equal(sheep.archetypeId,'domesticated_open_plains_grazer');
  assert.equal(sheep.form.kind,'domesticated');
  assert.equal(sheep.organismFamily,'bovid');
  assert.equal(sheep.trophicRole,'herbivore');
  assert.ok(sheep.capabilities.includes('graze'));
  assert.ok(!sheep.capabilities.includes('hunt'));
  assert.ok(sheep.form.settlementSensitivity<1);
  assert.ok(canWildlifePredate('wolf','sheep'));
  assert.ok(WILDLIFE_HERBIVORES.includes('sheep'));
});

test('warg validates monster form composition through the shared predator graph',()=>{
  const warg=wildlifeSpeciesProfile('warg');
  assert.equal(warg.archetypeId,'monster_temperate_large_canid');
  assert.equal(warg.form.kind,'monster');
  assert.equal(warg.organismFamily,'canid');
  assert.equal(warg.trophicRole,'predator');
  assert.ok(warg.capabilities.includes('hunt'));
  assert.ok(warg.form.dangerSensitivity<1);
  assert.ok(canWildlifePredate('warg','sheep'));
  assert.ok(canWildlifePredate('warg','deer'));
  assert.ok(WILDLIFE_PREDATORS.includes('warg'));
});

