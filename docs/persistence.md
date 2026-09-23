# World persistence

Latticefolk stores authoritative world snapshots in a server-side SQLite database.

## File

```text
data/latticefolk.sqlite
```

The database and its WAL/SHM sidecars are ignored by Git. It is runtime state, not source data.

## What is persisted

| Area | Data |
| --- | --- |
| World meta | day, minute of day, weather |
| Player | position and inventory |
| Coarse world | every coarse chunk's population, resources, ecology, danger, prosperity, settlement level, provider-selected policy, and decision version |
| Visited fine chunks | resident identities/state, memories, relationships, inventory, object storage, resource depletion, and persistent wildlife individuals/traits |
| Center town | NPC and interactive-object state |
| Wildlife ancestry | durable birth/death/parent/trait/phenotype/reproductive records for living and dead individuals |
| Wildlife transit | identity-preserving fine migrants waiting to materialize in their destination chunk |

The save format is currently `version: 1`.

## SQLite layout

- `world_meta`
- `coarse_chunks`
- `fine_chunks` — NPC JSON, object JSON, and wildlife JSON
- `home_state`
- `wildlife_lineage` — append-preserving ancestry/lifecycle archive independent of fine-chunk entity presence
- `wildlife_transfers` — current identity-preserving fine wildlife transit queue; unlike lineage history, completed queue entries are pruned transactionally

Writes use a single SQLite transaction so one logical snapshot cannot partially update only some simulation layers. `wildlife_lineage` is intentionally not pruned when an incoming snapshot omits an old individual: once observed, ancestry and terminal death facts remain durable. SQLite runs with WAL journaling and `synchronous=NORMAL`.

## Runtime behavior

The browser loads `GET /api/world/state` on startup. If no save exists, deterministic world generation remains authoritative.

While playing, the browser posts a complete state snapshot roughly every 15 seconds. During page unload, it also attempts a final `sendBeacon` write.

`DELETE /api/world/state` clears the save. In production this destructive operation is disabled unless `ALLOW_RUNTIME_ADMIN=true`.

## Coarse/fine interaction

A materialized distant chunk is stored as detailed resident/object state while its coarse aggregate remains the regional baseline. On re-entry after restart, the deterministic chunk plan supplies geometry/layout identity and the persisted detailed state overlays inventories, relationships, storage, resource depletion, and other mutable fields.

This is intentionally separate from procedural generation: generation answers “what should exist by seed and coarse constraints?”, persistence answers “what actually happened to it?”.

## Current limitations

- No historical save slots or rollback UI yet.
- Snapshot payloads remain version 1 while SQLite receives small backward-compatible additive migrations for fine wildlife and lineage metadata.
- Historical save slots, rollback, and export/import tooling are not implemented yet.
- Jev runtime budget settings remain configuration/runtime-control state and are not part of the world save.

When the schema begins to stabilize, migrations and explicit backup/export tooling should replace destructive development-time compatibility handling.


### Wildlife schema extension

The wildlife milestone adds a `wildlife_json` column to `fine_chunks`. Existing SQLite databases are upgraded at startup with a backward-compatible column migration and default empty wildlife arrays; no manual reset is required.

### Wildlife lineage archive

`wildlife_lineage` stores `entity_id`, species, parents, birth/death day and chunk, normalized death reason, generation, traits at birth/death, optional phenotype at birth/death plus phenotype provenance, habitat snapshots at origin/death, founder-vs-reproduction origin, offspring count, and reproductive-success state. Parent records survive entity death and fine-chunk unloading, so later generations can still traverse ancestry. The server exposes deterministic aggregate statistics at `GET /api/world/evolution`; no Decision Provider call is involved in lineage or statistics.

### Habitat snapshots for selection analysis

Lineage rows now optionally persist `birth_habitat_json`, `death_habitat_json`, and `habitat_exposure_json`. Birth/death snapshots contain biome, ecology, food, water, danger, settlement level, aggregate plant biomass, and optional species-specific niche competition pressure; lifetime exposure additionally stores observed days, time-weighted habitat means (including competition pressure when available), per-biome/per-chunk observed duration, and observed transition count. Existing databases receive additive column migrations. For reproduced offspring, the origin snapshot is the actual birth habitat; for legacy/founder individuals it is the first habitat observed by the upgraded simulation, so downstream analysis keeps that provenance limitation explicit.

