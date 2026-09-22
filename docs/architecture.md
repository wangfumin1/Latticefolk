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


## Deterministic production chains

Production is now a shared rules subsystem in `src/world/production.ts`, used by both NPC and player interactions.

Current chains include:

- grain → flour → bread;
- wood → plank → tool.

Recipes define workstation tags, preferred roles, exact inputs, and exact outputs. The decision model may choose the high-level `craft` action, but it cannot bypass missing inputs or invent outputs. Workstations generated by settlement archetypes expose matching semantic tags such as `mill`, `baker/oven`, `sawmill`, and `maker/workshop`.

This establishes the pattern for future production graphs: decision intent remains probabilistic, while recipe execution and inventory conservation remain deterministic.


## Coarse/fine wildlife ecology

Wildlife now participates in the same coarse/fine world hierarchy as people and resources.

The first species set is `rabbit`, `deer`, `boar`, and `fox`. Every discovered coarse chunk keeps species populations with count, carrying capacity, and population health. Carrying capacity is derived from biome affinity, ecology, food, water, danger, and settlement pressure. Coarse simulation applies bounded population growth/loss, herbivore pressure, predator/prey pressure, and explicit conserved neighbor-to-neighbor wildlife migration.

When a chunk materializes, a representative subset of its populations becomes persistent fine entities with:

- species, sex, age, health, hunger, thirst, and energy;
- inherited speed, size, fertility, and wariness traits;
- generation and birth-day metadata;
- local movement, grazing/foraging, drinking, resting, fleeing, hunting, and mate-seeking behavior.

Wildlife decisions are batched (up to six animals per provider request). Jev receives only bounded feasible actions and supplied resource/animal candidates; deterministic game code owns need changes, damage, death, resource consumption, reproduction, inheritance, mutation, and population accounting. Wildlife calls have a lower independent budget weight.

Fine reproduction creates persistent descendants by averaging parental traits plus bounded deterministic mutation. On chunk collapse, fine births/deaths are scaled back into the coarse population, while individual animals remain in the fine-chunk SQLite cache for future revisits.

SQLite `fine_chunks` now stores `wildlife_json`; startup performs a backward-compatible schema migration when an older database lacks the column. Procedural low-poly quadrupeds are used as a visual fallback until dedicated animal assets are integrated.


## Plant biomass, trophic flow, disease, and lifecycle

The ecology layer no longer treats `ecology` and `food` as the only environmental signals.

Each coarse chunk can persist four plant-biomass pools: grass, shrub, fruit, and cultivated crop. Regrowth depends on biome, water, weather, season, ecology policy, and settlement cultivation. Wildlife carrying capacity is recalculated from species-specific biome affinity plus plant food availability, water, danger, and settlement pressure.

The coarse trophic model tracks primary production, herbivory, predation, and mortality return. Rabbit/deer/boar consumption depletes different biomass mixes; fox predation consumes prey population rather than creating/removing abstract food independently. Disease load responds to crowding, wet habitat, weather, migration, and recovery pressure.

Fine wildlife now includes senescence, local disease exposure/recovery, gestation, birth cooldown, litter size, parental IDs, inherited traits with bounded mutation, and explicit multi-generation offspring. Natural water sites and renewable fine resource nodes connect the fine simulation back to the same habitat constraints.

## Durable lineage and evolution observability

Wildlife ancestry is no longer inferred only from currently materialized animals. Every observed fine individual receives a durable lineage record keyed by entity ID. Records retain parents, generation, birth/death coordinates in simulation time, birth/death chunks, traits at birth/death, founder-versus-reproduction origin, terminal death cause, and lifetime offspring count. Death removes the fine entity but does not remove its ancestry record; later sparse snapshots also never prune archived ancestors.

Evolution statistics are deterministic derived data in `src/world/evolution.ts`. They aggregate living and historical individuals by species and generation, producing generation mean/max, reproductive birth count, death count, lifespan, offspring distribution, reproductive-success rate, trait mean/variance, trait slope per generation, mortality causes, and generation cohorts. `GET /api/world/evolution` exposes the same derived statistics server-side, while God View renders them as observer-only information.

This layer deliberately does not call Jev or any other Decision Provider. Providers can alter bounded behavior such as mate seeking, hunting, fleeing, or migration; the simulation owns conception, birth, inheritance, mutation, death classification, lineage accounting, and all statistical conclusions.

