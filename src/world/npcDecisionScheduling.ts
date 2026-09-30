export interface NpcDecisionDue {
  state: { id: string };
  nextDecisionAt: number;
  pendingDecision: boolean;
  removed?: boolean;
  task?: unknown;
}

/**
 * Fill only the existing free request slots, oldest due actor first. Iterating
 * home NPCs first every frame lets repeatedly-idle actors starve newly streamed
 * residents before their first decision. This selection never changes a deadline,
 * an actor, the concurrency cap or the provider's independent budget checks.
 */
export function dueNpcDecisions<T extends NpcDecisionDue>(
  actors: Iterable<T>, nowMs: number, availableSlots: number
): T[] {
  if (!Number.isFinite(nowMs) || !Number.isFinite(availableSlots)) return [];
  const limit = Math.max(0, Math.floor(availableSlots));
  if (!limit) return [];
  return [...actors]
    .filter(actor => !actor.removed && !actor.pendingDecision && !actor.task
      && Number.isFinite(actor.nextDecisionAt) && actor.nextDecisionAt <= nowMs)
    .sort((a, b) => a.nextDecisionAt - b.nextDecisionAt || a.state.id.localeCompare(b.state.id))
    .slice(0, limit);
}
