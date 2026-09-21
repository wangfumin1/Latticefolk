import type {
  DecisionRequest, DecisionResponse, DialogueEntry, DialogueRequest, DialogueResponse,
  DecisionAction, SocialIntent, StateShift, RelationEffect,
  ChunkDecisionRequest, ChunkDecisionResponse, ChunkDecision,
  ChunkStrategy, ChunkMigrationPolicy, ChunkEcologyPolicy
} from '../../../src/types.js';
import { fallbackDecision, fallbackDialogue, fallbackChunkDecisions } from '../rules.js';
import type { DialogueStore } from '../../dialogueStore.js';
import { retrieveDialogueCandidates } from '../dialogueCandidates.js';
import type { DecisionProvider, DecisionProviderStatus } from '../types.js';

type JevAnswer = {
  type?: string;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  score?: number;
  noul?: number;
};

type JevResponse = {
  model?: string;
  answers?: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
  quota?: unknown;
};

const ACTION_DESCRIPTIONS: Record<DecisionAction, string> = {
  idle: 'Pause briefly because no stronger action is currently useful.',
  wander: 'Walk around town to explore, pass time, or find opportunities.',
  talk: 'Approach a nearby NPC and start a social interaction.',
  work: 'Go to an appropriate workstation or farm plot and perform useful work.',
  rest: 'Recover energy by going to a bed or bench and resting.',
  eat: 'Satisfy hunger by consuming carried food or obtaining food nearby.',
  pickup: 'Pick up a useful nearby item that is legitimately available.',
  use_object: 'Interact with a nearby usable environmental object.',
  inspect: 'Approach and inspect something nearby out of curiosity or practical need.',
  drop_item: 'Drop or place one carried item into the world for a practical reason.',
  harvest: 'Harvest food, crops, wood, stone, or another resource from an appropriate world site.',
  craft: 'Use a suitable workstation to transform carried resources into useful goods.',
  trade: 'Buy, sell, or exchange useful goods with another NPC or a market.',
  gift: 'Give one carried item to another NPC to help them or strengthen the relationship.',
  deliver: 'Carry and hand over a useful item to another NPC who is likely to need it.',
  fetch_water: 'Go to a well and collect water for later personal or household use.',
  patrol: 'Follow a purposeful guard route through town to maintain presence and safety.',
  visit: 'Go to another NPC for a friendly visit rather than a brief incidental chat.',
  sleep: 'Go to a bed for substantial energy recovery when tired or at an appropriate time.',
  explore: 'Travel farther than ordinary wandering to discover another part of the local area.'
};

const SOCIAL_INTENTS: Record<SocialIntent,string> = {
  greet:'Simple greeting or acknowledgment.',
  smalltalk:'Casual conversation about daily life or surroundings.',
  ask_help:'Ask the other person for practical help.',
  offer_help:'Offer practical help to the other person.',
  trade:'Discuss buying, selling, exchanging, or giving an item.',
  joke:'Make a light joke or playful remark.',
  praise:'Express approval, thanks, or admiration.',
  complain:'Express dissatisfaction, frustration, or discomfort.',
  share_news:'Share an observation, rumor, or recent event.',
  leave:'Politely end or avoid the conversation.'
};

const STATE_SHIFTS: Record<StateShift,string> = {
  stable:'No meaningful psychological or behavioral state change is justified.',
  mood_up:'The recent situation should make the NPC somewhat more positive.',
  mood_down:'The recent situation should make the NPC somewhat more negative.',
  social_seek:'The NPC should become more motivated to seek social contact.',
  social_withdraw:'The NPC should become more inclined to avoid social contact.',
  energy_conserve:'The NPC should prioritize conserving energy and lower activity.',
  goal_intensify:'The NPC should become more committed to its current practical goal.'
};

class MinuteLimiter {
  private stamps: number[] = [];
  constructor(private max: number) {}
  allow() {
    if (!this.max) return true;
    const now = Date.now();
    this.stamps = this.stamps.filter(x => now - x < 60_000);
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }
  state() {
    const now = Date.now();
    this.stamps = this.stamps.filter(x => now - x < 60_000);
    return { max: this.max, usedLastMinute: this.stamps.length };
  }
}

export class JevDecisionProvider implements DecisionProvider {
  readonly id = 'jev';
  private readonly endpoint = process.env.JEV_ENDPOINT || 'https://api.typesafe.ai/v1/systemone';
  private readonly model = process.env.JEV_MODEL || 'jev-latest';
  private readonly timeout = Math.max(500, Number(process.env.JEV_TIMEOUT_MS || 2500));
  private readonly key = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY || '';
  private readonly limiter = new MinuteLimiter(Math.max(0, Number(process.env.JEV_MAX_CALLS_PER_MINUTE || 60)));
  private calls = 0;
  private failures = 0;
  private lastError = '';
  private lastLatencyMs = 0;
  private lastModel = '';
  private inputTokens = 0;

