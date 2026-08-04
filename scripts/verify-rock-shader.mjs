import assert from 'node:assert/strict';
import * as THREE from 'three';

import * as rockShader from '@call-me-sensei/toonlab/rock-shader';
import * as rockgen from '@call-me-sensei/toonlab/rockgen';
import * as styles from '@call-me-sensei/toonlab/styles';

let checks = 0;
function check(label, callback) {
  callback();
  checks += 1;
  console.log(`ok   ${label}`);
}

check('rock shader is a separate public domain from procedural rock generation', () => {
  assert.equal(typeof rockShader.applyRockShader, 'function');
  assert.equal(typeof rockShader.createRockShaderSettings, 'function');
  assert.equal(typeof rockShader.createToonRockMaterial, 'function');
  assert.equal('applyRockShader' in rockgen, false);
  assert.equal('createRockShaderSettings' in rockgen, false);
  assert.equal('createToonRockMaterial' in rockgen, false);
});

check('Call Me Sensei is the default and every editor field has metadata', () => {
  const settings = rockShader.createRockShaderSettings();
  assert.equal(settings.preset, 'call_me_sensei');
  assert.equal(rockShader.DEFAULT_ROCK_SHADER_PRESET, 'call_me_sensei');
  assert.equal(settings.projection.scale, 48);
  assert.equal(settings.projection.projectionContrast, 2);
  assert.equal(settings.distanceTint.closeDistance, 500);
  assert.equal(settings.distanceTint.farDistance, 15000);
  assert.equal(settings.normals.distance, 30000);
  assert.equal(settings.normals.useSmoothed, true);
  assert.deepEqual(settings.material.tint, [0.92, 0.94, 0.98]);
  assert.equal(settings.projection.nearDetailScale, 1.2);
  assert.equal(settings.projection.nearDetailStrength, 0.34);
  assert.equal(settings.lighting.exposure, 1.12);
  assert.equal(settings.lighting.ambientFloor, 0.08);
  assert.equal(settings.shoreline.wetBandWidth, 1);
  assert.equal(settings.material.metallic, 0);
  assert.equal(settings.material.emissiveStrength, 0);
  assert.equal(settings.assetIntegration.vertexColorStrength, 0);
  assert.equal(settings.assetIntegration.vertexAoStrength, 0);
  assert.ok(rockShader.ROCK_SHADER_SETTING_GROUPS.length >= 10);

  for (const group of rockShader.ROCK_SHADER_SETTING_GROUPS) {
    const fields = rockShader.ROCK_SHADER_FIELD_SCHEMA[group.id];
    assert.ok(Object.keys(fields).length > 0, `${group.id} needs fields`);
    for (const metadata of Object.values(fields)) {
      assert.equal(typeof metadata.label, 'string');
      assert.ok(metadata.label.length > 0);
      assert.equal(typeof metadata.description, 'string');
      assert.ok(metadata.description.length > 0);
      assert.equal(metadata.serializable, true);
      assert.ok(Object.hasOwn(metadata, 'defaultValue'));
    }
  }
});

check('portable rock shader documents round-trip through the public schema', () => {
  const document = rockShader.createRockShaderPresetDocument('weathered-cliff', {
    description: 'A reusable rock material treatment, not a rock asset recipe.',
    label: 'Weathered Cliff',
    settings: {
      distanceTint: { strength: 0.41 },
      moss: { multiply: 2.1 },
      striping: { enabled: true },
    },
  });
  const serialized = rockShader.serializeRockShaderPreset(document);
  const parsed = rockShader.parseRockShaderPresetDocument(serialized);
  assert.equal(parsed.ok, true, parsed.errors?.join(' '));
  assert.deepEqual(parsed.value, document);
  assert.equal(document.schema, rockShader.ROCK_SHADER_DOCUMENT_TYPE);
});

