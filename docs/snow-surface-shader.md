# Snow Surface Shader architecture

Snow is a reusable cross-domain surface layer. It is not a white tint owned
independently by Ground, Grass, Rock, Buildings, or Props.

The Snow Surface module belongs to the **Weather Rendering & Surface Shader
Lab** and the public `@call-me-sensei/toonlab/weather` library. A style bundle
selects one snow-surface profile. Every compatible receiving material consumes
that profile with its own semantic retention data.

The module is currently **In progress** in both the lab and npm library. Its
presence in source, a successful build, or use by the Grass Shader Lab preview
does not make it Ready.

## Ownership boundary

| Owner | Owns | Does not own |
| --- | --- | --- |
| Snow Surface Shader | Powder/crust color, cool shadow body, macro mounds, granule breakup, roughness, sparkle, melt response, and coverage-edge presentation | Current storm, current accumulation amount, collision, drifts, footprints, or mesh generation |
| Snow Accumulation / Weather state | Current normalized coverage, depth, melt, slope/occlusion deposition, shelter, clearing, and transitions | The rendered snow style |
| Receiving shader | Semantic retention/exposure inputs and composition with its base surface | A private replacement snow appearance |
| Asset or procedural generator | Stable labels, upward/exposed masks, cavities, vegetation roots/tips, and optional baked retention channels | Current weather or a style-bundle decision |

At zero coverage the composed snow layer must be a strict visual and semantic
no-op. The accepted dry material remains restorable without reconstructing the
asset.

Ground Shader Lab therefore exposes snow only as preview state. Its portable
Ground document may save receiving behavior such as retention or wet response,
but it must not serialize powder color, sparkle, current snow amount, storm
state, or a private ground-only snow implementation. The preview composes the
selected Snow Surface profile over the accepted P18 ground and removes that
layer again at zero coverage.

## Required receiving roles

Imported and generated assets should label snow-compatible parts explicitly:

| Role/channel | Meaning |
| --- | --- |
| `surface.snowReceiver` | Surface can receive accumulated snow |
| `surface.snowExclusion` | Openings, interiors, active heat, or other areas that reject snow |
| `surface.snowRetention` | Optional scalar multiplier for local accumulation |
| `surface.snowShelter` | Optional occlusion/shelter amount supplied by the asset or world |
| `vegetation.root` / `vegetation.tip` | Allows burial and exposed-tip treatment |
| `rock.top` / `rock.cavity` | Allows top accumulation without filling vertical faces identically |

Absence of an optional channel uses a documented geometric fallback. It must
never be interpreted as full accumulation on every face.

## Portable Snow Surface profile

The initial OSS runtime is `src/weather/snowSurfaceShader.js`. The complete
current parameter surface is:

| Group | Field | Purpose |
| --- | --- | --- |
| Color | Powder Tint | Lit powder body in sRGB |
| Color | Snow Shadow Tint | Cool internal/shadow body |
| Color | Shadow Body | Amount of cool body visible on slopes and powder troughs |
| Coverage | Coverage Contrast | Sharpness of the accumulation transition |
| Coverage | Edge Noise Scale | World scale of broken coverage edges |
| Coverage | Edge Breakup | Amount of edge noise applied to incoming coverage |
| Structure | Powder Mound Scale | World scale of low-frequency accumulation variation |
| Structure | Powder Mound Strength | Albedo/body variation across mounds |
| Structure | Granule Scale | World scale of fine powder variation |
| Structure | Granule Strength | Fine powder color breakup |
| Structure | Powder Trough Depth | Cool/dark body retained in shallow troughs |
| Response | Powder Roughness | Dry powder roughness |
| Response | Powder Specular | Base snow specular response |
| Response | Sparkle Scale | Spatial density of crystalline highlights |
| Response | Sparkle Strength | Strength of sparse crystalline highlights |
| Response | Sparkle Threshold | Rarity of crystalline highlights |
| Response | Melt Darkening | Albedo loss as the host-provided melt amount rises |
| Response | Melt Roughness | Roughness of melting/compacted snow |

Subsurface/forward scatter, a true micro-normal, crust/powder blending,
distance-tier behavior, and depth/displacement are required before Ready. They
must be added to this shared module rather than reimplemented in each consumer.

## Grass composition

Deep snow in Grass Shader Lab is a composed test:

1. Snow Accumulation supplies coverage `1`.
2. The shared Snow Surface shader covers the ground.
3. Grass V2 lowers blades by seeded amounts so the ground actually occludes
   their roots.
4. Exposed blade sections retain grass color.
5. Only upward-facing tips receive a limited snow cap.

Whitening every grass card while leaving the ground visible is a failed
implementation and must not be accepted.

## Required lab validation

The Weather Rendering & Surface Shader Lab needs at least these fixed fixtures:

- open ground with small and large slopes;
- rock top, vertical face, cavity, and overhang;
- dense and sparse grass with root/tip labels;
- tree bark and leaf cards;
- manufactured roof, ledge, warm/excluded surface, and doorway shelter;
- footprint/depression and plowed/cleared boundary;
- dry powder, compacted snow, crust, active melt, and refreeze states.

Every fixture is tested at Dawn, Day, Sunset, and Night using the universal
preview environment. Day approval requires readable cool body shadows without
clipping the powder body to white.

## Ready gates

Both statuses remain **In progress** until:

- the Snow section exposes every portable field and every control is live;
- coverage, melt, and depth are explicit preview inputs and excluded from the
  exported style profile;
- the same profile is consumed by Ground, Rock, Vegetation, and Manufactured
  Surface fixtures;
- zero-coverage restoration is proven;
- WebGPU and supported fallback behavior are documented and verified;
- reference screenshots pass visual review at all four time anchors;
- versioned document parse/serialize/migration and public npm exports pass.
