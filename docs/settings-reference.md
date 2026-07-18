# Settings reference

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Regenerate with: node scripts/generate-settings-reference.mjs -->

Every tunable field in the settings schemas, generated from the
`*_SETTING_GROUPS` / `*_SETTING_FIELD_SCHEMA` exports. The same schemas
drive the [debug panel](debug-panel.md), so everything listed here appears
as a live control in the labs.

- [Character toon shading](#character-toon-shading)
- [Environment shading](#environment-shading)
- [Water](#water)
- [Post-processing](#post-processing)
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

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `customSaturation` | number | `1` | 0 – 2 | Configures custom saturation for base texture. |
| `materialColorMode` | select | `'legacy'` | `legacy` \| `source` \| `texture` \| `white` | Sets the color used by material color mode. |
| `saturationMode` | select | `'legacy'` | `legacy` \| `source` \| `custom` | Selects the policy used by saturation mode. |

### Character toon shading: Alpha

Controls cutout, blend, opacity, eye overlay sorting, and transparent decoration behavior.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `blendCutoff` | number | `0.02` | 0 – 1 | Configures blend cutoff for alpha. |
| `costumeCutout` | boolean | `true` | — | Configures costume cutout for alpha. |
| `cutoutCutoff` | number | `0.35` | 0 – 1 | Configures cutout cutoff for alpha. |
| `ditherOpacity` | number | `1` | 0 – 1 | Configures dither opacity for alpha. |
| `enabled` | boolean | `true` | — | Turns alpha on or off. |
| `expressionTokenCutout` | boolean | `true` | — | Configures expression token cutout for alpha. |
| `eyeHighlightOrder` | number | `12` | -30 – 30 | Controls transparent draw order for eye highlight order. |
| `eyeOrder` | number | `11` | -30 – 30 | Controls transparent draw order for eye order. |
| `faceCutout` | boolean | `true` | — | Configures face cutout for alpha. |
| `hairCutout` | boolean | `true` | — | Configures hair cutout for alpha. |
| `mapTransparentCutout` | boolean | `true` | — | Configures map transparent cutout for alpha. |
| `overlayDepthWrite` | boolean | `false` | — | Configures overlay depth write for alpha. |
| `overlayOrder` | number | `20` | -30 – 30 | Controls transparent draw order for overlay order. |
| `preserveSourceAlphaTest` | boolean | `true` | — | Configures preserve source alpha test for alpha. |
| `scleraOrder` | number | `10` | -30 – 30 | Controls transparent draw order for sclera order. |
| `skinCutout` | boolean | `true` | — | Configures skin cutout for alpha. |
| `sortOverlays` | boolean | `true` | — | Configures sort overlays for alpha. |
| `sourceAlphaMapCutout` | boolean | `true` | — | Configures source alpha map cutout for alpha. |
| `sourceTransparentCutout` | boolean | `true` | — | Configures source transparent cutout for alpha. |
| `transparentOverlayBlend` | boolean | `true` | — | Configures transparent overlay blend for alpha. |
| `transparentOpacityThreshold` | number | `0.999` | 0 – 1 | Configures transparent opacity threshold for alpha. |

### Character toon shading: Skin Tone

Keeps skin and face shadows warm, readable, and separate from costume/hair shadows.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Turns skin tone on or off. |
| `faceMaxDirectLight` | number | `100` | 0 – 8 | Configures face max direct light for skin tone. |
| `faceMinimumIndirectLight` | number | `0.35` | 0 – 1 | Sets the minimum light floor for face minimum indirect light. |
| `faceShadowBrightness` | number | `1` | 0 – 2 | Configures face shadow brightness for skin tone. |
| `faceShadowSaturation` | number | `1` | 0 – 2 | Configures face shadow saturation for skin tone. |
| `faceShadowTint` | color | `[1, 0.92, 0.9]` (#ffebe6) | — | Sets the color used by face shadow tint. |
| `faceShadowTintStrength` | number | `1` | 0 – 8 | Controls the blend strength for face shadow tint strength. |
| `skinMaxDirectLight` | number | `100` | 0 – 8 | Configures skin max direct light for skin tone. |
| `skinMinimumIndirectLight` | number | `0.35` | 0 – 1 | Sets the minimum light floor for skin minimum indirect light. |
| `skinShadowBrightness` | number | `0.92` | 0 – 2 | Configures skin shadow brightness for skin tone. |
| `skinShadowSaturation` | number | `1` | 0 – 2 | Configures skin shadow saturation for skin tone. |
| `skinShadowTint` | color | `[1, 0.76, 0.74]` (#ffc2bd) | — | Sets the color used by skin shadow tint. |
| `skinShadowTintStrength` | number | `1` | 0 – 8 | Controls the blend strength for skin shadow tint strength. |

### Character toon shading: Face Lighting

Overrides face-area cel response so noses, cheeks, and eyes do not receive harsh body shadows.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Turns face lighting on or off. |
| `faceCelMidPoint` | number | `-0.48` | -1 – 1 | Moves the center point for face cel mid point. |
| `faceCelSoftness` | number | `0.22` | 0 – 1 | Controls transition softness for face cel softness. |
| `faceLocalLightLift` | number | `0.22` | 0 – 1 | Configures face local light lift for face lighting. |
| `faceMainLightIgnoreCelShade` | number | `0.45` | 0 – 1 | Configures face main light ignore cel shade for face lighting. |
| `faceNormalProxyBlend` | number | `0.75` | 0 – 1 | Configures face normal proxy blend for face lighting. |
| `faceProxyNormal` | vector3 | `[0, 0, 1]` | — | Configures face proxy normal for face lighting. |
| `faceSceneShadowStrength` | number | `0.5` | 0 – 8 | Controls the blend strength for face scene shadow strength. |
| `faceSphereBlend` | number | `0.75` | 0 – 1 | Configures face sphere blend for face lighting. |
| `headSpaceMode` | select | `'headBone'` | `static` \| `headBone` | Selects the policy used by head space mode. |

### Character toon shading: Cel Shade

Sets the primary directional cel band threshold, softness, and light-ignore amount.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `bodyCelMidPoint` | number | `0.06` | -1 – 1 | Moves the center point for body cel mid point. |
| `bodyCelSoftness` | number | `0.045` | 0 – 1 | Controls transition softness for body cel softness. |
| `bodyMainLightIgnoreCelShade` | number | `0.02` | 0 – 1 | Configures body main light ignore cel shade for cel shade. |
| `edgeAntiAliasStrength` | number | `1` | 0 – 8 | Controls the blend strength for edge anti alias strength. |
| `enabled` | boolean | `true` | — | Turns cel shade on or off. |

### Character toon shading: Shadow Color

Tints and reshapes lit-to-shadow transitions and fully shadowed regions.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Turns shadow color on or off. |
| `lowSaturationFallbackColor` | vector4 | `[0.3764706, 0.4141177, 0.5019608, 0]` | — | Sets the color used by low saturation fallback color. |
| `selfShadowAlbedoMulStrength` | number | `0` | 0 – 8 | Controls the blend strength for self shadow albedo mul strength. |
| `selfShadowAreaHSVStrength` | number | `1` | 0 – 8 | Controls the blend strength for self shadow area h s v strength. |
| `selfShadowAreaHueOffset` | number | `0` | -1 – 1 | Configures self shadow area hue offset for shadow color. |
| `selfShadowAreaSaturationBoost` | number | `0.2` | 0 – 2 | Configures self shadow area saturation boost for shadow color. |
| `selfShadowAreaValueMul` | number | `0.68` | 0 – 2 | Configures self shadow area value mul for shadow color. |
| `selfShadowTintColor` | color | `[1, 1, 1]` (#ffffff) | — | Sets the color used by self shadow tint color. |
| `transitionAreaHueOffset` | number | `0.01` | -1 – 1 | Configures transition area hue offset for shadow color. |
| `transitionAreaIntensity` | number | `1` | 0 – 8 | Controls how strongly transition area intensity contributes. |
| `transitionAreaSaturationBoost` | number | `0.36` | 0 – 2 | Configures transition area saturation boost for shadow color. |
| `transitionAreaTintColor` | color | `[1, 1, 1]` (#ffffff) | — | Sets the color used by transition area tint color. |
| `transitionAreaValueMul` | number | `1` | 0 – 2 | Configures transition area value mul for shadow color. |

### Character toon shading: Scene Shadows

Controls how renderer shadow maps darken character materials.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `defaultMinLight` | number | `0.24` | 0 – 1 | Sets the minimum light floor for default min light. |
| `defaultStrength` | number | `0.76` | 0 – 8 | Controls the blend strength for default strength. |
| `enabled` | boolean | `true` | — | Turns scene shadows on or off. |
| `eyeMinLight` | number | `0.42` | 0 – 1 | Sets the minimum light floor for eye min light. |
| `eyeStrength` | number | `0.05` | 0 – 8 | Controls the blend strength for eye strength. |
| `faceMinLight` | number | `0.42` | 0 – 1 | Sets the minimum light floor for face min light. |
| `faceStrength` | number | `0.46` | 0 – 8 | Controls the blend strength for face strength. |
| `shadowAreaStrength` | number | `0.65` | 0 – 8 | Controls the blend strength for shadow area strength. |
| `skinMinLight` | number | `0.34` | 0 – 1 | Sets the minimum light floor for skin min light. |
| `skinStrength` | number | `0.62` | 0 – 8 | Controls the blend strength for skin strength. |

### Character toon shading: Self Shadow

Controls character-local self-shadow proxy contribution until a dedicated self-shadow pass exists.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `defaultMinLight` | number | `0.62` | 0 – 1 | Sets the minimum light floor for default min light. |
| `defaultStrength` | number | `0.22` | 0 – 8 | Controls the blend strength for default strength. |
| `enabled` | boolean | `true` | — | Turns self shadow on or off. |
| `eyeMinLight` | number | `1` | 0 – 1 | Sets the minimum light floor for eye min light. |
| `eyeStrength` | number | `0` | 0 – 8 | Controls the blend strength for eye strength. |
| `faceMinLight` | number | `1` | 0 – 1 | Sets the minimum light floor for face min light. |
| `faceStrength` | number | `0` | 0 – 8 | Controls the blend strength for face strength. |
| `hairMinLight` | number | `0.58` | 0 – 1 | Sets the minimum light floor for hair min light. |
| `hairStrength` | number | `0.26` | 0 – 8 | Controls the blend strength for hair strength. |
| `shadowAreaStrength` | number | `0.5` | 0 – 8 | Controls the blend strength for shadow area strength. |
| `skinMinLight` | number | `0.72` | 0 – 1 | Sets the minimum light floor for skin min light. |
| `skinStrength` | number | `0.16` | 0 – 8 | Controls the blend strength for skin strength. |
| `sourceMode` | select | `2` | `0` \| `1` \| `2` | Selects the policy used by source mode. |

### Character toon shading: Average Shadow

Adds averaged shadow visibility used for softer role-specific shadow damping.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `defaultMinLight` | number | `0.28` | 0 – 1 | Sets the minimum light floor for default min light. |
| `defaultStrength` | number | `0.28` | 0 – 8 | Controls the blend strength for default strength. |
| `enabled` | boolean | `false` | — | Turns average shadow on or off. |
| `measuredBlend` | number | `0.65` | 0 – 1 | Configures measured blend for average shadow. |
| `eyeMinLight` | number | `1` | 0 – 1 | Sets the minimum light floor for eye min light. |
| `eyeStrength` | number | `0` | 0 – 8 | Controls the blend strength for eye strength. |
| `faceMinLight` | number | `1` | 0 – 1 | Sets the minimum light floor for face min light. |
| `faceStrength` | number | `0` | 0 – 8 | Controls the blend strength for face strength. |
| `hairMinLight` | number | `0.3` | 0 – 1 | Sets the minimum light floor for hair min light. |
| `hairStrength` | number | `0.22` | 0 – 8 | Controls the blend strength for hair strength. |
| `skinMinLight` | number | `0.4` | 0 – 1 | Sets the minimum light floor for skin min light. |
| `skinStrength` | number | `0.18` | 0 – 8 | Controls the blend strength for skin strength. |
| `softness` | number | `0.35` | 0 – 1 | Configures softness for average shadow. |

### Character toon shading: Indirect Light

Mixes ambient, hemisphere, and environment light into toon shading.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `ambientTint` | color | `[0.86, 0.91, 1]` (#dbe8ff) | — | Sets the color used by ambient tint. |
| `defaultIntensity` | number | `0.35` | 0 – 8 | Controls how strongly default intensity contributes. |
| `defaultMinimumIndirectLight` | number | `0.35` | 0 – 1 | Sets the minimum light floor for default minimum indirect light. |
| `enabled` | boolean | `true` | — | Turns indirect light on or off. |
| `environmentIndirectLight` | number | `0.56` | 0 – 1 | Configures environment indirect light for indirect light. |
| `eyeIntensity` | number | `0.35` | 0 – 8 | Controls how strongly eye intensity contributes. |
| `eyeMinimumIndirectLight` | number | `0.35` | 0 – 1 | Sets the minimum light floor for eye minimum indirect light. |
| `faceIntensity` | number | `0.35` | 0 – 8 | Controls how strongly face intensity contributes. |
| `faceMinimumIndirectLight` | object | — | — | Sets the minimum light floor for face minimum indirect light. |
| `hairIntensity` | number | `0.35` | 0 – 8 | Controls how strongly hair intensity contributes. |
| `hairMinimumIndirectLight` | number | `0.35` | 0 – 1 | Sets the minimum light floor for hair minimum indirect light. |
| `hemisphereLightIntensity` | number | `0.42` | 0 – 8 | Controls how strongly hemisphere light intensity contributes. |
| `skinIntensity` | number | `0.35` | 0 – 8 | Controls how strongly skin intensity contributes. |
| `skinMinimumIndirectLight` | object | — | — | Sets the minimum light floor for skin minimum indirect light. |

### Character toon shading: Local Lights

Controls point and spot light response for characters without overpowering cel bands.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `defaultIntensity` | number | `0.72` | 0 – 8 | Controls how strongly default intensity contributes. |
| `defaultMaxContribution` | number | `0.34` | 0 – 1 | Configures default max contribution for local lights. |
| `defaultShadowLift` | number | `0.58` | 0 – 1 | Configures default shadow lift for local lights. |
| `enabled` | boolean | `true` | — | Turns local lights on or off. |
| `eyeIntensity` | number | `0.42` | 0 – 8 | Controls how strongly eye intensity contributes. |
| `eyeMaxContribution` | number | `0.18` | 0 – 1 | Configures eye max contribution for local lights. |
| `eyeShadowLift` | number | `0.9` | 0 – 1 | Configures eye shadow lift for local lights. |
| `faceIntensity` | number | `0.56` | 0 – 8 | Controls how strongly face intensity contributes. |
| `faceMaxContribution` | number | `0.24` | 0 – 1 | Configures face max contribution for local lights. |
| `faceShadowLift` | number | `0.84` | 0 – 1 | Configures face shadow lift for local lights. |
| `hairIntensity` | number | `0.72` | 0 – 8 | Controls how strongly hair intensity contributes. |
| `hairMaxContribution` | number | `0.34` | 0 – 1 | Configures hair max contribution for local lights. |
| `hairShadowLift` | number | `0.58` | 0 – 1 | Configures hair shadow lift for local lights. |
| `skinIntensity` | number | `0.64` | 0 – 8 | Controls how strongly skin intensity contributes. |
| `skinMaxContribution` | number | `0.3` | 0 – 1 | Configures skin max contribution for local lights. |
| `skinShadowLift` | number | `0.72` | 0 – 1 | Configures skin shadow lift for local lights. |

### Character toon shading: Rim Light

Adds view-dependent edge light that can be blocked or softened by shadow.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `blockByShadow` | number | `0.65` | 0 – 1 | Configures block by shadow for rim light. |
| `defaultIntensity` | number | `0.13` | 0 – 8 | Controls how strongly default intensity contributes. |
| `defaultTintColor` | color | `[0.82, 0.9, 1]` (#d1e6ff) | — | Sets the color used by default tint color. |
| `depthCloseWidthReduce` | number | `1` | 0 – 0.08 | Controls the width used by depth close width reduce. |
| `depthDottedLineFix` | boolean | `true` | — | Configures depth dotted line fix for rim light. |
| `depthFadeEndDistance` | number | `30` | 0 – 60 | Configures depth fade end distance for rim light. |
| `depthFadeRange` | number | `1` | 0 – 1 | Controls transition softness for depth fade range. |
| `depthFadeStartDistance` | number | `20` | 1 – 100 | Configures depth fade start distance for rim light. |
| `depthMask3D` | boolean | `false` | — | Configures depth mask3 d for rim light. |
| `depthSafeDistance` | number | `1` | 0 – 1 | Configures depth safe distance for rim light. |
| `depthThresholdOffset` | number | `0` | -1 – 1 | Configures depth threshold offset for rim light. |
| `depthWidth` | number | `1` | 0 – 0.08 | Controls the width used by depth width. |
| `enabled` | boolean | `true` | — | Turns rim light on or off. |
| `eyeIntensity` | number | `0.04` | 0 – 8 | Controls how strongly eye intensity contributes. |
| `faceIntensity` | number | `0.13` | 0 – 8 | Controls how strongly face intensity contributes. |
| `hairIntensity` | number | `0.23` | 0 – 8 | Controls how strongly hair intensity contributes. |
| `midPoint` | number | `0.48` | 0 – 1 | Configures mid point for rim light. |
| `mixWithBaseMapColor` | number | `0.35` | 0 – 1 | Sets the color used by mix with base map color. |
| `mode` | select | `'depthTexture'` | `fresnel` \| `depthTexture` | Configures mode for rim light. |
| `skinIntensity` | number | `0.13` | 0 – 8 | Controls how strongly skin intensity contributes. |
| `softness` | number | `0.1` | 0 – 1 | Configures softness for rim light. |

### Character toon shading: Contact Shadow

Adds thin screen-space contact shadows (hair-on-face, arm-on-torso) from the depth prepass.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Turns contact shadow on or off. |
| `strength` | number | `0.5` | 0 – 1 | Configures strength for contact shadow. |
| `faceHeadUpBlend` | number | `0` | 0 – 1 | Configures face head up blend for contact shadow. |
| `faceStrength` | number | `0.4` | 0 – 8 | Controls the blend strength for face strength. |
| `fadeRange` | number | `1` | 0 – 1 | Controls transition softness for fade range. |
| `thresholdOffset` | number | `0` | -1 – 1 | Configures threshold offset for contact shadow. |
| `width` | number | `1` | 0 – 1 | Configures width for contact shadow. |

### Character toon shading: Specular

Adds role-aware stylized highlights and optional source specular masks.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `defaultColor` | color | `[1, 0.96, 0.9]` (#fff5e6) | — | Sets the color used by default color. |
| `defaultIntensity` | number | `0.075` | 0 – 8 | Controls how strongly default intensity contributes. |
| `defaultMidPoint` | number | `0.72` | -1 – 1 | Moves the center point for default mid point. |
| `defaultPower` | number | `56` | 1 – 128 | Controls the sharpness of default power. |
| `defaultRange` | number | `0.12` | 0 – 1 | Controls transition softness for default range. |
| `defaultShowInShadowArea` | number | `0.25` | 0 – 1 | Configures default show in shadow area for specular. |
| `directionMode` | select | `'light'` | `light` \| `view` | Selects the policy used by direction mode. |
| `enabled` | boolean | `true` | — | Turns specular on or off. |
| `eyeIntensity` | number | `0.62` | 0 – 8 | Controls how strongly eye intensity contributes. |
| `eyeMidPoint` | number | `0.35` | -1 – 1 | Moves the center point for eye mid point. |
| `eyePower` | number | `18` | 1 – 128 | Controls the sharpness of eye power. |
| `eyeRange` | number | `0.18` | 0 – 1 | Controls transition softness for eye range. |
| `eyeShowInShadowArea` | number | `1` | 0 – 1 | Configures eye show in shadow area for specular. |
| `faceIntensity` | number | `0.025` | 0 – 8 | Controls how strongly face intensity contributes. |
| `hairIntensity` | number | `0.18` | 0 – 8 | Controls how strongly hair intensity contributes. |
| `hairPower` | number | `40` | 1 – 128 | Controls the sharpness of hair power. |
| `maskChannel` | select | `0` | `0` \| `1` \| `2` \| `3` | Configures mask channel for specular. |
| `maskMap` | texture | — | — | Configures mask map for specular. |
| `maskStrength` | number | `1` | 0 – 8 | Controls the blend strength for mask strength. |
| `metalIntensity` | number | `0.075` | 0 – 8 | Controls how strongly metal intensity contributes. |
| `skinIntensity` | number | `0.025` | 0 – 8 | Controls how strongly skin intensity contributes. |
| `sourceMaskMode` | select | `'off'` | `off` \| `source` | Selects the policy used by source mask mode. |

### Character toon shading: Hair Highlight

Adds hair-specific highlight bands, optional anisotropic strand response, and source masks.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `direction` | vector3 | `[0, 1, 0.15]` | — | Configures direction for hair highlight. |
| `enabled` | boolean | `true` | — | Turns hair highlight on or off. |
| `intensity` | number | `0.14` | 0 – 1 | Configures intensity for hair highlight. |
| `maskChannel` | select | `0` | `0` \| `1` \| `2` \| `3` | Configures mask channel for hair highlight. |
| `maskMap` | texture | — | — | Configures mask map for hair highlight. |
| `maskStrength` | number | `1` | 0 – 8 | Controls the blend strength for mask strength. |
| `mode` | select | `'legacy'` | `legacy` \| `anisotropic` | Configures mode for hair highlight. |
| `shadowFloor` | number | `0.35` | 0 – 1 | Configures shadow floor for hair highlight. |
| `sideBandPower` | number | `2` | 1 – 128 | Controls the sharpness of side band power. |
| `sourceMaskMode` | select | `'off'` | `off` \| `source` | Selects the policy used by source mask mode. |
| `strandPower` | number | `7` | 1 – 128 | Controls the sharpness of strand power. |
| `uvBandAxis` | select | `0` | `0` \| `1` | Configures uv band axis for hair highlight. |
| `uvBandCenter` | number | `0.5` | 0 – 1 | Configures uv band center for hair highlight. |
| `uvBandHalfWidth` | number | `0.5` | 0 – 0.08 | Controls the width used by uv band width. |
| `uvPreset` | select | `'center'` | `center` \| `full` \| `left` \| `right` \| `vertical` \| `wide` | Selects the policy used by uv preset. |

### Character toon shading: Eye Highlight

Adds role-aware eye/catchlight boosts and optional source masks.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `color` | color | `[1, 1, 1]` (#ffffff) | — | Configures color for eye highlight. |
| `enabled` | boolean | `true` | — | Turns eye highlight on or off. |
| `intensity` | number | `0.58` | 0 – 1 | Configures intensity for eye highlight. |
| `maskChannel` | select | `0` | `0` \| `1` \| `2` \| `3` | Configures mask channel for eye highlight. |
| `maskMap` | texture | — | — | Configures mask map for eye highlight. |
| `maskStrength` | number | `1` | 0 – 8 | Controls the blend strength for mask strength. |
| `power` | number | `22` | 0 – 44 | Configures power for eye highlight. |
| `showInShadowArea` | number | `0.4` | 0 – 1 | Configures show in shadow area for eye highlight. |
| `sourceMaskMode` | select | `'off'` | `off` \| `source` | Selects the policy used by source mask mode. |

### Character toon shading: Material Maps

Routes source normal, AO, emissive, MatCap, ramp, detail, roughness, metalness, and specular maps.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `aoStrength` | number | `0` | 0 – 8 | Controls the blend strength for ao strength. |
| `detailRepeat` | vector2 | `[1, 1]` | — | Configures detail repeat for material maps. |
| `detailStrength` | number | `0` | 0 – 8 | Controls the blend strength for detail strength. |
| `emissiveColor` | color | `[1, 1, 1]` (#ffffff) | — | Sets the color used by emissive color. |
| `emissiveStrength` | number | `0` | 0 – 8 | Controls the blend strength for emissive strength. |
| `enabled` | boolean | `true` | — | Turns material maps on or off. |
| `matcapStrength` | number | `0` | 0 – 8 | Controls the blend strength for matcap strength. |
| `metalnessStrength` | number | `0` | 0 – 8 | Controls the blend strength for metalness strength. |
| `normalScale` | vector2 | `[1, 1]` | — | Configures normal scale for material maps. |
| `normalStrength` | number | `0` | 0 – 8 | Controls the blend strength for normal strength. |
| `rampStrength` | number | `0` | 0 – 8 | Controls the blend strength for ramp strength. |
| `roughnessStrength` | number | `0` | 0 – 8 | Controls the blend strength for roughness strength. |
| `sourceMode` | select | `'source'` | `off` \| `source` | Selects the policy used by source mode. |
| `specularColorStrength` | number | `0` | 0 – 8 | Controls the blend strength for specular color strength. |

### Character toon shading: Outlines

Controls the inverted-hull outline pass, including role-specific widths and colors.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `defaultLightingMix` | number | `0.28` | 0 – 1 | Configures default lighting mix for outlines. |
| `defaultMaxBrightness` | number | `0.38` | 0 – 2 | Configures default max brightness for outlines. |
| `defaultMinBrightness` | number | `0.04` | 0 – 2 | Configures default min brightness for outlines. |
| `defaultTintColor` | color | `[0.34, 0.33, 0.4]` (#575466) | — | Sets the color used by default tint color. |
| `defaultWidth` | number | `0.002` | 0 – 0.08 | Controls the width used by default width. |
| `depthOffset` | number | `0` | -1 – 1 | Configures depth offset for outlines. |
| `depthTest` | boolean | `true` | — | Configures depth test for outlines. |
| `depthWrite` | boolean | `false` | — | Configures depth write for outlines. |
| `enabled` | boolean | `true` | — | Turns outlines on or off. |
| `eyeLightingMix` | number | `0.28` | 0 – 1 | Configures eye lighting mix for outlines. |
| `eyeMaxBrightness` | number | `0.38` | 0 – 2 | Configures eye max brightness for outlines. |
| `eyeMinBrightness` | number | `0.04` | 0 – 2 | Configures eye min brightness for outlines. |
| `eyeTintColor` | color | `[0.34, 0.33, 0.4]` (#575466) | — | Sets the color used by eye tint color. |
| `eyeWidth` | number | `0` | 0 – 0.08 | Controls the width used by eye width. |
| `faceLightingMix` | number | `0.28` | 0 – 1 | Configures face lighting mix for outlines. |
| `faceMaxBrightness` | number | `0.48` | 0 – 2 | Configures face max brightness for outlines. |
| `faceMinBrightness` | number | `0.04` | 0 – 2 | Configures face min brightness for outlines. |
| `faceTintColor` | color | `[0.62, 0.36, 0.34]` (#9e5c57) | — | Sets the color used by face tint color. |
| `faceWidth` | number | `0` | 0 – 0.08 | Controls the width used by face width. |
| `hairCutoutWidth` | number | `0` | 0 – 0.08 | Controls the width used by hair cutout width. |
| `hairLightingMix` | number | `0.08` | 0 – 1 | Configures hair lighting mix for outlines. |
| `hairMaxBrightness` | number | `0.68` | 0 – 2 | Configures hair max brightness for outlines. |
| `hairMinBrightness` | number | `0.085` | 0 – 2 | Configures hair min brightness for outlines. |
| `hairTintColor` | color | `[0.72, 0.78, 0.9]` (#b8c7e6) | — | Sets the color used by hair tint color. |
| `hairWidth` | number | `0.00055` | 0 – 0.08 | Controls the width used by hair width. |
| `maxWidth` | number | `0.006` | 0 – 0.08 | Controls the width used by max width. |
| `metalLightingMix` | number | `0.28` | 0 – 1 | Configures metal lighting mix for outlines. |
| `metalMaxBrightness` | number | `0.38` | 0 – 2 | Configures metal max brightness for outlines. |
| `metalMinBrightness` | number | `0.04` | 0 – 2 | Configures metal min brightness for outlines. |
| `metalTintColor` | color | `[0.34, 0.33, 0.4]` (#575466) | — | Sets the color used by metal tint color. |
| `metalWidth` | number | `0.002` | 0 – 0.08 | Controls the width used by metal width. |
| `polygonOffset` | boolean | `false` | — | Configures polygon offset for outlines. |
| `polygonOffsetFactor` | number | `1` | -1 – 1 | Configures polygon offset factor for outlines. |
| `polygonOffsetUnits` | number | `1` | -1 – 1 | Configures polygon offset units for outlines. |
| `referenceDistance` | number | `4` | 0.5 – 20 | Configures reference distance for outlines. |
| `referenceFov` | number | `40` | 10 – 120 | Configures reference fov for outlines. |
| `screenSpaceWidth` | number | `1` | 0 – 0.08 | Controls the width used by screen space width. |
| `smoothNormals` | boolean | `true` | — | Configures smooth normals for outlines. |
| `widthFadeDistance` | number | `12` | 1 – 100 | Configures width fade distance for outlines. |
| `skinLightingMix` | number | `0.28` | 0 – 1 | Configures skin lighting mix for outlines. |
| `skinMaxBrightness` | number | `0.48` | 0 – 2 | Configures skin max brightness for outlines. |
| `skinMinBrightness` | number | `0.04` | 0 – 2 | Configures skin min brightness for outlines. |
| `skinTintColor` | color | `[0.62, 0.36, 0.34]` (#9e5c57) | — | Sets the color used by skin tint color. |
| `skinWidth` | number | `0.001` | 0 – 0.08 | Controls the width used by skin width. |
| `transparentOverlayWidth` | number | `0` | 0 – 0.08 | Controls the width used by transparent overlay width. |
| `widthScale` | number | `1` | 0 – 4 | Configures width scale for outlines. |

### Character toon shading: Glitter

Adds procedural view-dependent sparkles for sparkly costumes and accessories. Off by default.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Turns glitter on or off. |
| `intensity` | number | `1` | 0 – 1 | Configures intensity for glitter. |
| `density` | number | `1` | 0 – 1 | Configures density for glitter. |
| `size` | number | `1` | 0 – 1 | Configures size for glitter. |
| `randomNormalStrength` | number | `0.5` | 0 – 8 | Controls the blend strength for random normal strength. |
| `showInShadowArea` | number | `0.15` | 0 – 1 | Configures show in shadow area for glitter. |
| `uvChannel` | select | `1` | `0` \| `1` | Configures uv channel for glitter. |
| `defaultIntensity` | number | `1` | 0 – 8 | Controls how strongly default intensity contributes. |
| `eyeIntensity` | number | `0` | 0 – 8 | Controls how strongly eye intensity contributes. |
| `faceIntensity` | number | `0` | 0 – 8 | Controls how strongly face intensity contributes. |
| `hairIntensity` | number | `0` | 0 – 8 | Controls how strongly hair intensity contributes. |
| `skinIntensity` | number | `0` | 0 – 8 | Controls how strongly skin intensity contributes. |

### Character toon shading: Sticker

Blends a decal/overlay texture into the albedo before lighting (ice, tattoos, damage). Off by default.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `blendMode` | select | `'normal'` | `normal` \| `add` \| `multiply` | Selects the policy used by blend mode. |
| `enabled` | boolean | `false` | — | Turns sticker on or off. |
| `map` | texture | — | — | Configures map for sticker. |
| `offset` | vector2 | `[0, 0]` | — | Configures offset for sticker. |
| `repeat` | vector2 | `[1, 1]` | — | Configures repeat for sticker. |
| `strength` | number | `1` | 0 – 1 | Configures strength for sticker. |
| `uvChannel` | select | `0` | `0` \| `1` | Configures uv channel for sticker. |

### Character toon shading: Perspective Removal

Flattens perspective around the tracked head for anime-portrait closeups. Off by default.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `amount` | number | `0` | 0 – 1 | Configures amount for perspective removal. |
| `enabled` | boolean | `false` | — | Turns perspective removal on or off. |
| `radius` | number | `1.4` | 0 – 2.8 | Configures radius for perspective removal. |
| `startHeight` | number | `0` | 0 – 1 | Configures start height for perspective removal. |
| `endHeight` | number | `1` | 0 – 1 | Configures end height for perspective removal. |

### Character toon shading: Fur

Opt-in shell fur for matched materials (collars, trims, animal parts). Off by default.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Turns fur on or off. |
| `shellCount` | number | `8` | 0 – 16 | Configures shell count for fur. |
| `length` | number | `0.02` | 0 – 1 | Configures length for fur. |
| `gravity` | number | `0.35` | 0 – 1 | Configures gravity for fur. |
| `density` | number | `3` | 0 – 6 | Configures density for fur. |
| `rootOffset` | number | `-0.2` | -1 – 1 | Configures root offset for fur. |
| `rootShade` | number | `0.55` | 0 – 1 | Configures root shade for fur. |
| `materials` | object | — | — | Configures materials for fur. |
| `roles` | object | — | — | Configures roles for fur. |

## Environment shading

Module: `toonlab/environment` — 2 groups, 76 fields.

Settings are `{ features, parameters }`: `createEnvironmentSettings({ parameters: { exposure: 0.95 } })`.

### Environment shading: Features

Enables or disables individual environment shader feature paths.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `alphaCutout` | boolean | `true` | — | Turns alpha cutout processing on or off for environment materials. |
| `alphaMap` | boolean | `true` | — | Turns alpha map processing on or off for environment materials. |
| `ambientLight` | boolean | `true` | — | Turns ambient light processing on or off for environment materials. |
| `ambientProbe` | boolean | `true` | — | Turns ambient probe processing on or off for environment materials. |
| `aoMap` | boolean | `true` | — | Turns ao map processing on or off for environment materials. |
| `aoOverlay` | boolean | `true` | — | Turns ao overlay processing on or off for environment materials. |
| `directionalLights` | boolean | `true` | — | Turns directional lights processing on or off for environment materials. |
| `emissive` | boolean | `true` | — | Turns emissive processing on or off for environment materials. |
| `emissiveMap` | boolean | `true` | — | Turns emissive map processing on or off for environment materials. |
| `foliageCutout` | boolean | `true` | — | Turns foliage cutout processing on or off for environment materials. |
| `heightFog` | boolean | `true` | — | Turns height fog processing on or off for environment materials. |
| `interiorOcclusion` | boolean | `true` | — | Turns interior occlusion processing on or off for environment materials. |
| `leftSideShadow` | boolean | `true` | — | Turns side shadow processing on or off for environment materials. |
| `lightMap` | boolean | `true` | — | Turns lightmap processing on or off for environment materials. |
| `normalMap` | boolean | `true` | — | Turns normal map processing on or off for environment materials. |
| `packedMap` | boolean | `true` | — | Turns packed map processing on or off for environment materials. |
| `planarReflection` | boolean | `true` | — | Turns floor reflection processing on or off for environment materials. |
| `pointLights` | boolean | `true` | — | Turns point lights processing on or off for environment materials. |
| `shadowMask` | boolean | `true` | — | Turns shadow mask processing on or off for environment materials. |
| `shadowMesh` | boolean | `true` | — | Turns shadow mesh processing on or off for environment materials. |
| `skyTint` | boolean | `true` | — | Turns sky tint processing on or off for environment materials. |
| `specular` | boolean | `true` | — | Turns specular processing on or off for environment materials. |
| `spotLights` | boolean | `true` | — | Turns spot lights processing on or off for environment materials. |
| `sunBoost` | boolean | `true` | — | Turns sun boost processing on or off for environment materials. |
| `untexturedGradient` | boolean | `true` | — | Turns untextured gradient processing on or off for environment materials. |
| `vertexAo` | boolean | `true` | — | Turns vertex ao processing on or off for environment materials. |
| `windowCutout` | boolean | `true` | — | Turns window cutout processing on or off for environment materials. |

### Environment shading: Shader Parameters

Overrides numeric environment shader uniforms. Auto values preserve material defaults.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `ambientProbeBlend` | number | — | 0 – 1 | Overrides ambient probe blend; leave unset in code to use the material default. |
| `ambientStrength` | number | — | 0 – 2 | Overrides ambient strength; leave unset in code to use the material default. |
| `ambientLightInfluence` | number | — | 0 – 2 | Overrides ambient influence; leave unset in code to use the material default. |
| `aoMapStrength` | number | — | 0 – 2 | Overrides ao map strength; leave unset in code to use the material default. |
| `aoWarmth` | number | — | 0 – 1 | Overrides ao warmth; leave unset in code to use the material default. |
| `bakedGlowStrength` | number | — | 0 – 2 | Overrides baked glow; leave unset in code to use the material default. |
| `cloudShadowCoverage` | number | — | 0 – 1 | Overrides cloud shadow coverage; leave unset in code to use the material default. |
| `cloudShadowScale` | number | — | 0 – 0.1 | Overrides cloud shadow scale; leave unset in code to use the material default. |
| `cloudShadowStrength` | number | — | 0 – 2 | Overrides cloud shadow; leave unset in code to use the material default. |
| `directLightStrength` | number | — | 0 – 2 | Overrides direct light; leave unset in code to use the material default. |
| `emissiveMapStrength` | number | — | 0 – 2 | Overrides emissive map strength; leave unset in code to use the material default. |
| `emissiveStrength` | number | — | 0 – 2 | Overrides emissive strength; leave unset in code to use the material default. |
| `exposure` | number | — | 0 – 2 | Overrides exposure; leave unset in code to use the material default. |
| `heightFogColor` | color | — | — | Overrides height fog color; leave unset in code to use the material default. |
| `heightFogDensity` | number | — | 0 – 0.5 | Overrides height fog density; leave unset in code to use the material default. |
| `heightFogFalloff` | number | — | 0.05 – 30 | Overrides height fog falloff; leave unset in code to use the material default. |
| `interiorOcclusionColor` | color | — | — | Overrides interior occlusion color; leave unset in code to use the material default. |
| `interiorOcclusionStrength` | number | — | 0 – 2 | Overrides interior occlusion strength; leave unset in code to use the material default. |
| `leftSideShadow` | number | — | 0 – 1 | Overrides side shadow; leave unset in code to use the material default. |
| `leftSideShadowColor` | color | — | — | Overrides side shadow color; leave unset in code to use the material default. |
| `lightMapLift` | number | — | 0 – 1 | Overrides lightmap lift; leave unset in code to use the material default. |
| `lightMapStrength` | number | — | 0 – 2 | Overrides lightmap strength; leave unset in code to use the material default. |
| `lightingInfluence` | number | — | 0 – 2 | Overrides lighting influence; leave unset in code to use the material default. |
| `normalMapStrength` | number | — | 0 – 2 | Overrides normal map strength; leave unset in code to use the material default. |
| `packedOcclusionStrength` | number | — | 0 – 2 | Overrides packed occlusion; leave unset in code to use the material default. |
| `planarReflectionFresnel` | number | — | 0.1 – 8 | Overrides floor reflection fresnel; leave unset in code to use the material default. |
| `planarReflectionStrength` | number | — | 0 – 2 | Overrides floor reflection strength; leave unset in code to use the material default. |
| `pointLightStrength` | number | — | 0 – 2 | Overrides point light; leave unset in code to use the material default. |
| `saturation` | number | — | 0 – 2 | Overrides saturation; leave unset in code to use the material default. |
| `shadeSoftness` | number | — | 0 – 1 | Overrides shade softness; leave unset in code to use the material default. |
| `shadeStrength` | number | — | 0 – 2 | Overrides shade strength; leave unset in code to use the material default. |
| `shadowLift` | number | — | 0 – 1 | Overrides shadow lift; leave unset in code to use the material default. |
| `sunShadowStrength` | number | — | 0 – 2 | Overrides sun shadow strength; leave unset in code to use the material default. |
| `shadowTintColor` | color | — | — | Overrides shadow tint; leave unset in code to use the material default. |
| `skyGroundTint` | color | — | — | Overrides sky ground tint; leave unset in code to use the material default. |
| `skyTintStrength` | number | — | 0 – 2 | Overrides sky tint strength; leave unset in code to use the material default. |
| `skyTopTint` | color | — | — | Overrides sky top tint; leave unset in code to use the material default. |
| `specularColor` | color | — | — | Overrides specular color; leave unset in code to use the material default. |
| `specularShininess` | number | — | 1 – 256 | Overrides specular shininess; leave unset in code to use the material default. |
| `specularSoftness` | number | — | 0 – 1 | Overrides specular softness; leave unset in code to use the material default. |
| `specularStrength` | number | — | 0 – 2 | Overrides specular strength; leave unset in code to use the material default. |
| `spotLightStrength` | number | — | 0 – 2 | Overrides spot light; leave unset in code to use the material default. |
| `sunBoost` | number | — | 0 – 1 | Overrides sun boost; leave unset in code to use the material default. |
| `sunBoostColor` | color | — | — | Overrides sun boost color; leave unset in code to use the material default. |
| `triplanarDetail` | number | — | 0 – 1 | Overrides triplanar detail; leave unset in code to use the material default. |
| `triplanarDetailScale` | number | — | 0.25 – 64 | Overrides triplanar detail scale; leave unset in code to use the material default. |
| `triplanarEdgeHighlight` | number | — | 0 – 1 | Overrides rock edge highlight; leave unset in code to use the material default. |
| `untexturedGradientStrength` | number | — | 0 – 2 | Overrides untextured gradient strength; leave unset in code to use the material default. |
| `vertexAoStrength` | number | — | 0 – 2 | Overrides vertex ao strength; leave unset in code to use the material default. |

## Water

Module: `toonlab/water` — 7 groups, 82 fields.

Settings are flat: `createWaterSettings({ preset: "ocean", waveIntensity: 0.6 })`. Groups exist for UI organization only.

### Water: Waves

Gerstner swell and detail ripple shaping.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `waveIntensity` | number | `0.25` | 0 – 1 | Master dial from glassy mirror (0) to storm swell (1). |
| `waterLevel` | number | `0.36` | 0 – 4 | World-space rest height of the surface; waves and run-up displace around it. |
| `waveAmplitude` | number | `0.3` | 0 – 5 | Largest wave amplitude in meters at full intensity; 5 gives a 10 m crest-to-trough swell. |
| `shoalingDepth` | number | `1.4` | 0.05 – 12 | Column depth in meters at which waves reach full height; shallower water shrinks them (needs a bed height sampler). |
| `shorelineWaves` | number | `0.35` | 0 – 1 | Fraction of wave height that keeps rolling through the shallows as surf before dying at the waterline. |
| `shorelineRunup` | number | `0.6` | 0 – 3 | How far incoming waves wash a thin foam film up the beach; reach scales with wave energy. |
| `runupDistance` | number | `0` | 0 – 15 | Maximum horizontal reach in meters. Wave groups vary each event from 80–100%, and each backwash hands its endpoint into the next uprush. 0 lets wave energy decide. |
| `breakerEnabled` | boolean | `true` | — | Master switch for the breaker system; off removes the mesh and skips all breaker work (for perf A/B). |
| `breakerAmount` | number | `0` | 0 – 1 | Dedicated curling breaker shells along the break line; 0 disables the system (needs a bed height sampler). |
| `breakerCurl` | number | `0.8` | 0 – 1 | Lip pitch: 0 spills down the face, 1 curls a full surfable tunnel. |
| `breakerScale` | number | `1` | 0.25 – 3 | Shell height multiplier over the physical breaking height (0.72x column depth). |
| `breakerPeel` | number | `1` | 0 – 4 | How fast the barrel section travels sideways along the crest line. |
| `waveLength` | number | `7.5` | 1 – 120 | Longest wavelength in meters; smaller waves are derived from it. Big swells need long wavelengths to stay stable. |
| `waveSteepness` | number | `0.75` | 0 – 1.4 | Gerstner chop; higher values pinch crests sharper. |
| `waveSpeed` | number | `1` | 0 – 4 | Phase speed multiplier over the deep-water dispersion. |
| `waveDirection` | vector2 | `[1, 0.35]` | — | Main travel direction of the swell in the XZ plane. |
| `waveDirectionSpread` | number | `0.65` | 0 – 1 | 0 keeps all waves aligned (river); 1 spreads them omnidirectionally (open sea). The primary swell always follows Wave Direction exactly. |
| `waveSetPeriod` | number | `60` | 8 – 600 | Seconds between wave-set peaks at a fixed point; big waves arrive in groups, not every period. |
| `waveSetStrength` | number | `0.5` | 0 – 1 | Depth of the set/lull cycle: 0 = constant swell, 1 = the swell dies completely between sets. |
| `detailNormalStrength` | number | `0.32` | 0 – 2 | Strength of the procedural micro-ripple normal detail. |
| `detailScale` | number | `1.15` | 0.05 – 8 | Spatial frequency of the micro-ripple detail. |
| `flowDirection` | vector2 | `[0.72, -0.18]` | — | Scroll direction for detail ripples, foam noise, and sparkles. |
| `flowSpeed` | number | `0.3` | 0 – 4 | Scroll speed for surface detail; high values read as a river current. |

### Water: Surface

Water body color, refraction, and caustics.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `colorTone` | select | `'classic'` | `classic` \| `anime` \| `teal` \| `caribbean` \| `lagoon` \| `deepOcean` | Named body-color palette forced over the preset colors; classic returns control to the preset. |
| `shallowColor` | color | `[0.42, 0.85, 0.88]` (#6bd9e0) | — | Water tint right at the shoreline. |
| `midColor` | color | `[0.2, 0.62, 0.8]` (#339ecc) | — | Water tint at moderate depth. |
| `deepColor` | color | `[0.1, 0.38, 0.6]` (#1a6199) | — | Water tint where the bottom is no longer visible. |
| `depthFadeDistance` | number | `1` | 0.05 – 12 | Water column depth where the shallow tint gives way to mid. |
| `deepFadeDistance` | number | `2.2` | 0.05 – 24 | Additional depth where mid fades to the deep tint. |
| `opacity` | number | `0.8` | 0 – 1 | Base transparency when no scene color grab pass is bound. |
| `refractionStrength` | number | `0.35` | 0 – 2 | Screen-space distortion of the underwater scene. |
| `indexOfRefraction` | number | `1.333` | 1.0001 – 1.8 | Index of refraction used by the underwater Snell window and total internal reflection. |
| `underwaterTransmission` | number | `1` | 0 – 1 | Visibility of the real above-water scene through the surface from below. |
| `underwaterTintStrength` | number | `0.35` | 0 – 1 | Stylized water-color tint applied to the view through the surface. |
| `causticsStrength` | number | `0.55` | 0 – 3 | Brightness of the procedural voronoi caustics on the bottom. |
| `causticsScale` | number | `0.8` | 0.05 – 8 | Spatial frequency of the caustic web. |
| `causticsSpeed` | number | `0.6` | 0 – 4 | Animation speed of the caustic web. |

### Water: Foam

Shoreline foam, whitecaps, and wake foam.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `foamColor` | color | `[0.94, 1, 0.99]` (#f0fffc) | — | Color of all foam: shoreline, whitecaps, wakes, and splashes. |
| `foamAmount` | number | `1` | 0 – 2 | Offshore contact foam, whitecap, and wake gain. |
| `swashFoamAmount` | number | `1.15` | 0 – 2 | Independent gain for torn foam carried up and back down the beach. |
| `swashFoamLifetime` | number | `4` | 0.25 – 30 | Seconds fresh aerated swash foam remains before thinning into residue. |
| `swashFoamResidueLifetime` | number | `10` | 0.5 – 60 | Seconds fragmented beach foam persists and drifts after the active front passes. |
| `wetSandDryTime` | number | `120` | 2 – 600 | Seconds saturated sand takes to return to its dry color after the water retreats. |
| `wetSandDarkening` | number | `0.58` | 0 – 1 | How strongly remembered moisture darkens exposed sand. |
| `wetSandSheen` | number | `0.78` | 0 – 1 | Strength of the short-lived glossy water film left on freshly exposed sand. |
| `foamContactDistance` | number | `0.4` | 0.02 – 4 | Depth difference covered by the solid contact foam band. |
| `foamLineSpacing` | number | `0.55` | 0.05 – 4 | Spacing of the animated lapping foam lines off the shore. |
| `foamNoiseScale` | number | `0.6` | 0.05 – 8 | Breakup noise frequency for foam edges. |
| `whitecapAmount` | number | `0.05` | 0 – 1 | Coverage of breaking crests on open water. |
| `rippleFoamStrength` | number | `0.8` | 0 – 3 | Foam intensity left behind by interactive ripples and wakes. |

### Water: Lighting

Sun glints, sparkles, fresnel, and reflections.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `sunDirection` | vector3 | `[0.35, 0.8, 0.45]` | — | World-space direction toward the sun. |
| `sunColor` | color | `[1, 0.96, 0.86]` (#fff5db) | — | Sun tint used by glints, sparkles, and caustics. |
| `specularStrength` | number | `0.8` | 0 – 3 | Toon sun-glint intensity. |
| `specularShininess` | number | `150` | 4 – 2000 | Glint tightness; higher is smaller and sharper. |
| `specularStretch` | number | `0.35` | 0 – 0.95 | Elongates glints along the sun azimuth into a sparkling sun path. |
| `sparkleStrength` | number | `0.5` | 0 – 3 | Twinkling star-glint intensity. |
| `sparkleScale` | number | `1.5` | 0.1 – 16 | Density of the sparkle field. |
| `sparkleSpeed` | number | `1` | 0 – 6 | How quickly sparkles twinkle in and out. |
| `sunGlowStrength` | number | `0.85` | 0 – 3 | Sun disk glow in the procedural sky reflection. |
| `sceneShadowStrength` | number | `0.6` | 0 – 1 | How strongly cast shadows from rocks, trees, and the character darken the surface. |
| `fresnelStrength` | number | `0.9` | 0 – 2 | Grazing-angle reflectivity boost. |
| `fresnelPower` | number | `4.5` | 0.5 – 12 | Falloff of the fresnel band toward the horizon. |
| `fresnelBias` | number | `0.16` | 0 – 0.6 | Sky-tint floor at steep angles; higher reads more anime-blue. |
| `fresnelColor` | color | `[0.68, 0.9, 1]` (#ade6ff) | — | Additive rim tint at grazing angles. |
| `skyZenithColor` | color | `[0.5, 0.74, 0.98]` (#80bdfa) | — | Procedural sky reflection color overhead. |
| `skyHorizonColor` | color | `[0.86, 0.95, 1]` (#dbf2ff) | — | Procedural sky reflection color at the horizon. |
| `reflectionStrength` | number | `0.62` | 0 – 1.5 | Planar/sky reflection mix, weighted by fresnel. |
| `reflectionDistortion` | number | `0.04` | 0 – 0.3 | How much waves shatter the reflection. |
| `reflectionSoftness` | number | `0.55` | 0 – 1 | Blends sharp planar reflections toward the soft procedural sky (milky anime look). |

### Water: Ripples

Interactive ripple simulation response.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `rippleStrength` | number | `1` | 0 – 6 | Global multiplier for splash and wake impulses. |
| `rippleDamping` | number | `0.985` | 0.9 – 0.999 | Energy retained per frame; higher rings travel farther. |
| `ripplePropagation` | number | `11` | 1 – 40 | Travel speed of interactive rings across the surface. |
| `rippleHeightScale` | number | `1` | 0 – 4 | Vertical displacement of the interactive ripples. |
| `rippleFoamDecay` | number | `0.94` | 0.5 – 0.999 | How long wake foam lingers. |
| `rippleFoamGain` | number | `2.4` | 0 – 12 | How quickly motion generates wake foam. |

### Water: Splashes

Procedural splash droplets, spray, and rings.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `splashStrength` | number | `1` | 0 – 3 | Global multiplier for splash particle counts and energy. |
| `splashScale` | number | `1` | 0.1 – 4 | Physical size multiplier for droplets, spray, and rings. |
| `splashDropletCount` | number | `26` | 0 – 120 | Droplets emitted by a strength-1 splash. |
| `splashRingCount` | number | `2` | 0 – 4 | Expanding foam rings emitted per splash. |
| `splashColor` | color | `[0.97, 1, 1]` (#f7ffff) | — | Bright tone of droplets and spray. |
| `splashShadeColor` | color | `[0.62, 0.86, 0.95]` (#9edbf2) | — | Shadow tone of the two-tone splash shading. |

### Water: Quality

Shader quality tier gating caustics, sparkles, and noise octaves.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `quality` | select | `'high'` | `low` \| `medium` \| `high` | Named quality tier: low drops caustics and sparkles, high adds chromatic caustics and extra detail octaves. |

## Post-processing

Module: `toonlab/post` — 2 groups, 37 fields.

Settings are `{ features, parameters }`: `createPostProcessingSettings({ preset: "softAnime" })`.

### Post-processing: Features

Toggles for each optional screen-space effect in the final composite pass.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `bloom` | boolean | `false` | — | Adds glow around pixels brighter than the bloom threshold. |
| `colorGrade` | boolean | `false` | — | Applies exposure, contrast, saturation, and warmth grading. |
| `depthCue` | boolean | `false` | — | Fades distant pixels toward the depth cue color for atmospheric depth. |
| `enabled` | boolean | `false` | — | Forces the post-processing composite pass on, even with no individual effect active. |
| `motionBlur` | boolean | `false` | — | Blurs camera movement by reprojecting the previous frame (camera motion only). |
| `screenOutline` | boolean | `false` | — | Draws screen-space outlines from depth and luminance edges. |
| `vignette` | boolean | `false` | — | Darkens the frame toward the corners. |
| `verticalGrade` | boolean | `false` | — | Adds warm light at the top of the frame and darkening at the bottom. |

### Post-processing: Parameters

Tuning values used by the post-processing effects when their feature toggles are on.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `bloomBackgroundSuppress` | number | `1` | 0 – 2 | Scales bloom gathered from non-character pixels when a character mask is connected. |
| `bloomCharacterBoost` | number | `1` | 0 – 4 | Scales bloom gathered from character pixels when a character mask is connected. |
| `bloomLevels` | number | `5` | 2 – 8 | Number of mip levels in the pyramid bloom chain (pyramid mode only). |
| `bloomMode` | select | `'single'` | `single` \| `pyramid` | Selects the one-pass 9-tap bloom or the wider multi-pass pyramid bloom. |
| `bloomRadius` | number | `0.16` | 0 – 1 | Controls how far the bloom glow spreads from bright pixels. |
| `bloomStrength` | number | `0` | 0 – 2 | Controls how strongly bloom is added to the image. |
| `bloomThreshold` | number | `0.995` | 0 – 1 | Sets the luminance above which pixels start to bloom. |
| `bottomDark` | number | `0` | 0 – 1 | Darkens the lower part of the frame in the vertical grade. |
| `contrast` | number | `1` | 0 – 2 | Scales contrast around mid gray in the color grade. |
| `depthCueColor` | color | `[0.3371636150376657, 0.4735314961384573, 0.6866853124288864]` (#5679af) | — | Sets the color distant pixels fade toward. |
| `depthCueFar` | number | `24` | 0 – 200 | Sets the depth at which the depth cue reaches full strength. |
| `depthCueNear` | number | `1` | 0 – 50 | Sets the depth at which the depth cue starts to appear. |
| `depthCueStrength` | number | `0` | 0 – 1 | Controls how strongly distant pixels blend toward the depth cue color. |
| `exposure` | number | `1` | 0 – 4 | Multiplies overall image brightness in the color grade. |
| `lutMap` | texture | — | — | Optional 2D-strip color LUT texture (runtime only, not serialized). |
| `lutSize` | number | `0` | 0 – 64 | Slice size of the LUT strip; 0 derives it from the texture height. |
| `lutStrength` | number | `0` | 0 – 1 | Controls how strongly the LUT recolors the graded image. |
| `motionBlurStrength` | number | `0.55` | 0 – 2 | Scales the camera-reprojection blur distance along the motion vector. |
| `outlineColor` | color | `[0.005181516700061659, 0.006512090790025684, 0.010329823026364548]` (#010203) | — | Sets the color drawn on detected screen-space edges. |
| `outlineDepthStrength` | number | `0.16` | 0 – 2 | Controls how strongly depth discontinuities contribute to outlines. |
| `outlineLumaStrength` | number | `0.04` | 0 – 2 | Controls how strongly luminance edges contribute to outlines. |
| `outlineStrength` | number | `0` | 0 – 2 | Controls the overall opacity of screen-space outlines. |
| `saturation` | number | `1` | 0 – 2 | Scales color saturation in the color grade. |
| `strength` | number | `1` | 0 – 1 | Blends between the raw render and the full post-processing result. |
| `topLight` | number | `0` | 0 – 1 | Adds warm light to the upper part of the frame in the vertical grade. |
| `vignetteRadius` | number | `0.72` | 0 – 1 | Sets the distance from the frame center where the vignette starts. |
| `vignetteSoftness` | number | `0.34` | 0 – 1 | Controls the falloff width of the vignette edge. |
| `vignetteStrength` | number | `0` | 0 – 1 | Controls how strongly the vignette darkens the frame edges. |
| `warmth` | number | `0` | -1 – 1 | Shifts the color grade warmer (positive) or cooler (negative). |

## Grass

Module: `toonlab/vegetation` — 5 groups, 20 fields.

Flat settings consumed by `new StylizedGrassField(options)` and `grass.applySettings(options)`.

### Grass: Blades

Random blade dimensions baked into the instance attributes when the field is built. Construction-only.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `bladeHeightRange` | vector2 | `[0.16, 0.42]` | — | Min/max blade height in meters for placements without an explicit height. Construction-only: baked into instance attributes. |
| `bladeWidthRange` | vector2 | `[0.05, 0.085]` | — | Min/max blade width in meters for placements without an explicit width. Construction-only: baked into instance attributes. |

### Grass: Wind

Per-blade wind sway and the traveling gust bands that ripple across the field.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `windDirection` | vector2 | `[1, 0.3]` | — | Horizontal (XZ) heading the wind blows toward. Magnitude does not matter; use wind strength for amplitude. |
| `windSpeed` | number | `1` | 0 – 4 | How fast the per-blade sway oscillates. |
| `windStrength` | number | `0.16` | 0 – 1 | How far blade tips bend with the wind. |
| `gustFrequency` | number | `0.35` | 0 – 2 | Spatial frequency of the traveling gust bands; higher packs gust waves closer together. |
| `gustSpeed` | number | `1.6` | 0 – 6 | How fast gust bands travel across the field. |

### Grass: Lighting

Blade palette and sun/sky response, including the backlit glow on blades between the camera and the sun.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `baseColor` | color | `[0.42, 0.68, 0.24]` (#6bad3d) | — | Blade color at the root. |
| `tipColor` | color | `[0.74, 0.9, 0.42]` (#bde66b) | — | Blade color at the tip; blades gradient from base to tip. |
| `sunDirection` | vector3 | `[0.35, 0.72, 0.42]` | — | World-space direction toward the sun (normalized on apply). Match your main directional light. |
| `sunColor` | color | `[1, 0.96, 0.84]` (#fff5d6) | — | Sunlight tint applied to lit blades. |
| `skyColor` | color | `[0.62, 0.78, 0.95]` (#9ec7f2) | — | Ambient sky tint mixed into shaded blades. |
| `backlitStrength` | number | `0.3` | 0 – 2 | Translucent backlight boost when the camera looks toward the sun through the blades. |

### Grass: Shadows

Scene-shadow darkening and the drifting procedural cloud shadows over the field.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `shadowStrength` | number | `0.9` | 0 – 1 | How strongly renderer shadow maps (trees, rocks, the character) darken blades. |
| `shadowTint` | color | `[0.42, 0.47, 0.62]` (#6b789e) | — | Color a fully shadowed blade is multiplied by (cool and dark so grass matches the terrain shadow response). |
| `cloudShadowStrength` | number | `0` | 0 – 1 | How strongly drifting procedural cloud shadows darken the field. 0 disables the effect. |
| `cloudShadowCoverage` | number | `0.45` | 0 – 1 | Fraction of the field covered by cloud shadow at any moment. |
| `cloudShadowScale` | number | `0.012` | 0.001 – 0.1 | World-to-noise scale of the cloud shadow pattern; smaller values give larger cloud shapes. |
| `cloudShadowVelocity` | vector2 | `[0.02, 0.006]` | — | Cloud shadow drift in noise-space units per second (world drift = velocity / scale). |

### Grass: Interaction

Character push-away response around the push target.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `pushRadius` | number | `0.9` | 0 – 3 | Radius in meters around the push target within which blades bend away. |

## Flowers

Module: `toonlab/vegetation` — 3 groups, 7 fields.

Flat settings consumed by `new StylizedFlowerField(options)` and `flowers.applySettings(options)`.

### Flowers: Heads

Random head sizes baked into the instance attributes when the field is built. Construction-only.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `sizeRange` | vector2 | `[0.045, 0.08]` | — | Min/max head size in meters for placements without an explicit size. Construction-only: baked into instance attributes. |

### Flowers: Wind

Wind sway shared with the surrounding grass so heads and blades move together.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `windDirection` | vector2 | `[1, 0.3]` | — | Horizontal (XZ) heading the wind blows toward. Magnitude does not matter; use wind strength for amplitude. |
| `windSpeed` | number | `1` | 0 – 4 | How fast the head sway oscillates. |
| `windStrength` | number | `0.16` | 0 – 1 | How far flower heads bob with the wind. |

### Flowers: Appearance

Petal/center palette and scene-shadow darkening.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `petalColor` | color | `[1, 0.98, 0.92]` (#fffaeb) | — | Petal color of the procedural daisies. |
| `centerColor` | color | `[0.98, 0.8, 0.34]` (#facc57) | — | Center-disc color of the procedural daisies. |
| `shadowStrength` | number | `0.85` | 0 – 1 | How strongly renderer shadow maps darken flower heads. |

## Trees

Module: `toonlab/vegetation` — 5 groups, 68 fields.

Grouped settings consumed by `new StylizedTree(options)` and `tree.applySettings(options)`.

### Trees: Tree

Overall scale, seed, crown reach, leaf coverage, and canopy palette. Everything except the palette and trunk shadow flag bakes geometry at construction.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `size` | number | `1` | 0.2 – 6 | Overall tree multiplier (1 ≈ 3 m tree, 2 ≈ 6 m, 3+ large). Construction-only: also densifies canopy cards so leaves stay leaf-sized. |
| `seed` | number | `1` | 1 – 999 | Deterministic generation seed; the same options and seed always grow the same tree. Construction-only. |
| `canopyColor` | color | `[0.30196078431372547, 0.6352941176470588, 0.34509803921568627]` (#4da258) | — | Canopy base color; the lit/shadow/crown palette derives from it. Also accepts richer resolveCanopyColor specs (color lists, {from,to} blends, HSL ranges) resolved per seed. |
| `canopyPalette` | object | `'[object Object]'` | — | Optional explicit { lit, shadow, crown } tone overrides; unset tones derive from the canopy color. |
| `canopyWidth` | number | `1` | 0.3 – 2.5 | X-axis crown reach multiplier. Construction-only: shapes the blob layout. |
| `canopyDepth` | number | `1` | 0.3 – 2.5 | Z-axis crown reach multiplier. Construction-only: shapes the blob layout. |
| `canopyLayout` | object | `'[object Object]'` | — | Optional createCanopyBlobs overrides (lobeCount, spread, flatten, coreRadius, ...). Construction-only. |
| `leafDensity` | number | `1` | 0.05 – 2 | Crown leaf coverage. Below ~0.9 see-through gap pockets open and branches read through; above 1 packs extra cards (and fatter tufts) for lush crowns. Construction-only. |
| `canopyScale` | number | `1` | 0.2 – 3 | Canopy-only scale relative to the trunk. Construction-only. |
| `leafPlacement` | select | `'canopy'` | `canopy` \| `tips` | canopy: solid leaf mass hiding interior wood. tips: bushes only at branch ends with bare limbs between them (Sumeru silhouette). Construction-only. |
| `trunkReceiveShadow` | boolean | `true` | — | Whether the bark receives shadow maps. Massive pale-limbed trees read better with this off. |

### Trees: Trunk

Trunk silhouette (bend, lean, twist, gnarl) shared by the skeleton grower and the classic curved-trunk generator. Construction-only.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `height` | number | `1.55` | 0.4 – 3 | Trunk height in meters (before the overall size multiplier). Construction-only. |
| `radiusBottom` | number | `0.19` | 0.05 – 0.6 | Trunk radius at the root flare in meters. Construction-only. |
| `radiusTop` | number | `0.085` | 0.02 – 0.3 | Trunk radius at the top in meters. Classic trunk generator (createTreeTrunkGeometry) only. Construction-only. |
| `bend` | number | `0.12` | 0 – 0.8 | Mid-trunk bow amplitude that returns toward center (S-curve) in meters. Construction-only. |
| `lean` | number | `0.16` | 0 – 1.2 | Off-vertical drift that accumulates toward the top, in meters. Construction-only. |
| `twist` | number | `0` | -4 – 4 | Y-rotation of the cross-section over the full height in radians; spirals the bark like wrung wood. Construction-only. |
| `gnarl` | number | `0` | 0 – 2 | High-frequency wiggle and radius bulges: 0 is a clean park tree, 1+ reads like an old bonsai. Construction-only. |
| `gnarlFrequencyXRange` | vector2 | `[4.2, 7.6]` | — | Seeded min/max wave count of the gnarl wiggle over the trunk height on the X axis. Classic trunk generator only. Construction-only. |
| `gnarlFrequencyZRange` | vector2 | `[3.1, 6.7]` | — | Seeded min/max wave count of the gnarl wiggle over the trunk height on the Z axis. Classic trunk generator only. Construction-only. |
| `gnarlAmplitude` | number | `0.16` | 0 – 0.5 | Meters of gnarl wiggle (and radius bulge fraction) per unit of gnarl. Classic trunk generator only. Construction-only. |
| `radialGnarlFrequency` | number | `9.3` | 0 – 20 | Wave count of the gnarl radius bulges (old-wood knuckles) over the trunk height. Classic trunk generator only. Construction-only. |
| `bendDirection` | number | — | -6.283 – 6.283 | World heading of the bow in radians; null/unset picks a seeded heading. Construction-only. |
| `leanOffset` | number | — | -6.283 – 6.283 | Lean heading relative to the bow in radians (PI pins a serpentine S-trunk); null/unset picks a seeded offset. Construction-only. |
| `radialSegments` | number | `10` | 3 – 16 | Cross-section segment count of the trunk tube. Classic trunk generator only. Construction-only. |
| `heightSegments` | number | `14` | 2 – 24 | Vertical segment count of the trunk tube. Classic trunk generator only. Construction-only. |
| `branchCount` | number | `2` | 0 – 6 | Number of stub branches near the top. Classic trunk generator only. Construction-only. |
| `branchLength` | number | `0.55` | 0 – 1.5 | Base branch length in meters. Classic trunk generator only. Construction-only. |
| `branchRadius` | number | `0.055` | 0 – 0.2 | Base branch radius in meters. Classic trunk generator only. Construction-only. |

### Trees: Skeleton

Space-colonization limb growth and bark mesh controls. Construction-only.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `generator` | select | `'limbs'` | `limbs` \| `branching` \| `drawn` | limbs: space-colonization growth toward the crown blobs (solid anime-style crowns). branching: recursive central-leader branching (open, realistic broadleaf/conifer silhouettes). drawn: no procedural wood at all — the tree is exactly the hand-drawn branchSpines (Tree Lab sketch mode). Construction-only. |
| `levels` | number | `3` | 1 – 4 | Recursion depth of the branching generator; each level subdivides into thinner children. Branching generator only. Construction-only. |
| `childrenCount` | number | `6` | 1 – 90 | Child branches sprouting along the trunk (deeper levels derive from it). Conifers use high counts (60-90) for dense whorled fronds. Branching generator only. Construction-only. |
| `branchAngle` | number | `55` | 10 – 130 | Child pitch away from the parent axis, in degrees. Past 90 points branches below horizontal (conifer fronds ~110). Branching generator only. Construction-only. |
| `branchStart` | number | `0.4` | 0 – 0.9 | Fraction of the trunk kept bare before children begin — real trees hold their crown off the ground. Branching generator only. Construction-only. |
| `lengthRatio` | number | `0.45` | 0.15 – 0.95 | Child branch length as a fraction of the trunk (deeper levels shorten from it). Branching generator only. Construction-only. |
| `radiusRatio` | number | `0.7` | 0.3 – 0.9 | Child radius as a fraction of the parent\u2019s radius at the attach point — radius continuity is what makes forks read as one tree. Branching generator only. Construction-only. |
| `gnarliness` | number | `0.15` | 0 – 0.6 | Random-walk curvature per growth section, amplified as branches thin: trunks stay stately, twigs wander. Branching generator only. Construction-only. |
| `forceStrength` | number | `0.02` | -0.08 – 0.15 | Growth force: every section steers toward vertical with 1/radius compliance. Positive sweeps tips skyward (broadleaf crowns); negative droops them (pines, willows). Branching generator only. Construction-only. |
| `conifer` | boolean | `false` | — | Evergreen behavior: branches taper fully and children shorten toward the top \u2014 the layered cone silhouette. Pair with high Children, Branch Angle ~110, negative Growth Force. Branching generator only. Construction-only. |
| `attractionCount` | number | `90` | 10 – 200 | Number of crown attraction points the limbs grow toward; more points grow more, finer limbs. Construction-only. |
| `segmentLength` | number | `0.3` | 0.1 – 0.8 | Growth step length in meters; shorter steps grow smoother, curvier limbs. Construction-only. |
| `influenceRadius` | number | `1.2` | 0.3 – 2.5 | How far an attraction point can pull on a growing limb, in meters. Construction-only. |
| `killRadius` | number | `0.42` | 0.1 – 1 | Distance at which a limb consumes an attraction point and stops growing toward it. Construction-only. |
| `maxSteps` | number | `48` | 4 – 96 | Growth iteration cap. Construction-only. |
| `maxNodes` | number | `140` | 20 – 400 | Skeleton node cap; lower keeps trees to a few clean limbs. Construction-only. |
| `radialSegments` | number | `8` | 3 – 16 | Cross-section segment count of each bark tube. Construction-only. |
| `tipRadius` | number | `0.03` | 0.005 – 0.15 | Radius of the thinnest twigs in meters; pipe-model radii grow from here toward the root. Construction-only. |
| `minLimbRadius` | number | `0.028` | 0 – 0.15 | Limbs thinner than this get no bark tube and are left to the leaves. Construction-only. |
| `attachmentTwigRadius` | number | `0.09` | 0 – 0.3 | Wood thinner than this sprouts leaf tufts in canopy mode. Construction-only. |
| `attractionReach` | number | — | 0 – 1 | How deep into each crown blob attraction points sample (fraction of blob radius); null/unset is automatic (0.65 canopy mode, 0.92 tips mode). Construction-only. |

### Trees: Canopy Cards

Leaf-card canopy geometry: card counts, tuft clusters, and shell fill. Construction-only.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `cardCount` | number | `170` | 20 – 600 | Base leaf-card count before density and coverage scaling; few LARGE overlapping cards keep the crown one fluffy mass. Construction-only. |
| `cardSizeRange` | vector2 | `[1, 1.6]` | — | Min/max leaf-cluster card size in meters. Construction-only. |
| `cardsPerCluster` | number | `5` | 1 – 20 | Cards per leaf tuft around each branch attachment. Construction-only. (In tips placement the built-in default becomes 9.) |
| `clusterRadius` | number | `0.48` | 0.1 – 1.5 | Radius in meters of each leaf tuft around its branch end. Construction-only. (In tips placement the built-in default becomes 0.62.) |
| `shellFill` | boolean | `true` | — | Fill the blob shells between tufts so the crown reads as one solid mass; off leaves bare wood between end bushes. Construction-only. (Tips placement turns this off by default.) |

### Trees: Foliage Material

Leaf material response: wind, sun, alpha cutout, scene and cloud shadows. Applies at runtime via applySettings.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `alphaCutoff` | number | `0.3` | 0 – 1 | Alpha-cutout threshold for the leaf sprite; low enough that mipmap-averaged alpha does not erode distant crowns. |
| `windDirection` | vector2 | `[1, 0.3]` | — | Horizontal (XZ) heading the canopy flutter drifts toward. |
| `windSpeed` | number | `1` | 0 – 4 | How fast the leaf-card flutter oscillates. |
| `windStrength` | number | `0.05` | 0 – 0.5 | How far leaf cards sway with the wind. |
| `sunDirection` | vector3 | `[0.35, 0.72, 0.42]` | — | World-space direction toward the sun. Match your main directional light. |
| `sunColor` | color | `[1, 0.96, 0.84]` (#fff5d6) | — | Sunlight tint applied to lit leaf cards. |
| `skyColor` | color | `[0.62, 0.78, 0.95]` (#9ec7f2) | — | Ambient sky tint mixed into shaded leaf cards. |
| `sceneShadowStrength` | number | `0.55` | 0 – 1 | How strongly renderer shadow maps shift the crown toward its shadow palette. 0 disables. |
| `backlitStrength` | number | `0.35` | 0 – 2 | Translucent glow on leaves between the camera and the sun. |
| `cloudShadowStrength` | number | `0` | 0 – 1 | How strongly drifting procedural cloud shadows darken the crown. 0 disables the effect. |
| `cloudShadowCoverage` | number | `0.45` | 0 – 1 | Fraction of the world covered by cloud shadow at any moment. |
| `cloudShadowScale` | number | `0.012` | 0.001 – 0.1 | World-to-noise scale of the cloud shadow pattern; smaller values give larger cloud shapes. |
| `cloudShadowVelocity` | vector2 | `[0.02, 0.006]` | — | Cloud shadow drift in noise-space units per second (world drift = velocity / scale). |

## Sky

Module: `toonlab/sky` — 5 groups, 15 fields.

Flat settings consumed by `new StylizedSky(options)` and `sky.applySettings(options)`.

### Sky: Dome

Sky dome geometry. Construction-only.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `radius` | number | `100` | 10 – 1000 | Sphere radius of the sky dome in meters. Construction-only: baked into the dome geometry; applySettings stores but does not rebuild it. |

### Sky: Gradient

Vertical zenith-to-horizon-to-ground gradient and horizon scattering.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `zenithColor` | color | `[0.28, 0.56, 0.92]` (#478feb) | — | Sky color straight up at the top of the dome. |
| `horizonColor` | color | `[0.78, 0.92, 1]` (#c7ebff) | — | Sky color at the horizon band. |
| `groundColor` | color | `[0.42, 0.48, 0.55]` (#6b7a8c) | — | Dome color below the horizon. |
| `horizonScattering` | number | `0.5` | 0 – 1 | How far the bright horizon band bleeds up into the sky. |

### Sky: Sun

Sun disc position, size, tint, and glow halo.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `sunDirection` | vector3 | `[0.35, 0.8, 0.45]` | — | World-space direction toward the sun (normalized on apply). Match your main directional light. |
| `sunColor` | color | `[1, 0.95, 0.82]` (#fff2d1) | — | Tint of the sun disc and its glow. |
| `sunSize` | number | `0.026` | 0 – 0.2 | Angular size of the sun disc. |
| `sunGlowStrength` | number | `1` | 0 – 4 | Intensity of the soft glow halo around the sun disc. |

### Sky: Clouds

Painterly two-tone procedural clouds.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `cloudCoverage` | number | `0.42` | 0 – 1 | Fraction of the sky filled by clouds. 0 clears the sky. |
| `cloudScale` | number | `1.6` | 0.1 – 6 | Noise scale of the cloud shapes; higher gives smaller, busier clouds. |
| `cloudSpeed` | number | `1` | 0 – 4 | How fast clouds drift across the dome. |
| `cloudColor` | color | `[1, 1, 1]` (#ffffff) | — | Lit tone of the two-tone painterly clouds. |
| `cloudShadeColor` | color | `[0.68, 0.78, 0.92]` (#adc7eb) | — | Shaded underside tone of the two-tone painterly clouds. |

### Sky: Stars

Procedural star field for night skies.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `starsStrength` | number | `0` | 0 – 2 | Brightness of the procedural star field. 0 (default) hides stars for daytime skies. |

## Paths, roads & bridges

Module: `toonlab/pathgen` — 4 groups, 22 fields.

Grouped settings consumed by `createStylizedPaths({ settings })` and serialized in path recipes.

### Paths, roads & bridges: Routing

Cost-field router: how strongly slope and water repel routes, and how much existing paths attract reuse (forks and junctions).

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `pointCount` | number | `4` | 2 – 8 | Auto mode: number of destinations probed from the terrain and connected into a network. |
| `slopeCost` | number | `26` | 0 – 80 | How expensive climbing is for the router. Higher values hug contours and produce switchbacks instead of straight climbs. |
| `waterCost` | number | `14` | 2 – 60 | Cost multiplier for crossing water. High enough that routes only cross where a bridge is worth it, low enough that crossings still happen. |
| `reuseBonus` | number | `0.45` | 0 – 0.9 | Cost discount (0..1) on cells an earlier route already walks — the source of natural forks and shared trunk roads. |
| `gridStep` | number | `8` | 3 – 24 | Router grid resolution in meters. Smaller steps find finer detours and cost more to solve. |
| `shoreMargin` | number | `0.6` | 0 – 2 | Meters above the waterline a cell must be to count as dry land. |
| `loopChance` | number | `0.35` | 0 – 1 | Auto mode: chance to add one extra ring road beyond the spanning network. |

### Paths, roads & bridges: Ribbon

The walkable strip: width, hand-drawn wobble, edge skirts that tuck into the terrain, and the height-profile smoothing that flattens the walk.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `width` | number | `2.6` | 1 – 6 | Walkable ribbon width in meters (dirt trail 2–3, stone road 3–4). |
| `widthWobble` | number | `0.22` | 0 – 0.6 | Low-frequency width variation (0..1) for the hand-drawn look. 0 is a survey-straight road. |
| `edgeSkirt` | number | `1.1` | 0.2 – 2.5 | Extra meters each side that slope down and tuck under the terrain so the ribbon never floats on side slopes. |
| `lift` | number | `0.07` | 0.02 – 0.25 | Meters the ribbon rides above the height profile — the true-overlay offset that prevents z-fighting. |
| `smoothing` | number | `16` | 0 – 40 | Moving-average window in meters applied to the terrain height along the route; the flattened profile is what paths.heightAt reports. |
| `stepLength` | number | `2` | 1 – 5 | Meters between ribbon cross-sections. Smaller steps follow curves tighter and spend more triangles. |
| `edgeFade` | number | `1.4` | 0.2 – 4 | Meters past the ribbon edge over which maskAt falls from 1 to 0 — the band where grass and flowers thin out. |

### Paths, roads & bridges: Bridges

Arched plank bridges generated where a route crosses open water.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `arc` | number | `0.1` | 0 – 0.18 | Deck rise as a fraction of span length. 0 is a flat causeway, 0.14 a strong arched footbridge. |
| `railStyle` | select | `'posts'` | `posts` \| `beams` \| `none` | Bridge railing construction. |
| `postSpacing` | number | `2.2` | 1.2 – 4 | Meters between railing posts. |
| `minSpan` | number | `4` | 2 – 12 | Meters of open water a route must cross before a bridge is generated (shorter crossings ford instead). |
| `pierSpacing` | number | `7` | 4 – 16 | Long crossings get support piers to the bed every this many meters. |
| `deckClearance` | number | `1.1` | 0.3 – 3 | Minimum meters between the water level and the deck at mid-span. |

### Paths, roads & bridges: Stairs

Stepped stone segments swapped in where the route climbs steeply. Visual only — paths.heightAt stays a smooth ramp.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `slopeThreshold` | number | `0.45` | 0.2 – 0.9 | Rise-over-run along the route beyond which the ribbon switches to stepped stone segments. |
| `stepHeight` | number | `0.19` | 0.12 – 0.3 | Riser height of generated steps in meters. |

## Ambient VFX

Module: `toonlab/ambientfx` — 6 groups, 54 fields.

Settings are nested per group: `createAmbientFx({ settings: { fireflies: { blinkSpeed: 0.8 } } })`. Effect entries in `effects` override their group; `density` there is a multiplier.

### Ambient VFX: Shared

Wind, sun, and the follow-window every effect emits into. Match windDirection/windSpeed/windStrength with the grass and tree wind so the whole world blows the same way.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `windDirection` | vector2 | `[1, 0.3]` | — | Horizontal (XZ) heading the wind blows toward — share with grass/trees. Magnitude is ignored. |
| `windSpeed` | number | `1` | 0 – 4 | How fast wind-driven motion oscillates and mist scrolls. |
| `windStrength` | number | `0.16` | 0 – 1 | How far particles drift downwind. |
| `sunDirection` | vector3 | `[0.35, 0.72, 0.42]` | — | World-space direction toward the sun (normalized on apply); drives the pollen backlight and petal sheen. |
| `windowRadius` | number | `45` | 15 – 120 | Meters of the follow window particles exist in around the follow target. Construction-only. |
| `maxParticles` | number | `20000` | 1000 – 40000 | Hard budget; effect densities are scaled down proportionally when their sum would exceed it. Construction-only. |

### Ambient VFX: Petals

Flutter-falling blossom petals. Emit from registered bloom volumes (flowering canopies) when any exist, otherwise from the open air above the ground.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Master toggle for the effect. |
| `density` | number | `0.03` | 0 – 0.15 | Petals per m³ of the emission volume. |
| `canopyDensity` | number | `4.5` | 0 – 20 | Petals per m³ inside registered bloom volumes (crowns shed far more than open air). |
| `sizeRange` | vector2 | `[0.06, 0.11]` | — | Min/max petal size in meters. |
| `colorA` | color | `[1, 0.52, 0.68]` (#ff85ad) | — | Primary petal color. |
| `colorB` | color | `[1, 0.75, 0.84]` (#ffbfd6) | — | Secondary petal color; each petal picks between the two. |
| `emitHeight` | vector2 | `[2, 9]` | — | Min/max meters above ground petals spawn at when not bound to canopies. Construction-only. |
| `flutter` | number | `1` | 0 – 3 | Side-to-side rocking amplitude while falling. |
| `windResponse` | number | `1` | 0 – 3 | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'day'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | When the effect is visible; weights follow the environmentTimeOfDay hour. |

### Ambient VFX: Falling Leaves

Tumble-falling leaves with strong gust response. Emit from bloom volumes tagged effect:"leaves", otherwise globally.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Master toggle for the effect. |
| `density` | number | `0.022` | 0 – 0.15 | Leaves per m³ of the emission volume. |
| `canopyDensity` | number | `3.2` | 0 – 20 | Leaves per m³ inside bloom volumes tagged effect:"leaves". |
| `sizeRange` | vector2 | `[0.09, 0.16]` | — | Min/max leaf size in meters. |
| `colorA` | color | `[0.93, 0.64, 0.2]` (#eda333) | — | Primary leaf color. |
| `colorB` | color | `[0.78, 0.4, 0.13]` (#c76621) | — | Secondary leaf color; each leaf picks between the two. |
| `emitHeight` | vector2 | `[2, 10]` | — | Min/max meters above ground leaves spawn at when not bound to canopies. Construction-only. |
| `tumble` | number | `1` | 0 – 3 | Rotational tumbling speed while falling. |
| `windResponse` | number | `1.35` | 0 – 3 | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'any'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | When the effect is visible; weights follow the environmentTimeOfDay hour. |

### Ambient VFX: Fireflies

Hovering, blinking emissive motes over grass and shore margins. Unlit by design; they ramp with the time-of-day dusk.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Master toggle for the effect. |
| `density` | number | `0.045` | 0 – 0.2 | Fireflies per m³ of the near-ground hover band. |
| `sizeRange` | vector2 | `[0.13, 0.2]` | — | Min/max glow-sprite size in meters. |
| `color` | color | `[1, 0.87, 0.42]` (#ffde6b) | — | Emissive glow color (unlit; never touched by scene lights). |
| `hoverHeight` | vector2 | `[0.25, 2.2]` | — | Min/max meters above ground fireflies hover at. Construction-only. |
| `hoverRadius` | number | `0.9` | 0 – 4 | Meters of wander around each spawn point. |
| `blinkSpeed` | number | `1` | 0 – 4 | How fast the blink program pulses. |
| `intensity` | number | `1` | 0 – 4 | Emissive brightness multiplier. |
| `windResponse` | number | `0.1` | 0 – 3 | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'duskNight'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | When the effect is visible; weights follow the environmentTimeOfDay hour. |

### Ambient VFX: Pollen Motes

Slow curl-drifting dust motes, brightest looking toward the sun (backlit). Bind to flower masks via the effects config.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Master toggle for the effect. |
| `density` | number | `0.06` | 0 – 0.3 | Motes per m³ of the near-ground drift band. |
| `sizeRange` | vector2 | `[0.045, 0.085]` | — | Min/max mote size in meters. |
| `color` | color | `[1, 0.93, 0.72]` (#ffedb8) | — | Mote color (additive, so it reads as light). |
| `hoverHeight` | vector2 | `[0.3, 2.6]` | — | Min/max meters above ground motes drift at. Construction-only. |
| `driftRadius` | number | `1.3` | 0 – 5 | Meters of curl-drift wander around each spawn point. |
| `backlitStrength` | number | `1` | 0 – 3 | Brightness boost when the camera looks toward the sun through the motes. |
| `windResponse` | number | `0.5` | 0 – 3 | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'day'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | When the effect is visible; weights follow the environmentTimeOfDay hour. |

### Ambient VFX: Ground Mist

Soft horizontal wisps scrolling with the wind, hugging water margins and low ground at dawn/dusk.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Master toggle for the effect. |
| `density` | number | `0.0045` | 0 – 0.02 | Wisps per m³ of the ground-hugging band — a few dozen quads, not thousands. |
| `sizeRange` | vector2 | `[1.6, 3]` | — | Min/max wisp height in meters (width is ~3–5× the height). |
| `color` | color | `[0.84, 0.9, 0.97]` (#d6e6f7) | — | Wisp color. |
| `opacity` | number | `0.34` | 0 – 0.6 | Peak alpha at a wisp center; the sprite falls off softly from there. |
| `scrollSpan` | number | `26` | 5 – 60 | Meters a wisp travels downwind before wrapping (fades at both ends). |
| `marginWidth` | number | `7` | 1 – 20 | Meters of \|ground − waterLevel\| that count as the water-margin emission band. Construction-only. |
| `windResponse` | number | `1` | 0 – 3 | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'dawnDusk'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | When the effect is visible; weights follow the environmentTimeOfDay hour. |

## Gameplay VFX

Module: `toonlab/vfxgen` — 6 groups, 47 fields.

Settings are nested per group: `createVfxSystem({ settings: { impact: { sparkCount: 40 } } })`. Per-spawn `look` overrides re-tint one spawn without touching settings.

### Gameplay VFX: Shared

Budgets and global pacing for every effect. The one-shot backbone renders all bursts in two draw calls; these bound its ring buffers and the pooled trail/projectile meshes.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `maxParticles` | number | `4096` | 256 – 32768 | Ring-buffer capacity of the one-shot backbone (sparks, embers, puffs, rings, flashes). Oldest instances are overwritten first. Construction-only. |
| `maxProjectiles` | number | `8` | 1 – 32 | Pooled projectile core meshes (fireballs in flight). Spawns beyond this reuse the oldest. Construction-only. |
| `maxTrails` | number | `8` | 1 – 32 | Pooled slash-trail ribbons live at once. Spawns beyond this reuse the oldest. Construction-only. |
| `timeScale` | number | `1` | 0 – 2 | Global VFX clock multiplier — hit-stop and slow-motion hooks feed this. |

### Gameplay VFX: Slash Trail

Weapon-swing ribbon sampled from a followed blade (base + tip anchors), with a stepped toon fade and edge sparkle. The anime arc smear.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Master toggle for the effect. |
| `color` | color | `[0.55, 0.8, 1]` (#8cccff) | — | Trail color toward the blade tip (the hot edge). |
| `coreColor` | color | `[1, 1, 1]` (#ffffff) | — | Trail color toward the blade base; white core + colored edge is the classic anime read. |
| `lifetime` | number | `0.28` | 0.05 – 1.5 | Seconds a ribbon segment persists before fading out. |
| `bands` | number | `3` | 1 – 8 | Toon quantization steps of the age fade — fewer bands, chunkier cel look. |
| `intensity` | number | `1` | 0 – 4 | Emissive brightness multiplier on the glow parts. |
| `sparkle` | number | `60` | 0 – 300 | Sparks per second shed from the blade tip while the trail is active. |
| `segments` | number | `48` | 8 – 128 | Ribbon history capacity in samples — longer fast swings need more. Construction-only. |

### Gameplay VFX: Impact Burst

Hit feedback: a radial star flash plus ballistic sparks with gravity. `power` at spawn scales count, speed, and flash size.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Master toggle for the effect. |
| `sparkColor` | color | `[1, 0.85, 0.45]` (#ffd973) | — | Ballistic spark color (additive). |
| `flashColor` | color | `[1, 0.97, 0.88]` (#fff7e0) | — | Radial star-flash color at the hit point. |
| `sparkCount` | number | `26` | 0 – 120 | Sparks per burst at power 1; spawn `power` scales this. |
| `sparkSpeed` | number | `7` | 0 – 30 | Initial spark speed in m/s, biased along the hit normal. |
| `gravity` | number | `18` | 0 – 60 | Downward pull on sparks in m/s² — high values read as metal chips. |
| `flashSize` | number | `0.9` | 0 – 4 | Star-flash quad size in meters at power 1. |
| `spikes` | number | `6` | 3 – 12 | Point count of the star flash — 4 reads as an action-RPG glint, 6–8 as an anime hit star. |
| `shockwave` | boolean | `true` | — | Camera-facing expanding ring at the hit point — the action-RPG hit circle. Tinted by Flash Color. |
| `lifetime` | number | `0.5` | 0.05 – 2 | Seconds sparks live (the flash pops in about a quarter of this). |
| `intensity` | number | `1` | 0 – 4 | Emissive brightness multiplier on the glow parts. |

### Gameplay VFX: Fireball

Projectile: a flame-shaded core billboard shedding embers in flight; explodes into an impact burst, smoke puffs, and an expanding scorch ring.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Master toggle for the effect. |
| `coreSize` | number | `0.42` | 0.05 – 2 | Flame-core billboard radius in meters. |
| `coreColor` | color | `[1, 0.95, 0.6]` (#fff299) | — | Hot center of the flame shader. |
| `flameColor` | color | `[1, 0.45, 0.12]` (#ff731f) | — | Outer flame licks and ember tint. |
| `emberRate` | number | `90` | 0 – 400 | Embers shed per second while the projectile flies. |
| `emberSize` | vector2 | `[0.05, 0.12]` | — | Min/max ember size in meters. |
| `emberLifetime` | number | `0.55` | 0.05 – 2 | Seconds each shed ember lives. |
| `intensity` | number | `1.2` | 0 – 4 | Emissive brightness multiplier on the glow parts. |
| `explosionPower` | number | `1.6` | 0 – 5 | `power` handed to the impact burst + smoke on detonation. |
| `scorchRing` | boolean | `true` | — | Expanding ground ring on detonation. |
| `ringColor` | color | `[1, 0.55, 0.2]` (#ff8c33) | — | Scorch-ring glow color. |

### Gameplay VFX: Footstep Dust

Small chunky dust puffs kicked up at a footfall. Cheap enough to fire every step.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Master toggle for the effect. |
| `puffCount` | number | `5` | 0 – 20 | Dust puffs per footfall. |
| `sizeRange` | vector2 | `[0.1, 0.22]` | — | Min/max puff size in meters (puffs grow ~2× over life). |
| `color` | color | `[0.78, 0.72, 0.62]` (#c7b89e) | — | Dust color — sample the ground palette. |
| `lifetime` | number | `0.55` | 0.05 – 2 | Seconds a puff lives. |
| `rise` | number | `0.5` | 0 – 2 | Upward drift in m/s — heavier dust settles faster. |
| `spread` | number | `0.22` | 0 – 1 | Horizontal scatter radius in meters around the footfall. |

### Gameplay VFX: Landing Ring

The classic landing hit: a radial ring of dust puffs expanding outward from the touch-down point. `power` at spawn scales radius and count.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Master toggle for the effect. |
| `puffCount` | number | `14` | 0 – 40 | Puffs around the ring at power 1; spawn `power` scales this. |
| `ringRadius` | number | `1.1` | 0.2 – 5 | Meters the dust ring expands to at power 1. |
| `sizeRange` | vector2 | `[0.18, 0.38]` | — | Min/max puff size in meters. |
| `color` | color | `[0.78, 0.72, 0.62]` (#c7b89e) | — | Dust color — sample the ground palette. |
| `lifetime` | number | `0.7` | 0.05 – 2 | Seconds the ring takes to expand and fade. |

## Fauna

Module: `toonlab/fauna` — 5 groups, 48 fields.

Settings are nested per species group: `createFauna({ settings: { birds: { fleeRadius: 15 } } })`. Populations are passed separately: `createFauna({ species: { birds: 40, fish: 80 } })`.

### Fauna: Shared

Cross-species simulation budgets: the staggered steering-tick share and the distance beyond which agents degrade to scripted loops.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `tickShare` | number | `0.25` | 0.05 – 0.5 | Fraction of all agents that receive a full steering tick per update; the rest integrate their last velocity. 0.25 = every agent steers at ~15 Hz on a 60 Hz host. |
| `farDistance` | number | `150` | 40 – 400 | Meters from the follow target beyond which agents stop steering entirely and fly scripted circles (fish keep their depth clamps). |

### Fauna: Birds

Flocking boids in a roaming altitude band; perch on registered points (or terrain) and flush when the follow target approaches.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `altitudeMin` | number | `7` | 1 – 40 | Bottom of the preferred flight band, meters above the local terrain. |
| `altitudeMax` | number | `26` | 2 – 80 | Top of the preferred flight band, meters above the local terrain. |
| `cruiseSpeed` | number | `7` | 1 – 20 | Relaxed flight speed in m/s; flocks settle around it. |
| `maxSpeed` | number | `12` | 2 – 30 | Hard speed cap in m/s, reached when fleeing. |
| `neighborRadius` | number | `14` | 2 – 30 | Meters within which flockmates influence cohesion and alignment. |
| `separationRadius` | number | `2.6` | 0.5 – 8 | Personal-space radius in meters; closer neighbors are pushed away. |
| `cohesion` | number | `0.9` | 0 – 2 | Pull toward the local flock center — the flock-tightness knob. |
| `alignment` | number | `0.8` | 0 – 2 | Pull toward the local average heading. |
| `separation` | number | `1.3` | 0 – 3 | Push away from neighbors inside the separation radius. |
| `wander` | number | `0.45` | 0 – 2 | Per-bird sinusoidal drift so flocks meander instead of orbiting. |
| `fleeRadius` | number | `12` | 0 – 40 | Meters from the follow target at which flying birds scatter and perched birds flush. |
| `perchChance` | number | `0.5` | 0 – 1 | Appetite for landing: expected perch attempts scale with this per ~10 s of flight. |
| `perchDuration` | number | `11` | 2 – 40 | Mean seconds a bird stays perched (each stay jitters ±40%). |
| `flapHz` | number | `3.4` | 0.5 – 8 | Wingbeats per second; the GPU flap phase/speed attributes derive from it. Birds glide (near-zero amplitude) when descending. |
| `scale` | number | `1` | 0.4 – 2.5 | Uniform body scale multiplier (±12% per-bird jitter on top). |
| `palette` | select | `'swallow'` | `swallow` \| `egret` \| `finch` | Named body palette; each palette carries 2–4 vertex-colored variants. |

### Fauna: Butterflies

Individual noise-wanderers anchored to flower-mask points, hovering just above the terrain.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `hoverMin` | number | `0.5` | 0.1 – 3 | Bottom of the flutter band, meters above the local terrain. |
| `hoverMax` | number | `1.7` | 0.2 – 5 | Top of the flutter band, meters above the local terrain. |
| `speed` | number | `1.3` | 0.2 – 4 | Typical flutter speed in m/s. |
| `wanderRadius` | number | `6` | 2 – 30 | Meters a butterfly may drift from its flower-mask anchor before being pulled back. |
| `fleeRadius` | number | `3.5` | 0 – 15 | Meters from the follow target at which butterflies scatter upward. |
| `flapHz` | number | `8.5` | 2 – 16 | Wingbeats per second for the GPU wing fold. |
| `scale` | number | `1` | 0.4 – 2.5 | Uniform body scale multiplier (±20% per-agent jitter on top). |
| `palette` | select | `'meadow'` | `meadow` \| `twilight` | Named wing palette; each palette carries up to 4 vertex-colored variants. |

### Fauna: Dragonflies

Hover-and-dart flyers anchored to the water margin, holding a fixed height above the water surface.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `hoverHeight` | number | `0.6` | 0.2 – 3 | Meters above the water surface dragonflies hold. |
| `hoverRadius` | number | `5` | 1 – 20 | Meters of drift allowed around the current hover anchor. |
| `dartSpeed` | number | `7` | 1 – 16 | Straight-line speed in m/s when relocating to a new anchor. |
| `dartChance` | number | `0.5` | 0 – 1 | Appetite for relocating: expected darts scale with this per ~8 s of hovering. |
| `flapHz` | number | `36` | 10 – 60 | Wing oscillations per second; high rates read as the classic wing shimmer. |
| `scale` | number | `1` | 0.4 – 2.5 | Uniform body scale multiplier. |
| `palette` | select | `'pond'` | `pond` \| `ember` | Named body palette; each palette carries 2–3 vertex-colored variants. |

### Fauna: Fish

Schooling boids clamped between the water surface and the bed; visible from above through the water refraction pass.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `surfaceMargin` | number | `0.3` | 0.1 – 2 | Minimum meters a fish stays below the water surface (never breaches). |
| `bedMargin` | number | `0.35` | 0.1 – 2 | Minimum meters a fish stays above the terrain bed. |
| `minSpawnDepth` | number | `1.1` | 0.3 – 5 | Meters of water column required for a fish spawn point; shallower bounds simply hold fewer fish. |
| `cruiseSpeed` | number | `1.5` | 0.2 – 5 | Relaxed swim speed in m/s. |
| `maxSpeed` | number | `3.2` | 0.5 – 8 | Hard speed cap in m/s, reached when fleeing. |
| `neighborRadius` | number | `4` | 1 – 12 | Meters within which schoolmates influence cohesion and alignment. |
| `separationRadius` | number | `0.8` | 0.2 – 4 | Personal-space radius in meters. |
| `cohesion` | number | `0.9` | 0 – 2 | Pull toward the local school center — schooling tightness. |
| `alignment` | number | `0.85` | 0 – 2 | Pull toward the local average heading. |
| `separation` | number | `1.1` | 0 – 3 | Push away from neighbors inside the separation radius. |
| `wander` | number | `0.5` | 0 – 2 | Per-fish sinusoidal drift so schools roam the basin. |
| `fleeRadius` | number | `7` | 0 – 25 | Meters from the follow target (a swimmer, a bridge walker) at which fish scatter. |
| `swayHz` | number | `2.8` | 0.5 – 8 | Tail-sway cycles per second for the GPU body flex. |
| `scale` | number | `1` | 0.3 – 3 | Uniform body scale multiplier (±25% per-fish jitter on top). |
| `palette` | select | `'koi'` | `koi` \| `silver` | Named body palette: koi for ponds and lakes, silver for open water. |

## Buildings

Module: `toonlab/buildinggen` — 5 groups, 28 fields.

Grouped settings consumed by `createBuildingFromRecipe(...)` / `buildingAsset(...)`; `{ type, seed }` ride alongside the groups.

### Buildings: Footprint

Ground plan: rect, L, or T, in meters.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `kind` | select | `'rect'` | `rect` \| `L` \| `T` | Ground-plan shape. |
| `width` | number | `6.5` | 2.5 – 14 | Main rect width in meters. |
| `depth` | number | `5` | 2.5 – 12 | Main rect depth in meters. |
| `wingRatio` | number | `0.55` | 0.3 – 0.85 | L/T wing size relative to the main rect. |

### Buildings: Massing

Floors, per-floor inset, and the slight outward wall lean that keeps facades hand-drawn.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `floors` | number | `1` | 1 – 5 | Full floors (towers go tall). |
| `floorHeight` | number | `2.5` | 2.1 – 3.4 | Meters per floor. |
| `atticRatio` | number | `0.55` | 0 – 0.8 | Half-floor under a gable roof (0 = none). |
| `inset` | number | `0` | 0 – 0.3 | Meters each floor steps inward — watchtower massing. |
| `wallLean` | number | `0.012` | 0 – 0.05 | Outward lean per meter of height. Exaggerated proportions are settings, not bugs. |

### Buildings: Roof

Roof form: gable, hip, shed, or the curved pagoda-ish shrine roof. Roofs always overhang walls.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `kind` | select | `'gable'` | `gable` \| `hip` \| `shed` \| `pagoda` | Roof construction. |
| `pitch` | number | `0.85` | 0.25 – 1.4 | Rise over half-span. |
| `overhang` | number | `0.55` | 0.25 – 1.6 | Meters the roof reaches past the walls (invariant: > 0). |
| `curvature` | number | `0` | 0 – 1 | Upturned eave sweep — the shrine-roof signature. |
| `ridgeDecor` | number | `0` | 0 – 1 | Ridge cap beam and end finials. |

### Buildings: Facade

Timber framing, window rhythm (windows never intersect beams), and the door (always on an exterior wall).

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `beams` | number | `1` | 0 – 1 | Visible beam grid strength (0 hides framing). |
| `bayWidth` | number | `1.6` | 1 – 2.6 | Meters between beam columns; windows land mid-bay. |
| `windowChance` | number | `0.75` | 0 – 1 | Chance an eligible bay gets a window. |
| `windowWidth` | number | `0.75` | 0.4 – 1.4 | Window width in meters (clamped inside its bay). |
| `windowHeight` | number | `0.95` | 0.4 – 1.6 | Window height in meters. |
| `doorWidth` | number | `1` | 0.7 – 2.2 | Door width in meters. |
| `doorHeight` | number | `2` | 1.7 – 2.4 | Door height in meters. |
| `baseHeight` | number | `0.35` | 0 – 1.2 | Stone base band height (shrines ride a full veranda plinth). |

### Buildings: Palette

Material role colors: wall, beam, roof, trim, door.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `wall` | color | `[0.82, 0.74, 0.6]` (#d1bd99) | — | Plaster / plank wall color. |
| `beam` | color | `[0.32, 0.22, 0.14]` (#523824) | — | Timber framing color. |
| `roof` | color | `[0.42, 0.3, 0.24]` (#6b4d3d) | — | Roof surface color. |
| `trim` | color | `[0.45, 0.46, 0.44]` (#737570) | — | Stone base, chimney, and sills. |
| `door` | color | `[0.5, 0.3, 0.16]` (#804d29) | — | Door color. |
| `variation` | number | `0.12` | 0 – 0.4 | Per-vertex color drift. |

## Procedural textures

Module: `toonlab/texgen` — 10 groups, 166 fields.

Grouped settings consumed by `evaluateTextureMaps(settings)` and serialized in texture recipes (`createTextureSettings`).

### Procedural textures: Seed

Deterministic seed shared by every layer.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `seed` | number | `1337` | 0 – 99999 | Deterministic seed — every value is a different texture with the same recipe. |

### Procedural textures: Base pattern

The primary structure: pattern, frequency, warp.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `generator` | select | `'fbm'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Primary structure of the material: this drives height, color banding, and pattern cells. |
| `contrast` | number | `0` | -1 – 1 | Sharpens (+) or flattens (-) the base pattern. |
| `bias` | number | `0` | -0.5 – 0.5 | Shifts the whole pattern up or down the ramp. |
| `invert` | boolean | `false` | — | Flips the base pattern (crevices become ridges). |
| `scale` | number | `6` | 1 – 64 | Feature cells across the tile. Higher = finer features. |
| `rotate90` | boolean | `false` | — | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.25 – 8 | Horizontal anisotropy (brushed metal, wood planks). |
| `stretchY` | number | `1` | 0.25 – 8 | Vertical anisotropy (drips, strata, fibers). |
| `warp` | number | `0` | 0 – 1 | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 64 | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 64 | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 32 | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Detail layer A

Mid-frequency relief blended over the base.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Toggles this detail layer. |
| `generator` | select | `'fbm'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Pattern blended over the base height. |
| `blend` | select | `'overlay'` | `overlay` \| `add` \| `multiply` \| `screen` \| `min` \| `max` \| `mix` | How this layer combines with the height underneath. |
| `amount` | number | `0.35` | 0 – 1 | Blend strength of this layer. |
| `invert` | boolean | `false` | — | Flips the layer before blending. |
| `contrast` | number | `0` | -1 – 1 | Sharpens (+) or flattens (-) the layer. |
| `scale` | number | `18` | 1 – 64 | Feature cells across the tile. Higher = finer features. |
| `rotate90` | boolean | `false` | — | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.25 – 8 | Horizontal anisotropy (brushed metal, wood planks). |
| `stretchY` | number | `1` | 0.25 – 8 | Vertical anisotropy (drips, strata, fibers). |
| `warp` | number | `0` | 0 – 1 | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 64 | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 64 | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 32 | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Detail layer B

Fine grain, pores, chips.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Toggles this detail layer. |
| `generator` | select | `'speckle'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Pattern blended over the base height. |
| `blend` | select | `'add'` | `overlay` \| `add` \| `multiply` \| `screen` \| `min` \| `max` \| `mix` | How this layer combines with the height underneath. |
| `amount` | number | `0.2` | 0 – 1 | Blend strength of this layer. |
| `invert` | boolean | `false` | — | Flips the layer before blending. |
| `contrast` | number | `0` | -1 – 1 | Sharpens (+) or flattens (-) the layer. |
| `scale` | number | `24` | 1 – 64 | Feature cells across the tile. Higher = finer features. |
| `rotate90` | boolean | `false` | — | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.25 – 8 | Horizontal anisotropy (brushed metal, wood planks). |
| `stretchY` | number | `1` | 0.25 – 8 | Vertical anisotropy (drips, strata, fibers). |
| `warp` | number | `0` | 0 – 1 | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 64 | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 64 | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 32 | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Color

Five-stop height ramp, painterly jitter, cavity & sheen, final grade.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `color0` | color | `[0.16, 0.14, 0.13]` (#292421) | — | Ramp stop at the darkest crevices. |
| `color1` | color | `[0.35, 0.31, 0.28]` (#594f47) | — | Ramp stop between crevices and the mid tone. |
| `color2` | color | `[0.55, 0.5, 0.45]` (#8c8073) | — | Ramp stop for the average surface. |
| `color3` | color | `[0.72, 0.68, 0.62]` (#b8ad9e) | — | Ramp stop approaching the ridges. |
| `color4` | color | `[0.88, 0.85, 0.79]` (#e0d9c9) | — | Ramp stop at the highest ridges. |
| `pos1` | number | `0.25` | 0.02 – 0.98 | Where the Low stop sits on the height ramp. |
| `pos2` | number | `0.5` | 0.02 – 0.98 | Where the Mid stop sits on the height ramp. |
| `pos3` | number | `0.75` | 0.02 – 0.98 | Where the High stop sits on the height ramp. |
| `rampSmooth` | number | `1` | 0 – 1 | 1 = smooth gradient, 0 = hard cel bands between the five stops. |
| `jitterHue` | number | `0.04` | 0 – 0.5 | Painterly hue drift across the surface. |
| `jitterValue` | number | `0.08` | 0 – 0.5 | Painterly brightness drift across the surface. |
| `jitterScale` | number | `24` | 2 – 64 | Frequency of the painterly drift. |
| `jitterCells` | boolean | `false` | — | Applies drift per pattern cell (per brick / plank / scale) instead of smoothly. |
| `cavity` | number | `0.35` | 0 – 1 | Darkens crevices toward the cavity tint — the hand-painted occlusion read. |
| `cavityTint` | color | `[0.13, 0.09, 0.08]` (#211714) | — | Color the crevices sink toward. |
| `sheen` | number | `0.18` | 0 – 1 | Screens the sheen tint over ridges and edges — worn highlight. |
| `sheenTint` | color | `[1, 0.97, 0.88]` (#fff7e0) | — | Color of the ridge highlight. |
| `hueShift` | number | `0` | -0.5 – 0.5 | Rotates the final palette hue. |
| `saturation` | number | `1` | 0 – 2 | Final color saturation. |
| `brightness` | number | `1` | 0.25 – 1.75 | Final brightness multiplier. |
| `contrast` | number | `0` | -1 – 1 | Final color contrast. |
| `gamma` | number | `1` | 0.4 – 2.5 | Final gamma on the albedo. |

### Procedural textures: Wear & tear

One-knob damage and dirt macros layered over everything.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `damage` | number | `0` | 0 – 1 | Universal wear macro: carves seeded scratches and chips into the surface and roughens them. One knob, many parameters. |
| `dirt` | number | `0` | 0 – 1 | Grime macro: darkens crevices with pooled dirt and raises their roughness, independent of the overlay slots. |

### Procedural textures: Overlay A

Masked colored overlay: moss, rust, dirt, snow, lichen…

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Toggles this overlay. |
| `generator` | select | `'fbm'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Mask pattern deciding where the overlay lands. |
| `color` | color | `[0.35, 0.48, 0.22]` (#597a38) | — | Overlay color where the mask is strongest. |
| `colorB` | color | `[0.52, 0.62, 0.28]` (#859e47) | — | Secondary overlay color for variation within the mask. |
| `coverage` | number | `0.35` | 0 – 1 | How much of the surface the overlay claims. |
| `softness` | number | `0.18` | 0.01 – 0.6 | Feather width of the overlay border. |
| `creviceBias` | number | `0.5` | -1 – 1 | +1 pools into crevices (moss, grime); -1 caps ridges and peaks (snow, wear). |
| `blend` | select | `'normal'` | `normal` \| `multiply` \| `overlay` \| `screen` | How the overlay color mixes into the albedo. |
| `roughnessShift` | number | `0.25` | -1 – 1 | Overlay area gets rougher (+) or glossier (-). |
| `heightShift` | number | `0.05` | -0.5 – 0.5 | Overlay area rises (+) or sinks (-) in the height map. |
| `metalShift` | number | `0` | -1 – 1 | Overlay area gains (+) or loses (-) metalness — rust strips metal. |
| `contrast` | number | `0` | -1 – 1 | Sharpens (+) or flattens (-) the mask pattern. |
| `invert` | boolean | `false` | — | Flips the mask before thresholding. |
| `scale` | number | `5` | 1 – 64 | Feature cells across the tile. Higher = finer features. |
| `rotate90` | boolean | `false` | — | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.25 – 8 | Horizontal anisotropy (brushed metal, wood planks). |
| `stretchY` | number | `1` | 0.25 – 8 | Vertical anisotropy (drips, strata, fibers). |
| `warp` | number | `0.3` | 0 – 1 | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 64 | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 64 | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 32 | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Overlay B

Second masked overlay: grime, stains, scorch, drips…

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Toggles this overlay. |
| `generator` | select | `'turbulence'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Mask pattern deciding where the overlay lands. |
| `color` | color | `[0.16, 0.12, 0.09]` (#291f17) | — | Overlay color where the mask is strongest. |
| `colorB` | color | `[0.3, 0.24, 0.18]` (#4d3d2e) | — | Secondary overlay color for variation within the mask. |
| `coverage` | number | `0.3` | 0 – 1 | How much of the surface the overlay claims. |
| `softness` | number | `0.22` | 0.01 – 0.6 | Feather width of the overlay border. |
| `creviceBias` | number | `0.6` | -1 – 1 | +1 pools into crevices (moss, grime); -1 caps ridges and peaks (snow, wear). |
| `blend` | select | `'multiply'` | `normal` \| `multiply` \| `overlay` \| `screen` | How the overlay color mixes into the albedo. |
| `roughnessShift` | number | `0.2` | -1 – 1 | Overlay area gets rougher (+) or glossier (-). |
| `heightShift` | number | `-0.03` | -0.5 – 0.5 | Overlay area rises (+) or sinks (-) in the height map. |
| `metalShift` | number | `0` | -1 – 1 | Overlay area gains (+) or loses (-) metalness — rust strips metal. |
| `contrast` | number | `0` | -1 – 1 | Sharpens (+) or flattens (-) the mask pattern. |
| `invert` | boolean | `false` | — | Flips the mask before thresholding. |
| `scale` | number | `4` | 1 – 64 | Feature cells across the tile. Higher = finer features. |
| `rotate90` | boolean | `false` | — | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.25 – 8 | Horizontal anisotropy (brushed metal, wood planks). |
| `stretchY` | number | `1` | 0.25 – 8 | Vertical anisotropy (drips, strata, fibers). |
| `warp` | number | `0.25` | 0 – 1 | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 64 | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 64 | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 32 | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Surface

PBR response: relief, occlusion, roughness, metalness.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `heightScale` | number | `0.5` | 0 – 1 | Overall relief strength — feeds the normal map, AO, and displacement. |
| `normalStrength` | number | `1` | 0 – 3 | Extra multiplier on the derived normal map. |
| `invertHeight` | boolean | `false` | — | Flips the height map (grooves become ridges). |
| `aoStrength` | number | `0.55` | 0 – 1 | Baked ambient occlusion depth in the crevices. |
| `roughness` | number | `0.75` | 0 – 1 | Base roughness: 0 = mirror gloss, 1 = fully matte. |
| `roughnessContrast` | number | `0.35` | -1 – 1 | +1 = crevices rough & ridges polished; -1 = the reverse. |
| `metalness` | number | `0` | 0 – 1 | Base metalness of the material. |

### Procedural textures: Glow

Optional emissive map.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Adds a glow map (lava cracks, sci-fi circuits, embers). |
| `color` | color | `[1, 0.45, 0.12]` (#ff731f) | — | Emissive color. |
| `intensity` | number | `2` | 0 – 8 | Emissive brightness (preview material intensity). |
| `source` | select | `'crevices'` | `crevices` \| `peaks` \| `band` \| `accentA` \| `accentB` \| `everywhere` | Which part of the surface glows. |
| `threshold` | number | `0.5` | 0 – 1 | Height level the glow hugs (band / crevices / peaks). |
| `width` | number | `0.25` | 0.02 – 0.8 | Thickness of the glowing region. |
| `softness` | number | `0.2` | 0.01 – 0.6 | Feather on the glow border. |
