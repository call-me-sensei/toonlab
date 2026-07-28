# Definitive lab inventory and npm roadmap

This is the canonical ToonLab product surface. It is derived from everything
needed to produce and ship complete stylized real-time scenes, not from the
folders, prototypes, or editors that currently happen to exist.

The inventory is intentionally stable at the **artifact/workflow** level.
Adding another asset noun does not automatically create another lab. New
archetypes normally become modes, templates, source packs, or recipes inside
one of the labs below.

## Two independent status axes

A lab page and an npm library are different deliverables. Every roadmap card
must show both:

| Axis | Status | Meaning |
| --- | --- | --- |
| Lab | Beta | The editor is technically complete and available for beta use while production feedback and final approval are collected. |
| Lab | In progress | The editor is actively being implemented or migrated against the finalized workflow and public schema. |
| Lab | Migration required | An editor exists, but it does not yet match the finalized workflow and public schema. |
| Lab | Not started | The required dedicated editor does not exist. |
| Library | Beta | The portable runtime contract is exported, verified, and available for beta use while compatibility feedback is collected. |
| Library | In progress | The portable runtime or schema is actively being completed for the approved npm contract. |
| Library | Migration required | Some implementation exists, but its public contract is not approved for npm. |
| Library | Not started | No accepted portable library contract exists. |
| Library | Not applicable | A validation scene does not own a separate library. |

Beta is an explicit product decision, not an inferred status. A page opening,
code compiling, deterministic output, or tests passing remains evidence rather
than an automatic promotion.

**Current accepted truth:** Character & Creature, Tree, Grass, Flower, Rock &
Geology, Terrain & Ground, and Manufactured Surface Shader Labs are Beta for
both their labs and runtime libraries. VFX
Effect and VFX Shader are In progress as two artifact workspaces hosted by the
same projectile-focused VFX Lab; both npm contracts remain Migration required.
Atmospheric Condition is also In progress on both axes while the transferred
condition system is migrated into its dedicated product boundary. Every other
item is Migration required or Not started.

## Universal preview gate

Every canonical lab uses the same 24-hour preview environment with Dawn, Day,
Sunset, and Night reference states. The Day state must make the Call Me Sensei
cool/blue shadow response visible; a fixed neutral studio light cannot approve
an artifact.

The selected hour is preview/scene state, not part of unrelated exported
artifacts. Style profiles may save how they respond across the day. See
[Universal lab preview environment](lab-preview-environment.md) for the
controls, cool-shadow requirement, capture matrix, and automation contract.

Rock Shader Lab is the first rollout and quality-control reference. Other labs
are migrated only after the Rock implementation is visually approved; a
control label or debug value without a changed render does not count.

## Product-family summary

| Family | Count | Saved artifacts |
| --- | ---: | --- |
| Look Development | 19 | Material/shader profiles and rendering/presentation styles |
| Asset Creation & Assembly | 13 | High-quality assembly recipes and source-asset recipes |
| Motion & Performance | 8 | Rigs, clips, motion graphs, performance, camera, and timelines |
| Effects & Audio | 8 | Effect graphs, feedback, SFX, mixes, soundscapes, music, and dialogue |
| World Building & Simulation | 12 | Landscapes, layouts, state systems, populations, simulation, and streaming |
| Pipeline & Shipping | 11 | Bundles, accepted assets, routing, coverage, optimization, regression, and release manifests |
| **Canonical labs** | **71** | One durable production artifact/workflow per lab |

Validation scenes are listed separately and do not increase the canonical lab
count.

## Look Development

All 19 labs in this family define the shipped style bundle. The first fifteen
are shader-facing look owners, including the three-profile Vegetation family,
Water, Sky, Cloud, Atmosphere, and Weather; the remaining four own lighting,
final-frame color, linework, and UI.

