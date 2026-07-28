# Lab responsibilities

ToonLab separates authoring tools by the lifetime and reuse scope of the
artifact they produce. A lab is not named after every shader program it happens
to use; it is named after the reusable thing a developer saves and ships.

The complete required inventory, dual status vocabulary, npm ownership,
coverage matrix, and acceptance gates are maintained in the
[Definitive lab inventory and npm roadmap](lab-roadmap.md).

## First-principles product boundary

The source tree is evidence about implementation, not a product specification.
A current editor may be wrong, a current library may require replacement, and
a missing workflow may be more important than an existing prototype.

ToonLab uses six permanent lab families:

| Family | Durable artifact/workflow |
| --- | --- |
| Look Development | Shader/material profile or rendering/presentation style |
| Asset Creation & Assembly | Accepted source asset, controlled assembly, or proven procedural recipe |
| Motion & Performance | Rig, animation clip, runtime motion graph, performance profile, camera recipe, or timeline |
| Effects & Audio | Effect graph, feedback recipe, sound cue, mix, soundscape, score, or dialogue document |
| World Building & Simulation | Landscape, layout, environment state, population, simulation, navigation, or streaming document |
| Pipeline & Shipping | Style bundle, accepted-source record, routing audit, coverage manifest, quality/export recipe, regression, or release manifest |

Validation scenes do not become labs because they save no independent
production artifact.

## What “shader” means

A shader profile is GPU code plus a stable parameter contract that determines
how a rendering domain responds to light, view direction, shadows, depth,
weather/surface inputs, and authored asset channels. It may have multiple
backend variants while one portable profile carries the art direction.

The definitive shader-facing set is not limited to opaque mesh materials.
Vegetation is one implementation family with one shared treatment base and
three independently authored role profiles. Shared Lighting, Thin Surface,
and Weather Response are edited as one base; Tree, Grass, and Flower each own
their role-specific profile. Each lab warns that a shared edit affects Tree
foliage, Bark/wood, Grass/groundcover, and Flower parts. Scope documents embed
a portable base snapshot. A future split must be explicit and reversible,
never an accidental copied-value divergence. The shader-facing set includes:

1. Character & Creature.
2. Tree.
3. Grass.
4. Flower.
5. Rock & Geology.
6. Terrain & Ground.
7. Manufactured Surface.
8. Glass & Transparent.
9. Decal & Projected Surface.
10. VFX rendering.
11. Water & Liquid.
12. Sky.
13. Cloud.
14. Atmosphere, Fog & Volumetrics.
15. Weather Rendering & Surface response.

Lighting & Shadow, Post-processing & Color, Linework & Outline, and UI & HUD
complete the 19-member Look Development family.

## Separate appearance, asset identity, and runtime state

The correct boundary is not “anything containing GPU code goes into one
shader document.” It is:

| Owner | Examples |
| --- | --- |
| Shader/style profile | How rain renders; water absorption/foam style; sky gradient/cloud style; rock projection/moss style |
| Source asset | Rain flipbook; boulder geometry; audio waveform; animation clip; building wall module |
| Runtime recipe/state | Current thunderstorm; waterbody/flow layout; effect emitter timing; sound cue randomization; current time |
| Preview only | Inspection camera, test seed, temporary light, debug mode, selected fixture |

Therefore:

- Water Shader and Hydrology & Waterbody are separate.
- Sky Shader, Cloud Shader, Atmosphere Shader, and their source-asset recipes
  are separate.
- Weather Rendering & Surface Shader and Atmospheric Condition are separate.
- Snow Surface is a reusable module/profile inside Weather Rendering &
  Surface, not a different snow tint inside every receiving material. Weather
  state supplies accumulation; Ground, Rock, Vegetation, and Manufactured
  Surface consume the same profile through semantic retention hooks. See
  [Snow Surface Shader architecture](snow-surface-shader.md).
- VFX Source Asset, VFX Shader, and VFX Effect are separate.
- Audio Source Asset, SFX Cue, Spatial Audio & Mix, and Soundscape are
  separate.
- Animation Clip and Motion System are separate.
- Rock Generation and Rock Shader are separate.

For VFX specifically, the VFX Effect document owns intent, runtime inputs,
phases, ordered layers, macro bindings, and quality policy. Layers reference
VFX renderer profiles and source assets by id; they do not absorb those
documents. Preview charge, camera, test collision, current time of day, and
post stack remain preview or host state. The normative workflow, schema, full
intent taxonomy, custom-extension contract, and first Charged Energy Shot
vertical slice are specified in
[VFX authoring architecture](vfx-authoring.md).

