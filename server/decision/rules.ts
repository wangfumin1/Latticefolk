import type { DecisionRequest, DecisionResponse, DialogueEntry, DialogueRequest, DialogueResponse, DecisionAction, SocialIntent, StateShift, ChunkDecisionRequest, ChunkDecisionResponse, ChunkDecision, ChunkStrategy, ChunkMigrationPolicy, ChunkEcologyPolicy } from '../../src/types.js';

function pick<T>(arr: T[], fallback: T): T {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : fallback;
}

export function fallbackDecision(req: DecisionRequest): DecisionResponse {
  const n = req.npc;
  const actions = new Set(req.allowedActions);
  let action: DecisionAction = req.allowedActions.includes('idle') ? 'idle' : (req.allowedActions[0] ?? 'idle');
  let reasonCode = action === 'idle' ? 'fallback_idle' : 'fallback_first_legal';

  if (n.hunger >= 72 && actions.has('eat')) { action = 'eat'; reasonCode = 'need_hunger'; }
  else if (n.energy <= 28 && actions.has('rest')) { action = 'rest'; reasonCode = 'need_energy'; }
  else if (n.social <= 30 && req.world.nearbyNpcs.length && actions.has('talk')) { action = 'talk'; reasonCode = 'need_social'; }
  else if (actions.has('work') && req.world.minuteOfDay >= 8*60 && req.world.minuteOfDay <= 17*60 && Math.random() < .42) { action = 'work'; reasonCode = 'schedule_work'; }
  else if (req.world.nearbyObjects.some(o => o.pickupable) && actions.has('pickup') && Math.random() < .18) { action = 'pickup'; reasonCode = 'opportunistic_pickup'; }
  else if (actions.has('wander')) { action = 'wander'; reasonCode = 'fallback_wander'; }

  const targetNpcId = action === 'talk' ? req.world.nearbyNpcs[0]?.id : undefined;
  let targetObjectId: string | undefined;
  if (action === 'pickup') targetObjectId = req.world.nearbyObjects.find(o => o.pickupable)?.id;
  if (action === 'rest') targetObjectId = req.world.nearbyObjects.find(o => ['bed','bench'].includes(o.kind))?.id;
  if (action === 'work') targetObjectId = req.world.nearbyObjects.find(o => ['workstation','farm_plot'].includes(o.kind))?.id;
  if (action === 'eat') targetObjectId = req.world.nearbyObjects.find(o => o.kind === 'food_stall')?.id;

  const socialIntent: SocialIntent = pick(['greet','smalltalk','share_news'] as SocialIntent[], 'smalltalk');
  let stateShift: StateShift = 'stable';
  if (n.energy < 30) stateShift = 'energy_conserve';
  else if (n.social < 30) stateShift = 'social_seek';
  else if (n.mood === 'sad' || n.mood === 'annoyed') stateShift = 'mood_down';

  return { source:'fallback', action, targetNpcId, targetObjectId, socialIntent, stateShift, commitment: 2, confidence: .45, reasonCode };
}

export function fallbackDialogue(req: DialogueRequest, candidates: DialogueEntry[], fragments: { opener: DialogueEntry[]; body: DialogueEntry[]; closer: DialogueEntry[] }): DialogueResponse {
  if (candidates.length) {
    const e = pick(candidates.slice(0, 8), candidates[0]);
    return { source:'fallback', mode:'line', text:e.text, selectedIds:[e.id], confidence:.4, relationEffect: req.intent === 'complain' ? 'neutral' : 'positive' };
  }
  const o = pick(fragments.opener, undefined as any);
  const b = pick(fragments.body, undefined as any);
  const c = pick(fragments.closer, undefined as any);
  const selected = [o,b,c].filter(Boolean) as DialogueEntry[];
  return {
    source:'fallback', mode:'fragments', text:selected.map(x => x.text).join('') || '……',
    selectedIds:selected.map(x => x.id), confidence:.35, relationEffect:'neutral'
  };
}


export function fallbackChunkDecisions(req: ChunkDecisionRequest): ChunkDecisionResponse {
  const decisions: ChunkDecision[] = req.chunks.map(chunk => {
    let strategy: ChunkStrategy = 'sustain';
    let migrationPolicy: ChunkMigrationPolicy = 'retain';
    let ecologyPolicy: ChunkEcologyPolicy = 'balance';
    let reasonCode = 'coarse_stable';

    if (chunk.danger >= 72) {
      strategy = 'fortify';
      migrationPolicy = chunk.population > 8 ? 'release' : 'retain';
      ecologyPolicy = 'protect';
      reasonCode = 'coarse_danger';
    } else if (chunk.food < 28 || chunk.water < 24) {
      strategy = 'conserve';
      migrationPolicy = chunk.population > 10 ? 'release' : 'retain';
      ecologyPolicy = 'recover';
      reasonCode = 'coarse_scarcity';
    } else if (chunk.ecology < 34) {
      strategy = 'conserve';
      migrationPolicy = 'retain';
      ecologyPolicy = 'recover';
      reasonCode = 'coarse_ecology';
    } else if (chunk.prosperity > 62 && chunk.food > 58 && chunk.water > 52) {
      strategy = chunk.settlementLevel >= 2 ? 'trade_route' : 'grow_settlement';
      migrationPolicy = 'attract';
      ecologyPolicy = chunk.ecology > 56 ? 'balance' : 'protect';
      reasonCode = 'coarse_growth';
    } else if (chunk.wood > 72 && chunk.ecology > 58) {
      strategy = 'extract_resources';
      migrationPolicy = 'retain';
      ecologyPolicy = 'harvest';
      reasonCode = 'coarse_surplus';
    }

    return {
      chunkId: chunk.id,
      strategy,
      migrationPolicy,
      ecologyPolicy,
      confidence: .44,
      reasonCode,
      source: 'fallback',
    };
  });
  return { source: 'fallback', decisions };
}
