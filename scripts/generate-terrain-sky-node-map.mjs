#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const SOURCE_PATH = resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'material-audit.json',
);
const OUTPUT_PATH = resolve(
  ROOT_DIR,
  'docs',
  'source-shader-audits',
  'terrain-sky-node-map.json',
);

const ROOT_GRAPHS = [
  '/Game/SoStylized/Environment/Landscape/Materials/M_Landscape.M_Landscape',
  '/Game/SoStylized/Environment/Misc/Materials/M_Snow.M_Snow',
  '/Game/SoStylized/Environment/Sky/Materials/M_StylizedClouds_Lite.M_StylizedClouds_Lite',
  '/Game/SoStylized/Environment/Sky/Materials/M_StylizedSky_Lite.M_StylizedSky_Lite',
];

const REQUIRED_FUNCTIONS = [
  '/Game/SoStylized/Environment/Landscape/Materials/MF_WindColor.MF_WindColor',
  '/Game/SoStylized/Environment/Rocks/Materials/MF_Rock.MF_Rock',
  '/Game/SoStylized/Environment/Sky/Materials/MF_RainWetness.MF_RainWetness',
  '/Game/SoStylized/Materials/MF_DesertDirt.MF_DesertDirt',
  '/Game/SoStylized/Materials/MF_DesertGrass.MF_DesertGrass',
  '/Game/SoStylized/Materials/MF_DesertSand.MF_DesertSand',
  '/Game/SoStylized/Materials/MF_Grass.MF_Grass',
  '/Game/SoStylized/Materials/MF_Snow.MF_Snow',
  '/Game/SoStylized/Materials/MF_Sparkle.MF_Sparkle',
];

const COORDINATE_ROOTS = Object.freeze({
  MaterialExpressionCameraVectorWS: 'UE camera-to-pixel world vector',
  MaterialExpressionLandscapeLayerCoords: 'Landscape-local quad coordinates',
  MaterialExpressionPerInstanceFadeAmount: 'UE per-instance view fade',
  MaterialExpressionPixelDepth: 'UE view-axis pixel depth (cm)',
  MaterialExpressionPixelNormalWS: 'UE pixel world normal (Z-up)',
  MaterialExpressionReflectionVectorWS: 'UE world reflection vector',
  MaterialExpressionTextureCoordinate: 'mesh UV channel selected by CoordinateIndex',
  MaterialExpressionTime: 'UE material time (seconds)',
  MaterialExpressionVertexColor: 'mesh vertex color',
  MaterialExpressionVertexNormalWS: 'UE vertex world normal (Z-up)',
  MaterialExpressionWorldPosition: 'absolute UE world position (cm, Z-up)',
});

