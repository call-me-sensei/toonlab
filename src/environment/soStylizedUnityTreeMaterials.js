// Unity-authoritative reconstruction of the plain pine materials used by the
// SnowPines Source Camera 01 foreground trees. The texture bytes are shared
// with the supplied Unreal export, but every connected value and operation in
// this file comes from the supplied Unity 6000.5 / URP 17.5 project.

import * as THREE from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  TBNViewMatrix,
  cameraPosition,
  clamp,
  distance,
  dot,
  float,
  mix,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  normalViewGeometry,
  normalWorld,
  normalize,
  positionLocal,
  positionWorld,
  screenCoordinate,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  vertexColor,
  wgslFn,
} from 'three/tsl';
import { assertSoStylizedUnityTextureUploadReady } from './soStylizedUnityTextureReadiness.js';

import { soStylizedTexturePath as texturePath } from './soStylizedSourceLibrary.js';
import {
  applySoStylizedUnityNormalStrengthNode,
  createSoStylizedUnityNormalIntegrationMetadata,
  decodeSoStylizedUnityNormalNode,
} from './soStylizedUnityNormalIntegration.js';
import { installSoStylizedUnityMaterialPassCoupling } from './soStylizedUnityMaterialPassCoupling.js';
import { installSoStylizedUnityUrpLighting } from './soStylizedUnityUrpLighting.js';

export const SO_STYLIZED_UNITY_PINE_LEAVES = Object.freeze({
  sourceMaterial: 'Environment/Trees/Materials/M_PineLeaves.mat',
  sourceGraph: 'Environment/Trees/Shaders/S_Leaves.shadergraph',
  materialGuid: '225b2c09fcd5feb469c9cbbc3855f533',
  shaderGuid: 'a65bec4bef9f96c4c9dde8ad2a20a99a',
  mainColor: Object.freeze([0.40523082, 0.7264151, 0.065103225]),
  gradientColor: Object.freeze([0.039248843, 0.3962264, 0.08440987]),
  gradientOffset: 0,
  gradientStretch: 1,
  hueVariation: 0.1,
  hueShift: 0,
  emissiveStrength: 0.2,
  sssColor: Object.freeze([0.14117648, 0.48235297, 0.18431373]),
  sssBrightness: 1,
  sssOffset: 0,
  smoothness: 0,
  specularColor: Object.freeze([0, 0, 0]),
  alphaClip: 0.4,
  windIntensity: 1,
  windSpeed: 1,
  windDirection: Object.freeze([1, 0]),
  windScale: 0.6,
});

export const SO_STYLIZED_UNITY_PINE_BARK = Object.freeze({
  sourceMaterial: 'Environment/Trees/Materials/M_PineBark.mat',
  sourceGraph: 'Environment/Trees/Shaders/S_Bark.shadergraph',
  materialGuid: '145e6546446a91447b4358f45984a797',
  shaderGuid: '016550df8fe3d84418b52fbdc767f495',
  emissiveStrength: 0.1,
  normalStrength: 1,
  smoothnessMultiplier: 0.05,
  specularColor: Object.freeze([0, 0, 0]),
  tintMix: 0,
  xScale: 1,
  yScale: 1,
});

const unityTreeSimpleNoise = wgslFn(`
  fn unityTreeSimpleNoise(sourceUv: vec2<f32>, scale: f32) -> f32 {
    var result = 0.0;
    result += unityTreeValueNoise(sourceUv * (scale / 1.0)) * 0.125;
    result += unityTreeValueNoise(sourceUv * (scale / 2.0)) * 0.25;
    result += unityTreeValueNoise(sourceUv * (scale / 4.0)) * 0.5;
    return result;
  }

  fn unityTreeValueNoise(sourceUv: vec2<f32>) -> f32 {
    let cell = floor(sourceUv);
    var weight = fract(sourceUv);
    weight = weight * weight * (vec2<f32>(3.0) - 2.0 * weight);
    let r0 = unityTreeHashTchou(cell);
    let r1 = unityTreeHashTchou(cell + vec2<f32>(1.0, 0.0));
    let r2 = unityTreeHashTchou(cell + vec2<f32>(0.0, 1.0));
    let r3 = unityTreeHashTchou(cell + vec2<f32>(1.0, 1.0));
    return mix(mix(r0, r1, weight.x), mix(r2, r3, weight.x), weight.y);
  }

  fn unityTreeHashTchou(inputValue: vec2<f32>) -> f32 {
    var value = vec2<u32>(vec2<i32>(round(inputValue)));
    value.y = value.y ^ 1103515245u;
    value.x = value.x + value.y;
    value.x = value.x * value.y;
    value.x = value.x ^ (value.x >> 5u);
    value.x = value.x * 668265261u;
    return f32(value.x >> 8u) * (1.0 / f32(0x00ffffffu));
  }
`);

