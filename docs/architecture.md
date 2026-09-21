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


## Conserved cross-chunk flows

Coarse chunks now exchange population and resources through explicit transactions rather than independent counter edits.

The flow layer plans bounded neighbor-to-neighbor transfers for:

- population migration;
- food trade;
- wood trade;
- water trade;
- ecological/biological spread.

Each flow records a source chunk, destination chunk, amount, simulation time, type, and reason. The deterministic executor subtracts from the source and adds the same amount to the destination. Unit tests assert conservation across transfers.

Provider-selected chunk policies influence these flows indirectly: `release/evacuate` creates migration pressure, `attract` creates destination pull, and `trade_route` enables stronger resource exchange. Jev still does not write numeric balances itself.

Materialized chunks are excluded from coarse-flow planning while fine simulation is active, preventing duplicate accounting across LOD layers.


## Region and World decision hierarchy

Latticefolk now runs four decision scales:

```text
World policy        slowest cadence
  ↓
Region policy
  ↓
Chunk policy
  ↓
NPC intent          fastest cadence
```

Region aggregation summarizes neighboring chunks into population, settlements, food, wood, water, ecology, danger, and prosperity. The provider chooses only bounded regional policies: coordination priority, movement posture, and ecology posture.

World aggregation summarizes all known regions and selects a long-horizon priority, connectivity posture, and growth posture. Region and World decisions never directly write population or resources. Deterministic simulation interprets them as bounded modifiers on settlement growth, conserved flows, ecology recovery, and danger reduction.

Jev calls use lower Region/World budget weights because those layers run less often and should consume a smaller share of paid input tokens.


## Dynamic coarse-world streaming

The coarse world is no longer bounded to the original 9×9 chunk square.

- First-person travel owns world discovery. Crossing chunk boundaries shifts a fixed active window around the player's chunk.
- New coarse chunks are generated deterministically from world seed and absolute chunk coordinates.
- Chunks leaving the active window unload only their coarse visuals; their authoritative state remains discovered and persists to SQLite.
- Returning to explored space restores existing history instead of regenerating it.
- The always-fine center-town 3×3 footprint stays reserved.
- God View never expands discovery or materialization.
- Conserved-flow planning now scans coordinate neighbors instead of all chunk pairs, keeping it approximately O(n) in discovered chunks.

The active render window and the discovered persistent world are separate concepts, so travel has no fixed map edge while scene complexity stays bounded.


## Semantic procedural settlements

Fine materialization now generates settlement content from coarse state instead of using one generic layout.

A chunk chooses a deterministic archetype from biome, settlement level, strategy, danger, resources, and prosperity: `farmstead`, `market_hamlet`, `timber_camp`, `quarry_outpost`, `wetland_hamlet`, `refuge`, or `wilderness`.

The archetype drives:

- road layout;
- functional building mix and placement;
- water, farm, market, workshop, guard, storage, cart, mine, and tool sites;
- representative resident roles and work targets;
- biome-specific resource distribution.

Generated nature avoids building footprints and road corridors. Generated roads are themselves semantic `WorldObject` entities rather than visual-only meshes. All generated functional objects expose explicit capabilities used by both players and NPC decision logic.
