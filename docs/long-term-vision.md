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


## Implemented milestone: streamed persistent exploration

The coarse world can now expand as far as first-person travel reaches. Only a bounded active window is rendered, while every discovered chunk keeps persistent aggregate history. Returning to a distant region restores the same state. God View remains observation-only and cannot discover new terrain by moving the camera.

This is the foundation for larger procedural biomes, settlements, roads, ruins, ecology, and eventually multi-scale simulation far beyond the original town.


## Implemented milestone: semantic procedural settlements

Materialized chunks now choose deterministic settlement archetypes from coarse biome and strategic state. Roads, functional buildings, work sites, storage, transport props, resource sites, residents, and surrounding nature are generated together as one semantic plan. Generated content exposes gameplay capabilities instead of becoming decorative-only scenery.

The next milestone deepens production and logistics so generated farms, markets, storage, workshops, carts, and resource sites form connected multi-step systems rather than isolated interactions.


## Implemented milestone: persistent wildlife ecology

The first living non-human ecology now spans both simulation scales. Rabbit, deer, boar, and fox populations live in coarse chunks with habitat-derived carrying capacity and conserved migration. Entering a chunk materializes persistent individuals with age, sex, physiological needs, inherited traits, predator/prey behavior, mate choice, reproduction, deterministic mutation, and death. Jev participates only in bounded behavioral choice; physiology, genetics, and population accounting stay in simulation code.

The next ecology milestone introduces explicit plant biomass and trophic energy flow, then disease, seasonality, lineage records, lifespan, and stronger evolutionary selection across many generations.


## Implemented milestone: trophic ecology and lifecycle

The first ecology layer now has renewable plant biomass, seasonal productivity, herbivory/predation flow, disease pressure, local resource regeneration, pregnancy, birth cooldowns, litter sizes, senescence, parental IDs, and inherited mutation. This is sufficient for genuine generational turnover rather than one-shot spawned animals.

The next requirement is durable ancestry and statistical observability: lineages must survive ancestor death/unloading, and long-running worlds need per-species generation counts, trait means/variance, births, deaths, and selection trends that can be inspected without inferring them from currently living entities.


## Implemented milestone: durable ancestry and measurable evolution

Wildlife ancestry now survives death, unloading, and later sparse saves in an independent SQLite lineage archive. Founders are distinguished from actual reproductive births; terminal deaths carry normalized causes; parents accumulate offspring counts; and per-species/per-generation cohorts expose trait means, variance, trends, lifespan, mortality, and reproductive success. God View can inspect these metrics and selected-animal ancestry without turning the observer into a world entity.

The next evolution milestone is environmental selection observability: connect lineage outcomes to biome and habitat conditions, measure survival-to-reproduction under those pressures, and expose enough evidence to distinguish persistent selection from random drift.

## Implemented milestone: biome-linked selection evidence

Lineages now retain habitat context and can be grouped by origin biome. The simulation compares breeders with their observed cohort, reports normalized trait differentials, cross-generation direction consistency, generation/sample counts, and habitat conditions, then classifies the evidence as insufficient, weak, or persistent. This makes questions such as “is forest wariness rising because successful breeders are consistently more wary?” measurable without treating correlation as proof of causality.

The next ecology step expands exposure history beyond origin/death snapshots: migration history, competition and niche pressure, seasonal movement, richer disease transmission, and more species should feed the same deterministic evidence layer.

## Implemented milestone: observed lifetime habitat exposure

Lineages now retain more than two endpoint snapshots. While a named animal is actually running in fine simulation, Latticefolk accumulates observed habitat duration and time-weighted environmental conditions, including biome/chunk exposure and observed transitions. Coarse intervals remain aggregate-only and are not retroactively invented as individual history.

This enables a second adaptation view based on the dominant biome actually observed during an individual's fine-sim lifetime, alongside the existing origin-biome analysis. The next step is to create identity-preserving fine migration/transfer semantics and then add niche competition, seasonal movement, richer disease transmission, and additional species.

## Implemented milestone: identity-preserving fine migration

Named fine wildlife can cross into adjacent chunks without being destroyed and regenerated as unrelated procedural animals. The same entity ID, ancestry, inherited traits, pregnancy state and observed habitat history survive the transfer. The provider only selects a legal migration intention/destination; deterministic simulation performs carrying-capacity validation, representative population conservation, entry placement, energy cost, persistence and lineage provenance.

Unmaterialized destinations use a durable transit queue rather than a fake visited fine snapshot. Migrants retain their coarse representative weight after arrival, so later mortality or onward migration remains quantitatively consistent. The next ecological phase can build on this identity continuity for niche competition, seasonal movement, disease transmission and richer predator/prey networks.

## Implemented milestone: deterministic niche competition

Rabbit, deer, boar and fox no longer behave as ecologically isolated populations. Fixed simulation-owned resource profiles define how strongly their niches overlap; observed population density converts that overlap into explicit competition pressure. The pressure reduces effective carrying capacity within a bounded range, contributes to population health, appears in God View, and is captured in lineage habitat exposure for later selection analysis.

This creates a deterministic bridge from community composition to evolution observability: future analyses can ask whether trait success changes under sustained high competition rather than treating biome alone as the environmental cause. The next ecological milestones are seasonal migration drivers, richer disease transmission and additional species/predators.

## Implemented milestone: seasonal migration drivers

Wildlife movement now changes with the season rather than reacting only to crowding and immediate habitat degradation. Species-specific biome preferences combine with current forage, water, ecology and danger to produce seasonal suitability. Neighboring chunks with materially better seasonal suitability can pull a small conserved population flow even before density becomes extreme, while all movement remains capacity-bounded and traceable.

Fine individuals see the same simulation-derived seasonal suitability in their bounded migration candidates, and lineage exposure records the suitability actually observed during fine simulation. The next ecological milestones are richer disease transmission, additional species/predators and explicit fitness-by-habitat measures that can use competition and seasonal exposure together.

## Implemented milestone: richer disease transmission

Wildlife disease now propagates through several explicit mechanisms instead of only rising with crowding. Weather/biome conditions contribute environmental pressure, dense infected conspecifics contribute local pressure, other species contribute cross-species pressure through fixed contact coefficients, and migration imports disease pressure across chunk boundaries while preserving population conservation.

Fine animals also exchange disease pressure through actual nearby contacts, making identity-preserving migration and predator/prey proximity relevant to disease history. God View can inspect aggregate disease pressure and the strongest transmission direction, and lineage exposure retains observed disease pressure for future selection analysis.

The next ecology step is additional species/predators plus explicit fitness-by-habitat analysis that combines competition, seasonal suitability, disease exposure, survival and reproductive success.

## Implemented milestone: fitness-by-habitat evidence

Evolution observability now links measured lifetime environment to concrete outcomes. For competition, seasonal suitability and disease pressure, God View can inspect whether higher exposure is associated with reproduction, offspring count or lifespan, and compare breeder rates and trait differentials across low/medium/high exposure cohorts. This is a measurable bridge from community ecology to lineage success without presenting correlation as proof of selection causality.

The next ecology expansion is additional species and predators. Their new trophic relationships should feed the same evidence layer so future worlds can measure predator pressure, prey specialization, niche displacement and multi-species adaptation across many generations.