VFX Effect and VFX Shader share the projectile-focused VFX Lab product surface.
Their saved documents and npm contracts remain independent.

## Shared sky, cloud, atmosphere, and condition preview

Sky Shader, Cloud Shader, Atmosphere Shader, Sky/Cloud/Atmosphere Source Asset,
and Atmospheric Condition author different portable artifacts but use one
comparison stage. The shared preview fixes the camera, scene geometry,
24-hour mapping, source-pack binding, and renderer-quality context so a change
can be judged across the coupled domains without merging their documents.

The three rendering domains are required for different reasons:

- **Sky Shader** renders the visible background and celestial layer: sky
  gradient/curve treatment, horizon and below-horizon presentation, visible
  sun/moon discs and glow, and stars. A project using an immutable HDRI or
  painted backdrop may omit this slot, but the Call Me Sensei bundle does not.
- **Cloud Shader** renders distant/background clouds and foreground cloud
  layers or shells. Cloud source meshes, masks, textures, and color atlases are
  separate source assets.
- **Atmosphere Shader** renders participating media between the camera and the
  scene: distance/height fog, haze, aerial perspective, local fog volumes,
  light shafts, and volumetric scattering.

Atmosphere cannot replace Sky: fog and aerial perspective still need a
background to integrate toward. Sky cannot replace Atmosphere: changing a
dome gradient does not attenuate scene geometry by distance or height.
Visible celestial graphics belong to Sky; directional-light energy and
shadows belong to Lighting. Time of day coordinates those owners without
merging their saved profiles.

The accepted P18 environment is the starting visual baseline for all three
Labs. A generic procedural sky over generated terrain is not a valid Call Me
Sensei Sky Shader preview. Clouds may remain visible as comparison context in
Sky Shader Lab, but cloud controls must not appear in the Sky document.

Cloud Shader Lab must never route into Atmospheric Condition Lab or reuse a
condition as its primary selector. Its primary document is the independent
cloud style (`toonlab/cloud-shader-preset`); Call Me Sensei is the default.
Its default live stage uses the accepted P18 sky dome, background-cloud
texture, cloud-shell mesh, cloud texture, and color atlases. Time of day, sky
context, current condition, particles, source assets, and camera are preview
or runtime settings. A condition may be selected only as an explicit stress
test, defaults to no condition, and cannot enter cloud JSON.

The preview has two explicit modes. **Live** always renders the current
settings, including at Dawn, Day, Sunset, and Night, against neutral
near/middle/far visibility fixtures. **Native** swaps in immutable
source-renderer images at those exact anchors and disables ToonLab diagnostic
effect overlays. Native is evidence, not an editable rendering surface; the UI
must label it and retain the one-click route back to Live so controls never
silently appear broken.

The source sky-overview camera has no nearby subject. Fully overcast,
volumetric conditions may therefore be nearly uniform in Native mode. Live
mode must preserve enough sky/ceiling structure and depth cues to remain
useful without claiming pixel parity.

The transferred fifteen-profile atmospheric-condition collection is named the
`call_me_sensei` set. It is not the default shader style and it is not a source
asset pack. Future condition sets register beside it without mutating its
profile membership.

## Do not proceduralize every noun

Procedural generation is one production route, not the organizing principle
for all assets. A dedicated generator is justified only when hard reference
sets prove it can produce controlled, production-quality variation with valid
topology, semantics, LOD/collision, export, style compatibility, and better
value than sourcing or assembly.

Manufactured props, furniture, weapons, vehicles, and clutter use
**Manufactured Asset Assembly** over accepted high-quality base modules.
Buildings and interiors use **Architecture & Interior Kit Assembly** over
accepted modular kits. Current Prop Generation and Building Generation
experiments are not canonical labs and are not roadmap progress.

The preferred route order is accepted open/first-party asset, controlled
base-set assembly, proven procedural generation, reconstruction, then external
DCC/manual authoring. See the roadmap for the full acceptance gate.

## Lab status versus npm-library status

Each card carries two independent values:

- **Lab status** evaluates the editor and workflow.
- **Library status** evaluates the portable runtime, schema, documents,
  migration, verification, exports, and package boundary.

The currently approved Beta/Beta items are Character & Creature, Tree, Grass,
Flower, Rock & Geology, Terrain & Ground, and Manufactured Surface Shader Labs.
No agent may infer Beta from source presence, screenshots, passing tests, or a
successful build.

