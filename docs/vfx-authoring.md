# Production VFX authoring

This document is the normative product and implementation contract for
ToonLab's production VFX authoring workflow.

It defines:

- the boundary between VFX effect graphs, VFX renderer profiles, and VFX
  source assets;
- the intent taxonomy used to start an effect;
- the guided template workflow;
- the portable effect-document contract;
- runtime compilation, extension, performance, and fallback requirements;
- the first production vertical slice: **Charged Energy Shot**.

The current `src/vfxgen/` implementation remains a supported compatibility
runtime while this architecture is introduced. Its five fixed effects are not
the product specification for the new authoring system.

## 1. Product statement

The VFX Lab starts with **what the effect is for**, not with a blank particle
emitter.

A user:

1. selects an intent such as `Combat / Ranged / Charged projectile`;
2. answers a short set of gameplay and art-direction questions;
3. receives a complete, layered, immediately playable effect;
4. adjusts coordinated macro controls;
5. optionally opens individual layers, the effect graph, renderer profiles, or
   source assets;
6. tests the effect against its gameplay, lighting, surface, distance, backend,
   and quality matrix;
7. exports the same versioned document consumed by the runtime.

The beginner workflow and expert workflow operate on the same artifact.
Simple mode must not be a disconnected preset generator that loses fidelity
when advanced mode opens.

## 2. Permanent ownership boundaries

VFX has three independent portable owners.

| Owner | Portable artifact | Owns | Does not own |
| --- | --- | --- | --- |
| VFX Effect Lab / `vfxgen` | Effect document | Intent, parameters, phases, layers, emitters, timing, events, sub-effects, quality policy, runtime input contract | Shader implementation, texture/mesh binary data, gameplay damage/collision authority, current preview state |
| VFX Shader Lab / `vfx` | Renderer-profile document | How sprites, mesh particles, ribbons, trails, beams, decals, volumes, distortion, dissolve, emission, depth interaction, and blend modes render | Effect timing, spawn behavior, source-asset identity |
| VFX Source Asset Generation Lab / `vfx-assets` | Source-asset recipe or accepted asset record | Flipbooks, noise fields, gradients, masks, meshes, vector fields, signed-distance volumes, provenance, import normalization | Effect graph, gameplay semantics, IP-wide renderer style |

VFX Effect and VFX Shader share the projectile-focused VFX Lab workspace.
VFX Source assets are selected and inspected there as dependencies, while
their documents and public package contracts remain separate.

An effect layer therefore references a renderer profile and a source asset:

```json
{
  "id": "energy-shell",
  "type": "mesh-volume",
  "renderer": {
    "profile": "toonlab.vfx.energy-shell"
  },
  "source": {
    "asset": "toonlab.primitive.capsule"
  }
}
```

Renderer-specific values that are intentionally effect-local may appear as
validated layer overrides. The canonical renderer implementation and its full
portable profile remain owned by the VFX Shader domain.

## 3. Composition model

The rendered result is:

```text
effect identity and gameplay intent
  + effect parameters and phase graph
  + source assets
  + selected VFX renderer style/profile
  + runtime inputs
  + current world scenario
  + host post-processing
```

These axes must remain independent:

- Selecting `Charged projectile` must not silently select a project style.
- Changing the VFX style must not replace a charged projectile with a fireball.
- Changing the current surface or time of day must not mutate the saved effect.
- Preview charge, camera, time, target surface, and playback state are not
  serialized into the effect.
- Damage, collision authority, teams, and gameplay ownership remain host data.

### 3.1 Visual catalog and insertion workflow

The VFX authoring surface needs both semantic discovery and visual discovery.
The Blender add-on workflow shown in:

<https://x.com/casey_sheep/status/2081468275213713915/video/1>

is useful product inspiration because it treats effects as reusable,
thumbnail-visible packages beside the working viewport. The transferable
requirements are:

- a searchable thumbnail catalog, not only a long technical menu;
- intent/category filters over one asset and template registry;
- a strong preview image or short loop for each reusable effect;
- one-action insertion into the current effect, phase, or scene;
- selection that opens the inserted effect's meaningful controls;
- visual distinction between complete templates, layer modules, renderer
  profiles, source assets, and project-owned effects;
- favorites, recent items, project items, and built-in items as catalog
  facets;
- version, backend, quality, and dependency compatibility visible before
  insertion;
- non-destructive replacement or variant creation;
- impact, trail, burst, ring, flash, smoke, and other layer modules usable
  both independently and as parts of complete effects.