| ID | Lab | Artifact | Lab | npm library | Target |
| --- | --- | --- | --- | --- | --- |
| L01 | Character & Creature Shader Lab | Material profile | Beta | Beta | `@call-me-sensei/toonlab/toon` |
| L02a | Tree Shader Lab | Material profile | Beta | Beta | `@call-me-sensei/toonlab/vegetation-shaders` |
| L02b | Grass Shader Lab | Material profile | Beta | Beta | `@call-me-sensei/toonlab/vegetation-shaders` |
| L02c | Flower Shader Lab | Material profile | Beta | Beta | `@call-me-sensei/toonlab/vegetation-shaders` |
| L03 | Rock & Geology Shader Lab | Material profile | Beta | Beta | `@call-me-sensei/toonlab/rock-shader` |
| L04 | Terrain & Ground Shader Lab | Material profile | Beta | Beta | `@call-me-sensei/toonlab/ground-shader` |
| L05 | Manufactured Surface Shader Lab | Material profile | Beta | Beta | `@call-me-sensei/toonlab/environment` |
| L06 | Glass & Transparent Shader Lab | Material profile | Not started | Not started | `@call-me-sensei/toonlab/transparent` |
| L07 | Decal & Projected Surface Shader Lab | Material profile | Not started | Not started | `@call-me-sensei/toonlab/decals` |
| L08 | VFX Shader Lab | Renderer profile | In progress | Migration required | `@call-me-sensei/toonlab/vfx` |
| L09 | Water & Liquid Shader Lab | Shader/style profile | Migration required | Migration required | `@call-me-sensei/toonlab/water` |
| L10a | Sky Shader Lab | Shader/style profile | In progress | Migration required | `@call-me-sensei/toonlab/sky` |
| L10b | Cloud Shader Lab | Shader/style profile | In progress | Migration required | `@call-me-sensei/toonlab/cloud` |
| L11 | Atmosphere, Fog & Volumetrics Lab | Shader/style profile | In progress | Migration required | `@call-me-sensei/toonlab/atmosphere` |
| L12 | Weather Rendering & Surface Shader Lab | Shader/style profile | In progress | In progress | `@call-me-sensei/toonlab/weather` |
| L13 | Lighting & Shadow Lab | Rendering style profile | Not started | Migration required | `@call-me-sensei/toonlab/lighting` |
| L14 | Post-processing & Color Lab | Rendering style profile | Not started | Migration required | `@call-me-sensei/toonlab/post` |
| L15 | Linework & Outline Lab | Cross-domain rendering profile | Not started | Not started | `@call-me-sensei/toonlab/linework` |
| L16 | UI & HUD Style Lab | UI style profile | Not started | Not started | `@call-me-sensei/toonlab/ui` |

### Look ownership rules

- Character & Creature covers organic animated surfaces and character-bound
  equipment when it must read as part of the character. A dropped weapon or
  independent world prop routes by its actual material.
- Vegetation is one shared implementation family with three independently
  saved shader profiles. Tree owns canopy foliage plus bark/wood; Grass owns
  blades and groundcover thin surfaces; Flower owns petals, centers, leaves,
  and herbaceous stems. They share renderer code but never overwrite one
  another’s style settings.
- Ground is separate from Vegetation. Terrain layers, soil, sand, paths,
  slope/height blending, triplanar projection, macro variation, and the
  receiving hooks for wetness/snow belong to Terrain & Ground Shader. The
  cross-domain rendered snow appearance belongs to Weather Rendering &
  Surface and is consumed by Ground, Rock, Vegetation, and Manufactured
  Surface. See [Snow Surface Shader architecture](snow-surface-shader.md).
- Tree, Flower, and Grass Generation Labs own asset geometry, species,
  planting data, LOD, and export. Their Shader Labs own reusable rendering
  profiles. One must never serialize the other’s data.
- Manufactured Surface covers opaque wood, metals, plastics, ceramics,
  masonry, fabric, vehicles, architecture, props, and emissive parts.
- Glass & Transparent is separate because refraction, absorption, ordering,
  thin transparency, crystals, and ice have a different rendering contract.
- VFX Shader owns how sprites, mesh particles, ribbons, trails, beams,
  distortion, dissolve, emission, and blend modes render. VFX Effect Lab owns
  emitters and timing; VFX Source Asset Generation owns flipbooks/noises/meshes.
  VFX Shader and VFX Effect are hosted as separate workspaces in the same
  projectile-focused `/vfx-lab/` product surface.
