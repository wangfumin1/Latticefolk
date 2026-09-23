import type {
  WildlifeBiomeSelectionStats, WildlifeDeathReason, WildlifeEvolutionStats, WildlifeFitnessBandStats, WildlifeFitnessExposureDimension,
  WildlifeGenerationCohortStats, WildlifeHabitatExposure, WildlifeHabitatFitnessStats, WildlifeHabitatSnapshot,
  WildlifeInteractionSourceFitnessStats, WildlifeInteractionSourceGenerationCohort, WildlifeInteractionSourceGenerationEvidence,
  WildlifeCoevolutionGenerationEvidence, WildlifeCoevolutionPairEvidence, WildlifeCoevolutionSideEvidence, WildlifeLineageRecord,
  WildlifeNullableTraits, WildlifePredationGenerationPerformance, WildlifePredationPairPerformance, WildlifePredatorSpecializationStats,
  WildlifeRealizedPredationStats, WildlifeReciprocalInteractionSelectionEvidence, WildlifeSelectionSignal, WildlifeSpecies, WildlifeTraits
} from '../types.js';
import { wildlifeLifeHistory } from './wildlifeLifeHistory.js';
import { WILDLIFE_SPECIES } from './wildlifeSpecies.js';

const SPECIES=[...WILDLIFE_SPECIES];
const TRAITS:(keyof WildlifeTraits)[]=['speed','size','fertility','wariness'];

const zeroTraits=():WildlifeTraits=>({speed:0,size:0,fertility:0,wariness:0});
const addTraitTotals=(a:WildlifeTraits,b:WildlifeTraits):WildlifeTraits=>({
  speed:a.speed+b.speed,size:a.size+b.size,fertility:a.fertility+b.fertility,wariness:a.wariness+b.wariness
});
const meanTraitTotals=(sum:WildlifeTraits,count:number):WildlifeTraits=>count>0?({
  speed:sum.speed/count,size:sum.size/count,fertility:sum.fertility/count,wariness:sum.wariness/count
}):zeroTraits();
const zeroHabitat=():Omit<WildlifeHabitatSnapshot,'biome'>=>({ecology:0,food:0,water:0,danger:0,settlementLevel:0,plantBiomass:0,competitionPressure:0,seasonalSuitability:0,diseasePressure:0,predatorPressure:0});
const HABITAT_KEYS:(keyof Omit<WildlifeHabitatSnapshot,'biome'>)[]=['ecology','food','water','danger','settlementLevel','plantBiomass','competitionPressure','seasonalSuitability','diseasePressure','predatorPressure'];
const MIN_LIFETIME_EXPOSURE_DAYS=.02;

function accumulateSourceExposure(
  previousMean:Partial<Record<WildlifeSpecies,number>>|undefined,
  previousDays:number|undefined,
  current:Partial<Record<WildlifeSpecies,number>>|undefined,
  days:number
) {
  const observedDays=Math.max(0,previousDays||0);
  if(!current||days<=0)return {mean:previousMean?{...previousMean}:undefined,observedDays};
  const nextDays=observedDays+days;
  const next=previousMean?{...previousMean}:{} as Partial<Record<WildlifeSpecies,number>>;
  for(const species of SPECIES){
    const before=Number(next[species]||0);
    const value=Number(current[species]||0);
    next[species]=(before*observedDays+value*days)/nextDays;
  }
  return {mean:next,observedDays:nextDays};
}

