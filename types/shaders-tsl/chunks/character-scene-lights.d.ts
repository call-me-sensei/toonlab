/**
 * Mirrors the scene's light state into the shared toon light uniforms —
 * the node-backend equivalent of three's WebGLLights setup for the subset
 * the character shader reads. Cheap enough to run once per rendered frame.
 */
export function syncToonSceneLights(scene: any, camera: any): void;
/** getMainLightColor(): clamped main light color or white fallback. */
export function getMainLightColor(mainLightMaxContribution: any): import("three/webgpu").Node<"vec3">;
/**
 * evaluateLocalLightFill + evaluateHemisphereFill, assembled per material.
 * `localLightBand` is the toon band the GLSL applies per local light; the
 * caller provides it (it depends on material uniforms). Returns
 * { localLight, strongestLocalLight, hemisphereFill } node factories.
 */
export function createLocalLightEvaluators({ localLightBand }: {
    localLightBand: any;
}): {
    evaluateHemisphereFill: (normal: any, hemisphereLightIntensity: any) => import("three/webgpu").Node<"vec3">;
    evaluateLocalLightFill: (normal: any, geometryPosition: any, localLightIntensity: any, localLightMaxContribution: any) => {
        localLight: import("three/webgpu").VarNode<"vec3", import("three/webgpu").Node<"vec3">>;
        strongestLocalLight: import("three/webgpu").Node<"float">;
    };
};
export const MAX_TOON_POINT_LIGHTS: 8;
export const MAX_TOON_SPOT_LIGHTS: 4;
export const MAX_TOON_HEMI_LIGHTS: 2;
export namespace toonSceneLights {
    let ambientLightColor: import("three/webgpu").UniformNode<"color", THREE.Color>;
    let hasMainLight: import("three/webgpu").UniformNode<"float", number>;
    let mainLightColor: import("three/webgpu").UniformNode<"color", THREE.Color>;
    let mainLightDirection: import("three/webgpu").UniformNode<"vec3", THREE.Vector3>;
    let pointLightColors: import("three/webgpu").UniformArrayNode<string>;
    let pointLightCount: import("three/webgpu").UniformNode<"float", number>;
    let pointLightParams: import("three/webgpu").UniformArrayNode<string>;
    let pointLightPositions: import("three/webgpu").UniformArrayNode<string>;
    let spotLightColors: import("three/webgpu").UniformArrayNode<string>;
    let spotLightCount: import("three/webgpu").UniformNode<"float", number>;
    let spotLightDirections: import("three/webgpu").UniformArrayNode<string>;
    let spotLightParams: import("three/webgpu").UniformArrayNode<string>;
    let spotLightPositions: import("three/webgpu").UniformArrayNode<string>;
    let hemiLightCount: import("three/webgpu").UniformNode<"float", number>;
    let hemiLightDirections: import("three/webgpu").UniformArrayNode<string>;
    let hemiLightGroundColors: import("three/webgpu").UniformArrayNode<string>;
    let hemiLightSkyColors: import("three/webgpu").UniformArrayNode<string>;
}
/** getMainLightDirection(): first directional light or the GLSL fallback. */
export const getMainLightDirection: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").Node<"vec3">>;
import * as THREE from 'three';
