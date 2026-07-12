import {
  DEFAULT_STYLIZED_TREE_SETTINGS,
  STYLIZED_TREE_SETTING_FIELD_SCHEMA,
  StylizedTree,
  TREE_RECIPE_SCHEMA,
  TREE_RECIPE_VERSION,
  TREE_TRUNK_STYLES,
  serializableTreeOptions,
} from './stylizedTree.js';
import { StylizedBush } from './stylizedBush.js';
import { StylizedFlower } from './stylizedFlower.js';
import { FLOWER_SPECIES } from './flowerSpecies.js';
import { resolveCanopyColor } from './stylizedTreeFoliage.js';

export { TREE_RECIPE_SCHEMA, TREE_RECIPE_VERSION };

// Tree/bush recipe layer: the single source of truth Tree Lab's UI,
// preset files, and runtime rebuilds all share.
//
//   settings — flat { group: { key: value } } state edited by the panel
//              (TREE_SETTING_GROUPS / TREE_SETTING_FIELD_SCHEMA drive the UI)
//   recipe   — { schema: 'treeRecipe', version, type: 'tree'|'bush'|'flower',
//              options } where options feed the StylizedTree/StylizedBush/
//              StylizedFlower constructor
//
//   const recipe = recipeFromSettings(settings);
//   const plant = createPlantFromRecipe(recipe);        // deterministic
//   const settings2 = settingsFromRecipe(recipe);       // best-effort inverse
//
// Colors in settings are sRGB triplets [r, g, b] (0..1) — the same shape the
// debug panel's color controls round-trip — and resolveCanopyColor accepts
// them back verbatim.
//
// The canonical field metadata (ranges, labels, descriptions, defaults) lives
// in STYLIZED_TREE_SETTING_FIELD_SCHEMA / DEFAULT_STYLIZED_TREE_SETTINGS
// (stylizedTree.js) — the same source the generated settings reference uses.
// This module only re-shapes it for the editor (flat panel groups, trunk
// style presets, auto/pin toggles, wind heading) and hand-authors the few
// editor-only fields the constructor schema keeps opaque (plant type, blob
// layout numbers inside canopyLayout, palette pins).

const TRUNK_STYLE_KEYS = ['bend', 'lean', 'twist', 'gnarl', 'height', 'radiusBottom', 'leanOffset'];

const CANONICAL_DEFAULTS = DEFAULT_STYLIZED_TREE_SETTINGS;