ToonLab should combine that visual-library speed with the intent-first guided
workflow in this specification. A thumbnail is not enough to explain gameplay
semantics, while a taxonomy dropdown is not enough to support fast visual
browsing. The intended flow is:

```text
Intent → filtered visual catalog → guided template → macro tuning
       → layers/graph when needed → save as project-owned effect
```

Catalog thumbnails are derived preview artifacts. They do not become the
portable effect document and must be regenerated for the four reference
times, supported renderer paths, and relevant quality tiers.

### 3.2 One effect per workspace

The VFX Lab is not a gameplay-effect sampler. Weapon moves, fireballs,
footsteps, landings, and charged projectiles must never share one editing
surface merely because they use the same runtime library.

The required information architecture is:

```text
Effect projects
  → open one effect
    → Design
    → Shape
    → Motion
    → Sequence
    → Visual Sources
    → Layers
    → Quality
    → Preview / Export
```

Each project owns one Effect document and its referenced Source documents.
Duplicate creates a new effect id, new default source ids, and independent
authored values. Opening one project must not expose another effect's
triggers, settings, layers, playback, or export.

The following references reinforce the visual target and source model:

- <https://x.com/jettelly/status/2078742415339339929/video/1> demonstrates
  separately authored animated grayscale sources such as mid shadow, top
  reflection, and light shadow before shader composition;
- <https://x.com/peplmGameDev/status/2079207788329259222/video/1> demonstrates
  a strong crescent silhouette produced as a self-contained effect;
- <https://x.com/jettelly/status/2080004958204612798/video/1> demonstrates a
  complete charged-shot composition whose source patterns, shell, inner form,
  temporal treatment, and post look work together.

Those references imply a first-class Visual Sources stage. A source slot is
declared by the effect template and bound to one layer input. The user may:

- upload PNG, JPEG, WebP, animated GIF, MP4, or WebM;
- generate a deterministic procedural source;
- replace the source non-destructively;
- preview the source by itself and in the complete effect;
- export the Source document beside the Effect document.

Uploaded binaries are content-addressed by SHA-256 and stored as project
files. The portable Source document stores metadata and a `project://` URI,
not a base64 payload or browser object URL. Procedural Source documents store
the generator id, seed, parameters, channel, and playback contract. The
initial implementation caps files at 16 MB and restores browser-local
binaries from IndexedDB while project/effect metadata is persisted separately.

## 4. Intent taxonomy

The intent browser uses a hierarchy plus orthogonal modifiers. It must not be
implemented as one permanently growing flat enum.

### 4.1 Combat: ranged

- Basic projectile
- Charged projectile
- Piercing projectile
- Homing projectile
- Ricocheting projectile
- Bouncing projectile
- Lobbed projectile
- Missile or rocket
- Grenade
- Shotgun spread
- Hitscan tracer
- Sniper trail
- Continuous beam
- Pulsed beam
- Laser sweep
- Chain lightning
- Tether
- Returning or boomerang projectile
- Orbiting projectile
- Deployable projectile
- Projectile shield

### 4.2 Combat: melee

- Weapon trail
- Slash arc
- Thrust streak
- Spin attack
- Ground slam
- Aerial plunge
- Charged strike
- Critical strike
- Parry
- Block
- Shield hit
- Weapon enchantment
- Weapon transformation
- Grab or grapple
- Execution hit

### 4.3 Impacts and explosions

- Generic hit
- Critical hit
- Armor hit
- Shield absorption
- Shield break
- Flesh impact
- Metal impact
- Stone impact
- Wood impact
- Glass impact
- Water impact
- Sand impact
- Snow impact
- Vegetation impact
- Explosion
- Implosion
- Shockwave
- Elemental detonation
- Delayed detonation
- Area pulse
- Ground crack
- Scorch mark
- Debris burst
- Disintegration
- Freeze and shatter

### 4.4 Abilities and magic

- Cast anticipation
- Charge-up
- Release
- Aura
- Buff
- Debuff
- Healing
- Shield
- Barrier dome
- Summon
- Teleport
- Portal
- Persistent area
- Trap
- Mine
- Target marker
- Area-of-effect telegraph
- Transformation
- Elemental infusion
- Drain or siphon
- Resurrection

### 4.5 Character movement and state

- Dash
- Air dash
- Double jump
- Landing
- Wall jump
- Slide
- Roll or dodge
- Sprint
- Footstep
- Swimming
- Flying
- Spawn
- Despawn
- Death
- Revive
- Hurt
- Invulnerability
- Stun
- Poison
- Burn
- Freeze
- Shock
- Corruption
- Sleep
- Stealth
- Reveal

### 4.6 Environment and surfaces

