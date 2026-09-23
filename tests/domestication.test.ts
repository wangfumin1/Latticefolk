import test from 'node:test';
import assert from 'node:assert/strict';
import type { WildlifeState } from '../src/types.js';
import {
  feedWildlifeForTaming,
  inheritedWildlifeDomestication,
  isWildlifeDomesticationEligible,
  normalizeWildlifeDomestication,
  setWildlifeBreedingPermission,
  setWildlifeDomesticationCommand,
  wildlifeBreedingAllowed,
  wildlifeDomesticationDecisionState,
  wildlifeHasActiveOwnerCommand,
  wildlifePairBreedingAllowed,
  WILDLIFE_TAME_THRESHOLD
} from '../src/world/domestication.js';

const animal=(patch:Partial<WildlifeState>={}):WildlifeState=>({
  id:'sheep_1',chunkId:'chunk_0_0',species:'sheep',position:{x:0,z:0},ageDays:600,
  health:90,hunger:20,thirst:20,energy:80,sex:'female',generation:0,
  traits:{speed:2,size:.9,fertility:.6,wariness:.6},currentAction:'graze',lastDecisionAt:0,birthDay:1,
  ...patch
});

test('only domesticated-form species accept mutable domestication state',()=>{
  assert.equal(isWildlifeDomesticationEligible('sheep'),true);
  assert.equal(isWildlifeDomesticationEligible('bison'),false);
  assert.equal(isWildlifeDomesticationEligible('warg'),false);
  assert.equal(normalizeWildlifeDomestication('warg',{
    tameProgress:100,ownerId:'player',command:'follow',breedingAllowed:true
  }),undefined);
});

test('taming feed progresses deterministically and claims only at the threshold',()=>{
  let state=normalizeWildlifeDomestication('sheep');
  assert.equal(state?.tameProgress,0);
  for(let i=0;i<3;i++){
    const result=feedWildlifeForTaming('sheep',state,'player',2+i);
    assert.equal(result.applied,true);
    assert.equal(result.claimed,false);
    state=result.state;
  }
  assert.equal(state?.tameProgress,75);
  assert.equal(state?.ownerId,undefined);

  const claim=feedWildlifeForTaming('sheep',state,'player',5);
  assert.equal(claim.claimed,true);
  assert.equal(claim.state?.tameProgress,WILDLIFE_TAME_THRESHOLD);
  assert.equal(claim.state?.ownerId,'player');
  assert.equal(claim.state?.command,'none');
  assert.equal(claim.state?.breedingAllowed,false);
  assert.equal(claim.state?.claimedDay,5);
});

test('ownership gates commands and breeding permission',()=>{
  const owned=feedWildlifeForTaming('sheep',undefined,'player',3,4).state!;
  assert.equal(setWildlifeDomesticationCommand('sheep',owned,'npc_farmer','follow',4),undefined);
  const follow=setWildlifeDomesticationCommand('sheep',owned,'player','follow',4)!;
  assert.equal(follow.command,'follow');
  assert.equal(wildlifeHasActiveOwnerCommand(animal({domestication:follow})),true);

  const breeding=setWildlifeBreedingPermission('sheep',follow,'player',true,4.5)!;
  assert.equal(breeding.breedingAllowed,true);
  assert.equal(wildlifeBreedingAllowed(animal({domestication:breeding})),true);
  assert.equal(wildlifeBreedingAllowed(animal({domestication:follow})),false);
});

test('owned breeding requires matching owner permission on both parents and offspring inherits ownership',()=>{
  const motherState=setWildlifeBreedingPermission(
    'sheep',feedWildlifeForTaming('sheep',undefined,'player',2,4).state,'player',true,3
  )!;
  const fatherState=setWildlifeBreedingPermission(
    'sheep',feedWildlifeForTaming('sheep',undefined,'player',2,4).state,'player',true,3
  )!;
  const mother=animal({id:'mother',sex:'female',domestication:motherState});
  const father=animal({id:'father',sex:'male',domestication:fatherState});
  assert.equal(wildlifePairBreedingAllowed(mother,father),true);

  const outsider=animal({
    id:'outsider',sex:'male',
    domestication:feedWildlifeForTaming('sheep',undefined,'npc_farmer',2,4).state
  });
  assert.equal(wildlifePairBreedingAllowed(mother,outsider),false);

  const child=inheritedWildlifeDomestication('sheep',motherState,fatherState,8)!;
  assert.equal(child.ownerId,'player');
  assert.equal(child.tameProgress,100);
  assert.equal(child.command,'none');
  assert.equal(child.breedingAllowed,false);
  assert.equal(child.claimedDay,8);
});

test('unowned domesticated-capable animals retain natural breeding eligibility',()=>{
  const a=animal({id:'wild_sheep_a',sex:'female'});
  const b=animal({id:'wild_sheep_b',sex:'male'});
  assert.equal(wildlifeBreedingAllowed(a),true);
  assert.equal(wildlifePairBreedingAllowed(a,b),true);
});

test('provider-facing domestication state preserves bounded semantics but strips player owner identity',()=>{
  const owned=setWildlifeBreedingPermission(
    'sheep',
    setWildlifeDomesticationCommand(
      'sheep',
      feedWildlifeForTaming('sheep',undefined,'player',2,4).state,
      'player','follow',3
    ),
    'player',true,3
  )!;
  const decision=wildlifeDomesticationDecisionState('sheep',owned)!;
  assert.equal(decision.ownerId,undefined);
  assert.equal(decision.tameProgress,100);
  assert.equal(decision.command,'follow');
  assert.equal(decision.breedingAllowed,true);
  assert.equal(JSON.stringify(decision).includes('player'),false);
});

