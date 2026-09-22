import type {
  ChunkBiome, CoarseChunkState, CoarseWildlifePopulation, PlantBiomassState, WildlifeSpecies, WorldSeason
} from '../types';

export interface WildlifeMigration {
  species: WildlifeSpecies;
  fromChunkId: string;
  toChunkId: string;
  amount: number;
}

const SPECIES:WildlifeSpecies[]=['rabbit','deer','boar','fox'];
const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,v));
const round=(v:number)=>Math.round(v*1000)/1000;
const plantTotal=(p:{grass:number;shrub:number;fruit:number;crop:number})=>p.grass+p.shrub+p.fruit+p.crop;

function smooth(previous:number,next:number,weight=.08){
  return round(previous*(1-weight)+Math.max(0,next)*weight);
}

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

export function seasonForDay(day:number):WorldSeason {
  const index=Math.floor(Math.max(0,day-1)/30)%4;
  return (['spring','summer','autumn','winter'] as WorldSeason[])[index]!;
}

export function ensurePlantBiomass(chunk:CoarseChunkState):PlantBiomassState {
  if(chunk.plants){
    for(const key of ['grass','shrub','fruit','crop'] as const)chunk.plants[key]=clamp(Number(chunk.plants[key])||0);
    return chunk.plants;
  }
  const biome=chunk.biome;
  const jitter=(salt:string)=>.82+hash(`${chunk.id}:${salt}`)*.36;
  const base:Record<ChunkBiome,PlantBiomassState>={
    plains:{grass:82,shrub:44,fruit:28,crop:38},
    forest:{grass:48,shrub:78,fruit:64,crop:18},
    hills:{grass:52,shrub:58,fruit:34,crop:20},
    wetlands:{grass:68,shrub:74,fruit:42,crop:30},
    dryland:{grass:26,shrub:31,fruit:14,crop:16}
  };
  const source=base[biome];
  const settlementBoost=chunk.settlementLevel*10;
  chunk.plants={
    grass:clamp(source.grass*jitter('grass')*chunk.ecology/75),
    shrub:clamp(source.shrub*jitter('shrub')*chunk.ecology/75),
    fruit:clamp(source.fruit*jitter('fruit')*chunk.ecology/75),
    crop:clamp((source.crop+settlementBoost)*jitter('crop')*(chunk.food/65))
  };
  return chunk.plants;
}

export function simulatePlantBiomass(chunk:CoarseChunkState,seconds:number,weather:string,day:number){
  const plants=ensurePlantBiomass(chunk);
  const dt=Math.min(30,Math.max(0,seconds));
  const season=seasonForDay(day);
  const seasonGrowth:Record<WorldSeason,number>={spring:1.35,summer:1.05,autumn:.72,winter:.24};
  const rain=weather==='rain'?1.28:weather==='cloudy'?1.04:.92;
  const water=clamp(chunk.water/65,.18,1.25);
  const ecology=clamp(chunk.ecology/70,.25,1.3);
  const growth=.045*seasonGrowth[season]*rain*water*ecology*dt;
  const targets:PlantBiomassState={
    grass:chunk.biome==='plains'?92:chunk.biome==='dryland'?38:70,
    shrub:chunk.biome==='forest'||chunk.biome==='wetlands'?88:55,
    fruit:chunk.biome==='forest'?78:chunk.biome==='dryland'?24:48,
    crop:chunk.settlementLevel>0?72:24
  };
  for(const key of ['grass','shrub','fruit','crop'] as const){
    const cultivation=key==='crop'?1+chunk.settlementLevel*.14:1;
    plants[key]=clamp(plants[key]+Math.max(0,targets[key]-plants[key])*growth*.012*cultivation);
  }
  if(season==='winter'){
    plants.grass=clamp(plants.grass-.012*dt);
    plants.fruit=clamp(plants.fruit-.02*dt);
  }
  if(chunk.ecologyPolicy==='recover'){
    plants.grass=clamp(plants.grass+.015*dt);plants.shrub=clamp(plants.shrub+.012*dt);
  }else if(chunk.ecologyPolicy==='harvest'){
    plants.crop=clamp(plants.crop+.012*dt);plants.shrub=clamp(plants.shrub-.008*dt);
  }
  chunk.food=clamp(chunk.food+(plants.crop*.0008+plants.fruit*.00035-.025)*dt);
}

