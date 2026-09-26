import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CoarseChunkState, PersistedFineChunk, PersistedWildlifeTransfer, WorldPersistenceMeta, WorldPersistenceSnapshot,
  NpcState, WildlifeDomesticationState, WildlifeHabitatExposure, WildlifeHabitatSnapshot, WildlifeLineageRecord, WildlifeMigrationEvent, WildlifeOrganismGenome, WildlifePhenotype, WildlifeState, WildlifeTraits, WorldObjectState
} from '../src/types.js';
import { computeEvolutionStatistics, computeWildlifeCoevolutionEvidence, computeWildlifeInteractionSelectionEvidence } from '../src/world/evolution.js';
import { computeWildlifeInteractionNetwork } from '../src/world/interactionNetwork.js';

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
        wildlife_json TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS home_state (
        slot TEXT PRIMARY KEY,
        npc_json TEXT NOT NULL,
        object_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS wildlife_lineage (
        entity_id TEXT PRIMARY KEY,
        species TEXT NOT NULL,
        mother_id TEXT,
        father_id TEXT,
        birth_day REAL NOT NULL,
        death_day REAL,
        death_reason TEXT,
        generation INTEGER NOT NULL,
        birth_chunk TEXT NOT NULL,
        death_chunk TEXT,
        traits_at_birth_json TEXT NOT NULL,
        traits_at_death_json TEXT,
        phenotype_at_birth_json TEXT,
        phenotype_at_death_json TEXT,
        phenotype_provenance TEXT,
        organism_genome_at_birth_json TEXT,
        organism_genome_at_death_json TEXT,
        organism_genome_provenance TEXT,
        domestication_at_birth_json TEXT,
        domestication_at_death_json TEXT,
        birth_habitat_json TEXT,
        death_habitat_json TEXT,
        habitat_exposure_json TEXT,
        migration_history_json TEXT,
        predation_outcomes_json TEXT,
        origin TEXT NOT NULL DEFAULT 'founder',
        offspring_count INTEGER NOT NULL DEFAULT 0,
        reproductive_success INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_wildlife_lineage_species_generation ON wildlife_lineage(species,generation);
      CREATE INDEX IF NOT EXISTS idx_wildlife_lineage_mother ON wildlife_lineage(mother_id);
      CREATE INDEX IF NOT EXISTS idx_wildlife_lineage_father ON wildlife_lineage(father_id);

      CREATE TABLE IF NOT EXISTS wildlife_transfers (
        entity_id TEXT PRIMARY KEY,
        transfer_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    const fineColumns=this.db.prepare("PRAGMA table_info(fine_chunks)").all() as Array<{name:string}>;
    if(!fineColumns.some(column=>column.name==='wildlife_json')){
      this.db.exec("ALTER TABLE fine_chunks ADD COLUMN wildlife_json TEXT NOT NULL DEFAULT '[]'");
    }
    const lineageColumns=this.db.prepare("PRAGMA table_info(wildlife_lineage)").all() as Array<{name:string}>;
    if(!lineageColumns.some(column=>column.name==='origin')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN origin TEXT NOT NULL DEFAULT 'founder'");
    }
    if(!lineageColumns.some(column=>column.name==='phenotype_at_birth_json')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN phenotype_at_birth_json TEXT");
    }
    if(!lineageColumns.some(column=>column.name==='phenotype_at_death_json')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN phenotype_at_death_json TEXT");
    }
    if(!lineageColumns.some(column=>column.name==='phenotype_provenance')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN phenotype_provenance TEXT");
    }
    if(!lineageColumns.some(column=>column.name==='organism_genome_at_birth_json')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN organism_genome_at_birth_json TEXT");
    }
    if(!lineageColumns.some(column=>column.name==='organism_genome_at_death_json')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN organism_genome_at_death_json TEXT");
    }
    if(!lineageColumns.some(column=>column.name==='organism_genome_provenance')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN organism_genome_provenance TEXT");
    }
    if(!lineageColumns.some(column=>column.name==='domestication_at_birth_json')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN domestication_at_birth_json TEXT");
    }
    if(!lineageColumns.some(column=>column.name==='domestication_at_death_json')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN domestication_at_death_json TEXT");
    }
    if(!lineageColumns.some(column=>column.name==='birth_habitat_json')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN birth_habitat_json TEXT");
    }
    if(!lineageColumns.some(column=>column.name==='death_habitat_json')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN death_habitat_json TEXT");
    }
    if(!lineageColumns.some(column=>column.name==='habitat_exposure_json')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN habitat_exposure_json TEXT");
    }
    if(!lineageColumns.some(column=>column.name==='migration_history_json')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN migration_history_json TEXT");
    }
    if(!lineageColumns.some(column=>column.name==='predation_outcomes_json')){
      this.db.exec("ALTER TABLE wildlife_lineage ADD COLUMN predation_outcomes_json TEXT");
    }
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
      INSERT INTO fine_chunks(chunk_id,npc_json,object_json,wildlife_json,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(chunk_id) DO UPDATE SET npc_json=excluded.npc_json,object_json=excluded.object_json,wildlife_json=excluded.wildlife_json,updated_at=excluded.updated_at
    `);
    const upsertHome=this.db.prepare(`
      INSERT INTO home_state(slot,npc_json,object_json,updated_at) VALUES('default',?,?,?)
      ON CONFLICT(slot) DO UPDATE SET npc_json=excluded.npc_json,object_json=excluded.object_json,updated_at=excluded.updated_at
    `);
    const upsertLineage=this.db.prepare(`
      INSERT INTO wildlife_lineage(
        entity_id,species,mother_id,father_id,birth_day,death_day,death_reason,generation,
        birth_chunk,death_chunk,traits_at_birth_json,traits_at_death_json,phenotype_at_birth_json,phenotype_at_death_json,phenotype_provenance,organism_genome_at_birth_json,organism_genome_at_death_json,organism_genome_provenance,domestication_at_birth_json,domestication_at_death_json,birth_habitat_json,death_habitat_json,habitat_exposure_json,migration_history_json,predation_outcomes_json,origin,offspring_count,reproductive_success,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(entity_id) DO UPDATE SET
        species=excluded.species,
        mother_id=COALESCE(wildlife_lineage.mother_id,excluded.mother_id),
        father_id=COALESCE(wildlife_lineage.father_id,excluded.father_id),
        birth_day=MIN(wildlife_lineage.birth_day,excluded.birth_day),
        death_day=COALESCE(wildlife_lineage.death_day,excluded.death_day),
        death_reason=COALESCE(wildlife_lineage.death_reason,excluded.death_reason),
        generation=excluded.generation,
        birth_chunk=wildlife_lineage.birth_chunk,
        death_chunk=COALESCE(wildlife_lineage.death_chunk,excluded.death_chunk),
        traits_at_birth_json=wildlife_lineage.traits_at_birth_json,
        traits_at_death_json=COALESCE(wildlife_lineage.traits_at_death_json,excluded.traits_at_death_json),
        phenotype_at_birth_json=COALESCE(wildlife_lineage.phenotype_at_birth_json,excluded.phenotype_at_birth_json),
        phenotype_at_death_json=COALESCE(wildlife_lineage.phenotype_at_death_json,excluded.phenotype_at_death_json),
        phenotype_provenance=COALESCE(wildlife_lineage.phenotype_provenance,excluded.phenotype_provenance),
        organism_genome_at_birth_json=COALESCE(wildlife_lineage.organism_genome_at_birth_json,excluded.organism_genome_at_birth_json),
        organism_genome_at_death_json=COALESCE(wildlife_lineage.organism_genome_at_death_json,excluded.organism_genome_at_death_json),
        organism_genome_provenance=COALESCE(wildlife_lineage.organism_genome_provenance,excluded.organism_genome_provenance),
        domestication_at_birth_json=COALESCE(wildlife_lineage.domestication_at_birth_json,excluded.domestication_at_birth_json),
        domestication_at_death_json=COALESCE(excluded.domestication_at_death_json,wildlife_lineage.domestication_at_death_json),
        birth_habitat_json=COALESCE(wildlife_lineage.birth_habitat_json,excluded.birth_habitat_json),
        death_habitat_json=COALESCE(wildlife_lineage.death_habitat_json,excluded.death_habitat_json),
        habitat_exposure_json=COALESCE(excluded.habitat_exposure_json,wildlife_lineage.habitat_exposure_json),
        migration_history_json=COALESCE(excluded.migration_history_json,wildlife_lineage.migration_history_json),
        predation_outcomes_json=COALESCE(excluded.predation_outcomes_json,wildlife_lineage.predation_outcomes_json),
        origin=CASE WHEN wildlife_lineage.origin='reproduction' OR excluded.origin='reproduction' THEN 'reproduction' ELSE 'founder' END,
        offspring_count=MAX(wildlife_lineage.offspring_count,excluded.offspring_count),
        reproductive_success=MAX(wildlife_lineage.reproductive_success,excluded.reproductive_success),
        updated_at=excluded.updated_at
    `);
    const upsertTransfer=this.db.prepare(`
      INSERT INTO wildlife_transfers(entity_id,transfer_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(entity_id) DO UPDATE SET transfer_json=excluded.transfer_json,updated_at=excluded.updated_at
    `);
    const deleteTransfer=this.db.prepare('DELETE FROM wildlife_transfers WHERE entity_id = ?');

    const tx=this.db.transaction((data:WorldPersistenceSnapshot)=>{
      upsertMeta.run(data.version,JSON.stringify(data.meta),savedAt);

      // Missing coarse/fine rows are omitted by this writer, not deletion requests.
      // Explicit reset via clear() remains the only discovered-world deletion path.
      for(const chunk of data.coarseChunks) upsertChunk.run(chunk.id,JSON.stringify(chunk),savedAt);

      for(const chunk of data.fineChunks){
        upsertFine.run(chunk.chunkId,JSON.stringify(chunk.npcStates),JSON.stringify(chunk.objectStates),JSON.stringify(chunk.wildlifeStates||[]),savedAt);
      }

      upsertHome.run(JSON.stringify(data.homeNpcs),JSON.stringify(data.homeObjects),savedAt);

      for(const record of data.wildlifeLineage||[]){
        upsertLineage.run(
          record.entityId,record.species,record.motherId??null,record.fatherId??null,
          record.birthDay,record.deathDay??null,record.deathReason??null,record.generation,
          record.birthChunk,record.deathChunk??null,JSON.stringify(record.traitsAtBirth),
          record.traitsAtDeath?JSON.stringify(record.traitsAtDeath):null,
          record.phenotypeAtBirth?JSON.stringify(record.phenotypeAtBirth):null,
          record.phenotypeAtDeath?JSON.stringify(record.phenotypeAtDeath):null,
          record.phenotypeProvenance??null,
          record.organismGenomeAtBirth?JSON.stringify(record.organismGenomeAtBirth):null,
          record.organismGenomeAtDeath?JSON.stringify(record.organismGenomeAtDeath):null,
          record.organismGenomeProvenance??null,
          record.domesticationAtBirth?JSON.stringify(record.domesticationAtBirth):null,
          record.domesticationAtDeath?JSON.stringify(record.domesticationAtDeath):null,
          record.birthHabitat?JSON.stringify(record.birthHabitat):null,record.deathHabitat?JSON.stringify(record.deathHabitat):null,
          record.habitatExposure?JSON.stringify(record.habitatExposure):null,
          record.migrationHistory?JSON.stringify(record.migrationHistory):null,
          record.predationOutcomes?JSON.stringify(record.predationOutcomes):null,
          record.origin==='reproduction'?'reproduction':'founder',record.offspringCount,
          record.reproductiveSuccess?1:0,savedAt
        );
      }

      if(data.wildlifeTransfers!==undefined){
        const transferIds=new Set(data.wildlifeTransfers.map(transfer=>transfer.entityId));
        const existingTransfers=this.db.prepare('SELECT entity_id FROM wildlife_transfers').all() as Array<{entity_id:string}>;
        for(const row of existingTransfers)if(!transferIds.has(row.entity_id))deleteTransfer.run(row.entity_id);
        for(const transfer of data.wildlifeTransfers){
          upsertTransfer.run(transfer.entityId,JSON.stringify(transfer),savedAt);
        }
      }
    });

    tx(snapshot);
    return { ok:true, savedAt };
  }

  load():WorldPersistenceSnapshot|null {
    const metaRow=this.db.prepare('SELECT version,meta_json,saved_at FROM world_meta WHERE slot = ?').get('default') as Row|undefined;
    if(!metaRow)return null;

    const coarseRows=this.db.prepare('SELECT state_json FROM coarse_chunks ORDER BY id').all() as Array<{state_json:string}>;
    const fineRows=this.db.prepare('SELECT chunk_id,npc_json,object_json,wildlife_json FROM fine_chunks ORDER BY chunk_id').all() as Array<{chunk_id:string;npc_json:string;object_json:string;wildlife_json:string}>;
    const homeRow=this.db.prepare('SELECT npc_json,object_json FROM home_state WHERE slot = ?').get('default') as {npc_json:string;object_json:string}|undefined;
    const transferRows=this.db.prepare('SELECT transfer_json FROM wildlife_transfers ORDER BY entity_id').all() as Array<{transfer_json:string}>;
    const lineageRows=this.db.prepare(`
      SELECT entity_id,species,mother_id,father_id,birth_day,death_day,death_reason,generation,
             birth_chunk,death_chunk,traits_at_birth_json,traits_at_death_json,phenotype_at_birth_json,phenotype_at_death_json,phenotype_provenance,organism_genome_at_birth_json,organism_genome_at_death_json,organism_genome_provenance,domestication_at_birth_json,domestication_at_death_json,birth_habitat_json,death_habitat_json,habitat_exposure_json,migration_history_json,predation_outcomes_json,origin,offspring_count,reproductive_success
      FROM wildlife_lineage ORDER BY birth_day,entity_id
    `).all() as Array<{
      entity_id:string;species:WildlifeLineageRecord['species'];mother_id:string|null;father_id:string|null;
      birth_day:number;death_day:number|null;death_reason:WildlifeLineageRecord['deathReason']|null;generation:number;
      birth_chunk:string;death_chunk:string|null;traits_at_birth_json:string;traits_at_death_json:string|null;
      phenotype_at_birth_json:string|null;phenotype_at_death_json:string|null;phenotype_provenance:WildlifeLineageRecord['phenotypeProvenance']|null;
      organism_genome_at_birth_json:string|null;organism_genome_at_death_json:string|null;organism_genome_provenance:WildlifeLineageRecord['organismGenomeProvenance']|null;
      domestication_at_birth_json:string|null;domestication_at_death_json:string|null;
      birth_habitat_json:string|null;death_habitat_json:string|null;habitat_exposure_json:string|null;migration_history_json:string|null;predation_outcomes_json:string|null;origin:'founder'|'reproduction';
      offspring_count:number;reproductive_success:number;
    }>;

    const coarseChunks=coarseRows.map(row=>parse<CoarseChunkState|null>(row.state_json,null)).filter((x):x is CoarseChunkState=>Boolean(x));
    const fineChunks:PersistedFineChunk[]=fineRows.map(row=>({
      chunkId:row.chunk_id,
      npcStates:parse<NpcState[]>(row.npc_json,[]),
      objectStates:parse<WorldObjectState[]>(row.object_json,[]),
      wildlifeStates:parse<WildlifeState[]>(row.wildlife_json,[])
    }));
    const wildlifeTransfers=transferRows
      .map(row=>parse<PersistedWildlifeTransfer|null>(row.transfer_json,null))
      .filter((value):value is PersistedWildlifeTransfer=>Boolean(value));
    const wildlifeLineage:WildlifeLineageRecord[]=lineageRows.map(row=>({
      entityId:row.entity_id,
      species:row.species,
      motherId:row.mother_id??undefined,
      fatherId:row.father_id??undefined,
      birthDay:Number(row.birth_day),
      deathDay:row.death_day===null?undefined:Number(row.death_day),
      deathReason:row.death_reason??undefined,
      generation:Number(row.generation),
      birthChunk:row.birth_chunk,
      deathChunk:row.death_chunk??undefined,
      traitsAtBirth:parse<WildlifeTraits>(row.traits_at_birth_json,{speed:1,size:1,fertility:.5,wariness:.5}),
      traitsAtDeath:row.traits_at_death_json?parse<WildlifeTraits|undefined>(row.traits_at_death_json,undefined):undefined,
      phenotypeAtBirth:row.phenotype_at_birth_json?parse<WildlifePhenotype|undefined>(row.phenotype_at_birth_json,undefined):undefined,
      phenotypeAtDeath:row.phenotype_at_death_json?parse<WildlifePhenotype|undefined>(row.phenotype_at_death_json,undefined):undefined,
      phenotypeProvenance:row.phenotype_provenance??undefined,
      organismGenomeAtBirth:row.organism_genome_at_birth_json?parse<WildlifeOrganismGenome|undefined>(row.organism_genome_at_birth_json,undefined):undefined,
      organismGenomeAtDeath:row.organism_genome_at_death_json?parse<WildlifeOrganismGenome|undefined>(row.organism_genome_at_death_json,undefined):undefined,
      organismGenomeProvenance:row.organism_genome_provenance??undefined,
      domesticationAtBirth:row.domestication_at_birth_json?parse<WildlifeDomesticationState|undefined>(row.domestication_at_birth_json,undefined):undefined,
      domesticationAtDeath:row.domestication_at_death_json?parse<WildlifeDomesticationState|undefined>(row.domestication_at_death_json,undefined):undefined,
      birthHabitat:row.birth_habitat_json?parse<WildlifeHabitatSnapshot|undefined>(row.birth_habitat_json,undefined):undefined,
      deathHabitat:row.death_habitat_json?parse<WildlifeHabitatSnapshot|undefined>(row.death_habitat_json,undefined):undefined,
      habitatExposure:row.habitat_exposure_json?parse<WildlifeHabitatExposure|undefined>(row.habitat_exposure_json,undefined):undefined,
      migrationHistory:row.migration_history_json?parse<WildlifeMigrationEvent[]>(row.migration_history_json,[]):undefined,
      predationOutcomes:row.predation_outcomes_json?parse<NonNullable<WildlifeLineageRecord['predationOutcomes']>|undefined>(row.predation_outcomes_json,undefined):undefined,
      origin:row.origin==='reproduction'?'reproduction':'founder',
      offspringCount:Number(row.offspring_count)||0,
      reproductiveSuccess:Boolean(row.reproductive_success)
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
      wildlifeLineage,
      wildlifeTransfers,
      savedAt:Number(metaRow.saved_at)||undefined
    };
  }

  evolutionStats() {
    const snapshot=this.load();
    const asOfDay=snapshot?snapshot.meta.day+snapshot.meta.minuteOfDay/1440:undefined;
    return computeEvolutionStatistics(snapshot?.wildlifeLineage||[],asOfDay);
  }

  coevolutionStats() {
    const snapshot=this.load();
    const asOfDay=snapshot?snapshot.meta.day+snapshot.meta.minuteOfDay/1440:undefined;
    return computeWildlifeCoevolutionEvidence(snapshot?.wildlifeLineage||[],asOfDay);
  }

  interactionSelectionStats() {
    const snapshot=this.load();
    const asOfDay=snapshot?snapshot.meta.day+snapshot.meta.minuteOfDay/1440:undefined;
    return computeWildlifeInteractionSelectionEvidence(snapshot?.wildlifeLineage||[],asOfDay);
  }

  interactionNetwork() {
    const snapshot=this.load();
    return computeWildlifeInteractionNetwork(snapshot?.coarseChunks||[]);
  }

  stats() {
    const saved=this.db.prepare('SELECT saved_at FROM world_meta WHERE slot = ?').get('default') as {saved_at:number}|undefined;
    const coarse=(this.db.prepare('SELECT COUNT(*) AS n FROM coarse_chunks').get() as {n:number}).n;
    const fine=(this.db.prepare('SELECT COUNT(*) AS n FROM fine_chunks').get() as {n:number}).n;
    const lineage=(this.db.prepare('SELECT COUNT(*) AS n FROM wildlife_lineage').get() as {n:number}).n;
    const transfers=(this.db.prepare('SELECT COUNT(*) AS n FROM wildlife_transfers').get() as {n:number}).n;
    return { configured:true,file:path.basename(this.file),hasSave:Boolean(saved),savedAt:saved?.saved_at||null,coarseChunks:coarse,fineChunks:fine,lineageRecords:lineage,pendingWildlifeTransfers:transfers };
  }

  clear() {
    const tx=this.db.transaction(()=>{
      this.db.prepare('DELETE FROM world_meta').run();
      this.db.prepare('DELETE FROM coarse_chunks').run();
      this.db.prepare('DELETE FROM fine_chunks').run();
      this.db.prepare('DELETE FROM home_state').run();
      this.db.prepare('DELETE FROM wildlife_lineage').run();
      this.db.prepare('DELETE FROM wildlife_transfers').run();
    });
    tx();
    return {ok:true};
  }

  close(){ this.db.close(); }
}