check('editor settings map onto the independent material profile', () => {
  const profile = rockShader.rockShaderSettingsToProfile({
    distanceTint: { closeDistance: 21, farDistance: 155, strength: 0.36 },
    layerMask: { offset: 0.3, sharpness: 3.2, useAssetMask: false },
    moss: { multiply: 2.2, size: 3.1 },
    projection: { contrast: 1.27, projectionContrast: 0.71 },
  });
  assert.equal(profile.base.closeTintDistance, 21);
  assert.equal(profile.base.farTintDistance, 155);
  assert.equal(profile.base.distantTintMix, 0.36);
  assert.equal(profile.base.contrast, 1.27);
  assert.equal(profile.base.projectionContrast, 0.71);
  assert.equal(profile.layers.maskEnabled, false);
  assert.equal(profile.layers.sharpness, 3.2);
  assert.equal(profile.layers.offset, 0.3);
  assert.equal(profile.moss.size, 3.1);
  assert.equal(profile.moss.multiply, 2.2);
});

check('runtime assignment preserves exact defaults and supports optional asset channels', () => {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const originalMaterial = new THREE.MeshStandardMaterial({ color: 0x777777 });
  const mesh = new THREE.Mesh(geometry, originalMaterial);
  const root = new THREE.Group();
  root.add(mesh);

  const report = rockShader.applyRockShader(root);
  assert.equal(report.preset, 'call_me_sensei');
  assert.equal(report.applied, 1);
  assert.equal(report.textureSource, 'first-party-generated');
  assert.equal(report.usedGeneratedTextures, true);
  assert.equal(report.shadowDefaultsApplied, 1);
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
  assert.equal(geometry.getAttribute('color'), undefined);
  assert.equal(geometry.getAttribute('envVertexAo'), undefined);

  rockShader.applyRockShader(root, {
    assetIntegration: {
      vertexColorStrength: 1,
      vertexAoStrength: 1,
    },
  });
  assert.ok(geometry.getAttribute('color'));
  assert.ok(geometry.getAttribute('envVertexAo'));
  assert.equal(mesh.material.userData.toonLabRockShaderPreset, 'call_me_sensei');
  assert.equal(mesh.material.userData.toonLabRockShaderOwned, true);
  assert.equal(mesh.material.userData.toonLabRockTextureSource, 'first-party-generated');
  assert.deepEqual(rockShader.setRockShaderSceneState(root, { waterLevel: 2 }), {
    updated: 1,
    waterLevel: 2,
  });
  assert.equal(mesh.material.userData.toonLabRockSceneState.waterLevel.value, 2);

  assert.equal(rockShader.restoreRockShader(root), 1);
  assert.equal(mesh.material, originalMaterial);
  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.receiveShadow, false);
  geometry.dispose();
  originalMaterial.dispose();
  rockShader.disposeDefaultRockShaderTextures();
});

check('style bundles resolve a detailed rock shader document, not a geometry style', () => {
  assert.equal(
    styles.STYLE_BUNDLE_SLOTS.rock.documentType,
    rockShader.ROCK_SHADER_DOCUMENT_TYPE,
  );
  const bundle = styles.createStyleBundleDocument('rock-shader-bundle', {
    slots: { rock: { style: 'call_me_sensei' } },
  });
  const resolved = styles.resolveStyleBundleSettings(bundle).rock;
  assert.equal(resolved.preset, 'call_me_sensei');
  assert.equal(typeof resolved.projection.scale, 'number');
  assert.equal(typeof resolved.assetIntegration.vertexAoStrength, 'number');
  assert.equal('pieces' in resolved, false);
  assert.equal('meshing' in resolved, false);
});

check('style bundles validate and resolve inline rock shader documents', () => {
  const rockDocument = rockShader.createRockShaderPresetDocument('inline-rock', {
    label: 'Inline Rock',
    settings: {
      assetIntegration: { sourceAlbedoMode: 'blend', sourceAlbedoStrength: 0.35 },
      moss: { enabled: false },
    },
  });
  const bundle = styles.createStyleBundleDocument('inline-rock-bundle', {
    slots: { rock: { document: rockDocument } },
  });
  const parsed = styles.parseStyleBundleDocument(styles.serializeStyleBundle(bundle));
  assert.equal(parsed.ok, true, parsed.errors?.join(' '));
  const resolved = styles.resolveStyleBundleSettings(parsed.value).rock;
  assert.equal(resolved.assetIntegration.sourceAlbedoMode, 'blend');
  assert.equal(resolved.assetIntegration.sourceAlbedoStrength, 0.35);
  assert.equal(resolved.moss.enabled, false);
  assert.equal('pieces' in resolved, false);
});

console.log(`\n${checks} rock shader checks passed.`);
