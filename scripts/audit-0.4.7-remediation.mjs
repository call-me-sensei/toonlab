import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const sourceUrl = new URL('docs/0.4.7-remediation-checklist.md', root);
const outputUrl = new URL('docs/0.4.8-remediation-disposition.md', root);

const blockerDispositions = new Map(Object.entries({
  'labs-do-have-cast-shadows': ['superseded-or-not-a-defect', 'The source finding itself says the lab cast shadows; this was a settled harness conclusion.'],
  'rock-shader-flat-at-close-range': ['resolved-0.4.8', 'Added a configurable metre-scale near-detail octave with distance fade.'],
  'rock-shader-no-native-shadow': ['resolved-0.4.8', 'applyRockShader now defaults every matched mesh to cast and receive shadows and restores prior flags.'],
  'TL-047-ROCK-NO-SUN-INTENSITY': ['resolved-0.4.8', 'Rock Shared Lighting now exposes HDR exposure and a shaded-face ambient floor.'],
  'TL-047-ROCK-SHADER-SHIPS-NO-USABLE-BASE-MAP': ['resolved-0.4.8', 'The runtime creates 256px first-party generated maps and reports the active texture source.'],
  'TL-047-ROCK-TEXTURES-ARE-LICENSE-GATED': ['resolved-0.4.8', 'The default path is first-party generated code; private/licensed maps are not required or packaged.'],
  'TL-047-ROCK-VS-GROUND-LIGHTING-MODEL': ['resolved-0.4.8', 'Both public material families now expose HDR response and readable shade controls while retaining domain-specific graphs.'],
  'GUIDE-01': ['resolved-0.4.8', 'Docs now distinguish repository labs from clean-package qualification instead of treating one as proof of the other.'],
  'GUIDE-02': ['resolved-0.4.8', 'The rock lighting surface is public and documented.'],
  'GUIDE-03': ['resolved-0.4.8', 'Generated-map use is explicit in applyRockShader reports and the dedicated skill.'],
  'GUIDE-07': ['resolved-0.4.8', 'Ground-field writers publish the visible splat/detail/weather albedo without view lighting.'],
  'GUIDE-12': ['resolved-0.4.8', 'The package-owned grass factory, preset, provenance, and clean-tarball verifier prevent silent fixture substitution.'],
  'lighting-system-not-shipped': ['deferred-new-system', 'The full Lighting Lab system remains explicitly pre-beta and host-owned in 0.4.8; the stable environment sun/shadow primitives do ship.'],
  'TL-047-NO-ROCK-SHADER-OR-GROUND-SHADER-SKILL': ['resolved-0.4.8', 'Added paired rock-ground-shaders skills with runtime, texture, scene-state, and visual acceptance guidance.'],
  'env-scene-fog-disabled': ['resolved-0.4.8', 'Environment surface families participate in their documented atmosphere path; pass-only materials disable fog deliberately.'],
  'env-settings-unreachable': ['superseded-or-not-a-defect', 'Environment settings target environment-adapted materials; rock, ground, vegetation, water, and clouds own separate public settings. The skills now state this routing boundary.'],
  'env-shadow-bias-sign-collision': ['resolved-0.4.8', 'The shared node shadow sampler now uses the same signed bias convention as THREE.LightShadow.'],
  'env-sun-rig-intensity-vs-pi': ['resolved-0.4.8', 'Environment sun inputs are expressed in sun units and converted by PI at the Three light boundary.'],
  'env-sunshadowpass-fogged-depth': ['resolved-0.4.8', 'Shadow pass replacement materials are fog-free, and renderer background/clear state is restored.'],
  'TL-047-NO-CAST-SHADOWS': ['resolved-0.4.8', 'Ground/rock/vegetation constructors use safe cast/receive defaults and the node sun-shadow pass is public.'],
  'veg-branchtree-cannot-be-dense': ['resolved-0.4.8', 'BranchTree canopy construction was replaced with a focused dense broadleaf contract and regression verifier.'],
  'veg-branchtree-drops-canopy-group': ['resolved-0.4.8', 'BranchTree carries canopy, palette, wood, preset, and texture inputs through its public recipe.'],
  'veg-clump-lod-hard-cull': ['resolved-0.4.8', 'Call Me Sensei grass has explicit LOD0/1/2 coverage compensation and an infinite terminal LOD instead of a silent hard cull.'],
  'veg-cms-preset-never-loaded': ['resolved-0.4.8', 'The public factory resolves call_me_sensei_clump and clean-package verification asserts it.'],
  'veg-labs-are-the-only-place-the-values-live': ['resolved-0.4.8', 'Grass geometry recipe v3, material, palettes, and LOD values live in package source.'],
  'gs-no-sun-intensity-term': ['resolved-0.4.8', 'Ground lighting.sunIntensity provides HDR sun-facing response and specular scaling.'],
  'terrain-shadow-acne-kills-rock-palette': ['resolved-0.4.8', 'The shared shadow bias sign is corrected and safe material defaults are verified.'],
  'TL-047-TERRAIN-SELF-SHADOW-ACNE-IS-INVISIBLE-TO-PALETTE-SAMPLING': ['resolved-0.4.8', 'The bias contract is corrected at the shared sampler rather than hidden by palette tuning.'],
  'veg-groundfield-albedo-variant-is-not-the-rendered-ground': ['resolved-0.4.8', 'The ground-field variant reuses the rendered splat/detail/weather graph and excludes only view lighting.'],
  'card-billboard-key': ['resolved-0.4.8', 'Generated and artwork cards derive form lighting from the world sun in card space.'],
  'card-quad-visible': ['resolved-0.4.8', 'Card opacity uses authored/generated coverage with edge softening instead of exposing the plane.'],
  'volume-color-clamp': ['resolved-0.4.8', 'Cloud color settings retain linear HDR values up to 4 for tone mapping.'],
  'volume-fog': ['resolved-0.4.8', 'Cloud cards and volumes own atmospheric tint and no longer receive renderer fog a second time.'],
  'water-scene-fog-exp2-not-mirrored': ['resolved-0.4.8', 'Water mirrors both THREE.Fog and THREE.FogExp2 into its manual final fog stage.'],
  'water-shorestate-region-silently-disables-the-procedural-fallback outside itself': ['resolved-0.4.8', 'Procedural swash fallback is suppressed only where the finite shore-state field has coverage.'],
  'wf-no-waterfall-api': ['deferred-new-system', 'A waterfall/cascade system is net-new scope, not a 0.4.7 regression; it remains an explicit post-0.4.8 feature.'],
  'TL-TOW-08': ['deferred-new-system', 'Automatic heightfield/cliff formation and module suppression are not stable 0.4.8 package APIs.'],
  'texgen-stripes-has-no-v-variation': ['resolved-0.4.8', 'Stripes now expose rows and deterministic V-axis cell variation.'],
  'TL-047-LOADER-NO-SHARED-TRANSCODER': ['resolved-0.4.8', 'createModelAssetTranscoders lets repeated loadModelAsset calls share Meshopt, Draco, and KTX2 resources.'],
  'cross-module': ['superseded-or-not-a-defect', 'The checklist classifies this cloud placement issue as scene/harness-owned, not a ToonLab package gap.'],
}));