## Biome-linked selection-pressure observability

Each durable lineage can now carry habitat snapshots from origin and death: biome, ecology, food, water, danger, settlement level, and aggregate plant biomass. Reproduced offspring capture their true birth habitat; founders upgraded from older worlds use their first observed habitat and remain marked as founders.

`src/world/evolution.ts` groups lineages by species and origin biome, compares the trait mean of individuals that reproduced with the whole observed cohort, normalizes that differential by cohort standard deviation, and measures whether the direction repeats across generations. A signal is only labeled `persistent` when the sample has at least six individuals, at least two breeders, at least two observed generations, at least two generations with a non-zero breeder-vs-cohort differential, a normalized differential of at least 0.20σ in magnitude, at least 67% same-direction consistency across those comparable generations, and the realized trait trend across generations points in the same direction. Otherwise it is `weak` or `insufficient`.

These labels are evidence summaries, not causal declarations. Migration, correlated traits, demographic structure, and unobserved lifetime exposure can all confound them. God View exposes sample size, generation count, normalized differential, consistency, and habitat averages so the observer can inspect the evidence instead of receiving an opaque evolutionary verdict. The Decision Provider is not involved in this calculation.

## Observed lifetime habitat exposure

Birth/death habitat snapshots are now complemented by an explicitly observation-bounded lifetime exposure record. Fine wildlife accumulates simulation days spent under the currently observed chunk conditions, including time-weighted ecology, food, water, danger, settlement pressure and plant biomass, plus per-biome/per-chunk duration and observed chunk-transition count.

The simulation flushes the current interval when an animal dies or its chunk collapses. It does not infer named-animal movement during coarse simulation. When that individual is materialized again, observation resumes from the new fine-simulation time. This matters because coarse wildlife migration represents conserved aggregate population flow, not identity-preserving movement of a particular archived lineage.

Evolution statistics therefore expose two complementary biome views: **origin biome**, based on birth/first-observed habitat provenance, and **lifetime dominant biome**, based only on accumulated fine-observation duration. Lifetime habitat averages are weighted by observed exposure time. Both use the same sample-aware selection-evidence gates, while God View shows observed days so sparse exposure cannot masquerade as complete life history.

## Identity-preserving fine wildlife migration

Fine wildlife can now choose a bounded `migrate` intent. The provider sees only cardinally adjacent discovered chunks with species-specific coarse population/carrying-capacity state and environmental indices. Destinations at or above carrying capacity are removed from the legal candidate set. Jev or fallback may select `migrate` and one supplied chunk ID, but cannot choose coordinates, population amount, or mutate either chunk.

The deterministic executor re-validates adjacency, source/destination species populations, destination free carrying capacity, and the current fine identity. It computes the coarse population represented by that named individual, transfers exactly the accepted amount from source to destination, updates weighted health/disease aggregates, records lineage migration provenance, applies the destination entry point and energy cost, and preserves entity ID, parents, generation, traits, pregnancy state, and habitat history.

A migrant into an unmaterialized chunk enters a separate `wildlife_transfers` queue rather than `fine_chunks`. This is important: a transit identity is not a complete visited-chunk snapshot. When the destination later materializes, one procedural representative is replaced by the named migrant where possible. Migrated identities retain a fixed `representedPopulation` weight, so death and onward migration fold back using the same coarse quantity; ordinary fine representatives continue to use the existing bounded representative scale.

Fine-born individuals are not allowed to migrate until they have been folded into a chunk baseline and later rematerialized. This prevents a birth that has not yet entered coarse accounting from being transferred as if its represented population already existed. God View remains observer-only: wildlife flee logic no longer falls back to the player/camera position when no real predator target exists.

## Deterministic wildlife niche competition

Coarse wildlife now models explicit inter-species competition instead of relying only on independent plant consumption. Each species has a fixed simulation-owned resource-use profile across grass, shrub, fruit, crop, prey, and space. Pairwise niche overlap is derived deterministically from those profiles; current competitor density then produces species-specific competition pressure.

Competition never comes from the Decision Provider. The simulation computes a species' fundamental carrying capacity from biome affinity, ecology, forage, water, danger, and settlement pressure, then applies a bounded competition penalty of at most 32%. Density-dependent growth, health and migration therefore respond to the effective capacity while remaining numerically bounded. The strongest current pair and mean pressure are exposed through coarse-world status and God View.

