import * as THREE from 'three';
import type {
  ChunkBiome, ChunkDecisionRequest, ChunkDecisionResponse, ChunkStrategy,
  ChunkMigrationPolicy, ChunkEcologyPolicy, CoarseChunkState
} from '../types';

const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,v));

export interface CoarseWorldStatus {
  chunks: number;
  decidedChunks: number;
  pending: boolean;
  lastSource: string;
  lastBatchSize: number;
  avgPopulation: number;
  avgEcology: number;
  avgProsperity: number;
}

interface UpdateContext {
  day: number;
  gameTime: string;
  weather: string;
  dt: number;
}

export class CoarseWorldRuntime {
  readonly chunkSize = 24;
  readonly radius = 4;
  readonly localRadius = 1;
  readonly chunks = new Map<string,CoarseChunkState>();

  private root = new THREE.Group();
  private tiles = new Map<string,THREE.Mesh>();
  private markers = new Map<string,THREE.Group>();
  private pending=false;
  private lastSource='seeded';
  private lastBatchSize=0;
  private nextDecisionAt=performance.now()+3500;
  private simulationAccumulator=0;

  constructor(private scene:THREE.Scene, private worldSeed='latticefolk-default') {
    this.root.name='coarse-world';
    this.scene.add(this.root);
    this.generate();
  }

