// The sky and cloud implementation used by the accepted outdoor comparison
// stage. Asset locations and authored values come from the stage contract;
// this module only turns that contract into reusable preview scene objects.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs,
  acos,
  cameraPosition,
  clamp,
  dot,
  float,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  waterHash12,
  waterVoronoi2,
} from '../../../src/shaders-tsl/chunks/water-common.js';

const SKY_STYLES = Object.freeze({
  call_me_sensei: Object.freeze({
    cloudOpacity: 1,
    cloudTint: [1, 1, 1],
    skyTint: [1, 1, 1],
  }),
  neutral_review: Object.freeze({
    cloudOpacity: 0.58,
    cloudTint: [0.84, 0.88, 0.94],
    skyTint: [0.82, 0.86, 0.92],
  }),
});

function canonicalReferenceAssetUrl(value) {
  return String(value ?? '').replace(
    '/assets-local/sostylized/',
    '/assets-local/reference-materials/',
  );
}

function failureDetail(error) {
  if (typeof error === 'string' && error) return error;
  if (error?.message) return error.message;
  if (error?.type) return `browser ${error.type} event`;
  if (error?.target?.status) return `HTTP ${error.target.status}`;
  return 'unknown loader failure';
}

async function loadRequiredReferenceAsset(label, sourceUrl, load) {
  const url = canonicalReferenceAssetUrl(sourceUrl);
  if (!url) throw new Error(`${label} URL is missing from the P18 contract.`);
  try {
    return await load(url);
  } catch (error) {
    throw new Error(
      `${label} failed to load from ${url}: ${failureDetail(error)}`,
      { cause: error },
    );
  }
}

function disposeObject(root) {
  root?.traverse?.((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose?.();
  });
}