export const TREE_SETTING_DEFAULTS = Object.freeze({
  // Curated starter plant (a pleasant mid-size tree), not the constructor
  // defaults: the editor should open on something worth looking at.
  plant: Object.freeze({ type: 'tree', seed: 3, size: 1.7 }),
  trunk: Object.freeze({
    style: 'straight',
    height: CANONICAL_DEFAULTS.trunk.height,
    radiusBottom: CANONICAL_DEFAULTS.trunk.radiusBottom,
    ...TREE_TRUNK_STYLES.straight,
    bendDirectionAuto: true,
    bendDirection: 0,
    leanOffsetAuto: true,
    leanOffset: Math.PI,
  }),
  skeleton: Object.freeze({
    generator: CANONICAL_DEFAULTS.skeleton.generator,
    levels: CANONICAL_DEFAULTS.skeleton.levels,
    childrenCount: CANONICAL_DEFAULTS.skeleton.childrenCount,
    branchAngle: CANONICAL_DEFAULTS.skeleton.branchAngle,
    branchStart: CANONICAL_DEFAULTS.skeleton.branchStart,
    lengthRatio: CANONICAL_DEFAULTS.skeleton.lengthRatio,
    radiusRatio: CANONICAL_DEFAULTS.skeleton.radiusRatio,
    gnarliness: CANONICAL_DEFAULTS.skeleton.gnarliness,
    forceStrength: CANONICAL_DEFAULTS.skeleton.forceStrength,
    conifer: CANONICAL_DEFAULTS.skeleton.conifer,
    attractionCount: CANONICAL_DEFAULTS.skeleton.attractionCount,
    segmentLength: CANONICAL_DEFAULTS.skeleton.segmentLength,
    influenceRadius: CANONICAL_DEFAULTS.skeleton.influenceRadius,
    killRadius: CANONICAL_DEFAULTS.skeleton.killRadius,
    maxNodes: CANONICAL_DEFAULTS.skeleton.maxNodes,
    radialSegments: CANONICAL_DEFAULTS.skeleton.radialSegments,
    tipRadius: CANONICAL_DEFAULTS.skeleton.tipRadius,
    minLimbRadius: CANONICAL_DEFAULTS.skeleton.minLimbRadius,
    attractionReachAuto: true,
    attractionReach: 0.65, // the canopy-mode auto value (canonical default is null)
  }),
  canopy: Object.freeze({
    width: CANONICAL_DEFAULTS.tree.canopyWidth,
    depth: CANONICAL_DEFAULTS.tree.canopyDepth,
    canopyScale: CANONICAL_DEFAULTS.tree.canopyScale,
    // createCanopyBlobs parameter defaults — opaque `canopyLayout` object in
    // the constructor schema, exploded into sliders here.
    flatten: 0.5,
    lobeCount: 6,
    spread: 1.25,
    coreRadius: 0.9,
  }),
  leaves: Object.freeze({
    placement: CANONICAL_DEFAULTS.tree.leafPlacement,
    density: CANONICAL_DEFAULTS.tree.leafDensity,
    cardCount: CANONICAL_DEFAULTS.canopy.cardCount,
    cardSizeMin: CANONICAL_DEFAULTS.canopy.cardSizeRange[0],
    cardSizeMax: CANONICAL_DEFAULTS.canopy.cardSizeRange[1],
    cardsPerCluster: CANONICAL_DEFAULTS.canopy.cardsPerCluster,
    clusterRadius: CANONICAL_DEFAULTS.canopy.clusterRadius,
    shellFill: CANONICAL_DEFAULTS.canopy.shellFill,
  }),
  color: Object.freeze({
    canopy: Object.freeze([...CANONICAL_DEFAULTS.tree.canopyColor]),
    pinLit: false,
    lit: Object.freeze([...CANONICAL_DEFAULTS.tree.canopyColor]),
    pinShadow: false,
    shadow: Object.freeze([0.18, 0.42, 0.28]),
    pinCrown: false,
    crown: Object.freeze([0.55, 0.78, 0.42]),
  }),
  flower: Object.freeze({
    species: 'daisy',
    pinHeadColor: false,
    headColor: Object.freeze([1, 0.98, 0.92]),
    headScale: 1,
  }),
  wind: Object.freeze({
    speed: CANONICAL_DEFAULTS.foliage.windSpeed,
    strength: CANONICAL_DEFAULTS.foliage.windStrength,
    heading: Math.round(Math.atan2(
      CANONICAL_DEFAULTS.foliage.windDirection[1],
      CANONICAL_DEFAULTS.foliage.windDirection[0]) * 100) / 100,
  }),
});

export const TREE_SETTING_GROUPS = Object.freeze([
  Object.freeze({ id: 'plant', label: 'Plant', description: 'Plant type, seed, and overall size.' }),
  Object.freeze({ id: 'trunk', label: 'Trunk', description: 'Trunk silhouette: bow, lean, twist, gnarl. Trees only.' }),
  Object.freeze({ id: 'skeleton', label: 'Branches', description: 'Space-colonization limb growth. Trees only.' }),
  Object.freeze({ id: 'canopy', label: 'Crown Shape', description: 'Blob layout that defines the crown/bush silhouette.' }),
  Object.freeze({ id: 'leaves', label: 'Leaves', description: 'Leaf-card coverage, density, and tuft behavior.' }),
  Object.freeze({ id: 'flower', label: 'Bloom', description: 'Flower-head species, color, and size. Flower plants only.' }),
  Object.freeze({ id: 'color', label: 'Color', description: 'Canopy palette: base color plus pinnable lit/shadow/crown tones.' }),
  Object.freeze({ id: 'wind', label: 'Wind', description: 'Leaf flutter animation (live; not part of exported GLBs).' }),
]);

