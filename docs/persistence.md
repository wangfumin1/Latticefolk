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

The save format is currently `version: 1`.

## SQLite layout

- `world_meta`
- `coarse_chunks`
- `fine_chunks` — NPC JSON, object JSON, and wildlife JSON
- `home_state`
- `wildlife_lineage` — append-preserving ancestry/lifecycle archive independent of fine-chunk entity presence

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

Lineage rows now optionally persist `birth_habitat_json` and `death_habitat_json` with biome, ecology, food, water, danger, settlement level, and aggregate plant biomass. Existing databases receive additive column migrations. For reproduced offspring, the origin snapshot is the actual birth habitat; for legacy/founder individuals it is the first habitat observed by the upgraded simulation, so downstream analysis keeps that provenance limitation explicit.
