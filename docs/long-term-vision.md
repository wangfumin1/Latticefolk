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

Evolution observability now links measured lifetime environment to concrete outcomes. For competition, seasonal suitability and disease pressure, God View can inspect whether higher exposure is associated with reproduction, offspring count or lifespan, and compare breeder rates and trait differentials across low/medium/high exposure cohorts. Living juveniles are right-censored until they have had a reproductive opportunity, while juvenile deaths remain completed fitness outcomes; insufficient or zero-variance samples are shown as unavailable rather than as a false zero correlation. This is a measurable bridge from community ecology to lineage success without presenting correlation as proof of selection causality.

The next ecology expansion is additional species and predators. Their new trophic relationships should feed the same evidence layer so future worlds can measure predator pressure, prey specialization, niche displacement and multi-species adaptation across many generations.

## Implemented milestone: goat and wolf food-web expansion

The wildlife model has expanded beyond the original rabbit/deer/boar/fox quartet. Goat adds a hills/dryland herbivore whose grass/shrub niche overlaps existing herbivores in new ways; wolf adds a higher trophic predator that can hunt rabbit, deer, boar, goat and, weakly, fox. Both species participate in the same deterministic carrying-capacity, competition, seasonality, disease, migration, life-history, lineage and evolution systems as the original species.

A shared species/predator module now prevents coarse and fine simulation from maintaining separate food-web truths. Predator-prey legality, preference, fine damage and hunger relief are simulation-owned definitions; Decision Providers only choose legal bounded intentions. This is the first step toward a larger extensible food web rather than a growing set of one-off species branches.

The next ecology work should extend predator pressure and multi-species adaptation observability, then broaden niches/species and eventually connect morphology genes, movement/body constraints and organism generation to these same authoritative ecological rules.

## Implemented milestone: predator-pressure adaptation evidence

The expanded food web now feeds the same measurable evolutionary evidence layer as competition, seasonality and disease. Rabbit, deer, boar, goat, fox and wolf receive species-specific predator pressure based on the real predator populations present in the chunk and the shared predator/prey preference graph. Pressure is observable even before a kill occurs, while actual mortality remains a separate deterministic predation event.

Named fine individuals accumulate the predator pressure they actually experienced during observed lifetime habitat exposure. God View can compare low/medium/high pressure cohorts and reproduction, offspring and lifespan associations without claiming causality. This creates the first direct bridge from multi-trophic community composition to lineage-level adaptation evidence.

The next ecology direction is more detailed predator/prey specialization and multi-species adaptation: prey-specific hunting success, escape/risk traits, richer niches and species, disease interactions, and eventually morphology/body genes that constrain movement and ecological roles.

## Implemented milestone: predator/prey specialization evidence

Predation evidence is no longer limited to one aggregate pressure value. Coarse ecology retains which predator species contributed pressure to which prey species, and named fine individuals accumulate time-weighted source pressure only while actually observed. A rabbit can therefore carry separate lifetime fox and wolf exposure means instead of one opaque combined history.

God View and evolution statistics compare source-specific exposure against reproduction, offspring count, lifespan and breeder trait differentials while preserving sample counts, right-censoring and the distinction between legacy unknown history and observed zero pressure. These statistics remain evidence of association, not proof that a specific predator caused a trait trend.

The next ecology step is realized interaction evidence: hunting success, escape success, predator/prey trait matching and multi-species feedback across generations. That moves the system from measuring that pressure was present toward measuring how inherited morphology and behavior alter actual ecological outcomes.

## Implemented milestone: realized hunting and escape evidence

The evolutionary evidence layer now distinguishes ecological pressure from actual fine-simulation outcomes. Individual predators retain how many legal hunts they attempted, hit and converted into kills; prey retain flee attempts/successes and attack-survival outcomes. The archive also keeps those counters by counterpart species, so fox→rabbit and wolf→rabbit outcomes are not collapsed together.

God View can inspect aggregate and pair-specific hit, kill, escape and survival rates together with simple success-vs-observed trait differentials. These counters come from deterministic movement, distance, damage and health resolution; Jev or another provider can choose an intention but cannot award itself a successful hunt or escape.

The next ecology step is predator/prey trait matching across generations: relate predator speed/size and prey speed/wariness to realized pair outcomes, while controlling reporting for sparse cohorts and avoiding causal overclaiming. This creates a path from environmental pressure to actual interaction performance and eventually to morphology-constrained coevolution.

## Implemented milestone: predator/prey trait matching across generations

Realized predation evidence now measures the actual trait relationship between interacting individuals. A fox hunt against a rabbit records predator-minus-prey trait deltas for the attempt and, when applicable, for the hit and kill; prey evidence records prey-minus-predator deltas for escape and attack-survival outcomes. This is materially stronger than comparing species averages because it preserves who actually interacted.

Generation-level summaries expose whether realized pair outcomes and their associated trait advantages change across generations, while explicit paired-snapshot coverage prevents pre-feature historical attempts from being misread as zero trait advantage. God View surfaces those raw rates and deltas without turning them into an automatic causal selection verdict.

