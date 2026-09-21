import type { ChunkBiome, CoarseChunkState, CoarseWildlifePopulation, WildlifeSpecies } from '../types';

export interface WildlifeMigration {
  species: WildlifeSpecies;
  fromChunkId: string;
  toChunkId: string;
  amount: number;
}

const SPECIES:WildlifeSpecies[]=['rabbit','deer','boar','fox'];
const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,v));
const round=(v:number)=>Math.round(v*1000)/1000;

const BIOME_AFFINITY:Record<WildlifeSpecies,Record<ChunkBiome,number>>={
  rabbit:{plains:1,forest:.82,hills:.65,wetlands:.72,dryland:.35},
  deer:{plains:.72,forest:1,hills:.82,wetlands:.55,dryland:.28},
  boar:{plains:.68,forest:1,hills:.62,wetlands:.84,dryland:.25},
  fox:{plains:.9,forest:.92,hills:.78,wetlands:.56,dryland:.48}
};

function hash(text:string){
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0)/4294967295;
}

function capacity(chunk:CoarseChunkState,species:WildlifeSpecies){
  const affinity=BIOME_AFFINITY[species][chunk.biome];
  const habitat=(chunk.ecology*.52+chunk.food*.22+chunk.water*.18+(100-chunk.danger)*.08)/100;
  const settlementPenalty=Math.max(.3,1-chunk.settlementLevel*.16);
  const base=species==='rabbit'?36:species==='deer'?16:species==='boar'?12:7;
  return Math.max(0,round(base*affinity*habitat*settlementPenalty));
}

export function ensureWildlifePopulations(chunk:CoarseChunkState){
  const existing=new Map((chunk.wildlife||[]).map(x=>[x.species,x]));
  const seeded:CoarseWildlifePopulation[]=SPECIES.map(species=>{
    const carryingCapacity=capacity(chunk,species);
    const current=existing.get(species);
    if(current){
      current.carryingCapacity=carryingCapacity;
      current.health=clamp(Number.isFinite(current.health)?current.health:75);
      current.count=Math.max(0,current.count);
      return current;
    }
    const occupancy=.22+hash(`${chunk.id}:${species}:population`)*.52;
    const count=round(carryingCapacity*occupancy);
    return {species,count,carryingCapacity,health:65+hash(`${chunk.id}:${species}:health`)*25};
  });
  chunk.wildlife=seeded;
  return seeded;
}

export function simulateWildlife(chunk:CoarseChunkState,seconds:number,weather:string){
  const populations=ensureWildlifePopulations(chunk);
  const dt=Math.min(30,Math.max(0,seconds));
  for(const pop of populations){
    pop.carryingCapacity=capacity(chunk,pop.species);
    const k=Math.max(.001,pop.carryingCapacity);
    const pressure=pop.count/k;
    const rainPenalty=weather==='rain'&&pop.species==='rabbit'?.004:0;
    const droughtPenalty=chunk.water<25?.008:0;
    const humanPressure=chunk.settlementLevel*.0015+Math.max(0,chunk.danger-65)*.00015;
    const growthRate=pop.species==='rabbit'?.012:pop.species==='fox'?.0035:.0055;
    const natural=growthRate*pop.count*(1-pressure)*dt;
    const losses=(rainPenalty+droughtPenalty+humanPressure)*pop.count*dt;
    pop.count=Math.max(0,round(pop.count+natural-losses));
    const habitatHealth=clamp(35+chunk.ecology*.38+chunk.food*.14+chunk.water*.13-chunk.danger*.12);
    pop.health=clamp(pop.health+(habitatHealth-pop.health)*Math.min(.08,dt*.0025));
  }

  const rabbits=populations.find(x=>x.species==='rabbit')!;
  const foxes=populations.find(x=>x.species==='fox')!;
  const deer=populations.find(x=>x.species==='deer')!;
  const boar=populations.find(x=>x.species==='boar')!;
  const preyAvailable=rabbits.count+deer.count*.25;
  const predation=Math.min(rabbits.count,foxes.count*Math.min(.018,preyAvailable*.0008)*dt);
  rabbits.count=Math.max(0,round(rabbits.count-predation));
  foxes.health=clamp(foxes.health+(predation>0?.08:-.06)*dt);
  const grazerLoad=(rabbits.count*.015+deer.count*.04+boar.count*.035)*dt;
  chunk.food=clamp(chunk.food-grazerLoad*.015);
  chunk.ecology=clamp(chunk.ecology-grazerLoad*.006+(chunk.ecologyPolicy==='recover'?.018:0)*dt);
}

export function planWildlifeMigration(chunks:Iterable<CoarseChunkState>,materialized:ReadonlySet<string>):WildlifeMigration[]{
  const list=[...chunks];
  const byCoord=new Map(list.map(c=>[`${c.cx},${c.cz}`,c]));
  const moves:WildlifeMigration[]=[];
  for(const source of list){
    if(materialized.has(source.id))continue;
    ensureWildlifePopulations(source);
    for(const [dx,dz] of [[1,0],[0,1]] as const){
      const other=byCoord.get(`${source.cx+dx},${source.cz+dz}`);
      if(!other||materialized.has(other.id))continue;
      ensureWildlifePopulations(other);
      for(const species of SPECIES){
        let from=source,to=other;
        const a=source.wildlife!.find(x=>x.species===species)!;
        const b=other.wildlife!.find(x=>x.species===species)!;
        const densityA=a.carryingCapacity>0?a.count/a.carryingCapacity:2;
        const densityB=b.carryingCapacity>0?b.count/b.carryingCapacity:2;
        if(densityB>densityA){from=other;to=source;}
        const fp=from.wildlife!.find(x=>x.species===species)!;
        const tp=to.wildlife!.find(x=>x.species===species)!;
        const fd=fp.carryingCapacity>0?fp.count/fp.carryingCapacity:2;
        const td=tp.carryingCapacity>0?tp.count/tp.carryingCapacity:2;
        if(fd-td<.34||fp.count<1)continue;
        const amount=round(Math.min(fp.count*.018,.35,Math.max(.03,(fd-td)*.15)));
        if(amount>0)moves.push({species,fromChunkId:from.id,toChunkId:to.id,amount});
      }
    }
  }
  return moves;
}

export function applyWildlifeMigration(chunks:Map<string,CoarseChunkState>,moves:WildlifeMigration[]){
  for(const move of moves){
    const from=chunks.get(move.fromChunkId),to=chunks.get(move.toChunkId);
    if(!from||!to)continue;
    ensureWildlifePopulations(from);ensureWildlifePopulations(to);
    const source=from.wildlife!.find(x=>x.species===move.species)!;
    const target=to.wildlife!.find(x=>x.species===move.species)!;
    const actual=Math.min(source.count,Math.max(0,move.amount));
    source.count=round(source.count-actual);
    target.count=round(target.count+actual);
  }
}

export function wildlifeCount(chunk:CoarseChunkState){
  return ensureWildlifePopulations(chunk).reduce((sum,p)=>sum+p.count,0);
}