const resolvedFollowUps = new Set([
  'rock-shader-no-scene-shadow',
  'rock-shader-no-shade-controls',
  'rock-shader-no-wet-band',
  'TL-047-ROCK-MOSS-MASK-IS-CHROMATIC',
  'TL-047-ROCK-NO-WET-BAND',
  'TL-047-ROCK-PRESET-DARK',
  'TL-047-ROCK-SHADER-NO-AMBIENT-ON-DOWNFACING',
  'TL-TOW-02',
  'GUIDE-05',
  'GUIDE-06',
  'GUIDE-08',
  'GUIDE-10',
  'GUIDE-11',
  'veg-skill-omits-style-preset-argument',
  'env-shadow-bias-sign',
  'env-sunshadowpass-clearcolor-leak',
  'veg-groundfield-cache-cannot-see-a-writer-repaint',
  'veg-groundfield-writers-are-toonlab-only',
  'veg-groundfield-no-ready-or-writer-count-on-the-pass',
  'veg-groundfield-pass-reports-no-writer-count',
  'catalog-no-bounds',
  'catalog-taxonomy-dropped',
  'TL-047-MATCONFIG-URLS',
  'TL-047-NO-CATALOG-ROCK-SCALE-GUIDANCE',
  'catalog-glb-decoders-undocumented',
  'TL-047-CATALOG-HASH-COST',
  'TL-047-SEARCH-PAYLOAD',
]);

