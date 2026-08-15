// Stillwater Garden — the four ground surfaces, authored as ToonLab texture
// recipes and baked at load time.
//
// §2 of the scene brief asks for "four genuinely distinct surfaces meeting in
// frame": raked gravel, moss, stone paving and packed earth. They are ToonLab
// Texture Lab recipes rather than photographs, for three reasons:
//
//   1. Every camera in this garden is close. A landscape photograph bound at a
//      1.2–2.2 m world tile reads as a photograph of a landscape, at the wrong
//      scale, with baked-in lighting from somewhere else.
//   2. The recipes are seeded and pure, so the ground is bit-identical run to
//      run — the filler register's determinism precondition, met by
//      construction rather than by discipline.
//   3. Ground is a ToonLab-owned surface, and the product owns the generator
//      that makes it. Using a photograph here would demo somebody else's tool.
//
// D19-058: the Ground Shader accepts `map` only and throws on the rest of the
// PBR set, so only the albedo is bound. The recipes still bake normal and
// roughness — they are correct, they are simply unreachable from this consumer
// until FILL-012 lands. Do not delete them; they are the merge's test data.
//
// `worldTile` is the metre period each recipe is authored for. FILL-011 exists
// because a recipe cannot yet declare that itself (D19-052), so it is declared
// here and consumed by the Ground Shader's `projection` scales in scene.js —
// one table, two consumers, no chance of them disagreeing.

import { evaluateTextureMaps } from '@call-me-sensei/toonlab/texgen';
import { syncTextureMapTextures } from '../../../src/texgen/textureThree.js';

/**
 * Ordered to match the Ground Shader's four fixed splat channels
 * (D19-022): R grass, G dirt, B rock, A sand. The `role` field is the garden's
 * own vocabulary; `channel` is what the shader calls the same slot.
 */