function plantFoodIndex(chunk:CoarseChunkState,species:WildlifeSpecies){
  const p=ensurePlantBiomass(chunk);
  if(species==='rabbit')return p.grass*.58+p.shrub*.3+p.crop*.12;
  if(species==='deer')return p.grass*.38+p.shrub*.38+p.fruit*.24;
  if(species==='boar')return p.shrub*.28+p.fruit*.34+p.crop*.38;
  return chunk.food*.55+chunk.ecology*.45;
}

function capacity(chunk:CoarseChunkState,species:WildlifeSpecies){
  const affinity=BIOME_AFFINITY[species][chunk.biome];
  const forage=plantFoodIndex(chunk,species);
  const habitat=(chunk.ecology*.38+forage*.32+chunk.water*.20+(100-chunk.danger)*.10)/100;
  const settlementPenalty=Math.max(.3,1-chunk.settlementLevel*.16);
  const base=species==='rabbit'?36:species==='deer'?16:species==='boar'?12:7;
  return Math.max(0,round(base*affinity*habitat*settlementPenalty));
}

export function ensureWildlifePopulations(chunk:CoarseChunkState){
  ensurePlantBiomass(chunk);
  const existing=new Map((chunk.wildlife||[]).map(x=>[x.species,x]));
  const seeded:CoarseWildlifePopulation[]=SPECIES.map(species=>{
    const carryingCapacity=capacity(chunk,species);
    const current=existing.get(species);
    if(current){
      current.carryingCapacity=carryingCapacity;
      current.health=clamp(Number.isFinite(current.health)?current.health:75);
      current.count=Math.max(0,current.count);
      current.diseaseLoad=clamp(Number(current.diseaseLoad)||0);
      return current;
    }
    const occupancy=.22+hash(`${chunk.id}:${species}:population`)*.52;
    const count=round(carryingCapacity*occupancy);
    return {
      species,count,carryingCapacity,health:65+hash(`${chunk.id}:${species}:health`)*25,
      diseaseLoad:hash(`${chunk.id}:${species}:disease`)*4
    };
  });
  chunk.wildlife=seeded;
  return seeded;
}

function consumePlants(chunk:CoarseChunkState,species:WildlifeSpecies,amount:number){
  const p=ensurePlantBiomass(chunk);
  if(amount<=0)return;
  if(species==='rabbit'){
    const grass=Math.min(p.grass,amount*.72);p.grass-=grass;p.shrub=clamp(p.shrub-(amount-grass)*.55);
  }else if(species==='deer'){
    p.grass=clamp(p.grass-amount*.40);p.shrub=clamp(p.shrub-amount*.38);p.fruit=clamp(p.fruit-amount*.22);
  }else if(species==='boar'){
    p.shrub=clamp(p.shrub-amount*.25);p.fruit=clamp(p.fruit-amount*.30);p.crop=clamp(p.crop-amount*.45);
  }
}

