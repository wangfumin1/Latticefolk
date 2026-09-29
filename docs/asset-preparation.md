# Reproducible scene-asset preparation

## Corrected invisible well

The vendored Quaternius Medieval Village well was present in the scene graph and passed dimension/raycast checks but remained invisible: all five source materials contained `TransparentColor = (1,1,1)` without an explicit opacity. Three.js r180 `FBXLoader.parseParameters()` uses `1 - TransparentColor[0]` in that case, producing opacity zero for every material. Earlier size-only well acceptance did not establish visible rendering and must not be reused as evidence for this repair.

The original 54,124-byte asset is retained unchanged as `public/assets/quaternius/medieval-village/Well.source.fbx`, Git blob `9c7a673008eec4c916ff0e56245542b11a657b34`. `scripts/lib/well-materials.mjs` accepts only its reviewed SHA-256. It changes the five opaque materials' transparency vectors to zero, then verifies the exact output SHA-256. Only 30 bytes differ; source geometry, transforms, material colors and topology are unchanged. This is not a generic force-opaque rule and it cannot modify arbitrary transparent models.

`npm run dev` (including `run.bat`), `npm run dev:web`, and `npm run build` automatically run `assets:prepare`. It performs no network requests and needs only Node's built-in modules. An already-correct output is verified without rewriting; a stale output is replaced through a process-local temporary file. `Well.fbx` is derived and ignored by Git, while Vite includes it in the built public assets. The production server serves the prepared build. Direct Vite CLI use, bypassing npm scripts, requires running `npm run assets:prepare` first.

`tests/well-materials.test.ts` reproduces the old opacity-zero result using the actual FBX loader, verifies opacity-one output, compares geometry/transforms/bounds, rejects unexpected source bytes and checks repeated preparation. Browser acceptance additionally verifies the served runtime hash, targets the visible well and performs an ordinary draw-water interaction before checking persisted inventory and representative screenshots.

When changing the source asset, re-review license, source identity, actual rendering and the output hash before updating the adapter. A hash mismatch fails explicitly instead of silently applying a guessed binary patch.

## Known remaining presentation debt

The bakery/oven model is still unresolved. Furniture coverage does not establish scene-wide elimination of primitive paths, tree occlusion recovery, continuous terrain presentation, or a completed free-play pass. Those acceptance items remain under #69.