export function accumulateWildlifeHabitatExposure(
  exposure:WildlifeHabitatExposure|undefined,
  habitat:WildlifeHabitatSnapshot,
  chunkId:string,
  observedDays:number,
  predatorSourcePressure?:Partial<Record<WildlifeSpecies,number>>,
  competitionSourcePressure?:Partial<Record<WildlifeSpecies,number>>,
  diseaseSourcePressure?:Partial<Record<WildlifeSpecies,number>>
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
  const predatorSource=accumulateSourceExposure(
    exposure?.predatorSourceMean,exposure?.predatorSourceObservedDays,predatorSourcePressure,days
  );
  const competitionSource=accumulateSourceExposure(
    exposure?.competitionSourceMean,exposure?.competitionSourceObservedDays,competitionSourcePressure,days
  );
  const diseaseSource=accumulateSourceExposure(
    exposure?.diseaseSourceMean,exposure?.diseaseSourceObservedDays,diseaseSourcePressure,days
  );
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
    predatorSourceMean:predatorSource.mean,
    predatorSourceObservedDays:predatorSource.observedDays,
    competitionSourceMean:competitionSource.mean,
    competitionSourceObservedDays:competitionSource.observedDays,
    diseaseSourceMean:diseaseSource.mean,
    diseaseSourceObservedDays:diseaseSource.observedDays,
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

function correlation(xs:number[],ys:number[]):number|null {
  if(xs.length<3||xs.length!==ys.length)return null;
  const mx=mean(xs),my=mean(ys);
  let numerator=0,dx=0,dy=0;
  for(let i=0;i<xs.length;i++){
    const a=xs[i]!-mx,b=ys[i]!-my;
    numerator+=a*b;dx+=a*a;dy+=b*b;
  }
  const denom=Math.sqrt(dx*dy);
  return denom>1e-12?numerator/denom:null;
}

function slope(xs:number[],ys:number[]):number|null {
  if(xs.length<2||xs.length!==ys.length)return null;
  const mx=mean(xs),my=mean(ys);
  let numerator=0,denominator=0;
  for(let i=0;i<xs.length;i++){
    const dx=xs[i]!-mx;
    numerator+=dx*(ys[i]!-my);
    denominator+=dx*dx;
  }
  return denominator>1e-12?numerator/denominator:null;
}

const nullableTraitEvidence=(fn:(trait:keyof WildlifeTraits)=>number|null):WildlifeNullableTraits=>({
  speed:fn('speed'),size:fn('size'),fertility:fn('fertility'),wariness:fn('wariness')
});

function fitnessOutcomeEligible(record:WildlifeLineageRecord,asOfDay?:number) {
  if(record.deathDay!==undefined)return true;
  if(asOfDay===undefined||!Number.isFinite(asOfDay))return false;
  return Math.max(0,asOfDay-record.birthDay)>=wildlifeLifeHistory(record.species).adultAge;
}

function fitnessBand(value:number):WildlifeFitnessBandStats['band'] {
  return value<33?'low':value<67?'medium':'high';
}

function habitatFitness(records:WildlifeLineageRecord[],asOfDay?:number):WildlifeHabitatFitnessStats[] {
  const dimensions:WildlifeFitnessExposureDimension[]=['competitionPressure','seasonalSuitability','diseasePressure','predatorPressure'];
  return dimensions.map(dimension=>{
    const samples=records.map(record=>{
      const exposure=record.habitatExposure;
      const raw=exposure?.habitatMean?.[dimension];
      return exposure&&exposure.observedDays>=MIN_LIFETIME_EXPOSURE_DAYS&&typeof raw==='number'&&Number.isFinite(raw)
        ?{record,exposureDays:exposure.observedDays,value:raw}
        :undefined;
    }).filter((x):x is {record:WildlifeLineageRecord;exposureDays:number;value:number}=>Boolean(x));

    const eligible=samples.filter(sample=>fitnessOutcomeEligible(sample.record,asOfDay));
    const breeders=eligible.filter(sample=>sample.record.offspringCount>0);
    const nonBreeders=eligible.filter(sample=>sample.record.offspringCount<=0);
    const dead=samples.filter(sample=>sample.record.deathDay!==undefined);
    const bands:WildlifeFitnessBandStats[]=(['low','medium','high'] as const).map(band=>{
      const bandSamples=samples.filter(sample=>fitnessBand(sample.value)===band);
      const bandRecords=bandSamples.map(sample=>sample.record);
      const eligibleBandSamples=bandSamples.filter(sample=>fitnessOutcomeEligible(sample.record,asOfDay));
      const eligibleBandRecords=eligibleBandSamples.map(sample=>sample.record);
      const bandBreeders=eligibleBandRecords.filter(record=>record.offspringCount>0);
      const bandDead=bandRecords.filter(record=>record.deathDay!==undefined);
      const average=traitMean(eligibleBandRecords);
      const breederAverage=bandBreeders.length?traitMean(bandBreeders):zeroTraits();
      return {
        band,
        population:bandRecords.length,
        eligiblePopulation:eligibleBandRecords.length,
        living:bandRecords.length-bandDead.length,
        deaths:bandDead.length,
        breeders:bandBreeders.length,
        breederRate:eligibleBandRecords.length?bandBreeders.length/eligibleBandRecords.length:0,
        offspringMean:mean(eligibleBandRecords.map(record=>record.offspringCount)),
        lifespanMean:mean(bandDead.map(record=>Math.max(0,(record.deathDay??record.birthDay)-record.birthDay))),
        exposureMean:mean(bandSamples.map(sample=>sample.value)),
        traitMean:average,
        breederTraitMean:breederAverage,
        selectionDifferential:subtractTraits(breederAverage,average)
      };
    });
    return {
      dimension,
      sampleSize:samples.length,
      reproductionEligibleSamples:eligible.length,
      lifespanSamples:dead.length,
      observedExposureDaysMean:mean(samples.map(sample=>sample.exposureDays)),
      exposureMean:mean(samples.map(sample=>sample.value)),
      breederExposureMean:breeders.length?mean(breeders.map(sample=>sample.value)):null,
      nonBreederExposureMean:nonBreeders.length?mean(nonBreeders.map(sample=>sample.value)):null,
      reproductionAssociation:correlation(eligible.map(sample=>sample.value),eligible.map(sample=>sample.record.offspringCount>0?1:0)),
      offspringAssociation:correlation(eligible.map(sample=>sample.value),eligible.map(sample=>sample.record.offspringCount)),
      lifespanAssociation:correlation(
        dead.map(sample=>sample.value),
        dead.map(sample=>Math.max(0,(sample.record.deathDay??sample.record.birthDay)-sample.record.birthDay))
      ),
      bands
    };
  });
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
      seasonalSuitability:mean(habitats.map(value=>Number(value.seasonalSuitability||0))),
      diseasePressure:mean(habitats.map(value=>Number(value.diseasePressure||0))),
      predatorPressure:mean(habitats.map(value=>Number(value.predatorPressure||0)))
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

function predatorSpecialization(records:WildlifeLineageRecord[],asOfDay?:number):WildlifePredatorSpecializationStats[] {
  return SPECIES.map(predatorSpecies=>{
    const samples=records.map(record=>{
      const exposure=record.habitatExposure;
      const value=exposure?.predatorSourceMean?.[predatorSpecies];
      const sourceDays=exposure?.predatorSourceObservedDays||0;
      return sourceDays>=MIN_LIFETIME_EXPOSURE_DAYS&&typeof value==='number'&&Number.isFinite(value)
        ?{record,exposureDays:sourceDays,value}
        :undefined;
    }).filter((x):x is {record:WildlifeLineageRecord;exposureDays:number;value:number}=>Boolean(x));
    if(!samples.length||!samples.some(sample=>sample.value>0))return undefined;
    const eligible=samples.filter(sample=>fitnessOutcomeEligible(sample.record,asOfDay));
    const breeders=eligible.filter(sample=>sample.record.offspringCount>0);
    const nonBreeders=eligible.filter(sample=>sample.record.offspringCount<=0);
    const dead=samples.filter(sample=>sample.record.deathDay!==undefined);
    const average=traitMean(eligible.map(sample=>sample.record));
    const breederAverage=breeders.length?traitMean(breeders.map(sample=>sample.record)):zeroTraits();
    return {
      predatorSpecies,
      sampleSize:samples.length,
      reproductionEligibleSamples:eligible.length,
      lifespanSamples:dead.length,
      observedExposureDaysMean:mean(samples.map(sample=>sample.exposureDays)),
      pressureMean:mean(samples.map(sample=>sample.value)),
      breederPressureMean:breeders.length?mean(breeders.map(sample=>sample.value)):null,
      nonBreederPressureMean:nonBreeders.length?mean(nonBreeders.map(sample=>sample.value)):null,
      reproductionAssociation:correlation(eligible.map(sample=>sample.value),eligible.map(sample=>sample.record.offspringCount>0?1:0)),
      offspringAssociation:correlation(eligible.map(sample=>sample.value),eligible.map(sample=>sample.record.offspringCount)),
      lifespanAssociation:correlation(
        dead.map(sample=>sample.value),
        dead.map(sample=>Math.max(0,(sample.record.deathDay??sample.record.birthDay)-sample.record.birthDay))
      ),
      traitMean:average,
      breederTraitMean:breederAverage,
      selectionDifferential:subtractTraits(breederAverage,average)
    };
  }).filter((x):x is WildlifePredatorSpecializationStats=>Boolean(x))
    .sort((a,b)=>b.pressureMean-a.pressureMean||b.sampleSize-a.sampleSize||a.predatorSpecies.localeCompare(b.predatorSpecies));
}

function interactionSourceFitness(
  records:WildlifeLineageRecord[],
  asOfDay?:number
):WildlifeInteractionSourceFitnessStats[] {
  const dimensions=[
    {kind:'competition' as const,meanKey:'competitionSourceMean' as const,daysKey:'competitionSourceObservedDays' as const},
    {kind:'disease' as const,meanKey:'diseaseSourceMean' as const,daysKey:'diseaseSourceObservedDays' as const}
  ];
  const results:WildlifeInteractionSourceFitnessStats[]=[];
  for(const dimension of dimensions){
    for(const sourceSpecies of SPECIES){
      const samples=records.map(record=>{
        const exposure=record.habitatExposure;
        const value=exposure?.[dimension.meanKey]?.[sourceSpecies];
        const sourceDays=Number(exposure?.[dimension.daysKey]||0);
        return sourceDays>=MIN_LIFETIME_EXPOSURE_DAYS&&typeof value==='number'&&Number.isFinite(value)
          ?{record,exposureDays:sourceDays,value}
          :undefined;
      }).filter((x):x is {record:WildlifeLineageRecord;exposureDays:number;value:number}=>Boolean(x));
      if(!samples.length||!samples.some(sample=>sample.value>0))continue;
      const eligible=samples.filter(sample=>fitnessOutcomeEligible(sample.record,asOfDay));
      const breeders=eligible.filter(sample=>sample.record.offspringCount>0);
      const nonBreeders=eligible.filter(sample=>sample.record.offspringCount<=0);
      const dead=samples.filter(sample=>sample.record.deathDay!==undefined);
      const average=traitMean(eligible.map(sample=>sample.record));
      const breederAverage=breeders.length?traitMean(breeders.map(sample=>sample.record)):zeroTraits();
      results.push({
        kind:dimension.kind,sourceSpecies,
        sampleSize:samples.length,
        reproductionEligibleSamples:eligible.length,
        lifespanSamples:dead.length,
        observedExposureDaysMean:mean(samples.map(sample=>sample.exposureDays)),
        pressureMean:mean(samples.map(sample=>sample.value)),
        breederPressureMean:breeders.length?mean(breeders.map(sample=>sample.value)):null,
        nonBreederPressureMean:nonBreeders.length?mean(nonBreeders.map(sample=>sample.value)):null,
        reproductionAssociation:correlation(eligible.map(sample=>sample.value),eligible.map(sample=>sample.record.offspringCount>0?1:0)),
        offspringAssociation:correlation(eligible.map(sample=>sample.value),eligible.map(sample=>sample.record.offspringCount)),
        lifespanAssociation:correlation(
          dead.map(sample=>sample.value),
          dead.map(sample=>Math.max(0,(sample.record.deathDay??sample.record.birthDay)-sample.record.birthDay))
        ),
        traitMean:average,
        breederTraitMean:breederAverage,
        selectionDifferential:subtractTraits(breederAverage,average)
      });
    }
  }
  return results.sort((a,b)=>a.kind.localeCompare(b.kind)||b.pressureMean-a.pressureMean||b.sampleSize-a.sampleSize||a.sourceSpecies.localeCompare(b.sourceSpecies));
}

type SourceEvidenceKind='competition'|'disease';

const sourceExposureConfig=(kind:SourceEvidenceKind)=>kind==='competition'
  ?{meanKey:'competitionSourceMean' as const,daysKey:'competitionSourceObservedDays' as const}
  :{meanKey:'diseaseSourceMean' as const,daysKey:'diseaseSourceObservedDays' as const};

function interactionSourceGenerationSide(
  all:WildlifeLineageRecord[],
  kind:SourceEvidenceKind,
  targetSpecies:WildlifeSpecies,
  sourceSpecies:WildlifeSpecies,
  asOfDay?:number
):WildlifeInteractionSourceGenerationEvidence {
  const config=sourceExposureConfig(kind);
  const samples=all.map(record=>{
    if(record.species!==targetSpecies)return undefined;
    const exposure=record.habitatExposure;
    const value=exposure?.[config.meanKey]?.[sourceSpecies];
    const sourceDays=Number(exposure?.[config.daysKey]||0);
    return sourceDays>=MIN_LIFETIME_EXPOSURE_DAYS&&typeof value==='number'&&Number.isFinite(value)
      ?{record,value,sourceDays}
      :undefined;
  }).filter((x):x is {record:WildlifeLineageRecord;value:number;sourceDays:number}=>Boolean(x));

  const generationIds=[...new Set(samples.map(sample=>sample.record.generation))].sort((a,b)=>a-b);
  const generations:WildlifeInteractionSourceGenerationCohort[]=generationIds.map(generation=>{
    const cohort=samples.filter(sample=>sample.record.generation===generation);
    const records=cohort.map(sample=>sample.record);
    const eligible=cohort.filter(sample=>fitnessOutcomeEligible(sample.record,asOfDay));
    const eligibleRecords=eligible.map(sample=>sample.record);
    const breeders=eligibleRecords.filter(record=>record.offspringCount>0);
    const deadSamples=cohort.filter(sample=>sample.record.deathDay!==undefined);
    const dead=deadSamples.map(sample=>sample.record);
    const average=traitMean(records);
    const breederAverage=breeders.length?traitMean(breeders):average;
    return {
      generation,
      observedIndividuals:records.length,
      eligibleIndividuals:eligibleRecords.length,
      deaths:dead.length,
      pressureMean:mean(cohort.map(sample=>sample.value)),
      breeders:breeders.length,
      breederRate:eligibleRecords.length?breeders.length/eligibleRecords.length:0,
      offspringMean:mean(eligibleRecords.map(record=>record.offspringCount)),
      lifespanMean:mean(dead.map(record=>Math.max(0,(record.deathDay??record.birthDay)-record.birthDay))),
      traitMean:average,
      breederTraitMean:breederAverage,
      selectionDifferential:breeders.length?subtractTraits(breederAverage,average):zeroTraits()
    };
  });

  const eligibleGenerations=generations.filter(entry=>entry.eligibleIndividuals>0);
  const lifespanGenerations=generations.filter(entry=>entry.deaths>0);
  const pressureTraitAssociation=nullableTraitEvidence(trait=>correlation(
    generations.map(entry=>entry.pressureMean),
    generations.map(entry=>entry.traitMean[trait])
  ));
  const traitTrendPerGeneration=nullableTraitEvidence(trait=>slope(
    generations.map(entry=>entry.generation),
    generations.map(entry=>entry.traitMean[trait])
  ));

  return {
    kind,targetSpecies,sourceSpecies,generations,
    generationsObserved:generations.length,
    observedIndividuals:samples.length,
    pressureTrendPerGeneration:slope(generations.map(entry=>entry.generation),generations.map(entry=>entry.pressureMean)),
    breederTrendPerGeneration:slope(eligibleGenerations.map(entry=>entry.generation),eligibleGenerations.map(entry=>entry.breederRate)),
    offspringTrendPerGeneration:slope(eligibleGenerations.map(entry=>entry.generation),eligibleGenerations.map(entry=>entry.offspringMean)),
    lifespanTrendPerGeneration:slope(lifespanGenerations.map(entry=>entry.generation),lifespanGenerations.map(entry=>entry.lifespanMean)),
    traitTrendPerGeneration,
    pressureBreederAssociation:correlation(eligibleGenerations.map(entry=>entry.pressureMean),eligibleGenerations.map(entry=>entry.breederRate)),
    pressureOffspringAssociation:correlation(eligibleGenerations.map(entry=>entry.pressureMean),eligibleGenerations.map(entry=>entry.offspringMean)),
    pressureLifespanAssociation:correlation(lifespanGenerations.map(entry=>entry.pressureMean),lifespanGenerations.map(entry=>entry.lifespanMean)),
    pressureTraitAssociation
  };
}

export function computeWildlifeInteractionSelectionEvidence(
  records:Iterable<WildlifeLineageRecord>,
  asOfDay?:number
):WildlifeReciprocalInteractionSelectionEvidence[] {
  const all=[...records];
  const keys=new Map<string,{kind:SourceEvidenceKind;speciesA:WildlifeSpecies;speciesB:WildlifeSpecies}>();

  for(const record of all){
    const exposure=record.habitatExposure;
    if(!exposure)continue;
    for(const kind of ['competition','disease'] as const){
      const config=sourceExposureConfig(kind);
      if(Number(exposure[config.daysKey]||0)<MIN_LIFETIME_EXPOSURE_DAYS)continue;
      const means=exposure[config.meanKey];
      if(!means)continue;
      for(const [source,value] of Object.entries(means) as Array<[WildlifeSpecies,number]>){
        if(source===record.species||!Number.isFinite(value)||value<=0)continue;
        const [speciesA,speciesB]=[record.species,source].sort() as [WildlifeSpecies,WildlifeSpecies];
        keys.set(`${kind}:${speciesA}:${speciesB}`,{kind,speciesA,speciesB});
      }
    }
  }

  return [...keys.values()].map(({kind,speciesA,speciesB})=>{
    const sideA=interactionSourceGenerationSide(all,kind,speciesA,speciesB,asOfDay);
    const sideB=interactionSourceGenerationSide(all,kind,speciesB,speciesA,asOfDay);
    return {
      kind,speciesA,speciesB,
      bothSidesObserved:sideA.generationsObserved>0&&sideB.generationsObserved>0,
      sideA,sideB
    };
  }).sort((a,b)=>{
    const activity=(entry:WildlifeReciprocalInteractionSelectionEvidence)=>entry.sideA.observedIndividuals+entry.sideB.observedIndividuals;
    return a.kind.localeCompare(b.kind)||activity(b)-activity(a)||a.speciesA.localeCompare(b.speciesA)||a.speciesB.localeCompare(b.speciesB);
  });
}

function realizedPredation(records:WildlifeLineageRecord[]):WildlifeRealizedPredationStats {
  const total={
    huntAttempts:0,huntHits:0,kills:0,
    fleeAttempts:0,successfulEscapes:0,attacksReceived:0,survivedAttacks:0
  };
  const pairKeys=new Map<string,{role:'predator'|'prey';counterpartSpecies:WildlifeSpecies}>();

  for(const record of records){
    const outcomes=record.predationOutcomes;
    if(!outcomes)continue;
    total.huntAttempts+=outcomes.asPredator.huntAttempts||0;
    total.huntHits+=outcomes.asPredator.huntHits||0;
    total.kills+=outcomes.asPredator.kills||0;
    total.fleeAttempts+=outcomes.asPrey.fleeAttempts||0;
    total.successfulEscapes+=outcomes.asPrey.successfulEscapes||0;
    total.attacksReceived+=outcomes.asPrey.attacksReceived||0;
    total.survivedAttacks+=outcomes.asPrey.survivedAttacks||0;
    for(const counterpartSpecies of Object.keys(outcomes.asPredator.byPrey||{}) as WildlifeSpecies[]){
      pairKeys.set(`predator:${counterpartSpecies}`,{role:'predator',counterpartSpecies});
    }
    for(const counterpartSpecies of Object.keys(outcomes.asPrey.byPredator||{}) as WildlifeSpecies[]){
      pairKeys.set(`prey:${counterpartSpecies}`,{role:'prey',counterpartSpecies});
    }
  }

  const pairs:WildlifePredationPairPerformance[]=[...pairKeys.values()].map(({role,counterpartSpecies})=>{
    const observed=records.filter(record=>{
      const outcomes=record.predationOutcomes;
      if(!outcomes)return false;
      if(role==='predator'){
        const pair=outcomes.asPredator.byPrey?.[counterpartSpecies];
        return Boolean(pair&&((pair.huntAttempts||0)>0||(pair.huntHits||0)>0||(pair.kills||0)>0));
      }
      const pair=outcomes.asPrey.byPredator?.[counterpartSpecies];
      return Boolean(pair&&((pair.fleeAttempts||0)>0||(pair.attacksReceived||0)>0));
    });
    const successful=observed.filter(record=>{
      const outcomes=record.predationOutcomes!;
      return role==='predator'
        ?(outcomes.asPredator.byPrey?.[counterpartSpecies]?.huntHits||0)>0
        :((outcomes.asPrey.byPredator?.[counterpartSpecies]?.successfulEscapes||0)>0
          ||(outcomes.asPrey.byPredator?.[counterpartSpecies]?.survivedAttacks||0)>0);
    });

    const sums={
      huntAttempts:0,huntHits:0,kills:0,
      fleeAttempts:0,successfulEscapes:0,attacksReceived:0,survivedAttacks:0
    };
    let attemptTraitSum=zeroTraits(),successTraitSum=zeroTraits(),terminalTraitSum=zeroTraits();
    let traitMatchAttempts=0,traitMatchSuccesses=0,terminalTraitMatchSuccesses=0;

    for(const record of observed){
      if(role==='predator'){
        const pair=record.predationOutcomes?.asPredator.byPrey?.[counterpartSpecies];
        if(!pair)continue;
        sums.huntAttempts+=pair.huntAttempts||0;
        sums.huntHits+=pair.huntHits||0;
        sums.kills+=pair.kills||0;
        if(pair.attemptTraitDeltaSum&&(pair.attemptTraitMatchCount||0)>0){
          attemptTraitSum=addTraitTotals(attemptTraitSum,pair.attemptTraitDeltaSum);
          traitMatchAttempts+=pair.attemptTraitMatchCount||0;
        }
        if(pair.hitTraitDeltaSum&&(pair.hitTraitMatchCount||0)>0){
          successTraitSum=addTraitTotals(successTraitSum,pair.hitTraitDeltaSum);
          traitMatchSuccesses+=pair.hitTraitMatchCount||0;
        }
        if(pair.killTraitDeltaSum&&(pair.killTraitMatchCount||0)>0){
          terminalTraitSum=addTraitTotals(terminalTraitSum,pair.killTraitDeltaSum);
          terminalTraitMatchSuccesses+=pair.killTraitMatchCount||0;
        }
      }else{
        const pair=record.predationOutcomes?.asPrey.byPredator?.[counterpartSpecies];
        if(!pair)continue;
        sums.fleeAttempts+=pair.fleeAttempts||0;
        sums.successfulEscapes+=pair.successfulEscapes||0;
        sums.attacksReceived+=pair.attacksReceived||0;
        sums.survivedAttacks+=pair.survivedAttacks||0;
        if(pair.fleeTraitDeltaSum&&(pair.fleeTraitMatchCount||0)>0){
          attemptTraitSum=addTraitTotals(attemptTraitSum,pair.fleeTraitDeltaSum);
          traitMatchAttempts+=pair.fleeTraitMatchCount||0;
        }
        if(pair.escapeTraitDeltaSum&&(pair.escapeTraitMatchCount||0)>0){
          successTraitSum=addTraitTotals(successTraitSum,pair.escapeTraitDeltaSum);
          traitMatchSuccesses+=pair.escapeTraitMatchCount||0;
        }
        if(pair.survivedAttackTraitDeltaSum&&(pair.survivedAttackTraitMatchCount||0)>0){
          terminalTraitSum=addTraitTotals(terminalTraitSum,pair.survivedAttackTraitDeltaSum);
          terminalTraitMatchSuccesses+=pair.survivedAttackTraitMatchCount||0;
        }
      }
    }

    const generations=[...new Set(observed.map(record=>record.generation))].sort((a,b)=>a-b);
    const generationTrend:WildlifePredationGenerationPerformance[]=generations.map(generation=>{
      const cohort=observed.filter(record=>record.generation===generation);
      let attempts=0,successes=0,terminalAttempts=0,terminalSuccesses=0;
      let cohortAttemptTrait=zeroTraits(),cohortSuccessTrait=zeroTraits(),cohortTerminalTrait=zeroTraits();
      let cohortTraitAttempts=0,cohortTraitSuccesses=0,cohortTerminalTraitSuccesses=0;

      for(const record of cohort){
        if(role==='predator'){
          const pair=record.predationOutcomes?.asPredator.byPrey?.[counterpartSpecies];
          if(!pair)continue;
          attempts+=pair.huntAttempts||0;
          successes+=pair.huntHits||0;
          terminalAttempts+=pair.huntAttempts||0;
          terminalSuccesses+=pair.kills||0;
          if(pair.attemptTraitDeltaSum&&(pair.attemptTraitMatchCount||0)>0){
            cohortAttemptTrait=addTraitTotals(cohortAttemptTrait,pair.attemptTraitDeltaSum);
            cohortTraitAttempts+=pair.attemptTraitMatchCount||0;
          }
          if(pair.hitTraitDeltaSum&&(pair.hitTraitMatchCount||0)>0){
            cohortSuccessTrait=addTraitTotals(cohortSuccessTrait,pair.hitTraitDeltaSum);
            cohortTraitSuccesses+=pair.hitTraitMatchCount||0;
          }
          if(pair.killTraitDeltaSum&&(pair.killTraitMatchCount||0)>0){
            cohortTerminalTrait=addTraitTotals(cohortTerminalTrait,pair.killTraitDeltaSum);
            cohortTerminalTraitSuccesses+=pair.killTraitMatchCount||0;
          }
        }else{
          const pair=record.predationOutcomes?.asPrey.byPredator?.[counterpartSpecies];
          if(!pair)continue;
          attempts+=pair.fleeAttempts||0;
          successes+=pair.successfulEscapes||0;
          terminalAttempts+=pair.attacksReceived||0;
          terminalSuccesses+=pair.survivedAttacks||0;
          if(pair.fleeTraitDeltaSum&&(pair.fleeTraitMatchCount||0)>0){
            cohortAttemptTrait=addTraitTotals(cohortAttemptTrait,pair.fleeTraitDeltaSum);
            cohortTraitAttempts+=pair.fleeTraitMatchCount||0;
          }
          if(pair.escapeTraitDeltaSum&&(pair.escapeTraitMatchCount||0)>0){
            cohortSuccessTrait=addTraitTotals(cohortSuccessTrait,pair.escapeTraitDeltaSum);
            cohortTraitSuccesses+=pair.escapeTraitMatchCount||0;
          }
          if(pair.survivedAttackTraitDeltaSum&&(pair.survivedAttackTraitMatchCount||0)>0){
            cohortTerminalTrait=addTraitTotals(cohortTerminalTrait,pair.survivedAttackTraitDeltaSum);
            cohortTerminalTraitSuccesses+=pair.survivedAttackTraitMatchCount||0;
          }
        }
      }

      return {
        generation,observedIndividuals:cohort.length,
        attempts,successes,successRate:attempts?successes/attempts:0,
        terminalAttempts,terminalSuccesses,terminalSuccessRate:terminalAttempts?terminalSuccesses/terminalAttempts:0,
        traitMatchAttempts:cohortTraitAttempts,traitMatchSuccesses:cohortTraitSuccesses,
        terminalTraitMatchSuccesses:cohortTerminalTraitSuccesses,
        attemptTraitAdvantageMean:meanTraitTotals(cohortAttemptTrait,cohortTraitAttempts),
        successTraitAdvantageMean:meanTraitTotals(cohortSuccessTrait,cohortTraitSuccesses),
        terminalTraitAdvantageMean:meanTraitTotals(cohortTerminalTrait,cohortTerminalTraitSuccesses)
      };
    });

    const average=traitMean(observed);
    const successAverage=successful.length?traitMean(successful):average;
    return {
      role,counterpartSpecies,observedIndividuals:observed.length,
      ...sums,
      huntHitRate:sums.huntAttempts?sums.huntHits/sums.huntAttempts:0,
      huntKillRate:sums.huntAttempts?sums.kills/sums.huntAttempts:0,
      escapeRate:sums.fleeAttempts?sums.successfulEscapes/sums.fleeAttempts:0,
      attackSurvivalRate:sums.attacksReceived?sums.survivedAttacks/sums.attacksReceived:0,
      traitMean:average,
      successfulTraitMean:successAverage,
      successTraitDifferential:subtractTraits(successAverage,average),
      traitMatchAttempts,traitMatchSuccesses,terminalTraitMatchSuccesses,
      attemptTraitAdvantageMean:meanTraitTotals(attemptTraitSum,traitMatchAttempts),
      successTraitAdvantageMean:meanTraitTotals(successTraitSum,traitMatchSuccesses),
      terminalTraitAdvantageMean:meanTraitTotals(terminalTraitSum,terminalTraitMatchSuccesses),
      generationTrend
    };
  }).sort((a,b)=>{
    const activity=(x:WildlifePredationPairPerformance)=>x.huntAttempts+x.fleeAttempts+x.attacksReceived;
    return activity(b)-activity(a)||a.role.localeCompare(b.role)||a.counterpartSpecies.localeCompare(b.counterpartSpecies);
  });

  return {
    ...total,
    huntHitRate:total.huntAttempts?total.huntHits/total.huntAttempts:0,
    huntKillRate:total.huntAttempts?total.kills/total.huntAttempts:0,
    escapeRate:total.fleeAttempts?total.successfulEscapes/total.fleeAttempts:0,
    attackSurvivalRate:total.attacksReceived?total.survivedAttacks/total.attacksReceived:0,
    pairs
  };
}

function coevolutionSideEvidence(
  all:WildlifeLineageRecord[],
  species:WildlifeSpecies,
  role:'predator'|'prey',
  counterpartSpecies:WildlifeSpecies,
  asOfDay?:number
):WildlifeCoevolutionSideEvidence {
  const observed=all.filter(record=>{
    if(record.species!==species||!record.predationOutcomes)return false;
    if(role==='predator'){
      const pair=record.predationOutcomes.asPredator.byPrey?.[counterpartSpecies];
      return Boolean(pair&&((pair.huntAttempts||0)>0||(pair.huntHits||0)>0||(pair.kills||0)>0));
    }
    const pair=record.predationOutcomes.asPrey.byPredator?.[counterpartSpecies];
    return Boolean(pair&&((pair.fleeAttempts||0)>0||(pair.attacksReceived||0)>0));
  });
  const generationIds=[...new Set(observed.map(record=>record.generation))].sort((a,b)=>a-b);
  const generations:WildlifeCoevolutionGenerationEvidence[]=generationIds.map(generation=>{
    const cohort=observed.filter(record=>record.generation===generation);
    const eligible=cohort.filter(record=>fitnessOutcomeEligible(record,asOfDay));
    const breeders=eligible.filter(record=>record.offspringCount>0);
    let attempts=0,successes=0,terminalAttempts=0,terminalSuccesses=0;
    let attemptTraits=zeroTraits(),successTraits=zeroTraits(),terminalTraits=zeroTraits();
    let attemptTraitCount=0,successTraitCount=0,terminalTraitCount=0;
    for(const record of cohort){
      if(role==='predator'){
        const pair=record.predationOutcomes?.asPredator.byPrey?.[counterpartSpecies];
        if(!pair)continue;
        attempts+=pair.huntAttempts||0;
        successes+=pair.huntHits||0;
        terminalAttempts+=pair.huntAttempts||0;
        terminalSuccesses+=pair.kills||0;
        if(pair.attemptTraitDeltaSum&&(pair.attemptTraitMatchCount||0)>0){
          attemptTraits=addTraitTotals(attemptTraits,pair.attemptTraitDeltaSum);
          attemptTraitCount+=pair.attemptTraitMatchCount||0;
        }
        if(pair.hitTraitDeltaSum&&(pair.hitTraitMatchCount||0)>0){
          successTraits=addTraitTotals(successTraits,pair.hitTraitDeltaSum);
          successTraitCount+=pair.hitTraitMatchCount||0;
        }
        if(pair.killTraitDeltaSum&&(pair.killTraitMatchCount||0)>0){
          terminalTraits=addTraitTotals(terminalTraits,pair.killTraitDeltaSum);
          terminalTraitCount+=pair.killTraitMatchCount||0;
        }
      }else{
        const pair=record.predationOutcomes?.asPrey.byPredator?.[counterpartSpecies];
        if(!pair)continue;
        attempts+=pair.fleeAttempts||0;
        successes+=pair.successfulEscapes||0;
        terminalAttempts+=pair.attacksReceived||0;
        terminalSuccesses+=pair.survivedAttacks||0;
        if(pair.fleeTraitDeltaSum&&(pair.fleeTraitMatchCount||0)>0){
          attemptTraits=addTraitTotals(attemptTraits,pair.fleeTraitDeltaSum);
          attemptTraitCount+=pair.fleeTraitMatchCount||0;
        }
        if(pair.escapeTraitDeltaSum&&(pair.escapeTraitMatchCount||0)>0){
          successTraits=addTraitTotals(successTraits,pair.escapeTraitDeltaSum);
          successTraitCount+=pair.escapeTraitMatchCount||0;
        }
        if(pair.survivedAttackTraitDeltaSum&&(pair.survivedAttackTraitMatchCount||0)>0){
          terminalTraits=addTraitTotals(terminalTraits,pair.survivedAttackTraitDeltaSum);
          terminalTraitCount+=pair.survivedAttackTraitMatchCount||0;
        }
      }
    }
    return {
      generation,
      observedIndividuals:cohort.length,
      eligibleIndividuals:eligible.length,
      attempts,successes,successRate:attempts?successes/attempts:0,
      terminalAttempts,terminalSuccesses,terminalSuccessRate:terminalAttempts?terminalSuccesses/terminalAttempts:0,
      breeders:breeders.length,
      breederRate:eligible.length?breeders.length/eligible.length:0,
      offspringMean:mean(eligible.map(record=>record.offspringCount)),
      traitMean:traitMean(cohort),
      attemptTraitAdvantageMean:meanTraitTotals(attemptTraits,attemptTraitCount),
      successTraitAdvantageMean:meanTraitTotals(successTraits,successTraitCount),
      terminalTraitAdvantageMean:meanTraitTotals(terminalTraits,terminalTraitCount)
    };
  });

  const performancePoints=generations.filter(entry=>entry.attempts>0);
  const terminalPoints=generations.filter(entry=>entry.terminalAttempts>0);
  const reproductivePerformance=performancePoints.filter(entry=>entry.eligibleIndividuals>0);
  const reproductiveTerminal=terminalPoints.filter(entry=>entry.eligibleIndividuals>0);
  const traitTrendPerGeneration=nullableTraitEvidence(trait=>slope(
    generations.map(entry=>entry.generation),
    generations.map(entry=>entry.traitMean[trait])
  ));
  const performanceTraitAssociation=nullableTraitEvidence(trait=>correlation(
    performancePoints.map(entry=>entry.successRate),
    performancePoints.map(entry=>entry.traitMean[trait])
  ));
  const terminalPerformanceTraitAssociation=nullableTraitEvidence(trait=>correlation(
    terminalPoints.map(entry=>entry.terminalSuccessRate),
    terminalPoints.map(entry=>entry.traitMean[trait])
  ));

  return {
    species,role,generations,
    generationsObserved:generations.length,
    interactingIndividuals:observed.length,
    performanceTrendPerGeneration:slope(performancePoints.map(entry=>entry.generation),performancePoints.map(entry=>entry.successRate)),
    terminalPerformanceTrendPerGeneration:slope(terminalPoints.map(entry=>entry.generation),terminalPoints.map(entry=>entry.terminalSuccessRate)),
    breederTrendPerGeneration:slope(
      generations.filter(entry=>entry.eligibleIndividuals>0).map(entry=>entry.generation),
      generations.filter(entry=>entry.eligibleIndividuals>0).map(entry=>entry.breederRate)
    ),
    offspringTrendPerGeneration:slope(
      generations.filter(entry=>entry.eligibleIndividuals>0).map(entry=>entry.generation),
      generations.filter(entry=>entry.eligibleIndividuals>0).map(entry=>entry.offspringMean)
    ),
    traitTrendPerGeneration,
    performanceBreederAssociation:correlation(reproductivePerformance.map(entry=>entry.successRate),reproductivePerformance.map(entry=>entry.breederRate)),
    terminalPerformanceBreederAssociation:correlation(reproductiveTerminal.map(entry=>entry.terminalSuccessRate),reproductiveTerminal.map(entry=>entry.breederRate)),
    performanceOffspringAssociation:correlation(reproductivePerformance.map(entry=>entry.successRate),reproductivePerformance.map(entry=>entry.offspringMean)),
    terminalPerformanceOffspringAssociation:correlation(reproductiveTerminal.map(entry=>entry.terminalSuccessRate),reproductiveTerminal.map(entry=>entry.offspringMean)),
    performanceTraitAssociation,
    terminalPerformanceTraitAssociation
  };
}

export function computeWildlifeCoevolutionEvidence(
  records:Iterable<WildlifeLineageRecord>,
  asOfDay?:number
):WildlifeCoevolutionPairEvidence[] {
  const all=[...records];
  const keys=new Map<string,{predatorSpecies:WildlifeSpecies;preySpecies:WildlifeSpecies}>();
  for(const record of all){
    const outcomes=record.predationOutcomes;
    if(!outcomes)continue;
    for(const preySpecies of Object.keys(outcomes.asPredator.byPrey||{}) as WildlifeSpecies[]){
      keys.set(`${record.species}:${preySpecies}`,{predatorSpecies:record.species,preySpecies});
    }
    for(const predatorSpecies of Object.keys(outcomes.asPrey.byPredator||{}) as WildlifeSpecies[]){
      keys.set(`${predatorSpecies}:${record.species}`,{predatorSpecies,preySpecies:record.species});
    }
  }
  return [...keys.values()].map(({predatorSpecies,preySpecies})=>{
    const predator=coevolutionSideEvidence(all,predatorSpecies,'predator',preySpecies,asOfDay);
    const prey=coevolutionSideEvidence(all,preySpecies,'prey',predatorSpecies,asOfDay);
    return {
      predatorSpecies,preySpecies,
      bothSidesObserved:predator.generationsObserved>0&&prey.generationsObserved>0,
      predator,prey
    };
  }).sort((a,b)=>{
    const activity=(pair:WildlifeCoevolutionPairEvidence)=>pair.predator.interactingIndividuals+pair.prey.interactingIndividuals;
    return activity(b)-activity(a)||a.predatorSpecies.localeCompare(b.predatorSpecies)||a.preySpecies.localeCompare(b.preySpecies);
  });
}

export function computeEvolutionStatistics(records:Iterable<WildlifeLineageRecord>,asOfDay?:number):WildlifeEvolutionStats[] {
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
      lifetimeBiomeSelection:biomeSelection(speciesRecords,'lifetime'),
      exposureFitness:habitatFitness(speciesRecords,asOfDay),
      predatorSpecialization:predatorSpecialization(speciesRecords,asOfDay),
      interactionSourceFitness:interactionSourceFitness(speciesRecords,asOfDay),
      realizedPredation:realizedPredation(speciesRecords)
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
