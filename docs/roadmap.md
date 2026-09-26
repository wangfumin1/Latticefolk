# Roadmap

Latticefolk is an early autonomous-world sandbox. Near-term work is focused on making the current town genuinely playable; long-term work moves from a fixed demo town toward a persistent, procedural living world. Decision engines remain replaceable and never become authoritative over simulation truth.

## Near term — playable town

- Replace placeholder buildings with authored or modular CC0 asset catalogs while keeping collision/navigation data independent from visuals.
- Expand world size, population, schedules, households, ownership, interiors, and points of interest.
- Add richer player/NPC interactions: item exchange, buying/selling, harvesting, crafting, storage, tool use, construction, requests, favors, jobs, and reputation.
- Production chains, trade, money flow, stock, scarcity, and resource ownership.
- Persistent saves and deterministic world seeds.
- Long-term NPC goals, schedules, households, ownership, memory, and relationship history.
- 🚧 Decision batching, event-driven re-decisions, spatial partitioning, simulation LOD, and performance budgets. **Coarse↔fine materialization, durable persistence, pressure/surprise-driven adaptive chunk decision scheduling, and the first deterministic fine-physics spatial hash are implemented; broader entity/world spatial partitioning and performance-budget work remain.**
- ✅ Initial automated Chromium playable smoke gate with deterministic simulation tests, God View observer semantics, first-person movement, authoritative terrain runtime checks, and screenshot artifacts. Expand scenario coverage as gameplay systems grow.

## Dialogue and character voice

The authored dialogue system evolves from a flat shared corpus into layered voice libraries:

1. global reusable fragments and lines;
2. role/culture/location-specific vocabulary;
3. per-character voice fragments, habits, memories, names, and relationship references;
4. situation- and event-derived temporary phrases.

A bounded decision provider such as Jev chooses semantic intent, candidate fragments, ordering, and whether a character-specific or shared phrase should be used. Corpus growth is a separate capability: a text-generation provider may propose new fragments when a gap is detected, while validation/deduplication/moderation and persistence remain deterministic systems. This keeps Jev useful as a decision model without pretending it is a free-text language generator.

## World-scale simulation priorities

