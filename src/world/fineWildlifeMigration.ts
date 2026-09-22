import type { CoarseChunkState, CoarseWildlifePopulation, Vec2, WildlifeState } from '../types.js';

const clamp=(value:number,min=0,max=100)=>Math.max(min,Math.min(max,value));

export function areAdjacentChunks(source:Pick<CoarseChunkState,'cx'|'cz'>,target:Pick<CoarseChunkState,'cx'|'cz'>) {
  return Math.abs(source.cx-target.cx)+Math.abs(source.cz-target.cz)===1;
}

export function fineMigrationRepresentativeWeight(source:CoarseWildlifePopulation,initialFineCount:number) {
  if(source.count<=0)return 0;
  if(initialFineCount<=0)return Math.min(1,source.count);
  return Math.min(source.count,Math.min(4,Math.max(1,source.count/initialFineCount)));
}

function removeWeightedMean(meanValue:number,count:number,individualValue:number,amount:number) {
  const remaining=Math.max(0,count-amount);
  if(remaining<=1e-9)return clamp(meanValue);
  return clamp((meanValue*count-individualValue*amount)/remaining);
}

function addWeightedMean(meanValue:number,count:number,individualValue:number,amount:number) {
  const total=count+amount;
  if(total<=1e-9)return clamp(meanValue);
  return clamp((meanValue*count+individualValue*amount)/total);
}

export function applyFineWildlifePopulationTransfer(
  source:CoarseWildlifePopulation,
  target:CoarseWildlifePopulation,
  animal:Pick<WildlifeState,'health'|'diseaseLoad'>,
  initialFineCount:number,
  representedPopulation?:number,
  maxTargetAmount=Number.POSITIVE_INFINITY
) {
  const requested=representedPopulation&&representedPopulation>0
    ?Math.min(source.count,representedPopulation)
    :fineMigrationRepresentativeWeight(source,initialFineCount);
  const amount=Math.min(requested,Math.max(0,maxTargetAmount));
  if(amount<=0)return 0;
  const sourceBefore=source.count;
  const targetBefore=target.count;
  const disease=clamp(animal.diseaseLoad||0);

  source.health=removeWeightedMean(source.health,sourceBefore,animal.health,amount);
  source.diseaseLoad=removeWeightedMean(source.diseaseLoad||0,sourceBefore,disease,amount);
  target.health=addWeightedMean(target.health,targetBefore,animal.health,amount);
  target.diseaseLoad=addWeightedMean(target.diseaseLoad||0,targetBefore,disease,amount);
  source.count=Math.max(0,sourceBefore-amount);
  target.count=targetBefore+amount;
  return amount;
}

export function foldFineWildlifePopulationCount(
  coarseCount:number,
  initialOrdinaryCount:number,
  currentOrdinaryCount:number,
  initialFixedWeight:number,
  currentFixedWeight:number
) {
  const ordinaryBase=Math.max(0,coarseCount-Math.max(0,initialFixedWeight));
  const ordinaryWeight=initialOrdinaryCount>0
    ?Math.min(4,Math.max(1,ordinaryBase/initialOrdinaryCount))
    :1;
  return {
    ordinaryWeight,
    nextCount:Math.max(0,
      coarseCount+
      (currentOrdinaryCount-initialOrdinaryCount)*ordinaryWeight+
      (currentFixedWeight-initialFixedWeight)
    )
  };
}

export function fineMigrationEntryPoint(
  source:Pick<CoarseChunkState,'cx'|'cz'>,
  target:Pick<CoarseChunkState,'cx'|'cz'>,
  chunkSize:number,
  current:Vec2
):Vec2|undefined {
  if(!areAdjacentChunks(source,target))return undefined;
  const half=Math.max(1,chunkSize/2-1.25);
  const centerX=target.cx*chunkSize;
  const centerZ=target.cz*chunkSize;
  const minX=centerX-half,maxX=centerX+half,minZ=centerZ-half,maxZ=centerZ+half;
  if(target.cx>source.cx)return {x:minX,z:clamp(current.z,minZ,maxZ)};
  if(target.cx<source.cx)return {x:maxX,z:clamp(current.z,minZ,maxZ)};
  if(target.cz>source.cz)return {x:clamp(current.x,minX,maxX),z:minZ};
  return {x:clamp(current.x,minX,maxX),z:maxZ};
}
