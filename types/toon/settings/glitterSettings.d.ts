export function createGlitterSettings(options?: any): {
    enabled: boolean;
    intensity: any;
    density: any;
    size: any;
    randomNormalStrength: any;
    showInShadowArea: any;
    uvChannel: number;
    defaultIntensity: any;
    eyeIntensity: any;
    faceIntensity: any;
    hairIntensity: any;
    skinIntensity: any;
};
export function resolveGlitterForMaterial(settings: any, { isEye, isFace, isHair, isOutline, isSkin, }?: {
    isEye?: boolean;
    isFace?: boolean;
    isHair?: boolean;
    isOutline?: boolean;
    isSkin?: boolean;
}): {
    density: any;
    enabled: boolean;
    intensity: number;
    randomNormalStrength: any;
    showInShadowArea: any;
    size: any;
    uvChannel: any;
};
export const DEFAULT_GLITTER_SETTINGS: Readonly<{
    enabled: false;
    intensity: 1;
    density: 1;
    size: 1;
    randomNormalStrength: 0.5;
    showInShadowArea: 0.15;
    uvChannel: 1;
    defaultIntensity: 1;
    eyeIntensity: 0;
    faceIntensity: 0;
    hairIntensity: 0;
    skinIntensity: 0;
}>;
