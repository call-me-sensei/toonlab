# Settings reference

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Regenerate with: node scripts/generate-settings-reference.mjs -->

Every tunable field in the settings schemas, generated from the
`*_SETTING_GROUPS` / `*_SETTING_FIELD_SCHEMA` exports. The same schemas
drive the [debug panel](debug-panel.md) and lab inspectors. A lab may place
scene/runtime inputs in its Preview controls instead of the saved editor;
the **Portable** column makes that ownership explicit.

- [Character toon shading](#character-toon-shading)
- [Environment shading](#environment-shading)
- [Water](#water)
- [Post-processing](#post-processing)
- [Vegetation shader profile](#vegetation-shader-profile)
- [Grass](#grass)
- [Flowers](#flowers)
- [Trees](#trees)
- [Sky](#sky)
- [Paths, roads & bridges](#paths-roads-bridges)
- [Ambient VFX](#ambient-vfx)
- [Gameplay VFX](#gameplay-vfx)
- [Fauna](#fauna)
- [Buildings](#buildings)
- [Procedural textures](#procedural-textures)

## Character toon shading

Module: `toonlab/toon` — 23 groups, 298 fields.

Settings are nested per group: `createToonSettings({ rimLight: { intensity: 0.2 } })`.

### Character toon shading: Base Texture

Preserves source texture, source material color, and saturation policy before toon lighting.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `customSaturation` | number | `1` | 0 – 2 | Yes | Configures custom saturation for base texture. |
| `materialColorMode` | select | `'legacy'` | `legacy` \| `source` \| `texture` \| `white` | Yes | Sets the color used by material color mode. |
| `saturationMode` | select | `'legacy'` | `legacy` \| `source` \| `custom` | Yes | Selects the policy used by saturation mode. |

### Character toon shading: Alpha

Controls cutout, blend, opacity, eye overlay sorting, and transparent decoration behavior.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `blendCutoff` | number | `0.02` | 0 – 1 | Yes | Configures blend cutoff for alpha. |
| `costumeCutout` | boolean | `true` | — | Yes | Configures costume cutout for alpha. |
| `cutoutCutoff` | number | `0.35` | 0 – 1 | Yes | Configures cutout cutoff for alpha. |
| `ditherOpacity` | number | `1` | 0 – 1 | Yes | Configures dither opacity for alpha. |
| `enabled` | boolean | `true` | — | Yes | Turns alpha on or off. |
| `expressionTokenCutout` | boolean | `true` | — | Yes | Configures expression token cutout for alpha. |
| `eyeHighlightOrder` | number | `12` | -30 – 30 | Yes | Controls transparent draw order for eye highlight order. |
| `eyeOrder` | number | `11` | -30 – 30 | Yes | Controls transparent draw order for eye order. |
| `faceCutout` | boolean | `true` | — | Yes | Configures face cutout for alpha. |
| `hairCutout` | boolean | `true` | — | Yes | Configures hair cutout for alpha. |
| `mapTransparentCutout` | boolean | `true` | — | Yes | Configures map transparent cutout for alpha. |
| `overlayDepthWrite` | boolean | `false` | — | Yes | Configures overlay depth write for alpha. |
| `overlayOrder` | number | `20` | -30 – 30 | Yes | Controls transparent draw order for overlay order. |
| `preserveSourceAlphaTest` | boolean | `true` | — | Yes | Configures preserve source alpha test for alpha. |
| `scleraOrder` | number | `10` | -30 – 30 | Yes | Controls transparent draw order for sclera order. |
| `skinCutout` | boolean | `true` | — | Yes | Configures skin cutout for alpha. |
| `sortOverlays` | boolean | `true` | — | Yes | Configures sort overlays for alpha. |
| `sourceAlphaMapCutout` | boolean | `true` | — | Yes | Configures source alpha map cutout for alpha. |
| `sourceTransparentCutout` | boolean | `true` | — | Yes | Configures source transparent cutout for alpha. |
| `transparentOverlayBlend` | boolean | `true` | — | Yes | Configures transparent overlay blend for alpha. |
| `transparentOpacityThreshold` | number | `0.999` | 0 – 1 | Yes | Configures transparent opacity threshold for alpha. |

### Character toon shading: Skin Tone

Keeps skin and face shadows warm, readable, and separate from costume/hair shadows.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Turns skin tone on or off. |
| `faceMaxDirectLight` | number | `100` | 0 – 8 | Yes | Configures face max direct light for skin tone. |
| `faceMinimumIndirectLight` | number | `0.35` | 0 – 1 | Yes | Sets the minimum light floor for face minimum indirect light. |
| `faceShadowBrightness` | number | `1` | 0 – 2 | Yes | Configures face shadow brightness for skin tone. |
| `faceShadowSaturation` | number | `1` | 0 – 2 | Yes | Configures face shadow saturation for skin tone. |
| `faceShadowTint` | color | `[1, 0.92, 0.9]` (#ffebe6) | — | Yes | Sets the color used by face shadow tint. |
| `faceShadowTintStrength` | number | `1` | 0 – 8 | Yes | Controls the blend strength for face shadow tint strength. |
| `skinMaxDirectLight` | number | `100` | 0 – 8 | Yes | Configures skin max direct light for skin tone. |
| `skinMinimumIndirectLight` | number | `0.35` | 0 – 1 | Yes | Sets the minimum light floor for skin minimum indirect light. |
| `skinShadowBrightness` | number | `0.92` | 0 – 2 | Yes | Configures skin shadow brightness for skin tone. |
| `skinShadowSaturation` | number | `1` | 0 – 2 | Yes | Configures skin shadow saturation for skin tone. |
| `skinShadowTint` | color | `[1, 0.76, 0.74]` (#ffc2bd) | — | Yes | Sets the color used by skin shadow tint. |
| `skinShadowTintStrength` | number | `1` | 0 – 8 | Yes | Controls the blend strength for skin shadow tint strength. |

### Character toon shading: Face Lighting

Overrides face-area cel response so noses, cheeks, and eyes do not receive harsh body shadows.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Turns face lighting on or off. |
| `faceCelMidPoint` | number | `-0.48` | -1 – 1 | Yes | Moves the center point for face cel mid point. |
| `faceCelSoftness` | number | `0.22` | 0 – 1 | Yes | Controls transition softness for face cel softness. |
| `faceLocalLightLift` | number | `0.22` | 0 – 1 | Yes | Configures face local light lift for face lighting. |
| `faceMainLightIgnoreCelShade` | number | `0.45` | 0 – 1 | Yes | Configures face main light ignore cel shade for face lighting. |
| `faceNormalProxyBlend` | number | `0.75` | 0 – 1 | Yes | Configures face normal proxy blend for face lighting. |
| `faceProxyNormal` | vector3 | `[0, 0, 1]` | — | Yes | Configures face proxy normal for face lighting. |
| `faceSceneShadowStrength` | number | `0.5` | 0 – 8 | Yes | Controls the blend strength for face scene shadow strength. |
| `faceSphereBlend` | number | `0.75` | 0 – 1 | Yes | Configures face sphere blend for face lighting. |
| `headSpaceMode` | select | `'headBone'` | `static` \| `headBone` | Yes | Selects the policy used by head space mode. |

### Character toon shading: Cel Shade

Sets the primary directional cel band threshold, softness, and light-ignore amount.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `bodyCelMidPoint` | number | `0.06` | -1 – 1 | Yes | Moves the center point for body cel mid point. |
| `bodyCelSoftness` | number | `0.045` | 0 – 1 | Yes | Controls transition softness for body cel softness. |
| `bodyMainLightIgnoreCelShade` | number | `0.02` | 0 – 1 | Yes | Configures body main light ignore cel shade for cel shade. |
| `edgeAntiAliasStrength` | number | `1` | 0 – 8 | Yes | Controls the blend strength for edge anti alias strength. |
| `enabled` | boolean | `true` | — | Yes | Turns cel shade on or off. |

### Character toon shading: Shadow Color

Tints and reshapes lit-to-shadow transitions and fully shadowed regions.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Turns shadow color on or off. |
| `lowSaturationFallbackColor` | vector4 | `[0.3764706, 0.4141177, 0.5019608, 0]` | — | Yes | Sets the color used by low saturation fallback color. |
| `selfShadowAlbedoMulStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for self shadow albedo mul strength. |
| `selfShadowAreaHSVStrength` | number | `1` | 0 – 8 | Yes | Controls the blend strength for self shadow area h s v strength. |
| `selfShadowAreaHueOffset` | number | `0` | -1 – 1 | Yes | Configures self shadow area hue offset for shadow color. |
| `selfShadowAreaSaturationBoost` | number | `0.2` | 0 – 2 | Yes | Configures self shadow area saturation boost for shadow color. |
| `selfShadowAreaValueMul` | number | `0.68` | 0 – 2 | Yes | Configures self shadow area value mul for shadow color. |
| `selfShadowTintColor` | color | `[1, 1, 1]` (#ffffff) | — | Yes | Sets the color used by self shadow tint color. |
| `transitionAreaHueOffset` | number | `0.01` | -1 – 1 | Yes | Configures transition area hue offset for shadow color. |
| `transitionAreaIntensity` | number | `1` | 0 – 8 | Yes | Controls how strongly transition area intensity contributes. |
| `transitionAreaSaturationBoost` | number | `0.36` | 0 – 2 | Yes | Configures transition area saturation boost for shadow color. |
| `transitionAreaTintColor` | color | `[1, 1, 1]` (#ffffff) | — | Yes | Sets the color used by transition area tint color. |
| `transitionAreaValueMul` | number | `1` | 0 – 2 | Yes | Configures transition area value mul for shadow color. |

### Character toon shading: Scene Shadows

Controls how renderer shadow maps darken character materials.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `defaultMinLight` | number | `0.24` | 0 – 1 | Yes | Sets the minimum light floor for default min light. |
| `defaultStrength` | number | `0.76` | 0 – 8 | Yes | Controls the blend strength for default strength. |
| `enabled` | boolean | `true` | — | Yes | Turns scene shadows on or off. |
| `eyeMinLight` | number | `0.42` | 0 – 1 | Yes | Sets the minimum light floor for eye min light. |
| `eyeStrength` | number | `0.05` | 0 – 8 | Yes | Controls the blend strength for eye strength. |
| `faceMinLight` | number | `0.42` | 0 – 1 | Yes | Sets the minimum light floor for face min light. |
| `faceStrength` | number | `0.46` | 0 – 8 | Yes | Controls the blend strength for face strength. |
| `shadowAreaStrength` | number | `0.65` | 0 – 8 | Yes | Controls the blend strength for shadow area strength. |
| `skinMinLight` | number | `0.34` | 0 – 1 | Yes | Sets the minimum light floor for skin min light. |
| `skinStrength` | number | `0.62` | 0 – 8 | Yes | Controls the blend strength for skin strength. |

### Character toon shading: Self Shadow

Controls character-local self-shadow proxy contribution until a dedicated self-shadow pass exists.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `defaultMinLight` | number | `0.62` | 0 – 1 | Yes | Sets the minimum light floor for default min light. |
| `defaultStrength` | number | `0.22` | 0 – 8 | Yes | Controls the blend strength for default strength. |
| `enabled` | boolean | `true` | — | Yes | Turns self shadow on or off. |
| `eyeMinLight` | number | `1` | 0 – 1 | Yes | Sets the minimum light floor for eye min light. |
| `eyeStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for eye strength. |
| `faceMinLight` | number | `1` | 0 – 1 | Yes | Sets the minimum light floor for face min light. |
| `faceStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for face strength. |
| `hairMinLight` | number | `0.58` | 0 – 1 | Yes | Sets the minimum light floor for hair min light. |
| `hairStrength` | number | `0.26` | 0 – 8 | Yes | Controls the blend strength for hair strength. |
| `shadowAreaStrength` | number | `0.5` | 0 – 8 | Yes | Controls the blend strength for shadow area strength. |
| `skinMinLight` | number | `0.72` | 0 – 1 | Yes | Sets the minimum light floor for skin min light. |
| `skinStrength` | number | `0.16` | 0 – 8 | Yes | Controls the blend strength for skin strength. |
| `sourceMode` | select | `2` | `0` \| `1` \| `2` | Yes | Selects the policy used by source mode. |

### Character toon shading: Average Shadow

Adds averaged shadow visibility used for softer role-specific shadow damping.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `defaultMinLight` | number | `0.28` | 0 – 1 | Yes | Sets the minimum light floor for default min light. |
| `defaultStrength` | number | `0.28` | 0 – 8 | Yes | Controls the blend strength for default strength. |
| `enabled` | boolean | `false` | — | Yes | Turns average shadow on or off. |
| `measuredBlend` | number | `0.65` | 0 – 1 | Yes | Configures measured blend for average shadow. |
| `eyeMinLight` | number | `1` | 0 – 1 | Yes | Sets the minimum light floor for eye min light. |
| `eyeStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for eye strength. |
| `faceMinLight` | number | `1` | 0 – 1 | Yes | Sets the minimum light floor for face min light. |
| `faceStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for face strength. |
| `hairMinLight` | number | `0.3` | 0 – 1 | Yes | Sets the minimum light floor for hair min light. |
| `hairStrength` | number | `0.22` | 0 – 8 | Yes | Controls the blend strength for hair strength. |
| `skinMinLight` | number | `0.4` | 0 – 1 | Yes | Sets the minimum light floor for skin min light. |
| `skinStrength` | number | `0.18` | 0 – 8 | Yes | Controls the blend strength for skin strength. |
| `softness` | number | `0.35` | 0 – 1 | Yes | Configures softness for average shadow. |

### Character toon shading: Indirect Light

Mixes ambient, hemisphere, and environment light into toon shading.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `ambientTint` | color | `[0.86, 0.91, 1]` (#dbe8ff) | — | Yes | Sets the color used by ambient tint. |
| `defaultIntensity` | number | `0.35` | 0 – 8 | Yes | Controls how strongly default intensity contributes. |
| `defaultMinimumIndirectLight` | number | `0.35` | 0 – 1 | Yes | Sets the minimum light floor for default minimum indirect light. |
| `enabled` | boolean | `true` | — | Yes | Turns indirect light on or off. |
| `environmentIndirectLight` | number | `0.56` | 0 – 1 | Yes | Configures environment indirect light for indirect light. |
| `eyeIntensity` | number | `0.35` | 0 – 8 | Yes | Controls how strongly eye intensity contributes. |
| `eyeMinimumIndirectLight` | number | `0.35` | 0 – 1 | Yes | Sets the minimum light floor for eye minimum indirect light. |
| `faceIntensity` | number | `0.35` | 0 – 8 | Yes | Controls how strongly face intensity contributes. |
| `faceMinimumIndirectLight` | object | — | — | No — local/runtime | Sets the minimum light floor for face minimum indirect light. |
| `hairIntensity` | number | `0.35` | 0 – 8 | Yes | Controls how strongly hair intensity contributes. |
| `hairMinimumIndirectLight` | number | `0.35` | 0 – 1 | Yes | Sets the minimum light floor for hair minimum indirect light. |
| `hemisphereLightIntensity` | number | `0.42` | 0 – 8 | Yes | Controls how strongly hemisphere light intensity contributes. |
| `skinIntensity` | number | `0.35` | 0 – 8 | Yes | Controls how strongly skin intensity contributes. |
| `skinMinimumIndirectLight` | object | — | — | No — local/runtime | Sets the minimum light floor for skin minimum indirect light. |

### Character toon shading: Local Lights

Controls point and spot light response for characters without overpowering cel bands.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `defaultIntensity` | number | `0.72` | 0 – 8 | Yes | Controls how strongly default intensity contributes. |
| `defaultMaxContribution` | number | `0.34` | 0 – 1 | Yes | Configures default max contribution for local lights. |
| `defaultShadowLift` | number | `0.58` | 0 – 1 | Yes | Configures default shadow lift for local lights. |
| `enabled` | boolean | `true` | — | Yes | Turns local lights on or off. |
| `eyeIntensity` | number | `0.42` | 0 – 8 | Yes | Controls how strongly eye intensity contributes. |
| `eyeMaxContribution` | number | `0.18` | 0 – 1 | Yes | Configures eye max contribution for local lights. |
| `eyeShadowLift` | number | `0.9` | 0 – 1 | Yes | Configures eye shadow lift for local lights. |
| `faceIntensity` | number | `0.56` | 0 – 8 | Yes | Controls how strongly face intensity contributes. |
| `faceMaxContribution` | number | `0.24` | 0 – 1 | Yes | Configures face max contribution for local lights. |
| `faceShadowLift` | number | `0.84` | 0 – 1 | Yes | Configures face shadow lift for local lights. |
| `hairIntensity` | number | `0.72` | 0 – 8 | Yes | Controls how strongly hair intensity contributes. |
| `hairMaxContribution` | number | `0.34` | 0 – 1 | Yes | Configures hair max contribution for local lights. |
| `hairShadowLift` | number | `0.58` | 0 – 1 | Yes | Configures hair shadow lift for local lights. |
| `skinIntensity` | number | `0.64` | 0 – 8 | Yes | Controls how strongly skin intensity contributes. |
| `skinMaxContribution` | number | `0.3` | 0 – 1 | Yes | Configures skin max contribution for local lights. |
| `skinShadowLift` | number | `0.72` | 0 – 1 | Yes | Configures skin shadow lift for local lights. |

### Character toon shading: Rim Light

Adds view-dependent edge light that can be blocked or softened by shadow.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `blockByShadow` | number | `0.65` | 0 – 1 | Yes | Configures block by shadow for rim light. |
| `defaultIntensity` | number | `0.13` | 0 – 8 | Yes | Controls how strongly default intensity contributes. |
| `defaultTintColor` | color | `[0.82, 0.9, 1]` (#d1e6ff) | — | Yes | Sets the color used by default tint color. |
| `depthCloseWidthReduce` | number | `1` | 0 – 0.08 | Yes | Controls the width used by depth close width reduce. |
| `depthDottedLineFix` | boolean | `true` | — | Yes | Configures depth dotted line fix for rim light. |
| `depthFadeEndDistance` | number | `30` | 0 – 60 | Yes | Configures depth fade end distance for rim light. |
| `depthFadeRange` | number | `1` | 0 – 1 | Yes | Controls transition softness for depth fade range. |
| `depthFadeStartDistance` | number | `20` | 1 – 100 | Yes | Configures depth fade start distance for rim light. |
| `depthMask3D` | boolean | `false` | — | Yes | Configures depth mask3 d for rim light. |
| `depthSafeDistance` | number | `1` | 0 – 1 | Yes | Configures depth safe distance for rim light. |
| `depthThresholdOffset` | number | `0` | -1 – 1 | Yes | Configures depth threshold offset for rim light. |
| `depthWidth` | number | `1` | 0 – 0.08 | Yes | Controls the width used by depth width. |
| `enabled` | boolean | `true` | — | Yes | Turns rim light on or off. |
| `eyeIntensity` | number | `0.04` | 0 – 8 | Yes | Controls how strongly eye intensity contributes. |
| `faceIntensity` | number | `0.13` | 0 – 8 | Yes | Controls how strongly face intensity contributes. |
| `hairIntensity` | number | `0.23` | 0 – 8 | Yes | Controls how strongly hair intensity contributes. |
| `midPoint` | number | `0.48` | 0 – 1 | Yes | Configures mid point for rim light. |
| `mixWithBaseMapColor` | number | `0.35` | 0 – 1 | Yes | Sets the color used by mix with base map color. |
| `mode` | select | `'depthTexture'` | `fresnel` \| `depthTexture` | Yes | Configures mode for rim light. |
| `skinIntensity` | number | `0.13` | 0 – 8 | Yes | Controls how strongly skin intensity contributes. |
| `softness` | number | `0.1` | 0 – 1 | Yes | Configures softness for rim light. |

### Character toon shading: Contact Shadow

Adds thin screen-space contact shadows (hair-on-face, arm-on-torso) from the depth prepass.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Turns contact shadow on or off. |
| `strength` | number | `0.5` | 0 – 1 | Yes | Configures strength for contact shadow. |
| `faceHeadUpBlend` | number | `0` | 0 – 1 | Yes | Configures face head up blend for contact shadow. |
| `faceStrength` | number | `0.4` | 0 – 8 | Yes | Controls the blend strength for face strength. |
| `fadeRange` | number | `1` | 0 – 1 | Yes | Controls transition softness for fade range. |
| `thresholdOffset` | number | `0` | -1 – 1 | Yes | Configures threshold offset for contact shadow. |
| `width` | number | `1` | 0 – 1 | Yes | Configures width for contact shadow. |

### Character toon shading: Specular

Adds role-aware stylized highlights and optional source specular masks.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `defaultColor` | color | `[1, 0.96, 0.9]` (#fff5e6) | — | Yes | Sets the color used by default color. |
| `defaultIntensity` | number | `0.075` | 0 – 8 | Yes | Controls how strongly default intensity contributes. |
| `defaultMidPoint` | number | `0.72` | -1 – 1 | Yes | Moves the center point for default mid point. |
| `defaultPower` | number | `56` | 1 – 128 | Yes | Controls the sharpness of default power. |
| `defaultRange` | number | `0.12` | 0 – 1 | Yes | Controls transition softness for default range. |
| `defaultShowInShadowArea` | number | `0.25` | 0 – 1 | Yes | Configures default show in shadow area for specular. |
| `directionMode` | select | `'light'` | `light` \| `view` | Yes | Selects the policy used by direction mode. |
| `enabled` | boolean | `true` | — | Yes | Turns specular on or off. |
| `eyeIntensity` | number | `0.62` | 0 – 8 | Yes | Controls how strongly eye intensity contributes. |
| `eyeMidPoint` | number | `0.35` | -1 – 1 | Yes | Moves the center point for eye mid point. |
| `eyePower` | number | `18` | 1 – 128 | Yes | Controls the sharpness of eye power. |
| `eyeRange` | number | `0.18` | 0 – 1 | Yes | Controls transition softness for eye range. |
| `eyeShowInShadowArea` | number | `1` | 0 – 1 | Yes | Configures eye show in shadow area for specular. |
| `faceIntensity` | number | `0.025` | 0 – 8 | Yes | Controls how strongly face intensity contributes. |
| `hairIntensity` | number | `0.18` | 0 – 8 | Yes | Controls how strongly hair intensity contributes. |
| `hairPower` | number | `40` | 1 – 128 | Yes | Controls the sharpness of hair power. |
| `maskChannel` | select | `0` | `0` \| `1` \| `2` \| `3` | Yes | Configures mask channel for specular. |
| `maskMap` | texture | — | — | No — local/runtime | Configures mask map for specular. |
| `maskStrength` | number | `1` | 0 – 8 | Yes | Controls the blend strength for mask strength. |
| `metalIntensity` | number | `0.075` | 0 – 8 | Yes | Controls how strongly metal intensity contributes. |
| `skinIntensity` | number | `0.025` | 0 – 8 | Yes | Controls how strongly skin intensity contributes. |
| `sourceMaskMode` | select | `'off'` | `off` \| `source` | Yes | Selects the policy used by source mask mode. |

### Character toon shading: Hair Highlight

Adds hair-specific highlight bands, optional anisotropic strand response, and source masks.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `direction` | vector3 | `[0, 1, 0.15]` | — | Yes | Configures direction for hair highlight. |
| `enabled` | boolean | `true` | — | Yes | Turns hair highlight on or off. |
| `intensity` | number | `0.14` | 0 – 1 | Yes | Configures intensity for hair highlight. |
| `maskChannel` | select | `0` | `0` \| `1` \| `2` \| `3` | Yes | Configures mask channel for hair highlight. |
| `maskMap` | texture | — | — | No — local/runtime | Configures mask map for hair highlight. |
| `maskStrength` | number | `1` | 0 – 8 | Yes | Controls the blend strength for mask strength. |
| `mode` | select | `'legacy'` | `legacy` \| `anisotropic` | Yes | Configures mode for hair highlight. |
| `shadowFloor` | number | `0.35` | 0 – 1 | Yes | Configures shadow floor for hair highlight. |
| `sideBandPower` | number | `2` | 1 – 128 | Yes | Controls the sharpness of side band power. |
| `sourceMaskMode` | select | `'off'` | `off` \| `source` | Yes | Selects the policy used by source mask mode. |
| `strandPower` | number | `7` | 1 – 128 | Yes | Controls the sharpness of strand power. |
| `uvBandAxis` | select | `0` | `0` \| `1` | Yes | Configures uv band axis for hair highlight. |
| `uvBandCenter` | number | `0.5` | 0 – 1 | Yes | Configures uv band center for hair highlight. |
| `uvBandHalfWidth` | number | `0.5` | 0 – 0.08 | Yes | Controls the width used by uv band width. |
| `uvPreset` | select | `'center'` | `center` \| `full` \| `left` \| `right` \| `vertical` \| `wide` | Yes | Selects the policy used by uv preset. |

### Character toon shading: Eye Highlight

Adds role-aware eye/catchlight boosts and optional source masks.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `color` | color | `[1, 1, 1]` (#ffffff) | — | Yes | Configures color for eye highlight. |
| `enabled` | boolean | `true` | — | Yes | Turns eye highlight on or off. |
| `intensity` | number | `0.58` | 0 – 1 | Yes | Configures intensity for eye highlight. |
| `maskChannel` | select | `0` | `0` \| `1` \| `2` \| `3` | Yes | Configures mask channel for eye highlight. |
| `maskMap` | texture | — | — | No — local/runtime | Configures mask map for eye highlight. |
| `maskStrength` | number | `1` | 0 – 8 | Yes | Controls the blend strength for mask strength. |
| `power` | number | `22` | 0 – 44 | Yes | Configures power for eye highlight. |
| `showInShadowArea` | number | `0.4` | 0 – 1 | Yes | Configures show in shadow area for eye highlight. |
| `sourceMaskMode` | select | `'off'` | `off` \| `source` | Yes | Selects the policy used by source mask mode. |

### Character toon shading: Material Maps

Routes source normal, AO, emissive, MatCap, ramp, detail, roughness, metalness, and specular maps.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `aoStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for ao strength. |
| `detailRepeat` | vector2 | `[1, 1]` | — | Yes | Configures detail repeat for material maps. |
| `detailStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for detail strength. |
| `emissiveColor` | color | `[1, 1, 1]` (#ffffff) | — | Yes | Sets the color used by emissive color. |
| `emissiveStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for emissive strength. |
| `enabled` | boolean | `true` | — | Yes | Turns material maps on or off. |
| `matcapStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for matcap strength. |
| `metalnessStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for metalness strength. |
| `normalScale` | vector2 | `[1, 1]` | — | Yes | Configures normal scale for material maps. |
| `normalStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for normal strength. |
| `rampStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for ramp strength. |
| `roughnessStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for roughness strength. |
| `sourceMode` | select | `'source'` | `off` \| `source` | Yes | Selects the policy used by source mode. |
| `specularColorStrength` | number | `0` | 0 – 8 | Yes | Controls the blend strength for specular color strength. |

### Character toon shading: Outlines

Controls the inverted-hull outline pass, including role-specific widths and colors.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `defaultLightingMix` | number | `0.28` | 0 – 1 | Yes | Configures default lighting mix for outlines. |
| `defaultMaxBrightness` | number | `0.38` | 0 – 2 | Yes | Configures default max brightness for outlines. |
| `defaultMinBrightness` | number | `0.04` | 0 – 2 | Yes | Configures default min brightness for outlines. |
| `defaultTintColor` | color | `[0.34, 0.33, 0.4]` (#575466) | — | Yes | Sets the color used by default tint color. |
| `defaultWidth` | number | `0.002` | 0 – 0.08 | Yes | Controls the width used by default width. |
| `depthOffset` | number | `0` | -1 – 1 | Yes | Configures depth offset for outlines. |
| `depthTest` | boolean | `true` | — | Yes | Configures depth test for outlines. |
| `depthWrite` | boolean | `false` | — | Yes | Configures depth write for outlines. |
| `enabled` | boolean | `true` | — | Yes | Turns outlines on or off. |
| `eyeLightingMix` | number | `0.28` | 0 – 1 | Yes | Configures eye lighting mix for outlines. |
| `eyeMaxBrightness` | number | `0.38` | 0 – 2 | Yes | Configures eye max brightness for outlines. |
| `eyeMinBrightness` | number | `0.04` | 0 – 2 | Yes | Configures eye min brightness for outlines. |
| `eyeTintColor` | color | `[0.34, 0.33, 0.4]` (#575466) | — | Yes | Sets the color used by eye tint color. |
| `eyeWidth` | number | `0` | 0 – 0.08 | Yes | Controls the width used by eye width. |
| `faceLightingMix` | number | `0.28` | 0 – 1 | Yes | Configures face lighting mix for outlines. |
| `faceMaxBrightness` | number | `0.48` | 0 – 2 | Yes | Configures face max brightness for outlines. |
| `faceMinBrightness` | number | `0.04` | 0 – 2 | Yes | Configures face min brightness for outlines. |
| `faceTintColor` | color | `[0.62, 0.36, 0.34]` (#9e5c57) | — | Yes | Sets the color used by face tint color. |
| `faceWidth` | number | `0` | 0 – 0.08 | Yes | Controls the width used by face width. |
| `hairCutoutWidth` | number | `0` | 0 – 0.08 | Yes | Controls the width used by hair cutout width. |
| `hairLightingMix` | number | `0.08` | 0 – 1 | Yes | Configures hair lighting mix for outlines. |
| `hairMaxBrightness` | number | `0.68` | 0 – 2 | Yes | Configures hair max brightness for outlines. |
| `hairMinBrightness` | number | `0.085` | 0 – 2 | Yes | Configures hair min brightness for outlines. |
| `hairTintColor` | color | `[0.72, 0.78, 0.9]` (#b8c7e6) | — | Yes | Sets the color used by hair tint color. |
| `hairWidth` | number | `0.00055` | 0 – 0.08 | Yes | Controls the width used by hair width. |
| `maxWidth` | number | `0.006` | 0 – 0.08 | Yes | Controls the width used by max width. |
| `metalLightingMix` | number | `0.28` | 0 – 1 | Yes | Configures metal lighting mix for outlines. |
| `metalMaxBrightness` | number | `0.38` | 0 – 2 | Yes | Configures metal max brightness for outlines. |
| `metalMinBrightness` | number | `0.04` | 0 – 2 | Yes | Configures metal min brightness for outlines. |
| `metalTintColor` | color | `[0.34, 0.33, 0.4]` (#575466) | — | Yes | Sets the color used by metal tint color. |
| `metalWidth` | number | `0.002` | 0 – 0.08 | Yes | Controls the width used by metal width. |
| `polygonOffset` | boolean | `false` | — | Yes | Configures polygon offset for outlines. |
| `polygonOffsetFactor` | number | `1` | -1 – 1 | Yes | Configures polygon offset factor for outlines. |
| `polygonOffsetUnits` | number | `1` | -1 – 1 | Yes | Configures polygon offset units for outlines. |
| `referenceDistance` | number | `4` | 0.5 – 20 | Yes | Configures reference distance for outlines. |
| `referenceFov` | number | `40` | 10 – 120 | Yes | Configures reference fov for outlines. |
| `screenSpaceWidth` | number | `1` | 0 – 0.08 | Yes | Controls the width used by screen space width. |
| `smoothNormals` | boolean | `true` | — | Yes | Configures smooth normals for outlines. |
| `widthFadeDistance` | number | `12` | 1 – 100 | Yes | Configures width fade distance for outlines. |
| `skinLightingMix` | number | `0.28` | 0 – 1 | Yes | Configures skin lighting mix for outlines. |
| `skinMaxBrightness` | number | `0.48` | 0 – 2 | Yes | Configures skin max brightness for outlines. |
| `skinMinBrightness` | number | `0.04` | 0 – 2 | Yes | Configures skin min brightness for outlines. |
| `skinTintColor` | color | `[0.62, 0.36, 0.34]` (#9e5c57) | — | Yes | Sets the color used by skin tint color. |
| `skinWidth` | number | `0.001` | 0 – 0.08 | Yes | Controls the width used by skin width. |
| `transparentOverlayWidth` | number | `0` | 0 – 0.08 | Yes | Controls the width used by transparent overlay width. |
| `widthScale` | number | `1` | 0 – 4 | Yes | Configures width scale for outlines. |

### Character toon shading: Glitter

Adds procedural view-dependent sparkles for sparkly costumes and accessories. Off by default.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Turns glitter on or off. |
| `intensity` | number | `1` | 0 – 1 | Yes | Configures intensity for glitter. |
| `density` | number | `1` | 0 – 1 | Yes | Configures density for glitter. |
| `size` | number | `1` | 0 – 1 | Yes | Configures size for glitter. |
| `randomNormalStrength` | number | `0.5` | 0 – 8 | Yes | Controls the blend strength for random normal strength. |
| `showInShadowArea` | number | `0.15` | 0 – 1 | Yes | Configures show in shadow area for glitter. |
| `uvChannel` | select | `1` | `0` \| `1` | Yes | Configures uv channel for glitter. |
| `defaultIntensity` | number | `1` | 0 – 8 | Yes | Controls how strongly default intensity contributes. |
| `eyeIntensity` | number | `0` | 0 – 8 | Yes | Controls how strongly eye intensity contributes. |
| `faceIntensity` | number | `0` | 0 – 8 | Yes | Controls how strongly face intensity contributes. |
| `hairIntensity` | number | `0` | 0 – 8 | Yes | Controls how strongly hair intensity contributes. |
| `skinIntensity` | number | `0` | 0 – 8 | Yes | Controls how strongly skin intensity contributes. |

### Character toon shading: Sticker

Blends a decal/overlay texture into the albedo before lighting (ice, tattoos, damage). Off by default.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `blendMode` | select | `'normal'` | `normal` \| `add` \| `multiply` | Yes | Selects the policy used by blend mode. |
| `enabled` | boolean | `false` | — | Yes | Turns sticker on or off. |
| `map` | texture | — | — | No — local/runtime | Configures map for sticker. |
| `offset` | vector2 | `[0, 0]` | — | Yes | Configures offset for sticker. |
| `repeat` | vector2 | `[1, 1]` | — | Yes | Configures repeat for sticker. |
| `strength` | number | `1` | 0 – 1 | Yes | Configures strength for sticker. |
| `uvChannel` | select | `0` | `0` \| `1` | Yes | Configures uv channel for sticker. |

### Character toon shading: Perspective Removal

Flattens perspective around the tracked head for anime-portrait closeups. Off by default.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `amount` | number | `0` | 0 – 1 | Yes | Configures amount for perspective removal. |
| `enabled` | boolean | `false` | — | Yes | Turns perspective removal on or off. |
| `radius` | number | `1.4` | 0 – 2.8 | Yes | Configures radius for perspective removal. |
| `startHeight` | number | `0` | 0 – 1 | Yes | Configures start height for perspective removal. |
| `endHeight` | number | `1` | 0 – 1 | Yes | Configures end height for perspective removal. |

### Character toon shading: Fur

Opt-in shell fur for matched materials (collars, trims, animal parts). Off by default.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Turns fur on or off. |
| `shellCount` | number | `8` | 0 – 16 | Yes | Configures shell count for fur. |
| `length` | number | `0.02` | 0 – 1 | Yes | Configures length for fur. |
| `gravity` | number | `0.35` | 0 – 1 | Yes | Configures gravity for fur. |
| `density` | number | `3` | 0 – 6 | Yes | Configures density for fur. |
| `rootOffset` | number | `-0.2` | -1 – 1 | Yes | Configures root offset for fur. |
| `rootShade` | number | `0.55` | 0 – 1 | Yes | Configures root shade for fur. |
| `materials` | object | — | — | No — local/runtime | Configures materials for fur. |
| `roles` | object | — | — | No — local/runtime | Configures roles for fur. |

## Environment shading

Module: `toonlab/environment` — 2 groups, 76 fields.

Settings are `{ features, parameters }`: `createEnvironmentSettings({ parameters: { exposure: 0.95 } })`.

### Environment shading: Features

Enables or disables individual environment shader feature paths.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `alphaCutout` | boolean | `true` | — | Yes | Turns alpha cutout processing on or off for environment materials. |
| `alphaMap` | boolean | `true` | — | Yes | Turns alpha map processing on or off for environment materials. |
| `ambientLight` | boolean | `true` | — | Yes | Turns ambient light processing on or off for environment materials. |
| `ambientProbe` | boolean | `true` | — | Yes | Turns ambient probe processing on or off for environment materials. |
| `aoMap` | boolean | `true` | — | Yes | Turns ao map processing on or off for environment materials. |
| `aoOverlay` | boolean | `true` | — | Yes | Turns ao overlay processing on or off for environment materials. |
| `directionalLights` | boolean | `true` | — | Yes | Turns directional lights processing on or off for environment materials. |
| `emissive` | boolean | `true` | — | Yes | Turns emissive processing on or off for environment materials. |
| `emissiveMap` | boolean | `true` | — | Yes | Turns emissive map processing on or off for environment materials. |
| `foliageCutout` | boolean | `true` | — | Yes | Turns foliage cutout processing on or off for environment materials. |
| `heightFog` | boolean | `true` | — | Yes | Turns height fog processing on or off for environment materials. |
| `interiorOcclusion` | boolean | `true` | — | Yes | Turns interior occlusion processing on or off for environment materials. |
| `leftSideShadow` | boolean | `true` | — | Yes | Turns side shadow processing on or off for environment materials. |
| `lightMap` | boolean | `true` | — | Yes | Turns lightmap processing on or off for environment materials. |
| `normalMap` | boolean | `true` | — | Yes | Turns normal map processing on or off for environment materials. |
| `packedMap` | boolean | `true` | — | Yes | Turns packed map processing on or off for environment materials. |
| `planarReflection` | boolean | `true` | — | Yes | Turns floor reflection processing on or off for environment materials. |
| `pointLights` | boolean | `true` | — | Yes | Turns point lights processing on or off for environment materials. |
| `shadowMask` | boolean | `true` | — | Yes | Turns shadow mask processing on or off for environment materials. |
| `shadowMesh` | boolean | `true` | — | Yes | Turns shadow mesh processing on or off for environment materials. |
| `skyTint` | boolean | `true` | — | Yes | Turns sky tint processing on or off for environment materials. |
| `specular` | boolean | `true` | — | Yes | Turns specular processing on or off for environment materials. |
| `spotLights` | boolean | `true` | — | Yes | Turns spot lights processing on or off for environment materials. |
| `sunBoost` | boolean | `true` | — | Yes | Turns sun boost processing on or off for environment materials. |
| `untexturedGradient` | boolean | `true` | — | Yes | Turns untextured gradient processing on or off for environment materials. |
| `vertexAo` | boolean | `true` | — | Yes | Turns vertex ao processing on or off for environment materials. |
| `windowCutout` | boolean | `true` | — | Yes | Turns window cutout processing on or off for environment materials. |

### Environment shading: Shader Parameters

Overrides numeric environment shader uniforms. Auto values preserve material defaults.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `ambientProbeBlend` | number | — | 0 – 1 | Yes | Overrides ambient probe blend; leave unset in code to use the material default. |
| `ambientStrength` | number | — | 0 – 2 | Yes | Overrides ambient strength; leave unset in code to use the material default. |
| `ambientLightInfluence` | number | — | 0 – 2 | Yes | Overrides ambient influence; leave unset in code to use the material default. |
| `aoMapStrength` | number | — | 0 – 2 | Yes | Overrides ao map strength; leave unset in code to use the material default. |
| `aoWarmth` | number | — | 0 – 1 | Yes | Overrides ao warmth; leave unset in code to use the material default. |
| `bakedGlowStrength` | number | — | 0 – 2 | Yes | Overrides baked glow; leave unset in code to use the material default. |
| `cloudShadowCoverage` | number | — | 0 – 1 | Yes | Overrides cloud shadow coverage; leave unset in code to use the material default. |
| `cloudShadowScale` | number | — | 0 – 0.1 | Yes | Overrides cloud shadow scale; leave unset in code to use the material default. |
| `cloudShadowStrength` | number | — | 0 – 2 | Yes | Overrides cloud shadow; leave unset in code to use the material default. |
| `directLightStrength` | number | — | 0 – 2 | Yes | Overrides direct light; leave unset in code to use the material default. |
| `emissiveMapStrength` | number | — | 0 – 2 | Yes | Overrides emissive map strength; leave unset in code to use the material default. |
| `emissiveStrength` | number | — | 0 – 2 | Yes | Overrides emissive strength; leave unset in code to use the material default. |
| `exposure` | number | — | 0 – 2 | Yes | Overrides exposure; leave unset in code to use the material default. |
| `heightFogColor` | color | — | — | Yes | Overrides height fog color; leave unset in code to use the material default. |
| `heightFogDensity` | number | — | 0 – 0.5 | Yes | Overrides height fog density; leave unset in code to use the material default. |
| `heightFogFalloff` | number | — | 0.05 – 30 | Yes | Overrides height fog falloff; leave unset in code to use the material default. |
| `interiorOcclusionColor` | color | — | — | Yes | Overrides interior occlusion color; leave unset in code to use the material default. |
| `interiorOcclusionStrength` | number | — | 0 – 2 | Yes | Overrides interior occlusion strength; leave unset in code to use the material default. |
| `leftSideShadow` | number | — | 0 – 1 | Yes | Overrides side shadow; leave unset in code to use the material default. |
| `leftSideShadowColor` | color | — | — | Yes | Overrides side shadow color; leave unset in code to use the material default. |
| `lightMapLift` | number | — | 0 – 1 | Yes | Overrides lightmap lift; leave unset in code to use the material default. |
| `lightMapStrength` | number | — | 0 – 2 | Yes | Overrides lightmap strength; leave unset in code to use the material default. |
| `lightingInfluence` | number | — | 0 – 2 | Yes | Overrides lighting influence; leave unset in code to use the material default. |
| `normalMapStrength` | number | — | 0 – 2 | Yes | Overrides normal map strength; leave unset in code to use the material default. |
| `packedOcclusionStrength` | number | — | 0 – 2 | Yes | Overrides packed occlusion; leave unset in code to use the material default. |
| `planarReflectionFresnel` | number | — | 0.1 – 8 | Yes | Overrides floor reflection fresnel; leave unset in code to use the material default. |
| `planarReflectionStrength` | number | — | 0 – 2 | Yes | Overrides floor reflection strength; leave unset in code to use the material default. |
| `pointLightStrength` | number | — | 0 – 2 | Yes | Overrides point light; leave unset in code to use the material default. |
| `saturation` | number | — | 0 – 2 | Yes | Overrides saturation; leave unset in code to use the material default. |
| `shadeSoftness` | number | — | 0 – 1 | Yes | Overrides shade softness; leave unset in code to use the material default. |
| `shadeStrength` | number | — | 0 – 2 | Yes | Overrides shade strength; leave unset in code to use the material default. |
| `shadowLift` | number | — | 0 – 1 | Yes | Overrides shadow lift; leave unset in code to use the material default. |
| `sunShadowStrength` | number | — | 0 – 2 | Yes | Overrides sun shadow strength; leave unset in code to use the material default. |
| `shadowTintColor` | color | — | — | Yes | Overrides shadow tint; leave unset in code to use the material default. |
| `skyGroundTint` | color | — | — | Yes | Overrides sky ground tint; leave unset in code to use the material default. |
| `skyTintStrength` | number | — | 0 – 2 | Yes | Overrides sky tint strength; leave unset in code to use the material default. |
| `skyTopTint` | color | — | — | Yes | Overrides sky top tint; leave unset in code to use the material default. |
| `specularColor` | color | — | — | Yes | Overrides specular color; leave unset in code to use the material default. |
| `specularShininess` | number | — | 1 – 256 | Yes | Overrides specular shininess; leave unset in code to use the material default. |
| `specularSoftness` | number | — | 0 – 1 | Yes | Overrides specular softness; leave unset in code to use the material default. |
| `specularStrength` | number | — | 0 – 2 | Yes | Overrides specular strength; leave unset in code to use the material default. |
| `spotLightStrength` | number | — | 0 – 2 | Yes | Overrides spot light; leave unset in code to use the material default. |
| `sunBoost` | number | — | 0 – 1 | Yes | Overrides sun boost; leave unset in code to use the material default. |
| `sunBoostColor` | color | — | — | Yes | Overrides sun boost color; leave unset in code to use the material default. |
| `triplanarDetail` | number | — | 0 – 1 | Yes | Overrides triplanar detail; leave unset in code to use the material default. |
| `triplanarDetailScale` | number | — | 0.25 – 64 | Yes | Overrides triplanar detail scale; leave unset in code to use the material default. |
| `triplanarEdgeHighlight` | number | — | 0 – 1 | Yes | Overrides rock edge highlight; leave unset in code to use the material default. |
| `untexturedGradientStrength` | number | — | 0 – 2 | Yes | Overrides untextured gradient strength; leave unset in code to use the material default. |
| `vertexAoStrength` | number | — | 0 – 2 | Yes | Overrides vertex ao strength; leave unset in code to use the material default. |

## Water

Module: `toonlab/water` — 7 groups, 82 fields.

Flat authored settings for `WaterSurface`; live sun/sky and Weather wave energy compose through transient scene layers without changing portable `water.settings`. Quality is a construction-time graph policy.

### Water: Waves

Gerstner swell and detail ripple shaping.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `waveIntensity` | number | `0.25` | 0 – 1 | Yes | Authored baseline from glassy mirror (0) to storm swell (1); scene weather can transiently modulate it without changing the preset. |
| `waterLevel` | number | `0.36` | 0 – 4 | Yes | World-space rest height of the surface; waves and run-up displace around it. |
| `waveAmplitude` | number | `0.3` | 0 – 5 | Yes | Largest wave amplitude in meters at full intensity; 5 gives a 10 m crest-to-trough swell. |
| `shoalingDepth` | number | `1.4` | 0.05 – 12 | Yes | Column depth in meters at which waves reach full height; shallower water shrinks them (needs a bed height sampler). |
| `shorelineWaves` | number | `0.35` | 0 – 1 | Yes | Fraction of wave height that keeps rolling through the shallows as surf before dying at the waterline. |
| `shorelineRunup` | number | `0.6` | 0 – 3 | Yes | How far incoming waves wash a thin foam film up the beach; reach scales with wave energy. |
| `runupDistance` | number | `0` | 0 – 15 | Yes | Maximum horizontal reach in meters. Wave groups vary each event from 80–100%, and each backwash hands its endpoint into the next uprush. 0 lets wave energy decide. |
| `breakerEnabled` | boolean | `true` | — | Yes | Master switch for the breaker system; off removes the mesh and skips all breaker work (for perf A/B). |
| `breakerAmount` | number | `0` | 0 – 1 | Yes | Dedicated curling breaker shells along the break line; 0 disables the system (needs a bed height sampler). |
| `breakerCurl` | number | `0.8` | 0 – 1 | Yes | Lip pitch: 0 spills down the face, 1 curls a full surfable tunnel. |
| `breakerScale` | number | `1` | 0.25 – 3 | Yes | Shell height multiplier over the physical breaking height (0.72x column depth). |
| `breakerPeel` | number | `1` | 0 – 4 | Yes | How fast the barrel section travels sideways along the crest line. |
| `waveLength` | number | `7.5` | 1 – 120 | Yes | Longest wavelength in meters; smaller waves are derived from it. Big swells need long wavelengths to stay stable. |
| `waveSteepness` | number | `0.75` | 0 – 1.4 | Yes | Gerstner chop; higher values pinch crests sharper. |
| `waveSpeed` | number | `1` | 0 – 4 | Yes | Phase speed multiplier over the deep-water dispersion. |
| `waveDirection` | vector2 | `[1, 0.35]` | — | Yes | Main travel direction of the swell in the XZ plane. |
| `waveDirectionSpread` | number | `0.65` | 0 – 1 | Yes | 0 keeps all waves aligned (river); 1 spreads them omnidirectionally (open sea). The primary swell always follows Wave Direction exactly. |
| `waveSetPeriod` | number | `60` | 8 – 600 | Yes | Seconds between wave-set peaks at a fixed point; big waves arrive in groups, not every period. |
| `waveSetStrength` | number | `0.5` | 0 – 1 | Yes | Depth of the set/lull cycle: 0 = constant swell, 1 = the swell dies completely between sets. |
| `detailNormalStrength` | number | `0.32` | 0 – 2 | Yes | Strength of the procedural micro-ripple normal detail. |
| `detailScale` | number | `1.15` | 0.05 – 8 | Yes | Spatial frequency of the micro-ripple detail. |
| `flowDirection` | vector2 | `[0.72, -0.18]` | — | Yes | Scroll direction for detail ripples, foam noise, and sparkles. |
| `flowSpeed` | number | `0.3` | 0 – 4 | Yes | Scroll speed for surface detail; high values read as a river current. |

### Water: Surface

Water body color, refraction, and caustics.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `colorTone` | select | `'classic'` | `classic` \| `anime` \| `teal` \| `caribbean` \| `lagoon` \| `deepOcean` | Yes | Named body-color palette forced over the preset colors; classic returns control to the preset. |
| `shallowColor` | color | `[0.42, 0.85, 0.88]` (#6bd9e0) | — | Yes | Water tint right at the shoreline. |
| `midColor` | color | `[0.2, 0.62, 0.8]` (#339ecc) | — | Yes | Water tint at moderate depth. |
| `deepColor` | color | `[0.1, 0.38, 0.6]` (#1a6199) | — | Yes | Water tint where the bottom is no longer visible. |
| `depthFadeDistance` | number | `1` | 0.05 – 12 | Yes | Water column depth where the shallow tint gives way to mid. |
| `deepFadeDistance` | number | `2.2` | 0.05 – 24 | Yes | Additional depth where mid fades to the deep tint. |
| `opacity` | number | `0.8` | 0 – 1 | Yes | Base transparency when no scene color grab pass is bound. |
| `refractionStrength` | number | `0.35` | 0 – 2 | Yes | Screen-space distortion of the underwater scene. |
| `indexOfRefraction` | number | `1.333` | 1.0001 – 1.8 | Yes | Index of refraction used by the underwater Snell window and total internal reflection. |
| `underwaterTransmission` | number | `1` | 0 – 1 | Yes | Visibility of the real above-water scene through the surface from below. |
| `underwaterTintStrength` | number | `0.35` | 0 – 1 | Yes | Stylized water-color tint applied to the view through the surface. |
| `causticsStrength` | number | `0.55` | 0 – 3 | Yes | Brightness of the procedural voronoi caustics on the bottom. |
| `causticsScale` | number | `0.8` | 0.05 – 8 | Yes | Spatial frequency of the caustic web. |
| `causticsSpeed` | number | `0.6` | 0 – 4 | Yes | Animation speed of the caustic web. |

### Water: Foam

Shoreline foam, whitecaps, and wake foam.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `foamColor` | color | `[0.94, 1, 0.99]` (#f0fffc) | — | Yes | Color of all foam: shoreline, whitecaps, wakes, and splashes. |
| `foamAmount` | number | `1` | 0 – 2 | Yes | Offshore contact foam, whitecap, and wake gain. |
| `swashFoamAmount` | number | `1.15` | 0 – 2 | Yes | Independent gain for torn foam carried up and back down the beach. |
| `swashFoamLifetime` | number | `4` | 0.25 – 30 | Yes | Seconds fresh aerated swash foam remains before thinning into residue. |
| `swashFoamResidueLifetime` | number | `10` | 0.5 – 60 | Yes | Seconds fragmented beach foam persists and drifts after the active front passes. |
| `wetSandDryTime` | number | `120` | 2 – 600 | Yes | Seconds saturated sand takes to return to its dry color after the water retreats. |
| `wetSandDarkening` | number | `0.58` | 0 – 1 | Yes | How strongly remembered moisture darkens exposed sand. |
| `wetSandSheen` | number | `0.78` | 0 – 1 | Yes | Strength of the short-lived glossy water film left on freshly exposed sand. |
| `foamContactDistance` | number | `0.4` | 0.02 – 4 | Yes | Depth difference covered by the solid contact foam band. |
| `foamLineSpacing` | number | `0.55` | 0.05 – 4 | Yes | Spacing of the animated lapping foam lines off the shore. |
| `foamNoiseScale` | number | `0.6` | 0.05 – 8 | Yes | Breakup noise frequency for foam edges. |
| `whitecapAmount` | number | `0.05` | 0 – 1 | Yes | Coverage of breaking crests on open water. |
| `rippleFoamStrength` | number | `0.8` | 0 – 3 | Yes | Foam intensity left behind by interactive ripples and wakes. |

### Water: Lighting

Authored fallback sun/sky plus water-specific glint, fresnel, and reflection response.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `sunDirection` | vector3 | `[0.35, 0.8, 0.45]` | — | Yes | Authored fallback direction toward the sun when no live scene-light override is connected. |
| `sunColor` | color | `[1, 0.96, 0.86]` (#fff5db) | — | Yes | Authored fallback sun tint for glints, sparkles, and caustics; a live scene rig may replace it transiently. |
| `specularStrength` | number | `0.8` | 0 – 3 | Yes | Toon sun-glint intensity. |
| `specularShininess` | number | `150` | 4 – 2000 | Yes | Glint tightness; higher is smaller and sharper. |
| `specularStretch` | number | `0.35` | 0 – 0.95 | Yes | Elongates glints along the sun azimuth into a sparkling sun path. |
| `sparkleStrength` | number | `0.5` | 0 – 3 | Yes | Twinkling star-glint intensity. |
| `sparkleScale` | number | `1.5` | 0.1 – 16 | Yes | Density of the sparkle field. |
| `sparkleSpeed` | number | `1` | 0 – 6 | Yes | How quickly sparkles twinkle in and out. |
| `sunGlowStrength` | number | `0.85` | 0 – 3 | Yes | Sun disk glow in the procedural sky reflection. |
| `sceneShadowStrength` | number | `0.6` | 0 – 1 | Yes | How strongly cast shadows from rocks, trees, and the character darken the surface. |
| `fresnelStrength` | number | `0.9` | 0 – 2 | Yes | Grazing-angle reflectivity boost. |
| `fresnelPower` | number | `4.5` | 0.5 – 12 | Yes | Falloff of the fresnel band toward the horizon. |
| `fresnelBias` | number | `0.16` | 0 – 0.6 | Yes | Sky-tint floor at steep angles; higher reads more anime-blue. |
| `fresnelColor` | color | `[0.68, 0.9, 1]` (#ade6ff) | — | Yes | Additive rim tint at grazing angles. |
| `skyZenithColor` | color | `[0.5, 0.74, 0.98]` (#80bdfa) | — | Yes | Authored fallback procedural sky-reflection color overhead when no live scene sky is connected. |
| `skyHorizonColor` | color | `[0.86, 0.95, 1]` (#dbf2ff) | — | Yes | Authored fallback procedural sky-reflection color at the horizon when no live scene sky is connected. |
| `reflectionStrength` | number | `0.62` | 0 – 1.5 | Yes | Planar/sky reflection mix, weighted by fresnel. |
| `reflectionDistortion` | number | `0.04` | 0 – 0.3 | Yes | How much waves shatter the reflection. |
| `reflectionSoftness` | number | `0.55` | 0 – 1 | Yes | Blends sharp planar reflections toward the soft procedural sky (milky anime look). |

### Water: Ripples

Interactive ripple simulation response.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `rippleStrength` | number | `1` | 0 – 6 | Yes | Global multiplier for splash and wake impulses. |
| `rippleDamping` | number | `0.985` | 0.9 – 0.999 | Yes | Energy retained per frame; higher rings travel farther. |
| `ripplePropagation` | number | `11` | 1 – 40 | Yes | Travel speed of interactive rings across the surface. |
| `rippleHeightScale` | number | `1` | 0 – 4 | Yes | Vertical displacement of the interactive ripples. |
| `rippleFoamDecay` | number | `0.94` | 0.5 – 0.999 | Yes | How long wake foam lingers. |
| `rippleFoamGain` | number | `2.4` | 0 – 12 | Yes | How quickly motion generates wake foam. |

### Water: Splashes

Procedural splash droplets, spray, and rings.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `splashStrength` | number | `1` | 0 – 3 | Yes | Global multiplier for splash particle counts and energy. |
| `splashScale` | number | `1` | 0.1 – 4 | Yes | Physical size multiplier for droplets, spray, and rings. |
| `splashDropletCount` | number | `26` | 0 – 120 | Yes | Droplets emitted by a strength-1 splash. |
| `splashRingCount` | number | `2` | 0 – 4 | Yes | Expanding foam rings emitted per splash. |
| `splashColor` | color | `[0.97, 1, 1]` (#f7ffff) | — | Yes | Bright tone of droplets and spray. |
| `splashShadeColor` | color | `[0.62, 0.86, 0.95]` (#9edbf2) | — | Yes | Shadow tone of the two-tone splash shading. |

### Water: Quality

Shader quality tier gating caustics, sparkles, and noise octaves.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `quality` | select | `'high'` | `low` \| `medium` \| `high` | Yes | Named quality tier: low drops caustics and sparkles, high adds chromatic caustics and extra detail octaves. |

## Post-processing

Module: `toonlab/post` — 2 groups, 37 fields.

Settings are `{ features, parameters }`: `createPostProcessingSettings({ preset: "softAnime" })`.

### Post-processing: Features

Toggles for each optional screen-space effect in the final composite pass.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `bloom` | boolean | `false` | — | Yes | Adds glow around pixels brighter than the bloom threshold. |
| `colorGrade` | boolean | `false` | — | Yes | Applies exposure, contrast, saturation, and warmth grading. |
| `depthCue` | boolean | `false` | — | Yes | Fades distant pixels toward the depth cue color for atmospheric depth. |
| `enabled` | boolean | `false` | — | Yes | Forces the post-processing composite pass on, even with no individual effect active. |
| `motionBlur` | boolean | `false` | — | Yes | Blurs camera movement by reprojecting the previous frame (camera motion only). |
| `screenOutline` | boolean | `false` | — | Yes | Draws screen-space outlines from depth and luminance edges. |
| `vignette` | boolean | `false` | — | Yes | Darkens the frame toward the corners. |
| `verticalGrade` | boolean | `false` | — | Yes | Adds warm light at the top of the frame and darkening at the bottom. |

### Post-processing: Parameters

Tuning values used by the post-processing effects when their feature toggles are on.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `bloomBackgroundSuppress` | number | `1` | 0 – 2 | Yes | Scales bloom gathered from non-character pixels when a character mask is connected. |
| `bloomCharacterBoost` | number | `1` | 0 – 4 | Yes | Scales bloom gathered from character pixels when a character mask is connected. |
| `bloomLevels` | number | `5` | 2 – 8 | Yes | Number of mip levels in the pyramid bloom chain (pyramid mode only). |
| `bloomMode` | select | `'single'` | `single` \| `pyramid` | Yes | Selects the one-pass 9-tap bloom or the wider multi-pass pyramid bloom. |
| `bloomRadius` | number | `0.16` | 0 – 1 | Yes | Controls how far the bloom glow spreads from bright pixels. |
| `bloomStrength` | number | `0` | 0 – 2 | Yes | Controls how strongly bloom is added to the image. |
| `bloomThreshold` | number | `0.995` | 0 – 1 | Yes | Sets the luminance above which pixels start to bloom. |
| `bottomDark` | number | `0` | 0 – 1 | Yes | Darkens the lower part of the frame in the vertical grade. |
| `contrast` | number | `1` | 0 – 2 | Yes | Scales contrast around mid gray in the color grade. |
| `depthCueColor` | color | `[0.3371636150376657, 0.4735314961384573, 0.6866853124288864]` (#5679af) | — | Yes | Sets the color distant pixels fade toward. |
| `depthCueFar` | number | `24` | 0 – 200 | Yes | Sets the depth at which the depth cue reaches full strength. |
| `depthCueNear` | number | `1` | 0 – 50 | Yes | Sets the depth at which the depth cue starts to appear. |
| `depthCueStrength` | number | `0` | 0 – 1 | Yes | Controls how strongly distant pixels blend toward the depth cue color. |
| `exposure` | number | `1` | 0 – 4 | Yes | Multiplies overall image brightness in the color grade. |
| `lutMap` | texture | — | — | No — local/runtime | Optional 2D-strip color LUT texture (runtime only, not serialized). |
| `lutSize` | number | `0` | 0 – 64 | Yes | Slice size of the LUT strip; 0 derives it from the texture height. |
| `lutStrength` | number | `0` | 0 – 1 | Yes | Controls how strongly the LUT recolors the graded image. |
| `motionBlurStrength` | number | `0.55` | 0 – 2 | Yes | Scales the camera-reprojection blur distance along the motion vector. |
| `outlineColor` | color | `[0.005181516700061659, 0.006512090790025684, 0.010329823026364548]` (#010203) | — | Yes | Sets the color drawn on detected screen-space edges. |
| `outlineDepthStrength` | number | `0.16` | 0 – 2 | Yes | Controls how strongly depth discontinuities contribute to outlines. |
| `outlineLumaStrength` | number | `0.04` | 0 – 2 | Yes | Controls how strongly luminance edges contribute to outlines. |
| `outlineStrength` | number | `0` | 0 – 2 | Yes | Controls the overall opacity of screen-space outlines. |
| `saturation` | number | `1` | 0 – 2 | Yes | Scales color saturation in the color grade. |
| `strength` | number | `1` | 0 – 1 | Yes | Blends between the raw render and the full post-processing result. |
| `topLight` | number | `0` | 0 – 1 | Yes | Adds warm light to the upper part of the frame in the vertical grade. |
| `vignetteRadius` | number | `0.72` | 0 – 1 | Yes | Sets the distance from the frame center where the vignette starts. |
| `vignetteSoftness` | number | `0.34` | 0 – 1 | Yes | Controls the falloff width of the vignette edge. |
| `vignetteStrength` | number | `0` | 0 – 1 | Yes | Controls how strongly the vignette darkens the frame edges. |
| `warmth` | number | `0` | -1 – 1 | Yes | Shifts the color grade warmer (positive) or cooler (negative). |

## Vegetation shader profile

Module: `toonlab/vegetation` — 8 groups, 67 fields.

IP-wide grouped settings shared by semantic grass, foliage, flower, bark, and stem material roles. Asset albedo and current scene weather are separate inputs.

### Vegetation shader profile: Shared Lighting

IP-wide light and shadow treatment shared by every vegetation surface.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `shadowTint` | color | `[0.36, 0.4, 0.58]` (#5c6694) | — | Yes | Cool treatment tint mixed into shadowed vegetation without replacing its albedo. |
| `shadowTintStrength` | number | `1` | 0 – 1 | Yes | Strength of the shared shadow tint treatment. |
| `sunTintStrength` | number | `0.25` | 0 – 1 | Yes | How strongly the active sun color tints lit vegetation. |
| `skyFillStrength` | number | `0.08` | 0 – 0.5 | Yes | Shared sky-color fill in unlit vegetation regions. |
| `rimStrength` | number | `0.12` | 0 – 1 | Yes | View-dependent silhouette fill shared by vegetation surfaces. |
| `rimPower` | number | `3` | 0.5 – 12 | Yes | Falloff exponent of the shared vegetation rim. |

### Vegetation shader profile: Thin Surfaces

Lighting shared by thin blades, leaf cards, and petals.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `diffuseWrap` | number | `0.5` | 0 – 1 | Yes | Wraps direct light around thin surfaces so back faces remain readable. |
| `transmissionStrength` | number | `0.35` | 0 – 2 | Yes | Shared sunlight transmission through blades, leaves, and petals. |
| `transmissionPower` | number | `3.5` | 0.5 – 12 | Yes | Angular concentration of thin-surface transmission. |
| `transmissionShadowFloor` | number | `0.35` | 0 – 1 | Yes | Minimum transmission that remains inside cast or cloud shadow. |
| `normalUpBias` | number | `0` | 0 – 1 | Yes | Biases thin-surface shading normals toward world up. |
| `twoSidedLighting` | number | `1` | 0 – 1 | Yes | Blends back-face normals into the shared thin-surface lighting model. |

### Vegetation shader profile: Weather Response

How the IP shades wetness and snow; current weather amounts remain scene-owned.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `wetDarkening` | number | `0.15` | 0 – 1 | Yes | Maximum albedo darkening applied by wetness. |
| `wetDesaturation` | number | `0.05` | 0 – 1 | Yes | Maximum desaturation applied by wetness. |
| `wetHighlightStrength` | number | `0.2` | 0 – 1 | Yes | Stylized highlight added to wet vegetation. |
| `snowTint` | color | `[0.92, 0.96, 1]` (#ebf5ff) | — | Yes | IP snow tint blended over retained snow coverage. |
| `snowShadowStrength` | number | `0.65` | 0 – 1 | Yes | Shadow response retained by snow-covered vegetation. |
| `snowEdgeSoftness` | number | `0.2` | 0 – 1 | Yes | Softness of snow coverage transitions. |

### Vegetation shader profile: Grass

Grass-only lighting, gradient, dense-field, gust, and bend treatment.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `backlitStrength` | number | `0.4` | 0 – 1.5 | Yes | Grass transmission multiplier. |
| `sceneShadowResponse` | number | `0.7` | 0 – 1 | Yes | Grass response to renderer shadow visibility. |
| `cloudShadowResponse` | number | `0.35` | 0 – 1 | Yes | Grass response to the scene cloud-shadow field. |
| `bandThreshold` | number | `0.49` | 0 – 1 | Yes | Center of the grass direct-light toon transition. |
| `bandSoftness` | number | `0.1` | 0 – 0.5 | Yes | Width of the grass direct-light toon transition. |
| `shadowFloor` | number | `0.35` | 0 – 1 | Yes | Minimum grass brightness in full shadow. |
| `rootOcclusionStrength` | number | `0.36` | 0 – 1 | Yes | Dense-field darkening at blade roots. |
| `rootOcclusionHeight` | number | `0.62` | 0.01 – 1 | Yes | Blade height over which root occlusion fades. |
| `tipGradientStart` | number | `0.1` | 0 – 1 | Yes | Blade fraction where the root-to-tip material gradient begins. |
| `tipGradientEnd` | number | `0.95` | 0 – 1 | Yes | Blade fraction where the root-to-tip material gradient completes. |
| `colorVariationStrength` | number | `0.2` | 0 – 1 | Yes | Seeded blade luminance variation. |
| `gustSheenThreshold` | number | `0.78` | 0 – 1 | Yes | Gust value where the blade-tip sheen begins. |
| `gustSheenStrength` | number | `0.22` | 0 – 1 | Yes | Strength of the moving gust sheen. |
| `bendExponent` | number | `2` | 0.5 – 6 | Yes | Root-to-tip curve used by wind and interaction deformation. |
| `interactionResponse` | number | `1` | 0 – 2 | Yes | Grass deformation response to a scene-owned interaction field. |

### Vegetation shader profile: Foliage

Leaf-card and canopy-volume treatment.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `backlitStrength` | number | `0.35` | 0 – 1.5 | Yes | Foliage transmission multiplier. |
| `sceneShadowResponse` | number | `0.55` | 0 – 1 | Yes | Foliage response to renderer shadow visibility. |
| `cloudShadowResponse` | number | `0` | 0 – 1 | Yes | Foliage response to the scene cloud-shadow field. |
| `bandThreshold` | number | `0.47` | 0 – 1 | Yes | Center of the foliage direct-light toon transition. |
| `bandSoftness` | number | `0.18` | 0 – 0.5 | Yes | Width of the foliage direct-light toon transition. |
| `crestThreshold` | number | `0.72` | 0 – 1 | Yes | Center of the high crown-color crest band. |
| `crestSoftness` | number | `0.12` | 0 – 0.5 | Yes | Width of the high crown-color crest band. |
| `crownOcclusionStrength` | number | `0.2` | 0 – 1 | Yes | Additional darkening inside renderer-shadowed crowns. |
| `spriteLuminanceStrength` | number | `0.36` | 0 – 1 | Yes | Influence of painted leaf-sprite luminance. |
| `cardVariationStrength` | number | `0.16` | 0 – 1 | Yes | Seeded per-card luminance variation. |
| `transmissionPowerMultiplier` | number | `1` | 0.25 – 3 | Yes | Foliage multiplier over the shared thin-surface transmission concentration. |

### Vegetation shader profile: Flower

Shared petal/center treatment across mesh, cutout, procedural, and billboard flowers.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `backlitStrength` | number | `0.35` | 0 – 1.5 | Yes | Petal transmission multiplier. |
| `sceneShadowResponse` | number | `0.85` | 0 – 1 | Yes | Flower response to renderer shadow visibility. |
| `bandThreshold` | number | `0.5` | 0 – 1 | Yes | Center of the flower direct-light toon transition. |
| `bandSoftness` | number | `0.1` | 0 – 0.5 | Yes | Width of the flower direct-light toon transition. |
| `unlitPetalLift` | number | `0.35` | 0 – 1 | Yes | Petal-tinted floor for unlit petal faces. |
| `cupDarkeningStrength` | number | `0.1` | 0 – 1 | Yes | Stylized darkening toward curved petal edges. |
| `petalTransmissionMultiplier` | number | `1` | 0 – 2 | Yes | Flower-family multiplier over shared thin-surface transmission. |
| `centerLightResponse` | number | `0.8` | 0 – 2 | Yes | Direct-light response of flower centers relative to petals. |
| `centerShadowResponse` | number | `1` | 0 – 2 | Yes | Shadow response of flower centers relative to petals. |

### Vegetation shader profile: Bark / Woody Surface

Opaque woody treatment for trunks, branches, and roots.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `bandCount` | number | `3` | 2 – 6 | Yes | Cel bands across the woody light-to-shadow ramp. |
| `bandSoftness` | number | `0` | 0 – 1 | Yes | Continuous softness of woody toon-band transitions. |
| `shadowFloor` | number | `0.35` | 0 – 0.9 | Yes | Minimum brightness of a fully shadowed woody surface. |
| `sunTintStrength` | number | `0.15` | 0 – 1 | Yes | Sun-color tint applied to lit bark. |
| `skyFillStrength` | number | `0.04` | 0 – 0.5 | Yes | Sky-color fill applied to shaded bark. |
| `rimStrength` | number | `0` | 0 – 1 | Yes | View-dependent woody silhouette fill. |
| `specularStrength` | number | `0` | 0 – 1 | Yes | Stylized bark highlight strength. |
| `verticalShadeStrength` | number | `0` | 0 – 1 | Yes | World-up gradient used to ground trunks without changing their albedo. |

### Vegetation shader profile: Herbaceous Stem

Smooth herbaceous stem treatment, intentionally separate from woody bark.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `bandCount` | number | `3` | 2 – 6 | Yes | Cel bands across herbaceous stems. |
| `bandSoftness` | number | `0.08` | 0 – 1 | Yes | Softness of herbaceous stem toon bands. |
| `shadowFloor` | number | `0.42` | 0 – 0.9 | Yes | Minimum brightness of a fully shadowed stem. |
| `transmissionStrength` | number | `0.08` | 0 – 1 | Yes | Subtle light transmission through green stems. |
| `skyFillStrength` | number | `0.06` | 0 – 0.5 | Yes | Additional stem sky-color fill over the shared vegetation fill. |
| `rimStrength` | number | `0.02` | 0 – 1 | Yes | View-dependent stem silhouette fill. |

## Grass

Module: `toonlab/vegetation` — 9 groups, 22 fields.

Flat settings consumed by `new StylizedGrassField(options)` and `grass.applySettings(options)`. Portable grass preset v2 stores asset geometry, palette/material, and `windResponse` / `gustResponse`; current light, wind/gust field, cloud field, and push radius are scene/runtime inputs.

### Grass: Blades

Random blade dimensions baked into the instance attributes when the field is built. Construction-only.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `bladeHeightRange` | vector2 | `[0.16, 0.42]` | — | Yes | Min/max blade height in meters for placements without an explicit height. Construction-only: baked into instance attributes. |
| `bladeWidthRange` | vector2 | `[0.05, 0.085]` | — | Yes | Min/max blade width in meters for placements without an explicit width. Construction-only: baked into instance attributes. |

### Grass: Motion

Asset-level flexibility: how this grass responds when a scene supplies wind and gusts.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `windResponse` | number | `1` | 0 – 8 | Yes | Asset flexibility multiplier applied to the current scene wind strength. 1 preserves the authored baseline; 0 keeps blades still. |
| `gustResponse` | number | `1` | 0 – 4 | Yes | How strongly this grass follows gust bands relative to its regular wind sway. |

### Grass: Palette

The blades' coordinated base, tip, and material shadow colors — the grass's identity, whatever the scene lighting does. Magical blue grass welcome.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `baseColor` | color | `[0.42, 0.68, 0.24]` (#6bad3d) | — | Yes | Blade color at the root. |
| `tipColor` | color | `[0.74, 0.9, 0.42]` (#bde66b) | — | Yes | Blade color at the tip; blades gradient from base to tip. |

### Grass: Lighting

How the blades RESPOND to scene light — e.g. the backlit glow on blades between the camera and the sun.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `backlitStrength` | number | `0.3` | 0 – 2 | Yes | Translucent backlight boost when the camera looks toward the sun through the blades. |

### Grass: Shadows

Grass-material shadow strength and palette tint. The renderer and cloud-shadow fields themselves come from the scene.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `shadowStrength` | number | `0.9` | 0 – 1 | Yes | How strongly renderer shadow maps (trees, rocks, the character) darken blades. |
| `shadowTint` | color | `[0.42, 0.47, 0.62]` (#6b789e) | — | Yes | Grass material color approached in full scene or cloud shadow. Palette presets set it with base/tip colors; the IP-wide vegetation shadow treatment still layers over it. |

### Grass: Scene Light

Current sun direction/color and sky color supplied by the scene at runtime.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `sunDirection` | vector3 | `[0.35, 0.72, 0.42]` | — | No — scene/runtime | World-space direction toward the sun (normalized on apply). Match your main directional light. |
| `sunColor` | color | `[1, 0.96, 0.84]` (#fff5d6) | — | No — scene/runtime | Sunlight tint applied to lit blades. |
| `skyColor` | color | `[0.62, 0.78, 0.95]` (#9ec7f2) | — | No — scene/runtime | Ambient sky tint mixed into shaded blades. |

### Grass: Scene Wind

Current world wind and gust field supplied by weather or another scene system.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `windDirection` | vector2 | `[1, 0.3]` | — | No — scene/runtime | Current horizontal (XZ) heading the world wind blows toward. |
| `windSpeed` | number | `1` | 0 – 4 | No — scene/runtime | Current temporal speed of the world wind. |
| `windStrength` | number | `0.16` | 0 – 1 | No — scene/runtime | Current world wind amplitude before the asset response multiplier. |
| `gustFrequency` | number | `0.35` | 0 – 2 | No — scene/runtime | Current spatial frequency of the world gust bands. |
| `gustSpeed` | number | `1.6` | 0 – 6 | No — scene/runtime | Current travel speed of the world gust bands. |

### Grass: Cloud Field

Current drifting cloud-shadow field shared across terrain, water, and vegetation.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `cloudShadowStrength` | number | `0` | 0 – 1 | No — scene/runtime | Current strength of the shared procedural cloud-shadow field. 0 disables it. |
| `cloudShadowCoverage` | number | `0.45` | 0 – 1 | No — scene/runtime | Current fraction of the world covered by cloud shadow. |
| `cloudShadowScale` | number | `0.012` | 0.001 – 0.1 | No — scene/runtime | Current world-to-noise scale of the shared cloud pattern. |
| `cloudShadowVelocity` | vector2 | `[0.02, 0.006]` | — | No — scene/runtime | Current cloud-shadow drift in noise-space units per second. |

### Grass: Interaction

Current push target and influence radius supplied per scene or grass instance.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `pushRadius` | number | `0.9` | 0 – 3 | No — scene/runtime | Current radius in meters around the scene push target. |

## Flowers

Module: `toonlab/vegetation` — 3 groups, 7 fields.

Flat settings consumed by `new StylizedFlowerField(options)` and `flowers.applySettings(options)`.

### Flowers: Heads

Random head sizes baked into the instance attributes when the field is built. Construction-only.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `sizeRange` | vector2 | `[0.045, 0.08]` | — | Yes | Min/max head size in meters for placements without an explicit size. Construction-only: baked into instance attributes. |

### Flowers: Wind

Wind sway shared with the surrounding grass so heads and blades move together.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `windDirection` | vector2 | `[1, 0.3]` | — | Yes | Horizontal (XZ) heading the wind blows toward. Magnitude does not matter; use wind strength for amplitude. |
| `windSpeed` | number | `1` | 0 – 4 | Yes | How fast the head sway oscillates. |
| `windStrength` | number | `0.16` | 0 – 1 | Yes | How far flower heads bob with the wind. |

### Flowers: Appearance

Petal/center palette and scene-shadow darkening.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `petalColor` | color | `[1, 0.98, 0.92]` (#fffaeb) | — | Yes | Petal color of the procedural daisies. |
| `centerColor` | color | `[0.98, 0.8, 0.34]` (#facc57) | — | Yes | Center-disc color of the procedural daisies. |
| `shadowStrength` | number | `0.85` | 0 – 1 | Yes | How strongly renderer shadow maps darken flower heads. |

## Trees

Module: `toonlab/vegetation` — 5 groups, 68 fields.

Grouped settings consumed by `new StylizedTree(options)` and `tree.applySettings(options)`.

### Trees: Tree

Overall scale, seed, crown reach, leaf coverage, and canopy palette. Everything except the palette and trunk shadow flag bakes geometry at construction.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `size` | number | `1` | 0.2 – 6 | Yes | Overall tree multiplier (1 ≈ 3 m tree, 2 ≈ 6 m, 3+ large). Construction-only: also densifies canopy cards so leaves stay leaf-sized. |
| `seed` | number | `1` | 1 – 999 | Yes | Deterministic generation seed; the same options and seed always grow the same tree. Construction-only. |
| `canopyColor` | color | `[0.30196078431372547, 0.6352941176470588, 0.34509803921568627]` (#4da258) | — | Yes | Canopy base color; the lit/shadow/crown palette derives from it. Also accepts richer resolveCanopyColor specs (color lists, {from,to} blends, HSL ranges) resolved per seed. |
| `canopyPalette` | object | `'[object Object]'` | — | No — local/runtime | Optional explicit { lit, shadow, crown } tone overrides; unset tones derive from the canopy color. |
| `canopyWidth` | number | `1` | 0.3 – 2.5 | Yes | X-axis crown reach multiplier. Construction-only: shapes the blob layout. |
| `canopyDepth` | number | `1` | 0.3 – 2.5 | Yes | Z-axis crown reach multiplier. Construction-only: shapes the blob layout. |
| `canopyLayout` | object | `'[object Object]'` | — | No — local/construction | Optional createCanopyBlobs overrides (lobeCount, spread, flatten, coreRadius, ...). Construction-only. |
| `leafDensity` | number | `1` | 0.05 – 2 | Yes | Crown leaf coverage. Below ~0.9 see-through gap pockets open and branches read through; above 1 packs extra cards (and fatter tufts) for lush crowns. Construction-only. |
| `canopyScale` | number | `1` | 0.2 – 3 | Yes | Canopy-only scale relative to the trunk. Construction-only. |
| `leafPlacement` | select | `'canopy'` | `canopy` \| `tips` | Yes | canopy: solid leaf mass hiding interior wood. tips: bushes only at branch ends with bare limbs between them (Sumeru silhouette). Construction-only. |
| `trunkReceiveShadow` | boolean | `true` | — | Yes | Whether the bark receives shadow maps. Massive pale-limbed trees read better with this off. |

### Trees: Trunk

Trunk silhouette (bend, lean, twist, gnarl) shared by the skeleton grower and the classic curved-trunk generator. Construction-only.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `height` | number | `1.55` | 0.4 – 3 | Yes | Trunk height in meters (before the overall size multiplier). Construction-only. |
| `radiusBottom` | number | `0.19` | 0.05 – 0.6 | Yes | Trunk radius at the root flare in meters. Construction-only. |
| `radiusTop` | number | `0.085` | 0.02 – 0.3 | Yes | Trunk radius at the top in meters. Classic trunk generator (createTreeTrunkGeometry) only. Construction-only. |
| `bend` | number | `0.12` | 0 – 0.8 | Yes | Mid-trunk bow amplitude that returns toward center (S-curve) in meters. Construction-only. |
| `lean` | number | `0.16` | 0 – 1.2 | Yes | Off-vertical drift that accumulates toward the top, in meters. Construction-only. |
| `twist` | number | `0` | -4 – 4 | Yes | Y-rotation of the cross-section over the full height in radians; spirals the bark like wrung wood. Construction-only. |
| `gnarl` | number | `0` | 0 – 2 | Yes | High-frequency wiggle and radius bulges: 0 is a clean park tree, 1+ reads like an old bonsai. Construction-only. |
| `gnarlFrequencyXRange` | vector2 | `[4.2, 7.6]` | — | Yes | Seeded min/max wave count of the gnarl wiggle over the trunk height on the X axis. Classic trunk generator only. Construction-only. |
| `gnarlFrequencyZRange` | vector2 | `[3.1, 6.7]` | — | Yes | Seeded min/max wave count of the gnarl wiggle over the trunk height on the Z axis. Classic trunk generator only. Construction-only. |
| `gnarlAmplitude` | number | `0.16` | 0 – 0.5 | Yes | Meters of gnarl wiggle (and radius bulge fraction) per unit of gnarl. Classic trunk generator only. Construction-only. |
| `radialGnarlFrequency` | number | `9.3` | 0 – 20 | Yes | Wave count of the gnarl radius bulges (old-wood knuckles) over the trunk height. Classic trunk generator only. Construction-only. |
| `bendDirection` | number | — | -6.283 – 6.283 | Yes | World heading of the bow in radians; null/unset picks a seeded heading. Construction-only. |
| `leanOffset` | number | — | -6.283 – 6.283 | Yes | Lean heading relative to the bow in radians (PI pins a serpentine S-trunk); null/unset picks a seeded offset. Construction-only. |
| `radialSegments` | number | `10` | 3 – 16 | Yes | Cross-section segment count of the trunk tube. Classic trunk generator only. Construction-only. |
| `heightSegments` | number | `14` | 2 – 24 | Yes | Vertical segment count of the trunk tube. Classic trunk generator only. Construction-only. |
| `branchCount` | number | `2` | 0 – 6 | Yes | Number of stub branches near the top. Classic trunk generator only. Construction-only. |
| `branchLength` | number | `0.55` | 0 – 1.5 | Yes | Base branch length in meters. Classic trunk generator only. Construction-only. |
| `branchRadius` | number | `0.055` | 0 – 0.2 | Yes | Base branch radius in meters. Classic trunk generator only. Construction-only. |

### Trees: Skeleton

Space-colonization limb growth and bark mesh controls. Construction-only.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `generator` | select | `'limbs'` | `limbs` \| `branching` \| `drawn` | Yes | limbs: space-colonization growth toward the crown blobs (solid anime-style crowns). branching: recursive central-leader branching (open, realistic broadleaf/conifer silhouettes). drawn: no procedural wood at all — the tree is exactly the hand-drawn branchSpines (Tree Lab sketch mode). Construction-only. |
| `levels` | number | `3` | 1 – 4 | Yes | Recursion depth of the branching generator; each level subdivides into thinner children. Branching generator only. Construction-only. |
| `childrenCount` | number | `6` | 1 – 90 | Yes | Child branches sprouting along the trunk (deeper levels derive from it). Conifers use high counts (60-90) for dense whorled fronds. Branching generator only. Construction-only. |
| `branchAngle` | number | `55` | 10 – 130 | Yes | Child pitch away from the parent axis, in degrees. Past 90 points branches below horizontal (conifer fronds ~110). Branching generator only. Construction-only. |
| `branchStart` | number | `0.4` | 0 – 0.9 | Yes | Fraction of the trunk kept bare before children begin — real trees hold their crown off the ground. Branching generator only. Construction-only. |
| `lengthRatio` | number | `0.45` | 0.15 – 0.95 | Yes | Child branch length as a fraction of the trunk (deeper levels shorten from it). Branching generator only. Construction-only. |
| `radiusRatio` | number | `0.7` | 0.3 – 0.9 | Yes | Child radius as a fraction of the parent\u2019s radius at the attach point — radius continuity is what makes forks read as one tree. Branching generator only. Construction-only. |
| `gnarliness` | number | `0.15` | 0 – 0.6 | Yes | Random-walk curvature per growth section, amplified as branches thin: trunks stay stately, twigs wander. Branching generator only. Construction-only. |
| `forceStrength` | number | `0.02` | -0.08 – 0.15 | Yes | Growth force: every section steers toward vertical with 1/radius compliance. Positive sweeps tips skyward (broadleaf crowns); negative droops them (pines, willows). Branching generator only. Construction-only. |
| `conifer` | boolean | `false` | — | Yes | Evergreen behavior: branches taper fully and children shorten toward the top \u2014 the layered cone silhouette. Pair with high Children, Branch Angle ~110, negative Growth Force. Branching generator only. Construction-only. |
| `attractionCount` | number | `90` | 10 – 200 | Yes | Number of crown attraction points the limbs grow toward; more points grow more, finer limbs. Construction-only. |
| `segmentLength` | number | `0.3` | 0.1 – 0.8 | Yes | Growth step length in meters; shorter steps grow smoother, curvier limbs. Construction-only. |
| `influenceRadius` | number | `1.2` | 0.3 – 2.5 | Yes | How far an attraction point can pull on a growing limb, in meters. Construction-only. |
| `killRadius` | number | `0.42` | 0.1 – 1 | Yes | Distance at which a limb consumes an attraction point and stops growing toward it. Construction-only. |
| `maxSteps` | number | `48` | 4 – 96 | Yes | Growth iteration cap. Construction-only. |
| `maxNodes` | number | `140` | 20 – 400 | Yes | Skeleton node cap; lower keeps trees to a few clean limbs. Construction-only. |
| `radialSegments` | number | `8` | 3 – 16 | Yes | Cross-section segment count of each bark tube. Construction-only. |
| `tipRadius` | number | `0.03` | 0.005 – 0.15 | Yes | Radius of the thinnest twigs in meters; pipe-model radii grow from here toward the root. Construction-only. |
| `minLimbRadius` | number | `0.028` | 0 – 0.15 | Yes | Limbs thinner than this get no bark tube and are left to the leaves. Construction-only. |
| `attachmentTwigRadius` | number | `0.09` | 0 – 0.3 | Yes | Wood thinner than this sprouts leaf tufts in canopy mode. Construction-only. |
| `attractionReach` | number | — | 0 – 1 | Yes | How deep into each crown blob attraction points sample (fraction of blob radius); null/unset is automatic (0.65 canopy mode, 0.92 tips mode). Construction-only. |

### Trees: Canopy Cards

Leaf-card canopy geometry: card counts, tuft clusters, and shell fill. Construction-only.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `cardCount` | number | `170` | 20 – 600 | Yes | Base leaf-card count before density and coverage scaling; few LARGE overlapping cards keep the crown one fluffy mass. Construction-only. |
| `cardSizeRange` | vector2 | `[1, 1.6]` | — | Yes | Min/max leaf-cluster card size in meters. Construction-only. |
| `cardsPerCluster` | number | `5` | 1 – 20 | Yes | Cards per leaf tuft around each branch attachment. Construction-only. (In tips placement the built-in default becomes 9.) |
| `clusterRadius` | number | `0.48` | 0.1 – 1.5 | Yes | Radius in meters of each leaf tuft around its branch end. Construction-only. (In tips placement the built-in default becomes 0.62.) |
| `shellFill` | boolean | `true` | — | Yes | Fill the blob shells between tufts so the crown reads as one solid mass; off leaves bare wood between end bushes. Construction-only. (Tips placement turns this off by default.) |

### Trees: Foliage Material

Leaf material response: wind, sun, alpha cutout, scene and cloud shadows. Applies at runtime via applySettings.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `alphaCutoff` | number | `0.3` | 0 – 1 | Yes | Alpha-cutout threshold for the leaf sprite; low enough that mipmap-averaged alpha does not erode distant crowns. |
| `windDirection` | vector2 | `[1, 0.3]` | — | Yes | Horizontal (XZ) heading the canopy flutter drifts toward. |
| `windSpeed` | number | `1` | 0 – 4 | Yes | How fast the leaf-card flutter oscillates. |
| `windStrength` | number | `0.05` | 0 – 0.5 | Yes | How far leaf cards sway with the wind. |
| `sunDirection` | vector3 | `[0.35, 0.72, 0.42]` | — | Yes | World-space direction toward the sun. Match your main directional light. |
| `sunColor` | color | `[1, 0.96, 0.84]` (#fff5d6) | — | Yes | Sunlight tint applied to lit leaf cards. |
| `skyColor` | color | `[0.62, 0.78, 0.95]` (#9ec7f2) | — | Yes | Ambient sky tint mixed into shaded leaf cards. |
| `sceneShadowStrength` | number | `0.55` | 0 – 1 | Yes | How strongly renderer shadow maps shift the crown toward its shadow palette. 0 disables. |
| `backlitStrength` | number | `0.35` | 0 – 2 | Yes | Translucent glow on leaves between the camera and the sun. |
| `cloudShadowStrength` | number | `0` | 0 – 1 | Yes | How strongly drifting procedural cloud shadows darken the crown. 0 disables the effect. |
| `cloudShadowCoverage` | number | `0.45` | 0 – 1 | Yes | Fraction of the world covered by cloud shadow at any moment. |
| `cloudShadowScale` | number | `0.012` | 0.001 – 0.1 | Yes | World-to-noise scale of the cloud shadow pattern; smaller values give larger cloud shapes. |
| `cloudShadowVelocity` | vector2 | `[0.02, 0.006]` | — | Yes | Cloud shadow drift in noise-space units per second (world drift = velocity / scale). |

## Sky

Module: `toonlab/sky` — 5 groups, 47 fields.

47 schema fields: 46 portable Sky art settings plus non-portable compatibility `radius`. Lighting, Weather, and manual state compose through ordered runtime layers; deployment quality is a separate compile-time tier.

### Sky: Dome

Sky dome geometry. Construction-only.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `radius` | number | `100` | 10 – 1000 | No — local/construction | Sphere radius of the sky dome in meters. Construction-only: baked into the dome geometry; applySettings stores but does not rebuild it. |

### Sky: Gradient

Vertical zenith-to-horizon-to-ground gradient and horizon scattering.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `zenithColor` | color | `[0.28, 0.56, 0.92]` (#478feb) | — | Yes | Sky color straight up at the top of the dome. |
| `horizonColor` | color | `[0.78, 0.92, 1]` (#c7ebff) | — | Yes | Sky color at the horizon band. |
| `groundColor` | color | `[0.42, 0.48, 0.55]` (#6b7a8c) | — | Yes | Dome color below the horizon. |
| `zenithExponent` | number | `0.48` | 0.1 – 4 | Yes | Shape of the horizon-to-zenith gradient. Lower values bring the zenith color farther toward the horizon. |
| `groundExponent` | number | `0.55` | 0.1 – 4 | Yes | Shape of the mirrored below-horizon fade into the ground color. |
| `horizonBandSize` | number | `0.42` | 0.02 – 1 | Yes | Vertical size of the sun-side atmospheric scattering band around the horizon. |
| `horizonSunPower` | number | `5` | 0.5 – 20 | Yes | How tightly horizon scattering concentrates toward the sun direction. |
| `horizonScattering` | number | `0.5` | 0 – 1 | Yes | Strength of the bright sun-side atmospheric wedge at the horizon. |

### Sky: Sun

Sun disc position, size, tint, and glow halo.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `sunDirection` | vector3 | `[0.35, 0.8, 0.45]` | — | Yes | World-space direction toward the sun (normalized on apply). Match your main directional light. |
| `sunColor` | color | `[1, 0.95, 0.82]` (#fff2d1) | — | Yes | Tint of the sun disc and its glow. |
| `sunSize` | number | `0.026` | 0 – 0.2 | Yes | Angular size of the sun disc. |
| `sunDiscSoftness` | number | `0.5` | 0.01 – 1 | Yes | Fraction of the disc radius used for its anti-aliased painterly edge. |
| `sunDiscIntensity` | number | `2.4` | 0 – 8 | Yes | Brightness multiplier of the solid sun disc before the renderer tone map. |
| `sunGlowStrength` | number | `1` | 0 – 4 | Yes | Master intensity of the broad and core sun glow terms. |
| `sunGlowSpread` | number | `5` | 1 – 20 | Yes | Falloff power of the broad halo. Lower values spread the glow across more sky. |
| `sunGlowCoreSharpness` | number | `60` | 5 – 200 | Yes | Falloff power of the tight inner halo. Higher values make a smaller, sharper core. |
| `sunGlowBroadStrength` | number | `0.16` | 0 – 2 | Yes | Contribution of the broad halo inside the master glow strength. |
| `sunGlowCoreStrength` | number | `0.5` | 0 – 2 | Yes | Contribution of the tight inner halo inside the master glow strength. |
| `sunCloudOcclusionStrength` | number | `1` | 0 – 1 | Yes | How strongly dense cloud coverage hides the sun disc. 0 keeps the disc visible through cloud. |

### Sky: Clouds

Painterly two-tone procedural clouds.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `cloudCoverage` | number | `0.42` | 0 – 1 | Yes | Fraction of the sky filled by clouds. 0 clears the sky. |
| `cloudScale` | number | `1.6` | 0.1 – 6 | Yes | Noise scale of the cloud shapes; higher gives smaller, busier clouds. |
| `cloudSoftness` | number | `0.1` | 0.01 – 0.3 | Yes | Width of the painterly cloud silhouette transition. |
| `cloudProjection` | number | `0.22` | 0.05 – 0.8 | Yes | Perspective offset of the virtual cloud plane; higher values flatten clouds toward the horizon. |
| `cloudOpacity` | number | `1` | 0 – 1 | Yes | Overall blend opacity of the procedural cloud layer. |
| `cloudEdgeOpacity` | number | `0.65` | 0 – 1 | Yes | Opacity of the soft outer silhouette relative to the solid cloud core. |
| `cloudSpeed` | number | `1` | 0 – 4 | Yes | How fast the authored cloud layer drifts across the dome. |
| `cloudDirection` | vector2 | `[0.9615239476, 0.2747211279]` | — | Yes | Normalized horizontal drift direction of the authored cloud layer; speed is controlled separately. |
| `cloudSeed` | number | `0` | 0 – 1000 | Yes | Offsets the procedural cloud field to produce a different deterministic composition. |
| `cloudColor` | color | `[1, 1, 1]` (#ffffff) | — | Yes | Lit tone of the two-tone painterly clouds. |
| `cloudShadeColor` | color | `[0.68, 0.78, 0.92]` (#adc7eb) | — | Yes | Shaded underside tone of the two-tone painterly clouds. |
| `cloudShadeStrength` | number | `0.85` | 0 – 1 | Yes | Strength of the two-tone shaded underside. |
| `cloudShadeThreshold` | number | `0.02` | -0.3 – 0.3 | Yes | Noise-difference threshold that separates the lit and shaded cloud tones. |
| `cloudShadeSoftness` | number | `0.06` | 0.001 – 0.3 | Yes | Softness of the transition between the two cloud tones. |
| `cloudLightOffset` | number | `0.4` | 0 – 2 | Yes | Distance of the secondary noise sample toward the sun; controls the depth and directionality of cloud shading. |
| `cloudSilverLiningStrength` | number | `0.3` | 0 – 2 | Yes | Warm sun-colored lining added to cloud edges facing the sun. |
| `cloudSunPower` | number | `10` | 1 – 40 | Yes | Angular focus of the sun-colored cloud lining. |
| `cloudHorizonFade` | number | `0.16` | 0.02 – 0.8 | Yes | Altitude at which the cloud layer reaches full opacity above the horizon. |

### Sky: Stars

Procedural star field for night skies.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `starsStrength` | number | `0` | 0 – 2 | Yes | Brightness of the procedural star field. 0 (default) hides stars for daytime skies. |
| `starsColor` | color | `[1, 0.98, 0.92]` (#fffaeb) | — | Yes | Tint of the procedural star glints. |
| `starsSeed` | number | `0` | 0 – 1000 | Yes | Offsets the deterministic star pattern without changing density or size. |
| `starsDensity` | number | `0.28` | 0 – 1 | Yes | Fraction of candidate cells allowed to contain a visible star. |
| `starsScale` | number | `14` | 2 – 64 | Yes | Density scale of the projected star grid; higher values produce more, smaller cells. |
| `starsSize` | number | `0.06` | 0.005 – 0.2 | Yes | Size of each procedural star glint inside its cell. |
| `starsTwinkleStrength` | number | `0.8` | 0 – 1 | Yes | Depth of per-star brightness animation. 0 disables twinkle without hiding stars. |
| `starsTwinkleSpeed` | number | `1` | 0 – 4 | Yes | Speed multiplier of the seeded per-star twinkle animation. |
| `starsHorizonFade` | number | `0.24` | 0.04 – 1 | Yes | Altitude at which the star field reaches full brightness above the horizon. |

## Paths, roads & bridges

Module: `toonlab/pathgen` — 4 groups, 22 fields.

Grouped settings consumed by `createStylizedPaths({ settings })` and serialized in path recipes.

### Paths, roads & bridges: Routing

Cost-field router: how strongly slope and water repel routes, and how much existing paths attract reuse (forks and junctions).

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `pointCount` | number | `4` | 2 – 8 | Yes | Auto mode: number of destinations probed from the terrain and connected into a network. |
| `slopeCost` | number | `26` | 0 – 80 | Yes | How expensive climbing is for the router. Higher values hug contours and produce switchbacks instead of straight climbs. |
| `waterCost` | number | `14` | 2 – 60 | Yes | Cost multiplier for crossing water. High enough that routes only cross where a bridge is worth it, low enough that crossings still happen. |
| `reuseBonus` | number | `0.45` | 0 – 0.9 | Yes | Cost discount (0..1) on cells an earlier route already walks — the source of natural forks and shared trunk roads. |
| `gridStep` | number | `8` | 3 – 24 | Yes | Router grid resolution in meters. Smaller steps find finer detours and cost more to solve. |
| `shoreMargin` | number | `0.6` | 0 – 2 | Yes | Meters above the waterline a cell must be to count as dry land. |
| `loopChance` | number | `0.35` | 0 – 1 | Yes | Auto mode: chance to add one extra ring road beyond the spanning network. |

### Paths, roads & bridges: Ribbon

The walkable strip: width, hand-drawn wobble, edge skirts that tuck into the terrain, and the height-profile smoothing that flattens the walk.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `width` | number | `2.6` | 1 – 6 | Yes | Walkable ribbon width in meters (dirt trail 2–3, stone road 3–4). |
| `widthWobble` | number | `0.22` | 0 – 0.6 | Yes | Low-frequency width variation (0..1) for the hand-drawn look. 0 is a survey-straight road. |
| `edgeSkirt` | number | `1.1` | 0.2 – 2.5 | Yes | Extra meters each side that slope down and tuck under the terrain so the ribbon never floats on side slopes. |
| `lift` | number | `0.07` | 0.02 – 0.25 | Yes | Meters the ribbon rides above the height profile — the true-overlay offset that prevents z-fighting. |
| `smoothing` | number | `16` | 0 – 40 | Yes | Moving-average window in meters applied to the terrain height along the route; the flattened profile is what paths.heightAt reports. |
| `stepLength` | number | `2` | 1 – 5 | Yes | Meters between ribbon cross-sections. Smaller steps follow curves tighter and spend more triangles. |
| `edgeFade` | number | `1.4` | 0.2 – 4 | Yes | Meters past the ribbon edge over which maskAt falls from 1 to 0 — the band where grass and flowers thin out. |

### Paths, roads & bridges: Bridges

Arched plank bridges generated where a route crosses open water.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `arc` | number | `0.1` | 0 – 0.18 | Yes | Deck rise as a fraction of span length. 0 is a flat causeway, 0.14 a strong arched footbridge. |
| `railStyle` | select | `'posts'` | `posts` \| `beams` \| `none` | Yes | Bridge railing construction. |
| `postSpacing` | number | `2.2` | 1.2 – 4 | Yes | Meters between railing posts. |
| `minSpan` | number | `4` | 2 – 12 | Yes | Meters of open water a route must cross before a bridge is generated (shorter crossings ford instead). |
| `pierSpacing` | number | `7` | 4 – 16 | Yes | Long crossings get support piers to the bed every this many meters. |
| `deckClearance` | number | `1.1` | 0.3 – 3 | Yes | Minimum meters between the water level and the deck at mid-span. |

### Paths, roads & bridges: Stairs

Stepped stone segments swapped in where the route climbs steeply. Visual only — paths.heightAt stays a smooth ramp.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `slopeThreshold` | number | `0.45` | 0.2 – 0.9 | Yes | Rise-over-run along the route beyond which the ribbon switches to stepped stone segments. |
| `stepHeight` | number | `0.19` | 0.12 – 0.3 | Yes | Riser height of generated steps in meters. |

## Ambient VFX

Module: `toonlab/ambientfx` — 6 groups, 54 fields.

Settings are nested per group: `createAmbientFx({ settings: { fireflies: { blinkSpeed: 0.8 } } })`. Effect entries in `effects` override their group; `density` there is a multiplier.

### Ambient VFX: Shared

Wind, sun, and the follow-window every effect emits into. Match windDirection/windSpeed/windStrength with the grass and tree wind so the whole world blows the same way.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `windDirection` | vector2 | `[1, 0.3]` | — | Yes | Horizontal (XZ) heading the wind blows toward — share with grass/trees. Magnitude is ignored. |
| `windSpeed` | number | `1` | 0 – 4 | Yes | How fast wind-driven motion oscillates and mist scrolls. |
| `windStrength` | number | `0.16` | 0 – 1 | Yes | How far particles drift downwind. |
| `sunDirection` | vector3 | `[0.35, 0.72, 0.42]` | — | Yes | World-space direction toward the sun (normalized on apply); drives the pollen backlight and petal sheen. |
| `windowRadius` | number | `45` | 15 – 120 | Yes | Meters of the follow window particles exist in around the follow target. Construction-only. |
| `maxParticles` | number | `20000` | 1000 – 40000 | Yes | Hard budget; effect densities are scaled down proportionally when their sum would exceed it. Construction-only. |

### Ambient VFX: Petals

Flutter-falling blossom petals. Emit from registered bloom volumes (flowering canopies) when any exist, otherwise from the open air above the ground.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `density` | number | `0.03` | 0 – 0.15 | Yes | Petals per m³ of the emission volume. |
| `canopyDensity` | number | `4.5` | 0 – 20 | Yes | Petals per m³ inside registered bloom volumes (crowns shed far more than open air). |
| `sizeRange` | vector2 | `[0.06, 0.11]` | — | Yes | Min/max petal size in meters. |
| `colorA` | color | `[1, 0.52, 0.68]` (#ff85ad) | — | Yes | Primary petal color. |
| `colorB` | color | `[1, 0.75, 0.84]` (#ffbfd6) | — | Yes | Secondary petal color; each petal picks between the two. |
| `emitHeight` | vector2 | `[2, 9]` | — | Yes | Min/max meters above ground petals spawn at when not bound to canopies. Construction-only. |
| `flutter` | number | `1` | 0 – 3 | Yes | Side-to-side rocking amplitude while falling. |
| `windResponse` | number | `1` | 0 – 3 | Yes | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'day'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | Yes | When the effect is visible; weights follow the environmentTimeOfDay hour. |

### Ambient VFX: Falling Leaves

Tumble-falling leaves with strong gust response. Emit from bloom volumes tagged effect:"leaves", otherwise globally.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `density` | number | `0.022` | 0 – 0.15 | Yes | Leaves per m³ of the emission volume. |
| `canopyDensity` | number | `3.2` | 0 – 20 | Yes | Leaves per m³ inside bloom volumes tagged effect:"leaves". |
| `sizeRange` | vector2 | `[0.09, 0.16]` | — | Yes | Min/max leaf size in meters. |
| `colorA` | color | `[0.93, 0.64, 0.2]` (#eda333) | — | Yes | Primary leaf color. |
| `colorB` | color | `[0.78, 0.4, 0.13]` (#c76621) | — | Yes | Secondary leaf color; each leaf picks between the two. |
| `emitHeight` | vector2 | `[2, 10]` | — | Yes | Min/max meters above ground leaves spawn at when not bound to canopies. Construction-only. |
| `tumble` | number | `1` | 0 – 3 | Yes | Rotational tumbling speed while falling. |
| `windResponse` | number | `1.35` | 0 – 3 | Yes | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'any'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | Yes | When the effect is visible; weights follow the environmentTimeOfDay hour. |

### Ambient VFX: Fireflies

Hovering, blinking emissive motes over grass and shore margins. Unlit by design; they ramp with the time-of-day dusk.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `density` | number | `0.045` | 0 – 0.2 | Yes | Fireflies per m³ of the near-ground hover band. |
| `sizeRange` | vector2 | `[0.13, 0.2]` | — | Yes | Min/max glow-sprite size in meters. |
| `color` | color | `[1, 0.87, 0.42]` (#ffde6b) | — | Yes | Emissive glow color (unlit; never touched by scene lights). |
| `hoverHeight` | vector2 | `[0.25, 2.2]` | — | Yes | Min/max meters above ground fireflies hover at. Construction-only. |
| `hoverRadius` | number | `0.9` | 0 – 4 | Yes | Meters of wander around each spawn point. |
| `blinkSpeed` | number | `1` | 0 – 4 | Yes | How fast the blink program pulses. |
| `intensity` | number | `1` | 0 – 4 | Yes | Emissive brightness multiplier. |
| `windResponse` | number | `0.1` | 0 – 3 | Yes | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'duskNight'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | Yes | When the effect is visible; weights follow the environmentTimeOfDay hour. |

### Ambient VFX: Pollen Motes

Slow curl-drifting dust motes, brightest looking toward the sun (backlit). Bind to flower masks via the effects config.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `density` | number | `0.06` | 0 – 0.3 | Yes | Motes per m³ of the near-ground drift band. |
| `sizeRange` | vector2 | `[0.045, 0.085]` | — | Yes | Min/max mote size in meters. |
| `color` | color | `[1, 0.93, 0.72]` (#ffedb8) | — | Yes | Mote color (additive, so it reads as light). |
| `hoverHeight` | vector2 | `[0.3, 2.6]` | — | Yes | Min/max meters above ground motes drift at. Construction-only. |
| `driftRadius` | number | `1.3` | 0 – 5 | Yes | Meters of curl-drift wander around each spawn point. |
| `backlitStrength` | number | `1` | 0 – 3 | Yes | Brightness boost when the camera looks toward the sun through the motes. |
| `windResponse` | number | `0.5` | 0 – 3 | Yes | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'day'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | Yes | When the effect is visible; weights follow the environmentTimeOfDay hour. |

### Ambient VFX: Ground Mist

Soft horizontal wisps scrolling with the wind, hugging water margins and low ground at dawn/dusk.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `density` | number | `0.0045` | 0 – 0.02 | Yes | Wisps per m³ of the ground-hugging band — a few dozen quads, not thousands. |
| `sizeRange` | vector2 | `[1.6, 3]` | — | Yes | Min/max wisp height in meters (width is ~3–5× the height). |
| `color` | color | `[0.84, 0.9, 0.97]` (#d6e6f7) | — | Yes | Wisp color. |
| `opacity` | number | `0.34` | 0 – 0.6 | Yes | Peak alpha at a wisp center; the sprite falls off softly from there. |
| `scrollSpan` | number | `26` | 5 – 60 | Yes | Meters a wisp travels downwind before wrapping (fades at both ends). |
| `marginWidth` | number | `7` | 1 – 20 | Yes | Meters of \|ground − waterLevel\| that count as the water-margin emission band. Construction-only. |
| `windResponse` | number | `1` | 0 – 3 | Yes | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'dawnDusk'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | Yes | When the effect is visible; weights follow the environmentTimeOfDay hour. |

## Gameplay VFX

Module: `toonlab/vfxgen` — 6 groups, 47 fields.

Settings are nested per group: `createVfxSystem({ settings: { impact: { sparkCount: 40 } } })`. Per-spawn `look` overrides re-tint one spawn without touching settings.

### Gameplay VFX: Shared

Budgets and global pacing for every effect. The one-shot backbone renders all bursts in two draw calls; these bound its ring buffers and the pooled trail/projectile meshes.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `maxParticles` | number | `4096` | 256 – 32768 | Yes | Ring-buffer capacity of the one-shot backbone (sparks, embers, puffs, rings, flashes). Oldest instances are overwritten first. Construction-only. |
| `maxProjectiles` | number | `8` | 1 – 32 | Yes | Pooled projectile core meshes (fireballs in flight). Spawns beyond this reuse the oldest. Construction-only. |
| `maxTrails` | number | `8` | 1 – 32 | Yes | Pooled slash-trail ribbons live at once. Spawns beyond this reuse the oldest. Construction-only. |
| `timeScale` | number | `1` | 0 – 2 | Yes | Global VFX clock multiplier — hit-stop and slow-motion hooks feed this. |

### Gameplay VFX: Slash Trail

Weapon-swing ribbon sampled from a followed blade (base + tip anchors), with a stepped toon fade and edge sparkle. The anime arc smear.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `color` | color | `[0.55, 0.8, 1]` (#8cccff) | — | Yes | The solid body of the arc — the flat saturated fill. |
| `coreColor` | color | `[1, 1, 1]` (#ffffff) | — | Yes | Leading-edge band color along the blade-tip side; white body+edge banding is the reference action-RPG read. |
| `lifetime` | number | `0.28` | 0.05 – 1.5 | Yes | Seconds a ribbon segment persists before the tail erodes over it. |
| `bands` | number | `3` | 1 – 8 | Yes | Cel quantization of the tail erosion sweep — fewer bands, chunkier stepped tail. |
| `intensity` | number | `1` | 0 – 4 | Yes | Emissive brightness multiplier on the glow parts. |
| `sparkle` | number | `60` | 0 – 300 | Yes | Sparks per second shed from the blade tip while the trail is active. |
| `segments` | number | `96` | 8 – 256 | Yes | Ribbon history capacity in spline points — longer fast swings need more. Construction-only. |

### Gameplay VFX: Impact Burst

Hit feedback: a radial star flash plus ballistic sparks with gravity. `power` at spawn scales count, speed, and flash size.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `sparkColor` | color | `[1, 0.85, 0.45]` (#ffd973) | — | Yes | Ballistic spark color (additive). |
| `flashColor` | color | `[1, 0.97, 0.88]` (#fff7e0) | — | Yes | Radial star-flash color at the hit point. |
| `sparkCount` | number | `26` | 0 – 120 | Yes | Sparks per burst at power 1; spawn `power` scales this. |
| `sparkSpeed` | number | `7` | 0 – 30 | Yes | Initial spark speed in m/s, biased along the hit normal. |
| `gravity` | number | `18` | 0 – 60 | Yes | Downward pull on sparks in m/s² — high values read as metal chips. |
| `flashSize` | number | `0.9` | 0 – 4 | Yes | Star-flash quad size in meters at power 1. |
| `spikes` | number | `6` | 3 – 12 | Yes | Point count of the star flash — 4 reads as an action-RPG glint, 6–8 as an anime hit star. |
| `shockwave` | boolean | `true` | — | Yes | Camera-facing expanding ring at the hit point — the action-RPG hit circle. Tinted by Flash Color. |
| `lifetime` | number | `0.5` | 0.05 – 2 | Yes | Seconds sparks live (the flash pops in about a quarter of this). |
| `intensity` | number | `1` | 0 – 4 | Yes | Emissive brightness multiplier on the glow parts. |

### Gameplay VFX: Fireball

Projectile: a flame-shaded core billboard shedding embers in flight; explodes into an impact burst, smoke puffs, and an expanding scorch ring.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `coreSize` | number | `0.42` | 0.05 – 2 | Yes | Flame-core billboard radius in meters. |
| `coreColor` | color | `[1, 0.95, 0.6]` (#fff299) | — | Yes | Hot center of the flame shader. |
| `flameColor` | color | `[1, 0.45, 0.12]` (#ff731f) | — | Yes | Outer flame licks and ember tint. |
| `emberRate` | number | `90` | 0 – 400 | Yes | Embers shed per second while the projectile flies. |
| `emberSize` | vector2 | `[0.05, 0.12]` | — | Yes | Min/max ember size in meters. |
| `emberLifetime` | number | `0.55` | 0.05 – 2 | Yes | Seconds each shed ember lives. |
| `intensity` | number | `1.2` | 0 – 4 | Yes | Emissive brightness multiplier on the glow parts. |
| `explosionPower` | number | `1.6` | 0 – 5 | Yes | `power` handed to the impact burst + smoke on detonation. |
| `scorchRing` | boolean | `true` | — | Yes | Expanding ground ring on detonation. |
| `ringColor` | color | `[1, 0.55, 0.2]` (#ff8c33) | — | Yes | Scorch-ring glow color. |

### Gameplay VFX: Footstep Dust

Small chunky dust puffs kicked up at a footfall. Cheap enough to fire every step.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `puffCount` | number | `5` | 0 – 20 | Yes | Dust puffs per footfall. |
| `sizeRange` | vector2 | `[0.1, 0.22]` | — | Yes | Min/max puff size in meters (puffs grow ~2× over life). |
| `color` | color | `[0.78, 0.72, 0.62]` (#c7b89e) | — | Yes | Dust color — sample the ground palette. |
| `lifetime` | number | `0.55` | 0.05 – 2 | Yes | Seconds a puff lives. |
| `rise` | number | `0.5` | 0 – 2 | Yes | Upward drift in m/s — heavier dust settles faster. |
| `spread` | number | `0.22` | 0 – 1 | Yes | Horizontal scatter radius in meters around the footfall. |

### Gameplay VFX: Landing Ring

The classic landing hit: a radial ring of dust puffs expanding outward from the touch-down point. `power` at spawn scales radius and count.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `puffCount` | number | `14` | 0 – 40 | Yes | Puffs around the ring at power 1; spawn `power` scales this. |
| `ringRadius` | number | `1.1` | 0.2 – 5 | Yes | Meters the dust ring expands to at power 1. |
| `sizeRange` | vector2 | `[0.18, 0.38]` | — | Yes | Min/max puff size in meters. |
| `color` | color | `[0.78, 0.72, 0.62]` (#c7b89e) | — | Yes | Dust color — sample the ground palette. |
| `lifetime` | number | `0.7` | 0.05 – 2 | Yes | Seconds the ring takes to expand and fade. |

## Fauna

Module: `toonlab/fauna` — 5 groups, 48 fields.

Settings are nested per species group: `createFauna({ settings: { birds: { fleeRadius: 15 } } })`. Populations are passed separately: `createFauna({ species: { birds: 40, fish: 80 } })`.

### Fauna: Shared

Cross-species simulation budgets: the staggered steering-tick share and the distance beyond which agents degrade to scripted loops.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `tickShare` | number | `0.25` | 0.05 – 0.5 | Yes | Fraction of all agents that receive a full steering tick per update; the rest integrate their last velocity. 0.25 = every agent steers at ~15 Hz on a 60 Hz host. |
| `farDistance` | number | `150` | 40 – 400 | Yes | Meters from the follow target beyond which agents stop steering entirely and fly scripted circles (fish keep their depth clamps). |

### Fauna: Birds

Flocking boids in a roaming altitude band; perch on registered points (or terrain) and flush when the follow target approaches.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `altitudeMin` | number | `7` | 1 – 40 | Yes | Bottom of the preferred flight band, meters above the local terrain. |
| `altitudeMax` | number | `26` | 2 – 80 | Yes | Top of the preferred flight band, meters above the local terrain. |
| `cruiseSpeed` | number | `7` | 1 – 20 | Yes | Relaxed flight speed in m/s; flocks settle around it. |
| `maxSpeed` | number | `12` | 2 – 30 | Yes | Hard speed cap in m/s, reached when fleeing. |
| `neighborRadius` | number | `14` | 2 – 30 | Yes | Meters within which flockmates influence cohesion and alignment. |
| `separationRadius` | number | `2.6` | 0.5 – 8 | Yes | Personal-space radius in meters; closer neighbors are pushed away. |
| `cohesion` | number | `0.9` | 0 – 2 | Yes | Pull toward the local flock center — the flock-tightness knob. |
| `alignment` | number | `0.8` | 0 – 2 | Yes | Pull toward the local average heading. |
| `separation` | number | `1.3` | 0 – 3 | Yes | Push away from neighbors inside the separation radius. |
| `wander` | number | `0.45` | 0 – 2 | Yes | Per-bird sinusoidal drift so flocks meander instead of orbiting. |
| `fleeRadius` | number | `12` | 0 – 40 | Yes | Meters from the follow target at which flying birds scatter and perched birds flush. |
| `perchChance` | number | `0.5` | 0 – 1 | Yes | Appetite for landing: expected perch attempts scale with this per ~10 s of flight. |
| `perchDuration` | number | `11` | 2 – 40 | Yes | Mean seconds a bird stays perched (each stay jitters ±40%). |
| `flapHz` | number | `3.4` | 0.5 – 8 | Yes | Wingbeats per second; the GPU flap phase/speed attributes derive from it. Birds glide (near-zero amplitude) when descending. |
| `scale` | number | `1` | 0.4 – 2.5 | Yes | Uniform body scale multiplier (±12% per-bird jitter on top). |
| `palette` | select | `'swallow'` | `swallow` \| `egret` \| `finch` | Yes | Named body palette; each palette carries 2–4 vertex-colored variants. |

### Fauna: Butterflies

Individual noise-wanderers anchored to flower-mask points, hovering just above the terrain.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `hoverMin` | number | `0.5` | 0.1 – 3 | Yes | Bottom of the flutter band, meters above the local terrain. |
| `hoverMax` | number | `1.7` | 0.2 – 5 | Yes | Top of the flutter band, meters above the local terrain. |
| `speed` | number | `1.3` | 0.2 – 4 | Yes | Typical flutter speed in m/s. |
| `wanderRadius` | number | `6` | 2 – 30 | Yes | Meters a butterfly may drift from its flower-mask anchor before being pulled back. |
| `fleeRadius` | number | `3.5` | 0 – 15 | Yes | Meters from the follow target at which butterflies scatter upward. |
| `flapHz` | number | `8.5` | 2 – 16 | Yes | Wingbeats per second for the GPU wing fold. |
| `scale` | number | `1` | 0.4 – 2.5 | Yes | Uniform body scale multiplier (±20% per-agent jitter on top). |
| `palette` | select | `'meadow'` | `meadow` \| `twilight` | Yes | Named wing palette; each palette carries up to 4 vertex-colored variants. |

### Fauna: Dragonflies

Hover-and-dart flyers anchored to the water margin, holding a fixed height above the water surface.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `hoverHeight` | number | `0.6` | 0.2 – 3 | Yes | Meters above the water surface dragonflies hold. |
| `hoverRadius` | number | `5` | 1 – 20 | Yes | Meters of drift allowed around the current hover anchor. |
| `dartSpeed` | number | `7` | 1 – 16 | Yes | Straight-line speed in m/s when relocating to a new anchor. |
| `dartChance` | number | `0.5` | 0 – 1 | Yes | Appetite for relocating: expected darts scale with this per ~8 s of hovering. |
| `flapHz` | number | `36` | 10 – 60 | Yes | Wing oscillations per second; high rates read as the classic wing shimmer. |
| `scale` | number | `1` | 0.4 – 2.5 | Yes | Uniform body scale multiplier. |
| `palette` | select | `'pond'` | `pond` \| `ember` | Yes | Named body palette; each palette carries 2–3 vertex-colored variants. |

### Fauna: Fish

Schooling boids clamped between the water surface and the bed; visible from above through the water refraction pass.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `surfaceMargin` | number | `0.3` | 0.1 – 2 | Yes | Minimum meters a fish stays below the water surface (never breaches). |
| `bedMargin` | number | `0.35` | 0.1 – 2 | Yes | Minimum meters a fish stays above the terrain bed. |
| `minSpawnDepth` | number | `1.1` | 0.3 – 5 | Yes | Meters of water column required for a fish spawn point; shallower bounds simply hold fewer fish. |
| `cruiseSpeed` | number | `1.5` | 0.2 – 5 | Yes | Relaxed swim speed in m/s. |
| `maxSpeed` | number | `3.2` | 0.5 – 8 | Yes | Hard speed cap in m/s, reached when fleeing. |
| `neighborRadius` | number | `4` | 1 – 12 | Yes | Meters within which schoolmates influence cohesion and alignment. |
| `separationRadius` | number | `0.8` | 0.2 – 4 | Yes | Personal-space radius in meters. |
| `cohesion` | number | `0.9` | 0 – 2 | Yes | Pull toward the local school center — schooling tightness. |
| `alignment` | number | `0.85` | 0 – 2 | Yes | Pull toward the local average heading. |
| `separation` | number | `1.1` | 0 – 3 | Yes | Push away from neighbors inside the separation radius. |
| `wander` | number | `0.5` | 0 – 2 | Yes | Per-fish sinusoidal drift so schools roam the basin. |
| `fleeRadius` | number | `7` | 0 – 25 | Yes | Meters from the follow target (a swimmer, a bridge walker) at which fish scatter. |
| `swayHz` | number | `2.8` | 0.5 – 8 | Yes | Tail-sway cycles per second for the GPU body flex. |
| `scale` | number | `1` | 0.3 – 3 | Yes | Uniform body scale multiplier (±25% per-fish jitter on top). |
| `palette` | select | `'koi'` | `koi` \| `silver` | Yes | Named body palette: koi for ponds and lakes, silver for open water. |

## Buildings

Module: `toonlab/buildinggen` — 5 groups, 28 fields.

Grouped settings consumed by `createBuildingFromRecipe(...)` / `buildingAsset(...)`; `{ type, seed }` ride alongside the groups.

### Buildings: Footprint

Ground plan: rect, L, or T, in meters.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `kind` | select | `'rect'` | `rect` \| `L` \| `T` | Yes | Ground-plan shape. |
| `width` | number | `6.5` | 2.5 – 14 | Yes | Main rect width in meters. |
| `depth` | number | `5` | 2.5 – 12 | Yes | Main rect depth in meters. |
| `wingRatio` | number | `0.55` | 0.3 – 0.85 | Yes | L/T wing size relative to the main rect. |

### Buildings: Massing

Floors, per-floor inset, and the slight outward wall lean that keeps facades hand-drawn.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `floors` | number | `1` | 1 – 5 | Yes | Full floors (towers go tall). |
| `floorHeight` | number | `2.5` | 2.1 – 3.4 | Yes | Meters per floor. |
| `atticRatio` | number | `0.55` | 0 – 0.8 | Yes | Half-floor under a gable roof (0 = none). |
| `inset` | number | `0` | 0 – 0.3 | Yes | Meters each floor steps inward — watchtower massing. |
| `wallLean` | number | `0.012` | 0 – 0.05 | Yes | Outward lean per meter of height. Exaggerated proportions are settings, not bugs. |

### Buildings: Roof

Roof form: gable, hip, shed, or the curved pagoda-ish shrine roof. Roofs always overhang walls.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `kind` | select | `'gable'` | `gable` \| `hip` \| `shed` \| `pagoda` | Yes | Roof construction. |
| `pitch` | number | `0.85` | 0.25 – 1.4 | Yes | Rise over half-span. |
| `overhang` | number | `0.55` | 0.25 – 1.6 | Yes | Meters the roof reaches past the walls (invariant: > 0). |
| `curvature` | number | `0` | 0 – 1 | Yes | Upturned eave sweep — the shrine-roof signature. |
| `ridgeDecor` | number | `0` | 0 – 1 | Yes | Ridge cap beam and end finials. |

### Buildings: Facade

Timber framing, window rhythm (windows never intersect beams), and the door (always on an exterior wall).

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `beams` | number | `1` | 0 – 1 | Yes | Visible beam grid strength (0 hides framing). |
| `bayWidth` | number | `1.6` | 1 – 2.6 | Yes | Meters between beam columns; windows land mid-bay. |
| `windowChance` | number | `0.75` | 0 – 1 | Yes | Chance an eligible bay gets a window. |
| `windowWidth` | number | `0.75` | 0.4 – 1.4 | Yes | Window width in meters (clamped inside its bay). |
| `windowHeight` | number | `0.95` | 0.4 – 1.6 | Yes | Window height in meters. |
| `doorWidth` | number | `1` | 0.7 – 2.2 | Yes | Door width in meters. |
| `doorHeight` | number | `2` | 1.7 – 2.4 | Yes | Door height in meters. |
| `baseHeight` | number | `0.35` | 0 – 1.2 | Yes | Stone base band height (shrines ride a full veranda plinth). |

### Buildings: Palette

Material role colors: wall, beam, roof, trim, door.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `wall` | color | `[0.82, 0.74, 0.6]` (#d1bd99) | — | Yes | Plaster / plank wall color. |
| `beam` | color | `[0.32, 0.22, 0.14]` (#523824) | — | Yes | Timber framing color. |
| `roof` | color | `[0.42, 0.3, 0.24]` (#6b4d3d) | — | Yes | Roof surface color. |
| `trim` | color | `[0.45, 0.46, 0.44]` (#737570) | — | Yes | Stone base, chimney, and sills. |
| `door` | color | `[0.5, 0.3, 0.16]` (#804d29) | — | Yes | Door color. |
| `variation` | number | `0.12` | 0 – 0.4 | Yes | Per-vertex color drift. |

## Procedural textures

Module: `toonlab/texgen` — 10 groups, 166 fields.

Grouped settings consumed by `evaluateTextureMaps(settings)` and serialized in texture recipes (`createTextureSettings`).

### Procedural textures: Seed

Deterministic seed shared by every layer.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `seed` | number | `1337` | 0 – 99999 | Yes | Deterministic seed — every value is a different texture with the same recipe. |

### Procedural textures: Base pattern

The primary structure: pattern, frequency, warp.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `generator` | select | `'fbm'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Yes | Primary structure of the material: this drives height, color banding, and pattern cells. |
| `contrast` | number | `0` | -1 – 1 | Yes | Sharpens (+) or flattens (-) the base pattern. |
| `bias` | number | `0` | -0.5 – 0.5 | Yes | Shifts the whole pattern up or down the ramp. |
| `invert` | boolean | `false` | — | Yes | Flips the base pattern (crevices become ridges). |
| `scale` | number | `6` | 1 – 64 | Yes | Feature cells across the tile. Higher = finer features. |
| `rotate90` | boolean | `false` | — | Yes | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Yes | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | Yes | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.25 – 8 | Yes | Horizontal anisotropy (brushed metal, wood planks). |
| `stretchY` | number | `1` | 0.25 – 8 | Yes | Vertical anisotropy (drips, strata, fibers). |
| `warp` | number | `0` | 0 – 1 | Yes | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Yes | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 64 | Yes | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 64 | Yes | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Yes | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Yes | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Yes | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Yes | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Yes | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 32 | Yes | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Yes | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Detail layer A

Mid-frequency relief blended over the base.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Toggles this detail layer. |
| `generator` | select | `'fbm'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Yes | Pattern blended over the base height. |
| `blend` | select | `'overlay'` | `overlay` \| `add` \| `multiply` \| `screen` \| `min` \| `max` \| `mix` | Yes | How this layer combines with the height underneath. |
| `amount` | number | `0.35` | 0 – 1 | Yes | Blend strength of this layer. |
| `invert` | boolean | `false` | — | Yes | Flips the layer before blending. |
| `contrast` | number | `0` | -1 – 1 | Yes | Sharpens (+) or flattens (-) the layer. |
| `scale` | number | `18` | 1 – 64 | Yes | Feature cells across the tile. Higher = finer features. |
| `rotate90` | boolean | `false` | — | Yes | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Yes | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | Yes | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.25 – 8 | Yes | Horizontal anisotropy (brushed metal, wood planks). |
| `stretchY` | number | `1` | 0.25 – 8 | Yes | Vertical anisotropy (drips, strata, fibers). |
| `warp` | number | `0` | 0 – 1 | Yes | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Yes | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 64 | Yes | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 64 | Yes | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Yes | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Yes | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Yes | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Yes | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Yes | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 32 | Yes | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Yes | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Detail layer B

Fine grain, pores, chips.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Toggles this detail layer. |
| `generator` | select | `'speckle'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Yes | Pattern blended over the base height. |
| `blend` | select | `'add'` | `overlay` \| `add` \| `multiply` \| `screen` \| `min` \| `max` \| `mix` | Yes | How this layer combines with the height underneath. |
| `amount` | number | `0.2` | 0 – 1 | Yes | Blend strength of this layer. |
| `invert` | boolean | `false` | — | Yes | Flips the layer before blending. |
| `contrast` | number | `0` | -1 – 1 | Yes | Sharpens (+) or flattens (-) the layer. |
| `scale` | number | `24` | 1 – 64 | Yes | Feature cells across the tile. Higher = finer features. |
| `rotate90` | boolean | `false` | — | Yes | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Yes | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | Yes | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.25 – 8 | Yes | Horizontal anisotropy (brushed metal, wood planks). |
| `stretchY` | number | `1` | 0.25 – 8 | Yes | Vertical anisotropy (drips, strata, fibers). |
| `warp` | number | `0` | 0 – 1 | Yes | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Yes | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 64 | Yes | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 64 | Yes | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Yes | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Yes | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Yes | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Yes | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Yes | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 32 | Yes | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Yes | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Color

Five-stop height ramp, painterly jitter, cavity & sheen, final grade.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `color0` | color | `[0.16, 0.14, 0.13]` (#292421) | — | Yes | Ramp stop at the darkest crevices. |
| `color1` | color | `[0.35, 0.31, 0.28]` (#594f47) | — | Yes | Ramp stop between crevices and the mid tone. |
| `color2` | color | `[0.55, 0.5, 0.45]` (#8c8073) | — | Yes | Ramp stop for the average surface. |
| `color3` | color | `[0.72, 0.68, 0.62]` (#b8ad9e) | — | Yes | Ramp stop approaching the ridges. |
| `color4` | color | `[0.88, 0.85, 0.79]` (#e0d9c9) | — | Yes | Ramp stop at the highest ridges. |
| `pos1` | number | `0.25` | 0.02 – 0.98 | Yes | Where the Low stop sits on the height ramp. |
| `pos2` | number | `0.5` | 0.02 – 0.98 | Yes | Where the Mid stop sits on the height ramp. |
| `pos3` | number | `0.75` | 0.02 – 0.98 | Yes | Where the High stop sits on the height ramp. |
| `rampSmooth` | number | `1` | 0 – 1 | Yes | 1 = smooth gradient, 0 = hard cel bands between the five stops. |
| `jitterHue` | number | `0.04` | 0 – 0.5 | Yes | Painterly hue drift across the surface. |
| `jitterValue` | number | `0.08` | 0 – 0.5 | Yes | Painterly brightness drift across the surface. |
| `jitterScale` | number | `24` | 2 – 64 | Yes | Frequency of the painterly drift. |
| `jitterCells` | boolean | `false` | — | Yes | Applies drift per pattern cell (per brick / plank / scale) instead of smoothly. |
| `cavity` | number | `0.35` | 0 – 1 | Yes | Darkens crevices toward the cavity tint — the hand-painted occlusion read. |
| `cavityTint` | color | `[0.13, 0.09, 0.08]` (#211714) | — | Yes | Color the crevices sink toward. |
| `sheen` | number | `0.18` | 0 – 1 | Yes | Screens the sheen tint over ridges and edges — worn highlight. |
| `sheenTint` | color | `[1, 0.97, 0.88]` (#fff7e0) | — | Yes | Color of the ridge highlight. |
| `hueShift` | number | `0` | -0.5 – 0.5 | Yes | Rotates the final palette hue. |
| `saturation` | number | `1` | 0 – 2 | Yes | Final color saturation. |
| `brightness` | number | `1` | 0.25 – 1.75 | Yes | Final brightness multiplier. |
| `contrast` | number | `0` | -1 – 1 | Yes | Final color contrast. |
| `gamma` | number | `1` | 0.4 – 2.5 | Yes | Final gamma on the albedo. |

### Procedural textures: Wear & tear

One-knob damage and dirt macros layered over everything.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `damage` | number | `0` | 0 – 1 | Yes | Universal wear macro: carves seeded scratches and chips into the surface and roughens them. One knob, many parameters. |
| `dirt` | number | `0` | 0 – 1 | Yes | Grime macro: darkens crevices with pooled dirt and raises their roughness, independent of the overlay slots. |

### Procedural textures: Overlay A

Masked colored overlay: moss, rust, dirt, snow, lichen…

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Toggles this overlay. |
| `generator` | select | `'fbm'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Yes | Mask pattern deciding where the overlay lands. |
| `color` | color | `[0.35, 0.48, 0.22]` (#597a38) | — | Yes | Overlay color where the mask is strongest. |
| `colorB` | color | `[0.52, 0.62, 0.28]` (#859e47) | — | Yes | Secondary overlay color for variation within the mask. |
| `coverage` | number | `0.35` | 0 – 1 | Yes | How much of the surface the overlay claims. |
| `softness` | number | `0.18` | 0.01 – 0.6 | Yes | Feather width of the overlay border. |
| `creviceBias` | number | `0.5` | -1 – 1 | Yes | +1 pools into crevices (moss, grime); -1 caps ridges and peaks (snow, wear). |
| `blend` | select | `'normal'` | `normal` \| `multiply` \| `overlay` \| `screen` | Yes | How the overlay color mixes into the albedo. |
| `roughnessShift` | number | `0.25` | -1 – 1 | Yes | Overlay area gets rougher (+) or glossier (-). |
| `heightShift` | number | `0.05` | -0.5 – 0.5 | Yes | Overlay area rises (+) or sinks (-) in the height map. |
| `metalShift` | number | `0` | -1 – 1 | Yes | Overlay area gains (+) or loses (-) metalness — rust strips metal. |
| `contrast` | number | `0` | -1 – 1 | Yes | Sharpens (+) or flattens (-) the mask pattern. |
| `invert` | boolean | `false` | — | Yes | Flips the mask before thresholding. |
| `scale` | number | `5` | 1 – 64 | Yes | Feature cells across the tile. Higher = finer features. |
| `rotate90` | boolean | `false` | — | Yes | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Yes | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | Yes | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.25 – 8 | Yes | Horizontal anisotropy (brushed metal, wood planks). |
| `stretchY` | number | `1` | 0.25 – 8 | Yes | Vertical anisotropy (drips, strata, fibers). |
| `warp` | number | `0.3` | 0 – 1 | Yes | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Yes | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 64 | Yes | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 64 | Yes | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Yes | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Yes | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Yes | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Yes | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Yes | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 32 | Yes | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Yes | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Overlay B

Second masked overlay: grime, stains, scorch, drips…

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Toggles this overlay. |
| `generator` | select | `'turbulence'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Yes | Mask pattern deciding where the overlay lands. |
| `color` | color | `[0.16, 0.12, 0.09]` (#291f17) | — | Yes | Overlay color where the mask is strongest. |
| `colorB` | color | `[0.3, 0.24, 0.18]` (#4d3d2e) | — | Yes | Secondary overlay color for variation within the mask. |
| `coverage` | number | `0.3` | 0 – 1 | Yes | How much of the surface the overlay claims. |
| `softness` | number | `0.22` | 0.01 – 0.6 | Yes | Feather width of the overlay border. |
| `creviceBias` | number | `0.6` | -1 – 1 | Yes | +1 pools into crevices (moss, grime); -1 caps ridges and peaks (snow, wear). |
| `blend` | select | `'multiply'` | `normal` \| `multiply` \| `overlay` \| `screen` | Yes | How the overlay color mixes into the albedo. |
| `roughnessShift` | number | `0.2` | -1 – 1 | Yes | Overlay area gets rougher (+) or glossier (-). |
| `heightShift` | number | `-0.03` | -0.5 – 0.5 | Yes | Overlay area rises (+) or sinks (-) in the height map. |
| `metalShift` | number | `0` | -1 – 1 | Yes | Overlay area gains (+) or loses (-) metalness — rust strips metal. |
| `contrast` | number | `0` | -1 – 1 | Yes | Sharpens (+) or flattens (-) the mask pattern. |
| `invert` | boolean | `false` | — | Yes | Flips the mask before thresholding. |
| `scale` | number | `4` | 1 – 64 | Yes | Feature cells across the tile. Higher = finer features. |
| `rotate90` | boolean | `false` | — | Yes | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Yes | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | Yes | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.25 – 8 | Yes | Horizontal anisotropy (brushed metal, wood planks). |
| `stretchY` | number | `1` | 0.25 – 8 | Yes | Vertical anisotropy (drips, strata, fibers). |
| `warp` | number | `0.25` | 0 – 1 | Yes | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Yes | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 64 | Yes | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 64 | Yes | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Yes | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Yes | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Yes | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Yes | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Yes | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 32 | Yes | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Yes | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Surface

PBR response: relief, occlusion, roughness, metalness.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `heightScale` | number | `0.5` | 0 – 1 | Yes | Overall relief strength — feeds the normal map, AO, and displacement. |
| `normalStrength` | number | `1` | 0 – 3 | Yes | Extra multiplier on the derived normal map. |
| `invertHeight` | boolean | `false` | — | Yes | Flips the height map (grooves become ridges). |
| `aoStrength` | number | `0.55` | 0 – 1 | Yes | Baked ambient occlusion depth in the crevices. |
| `roughness` | number | `0.75` | 0 – 1 | Yes | Base roughness: 0 = mirror gloss, 1 = fully matte. |
| `roughnessContrast` | number | `0.35` | -1 – 1 | Yes | +1 = crevices rough & ridges polished; -1 = the reverse. |
| `metalness` | number | `0` | 0 – 1 | Yes | Base metalness of the material. |

### Procedural textures: Glow

Optional emissive map.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Adds a glow map (lava cracks, sci-fi circuits, embers). |
| `color` | color | `[1, 0.45, 0.12]` (#ff731f) | — | Yes | Emissive color. |
| `intensity` | number | `2` | 0 – 8 | Yes | Emissive brightness (preview material intensity). |
| `source` | select | `'crevices'` | `crevices` \| `peaks` \| `band` \| `accentA` \| `accentB` \| `everywhere` | Yes | Which part of the surface glows. |
| `threshold` | number | `0.5` | 0 – 1 | Yes | Height level the glow hugs (band / crevices / peaks). |
| `width` | number | `0.25` | 0.02 – 0.8 | Yes | Thickness of the glowing region. |
| `softness` | number | `0.2` | 0.01 – 0.6 | Yes | Feather on the glow border. |
