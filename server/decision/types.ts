import type { DecisionRequest, DecisionResponse, DialogueRequest, DialogueResponse } from '../../src/types.js';

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
}

export interface DecisionProvider {
  readonly id: string;
  status(): DecisionProviderStatus;
  decide(request: DecisionRequest): Promise<DecisionResponse>;
  dialogueDecision(request: DialogueRequest): Promise<DialogueResponse>;
}