Competition also enters evolution observability. Fine wildlife habitat snapshots include the species-specific coarse competition pressure at the time of observation, and lifetime habitat exposure keeps its time-weighted mean. Legacy lineage records without this field remain valid and are interpreted as zero observed competition for that historical snapshot rather than retroactively inventing data.

## Seasonal wildlife migration drivers

Seasonal movement is deterministic and layered on top of the existing migration/conservation system. Each wildlife species has a simulation-owned seasonal biome-affinity profile for spring, summer, autumn and winter. The current chunk state combines that seasonal affinity with ecology, species-relevant forage, water and danger into a 0–100 seasonal habitat suitability score.

Coarse migration planning compares neighboring chunks using density, disease pressure and seasonal suitability. A normal migration still requires the aggregate pressure threshold, but a destination that is at least eight suitability points better can create a low-amplitude seasonal migration driver on its own. The transfer remains source-to-destination conserved and is clipped by destination carrying-capacity room before execution. Seasonal preference therefore changes movement direction and pressure; it never creates or deletes population.

Fine wildlife receives current and neighboring seasonal suitability as part of the bounded migration candidate snapshot. Fallback and Jev can use that value to select `migrate` and a supplied adjacent chunk, but the deterministic executor still revalidates adjacency, carrying capacity, represented population, entry point and transit persistence. Seasonal suitability is also stored in new lineage habitat observations and time-weighted lifetime exposure, while legacy records remain valid without fabricated historical season data.

## Wildlife disease transmission pressure

Disease is now modeled as an explicit deterministic pressure system rather than only a scalar crowding increment. Each coarse chunk derives four components: **environmental pressure** from biome/weather/water/ecological stress, **local-contact pressure** from same-species disease load and density, **cross-species pressure** from bounded species-to-species contact coefficients and source density, and **migration-import pressure** carried by conserved wildlife flows. These components are combined into species-specific 0–100 transmission pressure and a strongest currently observed cross-species transmission pair.

The simulation remains authoritative. Coarse `diseaseLoad` moves toward the computed species pressure with bounded recovery; imported pressure decays over time. Wildlife migration transports both population and disease information without creating animals or infections out of thin air: destination disease load is population-weighted and an explicit imported-pressure term records the transient arrival signal.

Fine wildlife uses the same fixed contact coefficients but computes exposure from actual nearby animals, distance/proximity, coarse background pressure and environmental context. This permits deer→rabbit, rabbit→fox and other bounded cross-species pathways while preserving identity-level health state. No Decision Provider writes disease load, transmission coefficients, mortality or recovery.

Lineage habitat snapshots and lifetime exposure can now include observed species-specific disease pressure. This allows later fitness-by-habitat analysis to compare trait/reproductive outcomes under sustained disease pressure rather than inferring disease only from cause-of-death counts.

## Fitness-by-habitat evidence

The evolution layer now derives explicit outcome evidence from observation-bounded lifetime exposure. For each species it evaluates three currently measured dimensions: **niche competition pressure**, **seasonal habitat suitability**, and **disease transmission pressure**. Only lineage records with actual fine-simulation exposure for a dimension enter that dimension's sample.

For each exposure dimension, the deterministic analysis reports total exposure sample size, reproduction-eligible sample size, dead/lifespan sample size, mean observed exposure duration, mean exposure, breeder versus non-breeder exposure means, Pearson association with binary reproduction, offspring count, and observed lifespan among dead individuals. Living juveniles are right-censored from reproduction/offspring outcomes until they reach the shared species adult-age threshold; animals that die before adulthood remain completed non-reproductive outcomes. It also partitions the 0–100 exposure range into low (<33), medium (33–66), and high (≥67) cohorts and reports total and eligible population, living/dead counts, breeder rate, offspring mean, lifespan mean, trait mean, breeder-trait mean, and breeder-vs-cohort trait differential inside each band.

Correlations are reported as unavailable rather than zero when there are fewer than three eligible observations or when either variable has no variance. These statistics deliberately describe association rather than causation. Lifespan association is calculated only among dead individuals and can be censored/selection-biased; reproductive associations can be confounded by generation, migration, correlated habitat dimensions, and incomplete observation coverage. God View shows total/eligible/dead sample sizes, observed days, correlations, and cohort breeder rates rather than collapsing them into a single opaque adaptation score. No Decision Provider participates in the calculation.