- Water Shader owns appearance. Hydrology & Waterbody owns where water exists,
  terrain carving, flow fields, and connections.
- Weather Rendering owns precipitation and cross-domain accumulated surface
  presentation, including the shared Snow Surface shader. Accumulation state
  owns current coverage/depth; receiving shaders own semantic retention hooks.
  Atmospheric Condition owns reusable air, ceiling, fog, precipitation,
  lighting, electrical, and flow state. Climate, Seasons & Time schedules
  those conditions over the long-running environment timeline.
- Sky Shader owns how gradients, celestial elements, and scattering inputs
  render. Cloud Shader owns cloud-layer composition and lighting. Atmosphere
  Shader owns fog, aerial perspective, and volumetrics.
- L10a, L10b, L11, L12, and Atmospheric Condition deliberately share one
  environment preview contract. Sky, Cloud, and Atmosphere each use a scoped
  view of the accepted P18 environment while authoring independent profiles.
  Sharing the stage does not merge their saved artifacts.
- Sky, Cloud & Atmosphere Source Asset owns LUTs, masks, noises, volume tiles,
  and other generated or curated renderer inputs. None of those source assets
  are serialized into an atmospheric-condition recipe.
- Linework is explicit because outlines may combine material, geometry, and
  screen-space paths across several material domains.

## Asset Creation & Assembly

Asset production uses the best reliable route for the asset class. Procedural
generation is not the default answer.

| ID | Lab | Artifact | Lab | npm library | Target |
| --- | --- | --- | --- | --- | --- |
| A01 | Character & Creature Assembly Lab | Assembly recipe | Not started | Not started | `@call-me-sensei/toonlab/character-assets` |
| A02 | Manufactured Asset Assembly Lab | Assembly recipe | Not started | Not started | `@call-me-sensei/toonlab/asset-assembly` |
| A03 | Architecture & Interior Kit Assembly Lab | Kit/assembly recipe | Not started | Not started | `@call-me-sensei/toonlab/architecture-kit` |
| A04 | Rock & Cliff Generation Lab | Asset recipe | Migration required | Migration required | `@call-me-sensei/toonlab/rockgen` |
| A05 | Tree & Shrub Generation Lab | Asset recipe | Migration required | Migration required | `@call-me-sensei/toonlab/vegetation` |
| A06 | Flower & Plant Generation Lab | Asset recipe | Migration required | Migration required | `@call-me-sensei/toonlab/vegetation` |
| A07 | Grass & Groundcover Generation Lab | Asset recipe | Migration required | Migration required | `@call-me-sensei/toonlab/vegetation` |
| A08 | Road, Path & Bridge Generation Lab | Asset recipe | Not started | Migration required | `@call-me-sensei/toonlab/pathgen` |
| A09 | Texture & Material Map Generation Lab | Asset recipe | Migration required | Migration required | `@call-me-sensei/toonlab/texgen` |
| A09b | Sky, Cloud & Atmosphere Source Asset Lab | Source-asset recipe | Not started | Not started | `@call-me-sensei/toonlab/atmosphere-assets` |
| A10 | Decal, Signage & Graphic Generation Lab | Asset recipe | Not started | Not started | `@call-me-sensei/toonlab/graphicgen` |
| A11 | VFX Source Asset Generation Lab | Asset recipe | Not started | Not started | `@call-me-sensei/toonlab/vfx-assets` |
| A12 | Audio Source Asset Lab | Audio source asset | Not started | Not started | `@call-me-sensei/toonlab/audio-assets` |

### Production-route decision

Use the first route that can meet the quality bar:

1. Accepted first-party or CC0/CC-BY asset from the gallery.
2. Controlled assembly/variation from an accepted high-quality base set.
3. Purpose-built procedural generation for domains where it is demonstrably
   reliable.
4. Image-to-3D or multi-view reconstruction followed by cleanup.
5. External DCC/manual authoring followed by ToonLab import and adaptation.

