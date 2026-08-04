# Licensed Woody-Tree Baseline Audit

## Purpose and legal boundary

The licensed graph is now Toonlab's baseline for conventional woody trees and
conifers. The local Blender bridge evaluates that graph directly and maps
Toonlab treeRecipe v3 controls onto its seed, height, trunk, recursive branch,
foliage, root, and resolution inputs. Source-specific object names and socket
identifiers remain in a gitignored adapter beside the licensed package.

The public runtime uses Toonlab generator, recipe, material, and semantic
names. It does not redistribute source files, textures, UI labels, or preset
metadata. Every baked result is centered, grounded, checked for an open
structural base, and assigned Toonlab-owned materials before GLB export.

## Audit coverage

The private library contains 400 assets across 17 cohorts, with 240 distinct
exact-control configurations. Its primary graph exposes 137 input sockets:
131 are connected behavior controls and six are inert section-label strings.
It provides useful woody-tree evidence
for:

- rounded, spreading, vase, columnar, excurrent, and ancient broadleaf forms;
- open pine forms;
- dense and pendant spruce/fir forms.

It is not a behavioral reference for bamboo colonies, palms, cycads, tree
ferns, giant monocot pseudostems, branched rosettes, mangrove root systems, or
cacti. Those remain separate Toonlab engines.

All 400 assets and all 131 connected controls are included in the exhaustive
capability audit. Eight representative woody/conifer silhouettes were also
evaluated at three seeds and three development proxies, for 72 geometry
samples. The development proxies
jointly change height, trunk width, recursive order, branch population, root
scale, and waviness. They are an audit instrument, not copied presets and not a
claim that the vendor exposes a single biological age model.

The audit can be repeated locally with the gitignored inspection tools.

Only aggregate bounds, triangle counts, and variation coefficients are
written. No vendor geometry is exported.

## Complete capability contract

The public neutral contract accounts for every connected source input:

| Execution owner | Controls | Contract |
| --- | ---: | --- |
| Exact procedural graph | 99 | Geometry, topology, leaves, flowers, roots, motion, shedding, resolution, and realization |
| Toonlab replacement | 27 | Toonlab-owned materials, colors, mapping, moss, translucency, emission, and outlines |
| Private local resource binding | 4 | Custom leaf, flower, falling-leaf, and direction-object datablocks |
| Host integration | 1 | Host scene input geometry |

Tree Lab displays all 131 controls in 15 functional sections. All 123
serializable controls have an inherited Toonlab value and an explicit
override switch. The five local/host bindings and three material datablocks
remain visible but are intentionally pipeline-owned rather than embedded in a
portable recipe.

The 115 conventional woody/conifer species each resolve a distinct complete
Toonlab-owned inherited control set. That set is applied before life-stage
development; explicit user overrides are applied last. Consequently, the
licensed file carries graph behavior but none of its saved preset values can
silently define a Toonlab species.

## Meaningful structural controls

The exposed model separates shape, growth, organs, roots, and resolution:

| Control family | Observable geometric role | Toonlab mapping |
| --- | --- | --- |
| Seed domains | Main form, branching, and leaves can vary independently | Stable structural, organ, and presentation seed streams |
| Height and trunk width | Primary dimensions, not a global uniform scale | Species dimensions plus continuous development curves |
| Main trunks, twist size, twist amount | Multi-leader start and large-scale trunk character | Axis initiation, helical bias, and trunk wander |
| Waviness scale, roughness, intensity | Frequency and amplitude of centerline deviation | Low-frequency trunk noise and higher-frequency branch noise |
| Separate trunk/branch waviness | Keeps the trunk legible while terminal wood stays lively | Per-axis-order noise and compliance |
| Branch profile | Controls vertical branch-population envelope | Crown envelope functions |
| Recursive orders | Adds topology and density, not merely polygon resolution | Stable semantic axis generations |
| Even distribution and branch seed | Separates phyllotaxis from controlled irregularity | Divergence angle, whorl phase, and deterministic jitter |
| Width, length, and sub-order length | Per-generation allometry | Pipe-model radii and order-specific length decay |
| Branch amount and exponential growth | Alters child population by order | Internode density and order-dependent initiation probability |
| Spawn start/end | Restricts lateral initiation to a finite parent interval | Per-order branch zones |
| Vertical/lateral orientation and randomness | Sets branch angle and azimuthal spread | Phyllotaxis plus architecture-specific insertion angles |
| Endpoint orientation | Corrects terminal growth independently from branch bases | Tropism blend and upward tip recovery |
| Root size, shape, complexity | Adds a simple visible support base | Toonlab root modules; specialized roots remain independent |
| Tree/branch steps and radial resolution | Changes smoothness without changing structure | Renderer and LOD budgets only |

