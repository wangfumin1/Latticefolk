# Architecture

Latticefolk separates **simulation truth** from **decision suggestions**.

```text
Browser / Three.js
  ├─ world rendering and input
  ├─ NPC runtime state
  ├─ pathfinding and action execution
  └─ observer / first-person camera semantics
              │
              │ bounded snapshots + legal choices
              ▼
Express API
  ├─ /api/decision
  ├─ /api/dialogue
  └─ DialogueStore
              │
              ▼
DecisionProvider
  ├─ fallback (local deterministic baseline)
  └─ jev (optional TypeSafe System One adapter)
```

## Core invariant

A decision provider is not authoritative over the world. It cannot teleport an NPC, invent inventory, bypass collisions, or directly mutate numeric state. It selects high-level intent from legal candidates; the simulation validates and executes the result.

This boundary makes remote decision models replaceable and allows the game to continue when a provider is unavailable.

## NPC decision cycle

1. Build an NPC-centric world snapshot.
2. Remove entities the NPC cannot perceive. In god mode, the player does not exist in the NPC snapshot.
3. Compute legal actions from current game state.
4. Ask the active `DecisionProvider` for bounded choices.
5. Reject stale responses using the perception epoch when camera/world semantics changed during an in-flight request.
6. Execute movement and action consequences through deterministic game systems.
7. Record short-term memory and schedule the next decision.

## Dialogue pipeline

The dialogue store can contain complete authored lines or `opener/body/closer` fragments. Local retrieval first narrows a large library by tags, role, mood, and intent. The decision provider sees only that bounded candidate set and selects IDs. It does not need access to the entire corpus.


## Hierarchical world simulation

Latticefolk now has two live simulation levels:

- **Fine/local layer:** the center 3×3 chunks are materialized as NPCs, objects, navigation, dialogue, and rendering.
- **Coarse/distant layer:** surrounding chunks keep aggregate population, food, wood, water, ecology, danger, prosperity, settlement level, and regional policy without instantiating every entity.

Distant chunks are not AI-free placeholders. The active decision provider receives bounded chunk batches through `/api/world/chunks/decide`. A Jev provider decomposes each chunk into parallel strategy, migration, and ecology choices in one request. The deterministic world simulation then converts those policies into bounded numeric consequences.

This preserves the same authority boundary used for NPCs: a model selects policy; simulation code owns state mutation.

The next required step is **round-trip LOD**: when a distant chunk becomes local, aggregate state must materialize into concrete inhabitants/resources/buildings; when it becomes distant, those entities must collapse back into aggregate state without losing persistent consequences.


### Coarse ↔ fine materialization (implemented first pass)

The first round-trip LOD path is live.

- The fixed center remains the always-fine demo town.
- Distant chunks continue as aggregate state until the **first-person player** enters one.
- Entering a distant chunk deterministically materializes a representative subset of residents, settlement buildings, interactive work/trade/water sites, and biome resources from that coarse chunk.
- While materialized, that chunk is removed from coarse evolution and regional-policy ticks to avoid double simulation.
- Leaving the chunk collapses fine entities back into the coarse representation.
- Resource depletion, representative wealth changes, and ecological depletion are summarized back into coarse indices.
- Detailed fine NPC/object state is cached in memory, so re-entering the same chunk during the session restores identities, inventories, relationships, storage, and resource depletion.
- God View never causes materialization; it remains an out-of-world observer.

The next stage replaces the in-memory cache with durable SQLite persistence so browser/server restarts do not erase chunk history.


## Durable world persistence

World state is now durable across browser/server restarts through a server-side SQLite database at `data/latticefolk.sqlite`.

The persistence boundary mirrors the simulation hierarchy:

- `world_meta`: day, simulation clock, weather, player position, and player inventory;
- `coarse_chunks`: one authoritative aggregate record per distant chunk;
- `fine_chunks`: detailed NPC/object state for chunks that have been visited/materialized;
- `home_state`: detailed state for the always-fine center town.

SQLite runs in WAL mode. Saves are transactional, so coarse/fine/home tables move to the same snapshot together. The browser performs a periodic save and attempts a final `sendBeacon` save during page unload.

Persistence does **not** make the browser authoritative. The browser submits a validated snapshot to the server; the server owns the durable database. The current schema is snapshot version 1 and is intentionally simple while simulation data structures are still changing rapidly.

See [Persistence](persistence.md).
