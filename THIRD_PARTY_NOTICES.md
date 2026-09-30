# Third-party notices

Latticefolk's source code is licensed under the MIT License. Third-party assets and dependencies retain their own licenses.

## Quaternius — Cube World Kit

The repository includes selected files from **Cube World Kit** by Quaternius under `public/assets/quaternius/cube-world/`.

- Source: https://quaternius.com/packs/cubeworldkit.html
- Official download folder: https://drive.google.com/drive/folders/1Yyag0ibcOX6lOBY9a3m6iPnz8HwjwLFJ
- License: **CC0 / Creative Commons Zero** as displayed on the official Cube World Kit page when retrieved on 2026-09-21.
- Included assets: four animated characters, three trees, bush, rock, flowers, chest, cart, wooden axe, wooden shovel, and atlas texture.

CC0 permits copying, modification, redistribution, and commercial use without attribution. Attribution is nevertheless retained here as a project provenance record.

## Quaternius — Ultimate Fantasy RTS

The repository includes selected glTF files from **Ultimate Fantasy RTS** by Quaternius under `public/assets/quaternius/ultimate-fantasy-rts/`.

- Source: https://quaternius.com/packs/ultimatefantasyrts.html
- Official download folder: https://drive.google.com/drive/folders/1h7sztlZyavWla-JDk3jp6KiWDdMh08yd
- License: **CC0 / Creative Commons Zero** as displayed on the official pack page when retrieved on 2026-09-21.
- Included assets: houses, market, barracks, storage building, town center, windmill, farm building, crate, barrel, and mine.

These assets are used for the expanded demo town while the rendering layer remains replaceable by future modular building catalogs.

## Runtime dependencies

The npm dependencies declared in `package.json` are not vendored into this repository. Their upstream licenses apply independently. Run your package manager's license audit before redistributing a bundled product if your distribution process requires it.


## Quaternius Medieval Village Pack

Latticefolk includes the `Well.fbx` prop from Quaternius' Medieval Village Pack.

- Source: https://quaternius.com/packs/medievalvillage.html
- Author: Quaternius
- License: CC0 / public domain dedication as distributed with the pack
- Use in Latticefolk: interactive town well visual asset

The asset is redistributed with this repository under its original CC0 terms.

## Quaternius — Fantasy Props MegaKit [Standard]

Latticefolk includes selected CC0 geometry from **Fantasy Props MegaKit [Standard]** by Quaternius under `public/assets/quaternius/fantasy-props-standard/`.

- Official source: https://quaternius.com/packs/fantasypropsmegakit.html
- License: **CC0 1.0 Universal / Public Domain Dedication**
- Pinned reproducible mirror: `agentkaerf/FreeModels@db3df04d1e4714298a09510b26fb6de6645138a2`
- Included: Bench, Bed_Twin1, Stall_Empty, Workbench, WeaponStand.
- Latticefolk preserves the original geometry/buffer bytes. To avoid vendoring the pack's large shared texture atlases for these five props, the local glTF descriptors retain the original material slots with compact flat PBR material factors.

## Kenney — Nature Kit assets

Latticefolk includes selected CC0 crop GLBs from Kenney under `public/assets/kenney/nature/`.

- Creator/source: Kenney — https://kenney.nl/
- License: **CC0 1.0 Universal / Public Domain Dedication**
- Pinned reproducible mirror: `shorepine/kenney@3694c6879e487c108f55677be7dd2ca75b07cc3b`
- Unchanged originals: `crops_dirtDoubleRow.source.glb`, `crops_wheatStageB.source.glb` (upstream names omit `.source`).
- Served crop GLBs are derived by hash-pinned offline preparation that changes only four material metallic factors from 1 to 0. Geometry, binary buffers, source colors and all other material properties are unchanged; see `scripts/lib/nature-materials.mjs`.
- `ground_riverOpen.source.glb` is the unchanged pinned upstream river surface (Git blob `d5535f96668b8f14174ced652b978646da3c8d0a`). Its served `ground_riverOpen.glb` changes only the upstream water material's metallicFactor from 1 to 0 so the pale-blue surface remains visible under Latticefolk's non-IBL lighting; geometry, base color and roughness are unchanged.
- `ground_riverOpen.glb` is included byte-for-byte from `3d/nature/ground_riverOpen.glb` at the same pinned mirror commit (Git blob `d5535f96668b8f14174ced652b978646da3c8d0a`). Runtime presentation only scales its X/Z footprint and applies a small vertical placement offset; source geometry and materials remain unchanged.


## Firefly in the Dusk — Cast Iron Stove

Latticefolk includes the author's CC0 wood-fired baking oven under `public/assets/firefly-in-the-dusk/cast-iron-stove/`.

- Author publication: https://opengameart.org/content/cast-iron-stove (published 2025-12-17; license verified 2026-09-29).
- Author: **Firefly in the Dusk**.
- License: **CC0 1.0 Universal / Public Domain Dedication** — https://creativecommons.org/publicdomain/zero/1.0/.
- Original glTF archive: https://opengameart.org/sites/default/files/cast_iron_stove_gltf.zip.
- Source descriptor, binary buffer and two texture files are retained unchanged. Offline preparation selects only the complete oven node from the author's multi-variant scene. Its embedded doors are part of that source; no separate doors or substitute cookware are added.
- Reproducible hashes and the precise scene-selection adaptation are recorded in the asset folder's `SOURCE.md` and `scripts/lib/baking-oven-assets.mjs`.
