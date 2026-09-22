import type {
  WildlifeBiomeSelectionStats, WildlifeDeathReason, WildlifeEvolutionStats, WildlifeGenerationCohortStats,
  WildlifeHabitatExposure, WildlifeHabitatSnapshot, WildlifeLineageRecord, WildlifeSelectionSignal, WildlifeSpecies, WildlifeTraits
} from '../types.js';

const SPECIES:WildlifeSpecies[]=['rabbit','deer','boar','fox'];
const TRAITS:(keyof WildlifeTraits)[]=['speed','size','fertility','wariness'];

const zeroTraits=():WildlifeTraits=>({speed:0,size:0,fertility:0,wariness:0});
const zeroHabitat=():Omit<WildlifeHabitatSnapshot,'biome'>=>({ecology:0,food:0,water:0,danger:0,settlementLevel:0,plantBiomass:0,competitionPressure:0,seasonalSuitability:0});
const HABITAT_KEYS:(keyof Omit<WildlifeHabitatSnapshot,'biome'>)[]=['ecology','food','water','danger','settlementLevel','plantBiomass','competitionPressure','seasonalSuitability'];
const MIN_LIFETIME_EXPOSURE_DAYS=.02;

export function accumulateWildlifeHabitatExposure(
  exposure:WildlifeHabitatExposure|undefined,
  habitat:WildlifeHabitatSnapshot,
  chunkId:string,
  observedDays:number
):WildlifeHabitatExposure {
  const days=Math.max(0,observedDays);
  const previousDays=Math.max(0,exposure?.observedDays||0);
  const totalDays=previousDays+days;
  const habitatMean={...(exposure?.habitatMean||zeroHabitat())};
  if(days>0&&totalDays>0){
    for(const key of HABITAT_KEYS){
      const previous=Number(habitatMean[key]||0);
      const current=Number(habitat[key]||0);
      habitatMean[key]=(previous*previousDays+current*days)/totalDays;
    }
  }
  const biomeDays={...(exposure?.biomeDays||{})};
  const chunkDays={...(exposure?.chunkDays||{})};
  if(days>0){
    biomeDays[habitat.biome]=(biomeDays[habitat.biome]||0)+days;
    chunkDays[chunkId]=(chunkDays[chunkId]||0)+days;
  }
  const transitioned=days>0&&Boolean(exposure?.lastChunk)&&exposure?.lastChunk!==chunkId;
  return {
    observedDays:totalDays,
    habitatMean,
    biomeDays,
    chunkDays,
    observedTransitions:(exposure?.observedTransitions||0)+(transitioned?1:0),
    lastObservedDay:exposure?.lastObservedDay,
    lastChunk:chunkId,
    lastBiome:habitat.biome
  };
}

export function dominantWildlifeExposureBiome(exposure?:WildlifeHabitatExposure) {
  if(!exposure||exposure.observedDays<MIN_LIFETIME_EXPOSURE_DAYS)return undefined;
  return (Object.entries(exposure.biomeDays) as Array<[WildlifeHabitatSnapshot['biome'],number]>)
    .filter(([,days])=>days>0)
    .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0];
}

function mean(values:number[]) {
  return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
}

function variance(values:number[],average=mean(values)) {
  return values.length?values.reduce((sum,value)=>sum+(value-average)**2,0)/values.length:0;
}

function traitMean(records:WildlifeLineageRecord[]) {
  const out=zeroTraits();
  for(const trait of TRAITS)out[trait]=mean(records.map(record=>record.traitsAtBirth[trait]));
  return out;
}

function traitVariance(records:WildlifeLineageRecord[],average:WildlifeTraits) {
  const out=zeroTraits();
  for(const trait of TRAITS)out[trait]=variance(records.map(record=>record.traitsAtBirth[trait]),average[trait]);
  return out;
}

function traitTrend(records:WildlifeLineageRecord[]) {
  const out=zeroTraits();
  if(records.length<2)return out;
  const generations=records.map(record=>record.generation);
  const xMean=mean(generations);
  const denom=generations.reduce((sum,generation)=>sum+(generation-xMean)**2,0);
  if(denom<=0)return out;
  for(const trait of TRAITS){
    const y=records.map(record=>record.traitsAtBirth[trait]);
    const yMean=mean(y);
    out[trait]=records.reduce((sum,record,index)=>sum+(record.generation-xMean)*(y[index]!-yMean),0)/denom;
  }
  return out;
}