// Canonical constructor-schema metadata lookup; throws at module load if a
// mapped field is renamed upstream, so drift is caught immediately.
function canonicalField(ref) {
  const [group, key] = ref.split('.');
  const metadata = STYLIZED_TREE_SETTING_FIELD_SCHEMA[group]?.[key];
  if (!metadata) throw new Error(`treeRecipe: unknown canonical field "${ref}"`);
  return metadata;
}

// Editor field metadata. `from: 'group.key'` inherits label/description/type/
// range/options from STYLIZED_TREE_SETTING_FIELD_SCHEMA so the editor stays
// in lockstep with the constructor schema (and the generated settings
// reference); explicit values in `extra` win. Editor-only fields (type
// switch, style presets, auto/pin toggles, blob-layout sliders) author
// everything by hand.
// bake: 'rebuild' fields regenerate geometry; 'live' fields only write shader
// uniforms, so the designer applies them without a rebuild.
function field(group, key, extra = {}) {
  const base = extra.from ? canonicalField(extra.from) : null;
  const defaultValue = TREE_SETTING_DEFAULTS[group][key];
  const type = extra.type ?? base?.type ??
    (typeof defaultValue === 'boolean' ? 'boolean'
      : typeof defaultValue === 'number' ? 'number' : 'text');
  return Object.freeze({
    id: `${group}.${key}`,
    group,
    key,
    label: extra.label ?? base?.label ?? key,
    description: extra.description ?? base?.description ?? '',
    type,
    defaultValue,
    serializable: true,
    bake: extra.bake ?? 'rebuild',
    range: extra.range ?? base?.range ?? null,
    options: extra.options ?? base?.options ?? null,
    optionLabels: extra.optionLabels ?? base?.optionLabels ?? null,
  });
}

const TRUNK_STYLE_OPTIONS = [...Object.keys(TREE_TRUNK_STYLES), 'custom'];