- Fire
- Smoke
- Steam
- Embers
- Ash
- Dust
- Sand
- Leaves
- Petals
- Pollen
- Rain
- Snow
- Hail
- Mist
- Waterfall
- Splash
- Wake
- Foam
- Bubbles
- Wind gust
- Magic zone
- Lava or magma
- Electrical equipment
- Environmental hazard
- Footprint
- Tire or skid interaction
- Wetness splash
- Destruction dust
- Destruction debris

### 4.7 Vehicles and technology

- Engine glow
- Thruster
- Exhaust
- Contrail
- Boost
- Brake
- Warp
- Vehicle shield
- Muzzle effect
- Damage smoke
- Electrical sparks
- Wheel interaction
- Track interaction
- Mech movement
- Reactor or energy core

### 4.8 World feedback and presentation

- Pickup
- Loot rarity
- Objective marker
- Checkpoint
- Interactable highlight
- Target lock
- Selection outline
- Level-up
- Achievement
- Spawn point
- Quest completion
- Boss phase transition
- Cinematic transition
- Screen-space hit flash
- Victory flourish
- Defeat flourish

### 4.9 Orthogonal modifiers

Templates combine the primary intent with modifiers:

| Axis | Values |
| --- | --- |
| Motion | Straight, ballistic, homing, orbiting, turbulent, tethered, surface-following, stationary, target-bound |
| Collision | Disappear, detonate, pierce, bounce, stick, split, return, continue |
| Element | Neutral energy, fire, ice, electric, wind, water, earth, poison, dark, holy, technological |
| Rendition | Anime, painterly, graphic, pixelated, holographic, realistic, inked |
| Scale | Micro feedback, character, encounter, boss, environment, cinematic |
| Medium | Air, ground, water, wall, target-bound, screen-space |
| Camera | Third-person gameplay, first-person, top-down, side view, close-up, cinematic |

The taxonomy is versioned data. New entries may be registered without changing
the effect-document schema.

## 5. Guided template contract

A template is a versioned, registered authoring manifest. It is not the saved
effect itself.

A template defines:

- stable id, label, description, and intent path;
- supported modifiers;
- guided questions and answer options;
- default answers;
- exposed macro parameters;
- a factory that creates a complete effect document;
- required runtime capabilities;
- required renderer-profile and source-asset references;
- supported backends and fallback policy;
- quality tiers and budgets;
- validation scenarios;
- migration behavior when the template evolves.

Template questions must affect meaningful structural or art-direction
decisions. Do not ask questions that merely rename low-level numeric fields.

### 5.1 Progressive disclosure

The authoring modes are:

1. **Guided** — intent, questions, and macro controls.
2. **Layers** — ordered phase-aware layer stack.
3. **Graph** — emitters, modifiers, renderers, events, and sub-effects.
4. **Renderer** — referenced VFX renderer profile and effect-local overrides.
5. **Assets** — referenced meshes, flipbooks, masks, noises, and gradients.
6. **Custom** — registered nodes, renderers, materials, sources, and adapters.

Opening an advanced mode must not destructively detach the effect from its
template. The document records template provenance and whether the graph still
matches the template's managed structure.

### 5.2 Macro parameters

A macro parameter drives multiple validated layer properties through response
bindings. For example, `charge` may drive:

- projectile length and radius;
- core and shell intensity;
- shell filament density;
- internal-particle count;
- travel-trail width and length;
- local-light intensity and range;
- release and impact sub-effect power.

Bindings use portable functions such as linear ranges, clamped curves, steps,
and color ramps. Portable documents must not contain arbitrary JavaScript.

## 6. Portable effect document

The canonical document type is:

```text
type:    toonlab.vfx.effect
version: 1
```

Required top-level fields:

| Field | Purpose |
| --- | --- |
| `type` | Stable document discriminator |
| `version` | Schema version |
| `id` | Stable project-local effect id |
| `label` | User-facing label |
| `description` | User-facing description |
| `template` | Template id, version, and normalized guided answers used to create the effect |
| `intent` | Stable taxonomy path and modifiers |
| `style` | Selected VFX style id, independent of effect identity |
| `parameters` | Validated macro/effect parameters |
| `inputs` | Host-provided runtime input contract |
| `phases` | Lifecycle/state-machine definitions |
| `layers` | Ordered phase-aware render/emission layers |
| `bindings` | Portable macro-to-layer response mappings |
| `quality` | Tier policy, feature fallbacks, and budgets |

Optional fields include author notes and named tags. Current preview state,
timestamps, URLs, database ids, camera state, test surface, and current time of
day are excluded.

