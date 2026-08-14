export function createCelShadeSettings(options?: any): {
    bodyCelMidPoint: any;
    bodyCelSoftness: any;
    bodyMainLightIgnoreCelShade: any;
    edgeAntiAliasStrength: any;
    enabled: boolean;
};
export const DEFAULT_CEL_SHADE_SETTINGS: Readonly<{
    bodyCelMidPoint: 0.06;
    bodyCelSoftness: 0.045;
    bodyMainLightIgnoreCelShade: 0.02;
    edgeAntiAliasStrength: 1;
    enabled: true;
}>;
export const REFERENCE_CEL_SHADE_SETTINGS: Readonly<{
    bodyCelMidPoint: 0;
    bodyCelSoftness: 0.05;
    bodyMainLightIgnoreCelShade: 0;
    edgeAntiAliasStrength: 1;
    enabled: true;
}>;
export const CEL_SHADE_PRESETS: Readonly<{
    baseline: Readonly<{
        bodyCelMidPoint: 0.06;
        bodyCelSoftness: 0.045;
        bodyMainLightIgnoreCelShade: 0.02;
        edgeAntiAliasStrength: 1;
        enabled: true;
    }>;
    reference: Readonly<{
        bodyCelMidPoint: 0;
        bodyCelSoftness: 0.05;
        bodyMainLightIgnoreCelShade: 0;
        edgeAntiAliasStrength: 1;
        enabled: true;
    }>;
}>;
