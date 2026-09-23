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