Raw procedural **Prop Generation** and **Building Generation** are not
canonical labs. Their current experiments do not establish a production
method and are not counted as roadmap progress. Props, weapons, furniture,
vehicles, and clutter belong in Manufactured Asset Assembly. Buildings and
interiors belong in Architecture & Interior Kit Assembly. Existing prototype
pages/packages may remain temporarily for compatibility, but they must not be
presented as approved labs or style-bundle owners.

A procedural generator earns or keeps a canonical lab only when hard reference
sets prove:

1. Production-quality silhouette and design language.
2. Controllable, meaningful variation rather than parameter noise.
3. Valid topology, normals, UVs, pivots, scale, and export.
4. Stable semantic parts, material domains, masks, and optional neutral
   shader-consumption channels.
5. LOD, collision, instancing/merging, and performance budgets.
6. Compatibility with the complete Call Me Sensei look matrix.
7. Deterministic recipes and versioned migration.
8. Better production value than gallery/assembly/reconstruction for the same
   use case.

Generator output must satisfy the
[Generated asset labeling and shader routing](generated-asset-labeling.md)
contract. In particular, construction-time knowledge such as leaf, bark,
root, trunk, petal, stem, rock face, moss, and snow coverage must survive LOD,
instancing, merging, and export. Shader routing may not depend on reconstructing
that knowledge later from names or colors.

## Motion & Performance

Animation source assets and runtime motion logic are separate, just as VFX
source assets and effect graphs are separate.

| ID | Lab | Artifact | Lab | npm library | Target |
| --- | --- | --- | --- | --- | --- |
| M01 | Rigging & Skinning Lab | Rig document | Not started | Not started | `@call-me-sensei/toonlab/rigging` |
| M02 | Animation Retargeting & Cleanup Lab | Retarget profile | Not started | Not started | `@call-me-sensei/toonlab/retargeting` |
| M03 | Animation Clip Authoring & Generation Lab | Animation clip | Not started | Migration required | `@call-me-sensei/toonlab/motion` |
| M04 | Motion System Lab | Motion-system recipe | Not started | Migration required | `@call-me-sensei/toonlab/motion` |
| M05 | Facial Performance & Lip-sync Lab | Performance profile | Not started | Not started | `@call-me-sensei/toonlab/performance` |
| M06 | Secondary Motion Lab | Simulation profile | Not started | Not started | `@call-me-sensei/toonlab/secondary-motion` |
| M07 | Camera & Shot Lab | Camera recipe | Not started | Migration required | `@call-me-sensei/toonlab/camera` |
| M08 | Cinematic Sequencer Lab | Timeline document | Not started | Not started | `@call-me-sensei/toonlab/sequencer` |

Motion style—including pose exaggeration, stepped cadence, holds, anticipation,
and follow-through—is a style-bundle concern. The animation clip remains an
asset; the motion system applies the chosen runtime policy over compatible
clips.

## Effects & Audio

VFX and SFX are first-class production domains, not secondary features hidden
inside gameplay demos.

| ID | Lab | Artifact | Lab | npm library | Target |
| --- | --- | --- | --- | --- | --- |
| E01 | VFX Effect Lab | Effect graph | In progress | Migration required | `@call-me-sensei/toonlab/vfxgen` |
| E02 | Ambient VFX Lab | World-effect recipe | Not started | Migration required | `@call-me-sensei/toonlab/ambientfx` |
| E03 | Game Feel & Feedback Lab | Feedback recipe | Not started | Migration required | `@call-me-sensei/toonlab/game-feel` |
| E04 | SFX Cue & Sound Design Lab | Sound cue/DSP recipe | Not started | Not started | `@call-me-sensei/toonlab/sfx` |
| E05 | Spatial Audio & Mix Lab | Mix/spatial profile | Not started | Not started | `@call-me-sensei/toonlab/audio` |
| E06 | Soundscape Lab | Soundscape recipe | Not started | Migration required | `@call-me-sensei/toonlab/soundscape` |
| E07 | Music & Adaptive Score Lab | Adaptive score | Not started | Not started | `@call-me-sensei/toonlab/music` |
| E08 | Voice, Dialogue & Subtitle Lab | Dialogue-performance document | Not started | Not started | `@call-me-sensei/toonlab/dialogue` |