The next step is multi-generation coevolution evidence: connect realized interaction performance, lineage reproductive success and inherited trait trends on both sides of a predator/prey relationship. Later morphology genes and movement constraints can feed the same evidence path rather than creating a separate evolutionary subsystem.

## Implemented milestone: multi-generation predator/prey coevolution evidence

Predator/prey evidence now reaches across generations without pretending different species share synchronized generation numbers. Each realized pair exposes two independent histories: predator generations with hunting performance, reproductive outcomes and inherited traits, and prey generations with escape/survival performance, reproductive outcomes and inherited traits.

Within each species-side history, Latticefolk can measure whether interaction performance trends with generation, whether breeder rate or offspring output changes with performance, and whether trait means move alongside realized outcomes. Sparse or invariant series remain non-estimable. Bilateral evidence means both sides have actual interaction history; a one-sided archive remains explicitly partial.

This still does not label a relationship as “coevolving” automatically. The purpose is to provide durable, inspectable evidence from which stronger selection and reciprocal-adaptation tests can later be built. The next ecology direction is to extend the same evidence model beyond one predator/prey pair into richer interaction networks, competition niches, disease-mediated selection and eventually morphology-constrained organisms.

## Implemented milestone: multi-species interaction network

Latticefolk now has one observational graph for three major wildlife interaction channels: predation, niche competition and cross-species disease transmission. This makes community structure inspectable above any single predator/prey pair without introducing a new simulation authority layer. A species node can simultaneously show incoming predation, outgoing predation, competition burden, incoming disease pressure and outgoing disease pressure.

The network explicitly carries evidence coverage. Old chunks that predate a pair decomposition do not masquerade as zero-pressure observations, while measured zero edges inside covered chunks remain valid zeros. God View stays bounded to active chunks; the server can separately summarize all persisted discovered chunks for research/export workflows.

The next ecology step is to connect these multi-species network exposures back to durable lineage and selection evidence: for example whether sustained competition centrality, incoming disease pressure, or changing multi-predator exposure corresponds to reproductive and inherited-trait trends. After that, richer species, niches and morphology genes can use the same network/evidence architecture instead of adding isolated special cases.

## Implemented milestone: network-linked niche and disease evidence

The multi-species network now connects back to durable individual history. Named animals accumulate which species actually contributed niche-competition pressure and which species contributed incoming disease-transmission pressure during the periods that individual was observed in fine simulation. This turns a community graph into lineage-level exposure evidence without making the graph authoritative.

Source-specific exposure can be compared with reproduction, offspring count, lifespan and breeder trait differentials using the same eligibility/censoring rules as other evolution evidence. Legacy history without pair decomposition remains explicitly unknown. The system still avoids automatic causal claims: source-specific associations are measurements that can support later hypotheses about competition-mediated or disease-mediated selection.

The next step is to move these source signals into generation-level evidence analogous to predator/prey coevolution, so competition and disease relationships can be inspected across generations and reciprocal species responses before adding larger food webs, new niches and morphology genes.

## Implemented milestone: reciprocal source generation evidence

Competition and disease source history now has a generational dimension. For any observed species relationship, Latticefolk can follow how source pressure, reproduction, offspring output, lifespan and inherited traits change across generations on each species side independently. If both sides have evidence they are displayed together, but the simulation does not assume their generation numbers describe the same time cohort.

This closes the first evidence loop for predation, competition and disease: community-level interaction edges can be traced into individual lifetime exposure and then into generation-level reproductive and trait histories. The result remains a measurement system rather than an automatic causal-selection engine.

The next step is multi-factor selection evidence. Real animals experience several pressures at once—multiple competitors, disease sources, predators, habitat quality and season—so stronger inference needs to distinguish correlated exposures rather than evaluating every edge only in isolation. That work should remain deterministic/observational and preserve explicit sample coverage before morphology genes and larger ecological networks are added.

## Implemented milestone: multi-factor interaction selection evidence

Evolution observability can now ask whether one source remains associated with reproductive or survival outcomes while other simultaneously observed interaction pressures are represented in the same model. Per-species models combine supported predator, competition, and disease source histories instead of evaluating every edge only in isolation.

The implementation is deliberately conservative: source coverage must overlap, at least two features must vary, sample counts scale with model width, and legacy unknowns are never filled with zeros. Before ridge fitting, the unregularized predictor matrix is checked for singularity, extreme pairwise correlation and variance inflation; severe collinearity is reported as unavailable and no coefficient is emitted. God View exposes standardized coefficients only for stable-enough designs together with coverage, model fit, maximum predictor correlation and maximum VIF.

This is still not causal inference.

## Implemented milestone: stability and generation-local selection evidence

Pooled multi-factor coefficients are now accompanied by deterministic sensitivity evidence. Latticefolk refits each outcome after omitting target-species generations, counts which refits remain estimable and feature-comparable, and summarizes coefficient ranges plus sign consistency. The probe set is bounded: up to 12 generations are sampled deterministically across the full available history, including the endpoints, so long-running worlds do not turn observability into unbounded refitting. This tests whether the pooled association is sensitive to representative cohort removal; it is explicitly a stability/sensitivity summary rather than a confidence interval.

