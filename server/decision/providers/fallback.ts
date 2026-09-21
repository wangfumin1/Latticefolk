import type { DecisionRequest, DecisionResponse, DialogueRequest, DialogueResponse } from '../../../src/types.js';
import type { DialogueStore } from '../../dialogueStore.js';
import { retrieveDialogueCandidates } from '../dialogueCandidates.js';
import { fallbackDecision, fallbackDialogue } from '../rules.js';
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
}