- ✅ First-pass coarse↔fine chunk materialization with in-session persistent identity and coarse resource feedback.
- ✅ Durable SQLite persistence for world/chunk/fine-entity state across restarts.
- ✅ First conserved inter-chunk flows for migration, food/wood/water trade, and ecology spread.
- ✅ Region / World decision layers above chunk policy with slower bounded strategic coordination.
- ✅ Dynamic chunk streaming and real travel beyond the original fixed world window.
- ✅ First semantic procedural settlement/environment generation with roads, functional sites, archetypes, and collision-aware resource placement.
- ✅ Shared deterministic multi-step production chains for food and tools, integrated with NPC/player workstations.
- ✅ First wildlife ecology layer: coarse populations/carrying capacity, conserved migration, fine animal entities, needs, predator/prey behavior, Jev-batched behavior choice, reproduction/inheritance, and persistence.
- ✅ Plant biomass, seasonal regrowth, trophic energy flow, disease pressure, gestation, senescence, parent IDs, and deeper fine/coarse lifecycle integration.
- ✅ Durable ancestry archive and measurable evolutionary statistics across dead + living generations, including generation cohorts, trait means/variance/trends, mortality causes, reproductive success, and God View observability.
- ✅ Selection-pressure observability: lineage outcomes are correlated with biome/habitat conditions using breeder-vs-cohort trait differentials, normalized effect size, cross-generation consistency, and sample-size-aware signal classification.
- ✅ Observation-bounded lifetime habitat history: fine individuals accumulate time-weighted habitat exposure, biome/chunk duration, and observed transitions without fabricating identity-level coarse migration history.
- ✅ Identity-preserving fine wildlife migration/transfers with bounded adjacent destinations, deterministic capacity/conservation, durable transit identity, and migration provenance.
- ✅ Deterministic niche competition: species resource-use profiles and density generate pairwise overlap pressure, effective carrying-capacity penalties, God View visibility, and lineage competition exposure.
- ✅ Seasonal migration drivers: species/biome seasonal suitability can independently create conserved coarse migration pressure and is exposed to bounded fine wildlife decisions and lineage habitat evidence.
- ✅ Richer wildlife disease transmission: environmental, same-species, cross-species, and migration-import pressure are explicit deterministic state and enter fine/lifetime observability.
- ✅ Fitness-by-habitat evidence: lifetime competition, seasonal suitability, and disease exposure are associated with reproduction, offspring count, lifespan, exposure bands, and within-band trait differentials without causal overclaiming.
- ✅ Additional wildlife/predators: goat and wolf participate in coarse carrying capacity, competition, seasonality, disease, trophic predation, fine lifecycle/behavior, migration, and evolution observability through centralized species semantics.
- ✅ Predator-pressure adaptation evidence: actual predator density and shared prey preference produce species-specific pressure that is recorded in lifetime habitat exposure and correlated with reproduction/offspring/lifespan using the existing right-censored evidence layer.
- ✅ Predator/prey specialization evidence: predator→prey pair pressure is persisted and fine lifetime exposure tracks time-weighted source pressure with separate source-observation coverage; God View exposes source-specific reproduction/offspring/lifespan associations and breeder trait differentials.
- ✅ Realized hunting/escape evidence: deterministic fine action resolution durably records hunt attempts/hits/kills, flee attempts/successes, attacks received/survived attacks, counterpart-species breakdown and God View success rates/trait differentials.
- ✅ Predator/prey trait matching and generation trends: realized fine interactions record actor-minus-counterpart trait deltas with explicit paired-snapshot coverage; God View exposes attempt/success/terminal advantages and recent generation outcome rates.
- ✅ Multi-generation coevolution evidence: each realized predator→prey pair exposes independent predator/prey generation series, performance and reproductive trends, inherited trait trends, and cross-generation associations without aligning generation numbers across species.
- ✅ Multi-species interaction-network observability: full predation, niche-competition and cross-species disease pair evidence is aggregated with per-kind legacy-safe coverage, node in/out pressure and bounded active-window God View summaries; persisted discovered-world evidence is available through `/api/world/interactions`.
- ✅ Network-linked niche/disease source evidence: fine lineage exposure records time-weighted competition counterpart pressure and incoming disease-source pressure only while observed; source-specific right-censored associations expose reproduction, offspring, lifespan and breeder trait differences.
- ✅ Generation-level competition/disease source evidence: every observed source relationship exposes independent target←source generation series with pressure, breeder/offspring/lifespan and trait trends; bilateral species-pair evidence is shown without synchronizing generation numbers or claiming reciprocal causation.
- ✅ Multi-factor interaction selection evidence: outcome-specific complete-case models combine up to six varying predator/competition/disease source pressures, diagnose the unregularized predictor matrix before fitting, reject singular / severe-collinearity designs, then fit standardized ridge associations for reproduction/offspring/lifespan while exposing coverage, R², max pairwise correlation, max VIF and explicit non-estimable states.
- ✅ Multi-factor stability / generation-local evidence: deterministic history-spanning generation-omission probes (bounded to 12) measure cohort sensitivity and comparable-feature sign/range stability; for up to six recent generation endpoints the system expands backward within an eight-generation horizon until the narrowest estimable target-species window is found, exposing local regime changes without pretending lifetime aggregate exposure has finer temporal resolution.
- ✅ Profile-driven species/niche/morphology diversity: wildlife ecology/behavior/life-history/morphology parameters are centralized in simulation-owned species profiles; badger adds an omnivore niche that both forages and hunts rabbit, while legacy coarse states and sparse pressure maps upgrade additively without fabricating historical zero exposure.
- ✅ Heritable organism phenotype: bounded morphology and behavior genes are deterministically seeded for founders, inherited/mutated for offspring, persisted on fine state/transfers/lineage, used by procedural bodies and bounded wildlife decision tendencies, and summarized by generation with explicit birth/founder/legacy-upgrade evidence provenance.
- ✅ Phenotype→function selection: morphology/behavior phenotype now maps to bounded deterministic movement speed, locomotion/maintenance energy cost, forage efficiency, recovery efficiency and fast-action cost; dominant lifetime biome evidence correlates comparable phenotype with reproduction, offspring and lifespan using right-censoring and explicit legacy exclusion.
- ✅ First generated organism-family layer: each wildlife species maps to a simulation-owned family template with deterministic founder genome plus bounded inheritance/mutation for material variation, legal plant-niche weighting, stride and endurance. Fine resource choice/consumption and locomotion consume the genome; zero trophic axes remain impossible; genome birth/death provenance is durable and evolution/God View expose generation trends and breeder differentials.
- ✅ Reusable generated organism archetypes: species profiles can now be assembled from habitat, ecology/trophic niche, procedural-body and life-history modules. Lynx validates the path as a composed `felid` that automatically enters registry-driven coarse ecology, fine materialization, predation legality, genome genetics, lineage/evolution and God View without a species-specific simulation branch.
- ✅ Expanded archetype library and runtime semantics: bison validates open-plains large-grazer/bovid composition, raccoon validates forest-wetland opportunistic-omnivore/procyonid composition, movement mode now contributes bounded fine speed/energy trade-offs, semantic capability modules constrain legal wildlife actions, and organism family ownership is sourced from the species profile rather than a duplicate mapping.
- ✅ Cross-domain organism forms: `wild`, `domesticated`, and `monster` are reusable species-form modules with deterministic settlement/danger sensitivity. Sheep validates a domesticated bovid grazer and warg validates a monster canid predator; form is visible to God View/Jev as read-only context but does not fabricate ownership/taming state.
- ✅ Reusable wildlife movement/controller execution: movement archetypes now define gait, acceleration/deceleration, turn-rate and arrival-radius semantics; fine wildlife uses a deterministic pure controller step, refuses blocked displacement, and drops transient momentum when fine entities unload while coarse simulation remains authoritative at distance.
- ✅ Authoritative domestication state: domesticated-capable individuals now have deterministic tame progress, durable ownership, `none/follow/stay/graze` commands, explicit same-owner breeding permission/inheritance, first-person resource-consuming taming, owner-anonymous provider context, God View follow suspension, conserved adjacent-chunk owner-follow transfer, and fine/transfer/lineage persistence. Species `form` remains immutable and separate from individual state.
- ✅ Fine physics authority v1: removed the duplicate runtime blocked-cell collision truth; player/NPC/wildlife now use one deterministic kinematic authority with chunk-scoped static colliders, circular dynamic collision, anti-tunnelling substeps, wall sliding and semantic triggers. Navigation passability queries the same static physics geometry, first-person interactions validate trigger overlap, materialized chunk teardown clears physics state, and God View has no player body.
- 🚧 Physics authority v2: terrain/ground contact, bounded slopes, authoritative home/fine-chunk terrain, explicit dormant chunk physics sleeping/rematerialization, the generic invisible door-collider foundation, deterministic segment/swept-circle contacts, contact-gated fine predation and first-person chop/mine consequences, and the first persisted rigid-body archetype are implemented. The licensed town cart persists canonical `rigidBodyArchetype` semantics and resolves collision parameters through a shared registry, with legacy movable snapshots upgraded on load. Next: stacking/support, additional licensed movable archetypes, projectile consequences on the same contact authority, and persisted/restored-body reconciliation. Do not add separate visible door meshes; authored building assets already contain their doors/entrances.
- Global/region decision layers above individual chunk policy, with slower cadences and larger strategic context.
- Deterministic world seed + chunk persistence so unloaded areas retain history.
- Streaming/render LOD so visual range and simulation range are independent.
- ✅ Chunk decision scheduling based on deterministic surprise/pressure/staleness urgency, with bounded priority batches, adaptive provider wake-up, materialized-chunk exclusion, and failure backoff instead of fixed 10-second polling.

