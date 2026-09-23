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

The evolution layer now derives explicit outcome evidence from observation-bounded lifetime exposure. For each species it evaluates four currently measured dimensions: **niche competition pressure**, **seasonal habitat suitability**, **disease transmission pressure**, and **predator pressure**. Only lineage records with actual fine-simulation exposure for a dimension enter that dimension's sample.

For each exposure dimension, the deterministic analysis reports total exposure sample size, reproduction-eligible sample size, dead/lifespan sample size, mean observed exposure duration, mean exposure, breeder versus non-breeder exposure means, Pearson association with binary reproduction, offspring count, and observed lifespan among dead individuals. Living juveniles are right-censored from reproduction/offspring outcomes until they reach the shared species adult-age threshold; animals that die before adulthood remain completed non-reproductive outcomes. It also partitions the 0–100 exposure range into low (<33), medium (33–66), and high (≥67) cohorts and reports total and eligible population, living/dead counts, breeder rate, offspring mean, lifespan mean, trait mean, breeder-trait mean, and breeder-vs-cohort trait differential inside each band.

Correlations are reported as unavailable rather than zero when there are fewer than three eligible observations or when either variable has no variance. These statistics deliberately describe association rather than causation. Lifespan association is calculated only among dead individuals and can be censored/selection-biased; reproductive associations can be confounded by generation, migration, correlated habitat dimensions, and incomplete observation coverage. God View shows total/eligible/dead sample sizes, observed days, correlations, and cohort breeder rates rather than collapsing them into a single opaque adaptation score. No Decision Provider participates in the calculation.

## Shared wildlife species and predator graph

Wildlife species semantics are centralized instead of being duplicated independently by coarse and fine simulation. The current set is `rabbit`, `deer`, `boar`, `goat`, `fox`, and `wolf`. A shared predator/prey graph defines which species may hunt which prey, while deterministic tables define predation preference, damage, hunger relief, life-history thresholds, carrying-capacity scale, niche resource profile, and seasonal biome affinity.

Goat is a medium herbivore specialized toward hills/dryland grass and shrub resources. It participates in plant consumption, niche competition, seasonal suitability, disease transmission, conserved migration, fine reproduction/lifecycle, and evolution statistics. Wolf is a higher trophic predator with strongest preference for deer/goat, weaker pressure on boar/rabbit, and limited wolf→fox predation. Coarse predation subtracts actual prey population and reports resulting trophic flux; fine predation applies deterministic damage/hunger consequences only after a legal `hunt` intent reaches valid prey.

The Decision Provider never defines predator relationships or numerical outcomes. Fallback and Jev only choose among legal `hunt`, `flee`, `migrate`, `seek_mate`, and other bounded actions/targets produced from simulation-owned semantics. A goat can flee a wolf because the shared graph says a wolf can predate goats; a wolf can hunt a goat because the same graph supplies that prey relation. This keeps coarse and fine LOD behavior aligned and prevents provider-specific food-web drift.

Species additions reuse existing persistence: coarse populations remain embedded in chunk JSON, fine individuals remain ordinary `WildlifeState` records, ancestry remains in `wildlife_lineage`, and transit identities remain in `wildlife_transfers`. No new authority path or species-specific persistence table is introduced.

## Predator-pressure adaptation evidence

Predator pressure is modeled as an observational ecological signal separate from actual predation mortality. For each prey species in a coarse chunk, deterministic simulation scans the shared predator/prey graph, reads current predator population density relative to effective carrying capacity, weights that density by the shared prey preference, and maps the aggregate to a bounded 0–100 pressure. The strongest current predator→prey pair and mean chunk pressure are exposed in world status.

This pressure does **not** subtract health or population. Actual predation remains the only authoritative mechanism that removes prey, so recording predator pressure cannot double-count the ecological effect. The pressure instead answers a different question: how exposed was this species to predators during the time the named individual was actually observed in fine simulation?

Fine lineage habitat snapshots and time-weighted lifetime exposure therefore include optional `predatorPressure`. The existing fitness-by-habitat analysis treats it exactly like competition, seasonal suitability, and disease: living juveniles are right-censored until reproductive eligibility, dead individuals contribute completed lifespan outcomes, low/mid/high exposure bands are reported, and unavailable correlations remain unavailable rather than becoming false zero effects. The result is association evidence, not a causal claim that one trait changed because of predators.

