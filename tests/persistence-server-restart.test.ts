import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { WorldPersistenceSnapshot } from '../src/types.js';

const inventory={apple:0,bread:1,wood:0,coin:10,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0};

const snapshot=(day:number):WorldPersistenceSnapshot=>({
  version:1,
  meta:{day,minuteOfDay:500,weather:'clear',playerPosition:{x:0,z:7},playerInventory:{...inventory}},
  coarseChunks:[],
  fineChunks:[],
  homeNpcs:[],
  homeObjects:[],
  wildlifeLineage:[],
  wildlifeTransfers:[]
});

async function reservePort(){
  const server=net.createServer();
  await new Promise<void>((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve());
  });
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Failed to reserve test port');
  const port=address.port;
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  return port;
}

async function startServer(port:number,dbPath:string){
  const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(port),WORLD_DB_PATH:dbPath,JEV_PROVIDER:'fallback',NODE_ENV:'test'},
    stdio:['ignore','pipe','pipe']
  });
  let output='';
  child.stdout.on('data',chunk=>{output+=String(chunk);});
  child.stderr.on('data',chunk=>{output+=String(chunk);});
  const base=`http://127.0.0.1:${port}`;
  const deadline=Date.now()+12_000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error(`server exited before readiness: ${output}`);
    try{
      const response=await fetch(`${base}/api/health`);
      if(response.ok)return {child,base,output:()=>output};
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  child.kill('SIGKILL');
  throw new Error(`server readiness timed out: ${output}`);
}

async function stopServer(child:ChildProcessWithoutNullStreams){
  if(child.exitCode!==null)return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>(resolve=>child.once('exit',()=>resolve())),
    new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('server shutdown timed out')),5_000))
  ]).catch(error=>{
    child.kill('SIGKILL');
    throw error;
  });
}

test('world revision and snapshot survive an actual server-process restart',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'latticefolk-server-restart-'));
  const dbPath=path.join(dir,'world.sqlite');
  const port=await reservePort();
  let first:Awaited<ReturnType<typeof startServer>>|undefined;
  let second:Awaited<ReturnType<typeof startServer>>|undefined;
  try{
    first=await startServer(port,dbPath);
    const before=await fetch(`${first.base}/api/world/state`);
    assert.equal(before.status,200);
    const beforeBody=await before.json() as {revision:number;snapshot:WorldPersistenceSnapshot|null};
    assert.equal(beforeBody.revision,0);
    assert.equal(beforeBody.snapshot,null);

    const saved=await fetch(`${first.base}/api/world/state`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({snapshot:snapshot(7),expectedRevision:0})
    });
    assert.equal(saved.status,200);
    assert.equal((await saved.json() as {revision:number}).revision,1);
    await stopServer(first.child);
    first=undefined;

    second=await startServer(port,dbPath);
    const restored=await fetch(`${second.base}/api/world/state`);
    assert.equal(restored.status,200);
    const restoredBody=await restored.json() as {revision:number;snapshot:WorldPersistenceSnapshot|null};
    assert.equal(restoredBody.revision,1);
    assert.equal(restoredBody.snapshot?.meta.day,7);

    const stale=await fetch(`${second.base}/api/world/state`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({snapshot:snapshot(1),expectedRevision:0})
    });
    assert.equal(stale.status,409);
    const conflict=await stale.json() as {expectedRevision:number;currentRevision:number};
    assert.deepEqual(conflict,{expectedRevision:0,currentRevision:1});

    const afterConflict=await fetch(`${second.base}/api/world/state`);
    const afterBody=await afterConflict.json() as {revision:number;snapshot:WorldPersistenceSnapshot|null};
    assert.equal(afterBody.revision,1);
    assert.equal(afterBody.snapshot?.meta.day,7);
  }finally{
    if(first)await stopServer(first.child).catch(()=>{});
    if(second)await stopServer(second.child).catch(()=>{});
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
