// Repository-only provenance and identity gate for the native environment reference A/B.
//
// This is intentionally separate from shader/render parity. It proves that
// the still on the left and the live reconstruction on the right come from
// the same immutable export bundle, source scene, source camera, and 16:9
// capture frame before any pixel-quality judgement is made.

export const ENVIRONMENT_REFERENCE_CURRENT_COMPARISON_EVIDENCE = Object.freeze({
  schema: 'toonlab.environment-reference-evidence',
  schemaVersion: 2,
  baseUrl: '/assets-local/reference-environment/environment-capture-current',
  captureLabel: 'pc-current-project-settings',
  cameraIndex: 0,
  cameraName: 'Camera',
  viewport: Object.freeze({ width: 1920, height: 1080 }),
  files: Object.freeze({
    captureReport: Object.freeze({
      name: 'toonlab-reference.txt',
      sha256: '9d3c4e758e256013cb1f4fd6517d754b61e86f7ebda7e63f55683651b8b32f98',
    }),
    manifest: Object.freeze({
      name: 'scene-manifest.json',
      sha256: '762ac1e90938e2d793618163dc150990f8c03ccdb02fedde70646c7244170179',
    }),
    terrainNativeAuthority: Object.freeze({
      name: 'terrain-native-authority.json',
      sha256: '754b4fba3b54929c2bd7f619e9d87b5d4128e92099c841eca2d542d890f0b83c',
    }),
    nativeReference: Object.freeze({
      name: 'toonlab-reference.png',
      sha256: 'e06e02fcdc4ff4fce1aaa4252af1e479fd0dda4329ddde145f0765397d67b22b',
    }),
    reconstructionScene: Object.freeze({
      name: 'scene.glb',
      sha256: '603701d5eafb2b7125f033a28dd0ac1f01cfbbf020ec59fba17f79760a67f5f9',
    }),
  }),
});

const POSITION_TOLERANCE = 0.0051;
const ROTATION_TOLERANCE_RADIANS = 0.001;
const SCALAR_TOLERANCE = 1e-6;

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function parseTuple(value, length, label) {
  const match = String(value ?? '').trim().match(/^\((.*)\)$/);
  if (!match) throw new Error(`${label} is missing from the native capture report.`);
  const tuple = match[1].split(',').map((entry) => finiteNumber(entry.trim(), label));
  if (tuple.length !== length) throw new Error(`${label} must contain ${length} values.`);
  return tuple;
}

function parseResolution(value) {
  const match = String(value ?? '').trim().match(/^(\d+)x(\d+)$/i);
  if (!match) throw new Error('resolution is missing from the native capture report.');
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseAttributes(value) {
  const attributes = {};
  for (const field of String(value ?? '').split(',')) {
    const separator = field.indexOf('=');
    if (separator < 0) continue;
    attributes[field.slice(0, separator).trim()] = field.slice(separator + 1).trim();
  }
  return attributes;
}

function normalizePath(value) {
  if (!value) return '';
  const path = new URL(String(value), 'http://toonlab.invalid').pathname;
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function expectedFilePath(baseUrl, file) {
  return `${normalizePath(baseUrl)}/${file}`;
}

function quaternionMultiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function normalizeQuaternion(quaternion) {
  const length = Math.hypot(...quaternion);
  if (!(length > 0)) throw new Error('Camera quaternion must have non-zero length.');
  return quaternion.map((value) => value / length);
}

// ToonLab exposes Transform.eulerAngles using its documented Z-X-Y application
// order. The combined quaternion is therefore Qy * Qx * Qz.
function quaternionFromToonLabEulerDegrees(rotation) {
  const half = rotation.map((value) => value * Math.PI / 360);
  const qx = [Math.sin(half[0]), 0, 0, Math.cos(half[0])];
  const qy = [0, Math.sin(half[1]), 0, Math.cos(half[1])];
  const qz = [0, 0, Math.sin(half[2]), Math.cos(half[2])];
  return normalizeQuaternion(quaternionMultiply(quaternionMultiply(qy, qx), qz));
}

function quaternionAngularError(a, b) {
  const left = normalizeQuaternion(a);
  const right = normalizeQuaternion(b);
  const dot = Math.min(1, Math.abs(
    left[0] * right[0]
    + left[1] * right[1]
    + left[2] * right[2]
    + left[3] * right[3],
  ));
  return 2 * Math.acos(dot);
}

function maximumAbsoluteDelta(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  return a.reduce(
    (maximum, value, index) => Math.max(maximum, Math.abs(Number(value) - Number(b[index]))),
    0,
  );
}

export function parseToonLabNativeCaptureReport(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new TypeError('A non-empty native ToonLab capture report is required.');
  }
  const fields = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    fields[line.slice(0, separator)] = line.slice(separator + 1);
  }
  const pipeline = parseAttributes(fields.pipeline);
  return Object.freeze({
    scene: fields.scene,
    resolution: Object.freeze(parseResolution(fields.resolution)),
    colorSpace: fields.colorSpace,
    quality: fields.quality,
    camera: Object.freeze({
      name: fields['camera.name'],
      position: Object.freeze(parseTuple(fields['camera.position'], 3, 'camera.position')),
      rotation: Object.freeze(parseTuple(fields['camera.rotation'], 3, 'camera.rotation')),
      fieldOfView: finiteNumber(fields['camera.fieldOfView'], 'camera.fieldOfView'),
      nearClipPlane: finiteNumber(fields['camera.near'], 'camera.near'),
      farClipPlane: finiteNumber(fields['camera.far'], 'camera.far'),
    }),
    pipeline: Object.freeze(pipeline),
  });
}

