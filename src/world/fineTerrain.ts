import type { CoarseChunkState } from '../types';
import { FinePhysicsAuthority, type TerrainSurface } from './finePhysics.js';


/** Authoritative flat ground for the authored home-town footprint. */
export function homeTerrainSurface(worldSize:number):TerrainSurface {
  const size=Math.max(1,Number.isFinite(worldSize)?worldSize:72);
  const half=size/2;
  return {
    id:'terrain:home',
    minX:-half,
    maxX:half,
    minZ:-half,
    maxZ:half,
    originX:0,
    originZ:0,
    originY:0,
    slopeX:0,
    slopeZ:0
  };
}

export function registerHomeTerrain(physics:FinePhysicsAuthority,worldSize:number):TerrainSurface {
  return physics.registerTerrain(homeTerrainSurface(worldSize));
}

/**
 * Converts a materialized coarse chunk into the authoritative fine-physics ground footprint.
 *
 * The current rendered world is flat, so runtime terrain is deliberately flat too. This keeps
 * visual ground, navigation and physical contact aligned while the terrain authority is rolled
 * out. Future procedural elevation must change the rendered terrain and this descriptor together;
 * it must not introduce a second height/collision source.
 */
export function fineTerrainSurfaceForChunk(chunk:Pick<CoarseChunkState,'id'|'cx'|'cz'>,chunkSize:number):TerrainSurface {
  const size=Math.max(1,Number.isFinite(chunkSize)?chunkSize:24);
  const half=size/2;
  const originX=chunk.cx*size;
  const originZ=chunk.cz*size;
  return {
    id:`terrain:${chunk.id}`,
    chunkId:chunk.id,
    minX:originX-half,
    maxX:originX+half,
    minZ:originZ-half,
    maxZ:originZ+half,
    originX,
    originZ,
    originY:0,
    slopeX:0,
    slopeZ:0
  };
}

/**
 * Materialization boundary for fine terrain. Keeping registration here prevents callers from
 * reconstructing a second terrain footprint and guarantees clearChunk(chunk.id) owns teardown.
 */
export function registerFineTerrainForChunk(
  physics:FinePhysicsAuthority,
  chunk:Pick<CoarseChunkState,'id'|'cx'|'cz'>,
  chunkSize:number
):TerrainSurface {
  return physics.registerTerrain(fineTerrainSurfaceForChunk(chunk,chunkSize));
}
