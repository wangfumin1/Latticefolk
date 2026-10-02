# Authored raccoon appearance

Raccoons use the pinned [Quaternius GLB and provenance](../public/assets/quaternius/wildlife/Raccoon.SOURCE.md). The presentation reads normalized phenotype and organism-genome values, including deterministic founder fallbacks, without modifying the owner's state. Simulation, inheritance, collision, movement, decisions and persistence remain authoritative and unchanged.

## Proportions and authored animation

`raccoonAppearance.ts` adapts each instance once, before creating its animation mixer. The source has 2,240 vertices rigidly weighted to seven regions: Body, Head, Tail and four legs. All 2,876 triangles stay within one region. The adapter copies the source geometry and preserves topology, UVs, skin weights and authored details.

The existing `effectiveWildlifeMorphology` axis contract is explicit: `bodyLength` scales model X, `bodyHeight` scales Y, and `sqrt(bodyLength * bodyHeight)` scales Z. Although the authored animal faces +Z, this adapter does not silently reinterpret the existing bodyLength gene as nose-to-tail length. Torso changes pivot around the source torso bounds center and move attached head, tail and leg joints. Head scale is uniform about its moved joint; leg and tail length scale along their respective authored bone axes, preserving cross-sections.

Independent region transforms prevent torso stretch from shearing the animated head. Rest joints and copied position-key values receive corresponding local offsets; clip rotations, times and interpolation remain unchanged. New inverse bind matrices retain the original glTF mesh binding basis. Replacing it with a plain inverse of the current bone world matrix would incorrectly shrink the model.

Neutral morphology (all five values equal to 1) and palette (all three shifts equal to 0) retain exact source appearance and shared resources. Uniform `traits.size` uses the existing calibrated outer scale. Geometry and joint processing never run in the per-frame animation update.

## Inherited palette without changing the source atlas

The source uses one AtlasMaterial, an embedded atlas, and white vertex colors. The adapter keeps material and texture instances unchanged and applies per-instance linear vertex-color multipliers derived from these actual atlas swatches:

| Source swatch | Authored region | Palette role |
| --- | --- | --- |
| `#674d3b` | Head | Accent |
| `#674d3b` | Body, Tail, four legs | Body |
| `#3c2815` | Mask, dark feet and tail rings | Feature |
| `#45433b` | Head details | Accent |
| `#343434` | Dark eye details | Feature |

Hue receives the inherited hue shift plus accentShift multiplied by 0 for body, 1 for accent, or 0.5 for feature. Saturation is preserved. For source HSL lightness L and normalized inherited lightness shift s, positive shifts use `L + s * (1 - L)` and negative shifts use `L * (1 + s)`. This bounded relative adjustment preserves neutral identity and the ordered contrast between fur, eyes, feet and rings; applying the procedural palette's absolute lightness floor would alter neutral dark swatches. The resulting linear target/source RGB ratio multiplies the copied vertex colors. Gray eyes remain gray under hue-only changes, and neutral palette floats are unchanged.

## Ownership and acceptance boundary

Each nonneutral instance owns its adapted geometry, cloned animation data and detached inverse-bind matrices. Skeleton bone textures remain instance-owned. Removal disposes owned geometry and skeleton resources once while retaining the cached source, shared materials, atlas and sibling instances. Failed adaptation releases its allocations and becomes an observable failed binding without poisoning the successfully loaded source asset.

Grounding fits the adapted initial skinned bounds to the authoritative ground. It is not per-frame foot IK: the source Walk clip already has about 17.6 mm of foot penetration at the standard 0.58 trait size. Real-skin tests cover neutral identity, individual gene bounds, all 32 combinations of morphology bounds through complete idle/walk/run/eat/death clips, head isolation, palette roles, state immutability and disposal. Their measured contact limits are 2.5 mm for idle/eat, 25 mm for walk, 3 mm for run, and 40 mm for the death pose. The runtime supports a death clip, but production death still removes the animal immediately.

These numeric tests do not replace browser image review, native interaction or fresh-head end-to-end evidence. Other species still use their existing procedural presentation, and this slice does not complete the broader scene-recovery work.
