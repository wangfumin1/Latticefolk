import type { CoarseChunkState } from '../types.js';

export interface CoarseChunkCoordinateLookup {
  get(cx:number,cz:number):CoarseChunkState|undefined;
}

const coordKey=(cx:number,cz:number)=>`${cx},${cz}`;

export class CoarseChunkSpatialIndex implements CoarseChunkCoordinateLookup {
  private byCoord=new Map<string,CoarseChunkState>();
  private coordById=new Map<string,string>();

  constructor(chunks:Iterable<CoarseChunkState>=[]) {
    this.rebuild(chunks);
  }

  upsert(chunk:CoarseChunkState) {
    const nextKey=coordKey(chunk.cx,chunk.cz);
    const previousKey=this.coordById.get(chunk.id);
    if(previousKey&&previousKey!==nextKey)this.byCoord.delete(previousKey);

    const displaced=this.byCoord.get(nextKey);
    if(displaced&&displaced.id!==chunk.id)this.coordById.delete(displaced.id);

    this.byCoord.set(nextKey,chunk);
    this.coordById.set(chunk.id,nextKey);
  }

  remove(id:string) {
    const key=this.coordById.get(id);
    if(!key)return false;
    this.coordById.delete(id);
    const current=this.byCoord.get(key);
    if(current?.id===id)this.byCoord.delete(key);
    return true;
  }

  rebuild(chunks:Iterable<CoarseChunkState>) {
    this.byCoord.clear();
    this.coordById.clear();
    for(const chunk of chunks)this.upsert(chunk);
  }

  get(cx:number,cz:number) {
    return this.byCoord.get(coordKey(cx,cz));
  }

  get size(){return this.byCoord.size;}
}
