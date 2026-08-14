export function createContactShadowSettings(options?: any): {
    enabled: boolean;
    faceHeadUpBlend: any;
    faceStrength: any;
    fadeRange: any;
    strength: any;
    thresholdOffset: any;
    width: any;
};
export function resolveContactShadowForMaterial(settings: any, { isEye, isFace, isOutline, }?: {
    isEye?: boolean;
    isFace?: boolean;
    isOutline?: boolean;
}): {
    enabled: boolean;
    faceHeadUpBlend: any;
    fadeRange: any;
    strength: any;
    thresholdOffset: any;
    width: any;
};
export const DEFAULT_CONTACT_SHADOW_SETTINGS: Readonly<{
    enabled: true;
    strength: 0.5;
    faceHeadUpBlend: 0;
    faceStrength: 0.4;
    fadeRange: 1;
    thresholdOffset: 0;
    width: 1;
}>;
