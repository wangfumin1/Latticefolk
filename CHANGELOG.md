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
