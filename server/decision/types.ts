import type { DecisionRequest, DecisionResponse, DialogueRequest, DialogueResponse, ChunkDecisionRequest, ChunkDecisionResponse, RegionDecisionRequest, RegionDecisionResponse, WorldDecisionRequest, WorldDecisionResponse, WildlifeDecisionBatchRequest, WildlifeDecisionBatchResponse } from '../../src/types.js';
import type { JevBudgetConfig, JevBudgetSnapshot } from './budget.js';

export interface DecisionProviderStatus {
  id: string;
  kind: 'local' | 'remote';
  configured: boolean;
  calls?: number;
  failures?: number;
  lastError?: string;
  lastLatencyMs?: number;
  model?: string;
  lastModel?: string;
  endpoint?: string;
  inputTokens?: number;
  limiter?: { max: number; usedLastMinute: number };
  budget?: JevBudgetSnapshot;
}

export interface DecisionProvider {
  readonly id: string;
  status(): DecisionProviderStatus;
  decide(request: DecisionRequest): Promise<DecisionResponse>;
  dialogueDecision(request: DialogueRequest): Promise<DialogueResponse>;
  decideChunks(request: ChunkDecisionRequest): Promise<ChunkDecisionResponse>;
  decideRegions(request: RegionDecisionRequest): Promise<RegionDecisionResponse>;
  decideWorld(request: WorldDecisionRequest): Promise<WorldDecisionResponse>;
  decideWildlife(request: WildlifeDecisionBatchRequest): Promise<WildlifeDecisionBatchResponse>;
  updateBudget?(patch: Partial<JevBudgetConfig>): JevBudgetSnapshot;
}