Leaf and flower generation are part of the complete control surface, including
leaf geometry variants, custom geometry binding, material preservation,
culling, dispersion, rotation, scale/deformation, flower distribution, core
construction, petal construction, extra layers, stamens, and independent
resolutions. Toonlab species presets keep reproductive density at zero until a
species-specific reproductive profile is reference-reviewed; the underlying
capability is no longer omitted.

## Behavioral findings

The 72 aggregate probes establish several transferable relationships:

1. Development is primarily topological. Young samples retained roughly
   61–84% of mature height and 82–97% of mature spread, but only about 7–21%
   of mature evaluated triangle count.
2. Old silhouettes changed dimensions modestly—typically about 0–10% in
   height and 0–12% in spread—while recursive detail increased much more.
   Toonlab therefore must not model age as uniform scale.
3. Architecture dominates the spread-to-height ratio. Mature columnar forms
   were narrow, conifers intermediate, rounded/vase/spreading forms wider, and
   ancient sculptural forms widest.
4. Seed changes were controlled. Mature height usually varied by less than
   3%, while spread and topology varied more. A random seed should produce a
   new individual without changing species dimensions or crown class.
5. Conifer development increased detail more gradually than high-order
   broadleaf recursion. Conifer whorl count and spray density need separate
   growth curves from broadleaf branch orders.
6. Structure and resolution are separate concerns. Increasing radial or path
   resolution cannot compensate for missing branch topology.

## Toonlab technique map

The following baseline techniques are mapped to Toonlab's independently
maintained runtime and game-specific extensions:

| Baseline technique | Toonlab integration or extension |
| --- | --- |
| Finite branch spawn bands | `branchSpawnStart`/`branchSpawnEnd` per axis order |
| Recursive allometry | Per-order length, child-count, and initiation curves |
| Distinct centerline noise by axis class | Frequency/amplitude profiles for trunk, scaffold, branch, and twig |
| Endpoint correction | Explicit gravitropism, phototropism, sag, wind, and tip-up blend |
| Architecture-specific vertical profiles | Crown-envelope functions for excurrent, decurrent, vase, layered, columnar, weeping, and spreading forms |
| Controlled even distribution | Golden-angle phyllotaxis, configurable divergence, true whorls, and stable jitter |
| Structural/detail separation | Plant graph generation independent of tube radial resolution and LOD |
| Development-dependent recursion | Deterministic branch birth thresholds and continuous growth of a stable individual |
| Closed evaluated branch volumes | Baseline exports fill low structural boundary loops; the editable semantic engine retains hidden proximal plugs and branch collars |

The pipe model, semantic graph, botanical architecture modes, specialized root
modules, and LOD semantic compiler are Toonlab-specific designs and are not
derived from vendor assets.

## Pre-implementation Toonlab gaps

The v3 prototype already had deterministic semantic axes, curved multi-section
trunks, recursive branches, basic phyllotaxis, conifer whorls, and a preliminary
space-colonization mode. The audit identified these production blockers:

- recursive branch radii were independent ratios rather than a bottom-up
  area-preserving pipe model;
- parent/child cylinders were capped and produced visible joint seams;
- tropism was one combined vertical force, with no independent gravity,
  light, sag, wind, or tip correction;
- columnar, weeping, spreading, and explicit excurrent modes were incomplete;
- the golden angle and spawn pattern were hard-coded instead of represented in
  the recipe and Tree Lab;
- branch centerlines were not constrained throughout growth by the crown
  envelope;
- continuous age scaled dimensions but rounded topology to one of five slots,
  causing branch-order discontinuities;
- seed streams could be consumed by presentation details and disturb later
  structural choices;
- Tree Lab exposed legacy branching controls without the architecture-specific
  growth relationships needed by the v3 engine;
