# Changelog

All notable changes to Latticefolk will be documented here.

The project is currently pre-1.0 and evolving rapidly.

## [Unreleased]

### Added

- Unified capability-based interactions for buildings, props, resources, storage, and the new CC0 well asset.
- Expanded NPC action set with harvesting, crafting, trade, gifts, deliveries, water collection, patrols, visits, sleep, and exploration.
- Jev token/cost budget controller with God-mode runtime controls, presets, caching, confidence gating, and call-class accounting.
- Coarse distant-chunk policy decisions using batched provider calls.
- Multilingual UI and authored dialogue seeds for Simplified Chinese, English, Japanese, and Spanish.
- Multilingual project overviews, repository cover, badges, citation metadata, and expanded acknowledgements.
- First-pass coarse↔fine distant-chunk materialization with deterministic settlement/resource planning, representative residents, in-session identity restoration, and coarse-state feedback.
- SQLite world persistence for coarse chunks, visited fine chunks, home-town entities, player inventory/location, time, and weather, including periodic transactional saves.
- Conserved neighbor-to-neighbor coarse-world flows for migration, food, wood, water, and ecology spread, with explicit source/destination flow records and conservation tests.
- Hierarchical Region and World policy decisions with slower provider cadence, separate Jev budget weights, and deterministic policy interpretation.
- Unbounded first-person coarse-world streaming with a fixed active window, persistent discovered chunks, observer-safe God View, and O(n) neighbor flow planning.
- Semantic procedural fine-chunk settlements with deterministic archetypes, roads, functional buildings/sites, role-aware residents, and resource placement that avoids roads/buildings.
- Shared deterministic production recipes for NPCs and players, including flour/bread and plank/tool multi-step chains with localized new item types.
- Persistent coarse/fine wildlife ecology for rabbit/deer/boar/fox populations, habitat carrying capacity, conserved migration, fine needs/predation/reproduction, inheritable traits, batched Jev decisions, interactive inspection, and SQLite wildlife persistence.

### Changed

- Building/market model scale is calibrated by footprint instead of height alone.
- Jev prompts and dialogue candidate sets are trimmed to reduce input-token usage.
- Dialogue retrieval isolates candidates by locale before model selection.

## [0.1.0] - 2026-09-21

### Added

- Initial 3D autonomous-NPC town sandbox.
- First-person and out-of-world god observer modes.
- Provider-neutral decision layer with local fallback and optional Jev adapter.
- Indexed authored-dialogue selection with line and fragment modes.
- Quaternius Cube World Kit CC0 characters and environment assets.
- Open-source project structure, documentation, tests, and CI template.