const CLASS_MAPPINGS = Object.freeze({
  MaterialExpressionAbs: ['translated-primitive', 'abs(x)', null],
  MaterialExpressionAdd: ['translated-primitive', 'a.add(b)', null],
  MaterialExpressionBlendMaterialAttributes: [
    'translated-primitive',
    'blend each surface field with mix(a,b,alpha)',
    'Normal is renormalized after field-wise blending.',
  ],
  MaterialExpressionCameraVectorWS: [
    'coordinate-bridge',
    'normalize(cameraPosition.sub(positionWorld)) with UE/Three axis convention',
    'Direction sign is documented at the conversion boundary.',
  ],
  MaterialExpressionClamp: ['translated-primitive', 'clamp(x,min,max)', null],
  MaterialExpressionCollectionParameter: [
    'data-bridge',
    'SoStylizedSourceEnvironmentState uniform',
    'MPC values are explicit browser uniforms rather than a UE parameter collection.',
  ],
  MaterialExpressionComponentMask: ['translated-primitive', 'node.<selected channels>', null],
  MaterialExpressionConstant: ['translated-primitive', 'float(value)', null],
  MaterialExpressionConstant3Vector: ['translated-primitive', 'vec3(value)', null],
  MaterialExpressionCurveAtlasRowParameter: [
    'data-bridge',
    'library.createCurveTexture(row) then texture.sample(curveTime)',
    'Export currently reconstructs rows from curve samples; actual 256-texel atlas rows remain a precision bridge.',
  ],
  MaterialExpressionDesaturation: [
    'translated-primitive',
    'sourceDesaturate(color,fraction)',
    'Uses SnowPines r.LegacyLuminanceFactors=1 weights 0.30/0.59/0.11.',
  ],
  MaterialExpressionDivide: ['translated-primitive', 'a.div(b)', null],
  MaterialExpressionDotProduct: ['translated-primitive', 'dot(a,b)', null],
  MaterialExpressionFloor: ['translated-primitive', 'floor(x)', null],
  MaterialExpressionFmod: ['translated-primitive', 'mod(a,b)', 'TSL mod follows shader modulo semantics.'],
  MaterialExpressionFrac: ['translated-primitive', 'fract(x)', null],
  MaterialExpressionFresnel: [
    'translated-primitive',
    'pow(clamp(1-dot(normal,cameraVector),0,1), exponent)',
    'BaseReflectFractionIn is retained when connected.',
  ],
  MaterialExpressionFunctionInput: ['graph-plumbing', 'JavaScript/TSL helper argument', null],
  MaterialExpressionFunctionOutput: ['graph-plumbing', 'JavaScript/TSL helper return field', null],
  MaterialExpressionGetMaterialAttributes: ['graph-plumbing', 'surface.<attribute>', null],
  MaterialExpressionIf: [
    'translated-primitive',
    'select/step comparison preserving A>B, A==B, A<B branches',
    'Equality behavior must not be collapsed to one step when the equality input differs.',
  ],
  MaterialExpressionLandscapeGrassOutput: [
    'separate-runtime-bridge',
    'ground-field semantic output, not visible PBR material',
    'Procedural LandscapeGrass spawning is outside the surface shader.',
  ],
  MaterialExpressionLandscapeLayerBlend: [
    'translated-source-algorithm',
    'height/weight modification then normalize all ten non-alpha weights together',
    'Implemented from UE 5.8 MaterialExpressionLandscapeLayerBlend.cpp and the exact exported masks.',
  ],
  MaterialExpressionLandscapeLayerCoords: [
    'coordinate-bridge',
    'landscapeLayerCoordinates(sourceAssetName, weightManifest)',
    'Maps UE actor origin/quad scale to Three world X/-Z.',
  ],
  MaterialExpressionLandscapeLayerSample: [
    'data-bridge',
    'sample exact linear authored layer channel at texel-centered Landscape UV',
    'Ten R8 masks are losslessly bound through three RGBA runtime packs.',
  ],
  MaterialExpressionLandscapeVisibilityMask: [
    'explicit-gap',
    'no connected browser hole/visibility payload',
    'The supplied glTF/export does not carry a Landscape visibility mask; SnowPines appears uncut in the staged area.',
  ],
  MaterialExpressionLinearInterpolate: ['translated-primitive', 'mix(a,b,alpha)', null],
  MaterialExpressionMaterialFunctionCall: [
    'function-bridge',
    'named helper or explicit inline source graph',
    'See each node functionBridge field for the exact target or gap.',
  ],
  MaterialExpressionMaterialXRemap: [
    'translated-primitive',
    'linearRemap(value,inLow,inHigh,outLow,outHigh)',
    'Remap is unclamped unless followed by a Saturate node.',
  ],
  MaterialExpressionMaterialXScreen: ['translated-primitive', 'sourceScreen(base,blend)', null],
  MaterialExpressionMultiply: ['translated-primitive', 'a.mul(b)', null],
  MaterialExpressionNamedRerouteDeclaration: ['graph-plumbing', 'named JavaScript/TSL local', null],
  MaterialExpressionNamedRerouteUsage: ['graph-plumbing', 'reference named JavaScript/TSL local', null],
  MaterialExpressionNormalize: ['translated-primitive', 'normalize(x)', null],
  MaterialExpressionOneMinus: ['translated-primitive', 'float(1).sub(x)', null],
  MaterialExpressionPanner: [
    'translated-primitive',
    'uv.add(vec2(speedX,speedY).mul(materialTime))',
    'Fractional-part behavior is retained only where the source node enables it.',
  ],
  MaterialExpressionPerInstanceFadeAmount: [
    'explicit-gap',
    'no exact UE foliage-instance fade semantic in Three material',
    'Not an active Landscape/SnowPines terrain branch in the fixed source still.',
  ],
  MaterialExpressionPixelDepth: ['coordinate-bridge', 'sourcePixelDepthCm()', 'Three metres are converted to UE centimetres.'],
  MaterialExpressionPixelNormalWS: [
    'coordinate-bridge',
    'normalWorld / translated mapped normal',
    'UE Z-up becomes Three Y-up.',
  ],
  MaterialExpressionPower: ['translated-primitive', 'pow(base,exponent)', null],
  MaterialExpressionReflectionVectorWS: [
    'renderer-bridge',
    'reflect(-cameraVector, normalWorld)',
    'Reflection/environment convolution differs between UE and Three/WebGPU.',
  ],
  MaterialExpressionReroute: ['graph-plumbing', 'inline node reference', null],
  MaterialExpressionRotator: ['translated-primitive', 'rotateSourceUv(uv,turns,center)', null],
  MaterialExpressionRuntimeVirtualTextureOutput: [
    'separate-runtime-bridge',
    'environment ground-field output',
    'UE RVT BaseColor/Normal/WorldHeight and semantic grass coverage are stored outside the visible material.',
  ],
  MaterialExpressionSaturate: ['translated-primitive', 'clamp(x,0,1)', null],
  MaterialExpressionScalarParameter: ['data-bridge', 'scalar(profile,name,default)', null],
  MaterialExpressionSetMaterialAttributes: ['graph-plumbing', 'surface attribute object', null],
  MaterialExpressionStaticSwitchParameter: [
    'data-bridge',
    'switchValue(profile,name,default) JavaScript graph specialization',
    'Matches the resolved material-instance static switch before TSL compilation.',
  ],
  MaterialExpressionSubtract: ['translated-primitive', 'a.sub(b)', null],
  MaterialExpressionTextureCoordinate: ['coordinate-bridge', 'uv(index)', 'glTF UV availability is recorded per mesh.'],
  MaterialExpressionTextureObject: ['data-bridge', 'library.loadTexture(authored path)', null],
  MaterialExpressionTextureObjectParameter: ['data-bridge', 'loadProfileTextures parameter binding', null],
  MaterialExpressionTextureSample: [
    'data-bridge',
    'texture(map).sample(coordinates).<channel>',
    'Authored sRGB/linear, wrap, filter, and flip metadata are applied by the source library; Landscape uses an explicit samplerless bilinear/trilinear textureLoad bridge to stay below the hardware sampler limit.',
  ],
  MaterialExpressionTextureSampleParameter2D: [
    'data-bridge',
    'texture(profileMap).sample(coordinates).<channel>',
    'Authored sRGB/linear, wrap, filter, and flip metadata are applied by the source library; Landscape uses an explicit samplerless bilinear/trilinear textureLoad bridge to stay below the hardware sampler limit.',
  ],
  MaterialExpressionTime: ['data-bridge', 'state.uniforms.time', 'Fixed comparisons must freeze the same material time.'],
  MaterialExpressionVectorParameter: ['data-bridge', 'linearColor(vector(profile,name,default))', null],
  MaterialExpressionVertexColor: ['data-bridge', 'vertexColor()', 'Only available on meshes whose glTF primitive carries COLOR_0.'],
  MaterialExpressionVertexNormalWS: [
    'coordinate-bridge',
    'normalWorldGeometry with UE/Three axis conversion',
    'AutoCliff uses UE world Z, therefore Three world Y.',
  ],
  MaterialExpressionWorldPosition: [
    'coordinate-bridge',
    'positionWorld transformed as UE (X,Y,Z)=(x,-z,y)*100',
    'Scale parameters are divided by 100 before sampling in Three metres.',
  ],
});