Audio Source Asset Lab creates/imports reusable waveforms, loops, impulses, and
stems. SFX Cue & Sound Design turns those sources into parameterized gameplay
events. Spatial Audio & Mix owns buses, loudness, attenuation, occlusion,
reverb, priorities, concurrency, and output policy. Soundscape owns
world/biome/time/weather placement and transitions. These must not be collapsed
into one ambiguous “audio” preset.

## World Building & Simulation

| ID | Lab | Artifact | Lab | npm library | Target |
| --- | --- | --- | --- | --- | --- |
| W01 | Landscape & Terrain Authoring Lab | Landscape project | Migration required | Migration required | `@call-me-sensei/toonlab/landscape` |
| W02 | Hydrology & Waterbody Lab | Hydrology project | Not started | Not started | `@call-me-sensei/toonlab/hydrology` |
| W03 | Biome & Scatter Lab | Population recipe | Not started | Migration required | `@call-me-sensei/toonlab/biome` |
| W04 | Settlement & City Generation Lab | World-layout recipe | Not started | Migration required | `@call-me-sensei/toonlab/villagegen` |
| W05 | Interior & Level Layout Lab | Level-layout recipe | Not started | Not started | `@call-me-sensei/toonlab/levelgen` |
| W06 | Scene Composition & Set Dressing Lab | Scene document | Not started | Not started | `@call-me-sensei/toonlab/scene` |
| W07 | Climate, Seasons & Time Lab | Environment timeline | Not started | Migration required | `@call-me-sensei/toonlab/climate` |
| W08 | Atmospheric Condition Lab | Atmospheric-condition recipe | In progress | In progress | `@call-me-sensei/toonlab/atmospheric-condition` |
| W09 | Fauna & Crowd Population Lab | Population recipe | Not started | Migration required | `@call-me-sensei/toonlab/fauna` |
| W10 | Physics, Ragdoll & Destruction Lab | Simulation profile | Not started | Not started | `@call-me-sensei/toonlab/physics` |
| W11 | Navigation, Traversal & Interaction Lab | Traversal contract | Not started | Not started | `@call-me-sensei/toonlab/navigation` |
| W12 | World Streaming & Visibility Lab | Streaming/visibility profile | Not started | Not started | `@call-me-sensei/toonlab/world-streaming` |

Settlement & City Generation generates layout using accepted architecture kits;
it does not procedurally manufacture low-quality building meshes. Interior &
Level Layout similarly composes accepted modular-room kits.

## Pipeline & Shipping

| ID | Lab | Artifact | Lab | npm library | Target |
| --- | --- | --- | --- | --- | --- |
| P01 | Style Bundle Lab | Style bundle | Not started | Migration required | `@call-me-sensei/toonlab/styles` |
| P02 | Asset Gallery & License Lab | Accepted source record | Migration required | Migration required | `@call-me-sensei/toonlab/assetlib` |
| P03 | Asset Import, Normalize & Label Lab | Normalized asset manifest | Migration required | Migration required | `@call-me-sensei/toonlab/assetlib` |
| P04 | Material Routing, Compatibility & Audit Lab | Routing/compatibility manifest | Migration required | Migration required | `@call-me-sensei/toonlab/styles` |
| P05 | Image-to-3D & Reconstruction Lab | Reconstruction recipe | Not started | Not started | `@call-me-sensei/toonlab/reconstruction` |
| P06 | Procedural Base Set & Variation Lab | Generator base family | Not started | Not started | `@call-me-sensei/toonlab/generation` |
| P07 | Scene Kit Coverage Lab | Coverage manifest | Not started | Not started | `@call-me-sensei/toonlab/catalog` |
| P08 | Quality, LOD & Performance Lab | Quality profile | Not started | Not started | `@call-me-sensei/toonlab/quality` |
| P09 | Bake, Optimize & Export Lab | Build recipe | Not started | Not started | `@call-me-sensei/toonlab/export` |
| P10 | Reference, Regression & Composition Lab | Composition audit | Not started | Migration required | `@call-me-sensei/toonlab/debug` |
| P11 | Package & Release Lab | Release manifest | Not started | Migration required | `@call-me-sensei/toonlab` |