### 6.1 Validation

Validation must:

- accept an object or parsed JSON;
- reject unsupported future versions;
- migrate supported older versions before validation;
- normalize ids without silently changing meaning;
- reject duplicate phase, layer, input, and parameter ids;
- reject unknown phase references;
- reject bindings to unknown parameters, layers, or fields;
- reject invalid renderer/source references;
- verify required template capabilities;
- verify quality-tier ordering and budgets;
- preserve warnings separately from errors;
- return a canonical immutable-ready value;
- never register or mutate global state as a side effect.

The validation result shape is:

```js
{
  ok: boolean,
  value: object | null,
  errors: string[],
  warnings: string[],
}
```

### 6.2 Serialization and migration

- Serialization emits canonical field ordering and stable JSON.
- The same document round-trips without a database.
- Migrations are sequential and deterministic.
- A runtime never mutates the caller's document.
- A document newer than the current runtime fails with an actionable error.
- Template evolution does not silently replace author modifications.

## 7. Runtime model

The runtime compiles an effect document into an executable effect definition.
Spawning creates a pooled effect instance.

### 7.1 Execution levels

| Level | Responsibility |
| --- | --- |
| Definition | Validated portable data and compiled immutable plans |
| Pool | Warm reusable GPU/scene resources for one compatible definition |
| Instance | Runtime inputs, phase, clock, transform, event state, and handles |
| Layer instance | Renderer/emitter state owned by one effect instance |

### 7.2 Standard layer types

- Sprite particle
- Mesh particle
- Mesh volume
- Ribbon
- Trail
- Beam
- Decal
- Local light
- Distortion contribution
- Post-processing contribution
- Nested/sub-effect

### 7.3 Standard behavior modules

- Point, sphere, box, cone, mesh-surface, and volume emitters
- Velocity and directional inheritance
- Gravity
- Drag
- Attraction and repulsion
- Vortex
- Curl noise
- Orbit
- Turbulence
- Collision and surface response
- Size, color, opacity, emission, and rotation over life
- Parameter-response curves
- Events on spawn, phase entry/exit, threshold, collision, and death

### 7.4 Runtime inputs and events

The runtime owns presentation. The host owns gameplay authority.

Standard inputs include:

- transform or position;
- direction or velocity;
- scalar charge/power;
- team/palette selection;
- target transform;
- surface context;
- quality tier;
- stable spawn seed.

Standard outputs/events include:

- phase entered;
- visual contact requested;
- effect completed;
- named cue requested.

An effect may request a hit presentation. It must not apply damage or decide
whether a collision is authoritative.

### 7.5 Extension boundary

Portable custom behavior references registered ids:

```js
registerVfxNodeType(...)
registerVfxRenderer(...)
registerVfxMaterial(...)
registerVfxAssetSource(...)
registerVfxRuntimeAdapter(...)
```

Registrations declare:

- id and semantic version;
- portable settings validator;
- compile and lifecycle contract;
- supported backend/features;
- fallback behavior;
- resource ownership and deterministic disposal;
- diagnostics and capability reporting.

Raw functions and executable source are never serialized into effect JSON.

## 8. Performance and quality

Performance is compiled from the authored effect. It must not permanently
constrain authoring to one fixed draw-call layout.

Required policies:

- Pool effects and layer resources; no per-spawn shader compilation.
- Batch compatible particles by renderer profile, blend/depth state, geometry,
  and attribute layout.
- Keep instance clocks deterministic under the same seed and update cadence.
- Bound particles, trails, beams, lights, sub-effects, and retained history.
- Define overload behavior: recycle oldest, reject spawn, reduce density, or
  apply priority policy.
- Expose CPU, GPU, draw, particle, render-target, and memory estimates.
- Dispose every geometry, material, texture, target, and event subscription.
- Apply distance, screen-size, and importance scaling.
- Preserve the dominant silhouette and timing hierarchy at lower tiers.

Minimum quality tiers:

| Tier | Policy |
| --- | --- |
| Mobile | No refraction/distortion dependency; reduced mesh/particle layers; single trail; bounded bloom contribution |
| Desktop fallback | WebGL2-compatible renderer profiles; reduced volume complexity; no unsupported compute path |
| Desktop high | Full layered effect, wide bloom support, local light, mesh particles, and distortion where available |
| Cinematic | Higher source resolution, more particles/filaments, longer histories, and optional high-cost post contributions |

An unsupported feature must report whether it was disabled, approximated, or
replaced. Silent visual degradation is not production behavior.

## 9. Preview and approval

