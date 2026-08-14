export function createFaceLightingSettings(options?: any): {
    enabled: boolean;
    faceCelMidPoint: any;
    faceCelSoftness: any;
    faceLocalLightLift: any;
    faceMainLightIgnoreCelShade: any;
    faceNormalProxyBlend: any;
    faceProxyNormal: any[];
    faceSceneShadowStrength: any;
    faceSphereBlend: any;
    headSpaceMode: any;
};
export const FACE_HEAD_SPACE_MODES: Readonly<{
    static: "static";
    headBone: "headBone";
}>;
export const FACE_HEAD_SPACE_MODE_VALUES: Readonly<{
    static: 0;
    headBone: 1;
}>;
export const DEFAULT_FACE_LIGHTING_SETTINGS: Readonly<{
    enabled: true;
    faceCelMidPoint: -0.48;
    faceCelSoftness: 0.22;
    faceLocalLightLift: 0.22;
    faceMainLightIgnoreCelShade: 0.45;
    faceNormalProxyBlend: 0.75;
    faceProxyNormal: number[];
    faceSceneShadowStrength: 0.5;
    faceSphereBlend: 0.75;
    headSpaceMode: "headBone";
}>;
