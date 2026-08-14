export function createLocalLightSettings(options?: any): {
    defaultIntensity: any;
    defaultMaxContribution: any;
    defaultShadowLift: any;
    enabled: boolean;
    eyeIntensity: any;
    eyeMaxContribution: any;
    eyeShadowLift: any;
    faceIntensity: any;
    faceMaxContribution: any;
    faceShadowLift: any;
    hairIntensity: any;
    hairMaxContribution: any;
    hairShadowLift: any;
    skinIntensity: any;
    skinMaxContribution: any;
    skinShadowLift: any;
};
export function resolveLocalLightForMaterial(settings: any, { isEye, isFace, isHair, isSkin, }?: {
    isEye?: boolean;
    isFace?: boolean;
    isHair?: boolean;
    isSkin?: boolean;
}): {
    intensity: any;
    maxContribution: any;
    shadowLift: any;
};
export const DEFAULT_LOCAL_LIGHT_SETTINGS: Readonly<{
    defaultIntensity: 0.72;
    defaultMaxContribution: 0.34;
    defaultShadowLift: 0.58;
    enabled: true;
    eyeIntensity: 0.42;
    eyeMaxContribution: 0.18;
    eyeShadowLift: 0.9;
    faceIntensity: 0.56;
    faceMaxContribution: 0.24;
    faceShadowLift: 0.84;
    hairIntensity: 0.72;
    hairMaxContribution: 0.34;
    hairShadowLift: 0.58;
    skinIntensity: 0.64;
    skinMaxContribution: 0.3;
    skinShadowLift: 0.72;
}>;