  constructor(private readonly dialogue: DialogueStore) {}

  status(): DecisionProviderStatus {
    return {
      id: this.id,
      kind: 'remote',
      configured: Boolean(this.key),
      endpoint: this.endpoint,
      model: this.model,
      calls: this.calls,
      failures: this.failures,
      lastError: this.lastError,
      lastLatencyMs: this.lastLatencyMs,
      lastModel: this.lastModel,
      inputTokens: this.inputTokens,
      limiter: this.limiter.state(),
    };
  }

  private async call(state: unknown, questions: Record<string, unknown>): Promise<JevResponse> {
    if (!this.key) throw new Error('TYPESAFE_API_KEY is not configured');
    if (!this.limiter.allow()) throw new Error('Jev per-minute budget guard reached');
    const started = performance.now();
    const response = await fetch(this.endpoint, {
      method:'POST',
      headers:{ 'authorization':`Bearer ${this.key}`, 'content-type':'application/json' },
      body:JSON.stringify({ model:this.model, state, questions }),
      signal:AbortSignal.timeout(this.timeout),
    });
    this.lastLatencyMs = Math.round(performance.now() - started);
    this.calls++;
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Jev HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    const json = await response.json() as JevResponse;
    this.lastModel = json.model || this.model;
    this.inputTokens += json.usage?.input_tokens || 0;
    return json;
  }

  async decide(req: DecisionRequest): Promise<DecisionResponse> {
    if (!this.key) return fallbackDecision(req);
    const actionCriteria = Object.fromEntries(req.allowedActions.slice(0, 255).map(a => [a, ACTION_DESCRIPTIONS[a]]));
    const questions: Record<string, unknown> = {
      action: {
        type:'choice',
        instructions:'Choose the NPC next high-level action. Pick only an action that is feasible from the supplied state and available choices. Needs, schedule, relationships, nearby opportunities, and current goal all matter.',
        criteria:actionCriteria,
      },
      social_intent: {
        type:'choice',
        instructions:'If this NPC speaks to someone soon, choose the most context-appropriate social intent. This is a bounded intent, not dialogue generation.',
        criteria:SOCIAL_INTENTS,
      },
      state_shift: {
        type:'choice',
        instructions:'Choose the single most appropriate bounded state tendency caused by the current situation. Do not invent events. This will be converted to small deterministic game-state changes.',
        criteria:STATE_SHIFTS,
      },
      commitment: {
        type:'score',
        instructions:'How strongly should the NPC commit to the selected next action before reconsidering?',
        criteria:['Very weak: reconsider almost immediately','Weak: brief attempt','Normal: ordinary commitment','Strong: persist despite small distractions','Very strong: stay committed unless blocked or urgent need appears']
      }
    };
    if (req.world.nearbyNpcs.length) {
      questions.target_npc = {
        type:'choice',
        instructions:'Choose the most relevant nearby person for a possible social interaction.',
        criteria:Object.fromEntries(req.world.nearbyNpcs.slice(0, 64).map(n => [n.id, `${n.name}, role=${n.role}, mood=${n.mood}, distance=${n.distance.toFixed(1)}, affinity=${n.relationship.affinity}`]))
      };
    }
    if (req.world.nearbyObjects.length) {
      questions.target_object = {
        type:'choice',
        instructions:'Choose the most relevant nearby world object for the NPC current practical needs or curiosity.',
        criteria:Object.fromEntries(req.world.nearbyObjects.slice(0, 128).map(o => [o.id, `${o.name}; kind=${o.kind}; tags=${o.tags.join(',')}; distance=${o.distance.toFixed(1)}; usable=${o.usable}; pickupable=${o.pickupable}`]))
      };
    }

    const state = {
      npc: {
        id:req.npc.id, name:req.npc.name, role:req.npc.role, mood:req.npc.mood,
        hunger:req.npc.hunger, energy:req.npc.energy, social:req.npc.social, money:req.npc.money,
        inventory:req.npc.inventory, currentAction:req.npc.currentAction, goal:req.npc.goal,
        recentMemories:req.npc.memories.slice(-6), lastDialogue:req.npc.lastDialogue,
        routine:{ workHours:'08:00-17:00', eveningWindDown:'18:00-22:00', sleepHours:'22:00-06:00', meals:'when hunger becomes materially high' },
      },
      world:req.world,
      allowedActions:req.allowedActions,
      semantics:{ hunger:'0 full, 100 starving', energy:'0 exhausted, 100 rested', social:'0 lonely, 100 socially satisfied' }
    };

    try {
      const out = await this.call(state, questions);
      const a = out.answers || {};
      const selected = a.action?.choice as DecisionAction | undefined;
      const action = selected && req.allowedActions.includes(selected) ? selected : fallbackDecision(req).action;
      const socialIntent = (a.social_intent?.choice || 'smalltalk') as SocialIntent;
      const stateShift = (a.state_shift?.choice || 'stable') as StateShift;
      const targetNpcId = req.world.nearbyNpcs.some(n => n.id === a.target_npc?.choice) ? a.target_npc?.choice : undefined;
      const targetObjectId = req.world.nearbyObjects.some(o => o.id === a.target_object?.choice) ? a.target_object?.choice : undefined;
      const confidence = Math.min(1, Math.max(0, Number(a.action?.confidence ?? .5)));
      const commitment = Math.min(4, Math.max(0, Number(a.commitment?.score ?? 2)));
      return { source:'jev', action, targetNpcId, targetObjectId, socialIntent, stateShift, commitment, confidence, reasonCode:`jev_${action}` };
    } catch (error) {
      this.failures++;
      this.lastError = error instanceof Error ? error.message : String(error);
      return fallbackDecision(req);
    }
  }