const explicitlyDeferred = new Set([
  'no-cliff-formation-api',
  'no-placement-primitive-for-"lap over the parent"',
  'RS-03',
  'shadow-filter-and-sky-light-repo-only',
  'TL-047-CLIFFS-PARTS-NOT-VISIBLE-DURING-BUILD',
  'TL-TOW-03',
  'RS-04',
  'veg-no-cliff-cap-or-ledge-vegetation-api',
  'no-byo-heightfield-builder',
  'TL-047-WATERFALL-MISSING',
  'wf-breaker-material-unusable-off-heightfield',
  'wf-splash-crown-is-the-only-whitewater-mass',
  'wf-water-material-is-xz-only',
  'heightfield-cannot-undercut',
  'rockgen-no-catalog-aware-fluting',
  'RS-05',
  'RS-06',
  'wf-no-flow-uv-hook',
]);

function parseFindings(source) {
  const findings = [];
  let area = null;
  let severity = null;
  source.split(/\r?\n/).forEach((line, index) => {
    const areaMatch = line.match(/^## `?([^`<]+?)`?\s*(?:<sub>|$)/);
    if (areaMatch && /findings/.test(line)) area = areaMatch[1].trim();
    const severityMatch = line.match(/^### (Blocker|Major|Minor|Unclassified)/);
    if (severityMatch) severity = severityMatch[1].toLowerCase();
    const findingMatch = line.match(/^- \[[ xX]\] \*\*`?([^`*]+?)`?\*\*\s+—\s+(.+)$/);
    if (!findingMatch || !area || !severity) return;
    findings.push({
      area,
      id: findingMatch[1].trim(),
      line: index + 1,
      severity,
      summary: findingMatch[2].trim(),
    });
  });
  return findings;
}

function dispositionFor(finding) {
  if (finding.severity === 'blocker') {
    const disposition = blockerDispositions.get(finding.id);
    assert.ok(disposition, `Unclassified blocker: ${finding.area} / ${finding.id}`);
    return { rationale: disposition[1], status: disposition[0] };
  }
  if (resolvedFollowUps.has(finding.id)) {
    return {
      status: 'resolved-0.4.8',
      rationale: 'The current 0.4.8 implementation or its package/skill verification directly covers this historical follow-up.',
    };
  }
  if (explicitlyDeferred.has(finding.id)) {
    return {
      status: 'deferred-new-system',
      rationale: 'This requests a new generator, placement system, or rendering domain outside the approved 0.4.8 patch scope.',
    };
  }
  if (finding.area.includes('scene + harness')) {
    return {
      status: 'superseded-or-not-a-defect',
      rationale: 'The historical checklist places this in scene/harness scope rather than the distributable package.',
    };
  }
  return {
    status: 'follow-up-not-release-blocking',
    rationale: 'Still relevant as quality/backlog work, but not evidence that an existing 0.4.8 stable API is broken at its documented default.',
  };
}

const source = await readFile(sourceUrl, 'utf8');
const findings = parseFindings(source);
assert.equal(findings.length, 237, `Expected 237 findings, received ${findings.length}`);
const rows = findings.map((finding) => ({ ...finding, ...dispositionFor(finding) }));
const blockerRows = rows.filter((finding) => finding.severity === 'blocker');
assert.equal(blockerRows.length, blockerDispositions.size);
assert.equal(blockerRows.some((finding) => finding.status === 'follow-up-not-release-blocking'), false);

const counts = Object.fromEntries([...new Set(rows.map((row) => row.status))]
  .sort()
  .map((status) => [status, rows.filter((row) => row.status === status).length]));
const severityCounts = Object.fromEntries(['blocker', 'major', 'minor', 'unclassified']
  .map((severity) => [severity, rows.filter((row) => row.severity === severity).length]));

const markdown = [];
markdown.push('# 0.4.8 disposition of the 0.4.7 remediation checklist', '');
markdown.push('This is the current release audit. The generated 0.4.7 checklist remains unchanged as historical evidence; unchecked boxes there do not mean the current code is still broken.', '');
markdown.push('`resolved-0.4.8` means the code contract and an automated regression now exist. It is not a substitute for the final controlled P18 visual pass; rock/ground palette, shadows, cloud silhouette, shoreline, and underwater composition must still be captured before publication.', '');
markdown.push(`The audit parsed all **${rows.length}** historical entries: **${severityCounts.blocker} blocker**, **${severityCounts.major} major**, **${severityCounts.minor} minor**, and **${severityCounts.unclassified} unclassified**. Every historical blocker has an explicit disposition; there are **zero unclassified 0.4.8 release blockers**.`, '');
markdown.push('## Release decision', '');
markdown.push('- **Include in 0.4.8:** fixes to existing stable APIs and unsafe defaults: rock/ground lighting and shadows, rock detail/maps/wet band, grass package/LOD/provenance, cloud HDR/fog, water FogExp2/shore fallback/underwater atmosphere, shared model transcoders, texgen stripe variation, catalog metadata/R2 delivery, and skills/documentation.', '- **Do not claim in 0.4.8:** a full Lighting System, automatic cliff builder, terrain burial solver, waterfall/cascade system, or heightfield-to-module planner. Those are new systems with separate design and visual acceptance work.', '- **Keep as backlog:** remaining major/minor quality findings are preserved below. They are not silently closed and must be reconsidered for 0.4.9+ or when their owning public API changes.', '');
markdown.push('## Disposition counts', '', '| Status | Count |', '| --- | ---: |');
for (const [status, count] of Object.entries(counts)) markdown.push(`| \`${status}\` | ${count} |`);
markdown.push('', '## Historical blockers', '', '| Area | Finding | 0.4.8 disposition | Rationale |', '| --- | --- | --- | --- |');
for (const row of blockerRows) {
  markdown.push(`| ${row.area} | [\`${row.id}\`](0.4.7-remediation-checklist.md#L${row.line}) | \`${row.status}\` | ${row.rationale} |`);
}
markdown.push('', '## Complete 237-entry inventory', '', 'This inventory exists so every historical item remains searchable. `follow-up-not-release-blocking` means the concern remains useful backlog; it does not mean it was visually approved or forgotten.', '');
for (const area of [...new Set(rows.map((row) => row.area))]) {
  markdown.push(`### ${area}`, '', '| Severity | Finding | Status |', '| --- | --- | --- |');
  for (const row of rows.filter((candidate) => candidate.area === area)) {
    markdown.push(`| ${row.severity} | [\`${row.id}\`](0.4.7-remediation-checklist.md#L${row.line}) | \`${row.status}\` |`);
  }
  markdown.push('');
}
markdown.push('## Verification contract', '', 'Run `npm run verify:release`. The release gate includes rock, ground, water, texgen, cloud, grass clean-package, character clean-package, MCP, skills, docs, API, local database, and package-boundary verification. Regenerate release tarballs and checksums only after this audit and that gate both pass.', '', 'Regenerate this document with:', '', '```sh', 'node scripts/audit-0.4.7-remediation.mjs', '```', '');

await writeFile(outputUrl, `${markdown.join('\n')}\n`);
console.log(`0.4.8 remediation disposition written: ${rows.length} findings, ${blockerRows.length} blockers classified.`);
