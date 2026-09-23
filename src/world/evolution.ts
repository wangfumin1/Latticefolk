import type {
  WildlifeBiomeSelectionStats, WildlifeDeathReason, WildlifeEvolutionStats, WildlifeFitnessBandStats, WildlifeFitnessExposureDimension,
  WildlifeGenerationCohortStats, WildlifeHabitatExposure, WildlifeHabitatFitnessStats, WildlifeHabitatSnapshot,
  WildlifeInteractionSourceFitnessStats, WildlifeInteractionSourceGenerationCohort, WildlifeInteractionSourceGenerationEvidence,
  WildlifeCoevolutionGenerationEvidence, WildlifeCoevolutionPairEvidence, WildlifeCoevolutionSideEvidence, WildlifeLineageRecord,
  WildlifeMultifactorFeatureCoefficient, WildlifeMultifactorOutcome, WildlifeMultifactorOutcomeEvidence, WildlifeMultifactorOutcomeStabilityEvidence, WildlifeMultifactorSelectionEvidence,
  WildlifeNullableTraits, WildlifePredationGenerationPerformance, WildlifePredationPairPerformance, WildlifePredatorSpecializationStats,
  WildlifeNullablePhenotype, WildlifeOrganismGenome, WildlifeOrganismGenomeStats, WildlifeOrganismGenomeVector, WildlifePhenotype, WildlifePhenotypeBiomeFitnessStats, WildlifePhenotypeStats, WildlifeRealizedPredationStats, WildlifeReciprocalInteractionSelectionEvidence, WildlifeSelectionSignal, WildlifeSpecies, WildlifeTraits
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

const phenotypeMean=(records:WildlifeLineageRecord[]):WildlifePhenotype|null=>{
  const values=records.map(record=>record.phenotypeAtBirth).filter((value):value is WildlifePhenotype=>Boolean(value));
  if(!values.length)return null;
  return {
    morphology:{
      bodyLength:mean(values.map(value=>value.morphology.bodyLength)),
      bodyHeight:mean(values.map(value=>value.morphology.bodyHeight)),
      legLength:mean(values.map(value=>value.morphology.legLength)),
      headScale:mean(values.map(value=>value.morphology.headScale)),
      tailScale:mean(values.map(value=>value.morphology.tailScale))
    },
    behavior:{
      forageDrive:mean(values.map(value=>value.behavior.forageDrive)),
      migrationDrive:mean(values.map(value=>value.behavior.migrationDrive)),
      riskTolerance:mean(values.map(value=>value.behavior.riskTolerance)),
      recoveryDrive:mean(values.map(value=>value.behavior.recoveryDrive))
    }
  };
};

const phenotypeVariance=(records:WildlifeLineageRecord[],average:WildlifePhenotype|null):WildlifePhenotype|null=>{
  if(!average)return null;
  const values=records.map(record=>record.phenotypeAtBirth).filter((value):value is WildlifePhenotype=>Boolean(value));
  if(!values.length)return null;
  return {
    morphology:{
      bodyLength:variance(values.map(value=>value.morphology.bodyLength),average.morphology.bodyLength),
      bodyHeight:variance(values.map(value=>value.morphology.bodyHeight),average.morphology.bodyHeight),
      legLength:variance(values.map(value=>value.morphology.legLength),average.morphology.legLength),
      headScale:variance(values.map(value=>value.morphology.headScale),average.morphology.headScale),
      tailScale:variance(values.map(value=>value.morphology.tailScale),average.morphology.tailScale)
    },
    behavior:{
      forageDrive:variance(values.map(value=>value.behavior.forageDrive),average.behavior.forageDrive),
      migrationDrive:variance(values.map(value=>value.behavior.migrationDrive),average.behavior.migrationDrive),
      riskTolerance:variance(values.map(value=>value.behavior.riskTolerance),average.behavior.riskTolerance),
      recoveryDrive:variance(values.map(value=>value.behavior.recoveryDrive),average.behavior.recoveryDrive)
    }
  };
};

const phenotypeSlope=(records:WildlifeLineageRecord[],value:(phenotype:WildlifePhenotype)=>number)=>{
  const observed=records.filter((record):record is WildlifeLineageRecord&{phenotypeAtBirth:WildlifePhenotype}=>Boolean(record.phenotypeAtBirth));
  if(observed.length<2)return 0;
  const x=observed.map(record=>record.generation);
  const xMean=mean(x);
  const denom=x.reduce((sum,generation)=>sum+(generation-xMean)**2,0);
  if(denom<=0)return 0;
  const y=observed.map(record=>value(record.phenotypeAtBirth));
  const yMean=mean(y);
  return observed.reduce((sum,record,index)=>sum+(record.generation-xMean)*(y[index]!-yMean),0)/denom;
};

const phenotypeTrend=(records:WildlifeLineageRecord[]):WildlifePhenotype|null=>{
  const observed=records.filter(record=>record.phenotypeAtBirth);
  if(observed.length<2||new Set(observed.map(record=>record.generation)).size<2)return null;
  return {
    morphology:{
      bodyLength:phenotypeSlope(records,value=>value.morphology.bodyLength),
      bodyHeight:phenotypeSlope(records,value=>value.morphology.bodyHeight),
      legLength:phenotypeSlope(records,value=>value.morphology.legLength),
      headScale:phenotypeSlope(records,value=>value.morphology.headScale),
      tailScale:phenotypeSlope(records,value=>value.morphology.tailScale)
    },
    behavior:{
      forageDrive:phenotypeSlope(records,value=>value.behavior.forageDrive),
      migrationDrive:phenotypeSlope(records,value=>value.behavior.migrationDrive),
      riskTolerance:phenotypeSlope(records,value=>value.behavior.riskTolerance),
      recoveryDrive:phenotypeSlope(records,value=>value.behavior.recoveryDrive)
    }
  };
};

const subtractPhenotype=(a:WildlifePhenotype,b:WildlifePhenotype):WildlifePhenotype=>({
  morphology:{
    bodyLength:a.morphology.bodyLength-b.morphology.bodyLength,
    bodyHeight:a.morphology.bodyHeight-b.morphology.bodyHeight,
    legLength:a.morphology.legLength-b.morphology.legLength,
    headScale:a.morphology.headScale-b.morphology.headScale,
    tailScale:a.morphology.tailScale-b.morphology.tailScale
  },
  behavior:{
    forageDrive:a.behavior.forageDrive-b.behavior.forageDrive,
    migrationDrive:a.behavior.migrationDrive-b.behavior.migrationDrive,
    riskTolerance:a.behavior.riskTolerance-b.behavior.riskTolerance,
    recoveryDrive:a.behavior.recoveryDrive-b.behavior.recoveryDrive
  }
});

function phenotypeStats(records:WildlifeLineageRecord[]):WildlifePhenotypeStats {
  const observed=records.filter(record=>record.phenotypeAtBirth);
  const comparable=observed.filter(record=>record.phenotypeProvenance!=='legacy_upgrade');
  const average=phenotypeMean(observed);
  const comparableAverage=phenotypeMean(comparable);
  const breeders=comparable.filter(record=>record.offspringCount>0);
  const breederMean=phenotypeMean(breeders);
  return {
    sampleSize:observed.length,
    comparableSamples:comparable.length,
    birthTrackedSamples:observed.filter(record=>record.phenotypeProvenance==='birth').length,
    founderSeedSamples:observed.filter(record=>record.phenotypeProvenance==='founder_seed').length,
    legacyUpgradeSamples:observed.filter(record=>record.phenotypeProvenance==='legacy_upgrade').length,
    mean:average,
    variance:phenotypeVariance(observed,average),
    trendPerGeneration:phenotypeTrend(comparable),
    breederMean,
    breederDifferential:comparableAverage&&breederMean?subtractPhenotype(breederMean,comparableAverage):null
  };
}

const genomeObserved=(records:WildlifeLineageRecord[])=>
  records.filter((record):record is WildlifeLineageRecord&{organismGenomeAtBirth:WildlifeOrganismGenome}=>Boolean(record.organismGenomeAtBirth));

const genomeMean=(records:WildlifeLineageRecord[]):WildlifeOrganismGenomeVector|null=>{
  const values=genomeObserved(records).map(record=>record.organismGenomeAtBirth);
  if(!values.length)return null;
  return {
    material:{
      hueShift:mean(values.map(value=>value.material.hueShift)),
      lightnessShift:mean(values.map(value=>value.material.lightnessShift)),
      accentShift:mean(values.map(value=>value.material.accentShift))
    },
    niche:{
      grass:mean(values.map(value=>value.niche.grass)),
      shrub:mean(values.map(value=>value.niche.shrub)),
      fruit:mean(values.map(value=>value.niche.fruit)),
      crop:mean(values.map(value=>value.niche.crop))
    },
    locomotion:{
      stride:mean(values.map(value=>value.locomotion.stride)),
      endurance:mean(values.map(value=>value.locomotion.endurance))
    }
  };
};

const genomeVariance=(records:WildlifeLineageRecord[],average:WildlifeOrganismGenomeVector|null):WildlifeOrganismGenomeVector|null=>{
  if(!average)return null;
  const values=genomeObserved(records).map(record=>record.organismGenomeAtBirth);
  if(!values.length)return null;
  return {
    material:{
      hueShift:variance(values.map(value=>value.material.hueShift),average.material.hueShift),
      lightnessShift:variance(values.map(value=>value.material.lightnessShift),average.material.lightnessShift),
      accentShift:variance(values.map(value=>value.material.accentShift),average.material.accentShift)
    },
    niche:{
      grass:variance(values.map(value=>value.niche.grass),average.niche.grass),
      shrub:variance(values.map(value=>value.niche.shrub),average.niche.shrub),
      fruit:variance(values.map(value=>value.niche.fruit),average.niche.fruit),
      crop:variance(values.map(value=>value.niche.crop),average.niche.crop)
    },
    locomotion:{
      stride:variance(values.map(value=>value.locomotion.stride),average.locomotion.stride),
      endurance:variance(values.map(value=>value.locomotion.endurance),average.locomotion.endurance)
    }
  };
};

const genomeSlope=(records:WildlifeLineageRecord[],value:(genome:WildlifeOrganismGenome)=>number)=>{
  const observed=genomeObserved(records);
  if(observed.length<2||new Set(observed.map(record=>record.generation)).size<2)return 0;
  const x=observed.map(record=>record.generation),mx=mean(x);
  const denom=x.reduce((sum,generation)=>sum+(generation-mx)**2,0);
  if(denom<=0)return 0;
  const y=observed.map(record=>value(record.organismGenomeAtBirth)),my=mean(y);
  return observed.reduce((sum,record,index)=>sum+(record.generation-mx)*(y[index]!-my),0)/denom;
};

const genomeTrend=(records:WildlifeLineageRecord[]):WildlifeOrganismGenomeVector|null=>{
  const observed=genomeObserved(records);
  if(observed.length<2||new Set(observed.map(record=>record.generation)).size<2)return null;
  return {
    material:{
      hueShift:genomeSlope(records,value=>value.material.hueShift),
      lightnessShift:genomeSlope(records,value=>value.material.lightnessShift),
      accentShift:genomeSlope(records,value=>value.material.accentShift)
    },
    niche:{
      grass:genomeSlope(records,value=>value.niche.grass),
      shrub:genomeSlope(records,value=>value.niche.shrub),
      fruit:genomeSlope(records,value=>value.niche.fruit),
      crop:genomeSlope(records,value=>value.niche.crop)
    },
    locomotion:{
      stride:genomeSlope(records,value=>value.locomotion.stride),
      endurance:genomeSlope(records,value=>value.locomotion.endurance)
    }
  };
};

const subtractGenome=(a:WildlifeOrganismGenomeVector,b:WildlifeOrganismGenomeVector):WildlifeOrganismGenomeVector=>({
  material:{
    hueShift:a.material.hueShift-b.material.hueShift,
    lightnessShift:a.material.lightnessShift-b.material.lightnessShift,
    accentShift:a.material.accentShift-b.material.accentShift
  },
  niche:{
    grass:a.niche.grass-b.niche.grass,
    shrub:a.niche.shrub-b.niche.shrub,
    fruit:a.niche.fruit-b.niche.fruit,
    crop:a.niche.crop-b.niche.crop
  },
  locomotion:{
    stride:a.locomotion.stride-b.locomotion.stride,
    endurance:a.locomotion.endurance-b.locomotion.endurance
  }
});

function organismGenomeStats(records:WildlifeLineageRecord[]):WildlifeOrganismGenomeStats {
  const observed=genomeObserved(records);
  const comparable=observed.filter(record=>record.organismGenomeProvenance!=='legacy_upgrade');
  const average=genomeMean(observed);
  const comparableAverage=genomeMean(comparable);
  const breeders=comparable.filter(record=>record.offspringCount>0);
  const breederMean=genomeMean(breeders);
  return {
    family:observed[0]?.organismGenomeAtBirth.family??null,
    sampleSize:observed.length,
    comparableSamples:comparable.length,
    birthTrackedSamples:observed.filter(record=>record.organismGenomeProvenance==='birth').length,
    founderSeedSamples:observed.filter(record=>record.organismGenomeProvenance==='founder_seed').length,
    legacyUpgradeSamples:observed.filter(record=>record.organismGenomeProvenance==='legacy_upgrade').length,
    mean:average,
    variance:genomeVariance(observed,average),
    trendPerGeneration:genomeTrend(comparable),
    breederMean,
    breederDifferential:comparableAverage&&breederMean?subtractGenome(breederMean,comparableAverage):null
  };
}

const phenotypeAssociation=(
  records:Array<WildlifeLineageRecord&{phenotypeAtBirth:WildlifePhenotype}>,
  outcome:(record:WildlifeLineageRecord)=>number
):WildlifeNullablePhenotype=>{
  const ys=records.map(outcome);
  const corr=(values:number[])=>correlation(values,ys);
  return {
    morphology:{
      bodyLength:corr(records.map(record=>record.phenotypeAtBirth.morphology.bodyLength)),
      bodyHeight:corr(records.map(record=>record.phenotypeAtBirth.morphology.bodyHeight)),
      legLength:corr(records.map(record=>record.phenotypeAtBirth.morphology.legLength)),
      headScale:corr(records.map(record=>record.phenotypeAtBirth.morphology.headScale)),
      tailScale:corr(records.map(record=>record.phenotypeAtBirth.morphology.tailScale))
    },
    behavior:{
      forageDrive:corr(records.map(record=>record.phenotypeAtBirth.behavior.forageDrive)),
      migrationDrive:corr(records.map(record=>record.phenotypeAtBirth.behavior.migrationDrive)),
      riskTolerance:corr(records.map(record=>record.phenotypeAtBirth.behavior.riskTolerance)),
      recoveryDrive:corr(records.map(record=>record.phenotypeAtBirth.behavior.recoveryDrive))
    }
  };
};

function phenotypeBiomeFitness(
  records:WildlifeLineageRecord[],
  asOfDay?:number
):WildlifePhenotypeBiomeFitnessStats[] {
  const comparable=records.filter((record):record is WildlifeLineageRecord&{phenotypeAtBirth:WildlifePhenotype}=>
    Boolean(record.phenotypeAtBirth)&&record.phenotypeProvenance!=='legacy_upgrade'&&Boolean(dominantWildlifeExposureBiome(record.habitatExposure))
  );
  const biomes=[...new Set(comparable.map(record=>dominantWildlifeExposureBiome(record.habitatExposure)).filter((value):value is WildlifeHabitatSnapshot['biome']=>Boolean(value)))];
  return biomes.map(biome=>{
    const samples=comparable.filter(record=>dominantWildlifeExposureBiome(record.habitatExposure)===biome);
    const eligible=samples.filter(record=>fitnessOutcomeEligible(record,asOfDay));
    const dead=samples.filter((record):record is typeof samples[number]&{deathDay:number}=>record.deathDay!==undefined);
    const breeders=eligible.filter(record=>record.offspringCount>0);
    const eligibleAverage=phenotypeMean(eligible);
    const breederAverage=phenotypeMean(breeders);
    return {
      biome,
      sampleSize:samples.length,
      reproductionEligibleSamples:eligible.length,
      lifespanSamples:dead.length,
      observedExposureDaysMean:mean(samples.map(record=>record.habitatExposure?.observedDays||0)),
      phenotypeMean:phenotypeMean(samples),
      breederDifferential:eligibleAverage&&breederAverage?subtractPhenotype(breederAverage,eligibleAverage):null,
      reproductionAssociation:phenotypeAssociation(eligible,record=>record.offspringCount>0?1:0),
      offspringAssociation:phenotypeAssociation(eligible,record=>record.offspringCount),
      lifespanAssociation:phenotypeAssociation(dead,record=>Math.max(0,(record.deathDay??record.birthDay)-record.birthDay))
    };
  }).sort((a,b)=>b.sampleSize-a.sampleSize||a.biome.localeCompare(b.biome));
}

function cohort(generation:number,records:WildlifeLineageRecord[]):WildlifeGenerationCohortStats {
  const dead=records.filter(record=>record.deathDay!==undefined);
  const average=traitMean(records);
  const breeders=records.filter(record=>record.offspringCount>0);
  const phenotype=phenotypeStats(records);
  return {
    generation,
    population:records.length,
    living:records.length-dead.length,
    deaths:dead.length,
    meanLifespan:mean(dead.map(record=>Math.max(0,(record.deathDay??record.birthDay)-record.birthDay))),
    offspringMean:mean(records.map(record=>record.offspringCount)),
    breederRate:records.length?breeders.length/records.length:0,
    traitMean:average,
    traitVariance:traitVariance(records,average),
    phenotypeSamples:phenotype.sampleSize,
    phenotypeMean:phenotype.mean,
    phenotypeVariance:phenotype.variance
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

type InteractionSourceKind='predation'|'competition'|'disease';
type SourceEvidenceKind=Exclude<InteractionSourceKind,'predation'>;

const sourceExposureConfig=(kind:InteractionSourceKind)=>kind==='predation'
  ?{meanKey:'predatorSourceMean' as const,daysKey:'predatorSourceObservedDays' as const}
  :kind==='competition'
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
      lifespanPressureMean:mean(deadSamples.map(sample=>sample.value)),
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
    pressureLifespanAssociation:correlation(lifespanGenerations.map(entry=>entry.lifespanPressureMean),lifespanGenerations.map(entry=>entry.lifespanMean)),
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

interface MultifactorFeature {
  kind: InteractionSourceKind;
  sourceSpecies: WildlifeSpecies;
}

const MULTIFACTOR_RIDGE_LAMBDA=.25;
const MULTIFACTOR_MAX_FEATURES=6;
const MULTIFACTOR_MIN_FEATURE_SAMPLES=6;
const MULTIFACTOR_MIN_COMPLETE_SAMPLES=8;
const MULTIFACTOR_MAX_PAIRWISE_CORRELATION=.98;
const MULTIFACTOR_MAX_VIF=10;
const MULTIFACTOR_MAX_LOCAL_WINDOWS=6;
const MULTIFACTOR_MAX_LOCAL_GENERATION_SPAN=8;
const MULTIFACTOR_MAX_STABILITY_GENERATIONS=12;
const MULTIFACTOR_MIN_STABILITY_REPLICATES=3;
const EPS=1e-10;

function sourceFeatureValue(record:WildlifeLineageRecord,feature:MultifactorFeature):number|undefined {
  if(feature.sourceSpecies===record.species)return undefined;
  const exposure=record.habitatExposure;
  if(!exposure)return undefined;
  const config=sourceExposureConfig(feature.kind);
  if(Number(exposure[config.daysKey]||0)<MIN_LIFETIME_EXPOSURE_DAYS)return undefined;
  const value=exposure[config.meanKey]?.[feature.sourceSpecies];
  return typeof value==='number'&&Number.isFinite(value)?value:undefined;
}

function solveLinearSystem(matrix:number[][],vector:number[]):number[]|undefined {
  const n=vector.length;
  const a=matrix.map((row,index)=>[...row,vector[index]!]);
  for(let col=0;col<n;col++){
    let pivot=col;
    for(let row=col+1;row<n;row++)if(Math.abs(a[row]![col]!)>Math.abs(a[pivot]![col]!))pivot=row;
    if(Math.abs(a[pivot]![col]!)<EPS)return undefined;
    [a[col],a[pivot]]=[a[pivot]!,a[col]!];
    const scale=a[col]![col]!;
    for(let j=col;j<=n;j++)a[col]![j]/=scale;
    for(let row=0;row<n;row++){
      if(row===col)continue;
      const factor=a[row]![col]!;
      if(Math.abs(factor)<EPS)continue;
      for(let j=col;j<=n;j++)a[row]![j]-=factor*a[col]![j]!;
    }
  }
  return a.map(row=>row[n]!);
}

function multifactorPredictorDiagnostics(xColumns:number[][]) {
  const p=xColumns.length;
  if(p<2)return {stable:false,maxFeatureCorrelation:null,maxVarianceInflationFactor:null};
  const correlationMatrix=Array.from({length:p},()=>Array(p).fill(0) as number[]);
  let maxFeatureCorrelation=0;
  for(let j=0;j<p;j++){
    for(let k=0;k<p;k++){
      const value=mean(xColumns[j]!.map((entry,index)=>entry*xColumns[k]![index]!));
      correlationMatrix[j]![k]=value;
      if(j<k)maxFeatureCorrelation=Math.max(maxFeatureCorrelation,Math.abs(value));
    }
  }

  let maxVarianceInflationFactor=0;
  for(let j=0;j<p;j++){
    const unit=Array(p).fill(0) as number[];
    unit[j]=1;
    const inverseColumn=solveLinearSystem(correlationMatrix,unit);
    if(!inverseColumn){
      return {stable:false,maxFeatureCorrelation,maxVarianceInflationFactor:null};
    }
    const vif=inverseColumn[j]!;
    if(!Number.isFinite(vif)||vif<1-EPS){
      return {stable:false,maxFeatureCorrelation,maxVarianceInflationFactor:null};
    }
    maxVarianceInflationFactor=Math.max(maxVarianceInflationFactor,vif);
  }

  return {
    stable:maxFeatureCorrelation<MULTIFACTOR_MAX_PAIRWISE_CORRELATION&&maxVarianceInflationFactor<=MULTIFACTOR_MAX_VIF,
    maxFeatureCorrelation,
    maxVarianceInflationFactor
  };
}

function multifactorOutcomeRecords(
  records:WildlifeLineageRecord[],
  outcome:WildlifeMultifactorOutcome,
  asOfDay?:number
) {
  return outcome==='lifespan'
    ?records.filter(record=>record.deathDay!==undefined)
    :records.filter(record=>fitnessOutcomeEligible(record,asOfDay));
}

function multifactorFeatureKey(feature:{kind:MultifactorFeature['kind'];sourceSpecies:WildlifeSpecies}) {
  return `${feature.kind}:${feature.sourceSpecies}`;
}

function sameMultifactorFeatureSet(a:WildlifeMultifactorOutcomeEvidence,b:WildlifeMultifactorOutcomeEvidence) {
  if(a.coefficients.length!==b.coefficients.length)return false;
  const left=a.coefficients.map(multifactorFeatureKey).sort();
  const right=b.coefficients.map(multifactorFeatureKey).sort();
  return left.every((key,index)=>key===right[index]);
}

function multifactorCoefficientSign(value:number) {
  return value>EPS?1:value<-EPS?-1:0;
}

function boundedGenerationSample(generations:number[],limit:number) {
  if(generations.length<=limit)return [...generations];
  const sampled:number[]=[];
  for(let index=0;index<limit;index++){
    const sourceIndex=Math.round(index*(generations.length-1)/(limit-1));
    const generation=generations[sourceIndex]!;
    if(sampled[sampled.length-1]!==generation)sampled.push(generation);
  }
  return sampled;
}

function fitMultifactorOutcome(
  records:WildlifeLineageRecord[],
  outcome:WildlifeMultifactorOutcome,
  asOfDay?:number
):WildlifeMultifactorOutcomeEvidence {
  const base=multifactorOutcomeRecords(records,outcome,asOfDay);
  const outcomeValue=(record:WildlifeLineageRecord)=>outcome==='reproduction'
    ?(record.offspringCount>0?1:0)
    :outcome==='offspring'
      ?record.offspringCount
      :Math.max(0,(record.deathDay??record.birthDay)-record.birthDay);

  const keys=new Map<string,MultifactorFeature>();
  for(const record of base){
    const exposure=record.habitatExposure;
    if(!exposure)continue;
    for(const kind of ['predation','competition','disease'] as const){
      const config=sourceExposureConfig(kind);
      if(Number(exposure[config.daysKey]||0)<MIN_LIFETIME_EXPOSURE_DAYS)continue;
      const means=exposure[config.meanKey];
      if(!means)continue;
      for(const sourceSpecies of SPECIES){
        if(sourceSpecies===record.species)continue;
        const value=means[sourceSpecies];
        if(typeof value==='number'&&Number.isFinite(value)&&value>0)keys.set(`${kind}:${sourceSpecies}`,{kind,sourceSpecies});
      }
    }
  }

  const candidates=[...keys.values()].map(feature=>{
    const values=base.map(record=>sourceFeatureValue(record,feature)).filter((value):value is number=>value!==undefined);
    return {
      feature,
      coverageSamples:values.length,
      coverageRate:base.length?values.length/base.length:0,
      spread:variance(values),
      max:values.length?Math.max(...values):0
    };
  }).filter(candidate=>candidate.coverageSamples>=MULTIFACTOR_MIN_FEATURE_SAMPLES&&candidate.spread>EPS&&candidate.max>0)
    .sort((a,b)=>b.coverageSamples-a.coverageSamples||b.spread-a.spread||a.feature.kind.localeCompare(b.feature.kind)||a.feature.sourceSpecies.localeCompare(b.feature.sourceSpecies));

  const selected:typeof candidates=[];
  for(const candidate of candidates){
    if(selected.length>=MULTIFACTOR_MAX_FEATURES)break;
    const proposed=[...selected,candidate];
    const rows=base.filter(record=>proposed.every(entry=>sourceFeatureValue(record,entry.feature)!==undefined));
    const minimum=Math.max(MULTIFACTOR_MIN_COMPLETE_SAMPLES,proposed.length*3);
    if(rows.length>=minimum)selected.push(candidate);
  }

  let stableFeatures=selected;
  let rows=base.filter(record=>stableFeatures.every(entry=>sourceFeatureValue(record,entry.feature)!==undefined));
  let changed=true;
  while(changed&&stableFeatures.length){
    changed=false;
    const filtered=stableFeatures.filter(entry=>variance(rows.map(record=>sourceFeatureValue(record,entry.feature)!))>EPS);
    if(filtered.length!==stableFeatures.length){
      stableFeatures=filtered;
      rows=base.filter(record=>stableFeatures.every(entry=>sourceFeatureValue(record,entry.feature)!==undefined));
      changed=true;
    }
  }

  const minimum=Math.max(MULTIFACTOR_MIN_COMPLETE_SAMPLES,stableFeatures.length*3);
  const y=rows.map(outcomeValue);
  const yMean=mean(y);
  const yVariance=variance(y,yMean);
  const coefficients:WildlifeMultifactorFeatureCoefficient[]=stableFeatures.map(entry=>{
    const values=rows.map(record=>sourceFeatureValue(record,entry.feature)!);
    return {
      kind:entry.feature.kind,
      sourceSpecies:entry.feature.sourceSpecies,
      coverageSamples:entry.coverageSamples,
      coverageRate:entry.coverageRate,
      mean:mean(values),
      stdDev:Math.sqrt(Math.max(0,variance(values))),
      standardizedCoefficient:null
    };
  });
  const unavailable=(status:WildlifeMultifactorOutcomeEvidence['status'],diagnostics?:{
    maxFeatureCorrelation:number|null;
    maxVarianceInflationFactor:number|null;
  }):WildlifeMultifactorOutcomeEvidence=>({
    outcome,estimable:false,status,baseSamples:base.length,samples:rows.length,
    candidateFeatures:candidates.length,selectedFeatures:stableFeatures.length,
    ridgeLambda:MULTIFACTOR_RIDGE_LAMBDA,rSquared:null,
    maxFeatureCorrelation:diagnostics?.maxFeatureCorrelation??null,
    maxVarianceInflationFactor:diagnostics?.maxVarianceInflationFactor??null,
    coefficients
  });

  if(stableFeatures.length<2)return unavailable('insufficient_features');
  if(rows.length<minimum)return unavailable('insufficient_samples');
  if(yVariance<=EPS)return unavailable('no_outcome_variance');

  const ySd=Math.sqrt(yVariance);
  const standardizedY=y.map(value=>(value-yMean)/ySd);
  const xColumns=coefficients.map((coefficient,index)=>{
    const values=rows.map(record=>sourceFeatureValue(record,stableFeatures[index]!.feature)!);
    return values.map(value=>(value-coefficient.mean)/coefficient.stdDev);
  });
  const diagnostics=multifactorPredictorDiagnostics(xColumns);
  if(!diagnostics.stable)return unavailable('unstable_collinearity',diagnostics);

  const p=xColumns.length;
  const matrix=Array.from({length:p},()=>Array(p).fill(0) as number[]);
  const vector=Array(p).fill(0) as number[];
  for(let j=0;j<p;j++){
    for(let k=0;k<p;k++)matrix[j]![k]=mean(rows.map((_,index)=>xColumns[j]![index]!*xColumns[k]![index]!))+(j===k?MULTIFACTOR_RIDGE_LAMBDA:0);
    vector[j]=mean(rows.map((_,index)=>xColumns[j]![index]!*standardizedY[index]!));
  }
  const beta=solveLinearSystem(matrix,vector);
  if(!beta)return unavailable('numerical_failure',diagnostics);
  for(let j=0;j<coefficients.length;j++)coefficients[j]!.standardizedCoefficient=beta[j]!;
  coefficients.sort((a,b)=>Math.abs(b.standardizedCoefficient||0)-Math.abs(a.standardizedCoefficient||0)||a.kind.localeCompare(b.kind)||a.sourceSpecies.localeCompare(b.sourceSpecies));

  const predictions=rows.map((_,index)=>beta.reduce((sum,value,j)=>sum+value*xColumns[j]![index]!,0));
  const residual=mean(standardizedY.map((value,index)=>(value-predictions[index]!)**2));

  return {
    outcome,estimable:true,status:'estimable',baseSamples:base.length,samples:rows.length,
    candidateFeatures:candidates.length,selectedFeatures:stableFeatures.length,
    ridgeLambda:MULTIFACTOR_RIDGE_LAMBDA,
    rSquared:1-residual,
    maxFeatureCorrelation:diagnostics.maxFeatureCorrelation,
    maxVarianceInflationFactor:diagnostics.maxVarianceInflationFactor,
    coefficients
  };
}
function multifactorOutcomeStability(
  records:WildlifeLineageRecord[],
  outcome:WildlifeMultifactorOutcome,
  pooledModel:WildlifeMultifactorOutcomeEvidence,
  asOfDay?:number
):WildlifeMultifactorOutcomeStabilityEvidence {
  const base=multifactorOutcomeRecords(records,outcome,asOfDay);
  const generations=[...new Set(base.map(record=>record.generation))].sort((a,b)=>a-b);
  const coefficientsWithoutReplicates=()=>pooledModel.coefficients.map(feature=>({
    kind:feature.kind,
    sourceSpecies:feature.sourceSpecies,
    comparableReplicates:0,
    coefficientMean:null,
    coefficientMin:null,
    coefficientMax:null,
    signConsistency:null
  }));
  const subsetCannotRecover=['insufficient_features','insufficient_samples','no_outcome_variance'].includes(pooledModel.status);
  if(subsetCannotRecover){
    return {
      outcome,
      basis:'target_species_generation',
      leaveOneGenerationOut:{
        availableGenerations:generations.length,
        testedGenerations:[],
        attemptedReplicates:0,
        estimableReplicates:0,
        comparableReplicates:0,
        coefficients:coefficientsWithoutReplicates()
      },
      localWindows:[]
    };
  }

  const testedGenerations=generations.length>=2
    ?boundedGenerationSample(generations,MULTIFACTOR_MAX_STABILITY_GENERATIONS)
    :[];
  const replicates=testedGenerations.map(generation=>
    fitMultifactorOutcome(records.filter(record=>record.generation!==generation),outcome,asOfDay)
  );
  const estimableReplicates=replicates.filter(model=>model.estimable);
  const comparableReplicates=pooledModel.estimable
    ?estimableReplicates.filter(model=>sameMultifactorFeatureSet(pooledModel,model))
    :[];

  const coefficients=pooledModel.coefficients.map(feature=>{
    const values=comparableReplicates.map(model=>
      model.coefficients.find(candidate=>multifactorFeatureKey(candidate)===multifactorFeatureKey(feature))?.standardizedCoefficient
    ).filter((value):value is number=>typeof value==='number'&&Number.isFinite(value));
    const pooled=feature.standardizedCoefficient;
    const pooledSign=pooled===null?0:multifactorCoefficientSign(pooled);
    const signConsistency=pooledSign!==0&&values.length>=MULTIFACTOR_MIN_STABILITY_REPLICATES
      ?values.filter(value=>multifactorCoefficientSign(value)===pooledSign).length/values.length
      :null;
    return {
      kind:feature.kind,
      sourceSpecies:feature.sourceSpecies,
      comparableReplicates:values.length,
      coefficientMean:values.length?mean(values):null,
      coefficientMin:values.length?Math.min(...values):null,
      coefficientMax:values.length?Math.max(...values):null,
      signConsistency
    };
  });

  const localWindows:WildlifeMultifactorOutcomeStabilityEvidence['localWindows']=[];
  const endpointGenerations=generations.slice(-MULTIFACTOR_MAX_LOCAL_WINDOWS);
  for(const endGeneration of endpointGenerations){
    const endIndex=generations.indexOf(endGeneration);
    const minimumStartIndex=Math.max(0,endIndex-MULTIFACTOR_MAX_LOCAL_GENERATION_SPAN+1);
    let chosen:WildlifeMultifactorOutcomeStabilityEvidence['localWindows'][number]|undefined;
    for(let startIndex=endIndex;startIndex>=minimumStartIndex;startIndex--){
      const windowGenerations=generations.slice(startIndex,endIndex+1);
      const generationSet=new Set(windowGenerations);
      const model=fitMultifactorOutcome(
        records.filter(record=>generationSet.has(record.generation)),
        outcome,
        asOfDay
      );
      chosen={
        startGeneration:windowGenerations[0]!,
        endGeneration,
        generations:windowGenerations,
        searchTruncated:false,
        model
      };
      if(model.estimable)break;
    }
    if(chosen){
      chosen.searchTruncated=!chosen.model.estimable&&minimumStartIndex>0;
      localWindows.push(chosen);
    }
  }

  return {
    outcome,
    basis:'target_species_generation',
    leaveOneGenerationOut:{
      availableGenerations:generations.length,
      testedGenerations,
      attemptedReplicates:replicates.length,
      estimableReplicates:estimableReplicates.length,
      comparableReplicates:comparableReplicates.length,
      coefficients
    },
    localWindows
  };
}

function multifactorSelection(
  records:WildlifeLineageRecord[],
  species:WildlifeSpecies,
  asOfDay?:number
):WildlifeMultifactorSelectionEvidence {
  const outcomes=['reproduction','offspring','lifespan'] as const;
  const models=outcomes.map(outcome=>fitMultifactorOutcome(records,outcome,asOfDay));
  return {
    species,
    models,
    stability:models.map(model=>multifactorOutcomeStability(records,model.outcome,model,asOfDay))
  };
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
      phenotype:phenotypeStats(speciesRecords),
      phenotypeBiomeFitness:phenotypeBiomeFitness(speciesRecords,asOfDay),
      organismGenome:organismGenomeStats(speciesRecords),
      mortality,
      reproductiveSuccess:mean(breeders.map(record=>record.offspringCount)),
      survivalToReproductionRate:speciesRecords.length?breeders.length/speciesRecords.length:0,
      cohorts:generations.map(generation=>cohort(generation,speciesRecords.filter(record=>record.generation===generation))),
      biomeSelection:biomeSelection(speciesRecords,'origin'),
      lifetimeBiomeSelection:biomeSelection(speciesRecords,'lifetime'),
      exposureFitness:habitatFitness(speciesRecords,asOfDay),
      predatorSpecialization:predatorSpecialization(speciesRecords,asOfDay),
      interactionSourceFitness:interactionSourceFitness(speciesRecords,asOfDay),
      multifactorSelection:multifactorSelection(speciesRecords,species,asOfDay),
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
