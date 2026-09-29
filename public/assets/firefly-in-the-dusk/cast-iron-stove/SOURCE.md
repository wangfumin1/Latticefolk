# Cast Iron Stove — source and license

Author: **Firefly in the Dusk**. Original publication: **2025-12-17**.

Author publication: https://opengameart.org/content/cast-iron-stove

Original release: https://opengameart.org/sites/default/files/cast_iron_stove_gltf.zip

License: **CC0 1.0 Universal / Public Domain Dedication**, linked on the author's publication to https://creativecommons.org/publicdomain/zero/1.0/. Retrieved and verified on 2026-09-29. Attribution is not required by the author; it is retained here for provenance. This is a sourced wood-fired cooking/baking oven: the author identifies the left chamber as the fire chamber, right chamber as the main oven and lower right chamber as a cooler slow-roasting oven. It is not an unrelated pot/table substituted for an oven.

Archive SHA-256: `ea72cf242b76d25e70aff9e3b5277d7f232bf2feac9e137b69595e430f3b87db`.

## Vendored bytes

| File | SHA-256 | Treatment |
| --- | --- | --- |
| `CastIronStove.source.gltf` | `84b2ade29c28dc2c48c3e53860bcfb49534958223c7de1666894c97e95ec24c8` | Original `CastIronStove.gltf`, renamed only |
| `CastIronStove.bin` | `de112c860dab68c5ff985a00055cc2b267de531ae38357c710ed2e1ded01652e` | Unchanged original geometry buffer |
| `CastIronStoveTex.png` | `7c00423d5e6a3e74ed568e099b272b7a90bd4d2fcf8a9060c34363d5dcca010a` | Unchanged original texture |
| `FriedEggTexture.png` | `c467effdc947981a9cb5677eb87ff30243bc4330ae768c9a928ac407bf835c3f` | Unchanged dependency retained by the original descriptor; not instantiated in the selected scene |

`npm run assets:prepare` verifies these four hashes and derives `CastIronStove.gltf` offline. The only semantic descriptor change is `scenes[0].nodes = [0]`: select the author's complete **CastIronStove** with its own embedded doors, instead of simultaneously rendering the overlapping no-door variant, separate parts and cookware. All original nodes, meshes, buffers, accessors, transforms, materials, images and textures are preserved. No new model geometry, material, extra visible door, or missing-asset primitive is authored by Latticefolk. The derived descriptor is ignored by Git and regenerated before dev/build, just like the existing well.

The world loader uniformly scales the complete model to a maximum 3.6 m chimney height within a 1.4 m × 0.9 m footprint; the source's cooking surface is approximately 1.08 m high, not 3.6 m. The home visual has a 0.4 m forward presentation offset to clear the repaired bakery facade; the saved `oven` anchor and NPC work target do not move. Collision and the surrounding interaction trigger derive from the resolved model's actual world bounds.