The VFX Lab consumes the universal preview environment but does not serialize
its current state.

Required preview controls:

- continuous time plus Dawn, Day, Sunset, and Night;
- play, pause, restart, frame step, and slow motion;
- phase isolation and timeline scrubbing;
- charge/power preview;
- easy and difficult lighting backgrounds;
- near, gameplay, and distant camera ranges;
- air, ground, wall, water, and target collision fixtures;
- backend and quality selection;
- layer solo/mute and renderer debug views;
- bounds, emitter, overdraw, depth, and performance diagnostics;
- four-state capture and compare.

An effect is not approved from a black background alone. Bloom and darkness can
hide weak silhouettes, depth-order bugs, and incorrect alpha behavior.

## 10. Charged Energy Shot vertical slice

The first production template is:

```text
id:     charged-energy-shot
intent: combat / ranged / charged-projectile
```

The visual target is an original layered energy capsule informed by the
reference qualities visible in:

<https://x.com/peplmGameDev/status/2081442927461470591/video/1>

The reference qualities are:

- a clearly elongated three-dimensional energy volume;
- a bright directional core;
- moving shell filaments/cracks;
- internal particulate depth;
- unstable boundary sparks;
- coherent color variants;
- bloom-supported but still readable silhouettes.

The template and shipped assets remain original. It is not named for, nor does
it copy assets from, a third-party game.

### 10.1 Guided questions

1. Charge model: continuous scalar, discrete tiers, automatic, or no visible
   charge phase.
2. Motion: straight, ballistic, homing, piercing, ricocheting, or
   player-steered.
3. Silhouette: orb, capsule, spear, disk, wave, cone, or custom mesh.
4. Contact: detonate, pierce, dissipate, stick, split, or bounce.
5. Energy language: clean, unstable, electrical, crystalline, liquid,
   technological, or custom.
6. Importance: regular, charged, ultimate, boss, or cinematic.
7. Target tier: mobile, desktop fallback, desktop high, or cinematic.

The first implementation supports:

- continuous scalar charge;
- straight travel;
- capsule silhouette;
- detonate contact;
- unstable energy language;
- mobile, desktop fallback, desktop high, and cinematic quality tiers.

Unsupported answers remain visible as roadmap capabilities; the UI must not
pretend they are already available.

### 10.2 Runtime input contract

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `from` | vec3 | Yes | World-space spawn position |
| `velocity` | vec3 | Yes | Initial world-space velocity |
| `charge` | number 0..1 | No | Charge scalar, default 1 |
| `chargeDuration` | number seconds | No | Optional held charge/anticipation time before release; `0` preserves immediate gameplay spawning |
| `collisionMode` | enum | No | `detonate`, reserved for later contact modes |
| `qualityTier` | enum | No | Mobile, desktop fallback, desktop high, or cinematic |
| `maxLife` | number | No | Maximum travel time |
| `look` | object | No | Validated per-spawn presentation overrides |
| `onHit` | function | Runtime only | Host gameplay callback; never serialized |

### 10.3 Lifecycle

| Phase | Mode | Purpose |
| --- | --- | --- |
| `charge` | Held loop | Emitter-anchored anticipation while input is held |
| `release` | One-shot, 0.28 s | Source-anchored warped 3D ring and launch transition |
| `travel` | Loop | Layered projectile body, particles, and trail |
| `impact` | One-shot | Contact flash, shockwave, sparks, and smoke |
| `pierce` | One-shot overlay | Reduced contact response while travel continues |
| `expire` | One-shot | Graceful non-contact collapse and pooled cleanup |

The first runtime slice implements `charge`, `release`, `travel`, `impact`, and
`expire`. The same effect can still be spawned directly into release/travel by
leaving `chargeDuration` at zero. The document reserves `pierce`; full
multi-contact piercing is enabled when the host collision adapter lands.

The phase ownership rule is strict:

- charge visuals remain at the emitter;
- the release ring captures its launch transform once, expands/fades there,
  and is retired after 0.28 seconds;
- only travel-owned layers follow the projectile;
- impact layers spawn at the collision position after the travel body retires;
- expiration is mutually exclusive with impact;
- completion of either terminal phase returns the pooled instance.

The authored projectile nose is local `-X`. Runtime orientation maps that axis
to the velocity vector, and axial shader animation uses the same sign. This
prevents the silhouette or animated flow from reading backward even when the
host launches along negative world X.

### 10.4 Layer stack