## Dynamic world generation

Move from one fixed map to deterministic chunk generation inspired by voxel/sandbox games:

- **Global coarse decisions:** climate regions, biome graph, settlements, roads, rivers, resource fields, population pressure, migration, and large events.
- **Regional decisions:** district type, building lots, farms, forests, resource nodes, ecology capacity, and travel links.
- **Local fine decisions:** building modules, furniture, plants, loot, object placement, NPC action choices, and event reactions.
- Seeded generation makes worlds reproducible and permits persistent edits without regenerating unchanged chunks.

## Ecology and procedural content

- Multiple plant, animal, monster, and micro-ecology archetypes.
- Food webs, habitat/resource requirements, competition, predation, disease, weather response, and population migration.
- Procedural organisms built from constrained morphology, material, animation, stat, behavior, and habitat genes rather than arbitrary unconstrained meshes.
- Procedural buildings, villages, ruins, resource sites, roads, interiors, vegetation clusters, and environmental storytelling.
- Generated content must expose semantic tags/capabilities to the simulation, not exist only as visual decoration.

## Lifecycle, reproduction, and evolution

- Age stages, health, injury, disease, hunger, energy, fertility, pregnancy/offspring where appropriate to the species, aging, and death.
- Family/lineage records and inherited traits.
- Reproduction combines inheritable parameters with mutation and environmental selection pressure.
- Jev or another decision provider may participate in mate choice, nesting, migration, care, risk-taking, social behavior, and other bounded behavioral decisions; genetics, inheritance, physiology, and population accounting remain deterministic simulation systems.
- Long-running worlds should support measurable generational change rather than scripted cosmetic "evolution".

## Physics and world interaction

- Replace ad-hoc collision checks with a dedicated physics layer.
- Character controllers, rigid bodies, triggers, slopes, doors, movable objects, projectiles, vehicles/carts, stacking, and physical resources.
- Physics runs independently from decision providers; AI selects intentions/actions while the physics engine resolves actual motion and contact.
- Chunk streaming and simulation LOD must support physics sleeping/unloading for distant regions.

## Architecture milestones

- World/chunk persistence and entity-component separation.
- Simulation clock and event bus independent from rendering frame rate.
- Spatial index and hierarchical simulation LOD.
- Generic capability-based `WorldObject` interactions instead of hard-coded object-kind branches.
- Decision-provider API for immediate action, medium-term goals, social choices, and event reactions.
- Content-provider API for optional procedural text/model/content generation, distinct from decision providers.
- Additional decision-provider adapters beyond Jev and the deterministic fallback.
