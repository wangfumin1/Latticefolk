import test from 'node:test';
import assert from 'node:assert/strict';
import type { WildlifeState } from '../src/types.js';
import {
  advanceWildlifeDomestication, canIssueWildlifeDomesticationCommand, domesticationCommandAllowedActions,
  domesticationPreservesSurvivalAction, individualizeWildlifeRepresentative, normalizeWildlifeDomestication,
  releaseWildlifeDomestication, setWildlifeDomesticationCommand, shouldWildlifeFollowPlayerAcrossChunk, wildlifeDomesticationInteractions
} from '../src/world/wildlifeDomestication.js';
import { foldFineWildlifePopulationCount } from '../src/world/fineWildlifeMigration.js';

const sheep=(patch:Partial<WildlifeState>={}):WildlifeState=>({
  id:'sheep_1',chunkId:'chunk_0_0',species:'sheep',position:{x:0,z:0},ageDays:500,
  health:90,hunger:20,thirst:20,energy:80,sex:'female',generation:0,
  traits:{speed:2.1,size:.9,fertility:.58,wariness:.62},currentAction:'wander',lastDecisionAt:0,birthDay:1,...patch
});

test('only domesticated-form species receive mutable domestication state',()=>{
  assert.equal(normalizeWildlifeDomestication('rabbit',undefined),undefined);
  assert.equal(normalizeWildlifeDomestication('warg',undefined),undefined);
  assert.deepEqual(normalizeWildlifeDomestication('sheep',undefined),{
    stage:'feral',progress:0,command:'autonomous',
    ownerKind:undefined,ownerId:undefined,bondedDay:undefined,lastInteractionDay:undefined
  });
});

test('feeding advances sheep deterministically until the individual bonds to one owner',()=>{
  let state=sheep().domestication;
  for(let i=0;i<6;i++){
    state=advanceWildlifeDomestication({...sheep(),domestication:state},5+i*.1,'player','player');
    if(state?.stage==='bonded')break;
  }
  assert.equal(state?.stage,'bonded');
  assert.equal(state?.progress,100);
  assert.equal(state?.ownerKind,'player');
  assert.equal(state?.ownerId,'player');
  assert.equal(state?.command,'follow');
  const takeover=advanceWildlifeDomestication({...sheep(),domestication:state},8,'npc','npc_farmer');
  assert.deepEqual(takeover,state);
});

test('only the bonded owner may issue follow stay or graze commands',()=>{
  const bonded={
    stage:'bonded' as const,progress:100,ownerKind:'player' as const,ownerId:'player',
    command:'follow' as const,bondedDay:4
  };
  assert.equal(canIssueWildlifeDomesticationCommand('sheep',bonded,'player','player'),true);
  assert.equal(canIssueWildlifeDomesticationCommand('sheep',bonded,'npc','farmer'),false);
  assert.equal(setWildlifeDomesticationCommand('sheep',bonded,'stay',5,'player','player')?.command,'stay');
  assert.equal(setWildlifeDomesticationCommand('sheep',bonded,'graze',5,'npc','farmer')?.command,'follow');
});

test('command action filtering preserves bounded survival behavior',()=>{
  const bonded={stage:'bonded' as const,progress:100,ownerKind:'player' as const,ownerId:'player',command:'stay' as const};
  const base=['wander','rest','drink','flee','graze','seek_mate','migrate'] as const;
  assert.deepEqual(domesticationCommandAllowedActions('sheep',bonded,base),['rest','drink','flee','graze']);
  assert.equal(domesticationPreservesSurvivalAction(sheep({thirst:80}),'drink'),true);
  assert.equal(domesticationPreservesSurvivalAction(sheep({hunger:80}),'graze'),true);
  assert.equal(domesticationPreservesSurvivalAction(sheep({energy:20}),'rest'),true);
  assert.equal(domesticationPreservesSurvivalAction(sheep(),'wander'),false);
});

test('only one represented individual can enter player taming interactions',()=>{
  assert.ok(wildlifeDomesticationInteractions(sheep({representedPopulation:1})).includes('feed_tame'));
  assert.ok(!wildlifeDomesticationInteractions(sheep({representedPopulation:2.5})).includes('feed_tame'));
  assert.deepEqual(individualizeWildlifeRepresentative(3,0,true),{nextInitialOrdinaryCount:2,nextFixedWeight:1});
  assert.deepEqual(individualizeWildlifeRepresentative(0,0,false),{nextInitialOrdinaryCount:0,nextFixedWeight:1});
  assert.deepEqual(individualizeWildlifeRepresentative(0,1,true),{nextInitialOrdinaryCount:0,nextFixedWeight:1});
  assert.equal(individualizeWildlifeRepresentative(3,2.5,true),undefined);
  assert.equal(individualizeWildlifeRepresentative(0,0,true),undefined);
});

test('only a bonded player-owned follow command can trigger owner-follow chunk transfer',()=>{
  const bondedFollow={stage:'bonded' as const,progress:100,ownerKind:'player' as const,ownerId:'player',command:'follow' as const};
  assert.equal(shouldWildlifeFollowPlayerAcrossChunk('sheep',bondedFollow),true);
  assert.equal(shouldWildlifeFollowPlayerAcrossChunk('sheep',{...bondedFollow,command:'stay'}),false);
  assert.equal(shouldWildlifeFollowPlayerAcrossChunk('sheep',{...bondedFollow,ownerKind:'npc',ownerId:'farmer'}),false);
  assert.equal(shouldWildlifeFollowPlayerAcrossChunk('rabbit',bondedFollow),false);
});

test('release clears ownership and commands but keeps the domestication-capable species form',()=>{
  const released=releaseWildlifeDomestication('sheep',{
    stage:'bonded',progress:100,ownerKind:'player',ownerId:'player',command:'follow',bondedDay:4
  },9);
  assert.deepEqual(released,{
    stage:'feral',progress:0,command:'autonomous',lastInteractionDay:9
  });
  assert.deepEqual(wildlifeDomesticationInteractions({...sheep(),domestication:released}),['inspect','feed_tame']);
});

test('individualizing an existing representative conserves coarse count while individualizing a fine birth adds one',()=>{
  const existing=individualizeWildlifeRepresentative(3,0,true)!;
  const conserved=foldFineWildlifePopulationCount(
    10,
    existing.nextInitialOrdinaryCount,
    existing.nextInitialOrdinaryCount,
    existing.nextFixedWeight,
    existing.nextFixedWeight
  );
  assert.equal(conserved.nextCount,10);

  const newborn=individualizeWildlifeRepresentative(3,0,false)!;
  const withBirth=foldFineWildlifePopulationCount(
    10,
    3,
    3,
    0,
    newborn.nextFixedWeight
  );
  assert.equal(withBirth.nextCount,11);
});