export const GARDEN_GROUND_LAYERS = Object.freeze([
  Object.freeze({
    channel: 'grass',
    label: 'Garden moss bed',
    role: 'moss',
    // Moss is a clumped colony, not a noise field: inverted Worley gives the
    // rounded cushions, the fbm detail gives the velvet, and the speckle is
    // the fine leaf structure that keeps it from reading as painted felt.
    settings: Object.freeze({
      accentA: Object.freeze({
        blend: 'normal', color: '#6d7a3a', colorB: '#8a8f4a', coverage: 0.2,
        creviceBias: -0.35, enabled: true, generator: 'fbm', roughnessShift: 0.06,
        scale: 4, softness: 0.35, warp: 0.45,
      }),
      base: Object.freeze({
        cellJitter: 1, cellVariation: 0.6, contrast: 0.18, generator: 'worley',
        invert: true, scale: 19, warp: 0.4, warpScale: 6,
      }),
      color: Object.freeze({
        cavity: 0.5, color0: '#101f0c', color1: '#193010', color2: '#264718',
        color3: '#3a6522', color4: '#568533', jitterCellVariety: 0.45,
        jitterHue: 0.05, jitterValue: 0.13, pos1: 0.18, saturation: 1.06,
      }),
      detailA: Object.freeze({
        amount: 0.42, blend: 'add', detail: 5, detailGain: 0.55, enabled: true,
        generator: 'fbm', scale: 34,
      }),
      detailB: Object.freeze({
        amount: 0.24, blend: 'add', cellVariation: 0.7, enabled: true,
        generator: 'speckle', scale: 74,
      }),
      global: Object.freeze({ seed: 20_811 }),
      surface: Object.freeze({ heightScale: 0.4, roughness: 1, roughnessContrast: 0.14 }),
      wear: Object.freeze({ dirt: 0.08 }),
    }),
    worldTile: 1.5,
  }),
  Object.freeze({
    channel: 'dirt',
    label: 'Swept garden earth',
    role: 'earth',
    // A swept garden path is not open dirt: it is compacted, damp, and carries
    // the fine grit that gets swept to its edges. Warmer and darker than the
    // shipped dry-dirt preset, with the speckle carrying the grit.
    settings: Object.freeze({
      accentA: Object.freeze({
        blend: 'multiply', color: '#40331f', colorB: '#54452c', coverage: 0.32,
        creviceBias: 0.55, enabled: true, generator: 'turbulence', scale: 6,
        softness: 0.3, warp: 0.35,
      }),
      base: Object.freeze({
        detail: 5, detailGain: 0.52, generator: 'fbm', scale: 11, warp: 0.22,
        warpScale: 4,
      }),
      color: Object.freeze({
        cavity: 0.42, color0: '#241a12', color1: '#3a2a1c', color2: '#4e3b28',
        color3: '#63503a', color4: '#7a6752', jitterHue: 0.04, jitterValue: 0.12,
        saturation: 0.94,
      }),
      detailB: Object.freeze({
        amount: 0.3, blend: 'add', cellVariation: 0.6, edgeWidth: 0.3,
        enabled: true, generator: 'speckle', scale: 52,
      }),
      global: Object.freeze({ seed: 20_812 }),
      surface: Object.freeze({ heightScale: 0.34, roughness: 0.96, roughnessContrast: 0.22 }),
    }),
    worldTile: 2.2,
  }),
  Object.freeze({
    channel: 'rock',
    label: 'Cut granite flagging',
    role: 'paving',
    // Irregular cut flags with tight joints — the nobedan paving of a stone
    // path. Worley at a low cell jitter gives polygonal flags rather than the
    // rounded cobbles the shipped cobblestone preset produces; the fbm overlay
    // is the granite's own grain across the flag faces.
    settings: Object.freeze({
      base: Object.freeze({
        cellJitter: 0.62, cellVariation: 0.34, contrast: 0.12, edgeWidth: 0.07,
        generator: 'worley', scale: 4.4, warp: 0.12, warpScale: 3,
      }),
      color: Object.freeze({
        cavity: 0.62, color0: '#2b2a29', color1: '#4d4a46', color2: '#6a665f',
        color3: '#847f75', color4: '#9d978a', jitterCellVariety: 0.55,
        jitterCells: true, jitterHue: 0.02, jitterValue: 0.14, pos1: 0.14,
        saturation: 0.82, sheen: 0.14,
      }),
      detailA: Object.freeze({
        amount: 0.32, blend: 'overlay', detail: 4, enabled: true,
        generator: 'fbm', scale: 26,
      }),
      detailB: Object.freeze({
        amount: 0.16, blend: 'add', cellVariation: 0.5, enabled: true,
        generator: 'speckle', scale: 90,
      }),
      global: Object.freeze({ seed: 20_813 }),
      surface: Object.freeze({ heightScale: 0.66, roughness: 0.82, roughnessContrast: 0.36 }),
      wear: Object.freeze({ dirt: 0.14 }),
    }),
    worldTile: 2.4,
  }),
  Object.freeze({
    channel: 'sand',
    label: 'Raked granite gravel',
    role: 'gravel',
    // Pale crushed granite, raked. The rake is a stretched `stripes` layer at
    // an overlay blend, deliberately shallow: real samon furrows are a few
    // centimetres of relief and read as a value modulation, not as corduroy.
    // Their spacing is the recipe's, and the world tile below is what makes it
    // land at a believable 11 cm on the ground.
    settings: Object.freeze({
      base: Object.freeze({
        cellJitter: 1, cellVariation: 0.5, contrast: 0.08, generator: 'worley',
        scale: 34,
      }),
      color: Object.freeze({
        cavity: 0.44, color0: '#6b675f', color1: '#8b867c', color2: '#a49e92',
        color3: '#bab4a7', color4: '#cfc9bc', jitterCells: true,
        jitterCellVariety: 0.4, jitterValue: 0.13, pos1: 0.16, saturation: 0.72,
      }),
      detailA: Object.freeze({
        amount: 0.26, blend: 'overlay', enabled: true, generator: 'stripes',
        rows: 16, scale: 16, stretchX: 1, stretchY: 1, warp: 0.06, warpScale: 8,
      }),
      detailB: Object.freeze({
        amount: 0.2, blend: 'add', cellVariation: 0.65, enabled: true,
        generator: 'speckle', scale: 96,
      }),
      global: Object.freeze({ seed: 20_814 }),
      surface: Object.freeze({ heightScale: 0.3, roughness: 0.94, roughnessContrast: 0.18 }),
    }),
    worldTile: 1.8,
  }),
]);

/**
 * Bakes every ground layer and wraps the albedo as a THREE texture.
 *
 * @param {object} [options]
 * @param {number} [options.size] Bake resolution per side.
 * @param {(role: string, index: number) => void} [options.onProgress]
 * @returns {Promise<Array<{ id, label, maps, role, texture, textures, worldTile, pxPerCm }>>}
 */
export async function buildGardenGroundLayers({ size = 512, onProgress = () => {} } = {}) {
  const layers = [];
  for (const [index, layer] of GARDEN_GROUND_LAYERS.entries()) {
    onProgress(layer.role, index);
    const maps = await evaluateTextureMaps(layer.settings, { size });
    const { textures } = syncTextureMapTextures(maps);
    textures.albedo.anisotropy = 8;
    layers.push({
      ...layer,
      maps,
      // §8's bar is resolution / (tile x 100) px/cm. Reported rather than
      // asserted here — the gate lives in the capture harness (FILL-011).
      pxPerCm: size / (layer.worldTile * 100),
      texture: textures.albedo,
      textures,
    });
  }
  return layers;
}

/**
 * Ground Shader `projection` scales derived from the same `worldTile` table the
 * bakes used, so the painted period and the authored period cannot drift.
 *
 * The `call_me_sensei` preset ships landscape periods — grass 16 m, dirt 13 m,
 * rock 25 m, sand 10 m — tuned against mountain-scale reference meshes. In a
 * garden where every camera is inside 30 m those read as a boulder field
 * (city stand-down §4.4, observed again here).
 */
export function groundProjectionScales(layers) {
  const scales = {};
  for (const layer of layers) scales[`${layer.channel}Scale`] = layer.worldTile;
  return scales;
}