## Predator/prey specialization evidence

Aggregate predator pressure answers how exposed a prey species was, but not which predator produced that exposure. Coarse predator-pressure state therefore retains the deterministic `predator → prey` pair decomposition used to form the aggregate signal. Each pair is still observational pressure derived from current predator density and the shared prey-preference table; it is not a kill event and never mutates prey state.

During actual fine simulation, lineage habitat exposure stores time-weighted `predatorSourceMean` for legal predators of the observed prey species. Legal predator sources that are currently absent contribute measured zero pressure. Historical lineage exposure that predates source decomposition remains unknown rather than being silently converted to zero; `predatorSourceObservedDays` is therefore tracked separately from total habitat observed days and is used as the denominator for source-level means.

Evolution statistics expose `predatorSpecialization` per prey species. For each predator source with at least one positive observed pressure, the deterministic analysis reports total samples, reproduction-eligible samples, dead/lifespan samples, observed source days, mean pressure, breeder/non-breeder pressure means, associations with reproduction/offspring/lifespan, and breeder-vs-eligible trait differentials. Reproductive outcomes use the same right-censoring rules as fitness-by-habitat; insufficient or zero-variance evidence remains unavailable rather than being forced to zero.

These remain association statistics, not causal attribution. Correlated biome, disease, migration, competition, or another predator source may explain part of an observed trait difference. God View exposes source identity and sample evidence instead of collapsing the result into a single adaptation score.

## Realized hunting and escape evidence

Predator pressure and predator-source specialization measure ecological exposure, not whether an actual chase or attack succeeded. Fine simulation now records realized predation outcomes only at deterministic action resolution. A Decision Provider may choose `hunt` or `flee` and a legal supplied target, but it cannot mark that action successful.

For a resolved hunt, the predator records a hunt attempt whenever the target species is known and legal under the shared predator graph. The attempt becomes a hit only when the target still exists and is within the deterministic attack distance; it becomes a kill only when deterministic damage reduces target health to zero. The prey records an attack received on a hit and a survived attack only when health remains above zero. A resolved flee records an attempt against the chosen legal predator and succeeds only when the threat is gone or the final deterministic separation reaches the configured safe distance.

These counters are stored in `WildlifeLineageRecord.predationOutcomes` with both overall totals and counterpart-species maps. Evolution statistics aggregate hunt hit/kill rate, escape rate and attack-survival rate and expose pair-level counts. For each observed pair they also compare traits of individuals that achieved at least one relevant success with all individuals that had a realized attempt/contact. Those trait differentials are observational evidence rather than causal claims and should be interpreted alongside sample counts, predator pressure, biome, disease and generation history.

The authority boundary remains unchanged: predator/prey legality, movement, attack distance, damage, health, death and all counters are deterministic simulation truth. Decision Providers only choose bounded behavior/targets and remain subject to the existing wildlife budget controller.

## Predator/prey trait matching and generation trends

Realized interaction evidence now preserves the traits of the actual two individuals involved in a fine-simulation event. For each resolved hunt, the predator-side evidence may store the sum of `predator traits − prey traits` for attempts, hits and kills. For each resolved flee, the prey-side evidence may store `prey traits − predator traits` for attempts and successful escapes. Received attacks similarly record prey-minus-predator deltas for all attacks and for survived attacks. These values come from the actual runtime target when present, or that target's durable lineage traits when the target disappeared before action resolution.

Trait sums are accompanied by independent paired-snapshot counts. This is required for backward compatibility: realized outcomes created before trait matching contain valid hunt/flee counts but no counterpart trait snapshot, so those old attempts must not enter the denominator of a trait-advantage mean. Missing paired evidence therefore remains missing instead of silently becoming zero or diluting later measurements.

For each species/counterpart pair, evolution statistics report actor-minus-counterpart mean trait advantages at three role-specific stages: attempt, successful intermediate outcome, and terminal outcome. Predator stages are attempt → hit → kill. Prey stages are flee attempt → successful escape plus received attack → survived attack. The same evidence is grouped by the actor's generation to expose realized hit/kill or escape/survival rates and paired trait advantages across generations.