const FUNCTION_BRIDGES = Object.freeze({
  Blend_Overlay: ['translated-primitive', 'sourceOverlay'],
  BreakOutFloat2Components: ['translated-primitive', 'node.x / node.y'],
  CheapContrast: ['translated-primitive', 'cheapContrast'],
  CustomRotator: ['translated-primitive', 'rotateSourceUv'],
  DitherTemporalAA: [
    'renderer-bridge',
    'ueSourceDitherTemporalAA',
    'Exact UE 5.8 material graph, engine noise texture, 8-sample jitter, and active Gen4 MainUpsampling/High resolve core are bound; responsive stencil, encoded mobility, and half-precision boundaries remain.',
  ],
  FlattenNormal: ['translated-primitive', 'normalMapNode strength / normalized normal blend'],
  FlipBook: [
    'explicit-gap',
    null,
    'Dormant in the fixed SnowPines branch; no generic source FlipBook helper is connected.',
  ],
  HueShift: ['translated-primitive', 'ueHueShift'],
  LinearGradient: ['translated-primitive', 'uv().x / uv().y'],
  MakeFloat2: ['translated-primitive', 'vec2'],
  MakeFloat3: ['translated-primitive', 'vec3'],
  MF_DayCycleEmission: ['translated-source-algorithm', 'applyDayCycleEmission'],
  MF_DesertDirt: ['translated-source-algorithm', 'buildLandscape desertDirtSurface'],
  MF_DesertGrass: ['translated-source-algorithm', 'buildLandscape desertGrassSurface'],
  MF_DesertSand: [
    'partial-source-bridge',
    'buildLandscape desertSandSurface',
    'Core color/fresnel/roughness/normal path mapped; desert wind/sparkle remains a documented inactive SnowPines gap.',
  ],
  MF_Grass: ['translated-source-algorithm', 'buildLandscape grassSurface'],
  MF_Lerp_Five_Float1: ['translated-source-algorithm', 'lerpFive'],
  MF_RainWetness: [
    'partial-source-bridge',
    'wetSurface plus specular branch',
    'Dry baseline is exact at Rain Wetness=0; active puddles/fake reflections remain a weather-state gap.',
  ],
  MF_Rock: ['translated-source-algorithm', 'buildLandscape rockSurface / sourceWorldAlignedNormal'],
  MF_Snow: ['translated-source-algorithm', 'buildSnowNodes'],
  MF_Sparkle: [
    'partial-source-bridge',
    'snowSparkleLayer',
    'Active 2D dual-layer structure mapped; UE temporal response and unavailable T_3DNoise intensity variance are explicit gaps.',
  ],
  MF_WindColor: ['translated-source-algorithm', 'landscapeWindColor'],
  ScaleUVsByCenter: ['translated-primitive', 'centered UV scale expression'],
  TimeWithSpeedVariable: ['translated-primitive', 'state.uniforms.time.mul(speed)'],
  WorldAlignedNormal: ['coordinate-bridge', 'sourceWorldAlignedNormal'],
  WorldAlignedTexture: ['coordinate-bridge', 'triplanar'],
});

