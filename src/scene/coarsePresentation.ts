import type { CoarseChunkState } from '../types.js';

export type CoarseMarkerAsset = 'townCenter'|'tree2'|'tree3'|'bush'|'rock';

export interface CoarseMarkerVisualSpec {
  kind: 'settlement'|'wilderness';
  asset: CoarseMarkerAsset;
  height: number;
  rotationY: number;
}

const rotationFor=(chunk:CoarseChunkState)=>{
  const turns=((chunk.cx*37+chunk.cz*61)%24+24)%24;
  return turns/24*Math.PI*2;
};

/**
 * Distant coarse markers reuse already-vendored authored assets. They are visual
 * summaries only: they never add entities, physics, discovery or simulation state.
 */
export function coarseMarkerVisualSpec(chunk:CoarseChunkState):CoarseMarkerVisualSpec {
  const rotationY=rotationFor(chunk);
  if(chunk.settlementLevel>0){
    return {
      kind:'settlement',asset:'townCenter',
      height:3.2+Math.min(3,chunk.settlementLevel)*.55,
      rotationY
    };
  }
  switch(chunk.biome){
    case 'forest': return {kind:'wilderness',asset:'tree2',height:4.2,rotationY};
    case 'plains': return {kind:'wilderness',asset:'tree3',height:3.7,rotationY};
    case 'wetlands': return {kind:'wilderness',asset:'bush',height:1.5,rotationY};
    case 'hills': return {kind:'wilderness',asset:'rock',height:1.7,rotationY};
    case 'dryland': return {kind:'wilderness',asset:'rock',height:1.35,rotationY};
  }
}
