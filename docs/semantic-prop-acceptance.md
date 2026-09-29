# Semantic prop acceptance

Part of playable-quality recovery #69 and the furniture implementation in PR #75. This is an acceptance contract, not a claim of a completed run. Exact commit/run IDs and inspected artifacts belong in the PR evidence record.

## Source integrity

`tests/semantic-prop-assets.test.ts` checks the five Quaternius furniture buffers against their pinned upstream Git blob identities. It validates buffer sizes, bounds, POSITION data and the absence of missing texture-atlas dependencies after the documented flat-material adaptation. Two Kenney crop GLBs are checked for complete embedded JSON/binary chunks and no remote runtime dependency. Asset licensing and material adaptations remain recorded in `THIRD_PARTY_ASSETS.md` and `THIRD_PARTY_NOTICES.md`.

## Playable behavior, not only model counts

`e2e/semantic-furniture.spec.ts` restores a legal starting position before each scenario. The subsequent pointer-lock look, E-key targeting, menu click and simulation consequences use the actual client. It covers a bench rest, bed sleep, market purchase, workbench work and farm harvest. Each case captures the close-range target/result screenshots and waits for an acknowledged normal save containing the resulting player inventory or time. It does not call a game action directly, teleport a running player, disable collisions, or manufacture success through client-state edits.

The existing smoke still covers resolved semantic-target counts, forbidden primitive checks, reload, first-person movement, God View, tool contact, stale-writer CAS and coarse-transition rejection. The additional cases do not replace those gates, complete the whole-world/free-play checklist, or establish that sit/sleep has a physical pose animation.

## Isolation

All browser files currently share one server-side SQLite world. Playwright therefore uses one worker explicitly. Each furniture scenario closes its browser before deleting the fixture save; this prevents an unload writer or another test from racing the next fixture. Per-worker world databases are required before enabling parallel browser files.

## Still open

The bakery/oven visual is not covered by the eight-target furniture counter and is not repaired by these tests. Scene-wide removal of primitive paths, tree occlusion, terrain joins, coarse presentation, full exploration/revisit and the remaining Phase C/D user journeys remain open in #69. No green count-only test may be used to close those acceptance items.
