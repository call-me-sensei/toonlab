// Card data for the Labs home page (the root route). Display metadata only —
// routing/boot metadata stays in labs/shared/sceneHub.js. Every lab links its
// standalone page; shots are captured by scripts/generate-home-shots.mjs into
// public/home/shots/ and cards fall back to a kana glyph tile until a shot
// exists for them.

export const SHADER_LABS_SHOWCASE = Object.freeze([
  Object.freeze({
    id: 'shader',
    i: '01',
    title: 'Character Shader Lab',
    jp: 'シェーダー',
    desc: 'Define the shared character treatment — cel bands, face shadows, highlights, outlines, and material roles',
    href: '/shader-lab/',
  }),
  Object.freeze({
    id: 'vegetation-shader',
    i: '02',
    title: 'Vegetation Shader Lab',
    jp: '植生',
    desc: 'Define one IP-wide treatment for grass, foliage, flowers, bark, and stems',
    href: '/vegetation-shader-lab/',
  }),
  Object.freeze({
    id: 'environment',
    i: '03',
    title: 'Environment Shader Lab',
    jp: '環境',
    desc: 'Define the environment-material treatment — feature paths, light response, interior occlusion, and surface styling',
    href: '/environment-lab/',
  }),
  Object.freeze({
    id: 'manufactured-material',
    i: '04',
    title: 'Manufactured Material Lab',
    jp: '人工物',
    desc: 'Classify and tune one IP-wide treatment for props, vehicles, buildings, interiors, furniture, and infrastructure',
    href: '/manufactured-material-lab/',
  }),
]);

export const ASSET_LABS_SHOWCASE = Object.freeze([
  Object.freeze({
    id: 'rock',
    i: '05',
    title: 'Rock Lab',
    jp: '岩石',
    desc: 'Procedural cliffs & mesas — sculpt, erode, export GLB',
    href: '/rock-lab/',
  }),
  Object.freeze({
    id: 'tree',
    i: '06',
    title: 'Tree Lab',
    jp: '樹木',
    desc: 'Grow trees & bushes — sketch silhouettes, add canopy blossoms, export GLB',
    href: '/tree-lab/',
  }),
  Object.freeze({
    id: 'flower',
    i: '07',
    title: 'Flower Lab',
    jp: '花',
    desc: 'Author standalone flowers — stems, leaves, blooms, recipes, and GLB export',
    href: '/flower-lab/',
  }),
  Object.freeze({
    id: 'grass',
    i: '08',
    title: 'Grass Lab',
    jp: '草',
    desc: 'Design grass from a single blade to a meadow — shape, wind, lighting',
    href: '/grass-lab/',
  }),
  Object.freeze({
    id: 'debris',
    i: '09',
    title: 'Debris Lab',
    jp: '残骸',
    desc: 'Scatter-ready debris & litter — recipes to GLB',
    href: '/debris-lab/',
  }),
  Object.freeze({
    id: 'texture',
    i: '10',
    title: 'Texture Lab',
    jp: '質感',
    desc: 'Stylized seamless textures — layers, dials, instant export',
    href: '/texture-lab/',
  }),
]);

export const WORLD_SYSTEMS_SHOWCASE = Object.freeze([
  Object.freeze({
    id: 'sky',
    i: '11',
    title: 'Sky Lab',
    jp: '空',
    desc: 'Author the complete sky system — gradients, sun, painterly clouds, stars, and cloud motion',
    href: '/sky-lab/',
  }),
  Object.freeze({
    id: 'water',
    i: '12',
    title: 'Water Lab',
    jp: '水面',
    desc: 'Author the complete water system — waves, surface, foam, lighting, ripples, splashes, and quality',
    href: '/water-lab/',
  }),
  Object.freeze({
    id: 'landscape',
    i: '19',
    title: 'Landscape Lab',
    jp: '地形',
    desc: 'Sculpt terrain, paint splat materials, and brush foliage — a ToonLab-style landscape editor',
    href: '/landscape-lab/',
  }),
]);

// Backwards-compatible aggregate used by the marketing homepage. The Labs
// catalog itself renders the responsibility-specific groups above.
export const LABS_SHOWCASE = Object.freeze([
  ...SHADER_LABS_SHOWCASE,
  ...ASSET_LABS_SHOWCASE,
  ...WORLD_SYSTEMS_SHOWCASE,
]);

export const DEMOS_SHOWCASE = Object.freeze([
  Object.freeze({
    id: 'playground',
    i: '13',
    title: 'Playground',
    jp: '遊び場',
    desc: 'Walk a character through your stylized world',
    href: '/playground/',
  }),
  Object.freeze({
    id: 'water-playground',
    i: '14',
    title: 'Water Playground',
    jp: '渚',
    desc: 'Wade into the beach diorama — the water systems, walkable',
    href: '/playground/?scene=water',
  }),
  Object.freeze({
    id: 'outdoor-world',
    i: '15',
    title: 'Outdoor World',
    jp: '世界',
    desc: 'Paths, bridges, villages — the world systems at scale',
    href: '/examples/outdoor-world/?villages=2&shrines=1',
  }),
  Object.freeze({
    id: 'vfx-arena',
    i: '16',
    title: 'VFX Arena',
    jp: '闘技場',
    desc: 'Combat VFX in a walkable arena',
    href: '/examples/vfx-arena/',
  }),
  Object.freeze({
    id: 'fauna',
    i: '17',
    title: 'Fauna Demo',
    jp: '動物',
    desc: 'Birds, fish & critters roaming a demo biome',
    href: '/examples/fauna-demo/',
  }),
  Object.freeze({
    id: 'ambientfx',
    i: '18',
    title: 'Ambient VFX Demo',
    jp: '気配',
    desc: 'Fireflies, motes, falling leaves — ambient atmosphere',
    href: '/examples/ambientfx-demo/',
  }),
]);