Labs are development/hosted authoring surfaces and are not themselves the npm
package. A lab consumes its npm owner's public API and must never keep the only
copy of production settings, validation, or serialization logic.

## Universal preview environment

Every lab uses the same continuous time-of-day preview contract plus Dawn,
Day, Sunset, and Night reference states. Daylight approval requires the
Call Me Sensei cool/blue shadow relationship to be plainly visible. The clock
is preview state; a style may own its time-response curve, but an asset or
shader document does not own the currently selected hour.

This requirement also applies to asset, VFX, audio, world, pipeline, and
regression labs through their preview or audit panes. See
[Universal lab preview environment](lab-preview-environment.md).

## Style axis

Every look, motion, UI, and audio lab keeps the Call Me Sensei style axis
separate from asset identity and current state. Style must apply over
`Boulder`, `River`, `Thunderstorm`, a weapon type, or an animation clip rather
than appear beside those identities as another preset.

Preview controls may exercise scene and instance inputs, but exported profile
documents exclude current sun/time, current weather, selected asset, preview
camera, debug state, and test quality tier unless that lab explicitly owns
the corresponding portable runtime recipe.

## Rock asset and rock shader boundary

Rock uses two deliberately independent documents:

| Owner | Portable data |
| --- | --- |
| Rock Lab / `rockgen` | Geometry recipe, shape pieces, seed, cuts, strata, erosion, sculpt edits, surface zones, topology, LOD, collision, and baked asset channels |
| Rock Shader Lab / `rock-shader` | Projection, material response, distance tint, normals, striping, moss response, optional top layers, and the influence of asset-authored color/AO |

`rockgen` must finish successfully without importing the rock shader. It emits
ordinary geometry plus stable optional channels such as `color` and
`envVertexAo`. `applyRockShader()` consumes those channels after generation.
Imported rocks use the same shader API once their root is labeled for the rock
domain.

The Rock Lab may select a shader profile for preview and may include a
reference to the project default in host metadata. It must not duplicate the
Rock Shader Lab's controls or serialize shader settings into a rock-generation
document. Conversely, the Rock Shader Lab uses fixed validation fixtures and
must not author seed, erosion, LOD, or collision.

The default rock shader profile is `call_me_sensei`. Its full settings,
metadata, versioned JSON document, runtime application, restoration behavior,
and style-bundle resolution are public OSS APIs. A host can save the JSON in
source control or any host-owned store; no database is required.

Rock Shader Lab starts from the accepted P18 spire checkpoint: the copied P18
environment, original non-baked Spire 05 LOD0 geometry, exact connected graph
values, and exact local reference texture inputs. Every graph value is exposed
through the public schema so the starting look can be adjusted and exported.
The scene, texture-source provenance, selected fixture, time, camera, and
per-context style overrides remain outside the portable shader JSON.

Do not create one shader editor for every noun. A separate shader lab is
justified when the material domain has a durable reusable contract that spans
many assets and needs independent art-direction work. Rock qualifies. A mixed
debris set should route each material to rock, manufactured environment,
vegetation, or another existing owner unless a genuinely distinct reusable
debris material contract is established.

Style bundles are also a local OSS artifact. The package creates, parses,
validates, serializes, and resolves bundle JSON without a database or hosted
account. A project may commit that JSON, keep it in its `.toonlab/` workspace,
or load it from any host-owned store. Hosted persistence, public slugs,
collaboration, and cloud publishing are optional services rather than part of
the style model.

Resolving a bundle currently returns settings for its populated slots. It does
not classify a scene or automatically apply those settings to arbitrary
assets. Asset roots and materials must first be labeled, then routed through
the owning runtime. See
[Styles, style bundles, and asset routing](styles-and-bundles.md) for the
normative domain, labeling, fallback, and audit contract.

Procedural generation and assembly must preserve more than the root route.
They emit stable semantic modeled parts, material roles, and optional
shader-consumable surface zones across every LOD and export. For example,
tree root/trunk/branch/leaf identity is separate from the broader
`woodySurface` and `foliageCard` shader roles. A rock's moss or snow zone is
rock-surface data, while actual grass blades on the rock form a separately
routed Grass child root. The full generator contract is
[Generated asset labeling and shader routing](generated-asset-labeling.md).

## Style bundle and labeling contract

Labs must keep four categories visibly separate:

| Category | Example | Saved where |
| --- | --- | --- |
| Rendering domain and semantic role | equipment, manufactured environment, glass, foliage card | Asset metadata or a versioned project asset manifest |
| IP-wide treatment | cel bands, painted-metal response, foliage light wrapping | Domain style profile and bundle slot |
| Asset identity | sword, oak, boulder, compact car | Asset or generator preset |
| Current state | wet, burned, autumn, night, selected preview model | Scene/save state or preview-only lab state |

The lab may assist with classification, but inferred labels must remain
visible, editable, and auditable. Unknown roots, unknown material roles,
mixed-material atlases without masks, and custom shader dependencies must
produce actionable warnings. A lab must not present an inferred first pass as
a production-safe result.

Character equipment—including held weapons and worn accessories—normally uses
the Character Shader profile so it shares the character's graphic light and
outline language. It still requires equipment-appropriate semantic material
roles. Decorative or world-mounted versions may instead be explicitly labeled
as manufactured environment assets. Scene parenting must not change this
classification implicitly.

## Shared P18 shader-lab comparison pattern

Rock, Ground, Tree, Grass, and Flower Shader Labs start in the same accepted
P18 outdoor comparison composition. The coupled checkpoint includes the
original non-baked Spire 05 LOD0, retained terrain, grass, pine, daisies,
manufactured props, sky, clouds, camera, and lighting.

The lab authors exactly one shader domain while keeping the entire composition
visible by default. Its preview bar must provide:

- **Composition**, which shows the full coupled scene;
- **Isolate**, which keeps the authored domain and the minimum environmental
  context needed to judge it while hiding competing foreground elements;
- **Top** or another domain-appropriate placement view;
- the universal time-of-day control;
- current wind, wetness, or other relevant scene inputs;
- **Preview styles**, where the complete style bundle and every surrounding
  domain can be overridden independently;
- per-component visibility so a user can remove obstructions without changing
  the saved shader document.

The authored component cannot be hidden accidentally. Bundle assignments,
individual context overrides, visibility, selected camera, current time,
weather, wind, and wetness remain preview state.

P18 is the default baseline, not the only possible validation asset. If the
retained fixture does not contain a required semantic boundary, the control
must be reported as unsupported by that fixture and tested with an additional
correctly labeled asset. The lab must not pretend that a slider changed a
petal, stem, root, leaf, bark, moss, or snow region that the asset does not
actually separate.

Every shader lab also provides a **Preview assets** button that opens a modal,
because one favorable fixture cannot validate a reusable material profile.
The modal groups the domain's immutable reference fixtures, procedural
recipes, project/saved assets, and imported validation assets. It must show
the selected asset's source and support/audit result. For domains with many
types, search and semantic type filters belong in this modal rather than in
the portable shader inspector.

Selecting or importing a preview asset changes only the lab fixture. It must
not change the selected style, dirty the shader document, serialize a recipe
or species into a style-bundle slot, or remove the immutable P18 fallback.
The same effective shader settings are reapplied through explicit material
roles after every fixture switch. A field that works on one correctly labeled
fixture but not another must be reported as a fixture capability difference,
not globally disabled or falsely reported as applied.

## Shader and lab migration contract

The current shader and lab implementations were built at different times. The
standardization direction is:

1. One canonical exported shader implementation per rendering domain.
2. An explicit IP-wide style axis layered over, rather than substituted for,
   asset presets and runtime conditions.
3. Full public-schema coverage in each lab, with no private copy of defaults,
   ranges, or option lists.
4. Local style-bundle import, edit, validation, resolution, and export with no
   database write.
5. Routing and material-label audits shown in the relevant asset and shader
   labs.
6. Stable easy and difficult reference assets reviewed under multiple
   lighting, weather, and condition scenarios.

Vegetation now has separate Tree, Grass, and Flower public shader profiles and
shader labs over one shared runtime family; rock has its independent public
shader profile and lab. Ground remains a separate domain. Debris and other
older systems should be brought to this contract when a
durable rendering domain exists; mixed asset categories should route to their
existing material owners instead of receiving a lab by default.

The Call Me Sensei style bundle is the first-party reference implementation of
this contract. Each populated slot must be deliberately tuned and verified as
part of one composed art direction; assigning the same style id everywhere is
not, by itself, completion. Its release gate and cross-domain review matrix are
defined in
[Styles, style bundles, and asset routing](styles-and-bundles.md#call-me-sensei-reference-bundle).
