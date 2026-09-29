# Semantic prop acceptance

Part of playable-quality recovery #69 and the furniture implementation in PR #75. This is an acceptance contract, not a claim of a completed run. Exact commit/run IDs and inspected artifacts belong in the PR evidence record.

## Source integrity

`tests/semantic-prop-assets.test.ts` checks the five Quaternius furniture buffers against their pinned upstream Git blob identities. It validates buffer sizes, bounds, POSITION data and the absence of missing texture-atlas dependencies after the documented flat-material adaptation. Two Kenney crop GLBs are checked for complete embedded JSON/binary chunks and no remote runtime dependency. Asset licensing and material adaptations remain recorded in `THIRD_PARTY_ASSETS.md` and `THIRD_PARTY_NOTICES.md`.

The unchanged original well and its deterministic opacity correction are documented in [asset preparation](asset-preparation.md). Actual loader tests distinguish nonempty bounds from visible material output, and `e2e/visible-well.spec.ts` verifies the served derived asset hash, water interaction and persistence.

## Playable behavior, not only model counts

`e2e/semantic-furniture.spec.ts` restores a legal starting position before each scenario. Native Playwright clicks acquire pointer lock. Relative DOM mouse events then pass through PointerLockControls' ordinary listener, followed by native E-key and menu clicks. Absolute out-of-viewport Playwright mouse coordinates did not produce the requested relative movement in the headless runner; that harness failure must not be reported as a furniture defect. The helper never changes camera/player state directly or calls a game action resolver.

The cases cover a bench rest, bed sleep, market purchase, workbench work and farm harvest. Each captures close-range target/result screenshots and waits for a normal acknowledged save containing the resulting player inventory or time. No running player is teleported and no collision or simulation is disabled. These controlled scenarios are not an unscripted free-play pass.

The existing smoke still covers resolved semantic-target counts, forbidden primitive checks, reload, first-person movement, God View, tool contact, stale-writer CAS and coarse-transition rejection. The additional cases do not replace those gates, complete the whole-world/free-play checklist, or establish that sit/sleep has a physical pose animation.

## Isolation

All browser files currently share one server-side SQLite world. Playwright therefore uses one worker explicitly. Each furniture scenario closes its browser before deleting the fixture save; this prevents an unload writer or another test from racing the next fixture. Per-worker world databases are required before enabling parallel browser files.

## Baking oven acceptance

The original eight-target furniture counter remains unchanged. Baking ovens have a separate read-only `data-baking-ovens` record with asset identity, resolved model counts and the actual registered collider/trigger. Those diagnostics support, but never replace, visual and playable evidence.

`e2e/baking-oven.spec.ts` covers the original `oven` and a generated settlement bakery. Each starts from a lawful persisted fixture with two flour and one water, uses #76's native keyboard Start, holds native W toward the oven and checks forward progress, heading and the real collision face. Relative look travels through the normal PointerLockControls listener; native E and keyboard activation of the existing craft button perform the action. It verifies one flour + one water becoming two bread, stable entity anchors/work targets, an acknowledged SQLite save and a regular browser reload. Repeating craft with water exhausted must preserve the remaining flour and bread. Approach, collision close-up, result and reload screenshots plus persisted-result JSON are attached for review. The menu activation does not call the runtime resolver or mutate authoritative state directly. No retries, collision bypass, live teleport, or direct game-action evaluation is used.

The model's 3.6 m envelope includes the chimney; its work surface is roughly 1.08 m. The home source anchor remains stable, while only its visual is moved 0.4 m forward to clear the existing bakery facade. Actual resolved visual bounds drive collision and an exterior 0.5 m trigger margin. Generated ovens retain their original anchors without this home-specific presentation offset. Existing recipe and NPC `workAt` semantics are unchanged.

## Still open

The oven tests are controlled fixtures, not continuous town-to-remote exploration, unscripted free play, or the complete server-restart user journey. Scene-wide removal of primitive paths, tree occlusion, terrain joins, coarse presentation, full exploration/revisit and the remaining Phase C/D user journeys remain open in #69. No green count-only test may be used to close those acceptance items.
