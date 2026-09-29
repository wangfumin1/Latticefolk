# Third-party asset manifest

This file records scene assets added to Latticefolk. Detailed notices remain in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

| Local path | Source asset | Upstream | License | Modification |
| --- | --- | --- | --- | --- |
| `public/assets/quaternius/fantasy-props-standard/Bench.*` | Bench | Quaternius Fantasy Props MegaKit [Standard], pinned mirror `agentkaerf/FreeModels@db3df04d1e4714298a09510b26fb6de6645138a2` | CC0 1.0 | Geometry/buffer preserved; shared texture-atlas references replaced with compact flat PBR material factors |
| `public/assets/quaternius/fantasy-props-standard/Bed_Twin1.*` | Bed_Twin1 | same | CC0 1.0 | same |
| `public/assets/quaternius/fantasy-props-standard/Stall_Empty.*` | Stall_Empty | same | CC0 1.0 | same |
| `public/assets/quaternius/fantasy-props-standard/Workbench.*` | Workbench | same | CC0 1.0 | same |
| `public/assets/quaternius/fantasy-props-standard/WeaponStand.*` | WeaponStand | same | CC0 1.0 | same |
| `public/assets/kenney/nature/crops_dirtDoubleRow.glb` | crops_dirtDoubleRow | Kenney, pinned mirror `shorepine/kenney@3694c6879e487c108f55677be7dd2ca75b07cc3b` | CC0 1.0 | Unchanged `*.source.glb`; hash-pinned preparation changes only metallicFactor 1→0 in served GLBs; original colors/geometry preserved |
| `public/assets/kenney/nature/crops_wheatStageB.glb` | crops_wheatStageB | same | CC0 1.0 | Unchanged `*.source.glb`; hash-pinned preparation changes only metallicFactor 1→0 in served GLBs; original colors/geometry preserved |
| `public/assets/quaternius/medieval-village/Well.source.fbx` | Well.fbx | Quaternius Medieval Village Pack; original vendored Git blob `9c7a673008eec4c916ff0e56245542b11a657b34` | CC0 | Unchanged source. Dev/build derive `Well.fbx` with five opaque-material transparency vectors corrected; geometry/vertex data unchanged. See [asset preparation](docs/asset-preparation.md). |
| `public/assets/firefly-in-the-dusk/cast-iron-stove/*` | Cast Iron Stove (complete wood-fired baking oven) | Firefly in the Dusk, [author publication](https://opengameart.org/content/cast-iron-stove), archive SHA-256 `ea72cf242b76d25e70aff9e3b5277d7f232bf2feac9e137b69595e430f3b87db` | CC0 1.0 | Source bytes unchanged; offline hash-pinned scene selection instantiates only the complete oven, not overlapping variants or cookware; no geometry/material edits |