These are descriptive interaction measurements, not causal selection estimates. A positive predator speed advantage among hits does not by itself prove selection for speed, because habitat, health, age, behavior choice, pathing, prey composition and correlated traits may also matter. God View presents coverage counts and recent generation outcomes so the evidence remains inspectable. Decision Providers continue to choose only bounded actions/targets and cannot alter traits, success labels, damage, survival or statistics.

## Multi-generation predator/prey coevolution evidence

The evidence layer now joins realized interaction performance, lineage reproductive outcomes and inherited trait trends at the predator→prey pair level. It deliberately does **not** align predator generation numbers with prey generation numbers. A fox generation 3 and rabbit generation 3 need not represent the same time cohort because species life histories, materialization windows and turnover rates differ. Each side therefore keeps its own generation series.

For every realized predator→prey pair, the predator side groups interacting predators by predator generation and reports hunt hit/kill performance, reproduction-eligible breeder rate, offspring mean, actor trait means and the already-recorded predator-minus-prey trait advantages. The prey side independently groups interacting prey by prey generation and reports escape/attack-survival performance, the same reproductive outcomes, prey trait means and prey-minus-predator advantages.

Within each side only, deterministic analysis computes generation slopes for performance, terminal performance, breeder rate, offspring mean and trait means. It also computes cross-generation correlations between realized performance and breeder/offspring outcomes and between realized performance and each trait mean. Correlations require at least three usable generation points and non-zero variance; trends require at least two usable points. Missing or constant evidence remains `null`, not zero.

A pair is marked bilateral only when both predator and prey sides contain realized evidence. One-sided historical evidence remains visible as partial evidence rather than being synthesized into an absent counterpart series. These measurements still do not prove coevolution: correlated habitat, population composition, disease, age structure, Decision Provider behavior choices and other traits can influence both performance and reproduction. God View and `GET /api/world/evolution` expose the underlying independent series and associations so later analysis can test stronger coevolution hypotheses without changing simulation authority.

## Multi-species interaction network observability

Predation, niche competition, and cross-species disease transmission now expose complete pair decompositions from the deterministic coarse ecology layer. Predation and disease edges are directed; niche competition is symmetric. The decompositions are additive optional fields so legacy coarse snapshots that only contain aggregate or strongest-pair summaries remain valid.

`computeWildlifeInteractionNetwork()` is a pure read-only derivation over coarse chunks. For each interaction kind it first counts only chunks that actually contain that kind's full pair decomposition. That count is the coverage denominator. Inside a covered chunk, a missing edge contributes zero pressure; a legacy chunk with no decomposition contributes no observation at all. This preserves the distinction between measured absence and unknown historical evidence.

Network edges report mean pressure over covered chunks, maximum observed pressure, active-chunk count, directionality and species endpoints. Species nodes aggregate population plus predation incoming/outgoing pressure, symmetric competition pressure, disease incoming/outgoing pressure and the number of active interaction kinds. None of these values feed back into carrying capacity, health, population, disease, predation or Decision Provider inputs; they are observability-only derived evidence.

The browser God View derives the network only from the bounded active chunk window and caches it briefly, so moving the out-of-world observer does not generate/explore chunks and the cost does not grow with persistent discovered-world history. The server endpoint `GET /api/world/interactions` derives the same structure from all persisted coarse chunks, providing a discovered-world research view. These two scopes are intentionally different and should not be compared without noting their chunk coverage.

## Network-linked competition and disease source evidence

The interaction network provides community-level edges, but evolutionary evidence needs the actual pressures experienced by named fine individuals. During observed fine lifetime intervals, lineage exposure now samples two additional source decompositions from the current coarse chunk: symmetric niche-competition pressure by counterpart species and incoming cross-species disease-transmission pressure by source species.

Each source family has its own time-weighted mean and its own source-observed-day denominator. If a legacy chunk lacks the full competition or disease pair decomposition, that interval does not count as source-observed time for that family. Once decomposition exists, a legal counterpart/source with measured zero pressure contributes a real zero. This preserves the distinction between unknown historical evidence and observed absence.

