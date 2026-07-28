import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as groundShader from '@call-me-sensei/toonlab/ground-shader';
import * as styles from '@call-me-sensei/toonlab/styles';

let checks = 0;
async function check(label, callback) {
  await callback();
  checks += 1;
  console.log(`ok   ${label}`);
}

const manifest = JSON.parse(await readFile(
  new URL('../assets-local/reference-materials/material-source/manifest.json', import.meta.url),
  'utf8',
));
const p18Profile = manifest.materials.find(
  ({ path }) => path.endsWith('/MI_Landscape_Snow.MI_Landscape_Snow'),
);
assert.ok(p18Profile, 'The retained P18 landscape material profile must exist.');

const fields = Object.values(groundShader.GROUND_SHADER_FIELD_SCHEMA)
  .flatMap((group) => Object.values(group));
const retainedSourceFields = Object.values(groundShader.P18_GROUND_SOURCE_FIELD_SCHEMA)
  .flatMap((group) => Object.values(group));
const authoredFieldIds = new Set(fields.map(({ id }) => id));
const externalSourceFields = retainedSourceFields
  .filter(({ id }) => !authoredFieldIds.has(id));

await check('Ground Shader exposes only its P18-derived ownership contract', () => {
  assert.equal(groundShader.DEFAULT_GROUND_SHADER_PRESET, 'call_me_sensei');
  assert.equal(groundShader.GROUND_SHADER_SCHEMA_VERSION, 3);
  assert.equal(groundShader.GROUND_SHADER_SETTING_GROUPS.length, 6);
  assert.equal(fields.length, 59);
  assert.equal(retainedSourceFields.length, 121);
  assert.equal(externalSourceFields.length, 62);
  for (const metadata of fields) {
    assert.equal(metadata.serializable, true);
    assert.ok(metadata.id);
    assert.ok(metadata.label);
    assert.ok(metadata.description);
    assert.ok(metadata.sourceKind);
    assert.ok(metadata.sourceName);
    assert.ok(Object.hasOwn(metadata, 'sourceScale'));
    assert.ok(Object.hasOwn(metadata, 'defaultValue'));
  }
});

await check('Call Me Sensei converts exactly back to every connected P18 source input', () => {
  const settings = groundShader.createGroundShaderSettings({
    preset: 'call_me_sensei',
  });
  const sourceProfile = groundShader.createGroundShaderSourceProfile(
    p18Profile,
    settings,
  );
  for (const metadata of fields) {
    const sourceValues = sourceProfile.parameters[metadata.sourceKind];
    assert.ok(
      Object.hasOwn(sourceValues, metadata.sourceName),
      `missing ${metadata.sourceKind} source input ${metadata.sourceName}`,
    );
    const actual = sourceValues[metadata.sourceName];
    const expected = p18Profile.parameters[metadata.sourceKind][metadata.sourceName];
    if (metadata.sourceKind === 'vector') {
      actual.slice(0, 3).forEach((value, index) => {
        assert.ok(
          Math.abs(value - expected[index]) <= 1e-6,
          `${metadata.id}[${index}]: expected ${expected[index]}, received ${value}`,
        );
      });
      continue;
    }
    if (metadata.sourceKind === 'static_switch') {
      assert.equal(actual, expected, metadata.id);
      continue;
    }
    assert.ok(
      Math.abs(actual - expected) <= 1e-6,
      `${metadata.id}: expected ${expected}, received ${actual}`,
    );
  }
  for (const metadata of externalSourceFields) {
    assert.deepEqual(
      sourceProfile.parameters[metadata.sourceKind][metadata.sourceName],
      p18Profile.parameters[metadata.sourceKind][metadata.sourceName],
      `${metadata.id} must remain retained source data`,
    );
  }
});

await check('portable Ground Shader documents round-trip and migrate the monolithic v2 schema', () => {
  const document = groundShader.createGroundShaderPresetDocument('painted-meadow', {
    label: 'Painted Meadow',
    settings: {
      grass: { tint: [0.18, 0.42, 0.21], useColorMap: false },
      rock: { farTintStrength: 0.64 },
    },
  });
  const parsed = groundShader.parseGroundShaderPresetDocument(
    groundShader.serializeGroundShaderPreset(document),
  );
  assert.equal(parsed.ok, true, parsed.errors?.join(' '));
  assert.deepEqual(parsed.value, document);
  assert.equal(document.type, groundShader.GROUND_SHADER_DOCUMENT_TYPE);
  assert.equal(
    groundShader.parseGroundShaderPresetDocument({ ...document, version: 1 }).ok,
    false,
  );
  assert.equal(
    groundShader.parseGroundShaderPresetDocument({ ...document, version: 999 }).ok,
    false,
  );
  const migrated = groundShader.parseGroundShaderPresetDocument({
    ...document,
    settings: {
      ...document.settings,
      desertDirt: { tint: [0.4, 0.2, 0.1] },
      emissionCycle: { enabled: true, night: 0.5 },
      snow: { sparkle: true },
      wetness: {
        ...document.settings.wetness,
        rainWetness: true,
        useWeather: true,
      },
    },
    version: 2,
  });
  assert.equal(migrated.ok, true, migrated.errors?.join(' '));
  assert.equal(migrated.value.version, 3);
  assert.equal('snow' in migrated.value.settings, false);
  assert.equal('desertDirt' in migrated.value.settings, false);
  assert.equal('emissionCycle' in migrated.value.settings, false);
  assert.equal('useWeather' in migrated.value.settings.wetness, false);
  assert.equal('rainWetness' in migrated.value.settings.wetness, false);
  assert.ok(migrated.warnings.some((warning) => warning.includes('migrated to v3')));
  assert.ok(migrated.warnings.some((warning) => warning.includes('snow-surface-shader')));
});