function cohort(generation:number,records:WildlifeLineageRecord[]):WildlifeGenerationCohortStats {
  const dead=records.filter(record=>record.deathDay!==undefined);
  const average=traitMean(records);
  const breeders=records.filter(record=>record.offspringCount>0);
  return {
    generation,
    population:records.length,
    living:records.length-dead.length,
    deaths:dead.length,
    meanLifespan:mean(dead.map(record=>Math.max(0,(record.deathDay??record.birthDay)-record.birthDay))),
    offspringMean:mean(records.map(record=>record.offspringCount)),
    breederRate:records.length?breeders.length/records.length:0,
    traitMean:average,
    traitVariance:traitVariance(records,average)
  };
}


function habitatMean(records:WildlifeLineageRecord[],basis:'origin'|'lifetime'):Omit<WildlifeHabitatSnapshot,'biome'> {
  if(basis==='origin'){
    const habitats=records.map(record=>record.birthHabitat).filter((value):value is WildlifeHabitatSnapshot=>Boolean(value));
    return {
      ecology:mean(habitats.map(value=>value.ecology)),
      food:mean(habitats.map(value=>value.food)),
      water:mean(habitats.map(value=>value.water)),
      danger:mean(habitats.map(value=>value.danger)),
      settlementLevel:mean(habitats.map(value=>value.settlementLevel)),
      plantBiomass:mean(habitats.map(value=>value.plantBiomass)),
      competitionPressure:mean(habitats.map(value=>Number(value.competitionPressure||0))),
      seasonalSuitability:mean(habitats.map(value=>Number(value.seasonalSuitability||0)))
    };
  }
  const out=zeroHabitat();
  const weighted=records.filter(record=>(record.habitatExposure?.observedDays||0)>0);
  const total=weighted.reduce((sum,record)=>sum+(record.habitatExposure?.observedDays||0),0);
  if(total<=0)return out;
  for(const record of weighted){
    const exposure=record.habitatExposure!;
    for(const key of HABITAT_KEYS)out[key]=Number(out[key]||0)+Number(exposure.habitatMean[key]||0)*exposure.observedDays/total;
  }
  return out;
}

function subtractTraits(a:WildlifeTraits,b:WildlifeTraits) {
  const out=zeroTraits();
  for(const trait of TRAITS)out[trait]=a[trait]-b[trait];
  return out;
}

function normalizedDifferential(difference:WildlifeTraits,records:WildlifeLineageRecord[],average:WildlifeTraits) {
  const variances=traitVariance(records,average);
  const out=zeroTraits();
  for(const trait of TRAITS){
    const sd=Math.sqrt(Math.max(0,variances[trait]));
    out[trait]=sd>1e-9?difference[trait]/sd:0;
  }
  return out;
}

function consistencyAcrossGenerations(records:WildlifeLineageRecord[],overall:WildlifeTraits) {
  const ratio=zeroTraits();
  const comparable=zeroTraits();
  const generations=[...new Set(records.map(record=>record.generation))];
  for(const trait of TRAITS){
    const expected=Math.sign(overall[trait]);
    if(expected===0)continue;
    let same=0;
    for(const generation of generations){
      const cohort=records.filter(record=>record.generation===generation);
      const breeders=cohort.filter(record=>record.offspringCount>0);
      if(cohort.length<2||!breeders.length)continue;
      const diff=traitMean(breeders)[trait]-traitMean(cohort)[trait];
      if(Math.abs(diff)<=1e-9)continue;
      comparable[trait]++;
      if(Math.sign(diff)===expected)same++;
    }
    ratio[trait]=comparable[trait]?same/comparable[trait]:0;
  }
  return {ratio,comparable};
}

function signalForTrait(
  population:number,
  breeders:number,
  generations:number,
  comparableGenerations:number,
  normalized:number,
  consistency:number,
  traitTrend:number
):WildlifeSelectionSignal {
  if(population<6||breeders<2||generations<2||comparableGenerations<2)return 'insufficient';
  const aligned=Math.sign(normalized)!==0&&Math.sign(normalized)===Math.sign(traitTrend);
  if(Math.abs(normalized)>=.20&&consistency>=.67&&aligned)return 'persistent';
  return 'weak';
}