export function simulateWildlife(chunk:CoarseChunkState,seconds:number,weather:string,day=1){
  const plantsBefore=plantTotal(ensurePlantBiomass(chunk));
  simulatePlantBiomass(chunk,seconds,weather,day);
  const primaryProduction=Math.max(0,plantTotal(ensurePlantBiomass(chunk))-plantsBefore);
  const populations=ensureWildlifePopulations(chunk);
  const dt=Math.min(30,Math.max(0,seconds));
  let mortalityReturn=0;

  for(const pop of populations){
    pop.carryingCapacity=capacity(chunk,pop.species);
    const k=Math.max(.001,pop.carryingCapacity);
    const density=pop.count/k;
    const climateDisease=(chunk.biome==='wetlands'?.006:0)+(weather==='rain'?.003:0);
    const crowdDisease=Math.max(0,density-.72)*.018;
    pop.diseaseLoad=clamp((pop.diseaseLoad||0)+(climateDisease+crowdDisease-.006)*dt);

    const rainPenalty=weather==='rain'&&pop.species==='rabbit'?.0025:0;
    const droughtPenalty=chunk.water<25?.006:0;
    const humanPressure=chunk.settlementLevel*.0012+Math.max(0,chunk.danger-65)*.00012;
    const diseaseMortality=(pop.diseaseLoad||0)*.000045;
    const growthRate=pop.species==='rabbit'?.010:pop.species==='fox'?.0032:.0050;
    const natural=growthRate*pop.count*(1-density)*dt;
    const losses=(rainPenalty+droughtPenalty+humanPressure+diseaseMortality)*pop.count*dt;
    mortalityReturn+=Math.max(0,losses);
    pop.count=Math.max(0,round(pop.count+natural-losses));

    const forage=plantFoodIndex(chunk,pop.species);
    const habitatHealth=clamp(30+chunk.ecology*.31+forage*.20+chunk.water*.14-chunk.danger*.10-(pop.diseaseLoad||0)*.22);
    pop.health=clamp(pop.health+(habitatHealth-pop.health)*Math.min(.10,dt*.003));
  }

  const rabbits=populations.find(x=>x.species==='rabbit')!;
  const foxes=populations.find(x=>x.species==='fox')!;
  const deer=populations.find(x=>x.species==='deer')!;
  const boar=populations.find(x=>x.species==='boar')!;

  const beforeHerbivory=plantTotal(ensurePlantBiomass(chunk));
  consumePlants(chunk,'rabbit',rabbits.count*.008*dt);
  consumePlants(chunk,'deer',deer.count*.018*dt);
  consumePlants(chunk,'boar',boar.count*.020*dt);
  const herbivory=Math.max(0,beforeHerbivory-plantTotal(ensurePlantBiomass(chunk)));

  const preyAvailable=rabbits.count+deer.count*.25;
  const predation=Math.min(rabbits.count,foxes.count*Math.min(.015,preyAvailable*.0007)*dt);
  rabbits.count=Math.max(0,round(rabbits.count-predation));
  foxes.health=clamp(foxes.health+(predation>0?.07:-.05)*dt);

  const p=ensurePlantBiomass(chunk);
  const plantAverage=(p.grass+p.shrub+p.fruit+p.crop)/4;
  chunk.ecology=clamp(chunk.ecology+(plantAverage-chunk.ecology)*.0008*dt+(chunk.ecologyPolicy==='recover'?.015:0)*dt);

  const flux=chunk.trophicFlux??{primaryProduction:0,herbivory:0,predation:0,mortalityReturn:0};
  flux.primaryProduction=smooth(flux.primaryProduction,primaryProduction);
  flux.herbivory=smooth(flux.herbivory,herbivory);
  flux.predation=smooth(flux.predation,predation);
  flux.mortalityReturn=smooth(flux.mortalityReturn,mortalityReturn+predation*.12);
  chunk.trophicFlux=flux;
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
        const diseasePressure=((fp.diseaseLoad||0)-(tp.diseaseLoad||0))/100;
        if(fd-td<.34&&diseasePressure<.18||fp.count<1)continue;
        const amount=round(Math.min(fp.count*.018,.35,Math.max(.03,(fd-td+diseasePressure)*.15)));
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
    if(actual<=0)continue;
    const total=target.count+actual;
    target.diseaseLoad=total>0?clamp(((target.diseaseLoad||0)*target.count+(source.diseaseLoad||0)*actual)/total):target.diseaseLoad;
    source.count=round(source.count-actual);
    target.count=round(total);
  }
}

export function wildlifeCount(chunk:CoarseChunkState){
  return ensureWildlifePopulations(chunk).reduce((sum,p)=>sum+p.count,0);
}

export function plantBiomassTotal(chunk:CoarseChunkState){
  const p=ensurePlantBiomass(chunk);
  return p.grass+p.shrub+p.fruit+p.crop;
}
