# Fine physics authority

Latticefolk keeps physical outcomes inside deterministic simulation. Decision Providers may choose intentions such as moving toward a target, fleeing, hunting, following an owner, or interacting with an object, but they do not choose whether a body passes through a wall, overlaps another body, enters a trigger, or reaches a physical destination.

This document describes the dedicated fine-physics authority and the first Physics v2 terrain increment. It replaces the previous ad-hoc blocked-cell movement checks and now owns materialized ground contact as well, without claiming that doors or general rigid bodies are complete.

## Authority boundary

The current fine physics layer owns:

- materialized static collision geometry represented as 2D AABBs;
- kinematic circular character collision for the first-person player, NPCs, and fine wildlife;
- deterministic sub-stepped displacement to prevent large-frame tunnelling;
- axis-separated collision resolution so a character can slide along a wall rather than losing all movement;
- dynamic character-vs-character collision using circular bodies;
- non-blocking semantic trigger volumes;
- chunk-scoped deterministic terrain surfaces and ground-contact queries;
- bounded maximum slope and vertical ground-step legality during kinematic movement;
- chunk-scoped registration and cleanup of colliders, triggers, and terrain;
- the final physical displacement applied to fine characters.

It does **not** own AI intent, navigation goals, health, damage, inventory, reproduction, population accounting, domestication state, or provider decisions.

The next physics phases still need authoritative door open/close collider state, general rigid bodies, pushable/stackable objects, carts/vehicles, projectiles, and richer collision/contact events.

## Runtime model

`src/world/finePhysics.ts` exposes `FinePhysicsAuthority`.

Static colliders are code/runtime-owned AABBs:

```ts
{
  id,
  minX,
  maxX,
  minZ,
  maxZ,
  chunkId?
}
```

Triggers use the same bounds but never block motion. The current gameplay integration registers interaction triggers for semantic WorldObjects and building interaction points. First-person object interaction requires both the existing visual/raycast target and an overlapping physics trigger, so an object cannot be used merely because its mesh is visible through a wall or from outside its interaction volume.

Dynamic characters are not duplicated into a second persistent physics database. Every kinematic move receives a snapshot of currently materialized character circles. That keeps authoritative identity/state in the existing NPC/wildlife/player systems while physics owns contact resolution.

## Terrain and ground contact

`src/world/fineTerrain.ts` is the materialization boundary between a coarse chunk and its fine authoritative ground footprint. `TownGame.materializeFineChunk()` registers that footprint in the same `FinePhysicsAuthority` used by player, NPC, and wildlife movement; `clearChunk(chunkId)` removes it when the fine chunk sleeps. The current rendered world is flat, so the authoritative terrain descriptor is deliberately flat too. Future procedural elevation must drive rendering and this descriptor together rather than introducing a second height source.

Ground contact is deterministic when surfaces overlap: the highest surface wins, with stable surface id as the tie-break. Kinematic movement rejects candidate ground whose angle exceeds `maxSlope` or whose per-substep height discontinuity exceeds `maxGroundStep`. The returned movement result includes read-only ground contact and terrain-hit evidence; Decision Providers cannot author either outcome.


## Kinematic movement

A caller submits:

- current position;
- desired displacement;
- body radius;
- current materialized dynamic colliders.

The authority subdivides long displacement into bounded substeps, resolves X and Z independently, rejects penetration into static/dynamic bodies, and returns the actual displacement. The caller applies only that returned displacement.

This means:

```text
Decision / input
    ↓
navigation or movement controller
    ↓ desired displacement
FinePhysicsAuthority
    ↓ resolved displacement/contact
authoritative fine position
```

The player, NPCs, and wildlife now all use this path. The old `blocked Set` is no longer a second collision truth. Grid A* remains a navigation algorithm, but passability is queried from physics static geometry.

