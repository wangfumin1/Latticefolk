import type {
  DecisionRequest, DecisionResponse, DialogueEntry, DialogueRequest, DialogueResponse,
  DecisionAction, SocialIntent, StateShift, RelationEffect,
  ChunkDecisionRequest, ChunkDecisionResponse, ChunkDecision,
  ChunkStrategy, ChunkMigrationPolicy, ChunkEcologyPolicy,
  RegionDecisionRequest, RegionDecisionResponse, RegionDecision, RegionPriority, RegionMovementPolicy, RegionEcologyPolicy,
  WorldDecisionRequest, WorldDecisionResponse, WorldDecision, WorldPriority, WorldConnectivityPolicy, WorldGrowthPolicy,
  WildlifeDecisionBatchRequest, WildlifeDecisionBatchResponse, WildlifeDecisionResult, WildlifeAction
} from '../../../src/types.js';
import { fallbackDecision, fallbackDialogue, fallbackChunkDecisions, fallbackRegionDecisions, fallbackWorldDecision, fallbackWildlifeDecisions } from '../rules.js';
import type { DialogueStore } from '../../dialogueStore.js';
import { retrieveDialogueCandidates } from '../dialogueCandidates.js';
import type { DecisionProvider, DecisionProviderStatus } from '../types.js';
import { JevBudgetController, type JevCallKind, type JevBudgetConfig, type JevBudgetSnapshot } from '../budget.js';

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

