# Long-term vision: from town demo to living world

Latticefolk's long-term target is a persistent, procedurally generated world where autonomous agents live inside the same deterministic simulation as the player. The project should scale by separating *what must be simulated exactly* from *what can be decided approximately*.

## Decision hierarchy

A large world cannot ask a remote model to decide every movement of every entity. Latticefolk therefore targets hierarchical decision making:

- world layer: infrequent coarse decisions about settlement pressure, migration, regional priorities, ecology, and major events;
- region layer: schedules, resource allocation, local production, social groups, and medium-term goals;
- agent layer: bounded choices such as work, rest, eat, trade, flee, socialize, reproduce, explore, or use an object;
- simulation layer: pathfinding, physics, inventory transfer, health, genetics, reproduction, collision, and numeric consequences.

Distant chunks run coarse statistical simulation. Nearby/observed chunks progressively materialize into agents, objects, physics bodies, and fine decisions. State must round-trip between coarse and fine representations without losing persistent consequences.

## Content generation is not simulation authority

Procedural content can generate candidate layouts, organisms, dialogue fragments, props, quests, and environmental details. Generated output must be converted into validated game data before entering the world. A model never directly mutates authoritative world state.

For dialogue specifically, Jev can decide intent, fragment selection, composition strategy, voice-library selection, and when a corpus gap exists. If truly novel text is desired, a separate generative text provider can propose candidates. Latticefolk then validates, deduplicates, tags, stores, and reuses those candidates as part of the evolving authored/generated corpus.

## Evolution

Evolution is intended to emerge from explicit inheritance and selection rather than a one-click model rewrite. Organisms have inheritable traits, mutation, reproductive success, survival constraints, and environment-dependent fitness. Decision models affect behavior and therefore selection pressure, while the evolutionary substrate remains inspectable and reproducible.

## Procedural world

World generation should be seed based and chunked. Global generation establishes topology and large-scale constraints; regional generation establishes biome/settlement structure; local generation places detailed buildings, vegetation, resources, interiors, and interactables. The same capability/tag schema used by NPC decisions should describe procedurally generated content, so newly generated objects immediately participate in gameplay.


## Implemented milestone: first coarse/fine round trip

Latticefolk can transition a distant aggregate chunk into a local entity simulation when the first-person player travels into it, and collapse it back when the player leaves. This is deliberately bounded: one distant chunk is materialized at a time, resident count is a representative subset of coarse population, and detailed state is retained in memory during the session.

The next milestone is durable persistence, followed by conserved cross-chunk flows and multi-chunk streaming.


## Implemented milestone: durable world persistence

The world now survives process and browser restarts. Coarse chunk policies/resources, detailed visited-chunk residents and objects, center-town state, player inventory/location, time, and weather are stored in SQLite. This moves the project from session-only LOD experiments toward a persistent world.

The next milestone is conserved exchange between chunks: migration and goods must move from an explicit source to an explicit destination instead of independently increasing/decreasing aggregate counters.


## Implemented milestone: conserved chunk exchange

Neighboring coarse chunks now exchange population and transferable resources through explicit source/destination transactions. Migration and trade therefore have provenance and conservation instead of being independent local increments/decrements. Chunk policies selected by Jev/fallback influence flow pressure, while deterministic code owns the amounts and balance checks.

The next milestone adds Region and World decision layers with much slower cadences than individual chunk decisions.