Wildlife still uses its movement archetype controller to determine gait, acceleration, turn rate and desired displacement. Physics then resolves whether that displacement is actually possible. Energy cost is based on realized controller movement rather than an impossible requested displacement.

## Physical approach instead of center penetration

Semantic targets often use an object's or animal's center as a navigation target. Once objects and characters have real collision volumes, reaching the exact center is physically impossible.

For the final waypoint, a collision inside the legal approach radius therefore counts as physical arrival. The higher-level deterministic action resolver still performs its own action-specific range checks, such as hunt/mating range. This prevents the physics layer from authorizing gameplay outcomes while avoiding permanent path stalls at wells, workstations, carts, prey, NPCs, or the player.

## Static semantic objects

Buildings register their real footprint as static physics geometry and register a separate interaction trigger near the semantic interaction point.

The initial WorldObject collider set includes solid objects such as:

- well;
- bench;
- bed;
- food stall;
- workstation;
- tree;
- rock;
- cart;
- non-pickupable crate.

Non-solid semantic content such as roads, water patches, farm plots, bushes and flowers remains non-blocking unless a later physical archetype says otherwise.

Pickupable objects receive interaction triggers but are not treated as fixed static geometry.

## Chunk lifecycle and sleeping

Physics exists only for fine/materialized content.

A collider or trigger may carry a `chunkId`. When that chunk folds back to coarse simulation, `physics.clearChunk(chunkId)` removes its fine collision/trigger state. Fine character bodies likewise disappear because dynamic colliders are generated only from currently materialized runtime entities.

This is the current unloaded-chunk sleeping boundary: no per-frame velocity/contact solver runs for distant chunks. Their authoritative evolution remains in the coarse deterministic simulation.

Transient wildlife movement speed was already non-persistent. Fine physics adds no new persistence schema.

## God View invariant

God View remains an out-of-world observer.

The physics dynamic-body snapshot contains the player only in first-person mode. When God View is active, there is no player collider for NPCs or wildlife to contact, avoid, follow, or target. Moving the God camera also does not register physics geometry, materialize new chunks, or change simulation state.

God View may display physics counts for observability; that display is read-only.

## Restored overlap

Legacy saves or procedural materialization can occasionally place two dynamic circles with slight overlap. The solver permits a move that strictly increases separation, preventing an old overlap from trapping both bodies forever. Movement deeper into the overlap remains blocked.

## Triggers

Triggers are observational volumes and do not block movement. `overlappingTriggers` returns deterministic ID-sorted results. The first gameplay consumer is first-person WorldObject interaction.

Future uses can include doors, hazard volumes, building interiors, water depth, biome-local effects, scripted semantic zones, and physics-backed interaction sensors, provided those systems keep authoritative state changes in deterministic simulation.

## Tests

`tests/fine-physics.test.ts` covers:

- anti-tunnelling substeps;
- wall sliding;
- dynamic body collision;
- separation from legacy overlap;
- chunk-scoped cleanup;
- non-blocking trigger overlap.

The normal CI pipeline runs these tests together with typecheck, all existing simulation tests, and the production build.

## Next physics work

The next implementation step should extend the same authority rather than reintroducing local collision branches:

1. terrain/ground contact and bounded slope traversal;
2. door/open-close collider state and trigger-backed thresholds;
3. general rigid bodies for movable props, carts and stacking;
4. projectile/contact queries;
5. richer sleeping/wakeup rules across fine/coarse boundaries.

Decision Providers continue to supply only intentions. Physical contacts and their consequences remain deterministic.


## Playable verification

Gameplay and physics changes are gated by a real Chromium smoke test in addition to deterministic unit tests. The Playwright path starts the actual server and Vite client, waits for a materialized fine chunk with registered terrain, enters first person with pointer lock, verifies real movement, switches to God View, verifies the player physics body disappears and observer-camera movement does not expand discovered chunks, and captures first-person/God View screenshots as CI artifacts. A green typecheck/unit/build job alone is not treated as playable or visual verification.
