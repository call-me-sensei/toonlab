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

const fields = Object.values(groundShader.GROUND_SHADER_FIELD_SCHEMA)
  .flatMap((group) => Object.values(group));

await check('Ground Shader exposes an independent portable ownership contract', () => {
  assert.equal(groundShader.DEFAULT_GROUND_SHADER_PRESET, 'call_me_sensei');
  assert.equal(groundShader.GROUND_SHADER_SCHEMA_VERSION, 1);
  assert.equal(groundShader.GROUND_SHADER_SETTING_GROUPS.length, 9);
  assert.equal(fields.length, 59);
  for (const metadata of fields) {
    assert.equal(metadata.serializable, true);
    assert.ok(metadata.id);
    assert.ok(metadata.label);
    assert.ok(metadata.description);
    assert.match(metadata.uniform, /^uStyle[A-Z]/);
    assert.ok(Object.hasOwn(metadata, 'defaultValue'));
    assert.equal(Object.hasOwn(metadata, 'sourceKind'), false);
    assert.equal(Object.hasOwn(metadata, 'sourceName'), false);
  }
});

await check('Call Me Sensei resolves to independently authored anime-ground values', () => {
  const settings = groundShader.createGroundShaderSettings({
    preset: 'call_me_sensei',
  });
  assert.deepEqual(settings.layers.grassTint, [0.38, 0.61, 0.3]);
  assert.deepEqual(settings.layers.dirtTint, [0.48, 0.43, 0.37]);
  assert.deepEqual(settings.layers.rockTint, [0.58, 0.63, 0.69]);
  assert.deepEqual(settings.layers.sandTint, [0.88, 0.78, 0.52]);
  assert.deepEqual(settings.lighting.shadowTint, [0.68, 0.74, 0.94]);
  assert.equal(settings.lighting.sunIntensity, 1.18);
  assert.equal(settings.lighting.backShadowStrength, 0.62);
  assert.ok(settings.lighting.shadowLift <= 0.24,
    'Call Me Sensei terrain shade must not flatten cliff value separation');
  assert.ok(settings.lighting.skyFillStrength <= 0.04,
    'Call Me Sensei sky fill must preserve away-facing cliff shadow');
  assert.deepEqual(settings.distance.color, [0.59375, 0.59375, 0.59375]);
  assert.equal(settings.slope.autoRockStrength, 1);
  assert.equal(settings.macro.rockDetailAmount, 0.3);
  assert.equal(settings.macro.rockStrataAmount, 0.2);
  assert.equal(settings.material.roughness, 1);
});

await check('portable Ground Shader documents round-trip and reject future schemas', () => {
  const document = groundShader.createGroundShaderPresetDocument('painted-meadow', {
    label: 'Painted Meadow',
    settings: {
      layers: { grassTint: [0.18, 0.42, 0.21], textureStrength: 0.72 },
      distance: { strength: 0.64 },
    },
  });
  const parsed = groundShader.parseGroundShaderPresetDocument(
    groundShader.serializeGroundShaderPreset(document),
  );
  assert.equal(parsed.ok, true, parsed.errors?.join(' '));
  assert.deepEqual(parsed.value, document);
  assert.equal(document.type, groundShader.GROUND_SHADER_DOCUMENT_TYPE);
  assert.equal(groundShader.parseGroundShaderPresetDocument({ ...document, version: 1 }).ok, true);
  assert.equal(
    groundShader.parseGroundShaderPresetDocument({ ...document, version: 999 }).ok,
    false,
  );
  const unknown = groundShader.parseGroundShaderPresetDocument({
    ...document,
    settings: {
      ...document.settings,
      sceneAssets: { heightmap: 'not-portable' },
      layers: { ...document.settings.layers, currentWeather: 'rain' },
    },
  });
  assert.equal(unknown.ok, true, unknown.errors?.join(' '));
  assert.equal('sceneAssets' in unknown.value.settings, false);
  assert.equal('currentWeather' in unknown.value.settings.layers, false);
  assert.ok(unknown.warnings.some((warning) => warning.includes('sceneAssets')));
  assert.ok(unknown.warnings.some((warning) => warning.includes('layers.currentWeather')));
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
  assert.equal(settings.layers.textureStrength, 1);
  assert.equal('sceneAssets' in settings, false);
  assert.equal('currentWeather' in settings, false);
  assert.deepEqual(Object.keys(settings.weatherResponse).sort(), [
    'snowSlopeStart',
    'snowSoftness',
    'snowStrength',
    'snowTint',
    'wetDarkening',
    'wetDesaturation',
    'wetRoughness',
  ]);
});

