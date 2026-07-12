# Settings reference

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Regenerate with: node scripts/generate-settings-reference.mjs -->

Every tunable field in the settings schemas, generated from the
`*_SETTING_GROUPS` / `*_SETTING_FIELD_SCHEMA` exports. The same schemas
drive the [debug panel](debug-panel.md), so everything listed here appears
as a live control in the labs.

Renderer note: all settings drive the TSL material stack. Native WebGPU is
the default renderer; `?renderer=webgl` uses the same settings through the
TSL WebGL2 fallback.

- [Character toon shading](#character-toon-shading)
- [Environment shading](#environment-shading)
- [Water](#water)
- [Post-processing](#post-processing)
- [Grass](#grass)
- [Flowers](#flowers)
- [Trees](#trees)
- [Sky](#sky)

## Character toon shading

Module: `@call-me-sensei/toonlab/toon` — 23 groups, 298 fields.

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

Module: `@call-me-sensei/toonlab/environment` — 2 groups, 72 fields.

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
| `untexturedGradientStrength` | number | — | 0 – 2 | Overrides untextured gradient strength; leave unset in code to use the material default. |
| `vertexAoStrength` | number | — | 0 – 2 | Overrides vertex ao strength; leave unset in code to use the material default. |

## Water

Module: `@call-me-sensei/toonlab/water` — 7 groups, 72 fields.

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
| `colorTone` | select | `'classic'` | `classic` \|  `anime` \| `teal` \| `caribbean` \| `lagoon` \| `deepOcean` | Named body-color palette forced over the preset colors; classic returns control to the preset. |
| `shallowColor` | color | `[0.42, 0.85, 0.88]` (#6bd9e0) | — | Water tint right at the shoreline. |
| `midColor` | color | `[0.2, 0.62, 0.8]` (#339ecc) | — | Water tint at moderate depth. |
| `deepColor` | color | `[0.1, 0.38, 0.6]` (#1a6199) | — | Water tint where the bottom is no longer visible. |
| `depthFadeDistance` | number | `1` | 0.05 – 12 | Water column depth where the shallow tint gives way to mid. |
| `deepFadeDistance` | number | `2.2` | 0.05 – 24 | Additional depth where mid fades to the deep tint. |
| `opacity` | number | `0.8` | 0 – 1 | Base transparency when no scene color grab pass is bound. |
| `refractionStrength` | number | `0.35` | 0 – 2 | Screen-space distortion of the underwater scene. |
| `causticsStrength` | number | `0.55` | 0 – 3 | Brightness of the procedural voronoi caustics on the bottom. |
| `causticsScale` | number | `0.8` | 0.05 – 8 | Spatial frequency of the caustic web. |
| `causticsSpeed` | number | `0.6` | 0 – 4 | Animation speed of the caustic web. |

### Water: Foam

Shoreline foam, whitecaps, and wake foam.

| Field | Type | Default | Range / options | Description |
|---|---|---|---|---|
| `foamColor` | color | `[0.94, 1, 0.99]` (#f0fffc) | — | Color of all foam: shoreline, whitecaps, wakes, and splashes. |
| `foamAmount` | number | `1` | 0 – 2 | Global foam gain. |
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

Module: `@call-me-sensei/toonlab/post` — 2 groups, 37 fields.

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

Module: `@call-me-sensei/toonlab/vegetation` — 5 groups, 20 fields.

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

Module: `@call-me-sensei/toonlab/vegetation` — 3 groups, 7 fields.

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

Module: `@call-me-sensei/toonlab/vegetation` — 5 groups, 68 fields.

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

Module: `@call-me-sensei/toonlab/sky` — 5 groups, 15 fields.

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
