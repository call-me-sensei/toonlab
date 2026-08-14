export function createEyeHighlightSettings(options?: any): {
    color: any;
    enabled: boolean;
    intensity: any;
    maskChannel: any;
    maskMap: any;
    maskStrength: any;
    power: any;
    showInShadowArea: any;
    sourceMaskMode: "off" | "source";
};
export function resolveEyeHighlightForMaterial(settings: any, { isEye, isOutline, maskMap, }?: {
    isEye?: boolean;
    isOutline?: boolean;
    maskMap?: any;
}): {
    color: any;
    enabled: boolean;
    intensity: any;
    maskChannel: any;
    maskMap: any;
    maskStrength: any;
    power: any;
    showInShadowArea: any;
    useMask: boolean;
};
export const DEFAULT_EYE_HIGHLIGHT_SETTINGS: Readonly<{
    color: number[];
    enabled: true;
    intensity: 0.58;
    maskChannel: 0;
    maskMap: any;
    maskStrength: 1;
    power: 22;
    showInShadowArea: 0.4;
    sourceMaskMode: "off";
}>;
export const EYE_HIGHLIGHT_MASK_CHANNELS: Readonly<{
    r: 0;
    red: 0;
    x: 0;
    g: 1;
    green: 1;
    y: 1;
    b: 2;
    blue: 2;
    z: 2;
    a: 3;
    alpha: 3;
    w: 3;
}>;
export const EYE_HIGHLIGHT_SOURCE_MASK_MODES: Readonly<{
    off: "off";
    source: "source";
}>;
