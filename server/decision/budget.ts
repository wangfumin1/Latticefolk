export type JevCallKind = 'npc' | 'dialogue' | 'chunk';

export interface JevBudgetConfig {
  enabled: boolean;
  maxCallsPerMinute: number;
  maxInputTokensPerMinute: number;
  maxInputTokensPerHour: number;
  maxInputTokensPerDay: number;
  maxUsdPerDay: number;
  minConfidence: number;
  cacheTtlMs: number;
  npcWeight: number;
  dialogueWeight: number;
  chunkWeight: number;
}

export interface JevBudgetSnapshot {
  config: JevBudgetConfig;
  inputTokens: { minute: number; hour: number; day: number; lifetime: number };
  estimatedUsd: { day: number; lifetime: number };
  calls: { minute: number; hour: number; day: number; lifetime: number; npc: number; dialogue: number; chunk: number };
  blocked: number;
  cacheHits: number;
  lowConfidenceFallbacks: number;
  pricePerBillionInputTokensUsd: number;
}

type Usage = { at:number; tokens:number; kind:JevCallKind };

const PRICE_PER_BILLION_INPUT_TOKENS_USD = 42;
const n=(name:string,fallback:number)=> {
  const value=Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(0,value) : fallback;
};

export class JevBudgetController {
  private config: JevBudgetConfig = {
    enabled: process.env.JEV_BUDGET_ENABLED !== 'false',
    maxCallsPerMinute:n('JEV_MAX_CALLS_PER_MINUTE',60),
    maxInputTokensPerMinute:n('JEV_MAX_INPUT_TOKENS_PER_MINUTE',120_000),
    maxInputTokensPerHour:n('JEV_MAX_INPUT_TOKENS_PER_HOUR',1_000_000),
    maxInputTokensPerDay:n('JEV_MAX_INPUT_TOKENS_PER_DAY',5_000_000),
    maxUsdPerDay:n('JEV_MAX_USD_PER_DAY',0.25),
    minConfidence:Math.min(1,n('JEV_MIN_CONFIDENCE',0.35)),
    cacheTtlMs:n('JEV_CACHE_TTL_MS',2500),
    npcWeight:n('JEV_NPC_WEIGHT',1),
    dialogueWeight:n('JEV_DIALOGUE_WEIGHT',1),
    chunkWeight:n('JEV_CHUNK_WEIGHT',0.65),
  };
  private usage: Usage[]=[];
  private lifetimeTokens=0;
  private lifetimeCalls=0;
  private byKind:Record<JevCallKind,number>={npc:0,dialogue:0,chunk:0};
  private blocked=0;
  private cacheHits=0;
  private lowConfidenceFallbacks=0;

  getConfig(){return {...this.config};}

  update(patch:Partial<JevBudgetConfig>){
    const numeric:(keyof JevBudgetConfig)[]=[
      'maxCallsPerMinute','maxInputTokensPerMinute','maxInputTokensPerHour','maxInputTokensPerDay',
      'maxUsdPerDay','minConfidence','cacheTtlMs','npcWeight','dialogueWeight','chunkWeight'
    ];
    if(typeof patch.enabled==='boolean')this.config.enabled=patch.enabled;
    for(const key of numeric){
      const v=patch[key];
      if(typeof v==='number'&&Number.isFinite(v)){
        (this.config as any)[key]=key==='minConfidence'?Math.min(1,Math.max(0,v)):Math.max(0,v);
      }
    }
    return this.snapshot();
  }

  estimateTokens(payload:unknown){
    const text=JSON.stringify(payload);
    let ascii=0,wide=0;
    for(const ch of text){ if(ch.charCodeAt(0)<=0x7f)ascii++;else wide++; }
    // Conservative enough for guarding a budget; actual API usage replaces this after a call.
    return Math.max(1,Math.ceil(ascii/3.4+wide/1.25));
  }

  private prune(){
    const cutoff=Date.now()-86_400_000;
    this.usage=this.usage.filter(x=>x.at>=cutoff);
  }

  private sum(ms:number){
    const cutoff=Date.now()-ms;
    return this.usage.filter(x=>x.at>=cutoff).reduce((s,x)=>s+x.tokens,0);
  }

  private count(ms:number){
    const cutoff=Date.now()-ms;
    return this.usage.filter(x=>x.at>=cutoff).length;
  }

  private weight(kind:JevCallKind){
    return kind==='npc'?this.config.npcWeight:kind==='dialogue'?this.config.dialogueWeight:this.config.chunkWeight;
  }

  canCall(kind:JevCallKind,estimatedTokens:number){
    if(!this.config.enabled)return {ok:true as const};
    this.prune();
    const weighted=Math.ceil(estimatedTokens*this.weight(kind));
    const minuteTokens=this.sum(60_000);
    const hourTokens=this.sum(3_600_000);
    const dayTokens=this.sum(86_400_000);
    const callsMinute=this.count(60_000);
    const projectedDayUsd=(dayTokens+weighted)*PRICE_PER_BILLION_INPUT_TOKENS_USD/1_000_000_000;
    let reason='';
    if(this.config.maxCallsPerMinute&&callsMinute>=this.config.maxCallsPerMinute)reason='calls_per_minute';
    else if(this.config.maxInputTokensPerMinute&&minuteTokens+weighted>this.config.maxInputTokensPerMinute)reason='tokens_per_minute';
    else if(this.config.maxInputTokensPerHour&&hourTokens+weighted>this.config.maxInputTokensPerHour)reason='tokens_per_hour';
    else if(this.config.maxInputTokensPerDay&&dayTokens+weighted>this.config.maxInputTokensPerDay)reason='tokens_per_day';
    else if(this.config.maxUsdPerDay&&projectedDayUsd>this.config.maxUsdPerDay)reason='usd_per_day';
    if(reason){this.blocked++;return {ok:false as const,reason};}
    return {ok:true as const};
  }

  record(kind:JevCallKind,tokens:number){
    const safe=Math.max(0,Math.round(tokens));
    this.usage.push({at:Date.now(),tokens:safe,kind});
    this.lifetimeTokens+=safe;this.lifetimeCalls++;this.byKind[kind]++;
    this.prune();
  }
  recordCacheHit(){this.cacheHits++;}
  recordLowConfidence(){this.lowConfidenceFallbacks++;}

  snapshot():JevBudgetSnapshot{
    this.prune();
    const minute=this.sum(60_000),hour=this.sum(3_600_000),day=this.sum(86_400_000);
    return {
      config:this.getConfig(),
      inputTokens:{minute,hour,day,lifetime:this.lifetimeTokens},
      estimatedUsd:{day:day*PRICE_PER_BILLION_INPUT_TOKENS_USD/1_000_000_000,lifetime:this.lifetimeTokens*PRICE_PER_BILLION_INPUT_TOKENS_USD/1_000_000_000},
      calls:{minute:this.count(60_000),hour:this.count(3_600_000),day:this.count(86_400_000),lifetime:this.lifetimeCalls,...this.byKind},
      blocked:this.blocked,cacheHits:this.cacheHits,lowConfidenceFallbacks:this.lowConfidenceFallbacks,
      pricePerBillionInputTokensUsd:PRICE_PER_BILLION_INPUT_TOKENS_USD
    };
  }
}
