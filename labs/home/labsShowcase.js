// Card data for the Labs home page (the root route). Display metadata only —
// routing/boot metadata stays in labs/shared/sceneHub.js. Every lab links its
// standalone page; shots are captured by scripts/generate-home-shots.mjs into
// public/home/shots/ and cards fall back to a kana glyph tile until a shot
// exists for them.

export const LABS_SHOWCASE = Object.freeze([
  Object.freeze({
    id: 'shader',
    i: '01',
    title: 'Character Shader',
    jp: 'シェーダー',
    desc: 'Character toon shading — outlines, rim light, face shadows, hundreds of dials',
    href: '/shader-lab/',
  }),
  Object.freeze({
    id: 'rock',
    i: '02',
    title: 'Rock Lab',
    jp: '岩石',
    desc: 'Procedural cliffs & mesas — sculpt, erode, export GLB',
    href: '/rock-lab/',
  }),
  Object.freeze({
    id: 'tree',
    i: '03',
    title: 'Vegetation Lab',
    jp: '植生',
    desc: 'Grow trees, bushes & flowers — plus 4 tunable vegetation shaders',
    href: '/tree-lab/',
  }),
  Object.freeze({
    id: 'debris',
    i: '04',
    title: 'Debris Lab',
    jp: '残骸',
    desc: 'Scatter-ready debris & litter — recipes to GLB',
    href: '/debris-lab/',
  }),
  Object.freeze({
    id: 'texture',
    i: '05',
    title: 'Texture Lab',
    jp: '質感',
    desc: 'Stylized seamless textures — layers, dials, instant export',
    href: '/texture-lab/',
  }),
  Object.freeze({
    id: 'water',
    i: '06',
    title: 'Water Lab',
    jp: '水面',
    desc: 'Every water dial — waves, foam, reflections, shore states',
    href: '/water-lab/',
  }),
  Object.freeze({
    id: 'grass',
    i: '07',
    title: 'Grass Lab',
    jp: '草',
    desc: 'Design grass from a single blade to a meadow — shape, wind, lighting',
    href: '/grass-lab/',
  }),
  Object.freeze({
    id: 'environment',
    i: '08',
    title: 'Environment Lab',
    jp: '環境',
    desc: 'Customize your own environment shader — features, light, walk it live',
    href: '/environment-lab/',
  }),
]);

export const DEMOS_SHOWCASE = Object.freeze([
  Object.freeze({
    id: 'playground',
    i: '09',
    title: 'Playground',
    jp: '遊び場',
    desc: 'Walk a character through your stylized world',
    href: '/playground/',
  }),
  Object.freeze({
    id: 'water-playground',
    i: '10',
    title: 'Water Playground',
    jp: '渚',
    desc: 'Wade into the beach diorama — the water systems, walkable',
    href: '/playground/?scene=water',
  }),
  Object.freeze({
    id: 'outdoor-world',
    i: '11',
    title: 'Outdoor World',
    jp: '世界',
    desc: 'Paths, bridges, villages — the world systems at scale',
    href: '/examples/outdoor-world/?villages=2&shrines=1',
  }),
  Object.freeze({
    id: 'vfx-arena',
    i: '12',
    title: 'VFX Arena',
    jp: '闘技場',
    desc: 'Combat VFX in a walkable arena',
    href: '/examples/vfx-arena/',
  }),
  Object.freeze({
    id: 'fauna',
    i: '13',
    title: 'Fauna Demo',
    jp: '動物',
    desc: 'Birds, fish & critters roaming a demo biome',
    href: '/examples/fauna-demo/',
  }),
  Object.freeze({
    id: 'ambientfx',
    i: '14',
    title: 'Ambient VFX Demo',
    jp: '気配',
    desc: 'Fireflies, motes, falling leaves — ambient atmosphere',
    href: '/examples/ambientfx-demo/',
  }),
]);