await check('portable settings exclude terrain assets and current scene state', () => {
  const settings = groundShader.createGroundShaderSettings();
  for (const forbidden of [
    'camera',
    'geometry',
    'heightmap',
    'snow',
    'snowCover',
    'splat',
    'texture',
    'time',
    'waterLevel',
    'weather',
    'weightmap',
  ]) {
    assert.equal(forbidden in settings, false, forbidden);
  }
  assert.equal(settings.grass.useColorMap, true);
  assert.equal('desertGrass' in settings, false);
  assert.equal('desertDirt' in settings, false);
  assert.equal('desertSand' in settings, false);
  assert.equal('emissionCycle' in settings, false);
  assert.deepEqual(
    Object.keys(settings.wetness).sort(),
    ['darkening', 'desaturation', 'roughness', 'specular'],
  );
});

await check('the exact runtime executes the retained P18 graph and keeps compatibility explicit', async () => {
  const runtime = await readFile(
    new URL('../src/ground-shader/p18GroundShaderMaterial.js', import.meta.url),
    'utf8',
  );
  const compatibility = await readFile(
    new URL('../src/ground-shader/groundShaderMaterial.js', import.meta.url),
    'utf8',
  );
  const landscape = await readFile(
    new URL('../src/landscape/landscapeMaterial.js', import.meta.url),
    'utf8',
  );
  assert.match(runtime, /buildToonLabLandscapeMaterial/);
  assert.match(runtime, /P18_GROUND_SOURCE_MATERIAL = 'MI_Landscape_Snow'/);
  assert.match(runtime, /fieldCount: fieldCount\(\)/);
  assert.match(compatibility, /createCompatibilityGroundShaderMaterial/);
  assert.match(landscape, /createCompatibilityGroundShaderMaterial/);
  assert.equal(typeof groundShader.createGroundShaderMaterial, 'function');
  assert.equal(typeof groundShader.createCompatibilityGroundShaderMaterial, 'function');
});

await check('the Ground Lab uses the exact P18 scene and has no synthetic terrain substitute', async () => {
  const engine = await readFile(
    new URL('../labs/ground-shader-lab/ui/engine.js', import.meta.url),
    'utf8',
  );
  const app = await readFile(
    new URL('../labs/ground-shader-lab/ui/App.jsx', import.meta.url),
    'utf8',
  );
  assert.match(engine, /createP18ShaderPreviewScene/);
  assert.match(engine, /authoredComponent: 'ground'/);
  assert.match(engine, /environmentContent\.groundRoot/);
  assert.match(engine, /createGroundShaderMaterial/);
  assert.doesNotMatch(engine, /PlaneGeometry|CircleGeometry|DataTexture|splat/i);
  assert.match(app, /P18PreviewStylesModal/);
  assert.match(app, /authoredComponent="ground"/);
  assert.match(app, /disabledGroundFieldReason/);
  assert.match(app, /testId="preview-snow"/);
  assert.match(app, /Receiver response only/);
  assert.match(app, /Terrain substrate, not grass blades/);
  assert.doesNotMatch(app, /Snow Layers|Desert Grass|Desert Dirt|Desert Sand|Emission Cycle/);
  assert.match(engine, /createP18PreviewGroundSnowLayer/);
  assert.match(engine, /previewGroundSnow\.setSnowCover/);
});

await check('style bundles resolve built-in and inline Ground Shader profiles', () => {
  assert.equal(
    styles.STYLE_BUNDLE_SLOTS.groundShader.documentType,
    groundShader.GROUND_SHADER_DOCUMENT_TYPE,
  );
  const builtIn = styles.createStyleBundleDocument('ground-built-in', {
    slots: { groundShader: { style: 'call_me_sensei' } },
  });
  assert.deepEqual(
    styles.resolveStyleBundleSettings(builtIn).groundShader.rock.farTint,
    [0.59375, 0.59375, 0.59375],
  );
  const document = groundShader.createGroundShaderPresetDocument('inline-ground', {
    settings: { grass: { tint: [0.2, 0.4, 0.3], useColorMap: false } },
  });
  const inline = styles.createStyleBundleDocument('ground-inline', {
    slots: { groundShader: { document } },
  });
  assert.deepEqual(
    styles.resolveStyleBundleSettings(inline).groundShader.grass.tint,
    [0.2, 0.4, 0.3],
  );
});

console.log(`\n${checks} Ground Shader checks passed.`);