### Observed lifetime exposure

Lifetime exposure is deliberately observation-bounded. While an individual is materialized in fine simulation, elapsed simulation days are accumulated into its lineage record. On chunk collapse or death the final interval is flushed; `lastObservedDay` is then cleared. When the chunk is later materialized again, observation restarts from the current world time. The coarse interval in between is not backfilled as if the simulation knew that named individual's exact path. This preserves the distinction between aggregate population migration and individual lineage evidence.

### Identity-preserving wildlife transit

Fine wildlife migration is persisted separately from `fine_chunks`. A migrant already changes the authoritative coarse source/destination population through a conserved deterministic transfer, while its named fine identity is stored in `wildlife_transfers` until the destination is materialized. This avoids treating an unvisited destination as if it already had a complete fine snapshot.

Each transfer stores the full `WildlifeState`, source/destination chunk IDs, simulation day, and `representedPopulation`. That representative weight is also carried by the migrated state after arrival so later death or onward migration folds back by the same coarse quantity rather than by a generic fine-entity scale. Completing/materializing a transfer and pruning the queue occur in the same world-snapshot transaction on the next save.

### Niche competition persistence

Coarse niche competition is part of each `CoarseChunkState`, so it is persisted automatically inside `coarse_chunks.state_json` with the rest of the authoritative aggregate ecology. Species-level `competitionPressure` is also stored on coarse wildlife populations. Fine lineage habitat JSON can carry `competitionPressure`; because it is an optional additive field, older saves remain loadable without a schema migration. New lineage habitat observations can also carry optional `seasonalSuitability`; lifetime exposure time-weights it with the other observed habitat values. Older lineage JSON remains loadable and is not backfilled.

### Wildlife disease pressure persistence

Coarse disease transmission state is embedded in `CoarseChunkState` and persists inside `coarse_chunks.state_json`: environmental pressure, species pressure, local contact, cross-species contact, migration-import pressure, and strongest transmission pair. Each coarse species population may also carry `importedDiseasePressure`, which decays deterministically after arrival. Fine lineage habitat JSON may include optional `diseasePressure`; lifetime exposure time-weights it. All fields are additive JSON state, so existing saves remain loadable without a SQLite table migration.

### Derived fitness evidence

Fitness-by-habitat statistics are intentionally **not** stored as authoritative SQLite rows. The durable facts remain lineage records, offspring/death outcomes, and observation-bounded habitat exposure. Competition/season/disease correlations and low/mid/high exposure cohorts are recomputed deterministically from those facts by `src/world/evolution.ts` and through `GET /api/world/evolution`. This prevents stale aggregate statistics from diverging from the underlying lineage archive.

### Species expansion compatibility

Goat and wolf use the same existing persistence structures as rabbit/deer/boar/fox. Their coarse populations are stored in `coarse_chunks.state_json`; named fine individuals use the existing fine wildlife arrays; ancestry, traits, deaths, offspring, habitat exposure and migration history remain in `wildlife_lineage`; identity-preserving transfers remain in `wildlife_transfers`. Because species names are additive values inside existing JSON-backed state, no SQLite schema migration is required for this expansion. Older saves that contain only the original four species are normalized deterministically when coarse wildlife populations are next ensured.

### Predator-pressure evidence persistence

Species-specific predator pressure is stored inside each coarse chunk's JSON state as `wildlifePredatorPressure`, and each coarse wildlife population may cache its current `predatorPressure`. New lineage birth/death habitat snapshots and lifetime exposure JSON may also carry optional `predatorPressure`. These are additive JSON fields in existing tables, so no SQLite schema migration is required and older saves remain loadable.

### Predator-source specialization persistence

