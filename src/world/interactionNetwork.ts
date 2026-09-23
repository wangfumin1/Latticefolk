import type {
  CoarseChunkState, WildlifeInteractionEdge, WildlifeInteractionKind, WildlifeInteractionNetwork,
  WildlifeInteractionNode, WildlifeSpecies
} from '../types.js';
import { WILDLIFE_SPECIES } from './wildlifeSpecies.js';

const SPECIES=[...WILDLIFE_SPECIES];
const round=(value:number)=>Math.round(value*1000)/1000;
const kindOrder:Record<WildlifeInteractionKind,number>={predation:0,competition:1,disease:2};

interface EdgeAccumulator {
  kind: WildlifeInteractionKind;
  fromSpecies: WildlifeSpecies;
  toSpecies: WildlifeSpecies;
  directed: boolean;
  totalPressure: number;
  maxPressure: number;
  activeChunks: number;
}

const edgeKey=(kind:WildlifeInteractionKind,from:WildlifeSpecies,to:WildlifeSpecies,directed:boolean)=>{
  if(directed)return `${kind}:${from}:${to}`;
  const [a,b]=[from,to].sort() as [WildlifeSpecies,WildlifeSpecies];
  return `${kind}:${a}:${b}`;
};

export function computeWildlifeInteractionNetwork(chunks:Iterable<CoarseChunkState>):WildlifeInteractionNetwork {
  const list=[...chunks];
  const coverage:Record<WildlifeInteractionKind,number>={predation:0,competition:0,disease:0};
  const accumulators=new Map<string,EdgeAccumulator>();

  const register=(kind:WildlifeInteractionKind,from:WildlifeSpecies,to:WildlifeSpecies,directed:boolean,pressure:number)=>{
    const normalized=directed?[from,to] as const:([from,to].sort() as [WildlifeSpecies,WildlifeSpecies]);
    const key=edgeKey(kind,normalized[0],normalized[1],directed);
    let entry=accumulators.get(key);
    if(!entry){
      entry={kind,fromSpecies:normalized[0],toSpecies:normalized[1],directed,totalPressure:0,maxPressure:0,activeChunks:0};
      accumulators.set(key,entry);
    }
    const value=Math.max(0,Number.isFinite(pressure)?pressure:0);
    entry.totalPressure+=value;
    entry.maxPressure=Math.max(entry.maxPressure,value);
    if(value>0)entry.activeChunks++;
  };

  for(const chunk of list){
    const predationPairs=chunk.wildlifePredatorPressure?.pairs;
    if(Array.isArray(predationPairs)){
      coverage.predation++;
      for(const pair of predationPairs)register('predation',pair.predatorSpecies,pair.preySpecies,true,pair.pressure);
    }

    const competitionPairs=chunk.nicheCompetition?.pairs;
    if(Array.isArray(competitionPairs)){
      coverage.competition++;
      for(const pair of competitionPairs)register('competition',pair.speciesA,pair.speciesB,false,pair.pressure);
    }

    const diseasePairs=chunk.wildlifeDisease?.pairs;
    if(Array.isArray(diseasePairs)){
      coverage.disease++;
      for(const pair of diseasePairs)register('disease',pair.fromSpecies,pair.toSpecies,true,pair.pressure);
    }
  }

  const edges:WildlifeInteractionEdge[]=[...accumulators.values()].map(entry=>({
    kind:entry.kind,
    fromSpecies:entry.fromSpecies,
    toSpecies:entry.toSpecies,
    directed:entry.directed,
    coverageChunks:coverage[entry.kind],
    activeChunks:entry.activeChunks,
    meanPressure:round(coverage[entry.kind]>0?entry.totalPressure/coverage[entry.kind]:0),
    maxPressure:round(entry.maxPressure)
  })).filter(edge=>edge.maxPressure>0)
    .sort((a,b)=>kindOrder[a.kind]-kindOrder[b.kind]||b.meanPressure-a.meanPressure||b.maxPressure-a.maxPressure||a.fromSpecies.localeCompare(b.fromSpecies)||a.toSpecies.localeCompare(b.toSpecies));

  const population=Object.fromEntries(SPECIES.map(species=>[species,0])) as Record<WildlifeSpecies,number>;
  for(const chunk of list){
    for(const pop of chunk.wildlife||[])population[pop.species]+=Math.max(0,pop.count||0);
  }

  const nodes:WildlifeInteractionNode[]=SPECIES.map(species=>{
    let predationIncoming=0,predationOutgoing=0,competitionPressure=0,diseaseIncoming=0,diseaseOutgoing=0;
    const kinds=new Set<WildlifeInteractionKind>();
    for(const edge of edges){
      if(edge.meanPressure<=0)continue;
      if(edge.kind==='predation'){
        if(edge.fromSpecies===species){predationOutgoing+=edge.meanPressure;kinds.add('predation');}
        if(edge.toSpecies===species){predationIncoming+=edge.meanPressure;kinds.add('predation');}
      }else if(edge.kind==='competition'){
        if(edge.fromSpecies===species||edge.toSpecies===species){competitionPressure+=edge.meanPressure;kinds.add('competition');}
      }else{
        if(edge.fromSpecies===species){diseaseOutgoing+=edge.meanPressure;kinds.add('disease');}
        if(edge.toSpecies===species){diseaseIncoming+=edge.meanPressure;kinds.add('disease');}
      }
    }
    return {
      species,population:round(population[species]),
      predationIncoming:round(predationIncoming),predationOutgoing:round(predationOutgoing),
      competitionPressure:round(competitionPressure),
      diseaseIncoming:round(diseaseIncoming),diseaseOutgoing:round(diseaseOutgoing),
      activeInteractionKinds:kinds.size
    };
  });

  const strongestByKind:WildlifeInteractionNetwork['strongestByKind']={};
  for(const kind of ['predation','competition','disease'] as const){
    const strongest=edges.filter(edge=>edge.kind===kind)
      .sort((a,b)=>b.meanPressure-a.meanPressure||b.maxPressure-a.maxPressure)[0];
    if(strongest)strongestByKind[kind]=strongest;
  }

  return {chunks:list.length,coverage,nodes,edges,strongestByKind};
}
