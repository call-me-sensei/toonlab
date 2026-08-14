export function createSelfShadowSettings(options?: any): {
    defaultMinLight: any;
    defaultStrength: any;
    enabled: boolean;
    eyeMinLight: any;
    eyeStrength: any;
    faceMinLight: any;
    faceStrength: any;
    hairMinLight: any;
    hairStrength: any;
    shadowAreaStrength: any;
    skinMinLight: any;
    skinStrength: any;
    sourceMode: 0 | 1 | 2;
};
export function resolveSelfShadowForMaterial(settings: any, { isEye, isFace, isHair, isSkin, }?: {
    isEye?: boolean;
    isFace?: boolean;
    isHair?: boolean;
    isSkin?: boolean;
}): {
    minLight: any;
    strength: any;
};
export const SELF_SHADOW_SOURCE_MODES: Readonly<{
    off: 0;
    sceneProxy: 1;
    characterPass: 2;
}>;
export const DEFAULT_SELF_SHADOW_SETTINGS: Readonly<{
    defaultMinLight: 0.62;
    defaultStrength: 0.22;
    enabled: true;
    eyeMinLight: 1;
    eyeStrength: 0;
    faceMinLight: 1;
    faceStrength: 0;
    hairMinLight: 0.58;
    hairStrength: 0.26;
    shadowAreaStrength: 0.5;
    skinMinLight: 0.72;
    skinStrength: 0.16;
    sourceMode: 2;
}>;
