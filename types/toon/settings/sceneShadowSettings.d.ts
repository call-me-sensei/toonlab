export function createSceneShadowSettings(options?: any): {
    defaultMinLight: any;
    defaultStrength: any;
    enabled: boolean;
    eyeMinLight: any;
    eyeStrength: any;
    faceMinLight: any;
    faceStrength: any;
    shadowAreaStrength: any;
    skinMinLight: any;
    skinStrength: any;
};
export function resolveSceneShadowForMaterial(settings: any, { isEye, isFace, isSkin, }?: {
    isEye?: boolean;
    isFace?: boolean;
    isSkin?: boolean;
}): {
    minLight: any;
    strength: any;
};
export const DEFAULT_SCENE_SHADOW_SETTINGS: Readonly<{
    defaultMinLight: 0.24;
    defaultStrength: 0.76;
    enabled: true;
    eyeMinLight: 0.42;
    eyeStrength: 0.05;
    faceMinLight: 0.42;
    faceStrength: 0.46;
    shadowAreaStrength: 0.65;
    skinMinLight: 0.34;
    skinStrength: 0.62;
}>;