| Layer | Standard type | Renderer/source role |
| --- | --- | --- |
| Directional core | Mesh volume | Bright elongated body |
| Core streaks | Mesh volume/ribbon | Directional internal flow |
| Energy shell | Mesh volume | Three-dimensional boundary |
| Shell filaments | Renderer-profile channel | Animated cracks/veins |
| Circulating energy | Procedural mesh volume | Seeded surface arcs, forks, and orbiting energy |
| Internal motes | Volume particles | Depth and instability |
| Boundary sparks | Particle emitter | Surface shedding |
| Travel trail | Trail/ribbon | Speed and direction |
| Source release ring | Procedural ribbon pair | One compact emitter-anchored closed loop with firing-axis depth |
| Local light | Light | Optional nearby illumination |
| Bloom contribution | Post reference | Host post-processing recommendation |
| Contact burst | Sub-effect | Impact presentation |
| Expiration collapse | Phase response | Non-contact teardown |

### 10.5 Guided macro controls

- Charge preview
- Length
- Radius
- Front taper
- Rear taper
- Widest-point position
- Mirrored half-profile
- Core intensity
- Shell intensity
- Filament density
- Filament speed
- Circulating-energy enable
- Energy-motion theme
- Arc count and length
- Circulation speed and direction
- Surface offset and front–rear wander
- Irregularity, branching, thickness, and reformation
- Internal turbulence
- Trail length
- Particle amount
- Release ring depth
- Release ring irregularity and ripple count
- Impact power
- Core, edge, and accent colors
- Bloom contribution

Macro controls bind to several layers. Individual layer settings remain
available in advanced mode.

### 10.6 Shape authoring contract

The projectile must not be limited to a uniformly scaled sphere. Template
version 3 and Effect schema version 2 add two shape-authoring paths:

1. **Guided axial profile**
   - `frontTaper` controls the nose independently.
   - `backTaper` controls the trailing end independently.
   - `widestPoint` moves the maximum-radius station from front to rear.
   - `length` and `radius` remain the world-scale envelope.
2. **Drawn mirrored profile**
   - `silhouetteProfile` is a normalized 0..1 radius array sampled from front
     to rear.
   - The editor accepts one upper contour.
   - The lower contour is a vertical mirror, not a second hand-drawn curve.
   - Runtime revolves that mirrored two-dimensional profile around the travel
     axis to create a closed three-dimensional volume.
   - Core, energy shell, and shell filaments share the resulting topology so
     their boundaries cannot drift apart.

`customProfileEnabled` chooses the drawn profile. Guided taper values remain
stored when a drawn profile is active, allowing the artist to switch back
without losing the procedural starting point. “Start from guided shape”
copies the current guided contour into the drawing before editing.

Profiles use 8–64 samples; the default editor emits 32. Values are clamped to
0..1, input arrays are deterministically resampled, and the front/rear
endpoints are closed to zero. Flat caps or open topology require a future
explicit topology mode; they are not inferred accidentally from a stroke.

The authored forward axis remains local `-X`, so the first profile sample is
always the nose and the last sample is always the tail regardless of world
launch direction. Source textures retain front-to-rear UV continuity across
the generated volume.

### 10.7 Circulating-energy motion contract

Surface motion is not silhouette, projectile trajectory, animation timing, or
an imported texture. Template version 7 therefore owns a separate
`circulating-energy` mesh-volume layer and a dedicated Motion workspace.

The runtime generates bright ribbon pairs directly over the current axial
profile:

- one wide low-opacity ribbon provides the glow;
- one narrow bright ribbon provides the lightning core;
- both are drawn from fixed-capacity dynamic geometry;
- guided and hand-drawn silhouettes use the same profile sampler;
- circulation is transformed against the directional main body, then expanded
  by an explicit orbit-clearance value independent from the decorative shell;
- every primary arc receives a different seeded three-dimensional plane;
- non-planar wobble displaces points along the plane normal so individual
  paths vary across local X, Y, and Z rather than remaining flat rings;
- no geometry, material, or descriptor allocation occurs in the frame loop;
- path descriptors derive only from the effect seed and authored settings;
- identical seed + settings + update cadence produces identical paths;
- changing the seed changes the path layout without changing the authored
  motion recipe.

Circulation is expressed in local volume coordinates. `speed` advances paths
around the local travel axis; `direction` may be clockwise,
counter-clockwise, or alternating per seeded arc. Neither field changes the
projectile velocity or lifecycle phase.

The required authorable fields are:

| Field | Meaning |
| --- | --- |
| `circulationEnabled` | Enables the procedural layer without deleting its settings |
| `energyMotionTheme` | Starting-theme id or `custom` provenance |
| `circulationCount` | Primary arcs before branch forks |
| `circulationSpeed` | Rate at which paths advance around the volume |
| `circulationDirection` | Clockwise, counter-clockwise, or alternating |
| `circulationCoverage` | Visible fraction of a complete orbit per arc |
| `circulationIrregularity` | Seeded angular, radial, and axial deviation from a uniform circle |
| `circulationBranching` | Number and divergence of connected lightning forks |
| `circulationThickness` | Width of the bright ribbon core |
| `circulationSurfaceOffset` | Orbit clearance between the main body and lightning; high values may meet or clear the shell |
| `circulationAxialWander` | Permitted travel between projectile nose and tail |
| `circulationPlaneVariation` | Seeded plane tilt plus non-planar depth wobble across all three axes |
| `circulationFlicker` | Seeded disappearance and reformation |

The initial theme catalog is intentionally diverse:

| Theme | Intended character |
| --- | --- |
| Electric Orbit | Fast readable broken lightning wrapping the surface |
| Storm Crawl | Many short nervous branches with high reformation |
| Plasma Bands | Long smooth coherent circulation with restrained noise |
| Solar Loops | Slow broad elevated magnetic-loop shapes |
| Ion Cage | Fast opposing arcs crossing the front and rear |
| Unstable Corona | Uneven medium arcs that flare, vanish, and reform |

Themes are not locked shader presets. Selecting one writes its values into the
Effect document. Editing any detailed motion field changes
`energyMotionTheme` to `custom`; every value remains visible and editable.
Selecting another theme deliberately replaces the detailed motion fields.
Disabling the layer is non-destructive.

Quality tiers bound the primary-arc count to `0 / 4 / 8 / 12` for mobile,
desktop fallback, desktop high, and cinematic respectively. Branches share
the same fixed geometry allocation. The layer costs two mesh draws regardless
of the configured arc count.

Imported animated masks remain a separate Visual Source concern. They can
break up the energy shell or filaments, but they do not replace the geometric
circulation path. A future generalized path editor may add hand-authored
splines; it must serialize an explicit path document rather than hiding a
stroke inside the theme id.

### 10.8 Source release ring contract

The release event remains a ring. It is not a planar torus and it is not a
separate blast volume. It is one closed centerline rendered as a bounded
glow/core ribbon pair:

- the loop has authored firing-axis depth, so its centerline varies across
  local X, Y, and Z;
- a small seeded tilt and radial ripple keep it from reading as a perfect
  mechanical circle;
- expansion is restrained to `0.92–1.16×`, so the ring never becomes a second
  projectile-sized sphere;
- one captured source transform, so the ring remains at the emitter while the
  projectile enters travel;
- deterministic geometry rebuilt only when an instance is armed, with no
  frame-loop allocation.

`releaseDepth` controls centerline displacement along the firing axis.
`releaseIrregularity` controls restrained radius and width variation.
`releaseLobes` controls the number of gentle ripples around the loop. The Sequence
workspace owns these controls and previews the release independently from
charge, travel, and impact.

The stable layer id remains `leading-compression` for document migration, but
its renderer/source contract is `toonlab.vfx.energy-ring-3d` plus
`toonlab.procedural.warped-ring`; new documents do not serialize a torus or
wave volume.

### 10.9 Acceptance criteria

Document and runtime:

- The document validates, serializes, parses, and round-trips.
- Unknown future versions fail.
- Duplicate ids and broken references fail.
- The registered template creates deterministic canonical documents.
- Effect identity, VFX style, runtime inputs, and preview state remain separate.

Visual:

- The projectile is visibly three-dimensional from front, side, and oblique
  views.
- Core, shell, filaments, particles, and trail each make a distinct readable
  contribution when soloed.
- Charge 0, 0.5, and 1 produce one coherent family rather than three unrelated
  presets.
- The silhouette remains readable with bloom disabled.
- Guided front and rear changes produce visibly independent responses.
- A drawn upper contour mirrors exactly and changes the actual mesh geometry,
  not just a screen-space mask.
- Drawn shape data round-trips through JSON, project duplication, share, and
  code export.
- The effect remains readable on dark, light, warm, cool, and textured
  backgrounds.
- Impact and expiration never pop out in one frame.
- Additive layers do not write depth; alpha/cutout layers use documented depth
  behavior.

Runtime:

- Same seed and update cadence produce the same particle records.
- Pools remain within configured capacity.
- Completed instances return to the pool.
- No draw calls remain after all layers die.
- `clear()` and `dispose()` deterministically release all state.
- WebGPU and TSL WebGL paths build and render.
- Quality fallbacks are reported.

Lab:

