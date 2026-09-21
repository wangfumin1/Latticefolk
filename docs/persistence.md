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
| Visited fine chunks | resident identities/state, memories, relationships, inventory, object storage, resource depletion |
| Center town | NPC and interactive-object state |

The save format is currently `version: 1`.

## SQLite layout

- `world_meta`
- `coarse_chunks`
- `fine_chunks`
- `home_state`

Writes use a single SQLite transaction so one logical snapshot cannot partially update only some simulation layers. SQLite runs with WAL journaling and `synchronous=NORMAL`.

## Runtime behavior

The browser loads `GET /api/world/state` on startup. If no save exists, deterministic world generation remains authoritative.

While playing, the browser posts a complete state snapshot roughly every 15 seconds. During page unload, it also attempts a final `sendBeacon` write.

`DELETE /api/world/state` clears the save. In production this destructive operation is disabled unless `ALLOW_RUNTIME_ADMIN=true`.

## Coarse/fine interaction

A materialized distant chunk is stored as detailed resident/object state while its coarse aggregate remains the regional baseline. On re-entry after restart, the deterministic chunk plan supplies geometry/layout identity and the persisted detailed state overlays inventories, relationships, storage, resource depletion, and other mutable fields.

This is intentionally separate from procedural generation: generation answers “what should exist by seed and coarse constraints?”, persistence answers “what actually happened to it?”.

## Current limitations

- No historical save slots or rollback UI yet.
- Schema migration beyond snapshot v1 is not implemented yet.
- Cross-chunk transactions are the next simulation milestone; persistence currently records state after those systems mutate it.
- Jev runtime budget settings remain configuration/runtime-control state and are not part of the world save.

When the schema begins to stabilize, migrations and explicit backup/export tooling should replace destructive development-time compatibility handling.
