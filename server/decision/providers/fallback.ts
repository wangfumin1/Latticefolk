import type { DecisionRequest, DecisionResponse, DialogueRequest, DialogueResponse, ChunkDecisionRequest, ChunkDecisionResponse, RegionDecisionRequest, RegionDecisionResponse, WorldDecisionRequest, WorldDecisionResponse, WildlifeDecisionBatchRequest, WildlifeDecisionBatchResponse } from '../../../src/types.js';
import type { DialogueStore } from '../../dialogueStore.js';
import { retrieveDialogueCandidates } from '../dialogueCandidates.js';
import { fallbackDecision, fallbackDialogue, fallbackChunkDecisions, fallbackRegionDecisions, fallbackWorldDecision, fallbackWildlifeDecisions } from '../rules.js';
import type { DecisionProvider, DecisionProviderStatus } from '../types.js';

export class FallbackDecisionProvider implements DecisionProvider {
  readonly id = 'fallback';
  private calls = 0;

  constructor(private readonly dialogue: DialogueStore) {}

  status(): DecisionProviderStatus {
    return { id: this.id, kind: 'local', configured: true, calls: this.calls, failures: 0 };
  }

  async decide(request: DecisionRequest): Promise<DecisionResponse> {
    this.calls++;
    return fallbackDecision(request);
  }

  async dialogueDecision(request: DialogueRequest): Promise<DialogueResponse> {
    this.calls++;
    const { lines, fragments } = retrieveDialogueCandidates(this.dialogue, request);
    return fallbackDialogue(request, lines, fragments);
  }

  async decideChunks(request: ChunkDecisionRequest): Promise<ChunkDecisionResponse> {
    this.calls++;
    return fallbackChunkDecisions(request);
  }

  async decideRegions(request: RegionDecisionRequest): Promise<RegionDecisionResponse> {
    this.calls++;
    return fallbackRegionDecisions(request);
  }

  async decideWorld(request: WorldDecisionRequest): Promise<WorldDecisionResponse> {
    this.calls++;
    return fallbackWorldDecision(request);
  }

  async decideWildlife(request: WildlifeDecisionBatchRequest): Promise<WildlifeDecisionBatchResponse> {
    this.calls++;
    return fallbackWildlifeDecisions(request);
  }
}