export const TREE_SETTING_FIELD_SCHEMA = Object.freeze({
  plant: Object.freeze({
    type: field('plant', 'type', {
      label: 'Type',
      description: 'Tree (trunk + crown), bush (foliage mass on the ground), or flower (stem + branches tipped with blooms).',
      type: 'select',
      options: ['tree', 'bush', 'flower'],
      optionLabels: { tree: 'Tree', bush: 'Bush / Shrub', flower: 'Flower' },
    }),
    seed: field('plant', 'seed', { from: 'tree.seed' }),
    size: field('plant', 'size', { from: 'tree.size' }),
  }),
  trunk: Object.freeze({
    style: field('trunk', 'style', {
      label: 'Style',
      description: 'Ready-made trunk personality; editing any slider below switches to Custom.',
      type: 'select',
      options: TRUNK_STYLE_OPTIONS,
      optionLabels: {
        straight: 'Straight', leaning: 'Leaning', curved: 'Curved', gnarled: 'Gnarled',
        bonsai: 'Bonsai', swooping: 'Swooping (Liyue)', custom: 'Custom',
      },
    }),
    height: field('trunk', 'height', { from: 'trunk.height' }),
    radiusBottom: field('trunk', 'radiusBottom', { from: 'trunk.radiusBottom' }),
    bend: field('trunk', 'bend', { from: 'trunk.bend' }),
    lean: field('trunk', 'lean', { from: 'trunk.lean' }),
    twist: field('trunk', 'twist', { from: 'trunk.twist' }),
    gnarl: field('trunk', 'gnarl', { from: 'trunk.gnarl' }),
    bendDirectionAuto: field('trunk', 'bendDirectionAuto', {
      label: 'Auto Bend Heading',
      description: 'Pick the bow heading from the seed instead of the slider below.',
    }),
    bendDirection: field('trunk', 'bendDirection', { from: 'trunk.bendDirection' }),
    leanOffsetAuto: field('trunk', 'leanOffsetAuto', {
      label: 'Auto Lean Offset',
      description: 'Pick the lean heading from the seed; off + \u03c0 gives the serpentine S-trunk.',
    }),
    leanOffset: field('trunk', 'leanOffset', { from: 'trunk.leanOffset' }),
  }),
  skeleton: Object.freeze({
    generator: field('skeleton', 'generator', { from: 'skeleton.generator' }),
    levels: field('skeleton', 'levels', { from: 'skeleton.levels' }),
    childrenCount: field('skeleton', 'childrenCount', { from: 'skeleton.childrenCount' }),
    branchAngle: field('skeleton', 'branchAngle', { from: 'skeleton.branchAngle' }),
    branchStart: field('skeleton', 'branchStart', { from: 'skeleton.branchStart' }),
    lengthRatio: field('skeleton', 'lengthRatio', { from: 'skeleton.lengthRatio' }),
    radiusRatio: field('skeleton', 'radiusRatio', { from: 'skeleton.radiusRatio' }),
    gnarliness: field('skeleton', 'gnarliness', { from: 'skeleton.gnarliness' }),
    forceStrength: field('skeleton', 'forceStrength', { from: 'skeleton.forceStrength' }),
    conifer: field('skeleton', 'conifer', { from: 'skeleton.conifer' }),
    attractionCount: field('skeleton', 'attractionCount', { from: 'skeleton.attractionCount' }),
    segmentLength: field('skeleton', 'segmentLength', { from: 'skeleton.segmentLength' }),
    influenceRadius: field('skeleton', 'influenceRadius', { from: 'skeleton.influenceRadius' }),
    killRadius: field('skeleton', 'killRadius', { from: 'skeleton.killRadius' }),
    maxNodes: field('skeleton', 'maxNodes', { from: 'skeleton.maxNodes' }),
    radialSegments: field('skeleton', 'radialSegments', { from: 'skeleton.radialSegments' }),
    tipRadius: field('skeleton', 'tipRadius', { from: 'skeleton.tipRadius' }),
    minLimbRadius: field('skeleton', 'minLimbRadius', { from: 'skeleton.minLimbRadius' }),
    attractionReachAuto: field('skeleton', 'attractionReachAuto', {
      label: 'Auto Reach',
      description: 'Derive attraction depth from leaf placement (buried for canopy, near-shell for tips).',
    }),
    attractionReach: field('skeleton', 'attractionReach', { from: 'skeleton.attractionReach' }),
  }),
  canopy: Object.freeze({
    width: field('canopy', 'width', { from: 'tree.canopyWidth' }),
    depth: field('canopy', 'depth', { from: 'tree.canopyDepth' }),
    flatten: field('canopy', 'flatten', {
      label: 'Flatten',
      description: 'Vertical squash of the lobes; low values give the wide layered look.',
      range: { min: 0.1, max: 1, step: 0.05 },
    }),
    lobeCount: field('canopy', 'lobeCount', {
      label: 'Lobes',
      description: 'Satellite blobs ringing the crown core.',
      range: { min: 2, max: 10, step: 1 },
    }),
    spread: field('canopy', 'spread', {
      label: 'Spread',
      description: 'Horizontal reach of the lobes (1 \u2248 core radius).',
      range: { min: 0.5, max: 2, step: 0.05 },
    }),
    coreRadius: field('canopy', 'coreRadius', {
      label: 'Core Radius',
      description: 'Central blob radius.',
      range: { min: 0.4, max: 1.2, step: 0.05 },
    }),
    canopyScale: field('canopy', 'canopyScale', { from: 'tree.canopyScale' }),
  }),
  leaves: Object.freeze({
    placement: field('leaves', 'placement', { from: 'tree.leafPlacement' }),
    density: field('leaves', 'density', { from: 'tree.leafDensity' }),
    cardCount: field('leaves', 'cardCount', { from: 'canopy.cardCount' }),
    cardSizeMin: field('leaves', 'cardSizeMin', {
      label: 'Card Size Min',
      description: canonicalField('canopy.cardSizeRange').description,
      range: { min: 0.4, max: 2, step: 0.05 },
    }),
    cardSizeMax: field('leaves', 'cardSizeMax', {
      label: 'Card Size Max',
      description: canonicalField('canopy.cardSizeRange').description,
      range: { min: 0.4, max: 2.4, step: 0.05 },
    }),
    cardsPerCluster: field('leaves', 'cardsPerCluster', { from: 'canopy.cardsPerCluster' }),
    clusterRadius: field('leaves', 'clusterRadius', { from: 'canopy.clusterRadius' }),
    shellFill: field('leaves', 'shellFill', { from: 'canopy.shellFill' }),
  }),
  flower: Object.freeze({
    species: field('flower', 'species', {
      label: 'Species',
      description: 'Common-flower head at every branch tip (see FLOWER_SPECIES).',
      type: 'select',
      options: FLOWER_SPECIES.map((entry) => entry.id),
      optionLabels: Object.fromEntries(FLOWER_SPECIES.map((entry) => [entry.id, entry.label])),
    }),
    pinHeadColor: field('flower', 'pinHeadColor', {
      label: 'Pin Head Color',
      description: 'Use the explicit petal color below instead of the species default.',
    }),
    headColor: field('flower', 'headColor', {
      label: 'Head Color',
      description: 'Bloom petal color (when pinned).',
      type: 'color',
    }),
    headScale: field('flower', 'headScale', {
      label: 'Head Size',
      description: 'Bloom size relative to the leaf tufts.',
      range: { min: 0.4, max: 2, step: 0.05 },
    }),
  }),
  color: Object.freeze({
    canopy: field('color', 'canopy', { from: 'tree.canopyColor', bake: 'live' }),
    pinLit: field('color', 'pinLit', {
      label: 'Pin Lit',
      description: 'Use the explicit lit tone below instead of the base color.',
      bake: 'live',
    }),
    lit: field('color', 'lit', {
      label: 'Lit Tone', description: 'Sunlit leaf tone (when pinned).', type: 'color', bake: 'live',
    }),
    pinShadow: field('color', 'pinShadow', {
      label: 'Pin Shadow',
      description: 'Use the explicit shadow tone below instead of deriving it.',
      bake: 'live',
    }),
    shadow: field('color', 'shadow', {
      label: 'Shadow Tone', description: 'Shaded leaf tone (when pinned).', type: 'color', bake: 'live',
    }),
    pinCrown: field('color', 'pinCrown', {
      label: 'Pin Crown',
      description: 'Use the explicit crown-crest tone below instead of deriving it.',
      bake: 'live',
    }),
    crown: field('color', 'crown', {
      label: 'Crown Tone',
      description: 'Sun-struck crest tone on the crown top (when pinned).',
      type: 'color',
      bake: 'live',
    }),
  }),
  wind: Object.freeze({
    speed: field('wind', 'speed', { from: 'foliage.windSpeed', bake: 'live' }),
    strength: field('wind', 'strength', { from: 'foliage.windStrength', bake: 'live' }),
    heading: field('wind', 'heading', {
      label: 'Heading',
      description: canonicalField('foliage.windDirection').description,
      range: { min: 0, max: 6.29, step: 0.01 },
      bake: 'live',
    }),
  }),
});

