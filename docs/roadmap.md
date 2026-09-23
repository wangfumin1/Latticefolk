# Roadmap

Latticefolk is an early autonomous-world sandbox. Near-term work is focused on making the current town genuinely playable; long-term work moves from a fixed demo town toward a persistent, procedural living world. Decision engines remain replaceable and never become authoritative over simulation truth.

## Near term — playable town

- Replace placeholder buildings with authored or modular CC0 asset catalogs while keeping collision/navigation data independent from visuals.
- Expand world size, population, schedules, households, ownership, interiors, and points of interest.
- Add richer player/NPC interactions: item exchange, buying/selling, harvesting, crafting, storage, tool use, construction, requests, favors, jobs, and reputation.
- Production chains, trade, money flow, stock, scarcity, and resource ownership.
- Persistent saves and deterministic world seeds.
- Long-term NPC goals, schedules, households, ownership, memory, and relationship history.
- Decision batching, event-driven re-decisions, spatial partitioning, simulation LOD, and performance budgets. **Initial coarse distant-chunk runtime and first-pass coarse↔fine materialization are implemented; durable persistence is next.**
- Automated browser smoke tests and deterministic simulation tests.

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
- ⏭ Deeper ecology: add uncertainty-aware and time-local selection evidence so effects can be inspected across windows/regimes before expanding species/niches and organism morphology/behavior diversity.
- Global/region decision layers above individual chunk policy, with slower cadences and larger strategic context.
- Deterministic world seed + chunk persistence so unloaded areas retain history.
- Streaming/render LOD so visual range and simulation range are independent.
- Decision scheduling based on surprise/pressure, not fixed polling of every chunk.

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
