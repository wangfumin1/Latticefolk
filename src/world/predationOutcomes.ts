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
    pair.attemptTraitDeltaSum=addTraits(pair.attemptTraitDeltaSum,delta);
    if(hit){
      outcomes.asPredator.hitTraitDeltaSum=addTraits(outcomes.asPredator.hitTraitDeltaSum,delta);
      pair.hitTraitDeltaSum=addTraits(pair.hitTraitDeltaSum,delta);
    }
    if(kill){
      outcomes.asPredator.killTraitDeltaSum=addTraits(outcomes.asPredator.killTraitDeltaSum,delta);
      pair.killTraitDeltaSum=addTraits(pair.killTraitDeltaSum,delta);
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
    pair.fleeTraitDeltaSum=addTraits(pair.fleeTraitDeltaSum,delta);
    if(escaped){
      outcomes.asPrey.escapeTraitDeltaSum=addTraits(outcomes.asPrey.escapeTraitDeltaSum,delta);
      pair.escapeTraitDeltaSum=addTraits(pair.escapeTraitDeltaSum,delta);
    }
  }
  outcomes.asPrey.byPredator[predatorSpecies]=pair;
}

export function recordWildlifeAttackReceived(
  record:WildlifeLineageRecord,
  predatorSpecies:WildlifeSpecies,
  survived:boolean
) {
  const outcomes=ensureWildlifePredationOutcomes(record);
  outcomes.asPrey.attacksReceived++;
  if(survived)outcomes.asPrey.survivedAttacks++;
  const pair=outcomes.asPrey.byPredator[predatorSpecies]??preyCounter();
  pair.attacksReceived++;
  if(survived)pair.survivedAttacks++;
  outcomes.asPrey.byPredator[predatorSpecies]=pair;
}