export function cloneTreeSettings(settings = TREE_SETTING_DEFAULTS) {
  return JSON.parse(JSON.stringify(settings));
}

function paletteFromSettings(color) {
  const palette = {};
  if (color.pinLit) palette.lit = [...color.lit];
  if (color.pinShadow) palette.shadow = [...color.shadow];
  if (color.pinCrown) palette.crown = [...color.crown];
  return palette;
}

export function windOptionsFromSettings(settings) {
  const { speed, strength, heading } = settings.wind;
  return {
    windDirection: [Math.cos(heading), Math.sin(heading)],
    windSpeed: speed,
    windStrength: strength,
  };
}

// Panel state → constructor options. Trunk style is UI sugar: the sliders
// always hold the concrete values, so options stay explicit and recipes never
// depend on preset tables.
export function treeOptionsFromSettings(settings) {
  const { plant, trunk, skeleton, canopy, leaves, color } = settings;
  const shared = {
    size: plant.size,
    seed: plant.seed,
    canopyColor: [...color.canopy],
    canopyPalette: paletteFromSettings(color),
    leafDensity: leaves.density,
    canopy: {
      cardCount: leaves.cardCount,
      cardSizeRange: [leaves.cardSizeMin, Math.max(leaves.cardSizeMax, leaves.cardSizeMin)],
      cardsPerCluster: leaves.cardsPerCluster,
      clusterRadius: leaves.clusterRadius,
      shellFill: leaves.shellFill,
    },
    foliage: windOptionsFromSettings(settings),
  };

  if (plant.type === 'bush') {
    return {
      ...shared,
      width: canopy.width,
      depth: canopy.depth,
      flatten: canopy.flatten,
      canopyLayout: {
        lobeCount: canopy.lobeCount,
        spread: canopy.spread,
        coreRadius: canopy.coreRadius,
      },
    };
  }

  const treeOptions = {
    ...shared,
    canopyWidth: canopy.width,
    canopyDepth: canopy.depth,
    canopyScale: canopy.canopyScale,
    leafPlacement: leaves.placement,
    canopyLayout: {
      lobeCount: canopy.lobeCount,
      spread: canopy.spread,
      flatten: canopy.flatten,
      coreRadius: canopy.coreRadius,
    },
    trunk: {
      height: trunk.height,
      radiusBottom: trunk.radiusBottom,
      bend: trunk.bend,
      lean: trunk.lean,
      twist: trunk.twist,
      gnarl: trunk.gnarl,
      bendDirection: trunk.bendDirectionAuto ? null : trunk.bendDirection,
      leanOffset: trunk.leanOffsetAuto ? null : trunk.leanOffset,
    },
    skeleton: {
      generator: skeleton.generator,
      levels: skeleton.levels,
      childrenCount: skeleton.childrenCount,
      branchAngle: skeleton.branchAngle,
      branchStart: skeleton.branchStart,
      lengthRatio: skeleton.lengthRatio,
      radiusRatio: skeleton.radiusRatio,
      gnarliness: skeleton.gnarliness,
      forceStrength: skeleton.forceStrength,
      conifer: skeleton.conifer,
      attractionCount: skeleton.attractionCount,
      segmentLength: skeleton.segmentLength,
      influenceRadius: skeleton.influenceRadius,
      killRadius: skeleton.killRadius,
      maxNodes: skeleton.maxNodes,
      radialSegments: skeleton.radialSegments,
      tipRadius: skeleton.tipRadius,
      minLimbRadius: skeleton.minLimbRadius,
      attractionReach: skeleton.attractionReachAuto ? null : skeleton.attractionReach,
    },
  };

  if (plant.type === 'flower') {
    // A flower is a tree with blooms: same wood/leaf options plus the head.
    const flower = settings.flower ?? TREE_SETTING_DEFAULTS.flower;
    return {
      ...treeOptions,
      species: flower.species,
      headColor: flower.pinHeadColor ? [...flower.headColor] : null,
      headScale: flower.headScale,
    };
  }
  return treeOptions;
}

