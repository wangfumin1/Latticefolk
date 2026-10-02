/** Uses only the same keyboard and PointerLockControls mouse listeners as a player.
 * Keep this function self-contained: Playwright serializes it into the page.
 */
export async function traverseNativeParcelRoute({key,targetX,laneZ}: {
  key:'KeyA'|'KeyD';targetX:number;laneZ:number;
}) {
  const canvas=document.querySelector('#game canvas');
  if(!canvas||document.pointerLockElement!==canvas)throw new Error('Parcel route requires the locked game canvas');
  const direction=key==='KeyA'?-1:1;
  // updatePlayer uses 4.5 m/s and caps dt at .05; yaw makes the Z component
  // no larger than the remaining error, including on faster variable-dt frames.
  const maximumStep=4.5*.05;
  const deadline=performance.now()+90_000;
  let yaw=0,held=false,detours=0,unchanged=0;
  let phase:'cross'|'offset'|'bypass'|'restore'='cross';
  let bypassX=0;
  const read=()=>{
    const d=document.querySelector<HTMLElement>('#worldStatus')?.dataset;
    const p={x:Number(d?.playerX??'NaN'),z:Number(d?.playerZ??'NaN')};
    if(!Number.isFinite(p.x)||!Number.isFinite(p.z))throw new Error('Parcel route position is unavailable');
    return p;
  };
  const rotate=(next:number)=>{
    const event=new MouseEvent('mousemove',{bubbles:true});
    Object.defineProperties(event,{movementX:{value:(next-yaw)/.002},movementY:{value:0}});
    canvas.dispatchEvent(event);yaw=next;
  };
  const release=()=>{
    if(held)window.dispatchEvent(new KeyboardEvent('keyup',{code:key,bubbles:true}));
    held=false;
  };
  const history:Array<{phase:string;x:number;z:number;elapsedMs:number}>=[];
  const record=(p:{x:number;z:number})=>{
    history.push({phase,...p,elapsedMs:performance.now()-(deadline-90_000)});
    if(history.length>20)history.shift();
  };
  const failure=(reason:string,p:{x:number;z:number})=>{
    const animals=JSON.parse(document.querySelector<HTMLElement>('#worldStatus')?.dataset.wildlifeVisuals??'[]') as
      Array<{id:string;position:{x:number;z:number}}>;
    const nearbyWildlife=animals.filter(a=>Math.hypot(a.position.x-p.x,a.position.z-p.z)<3)
      .map(a=>({id:a.id,position:a.position}));
    return new Error(`${reason}: ${JSON.stringify({phase,position:p,nearbyWildlife,history})}`);
  };
  let previous=read();record(previous);
  try {
    window.dispatchEvent(new KeyboardEvent('keydown',{code:key,bubbles:true}));held=true;
    while(performance.now()<deadline){
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      if(document.pointerLockElement!==canvas)throw new Error('Parcel route lost pointer lock');
      const p=read();
      unchanged=Math.hypot(p.x-previous.x,p.z-previous.z)<.0001?unchanged+1:0;
      previous=p;
      if(phase==='offset'&&Math.abs(p.z-(laneZ-.9))<.005){phase='bypass';unchanged=0;record(p);}
      if(phase==='bypass'&&direction*(p.x-bypassX)>=0){phase='restore';unchanged=0;record(p);}
      if(phase==='restore'&&Math.abs(p.z-laneZ)<.005){phase='cross';unchanged=0;record(p);}
      if(phase==='cross'&&direction*(p.x-targetX)>=0&&Math.abs(p.z-laneZ)<.005){
        record(p);return {position:p,detours,history};
      }
      if(unchanged>=4){
        // These are consecutive rendered-position samples, not repeated reads of
        // the 15-second persistence snapshot. Never wait through a pinned body.
        if(phase!=='cross'||detours!==0)throw failure('Parcel route remains blocked',p);
        detours++;bypassX=p.x+direction*1.8;phase='offset';unchanged=0;record(p);
      }
      const zTarget=phase==='offset'?laneZ-.9:laneZ;
      const zComponent=phase==='offset'||phase==='restore'
        ?Math.max(-1,Math.min(1,(zTarget-p.z)/maximumStep)):0;
      rotate(Math.asin(direction*zComponent));
    }
    throw failure('Parcel route exceeded its bounded input budget',read());
  } finally {
    // Release in the same page turn, rather than overshooting during a CDP reply.
    release();rotate(0);
  }
}