`wildlifePredatorPressure` coarse JSON may now include a sorted `pairs` array containing deterministic predator→prey pressure decomposition. Older snapshots without `pairs` remain valid; runtime treats that field as absent legacy evidence until ecology recomputes it. Fine lineage `habitat_exposure_json` may include `predatorSourceMean` and `predatorSourceObservedDays`. Keeping source-observation coverage separate prevents historical exposure recorded before source decomposition from being interpreted as zero predator pressure. These are additive JSON fields in existing tables, so no SQLite schema migration is required.

### Realized predation outcome persistence

`wildlife_lineage` now has an optional `predation_outcomes_json` column containing durable fine-simulation hunt/flee/contact counters and counterpart-species breakdown. Existing databases are migrated in place with `ALTER TABLE ... ADD COLUMN`; legacy rows remain valid with no outcome evidence. The upsert keeps an existing JSON value when a sparse incoming lineage record omits the field. Because this evidence belongs to individual ancestry history rather than transient entity state, it survives fine-chunk unload, death and later world reloads.

### Trait-matching evidence persistence

Predator/prey trait matching extends the existing `predation_outcomes_json`; it does not add another SQLite column or table. Optional accumulated trait-delta sums and explicit paired-snapshot counts are stored inside predator/prey counterpart counters. Old JSON without these fields remains valid. Statistics use the explicit match counts rather than the total legacy hunt/flee/contact counts, so historical outcomes that lack counterpart trait snapshots remain valid realized outcomes but do not dilute trait-matching means.

### Coevolution evidence derivation

Multi-generation coevolution evidence is derived from the existing durable `wildlife_lineage` rows, including `predation_outcomes_json`, parent/reproductive fields, generations and birth/death timing. No new SQLite table or column is required. The server derives reproduction eligibility using the persisted world day/minute from `world_meta`, so `/api/world/evolution` and browser-side God View apply the same life-history semantics. Because the pair statistics are derived, old saves automatically gain the new evidence when sufficient lineage/outcome history exists.

### Interaction-network evidence persistence

Full competition and cross-species disease pair decompositions are stored as additive optional JSON fields inside existing coarse chunk state, alongside the existing predation pair decomposition. No SQLite schema migration is required because coarse chunks are already persisted as JSON. Legacy chunks without a full pair array remain loadable and are excluded from that interaction kind's network coverage denominator until coarse ecology recomputes them. The interaction network itself is derived on demand and is not separately persisted.

### Network-linked source exposure persistence

Competition and disease source histories extend the existing lineage `habitat_exposure_json` with optional `competitionSourceMean` / `competitionSourceObservedDays` and `diseaseSourceMean` / `diseaseSourceObservedDays`. No SQLite schema migration is required. Older lineage JSON without these fields remains valid and source-level statistics treat the missing history as unknown rather than zero. The underlying competition/disease pair decompositions remain additive fields inside coarse chunk JSON.

### Source generation evidence derivation

Competition/disease generation evidence adds no persistence schema. It is derived on demand from existing durable lineage fields: generation, birth/death timing, offspring count, traits, and the source-specific means/observation days already stored in `habitat_exposure_json`. The persisted world day/minute supplies reproductive eligibility for living individuals. Older rows lacking source exposure remain valid and simply contribute no source-generation evidence.

### Multi-factor selection evidence derivation

Multi-factor models add no persisted table or field. They are derived on demand from existing source-specific means/observation days in `habitat_exposure_json`, together with offspring and death history already stored in `wildlife_lineage`. Legacy rows missing one source family remain missing for that feature and are excluded from outcome-specific complete-case matrices rather than imputed as zero. Model status, pairwise-correlation/VIF diagnostics, ridge coefficients and R² are all ephemeral derived observability; unstable collinearity leaves coefficients unavailable and never changes persisted or authoritative simulation state.

Multi-factor stability and generation-local windows also require no schema change. Bounded generation-omission probes (up to 12 across available history) and local target-species generation windows (up to six recent endpoints, eight generations of backward search) are recomputed from durable lineage generations, lifetime source exposure means, reproductive outcomes and death history. No per-day exposure history is persisted yet, so the derived API/UI deliberately labels locality by target-species generation rather than fabricating within-lifetime time slices.

### Additive wildlife species profiles