const PLANT_TYPES = new Set(['tree', 'bush', 'flower']);

function normalizePlantType(type) {
  return PLANT_TYPES.has(type) ? type : 'tree';
}

export function recipeFromSettings(settings) {
  return {
    schema: TREE_RECIPE_SCHEMA,
    version: TREE_RECIPE_VERSION,
    type: normalizePlantType(settings.plant.type),
    options: serializableTreeOptions(treeOptionsFromSettings(settings)),
  };
}

// Which trunk style matches these explicit values? Best-effort for the UI.
export function matchTrunkStyle(trunk) {
  for (const [name, style] of Object.entries(TREE_TRUNK_STYLES)) {
    const matches = TRUNK_STYLE_KEYS.every((key) => {
      if (style[key] === undefined) return true;
      return Math.abs((trunk[key] ?? Number.NaN) - style[key]) < 1e-6;
    });
    if (matches) return name;
  }
  return 'custom';
}

function srgbTriplet(spec, seed) {
  const color = resolveCanopyColor(spec, seed).convertLinearToSRGB();
  return [color.r, color.g, color.b];
}

// Recipe options → panel state, best-effort: advanced color specs collapse to
// their seed-resolved color, unknown option keys survive only in the recipe.
export function settingsFromRecipe(recipe) {
  const settings = cloneTreeSettings();
  const options = recipe?.options ?? {};
  const type = normalizePlantType(recipe?.type);
  const defaults = TREE_SETTING_DEFAULTS;

  settings.plant.type = type;
  settings.plant.seed = options.seed ?? defaults.plant.seed;
  settings.plant.size = options.size ?? defaults.plant.size;

  if (options.canopyColor !== undefined) {
    settings.color.canopy = srgbTriplet(options.canopyColor, settings.plant.seed);
  }
  const palette = options.canopyPalette ?? {};
  for (const tone of ['lit', 'shadow', 'crown']) {
    if (palette[tone] !== undefined) {
      const pin = `pin${tone[0].toUpperCase()}${tone.slice(1)}`;
      settings.color[pin] = true;
      settings.color[tone] = srgbTriplet(palette[tone], settings.plant.seed);
    }
  }

  settings.leaves.density = options.leafDensity ?? defaults.leaves.density;
  const canopyOptions = options.canopy ?? {};
  if (canopyOptions.cardCount !== undefined) settings.leaves.cardCount = canopyOptions.cardCount;
  if (canopyOptions.cardSizeRange) {
    settings.leaves.cardSizeMin = canopyOptions.cardSizeRange[0];
    settings.leaves.cardSizeMax = canopyOptions.cardSizeRange[1] ?? canopyOptions.cardSizeRange[0];
  }
  if (canopyOptions.cardsPerCluster !== undefined) settings.leaves.cardsPerCluster = canopyOptions.cardsPerCluster;
  if (canopyOptions.clusterRadius !== undefined) settings.leaves.clusterRadius = canopyOptions.clusterRadius;
  if (canopyOptions.shellFill !== undefined) settings.leaves.shellFill = canopyOptions.shellFill;

  const layout = options.canopyLayout ?? {};
  if (layout.lobeCount !== undefined) settings.canopy.lobeCount = layout.lobeCount;
  if (layout.spread !== undefined) settings.canopy.spread = layout.spread;
  if (layout.coreRadius !== undefined) settings.canopy.coreRadius = layout.coreRadius;
  if (layout.flatten !== undefined) settings.canopy.flatten = layout.flatten;

  const foliage = options.foliage ?? {};
  if (foliage.windSpeed !== undefined) settings.wind.speed = foliage.windSpeed;
  if (foliage.windStrength !== undefined) settings.wind.strength = foliage.windStrength;
  if (foliage.windDirection) {
    settings.wind.heading =
      (Math.atan2(foliage.windDirection[1], foliage.windDirection[0]) + Math.PI * 2) % (Math.PI * 2);
  }

  if (type === 'bush') {
    settings.canopy.width = options.width ?? defaults.canopy.width;
    settings.canopy.depth = options.depth ?? defaults.canopy.depth;
    settings.canopy.flatten = options.flatten ?? settings.canopy.flatten;
    return settings;
  }

  settings.canopy.width = options.canopyWidth ?? defaults.canopy.width;
  settings.canopy.depth = options.canopyDepth ?? defaults.canopy.depth;
  settings.canopy.canopyScale = options.canopyScale ?? defaults.canopy.canopyScale;
  settings.leaves.placement = options.leafPlacement ?? defaults.leaves.placement;

  const trunk = options.trunk ?? {};
  for (const key of ['height', 'radiusBottom', 'bend', 'lean', 'twist', 'gnarl']) {
    if (trunk[key] !== undefined) settings.trunk[key] = trunk[key];
  }
  settings.trunk.bendDirectionAuto = trunk.bendDirection == null;
  if (trunk.bendDirection != null) settings.trunk.bendDirection = trunk.bendDirection;
  settings.trunk.leanOffsetAuto = trunk.leanOffset == null;
  if (trunk.leanOffset != null) settings.trunk.leanOffset = trunk.leanOffset;
  settings.trunk.style = matchTrunkStyle(settings.trunk);

  const skeleton = options.skeleton ?? {};
  for (const key of ['generator', 'levels', 'childrenCount', 'branchAngle', 'branchStart',
    'lengthRatio', 'radiusRatio', 'gnarliness', 'forceStrength', 'conifer',
    'attractionCount', 'segmentLength', 'influenceRadius', 'killRadius',
    'maxNodes', 'radialSegments', 'tipRadius', 'minLimbRadius']) {
    if (skeleton[key] !== undefined) settings.skeleton[key] = skeleton[key];
  }
  settings.skeleton.attractionReachAuto = skeleton.attractionReach == null;
  if (skeleton.attractionReach != null) settings.skeleton.attractionReach = skeleton.attractionReach;

  if (type === 'flower') {
    settings.flower.species = options.species ?? defaults.flower.species;
    settings.flower.pinHeadColor = options.headColor != null;
    if (options.headColor != null) settings.flower.headColor = [...options.headColor];
    settings.flower.headScale = options.headScale ?? defaults.flower.headScale;
  }

  return settings;
}