The Style Bundle is a local OSS document. It does not require a database. It
must eventually carry typed slots for every applicable look, motion, UI, and
audio style owner. Hosted persistence, collaboration, and public publishing
remain optional services.

## Scene-coverage audit

The inventory is checked against scene outcomes, not current module names:

| Scene outcome | Required coverage |
| --- | --- |
| Character close-up/dialogue | Character shader and assembly; rigging; clips; motion; face/lip-sync; hair/cloth motion; lighting; post; linework; camera; dialogue; SFX; mix |
| Natural outdoor world | Vegetation, rock, terrain, water, sky, atmosphere, weather, lighting and post looks; procedural natural assets; landscape; hydrology; biome; climate; weather system; fauna; ambient VFX; soundscape |
| Urban exterior | Manufactured, glass, decal, terrain, weather, lighting, post and linework looks; manufactured and architecture assembly; roads; settlement layout; set dressing; crowds; traffic-capable navigation; SFX and soundscape |
| Interior | Manufactured, glass, decals, lighting, atmosphere and post; architecture/interior kit; level layout; set dressing; navigation/interaction; spatial audio/occlusion |
| Combat/action | Character, VFX, post and linework; weapons from manufactured assembly; animation and motion; VFX sources/shaders/effects; game feel; SFX; mix; physics/destruction; camera |
| Vehicle/industrial | Manufactured, glass, decal and VFX looks; vehicle/module assembly; motion/physics; roads/navigation; VFX; SFX; spatial mix |
| Coast/river/underwater | Water, terrain, sky, atmosphere, weather and lighting looks; hydrology; landscape; VFX; SFX; soundscape |
| Cinematic sequence | All look owners as needed; performance; camera; sequencer; VFX; SFX; music; dialogue/subtitles |
| Menu/HUD/accessibility | UI/HUD style; graphic generation; SFX cue; audio mix; camera/post background integration |
| Low-end/large world shipping | Quality/LOD; streaming/visibility; bake/export; compatibility audit; regression; package/release |

This matrix is a completeness test. A new scene requirement should normally
map into an existing lab. Add a lab only when it introduces a genuinely new
portable artifact and authoring workflow.

## Validation scenes

Character & Interaction Playground, Water Playground, Outdoor World, VFX &
Game Feel Arena, Fauna & Population Demo, and Ambient VFX Demo are validation
surfaces only. They do not own npm artifacts and do not count as labs.

Additional regression fixtures will be required for indoor, urban, cinematic,
UI, weather-extreme, and audio/spatial-mix coverage. They belong to Reference,
Regression & Composition rather than becoming product labs.

## Acceptance gate for each lab

A Lab status may become Beta only after explicit product approval and all of
the following:

1. The lab owns one named, versioned artifact/workflow from this inventory.
2. It renders controls from the npm library's canonical field metadata.
3. Preview-only state and current scene conditions are visibly separate from
   exported portable data.
4. Import, normalization, validation, serialization, migration, and exact
   round-trip are tested.
5. Apply/update/restore/dispose lifecycle and unsupported/fallback behavior are
   deterministic and documented.
6. Easy and difficult first-party, generated, reconstructed, and accepted-open
   references pass the relevant scene-coverage matrix at Dawn, Day, Sunset,
   and Night.
7. The Call Me Sensei style is reviewed in composed scenes, not only isolated
   thumbnails.
8. Performance budgets and low-capability degradation are visible and tested.
9. Copyright/license/provenance requirements are carried by every source
   artifact.
10. A human explicitly approves the result as production quality.

The Day capture must show the approved cool/blue cast and self-shadow response.

A Library status may become Beta only after its lab-independent portable
contract passes the relevant gates above plus package exports, tree shaking,
generated reference docs, semver/migration tests, package-content inspection,
and a clean npm dry run.

Neither status may be promoted automatically from the presence of source code,
an editor page, screenshots, a successful build, or unit tests.

## Deliberate product boundary

ToonLab owns stylized presentation, media/content artifacts, world assembly,
and their runtime composition. Quest logic, combat rules, inventory,
networking, persistence, monetization, analytics, and general visual scripting
belong to the host game/application and do not become ToonLab labs.