Adding a configured wildlife species does not require a SQLite schema migration because coarse wildlife populations live inside chunk JSON and fine wildlife already stores a typed species value in JSON. `ensureWildlifePopulations` preserves existing species counts/state and deterministically adds newly configured populations such as `badger` when an older chunk is simulated. Legacy niche/disease/predator per-species pressure maps are intentionally sparse: missing keys for a species that did not exist when the snapshot was written remain unknown historical coverage rather than being backfilled as observed zero. Current ecology recomputation produces present-time pressure evidence from the active species profiles.

### Heritable wildlife phenotype persistence

`WildlifeState.phenotype` is persisted naturally inside fine-chunk `wildlife_json` and `wildlife_transfers.transfer_json`. Durable lineage adds three additive SQLite columns: `phenotype_at_birth_json`, `phenotype_at_death_json`, and `phenotype_provenance`. Startup migrates older `wildlife_lineage` tables with nullable columns, so existing databases remain loadable without reset.

Phenotype provenance is part of the evidence model. Offspring born after the feature exists are `birth`; deterministic newly materialized founders are `founder_seed`; a living individual loaded from a pre-phenotype save receives a deterministic entity-seeded phenotype marked `legacy_upgrade`. The last case is necessary for continued simulation but is not treated as historically observed birth phenotype. Evolution summaries may include all known samples in descriptive mean/variance, while generation slopes, breeder differentials and phenotype-by-biome fitness evidence exclude `legacy_upgrade`. Missing historical phenotype therefore stays missing evidence rather than being invented retroactively.

Phenotype→function multipliers and phenotype-by-biome statistics add no persisted columns. Functional multipliers are recomputed deterministically from the persisted phenotype whenever fine simulation runs. Habitat fitness evidence is derived from the existing lineage phenotype/provenance, offspring/death outcomes and observation-bounded `habitat_exposure_json`; it therefore cannot become a second authoritative state store or drift away from lineage facts.

### Organism-family genome persistence

`WildlifeState.organismGenome` is also persisted inside fine-chunk `wildlife_json` and `wildlife_transfers.transfer_json`. Durable lineage adds three nullable additive columns: `organism_genome_at_birth_json`, `organism_genome_at_death_json`, and `organism_genome_provenance`. Startup migration adds them to older lineage tables without resetting the world. New offspring are `birth`, newly materialized deterministic founders are `founder_seed`, and a living pre-genome individual normalized after upgrade is `legacy_upgrade`.

Family-genome means/variance may describe every known sample, while generation trends and breeder differentials exclude `legacy_upgrade` so upgrade-time deterministic seeding cannot be misread as historical evolution. Locomotion and niche effects are recomputed from the persisted genome and species/family templates; they are not stored as separate authoritative multipliers. The coarse wildlife state remains species-level: individual genome variation currently affects fine simulation only and therefore cannot silently rewrite coarse food-web rules while a chunk is unloaded.

### Generated archetype compatibility

Reusable organism archetypes add no persistence schema of their own. A living/persisted individual still stores only its ordinary `species`, phenotype/genome and other `WildlifeState` fields; `archetypeId`, organism family, habitat/ecology/body, movement mode, capability set, organism form and life-history modules are code-owned registry configuration reconstructed from `WildlifeSpeciesProfile`. The profile is the single family source, so no family ID is duplicated as a separate authoritative species mapping.

Adding composed species such as lynx, bison, raccoon, sheep or warg follows the existing additive species-upgrade path: old coarse chunks gain newly configured species deterministically when simulated, while historical sparse pressure/source maps remain unknown for those species rather than being backfilled as observed zero. Movement/capability/form modules do not need persisted runtime multipliers because they are deterministic profile configuration; inherited individual locomotion variation remains in the existing organism genome. Fine controller `moveSpeed` and rendered `heading` are also intentionally transient: only `WildlifeState.position` is authoritative/persisted. Rematerialization starts controller momentum from rest at the saved position, preventing a second movement truth from diverging from persistence. The `domesticated` form is not persisted ownership/taming state: no owner, tame progress or commands exist yet, so future domestication must add explicit authoritative fields/tables rather than infer them from the species profile. Existing lineage/persistence schema therefore stays compatible. No new third-party asset is required because the added morphology features are procedural.
