export function normalizeToonPresetName(value: any): any;
export function getToonPresetIds(): string[];
export function getToonPresetMetadata(id?: "default"): {
    description: string;
    id: any;
    label: any;
};
export function getToonPresetOptions(): {
    description: string;
    id: any;
    label: any;
}[];
export function getToonSettingGroupMetadata(id: any): Readonly<{
    description: "Preserves source texture, source material color, and saturation policy before toon lighting.";
    id: "baseTexture";
    label: "Base Texture";
}> | Readonly<{
    description: "Classifies materials as skin, face, hair, eyes, costume, metal, transparent overlays, and outline.";
    id: "materialRoles";
    label: "Material Roles";
}> | Readonly<{
    description: "Controls cutout, blend, opacity, eye overlay sorting, and transparent decoration behavior.";
    id: "alpha";
    label: "Alpha";
}> | Readonly<{
    description: "Keeps skin and face shadows warm, readable, and separate from costume/hair shadows.";
    id: "skinTone";
    label: "Skin Tone";
}> | Readonly<{
    description: "Overrides face-area cel response so noses, cheeks, and eyes do not receive harsh body shadows.";
    id: "faceLighting";
    label: "Face Lighting";
}> | Readonly<{
    description: "Sets the primary directional cel band threshold, softness, and light-ignore amount.";
    id: "celShade";
    label: "Cel Shade";
}> | Readonly<{
    description: "Tints and reshapes lit-to-shadow transitions and fully shadowed regions.";
    id: "shadowColor";
    label: "Shadow Color";
}> | Readonly<{
    description: "Controls how renderer shadow maps darken character materials.";
    id: "sceneShadow";
    label: "Scene Shadows";
}> | Readonly<{
    description: "Controls character-local self-shadow proxy contribution until a dedicated self-shadow pass exists.";
    id: "selfShadow";
    label: "Self Shadow";
}> | Readonly<{
    description: "Adds averaged shadow visibility used for softer role-specific shadow damping.";
    id: "averageShadow";
    label: "Average Shadow";
}> | Readonly<{
    description: "Mixes ambient, hemisphere, and environment light into toon shading.";
    id: "indirectLight";
    label: "Indirect Light";
}> | Readonly<{
    description: "Controls point and spot light response for characters without overpowering cel bands.";
    id: "localLights";
    label: "Local Lights";
}> | Readonly<{
    description: "Adds view-dependent edge light that can be blocked or softened by shadow.";
    id: "rimLight";
    label: "Rim Light";
}> | Readonly<{
    description: "Adds thin screen-space contact shadows (hair-on-face, arm-on-torso) from the depth prepass.";
    id: "contactShadow";
    label: "Contact Shadow";
}> | Readonly<{
    description: "Adds role-aware stylized highlights and optional source specular masks.";
    id: "specular";
    label: "Specular";
}> | Readonly<{
    description: "Adds hair-specific highlight bands, optional anisotropic strand response, and source masks.";
    id: "hairHighlight";
    label: "Hair Highlight";
}> | Readonly<{
    description: "Adds role-aware eye/catchlight boosts and optional source masks.";
    id: "eyeHighlight";
    label: "Eye Highlight";
}> | Readonly<{
    description: "Routes source normal, AO, emissive, MatCap, ramp, detail, roughness, metalness, and specular maps.";
    id: "materialMaps";
    label: "Material Maps";
}> | Readonly<{
    description: "Controls the inverted-hull outline pass, including role-specific widths and colors.";
    id: "outline";
    label: "Outlines";
}> | Readonly<{
    description: "Adds procedural view-dependent sparkles for sparkly costumes and accessories. Off by default.";
    id: "glitter";
    label: "Glitter";
}> | Readonly<{
    description: "Blends a decal/overlay texture into the albedo before lighting (ice, tattoos, damage). Off by default.";
    id: "sticker";
    label: "Sticker";
}> | Readonly<{
    description: "Flattens perspective around the tracked head for anime-portrait closeups. Off by default.";
    id: "perspectiveRemoval";
    label: "Perspective Removal";
}> | Readonly<{
    description: "Opt-in shell fur for matched materials (collars, trims, animal parts). Off by default.";
    id: "fur";
    label: "Fur";
}> | readonly (Readonly<{
    description: "Preserves source texture, source material color, and saturation policy before toon lighting.";
    id: "baseTexture";
    label: "Base Texture";
}> | Readonly<{
    description: "Classifies materials as skin, face, hair, eyes, costume, metal, transparent overlays, and outline.";
    id: "materialRoles";
    label: "Material Roles";
}> | Readonly<{
    description: "Controls cutout, blend, opacity, eye overlay sorting, and transparent decoration behavior.";
    id: "alpha";
    label: "Alpha";
}> | Readonly<{
    description: "Keeps skin and face shadows warm, readable, and separate from costume/hair shadows.";
    id: "skinTone";
    label: "Skin Tone";
}> | Readonly<{
    description: "Overrides face-area cel response so noses, cheeks, and eyes do not receive harsh body shadows.";
    id: "faceLighting";
    label: "Face Lighting";
}> | Readonly<{
    description: "Sets the primary directional cel band threshold, softness, and light-ignore amount.";
    id: "celShade";
    label: "Cel Shade";
}> | Readonly<{
    description: "Tints and reshapes lit-to-shadow transitions and fully shadowed regions.";
    id: "shadowColor";
    label: "Shadow Color";
}> | Readonly<{
    description: "Controls how renderer shadow maps darken character materials.";
    id: "sceneShadow";
    label: "Scene Shadows";
}> | Readonly<{
    description: "Controls character-local self-shadow proxy contribution until a dedicated self-shadow pass exists.";
    id: "selfShadow";
    label: "Self Shadow";
}> | Readonly<{
    description: "Adds averaged shadow visibility used for softer role-specific shadow damping.";
    id: "averageShadow";
    label: "Average Shadow";
}> | Readonly<{
    description: "Mixes ambient, hemisphere, and environment light into toon shading.";
    id: "indirectLight";
    label: "Indirect Light";
}> | Readonly<{
    description: "Controls point and spot light response for characters without overpowering cel bands.";
    id: "localLights";
    label: "Local Lights";
}> | Readonly<{
    description: "Adds view-dependent edge light that can be blocked or softened by shadow.";
    id: "rimLight";
    label: "Rim Light";
}> | Readonly<{
    description: "Adds thin screen-space contact shadows (hair-on-face, arm-on-torso) from the depth prepass.";
    id: "contactShadow";
    label: "Contact Shadow";
}> | Readonly<{
    description: "Adds role-aware stylized highlights and optional source specular masks.";
    id: "specular";
    label: "Specular";
}> | Readonly<{
    description: "Adds hair-specific highlight bands, optional anisotropic strand response, and source masks.";
    id: "hairHighlight";
    label: "Hair Highlight";
}> | Readonly<{
    description: "Adds role-aware eye/catchlight boosts and optional source masks.";
    id: "eyeHighlight";
    label: "Eye Highlight";
}> | Readonly<{
    description: "Routes source normal, AO, emissive, MatCap, ramp, detail, roughness, metalness, and specular maps.";
    id: "materialMaps";
    label: "Material Maps";
}> | Readonly<{
    description: "Controls the inverted-hull outline pass, including role-specific widths and colors.";
    id: "outline";
    label: "Outlines";
}> | Readonly<{
    description: "Adds procedural view-dependent sparkles for sparkly costumes and accessories. Off by default.";
    id: "glitter";
    label: "Glitter";
}> | Readonly<{
    description: "Blends a decal/overlay texture into the albedo before lighting (ice, tattoos, damage). Off by default.";
    id: "sticker";
    label: "Sticker";
}> | Readonly<{
    description: "Flattens perspective around the tracked head for anime-portrait closeups. Off by default.";
    id: "perspectiveRemoval";
    label: "Perspective Removal";
}> | Readonly<{
    description: "Opt-in shell fur for matched materials (collars, trims, animal parts). Off by default.";
    id: "fur";
    label: "Fur";
}>)[];
export function getToonSettingFieldSchema(groupId?: any): Readonly<{
    [k: string]: Readonly<{
        defaultValue: any;
        description: string;
        group: any;
        id: string;
        key: any;
        label: any;
        optionLabels: any;
        options: any;
        range: any;
        serializable: boolean;
        type: any;
    }>;
}> | Readonly<{
    [k: string]: Readonly<{
        [k: string]: Readonly<{
            defaultValue: any;
            description: string;
            group: any;
            id: string;
            key: any;
            label: any;
            optionLabels: any;
            options: any;
            range: any;
            serializable: boolean;
            type: any;
        }>;
    }>;
}>;
export function sanitizeToonPresetSettings(settings?: {}): {};
export function validateToonPresetDocument(input: any): {
    errors: string[];
    ok: boolean;
    value: {
        description: string;
        id: any;
        label: string;
        settings: any;
        type: any;
        version: any;
    };
    warnings: any[];
};
export function parseToonPresetDocument(input: any): any;
export function createToonPresetDocument(id: any, definition?: {}): any;
export function serializeToonPreset(idOrDocument: any, definition?: {}, { pretty }?: {
    pretty?: boolean;
}, ...args: any[]): string;
export function getToonPresetDefinition(id?: "default"): any;
export function registerToonPreset(id: any, definition?: {}, { overwrite }?: {
    overwrite?: boolean;
}): {
    description: string;
    id: any;
    label: any;
};
export function registerSerializedToonPreset(input: any, options?: {}): {
    description: string;
    id: any;
    label: any;
};
export function createToonSettings(options?: {}): {
    alpha: {
        blendCutoff: any;
        costumeCutout: boolean;
        cutoutCutoff: any;
        ditherOpacity: any;
        enabled: boolean;
        expressionTokenCutout: boolean;
        eyeHighlightOrder: any;
        eyeOrder: any;
        faceCutout: boolean;
        hairCutout: boolean;
        mapTransparentCutout: boolean;
        overlayDepthWrite: boolean;
        overlayOrder: any;
        preserveSourceAlphaTest: boolean;
        scleraOrder: any;
        skinCutout: boolean;
        sortOverlays: boolean;
        sourceAlphaMapCutout: boolean;
        sourceTransparentCutout: boolean;
        transparentOverlayBlend: boolean;
        transparentOpacityThreshold: any;
    };
    averageShadow: {
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
    baseTexture: Readonly<{
        customSaturation: 1;
        materialColorMode: "legacy";
        saturationMode: "legacy";
    }> | {
        customSaturation: any;
        materialColorMode: any;
        saturationMode: any;
    };
    celShade: {
        bodyCelMidPoint: any;
        bodyCelSoftness: any;
        bodyMainLightIgnoreCelShade: any;
        edgeAntiAliasStrength: any;
        enabled: boolean;
    };
    contactShadow: {
        enabled: boolean;
        faceHeadUpBlend: any;
        faceStrength: any;
        fadeRange: any;
        strength: any;
        thresholdOffset: any;
        width: any;
    };
    eyeHighlight: {
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
    faceLighting: {
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
    fur: {
        density: any;
        enabled: boolean;
        gravity: any;
        length: any;
        materials: any[];
        roles: string[];
        rootOffset: any;
        rootShade: any;
        shellCount: number;
    };
    glitter: {
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
    hairHighlight: {
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
    perspectiveRemoval: {
        amount: any;
        enabled: boolean;
        endHeight: any;
        radius: any;
        startHeight: any;
    };
    sticker: {
        blendMode: any;
        enabled: boolean;
        map: any;
        offset: any[];
        repeat: any[];
        strength: any;
        uvChannel: number;
    };
    indirectLight: {
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
    localLights: {
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
    materialMaps: {
        aoMap: any;
        aoStrength: any;
        detailMap: any;
        detailRepeat: any;
        detailStrength: any;
        emissiveColor: any;
        emissiveMap: any;
        emissiveStrength: any;
        enabled: boolean;
        matcapMap: any;
        matcapStrength: any;
        metalnessMap: any;
        metalnessStrength: any;
        normalMap: any;
        normalScale: any;
        normalStrength: any;
        rampMap: any;
        rampStrength: any;
        roughnessMap: any;
        roughnessStrength: any;
        sourceMode: "off" | "source";
        specularColorMap: any;
        specularColorStrength: any;
    };
    materialRoles: any;
    outline: {
        defaultLightingMix: any;
        defaultMaxBrightness: any;
        defaultMinBrightness: any;
        defaultTintColor: any;
        defaultWidth: any;
        depthOffset: any;
        depthTest: boolean;
        depthWrite: boolean;
        enabled: boolean;
        eyeLightingMix: any;
        eyeMaxBrightness: any;
        eyeMinBrightness: any;
        eyeTintColor: any;
        eyeWidth: any;
        faceLightingMix: any;
        faceMaxBrightness: any;
        faceMinBrightness: any;
        faceTintColor: any;
        faceWidth: any;
        hairCutoutWidth: any;
        hairLightingMix: any;
        hairMaxBrightness: any;
        hairMinBrightness: any;
        hairTintColor: any;
        hairWidth: any;
        maxWidth: any;
        metalLightingMix: any;
        metalMaxBrightness: any;
        metalMinBrightness: any;
        metalTintColor: any;
        metalWidth: any;
        polygonOffset: boolean;
        polygonOffsetFactor: any;
        polygonOffsetUnits: any;
        referenceDistance: any;
        referenceFov: any;
        screenSpaceWidth: any;
        smoothNormals: boolean;
        widthFadeDistance: any;
        skinLightingMix: any;
        skinMaxBrightness: any;
        skinMinBrightness: any;
        skinTintColor: any;
        skinWidth: any;
        transparentOverlayWidth: any;
        widthScale: any;
    };
    preset: any;
    presetDescription: string;
    presetLabel: any;
    rimLight: {
        blockByShadow: any;
        defaultIntensity: any;
        defaultTintColor: any;
        depthCloseWidthReduce: any;
        depthDottedLineFix: boolean;
        depthFadeEndDistance: any;
        depthFadeRange: any;
        depthFadeStartDistance: any;
        depthMask3D: boolean;
        depthSafeDistance: any;
        depthThresholdOffset: any;
        depthWidth: any;
        enabled: boolean;
        eyeIntensity: any;
        faceIntensity: any;
        hairIntensity: any;
        midPoint: any;
        mixWithBaseMapColor: any;
        mode: any;
        skinIntensity: any;
        softness: any;
    };
    sceneShadow: {
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
    selfShadow: {
        defaultMinLight: any;
        defaultStrength: any;
        enabled: boolean;
        eyeMinLight: any;
        eyeStrength: any;
        faceMinLight: any;
        faceStrength: any;
        hairMinLight: any;
        hairStrength: any;
        shadowAreaStrength: any;
        skinMinLight: any;
        skinStrength: any;
        sourceMode: 0 | 1 | 2;
    };
    shadowColor: {
        enabled: boolean;
        lowSaturationFallbackColor: any;
        selfShadowAlbedoMulStrength: any;
        selfShadowAreaHSVStrength: any;
        selfShadowAreaHueOffset: any;
        selfShadowAreaSaturationBoost: any;
        selfShadowAreaValueMul: any;
        selfShadowTintColor: any;
        transitionAreaHueOffset: any;
        transitionAreaIntensity: any;
        transitionAreaSaturationBoost: any;
        transitionAreaTintColor: any;
        transitionAreaValueMul: any;
    };
    skinTone: {
        enabled: boolean;
        faceMaxDirectLight: any;
        faceMinimumIndirectLight: any;
        faceShadowBrightness: any;
        faceShadowSaturation: any;
        faceShadowTint: any;
        faceShadowTintStrength: any;
        skinMaxDirectLight: any;
        skinMinimumIndirectLight: any;
        skinShadowBrightness: any;
        skinShadowSaturation: any;
        skinShadowTint: any;
        skinShadowTintStrength: any;
    };
    specular: {
        defaultColor: any;
        defaultIntensity: any;
        defaultMidPoint: any;
        defaultPower: any;
        defaultRange: any;
        defaultShowInShadowArea: any;
        directionMode: "light" | "view";
        enabled: boolean;
        eyeIntensity: any;
        eyeMidPoint: any;
        eyePower: any;
        eyeRange: any;
        eyeShowInShadowArea: any;
        faceIntensity: any;
        hairIntensity: any;
        hairPower: any;
        maskChannel: any;
        maskMap: any;
        maskStrength: any;
        metalIntensity: any;
        skinIntensity: any;
        sourceMaskMode: "off" | "source";
    };
};
export const TOON_PRESET_DOCUMENT_TYPE: "toonlab/toon-preset";
export const TOON_PRESET_SCHEMA_VERSION: 1;
export const TOON_PRESET_IDS: Readonly<{
    callMeSensei: "call_me_sensei";
    default: "default";
    showcase: "showcase";
}>;
export const TOON_SETTING_DEFAULTS: Readonly<{
    alpha: Readonly<{
        blendCutoff: 0.02;
        costumeCutout: true;
        cutoutCutoff: 0.35;
        ditherOpacity: 1;
        enabled: true;
        expressionTokenCutout: true;
        eyeHighlightOrder: 12;
        eyeOrder: 11;
        faceCutout: true;
        hairCutout: true;
        mapTransparentCutout: true;
        overlayDepthWrite: false;
        overlayOrder: 20;
        preserveSourceAlphaTest: true;
        scleraOrder: 10;
        skinCutout: true;
        sortOverlays: true;
        sourceAlphaMapCutout: true;
        sourceTransparentCutout: true;
        transparentOverlayBlend: true;
        transparentOpacityThreshold: 0.999;
    }>;
    averageShadow: Readonly<{
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
    baseTexture: Readonly<{
        customSaturation: 1;
        materialColorMode: "legacy";
        saturationMode: "legacy";
    }>;
    celShade: Readonly<{
        bodyCelMidPoint: 0.06;
        bodyCelSoftness: 0.045;
        bodyMainLightIgnoreCelShade: 0.02;
        edgeAntiAliasStrength: 1;
        enabled: true;
    }>;
    contactShadow: Readonly<{
        enabled: true;
        strength: 0.5;
        faceHeadUpBlend: 0;
        faceStrength: 0.4;
        fadeRange: 1;
        thresholdOffset: 0;
        width: 1;
    }>;
    eyeHighlight: Readonly<{
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
    faceLighting: Readonly<{
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
    fur: Readonly<{
        enabled: false;
        shellCount: 8;
        length: 0.02;
        gravity: 0.35;
        density: 3;
        rootOffset: -0.2;
        rootShade: 0.55;
        materials: any;
        roles: any;
    }>;
    glitter: Readonly<{
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
    hairHighlight: Readonly<{
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
    perspectiveRemoval: Readonly<{
        amount: 0;
        enabled: false;
        radius: 1.4;
        startHeight: 0;
        endHeight: 1;
    }>;
    sticker: Readonly<{
        blendMode: "normal";
        enabled: false;
        map: any;
        offset: number[];
        repeat: number[];
        strength: 1;
        uvChannel: 0;
    }>;
    indirectLight: Readonly<{
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
    localLights: Readonly<{
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
    materialMaps: Readonly<{
        aoStrength: 0;
        detailRepeat: number[];
        detailStrength: 0;
        emissiveColor: number[];
        emissiveStrength: 0;
        enabled: true;
        matcapStrength: 0;
        metalnessStrength: 0;
        normalScale: number[];
        normalStrength: 0;
        rampStrength: 0;
        roughnessStrength: 0;
        sourceMode: "source";
        specularColorStrength: 0;
    }>;
    outline: Readonly<{
        defaultLightingMix: 0.28;
        defaultMaxBrightness: 0.38;
        defaultMinBrightness: 0.04;
        defaultTintColor: number[];
        defaultWidth: 0.002;
        depthOffset: 0;
        depthTest: true;
        depthWrite: false;
        enabled: true;
        eyeLightingMix: 0.28;
        eyeMaxBrightness: 0.38;
        eyeMinBrightness: 0.04;
        eyeTintColor: number[];
        eyeWidth: 0;
        faceLightingMix: 0.28;
        faceMaxBrightness: 0.48;
        faceMinBrightness: 0.04;
        faceTintColor: number[];
        faceWidth: 0;
        hairCutoutWidth: 0;
        hairLightingMix: 0.08;
        hairMaxBrightness: 0.68;
        hairMinBrightness: 0.085;
        hairTintColor: number[];
        hairWidth: 0.00055;
        maxWidth: 0.006;
        metalLightingMix: 0.28;
        metalMaxBrightness: 0.38;
        metalMinBrightness: 0.04;
        metalTintColor: number[];
        metalWidth: 0.002;
        polygonOffset: false;
        polygonOffsetFactor: 1;
        polygonOffsetUnits: 1;
        referenceDistance: 4;
        referenceFov: 40;
        screenSpaceWidth: 1;
        smoothNormals: true;
        widthFadeDistance: 12;
        skinLightingMix: 0.28;
        skinMaxBrightness: 0.48;
        skinMinBrightness: 0.04;
        skinTintColor: number[];
        skinWidth: 0.001;
        transparentOverlayWidth: 0;
        widthScale: 1;
    }>;
    rimLight: Readonly<{
        blockByShadow: 0.65;
        defaultIntensity: 0.13;
        defaultTintColor: number[];
        depthCloseWidthReduce: 1;
        depthDottedLineFix: true;
        depthFadeEndDistance: 30;
        depthFadeRange: 1;
        depthFadeStartDistance: 20;
        depthMask3D: false;
        depthSafeDistance: 1;
        depthThresholdOffset: 0;
        depthWidth: 1;
        enabled: true;
        eyeIntensity: 0.04;
        faceIntensity: 0.13;
        hairIntensity: 0.23;
        midPoint: 0.48;
        mixWithBaseMapColor: 0.35;
        mode: "depthTexture";
        skinIntensity: 0.13;
        softness: 0.1;
    }>;
    sceneShadow: Readonly<{
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
    selfShadow: Readonly<{
        defaultMinLight: 0.62;
        defaultStrength: 0.22;
        enabled: true;
        eyeMinLight: 1;
        eyeStrength: 0;
        faceMinLight: 1;
        faceStrength: 0;
        hairMinLight: 0.58;
        hairStrength: 0.26;
        shadowAreaStrength: 0.5;
        skinMinLight: 0.72;
        skinStrength: 0.16;
        sourceMode: 2;
    }>;
    shadowColor: Readonly<{
        enabled: true;
        lowSaturationFallbackColor: number[];
        selfShadowAlbedoMulStrength: 0;
        selfShadowAreaHSVStrength: 1;
        selfShadowAreaHueOffset: 0;
        selfShadowAreaSaturationBoost: 0.2;
        selfShadowAreaValueMul: 0.68;
        selfShadowTintColor: number[];
        transitionAreaHueOffset: 0.01;
        transitionAreaIntensity: 1;
        transitionAreaSaturationBoost: 0.36;
        transitionAreaTintColor: number[];
        transitionAreaValueMul: 1;
    }>;
    skinTone: Readonly<{
        enabled: true;
        faceMaxDirectLight: 100;
        faceMinimumIndirectLight: 0.35;
        faceShadowBrightness: 1;
        faceShadowSaturation: 1;
        faceShadowTint: number[];
        faceShadowTintStrength: 1;
        skinMaxDirectLight: 100;
        skinMinimumIndirectLight: 0.35;
        skinShadowBrightness: 0.92;
        skinShadowSaturation: 1;
        skinShadowTint: number[];
        skinShadowTintStrength: 1;
    }>;
    specular: Readonly<{
        defaultColor: number[];
        defaultIntensity: 0.075;
        defaultMidPoint: 0.72;
        defaultPower: 56;
        defaultRange: 0.12;
        defaultShowInShadowArea: 0.25;
        directionMode: "light";
        enabled: true;
        eyeIntensity: 0.62;
        eyeMidPoint: 0.35;
        eyePower: 18;
        eyeRange: 0.18;
        eyeShowInShadowArea: 1;
        faceIntensity: 0.025;
        hairIntensity: 0.18;
        hairPower: 40;
        maskChannel: 0;
        maskMap: any;
        maskStrength: 1;
        metalIntensity: 0.075;
        skinIntensity: 0.025;
        sourceMaskMode: "off";
    }>;
}>;
export const TOON_SETTING_GROUPS: readonly (Readonly<{
    description: "Preserves source texture, source material color, and saturation policy before toon lighting.";
    id: "baseTexture";
    label: "Base Texture";
}> | Readonly<{
    description: "Classifies materials as skin, face, hair, eyes, costume, metal, transparent overlays, and outline.";
    id: "materialRoles";
    label: "Material Roles";
}> | Readonly<{
    description: "Controls cutout, blend, opacity, eye overlay sorting, and transparent decoration behavior.";
    id: "alpha";
    label: "Alpha";
}> | Readonly<{
    description: "Keeps skin and face shadows warm, readable, and separate from costume/hair shadows.";
    id: "skinTone";
    label: "Skin Tone";
}> | Readonly<{
    description: "Overrides face-area cel response so noses, cheeks, and eyes do not receive harsh body shadows.";
    id: "faceLighting";
    label: "Face Lighting";
}> | Readonly<{
    description: "Sets the primary directional cel band threshold, softness, and light-ignore amount.";
    id: "celShade";
    label: "Cel Shade";
}> | Readonly<{
    description: "Tints and reshapes lit-to-shadow transitions and fully shadowed regions.";
    id: "shadowColor";
    label: "Shadow Color";
}> | Readonly<{
    description: "Controls how renderer shadow maps darken character materials.";
    id: "sceneShadow";
    label: "Scene Shadows";
}> | Readonly<{
    description: "Controls character-local self-shadow proxy contribution until a dedicated self-shadow pass exists.";
    id: "selfShadow";
    label: "Self Shadow";
}> | Readonly<{
    description: "Adds averaged shadow visibility used for softer role-specific shadow damping.";
    id: "averageShadow";
    label: "Average Shadow";
}> | Readonly<{
    description: "Mixes ambient, hemisphere, and environment light into toon shading.";
    id: "indirectLight";
    label: "Indirect Light";
}> | Readonly<{
    description: "Controls point and spot light response for characters without overpowering cel bands.";
    id: "localLights";
    label: "Local Lights";
}> | Readonly<{
    description: "Adds view-dependent edge light that can be blocked or softened by shadow.";
    id: "rimLight";
    label: "Rim Light";
}> | Readonly<{
    description: "Adds thin screen-space contact shadows (hair-on-face, arm-on-torso) from the depth prepass.";
    id: "contactShadow";
    label: "Contact Shadow";
}> | Readonly<{
    description: "Adds role-aware stylized highlights and optional source specular masks.";
    id: "specular";
    label: "Specular";
}> | Readonly<{
    description: "Adds hair-specific highlight bands, optional anisotropic strand response, and source masks.";
    id: "hairHighlight";
    label: "Hair Highlight";
}> | Readonly<{
    description: "Adds role-aware eye/catchlight boosts and optional source masks.";
    id: "eyeHighlight";
    label: "Eye Highlight";
}> | Readonly<{
    description: "Routes source normal, AO, emissive, MatCap, ramp, detail, roughness, metalness, and specular maps.";
    id: "materialMaps";
    label: "Material Maps";
}> | Readonly<{
    description: "Controls the inverted-hull outline pass, including role-specific widths and colors.";
    id: "outline";
    label: "Outlines";
}> | Readonly<{
    description: "Adds procedural view-dependent sparkles for sparkly costumes and accessories. Off by default.";
    id: "glitter";
    label: "Glitter";
}> | Readonly<{
    description: "Blends a decal/overlay texture into the albedo before lighting (ice, tattoos, damage). Off by default.";
    id: "sticker";
    label: "Sticker";
}> | Readonly<{
    description: "Flattens perspective around the tracked head for anime-portrait closeups. Off by default.";
    id: "perspectiveRemoval";
    label: "Perspective Removal";
}> | Readonly<{
    description: "Opt-in shell fur for matched materials (collars, trims, animal parts). Off by default.";
    id: "fur";
    label: "Fur";
}>)[];
export const TOON_SETTING_GROUP_METADATA: Readonly<{
    [k: string]: Readonly<{
        description: "Preserves source texture, source material color, and saturation policy before toon lighting.";
        id: "baseTexture";
        label: "Base Texture";
    }> | Readonly<{
        description: "Classifies materials as skin, face, hair, eyes, costume, metal, transparent overlays, and outline.";
        id: "materialRoles";
        label: "Material Roles";
    }> | Readonly<{
        description: "Controls cutout, blend, opacity, eye overlay sorting, and transparent decoration behavior.";
        id: "alpha";
        label: "Alpha";
    }> | Readonly<{
        description: "Keeps skin and face shadows warm, readable, and separate from costume/hair shadows.";
        id: "skinTone";
        label: "Skin Tone";
    }> | Readonly<{
        description: "Overrides face-area cel response so noses, cheeks, and eyes do not receive harsh body shadows.";
        id: "faceLighting";
        label: "Face Lighting";
    }> | Readonly<{
        description: "Sets the primary directional cel band threshold, softness, and light-ignore amount.";
        id: "celShade";
        label: "Cel Shade";
    }> | Readonly<{
        description: "Tints and reshapes lit-to-shadow transitions and fully shadowed regions.";
        id: "shadowColor";
        label: "Shadow Color";
    }> | Readonly<{
        description: "Controls how renderer shadow maps darken character materials.";
        id: "sceneShadow";
        label: "Scene Shadows";
    }> | Readonly<{
        description: "Controls character-local self-shadow proxy contribution until a dedicated self-shadow pass exists.";
        id: "selfShadow";
        label: "Self Shadow";
    }> | Readonly<{
        description: "Adds averaged shadow visibility used for softer role-specific shadow damping.";
        id: "averageShadow";
        label: "Average Shadow";
    }> | Readonly<{
        description: "Mixes ambient, hemisphere, and environment light into toon shading.";
        id: "indirectLight";
        label: "Indirect Light";
    }> | Readonly<{
        description: "Controls point and spot light response for characters without overpowering cel bands.";
        id: "localLights";
        label: "Local Lights";
    }> | Readonly<{
        description: "Adds view-dependent edge light that can be blocked or softened by shadow.";
        id: "rimLight";
        label: "Rim Light";
    }> | Readonly<{
        description: "Adds thin screen-space contact shadows (hair-on-face, arm-on-torso) from the depth prepass.";
        id: "contactShadow";
        label: "Contact Shadow";
    }> | Readonly<{
        description: "Adds role-aware stylized highlights and optional source specular masks.";
        id: "specular";
        label: "Specular";
    }> | Readonly<{
        description: "Adds hair-specific highlight bands, optional anisotropic strand response, and source masks.";
        id: "hairHighlight";
        label: "Hair Highlight";
    }> | Readonly<{
        description: "Adds role-aware eye/catchlight boosts and optional source masks.";
        id: "eyeHighlight";
        label: "Eye Highlight";
    }> | Readonly<{
        description: "Routes source normal, AO, emissive, MatCap, ramp, detail, roughness, metalness, and specular maps.";
        id: "materialMaps";
        label: "Material Maps";
    }> | Readonly<{
        description: "Controls the inverted-hull outline pass, including role-specific widths and colors.";
        id: "outline";
        label: "Outlines";
    }> | Readonly<{
        description: "Adds procedural view-dependent sparkles for sparkly costumes and accessories. Off by default.";
        id: "glitter";
        label: "Glitter";
    }> | Readonly<{
        description: "Blends a decal/overlay texture into the albedo before lighting (ice, tattoos, damage). Off by default.";
        id: "sticker";
        label: "Sticker";
    }> | Readonly<{
        description: "Flattens perspective around the tracked head for anime-portrait closeups. Off by default.";
        id: "perspectiveRemoval";
        label: "Perspective Removal";
    }> | Readonly<{
        description: "Opt-in shell fur for matched materials (collars, trims, animal parts). Off by default.";
        id: "fur";
        label: "Fur";
    }>;
}>;
export const TOON_SETTING_FIELD_SCHEMA: Readonly<{
    [k: string]: Readonly<{
        [k: string]: Readonly<{
            defaultValue: any;
            description: string;
            group: any;
            id: string;
            key: any;
            label: any;
            optionLabels: any;
            options: any;
            range: any;
            serializable: boolean;
            type: any;
        }>;
    }>;
}>;