The same layer exposes local regimes using the target species' own generation history. It examines at most six recent endpoints and searches backward through at most eight target-species generations for the narrowest trailing window that passes the existing coverage, sample-size, outcome-variance and collinearity gates; an exhausted bounded search is reported explicitly. Because persisted lineage exposure is lifetime-aggregated, Latticefolk does not claim within-lifetime calendar-time resolution that it does not possess. These overlapping local windows are observational diagnostics and are never synchronized to another species' generation numbers.

With pooled, source-specific, generation-level and stability-aware evidence now connected, ecology can expand species and phenotypes while retaining measurable consequences instead of adding cosmetic biodiversity.

## Implemented milestone: profile-driven wildlife diversity

Wildlife diversity is now driven by a single simulation-owned species profile rather than a growing collection of species switches. Trophic role, biome/season affinity, niche and resource use, carrying-capacity/growth rates, fine trait baselines, feeding/hunting semantics, life history, predation parameters and constrained procedural morphology are defined together and consumed by coarse ecology, fine materialization, fallback behavior and rendering.

Badger is the first deliberately mixed niche added through this path. It consumes plant resources and can hunt rabbit, while wolf can predate badger; the same individual still participates in disease, niche competition, migration, reproduction, lineage and evolution observability. Its low elongated striped body is procedural, so the milestone adds no external asset dependency. Old persisted species populations upgrade additively, and legacy per-species pressure maps stay sparse where the historical world never observed the newly introduced species instead of fabricating zero exposure.

## Implemented milestone: heritable phenotype structure

Selected organism parameters now exist as bounded inherited phenotype rather than fixed visual constants. Founder fine animals receive deterministic entity-seeded variation; offspring inherit parental midpoints plus deterministic bounded mutation. Morphology covers body length/height, leg length, head scale and tail scale; behavior covers forage drive, migration drive, risk tolerance and recovery drive. These genes remain inside the species envelope: species profiles still own trophic rules, life history, legal prey and baseline morphology.

Morphology phenotype changes the constrained procedural body. Behavior phenotype changes only bounded decision tendencies in the local fallback (feeding threshold, migration gain, predator flee distance and recovery threshold), and the optional Jev provider sees the same phenotype only as read-only context under the existing wildlife budget. Genetics and all consequences remain deterministic simulation truth.

The lineage archive persists phenotype-at-birth/death with `birth`, `founder_seed` or `legacy_upgrade` provenance. Evolution statistics expose known/comparable sample counts, phenotype means/variance, per-generation slopes and breeder-vs-comparable-cohort differentials. Legacy-upgrade samples are excluded from trend/differential calculations so the migration process cannot fabricate historical evolution.

## Implemented milestone: phenotype→function selection

Inherited phenotype now has deterministic functional consequences instead of being only visual/behavior-threshold metadata. A bounded pure mapping derives movement-speed, locomotion-energy, maintenance, forage-efficiency, recovery and fast-action cost multipliers. The mapping intentionally encodes trade-offs and stays close to neutral scale: e.g. longer legs can improve movement but cost more energy, while larger frames cost more to maintain. Fine simulation alone applies these effects to needs, movement and action resolution; no Decision Provider can author physiology.

Evolution observability also now asks whether phenotype and environment co-vary with completed outcomes. Comparable birth/founder phenotype records are grouped by dominant observed lifetime biome; right-censored reproductive eligibility and completed death lifespans are reused to expose breeder differential plus phenotype correlations with reproduction, offspring and lifespan. `legacy_upgrade` samples remain descriptive-only and cannot fabricate historical adaptation evidence.

## Implemented milestone: constrained organism families

Wildlife now has a second inherited layer above species profile and phenotype: a family-constrained `WildlifeOrganismGenome`. Current families are lagomorph, cervid, suiform, caprine, canid and mustelid. Each family supplies deterministic envelopes for material palette offsets, legal plant-niche preference, stride and endurance. Founders are seeded from identity; offspring inherit parental midpoints plus bounded deterministic mutation. Species identity still owns trophic role, legal prey, life history and the coarse niche, so a generated genome cannot turn a predator into a herbivore or invent a new prey edge.

The first functional use is deliberately narrow but real. Material genes vary procedural body/accent colors; locomotion genes add a bounded stride/endurance speed-versus-energy trade-off on top of phenotype physiology; plant-niche genes redistribute an individual's existing legal plant-use weights for fine forage targeting and consumption without increasing total demand or enabling a zero species axis. Fallback decisions use the same deterministic niche scoring, while Jev receives the genome only as read-only context under the existing wildlife budget.

Fine state and transfers persist the genome naturally. Durable lineage archives genome at birth/death plus `birth`, `founder_seed` or `legacy_upgrade` provenance using additive nullable columns. Evolution/God View expose family, sample coverage, means, variance, per-generation trends and breeder differentials; legacy upgrades remain descriptive-only for historical trend evidence.

The next organism step is **broader generated organism archetypes**: reuse family modules for more animals, monsters and later domesticated forms, then separate morphology/material modules further from current hand-authored species profiles while preserving semantic capabilities, coarse↔fine conservation and deterministic authority.
