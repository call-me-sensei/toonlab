// Rock Lab workflow stages and tools. Stages group the settings schema for
// the right inspector; tools live on the floating strip and cut across
// stages (same architecture as Tree Lab's stageMap).

export const STAGES = [
  {
    description: 'Preset, seed, and the base primitive the selected piece displaces.',
    groups: ['shape', 'heightfield', 'falloff'],
    icon: 'stage-shape',
    id: 'shape',
    key: '1',
    label: 'Shape',
  },
  {
    description: 'Displacement stages on the selected piece — cuts make flats, noise roughens.',
    groups: ['noise', 'warp', 'cuts', 'facet', 'cracks', 'strata', 'columns'],
    icon: 'stage-detail',
    id: 'detail',
    key: '2',
    label: 'Detail',
  },
  {
    description: 'The composition: stack, union, and subtract pieces; drag with the gizmo.',
    groups: [],
    icon: 'stage-pieces',
    id: 'pieces',
    key: '3',
    label: 'Pieces',
  },
  {
    description: 'Procedural surface textures, baked vertex colors, and ambient occlusion.',
    groups: ['surface'],
    icon: 'stage-look',
    id: 'look',
    key: '4',
    label: 'Look',
  },
  {
    description: 'Meshing resolutions and file export.',
    groups: ['meshing'],
    icon: 'stage-export',
    id: 'export',
    key: '5',
    label: 'Export',
  },
];

export const TOOLS = [
  {
    description: 'Orbit, pan, and zoom the camera; drag pieces with the gizmo.',
    icon: 'tool-move',
    id: 'orbit',
    key: 'V',
    label: 'Move',
  },
  {
    description: 'Hover a side of a rock piece and click to generate an adjacent tile.',
    icon: 'stage-pieces',
    id: 'adjacentTile',
    key: 'A',
    label: 'Tile',
  },
  {
    description: 'Paint a filled brush stroke that builds rock at brush width.',
    icon: 'tool-sculpt-add',
    id: 'sculptAdd',
    key: 'B',
    label: 'Build',
  },
  {
    description: 'Paint a filled brush stroke that cuts through the rock at brush width.',
    icon: 'tool-sculpt-sub',
    id: 'sculptSubtract',
    key: 'E',
    label: 'Carve',
  },
  {
    description: 'Draw a rock outline in the air — the closed doodle becomes a new slab piece.',
    icon: 'sketch',
    id: 'doodle',
    key: 'D',
    label: 'Doodle',
  },
];