Evolution statistics derive source-specific fitness evidence for competition and disease using the same reproductive right-censoring rules as the existing fitness-by-habitat and predator-source layers. For each source species with at least one positive observed exposure, the analysis reports total samples, reproduction-eligible samples, lifespan samples, exposure mean, breeder/non-breeder exposure means, correlations with reproduction/offspring/lifespan, and breeder-vs-eligible trait differentials. Living juveniles do not enter reproductive outcomes before adulthood; dead juveniles remain completed non-reproductive outcomes.

These values are observational associations. A high goat-competition exposure associated with lower rabbit reproduction, or fox-origin disease exposure associated with a trait differential, does not prove that the source caused the outcome. Habitat, total density, season, predation, migration, age structure, correlated traits and other interaction edges may covary. God View therefore surfaces source identity, sample sizes and raw associations rather than producing a causal selection score.

## Generation-level competition and disease source evidence

Source-specific lifetime exposure is now grouped by the target species' own generation. For each competition or disease relationship, the evidence system builds an independent `target ← source` series containing observed individuals, reproduction-eligible individuals, deaths, mean source pressure, breeder rate, offspring mean, death-sample lifespan mean, trait mean and breeder trait differential.

Two species in the same relationship are never aligned by generation number. A rabbit generation 4 exposed to goats and a goat generation 4 exposed to rabbits are separate histories because turnover and observation windows differ. The reciprocal pair wrapper only places the two independent sides beside each other and marks whether both have observed source history; it does not manufacture synchronized cohorts or reciprocal causation.

Within each side, trends require at least two usable generation points. Correlations require at least three usable points and non-zero variance. Pressure-vs-breeder and pressure-vs-offspring use reproduction-eligible generation points. Pressure-vs-lifespan uses only the mean source pressure of dead individuals in each generation, matching the lifespan sample rather than mixing living exposure into a mortality outcome. Trait means use all source-observed individuals in that generation, so reproductive right-censoring does not alter the inherited-trait cohort itself.

God View presents recent raw generation points together with pressure, reproductive, lifespan and trait trends/associations. `GET /api/world/evolution` exports the same derived evidence from persisted lineage history. These remain observational measurements: bilateral trends can motivate reciprocal-selection hypotheses, but do not by themselves prove reciprocal selection.

## Multi-factor interaction selection evidence

Single-source correlations can be misleading when an animal experiences several pressures together. The evolution layer therefore derives outcome-specific multi-factor models from the durable predator-source, competition-source, and disease-source lifetime exposure means. These models remain read-only research evidence; they never alter health, reproduction, population, traits, or Decision Provider candidates.

Feature inclusion is coverage-aware. Missing source history is unknown, not zero. A candidate source must have at least six observed outcome-eligible samples, positive observed pressure, and non-zero variance. Features are added greedily only while the resulting complete-case set retains at least `max(8, 3 × featureCount)` samples, with a hard cap of six features. A model requires at least two varying source features. If coverage or outcome variance is insufficient, it is returned as explicitly non-estimable instead of emitting zero coefficients.

Before any regularized coefficient is emitted, the standardized **unregularized** predictor correlation matrix is diagnosed. The model is marked `unstable_collinearity` when that matrix is singular, when `max|rX| >= 0.98`, or when the maximum variance-inflation factor exceeds `10`; coefficients remain `null` in that state. This deliberately prevents ridge regularization from turning an unidentifiable exposure design into apparently precise evidence.

For each design that passes those diagnostics, predictors and outcome are standardized over the complete-case sample and the system solves a deterministic ridge regression with fixed `λ = 0.25`; coefficients are therefore standardized regularized associations (`β*`), not causal effects. Reproduction uses the right-censored breeder outcome, offspring uses reproduction-eligible offspring count, and lifespan uses only dead individuals. The model reports in-sample `R²`, maximum absolute pairwise predictor correlation (`max|rX|`), maximum VIF, and an explicit model status so fit and stability remain inspectable beside the coefficients.

The same lineage can support different feature sets for different outcomes because reproductive eligibility and death completion differ. This is intentional: no missing-data imputation is performed merely to force one common matrix. Synthetic tests use orthogonal exposure designs to verify coefficient direction and separate tests ensure disjoint legacy source coverage cannot be combined into a fabricated complete-case model.
