import * as THREE from 'three';
import type {
  ChunkBiome, ChunkDecisionRequest, ChunkDecisionResponse, ChunkStrategy,
  ChunkMigrationPolicy, ChunkEcologyPolicy, CoarseChunkState,
  RegionState, RegionDecision, RegionDecisionRequest, RegionDecisionResponse,
  WorldDecision, WorldDecisionRequest, WorldDecisionResponse, WorldStrategicSummary
} from '../types';
import { applyConservedFlows, planConservedFlows, type WorldFlowRecord } from './flows';

const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,v));

export interface CoarseWorldStatus {
  chunks: number;
  decidedChunks: number;
  pending: boolean;
  lastSource: string;
  lastBatchSize: number;
  materializedChunks: number;
  recentFlowCount: number;
  lastFlowSummary: string;
  regionDecisions: number;
  worldPriority: string;
  worldConnectivity: string;
  worldGrowth: string;
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
  readonly materialized = new Set<string>();

  private root = new THREE.Group();
  private tiles = new Map<string,THREE.Mesh>();
  private markers = new Map<string,THREE.Group>();
  private pending=false;
  private lastSource='seeded';
  private lastBatchSize=0;
  private nextDecisionAt=performance.now()+3500;
  private simulationAccumulator=0;
  private flowAccumulator=0;
  private recentFlowLog:WorldFlowRecord[]=[];
  private regionPolicies = new Map<string,RegionDecision>();
  private worldPolicy:WorldDecision={
    priority:'resilience',connectivity:'balanced_networks',growth:'steady',
    confidence:.4,reasonCode:'world_initial',source:'seeded'
  };
  private nextRegionDecisionAt=performance.now()+9000;
  private nextWorldDecisionAt=performance.now()+18000;
  private regionPending=false;
  private worldPending=false;

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
      for(const chunk of this.chunks.values())if(!this.materialized.has(chunk.id))this.simulate(chunk,steps,ctx.weather);
    }
    this.flowAccumulator+=ctx.dt;
    if(this.flowAccumulator>=5){
      this.flowAccumulator%=5;
      this.runConservedFlows(ctx);
    }
    const tick=performance.now();
    if(!this.pending&&tick>=this.nextDecisionAt)void this.requestBatch(ctx);
    if(!this.regionPending&&tick>=this.nextRegionDecisionAt)void this.requestRegions(ctx);
    if(!this.worldPending&&tick>=this.nextWorldDecisionAt)void this.requestWorld(ctx);
  }

  private simulate(chunk:CoarseChunkState,seconds:number,weather:string) {
    const scale=seconds*.035;
    const biomeFood=chunk.biome==='plains'?1.2:chunk.biome==='wetlands'?1.05:chunk.biome==='dryland' ? .55 : .82;
    const rain=weather==='rain'?1.18:weather==='clear' ? .98 : 1.04;
    chunk.food=clamp(chunk.food+(biomeFood*rain-.7-chunk.population*.006)*scale);
    chunk.water=clamp(chunk.water+((weather==='rain'?1.5:chunk.biome==='wetlands' ? .75 : -.28)-chunk.population*.003)*scale);
    chunk.wood=clamp(chunk.wood+((chunk.biome==='forest'?1.15:.45)-chunk.population*.004)*scale);
    chunk.ecology=clamp(chunk.ecology+(.18-chunk.population*.002)*scale);

    const region=this.regionPolicies.get(this.regionId(chunk.cx,chunk.cz));
    const world=this.worldPolicy;
    if(region?.priority==='food_security')chunk.food=clamp(chunk.food+.12*scale);
    if(region?.priority==='ecology_recovery')chunk.ecology=clamp(chunk.ecology+.12*scale);
    if(region?.priority==='security_coordination')chunk.danger=clamp(chunk.danger-.10*scale);
    if(world.priority==='ecology')chunk.ecology=clamp(chunk.ecology+.07*scale);
    if(world.priority==='security')chunk.danger=clamp(chunk.danger-.06*scale);

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

    const growthThreshold=world.growth==='frontier' ? .60 : world.growth==='compact' ? .78 : world.growth==='conserve' ? .9 : .7;
    if(chunk.strategy==='grow_settlement'&&chunk.population>12&&chunk.prosperity>58&&chunk.settlementLevel<3&&this.hash(chunk.cx,chunk.cz,chunk.decisionVersion+100)>growthThreshold){
      chunk.settlementLevel++;
      this.refreshMarker(chunk);
    }
  }

  private runConservedFlows(ctx:UpdateContext) {
    const planned=planConservedFlows(this.chunks.values(),{
      day:ctx.day,
      minuteOfDay:this.parseGameTime(ctx.gameTime),
      materialized:this.materialized
    });
    const adjusted=planned.map(flow=>{
      const source=this.chunks.get(flow.fromChunkId);
      const target=this.chunks.get(flow.toChunkId);
      const sourceRegion=source?this.regionPolicies.get(this.regionId(source.cx,source.cz)):undefined;
      const targetRegion=target?this.regionPolicies.get(this.regionId(target.cx,target.cz)):undefined;
      let factor=1;
      if(flow.kind.endsWith('_trade')&&this.worldPolicy.connectivity==='trade_corridors')factor*=1.18;
      if(flow.kind==='migration'&&this.worldPolicy.connectivity==='migration_corridors')factor*=1.18;
      if(flow.kind==='ecology_spread'&&this.worldPolicy.priority==='ecology')factor*=1.2;
      if(sourceRegion?.priority==='trade_network'&&flow.kind.endsWith('_trade'))factor*=1.12;
      if(targetRegion?.priority==='food_security'&&flow.kind==='food_trade')factor*=1.12;
      if(targetRegion?.priority==='ecology_recovery'&&flow.kind==='ecology_spread')factor*=1.15;
      if(sourceRegion?.movementPolicy==='restrict'&&flow.kind==='migration')factor*=.55;
      if(targetRegion?.movementPolicy==='open'&&flow.kind==='migration')factor*=1.08;
      return {...flow,amount:flow.amount*factor};
    });
    const applied=applyConservedFlows(this.chunks,adjusted);
    if(applied.length){
      this.recentFlowLog.push(...applied);
      if(this.recentFlowLog.length>120)this.recentFlowLog.splice(0,this.recentFlowLog.length-120);
    }
  }

  private parseGameTime(value:string) {
    const [h,m]=value.split(':').map(Number);
    return (Number.isFinite(h)?h:0)*60+(Number.isFinite(m)?m:0);
  }

  flowHistory(limit=20) {
    return this.recentFlowLog.slice(-Math.max(0,limit));
  }

  private regionId(cx:number,cz:number) {
    const rx=Math.floor((cx+this.radius)/3);
    const rz=Math.floor((cz+this.radius)/3);
    return `region_${rx}_${rz}`;
  }

  private aggregateRegions():RegionState[] {
    const groups=new Map<string,CoarseChunkState[]>();
    for(const chunk of this.chunks.values()){
      const id=this.regionId(chunk.cx,chunk.cz);
      const list=groups.get(id)||[];
      list.push(chunk);groups.set(id,list);
    }
    const avg=(list:CoarseChunkState[],pick:(c:CoarseChunkState)=>number)=>list.reduce((s,c)=>s+pick(c),0)/Math.max(1,list.length);
    return [...groups.entries()].map(([id,list])=>{
      const [rx,rz]=id.replace('region_','').split('_').map(Number);
      return {
        id,rx,rz,chunkIds:list.map(c=>c.id),
        population:list.reduce((s,c)=>s+c.population,0),
        settlements:list.reduce((s,c)=>s+(c.settlementLevel>0?1:0),0),
        food:avg(list,c=>c.food),wood:avg(list,c=>c.wood),water:avg(list,c=>c.water),
        ecology:avg(list,c=>c.ecology),danger:avg(list,c=>c.danger),prosperity:avg(list,c=>c.prosperity)
      };
    });
  }

  private worldSummary(regions:RegionState[]):WorldStrategicSummary {
    const chunks=[...this.chunks.values()];
    const avg=(pick:(c:CoarseChunkState)=>number)=>chunks.reduce((s,c)=>s+pick(c),0)/Math.max(1,chunks.length);
    return {
      population:chunks.reduce((s,c)=>s+c.population,0),
      settlements:chunks.reduce((s,c)=>s+(c.settlementLevel>0?1:0),0),
      food:avg(c=>c.food),wood:avg(c=>c.wood),water:avg(c=>c.water),ecology:avg(c=>c.ecology),
      danger:avg(c=>c.danger),prosperity:avg(c=>c.prosperity),activeRegions:regions.length
    };
  }

  private async requestRegions(ctx:UpdateContext) {
    this.regionPending=true;
    const regions=this.aggregateRegions().slice(0,8);
    const body:RegionDecisionRequest={day:ctx.day,gameTime:ctx.gameTime,weather:ctx.weather,regions};
    try{
      const response=await fetch('/api/world/regions/decide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json() as RegionDecisionResponse;
      if(!response.ok)throw new Error('region decision failed');
      for(const decision of result.decisions)this.regionPolicies.set(decision.regionId,decision);
    }catch{
      // Existing regional policies remain authoritative until the next successful refresh.
    }finally{
      this.regionPending=false;
      this.nextRegionDecisionAt=performance.now()+45_000;
    }
  }

  private async requestWorld(ctx:UpdateContext) {
    this.worldPending=true;
    const regions=this.aggregateRegions();
    const regionDecisions=regions.map(region=>this.regionPolicies.get(region.id)).filter((x):x is RegionDecision=>Boolean(x));
    const body:WorldDecisionRequest={
      day:ctx.day,gameTime:ctx.gameTime,weather:ctx.weather,
      summary:this.worldSummary(regions),regions:regionDecisions
    };
    try{
      const response=await fetch('/api/world/strategy/decide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json() as WorldDecisionResponse;
      if(!response.ok)throw new Error('world decision failed');
      this.worldPolicy=result.decision;
    }catch{
      // Keep the previous bounded world policy if the provider is temporarily unavailable.
    }finally{
      this.worldPending=false;
      this.nextWorldDecisionAt=performance.now()+120_000;
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
    const chunks=[...this.chunks.values()].filter(chunk=>!this.materialized.has(chunk.id)).sort((a,b)=>priority(b)-priority(a)).slice(0,8);
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

  get worldHalf() { return (this.radius + .5) * this.chunkSize; }

  chunkAtWorld(x:number,z:number) {
    const cx=Math.floor((x+this.chunkSize/2)/this.chunkSize);
    const cz=Math.floor((z+this.chunkSize/2)/this.chunkSize);
    return this.chunks.get(`chunk_${cx}_${cz}`);
  }

  setMaterialized(chunkId:string,value:boolean) {
    const chunk=this.chunks.get(chunkId);
    if(!chunk)return;
    if(value)this.materialized.add(chunkId);else this.materialized.delete(chunkId);
    const marker=this.markers.get(chunkId);
    if(marker)marker.visible=!value;
  }

  applyFineSummary(chunkId:string,patch:Partial<Pick<CoarseChunkState,'food'|'wood'|'water'|'ecology'|'danger'|'prosperity'>>) {
    const chunk=this.chunks.get(chunkId);
    if(!chunk)return;
    for(const key of ['food','wood','water','ecology','danger','prosperity'] as const){
      const value=patch[key];
      if(typeof value==='number')chunk[key]=clamp(value);
    }
  }

  private describeFlow(flow:WorldFlowRecord) {
    const label=flow.kind==='migration'?'migration':flow.kind.replace('_trade','').replace('_spread','');
    return `${label} ${flow.fromChunkId} → ${flow.toChunkId} ${flow.amount.toFixed(2)}`;
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
      materializedChunks:this.materialized.size,
      recentFlowCount:this.recentFlowLog.length,
      lastFlowSummary:this.recentFlowLog.length?this.describeFlow(this.recentFlowLog[this.recentFlowLog.length-1]!):'—',
      regionDecisions:this.regionPolicies.size,
      worldPriority:this.worldPolicy.priority,
      worldConnectivity:this.worldPolicy.connectivity,
      worldGrowth:this.worldPolicy.growth,
      avgPopulation:avg(c=>c.population),
      avgEcology:avg(c=>c.ecology),
      avgProsperity:avg(c=>c.prosperity)
    };
  }
}
