// Audited ToonLab rock-library taxonomy. This is metadata only: source
// mesh topology, UVs, textures, and material assets are intentionally absent.

const core = (definition) => ({
  indexPad: 2,
  role: 'core-form',
  ...definition,
});

function freezeMetadata(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) freezeMetadata(child);
  return Object.freeze(value);
}

export const AUDITED_ROCK_REFERENCE_SERIES = Object.freeze([
  // Classic — 50
  core({
    archetype: 'rock', baseScale: [1.15, 0.82, 1], count: 16, family: 'classic',
    indexPad: 0, key: 'rock', label: 'Rock', presetId: 'lowpoly-boulder',
    sourcePrefix: 'SM_RockClassic', triangles: [56, 151, 284],
  }),
  core({
    archetype: 'rock-clump', baseScale: [1.65, 0.85, 1.25], count: 10, family: 'classic',
    indexPad: 0, key: 'rock-clump', label: 'Rock Clump', presetId: 'scree-cluster',
    sourcePrefix: 'SM_RockClumpClassic', triangles: [270, 469, 1100],
  }),
  core({
    archetype: 'boulder', baseScale: [0.9, 1.2, 0.85], count: 5, family: 'classic',
    indexPad: 0, key: 'boulder', label: 'Boulder', presetId: 'boulder',
    sourcePrefix: 'SM_BoulderClassic', triangles: [140, 214, 290],
  }),
  core({
    archetype: 'boulder-clump', baseScale: [1.85, 1.05, 1.15], count: 2, family: 'classic',
    indexPad: 0, key: 'boulder-clump', label: 'Boulder Clump', presetId: 'scree-cluster',
    sourcePrefix: 'SM_BoulderClumpClassic', triangles: [630, 742, 854],
  }),
  core({
    archetype: 'shelf', baseScale: [1.65, 0.72, 1.45], count: 7, family: 'classic',
    indexPad: 0, key: 'shelf', label: 'Shelf', presetId: 'eroded-mesa',
    sourcePrefix: 'SM_ShelfClassic', triangles: [282, 372, 462],
  }),
  core({
    archetype: 'platform', baseScale: [1.25, 1.55, 1.15], count: 4, family: 'classic',
    indexPad: 0, key: 'platform', label: 'Platform', presetId: 'eroded-mesa',
    sourcePrefix: 'SM_PlatformClassic', triangles: [288, 307, 381],
  }),
  core({
    archetype: 'cliff', baseScale: [1.45, 1.7, 0.9], count: 6, family: 'classic',
    indexPad: 0, key: 'cliff', label: 'Cliff', presetId: 'cliff-face',
    sourcePrefix: 'SM_CliffClassic', triangles: [360, 475, 794],
  }),

  // Cubic — 61 (53 forms + 8 metric utilities)
  core({
    archetype: 'rock', baseScale: [1.1, 0.92, 1], count: 13, family: 'cubic',
    key: 'rock', label: 'Rock', presetId: 'granite-boulder',
    sourcePrefix: 'SM_RockCubic', triangles: [42, 114, 204],
  }),
  core({
    archetype: 'boulder', baseScale: [1.2, 1.05, 1], count: 5, family: 'cubic',
    key: 'boulder', label: 'Boulder', presetId: 'granite-boulder',
    sourcePrefix: 'SM_BoulderCubic', triangles: [212, 288, 586],
  }),
  core({
    archetype: 'cliff', baseScale: [1.8, 1.7, 0.62], count: 16, family: 'cubic',
    key: 'cliff', label: 'Cliff', presetId: 'cliff-wall',
    sourcePrefix: 'SM_CubicCliff', triangles: [654, 1578, 4006],
  }),
  core({
    archetype: 'cliff-piece', baseScale: [0.62, 1.75, 0.58], count: 19, family: 'cubic',
    key: 'cliff-piece', label: 'Cliff Piece', presetId: 'shard-monolith',
    sourcePrefix: 'SM_CubicCliffPieces', triangles: [96, 212, 490],
  }),
  {
    archetype: 'metric-block', baseScale: [1, 1, 1], family: 'cubic',
    key: 'metric', label: 'Metric Block', presetId: 'cliff-wall',
    role: 'metric-utility', triangles: [56, 124, 1610],
    variants: Object.freeze([
      { dimensions: [1, 1, 1], sourceAssetName: 'SM_RockCubic_Metric_1x1' },
      { dimensions: [1, 2, 1], sourceAssetName: 'SM_RockCubic_Metric_1x1x2' },
      { dimensions: [2, 2, 2], sourceAssetName: 'SM_RockCubic_Metric_2x2' },
      { dimensions: [2, 1, 2], sourceAssetName: 'SM_RockCubic_Metric_2x2x1' },
      { dimensions: [2, 4, 2], sourceAssetName: 'SM_RockCubic_Metric_2x2x4' },
      { dimensions: [4, 2, 4], sourceAssetName: 'SM_RockCubic_Metric_4x4x2' },
      { dimensions: [8, 2, 8], sourceAssetName: 'SM_RockCubic_Metric_8x8x2' },
      { dimensions: [8, 3, 8], sourceAssetName: 'SM_RockCubic_Metric_8x8x3' },
    ]),
  },

  // Desert — 104
  core({
    archetype: 'rock', baseScale: [1.35, 0.75, 1.1], count: 16, family: 'desert',
    key: 'rock', label: 'Rock', presetId: 'lowpoly-boulder',
    sourcePrefix: 'SM_RockDesert_Rock', triangles: [58, 204, 534],
  }),
  core({
    archetype: 'rock-clump', baseScale: [2.1, 0.82, 1.55], count: 10, family: 'desert',
    key: 'clump', label: 'Clump', presetId: 'scree-cluster',
    sourcePrefix: 'SM_RockDesert_Clump', triangles: [346, 1166, 3878],
  }),
  core({
    archetype: 'shelf', baseScale: [1.75, 0.62, 1.35], count: 10, family: 'desert',
    key: 'shelf', label: 'Shelf', presetId: 'eroded-mesa',
    sourcePrefix: 'SM_RockDesert_Shelf', triangles: [482, 604, 856],
  }),
  core({
    archetype: 'platform', baseScale: [1.55, 0.88, 1.4], count: 4, family: 'desert',
    key: 'platform', label: 'Platform', presetId: 'eroded-mesa',
    sourcePrefix: 'SM_RockDesert_Platform', triangles: [1048, 1217, 1364],
  }),
  core({
    archetype: 'layered-rock', baseScale: [1.45, 1.05, 1.3], count: 8, family: 'desert',
    key: 'layered', label: 'Layered Rock', presetId: 'canyon-ridge',
    sourcePrefix: 'SM_RockDesert_Layered', triangles: [910, 1016, 1784],
  }),
  core({
    archetype: 'hoodoo', baseScale: [0.52, 2.2, 0.5], count: 15, family: 'desert',
    key: 'hoodoo', label: 'Hoodoo', presetId: 'sea-stack',
    sourcePrefix: 'SM_RockDesert_Hoodoo', triangles: [458, 662, 1266],
  }),
  core({
    archetype: 'hoodoo-cliff', baseScale: [0.7, 2.0, 0.58], count: 9, family: 'desert',
    key: 'hoodoo-cliff', label: 'Hoodoo Cliff', presetId: 'canyon-ridge',
    sourcePrefix: 'SM_RockDesert_HoodooCliff', triangles: [440, 716, 888],
  }),
  core({
    archetype: 'cliff', baseScale: [1.3, 1.75, 0.9], count: 8, family: 'desert',
    key: 'cliff-a', label: 'Cliff A', presetId: 'cliff-face',
    sourcePrefix: 'SM_RockDesert_CliffA', triangles: [930, 1250, 1768],
  }),
  core({
    archetype: 'cliff', baseScale: [1.45, 1.75, 1.05], count: 8, family: 'desert',
    key: 'cliff-b', label: 'Cliff B', presetId: 'cliff-face',
    sourcePrefix: 'SM_RockDesert_CliffB', triangles: [930, 1197, 1744],
  }),
  core({
    archetype: 'cliff', baseScale: [1.15, 1.75, 0.78], count: 8, family: 'desert',
    key: 'cliff-c', label: 'Cliff C', presetId: 'cliff-face',
    sourcePrefix: 'SM_RockDesert_CliffC', triangles: [936, 1221, 1696],
  }),
  core({
    archetype: 'cliff', baseScale: [1.55, 0.9, 1.15], count: 8, family: 'desert',
    key: 'cliff-half', label: 'Half Cliff', presetId: 'cliff-wall',
    sourcePrefix: 'SM_RockDesert_CliffHalf', triangles: [478, 661, 936],
  }),

  // Hexic — 48
  core({
    archetype: 'column-piece', baseScale: [0.45, 1.7, 0.45], count: 18, family: 'hexic',
    key: 'piece', label: 'Piece', presetId: 'basalt-columns',
    sourcePrefix: 'SM_RockHexic_Piece', triangles: [44, 44, 142],
  }),
  core({
    archetype: 'platform', baseScale: [1.6, 0.9, 1.45], count: 4, family: 'hexic',
    key: 'platform', label: 'Platform', presetId: 'basalt-columns',
    sourcePrefix: 'SM_RockHexic_Platform', triangles: [1464, 2164, 4152],
  }),
  core({
    archetype: 'column-rock', baseScale: [0.72, 1.35, 0.62], count: 10, family: 'hexic',
    key: 'rock', label: 'Rock', presetId: 'basalt-columns',
    sourcePrefix: 'SM_RockHexic_Rocks', triangles: [160, 420, 664],
  }),
  core({
    archetype: 'slanted-rock', baseScale: [0.68, 1.45, 0.58], count: 10, family: 'hexic',
    key: 'rock-slanted', label: 'Slanted Rock', presetId: 'shard-monolith',
    sourcePrefix: 'SM_RockHexic_RockSlanted', triangles: [136, 404, 690],
  }),
  core({
    archetype: 'spire', baseScale: [0.45, 2.35, 0.42], count: 6, family: 'hexic',
    key: 'spire', label: 'Spire', presetId: 'basalt-columns',
    sourcePrefix: 'SM_RockHexic_Spire', triangles: [396, 902, 1848],
  }),

  // Mountains — 4 special backdrop forms
  {
    archetype: 'mountain-backdrop', baseScale: [4.2, 1.35, 3.3], count: 4,
    family: 'mountains', indexPad: 2, key: 'mountain', label: 'Mountain Backdrop',
    presetId: 'canyon-ridge', role: 'mountain-backdrop',
    sourcePrefix: 'SM_Mountain', triangles: [854, 1279, 1337],
  },

  // Spire — 57
  core({
    archetype: 'rock', baseScale: [0.8, 1.2, 0.7], count: 20, family: 'spire',
    key: 'rock', label: 'Rock', presetId: 'lowpoly-boulder',
    sourcePrefix: 'SM_RockSpire_Rock', triangles: [50, 186, 414],
  }),
  core({
    archetype: 'rock-clump', baseScale: [2.0, 0.75, 1.55], count: 5, family: 'spire',
    key: 'rock-clump', label: 'Rock Clump', presetId: 'scree-cluster',
    sourcePrefix: 'SM_RockSpire_RockClump', triangles: [304, 472, 1132],
  }),
  core({
    archetype: 'vertical-clump', baseScale: [0.82, 1.75, 0.72], count: 12, family: 'spire',
    key: 'rock-clump-b', label: 'Rock Clump B', presetId: 'scree-cluster',
    sourcePrefix: 'SM_RockSpire_RockClumpB', triangles: [443, 1127, 1846],
  }),
  core({
    archetype: 'ridge-clump', baseScale: [1.45, 1.15, 0.72], count: 4, family: 'spire',
    key: 'rock-clump-c', label: 'Rock Clump C', presetId: 'scree-cluster',
    sourcePrefix: 'SM_RockSpire_RockClumpC', triangles: [1080, 1521, 1792],
  }),
  core({
    archetype: 'shelf', baseScale: [1.7, 0.65, 1.35], count: 8, family: 'spire',
    key: 'shelf', label: 'Shelf', presetId: 'eroded-mesa',
    sourcePrefix: 'SM_RockSpire_Shelf', triangles: [522, 848, 1258],
  }),
  core({
    archetype: 'spire', baseScale: [0.48, 2.25, 0.45], count: 8, family: 'spire',
    key: 'spire', label: 'Spire', presetId: 'karst-spire',
    sourcePrefix: 'SM_RockSpire_Spire', triangles: [448, 785, 1282],
  }),
].map(freezeMetadata));

export const ROCK_REFERENCE_SOURCE_STYLE_LABELS = Object.freeze({
  classic: 'ToonLab / Classic',
  cubic: 'ToonLab / Cubic',
  desert: 'ToonLab / Desert',
  hexic: 'ToonLab / Hexic',
  mountains: 'ToonLab / Mountains',
  spire: 'ToonLab / Spire',
});