- the renderer emitted independent capped frusta instead of overlapping open
  tubes with junction collars;
- LOD compilation understood semantics, but had no explicit pipe-load or
  junction metadata to guide architecture-preserving reduction.

Species remain marked experimental and excluded from approved catalog output
until their five stages pass reference-backed front/side/back review. This
engine audit validates procedural behavior, not exact botanical likeness.

## Implemented Three.js baseline and editable extension

The production implementation is now a browser-native Three.js plant graph.
There is no Blender process, generated-GLB preview bridge, or tree-baseline API
in the Tree Lab runtime:

- Tree Lab evaluates recipe v3 directly into Toonlab's deterministic semantic
  plant graph, then creates the live Three.js geometry used by Edit preview.
- The same graph is compiled into LOD0–LOD3 and exported, so the editor,
  semantic validation, LOD compiler, and GLB exporter no longer cross a
  separate authoring-runtime boundary.
- `woodyBaselineControls.js` translates the audited control relationships into
  Toonlab graph traits. Species profiles provide the inherited baseline;
  explicit Tree Lab edits provide a sparse override layer.
- Doodle Tree continues to use the same semantic graph, preserving hand-drawn
  axes, stable part IDs, deterministic generation, and export compatibility.

- `plantGraph.js` grows stable semantic axes and applies independent crown
  envelopes, phyllotaxis/whorls, internode spacing, growth births, tropisms,
  space colonization, and a bottom-up pipe model.
- `proceduralSpeciesTree.js` sweeps each woody or conifer axis as one
  parallel-transported, watertight tube. Parent/child axes remain separate
  semantic objects, but hidden proximal plugs prevent hollow interiors,
  branch collars begin inside the parent, and same-axis elbows share a
  continuous surface.
- `treeRecipe.js` maps the biological controls to recipe v3 without changing
  the v1/v2 legacy-woody upgrade path. Recipe v3 carries a versioned, complete
  inherited species-control set plus a sparse explicit-override layer.
- `woodyBaselineControls.js` is the neutral 131-control registry, section
  taxonomy, enum contract, complete default set, and Toonlab species resolver.
- `WoodyBaselinePanel.jsx` exposes the complete inventory in Tree Lab. It shows
  the inherited species value beside every portable parameter and never hides
  local-resource or host-owned capabilities.
- `verify-woody-baseline-coverage.mjs` proves one-to-one private/public mapping,
  validates all 400 source assets, requires a value for every portable
  control, and verifies 115 distinct Toonlab species baselines.
- `treeLodCompiler.js` consumes semantic graphs, retains stable part IDs, and
  produces volumetric engine-aware far proxies instead of relying on
  trunk/foliage object names.
- `verify-tree-woody-engine.mjs` gates 72 development probes covering eight
  representative architectures, three seeds, and three ages. It checks
  deterministic growth, stable mature topology, curved axes, area-preserving
  taper, branch collars, crown-mode separation, sag response, whorls,
  internode density, and true height growth.

The engine gate is separate from botanical approval. Passing the engine tests
or generating a licensed-baseline tree does not approve a species. All 165
species are available for explicit experimental testing, while approved
catalog output stays closed until each species' five stages pass the
reference-backed morphology gate.

## English oak morphology pass 1

The exact-species audit uses openly licensed observation photographs and
whole-plant Wikimedia reference views downloaded into
`docs/research/tree-species-references/images`. The generated manifest records
the Kew taxon, descriptive source, source page, provider, creator, license, and
local image for all 165 species. The images are research evidence and are not
runtime textures.

The references show rounded, alternating leaf lobes on short petioles, a stout
lower bole with a modest root crown, irregular subhorizontal scaffold limbs,
and a broad crown with deliberate windows. Toonlab therefore independently
implements one procedural lobed leaf per card, deterministic golden-angle
placement along short terminal shoots, a longer lower-bole flare, fully buried
standard structural roots, randomized bark V-phase per axis, and watertight
hidden tube plugs. No reference pixels are embedded in the leaf or bark
textures.

This pass is still `needs-review`. The hollow-volume defect is closed and the
root spikes are removed, but branch-to-trunk contours remain too mechanical
for approval. English oak and every other species stay experimental until all
five stages pass reference-backed front, side, back, contact, semantic/export,
and LOD-continuity review.