function biomeSelection(records:WildlifeLineageRecord[],basis:'origin'|'lifetime'):WildlifeBiomeSelectionStats[] {
  const biomeFor=(record:WildlifeLineageRecord)=>basis==='origin'?record.birthHabitat?.biome:dominantWildlifeExposureBiome(record.habitatExposure);
  const biomes=[...new Set(records.map(biomeFor).filter((value):value is WildlifeHabitatSnapshot['biome']=>Boolean(value)))];
  return biomes.map(biome=>{
    const cohortRecords=records.filter(record=>biomeFor(record)===biome);
    const breeders=cohortRecords.filter(record=>record.offspringCount>0);
    const average=traitMean(cohortRecords);
    const breederAverage=breeders.length?traitMean(breeders):zeroTraits();
    const differential=subtractTraits(breederAverage,average);
    const normalized=normalizedDifferential(differential,cohortRecords,average);
    const consistency=consistencyAcrossGenerations(cohortRecords,differential);
    const trend=traitTrend(cohortRecords);
    const generations=[...new Set(cohortRecords.map(record=>record.generation))];
    const dead=cohortRecords.filter(record=>record.deathDay!==undefined);
    const signal={} as Record<keyof WildlifeTraits,WildlifeSelectionSignal>;
    for(const trait of TRAITS){
      signal[trait]=signalForTrait(
        cohortRecords.length,breeders.length,generations.length,consistency.comparable[trait],
        normalized[trait],consistency.ratio[trait],trend[trait]
      );
    }
    return {
      basis,
      biome,
      population:cohortRecords.length,
      breeders:breeders.length,
      generationsObserved:generations.length,
      breederRate:cohortRecords.length?breeders.length/cohortRecords.length:0,
      offspringMean:mean(cohortRecords.map(record=>record.offspringCount)),
      lifespanMean:mean(dead.map(record=>Math.max(0,(record.deathDay??record.birthDay)-record.birthDay))),
      observedExposureDaysMean:mean(cohortRecords.map(record=>record.habitatExposure?.observedDays||0)),
      habitatMean:habitatMean(cohortRecords,basis),
      traitMean:average,
      breederTraitMean:breederAverage,
      selectionDifferential:differential,
      normalizedSelectionDifferential:normalized,
      selectionConsistency:consistency.ratio,
      comparableSelectionGenerations:consistency.comparable,
      traitTrendPerGeneration:trend,
      signal
    };
  }).sort((a,b)=>b.population-a.population||a.biome.localeCompare(b.biome));
}

export function computeEvolutionStatistics(records:Iterable<WildlifeLineageRecord>):WildlifeEvolutionStats[] {
  const all=[...records];
  return SPECIES.map(species=>{
    const speciesRecords=all.filter(record=>record.species===species);
    const living=speciesRecords.filter(record=>record.deathDay===undefined);
    const dead=speciesRecords.filter(record=>record.deathDay!==undefined);
    const breeders=speciesRecords.filter(record=>record.offspringCount>0);
    const average=traitMean(speciesRecords);
    const mortality:Record<WildlifeDeathReason,number>={
      predation:0,starvation:0,dehydration:0,disease:0,senescence:0,other:0
    };
    for(const record of dead)mortality[record.deathReason??'other']++;
    const generations=[...new Set(speciesRecords.map(record=>record.generation))].sort((a,b)=>a-b);
    return {
      species,
      livingPopulation:living.length,
      historicalPopulation:speciesRecords.length,
      births:speciesRecords.filter(record=>record.origin==='reproduction').length,
      deaths:dead.length,
      generationMean:mean(speciesRecords.map(record=>record.generation)),
      generationMax:speciesRecords.length?Math.max(...speciesRecords.map(record=>record.generation)):0,
      lifespanMean:mean(dead.map(record=>Math.max(0,(record.deathDay??record.birthDay)-record.birthDay))),
      offspringMean:mean(speciesRecords.map(record=>record.offspringCount)),
      traitMean:average,
      traitVariance:traitVariance(speciesRecords,average),
      traitTrendPerGeneration:traitTrend(speciesRecords),
      mortality,
      reproductiveSuccess:mean(breeders.map(record=>record.offspringCount)),
      survivalToReproductionRate:speciesRecords.length?breeders.length/speciesRecords.length:0,
      cohorts:generations.map(generation=>cohort(generation,speciesRecords.filter(record=>record.generation===generation))),
      biomeSelection:biomeSelection(speciesRecords,'origin'),
      lifetimeBiomeSelection:biomeSelection(speciesRecords,'lifetime')
    };
  });
}

export function lineageAncestors(
  records:ReadonlyMap<string,WildlifeLineageRecord>,
  entityId:string,
  maxDepth=3
):WildlifeLineageRecord[] {
  const result:WildlifeLineageRecord[]=[];
  const seen=new Set<string>();
  const visit=(id:string|undefined,depth:number)=>{
    if(!id||depth>maxDepth||seen.has(id))return;
    const record=records.get(id);
    if(!record)return;
    seen.add(id);
    result.push(record);
    visit(record.motherId,depth+1);
    visit(record.fatherId,depth+1);
  };
  const root=records.get(entityId);
  if(root){
    visit(root.motherId,1);
    visit(root.fatherId,1);
  }
  return result;
}
