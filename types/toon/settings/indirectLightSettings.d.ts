export function createIndirectLightSettings(options?: any): {
    ambientTint: any;
    defaultIntensity: any;
    defaultMinimumIndirectLight: any;
    enabled: boolean;
    environmentIndirectLight: any;
    eyeIntensity: any;
    eyeMinimumIndirectLight: any;
    faceIntensity: any;
    faceMinimumIndirectLight: any;
    hairIntensity: any;
    hairMinimumIndirectLight: any;
    hemisphereLightIntensity: any;
    skinIntensity: any;
    skinMinimumIndirectLight: any;
};
export function resolveIndirectLightForMaterial(settings: any, { faceMinimumIndirectLightFallback, isEye, isFace, isHair, isSkin, skinMinimumIndirectLightFallback, }?: {
    faceMinimumIndirectLightFallback?: 0.35;
    isEye?: boolean;
    isFace?: boolean;
    isHair?: boolean;
    isSkin?: boolean;
    skinMinimumIndirectLightFallback?: 0.35;
}): {
    intensity: any;
    minimumIndirectLight: any;
};
export const DEFAULT_INDIRECT_LIGHT_SETTINGS: Readonly<{
    ambientTint: number[];
    defaultIntensity: 0.35;
    defaultMinimumIndirectLight: 0.35;
    enabled: true;
    environmentIndirectLight: 0.56;
    eyeIntensity: 0.35;
    eyeMinimumIndirectLight: 0.35;
    faceIntensity: 0.35;
    faceMinimumIndirectLight: any;
    hairIntensity: 0.35;
    hairMinimumIndirectLight: 0.35;
    hemisphereLightIntensity: 0.42;
    skinIntensity: 0.35;
    skinMinimumIndirectLight: any;
}>;