export async function createP18PreviewReferenceSky(contract) {
  const source = contract.sky;
  if (!source?.visible) return null;

  const [
    skyGltf,
    skyAtlas,
    backgroundCloudMap,
    cloudGltf,
    cloudMap,
    cloudAtlas,
  ] = await Promise.all([
    loadRequiredReferenceAsset(
      'P18 sky-dome mesh',
      source.mesh,
      (url) => new GLTFLoader().loadAsync(url),
    ),
    loadRequiredReferenceAsset(
      'P18 sky color atlas',
      source.atlas,
      (url) => new EXRLoader().loadAsync(url),
    ),
    source.backgroundClouds
      ? loadRequiredReferenceAsset(
        'P18 background-cloud texture',
        source.backgroundCloudTexture,
        (url) => new THREE.TextureLoader().loadAsync(url),
      )
      : Promise.resolve(null),
    source.cloudShell
      ? loadRequiredReferenceAsset(
        'P18 cloud-shell mesh',
        source.cloudShellMesh,
        (url) => new GLTFLoader().loadAsync(url),
      )
      : Promise.resolve(null),
    source.cloudShell
      ? loadRequiredReferenceAsset(
        'P18 cloud-shell texture',
        source.cloudShellTexture,
        (url) => new THREE.TextureLoader().loadAsync(url),
      )
      : Promise.resolve(null),
    source.cloudShell
      ? loadRequiredReferenceAsset(
        'P18 cloud color atlas',
        source.cloudShellAtlas,
        (url) => new EXRLoader().loadAsync(url),
      )
      : Promise.resolve(null),
  ]);

  skyAtlas.colorSpace = THREE.NoColorSpace;
  skyAtlas.flipY = false;
  skyAtlas.wrapS = THREE.ClampToEdgeWrapping;
  skyAtlas.wrapT = THREE.ClampToEdgeWrapping;
  skyAtlas.minFilter = THREE.LinearFilter;
  skyAtlas.magFilter = THREE.LinearFilter;
  skyAtlas.generateMipmaps = false;
  skyAtlas.needsUpdate = true;

  if (backgroundCloudMap) {
    backgroundCloudMap.colorSpace = THREE.SRGBColorSpace;
    backgroundCloudMap.flipY = false;
    backgroundCloudMap.wrapS = THREE.RepeatWrapping;
    backgroundCloudMap.wrapT = THREE.RepeatWrapping;
    backgroundCloudMap.minFilter = THREE.LinearMipmapLinearFilter;
    backgroundCloudMap.magFilter = THREE.LinearFilter;
    backgroundCloudMap.anisotropy = 8;
    backgroundCloudMap.needsUpdate = true;
  }
  if (cloudMap) {
    cloudMap.colorSpace = THREE.SRGBColorSpace;
    cloudMap.flipY = false;
    cloudMap.wrapS = THREE.RepeatWrapping;
    cloudMap.wrapT = THREE.ClampToEdgeWrapping;
    cloudMap.minFilter = THREE.LinearMipmapLinearFilter;
    cloudMap.magFilter = THREE.LinearFilter;
    cloudMap.anisotropy = 8;
    cloudMap.needsUpdate = true;
  }
  if (cloudAtlas) {
    cloudAtlas.colorSpace = THREE.NoColorSpace;
    cloudAtlas.flipY = false;
    cloudAtlas.wrapS = THREE.ClampToEdgeWrapping;
    cloudAtlas.wrapT = THREE.ClampToEdgeWrapping;
    cloudAtlas.minFilter = THREE.LinearFilter;
    cloudAtlas.magFilter = THREE.LinearFilter;
    cloudAtlas.generateMipmaps = false;
    cloudAtlas.needsUpdate = true;
  }

  const timeEnergy = uniform(1);
  const timeTint = uniform(new THREE.Vector3(1, 1, 1));
  const skyStyleTint = uniform(new THREE.Vector3(1, 1, 1));
  const cloudStyleTint = uniform(new THREE.Vector3(1, 1, 1));
  const cloudStyleOpacity = uniform(1);
  const cloudVisibility = uniform(1);
  const cloudClock = uniform(0);
  const backgroundCloudStrength = uniform(source.backgroundCloudStrength ?? 0);
  const backgroundCloudOpacity = uniform(1);
  const backgroundCloudTint = uniform(
    new THREE.Vector3(...(source.backgroundCloudTint?.slice(0, 3) ?? [1, 1, 1])),
  );
  const backgroundCloudVerticalOffset = uniform(
    source.backgroundCloudVerticalOffset ?? 0,
  );
  const backgroundCloudVerticalStretch = uniform(
    source.backgroundCloudVerticalStretch ?? 1,
  );
  const cloudShellStrength = uniform(source.cloudShellStrength ?? 1);
  const cloudShellOpacity = uniform(1);
  const cloudShellCoverage = uniform(0);
  const cloudShellEdgeContrast = uniform(1);
  const cloudShellHorizontalOffset = uniform(
    (source.cloudShellRotationSpeed ?? 0)
      * (source.cloudShellDeterministicTime ?? 0),
  );
  const cloudShellHorizontalScale = uniform(1);
  const cloudShellVerticalOffset = uniform(source.cloudShellVerticalOffset ?? 0);
  const cloudShellVerticalStretch = uniform(source.cloudShellVerticalStretch ?? 1);
  const cloudShellTint = uniform(new THREE.Vector3(1, 1, 1));
  const cloudShellRotationSpeed = uniform(source.cloudShellRotationSpeed ?? 0);
  const cloudShellMotionScale = uniform(1);
  const atlasBrightness = uniform(1);
  const atlasSaturation = uniform(1);
  const atlasContrast = uniform(1);
  const atlasSampleOffset = uniform(0);
  const atlasSampleScale = uniform(1);
  const skyTint = uniform(new THREE.Vector3(1, 1, 1));
  const zenithTint = uniform(new THREE.Vector3(1, 1, 1));
  const horizonTint = uniform(new THREE.Vector3(1, 1, 1));
  const belowHorizonTint = uniform(new THREE.Vector3(1, 1, 1));
  const horizonPosition = uniform(0.5);
  const horizonBlend = uniform(0.18);
  const horizonGlowColor = uniform(new THREE.Vector3(1, 0.72, 0.5));
  const horizonGlowStrength = uniform(0);
  const horizonGlowWidth = uniform(0.12);
  const horizonGlowFocus = uniform(5);
  const sunColor = uniform(new THREE.Vector3(1, 0.96, 0.86));
  const sunDiscSize = uniform(0.026);
  const sunDiscSoftness = uniform(0.28);
  const sunDiscIntensity = uniform(1.8);
  const sunGlowColor = uniform(new THREE.Vector3(1, 0.82, 0.62));
  const sunGlowStrength = uniform(0.45);
  const sunGlowSpread = uniform(5);
  const sunGlowCoreStrength = uniform(0.45);
  const sunGlowCoreSharpness = uniform(64);
  const moonColor = uniform(new THREE.Vector3(0.76, 0.86, 1));
  const moonDiscSize = uniform(0.022);
  const moonDiscSoftness = uniform(0.32);
  const moonDiscIntensity = uniform(1.25);
  const moonGlowColor = uniform(new THREE.Vector3(0.45, 0.62, 1));
  const moonGlowStrength = uniform(0.32);
  const moonGlowSpread = uniform(7);
  const starsColor = uniform(new THREE.Vector3(0.82, 0.9, 1));
  const starsStrength = uniform(1);
  const starsSeed = uniform(173);
  const starsDensity = uniform(0.34);
  const starsScale = uniform(18);
  const starsSize = uniform(0.045);
  const starsTwinkleStrength = uniform(0.35);
  const starsTwinkleSpeed = uniform(0.8);
  const starsHorizonFade = uniform(0.2);
  const celestialDirection = uniform(new THREE.Vector3(0.2, 0.9, 0.35).normalize());
  const sunVisibility = uniform(1);
  const moonVisibility = uniform(0);
  const starsVisibility = uniform(0);

  const skyShaderUniforms = Object.freeze({
    atlasBrightness,
    atlasContrast,
    atlasSampleOffset,
    atlasSampleScale,
    atlasSaturation,
    belowHorizonTint,
    horizonBlend,
    horizonGlowColor,
    horizonGlowFocus,
    horizonGlowStrength,
    horizonGlowWidth,
    horizonPosition,
    horizonTint,
    moonColor,
    moonDiscIntensity,
    moonDiscSize,
    moonDiscSoftness,
    moonGlowColor,
    moonGlowSpread,
    moonGlowStrength,
    skyTint,
    starsColor,
    starsDensity,
    starsHorizonFade,
    starsScale,
    starsSeed,
    starsSize,
    starsStrength,
    starsTwinkleSpeed,
    starsTwinkleStrength,
    sunColor,
    sunDiscIntensity,
    sunDiscSize,
    sunDiscSoftness,
    sunGlowColor,
    sunGlowCoreSharpness,
    sunGlowCoreStrength,
    sunGlowSpread,
    sunGlowStrength,
    zenithTint,
  });

  const curveTime = clamp(float(1).sub(uv().y), 0, 1);
  const sampledCurveTime = clamp(
    curveTime
      .sub(0.5)
      .mul(atlasSampleScale)
      .add(0.5)
      .add(atlasSampleOffset),
    0,
    1,
  );
  const sampleU = sampledCurveTime
    .mul(source.atlasWidth - 1)
    .add(0.5)
    .div(source.atlasWidth);
  const sampleV = float(1 - ((source.curveRow + 0.5) / source.atlasHeight));
  const sourceSkyGradient = texture(skyAtlas)
    .sample(vec2(sampleU, sampleV))
    .rgb
    .mul(source.brightness)
    .mul(atlasBrightness);
  const skyLuminance = dot(
    sourceSkyGradient,
    vec3(0.2126, 0.7152, 0.0722),
  );
  const gradedSky = clamp(
    mix(vec3(skyLuminance), sourceSkyGradient, atlasSaturation)
      .sub(0.5)
      .mul(atlasContrast)
      .add(0.5),
    0,
    8,
  );
  const horizonDistance = abs(curveTime.sub(horizonPosition));
  const horizonWeight = smoothstep(0, horizonBlend, horizonDistance).oneMinus();
  const zenithWeight = smoothstep(
    horizonPosition.add(horizonBlend),
    1,
    curveTime,
  );
  const belowHorizonWeight = smoothstep(
    0,
    max(horizonPosition.sub(horizonBlend), 0.001),
    curveTime,
  ).oneMinus();
  const regionTint = mix(vec3(1), horizonTint, horizonWeight)
    .mul(mix(vec3(1), zenithTint, zenithWeight))
    .mul(mix(vec3(1), belowHorizonTint, belowHorizonWeight));
  const viewDirection = normalize(positionWorld.sub(cameraPosition));
  const sunCosine = dot(viewDirection, celestialDirection);
  const moonCosine = dot(viewDirection, celestialDirection.negate());
  const sunward = pow(
    clamp(sunCosine.mul(0.5).add(0.5), 0, 1),
    horizonGlowFocus,
  );
  const horizonGlow = horizonGlowColor
    .mul(horizonWeight)
    .mul(sunward)
    .mul(horizonGlowStrength)
    .mul(smoothstep(0, horizonGlowWidth, horizonDistance).oneMinus());

  const safeSunSize = max(sunDiscSize, 0.00001);
  const sunAngle = acos(clamp(sunCosine, -1, 1));
  const sunDisc = smoothstep(
    safeSunSize.mul(sunDiscSoftness.oneMinus()),
    safeSunSize,
    sunAngle,
  )
    .oneMinus()
    .mul(step(0.00001, sunDiscSize))
    .mul(sunVisibility);
  const sunGlow = pow(max(sunCosine, 0), sunGlowSpread)
    .add(
      pow(max(sunCosine, 0), sunGlowCoreSharpness)
        .mul(sunGlowCoreStrength),
    )
    .mul(sunGlowStrength)
    .mul(sunVisibility);

  const safeMoonSize = max(moonDiscSize, 0.00001);
  const moonAngle = acos(clamp(moonCosine, -1, 1));
  const moonDisc = smoothstep(
    safeMoonSize.mul(moonDiscSoftness.oneMinus()),
    safeMoonSize,
    moonAngle,
  )
    .oneMinus()
    .mul(step(0.00001, moonDiscSize))
    .mul(moonVisibility);
  const moonGlow = pow(max(moonCosine, 0), moonGlowSpread)
    .mul(moonGlowStrength)
    .mul(moonVisibility);

  const baseSkyGradient = gradedSky
    .mul(regionTint)
    .mul(skyTint)
    .mul(timeEnergy)
    .mul(timeTint)
    .mul(skyStyleTint)
    .add(horizonGlow)
    .add(sunColor.mul(sunDisc).mul(sunDiscIntensity))
    .add(sunGlowColor.mul(sunGlow))
    .add(moonColor.mul(moonDisc).mul(moonDiscIntensity))
    .add(moonGlowColor.mul(moonGlow));
  const starUv = viewDirection.xz
    .div(abs(viewDirection.y).add(0.28))
    .mul(starsScale)
    .add(vec2(starsSeed.mul(1.37), starsSeed.mul(2.11)));
  const starVoro = waterVoronoi2(starUv);
  const starRandom = waterHash12(starVoro.zw);
  const twinkleAmount = starsTwinkleStrength.mul(0.5);
  const twinkle = cloudClock
    .mul(starsTwinkleSpeed)
    .mul(starRandom.mul(2.4).add(1.2))
    .add(starRandom.mul(31))
    .sin()
    .mul(twinkleAmount)
    .add(float(1).sub(twinkleAmount));
  const star = smoothstep(0, starsSize, starVoro.x)
    .oneMinus()
    .mul(step(starsDensity.oneMinus(), starRandom));
  const skyGradient = baseSkyGradient.add(
    starsColor
      .mul(star)
      .mul(twinkle)
      .mul(starsStrength)
      .mul(starsVisibility)
      .mul(smoothstep(0.01, starsHorizonFade, viewDirection.y)),
  );

  const skyMaterial = new MeshBasicNodeMaterial();
  skyMaterial.name = 'Rock Lab reference sky';
  skyMaterial.side = THREE.FrontSide;
  skyMaterial.depthTest = true;
  skyMaterial.depthWrite = false;
  skyMaterial.fog = true;
  if (backgroundCloudMap) {
    const cloudUv = uv()
      .sub(vec2(0.5, 0.5))
      .div(vec2(1, backgroundCloudVerticalStretch))
      .add(vec2(0.5, 0.5))
      .add(vec2(0, backgroundCloudVerticalOffset));
    const cloudMask = texture(backgroundCloudMap).sample(cloudUv).r;
    const backgroundCloud = vec3(cloudMask)
      .mul(backgroundCloudTint)
      .mul(timeTint)
      .mul(timeEnergy)
      .mul(cloudStyleTint)
      .mul(backgroundCloudOpacity)
      .mul(cloudStyleOpacity)
      .mul(cloudVisibility);
    const screened = vec3(1).sub(
      vec3(1).sub(backgroundCloud).mul(vec3(1).sub(skyGradient)),
    );
    skyMaterial.colorNode = mix(
      skyGradient,
      screened,
      backgroundCloudStrength,
    );
  } else {
    skyMaterial.colorNode = skyGradient;
  }

  const skyRoot = skyGltf.scene;
  const skySphere = new THREE.Box3()
    .setFromObject(skyRoot)
    .getBoundingSphere(new THREE.Sphere());
  const skyScale = (source.skySourceComponentScale?.[0]
    ?? source.sourceScale?.[0]
    ?? 100) * (source.skySourceUnitsToMeters ?? 0.01);
  skyRoot.scale.multiplyScalar(skyScale);
  skyRoot.name = 'Rock Lab reference sky dome';
  skyRoot.traverse((object) => {
    if (!object.isMesh) return;
    object.material?.dispose?.();
    object.material = skyMaterial;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
    object.renderOrder = -1000;
  });

  const root = new THREE.Group();
  root.name = 'Rock Lab reference sky and clouds';
  root.rotation.y = THREE.MathUtils.degToRad(
    source.toonlabUeGltfBasisYawDegrees ?? 0,
  );
  root.add(skyRoot);

  let cloudMaterial = null;
  let cloudRoot = null;
  if (source.cloudShell && cloudGltf && cloudMap && cloudAtlas) {
    const centeredUv = uv()
      .add(vec2(
        cloudShellHorizontalOffset
          .add(cloudClock.mul(cloudShellRotationSpeed).mul(cloudShellMotionScale)),
        cloudShellVerticalOffset,
      ))
      .sub(vec2(0.5, 0.5))
      .div(vec2(cloudShellHorizontalScale, cloudShellVerticalStretch))
      .add(vec2(0.5, 0.5));
    const cloudSample = texture(cloudMap).sample(centeredUv);
    const cloudCurveU = cloudSample.r
      .mul(source.cloudShellAtlasWidth - 1)
      .add(0.5)
      .div(source.cloudShellAtlasWidth);
    const cloudCurveV = float(
      1 - ((source.cloudShellCurveRow + 0.5) / source.cloudShellAtlasHeight),
    );
    const cloudColor = texture(cloudAtlas)
      .sample(vec2(cloudCurveU, cloudCurveV))
      .rgb
      .mul(cloudShellStrength)
      .mul(timeEnergy)
      .mul(timeTint)
      .mul(cloudStyleTint)
      .mul(cloudShellTint);
    const cloudMask = pow(
      clamp(cloudSample.a.add(cloudShellCoverage), 0, 1),
      cloudShellEdgeContrast,
    );

    cloudMaterial = new MeshBasicNodeMaterial();
    cloudMaterial.name = 'Rock Lab reference cloud shell';
    cloudMaterial.colorNode = cloudColor;
    cloudMaterial.opacityNode = cloudMask
      .mul(cloudShellOpacity)
      .mul(cloudStyleOpacity)
      .mul(cloudVisibility);
    cloudMaterial.alphaTestNode = float(0);
    cloudMaterial.transparent = true;
    cloudMaterial.alphaToCoverage = false;
    cloudMaterial.depthTest = true;
    cloudMaterial.depthWrite = false;
    cloudMaterial.side = THREE.FrontSide;
    cloudMaterial.fog = true;

    cloudRoot = cloudGltf.scene;
    const cloudScale = (source.cloudShellSourceComponentScale?.[0] ?? 1)
      * (source.cloudShellGltfUnitsToMeters ?? 1);
    cloudRoot.scale.multiplyScalar(cloudScale);
    cloudRoot.name = 'Rock Lab reference cloud dome';
    cloudRoot.traverse((object) => {
      if (!object.isMesh) return;
      object.material?.dispose?.();
      object.material = cloudMaterial;
      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = false;
      object.renderOrder = -999;
    });
    root.add(cloudRoot);
  }

  root.userData.referenceSky = {
    sourceRadius: skySphere.radius,
    targetRadius: skySphere.radius * skyScale,
  };
  root.updateMatrixWorld(true);

  return {
    cloudRoot,
    root,
    skyRoot,
    getVisibleCelestialDirection() {
      const direction = celestialDirection.value.clone();
      return moonVisibility.value > sunVisibility.value
        ? direction.negate()
        : direction;
    },
    applySkyShaderSettings(settings = {}) {
      for (const [key, target] of Object.entries(skyShaderUniforms)) {
        const value = settings[key];
        if (Array.isArray(value) && target.value?.fromArray) {
          target.value.fromArray(value);
        } else if (Number.isFinite(value)) {
          target.value = value;
        }
      }
    },
    applyCloudShaderSettings(settings = {}) {
      if (Number.isFinite(settings.backgroundCloudStrength)) {
        backgroundCloudStrength.value = settings.backgroundCloudStrength;
      }
      if (Number.isFinite(settings.backgroundCloudOpacity)) {
        backgroundCloudOpacity.value = settings.backgroundCloudOpacity;
      }
      if (Array.isArray(settings.backgroundCloudTint)) {
        backgroundCloudTint.value.fromArray(settings.backgroundCloudTint);
      }
      if (Number.isFinite(settings.backgroundCloudVerticalOffset)) {
        backgroundCloudVerticalOffset.value = settings.backgroundCloudVerticalOffset;
      }
      if (Number.isFinite(settings.backgroundCloudVerticalStretch)) {
        backgroundCloudVerticalStretch.value = settings.backgroundCloudVerticalStretch;
      }
      if (Number.isFinite(settings.cloudShellStrength)) {
        cloudShellStrength.value = settings.cloudShellStrength;
      }
      if (Number.isFinite(settings.cloudShellOpacity)) {
        cloudShellOpacity.value = settings.cloudShellOpacity;
      }
      if (Number.isFinite(settings.cloudShellCoverage)) {
        cloudShellCoverage.value = settings.cloudShellCoverage;
      }
      if (Number.isFinite(settings.cloudShellEdgeContrast)) {
        cloudShellEdgeContrast.value = settings.cloudShellEdgeContrast;
      }
      if (Number.isFinite(settings.cloudShellHorizontalOffset)) {
        cloudShellHorizontalOffset.value = settings.cloudShellHorizontalOffset;
      }
      if (Number.isFinite(settings.cloudShellHorizontalScale)) {
        cloudShellHorizontalScale.value = settings.cloudShellHorizontalScale;
      }
      if (Number.isFinite(settings.cloudShellVerticalOffset)) {
        cloudShellVerticalOffset.value = settings.cloudShellVerticalOffset;
      }
      if (Number.isFinite(settings.cloudShellVerticalStretch)) {
        cloudShellVerticalStretch.value = settings.cloudShellVerticalStretch;
      }
      if (Array.isArray(settings.cloudShellTint)) {
        cloudShellTint.value.fromArray(settings.cloudShellTint);
      }
      if (Number.isFinite(settings.cloudShellRotationSpeed)) {
        cloudShellRotationSpeed.value = settings.cloudShellRotationSpeed;
      }
      if (Number.isFinite(settings.cloudShellMotionScale)) {
        cloudShellMotionScale.value = settings.cloudShellMotionScale;
      }
    },
    setComponentStyles({ clouds = 'call_me_sensei', sky = 'call_me_sensei' } = {}) {
      const skyStyle = SKY_STYLES[sky] ?? SKY_STYLES.call_me_sensei;
      const cloudsStyle = SKY_STYLES[clouds] ?? SKY_STYLES.call_me_sensei;
      skyStyleTint.value.fromArray(skyStyle.skyTint);
      cloudStyleTint.value.fromArray(cloudsStyle.cloudTint);
      cloudStyleOpacity.value = cloudsStyle.cloudOpacity;
    },
    setTime({ energy = 1, hour = null, tint = [1, 1, 1] } = {}) {
      timeEnergy.value = energy;
      timeTint.value.fromArray(tint);
      if (Number.isFinite(hour)) {
        const normalizedHour = ((Number(hour) % 24) + 24) % 24;
        const phase = ((normalizedHour - 6) / 12) * Math.PI;
        const elevation = Math.sin(phase);
        const horizontal = Math.sqrt(Math.max(0, 1 - (elevation * elevation)));
        const azimuth = ((normalizedHour - 6) / 24) * Math.PI * 2
          + THREE.MathUtils.degToRad(28);
        celestialDirection.value.set(
          Math.cos(azimuth) * horizontal,
          elevation,
          Math.sin(azimuth) * horizontal,
        ).normalize();
        sunVisibility.value = THREE.MathUtils.smoothstep(elevation, -0.08, 0.08);
        moonVisibility.value = THREE.MathUtils.smoothstep(-elevation, 0.02, 0.28);
        starsVisibility.value = THREE.MathUtils.smoothstep(-elevation, 0.04, 0.38);
      }
    },
    setVisibility({ clouds = true, sky = true } = {}) {
      skyRoot.visible = Boolean(sky);
      if (cloudRoot) cloudRoot.visible = Boolean(clouds);
      cloudVisibility.value = clouds ? 1 : 0;
    },
    update(delta = 0) {
      cloudClock.value += Math.max(0, Math.min(Number(delta) || 0, 0.1));
    },
    dispose() {
      disposeObject(root);
      skyMaterial.dispose();
      cloudMaterial?.dispose();
      skyAtlas.dispose();
      backgroundCloudMap?.dispose();
      cloudMap?.dispose();
      cloudAtlas?.dispose();
    },
  };
}