export function createEnvironmentReferenceComparisonIdentityReport({
  baseUrl = ENVIRONMENT_REFERENCE_CURRENT_COMPARISON_EVIDENCE.baseUrl,
  frameParityReport,
  manifest,
  terrainNativeAuthority,
  nativeCaptureReport,
  nativeImageHeight,
  nativeImageWidth,
  nativeReferenceUrl,
  viewportHeight = ENVIRONMENT_REFERENCE_CURRENT_COMPARISON_EVIDENCE.viewport.height,
  viewportWidth = ENVIRONMENT_REFERENCE_CURRENT_COMPARISON_EVIDENCE.viewport.width,
} = {}) {
  if (!manifest || !frameParityReport) {
    throw new TypeError('manifest and numerical frameParityReport are required.');
  }
  const evidence = ENVIRONMENT_REFERENCE_CURRENT_COMPARISON_EVIDENCE;
  const native = parseToonLabNativeCaptureReport(nativeCaptureReport);
  const cameraRecord = manifest.cameras?.[evidence.cameraIndex];
  const cameraNode = cameraRecord && manifest.nodes?.[cameraRecord.node];
  const terrainRecord = manifest.terrains?.[0];
  const terrainAuthorityRecord = terrainNativeAuthority?.terrains?.[0];
  if (!cameraRecord || !cameraNode) throw new Error('The reconstruction camera record is missing.');

  const resolvedBaseUrl = normalizePath(baseUrl);
  const resources = Object.freeze({
    captureReport: expectedFilePath(resolvedBaseUrl, evidence.files.captureReport.name),
    manifest: expectedFilePath(resolvedBaseUrl, evidence.files.manifest.name),
    terrainNativeAuthority: expectedFilePath(
      resolvedBaseUrl,
      evidence.files.terrainNativeAuthority.name,
    ),
    nativeReference: normalizePath(nativeReferenceUrl),
    reconstructionScene: expectedFilePath(resolvedBaseUrl, manifest.glb),
  });
  const expectedResources = Object.freeze({
    captureReport: expectedFilePath(evidence.baseUrl, evidence.files.captureReport.name),
    manifest: expectedFilePath(evidence.baseUrl, evidence.files.manifest.name),
    terrainNativeAuthority: expectedFilePath(
      evidence.baseUrl,
      evidence.files.terrainNativeAuthority.name,
    ),
    nativeReference: expectedFilePath(evidence.baseUrl, evidence.files.nativeReference.name),
    reconstructionScene: expectedFilePath(
      evidence.baseUrl,
      evidence.files.reconstructionScene.name,
    ),
  });

  const nativeCameraQuaternion = quaternionFromToonLabEulerDegrees(native.camera.rotation);
  const positionError = maximumAbsoluteDelta(native.camera.position, cameraNode.worldPosition);
  const rotationErrorRadians = quaternionAngularError(
    nativeCameraQuaternion,
    cameraNode.worldRotation,
  );
  const projectionError = Math.max(
    Math.abs(native.camera.fieldOfView - Number(cameraRecord.fieldOfView)),
    Math.abs(native.camera.nearClipPlane - Number(cameraRecord.nearClipPlane)),
    Math.abs(native.camera.farClipPlane - Number(cameraRecord.farClipPlane)),
  );

  const gates = Object.freeze({
    immutableBundle: resolvedBaseUrl === evidence.baseUrl
      && Object.keys(expectedResources).every((key) => resources[key] === expectedResources[key]),
    scene: native.scene === manifest.sourceScene
      && manifest.sourceScene === manifest.scenePath
      && manifest.renderSettings?.captureLabel === evidence.captureLabel,
    camera: native.camera.name === cameraRecord.name
      && cameraRecord.name === evidence.cameraName
      && cameraRecord.index === evidence.cameraIndex
      && positionError <= POSITION_TOLERANCE
      && rotationErrorRadians <= ROTATION_TOLERANCE_RADIANS
      && projectionError <= SCALAR_TOLERANCE,
    viewport: native.resolution.width === viewportWidth
      && native.resolution.height === viewportHeight
      && nativeImageWidth === viewportWidth
      && nativeImageHeight === viewportHeight
      && viewportWidth === evidence.viewport.width
      && viewportHeight === evidence.viewport.height,
    profile: native.colorSpace === manifest.renderSettings?.colorSpace
      && native.quality === manifest.renderSettings?.qualityLevel
      && native.pipeline.name === manifest.renderSettings?.pipelineSettings?.asset?.name,
    terrainAuthority: terrainNativeAuthority?.schema
      === 'toonlab.terrain-native-authority'
      && terrainNativeAuthority?.schemaVersion === 1
      && terrainNativeAuthority?.sourceScene === manifest.sourceScene
      && terrainAuthorityRecord?.index === 0
      && terrainAuthorityRecord?.node === terrainRecord?.node
      && terrainAuthorityRecord?.terrainData?.guid === terrainRecord?.terrainData?.guid
      && maximumAbsoluteDelta(terrainAuthorityRecord?.position, terrainRecord?.position)
        <= SCALAR_TOLERANCE
      && terrainAuthorityRecord?.renderTransformAuthority
        === terrainRecord?.renderTransformAuthority
      && terrainAuthorityRecord?.surfaceProbes?.length === terrainRecord?.surfaceProbes?.length
      && terrainAuthorityRecord?.surfaceProbes?.length === 81,
    reconstructionFrame: frameParityReport.exact === true,
  });
  const exact = Object.values(gates).every(Boolean);
  const sceneId = `${manifest.sourceScene}#${manifest.sceneName}`;
  const cameraId = `${manifest.sourceScene}#camera:${cameraRecord.index}:${cameraRecord.name}`;

  return Object.freeze({
    schema: evidence.schema,
    schemaVersion: evidence.schemaVersion,
    exact,
    gates,
    source: Object.freeze({
      baseUrl: resolvedBaseUrl,
      captureLabel: manifest.renderSettings?.captureLabel,
      sceneId,
      cameraId,
    }),
    nativeOracle: Object.freeze({
      role: 'toonlab-native-oracle',
      sceneId,
      cameraId,
      resolution: native.resolution,
      referenceUrl: resources.nativeReference,
    }),
    reconstruction: Object.freeze({
      role: 'toonlab-reconstruction',
      sceneId,
      cameraId,
      resolution: Object.freeze({ width: viewportWidth, height: viewportHeight }),
      sceneUrl: resources.reconstructionScene,
    }),
    errors: Object.freeze({
      cameraPosition: positionError,
      cameraRotationRadians: rotationErrorRadians,
      cameraProjection: projectionError,
      frameProjection: frameParityReport.projection?.maximumError ?? Infinity,
    }),
    resources,
    evidenceHashes: Object.freeze({
      captureReport: evidence.files.captureReport.sha256,
      manifest: evidence.files.manifest.sha256,
      terrainNativeAuthority: evidence.files.terrainNativeAuthority.sha256,
      nativeReference: evidence.files.nativeReference.sha256,
      reconstructionScene: evidence.files.reconstructionScene.sha256,
    }),
    identityKey: [
      manifest.sourceScene,
      `camera:${cameraRecord.index}:${cameraRecord.name}`,
      `frame:${viewportWidth}x${viewportHeight}`,
      manifest.renderSettings?.captureLabel,
    ].join('|'),
  });
}