- The template starts from intent and guided questions.
- Sequence view can select charge, release, travel, impact, or expiration
  independently and can play the complete collision flow.
- The live phase indicator follows actual runtime state, not a UI-only timer.
- Selecting a phase filters layer inspection to that phase.
- Every portable macro parameter is editable.
- Export uses the public effect-document API.
- Structural changes rebuild only affected compiled resources.
- Uniform-only changes do not tear down all live VFX.
- Preview-only charge, time, camera, target, and playback state are excluded
  from export.

## 11. Implementation sequence

1. Effect-document schema, validation, parse/serialize, and migration boundary.
2. Intent taxonomy and template registry.
3. Charged Energy Shot template document.
4. Layered charged-projectile core and bounded pool.
5. `createVfxSystem().spawn('chargedShot', ...)` compatibility integration.
6. Guided intent/template selection and macro controls in VFX Lab.
7. Host post-processing integration and explicit bloom recommendation.
8. Universal preview environment adoption.
9. Separate effect-project browser and isolated single-effect editor.
10. Versioned visual-source documents, procedural generation, uploaded
    animated media, content identity, and runtime shader sampling.
11. Searchable visual catalog, generated thumbnail/loop pipeline, catalog
   facets, and insertion/replacement workflow.
12. Arbitrary phase-duration editing, keyframe curves, and transition-graph
    authoring beyond the shipped selectable phase sequence.
13. General graph compiler and custom registries.
14. Additional projectile templates.
15. Impact, beam, melee, movement, character-state, world, vehicle, and
    feedback template families.

## 12. Production status

This document describes the required production contract. Source presence,
passing tests, or a successful screenshot does not change the roadmap status
to Ready. The shared VFX Lab's Effect and Renderer Profile workspaces are
**In progress**. Their `vfxgen` and future `vfx` npm contracts remain
**Migration required** until the complete acceptance matrix is explicitly
reviewed and approved.

Current implementation coverage:

| Capability | Status |
| --- | --- |
| Versioned `toonlab.vfx.effect` schema v2 document, canonical validation, parse, serialize, profile normalization, and future-version rejection | Implemented |
| Template provenance including normalized guided answers | Implemented |
| Full intent catalog with explicit Available versus Planned status | Implemented |
| Charged Energy Shot template v7 and macro-to-layer bindings | Implemented |
| Dynamic runtime registration by project-owned effect id | Implemented |
| Required runtime-input validation | Implemented |
| Deterministic pooled charged projectile, held charge, source-anchored release, travel shedding, impact, expiration, and host collision callback | Implemented |
| Quality-tier projectile, particle-rate, streak, filament, circulating-arc, and local-light fallbacks | Implemented for the Charged Energy Shot |
| VFX Lab guided flow, macros, managed layer inspection, share, JSON export, and code export | Implemented |
| Shared VFX Lab hosting separate Effect and Renderer Profile workspaces over the active projectile | Implemented |
| Selectable Charge/Release/Travel/Impact/Expire segment preview plus full collision-flow playback and live phase state | Implemented for Charged Energy Shot |
| Dedicated Shape workspace with independent front/rear taper, widest-point control, one-half drawing, vertical mirroring, axial revolve, and non-destructive guided fallback | Implemented for Charged Energy Shot |
| Dedicated Motion workspace with six editable themes, deterministic custom circulation, non-uniform paths, branching, reformation, and bounded quality tiers | Implemented for Charged Energy Shot |
| Sequence-owned compact release ring with firing-axis depth, restrained irregularity, ripple controls, and source anchoring | Implemented for Charged Energy Shot |
| ToonLab-standard lab header with BrandLockup and in-header renderer selection | Implemented |
| Separate effect-project browser, independent duplication, and isolated Design/Shape/Motion/Sequence/Sources/Layers/Quality workspace | Implemented |
| Versioned procedural/file Source documents, deterministic generators, animated-image/video upload, SHA-256 identity, browser persistence, and live shell sampling | Implemented for Charged Energy Shot shell and filament slots |
| Host-owned bloom preview and universal time-of-day preview | Implemented in VFX Lab; excluded from the effect document |
| Searchable thumbnail/loop catalog, favorites, recent/project facets, and one-action layer/effect insertion | Planned; product direction documented from the second reference |
| General editable transition graph, arbitrary duration/keyframe editor, custom node UI, and template detachment/rebase workflow | Planned |
| Homing, piercing, bouncing, sticking, splitting, alternate silhouettes, custom meshes, and other template families | Planned |
| Full multi-device four-time visual acceptance matrix and explicit product approval | Not yet approved |