function objectName(path) {
  return String(path ?? '').split('.').at(-1)?.split('/').at(-1) ?? '';
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inputRecords(expression) {
  const names = expression.inputs?.names ?? [];
  const nodes = expression.inputs?.nodes ?? [];
  const outputs = expression.inputs?.outputs ?? [];
  return names.map((name, index) => ({
    name,
    output: outputs[index] ?? '',
    source: nodes[index] ?? null,
  }));
}

function inputSymbol(expression, name, fallback) {
  const record = inputRecords(expression).find((input) => input.name === name);
  return record?.source ? `${record.source.split(':').at(-1)}.${record.output || 'out'}` : fallback;
}

function formula(expression) {
  const a = inputSymbol(expression, 'A', String(expression.const_a ?? 0));
  const b = inputSymbol(expression, 'B', String(expression.const_b ?? 1));
  const alpha = inputSymbol(expression, 'Alpha', String(expression.const_alpha ?? 0.5));
  const input = inputSymbol(expression, 'Input', inputSymbol(expression, 'None', 'input'));
  switch (expression.class) {
    case 'MaterialExpressionAbs': return `abs(${input})`;
    case 'MaterialExpressionAdd': return `(${a} + ${b})`;
    case 'MaterialExpressionClamp': return `clamp(${input}, min, max)`;
    case 'MaterialExpressionComponentMask': return `${input}.<selected channels>`;
    case 'MaterialExpressionConstant': return String(expression.r ?? expression.value ?? 0);
    case 'MaterialExpressionConstant3Vector': return `vec3(${JSON.stringify(expression.constant ?? expression.value ?? [0, 0, 0])})`;
    case 'MaterialExpressionDesaturation': return `desaturate(${input}, Fraction)`;
    case 'MaterialExpressionDivide': return `(${a} / ${b})`;
    case 'MaterialExpressionDotProduct': return `dot(${a}, ${b})`;
    case 'MaterialExpressionFloor': return `floor(${input})`;
    case 'MaterialExpressionFmod': return `fmod(${a}, ${b})`;
    case 'MaterialExpressionFrac': return `frac(${input})`;
    case 'MaterialExpressionFresnel': return 'pow(1-saturate(dot(N,V)), ExponentIn) with BaseReflectFractionIn';
    case 'MaterialExpressionLinearInterpolate': return `lerp(${a}, ${b}, ${alpha})`;
    case 'MaterialExpressionMaterialXRemap': return 'outLow + (in-outLow)*(outHigh-outLow)/(inHigh-inLow)';
    case 'MaterialExpressionMaterialXScreen': return '1 - (1 - base) * (1 - blend)';
    case 'MaterialExpressionMultiply': return `(${a} * ${b})`;
    case 'MaterialExpressionNormalize': return `normalize(${input})`;
    case 'MaterialExpressionOneMinus': return `(1 - ${input})`;
    case 'MaterialExpressionPanner': return 'UV + Time * (SpeedX, SpeedY)';
    case 'MaterialExpressionPower': return `pow(${a}, ${b})`;
    case 'MaterialExpressionRotator': return 'rotate(UV-Center, Time*Speed)+(Center)';
    case 'MaterialExpressionSaturate': return `saturate(${input})`;
    case 'MaterialExpressionSubtract': return `(${a} - ${b})`;
    case 'MaterialExpressionTextureSample':
    case 'MaterialExpressionTextureSampleParameter2D':
      return `sample(${objectName(expression.texture ?? expression.parameter_name)}, UVs)`;
    default:
      return CLASS_MAPPINGS[expression.class]?.[1] ?? 'See rawProperties and input edges';
  }
}

function rawProperties(expression) {
  const omitted = new Set(['class', 'name', 'desc', 'inputs', 'outputs']);
  return Object.fromEntries(Object.entries(expression).filter(([key]) => !omitted.has(key)));
}

const sourceBytes = readFileSync(SOURCE_PATH);
const audit = JSON.parse(sourceBytes.toString('utf8'));
const graphByPath = new Map([
  ...(audit.materials ?? []),
  ...(audit.materialFunctions ?? []),
].map((graph) => [graph.path, graph]));

const selectedPaths = new Set([...ROOT_GRAPHS, ...REQUIRED_FUNCTIONS]);
const externalFunctions = new Set();
const pending = [...selectedPaths];
while (pending.length > 0) {
  const path = pending.pop();
  const graph = graphByPath.get(path);
  if (!graph) throw new Error(`Terrain/sky node-map source is missing ${path}`);
  for (const expression of graph.expressions ?? []) {
    if (expression.class !== 'MaterialExpressionMaterialFunctionCall') continue;
    const functionPath = expression.material_function;
    if (!functionPath) continue;
    if (graphByPath.has(functionPath)) {
      if (!selectedPaths.has(functionPath)) {
        selectedPaths.add(functionPath);
        pending.push(functionPath);
      }
    } else {
      externalFunctions.add(functionPath);
    }
  }
}

function traceCoordinateRoots(expressionId, nodesById, visited = new Set()) {
  if (!expressionId || visited.has(expressionId)) return [];
  visited.add(expressionId);
  const expression = nodesById.get(expressionId);
  if (!expression) return [];
  if (COORDINATE_ROOTS[expression.class]) return [COORDINATE_ROOTS[expression.class]];
  return [...new Set(inputRecords(expression).flatMap((input) =>
    traceCoordinateRoots(input.source, nodesById, visited)))];
}

const statusCounts = {};
const graphs = [...selectedPaths].sort().map((path) => {
  const graph = graphByPath.get(path);
  const nodesById = new Map((graph.expressions ?? []).map((expression) => [
    `${path}:${expression.name}`,
    expression,
  ]));
  const nodes = (graph.expressions ?? []).map((expression) => {
    const classMapping = CLASS_MAPPINGS[expression.class]
      ?? ['explicit-gap', null, `No class mapping registered for ${expression.class}.`];
    let [status, tslEquivalent, bridgeOrGap] = classMapping;
    let functionBridge = null;
    if (expression.class === 'MaterialExpressionMaterialFunctionCall') {
      const functionName = objectName(expression.material_function);
      const mapping = FUNCTION_BRIDGES[functionName]
        ?? ['explicit-gap', null, `No TSL bridge is registered for ${expression.material_function}.`];
      [status, tslEquivalent, bridgeOrGap] = mapping;
      functionBridge = {
        function: expression.material_function,
        status,
        target: tslEquivalent,
        bridgeOrGap: bridgeOrGap ?? null,
      };
    }
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    const id = `${path}:${expression.name}`;
    return {
      id,
      class: expression.class,
      name: expression.name,
      description: expression.desc || null,
      inputs: inputRecords(expression),
      outputs: expression.outputs ?? [],
      parameterOrNodeProperties: rawProperties(expression),
      coordinateSpaces: traceCoordinateRoots(id, nodesById),
      sourceFormula: formula(expression),
      tslEquivalent,
      implementationStatus: status,
      functionBridge,
      bridgeOrGap: bridgeOrGap ?? null,
      evidence: {
        file: 'assets-local/sostylized/material-audit.json',
        graph: path,
        expression: expression.name,
      },
    };
  });
  return {
    path,
    class: graph.class,
    expressionCount: nodes.length,
    materialContract: graph.class === 'Material'
      ? {
        blendMode: graph.blend_mode,
        materialDomain: graph.material_domain,
        propertyInputs: graph.propertyInputs,
        shadingModel: graph.shading_model,
        twoSided: graph.two_sided,
        useMaterialAttributes: graph.use_material_attributes,
      }
      : null,
    nodes,
  };
});

const document = {
  schema: 'toonlab.sostylized-terrain-sky-node-map',
  version: 1,
  authority: {
    sourceFile: 'assets-local/sostylized/material-audit.json',
    sourceSha256: sha256(sourceBytes),
    rule: 'Source UE graph data is authoritative; TSL mappings never rewrite the evidence fields.',
  },
  scope: {
    rootGraphs: ROOT_GRAPHS,
    requiredFunctions: REQUIRED_FUNCTIONS,
    recursivelyIncludedGraphs: graphs.map((graph) => graph.path),
    externalEngineFunctions: [...externalFunctions].sort().map((path) => ({
      path,
      bridge: FUNCTION_BRIDGES[objectName(path)] ?? [
        'explicit-gap',
        null,
        'The supplied audit does not contain this Engine function internal graph.',
      ],
    })),
  },
  orderContracts: {
    landscape: [
      'sample ten authored masks in declared layer order',
      'apply shared T_NoiseStylized height modification to seven height layers',
      'leave Sand, Snow, SnowGrassBlue as ordinary weight layers',
      'normalize all ten modified weights together',
      'blend Material Attributes field-by-field',
      'replace painted result with MF_Rock by AutoCliff mask',
      'apply MF_RainWetness',
      'apply Landscape visibility mask',
      'write separate LandscapeGrass/RVT semantic outputs',
    ],
    sky: [
      'sample curve at 1-UV0.y',
      'sample centered background-cloud UV',
      'tint background cloud',
      'Screen blend over sky curve',
      'lerp by BG Clouds Strength',
      'desaturate by 1-Saturation',
      'emit through opaque unlit depth-tested surface',
    ],
    clouds: [
      'pan UV0 by material time and Rotation Speed',
      'apply Vertical Offset',
      'ScaleUVsByCenter by Vertical Stretch',
      'sample T_CloudLayer03',
      'sample cloud curve by texture R and multiply Strength',
      'DitherTemporalAA texture A',
      'clip at 1/3 through masked unlit depth-writing surface',
    ],
  },
  runtimeBridges: {
    landscapeWeights: {
      source: 'ten 505x505 linear R8 UE masks',
      binding: 'three lossless RGBA8 PNG packs; 4+4+2 channels',
      sampleMapping: '(landscapeCoord + 0.5) / vec2(505,505)',
      verification: 'every packed channel is byte-equal to its UE .r8 source',
    },
    sampledTextureLimit: {
      exactLandscapeStageRequirement: 35,
      WebGpuDefault: 16,
      requestedLimit: 48,
      reason: 'preserve the full authored node network without graph reduction',
    },
    samplerLimit: {
      adapterMaximum: 16,
      ordinaryThreeTextureNodeRequirement: 35,
      bridge: 'samplerless textureLoad with manual bilinear/trilinear filtering and authored address modes',
      anisotropy: 'not reproduced by the manual filter bridge',
      reason: 'retain all UE textures and coordinate inputs without exceeding the non-negotiable WebGPU sampler limit',
    },
  },
  classMappings: Object.fromEntries(Object.entries(CLASS_MAPPINGS).map(([name, mapping]) => [
    name,
    { status: mapping[0], tslEquivalent: mapping[1], bridgeOrGap: mapping[2] },
  ])),
  counts: {
    graphs: graphs.length,
    nodes: graphs.reduce((sum, graph) => sum + graph.expressionCount, 0),
    status: Object.fromEntries(Object.entries(statusCounts).sort()),
  },
  graphs,
};

const serialized = `${JSON.stringify(document, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const existing = readFileSync(OUTPUT_PATH, 'utf8');
  if (existing !== serialized) {
    throw new Error('terrain-sky-node-map.json is stale; run npm run generate:terrain-sky-node-map');
  }
  console.log(`Terrain/sky node map is current: ${document.counts.graphs} graphs, ${document.counts.nodes} nodes.`);
} else {
  writeFileSync(OUTPUT_PATH, serialized);
  console.log(`Generated terrain/sky node map: ${document.counts.graphs} graphs, ${document.counts.nodes} nodes.`);
}
