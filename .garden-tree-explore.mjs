import { measure, measureLod } from './.garden-tree-harness.mjs';

const rows = [];
export function probe(label, settings, targetHeight) {
  const m0 = measure(settings);
  const scale = targetHeight / m0.recipeHeight;
  const m = measure(settings, { instanceScale: scale });
  let lod = null;
  try {
    const c = measureLod(settings);
    lod = {
      valid: c.report?.valid,
      tris: c.report.levels.map((l) => l.triangles),
      caps: c.report.levels.map((l) => l.triangleCap),
      levels: c.report.levels,
    };
    c.dispose?.();
  } catch (error) { lod = { error: error.message }; }
  rows.push({ label, m, scale, lod });
  console.log(
    label.padEnd(30),
    'recH' + m.recipeHeight.toFixed(2).padStart(6),
    '×' + scale.toFixed(3),
    'H' + m.placedHeight.toFixed(2).padStart(5),
    'W' + m.crownWidth.toFixed(2).padStart(6),
    'c/h' + (m.crownWidth / m.placedHeight).toFixed(2),
    'pads' + String(m.attachments).padStart(4),
    'wood' + String(m.woodTriangles).padStart(6),
    'cards' + String(m.leafCards).padStart(6),
    'tris' + String(m.totalTriangles).padStart(6),
    'c/m' + String(Math.round(m.cardsPerMetre)).padStart(5),
    'card' + m.cardEdge.toFixed(3),
    'lean' + m.leanPercentOfHeight.toFixed(1) + '%@' + m.leanAzimuth.toFixed(0),
    'lod' + (lod?.valid ?? lod?.error) + ' ' + (lod?.tris ?? []).join('/'),
  );
  return m;
}
export { rows };
