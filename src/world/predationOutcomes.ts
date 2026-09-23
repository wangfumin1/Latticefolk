import type {
  WildlifeLineageRecord, WildlifePredationOutcomes, WildlifePredatorOutcomeCounter,
  WildlifePreyOutcomeCounter, WildlifeSpecies
} from '../types.js';

const predatorCounter=():WildlifePredatorOutcomeCounter=>({huntAttempts:0,huntHits:0,kills:0});
const preyCounter=():WildlifePreyOutcomeCounter=>({fleeAttempts:0,successfulEscapes:0,attacksReceived:0,survivedAttacks:0});

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
  kill:boolean
) {
  const outcomes=ensureWildlifePredationOutcomes(record);
  outcomes.asPredator.huntAttempts++;
  if(hit)outcomes.asPredator.huntHits++;
  if(kill)outcomes.asPredator.kills++;
  const pair=outcomes.asPredator.byPrey[preySpecies]??predatorCounter();
  pair.huntAttempts++;
  if(hit)pair.huntHits++;
  if(kill)pair.kills++;
  outcomes.asPredator.byPrey[preySpecies]=pair;
}

export function recordWildlifeFleeOutcome(
  record:WildlifeLineageRecord,
  predatorSpecies:WildlifeSpecies,
  escaped:boolean
) {
  const outcomes=ensureWildlifePredationOutcomes(record);
  outcomes.asPrey.fleeAttempts++;
  if(escaped)outcomes.asPrey.successfulEscapes++;
  const pair=outcomes.asPrey.byPredator[predatorSpecies]??preyCounter();
  pair.fleeAttempts++;
  if(escaped)pair.successfulEscapes++;
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