  async decideChunks(req: ChunkDecisionRequest): Promise<ChunkDecisionResponse> {
    if (!this.key || !req.chunks.length) return fallbackChunkDecisions(req);

    const strategies: Record<ChunkStrategy,string> = {
      sustain:'Maintain current population and resource use without major expansion.',
      grow_settlement:'Invest surplus resources into settlement growth and population capacity.',
      conserve:'Reduce extraction and growth to survive scarcity or restore reserves.',
      extract_resources:'Increase controlled harvesting of locally abundant resources.',
      fortify:'Prioritize safety, resilience, and defensive capacity against danger.',
      trade_route:'Prioritize exchange, movement corridors, specialization, and regional trade.'
    };
    const migrations: Record<ChunkMigrationPolicy,string> = {
      attract:'Encourage net migration into this chunk because capacity and opportunity justify it.',
      retain:'Keep population broadly stable and avoid strong migration pressure.',
      release:'Allow or encourage some population to leave for better opportunities elsewhere.',
      evacuate:'Strongly reduce local population because present conditions are unsafe or unsustainable.'
    };
    const ecology: Record<ChunkEcologyPolicy,string> = {
      recover:'Reduce pressure and actively favor ecological recovery.',
      balance:'Keep extraction and ecological capacity in rough balance.',
      harvest:'Use ecological surplus more aggressively while remaining within simulation constraints.',
      protect:'Strongly protect habitat because danger, scarcity, or degradation makes further pressure risky.'
    };

    const chunks = req.chunks.slice(0, 8);
    const questions: Record<string, unknown> = {};
    chunks.forEach((chunk, index) => {
      questions[`c${index}_strategy`] = {
        type:'choice',
        instructions:'Choose the best medium-term regional strategy for this distant simulated chunk. Use only supplied state. This is policy selection; deterministic simulation will apply consequences.',
        criteria:strategies
      };
      questions[`c${index}_migration`] = {
        type:'choice',
        instructions:'Choose net migration policy for this distant chunk from current population, prosperity, danger, food, water and ecology.',
        criteria:migrations
      };
      questions[`c${index}_ecology`] = {
        type:'choice',
        instructions:'Choose the bounded ecology policy for this chunk. Consider resource stocks, biome condition, settlement pressure and danger.',
        criteria:ecology
      };
    });

    const state = {
      simulationLayer:'coarse_distant_chunks',
      day:req.day,
      gameTime:req.gameTime,
      weather:req.weather,
      chunks:chunks.map(c => ({
        id:c.id, coordinates:[c.cx,c.cz], biome:c.biome,
        settlementLevel:c.settlementLevel, population:c.population,
        food:c.food, wood:c.wood, water:c.water, ecology:c.ecology,
        danger:c.danger, prosperity:c.prosperity,
        currentPolicy:{ strategy:c.strategy, migration:c.migrationPolicy, ecology:c.ecologyPolicy }
      })),
      semantics:{
        resources:'food, wood, water, ecology, danger, prosperity are bounded 0-100 coarse simulation indices',
        authority:'choose policy only; never invent exact mutations, entities, resources, or events'
      }
    };

    try {
      const out = await this.call(state, questions);
      const answers = out.answers || {};
      const validStrategy = Object.keys(strategies) as ChunkStrategy[];
      const validMigration = Object.keys(migrations) as ChunkMigrationPolicy[];
      const validEcology = Object.keys(ecology) as ChunkEcologyPolicy[];
      const decisions: ChunkDecision[] = chunks.map((chunk,index) => {
        const s = answers[`c${index}_strategy`];
        const m = answers[`c${index}_migration`];
        const e = answers[`c${index}_ecology`];
        const strategy = validStrategy.includes(s?.choice as ChunkStrategy) ? s!.choice as ChunkStrategy : chunk.strategy;
        const migrationPolicy = validMigration.includes(m?.choice as ChunkMigrationPolicy) ? m!.choice as ChunkMigrationPolicy : chunk.migrationPolicy;
        const ecologyPolicy = validEcology.includes(e?.choice as ChunkEcologyPolicy) ? e!.choice as ChunkEcologyPolicy : chunk.ecologyPolicy;
        const confidences=[s?.confidence,m?.confidence,e?.confidence].filter((x):x is number=>typeof x==='number');
        const confidence=confidences.length?confidences.reduce((a,b)=>a+b,0)/confidences.length:.5;
        return {
          chunkId:chunk.id, strategy, migrationPolicy, ecologyPolicy,
          confidence:Math.min(1,Math.max(0,confidence)),
          reasonCode:`jev_chunk_${strategy}`,
          source:'jev'
        };
      });
      return { source:'jev', decisions };
    } catch (error) {
      this.failures++;
      this.lastError = error instanceof Error ? error.message : String(error);
      return fallbackChunkDecisions(req);
    }
  }

async dialogueDecision(req: DialogueRequest): Promise<DialogueResponse> {
    const { lines, fragments } = retrieveDialogueCandidates(this.dialogue, req);
    if (!this.key) return fallbackDialogue(req, lines, fragments);

    const questions: Record<string, unknown> = {
      mode:{
        type:'choice',
        instructions:'Choose whether a complete authored line or a composed set of authored fragments better fits this interaction. Never generate text.',
        criteria:{ line:'Use one complete candidate line.', fragments:'Compose opener + body + closer from the provided fragment candidates.' }
      },
      relation_effect:{
        type:'choice',
        instructions:'Choose the likely immediate relationship effect of this interaction on the listener, based only on context and intent.',
        criteria:{ positive:'Likely to slightly improve affinity/trust.', neutral:'No meaningful relationship change.', negative:'Likely to slightly reduce affinity/trust.' }
      }
    };
    if (lines.length >= 2) {
      questions.line = {
        type:'choice',
        instructions:'Choose the best complete authored line for the speaker to say now. Preserve characterization, situation, intent, and avoid repetition.',
        criteria:Object.fromEntries(lines.map(e => [e.id, e.text]))
      };
    }
    for (const slot of ['opener','body','closer'] as const) {
      const candidates = fragments[slot];
      if (candidates.length >= 2) {
        questions[slot] = {
          type:'choice',
          instructions:`Choose the best authored ${slot} fragment. It will be concatenated with other selected fragments; do not generate new words.`,
          criteria:Object.fromEntries(candidates.map(e => [e.id, e.text]))
        };
      }
    }
    const state = {
      speaker:req.speaker,
      listener:req.listener,
      situation:req.situation,
      intent:req.intent,
      world:req.world,
      recentLines:req.recentLines.slice(-6),
      constraints:'Output decisions only. Dialogue text must come exclusively from candidate criteria.'
    };
    try {
      const out = await this.call(state, questions);
      const a = out.answers || {};
      let mode = (a.mode?.choice === 'fragments' ? 'fragments' : 'line') as 'line'|'fragments';
      let selected: DialogueEntry[] = [];
      if (mode === 'line' && lines.length) {
        const id = a.line?.choice;
        selected = [lines.find(x => x.id === id) || lines[0]];
      } else {
        for (const slot of ['opener','body','closer'] as const) {
          const list = fragments[slot];
          if (!list.length) continue;
          const id = a[slot]?.choice;
          selected.push(list.find(x => x.id === id) || list[0]);
        }
        if (!selected.length && lines.length) { mode = 'line'; selected = [lines[0]]; }
      }
      const text = selected.map(x => x.text).join('') || '……';
      const confidences = [a.mode?.confidence, a.line?.confidence, a.opener?.confidence, a.body?.confidence, a.closer?.confidence].filter((x): x is number => typeof x === 'number');
      const confidence = confidences.length ? confidences.reduce((x,y)=>x+y,0)/confidences.length : .5;
      const relationEffect = (['positive','neutral','negative'].includes(String(a.relation_effect?.choice)) ? a.relation_effect?.choice : 'neutral') as RelationEffect;
      return { source:'jev', mode, text, selectedIds:selected.map(x=>x.id), confidence, relationEffect };
    } catch (error) {
      this.failures++;
      this.lastError = error instanceof Error ? error.message : String(error);
      return fallbackDialogue(req, lines, fragments);
    }
  }
}
