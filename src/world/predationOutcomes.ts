import type {
  WildlifeLineageRecord, WildlifePredationOutcomes, WildlifePredatorOutcomeCounter,
  WildlifePreyOutcomeCounter, WildlifeSpecies, WildlifeTraits
} from '../types.js';

const predatorCounter=():WildlifePredatorOutcomeCounter=>({huntAttempts:0,huntHits:0,kills:0});
const preyCounter=():WildlifePreyOutcomeCounter=>({fleeAttempts:0,successfulEscapes:0,attacksReceived:0,survivedAttacks:0});
const traitDelta=(actor:WildlifeTraits,counterpart:WildlifeTraits):WildlifeTraits=>({
  speed:actor.speed-counterpart.speed,
  size:actor.size-counterpart.size,
  fertility:actor.fertility-counterpart.fertility,
  wariness:actor.wariness-counterpart.wariness
});
const addTraits=(current:WildlifeTraits|undefined,delta:WildlifeTraits):WildlifeTraits=>({
  speed:(current?.speed||0)+delta.speed,
  size:(current?.size||0)+delta.size,
  fertility:(current?.fertility||0)+delta.fertility,
  wariness:(current?.wariness||0)+delta.wariness
});

export function ensureWildlifePredationOutcomes(record:WildlifeLineageRecord):WildlifePredationOutcomes {
  if(record.predationOutcomes)return record.predationOutcomes;
  record.predationOutcomes={
    asPredator:{...predatorCounter(),byPrey:{}},
    asPrey:{...preyCounter(),byPredator:{}}
  };
  return record.predationOutcomes;
}

export function recordWildlifeHuntOutcome(
  record:WildlifeLineageRecord,
  preySpecies:WildlifeSpecies,
  hit:boolean,
  kill:boolean,
  predatorTraits?:WildlifeTraits,
  preyTraits?:WildlifeTraits
) {
  const outcomes=ensureWildlifePredationOutcomes(record);
  outcomes.asPredator.huntAttempts++;
  if(hit)outcomes.asPredator.huntHits++;
  if(kill)outcomes.asPredator.kills++;
  const pair=outcomes.asPredator.byPrey[preySpecies]??predatorCounter();
  pair.huntAttempts++;
  if(hit)pair.huntHits++;
  if(kill)pair.kills++;
  if(predatorTraits&&preyTraits){
    const delta=traitDelta(predatorTraits,preyTraits);
    outcomes.asPredator.attemptTraitDeltaSum=addTraits(outcomes.asPredator.attemptTraitDeltaSum,delta);
    outcomes.asPredator.attemptTraitMatchCount=(outcomes.asPredator.attemptTraitMatchCount||0)+1;
    pair.attemptTraitDeltaSum=addTraits(pair.attemptTraitDeltaSum,delta);
    pair.attemptTraitMatchCount=(pair.attemptTraitMatchCount||0)+1;
    if(hit){
      outcomes.asPredator.hitTraitDeltaSum=addTraits(outcomes.asPredator.hitTraitDeltaSum,delta);
      outcomes.asPredator.hitTraitMatchCount=(outcomes.asPredator.hitTraitMatchCount||0)+1;
      pair.hitTraitDeltaSum=addTraits(pair.hitTraitDeltaSum,delta);
      pair.hitTraitMatchCount=(pair.hitTraitMatchCount||0)+1;
    }
    if(kill){
      outcomes.asPredator.killTraitDeltaSum=addTraits(outcomes.asPredator.killTraitDeltaSum,delta);
      outcomes.asPredator.killTraitMatchCount=(outcomes.asPredator.killTraitMatchCount||0)+1;
      pair.killTraitDeltaSum=addTraits(pair.killTraitDeltaSum,delta);
      pair.killTraitMatchCount=(pair.killTraitMatchCount||0)+1;
    }
  }
  outcomes.asPredator.byPrey[preySpecies]=pair;
}

export function recordWildlifeFleeOutcome(
  record:WildlifeLineageRecord,
  predatorSpecies:WildlifeSpecies,
  escaped:boolean,
  preyTraits?:WildlifeTraits,
  predatorTraits?:WildlifeTraits
) {
  const outcomes=ensureWildlifePredationOutcomes(record);
  outcomes.asPrey.fleeAttempts++;
  if(escaped)outcomes.asPrey.successfulEscapes++;
  const pair=outcomes.asPrey.byPredator[predatorSpecies]??preyCounter();
  pair.fleeAttempts++;
  if(escaped)pair.successfulEscapes++;
  if(preyTraits&&predatorTraits){
    const delta=traitDelta(preyTraits,predatorTraits);
    outcomes.asPrey.fleeTraitDeltaSum=addTraits(outcomes.asPrey.fleeTraitDeltaSum,delta);
    outcomes.asPrey.fleeTraitMatchCount=(outcomes.asPrey.fleeTraitMatchCount||0)+1;
    pair.fleeTraitDeltaSum=addTraits(pair.fleeTraitDeltaSum,delta);
    pair.fleeTraitMatchCount=(pair.fleeTraitMatchCount||0)+1;
    if(escaped){
      outcomes.asPrey.escapeTraitDeltaSum=addTraits(outcomes.asPrey.escapeTraitDeltaSum,delta);
      outcomes.asPrey.escapeTraitMatchCount=(outcomes.asPrey.escapeTraitMatchCount||0)+1;
      pair.escapeTraitDeltaSum=addTraits(pair.escapeTraitDeltaSum,delta);
      pair.escapeTraitMatchCount=(pair.escapeTraitMatchCount||0)+1;
    }
  }
  outcomes.asPrey.byPredator[predatorSpecies]=pair;
}

export function recordWildlifeAttackReceived(
  record:WildlifeLineageRecord,
  predatorSpecies:WildlifeSpecies,
  survived:boolean,
  preyTraits?:WildlifeTraits,
  predatorTraits?:WildlifeTraits
) {
  const outcomes=ensureWildlifePredationOutcomes(record);
  outcomes.asPrey.attacksReceived++;
  if(survived)outcomes.asPrey.survivedAttacks++;
  const pair=outcomes.asPrey.byPredator[predatorSpecies]??preyCounter();
  pair.attacksReceived++;
  if(survived)pair.survivedAttacks++;
  if(preyTraits&&predatorTraits){
    const delta=traitDelta(preyTraits,predatorTraits);
    outcomes.asPrey.attackTraitDeltaSum=addTraits(outcomes.asPrey.attackTraitDeltaSum,delta);
    outcomes.asPrey.attackTraitMatchCount=(outcomes.asPrey.attackTraitMatchCount||0)+1;
    pair.attackTraitDeltaSum=addTraits(pair.attackTraitDeltaSum,delta);
    pair.attackTraitMatchCount=(pair.attackTraitMatchCount||0)+1;
    if(survived){
      outcomes.asPrey.survivedAttackTraitDeltaSum=addTraits(outcomes.asPrey.survivedAttackTraitDeltaSum,delta);
      outcomes.asPrey.survivedAttackTraitMatchCount=(outcomes.asPrey.survivedAttackTraitMatchCount||0)+1;
      pair.survivedAttackTraitDeltaSum=addTraits(pair.survivedAttackTraitDeltaSum,delta);
      pair.survivedAttackTraitMatchCount=(pair.survivedAttackTraitMatchCount||0)+1;
    }
  }
  outcomes.asPrey.byPredator[predatorSpecies]=pair;
}