const unityTreeDither = wgslFn(`
  fn unityTreeDither(inputValue: f32, pixelPosition: vec2<f32>) -> f32 {
    let thresholds = array<f32, 16>(
      1.0 / 17.0,  9.0 / 17.0,  3.0 / 17.0, 11.0 / 17.0,
      13.0 / 17.0, 5.0 / 17.0, 15.0 / 17.0,  7.0 / 17.0,
      4.0 / 17.0, 12.0 / 17.0,  2.0 / 17.0, 10.0 / 17.0,
      16.0 / 17.0, 8.0 / 17.0, 14.0 / 17.0,  6.0 / 17.0
    );
    let x = u32(max(floor(pixelPosition.x), 0.0)) % 4u;
    let y = u32(max(floor(pixelPosition.y), 0.0)) % 4u;
    return inputValue - thresholds[x * 4u + y];
  }
`);

// S_Leaves serializes HueNode.m_HueMode=1. In the installed Shader Graph
// package that is HueMode.Normalized: RGB -> HSV, add a 0..1 hue turn, then
// HSV -> RGB. It is not the axis-angle hue rotation used by the Unreal graph.
const unityTreeHueNormalized = wgslFn(`
  fn unityTreeHueNormalized(sourceColor: vec3<f32>, offset: f32) -> vec3<f32> {
    let p = select(
      vec4<f32>(sourceColor.b, sourceColor.g, -1.0, 2.0 / 3.0),
      vec4<f32>(sourceColor.g, sourceColor.b, 0.0, -1.0 / 3.0),
      sourceColor.g >= sourceColor.b
    );
    let q = select(
      vec4<f32>(p.x, p.y, p.w, sourceColor.r),
      vec4<f32>(sourceColor.r, p.y, p.z, p.x),
      sourceColor.r >= p.x
    );
    let difference = q.x - min(q.w, q.y);
    let epsilon = 1e-4;
    let value = select(q.x + epsilon, q.x, difference == 0.0);
    var hue = abs(q.z + (q.w - q.y) / (6.0 * difference + epsilon)) + offset;
    if (hue < 0.0) {
      hue += 1.0;
    } else if (hue > 1.0) {
      hue -= 1.0;
    }
    let saturation = difference / (q.x + epsilon);
    let hueRgb = abs(fract(vec3<f32>(hue) + vec3<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return value * mix(vec3<f32>(1.0), clamp(hueRgb - 1.0, vec3<f32>(0.0), vec3<f32>(1.0)), saturation);
  }
`);

function profileName(profile) {
  return String(profile?.path ?? profile?.name ?? '').split('.').at(-1)?.split('/').at(-1) ?? '';
}

export function isSoStylizedUnityPineLeavesProfile(profile) {
  return profile?.family === 'leaves' && profileName(profile) === 'MI_PineLeaves';
}

export function isSoStylizedUnityPineBarkProfile(profile) {
  return profile?.family === 'bark' && profileName(profile) === 'MI_PineBark';
}

function cloneUnityTexture(source, {
  mipmaps,
  name,
} = {}) {
  const result = source.clone();
  result.name = `SoStylizedUnity:${name ?? source.name}`;
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  result.magFilter = THREE.LinearFilter;
  result.minFilter = mipmaps
    ? THREE.LinearMipmapNearestFilter
    : THREE.LinearFilter;
  result.generateMipmaps = Boolean(mipmaps);
  result.anisotropy = 1;
  result.flipY = false;
  result.userData.soStylizedUnityNormalIntegration = {
    textureFlipY: false,
    uvBridge: 'SnowPines UE glTF V is inverse of the Unity Mega export V',
  };
  result.needsUpdate = true;
  return result;
}

