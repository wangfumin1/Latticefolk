export interface SpatialBounds {
  minX:number;
  maxX:number;
  minZ:number;
  maxZ:number;
}

export interface SpatialEntry extends SpatialBounds {
  id:string;
}

const normalize=(bounds:SpatialBounds):SpatialBounds=>({
  minX:Math.min(bounds.minX,bounds.maxX),
  maxX:Math.max(bounds.minX,bounds.maxX),
  minZ:Math.min(bounds.minZ,bounds.maxZ),
  maxZ:Math.max(bounds.minZ,bounds.maxZ)
});

export class SpatialHashIndex<T extends SpatialEntry> {
  private cells=new Map<string,Map<string,T>>();
  private memberships=new Map<string,string[]>();
  private values=new Map<string,T>();

  constructor(readonly cellSize=8) {
    if(!Number.isFinite(cellSize)||cellSize<=0)throw new Error('cellSize must be positive');
  }

  private cell(value:number){return Math.floor(value/this.cellSize);}
  private key(x:number,z:number){return `${x},${z}`;}

  private keysFor(bounds:SpatialBounds) {
    const b=normalize(bounds),keys:string[]=[];
    const minX=this.cell(b.minX),maxX=this.cell(b.maxX),minZ=this.cell(b.minZ),maxZ=this.cell(b.maxZ);
    for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++)keys.push(this.key(x,z));
    return keys;
  }

  upsert(value:T) {
    this.remove(value.id);
    const stored={...value,...normalize(value)} as T;
    const keys=this.keysFor(stored);
    this.values.set(stored.id,stored);
    this.memberships.set(stored.id,keys);
    for(const key of keys){
      let cell=this.cells.get(key);
      if(!cell){cell=new Map();this.cells.set(key,cell);}
      cell.set(stored.id,stored);
    }
    return stored;
  }

  remove(id:string) {
    const keys=this.memberships.get(id);
    if(keys){
      for(const key of keys){
        const cell=this.cells.get(key);if(!cell)continue;
        cell.delete(id);
        if(!cell.size)this.cells.delete(key);
      }
    }
    this.memberships.delete(id);
    return this.values.delete(id);
  }

  clear(){this.cells.clear();this.memberships.clear();this.values.clear();}

  query(bounds:SpatialBounds):T[] {
    const b=normalize(bounds),found=new Map<string,T>();
    for(const key of this.keysFor(b)){
      const cell=this.cells.get(key);if(!cell)continue;
      for(const value of cell.values()){
        if(value.maxX<b.minX||value.minX>b.maxX||value.maxZ<b.minZ||value.minZ>b.maxZ)continue;
        found.set(value.id,value);
      }
    }
    return [...found.values()].sort((a,b)=>a.id.localeCompare(b.id));
  }

  get size(){return this.values.size;}
  get cellCount(){return this.cells.size;}
}
