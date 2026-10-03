/** Self-contained because Playwright serializes this function into Chromium.
 * Only ordinary keyboard listeners are driven; positions and calibrated NPC head
 * envelopes are read from the existing diagnostic DOM, never written. */
export async function driveNativeWaypoint({target,timeoutMs,tolerance}: {
  target:{x:number;z:number};timeoutMs:number;tolerance:number;
}) {
  type Point={x:number;z:number};
  type Bounds={minX:number;maxX:number;minZ:number;maxZ:number};
  const canvas=document.querySelector('#game canvas');
  if(!canvas||document.pointerLockElement!==canvas)throw new Error('Waypoint requires the locked game canvas');
  const read=()=>{
    const data=document.querySelector<HTMLElement>('#worldStatus')?.dataset;
    return {x:Number(data?.playerX??'NaN'),z:Number(data?.playerZ??'NaN')};
  };
  type Actor={position:Point;headYaw:number;headEnvelope:Bounds};
  const actors=()=>JSON.parse(document.querySelector<HTMLElement>('#worldStatus')?.dataset.characterSoles??'[]') as Actor[];
  const clearance=(p:Point,a:Actor)=>{
    const e=a.headEnvelope,c=Math.cos(a.headYaw),s=Math.sin(a.headYaw);
    const dx=p.x-a.position.x,dz=p.z-a.position.z;
    const x=c*dx-s*dz,z=s*dx+c*dz;
    const qx=Math.abs(x-(e.minX+e.maxX)/2)-(e.maxX-e.minX)/2;
    const qz=Math.abs(z-(e.minZ+e.maxZ)/2)-(e.maxZ-e.minZ)/2;
    return Math.min(Math.hypot(dx,dz)-.62,
      Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-.30);
  };
  const route=(start:Point):Point[]=>{
    const obstacles=actors();
    if(!obstacles.some(a=>Math.hypot(a.position.x-start.x,a.position.z-start.z)<3))return [];
    // Plan only input waypoints around observed collision envelopes. No world state is written.
    const step=.5,padding=3;
    const minX=Math.floor(Math.min(0,target.x-start.x)/step)-padding/step;
    const maxX=Math.ceil(Math.max(0,target.x-start.x)/step)+padding/step;
    const minZ=Math.floor(Math.min(0,target.z-start.z)/step)-padding/step;
    const maxZ=Math.ceil(Math.max(0,target.z-start.z)/step)+padding/step;
    const point=(x:number,z:number)=>({x:start.x+x*step,z:start.z+z*step});
    const edgeClear=(from:Point,to:Point,margin=.16)=>obstacles.every(a=>{
      const initial=clearance(from,a);
      for(let t=.1;t<=1.001;t+=.1){
        const d=clearance({x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t},a);
        // Escape a close starting edge, then keep a small walking margin.
        if(d<Math.min(initial,margin)-1e-8||d<0)return false;
      }
      return true;
    });
    type Node={x:number;z:number;g:number;f:number;parent?:Node};
    const first:Node={x:0,z:0,g:0,f:0},open=[first],best=new Map<string,number>([['0,0',0]]);
    let visited=0;
    while(open.length&&visited++<6000){
      open.sort((a,b)=>a.f-b.f);const n=open.shift()!;const p=point(n.x,n.z);
      const corner={x:target.x,z:p.z};
      const terminal=Math.hypot(p.x-target.x,p.z-target.z)<=step&&
        edgeClear(p,corner,0)&&edgeClear(corner,target,0);
      if(Math.hypot(p.x-target.x,p.z-target.z)<=tolerance||terminal){
        const nodes:Point[]=[];let current:Node|undefined=n;
        while(current?.parent){nodes.push(point(current.x,current.z));current=current.parent;}
        nodes.reverse();
        // Connect the exact goal, so the .5 lattice never quantizes away a legal
        // .28-tolerance target. Both axis-aligned terminal legs are checked.
        if(terminal)nodes.push(corner,target);
        // Preserve turns but coalesce consecutive collinear cells.
        return nodes.filter((v,i)=>i===nodes.length-1||i===0||
          (v.x-nodes[i-1].x)!==(nodes[i+1].x-v.x)||(v.z-nodes[i-1].z)!==(nodes[i+1].z-v.z));
      }
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=n.x+dx,z=n.z+dz,key=`${x},${z}`,g=n.g+step;
        if(x<minX||x>maxX||z<minZ||z>maxZ||(best.get(key)??Infinity)<=g)continue;
        const q=point(x,z);if(!edgeClear(p,q))continue;
        best.set(key,g);open.push({x,z,g,f:g+Math.abs(target.x-q.x)+Math.abs(target.z-q.z),parent:n});
      }
    }
    return [];
  };
  const held=new Set<string>();
  const setHeld=(next:Set<string>)=>{
    for(const code of [...held])if(!next.has(code)){
      window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));held.delete(code);
    }
    for(const code of next)if(!held.has(code)){
      window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));held.add(code);
    }
  };
  const begin=performance.now(),deadline=begin+timeoutMs;
  const maximumStep=7.2*.05; // Existing sprint speed and production dt cap.
  let last=read(),unchanged=0,detours=0;
  let waypoints:Point[]=[];
  let plannerBlocked=false,avoidSign=1;
  let fallback:{origin:Point;code:string}|undefined;
  // Preserve the old generic perpendicular escape for unknown static props.
  // Its normal-speed 850ms reach is now measured in world distance, so a slow
  // software-rendered frame cannot consume the entire escape without movement.
  const fallbackDistance=4.5*.85;
  const beginFallback=(p:Point)=>{
    avoidSign*=-1;
    const code=Math.abs(target.x-p.x)>=Math.abs(target.z-p.z)
      ?(avoidSign>0?'KeyW':'KeyS'):(avoidSign>0?'KeyD':'KeyA');
    fallback={origin:p,code};waypoints=[];unchanged=0;
  };
  const history:Array<{phase:string;x:number;z:number;elapsedMs:number}>=[];
  const record=(p:Point,phase:string)=>{
    history.push({phase,...p,elapsedMs:performance.now()-begin});
    if(history.length>24)history.shift();
  };
  const axisKey=(axis:'x'|'z',delta:number)=>axis==='x'?(delta>0?'KeyD':'KeyA'):(delta>0?'KeyS':'KeyW');
  try {
    while(performance.now()<deadline){
      if(document.pointerLockElement!==canvas)throw new Error('Waypoint lost pointer lock');
      const p=read();
      if(!Number.isFinite(p.x)||!Number.isFinite(p.z))throw new Error('Waypoint position is unavailable');
      if(Math.hypot(p.x-last.x,p.z-last.z)>.035){last=p;unchanged=0;}else unchanged++;
      const distance=Math.hypot(target.x-p.x,target.z-p.z);
      if(distance<=tolerance){record(p,'reached');return {reached:true,...p,distance,detours,history};}
      if(unchanged>=4){
        if(waypoints.length){
          const x=Number(held.has('KeyD'))-Number(held.has('KeyA'));
          const z=Number(held.has('KeyS'))-Number(held.has('KeyW'));
          const next={x:p.x+x*maximumStep,z:p.z+z*maximumStep};
          // A stalled planned edge clear of observed NPCs is an unmodeled prop.
          // Do not repeat the same NPC-only plan into it; retain generic recovery.
          if(actors().every(a=>clearance(next,a)>=0))plannerBlocked=true;
        }
        waypoints=!plannerBlocked&&detours<3?route(p):[];
        unchanged=0;detours++;record(p,`route:${waypoints.length}`);
        if(!waypoints.length)beginFallback(p);else fallback=undefined;
      }
      if(fallback&&Math.hypot(p.x-fallback.origin.x,p.z-fallback.origin.z)>=fallbackDistance){
        fallback=undefined;unchanged=0;record(p,'fallback-complete');
      }
      while(waypoints.length&&Math.hypot(waypoints[0].x-p.x,waypoints[0].z-p.z)<.19){
        waypoints.shift();record(p,'waypoint');
      }
      const aim=waypoints[0]??target,dx=aim.x-p.x,dz=aim.z-p.z;
      const next=new Set<string>();
      if(fallback){
        next.add(fallback.code);
      }else if(waypoints.length){
        const axis=Math.abs(dx)>Math.abs(dz)?'x':'z',delta=axis==='x'?dx:dz;
        if(Math.abs(delta)>maximumStep)next.add('ShiftLeft');
        next.add(axisKey(axis,delta));
      }else{
        if(distance>1.8)next.add('ShiftLeft');
        if(Math.abs(dx)>tolerance*.6)next.add(axisKey('x',dx));
        if(Math.abs(dz)>tolerance*.6)next.add(axisKey('z',dz));
      }
      setHeld(next);
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
    const p=read(),distance=Math.hypot(target.x-p.x,target.z-p.z);record(p,'deadline');
    return {reached:distance<=tolerance,...p,distance,detours,history};
  }finally {setHeld(new Set());}
}