function fractNumber(value) {
  return value - Math.floor(value);
}

function unityPineHueAmount(object = null) {
  const world = new THREE.Vector3();
  if (object?.isObject3D) object.getWorldPosition(world);
  const seedX = world.x * 10;
  const seedY = world.z * 10;
  const random = fractNumber(
    Math.sin(seedX * 12.9898 + seedY * 78.233) * 43758.5453,
  );
  const values = SO_STYLIZED_UNITY_PINE_LEAVES;
  return THREE.MathUtils.lerp(
    -values.hueVariation,
    values.hueVariation,
    random,
  ) + values.hueShift;
}

async function loadRequiredTexture(library, profile, parameterName) {
  const sourcePath = texturePath(profile, parameterName);
  if (!sourcePath) throw new Error(`${profile.path} has no ${parameterName} texture.`);
  // These textures are sampled by geometry imported through GLTFLoader. glTF
  // UVs and images share a top-left origin, so Three's TextureLoader default
  // Y flip would address the opposite half of atlases and cutout maps.
  const result = await library.loadTexture(sourcePath, {
    anisotropy: 1,
    flipY: false,
  });
  if (!result) throw new Error(`Unable to load ${sourcePath}.`);
  assertSoStylizedUnityTextureUploadReady(
    result,
    `Unity pine texture ${sourcePath}`,
  );
  return result;
}