export class JevDecisionProvider implements DecisionProvider {
  readonly id = 'jev';
  private readonly endpoint = process.env.JEV_ENDPOINT || 'https://api.typesafe.ai/v1/systemone';
  private readonly model = process.env.JEV_MODEL || 'jev-latest';
  private readonly timeout = Math.max(500, Number(process.env.JEV_TIMEOUT_MS || 2500));
  private readonly key = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY || '';
  private readonly budget = new JevBudgetController();
  private readonly cache = new Map<string,{expires:number,value:JevResponse}>();
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
      limiter: { max:this.budget.getConfig().maxCallsPerMinute, usedLastMinute:this.budget.snapshot().calls.minute },
      budget: this.budget.snapshot(),
    };
  }

  updateBudget(patch: Partial<JevBudgetConfig>): JevBudgetSnapshot {
    return this.budget.update(patch);
  }

  private cacheKey(kind:JevCallKind,payload:unknown) {
    const text=JSON.stringify({kind,payload});
    let h=2166136261;
    for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
    return `${kind}:${(h>>>0).toString(36)}:${text.length}`;
  }

  private async call(kind:JevCallKind,state: unknown, questions: Record<string, unknown>): Promise<JevResponse> {
    if (!this.key) throw new Error('TYPESAFE_API_KEY is not configured');
    const payload={ model:this.model, state, questions };
    const estimated=this.budget.estimateTokens(payload);
    const gate=this.budget.canCall(kind,estimated);
    if(!gate.ok)throw new Error(`Jev budget guard: ${gate.reason}`);

    const cacheKey=this.cacheKey(kind,payload);
    const cached=this.cache.get(cacheKey);
    if(cached&&cached.expires>Date.now()){
      this.budget.recordCacheHit();
      return cached.value;
    }
    if(cached)this.cache.delete(cacheKey);

    const started = performance.now();
    const response = await fetch(this.endpoint, {
      method:'POST',
      headers:{ 'authorization':`Bearer ${this.key}`, 'content-type':'application/json' },
      body:JSON.stringify(payload),
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
    const actual=Math.max(0,Number(json.usage?.input_tokens||estimated));
    this.inputTokens += actual;
    this.budget.record(kind,actual);
    const ttl=this.budget.getConfig().cacheTtlMs;
    if(ttl>0)this.cache.set(cacheKey,{expires:Date.now()+ttl,value:json});
    return json;
  }

  async decide(req: DecisionRequest): Promise<DecisionResponse> {
    if (!this.key) return fallbackDecision(req);
    // Deterministic emergency needs do not require paid inference.
    if ((req.npc.hunger >= 92 && req.allowedActions.includes('eat')) ||
        (req.npc.energy <= 8 && (req.allowedActions.includes('sleep') || req.allowedActions.includes('rest')))) {
      return { ...fallbackDecision(req), source:'rule_guard' };
    }
    const actionCriteria = Object.fromEntries(req.allowedActions.slice(0, 255).map(a => [a, ACTION_DESCRIPTIONS[a]]));
    const questions: Record<string, unknown> = {
      action: {
        type:'choice',
        instructions:'Choose the NPC next high-level action. Pick only an action that is feasible from the supplied state and available choices. Needs, schedule, relationships, nearby opportunities, and current goal all matter.',
        criteria:actionCriteria,
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
    const socialActions=req.allowedActions.some(a=>['talk','visit','trade','gift','deliver'].includes(a));
    if (req.world.nearbyNpcs.length && socialActions) {
      questions.social_intent = {
        type:'choice',
        instructions:'Choose the most context-appropriate bounded social intent if the selected action involves another person. Do not generate dialogue.',
        criteria:SOCIAL_INTENTS,
      };
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
        criteria:Object.fromEntries(req.world.nearbyObjects.slice(0, 128).map(o => [o.id, `${o.name}; kind=${o.kind}; tags=${o.tags.join(',')}; capabilities=${(o.capabilities||[]).join(',')}; distance=${o.distance.toFixed(1)}; usable=${o.usable}; pickupable=${o.pickupable}`]))
      };
    }

    const state = {
      npc: {
        id:req.npc.id, name:req.npc.name, role:req.npc.role, mood:req.npc.mood,
        hunger:req.npc.hunger, energy:req.npc.energy, social:req.npc.social, money:req.npc.money,
        inventory:req.npc.inventory, currentAction:req.npc.currentAction, goal:req.npc.goal,
        recentMemories:req.npc.memories.slice(-4), lastDialogue:req.npc.lastDialogue,
        routine:{ workHours:'08:00-17:00', eveningWindDown:'18:00-22:00', sleepHours:'22:00-06:00', meals:'when hunger becomes materially high' },
      },
      world:{
        gameTime:req.world.gameTime, minuteOfDay:Math.round(req.world.minuteOfDay), weather:req.world.weather,
        nearbyNpcs:req.world.nearbyNpcs.map(n=>({id:n.id,name:n.name,role:n.role,mood:n.mood,distance:Number(n.distance.toFixed(1)),relationship:n.relationship,currentAction:n.currentAction})),
        nearbyObjects:req.world.nearbyObjects.map(o=>({id:o.id,kind:o.kind,name:o.name,tags:o.tags,capabilities:o.capabilities,distance:Number(o.distance.toFixed(1)),item:o.item})),
        recentEvents:req.world.recentEvents.slice(-4)
      },
      allowedActions:req.allowedActions,
      semantics:{ hunger:'0 full, 100 starving', energy:'0 exhausted, 100 rested', social:'0 lonely, 100 socially satisfied' }
    };

    try {
      const out = await this.call('npc',state, questions);
      const a = out.answers || {};
      const selected = a.action?.choice as DecisionAction | undefined;
      const action = selected && req.allowedActions.includes(selected) ? selected : fallbackDecision(req).action;
      const socialIntent = (a.social_intent?.choice || 'smalltalk') as SocialIntent;
      const stateShift = (a.state_shift?.choice || 'stable') as StateShift;
      const targetNpcId = req.world.nearbyNpcs.some(n => n.id === a.target_npc?.choice) ? a.target_npc?.choice : undefined;
      const targetObjectId = req.world.nearbyObjects.some(o => o.id === a.target_object?.choice) ? a.target_object?.choice : undefined;
      const confidence = Math.min(1, Math.max(0, Number(a.action?.confidence ?? .5)));
      if(confidence<this.budget.getConfig().minConfidence){
        this.budget.recordLowConfidence();
        return { ...fallbackDecision(req), source:'fallback-low-confidence', confidence };
      }
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
      const out = await this.call('chunk',state, questions);
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
        const confidence=Math.min(1,Math.max(0,confidences.length?confidences.reduce((a,b)=>a+b,0)/confidences.length:.5));
        if(confidence<this.budget.getConfig().minConfidence){
          this.budget.recordLowConfidence();
          return {
            chunkId:chunk.id, strategy:chunk.strategy, migrationPolicy:chunk.migrationPolicy, ecologyPolicy:chunk.ecologyPolicy,
            confidence, reasonCode:'jev_chunk_low_confidence_hold', source:'jev-hold'
          };
        }
        return {
          chunkId:chunk.id, strategy, migrationPolicy, ecologyPolicy,
          confidence,
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


  async decideRegions(req: RegionDecisionRequest): Promise<RegionDecisionResponse> {
    if(!this.key||!req.regions.length)return fallbackRegionDecisions(req);

    const priorities:Record<RegionPriority,string>={
      balanced:'Keep food, safety, ecology, movement, and prosperity in rough balance without a dominant intervention.',
      food_security:'Coordinate production, reserves, and trade so shortages and water/food fragility are reduced.',
      trade_network:'Strengthen exchange and specialization among settlements and neighboring chunks.',
      settlement_growth:'Coordinate capacity for controlled settlement and population growth where resources support it.',
      ecology_recovery:'Prioritize ecological restoration and lower regional extraction pressure.',
      security_coordination:'Coordinate safety, defensive capacity, and risk reduction across the region.'
    };
    const movement:Record<RegionMovementPolicy,string>={
      open:'Allow movement toward regional opportunity and capacity.',
      stabilize:'Keep movement modest and preserve current population distribution.',
      redistribute:'Encourage movement from stressed chunks toward safer/capable chunks inside the region.',
      restrict:'Reduce discretionary movement because scarcity, danger, or ecological pressure is high.'
    };
    const ecology:Record<RegionEcologyPolicy,string>={
      restore_corridors:'Reconnect and recover ecological capacity across neighboring chunks.',
      balanced_use:'Permit bounded use while maintaining regional ecological stability.',
      protected_network:'Coordinate stronger habitat protection across the region.',
      productive_landscape:'Favor sustainable food/resource landscapes while avoiding destructive extraction.'
    };

    const regions=req.regions.slice(0,8);
    const questions:Record<string,unknown>={};
    regions.forEach((region,index)=>{
      questions[`r${index}_priority`]={
        type:'choice',
        instructions:'Choose one medium-term regional coordination priority. Use only aggregate supplied state; do not invent events or numeric mutations.',
        criteria:priorities
      };
      questions[`r${index}_movement`]={
        type:'choice',
        instructions:'Choose the bounded regional movement policy. This guides deterministic migration flows rather than directly moving population.',
        criteria:movement
      };
      questions[`r${index}_ecology`]={
        type:'choice',
        instructions:'Choose the bounded regional ecology coordination policy. Deterministic simulation will implement any effects.',
        criteria:ecology
      };
    });

    const state={
      simulationLayer:'region',
      day:req.day,gameTime:req.gameTime,weather:req.weather,
      regions:regions.map(r=>({
        id:r.id,coordinates:[r.rx,r.rz],chunks:r.chunkIds.length,population:Number(r.population.toFixed(2)),settlements:r.settlements,
        food:Number(r.food.toFixed(1)),wood:Number(r.wood.toFixed(1)),water:Number(r.water.toFixed(1)),
        ecology:Number(r.ecology.toFixed(1)),danger:Number(r.danger.toFixed(1)),prosperity:Number(r.prosperity.toFixed(1))
      })),
      authority:'Select bounded coordination policies only. Never create entities or exact numeric state changes.'
    };

    try{
      const out=await this.call('region',state,questions);
      const answers=out.answers||{};
      const validPriority=Object.keys(priorities) as RegionPriority[];
      const validMovement=Object.keys(movement) as RegionMovementPolicy[];
      const validEcology=Object.keys(ecology) as RegionEcologyPolicy[];
      const decisions:RegionDecision[]=regions.map((region,index)=>{
        const p=answers[`r${index}_priority`],m=answers[`r${index}_movement`],e=answers[`r${index}_ecology`];
        const priority=validPriority.includes(p?.choice as RegionPriority)?p!.choice as RegionPriority:'balanced';
        const movementPolicy=validMovement.includes(m?.choice as RegionMovementPolicy)?m!.choice as RegionMovementPolicy:'stabilize';
        const ecologyPolicy=validEcology.includes(e?.choice as RegionEcologyPolicy)?e!.choice as RegionEcologyPolicy:'balanced_use';
        const cs=[p?.confidence,m?.confidence,e?.confidence].filter((x):x is number=>typeof x==='number');
        const confidence=Math.min(1,Math.max(0,cs.length?cs.reduce((a,b)=>a+b,0)/cs.length:.5));
        if(confidence<this.budget.getConfig().minConfidence){
          this.budget.recordLowConfidence();
          const fallback=fallbackRegionDecisions({ ...req, regions:[region] }).decisions[0]!;
          return {...fallback,confidence,source:'fallback-low-confidence'};
        }
        return {regionId:region.id,priority,movementPolicy,ecologyPolicy,confidence,reasonCode:`jev_region_${priority}`,source:'jev'};
      });
      return {source:'jev',decisions};
    }catch(error){
      this.failures++;
      this.lastError=error instanceof Error?error.message:String(error);
      return fallbackRegionDecisions(req);
    }
  }

  async decideWorld(req: WorldDecisionRequest): Promise<WorldDecisionResponse> {
    if(!this.key)return fallbackWorldDecision(req);

    const priorities:Record<WorldPriority,string>={
      resilience:'Favor system-wide robustness against scarcity, shocks, and local failures.',
      prosperity:'Favor stable exchange, specialization, and broad material prosperity.',
      expansion:'Favor controlled growth into underused capacity where resources support it.',
      ecology:'Favor long-term ecological capacity and recovery over short-term expansion.',
      security:'Favor coordinated risk reduction and safer population/resource distribution.',
      exploration:'Favor discovery, mobility, and gradual use of new frontier capacity.'
    };
    const connectivity:Record<WorldConnectivityPolicy,string>={
      localism:'Reduce long-distance dependence and favor local resilience.',
      balanced_networks:'Maintain moderate trade and migration links without strong specialization.',
      trade_corridors:'Strengthen durable exchange corridors among prosperous/specialized regions.',
      migration_corridors:'Keep safe movement routes open between stressed and high-capacity regions.'
    };
    const growth:Record<WorldGrowthPolicy,string>={
      steady:'Allow gradual growth where local conditions support it.',
      compact:'Prefer strengthening existing settlements over frontier expansion.',
      frontier:'Allow more settlement growth in underused safe regions.',
      conserve:'Suppress broad expansion until resources/ecology recover.'
    };

    const questions:Record<string,unknown>={
      priority:{type:'choice',instructions:'Choose the single long-horizon world priority from aggregate state and regional decisions. Do not invent events.',criteria:priorities},
      connectivity:{type:'choice',instructions:'Choose the bounded world connectivity policy. Deterministic systems will interpret it through migration/trade flow multipliers.',criteria:connectivity},
      growth:{type:'choice',instructions:'Choose the bounded world growth posture. Deterministic settlement simulation remains authoritative.',criteria:growth}
    };
    const state={
      simulationLayer:'world',
      day:req.day,gameTime:req.gameTime,weather:req.weather,
      summary:req.summary,
      regions:req.regions.map(r=>({id:r.regionId,priority:r.priority,movement:r.movementPolicy,ecology:r.ecologyPolicy,confidence:Number(r.confidence.toFixed(2))})),
      authority:'Choose strategic posture only; never directly mutate population, resources, settlements, or entities.'
    };

    try{
      const out=await this.call('world',state,questions);
      const a=out.answers||{};
      const validP=Object.keys(priorities) as WorldPriority[];
      const validC=Object.keys(connectivity) as WorldConnectivityPolicy[];
      const validG=Object.keys(growth) as WorldGrowthPolicy[];
      const priority=validP.includes(a.priority?.choice as WorldPriority)?a.priority!.choice as WorldPriority:'resilience';
      const connectivityChoice=validC.includes(a.connectivity?.choice as WorldConnectivityPolicy)?a.connectivity!.choice as WorldConnectivityPolicy:'balanced_networks';
      const selectedGrowth=validG.includes(a.growth?.choice as WorldGrowthPolicy)?a.growth!.choice as WorldGrowthPolicy:'steady';
      const cs=[a.priority?.confidence,a.connectivity?.confidence,a.growth?.confidence].filter((x):x is number=>typeof x==='number');
      const confidence=Math.min(1,Math.max(0,cs.length?cs.reduce((x,y)=>x+y,0)/cs.length:.5));
      if(confidence<this.budget.getConfig().minConfidence){
        this.budget.recordLowConfidence();
        const fallback=fallbackWorldDecision(req).decision;
        return {source:'fallback-low-confidence',decision:{...fallback,confidence,source:'fallback-low-confidence'}};
      }
      const decision:WorldDecision={priority,connectivity:connectivityChoice,growth:selectedGrowth,confidence,reasonCode:`jev_world_${priority}`,source:'jev'};
      return {source:'jev',decision};
    }catch(error){
      this.failures++;
      this.lastError=error instanceof Error?error.message:String(error);
      return fallbackWorldDecision(req);
    }
  }


  async decideWildlife(req: WildlifeDecisionBatchRequest): Promise<WildlifeDecisionBatchResponse> {
    const requests=req.requests.slice(0,6);
    if(!this.key||!requests.length)return fallbackWildlifeDecisions({requests});

    const descriptions:Record<WildlifeAction,string>={
      graze:'Feed on suitable vegetation/crops when herbivore hunger is meaningful.',
      forage:'Search nearby natural food opportunistically.',
      drink:'Move to a nearby water source and drink.',
      rest:'Stop moving and recover energy.',
      flee:'Move away from a nearby threat or predator.',
      hunt:'Predator approaches suitable nearby prey.',
      wander:'Move locally without a stronger urgent goal.',
      seek_mate:'Approach a suitable nearby same-species mate when healthy and mature.',
      migrate:'Move into one supplied adjacent chunk when habitat pressure justifies leaving the current chunk.'
    };
    const questions:Record<string,unknown>={};
    requests.forEach((entry,index)=>{
      const allowed=entry.allowedActions.slice(0,16);
      questions[`w${index}_action`]={
        type:'choice',
        instructions:'Choose the next bounded wildlife behavior. Prioritize immediate survival needs and real nearby opportunities. Do not invent resources, prey, or physiological changes.',
        criteria:Object.fromEntries(allowed.map(action=>[action,descriptions[action]]))
      };
      if(entry.world.nearbyResources.length){
        questions[`w${index}_resource`]={
          type:'choice',
          instructions:'Choose the most relevant supplied resource/site if the selected behavior uses one.',
          criteria:Object.fromEntries(entry.world.nearbyResources.slice(0,24).map(x=>[
            x.id,`tags=${x.tags.join(',')}; distance=${x.distance.toFixed(1)}; amount=${x.resourceAmount??'unknown'}`
          ]))
        };
      }
      if(entry.world.nearbyWildlife.length){
        questions[`w${index}_animal`]={
          type:'choice',
          instructions:'Choose a supplied animal only if the selected behavior requires prey, a mate, or a threat target.',
          criteria:Object.fromEntries(entry.world.nearbyWildlife.slice(0,24).map(x=>[
            x.id,`${x.species}; sex=${x.sex}; ageDays=${x.ageDays.toFixed(0)}; mateAvailable=${x.mateAvailable}; distance=${x.distance.toFixed(1)}; health=${x.health.toFixed(0)}; action=${x.currentAction}`
          ]))
        };
      }
      if(entry.allowedActions.includes('migrate')&&entry.world.nearbyChunks.length){
        questions[`w${index}_chunk`]={
          type:'choice',
          instructions:'Choose one supplied adjacent chunk only if migrate is selected. Prefer materially safer or less crowded habitat; do not invent destinations.',
          criteria:Object.fromEntries(entry.world.nearbyChunks.slice(0,8).map(x=>[
            x.id,`${x.biome}; density=${x.density.toFixed(2)}; competition=${x.competitionPressure.toFixed(0)}; ecology=${x.ecology.toFixed(0)}; food=${x.food.toFixed(0)}; water=${x.water.toFixed(0)}; danger=${x.danger.toFixed(0)}; settlement=${x.settlementLevel}`
          ]))
        };
      }
    });
    const state={
      simulationLayer:'wildlife',
      animals:requests.map(entry=>({
        id:entry.wildlife.id,species:entry.wildlife.species,ageDays:entry.wildlife.ageDays,
        health:Number(entry.wildlife.health.toFixed(1)),hunger:Number(entry.wildlife.hunger.toFixed(1)),
        thirst:Number(entry.wildlife.thirst.toFixed(1)),energy:Number(entry.wildlife.energy.toFixed(1)),
        sex:entry.wildlife.sex,generation:entry.wildlife.generation,traits:entry.wildlife.traits,
        allowedActions:entry.allowedActions,
        currentHabitat:entry.world.currentHabitat,
        nearbyChunks:entry.world.nearbyChunks,
        nearbyResources:entry.world.nearbyResources,
        nearbyWildlife:entry.world.nearbyWildlife
      })),
      world:{gameTime:requests[0]!.world.gameTime,minuteOfDay:requests[0]!.world.minuteOfDay,weather:requests[0]!.world.weather},
      authority:'Select behavior and supplied targets only. Never directly mutate health, needs, reproduction, population, resources, or genetics.'
    };

    try{
      const out=await this.call('wildlife',state,questions);
      const answers=out.answers||{};
      const fallback=fallbackWildlifeDecisions({requests});
      const decisions:WildlifeDecisionResult[]=requests.map((entry,index)=>{
        const actionAnswer=answers[`w${index}_action`];
        const selected=actionAnswer?.choice as WildlifeAction|undefined;
        const action=selected&&entry.allowedActions.includes(selected)?selected:fallback.decisions[index]!.action;
        const confidence=Math.min(1,Math.max(0,typeof actionAnswer?.confidence==='number'?actionAnswer.confidence:.5));
        if(confidence<this.budget.getConfig().minConfidence){
          this.budget.recordLowConfidence();
          return {...fallback.decisions[index]!,confidence,source:'fallback-low-confidence'};
        }
        const resourceId=answers[`w${index}_resource`]?.choice;
        const wildlifeId=answers[`w${index}_animal`]?.choice;
        const chunkId=answers[`w${index}_chunk`]?.choice;
        const targetObjectId=entry.world.nearbyResources.some(x=>x.id===resourceId)?resourceId:undefined;
        const targetWildlifeId=entry.world.nearbyWildlife.some(x=>x.id===wildlifeId)?wildlifeId:undefined;
        const targetChunkId=entry.world.nearbyChunks.some(x=>x.id===chunkId)?chunkId:undefined;
        return {
          wildlifeId:entry.wildlife.id,source:'jev',action,targetObjectId,targetWildlifeId,targetChunkId,
          confidence,reasonCode:`jev_wildlife_${action}`
        };
      });
      return {source:'jev',decisions};
    }catch(error){
      this.failures++;
      this.lastError=error instanceof Error?error.message:String(error);
      return fallbackWildlifeDecisions({requests});
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
      recentLines:req.recentLines.slice(-3),
      constraints:'Output decisions only. Dialogue text must come exclusively from candidate criteria.'
    };
    try {
      const out = await this.call('dialogue',state, questions);
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
      if(confidence<this.budget.getConfig().minConfidence){
        this.budget.recordLowConfidence();
        const fallback=fallbackDialogue(req,lines,fragments);
        return {...fallback,source:'fallback-low-confidence',confidence};
      }
      const relationEffect = (['positive','neutral','negative'].includes(String(a.relation_effect?.choice)) ? a.relation_effect?.choice : 'neutral') as RelationEffect;
      return { source:'jev', mode, text, selectedIds:selected.map(x=>x.id), confidence, relationEffect };
    } catch (error) {
      this.failures++;
      this.lastError = error instanceof Error ? error.message : String(error);
      return fallbackDialogue(req, lines, fragments);
    }
  }
}
