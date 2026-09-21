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