/** Literal connected S_Leaves outputs for M_PineLeaves, adapted to Three's lit bridge. */
export async function buildSoStylizedUnityPineLeavesMaterial(profile, {
  hasUv2 = false,
  hasVertexColors = false,
  library,
  state = null,
} = {}) {
  if (!library) throw new Error('Unity pine leaves require a source library.');
  const values = SO_STYLIZED_UNITY_PINE_LEAVES;
  const leafSource = await loadRequiredTexture(library, profile, 'LeafTexture');
  const leafMap = cloneUnityTexture(leafSource, {
    mipmaps: false,
    name: 'T_Leaf_Pine',
  });
  const leafSample = texture(leafMap).sample(uv());
  const gradientUv = hasUv2 ? uv(2) : uv();
  const gradientAmount = float(1).sub(clamp(
    gradientUv.y.add(values.gradientOffset).mul(values.gradientStretch),
    0,
    1,
  ));
  let colorNode = mix(
    vec3(...values.mainColor),
    vec3(...values.gradientColor),
    gradientAmount,
  );
  const hueAmount = uniform(unityPineHueAmount()).onObjectUpdate(
    ({ object }) => unityPineHueAmount(object),
  );
  colorNode = unityTreeHueNormalized(colorNode, hueAmount);

  const material = new MeshPhysicalNodeMaterial();
  material.side = THREE.DoubleSide;
  material.forceSinglePass = true;
  material.depthTest = true;
  material.depthWrite = true;
  material.colorNode = colorNode;
  material.metalnessNode = float(0);
  material.roughnessNode = float(1 - values.smoothness);
  material.specularColorNode = vec3(...values.specularColor);
  material.specularIntensityNode = float(0);
  // _UseTwoSidedSign=0 selects the unmodified tangent normal instead of the
  // graph's Is Front Face / -1 branch. Supplying the raw geometry normal also
  // prevents Three's default DoubleSide back-face negate from adding a branch
  // Unity did not execute for M_PineLeaves.
  material.normalNode = normalViewGeometry;

  // SG_SSS is connected to Emission, not to an SSS/surface shading model:
  // base * emissive + SSSColor * saturate(V.L * remap(L.-N)).
  const viewDirection = normalize(cameraPosition.sub(positionWorld));
  const lightDirection = normalize(
    // URP's SHADERGRAPH_MAIN_LIGHT_DIRECTION is explicitly
    // `-GetMainLight().direction`: the light's travel/ray direction. The
    // source showcase state stores that same emitted-ray convention.
    state?.uniforms?.sunDirection ?? vec3(0.42, -0.78, 0.46),
  );
  const viewLight = clamp(dot(viewDirection, lightDirection), 0, 1);
  const backLight = dot(lightDirection, normalWorld.negate());
  const remappedBackLight = backLight
    .add(1)
    .mul((2 - values.sssOffset) / 2)
    .add(-1 + values.sssOffset);
  const sssFactor = clamp(viewLight.mul(remappedBackLight), 0, 1);
  material.emissiveNode = colorNode.mul(values.emissiveStrength).add(
    vec3(...values.sssColor).mul(values.sssBrightness).mul(sssFactor),
  );

  // SG_CameraDithering: remap radial fragment distance 2..3 m to 0..1,
  // saturate, multiply by two, then subtract Shader Graph's 4x4 threshold.
  // At Camera 01 distances this is 2-threshold, not a constant one; retaining
  // it materially changes the alpha-cut canopy density.
  const cameraFade = clamp(distance(cameraPosition, positionWorld).sub(2), 0, 1);
  const cameraDither = unityTreeDither(cameraFade.mul(2), screenCoordinate.xy);
  const opacityNode = leafSample.r.mul(cameraDither);

  // Connected S_Leaves vertex graph: deterministic Shader Graph Simple Noise
  // over absolute world XZ, remapped to [-.5,.5], weighted by COLOR.r, then
  // broadcast into XYZ before World -> Object transformation.
  const authoredWorldPosition = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
  const timeNode = state?.uniforms?.time ?? float(0);
  const direction = normalize(vec2(...values.windDirection));
  const windUv = vec2(authoredWorldPosition.x, authoredWorldPosition.z).add(
    direction.mul(timeNode).mul(values.windSpeed),
  );
  const windNoise = unityTreeSimpleNoise(windUv, float(1 / values.windScale));
  const windWeight = hasVertexColors ? vertexColor().r : float(1);
  const windOffset = windNoise.sub(0.5).mul(values.windIntensity).mul(windWeight);
  const displacedWorldPosition = authoredWorldPosition.add(vec3(windOffset));
  const positionNode = modelWorldMatrixInverse
    .mul(vec4(displacedWorldPosition, 1))
    .xyz;
  installSoStylizedUnityMaterialPassCoupling(material, {
    alphaChannel: 'T_Leaf_Pine.r * camera dither',
    alphaNode: opacityNode,
    alphaThreshold: values.alphaClip,
    positionMode: 'deformed',
    positionNode,
    shaderName: 'Shader Graphs/S_Leaves',
  });
  material.userData.soStylizedUnityNormalIntegration =
    createSoStylizedUnityNormalIntegrationMetadata({
      coordinateZSign: 1,
      decode: 'geometry-only',
      family: 'snowpines-ue-gltf-pine-leaves',
      textureFlipY: false,
    });
  installSoStylizedUnityUrpLighting(material, { workflow: 'specular' });

  return {
    contract: Object.freeze({
      alpha: 'T_Leaf_Pine.r * SG_CameraDithering',
      alphaClip: values.alphaClip,
      baseColor: 'lerp(MainColor,GradientColor,1-saturate((UV2.g+Offset)*Stretch))',
      cameraDither: 'Dither(saturate(remap(distance(CameraWS,PositionWS),2,3))*2)',
      emission: 'BaseColor*0.2 + SG_SSS(MainLightDirectionWS,ViewDirectionWS,NormalWS)',
      gradientUv: hasUv2 ? 2 : 0,
      hue: 'ShaderGraph HueMode.Normalized HSV; ObjectPosition.xz*10 RandomRange(-0.1,0.1)',
      lighting: 'URP Universal Lit specular-workflow adapter',
      sampler: 'Bilinear Repeat; mipmaps disabled; anisotropy 1',
      shadingModel: 'UniversalLitSubTarget (custom SG_SSS is emission)',
      smoothness: values.smoothness,
      sourceEngine: 'Unity 6000.5 / URP 17.5',
      sourceGraph: values.sourceGraph,
      sourceMaterial: values.sourceMaterial,
      specularColor: values.specularColor,
      twoSidedNormal: 'UseTwoSidedSign=0; unmodified tangent/geometry normal',
      vertexColor: hasVertexColors ? 'r:wind-weight' : 'absent=>1',
      wind: 'ShaderGraph deterministic Simple Noise; absolute-world XYZ broadcast',
    }),
    material,
    reconstruction: 'unity-s-leaves',
    sourceGraph: values.sourceGraph,
    sourceMaterial: values.sourceMaterial,
  };
}

