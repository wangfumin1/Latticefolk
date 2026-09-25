import type { CoarseChunkState } from '../types.js';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export interface ChunkDecisionSignal {
  population:number;
  food:number;
  wood:number;
  water:number;
  ecology:number;
  danger:number;
  prosperity:number;
  capturedAt:number;
}

export interface ChunkDecisionCandidate {
  chunk:CoarseChunkState;
  pressure:number;
  surprise:number;
  staleSeconds:number;
  needsBaseline:boolean;
  urgency:number;
}

export function captureChunkDecisionSignal(chunk:CoarseChunkState,capturedAt=Date.now()):ChunkDecisionSignal {
  return {
    population:chunk.population,
    food:chunk.food,
    wood:chunk.wood,
    water:chunk.water,
    ecology:chunk.ecology,
    danger:chunk.danger,
    prosperity:chunk.prosperity,
    capturedAt
  };
}

export function chunkDecisionStaleness(chunk:CoarseChunkState,nowMs=Date.now()) {
  if(!Number.isFinite(chunk.lastDecisionAt)||chunk.lastDecisionAt<=0)return 180;
  return clamp((nowMs-chunk.lastDecisionAt)/1000,0,180);
}

export function chunkDecisionPressure(chunk:CoarseChunkState,nowMs=Date.now()) {
  const scarcity=(100-clamp(chunk.food,0,100))+(100-clamp(chunk.water,0,100));
  const instability=clamp(chunk.danger,0,100)+(100-clamp(chunk.ecology,0,100))*.7;
  return scarcity*.55+instability*.5+chunkDecisionStaleness(chunk,nowMs);
}

export function chunkDecisionSurprise(chunk:CoarseChunkState,baseline?:ChunkDecisionSignal) {
  if(!baseline)return 100;
  const scalarDelta=(
    Math.abs(chunk.food-baseline.food)+
    Math.abs(chunk.wood-baseline.wood)+
    Math.abs(chunk.water-baseline.water)+
    Math.abs(chunk.ecology-baseline.ecology)+
    Math.abs(chunk.danger-baseline.danger)+
    Math.abs(chunk.prosperity-baseline.prosperity)
  )/6;
  const populationScale=Math.max(4,Math.abs(baseline.population));
  const populationDelta=clamp(Math.abs(chunk.population-baseline.population)/populationScale*100,0,100);
  return clamp(scalarDelta*.75+populationDelta*.25,0,100);
}

export function rankChunkDecisionCandidates(
  chunks:Iterable<CoarseChunkState>,
  baselines:ReadonlyMap<string,ChunkDecisionSignal>,
  nowMs:number,
  materialized:ReadonlySet<string>,
  limit=8
):ChunkDecisionCandidate[] {
  const candidates:ChunkDecisionCandidate[]=[];
  for(const chunk of chunks){
    if(materialized.has(chunk.id))continue;
    const baseline=baselines.get(chunk.id);
    const needsBaseline=chunk.decisionVersion===0||!baseline;
    const pressure=chunkDecisionPressure(chunk,nowMs);
    const surprise=chunkDecisionSurprise(chunk,baseline);
    const staleSeconds=chunkDecisionStaleness(chunk,nowMs);
    const urgency=(needsBaseline?10_000:0)+pressure+surprise*3;
    candidates.push({chunk,pressure,surprise,staleSeconds,needsBaseline,urgency});
  }
  return candidates
    .sort((a,b)=>b.urgency-a.urgency||a.chunk.id.localeCompare(b.chunk.id))
    .slice(0,Math.max(0,Math.floor(limit)));
}

export function nextChunkDecisionDelay(candidates:readonly ChunkDecisionCandidate[]) {
  const top=candidates[0];
  if(!top)return 30_000;
  if(top.needsBaseline)return 2_500;
  if(top.surprise>=18||top.urgency>=220)return 4_000;
  if(top.surprise>=8||top.urgency>=170)return 8_000;
  if(top.urgency>=125)return 15_000;
  return 30_000;
}