await check('the public runtime is the canonical independent material', async () => {
  const runtime = await readFile(
    new URL('../src/ground-shader/groundShaderMaterial.js', import.meta.url),
    'utf8',
  );
  const landscape = await readFile(
    new URL('../src/landscape/landscapeMaterial.js', import.meta.url),
    'utf8',
  );
  assert.match(runtime, /export function createGroundShaderMaterial/);
  assert.match(runtime, /uSceneGroundSnowCover/);
  assert.match(runtime, /uSceneGroundWaterLevel/);
  assert.match(runtime, /sampleEnvironmentSunShadow\(positionWorld\)/,
    'ground must receive cast shadows from the shared node-backend sun pass');
  assert.match(runtime, /directionalBackShadow/,
    'ground must darken terrain faces turned away from the current sun');
  assert.match(runtime, /u\('lighting', 'sunIntensity'\)/,
    'ground must expose HDR sun response instead of capping lit albedo at one');
  assert.match(runtime, /sampleWorldFbmTriplanar/,
    'unmapped steep terrain must retain procedural triplanar geological detail');
  assert.match(runtime, /rockStrataScale/,
    'unmapped cliffs must retain vertical strata variation');
  assert.doesNotMatch(runtime, /P18|SoStylized/i);
  assert.match(landscape, /createCompatibilityGroundShaderMaterial/);
  assert.equal(typeof groundShader.createGroundShaderMaterial, 'function');
  assert.equal(typeof groundShader.createCompatibilityGroundShaderMaterial, 'function');
  const material = groundShader.createGroundShaderMaterial({
    field: {
      splat: new Uint8Array([255, 0, 0, 0]),
      splatD: 1,
      splatW: 1,
    },
  });
  assert.equal(typeof material.userData.createGroundColorVariant, 'function');
  const groundFieldVariant = material.userData.createGroundColorVariant();
  assert.ok(groundFieldVariant.colorNode,
    'Ground Shader must publish its flat splat albedo to ground-field consumers');
  assert.notEqual(groundFieldVariant.colorNode, material.colorNode,
    'ground-field albedo must exclude the view-dependent lighting graph');
  material.userData.toonlabGroundShader.splatTexture.dispose();
  material.dispose();

  const mesh = groundShader.createGroundShaderMesh({
    field: { splat: new Uint8Array([255, 0, 0, 0]), splatD: 1, splatW: 1 },
    geometry: new (await import('three')).PlaneGeometry(1, 1),
  });
  assert.equal(mesh.castShadow, true, 'safe ground meshes must cast by default');
  assert.equal(mesh.receiveShadow, true, 'safe ground meshes must receive by default');
  assert.equal(mesh.userData.groundFieldWrite, true,
    'safe ground meshes must write the shared ground field by default');
  assert.equal(mesh.frustumCulled, false,
    'safe ground meshes must not disappear from displaced/custom bounds');
  mesh.geometry.dispose();
  mesh.material.userData.toonlabGroundShader.splatTexture.dispose();
  mesh.material.dispose();
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
    styles.resolveStyleBundleSettings(builtIn).groundShader.distance.color,
    [0.59375, 0.59375, 0.59375],
  );
  const document = groundShader.createGroundShaderPresetDocument('inline-ground', {
    settings: { layers: { grassTint: [0.2, 0.4, 0.3], textureStrength: 0.5 } },
  });
  const inline = styles.createStyleBundleDocument('ground-inline', {
    slots: { groundShader: { document } },
  });
  assert.deepEqual(
    styles.resolveStyleBundleSettings(inline).groundShader.layers.grassTint,
    [0.2, 0.4, 0.3],
  );
});

console.log(`\n${checks} Ground Shader checks passed.`);
