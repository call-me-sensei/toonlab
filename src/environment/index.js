// Environment shading barrel. Import from '@call-me-sensei/toonlab/environment'.
export * from './environmentMaterialAdapter.js';
export * from './environmentSettings.js';
export * from './environmentPresets.js';
export * from './environmentRigs.js';
export * from './environmentTimeOfDay.js';
export * from './environmentAmbientProbe.js';
export * from './environmentPlanarReflection.js';
export * from './environmentSunShadowPass.js';
export * from './environmentGroundFieldPass.js';
// The ground-field sampling API pairs with createEnvironmentGroundFieldPass:
// vegetation that adopts ground color (MI_Grass-style RVT reads, the grass
// field's groundField option) needs these consumer-side. The chunk already
// ships in the package; this makes it importable.
export {
  environmentGroundField,
  groundFieldColorMapNode,
  groundFieldFilteredColorMapNode,
  groundFieldHeightMapNode,
  groundFieldSurfaceMapNode,
  sampleGroundColor,
  sampleGroundSurface,
} from '../shaders-tsl/chunks/environment-ground-field.js';
// Likewise the scene sun-shadow sampler pairs with
// createEnvironmentSunShadowPass for host materials that receive scene
// shadows the way the built-in vegetation shaders do.
export {
  environmentSunShadow,
  sampleEnvironmentSunShadow,
  sunShadowMapNode,
} from '../shaders-tsl/chunks/environment-sun-shadow.js';
export * from './environmentState.js';
export * from './manufacturedMaterialContract.js';
export * from './manufacturedReflectionProvider.js';
export {
  classifyUrbanPropSurface,
  createUrbanAnimePropNodeMaterial,
  createUrbanPropShaderControls,
} from './urbanPropMaterial.js';
export * from './dayCurves.js';
export * from './toonLabSourceLibrary.js';
export * from './toonLabSourceMaterials.js';
export * from './surfaceMaterialModes.js';
export * from './toonLabRockMaterialResolver.js';
export * from './toonLabEnvironmentMaterials.js';
export * from './toonLabTreeMaterials.js';
export * from './toonLabSurfaceLighting.js';
export * from './toonLabMaterialPassCoupling.js';
export * from './toonLabSourceDefaultLit.js';
export * from './toonLabSourceTemporal.js';