/** Literal connected S_Bark outputs for M_PineBark, adapted to Three's lit bridge. */
export async function buildSoStylizedUnityPineBarkMaterial(profile, {
  library,
} = {}) {
  if (!library) throw new Error('Unity pine bark requires a source library.');
  const values = SO_STYLIZED_UNITY_PINE_BARK;
  const [diffuseSource, normalSource, smoothnessSource] = await Promise.all([
    loadRequiredTexture(library, profile, 'Diffuse Texture'),
    loadRequiredTexture(library, profile, 'Normal Texture'),
    loadRequiredTexture(library, profile, 'Rough Texture'),
  ]);
  const diffuseMap = cloneUnityTexture(diffuseSource, {
    mipmaps: true,
    name: 'T_PineBark_BC',
  });
  const normalMap = cloneUnityTexture(normalSource, {
    mipmaps: true,
    name: 'T_PineBark_N',
  });
  const smoothnessMap = cloneUnityTexture(smoothnessSource, {
    mipmaps: true,
    name: 'T_PineBark_R',
  });
  const barkUv = uv().mul(vec2(values.xScale, values.yScale));
  const colorNode = texture(diffuseMap).sample(barkUv).rgb;
  const smoothnessNode = texture(smoothnessMap)
    .sample(barkUv)
    .r
    .mul(values.smoothnessMultiplier);

  const material = new MeshPhysicalNodeMaterial();
  material.side = THREE.FrontSide;
  material.depthTest = true;
  material.depthWrite = true;
  material.colorNode = colorNode;
  material.emissiveNode = colorNode.mul(values.emissiveStrength);
  material.metalnessNode = float(0);
  material.roughnessNode = clamp(float(1).sub(smoothnessNode), 0, 1);
  material.specularColorNode = vec3(...values.specularColor);
  material.specularIntensityNode = float(0);
  const decodedNormal = decodeSoStylizedUnityNormalNode(
    texture(normalMap).sample(barkUv).rgb,
    -1,
  );
  material.normalNode = normalize(TBNViewMatrix.mul(
    applySoStylizedUnityNormalStrengthNode(decodedNormal, values.normalStrength),
  ));
  installSoStylizedUnityMaterialPassCoupling(material, {
    positionMode: 'authored',
    positionNode: positionLocal,
    shaderName: 'Shader Graphs/S_Bark',
  });
  material.userData.soStylizedUnityNormalIntegration =
    createSoStylizedUnityNormalIntegrationMetadata({
      coordinateZSign: 1,
      decode: 'RG + importer green transform + reconstructed positive Z; Shader Graph Normal Strength',
      family: 'snowpines-ue-gltf-pine-bark',
      flipGreenChannel: true,
      textureFlipY: false,
    });
  installSoStylizedUnityUrpLighting(material, { workflow: 'specular' });

  return {
    contract: Object.freeze({
      alpha: 'opaque',
      baseColor: 'T_PineBark_BC (TintMix=0)',
      emission: 'BaseColor*0.1',
      lighting: 'URP Universal Lit specular-workflow adapter',
      normal: 'T_PineBark_N; Unity importer flipGreenChannel=1; strength=1',
      sampler: 'Bilinear Repeat + mipmaps; anisotropy 1',
      shadingModel: 'UniversalLitSubTarget',
      smoothness: 'sRGB(T_PineBark_R.r)*0.05',
      sourceEngine: 'Unity 6000.5 / URP 17.5',
      sourceGraph: values.sourceGraph,
      sourceMaterial: values.sourceMaterial,
      specularColor: values.specularColor,
      tint: 'TintMix=0',
      wind: 'none (S_Bark has no connected Vertex Position block)',
    }),
    material,
    reconstruction: 'unity-s-bark',
    sourceGraph: values.sourceGraph,
    sourceMaterial: values.sourceMaterial,
  };
}
