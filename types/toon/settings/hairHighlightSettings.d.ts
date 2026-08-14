export function createHairHighlightSettings(options?: any): {
    materialPresets: {
        byName: any;
        byUuid: any;
        patterns: any;
    };
    direction: any[];
    enabled: boolean;
    maskChannel: any;
    maskMap: any;
    maskStrength: any;
    mode: "legacy" | "anisotropic";
    intensity: any;
    shadowFloor: any;
    sideBandPower: any;
    sourceMaskMode: "off" | "source";
    strandPower: any;
    uvBandAxis: number;
    uvBandCenter: any;
    uvBandHalfWidth: any;
    uvPreset: string;
};
export function resolveHairHighlightForMaterial(settings: any, { isHair, isOutline, maskMap, material, }?: {
    isHair?: boolean;
    isOutline?: boolean;
    maskMap?: any;
    material?: any;
}): {
    direction: any;
    enabled: boolean;
    intensity: any;
    maskChannel: any;
    maskMap: any;
    maskStrength: any;
    mode: any;
    modeValue: any;
    shadowFloor: any;
    sideBandPower: any;
    sourceMaskMode: any;
    strandPower: any;
    useMask: boolean;
    uvBandAxis: any;
    uvBandCenter: any;
    uvBandHalfWidth: any;
    uvPreset: any;
};
export const DEFAULT_HAIR_HIGHLIGHT_SETTINGS: Readonly<{
    direction: number[];
    enabled: true;
    intensity: 0.14;
    maskChannel: 0;
    maskMap: any;
    maskStrength: 1;
    mode: "legacy";
    shadowFloor: 0.35;
    sideBandPower: 2;
    sourceMaskMode: "off";
    strandPower: 7;
    uvBandAxis: 0;
    uvBandCenter: 0.5;
    uvBandHalfWidth: 0.5;
    uvPreset: "center";
}>;
export const HAIR_HIGHLIGHT_MASK_CHANNELS: Readonly<{
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
export const HAIR_HIGHLIGHT_MODES: Readonly<{
    anisotropic: "anisotropic";
    legacy: "legacy";
}>;
export const HAIR_HIGHLIGHT_MODE_VALUES: Readonly<{
    legacy: 0;
    anisotropic: 1;
}>;
export const HAIR_HIGHLIGHT_SOURCE_MASK_MODES: Readonly<{
    off: "off";
    source: "source";
}>;
