/** Presentation units group 3 × 3 existing owners; coarse simulation remains 24 m. */
export const STREAMED_UNIT_SIZE=72;
export const STREAMED_UNIT_COARSE_SIZE=24;
export const STREAMED_MAIN_ROAD_WIDTH=4;

export interface StreamedUnitBounds {
  minX:number;
  maxX:number;
  minZ:number;
  maxZ:number;
}

export interface StreamedUnit {
  id:string;
  ux:number;
  uz:number;
  bounds:StreamedUnitBounds;
  isHome:boolean;
}

export interface StreamedUnitOwnerCell {
  id:string;
  cx:number;
  cz:number;
}

/** North is -z and south is +z, independent of camera orientation. */
export type StreamedUnitSide='west'|'east'|'north'|'south';

export interface StreamedUnitRoadConnection {
  edgeKey:string;
  x:number;
  z:number;
  width:number;
  /** Direction of travel across the boundary, not the boundary's tangent. */
  axis:'x'|'z';
}

const HALF_UNIT=STREAMED_UNIT_SIZE/2;
const CELLS_PER_UNIT=STREAMED_UNIT_SIZE/STREAMED_UNIT_COARSE_SIZE;
// Keep both bounding edges and all owner-cell coordinates exactly representable.
const MAX_UNIT_COORDINATE=Math.floor((Number.MAX_SAFE_INTEGER-HALF_UNIT)/STREAMED_UNIT_SIZE);

function unitCoordinate(value:number,name:string):number {
  if(!Number.isSafeInteger(value)||Math.abs(value)>MAX_UNIT_COORDINATE){
    throw new RangeError(`${name} must be a safe integer with exactly representable unit bounds`);
  }
  return value===0?0:value;
}

function coarseCoordinate(value:number,name:string):number {
  if(!Number.isSafeInteger(value))throw new RangeError(`${name} must be a safe integer`);
  return value===0?0:value;
}

export function streamedUnitId(ux:number,uz:number):string {
  return `unit_${unitCoordinate(ux,'ux')}_${unitCoordinate(uz,'uz')}`;
}

/** Bounds are half-open: [minX,maxX) × [minZ,maxZ). */
export function streamedUnitBounds(ux:number,uz:number):StreamedUnitBounds {
  const x=unitCoordinate(ux,'ux')*STREAMED_UNIT_SIZE;
  const z=unitCoordinate(uz,'uz')*STREAMED_UNIT_SIZE;
  return {minX:x-HALF_UNIT,maxX:x+HALF_UNIT,minZ:z-HALF_UNIT,maxZ:z+HALF_UNIT};
}

export function isHomeStreamedUnit(ux:number,uz:number):boolean {
  ux=unitCoordinate(ux,'ux');
  uz=unitCoordinate(uz,'uz');
  return ux===0&&uz===0;
}

export function streamedUnitAt(ux:number,uz:number):StreamedUnit {
  ux=unitCoordinate(ux,'ux');
  uz=unitCoordinate(uz,'uz');
  return {id:streamedUnitId(ux,uz),ux,uz,bounds:streamedUnitBounds(ux,uz),isHome:isHomeStreamedUnit(ux,uz)};
}

/** Cell groups are [-1,1], [2,4], etc.; negative groups use floor, never truncation. */
export function streamedUnitForCoarseCell(cx:number,cz:number):StreamedUnit {
  cx=coarseCoordinate(cx,'cx');
  cz=coarseCoordinate(cz,'cz');
  return streamedUnitAt(Math.floor((cx+1)/CELLS_PER_UNIT),Math.floor((cz+1)/CELLS_PER_UNIT));
}

export function streamedUnitAtWorld(x:number,z:number):StreamedUnit {
  if(!Number.isFinite(x)||!Number.isFinite(z))throw new RangeError('World coordinates must be finite');
  // Use the same operation order as CoarseWorldRuntime.chunkAtWorld, preserving owners
  // even at floating-point boundaries. Grouping adds no second chunk authority.
  return streamedUnitForCoarseCell(
    Math.floor((x+STREAMED_UNIT_COARSE_SIZE/2)/STREAMED_UNIT_COARSE_SIZE),
    Math.floor((z+STREAMED_UNIT_COARSE_SIZE/2)/STREAMED_UNIT_COARSE_SIZE)
  );
}

/** Stable row-major order, north to south then west to east; home includes its nine cells. */
export function streamedUnitOwnerCells(ux:number,uz:number):StreamedUnitOwnerCell[] {
  const centerCx=unitCoordinate(ux,'ux')*CELLS_PER_UNIT;
  const centerCz=unitCoordinate(uz,'uz')*CELLS_PER_UNIT;
  const cells:StreamedUnitOwnerCell[]=[];
  for(let dz=-1;dz<=1;dz++){
    for(let dx=-1;dx<=1;dx++){
      const cx=centerCx+dx;
      const cz=centerCz+dz;
      cells.push({id:`chunk_${cx}_${cz}`,cx,cz});
    }
  }
  return cells;
}

/** Opposite sides of adjacent units yield the same key, position, width and axis. */
export function streamedUnitRoadConnection(ux:number,uz:number,side:StreamedUnitSide):StreamedUnitRoadConnection {
  ux=unitCoordinate(ux,'ux');
  uz=unitCoordinate(uz,'uz');
  const bounds=streamedUnitBounds(ux,uz);
  const x=ux*STREAMED_UNIT_SIZE;
  const z=uz*STREAMED_UNIT_SIZE;
  const width=STREAMED_MAIN_ROAD_WIDTH;
  switch(side){
    case 'west':return {edgeKey:`unit-edge:x:${ux}:${uz}`,x:bounds.minX,z,width,axis:'x'};
    case 'east':return {edgeKey:`unit-edge:x:${ux+1}:${uz}`,x:bounds.maxX,z,width,axis:'x'};
    case 'north':return {edgeKey:`unit-edge:z:${ux}:${uz}`,x,z:bounds.minZ,width,axis:'z'};
    case 'south':return {edgeKey:`unit-edge:z:${ux}:${uz+1}`,x,z:bounds.maxZ,width,axis:'z'};
    default:throw new RangeError('Unit side must be west, east, north or south');
  }
}

export function streamedUnitRoadEdgeKey(ux:number,uz:number,side:StreamedUnitSide):string {
  return streamedUnitRoadConnection(ux,uz,side).edgeKey;
}
