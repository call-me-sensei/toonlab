// Field enablement rules, pure over (state, field). Shared by the legacy
// vanilla panel (P1) and the React inspector (P2+). Returning a string
// (instead of true) gives the UI a "why disabled" tooltip.

const COLONIZATION_FIELDS = new Set([
  'skeleton.attractionCount', 'skeleton.segmentLength', 'skeleton.influenceRadius',
  'skeleton.killRadius', 'skeleton.maxNodes', 'skeleton.attractionReachAuto',
  'skeleton.attractionReach',
]);
const BRANCHING_FIELDS = new Set([
  'skeleton.levels', 'skeleton.childrenCount', 'skeleton.branchAngle',
  'skeleton.branchStart', 'skeleton.lengthRatio', 'skeleton.radiusRatio',
  'skeleton.gnarliness', 'skeleton.forceStrength', 'skeleton.conifer',
]);
export const CROWN_LAYOUT_FIELDS = new Set([
  'canopy.width', 'canopy.depth', 'canopy.flatten', 'canopy.lobeCount',
  'canopy.spread', 'canopy.coreRadius',
]);

export function isFieldDisabled(state, field) {
  const { settings, sketch } = state;
  const isBush = settings.plant.type === 'bush';
  const isFlower = settings.plant.type === 'flower';
  if (isBush && (field.group === 'trunk' || field.group === 'skeleton')) {
    return 'Bushes have no wood.';
  }
  if (!isFlower && field.group === 'flower') {
    return 'Pick the Flower plant type in Shape.';
  }
  if (field.id === 'flower.headColor' && !settings.flower?.pinHeadColor) {
    return 'Pin the head color to edit it.';
  }
  const generator = settings.skeleton.generator;
  // Hand-drawn trees have no procedural wood: every trunk/growth knob idles.
  if (generator === 'drawn' && !isBush) {
    if (field.group === 'trunk') return 'Hand-drawn wood — draw with the Trunk and Branch tools.';
    if (field.group === 'skeleton' && field.key !== 'generator') {
      return 'Hand-drawn wood — draw with the Trunk and Branch tools.';
    }
    if (CROWN_LAYOUT_FIELDS.has(field.id)) return 'Hand-drawn mode fills scribbled foliage directly.';
  }
  if (COLONIZATION_FIELDS.has(field.id) && generator !== 'limbs') {
    return 'Only used by the Grown Limbs generator.';
  }
  if (BRANCHING_FIELDS.has(field.id) && generator !== 'branching') {
    return 'Only used by the Branching generator.';
  }
  // A drawn crown pins the blob layout; the generated-layout sliders idle.
  if (sketch.crownBlobs.length && CROWN_LAYOUT_FIELDS.has(field.id)) {
    return 'Crown pinned to your drawn outline.';
  }
  if (isBush && field.id === 'canopy.canopyScale') return true;
  if (isBush && field.id === 'leaves.placement') return true;
  if (isBush && field.id === 'leaves.shellFill') return true;
  if (field.id === 'trunk.bendDirection' && settings.trunk.bendDirectionAuto) {
    return 'Off while Auto Bend Heading is on.';
  }
  if (field.id === 'trunk.leanOffset' && settings.trunk.leanOffsetAuto) {
    return 'Off while Auto Lean Heading is on.';
  }
  if (field.id === 'skeleton.attractionReach' && settings.skeleton.attractionReachAuto) {
    return 'Off while Auto Reach is on.';
  }
  if (field.id === 'color.lit' && !settings.color.pinLit) return 'Pin the lit color to edit it.';
  if (field.id === 'color.shadow' && !settings.color.pinShadow) return 'Pin the shadow color to edit it.';
  if (field.id === 'color.crown' && !settings.color.pinCrown) return 'Pin the crown color to edit it.';
  return false;
}
