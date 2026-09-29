# Source-grounded environment presentation

This is a Phase B implementation contract under the still-open playable recovery parent #69. It does not close scene-wide primitive cleanup, all character poses, terrain/coarse presentation, or the Phase C/D user journeys. Exact-head browser execution and actual image review remain mandatory; source geometry tests and the read-only diagnostics below cannot prove visibility by themselves.

## Tree scale, anchor and interaction

The previous common 3.5–3.8 m height fit compressed the Cube World tree crowns to first-person eye level. It also centered the complete, asymmetric canopy bounds on the semantic anchor, rather than the trunk. `treePresentation.ts` fits the unchanged licensed source at adult reference heights of 7.0/7.4/8.4 m for tree1/tree2/tree3. Existing generated height draws remain bounded visual variation; the generator, RNG consumption, entity IDs and saved positions do not change.

The fit rotates the source before centering its actual basal vertices on the semantic anchor. The resolved basal footprint, not the full canopy bounds, is registered with the existing deterministic physics authority. A nonblocking 0.65 m exterior trigger margin surrounds that footprint. Normal first-person ray targeting, overlap validation and the existing swept tool-contact query still gate chopping. Decoration trees use the same fitting rule and basal collision, with no new decorative model or placeholder. Streamed trees also pass through this calibration instead of retaining the old small-height asset-override path; unloading removes their chunk-scoped physics as before.

`tests/environment-presentation.test.ts` loads all three real source glTFs, verifies unchanged vertex buffers, rotated basal centering, the original tree-approach lane, physical blocking/contact, reachable triggers and chunk teardown. `e2e/environment-presentation.spec.ts` uses a legal pre-boot save fixture and normal console pause, native Start/W/E/menu input, acknowledged chopping inventory and ordinary reload. Approach/contact/reload screenshots and the actual registered collider/trigger are evidence for that controlled scenario, not a complete exploration journey. The original cart/God/tree smoke route remains unchanged.

## Current skinned soles, not container Y

NPC containers still take their ground height from `FinePhysicsAuthority`. `CharacterSoles` caches the original foot-weighted source vertex indices once. After each mixer update it refreshes ancestor, mesh and skin transforms, measures the deformed lowest sole in world coordinates, and adjusts only the visual model's local translation to the authoritative ground. It replaces the old 120 ms full-body bounding-box correction and its 0.35 m discard threshold. The character's X/Z, physics body, path, inventory, provider decisions and persistence schema are not rewritten by visual support.

The four sourced character models are tested through full Idle, Walk, Run, Wave, Yes and Punch clips plus crossfades at a translated, rotated, elevated parent. Independent full-geometry sampling checks the rendered minimum after correction, not a value copied from the requested ground height. Runtime `data-character-soles` records source probe counts, animation names, measured sole heights and ground heights. Browser evidence includes an ordinary decision-paused scene (active paths and animations can still advance) and sampled moving simulation poses. These are support/grounding contracts, not foot IK, sliding-free gait, sitting, sleeping or acceptance of every possible animation. Near-character head/hair clearance and missing contact-shadow cues remain distinct presentation/physics debt; the reviewed scene can still look ungrounded despite correct source-sole heights.

The disposable block-character constructor and unused invisible player-avatar meshes have been removed. God View remains an observer with no player body; selection/path overlays are UI aids, not player entities or formal scene models.

## Crop surface and dielectric materials

The two vendored Kenney crop GLBs declare all four soil/stalk/grain materials with `metallicFactor = 1`. This is a source-confirmed material problem, separate from shadow-map precision or weather lighting. Unchanged upstream bytes are now retained as `*.source.glb`; `assets:prepare` checks their SHA-256 and changes only those four factors to zero. Vertex/index/normal/UV binary data, source colors, node transforms and other material properties stay unchanged. No recolor, substitute model, new texture, global material override or shadow disabling is involved. See [asset preparation](asset-preparation.md) and the [asset manifest](../THIRD_PARTY_ASSETS.md).

Crops stand on the actual 0.12 m soil-model top rather than starting at 0.08 m inside it. The existing native harvest/persistence case continues to provide the farm close-up/result evidence. Loader/material/tamper/idempotence regressions supplement that browser evidence; they do not establish that all weather-dependent or distant shadow artifacts are solved.

## Remaining scope

Generic dropped-item boxes, water patches, procedural wildlife visuals, terrain/roads and coarse debug proxies are distinct remaining paths. Do not count the accepted eight furniture targets, ovens, or sourced tree/character replacements as whole-scene primitive elimination. Remaining models require semantically appropriate licensed sources rather than hiding targets or disguising them with unrelated props. Terrain joins, discovered-only coarse distance representation, personal-space/pose work and the full HUD/i18n/gameplay/exploration/save/restart/performance/free-play gates stay under #69, ahead of #54 and roadmap expansion.
