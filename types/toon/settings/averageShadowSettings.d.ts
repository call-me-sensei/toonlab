export function createAverageShadowSettings(options?: any): {
    defaultMinLight: any;
    defaultStrength: any;
    enabled: boolean;
    measuredBlend: any;
    eyeMinLight: any;
    eyeStrength: any;
    faceMinLight: any;
    faceStrength: any;
    hairMinLight: any;
    hairStrength: any;
    skinMinLight: any;
    skinStrength: any;
    softness: any;
};
export function resolveAverageShadowForMaterial(settings: any, { isEye, isFace, isHair, isSkin, }?: {
    isEye?: boolean;
    isFace?: boolean;
    isHair?: boolean;
    isSkin?: boolean;
}): {
    minLight: any;
    strength: any;
};
export const DEFAULT_AVERAGE_SHADOW_SETTINGS: Readonly<{
    defaultMinLight: 0.28;
    defaultStrength: 0.28;
    enabled: false;
    measuredBlend: 0.65;
    eyeMinLight: 1;
    eyeStrength: 0;
    faceMinLight: 1;
    faceStrength: 0;
    hairMinLight: 0.3;
    hairStrength: 0.22;
    skinMinLight: 0.4;
    skinStrength: 0.18;
    softness: 0.35;
}>;