  private hash(cx:number,cz:number,salt=0) {
    const s=`${this.worldSeed}:${cx}:${cz}:${salt}`;
    let h=2166136261;
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0)/4294967295;
  }

  private biomeFor(cx:number,cz:number):ChunkBiome {
    const r=this.hash(cx,cz,1);
    if(r<.18)return 'forest';
    if(r<.34)return 'hills';
    if(r<.46)return 'wetlands';
    if(r<.58)return 'dryland';
    return 'plains';
  }

  private generate() {
    for(let cz=-this.radius;cz<=this.radius;cz++) for(let cx=-this.radius;cx<=this.radius;cx++) {
      if(Math.abs(cx)<=this.localRadius&&Math.abs(cz)<=this.localRadius)continue;
      const biome=this.biomeFor(cx,cz);
      const settlementRoll=this.hash(cx,cz,2);
      const settlementLevel=settlementRoll>.86?2:settlementRoll>.62?1:0;
      const population=settlementLevel===0?Math.floor(this.hash(cx,cz,3)*4):Math.floor(5+this.hash(cx,cz,3)*(settlementLevel===2?26:12));
      const bias=(biome==='wetlands'||biome==='plains')?12:biome==='dryland'?-14:0;
      const chunk:CoarseChunkState={
        id:`chunk_${cx}_${cz}`,cx,cz,biome,settlementLevel,population,
        food:clamp(42+bias+this.hash(cx,cz,4)*42),
        wood:clamp(35+(biome==='forest'?35:0)+this.hash(cx,cz,5)*34),
        water:clamp(42+(biome==='wetlands'?35:biome==='dryland'?-25:0)+this.hash(cx,cz,6)*38),
        ecology:clamp(48+this.hash(cx,cz,7)*42-settlementLevel*7),
        danger:clamp(10+this.hash(cx,cz,8)*46),
        prosperity:clamp(18+settlementLevel*20+this.hash(cx,cz,9)*30),
        strategy:'sustain',migrationPolicy:'retain',ecologyPolicy:'balance',
        lastDecisionAt:0,decisionVersion:0
      };
      this.chunks.set(chunk.id,chunk);
      this.createTile(chunk);
    }
  }

  private colorForBiome(biome:ChunkBiome) {
    return ({
      plains:0x7ea965, forest:0x47794e, hills:0x87906c, wetlands:0x5f8b79, dryland:0xa48c61
    } as Record<ChunkBiome,number>)[biome];
  }

  private createTile(chunk:CoarseChunkState) {
    const material=new THREE.MeshStandardMaterial({
      color:this.colorForBiome(chunk.biome),roughness:1,metalness:0
    });
    const tile=new THREE.Mesh(new THREE.BoxGeometry(this.chunkSize-.35,.18,this.chunkSize-.35),material);
    tile.position.set(chunk.cx*this.chunkSize,-.18,chunk.cz*this.chunkSize);
    tile.receiveShadow=true;
    tile.userData={coarseChunkId:chunk.id};
    this.root.add(tile);
    this.tiles.set(chunk.id,tile);

    const marker=new THREE.Group();
    marker.position.set(chunk.cx*this.chunkSize,0,chunk.cz*this.chunkSize);
    this.root.add(marker);
    this.markers.set(chunk.id,marker);
    this.refreshMarker(chunk);
  }

  private refreshMarker(chunk:CoarseChunkState) {
    const marker=this.markers.get(chunk.id);if(!marker)return;
    marker.clear();
    if(chunk.settlementLevel>0){
      const mat=new THREE.MeshStandardMaterial({color:0xc9a675,roughness:.92});
      const count=Math.min(5,1+chunk.settlementLevel+Math.floor(chunk.population/12));
      for(let i=0;i<count;i++){
        const w=2.2+this.hash(chunk.cx,chunk.cz,40+i)*1.3;
        const h=1.3+this.hash(chunk.cx,chunk.cz,50+i)*1.5;
        const house=new THREE.Mesh(new THREE.BoxGeometry(w,h,w*.8),mat);
        const angle=(i/count)*Math.PI*2;
        house.position.set(Math.cos(angle)*4,h/2,Math.sin(angle)*4);
        house.castShadow=true;marker.add(house);
      }
    } else {
      const mat=new THREE.MeshStandardMaterial({color:chunk.biome==='forest'?0x315d3c:0x6d8554,roughness:1});
      for(let i=0;i<3;i++){
        const tree=new THREE.Mesh(new THREE.ConeGeometry(.8,2.5,6),mat);
        tree.position.set((this.hash(chunk.cx,chunk.cz,60+i)-.5)*8,1.25,(this.hash(chunk.cx,chunk.cz,70+i)-.5)*8);
        marker.add(tree);
      }
    }
  }

  update(ctx:UpdateContext) {
    this.simulationAccumulator+=ctx.dt;
    if(this.simulationAccumulator>=1){
      const steps=Math.floor(this.simulationAccumulator);
      this.simulationAccumulator-=steps;
      for(const chunk of this.chunks.values())this.simulate(chunk,steps,ctx.weather);
    }
    if(!this.pending&&performance.now()>=this.nextDecisionAt)void this.requestBatch(ctx);
  }

  private simulate(chunk:CoarseChunkState,seconds:number,weather:string) {
    const scale=seconds*.035;
    const biomeFood=chunk.biome==='plains'?1.2:chunk.biome==='wetlands'?1.05:chunk.biome==='dryland' ? .55 : .82;
    const rain=weather==='rain'?1.18:weather==='clear' ? .98 : 1.04;
    chunk.food=clamp(chunk.food+(biomeFood*rain-.7-chunk.population*.006)*scale);
    chunk.water=clamp(chunk.water+((weather==='rain'?1.5:chunk.biome==='wetlands' ? .75 : -.28)-chunk.population*.003)*scale);
    chunk.wood=clamp(chunk.wood+((chunk.biome==='forest'?1.15:.45)-chunk.population*.004)*scale);
    chunk.ecology=clamp(chunk.ecology+(.18-chunk.population*.002)*scale);

    const strategyEffect:Record<ChunkStrategy,()=>void>={
      sustain:()=>{chunk.prosperity=clamp(chunk.prosperity+.05*scale);},
      grow_settlement:()=>{chunk.food=clamp(chunk.food-.7*scale);chunk.wood=clamp(chunk.wood-.55*scale);chunk.prosperity=clamp(chunk.prosperity+.9*scale);},
      conserve:()=>{chunk.food=clamp(chunk.food+.4*scale);chunk.ecology=clamp(chunk.ecology+.7*scale);chunk.prosperity=clamp(chunk.prosperity-.18*scale);},
      extract_resources:()=>{chunk.wood=clamp(chunk.wood+1.15*scale);chunk.ecology=clamp(chunk.ecology-.72*scale);chunk.prosperity=clamp(chunk.prosperity+.65*scale);},
      fortify:()=>{chunk.danger=clamp(chunk.danger-.8*scale);chunk.prosperity=clamp(chunk.prosperity-.25*scale);},
      trade_route:()=>{chunk.prosperity=clamp(chunk.prosperity+1.0*scale);chunk.food=clamp(chunk.food+.22*scale);}
    };
    strategyEffect[chunk.strategy]();

    if(chunk.ecologyPolicy==='recover')chunk.ecology=clamp(chunk.ecology+.9*scale);
    if(chunk.ecologyPolicy==='protect')chunk.ecology=clamp(chunk.ecology+.55*scale);
    if(chunk.ecologyPolicy==='harvest'){chunk.ecology=clamp(chunk.ecology-.5*scale);chunk.food=clamp(chunk.food+.45*scale);}

    const viable=chunk.food>32&&chunk.water>28&&chunk.danger<68;
    if(chunk.migrationPolicy==='attract'&&viable)chunk.population=Math.min(120,chunk.population+.045*scale);
    if(chunk.migrationPolicy==='release')chunk.population=Math.max(0,chunk.population-.035*scale);
    if(chunk.migrationPolicy==='evacuate')chunk.population=Math.max(0,chunk.population-.11*scale);

    if(chunk.strategy==='grow_settlement'&&chunk.population>12&&chunk.prosperity>58&&chunk.settlementLevel<3&&this.hash(chunk.cx,chunk.cz,chunk.decisionVersion+100)>.7){
      chunk.settlementLevel++;
      this.refreshMarker(chunk);
    }
  }

  private pressure(chunk:CoarseChunkState) {
    const scarcity=(100-chunk.food)+(100-chunk.water);
    const instability=chunk.danger+(100-chunk.ecology)*.7;
    const stale=chunk.lastDecisionAt===0?180:Math.min(180,(Date.now()-chunk.lastDecisionAt)/1000);
    return scarcity*.55+instability*.5+stale;
  }

  private async requestBatch(ctx:UpdateContext) {
    this.pending=true;
    const priority=(chunk:CoarseChunkState)=>(chunk.decisionVersion===0?10_000:0)+this.pressure(chunk);
    const chunks=[...this.chunks.values()].sort((a,b)=>priority(b)-priority(a)).slice(0,8);
    const body:ChunkDecisionRequest={day:ctx.day,gameTime:ctx.gameTime,weather:ctx.weather,chunks};
    try{
      const r=await fetch('/api/world/chunks/decide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const result=await r.json() as ChunkDecisionResponse;
      if(!r.ok)throw new Error('chunk decision failed');
      for(const decision of result.decisions){
        const chunk=this.chunks.get(decision.chunkId);if(!chunk)continue;
        chunk.strategy=decision.strategy;
        chunk.migrationPolicy=decision.migrationPolicy;
        chunk.ecologyPolicy=decision.ecologyPolicy;
        chunk.lastDecisionAt=Date.now();
        chunk.decisionVersion++;
      }
      this.lastSource=result.source;
      this.lastBatchSize=result.decisions.length;
    }catch{
      this.lastSource='offline';
      this.lastBatchSize=0;
    }finally{
      this.pending=false;
      this.nextDecisionAt=performance.now()+10_000;
    }
  }

  status():CoarseWorldStatus {
    const list=[...this.chunks.values()];
    const avg=(f:(c:CoarseChunkState)=>number)=>list.reduce((s,c)=>s+f(c),0)/Math.max(1,list.length);
    return {
      chunks:list.length,
      decidedChunks:list.filter(c=>c.decisionVersion>0).length,
      pending:this.pending,
      lastSource:this.lastSource,
      lastBatchSize:this.lastBatchSize,
      avgPopulation:avg(c=>c.population),
      avgEcology:avg(c=>c.ecology),
      avgProsperity:avg(c=>c.prosperity)
    };
  }
}
