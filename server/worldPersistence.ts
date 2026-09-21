import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CoarseChunkState, PersistedFineChunk, WorldPersistenceMeta, WorldPersistenceSnapshot,
  NpcState, WorldObjectState
} from '../src/types.js';

type Row = Record<string, unknown>;

const parse = <T>(value: unknown, fallback:T):T => {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

export class WorldPersistence {
  private db: Database.Database;

  constructor(private readonly file:string) {
    fs.mkdirSync(path.dirname(file), { recursive:true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS world_meta (
        slot TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        meta_json TEXT NOT NULL,
        saved_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS coarse_chunks (
        id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fine_chunks (
        chunk_id TEXT PRIMARY KEY,
        npc_json TEXT NOT NULL,
        object_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS home_state (
        slot TEXT PRIMARY KEY,
        npc_json TEXT NOT NULL,
        object_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  save(snapshot:WorldPersistenceSnapshot) {
    const savedAt = Date.now();
    const upsertMeta=this.db.prepare(`
      INSERT INTO world_meta(slot,version,meta_json,saved_at) VALUES('default',?,?,?)
      ON CONFLICT(slot) DO UPDATE SET version=excluded.version,meta_json=excluded.meta_json,saved_at=excluded.saved_at
    `);
    const upsertChunk=this.db.prepare(`
      INSERT INTO coarse_chunks(id,state_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at
    `);
    const upsertFine=this.db.prepare(`
      INSERT INTO fine_chunks(chunk_id,npc_json,object_json,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(chunk_id) DO UPDATE SET npc_json=excluded.npc_json,object_json=excluded.object_json,updated_at=excluded.updated_at
    `);
    const upsertHome=this.db.prepare(`
      INSERT INTO home_state(slot,npc_json,object_json,updated_at) VALUES('default',?,?,?)
      ON CONFLICT(slot) DO UPDATE SET npc_json=excluded.npc_json,object_json=excluded.object_json,updated_at=excluded.updated_at
    `);
    const deleteChunk=this.db.prepare('DELETE FROM coarse_chunks WHERE id = ?');
    const deleteFine=this.db.prepare('DELETE FROM fine_chunks WHERE chunk_id = ?');

    const tx=this.db.transaction((data:WorldPersistenceSnapshot)=>{
      upsertMeta.run(data.version,JSON.stringify(data.meta),savedAt);

      const chunkIds=new Set(data.coarseChunks.map(x=>x.id));
      const existingChunks=this.db.prepare('SELECT id FROM coarse_chunks').all() as Array<{id:string}>;
      for(const row of existingChunks) if(!chunkIds.has(row.id)) deleteChunk.run(row.id);
      for(const chunk of data.coarseChunks) upsertChunk.run(chunk.id,JSON.stringify(chunk),savedAt);

      const fineIds=new Set(data.fineChunks.map(x=>x.chunkId));
      const existingFine=this.db.prepare('SELECT chunk_id FROM fine_chunks').all() as Array<{chunk_id:string}>;
      for(const row of existingFine) if(!fineIds.has(row.chunk_id)) deleteFine.run(row.chunk_id);
      for(const chunk of data.fineChunks){
        upsertFine.run(chunk.chunkId,JSON.stringify(chunk.npcStates),JSON.stringify(chunk.objectStates),savedAt);
      }

      upsertHome.run(JSON.stringify(data.homeNpcs),JSON.stringify(data.homeObjects),savedAt);
    });

    tx(snapshot);
    return { ok:true, savedAt };
  }

  load():WorldPersistenceSnapshot|null {
    const metaRow=this.db.prepare('SELECT version,meta_json,saved_at FROM world_meta WHERE slot = ?').get('default') as Row|undefined;
    if(!metaRow)return null;

    const coarseRows=this.db.prepare('SELECT state_json FROM coarse_chunks ORDER BY id').all() as Array<{state_json:string}>;
    const fineRows=this.db.prepare('SELECT chunk_id,npc_json,object_json FROM fine_chunks ORDER BY chunk_id').all() as Array<{chunk_id:string;npc_json:string;object_json:string}>;
    const homeRow=this.db.prepare('SELECT npc_json,object_json FROM home_state WHERE slot = ?').get('default') as {npc_json:string;object_json:string}|undefined;

    const coarseChunks=coarseRows.map(row=>parse<CoarseChunkState|null>(row.state_json,null)).filter((x):x is CoarseChunkState=>Boolean(x));
    const fineChunks:PersistedFineChunk[]=fineRows.map(row=>({
      chunkId:row.chunk_id,
      npcStates:parse<NpcState[]>(row.npc_json,[]),
      objectStates:parse<WorldObjectState[]>(row.object_json,[])
    }));

    return {
      version:Number(metaRow.version)===1?1:1,
      meta:parse<WorldPersistenceMeta>(metaRow.meta_json,{
        day:1,minuteOfDay:8*60+15,weather:'clear',playerPosition:{x:0,z:7},
        playerInventory:{apple:0,bread:1,wood:0,coin:10,flower:0,grain:0,flour:0,water:0,stone:0,plank:0,tool:0}
      }),
      coarseChunks,
      fineChunks,
      homeNpcs:homeRow?parse<NpcState[]>(homeRow.npc_json,[]):[],
      homeObjects:homeRow?parse<WorldObjectState[]>(homeRow.object_json,[]):[],
      savedAt:Number(metaRow.saved_at)||undefined
    };
  }

  stats() {
    const saved=this.db.prepare('SELECT saved_at FROM world_meta WHERE slot = ?').get('default') as {saved_at:number}|undefined;
    const coarse=(this.db.prepare('SELECT COUNT(*) AS n FROM coarse_chunks').get() as {n:number}).n;
    const fine=(this.db.prepare('SELECT COUNT(*) AS n FROM fine_chunks').get() as {n:number}).n;
    return { configured:true,file:path.basename(this.file),hasSave:Boolean(saved),savedAt:saved?.saved_at||null,coarseChunks:coarse,fineChunks:fine };
  }

  clear() {
    const tx=this.db.transaction(()=>{
      this.db.prepare('DELETE FROM world_meta').run();
      this.db.prepare('DELETE FROM coarse_chunks').run();
      this.db.prepare('DELETE FROM fine_chunks').run();
      this.db.prepare('DELETE FROM home_state').run();
    });
    tx();
    return {ok:true};
  }

  close(){ this.db.close(); }
}