// Same contract as validateToonPresetDocument: { ok, value?, errors? }.
// Structural checks only — options intentionally may exceed the panel's
// slider ranges (recipes are a superset of what the UI edits).
export function validateTreeRecipeDocument(input, { requireIdentity = false } = {}) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Recipe document must be an object.'] };
  }
  if (input.schema !== TREE_RECIPE_SCHEMA) {
    errors.push(`schema must be "${TREE_RECIPE_SCHEMA}".`);
  }
  if (!Number.isInteger(input.version) || input.version < 1 || input.version > TREE_RECIPE_VERSION) {
    errors.push(`version must be an integer between 1 and ${TREE_RECIPE_VERSION}.`);
  }
  if (!PLANT_TYPES.has(input.type)) {
    errors.push('type must be "tree", "bush", or "flower".');
  }
  if (!input.options || typeof input.options !== 'object' || Array.isArray(input.options)) {
    errors.push('options must be an object.');
  }
  if (requireIdentity) {
    if (typeof input.id !== 'string' || !input.id.trim()) errors.push('id must be a non-empty string.');
    if (typeof input.label !== 'string' || !input.label.trim()) errors.push('label must be a non-empty string.');
  }
  if (input.description !== undefined && typeof input.description !== 'string') {
    errors.push('description must be a string when present.');
  }
  if (errors.length) return { ok: false, errors };

  const value = {
    schema: TREE_RECIPE_SCHEMA,
    version: input.version,
    type: input.type,
    options: input.options,
  };
  if (typeof input.id === 'string' && input.id.trim()) value.id = input.id.trim();
  if (typeof input.label === 'string' && input.label.trim()) value.label = input.label.trim();
  if (input.description) value.description = input.description;
  return { ok: true, value };
}

// Rebuild a plant from a recipe (or bare constructor options). Deterministic:
// the same recipe always grows the identical plant.
//   import { createPlantFromRecipe } from '@call-me-sensei/toonlab/vegetation';
export function createPlantFromRecipe(recipe, { trunkMaterial = null } = {}) {
  const document = recipe?.options
    ? recipe
    : { schema: TREE_RECIPE_SCHEMA, version: TREE_RECIPE_VERSION, type: 'tree', options: recipe ?? {} };
  if (document.type === 'bush') {
    return new StylizedBush(document.options);
  }
  if (document.type === 'flower') {
    // No bark material: the flower grows its own toon stem material.
    return new StylizedFlower(document.options);
  }
  return new StylizedTree(
    trunkMaterial ? { ...document.options, trunkMaterial } : document.options,
  );
}
