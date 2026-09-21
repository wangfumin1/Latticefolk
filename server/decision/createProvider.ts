import type { DialogueStore } from '../dialogueStore.js';
import type { DecisionProvider } from './types.js';
import { FallbackDecisionProvider } from './providers/fallback.js';
import { JevDecisionProvider } from './providers/jev.js';

export type ProviderSelection = {
  requested: string;
  active: DecisionProvider;
};

export function createDecisionProvider(dialogue: DialogueStore): ProviderSelection {
  const requested = (process.env.DECISION_PROVIDER || 'auto').trim().toLowerCase();

  if (requested === 'fallback') {
    return { requested, active: new FallbackDecisionProvider(dialogue) };
  }
  if (requested === 'jev') {
    return { requested, active: new JevDecisionProvider(dialogue) };
  }
  if (requested === 'auto') {
    const hasJevKey = Boolean(process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY);
    return {
      requested,
      active: hasJevKey ? new JevDecisionProvider(dialogue) : new FallbackDecisionProvider(dialogue),
    };
  }

  throw new Error(`Unsupported DECISION_PROVIDER: ${requested}`);
}
