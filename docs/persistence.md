# World persistence

Latticefolk stores authoritative world snapshots in a server-side SQLite database.

## File

```text
data/latticefolk.sqlite
```

The database and its WAL/SHM sidecars are ignored by Git. It is runtime state, not source data.

## What is persisted

| Area | Data |
| --- | --- |
| World meta | day, minute of day, weather |
| Player | position and inventory |
| Coarse world | every coarse chunk's population, resources, ecology, danger, prosperity, settlement level, provider-selected policy, and decision version |
| Visited fine chunks | resident identities/state, memories, relationships, inventory, object storage, resource depletion, and persistent wildlife individuals/traits |
| Center town | NPC and interactive-object state |
| Wildlife ancestry | durable birth/death/parent/trait/reproductive records for living and dead individuals |
| Wildlife transit | identity-preserving fine migrants waiting to materialize in their destination chunk |

The save format is currently `version: 1`.

## SQLite layout

- `world_meta`
- `coarse_chunks`
- `fine_chunks` — NPC JSON, object JSON, and wildlife JSON
- `home_state`
- `wildlife_lineage` — append-preserving ancestry/lifecycle archive independent of fine-chunk entity presence
- `wildlife_transfers` — current identity-preserving fine wildlife transit queue; unlike lineage history, completed queue entries are pruned transactionally

Writes use a single SQLite transaction so one logical snapshot cannot partially update only some simulation layers. `wildlife_lineage` is intentionally not pruned when an incoming snapshot omits an old individual: once observed, ancestry and terminal death facts remain durable. SQLite runs with WAL journaling and `synchronous=NORMAL`.

## Runtime behavior

The browser loads `GET /api/world/state` on startup. If no save exists, deterministic world generation remains authoritative.

While playing, the browser posts a complete state snapshot roughly every 15 seconds. During page unload, it also attempts a final `sendBeacon` write.

`DELETE /api/world/state` clears the save. In production this destructive operation is disabled unless `ALLOW_RUNTIME_ADMIN=true`.

## Coarse/fine interaction

A materialized distant chunk is stored as detailed resident/object state while its coarse aggregate remains the regional baseline. On re-entry after restart, the deterministic chunk plan supplies geometry/layout identity and the persisted detailed state overlays inventories, relationships, storage, resource depletion, and other mutable fields.

This is intentionally separate from procedural generation: generation answers “what should exist by seed and coarse constraints?”, persistence answers “what actually happened to it?”.

## Current limitations

- No historical save slots or rollback UI yet.
- Snapshot payloads remain version 1 while SQLite receives small backward-compatible additive migrations for fine wildlife and lineage metadata.
- Historical save slots, rollback, and export/import tooling are not implemented yet.
- Jev runtime budget settings remain configuration/runtime-control state and are not part of the world save.

When the schema begins to stabilize, migrations and explicit backup/export tooling should replace destructive development-time compatibility handling.


### Wildlife schema extension

The wildlife milestone adds a `wildlife_json` column to `fine_chunks`. Existing SQLite databases are upgraded at startup with a backward-compatible column migration and default empty wildlife arrays; no manual reset is required.

### Wildlife lineage archive

`wildlife_lineage` stores `entity_id`, species, parents, birth/death day and chunk, normalized death reason, generation, traits at birth/death, habitat snapshots at origin/death, founder-vs-reproduction origin, offspring count, and reproductive-success state. Parent records survive entity death and fine-chunk unloading, so later generations can still traverse ancestry. The server exposes deterministic aggregate statistics at `GET /api/world/evolution`; no Decision Provider call is involved in lineage or statistics.

### Habitat snapshots for selection analysis

Lineage rows now optionally persist `birth_habitat_json`, `death_habitat_json`, and `habitat_exposure_json`. Birth/death snapshots contain biome, ecology, food, water, danger, settlement level, aggregate plant biomass, and optional species-specific niche competition pressure; lifetime exposure additionally stores observed days, time-weighted habitat means (including competition pressure when available), per-biome/per-chunk observed duration, and observed transition count. Existing databases receive additive column migrations. For reproduced offspring, the origin snapshot is the actual birth habitat; for legacy/founder individuals it is the first habitat observed by the upgraded simulation, so downstream analysis keeps that provenance limitation explicit.

### Observed lifetime exposure

Lifetime exposure is deliberately observation-bounded. While an individual is materialized in fine simulation, elapsed simulation days are accumulated into its lineage record. On chunk collapse or death the final interval is flushed; `lastObservedDay` is then cleared. When the chunk is later materialized again, observation restarts from the current world time. The coarse interval in between is not backfilled as if the simulation knew that named individual's exact path. This preserves the distinction between aggregate population migration and individual lineage evidence.

### Identity-preserving wildlife transit

Fine wildlife migration is persisted separately from `fine_chunks`. A migrant already changes the authoritative coarse source/destination population through a conserved deterministic transfer, while its named fine identity is stored in `wildlife_transfers` until the destination is materialized. This avoids treating an unvisited destination as if it already had a complete fine snapshot.

Each transfer stores the full `WildlifeState`, source/destination chunk IDs, simulation day, and `representedPopulation`. That representative weight is also carried by the migrated state after arrival so later death or onward migration folds back by the same coarse quantity rather than by a generic fine-entity scale. Completing/materializing a transfer and pruning the queue occur in the same world-snapshot transaction on the next save.

### Niche competition persistence

Coarse niche competition is part of each `CoarseChunkState`, so it is persisted automatically inside `coarse_chunks.state_json` with the rest of the authoritative aggregate ecology. Species-level `competitionPressure` is also stored on coarse wildlife populations. Fine lineage habitat JSON can carry `competitionPressure`; because it is an optional additive field, older saves remain loadable without a schema migration. New lineage habitat observations can also carry optional `seasonalSuitability`; lifetime exposure time-weights it with the other observed habitat values. Older lineage JSON remains loadable and is not backfilled.

### Wildlife disease pressure persistence

Coarse disease transmission state is embedded in `CoarseChunkState` and persists inside `coarse_chunks.state_json`: environmental pressure, species pressure, local contact, cross-species contact, migration-import pressure, and strongest transmission pair. Each coarse species population may also carry `importedDiseasePressure`, which decays deterministically after arrival. Fine lineage habitat JSON may include optional `diseasePressure`; lifetime exposure time-weights it. All fields are additive JSON state, so existing saves remain loadable without a SQLite table migration.

### Derived fitness evidence

Fitness-by-habitat statistics are intentionally **not** stored as authoritative SQLite rows. The durable facts remain lineage records, offspring/death outcomes, and observation-bounded habitat exposure. Competition/season/disease correlations and low/mid/high exposure cohorts are recomputed deterministically from those facts by `src/world/evolution.ts` and through `GET /api/world/evolution`. This prevents stale aggregate statistics from diverging from the underlying lineage archive.
