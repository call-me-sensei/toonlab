#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace ToonLab.Editor
{
    /// <summary>
    /// Small source-material oracle used to validate the renderer contract
    /// before the full demonstration scene is allowed back into parity work.
    ///
    /// The rig deliberately removes visible sky, fog, reflection probes, post,
    /// and temporal effects. P00-P02 retain one contract-defined constant cool
    /// ambient fill; P03 can replace it with a contract-defined, validated L2
    /// diffuse SkyLight probe while keeping every other system unchanged.
    /// It captures one exact source rock mesh and material
    /// once with URP shadows disabled and once with URP hard shadows enabled.
    /// The pair isolates material/direct-light energy and cast/self-shadow
    /// response before another environment system is allowed into the scene.
    /// </summary>
    public static class UnityCleanParityRigCapture
    {
        private const string RockMeshPath =
            "Assets/SoStylized-Unity/Environment/Rocks/Classic/Meshes/SM_CliffClassic2.fbx";
        private const string RockMaterialPath =
            "Assets/SoStylized-Unity/Environment/Rocks/Materials/Classic/MV_RockClassic_Cliff.mat";
        private const string EnvironmentTreePrefabPath =
            "Assets/SoStylized-Unity/Environment/Trees/Pine/Prefabs/P_Pine01.prefab";
        private const string EnvironmentGrassPrefabPath =
            "Assets/SoStylized-Unity/Environment/Foliage/Prefabs/P_Grass3.prefab";
        private const string EnvironmentDaisiesPrefabPath =
            "Assets/SoStylized-Unity/Environment/Foliage/Prefabs/P_Daisies.prefab";
        private const string EnvironmentGroundLayerPath =
            "Assets/SoStylized-Unity/Environment/Landscape/Layer/TL_Grass.terrainlayer";
        private const string VisibleSkyAssetFolder =
            "Assets/ToonLabParity/SingleRock/VisualTargetBareSky";
        private const string VisibleSkyShaderPath =
            VisibleSkyAssetFolder + "/VisualTargetBareSky.shader";
        private const string VisibleSkyMeshPath =
            VisibleSkyAssetFolder + "/VisualTargetBareSkyMesh.asset";
        private const string VisibleSkyTexturePath =
            VisibleSkyAssetFolder + "/VisualTargetClassicDayAtlas.asset";
        private const string VisibleSkyMaterialPath =
            VisibleSkyAssetFolder + "/VisualTargetBareSky.mat";
        private const string VisibleSkyBackgroundCloudTexturePath =
            VisibleSkyAssetFolder + "/VisualTargetBackgroundClouds.asset";
        private const string CloudShellShaderPath =
            VisibleSkyAssetFolder + "/VisualTargetCloudShell.shader";
        private const string CloudShellMeshPath =
            VisibleSkyAssetFolder + "/VisualTargetCloudShellMesh.asset";
        private const string CloudShellTexturePath =
            VisibleSkyAssetFolder + "/VisualTargetCloudLayer03.asset";
        private const string CloudShellAtlasPath =
            VisibleSkyAssetFolder + "/VisualTargetCloudAtlas.asset";
        private const string CloudShellNoisePath =
            VisibleSkyAssetFolder + "/VisualTargetCloudDitherNoise.asset";
        private const string CloudShellMaterialPath =
            VisibleSkyAssetFolder + "/VisualTargetCloudShell.mat";
        private const string DisplayTransferShaderPath =
            VisibleSkyAssetFolder + "/VisualTargetDisplayTransfer.shader";
        private const string VisibleSkyMeshSha256 =
            "53e197c54cb6aa94739f799497f2ac5bda7520fede808f81a5a4cc7be2d23c25";
        private const string VisibleSkyDecodedAtlasSha256 =
            "8e68189e4a5a0d7c56c8bc361672343595cace622693e83970d8515a5142ba86";
        private const string VisibleSkyDecodedClassicDayRowSha256 =
            "3927f4eeb89c031a95fb89c0e0843c0f2dd5b06f2b195e6e56f0a813cd7255cb";

        private const string VisibleSkyShaderSource = @"Shader ""Hidden/ToonLab/Parity/VisualTargetBareSky""
{
    Properties
    {
        _Atlas (""Exact UE Atlas_Sky RGBA16F"", 2D) = ""black"" {}
        _BackgroundClouds (""Exact UE T_BackroundClouds1A"", 2D) = ""black"" {}
        _BackgroundCloudTint (""Background cloud tint"", Color) = (0.529,0.747966,1,1)
        _BackgroundCloudStrength (""Background cloud strength"", Float) = 0
        _BackgroundCloudVerticalOffset (""Background cloud vertical offset"", Float) = 0
        _BackgroundCloudVerticalStretch (""Background cloud vertical stretch"", Float) = 1
        _AtlasWidth (""Atlas width"", Float) = 256
        _AtlasHeight (""Atlas height"", Float) = 40
        _CurveRow (""Curve row"", Float) = 0
        _Brightness (""Brightness"", Float) = 1
        _FogEnabled (""UE height fog enabled"", Float) = 0
        _FogColor (""UE height-fog inscattering"", Color) = (0.287923,0.527454,0.953125,1)
        _FogDensity (""UE serialized fog density"", Float) = 0.05
        _FogHeightFalloff (""UE serialized height falloff"", Float) = 0.464768
        _FogHeightCm (""UE fog height in centimeters"", Float) = 0
        _FogStartDistanceMeters (""UE fog start distance in meters"", Float) = 10
        _FogMaxOpacity (""UE fog max opacity"", Float) = 1
    }
    SubShader
    {
        Tags { ""RenderPipeline"" = ""UniversalPipeline"" ""Queue"" = ""Background"" ""RenderType"" = ""Opaque"" }
        Pass
        {
            Name ""VisualTargetBareSky""
            Tags { ""LightMode"" = ""SRPDefaultUnlit"" }
            Cull Back
            ZWrite On
            ZTest LEqual

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include ""Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl""

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
            };

            TEXTURE2D(_Atlas);
            SAMPLER(sampler_Atlas);
            TEXTURE2D(_BackgroundClouds);
            SAMPLER(sampler_BackgroundClouds);
            float _AtlasWidth;
            float _AtlasHeight;
            float _CurveRow;
            float _Brightness;
            float4 _BackgroundCloudTint;
            float _BackgroundCloudStrength;
            float _BackgroundCloudVerticalOffset;
            float _BackgroundCloudVerticalStretch;
            float _FogEnabled;
            float4 _FogColor;
            float _FogDensity, _FogHeightFalloff, _FogHeightCm;
            float _FogStartDistanceMeters, _FogMaxOpacity;

            float3 ApplySourceHeightFog(float3 sourceColor, float3 receiverWorld)
            {
                float3 cameraToReceiver = receiverWorld - _WorldSpaceCameraPos;
                float distanceMeters = max(length(cameraToReceiver), 0.000001);
                float exclusionAlpha = saturate(_FogStartDistanceMeters / distanceMeters);
                float rayLengthCm = max(distanceMeters - _FogStartDistanceMeters, 0.0) * 100.0;
                float rayDirectionHeightCm = cameraToReceiver.y * (1.0 - exclusionAlpha) * 100.0;
                float exclusionHeightCm =
                    (_WorldSpaceCameraPos.y + cameraToReceiver.y * exclusionAlpha) * 100.0;
                float densityPerCm = max(_FogDensity, 0.0) / 1000.0;
                float heightFalloffPerCm = max(_FogHeightFalloff, 0.0) / 1000.0;
                float exponent = max(
                    heightFalloffPerCm * (exclusionHeightCm - _FogHeightCm),
                    -127.0);
                float rayOriginTerms = exp2(-exponent) * densityPerCm;
                float falloff = max(heightFalloffPerCm * rayDirectionHeightCm, -127.0);
                float absoluteFalloff = abs(falloff);
                float safeSign = absoluteFalloff >= 0.000001 ? sign(falloff) : 1.0;
                float safeFalloff = safeSign * max(absoluteFalloff, 0.000001);
                float lineIntegral = (1.0 - exp2(-falloff)) / safeFalloff;
                const float LN2 = 0.6931471805599453;
                float lineIntegralTaylor = LN2 - falloff * (0.5 * LN2 * LN2);
                float sharedLineIntegral = rayOriginTerms *
                    (absoluteFalloff >= 0.000001 ? lineIntegral : lineIntegralTaylor);
                float fogFactor = 1.0 - exp2(-sharedLineIntegral * rayLengthCm);
                fogFactor = min(saturate(fogFactor), _FogMaxOpacity) * _FogEnabled;
                return lerp(sourceColor, _FogColor.rgb, fogFactor);
            }

            Varyings Vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.uv = input.uv;
                output.positionWS = TransformObjectToWorld(input.positionOS.xyz);
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                float curveTime = saturate(1.0 - input.uv.y);
                float sampleU =
                    (curveTime * (_AtlasWidth - 1.0) + 0.5) / _AtlasWidth;
                float sourceSampleV = (_CurveRow + 0.5) / _AtlasHeight;
                // The decoder preserves EXR increasing-Y scanlines and
                // LoadRawTextureData treats raw row zero as Unity's bottom row.
                float sampleV = sourceSampleV;
                float3 source = SAMPLE_TEXTURE2D(
                    _Atlas,
                    sampler_Atlas,
                    float2(sampleU, sampleV)).rgb;
                source *= _Brightness;
                float2 cloudUv = (input.uv - 0.5)
                    / float2(1.0, _BackgroundCloudVerticalStretch) + 0.5;
                cloudUv.y += _BackgroundCloudVerticalOffset;
                // ImageConversion.LoadImage and glTF UV0 use opposite vertical
                // origins. Keep the source graph unchanged and make the image
                // decode adapter explicit at this renderer boundary.
                cloudUv.y = 1.0 - cloudUv.y;
                float3 cloud = SAMPLE_TEXTURE2D(
                    _BackgroundClouds,
                    sampler_BackgroundClouds,
                    cloudUv).rrr * _BackgroundCloudTint.rgb;
                float3 screened = 1.0 - (1.0 - cloud) * (1.0 - source);
                float3 skyColor = lerp(source, screened, _BackgroundCloudStrength);
                return float4(ApplySourceHeightFog(skyColor, input.positionWS), 1.0);
            }
            ENDHLSL
        }
    }
}";

        private const string CloudShellShaderSource = @"Shader ""Hidden/ToonLab/Parity/VisualTargetCloudShell""
{
    Properties
    {
        _CloudLayer (""Exact UE T_CloudLayer03"", 2D) = ""black"" {}
        _CloudAtlas (""Exact UE Atlas_Clouds RGBA16F"", 2D) = ""black"" {}
        _DitherNoise (""Exact UE Good64x64TilingNoiseHighFreq"", 2D) = ""black"" {}
        _AtlasWidth (""Atlas width"", Float) = 256
        _AtlasHeight (""Atlas height"", Float) = 26
        _CurveRow (""Curve row"", Float) = 0
        _RotationSpeed (""Rotation speed"", Float) = -0.0005
        _DeterministicTime (""Deterministic time"", Float) = 0
        _Strength (""Strength"", Float) = 2
        _VerticalOffset (""Vertical offset"", Float) = -0.072
        _VerticalStretch (""Vertical stretch"", Float) = 0.424
        _AlphaClip (""Alpha clip"", Float) = 0.3333333333
        _FogEnabled (""UE height fog enabled"", Float) = 0
        _FogColor (""UE height-fog inscattering"", Color) = (0.287923,0.527454,0.953125,1)
        _FogDensity (""UE serialized fog density"", Float) = 0.05
        _FogHeightFalloff (""UE serialized height falloff"", Float) = 0.464768
        _FogHeightCm (""UE fog height in centimeters"", Float) = 0
        _FogStartDistanceMeters (""UE fog start distance in meters"", Float) = 10
        _FogMaxOpacity (""UE fog max opacity"", Float) = 1
    }
    SubShader
    {
        Tags { ""RenderPipeline"" = ""UniversalPipeline"" ""Queue"" = ""Background+1"" ""RenderType"" = ""Transparent"" }
        Pass
        {
            Name ""VisualTargetCloudShell""
            Tags { ""LightMode"" = ""SRPDefaultUnlit"" }
            Cull Back
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            ZTest LEqual

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include ""Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl""

            struct Attributes { float4 positionOS : POSITION; float2 uv : TEXCOORD0; };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
            };
            TEXTURE2D(_CloudLayer); SAMPLER(sampler_CloudLayer);
            TEXTURE2D(_CloudAtlas); SAMPLER(sampler_CloudAtlas);
            TEXTURE2D(_DitherNoise); SAMPLER(sampler_DitherNoise);
            float _AtlasWidth, _AtlasHeight, _CurveRow;
            float _RotationSpeed, _DeterministicTime, _Strength;
            float _VerticalOffset, _VerticalStretch, _AlphaClip;
            float _FogEnabled;
            float4 _FogColor;
            float _FogDensity, _FogHeightFalloff, _FogHeightCm;
            float _FogStartDistanceMeters, _FogMaxOpacity;

            float3 ApplySourceHeightFog(float3 sourceColor, float3 receiverWorld)
            {
                float3 cameraToReceiver = receiverWorld - _WorldSpaceCameraPos;
                float distanceMeters = max(length(cameraToReceiver), 0.000001);
                float exclusionAlpha = saturate(_FogStartDistanceMeters / distanceMeters);
                float rayLengthCm = max(distanceMeters - _FogStartDistanceMeters, 0.0) * 100.0;
                float rayDirectionHeightCm = cameraToReceiver.y * (1.0 - exclusionAlpha) * 100.0;
                float exclusionHeightCm =
                    (_WorldSpaceCameraPos.y + cameraToReceiver.y * exclusionAlpha) * 100.0;
                float densityPerCm = max(_FogDensity, 0.0) / 1000.0;
                float heightFalloffPerCm = max(_FogHeightFalloff, 0.0) / 1000.0;
                float exponent = max(
                    heightFalloffPerCm * (exclusionHeightCm - _FogHeightCm),
                    -127.0);
                float rayOriginTerms = exp2(-exponent) * densityPerCm;
                float falloff = max(heightFalloffPerCm * rayDirectionHeightCm, -127.0);
                float absoluteFalloff = abs(falloff);
                float safeSign = absoluteFalloff >= 0.000001 ? sign(falloff) : 1.0;
                float safeFalloff = safeSign * max(absoluteFalloff, 0.000001);
                float lineIntegral = (1.0 - exp2(-falloff)) / safeFalloff;
                const float LN2 = 0.6931471805599453;
                float lineIntegralTaylor = LN2 - falloff * (0.5 * LN2 * LN2);
                float sharedLineIntegral = rayOriginTerms *
                    (absoluteFalloff >= 0.000001 ? lineIntegral : lineIntegralTaylor);
                float fogFactor = 1.0 - exp2(-sharedLineIntegral * rayLengthCm);
                fogFactor = min(saturate(fogFactor), _FogMaxOpacity) * _FogEnabled;
                return lerp(sourceColor, _FogColor.rgb, fogFactor);
            }

            Varyings Vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.uv = input.uv;
                output.positionWS = TransformObjectToWorld(input.positionOS.xyz);
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                float2 panned = input.uv + float2(
                    _RotationSpeed * _DeterministicTime,
                    _VerticalOffset);
                float2 cloudUv = (panned - 0.5) / float2(1.0, _VerticalStretch) + 0.5;
                // ImageConversion.LoadImage and the glTF-authored UVs have
                // opposite vertical origins. Match the UE/Three sample
                // orientation explicitly instead of rotating the dome.
                cloudUv.y = 1.0 - cloudUv.y;
                float4 cloud = SAMPLE_TEXTURE2D(_CloudLayer, sampler_CloudLayer, cloudUv);
                float sampleU = (saturate(cloud.r) * (_AtlasWidth - 1.0) + 0.5) / _AtlasWidth;
                float sampleV = (_CurveRow + 0.5) / _AtlasHeight;
                float3 color = SAMPLE_TEXTURE2D(
                    _CloudAtlas,
                    sampler_CloudAtlas,
                    float2(sampleU, sampleV)).rgb * _Strength;
                // The retained UE comparison is the result after 180 temporal
                // warm-up frames. Its expected static coverage is the source
                // alpha itself, matching ToonLab's analytic TAA-average adapter.
                return float4(
                    ApplySourceHeightFog(color, input.positionWS),
                    saturate(cloud.a));
            }
            ENDHLSL
        }
    }
}";

        private const string DisplayTransferShaderSource = @"Shader ""Hidden/ToonLab/Parity/VisualTargetDisplayTransfer""
{
    Properties { _MainTex (""HDR Scene Color"", 2D) = ""black"" {} }
    SubShader
    {
        Tags { ""RenderPipeline"" = ""UniversalPipeline"" }
        Pass
        {
            Name ""VisualTargetDisplayTransfer""
            ZTest Always ZWrite Off Cull Off
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include ""Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl""

            struct Attributes { uint vertexID : SV_VertexID; };
            struct Varyings { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; };
            TEXTURE2D(_MainTex); SAMPLER(sampler_MainTex);

            Varyings Vert(Attributes input)
            {
                Varyings output;
                output.positionCS = GetFullScreenTriangleVertexPosition(input.vertexID);
                output.uv = GetFullScreenTriangleTexCoord(input.vertexID);
                return output;
            }

            float3 LinearSrgbToAp1(float3 v) { return float3(
                dot(v, float3(0.6130974024, 0.3395231461, 0.0473794514)),
                dot(v, float3(0.0701937225, 0.9163538791, 0.0134523986)),
                dot(v, float3(0.0206155929, 0.1095697729, 0.8698146341))); }
            float3 Ap1ToLinearSrgb(float3 v) { return float3(
                dot(v, float3(1.7050509926, -0.6217921205, -0.0832588722)),
                dot(v, float3(-0.1302564175, 1.1408047365, -0.0105483190)),
                dot(v, float3(-0.0240033568, -0.1289689761, 1.1529723328))); }
            float3 Ap1ToAp0(float3 v) { return float3(
                dot(v, float3(0.6954522414, 0.1406786965, 0.1638690622)),
                dot(v, float3(0.0447945634, 0.8596711185, 0.0955343182)),
                dot(v, float3(-0.0055258826, 0.0040252103, 1.0015006723))); }
            float3 Ap0ToAp1(float3 v) { return float3(
                dot(v, float3(1.4514393161, -0.2365107469, -0.2149285693)),
                dot(v, float3(-0.0765537734, 1.1762296998, -0.0996759264)),
                dot(v, float3(0.0083161484, -0.0060324498, 0.9977163014))); }
            float3 ExpandGamutAp1(float3 v) { return float3(
                dot(v, float3(1.3704123718, -0.3292921877, -0.0636831194)),
                dot(v, float3(-0.0834334917, 1.0970927480, -0.0108613795)),
                dot(v, float3(-0.0257933209, -0.0986257988, 1.2036949526))); }
            float3 BlueCorrectAp1(float3 v) { return float3(
                dot(v, float3(0.9386393778, 0, 0.0613606221)),
                dot(v, float3(0, 0.8307941330, 0.1692058671)), v.b); }
            float3 BlueCorrectInvAp1(float3 v) { return float3(
                dot(v, float3(1.0653748755, 0.0000014467, -0.0653710053)),
                dot(v, float3(-0.0000003456, 1.2036635245, -0.2036677199)),
                dot(v, float3(0.0000000198, 0.0000000212, 0.9999996001))); }

            float3 ApplyVisualTargetTransfer(float3 sceneColor)
            {
                const float3 AP1_LUMA = float3(0.2722287168, 0.6740817658, 0.0536895174);
                float3 colorAP1 = max(LinearSrgbToAp1(sceneColor), 0);
                float gradeLuma = dot(colorAP1, AP1_LUMA);
                float3 chromaDelta = colorAP1 / max(gradeLuma, 1e-10) - 1;
                float expandAmount = (1 - exp2(-4 * dot(chromaDelta, chromaDelta)))
                    * (1 - exp2(-4 * gradeLuma * gradeLuma));
                if (gradeLuma <= 1e-10) expandAmount = 0;
                colorAP1 = lerp(colorAP1, ExpandGamutAp1(colorAP1), expandAmount);

                float correctedLuma = dot(colorAP1, AP1_LUMA);
                colorAP1 = max(lerp(correctedLuma.xxx, colorAP1, 1.21), 0);
                colorAP1 = lerp(colorAP1, BlueCorrectAp1(colorAP1), 0.6000000238418579);
                float3 preToneColor = colorAP1;

                float3 colorAP0 = Ap1ToAp0(colorAP1);
                float minimumRgb = min(colorAP0.r, min(colorAP0.g, colorAP0.b));
                float maximumRgb = max(colorAP0.r, max(colorAP0.g, colorAP0.b));
                float saturation = (max(maximumRgb, 1e-10) - max(minimumRgb, 1e-10))
                    / max(maximumRgb, 1e-2);
                float chroma = sqrt(max(
                    colorAP0.b * (colorAP0.b - colorAP0.g)
                    + colorAP0.g * (colorAP0.g - colorAP0.r)
                    + colorAP0.r * (colorAP0.r - colorAP0.b), 0));
                float ycIn = (colorAP0.r + colorAP0.g + colorAP0.b + 1.75 * chroma) / 3;
                float sigmoidInput = (saturation - 0.4) / 0.2;
                float sigmoidT = max(1 - abs(sigmoidInput * 0.5), 0);
                float sigmoid = 0.5 * (1 + sign(sigmoidInput) * (1 - sigmoidT * sigmoidT));
                float glowGainIn = sigmoid * 0.05;
                float glowGain = ycIn <= (2 * 0.08 / 3)
                    ? glowGainIn
                    : (ycIn >= (2 * 0.08) ? 0 : glowGainIn * (0.08 / max(ycIn, 1e-6) - 0.5));
                colorAP0 *= glowGain + 1;

                float hue = degrees(atan2(
                    sqrt(3.0) * (colorAP0.g - colorAP0.b),
                    2 * colorAP0.r - colorAP0.g - colorAP0.b));
                if (hue < 0) hue += 360;
                if (colorAP0.r == colorAP0.g && colorAP0.g == colorAP0.b) hue = 0;
                hue = clamp(hue, 0, 360);
                float centeredHue = hue > 180 ? hue - 360 : hue;
                float hueWeight = pow(smoothstep(0, 1, 1 - abs(centeredHue * (2.0 / 135.0))), 2);
                colorAP0.r += hueWeight * saturation * (0.03 - colorAP0.r) * 0.18;

                float3 workingColor = max(Ap0ToAp1(colorAP0), 0);
                float workingLuma = dot(workingColor, AP1_LUMA);
                workingColor = lerp(workingLuma.xxx, workingColor, 0.96);

                const float slope = 1;
                const float toe = 0.30000001192092896;
                const float shoulder = 1;
                const float blackClip = 0;
                const float whiteClip = 0;
                float toeScale = max(1 + blackClip - toe, 1e-5);
                float shoulderScale = max(1 + whiteClip - shoulder, 1e-5);
                float log10_018 = log10(0.18);
                float toeMatch = log10_018 - 0.5 * log(
                    (1 + ((0.18 + blackClip) / toeScale - 1))
                    / (1 - ((0.18 + blackClip) / toeScale - 1))) * (toeScale / slope);
                float straightMatch = (1 - toe) / slope - toeMatch;
                float shoulderMatch = shoulder / slope - straightMatch;
                float3 logColor = log10(max(workingColor, 1e-6));
                float3 straightColor = slope * (logColor + straightMatch);
                float3 toeColor = -blackClip + toeScale * 2 /
                    (1 + exp(clamp((-2 * slope / toeScale) * (logColor - toeMatch), -80, 80)));
                float3 shoulderColor = 1 + whiteClip - shoulderScale * 2 /
                    (1 + exp(clamp((2 * slope / shoulderScale) * (logColor - shoulderMatch), -80, 80)));
                float3 resolvedToe = lerp(straightColor, toeColor, logColor < toeMatch);
                float3 resolvedShoulder = lerp(straightColor, shoulderColor, logColor > shoulderMatch);
                float3 curveBlend = saturate((logColor - toeMatch) / max(abs(shoulderMatch - toeMatch), 1e-5));
                if (shoulderMatch < toeMatch) curveBlend = 1 - curveBlend;
                curveBlend = (3 - 2 * curveBlend) * curveBlend * curveBlend;
                float3 toneColor = lerp(resolvedToe, resolvedShoulder, curveBlend);
                workingLuma = dot(toneColor, AP1_LUMA);
                toneColor = max(lerp(workingLuma.xxx, toneColor, 0.93), 0);
                colorAP1 = lerp(preToneColor, toneColor, 1);
                colorAP1 = lerp(colorAP1, BlueCorrectInvAp1(colorAP1), 0.6000000238418579);
                float3 linearOutput = saturate(max(Ap1ToLinearSrgb(colorAP1), 0));
                return pow(linearOutput, 1.0 / 2.2);
            }

            float4 Frag(Varyings input) : SV_Target
            {
                float3 sceneColor = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, input.uv).rgb;
                return float4(ApplyVisualTargetTransfer(sceneColor), 1);
            }
            ENDHLSL
        }
    }
}";

        public static void Run()
        {
            var contractPath = Path.GetFullPath(Argument(
                "-contract",
                Path.Combine(
                    Path.GetTempPath(),
                    "toonlab-single-rock-parity-contract.json")));
            var contract = LoadContract(contractPath);
            var outputDirectory = Path.GetFullPath(Argument(
                "-output",
                Path.Combine(Path.GetTempPath(), "toonlab-clean-parity-rig")));
            var width = IntArgument("-width", contract.render.width);
            var height = IntArgument("-height", contract.render.height);
            var sceneAssetPath = Argument("-sceneAsset", string.Empty);
            var contentMode = Argument("-content", "rock");
            var captureView = Argument("-view", "front");
            if (contract.rock?.unity != null)
            {
                contract.rock.unity.sourceYawDegrees = FloatArgument(
                    "-rockYaw",
                    contract.rock.unity.sourceYawDegrees);
                if (contract.rock.unity.sourceAxisScale != null
                    && contract.rock.unity.sourceAxisScale.Length >= 3)
                    contract.rock.unity.sourceAxisScale[2] = FloatArgument(
                        "-rockAxisZ",
                        contract.rock.unity.sourceAxisScale[2]);
            }
            var includeEnvironment = contentMode.StartsWith(
                "environment",
                StringComparison.OrdinalIgnoreCase);
            var includeP18Props = string.Equals(
                contentMode,
                "environment-p18",
                StringComparison.OrdinalIgnoreCase);
            var useBackView = string.Equals(
                captureView,
                "back",
                StringComparison.OrdinalIgnoreCase);
            var useBenchView = string.Equals(
                captureView,
                "bench",
                StringComparison.OrdinalIgnoreCase);
            Directory.CreateDirectory(outputDirectory);

            RenderTexture destination = null;
            RenderTexture hdrDestination = null;
            Texture2D pixels = null;
            Material groundMaterial = null;
            Material geometryIdMaterial = null;
            Material displayTransferMaterial = null;
            VisibleSkySetup visibleSky = null;
            try
            {
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                RenderSettings.fog = false;
                RenderSettings.skybox = null;
                RenderSettings.sun = null;
                RenderSettings.ambientMode = AmbientMode.Flat;
                RenderSettings.ambientLight = ColorFrom(contract.render.ambientColor);
                RenderSettings.ambientIntensity = contract.render.ambientIntensity;
                RenderSettings.reflectionIntensity = 0.0f;
                RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;
                RenderSettings.customReflectionTexture = null;

                var skyLightReport = ConfigureSourceSkyLight(contract);
                if (skyLightReport != null)
                {
                    File.WriteAllText(
                        Path.Combine(outputDirectory, "sky-light-validation.json"),
                        JsonUtility.ToJson(skyLightReport, true));
                    if (!skyLightReport.captureAllowed)
                    {
                        throw new InvalidOperationException(
                            "P03 SkyLight capture is blocked: " + skyLightReport.failureReason);
                    }
                }

                var sourceRock = BuildSourceRock(contract.rock, contractPath);
                var sourceObjects = new List<GameObject> { sourceRock };
                if (includeEnvironment)
                {
                    sourceObjects.Add(InstantiateEnvironmentPrefab(
                        EnvironmentTreePrefabPath,
                        "Source P_Pine01 LOD0 audit tree",
                        new Vector3(-4.1f, 0.0f, -1.25f),
                        0.36f,
                        true,
                        true));
                    sourceObjects.Add(InstantiateEnvironmentPrefab(
                        EnvironmentGrassPrefabPath,
                        "Source P_Grass3 LOD0 audit patch",
                        new Vector3(3.15f, 0.02f, -1.2f),
                        0.68f,
                        false,
                        true));
                    sourceObjects.Add(InstantiateEnvironmentPrefab(
                        EnvironmentDaisiesPrefabPath,
                        "Source P_Daisies audit patch",
                        new Vector3(1.6f, 0.02f, 1.5f),
                        0.8f,
                        false,
                        true));
                    if (includeP18Props)
                    {
                        if (contract.p18StylizedBasic == null)
                            throw new InvalidOperationException(
                                "P18 environment capture requires p18StylizedBasic.");
                        sourceObjects.AddRange(InstantiateP18Props(
                            contract.p18StylizedBasic,
                            contractPath));
                    }
                }

                var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
                ground.name = "Parity Ground";
                ground.transform.position = Vector3From(contract.ground.position);
                ground.transform.rotation = QuaternionFrom(contract.ground.rotationQuaternion);
                ground.transform.localScale = new Vector3(
                    contract.ground.size[0] / 10.0f,
                    1.0f,
                    contract.ground.size[1] / 10.0f);
                var groundShader = Shader.Find("Universal Render Pipeline/Lit");
                if (groundShader == null)
                    throw new InvalidOperationException("URP Lit shader was not found.");
                groundMaterial = ResolveGroundMaterial(groundShader, sceneAssetPath);
                if (includeEnvironment)
                    ConfigureEnvironmentGroundMaterial(groundMaterial, contract.ground.size);
                groundMaterial.SetColor("_BaseColor", ColorFrom(contract.ground.baseColor));
                groundMaterial.SetFloat("_Metallic", contract.ground.metallic);
                groundMaterial.SetFloat("_Smoothness", contract.ground.smoothness);
                var groundRenderer = ground.GetComponent<MeshRenderer>();
                groundRenderer.sharedMaterial = groundMaterial;
                groundRenderer.shadowCastingMode = contract.ground.castShadow
                    ? ShadowCastingMode.On
                    : ShadowCastingMode.Off;
                groundRenderer.receiveShadows = contract.ground.receiveShadow;

                var sunObject = new GameObject("Parity Source Sun");
                var sun = sunObject.AddComponent<Light>();
                sun.type = LightType.Directional;
                sun.color = ColorFrom(contract.sun.color);
                var unityRadiometricAdapter = contract.engineAdapters?.unity;
                var directRadianceMultiplier = unityRadiometricAdapter == null
                    ? 1.0f
                    : unityRadiometricAdapter.directRadianceMultiplier;
                sun.intensity = contract.sun.intensity * directRadianceMultiplier;
                sun.bounceIntensity = 1.0f;
                sun.shadowStrength = contract.sun.shadowStrength;
                sun.shadowBias = contract.sun.sourceLightShadowBias;
                sun.shadowNormalBias = contract.sun.sourceLightShadowNormalBias;
                sun.shadowNearPlane = contract.sun.sourceLightShadowNearPlane;
                sunObject.transform.rotation = QuaternionFrom(
                    contract.sun.worldRotationQuaternion);
                RenderSettings.sun = sun;

                var cameraObject = new GameObject("Parity Camera");
                var camera = cameraObject.AddComponent<Camera>();
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = ColorFrom(contract.render.clearColor);
                camera.fieldOfView = contract.camera.verticalFieldOfViewDegrees;
                camera.nearClipPlane = contract.camera.near;
                camera.farClipPlane = contract.sky != null
                    && contract.sky.visible
                    && contract.sky.unityCameraFarMeters > contract.camera.far
                        ? contract.sky.unityCameraFarMeters
                        : contract.camera.far;
                var applyDisplayTransfer = contract.post != null
                    && string.Equals(
                        contract.post.mode,
                        "ue-5.8-source-fixed-exposure-filmic-sdr",
                        StringComparison.Ordinal);
                camera.allowHDR = applyDisplayTransfer;
                camera.allowMSAA = false;
                camera.aspect = (float)width / height;
                var selectedCamera = useBenchView
                    ? contract.capture?.views?.bench
                    : contract.camera;
                if (selectedCamera == null)
                    throw new InvalidOperationException(
                        "The requested bench camera is missing from capture.views.");
                camera.fieldOfView = selectedCamera.verticalFieldOfViewDegrees;
                camera.nearClipPlane = selectedCamera.near > 0.0f
                    ? selectedCamera.near
                    : contract.camera.near;
                camera.transform.position = Vector3From(selectedCamera.position);
                var cameraTarget = useBenchView
                    ? Vector3From(selectedCamera.lookAt)
                    : includeEnvironment
                    ? CombinedRendererBounds(sourceRock).center
                    : Vector3From(selectedCamera.lookAt);
                var canonicalCameraTarget = Vector3From(selectedCamera.lookAt);
                var cameraOffset = camera.transform.position - canonicalCameraTarget;
                if (!useBenchView && useBackView)
                {
                    cameraOffset.x *= -1f;
                    cameraOffset.z *= -1f;
                }
                camera.transform.position = cameraTarget + cameraOffset;
                camera.transform.LookAt(
                    cameraTarget,
                    Vector3From(selectedCamera.up));
                camera.ResetProjectionMatrix();
                var cameraData = camera.GetUniversalAdditionalCameraData();
                cameraData.renderPostProcessing = false;
                cameraData.antialiasing = AntialiasingMode.None;
                cameraData.renderShadows = true;
                cameraData.requiresColorOption = CameraOverrideOption.Off;
                cameraData.requiresDepthOption = CameraOverrideOption.Off;

                visibleSky = ConfigureVisibleSky(
                    contract,
                    contractPath,
                    camera,
                    sceneAssetPath);
                if (visibleSky != null)
                {
                    File.WriteAllText(
                        Path.Combine(outputDirectory, "visible-sky-validation.json"),
                        JsonUtility.ToJson(visibleSky.report, true));
                    if (!visibleSky.report.captureAllowed)
                    {
                        throw new InvalidOperationException(
                            "P04 visible-sky capture is blocked: " +
                            visibleSky.report.failureReason);
                    }
                }

                destination = new RenderTexture(
                    width,
                    height,
                    24,
                    RenderTextureFormat.ARGB32,
                    applyDisplayTransfer
                        ? RenderTextureReadWrite.Linear
                        : RenderTextureReadWrite.sRGB)
                {
                    antiAliasing = 1,
                    autoGenerateMips = false,
                    name = "ToonLab Clean Parity Rig",
                    useMipMap = false,
                };
                destination.Create();
                if (applyDisplayTransfer)
                {
                    hdrDestination = new RenderTexture(
                        width,
                        height,
                        24,
                        RenderTextureFormat.ARGBHalf,
                        RenderTextureReadWrite.Linear)
                    {
                        antiAliasing = 1,
                        autoGenerateMips = false,
                        name = "ToonLab Clean Parity Rig HDR Scene Color",
                        useMipMap = false,
                    };
                    hdrDestination.Create();
                    displayTransferMaterial = new Material(ResolveDisplayTransferShader())
                    {
                        name = "Visual Target P05 exact display transfer",
                    };
                }

                sun.shadows = LightShadows.None;
                var unshadowed = Render(
                    camera,
                    destination,
                    out pixels,
                    hdrDestination,
                    displayTransferMaterial);
                File.WriteAllBytes(
                    Path.Combine(outputDirectory, "direct-unshadowed.png"),
                    unshadowed);
                UnityEngine.Object.DestroyImmediate(pixels);
                pixels = null;

                sun.shadows = LightShadows.Hard;
                var shadowed = Render(
                    camera,
                    destination,
                    out pixels,
                    hdrDestination,
                    displayTransferMaterial);
                File.WriteAllBytes(
                    Path.Combine(outputDirectory, "direct-hard-shadow.png"),
                    shadowed);
                UnityEngine.Object.DestroyImmediate(pixels);
                pixels = null;

                var unlitShader = Shader.Find("Universal Render Pipeline/Unlit");
                if (unlitShader == null)
                    throw new InvalidOperationException("URP Unlit shader was not found.");
                geometryIdMaterial = new Material(unlitShader)
                {
                    name = "Parity Geometry ID White",
                };
                if (geometryIdMaterial.HasProperty("_BaseColor"))
                    geometryIdMaterial.SetColor("_BaseColor", Color.white);
                if (geometryIdMaterial.HasProperty("_Color"))
                    geometryIdMaterial.SetColor("_Color", Color.white);
                var sourceRenderers = sourceObjects
                    .SelectMany(sourceObject => sourceObject.GetComponentsInChildren<Renderer>(true))
                    .ToArray();
                var sourceMaterials = sourceRenderers
                    .Select(renderer => renderer.sharedMaterials)
                    .ToArray();
                var sourceCastingModes = sourceRenderers
                    .Select(renderer => renderer.shadowCastingMode)
                    .ToArray();
                var sourceReceiveModes = sourceRenderers
                    .Select(renderer => renderer.receiveShadows)
                    .ToArray();
                var skyRenderers = visibleSky?.renderers ?? Array.Empty<MeshRenderer>();
                var skyEnabled = skyRenderers.Select(renderer => renderer.enabled).ToArray();
                foreach (var skyRenderer in skyRenderers) skyRenderer.enabled = false;
                groundRenderer.enabled = false;
                sun.enabled = false;
                for (var index = 0; index < sourceRenderers.Length; index += 1)
                {
                    sourceRenderers[index].sharedMaterials = sourceMaterials[index]
                        .Select(_material => geometryIdMaterial)
                        .ToArray();
                    sourceRenderers[index].shadowCastingMode = ShadowCastingMode.Off;
                    sourceRenderers[index].receiveShadows = false;
                }
                var geometryId = Render(camera, destination, out pixels);
                File.WriteAllBytes(
                    Path.Combine(outputDirectory, "geometry-id.png"),
                    geometryId);
                UnityEngine.Object.DestroyImmediate(pixels);
                pixels = null;
                for (var index = 0; index < sourceRenderers.Length; index += 1)
                {
                    sourceRenderers[index].sharedMaterials = sourceMaterials[index];
                    sourceRenderers[index].shadowCastingMode = sourceCastingModes[index];
                    sourceRenderers[index].receiveShadows = sourceReceiveModes[index];
                }
                sun.enabled = true;
                groundRenderer.enabled = true;
                for (var index = 0; index < skyRenderers.Length; index += 1)
                    skyRenderers[index].enabled = skyEnabled[index];
                UnityEngine.Object.DestroyImmediate(geometryIdMaterial);
                geometryIdMaterial = null;

                if (!string.IsNullOrWhiteSpace(sceneAssetPath))
                {
                    if (!sceneAssetPath.StartsWith("Assets/", StringComparison.Ordinal) ||
                        !sceneAssetPath.EndsWith(".unity", StringComparison.OrdinalIgnoreCase))
                    {
                        throw new ArgumentException(
                            "-sceneAsset must be an Assets-relative .unity path.");
                    }
                    EnsureAssetFolder(Path.GetDirectoryName(sceneAssetPath)?.Replace('\\', '/'));
                    if (!EditorSceneManager.SaveScene(
                        SceneManager.GetActiveScene(),
                        sceneAssetPath,
                        false))
                    {
                        throw new InvalidOperationException(
                            "Unity did not save the parity scene: " + sceneAssetPath);
                    }
                    AssetDatabase.SaveAssets();
                }

                var report = BuildReport(
                    contractPath,
                    contract.checkpoint,
                    contract.profileId,
                    width,
                    height,
                    camera,
                    sun,
                    ground,
                    groundRenderer,
                    sourceObjects,
                    skyLightReport,
                    visibleSky?.report,
                    contract.post,
                    contract.sun.intensity,
                    unityRadiometricAdapter);
                File.WriteAllText(
                    Path.Combine(outputDirectory, "report.json"),
                    JsonUtility.ToJson(report, true));

                camera.targetTexture = null;
                destination.Release();
                UnityEngine.Object.DestroyImmediate(destination);
                destination = null;
                if (hdrDestination != null)
                {
                    hdrDestination.Release();
                    UnityEngine.Object.DestroyImmediate(hdrDestination);
                    hdrDestination = null;
                }
                if (displayTransferMaterial != null)
                {
                    UnityEngine.Object.DestroyImmediate(displayTransferMaterial);
                    displayTransferMaterial = null;
                }
                if (!EditorUtility.IsPersistent(groundMaterial))
                    UnityEngine.Object.DestroyImmediate(groundMaterial);
                groundMaterial = null;
                Debug.Log("TOONLAB_CLEAN_PARITY_RIG=" + outputDirectory);
                EditorApplication.Exit(0);
            }
            catch (Exception error)
            {
                if (pixels != null) UnityEngine.Object.DestroyImmediate(pixels);
                if (destination != null)
                {
                    destination.Release();
                    UnityEngine.Object.DestroyImmediate(destination);
                }
                if (hdrDestination != null)
                {
                    hdrDestination.Release();
                    UnityEngine.Object.DestroyImmediate(hdrDestination);
                }
                if (displayTransferMaterial != null)
                    UnityEngine.Object.DestroyImmediate(displayTransferMaterial);
                if (groundMaterial != null && !EditorUtility.IsPersistent(groundMaterial))
                    UnityEngine.Object.DestroyImmediate(groundMaterial);
                if (geometryIdMaterial != null)
                    UnityEngine.Object.DestroyImmediate(geometryIdMaterial);
                Debug.LogException(error);
                EditorApplication.Exit(1);
            }
        }

        private static Material ResolveGroundMaterial(Shader shader, string sceneAssetPath)
        {
            if (string.IsNullOrWhiteSpace(sceneAssetPath))
            {
                return new Material(shader)
                {
                    name = "Parity Ground White",
                };
            }

            const string materialPath =
                "Assets/ToonLabParity/SingleRock/ParityGroundWhite.mat";
            EnsureAssetFolder("Assets/ToonLabParity/SingleRock");
            var material = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
            if (material == null)
            {
                material = new Material(shader)
                {
                    name = "Parity Ground White",
                };
                AssetDatabase.CreateAsset(material, materialPath);
            }
            else if (material.shader != shader)
            {
                material.shader = shader;
            }
            EditorUtility.SetDirty(material);
            return material;
        }

        private static GameObject InstantiateEnvironmentPrefab(
            string prefabPath,
            string name,
            Vector3 position,
            float uniformScale,
            bool castShadow,
            bool receiveShadow)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            if (prefab == null)
                throw new InvalidOperationException(
                    "Source environment prefab was not found: " + prefabPath);
            var instance = UnityEngine.Object.Instantiate(prefab);
            instance.name = name;
            instance.transform.position = position;
            instance.transform.rotation = Quaternion.identity;
            instance.transform.localScale = Vector3.one * uniformScale;
            foreach (var renderer in instance.GetComponentsInChildren<Renderer>(true))
            {
                renderer.shadowCastingMode = castShadow
                    ? ShadowCastingMode.On
                    : ShadowCastingMode.Off;
                renderer.receiveShadows = receiveShadow;
            }
            return instance;
        }

        private static IReadOnlyList<GameObject> InstantiateP18Props(
            P18StylizedBasicContract contract,
            string contractPath)
        {
            if (contract.props == null || contract.props.Length == 0)
                throw new InvalidOperationException("The P18 prop contract is empty.");
            var instances = new List<GameObject>();
            foreach (var prop in contract.props)
            {
                if (prop == null || string.IsNullOrWhiteSpace(prop.sourceGlb))
                    throw new InvalidOperationException("A P18 prop source GLB is missing.");
                var sourcePath = ResolveContractAssetPath(contractPath, prop.sourceGlb);
                var instance = InstantiatePortableGlb(
                    sourcePath,
                    prop.sourceNode,
                    prop);
                instance.name = prop.label + " — " + prop.id;
                instance.transform.position = Vector3From(prop.canonicalPositionMeters);
                instance.transform.rotation = QuaternionFromEulerYxz(
                    prop.canonicalRotationEulerDegrees);
                instance.transform.localScale = Vector3From(prop.canonicalScale);
                instance.transform.hasChanged = true;
                var bounds = CombinedRendererBounds(instance);
                instance.transform.position += Vector3.up * (
                    -bounds.min.y - prop.groundInsetMeters);
                foreach (var renderer in instance.GetComponentsInChildren<Renderer>(true))
                {
                    renderer.shadowCastingMode = prop.castShadow
                        ? ShadowCastingMode.On
                        : ShadowCastingMode.Off;
                    renderer.receiveShadows = prop.receiveShadow;
                }
                instances.Add(instance);
            }
            return instances;
        }

        private static Quaternion QuaternionFromEulerYxz(float[] degrees)
        {
            if (degrees == null || degrees.Length < 3)
                return Quaternion.identity;
            return Quaternion.AngleAxis(degrees[1], Vector3.up)
                * Quaternion.AngleAxis(degrees[0], Vector3.right)
                * Quaternion.AngleAxis(degrees[2], Vector3.forward);
        }

        private static GameObject InstantiatePortableGlb(
            string sourcePath,
            string selectedNodeName,
            P18PropContract prop)
        {
            var container = ReadGlbContainer(File.ReadAllBytes(sourcePath));
            var glb = container.root;
            if (glb.meshes == null || glb.nodes == null)
                throw new InvalidOperationException(
                    "P18 source GLB contains no node/mesh graph: " + sourcePath);
            var parentIndices = Enumerable.Repeat(-1, glb.nodes.Length).ToArray();
            for (var parentIndex = 0; parentIndex < glb.nodes.Length; parentIndex += 1)
            {
                foreach (var childIndex in glb.nodes[parentIndex].children ?? Array.Empty<int>())
                {
                    if (childIndex >= 0 && childIndex < parentIndices.Length)
                        parentIndices[childIndex] = parentIndex;
                }
            }
            var roots = glb.scenes != null
                && glb.scene >= 0
                && glb.scene < glb.scenes.Length
                ? glb.scenes[glb.scene].nodes ?? Array.Empty<int>()
                : Enumerable.Range(0, glb.nodes.Length)
                    .Where(index => parentIndices[index] < 0)
                    .ToArray();
            var selectedIndex = -1;
            if (!string.IsNullOrWhiteSpace(selectedNodeName))
            {
                selectedIndex = Array.FindIndex(
                    glb.nodes,
                    node => string.Equals(
                        node?.name,
                        selectedNodeName,
                        StringComparison.Ordinal));
                if (selectedIndex < 0)
                    throw new InvalidOperationException(
                        "P18 source node is missing: " + selectedNodeName);
                roots = new[] { selectedIndex };
            }
            var worldMatrices = new Matrix4x4[glb.nodes.Length];
            var worldResolved = new bool[glb.nodes.Length];
            Func<int, Matrix4x4> resolveWorld = null;
            resolveWorld = nodeIndex =>
            {
                if (worldResolved[nodeIndex]) return worldMatrices[nodeIndex];
                var local = GlbNodeLocalMatrix(glb.nodes[nodeIndex]);
                var parent = parentIndices[nodeIndex];
                worldMatrices[nodeIndex] = parent >= 0
                    ? resolveWorld(parent) * local
                    : local;
                worldResolved[nodeIndex] = true;
                return worldMatrices[nodeIndex];
            };
            var includedNodes = new List<int>();
            Action<int> collect = null;
            collect = nodeIndex =>
            {
                if (nodeIndex < 0 || nodeIndex >= glb.nodes.Length) return;
                includedNodes.Add(nodeIndex);
                foreach (var childIndex in glb.nodes[nodeIndex].children ?? Array.Empty<int>())
                    collect(childIndex);
            };
            foreach (var rootIndex in roots) collect(rootIndex);

            var root = new GameObject(Path.GetFileNameWithoutExtension(sourcePath));
            var textureCache = new Dictionary<string, Texture2D>();
            var materialCache = new Dictionary<int, Material>();
            var primitiveSerial = 0;
            foreach (var nodeIndex in includedNodes.Distinct())
            {
                var node = glb.nodes[nodeIndex];
                if (node.mesh < 0 || node.mesh >= glb.meshes.Length) continue;
                var sourceMesh = glb.meshes[node.mesh];
                foreach (var primitive in sourceMesh.primitives ?? Array.Empty<GlbPrimitive>())
                {
                    if (primitive.mode != 4)
                        throw new InvalidOperationException(
                            "P18 portable GLB adapter currently requires triangle primitives.");
                    var primitiveObject = new GameObject(
                        (string.IsNullOrWhiteSpace(node.name)
                            ? sourceMesh.name
                            : node.name)
                        + " primitive "
                        + primitiveSerial.ToString(CultureInfo.InvariantCulture));
                    primitiveSerial += 1;
                    primitiveObject.transform.SetParent(root.transform, false);
                    var filter = primitiveObject.AddComponent<MeshFilter>();
                    filter.sharedMesh = DecodePortableGlbPrimitive(
                        glb,
                        container.binary,
                        primitive,
                        resolveWorld(nodeIndex),
                        primitiveObject.name);
                    var renderer = primitiveObject.AddComponent<MeshRenderer>();
                    if (!materialCache.TryGetValue(primitive.material, out var material))
                    {
                        material = CreatePortableGlbMaterial(
                            glb,
                            container.binary,
                            primitive.material,
                            prop,
                            textureCache);
                        materialCache[primitive.material] = material;
                    }
                    renderer.sharedMaterial = material;
                }
            }
            if (primitiveSerial == 0)
            {
                UnityEngine.Object.DestroyImmediate(root);
                throw new InvalidOperationException(
                    "P18 source GLB selection contains no renderable primitives: "
                    + sourcePath);
            }
            return root;
        }

        private static PortableGlbContainer ReadGlbContainer(byte[] bytes)
        {
            if (!BitConverter.IsLittleEndian)
                throw new InvalidOperationException("The portable GLB adapter requires little endian.");
            var offset = 0;
            if (ReadUInt32Little(bytes, ref offset) != 0x46546c67U
                || ReadUInt32Little(bytes, ref offset) != 2U
                || ReadUInt32Little(bytes, ref offset) != bytes.Length)
            {
                throw new InvalidOperationException("P18 source is not GLB v2.");
            }
            string json = null;
            byte[] binary = null;
            while (offset < bytes.Length)
            {
                var length = checked((int)ReadUInt32Little(bytes, ref offset));
                var type = ReadUInt32Little(bytes, ref offset);
                RequireByteRange(bytes, offset, length, "P18 GLB chunk");
                if (type == 0x4e4f534aU)
                {
                    json = Encoding.UTF8.GetString(bytes, offset, length)
                        .TrimEnd('\0', ' ', '\t', '\r', '\n');
                }
                else if (type == 0x004e4942U)
                {
                    binary = new byte[length];
                    Buffer.BlockCopy(bytes, offset, binary, 0, length);
                }
                offset += length;
            }
            if (json == null || binary == null || json.Contains("\"sparse\""))
                throw new InvalidOperationException("P18 GLB layout is unsupported.");
            var root = JsonUtility.FromJson<GlbRoot>(json);
            if (root == null || root.asset == null
                || !string.Equals(root.asset.version, "2.0", StringComparison.Ordinal))
            {
                throw new InvalidOperationException("P18 GLB metadata is invalid.");
            }
            return new PortableGlbContainer { root = root, binary = binary };
        }

        private static Matrix4x4 GlbNodeLocalMatrix(GlbNode node)
        {
            if (node.matrix != null && node.matrix.Length == 16)
            {
                var matrix = Matrix4x4.zero;
                for (var column = 0; column < 4; column += 1)
                for (var row = 0; row < 4; row += 1)
                    matrix[row, column] = node.matrix[column * 4 + row];
                return matrix;
            }
            var translation = node.translation != null && node.translation.Length >= 3
                ? Vector3From(node.translation)
                : Vector3.zero;
            var rotation = node.rotation != null && node.rotation.Length >= 4
                ? QuaternionFrom(node.rotation)
                : Quaternion.identity;
            var scale = node.scale != null && node.scale.Length >= 3
                ? Vector3From(node.scale)
                : Vector3.one;
            return Matrix4x4.TRS(translation, rotation, scale);
        }

        private static Mesh DecodePortableGlbPrimitive(
            GlbRoot glb,
            byte[] binary,
            GlbPrimitive primitive,
            Matrix4x4 nodeWorld,
            string name)
        {
            if (primitive.attributes == null || primitive.attributes.POSITION < 0)
                throw new InvalidOperationException("P18 GLB primitive has no POSITION.");
            var positions = ReadGlbFloatAccessor(
                glb, binary, primitive.attributes.POSITION, "VEC3");
            var normals = primitive.attributes.NORMAL >= 0
                ? ReadGlbFloatAccessor(
                    glb, binary, primitive.attributes.NORMAL, "VEC3")
                : null;
            var uv0 = primitive.attributes.TEXCOORD_0 >= 0
                ? ReadGlbFloatAccessor(
                    glb, binary, primitive.attributes.TEXCOORD_0, "VEC2")
                : null;
            var sourceIndices = ReadGlbIndicesAny(
                glb,
                binary,
                primitive.indices,
                positions.Length / 3);
            var vertexCount = positions.Length / 3;
            var vertices = new Vector3[vertexCount];
            var meshNormals = normals == null ? null : new Vector3[vertexCount];
            var uvs = uv0 == null ? null : new Vector2[vertexCount];
            var normalMatrix = nodeWorld.inverse.transpose;
            for (var index = 0; index < vertexCount; index += 1)
            {
                var point = nodeWorld.MultiplyPoint3x4(new Vector3(
                    positions[index * 3],
                    positions[index * 3 + 1],
                    positions[index * 3 + 2]));
                vertices[index] = new Vector3(point.x, point.y, -point.z);
                if (meshNormals != null)
                {
                    var normal = normalMatrix.MultiplyVector(new Vector3(
                        normals[index * 3],
                        normals[index * 3 + 1],
                        normals[index * 3 + 2])).normalized;
                    meshNormals[index] = new Vector3(normal.x, normal.y, -normal.z);
                }
                if (uvs != null)
                    uvs[index] = new Vector2(uv0[index * 2], uv0[index * 2 + 1]);
            }
            var indices = new int[sourceIndices.Length];
            for (var triangle = 0; triangle < sourceIndices.Length; triangle += 3)
            {
                indices[triangle] = sourceIndices[triangle];
                indices[triangle + 1] = sourceIndices[triangle + 2];
                indices[triangle + 2] = sourceIndices[triangle + 1];
            }
            var mesh = new Mesh
            {
                name = name,
                indexFormat = vertexCount > ushort.MaxValue
                    ? IndexFormat.UInt32
                    : IndexFormat.UInt16,
            };
            mesh.vertices = vertices;
            if (meshNormals != null) mesh.normals = meshNormals;
            if (uvs != null) mesh.uv = uvs;
            mesh.triangles = indices;
            if (meshNormals == null) mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        private static int[] ReadGlbIndicesAny(
            GlbRoot glb,
            byte[] binary,
            int accessorIndex,
            int vertexCount)
        {
            if (accessorIndex < 0)
                return Enumerable.Range(0, vertexCount).ToArray();
            var accessor = RequireGlbAccessor(glb, accessorIndex);
            if (!string.Equals(accessor.type, "SCALAR", StringComparison.Ordinal))
                throw new InvalidOperationException("P18 index accessor is not scalar.");
            var bytesPerIndex = accessor.componentType == 5125
                ? 4
                : accessor.componentType == 5123
                    ? 2
                    : accessor.componentType == 5121
                        ? 1
                        : 0;
            if (bytesPerIndex == 0)
                throw new InvalidOperationException("P18 index component type is unsupported.");
            var view = RequireGlbBufferView(glb, accessor.bufferView);
            var stride = view.byteStride > 0 ? view.byteStride : bytesPerIndex;
            var start = checked(view.byteOffset + accessor.byteOffset);
            RequireByteRange(
                binary,
                start,
                checked((accessor.count - 1) * stride + bytesPerIndex),
                "P18 GLB index accessor");
            var result = new int[accessor.count];
            for (var index = 0; index < accessor.count; index += 1)
            {
                var address = start + index * stride;
                result[index] = bytesPerIndex == 4
                    ? checked((int)BitConverter.ToUInt32(binary, address))
                    : bytesPerIndex == 2
                        ? BitConverter.ToUInt16(binary, address)
                        : binary[address];
            }
            return result;
        }

        private static Material CreatePortableGlbMaterial(
            GlbRoot glb,
            byte[] binary,
            int materialIndex,
            P18PropContract prop,
            Dictionary<string, Texture2D> textureCache)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
                throw new InvalidOperationException("URP Lit shader was not found.");
            var source = glb.materials != null
                && materialIndex >= 0
                && materialIndex < glb.materials.Length
                ? glb.materials[materialIndex]
                : null;
            var material = new Material(shader)
            {
                name = source?.name ?? ("P18 material " + materialIndex),
            };
            var pbr = source?.pbrMetallicRoughness;
            var color = pbr?.baseColorFactor != null
                && pbr.baseColorFactor.Length >= 4
                ? new Color(
                    pbr.baseColorFactor[0],
                    pbr.baseColorFactor[1],
                    pbr.baseColorFactor[2],
                    pbr.baseColorFactor[3])
                : Color.white;
            var portableOverride = string.Equals(
                source?.name,
                "m_benchA",
                StringComparison.Ordinal)
                ? prop.materialOverrides?.m_benchA
                : null;
            if (portableOverride?.baseColorSrgb != null
                && portableOverride.baseColorSrgb.Length >= 3)
            {
                color = new Color(
                    portableOverride.baseColorSrgb[0],
                    portableOverride.baseColorSrgb[1],
                    portableOverride.baseColorSrgb[2],
                    color.a);
            }
            material.SetColor("_BaseColor", color);
            material.SetFloat("_Metallic", pbr?.metallicFactor ?? 1.0f);
            material.SetFloat("_Smoothness", 1.0f - (pbr?.roughnessFactor ?? 1.0f));
            if (pbr?.baseColorTexture != null && pbr.baseColorTexture.index >= 0)
            {
                material.SetTexture(
                    "_BaseMap",
                    LoadEmbeddedGlbTexture(
                        glb,
                        binary,
                        pbr.baseColorTexture.index,
                        false,
                        textureCache));
                material.SetTextureScale("_BaseMap", new Vector2(1.0f, -1.0f));
                material.SetTextureOffset("_BaseMap", new Vector2(0.0f, 1.0f));
            }
            if (source?.normalTexture != null && source.normalTexture.index >= 0)
            {
                material.SetTexture(
                    "_BumpMap",
                    LoadEmbeddedGlbTexture(
                        glb,
                        binary,
                        source.normalTexture.index,
                        true,
                        textureCache));
                material.SetTextureScale("_BumpMap", new Vector2(1.0f, -1.0f));
                material.SetTextureOffset("_BumpMap", new Vector2(0.0f, 1.0f));
                material.EnableKeyword("_NORMALMAP");
            }
            if (source?.emissiveTexture != null && source.emissiveTexture.index >= 0)
            {
                material.SetTexture(
                    "_EmissionMap",
                    LoadEmbeddedGlbTexture(
                        glb,
                        binary,
                        source.emissiveTexture.index,
                        false,
                        textureCache));
                material.SetTextureScale("_EmissionMap", new Vector2(1.0f, -1.0f));
                material.SetTextureOffset("_EmissionMap", new Vector2(0.0f, 1.0f));
                var emissive = source.emissiveFactor != null
                    && source.emissiveFactor.Length >= 3
                    ? new Color(
                        source.emissiveFactor[0],
                        source.emissiveFactor[1],
                        source.emissiveFactor[2],
                        1.0f)
                    : Color.white;
                material.SetColor("_EmissionColor", emissive);
                material.EnableKeyword("_EMISSION");
            }
            if (source?.doubleSided == true)
                material.SetFloat("_Cull", (float)CullMode.Off);
            if (string.Equals(source?.alphaMode, "MASK", StringComparison.Ordinal))
            {
                material.SetFloat("_AlphaClip", 1.0f);
                material.SetFloat("_Cutoff", source.alphaCutoff > 0.0f
                    ? source.alphaCutoff
                    : 0.5f);
                material.EnableKeyword("_ALPHATEST_ON");
                material.renderQueue = (int)RenderQueue.AlphaTest;
            }
            else if (string.Equals(source?.alphaMode, "BLEND", StringComparison.Ordinal))
            {
                material.SetFloat("_Surface", 1.0f);
                material.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
                material.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
                material.SetFloat("_ZWrite", 0.0f);
                material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                material.renderQueue = (int)RenderQueue.Transparent;
            }
            return material;
        }

        private static Texture2D LoadEmbeddedGlbTexture(
            GlbRoot glb,
            byte[] binary,
            int textureIndex,
            bool linear,
            Dictionary<string, Texture2D> cache)
        {
            if (glb.textures == null
                || textureIndex < 0
                || textureIndex >= glb.textures.Length)
                throw new InvalidOperationException("P18 GLB texture index is invalid.");
            var imageIndex = glb.textures[textureIndex].source;
            if (glb.images == null || imageIndex < 0 || imageIndex >= glb.images.Length)
                throw new InvalidOperationException("P18 GLB image index is invalid.");
            var key = imageIndex + ":" + (linear ? "linear" : "srgb");
            if (cache.TryGetValue(key, out var cached)) return cached;
            var image = glb.images[imageIndex];
            var view = RequireGlbBufferView(glb, image.bufferView);
            RequireByteRange(binary, view.byteOffset, view.byteLength, "P18 embedded image");
            var bytes = new byte[view.byteLength];
            Buffer.BlockCopy(binary, view.byteOffset, bytes, 0, view.byteLength);
            var texture = new Texture2D(2, 2, TextureFormat.RGBA32, true, linear)
            {
                name = image.name ?? ("P18 image " + imageIndex),
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Bilinear,
            };
            if (!ImageConversion.LoadImage(texture, bytes, false))
                throw new InvalidOperationException("Unity could not decode P18 embedded image.");
            cache[key] = texture;
            return texture;
        }

        private static Bounds CombinedRendererBounds(GameObject root)
        {
            var renderers = root.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0)
                throw new InvalidOperationException(
                    "Camera focus object has no renderers: " + root.name);
            var bounds = renderers[0].bounds;
            for (var index = 1; index < renderers.Length; index += 1)
                bounds.Encapsulate(renderers[index].bounds);
            return bounds;
        }

        private static void ConfigureEnvironmentGroundMaterial(
            Material material,
            float[] groundSize)
        {
            var layer = AssetDatabase.LoadAssetAtPath<TerrainLayer>(
                EnvironmentGroundLayerPath);
            if (layer == null)
                throw new InvalidOperationException(
                    "Source terrain layer was not found: " + EnvironmentGroundLayerPath);
            if (layer.diffuseTexture != null)
            {
                material.SetTexture("_BaseMap", layer.diffuseTexture);
                var tileSizeX = Mathf.Max(layer.tileSize.x, 0.0001f);
                var tileSizeY = Mathf.Max(layer.tileSize.y, 0.0001f);
                material.SetTextureScale(
                    "_BaseMap",
                    new Vector2(groundSize[0] / tileSizeX, groundSize[1] / tileSizeY));
                material.SetTextureOffset("_BaseMap", layer.tileOffset);
            }
            if (layer.normalMapTexture != null)
                material.SetTexture("_BumpMap", layer.normalMapTexture);
            material.SetFloat("_Metallic", layer.metallic);
            material.SetFloat("_Smoothness", layer.smoothness);
        }

        private static void EnsureAssetFolder(string assetFolder)
        {
            if (string.IsNullOrWhiteSpace(assetFolder) || assetFolder == "Assets") return;
            if (!assetFolder.StartsWith("Assets/", StringComparison.Ordinal))
                throw new ArgumentException("Asset folder must be under Assets/: " + assetFolder);

            var current = "Assets";
            foreach (var segment in assetFolder.Substring("Assets/".Length)
                .Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var next = current + "/" + segment;
                if (!AssetDatabase.IsValidFolder(next))
                    AssetDatabase.CreateFolder(current, segment);
                current = next;
            }
        }

        /// <summary>
        /// Installs the P03 source SkyLight as Unity's native L2 ambient probe.
        ///
        /// The source arrays are raw radiance SH in Three's normalized real-SH
        /// convention. Unity's SphericalHarmonicsL2 stores the already
        /// cosine-convolved irradiance as polynomial coefficients:
        ///
        ///   L(n) = u0 + u3*x + u1*y + u2*z + u4*x*y + u5*y*z
        ///          + u6*(3*z*z - 1) + u7*x*z + u8*(x*x - y*y).
        ///
        /// Three evaluates the same irradiance with constants 0.886227,
        /// 1.023328, 0.858086, 0.743125/0.247708, and 0.429043. The adapter
        /// below expands that expression into Unity's polynomial storage after
        /// reflecting Three Z into Unity Z. No Trilight approximation or
        /// hand-picked colors participate in this path.
        /// </summary>
        private static SkyLightReport ConfigureSourceSkyLight(ParityContract contract)
        {
            if (contract.skyLight == null) return null;

            var source = contract.skyLight;
            var report = new SkyLightReport
            {
                requested = true,
                mode = source.mode,
                sourceApi = source.sourceApi,
                sourceBasis = source.basis,
                coordinateTransform = source.coordinateTransform,
                unityBasis =
                    "u0 + u3*x + u1*y + u2*z + u4*x*y + u5*y*z + " +
                    "u6*(3*z*z-1) + u7*x*z + u8*(x*x-y*y)",
                adapter =
                    "Three radiance SH -> cosine-convolved irradiance -> " +
                    "Three Z reflection -> Unity SphericalHarmonicsL2 polynomial",
                tolerance = 0.00005f,
                sourcePairTolerance = 0.000000001f,
                intensity = source.intensity,
                nonnegativeDiffuseClamp = source.nonnegativeDiffuseClamp,
            };

            try
            {
                if (!string.Equals(
                    source.mode,
                    "ue-native-captured-scene-diffuse-sh",
                    StringComparison.Ordinal))
                {
                    throw new InvalidOperationException(
                        "Unsupported SkyLight mode: " + source.mode);
                }
                if (!source.nonnegativeDiffuseClamp)
                {
                    throw new InvalidOperationException(
                        "P03 requires the source max(0, diffuse SH) clamp.");
                }
                ValidateCoefficientMatrix(source.threeCoefficients, "threeCoefficients");
                ValidateCoefficientMatrix(source.unrealCoefficients, "unrealCoefficients");
                var expectedThree = TransformUnrealShToThree(source.unrealCoefficients);
                report.sourceCoefficientPairMaxError = (float)CoefficientMaximumError(
                    expectedThree,
                    source.threeCoefficients);
                report.sourceCoefficientPairPass =
                    report.sourceCoefficientPairMaxError <= report.sourcePairTolerance;
                if (!report.sourceCoefficientPairPass)
                {
                    throw new InvalidOperationException(
                        "contract.skyLight unreal/three coefficient transforms disagree");
                }

                var tint = Srgb8ToLinear(source.colorSrgb8);
                report.tintLinear = Channels(tint);
                var skyIrradianceMultiplier = contract.engineAdapters?.unity == null
                    ? 1.0f
                    : contract.engineAdapters.unity.diffuseSkyIrradianceMultiplier;
                var unityCoefficients = AdaptThreeRadianceShToUnityIrradiance(
                    source.threeCoefficients,
                    tint,
                    source.intensity * skyIrradianceMultiplier);
                report.rendererIrradianceMultiplier = skyIrradianceMultiplier;
                report.sourceThreeCoefficients = Flatten(source.threeCoefficients);
                report.sourceUnrealCoefficients = Flatten(source.unrealCoefficients);
                report.adaptedUnityCoefficients = Flatten(unityCoefficients);

                var probe = new SphericalHarmonicsL2();
                for (var coefficient = 0; coefficient < 9; coefficient += 1)
                for (var channel = 0; channel < 3; channel += 1)
                    probe[channel, coefficient] = (float)unityCoefficients[coefficient][channel];

                var normals = OracleNormals();
                var unityApiResults = new Color[normals.Length];
                probe.Evaluate(normals, unityApiResults);
                var oracleRecords = new SkyLightOracleProbe[normals.Length];
                var cpuMaximumError = 0.0;
                var unityApiMaximumError = 0.0;
                for (var index = 0; index < normals.Length; index += 1)
                {
                    var unityNormal = normals[index];
                    var threeNormal = new Vector3(
                        unityNormal.x,
                        unityNormal.y,
                        -unityNormal.z);
                    var sourceIrradiance = EvaluateThreeIrradiance(
                        source.threeCoefficients,
                        threeNormal);
                    var expected = MultiplyChannels(
                        sourceIrradiance,
                        tint,
                        source.intensity * skyIrradianceMultiplier);
                    var cpu = EvaluateUnityIrradiance(unityCoefficients, unityNormal);
                    var api = new[]
                    {
                        (double)unityApiResults[index].r,
                        (double)unityApiResults[index].g,
                        (double)unityApiResults[index].b,
                    };
                    cpuMaximumError = Math.Max(
                        cpuMaximumError,
                        ChannelMaximumError(expected, cpu));
                    unityApiMaximumError = Math.Max(
                        unityApiMaximumError,
                        ChannelMaximumError(expected, api));
                    oracleRecords[index] = new SkyLightOracleProbe
                    {
                        normalUnity = Channels(unityNormal),
                        normalThree = Channels(threeNormal),
                        sourceIrradianceBeforeClamp = ToFloat(expected),
                        sourceIrradianceAfterClamp = ToFloat(ClampNonnegative(expected)),
                        unityCpuBeforeClamp = ToFloat(cpu),
                        unityApiBeforeClamp = ToFloat(api),
                        unityApiAfterUrpClamp = ToFloat(ClampNonnegative(api)),
                    };
                }
                report.cpuOracleMaximumError = (float)cpuMaximumError;
                report.unityApiMaximumError = (float)unityApiMaximumError;
                report.cpuOraclePass = cpuMaximumError <= report.tolerance;
                report.unityApiPass = unityApiMaximumError <= report.tolerance;
                report.oracleProbes = oracleRecords;
                if (!report.cpuOraclePass || !report.unityApiPass)
                {
                    throw new InvalidOperationException(
                        "Unity SphericalHarmonicsL2 evaluation did not match the source CPU oracle");
                }

                RenderSettings.ambientMode = AmbientMode.Custom;
                RenderSettings.ambientLight = Color.black;
                RenderSettings.ambientIntensity = 1.0f;
                RenderSettings.ambientProbe = probe;
                var installed = RenderSettings.ambientProbe;
                var installedMaximumError = 0.0;
                for (var coefficient = 0; coefficient < 9; coefficient += 1)
                for (var channel = 0; channel < 3; channel += 1)
                {
                    installedMaximumError = Math.Max(
                        installedMaximumError,
                        Math.Abs(
                            installed[channel, coefficient]
                            - probe[channel, coefficient]));
                }
                report.installedCoefficientMaximumError = (float)installedMaximumError;
                report.installedProbePass =
                    RenderSettings.ambientMode == AmbientMode.Custom
                    && installedMaximumError <= report.tolerance;
                if (!report.installedProbePass)
                {
                    throw new InvalidOperationException(
                        "Unity did not retain the exact custom ambient probe coefficients");
                }

                report.captureAllowed = true;
                report.status = "validated-and-installed";
                report.failureReason = null;
            }
            catch (Exception error)
            {
                report.captureAllowed = false;
                report.status = "blocked";
                report.failureReason = error.Message;
            }
            return report;
        }

        private static double[][] TransformUnrealShToThree(double[][] source)
        {
            const double sqrtThreeOverTwo = 0.86602540378443864676;
            var result = EmptyCoefficientMatrix();
            for (var channel = 0; channel < 3; channel += 1)
            {
                result[0][channel] = source[0][channel];
                result[1][channel] = source[2][channel];
                result[2][channel] = source[1][channel];
                result[3][channel] = -source[3][channel];
                result[4][channel] = -source[7][channel];
                result[5][channel] = source[5][channel];
                result[6][channel] =
                    -0.5 * source[6][channel]
                    - sqrtThreeOverTwo * source[8][channel];
                result[7][channel] = -source[4][channel];
                result[8][channel] =
                    -sqrtThreeOverTwo * source[6][channel]
                    + 0.5 * source[8][channel];
            }
            return result;
        }

        private static double[][] AdaptThreeRadianceShToUnityIrradiance(
            double[][] source,
            Color tintLinear,
            double intensity)
        {
            const double band0 = 0.886227;
            const double band1 = 2.0 * 0.511664;
            const double band2Cross = 2.0 * 0.429043;
            const double band2ZSquared = 0.743125;
            const double band2ZConstant = 0.247708;
            const double band2Difference = 0.429043;
            var result = EmptyCoefficientMatrix();
            var tint = new[]
            {
                (double)tintLinear.r,
                (double)tintLinear.g,
                (double)tintLinear.b,
            };
            for (var channel = 0; channel < 3; channel += 1)
            {
                var scale = tint[channel] * intensity;
                var zQuadratic = source[6][channel] * band2ZSquared / 3.0;
                // Three rounds the z^2 and constant factors independently.
                // Move their tiny difference into Unity's constant term so
                // the two documented polynomials remain algebraically equal.
                result[0][channel] = scale * (
                    source[0][channel] * band0
                    + source[6][channel] * (
                        band2ZSquared / 3.0 - band2ZConstant));
                result[1][channel] = scale * source[1][channel] * band1;
                result[2][channel] = scale * -source[2][channel] * band1;
                result[3][channel] = scale * source[3][channel] * band1;
                result[4][channel] = scale * source[4][channel] * band2Cross;
                result[5][channel] = scale * -source[5][channel] * band2Cross;
                result[6][channel] = scale * zQuadratic;
                result[7][channel] = scale * -source[7][channel] * band2Cross;
                result[8][channel] = scale * source[8][channel] * band2Difference;
            }
            return result;
        }

        private static double[] EvaluateThreeIrradiance(
            double[][] coefficients,
            Vector3 normal)
        {
            const double band0 = 0.886227;
            const double band1 = 2.0 * 0.511664;
            const double band2Cross = 2.0 * 0.429043;
            const double band2ZSquared = 0.743125;
            const double band2ZConstant = 0.247708;
            const double band2Difference = 0.429043;
            var x = (double)normal.x;
            var y = (double)normal.y;
            var z = (double)normal.z;
            var result = new double[3];
            for (var channel = 0; channel < 3; channel += 1)
            {
                result[channel] =
                    coefficients[0][channel] * band0
                    + coefficients[1][channel] * band1 * y
                    + coefficients[2][channel] * band1 * z
                    + coefficients[3][channel] * band1 * x
                    + coefficients[4][channel] * band2Cross * x * y
                    + coefficients[5][channel] * band2Cross * y * z
                    + coefficients[6][channel]
                        * (band2ZSquared * z * z - band2ZConstant)
                    + coefficients[7][channel] * band2Cross * x * z
                    + coefficients[8][channel] * band2Difference * (x * x - y * y);
            }
            return result;
        }

        private static double[] EvaluateUnityIrradiance(
            double[][] coefficients,
            Vector3 normal)
        {
            var x = (double)normal.x;
            var y = (double)normal.y;
            var z = (double)normal.z;
            var result = new double[3];
            for (var channel = 0; channel < 3; channel += 1)
            {
                result[channel] =
                    coefficients[0][channel]
                    + coefficients[3][channel] * x
                    + coefficients[1][channel] * y
                    + coefficients[2][channel] * z
                    + coefficients[4][channel] * x * y
                    + coefficients[5][channel] * y * z
                    + coefficients[6][channel] * (3.0 * z * z - 1.0)
                    + coefficients[7][channel] * x * z
                    + coefficients[8][channel] * (x * x - y * y);
            }
            return result;
        }

        private static Vector3[] OracleNormals()
        {
            return new[]
            {
                Vector3.right,
                Vector3.left,
                Vector3.up,
                Vector3.down,
                Vector3.forward,
                Vector3.back,
                new Vector3(1, 1, 1).normalized,
                new Vector3(1, 1, -1).normalized,
                new Vector3(1, -1, 1).normalized,
                new Vector3(-1, 1, 1).normalized,
                new Vector3(-1, -1, 1).normalized,
                new Vector3(-1, 1, -1).normalized,
            };
        }

        private static Color Srgb8ToLinear(float[] values)
        {
            if (values == null || values.Length < 3)
                throw new InvalidOperationException("SkyLight colorSrgb8 requires RGB channels.");
            return new Color(
                SrgbToLinear(values[0] / 255.0f),
                SrgbToLinear(values[1] / 255.0f),
                SrgbToLinear(values[2] / 255.0f),
                1.0f);
        }

        private static float SrgbToLinear(float value)
        {
            value = Mathf.Clamp01(value);
            return value <= 0.04045f
                ? value / 12.92f
                : Mathf.Pow((value + 0.055f) / 1.055f, 2.4f);
        }

        private static double[][] EmptyCoefficientMatrix()
        {
            return Enumerable.Range(0, 9)
                .Select(_index => new double[3])
                .ToArray();
        }

        private static void ValidateCoefficientMatrix(double[][] values, string label)
        {
            if (values == null || values.Length != 9)
                throw new InvalidOperationException(label + " must contain nine coefficients.");
            for (var coefficient = 0; coefficient < values.Length; coefficient += 1)
            {
                if (values[coefficient] == null || values[coefficient].Length != 3)
                {
                    throw new InvalidOperationException(
                        label + " coefficient " + coefficient + " must contain RGB.");
                }
                if (values[coefficient].Any(value => double.IsNaN(value) || double.IsInfinity(value)))
                {
                    throw new InvalidOperationException(
                        label + " coefficient " + coefficient + " is not finite.");
                }
            }
        }

        private static double CoefficientMaximumError(double[][] left, double[][] right)
        {
            var maximum = 0.0;
            for (var coefficient = 0; coefficient < 9; coefficient += 1)
            for (var channel = 0; channel < 3; channel += 1)
            {
                maximum = Math.Max(
                    maximum,
                    Math.Abs(left[coefficient][channel] - right[coefficient][channel]));
            }
            return maximum;
        }

        private static double ChannelMaximumError(double[] left, double[] right)
        {
            var maximum = 0.0;
            for (var channel = 0; channel < 3; channel += 1)
                maximum = Math.Max(maximum, Math.Abs(left[channel] - right[channel]));
            return maximum;
        }

        private static double[] MultiplyChannels(double[] value, Color color, double intensity)
        {
            return new[]
            {
                value[0] * color.r * intensity,
                value[1] * color.g * intensity,
                value[2] * color.b * intensity,
            };
        }

        private static double[] ClampNonnegative(double[] value)
        {
            return value.Select(channel => Math.Max(0.0, channel)).ToArray();
        }

        private static float[] Flatten(double[][] values)
        {
            return values.SelectMany(value => value).Select(channel => (float)channel).ToArray();
        }

        private static float[] ToFloat(double[] values)
        {
            return values.Select(value => (float)value).ToArray();
        }

        /// <summary>
        /// Adds only P04's visible Classic Day dome. The stored P03 diffuse SH
        /// remains authoritative: this path never assigns RenderSettings.skybox,
        /// requests a GI update, creates a reflection cubemap, or changes the
        /// ambient probe. The exact contract GLB and Unreal-exported RGBA16F EXR
        /// are decoded directly by this capture rig and validated before use.
        /// </summary>
        private static void ConfigureSourceHeightFog(
            Material material,
            HeightFogContract source)
        {
            var enabled = source != null && source.enabled;
            material.SetFloat("_FogEnabled", enabled ? 1.0f : 0.0f);
            if (!enabled) return;
            if (source.volumetricFog)
            {
                throw new InvalidOperationException(
                    "The P13 parity adapter supports only source non-volumetric height fog.");
            }
            if (source.inscatteringColorLinear == null
                || source.inscatteringColorLinear.Length != 4)
            {
                throw new InvalidOperationException(
                    "The source height-fog color must contain four linear channels.");
            }
            var fogColorLinear = new Color(
                source.inscatteringColorLinear[0],
                source.inscatteringColorLinear[1],
                source.inscatteringColorLinear[2],
                source.inscatteringColorLinear[3]);
            // ShaderLab Color properties are sRGB-authored in a Linear project
            // and are converted on upload. The contract tuple is already
            // linear, so encode it once here to avoid an accidental second
            // sRGB-to-linear conversion inside Unity.
            material.SetColor("_FogColor", fogColorLinear.gamma);
            material.SetFloat("_FogDensity", source.density);
            material.SetFloat("_FogHeightFalloff", source.heightFalloff);
            material.SetFloat("_FogHeightCm", source.heightCentimeters);
            material.SetFloat("_FogStartDistanceMeters", source.startDistance / 100.0f);
            material.SetFloat("_FogMaxOpacity", source.maxOpacity);
        }

        private static VisibleSkySetup ConfigureVisibleSky(
            ParityContract contract,
            string contractPath,
            Camera camera,
            string sceneAssetPath)
        {
            if (contract.sky == null || !contract.sky.visible) return null;

            var source = contract.sky;
            var setup = new VisibleSkySetup
            {
                report = new VisibleSkyReport
                {
                    requested = true,
                    mode = source.mode,
                    sourceMesh = source.sourceMesh,
                    sourceMaterial = source.material,
                    curve = source.curve,
                    curveTime = source.curveTime,
                    sampleU = source.sampleU,
                    sampleV = source.sampleV,
                    exrSampleV = source.toonlabExrSampleV,
                    exrStorageRow = source.toonlabExrStorageRow,
                    unityExrSampleV = source.unityExrSampleV,
                    unityRawStorageRow = source.unityRawStorageRow,
                    unityExrRowOriginAdapter = source.unityExrRowOriginAdapter,
                    filter = source.filter,
                    address = source.address,
                    brightness = source.brightness,
                    saturation = source.saturation,
                    backgroundClouds = source.backgroundClouds,
                    cloudShell = source.cloudShell,
                    ueGltfBasisYawDegrees = source.unityUeGltfBasisYawDegrees,
                    lightingParticipation = source.lightingParticipation,
                    adapter =
                        "exact UE GLB reflected into Unity Z; shared sky root uses the " +
                        "contract's handedness-adjusted UE GLTF yaw; the dome retains " +
                        "its authored component scale and glTF meter conversion; exact EXR atlas sampled " +
                        "with authored 1-uv0.y; Unity raw row 0 remains source " +
                        "curve row 0 while Three uses the reflected EXR row adapter",
                    textureSampleTolerance = 0.00005f,
                    lightingIsolationTolerance = 0.0f,
                },
            };

            var ambientBefore = RenderSettings.ambientProbe;
            var ambientModeBefore = RenderSettings.ambientMode;
            var ambientIntensityBefore = RenderSettings.ambientIntensity;
            var ambientColorBefore = RenderSettings.ambientLight;
            var reflectionIntensityBefore = RenderSettings.reflectionIntensity;
            var reflectionTextureBefore = RenderSettings.customReflectionTexture;
            var skyboxBefore = RenderSettings.skybox;
            try
            {
                ValidateVisibleSkyContract(source);
                var meshFile = ResolveContractAssetPath(contractPath, source.mesh);
                var atlasFile = ResolveContractAssetPath(contractPath, source.atlas);
                var meshBytes = File.ReadAllBytes(meshFile);
                var atlasBytes = File.ReadAllBytes(atlasFile);
                setup.report.meshPath = meshFile;
                setup.report.atlasPath = atlasFile;
                setup.report.expectedMeshSha256 = VisibleSkyMeshSha256;
                setup.report.meshSha256 = Sha256Hex(meshBytes);
                setup.report.meshSha256Pass = string.Equals(
                    setup.report.meshSha256,
                    VisibleSkyMeshSha256,
                    StringComparison.OrdinalIgnoreCase);
                if (!setup.report.meshSha256Pass)
                {
                    throw new InvalidOperationException(
                        "Visual Target SM_StylizedSkyDome GLB SHA-256 changed.");
                }
                setup.report.expectedAtlasSha256 = source.atlasSha256;
                setup.report.actualAtlasSha256 = Sha256Hex(atlasBytes);
                setup.report.atlasSha256Pass = string.Equals(
                    setup.report.actualAtlasSha256,
                    source.atlasSha256,
                    StringComparison.OrdinalIgnoreCase);
                if (!setup.report.atlasSha256Pass)
                {
                    throw new InvalidOperationException(
                        "Visual Target Atlas_Sky EXR SHA-256 does not match the contract.");
                }

                var atlas = DecodeExactExrAtlas(atlasBytes, source, setup.report);
                ValidateTextureSampling(atlas, source, setup.report);
                var mesh = DecodeExactSkyGlb(meshBytes, setup.report);
                Texture2D backgroundClouds = null;
                if (source.backgroundClouds)
                {
                    var backgroundFile = ResolveContractAssetPath(
                        contractPath,
                        source.backgroundCloudTexture);
                    var backgroundBytes = File.ReadAllBytes(backgroundFile);
                    if (!string.Equals(
                        Sha256Hex(backgroundBytes),
                        source.backgroundCloudTextureSha256,
                        StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidOperationException(
                            "T_BackroundClouds1A SHA-256 does not match the P13 contract.");
                    }
                    backgroundClouds = DecodeExactPngTexture(
                        backgroundBytes,
                        "Exact UE T_BackroundClouds1A",
                        source.backgroundCloudTextureDimensions,
                        TextureWrapMode.Repeat);
                }

                var shader = ResolveVisibleSkyShader(setup.report);
                if (!string.IsNullOrWhiteSpace(sceneAssetPath))
                {
                    EnsureAssetFolder(VisibleSkyAssetFolder);
                    mesh = PersistAsset(mesh, VisibleSkyMeshPath);
                    atlas = PersistAsset(atlas, VisibleSkyTexturePath);
                    if (backgroundClouds != null)
                        backgroundClouds = PersistAsset(
                            backgroundClouds,
                            VisibleSkyBackgroundCloudTexturePath);
                    ValidateTextureRawRoundTrip(atlas, setup.report.atlasRgbaHalfBytes);
                }

                var material = new Material(shader)
                {
                    name = source.backgroundClouds
                        ? "Visual Target MI_StylizedSky_Lite - Classic Day + exact background clouds"
                        : "Visual Target MI_StylizedSky_Lite - Classic Day, no clouds",
                    renderQueue = (int)RenderQueue.Background,
                };
                material.SetTexture("_Atlas", atlas);
                material.SetFloat("_AtlasWidth", source.atlasWidth);
                material.SetFloat("_AtlasHeight", source.atlasHeight);
                material.SetFloat("_CurveRow", source.curveRow);
                material.SetFloat("_Brightness", source.brightness);
                ConfigureSourceHeightFog(material, source.heightFog);
                if (backgroundClouds != null)
                {
                    material.SetTexture("_BackgroundClouds", backgroundClouds);
                    material.SetColor(
                        "_BackgroundCloudTint",
                        new Color(
                            source.backgroundCloudTint[0],
                            source.backgroundCloudTint[1],
                            source.backgroundCloudTint[2],
                            source.backgroundCloudTint[3]));
                    material.SetFloat(
                        "_BackgroundCloudStrength",
                        source.backgroundCloudStrength);
                    material.SetFloat(
                        "_BackgroundCloudVerticalOffset",
                        source.backgroundCloudVerticalOffset);
                    material.SetFloat(
                        "_BackgroundCloudVerticalStretch",
                        source.backgroundCloudVerticalStretch);
                }
                if (!string.IsNullOrWhiteSpace(sceneAssetPath))
                    material = PersistAsset(material, VisibleSkyMaterialPath);

                var root = new GameObject(source.cloudShell
                    ? "Visual Target Classic Day sky + exact cloud shell"
                    : "Visual Target Classic Day sky");
                root.transform.position = Vector3.zero;
                root.transform.rotation = Quaternion.Euler(
                    0.0f,
                    source.unityUeGltfBasisYawDegrees,
                    0.0f);
                var skyObject = new GameObject("Visual Target Classic Day dome");
                skyObject.transform.SetParent(root.transform, false);
                var filter = skyObject.AddComponent<MeshFilter>();
                filter.sharedMesh = mesh;
                var renderer = skyObject.AddComponent<MeshRenderer>();
                renderer.sharedMaterial = material;
                renderer.shadowCastingMode = ShadowCastingMode.Off;
                renderer.receiveShadows = false;
                renderer.lightProbeUsage = LightProbeUsage.Off;
                renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
                renderer.allowOcclusionWhenDynamic = false;
                var sourceRadius = mesh.bounds.extents.magnitude;
                if (!(sourceRadius > 0.0f) || float.IsNaN(sourceRadius))
                    throw new InvalidOperationException("The exact source sky dome has no finite bounds.");
                if (source.skySourceComponentScale == null
                    || source.skySourceComponentScale.Length != 3)
                {
                    throw new InvalidOperationException(
                        "The source sky component scale must contain three channels.");
                }
                var uniformScale = source.skySourceComponentScale[0]
                    * source.skySourceUnitsToMeters;
                var targetRadius = sourceRadius * uniformScale;
                if (!(targetRadius < camera.farClipPlane))
                {
                    throw new InvalidOperationException(
                        "The authored sky dome is clipped by Unity's parity far plane.");
                }
                skyObject.transform.localScale = Vector3.one * uniformScale;
                setup.report.sourceDomeRadius = sourceRadius;
                setup.report.targetDomeRadius = targetRadius;
                setup.report.uniformScale = uniformScale;
                setup.report.worldPosition = Channels(root.transform.position);
                setup.report.castShadows = false;
                setup.report.receiveShadows = false;
                setup.report.lightProbeUsage = renderer.lightProbeUsage.ToString();
                setup.report.reflectionProbeUsage = renderer.reflectionProbeUsage.ToString();
                setup.root = root;
                setup.renderer = renderer;
                var installedRenderers = new List<MeshRenderer> { renderer };

                if (source.cloudShell)
                {
                    var cloudMeshFile = ResolveContractAssetPath(contractPath, source.cloudShellMesh);
                    var cloudTextureFile = ResolveContractAssetPath(contractPath, source.cloudShellTexture);
                    var cloudAtlasFile = ResolveContractAssetPath(contractPath, source.cloudShellAtlas);
                    var cloudNoiseFile = ResolveContractAssetPath(
                        contractPath,
                        source.cloudShellDitherNoiseTexture);
                    var cloudMeshBytes = File.ReadAllBytes(cloudMeshFile);
                    var cloudTextureBytes = File.ReadAllBytes(cloudTextureFile);
                    var cloudAtlasBytes = File.ReadAllBytes(cloudAtlasFile);
                    var cloudNoiseBytes = File.ReadAllBytes(cloudNoiseFile);
                    ValidateSha256(cloudMeshBytes, source.cloudShellMeshSha256, "cloud shell mesh");
                    ValidateSha256(cloudTextureBytes, source.cloudShellTextureSha256, "cloud layer");
                    ValidateSha256(cloudAtlasBytes, source.cloudShellAtlasSha256, "cloud atlas");
                    ValidateSha256(
                        cloudNoiseBytes,
                        source.cloudShellDitherNoiseTextureSha256,
                        "cloud dither noise");
                    var cloudReport = new VisibleSkyReport();
                    var cloudMesh = DecodeExactSkyGlb(cloudMeshBytes, cloudReport);
                    cloudMesh.name = "Exact UE SM_StylizedSkyDome_Clouds";
                    var cloudTexture = DecodeExactPngTexture(
                        cloudTextureBytes,
                        "Exact UE T_CloudLayer03",
                        source.cloudShellTextureDimensions,
                        TextureWrapMode.Repeat);
                    var cloudNoise = DecodeExactPngTexture(
                        cloudNoiseBytes,
                        "Exact UE Good64x64TilingNoiseHighFreq",
                        new[] { 64, 64 },
                        TextureWrapMode.Repeat);
                    var cloudAtlasContract = new SkyContract
                    {
                        atlasWidth = source.cloudShellAtlasWidth,
                        atlasHeight = source.cloudShellAtlasHeight,
                        unityRawStorageRow = source.cloudShellCurveRow,
                    };
                    var cloudAtlasReport = new VisibleSkyReport();
                    var cloudAtlas = DecodeExactExrAtlas(
                        cloudAtlasBytes,
                        cloudAtlasContract,
                        cloudAtlasReport,
                        false);
                    cloudAtlas.name = "Exact UE Atlas_Clouds RGBA16F";
                    if (!string.IsNullOrWhiteSpace(sceneAssetPath))
                    {
                        cloudMesh = PersistAsset(cloudMesh, CloudShellMeshPath);
                        cloudTexture = PersistAsset(cloudTexture, CloudShellTexturePath);
                        cloudAtlas = PersistAsset(cloudAtlas, CloudShellAtlasPath);
                        cloudNoise = PersistAsset(cloudNoise, CloudShellNoisePath);
                    }
                    var cloudMaterial = new Material(ResolveCloudShellShader())
                    {
                        name = "Visual Target MI_StylizedClouds_Lite - Classic Day",
                        renderQueue = (int)RenderQueue.Background + 1,
                    };
                    cloudMaterial.SetTexture("_CloudLayer", cloudTexture);
                    cloudMaterial.SetTexture("_CloudAtlas", cloudAtlas);
                    cloudMaterial.SetTexture("_DitherNoise", cloudNoise);
                    cloudMaterial.SetFloat("_AtlasWidth", source.cloudShellAtlasWidth);
                    cloudMaterial.SetFloat("_AtlasHeight", source.cloudShellAtlasHeight);
                    cloudMaterial.SetFloat("_CurveRow", source.cloudShellCurveRow);
                    cloudMaterial.SetFloat("_RotationSpeed", source.cloudShellRotationSpeed);
                    cloudMaterial.SetFloat("_DeterministicTime", source.cloudShellDeterministicTime);
                    cloudMaterial.SetFloat("_Strength", source.cloudShellStrength);
                    cloudMaterial.SetFloat("_VerticalOffset", source.cloudShellVerticalOffset);
                    cloudMaterial.SetFloat("_VerticalStretch", source.cloudShellVerticalStretch);
                    cloudMaterial.SetFloat("_AlphaClip", source.cloudShellAlphaClip);
                    ConfigureSourceHeightFog(cloudMaterial, source.heightFog);
                    if (!string.IsNullOrWhiteSpace(sceneAssetPath))
                        cloudMaterial = PersistAsset(cloudMaterial, CloudShellMaterialPath);
                    var cloudObject = new GameObject("Visual Target SM_StylizedSkyDome_Clouds");
                    cloudObject.transform.SetParent(root.transform, false);
                    var cloudFilter = cloudObject.AddComponent<MeshFilter>();
                    cloudFilter.sharedMesh = cloudMesh;
                    var cloudRenderer = cloudObject.AddComponent<MeshRenderer>();
                    cloudRenderer.sharedMaterial = cloudMaterial;
                    cloudRenderer.shadowCastingMode = ShadowCastingMode.Off;
                    cloudRenderer.receiveShadows = false;
                    cloudRenderer.lightProbeUsage = LightProbeUsage.Off;
                    cloudRenderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
                    cloudRenderer.allowOcclusionWhenDynamic = false;
                    cloudObject.transform.localScale = Vector3.one
                        * source.cloudShellGltfUnitsToMeters
                        * source.cloudShellSourceComponentScale[0];
                    installedRenderers.Add(cloudRenderer);
                }
                setup.renderers = installedRenderers.ToArray();

                setup.report.ambientProbeMaximumError = SphericalHarmonicsMaximumError(
                    ambientBefore,
                    RenderSettings.ambientProbe);
                setup.report.ambientStateUnchanged =
                    RenderSettings.ambientMode == ambientModeBefore
                    && RenderSettings.ambientIntensity == ambientIntensityBefore
                    && RenderSettings.ambientLight == ambientColorBefore
                    && setup.report.ambientProbeMaximumError
                        <= setup.report.lightingIsolationTolerance;
                setup.report.reflectionStateUnchanged =
                    RenderSettings.reflectionIntensity == reflectionIntensityBefore
                    && ReferenceEquals(
                        RenderSettings.customReflectionTexture,
                        reflectionTextureBefore);
                setup.report.skyboxStateUnchanged = ReferenceEquals(
                    RenderSettings.skybox,
                    skyboxBefore);
                setup.report.lightingIsolationPass =
                    setup.report.ambientStateUnchanged
                    && setup.report.reflectionStateUnchanged
                    && setup.report.skyboxStateUnchanged;
                if (!setup.report.lightingIsolationPass)
                {
                    throw new InvalidOperationException(
                        "P04 visible sky changed ambient, reflection, or skybox lighting state.");
                }

                setup.report.captureAllowed = true;
                setup.report.status = "validated-and-installed";
                setup.report.failureReason = null;
            }
            catch (Exception error)
            {
                setup.report.captureAllowed = false;
                setup.report.status = "blocked";
                setup.report.failureReason = error.Message;
                if (setup.root != null)
                {
                    UnityEngine.Object.DestroyImmediate(setup.root);
                    setup.root = null;
                    setup.renderer = null;
                }
            }
            return setup;
        }

        private static void ValidateVisibleSkyContract(SkyContract source)
        {
            if (!string.Equals(
                source.mode,
                "ue-visual-target-classic-day-atlas",
                StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "Unsupported visible-sky mode: " + source.mode);
            }
            if (!source.visible)
            {
                throw new InvalidOperationException(
                    "The visible-sky checkpoint requires an enabled source dome.");
            }
            if (!string.Equals(
                    source.atlasFormat,
                    "RGBA16F linear OpenEXR exported by UE 5.8 TextureExporterEXR",
                    StringComparison.Ordinal)
                || source.atlasWidth != 256
                || source.atlasHeight != 40
                || source.curveRow != 0)
            {
                throw new InvalidOperationException(
                    "The source-exact Classic Day atlas format or layout changed.");
            }
            if (!string.Equals(source.curveTime, "1 - uv0.y", StringComparison.Ordinal)
                || !string.Equals(
                    source.sampleU,
                    "(t * (width - 1) + 0.5) / width",
                    StringComparison.Ordinal)
                || !string.Equals(
                    source.sampleV,
                    "(curveRow + 0.5) / height",
                    StringComparison.Ordinal)
                || !string.Equals(
                    source.toonlabExrSampleV,
                    "1 - ((curveRow + 0.5) / height)",
                    StringComparison.Ordinal)
                || source.toonlabExrStorageRow
                    != source.atlasHeight - 1 - source.curveRow
                || !string.Equals(
                    source.unityExrSampleV,
                    "(curveRow + 0.5) / height",
                    StringComparison.Ordinal)
                || source.unityRawStorageRow != source.curveRow)
            {
                throw new InvalidOperationException(
                    "The authored sky curve or OpenEXR row-origin adapter changed.");
            }
            if (!string.Equals(source.filter, "bilinear", StringComparison.Ordinal)
                || !string.Equals(source.address, "clamp", StringComparison.Ordinal)
                || Math.Abs(source.brightness - 1.0f) > 0.0f
                || Math.Abs(source.saturation - 1.0f) > 0.0f)
            {
                throw new InvalidOperationException(
                    "P04 permits only exact bilinear/clamp sampling at brightness/saturation 1.");
            }
            if (source.cloudShell
                && Math.Abs(source.unityUeGltfBasisYawDegrees - -90.0f) > 0.0001f)
            {
                throw new InvalidOperationException(
                    "P13 requires the handedness-adjusted -90 degree Unity sky-root yaw.");
            }
            if (!string.Equals(
                source.lightingParticipation,
                "visible background only; do not recapture or replace the stored skyLight SH",
                StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "P04 visible-sky lighting participation changed.");
            }
        }

        private static string ResolveContractAssetPath(
            string contractPath,
            string contractAssetPath)
        {
            var repositoryPath = contractAssetPath?.TrimStart('/');
            if (string.IsNullOrWhiteSpace(contractAssetPath)
                || !(repositoryPath.StartsWith("assets-local/", StringComparison.Ordinal)
                    || repositoryPath.StartsWith("scripts/", StringComparison.Ordinal)))
            {
                throw new InvalidOperationException(
                    "Parity sources require a repository-rooted /assets-local/ or /scripts/ path.");
            }
            var relative = repositoryPath
                .Replace('/', Path.DirectorySeparatorChar);
            var directory = new DirectoryInfo(Path.GetDirectoryName(contractPath));
            while (directory != null)
            {
                var candidate = Path.Combine(directory.FullName, relative);
                if (File.Exists(candidate)) return Path.GetFullPath(candidate);
                directory = directory.Parent;
            }
            throw new FileNotFoundException(
                "The contract source asset was not found: " + contractAssetPath);
        }

        private static string Sha256Hex(byte[] bytes)
        {
            using (var algorithm = SHA256.Create())
                return string.Concat(
                    algorithm.ComputeHash(bytes)
                        .Select(value => value.ToString("x2", CultureInfo.InvariantCulture)));
        }

        private static float SphericalHarmonicsMaximumError(
            SphericalHarmonicsL2 left,
            SphericalHarmonicsL2 right)
        {
            var maximum = 0.0f;
            for (var coefficient = 0; coefficient < 9; coefficient += 1)
            for (var channel = 0; channel < 3; channel += 1)
            {
                maximum = Mathf.Max(
                    maximum,
                    Mathf.Abs(left[channel, coefficient] - right[channel, coefficient]));
            }
            return maximum;
        }

        private static T PersistAsset<T>(T source, string path)
            where T : UnityEngine.Object
        {
            var existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing == null)
            {
                AssetDatabase.CreateAsset(source, path);
                EditorUtility.SetDirty(source);
                AssetDatabase.SaveAssets();
                return source;
            }
            EditorUtility.CopySerialized(source, existing);
            UnityEngine.Object.DestroyImmediate(source);
            EditorUtility.SetDirty(existing);
            AssetDatabase.SaveAssets();
            return existing;
        }

        private static Shader ResolveVisibleSkyShader(VisibleSkyReport report)
        {
            EnsureAssetFolder(VisibleSkyAssetFolder);
            var shaderFile = Path.GetFullPath(Path.Combine(
                Application.dataPath,
                "..",
                VisibleSkyShaderPath));
            var current = File.Exists(shaderFile) ? File.ReadAllText(shaderFile) : null;
            if (!string.Equals(current, VisibleSkyShaderSource, StringComparison.Ordinal))
                File.WriteAllText(shaderFile, VisibleSkyShaderSource, new UTF8Encoding(false));
            AssetDatabase.ImportAsset(
                VisibleSkyShaderPath,
                ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(VisibleSkyShaderPath);
            report.shaderAsset = VisibleSkyShaderPath;
            report.shaderSha256 = Sha256Hex(Encoding.UTF8.GetBytes(VisibleSkyShaderSource));
            report.shaderSupported = shader != null && shader.isSupported;
            if (!report.shaderSupported)
                throw new InvalidOperationException("The exact P04 URP sky shader did not compile.");
            return shader;
        }

        private static Shader ResolveCloudShellShader()
        {
            EnsureAssetFolder(VisibleSkyAssetFolder);
            var shaderFile = Path.GetFullPath(Path.Combine(
                Application.dataPath,
                "..",
                CloudShellShaderPath));
            var current = File.Exists(shaderFile) ? File.ReadAllText(shaderFile) : null;
            if (!string.Equals(current, CloudShellShaderSource, StringComparison.Ordinal))
                File.WriteAllText(shaderFile, CloudShellShaderSource, new UTF8Encoding(false));
            AssetDatabase.ImportAsset(
                CloudShellShaderPath,
                ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(CloudShellShaderPath);
            if (shader == null || !shader.isSupported)
                throw new InvalidOperationException("The exact P13 URP cloud shader did not compile.");
            return shader;
        }

        private static void ValidateSha256(byte[] bytes, string expected, string label)
        {
            if (!string.Equals(
                Sha256Hex(bytes),
                expected,
                StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(label + " SHA-256 does not match the P13 contract.");
            }
        }

        private static Texture2D DecodeExactPngTexture(
            byte[] bytes,
            string name,
            int[] expectedDimensions,
            TextureWrapMode wrapMode)
        {
            var texture = new Texture2D(2, 2, TextureFormat.RGBA32, true, true)
            {
                name = name,
                filterMode = FilterMode.Bilinear,
                wrapMode = wrapMode,
                anisoLevel = 8,
            };
            if (!ImageConversion.LoadImage(texture, bytes, false))
                throw new InvalidOperationException(name + " PNG could not be decoded.");
            if (expectedDimensions == null || expectedDimensions.Length != 2
                || texture.width != expectedDimensions[0]
                || texture.height != expectedDimensions[1])
            {
                throw new InvalidOperationException(name + " dimensions changed.");
            }
            return texture;
        }

        private static Shader ResolveDisplayTransferShader()
        {
            EnsureAssetFolder(VisibleSkyAssetFolder);
            var shaderFile = Path.GetFullPath(Path.Combine(
                Application.dataPath,
                "..",
                DisplayTransferShaderPath));
            var current = File.Exists(shaderFile) ? File.ReadAllText(shaderFile) : null;
            if (!string.Equals(current, DisplayTransferShaderSource, StringComparison.Ordinal))
                File.WriteAllText(
                    shaderFile,
                    DisplayTransferShaderSource,
                    new UTF8Encoding(false));
            AssetDatabase.ImportAsset(
                DisplayTransferShaderPath,
                ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(DisplayTransferShaderPath);
            if (shader == null || !shader.isSupported)
                throw new InvalidOperationException(
                    "The exact P05 UE display-transfer shader did not compile.");
            return shader;
        }

        private static Texture2D DecodeExactExrAtlas(
            byte[] bytes,
            SkyContract source,
            VisibleSkyReport report,
            bool validateSkyOracle = true)
        {
            if (!BitConverter.IsLittleEndian)
                throw new InvalidOperationException("The P04 EXR decoder requires little-endian Unity.");
            var offset = 0;
            var magic = ReadUInt32Little(bytes, ref offset);
            var versionAndFlags = ReadUInt32Little(bytes, ref offset);
            if (magic != 20000630U || (versionAndFlags & 0xffU) != 2U
                || (versionAndFlags & 0xffffff00U) != 0U)
            {
                throw new InvalidOperationException(
                    "Atlas_Sky must be a single-part scanline OpenEXR v2 file.");
            }

            var attributes = new Dictionary<string, ExrAttribute>(StringComparer.Ordinal);
            while (offset < bytes.Length && bytes[offset] != 0)
            {
                var name = ReadNullTerminatedAscii(bytes, ref offset);
                var type = ReadNullTerminatedAscii(bytes, ref offset);
                var size = checked((int)ReadUInt32Little(bytes, ref offset));
                RequireByteRange(bytes, offset, size, "OpenEXR attribute " + name);
                var value = new byte[size];
                Buffer.BlockCopy(bytes, offset, value, 0, size);
                offset += size;
                attributes.Add(name, new ExrAttribute { type = type, value = value });
            }
            if (offset >= bytes.Length || bytes[offset] != 0)
                throw new InvalidOperationException("Atlas_Sky OpenEXR header is unterminated.");
            offset += 1;

            var channels = ParseExactExrChannels(RequireExrAttribute(
                attributes,
                "channels",
                "chlist"));
            var compression = RequireExrAttribute(attributes, "compression", "compression");
            var lineOrder = RequireExrAttribute(attributes, "lineOrder", "lineOrder");
            var dataWindow = RequireExrAttribute(attributes, "dataWindow", "box2i");
            if (compression.value.Length != 1 || compression.value[0] != 3)
                throw new InvalidOperationException("Atlas_Sky must use OpenEXR ZIP compression.");
            if (lineOrder.value.Length != 1 || lineOrder.value[0] != 0)
                throw new InvalidOperationException("Atlas_Sky must use increasing-Y scanlines.");
            if (dataWindow.value.Length != 16)
                throw new InvalidOperationException("Atlas_Sky dataWindow is invalid.");
            var minimumX = ReadInt32Little(dataWindow.value, 0);
            var minimumY = ReadInt32Little(dataWindow.value, 4);
            var maximumX = ReadInt32Little(dataWindow.value, 8);
            var maximumY = ReadInt32Little(dataWindow.value, 12);
            var width = checked(maximumX - minimumX + 1);
            var height = checked(maximumY - minimumY + 1);
            if (minimumX != 0 || minimumY != 0
                || width != source.atlasWidth || height != source.atlasHeight)
            {
                throw new InvalidOperationException(
                    "Atlas_Sky EXR dataWindow does not match the exact contract dimensions.");
            }

            var chunkCount = (height + 15) / 16;
            var chunkOffsets = new ulong[chunkCount];
            for (var chunk = 0; chunk < chunkCount; chunk += 1)
                chunkOffsets[chunk] = ReadUInt64Little(bytes, ref offset);
            var rgbaHalf = new byte[checked(width * height * 4 * 2)];
            var rowWritten = new bool[height];
            foreach (var chunkOffset in chunkOffsets)
            {
                if (chunkOffset > int.MaxValue)
                    throw new InvalidOperationException("Atlas_Sky chunk offset exceeds capture limits.");
                var chunkPosition = (int)chunkOffset;
                var startY = ReadInt32Little(bytes, ref chunkPosition);
                var packedSize = checked((int)ReadUInt32Little(bytes, ref chunkPosition));
                RequireByteRange(bytes, chunkPosition, packedSize, "OpenEXR ZIP chunk");
                var packed = new byte[packedSize];
                Buffer.BlockCopy(bytes, chunkPosition, packed, 0, packedSize);
                var lineCount = Math.Min(16, maximumY - startY + 1);
                if (startY < minimumY || lineCount <= 0 || startY + lineCount > height)
                    throw new InvalidOperationException("Atlas_Sky ZIP chunk scanline range is invalid.");
                var expectedBytes = checked(lineCount * width * channels.Length * 2);
                var predicted = InflateExactZlib(packed, expectedBytes);
                UndoOpenExrZipPredictor(predicted);
                var decoded = UndoOpenExrZipInterleave(predicted);
                var bytesPerLine = checked(width * channels.Length * 2);
                for (var localY = 0; localY < lineCount; localY += 1)
                {
                    var y = startY + localY;
                    if (rowWritten[y])
                        throw new InvalidOperationException("Atlas_Sky scanline was decoded twice.");
                    rowWritten[y] = true;
                    var lineBase = localY * bytesPerLine;
                    for (var channel = 0; channel < channels.Length; channel += 1)
                    {
                        var destinationChannel = ExrRgbaChannelIndex(channels[channel]);
                        var channelBase = lineBase + channel * width * 2;
                        for (var x = 0; x < width; x += 1)
                        {
                            Buffer.BlockCopy(
                                decoded,
                                channelBase + x * 2,
                                rgbaHalf,
                                ((y * width + x) * 4 + destinationChannel) * 2,
                                2);
                        }
                    }
                }
            }
            if (rowWritten.Any(written => !written))
                throw new InvalidOperationException("Atlas_Sky did not decode every scanline.");

            report.exrVersion = (int)(versionAndFlags & 0xffU);
            report.exrCompression = "ZIP (16 scanlines)";
            report.exrChannels = channels;
            report.atlasWidth = width;
            report.atlasHeight = height;
            report.atlasRgbaHalfSha256 = Sha256Hex(rgbaHalf);
            var rowBytes = new byte[width * 4 * 2];
            Buffer.BlockCopy(
                rgbaHalf,
                source.unityRawStorageRow * rowBytes.Length,
                rowBytes,
                0,
                rowBytes.Length);
            report.classicDayRowRgbaHalfSha256 = Sha256Hex(rowBytes);
            report.expectedAtlasRgbaHalfSha256 = validateSkyOracle
                ? VisibleSkyDecodedAtlasSha256
                : report.atlasRgbaHalfSha256;
            report.expectedClassicDayRowRgbaHalfSha256 = validateSkyOracle
                ? VisibleSkyDecodedClassicDayRowSha256
                : report.classicDayRowRgbaHalfSha256;
            report.exrDecodePass = !validateSkyOracle
                || (string.Equals(
                        report.atlasRgbaHalfSha256,
                        VisibleSkyDecodedAtlasSha256,
                        StringComparison.OrdinalIgnoreCase)
                    && string.Equals(
                        report.classicDayRowRgbaHalfSha256,
                        VisibleSkyDecodedClassicDayRowSha256,
                        StringComparison.OrdinalIgnoreCase));
            if (!report.exrDecodePass)
            {
                throw new InvalidOperationException(
                    "Atlas_Sky decoded RGBA16F bytes disagree with the independent oracle.");
            }
            report.atlasRgbaHalfBytes = rgbaHalf;

            var texture = new Texture2D(
                width,
                height,
                TextureFormat.RGBAHalf,
                false,
                true)
            {
                name = "Exact UE Atlas_Sky RGBA16F",
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
                anisoLevel = 0,
            };
            texture.LoadRawTextureData(rgbaHalf);
            texture.Apply(false, false);
            report.textureFormat = texture.format.ToString();
            report.textureLinear = true;
            report.textureMipCount = texture.mipmapCount;
            ValidateTextureRawRoundTrip(texture, rgbaHalf);
            report.textureRawRoundTripPass = true;
            return texture;
        }

        private static ExrAttribute RequireExrAttribute(
            IReadOnlyDictionary<string, ExrAttribute> attributes,
            string name,
            string type)
        {
            if (!attributes.TryGetValue(name, out var attribute)
                || !string.Equals(attribute.type, type, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "Atlas_Sky is missing exact OpenEXR " + name + "/" + type + ".");
            }
            return attribute;
        }

        private static string[] ParseExactExrChannels(ExrAttribute attribute)
        {
            var channels = new List<string>();
            var offset = 0;
            while (offset < attribute.value.Length && attribute.value[offset] != 0)
            {
                var name = ReadNullTerminatedAscii(attribute.value, ref offset);
                RequireByteRange(attribute.value, offset, 16, "OpenEXR channel " + name);
                var pixelType = ReadInt32Little(attribute.value, offset);
                var xSampling = ReadInt32Little(attribute.value, offset + 8);
                var ySampling = ReadInt32Little(attribute.value, offset + 12);
                offset += 16;
                if (pixelType != 1 || xSampling != 1 || ySampling != 1)
                {
                    throw new InvalidOperationException(
                        "Atlas_Sky channels must be unsampled HALF channels.");
                }
                channels.Add(name);
            }
            var expected = new[] { "A", "B", "G", "R" };
            if (!channels.SequenceEqual(expected))
            {
                throw new InvalidOperationException(
                    "Atlas_Sky channel order must remain exact A,B,G,R.");
            }
            return channels.ToArray();
        }

        private static int ExrRgbaChannelIndex(string channel)
        {
            switch (channel)
            {
                case "R": return 0;
                case "G": return 1;
                case "B": return 2;
                case "A": return 3;
                default:
                    throw new InvalidOperationException(
                        "Unsupported Atlas_Sky channel: " + channel);
            }
        }

        private static byte[] InflateExactZlib(byte[] packed, int expectedBytes)
        {
            if (packed.Length < 6)
                throw new InvalidOperationException("Atlas_Sky ZIP chunk is truncated.");
            var cmf = packed[0];
            var flg = packed[1];
            if ((cmf & 0x0f) != 8 || ((cmf << 8) + flg) % 31 != 0 || (flg & 0x20) != 0)
                throw new InvalidOperationException("Atlas_Sky ZIP chunk has an invalid zlib header.");
            byte[] inflated;
            using (var input = new MemoryStream(packed, 2, packed.Length - 6, false))
            using (var deflate = new DeflateStream(input, CompressionMode.Decompress))
            using (var output = new MemoryStream(expectedBytes))
            {
                deflate.CopyTo(output);
                inflated = output.ToArray();
            }
            if (inflated.Length != expectedBytes)
                throw new InvalidOperationException("Atlas_Sky ZIP chunk expanded to the wrong size.");
            var expectedAdler =
                ((uint)packed[packed.Length - 4] << 24)
                | ((uint)packed[packed.Length - 3] << 16)
                | ((uint)packed[packed.Length - 2] << 8)
                | packed[packed.Length - 1];
            if (Adler32(inflated) != expectedAdler)
                throw new InvalidOperationException("Atlas_Sky ZIP chunk failed Adler-32 validation.");
            return inflated;
        }

        private static uint Adler32(byte[] bytes)
        {
            const uint modulus = 65521;
            uint a = 1;
            uint b = 0;
            foreach (var value in bytes)
            {
                a = (a + value) % modulus;
                b = (b + a) % modulus;
            }
            return (b << 16) | a;
        }

        private static void UndoOpenExrZipPredictor(byte[] bytes)
        {
            for (var index = 1; index < bytes.Length; index += 1)
            {
                bytes[index] = unchecked((byte)(
                    bytes[index - 1] + bytes[index] - 128));
            }
        }

        private static byte[] UndoOpenExrZipInterleave(byte[] bytes)
        {
            var result = new byte[bytes.Length];
            var lower = 0;
            var upper = (bytes.Length + 1) / 2;
            for (var index = 0; index < result.Length; index += 2)
            {
                result[index] = bytes[lower++];
                if (index + 1 < result.Length) result[index + 1] = bytes[upper++];
            }
            return result;
        }

        private static void ValidateTextureRawRoundTrip(
            Texture2D texture,
            byte[] expected)
        {
            var actual = texture.GetRawTextureData<byte>();
            if (actual.Length != expected.Length)
                throw new InvalidOperationException("Unity changed the Atlas_Sky raw byte count.");
            for (var index = 0; index < expected.Length; index += 1)
            {
                if (actual[index] != expected[index])
                {
                    throw new InvalidOperationException(
                        "Unity changed Atlas_Sky RGBA16F data at byte " + index + ".");
                }
            }
        }

        private static void ValidateTextureSampling(
            Texture2D texture,
            SkyContract source,
            VisibleSkyReport report)
        {
            var probes = new[] { 0.0f, 0.125f, 0.25f, 0.5f, 0.75f, 0.875f, 1.0f };
            var results = new VisibleSkySampleProbe[probes.Length];
            var maximumError = 0.0f;
            var gpuSampleV = (source.curveRow + 0.5f) / source.atlasHeight;
            // Texture2D.GetPixelBilinear is a CPU inspection API whose
            // normalized coordinates map to texel = uv * size (then clamp).
            // GPU normalized texture sampling maps to texel = uv * size - 0.5.
            // Validate the same authored texel coordinate through each API's
            // exact convention; the generated sky shader keeps the source/GPU
            // half-texel expression verbatim.
            var cpuSampleV = source.unityRawStorageRow
                / (float)source.atlasHeight;
            report.textureSampleCoordinateAdapter =
                "GPU uv=(texel+0.5)/size; Unity GetPixelBilinear cpu uv=" +
                "texel/size";
            for (var index = 0; index < probes.Length; index += 1)
            {
                var time = probes[index];
                var texel = Mathf.Clamp01(time) * (source.atlasWidth - 1);
                var lower = Mathf.FloorToInt(texel);
                var upper = Math.Min(lower + 1, source.atlasWidth - 1);
                var weight = texel - lower;
                var expected = new float[4];
                for (var channel = 0; channel < 4; channel += 1)
                {
                    var lowerValue = ReadAtlasHalf(
                        report.atlasRgbaHalfBytes,
                        source.atlasWidth,
                        source.unityRawStorageRow,
                        lower,
                        channel);
                    var upperValue = ReadAtlasHalf(
                        report.atlasRgbaHalfBytes,
                        source.atlasWidth,
                        source.unityRawStorageRow,
                        upper,
                        channel);
                    expected[channel] = Mathf.LerpUnclamped(lowerValue, upperValue, weight);
                }
                var gpuSampleU = (time * (source.atlasWidth - 1) + 0.5f)
                    / source.atlasWidth;
                var cpuSampleU = texel / source.atlasWidth;
                var actualColor = texture.GetPixelBilinear(cpuSampleU, cpuSampleV);
                var actual = Channels(actualColor);
                var error = 0.0f;
                for (var channel = 0; channel < 4; channel += 1)
                    error = Mathf.Max(error, Mathf.Abs(expected[channel] - actual[channel]));
                maximumError = Mathf.Max(maximumError, error);
                results[index] = new VisibleSkySampleProbe
                {
                    curveTime = time,
                    sampleUv = new[] { gpuSampleU, gpuSampleV },
                    unityCpuValidationUv = new[] { cpuSampleU, cpuSampleV },
                    expectedLinearRgba = expected,
                    unityLinearRgba = actual,
                    maximumError = error,
                };
            }
            report.textureSampleMaximumError = maximumError;
            report.textureSamplePass = maximumError <= report.textureSampleTolerance;
            report.textureSampleProbes = results;
            if (!report.textureSamplePass)
            {
                throw new InvalidOperationException(
                    "Unity RGBAHalf bilinear sampling did not match the independent EXR oracle.");
            }
        }

        private static float ReadAtlasHalf(
            byte[] bytes,
            int width,
            int y,
            int x,
            int channel)
        {
            var offset = ((y * width + x) * 4 + channel) * 2;
            return HalfToFloat((ushort)(bytes[offset] | (bytes[offset + 1] << 8)));
        }

        private static float HalfToFloat(ushort value)
        {
            var sign = (value & 0x8000) != 0 ? -1.0 : 1.0;
            var exponent = (value >> 10) & 0x1f;
            var mantissa = value & 0x03ff;
            if (exponent == 0)
                return (float)(sign * Math.Pow(2.0, -14.0) * mantissa / 1024.0);
            if (exponent == 31)
                return mantissa == 0
                    ? (float)(sign * double.PositiveInfinity)
                    : float.NaN;
            return (float)(sign * Math.Pow(2.0, exponent - 15.0)
                * (1.0 + mantissa / 1024.0));
        }

        private static Mesh DecodeExactSkyGlb(byte[] bytes, VisibleSkyReport report)
        {
            if (!BitConverter.IsLittleEndian)
                throw new InvalidOperationException("The P04 GLB decoder requires little-endian Unity.");
            var offset = 0;
            if (ReadUInt32Little(bytes, ref offset) != 0x46546c67U
                || ReadUInt32Little(bytes, ref offset) != 2U
                || ReadUInt32Little(bytes, ref offset) != bytes.Length)
            {
                throw new InvalidOperationException("The exact source sky mesh is not a valid GLB v2.");
            }
            string json = null;
            byte[] binary = null;
            while (offset < bytes.Length)
            {
                var length = checked((int)ReadUInt32Little(bytes, ref offset));
                var type = ReadUInt32Little(bytes, ref offset);
                RequireByteRange(bytes, offset, length, "GLB chunk");
                if (type == 0x4e4f534aU)
                {
                    json = Encoding.UTF8.GetString(bytes, offset, length)
                        .TrimEnd('\0', ' ', '\t', '\r', '\n');
                }
                else if (type == 0x004e4942U)
                {
                    binary = new byte[length];
                    Buffer.BlockCopy(bytes, offset, binary, 0, length);
                }
                offset += length;
            }
            if (json == null || binary == null || json.Contains("\"sparse\""))
                throw new InvalidOperationException("The exact source sky GLB layout is unsupported.");
            var glb = JsonUtility.FromJson<GlbRoot>(json);
            if (glb == null || glb.asset == null
                || !string.Equals(glb.asset.version, "2.0", StringComparison.Ordinal)
                || !string.Equals(glb.asset.generator, "Unreal Engine 5.8.0", StringComparison.Ordinal)
                || glb.scenes == null || glb.scenes.Length != 1
                || glb.scenes[0].nodes == null || glb.scenes[0].nodes.Length != 1
                || glb.nodes == null || glb.nodes.Length != 1
                || glb.nodes[0].mesh != 0
                || glb.meshes == null || glb.meshes.Length != 1
                || glb.meshes[0].primitives == null || glb.meshes[0].primitives.Length != 1)
            {
                throw new InvalidOperationException(
                    "The exact source sky GLB scene topology or UE generator changed.");
            }
            var primitive = glb.meshes[0].primitives[0];
            if (primitive.attributes == null)
                throw new InvalidOperationException("The source sky GLB has no vertex attributes.");
            var positions = ReadGlbFloatAccessor(
                glb,
                binary,
                primitive.attributes.POSITION,
                "VEC3");
            var normals = ReadGlbFloatAccessor(
                glb,
                binary,
                primitive.attributes.NORMAL,
                "VEC3");
            var sourceUvs = ReadGlbFloatAccessor(
                glb,
                binary,
                primitive.attributes.TEXCOORD_0,
                "VEC2");
            var sourceIndices = ReadGlbIndexAccessor(glb, binary, primitive.indices);
            var vertexCount = positions.Length / 3;
            if (normals.Length / 3 != vertexCount || sourceUvs.Length / 2 != vertexCount
                || sourceIndices.Length % 3 != 0)
            {
                throw new InvalidOperationException("The source sky GLB accessor counts disagree.");
            }
            var vertices = new Vector3[vertexCount];
            var meshNormals = new Vector3[vertexCount];
            var uvs = new Vector2[vertexCount];
            var minimumUv = new Vector2(float.PositiveInfinity, float.PositiveInfinity);
            var maximumUv = new Vector2(float.NegativeInfinity, float.NegativeInfinity);
            for (var index = 0; index < vertexCount; index += 1)
            {
                vertices[index] = new Vector3(
                    positions[index * 3],
                    positions[index * 3 + 1],
                    -positions[index * 3 + 2]);
                meshNormals[index] = new Vector3(
                    normals[index * 3],
                    normals[index * 3 + 1],
                    -normals[index * 3 + 2]);
                uvs[index] = new Vector2(
                    sourceUvs[index * 2],
                    sourceUvs[index * 2 + 1]);
                minimumUv = Vector2.Min(minimumUv, uvs[index]);
                maximumUv = Vector2.Max(maximumUv, uvs[index]);
            }
            var indices = new int[sourceIndices.Length];
            for (var triangle = 0; triangle < sourceIndices.Length; triangle += 3)
            {
                indices[triangle] = sourceIndices[triangle];
                indices[triangle + 1] = sourceIndices[triangle + 2];
                indices[triangle + 2] = sourceIndices[triangle + 1];
            }
            var mesh = new Mesh
            {
                name = "Exact UE SM_StylizedSkyDome",
                indexFormat = vertexCount > ushort.MaxValue
                    ? IndexFormat.UInt32
                    : IndexFormat.UInt16,
            };
            mesh.vertices = vertices;
            mesh.normals = meshNormals;
            mesh.uv = uvs;
            mesh.triangles = indices;
            mesh.RecalculateBounds();

            var inwardTriangles = 0;
            var center = mesh.bounds.center;
            for (var triangle = 0; triangle < indices.Length; triangle += 3)
            {
                var a = vertices[indices[triangle]];
                var b = vertices[indices[triangle + 1]];
                var c = vertices[indices[triangle + 2]];
                var face = Vector3.Cross(b - a, c - a);
                var radial = (a + b + c) / 3.0f - center;
                if (Vector3.Dot(face, radial) < 0.0f) inwardTriangles += 1;
            }
            report.glbGenerator = glb.asset.generator;
            report.meshVertexCount = vertexCount;
            report.meshIndexCount = indices.Length;
            report.meshTriangleCount = indices.Length / 3;
            report.meshInwardTriangleCount = inwardTriangles;
            report.meshInwardFacingPass = inwardTriangles == indices.Length / 3;
            report.meshBoundsCenter = Channels(mesh.bounds.center);
            report.meshBoundsSize = Channels(mesh.bounds.size);
            report.meshUvMinimum = new[] { minimumUv.x, minimumUv.y };
            report.meshUvMaximum = new[] { maximumUv.x, maximumUv.y };
            report.meshCoordinateAdapter =
                "GLB/Three (x,y,z) -> Unity (x,y,-z), reverse each triangle winding";
            if (!report.meshInwardFacingPass)
                throw new InvalidOperationException("The exact source sky dome is not inward-facing.");
            return mesh;
        }

        private static Mesh DecodeExactRockGlb(byte[] bytes)
        {
            if (!BitConverter.IsLittleEndian)
                throw new InvalidOperationException("The rock GLB decoder requires little-endian Unity.");
            var offset = 0;
            if (ReadUInt32Little(bytes, ref offset) != 0x46546c67U
                || ReadUInt32Little(bytes, ref offset) != 2U
                || ReadUInt32Little(bytes, ref offset) != bytes.Length)
            {
                throw new InvalidOperationException("The exact source rock mesh is not a valid GLB v2.");
            }
            string json = null;
            byte[] binary = null;
            while (offset < bytes.Length)
            {
                var length = checked((int)ReadUInt32Little(bytes, ref offset));
                var type = ReadUInt32Little(bytes, ref offset);
                RequireByteRange(bytes, offset, length, "rock GLB chunk");
                if (type == 0x4e4f534aU)
                {
                    json = Encoding.UTF8.GetString(bytes, offset, length)
                        .TrimEnd('\0', ' ', '\t', '\r', '\n');
                }
                else if (type == 0x004e4942U)
                {
                    binary = new byte[length];
                    Buffer.BlockCopy(bytes, offset, binary, 0, length);
                }
                offset += length;
            }
            if (json == null || binary == null || json.Contains("\"sparse\""))
                throw new InvalidOperationException("The exact source rock GLB layout is unsupported.");
            var glb = JsonUtility.FromJson<GlbRoot>(json);
            if (glb == null || glb.asset == null
                || !string.Equals(glb.asset.version, "2.0", StringComparison.Ordinal)
                || !string.Equals(glb.asset.generator, "Unreal Engine 5.8.0", StringComparison.Ordinal)
                || glb.meshes == null || glb.meshes.Length != 1
                || glb.meshes[0].primitives == null || glb.meshes[0].primitives.Length != 1)
            {
                throw new InvalidOperationException(
                    "The exact source rock GLB topology or UE generator changed.");
            }
            var primitive = glb.meshes[0].primitives[0];
            if (primitive.attributes == null)
                throw new InvalidOperationException("The source rock GLB has no attributes.");
            var positions = ReadGlbFloatAccessor(
                glb, binary, primitive.attributes.POSITION, "VEC3");
            var normals = ReadGlbFloatAccessor(
                glb, binary, primitive.attributes.NORMAL, "VEC3");
            var sourceTangents = ReadGlbFloatAccessor(
                glb, binary, primitive.attributes.TANGENT, "VEC4");
            var sourceUv0 = ReadGlbFloatAccessor(
                glb, binary, primitive.attributes.TEXCOORD_0, "VEC2");
            var sourceUv1 = ReadGlbFloatAccessor(
                glb, binary, primitive.attributes.TEXCOORD_1, "VEC2");
            var sourceIndices = ReadGlbIndexAccessor(glb, binary, primitive.indices);
            var vertexCount = positions.Length / 3;
            if (normals.Length / 3 != vertexCount
                || sourceTangents.Length / 4 != vertexCount
                || sourceUv0.Length / 2 != vertexCount
                || sourceUv1.Length / 2 != vertexCount
                || sourceIndices.Length % 3 != 0)
            {
                throw new InvalidOperationException("The source rock GLB accessor counts disagree.");
            }

            var vertices = new Vector3[vertexCount];
            var meshNormals = new Vector3[vertexCount];
            var tangents = new Vector4[vertexCount];
            var authoredUvs = new Vector2[vertexCount];
            var originalUvs = new Vector2[vertexCount];
            for (var index = 0; index < vertexCount; index += 1)
            {
                // GLB -> Unity reflects Z. The retained parity mesh then uses
                // the same 180-degree +Y basis adapter as ToonLab. Combined,
                // the exact source mapping is (-x, y, z).
                vertices[index] = new Vector3(
                    -positions[index * 3],
                    positions[index * 3 + 1],
                    positions[index * 3 + 2]);
                meshNormals[index] = new Vector3(
                    -normals[index * 3],
                    normals[index * 3 + 1],
                    normals[index * 3 + 2]);
                tangents[index] = new Vector4(
                    -sourceTangents[index * 4],
                    sourceTangents[index * 4 + 1],
                    sourceTangents[index * 4 + 2],
                    -sourceTangents[index * 4 + 3]);
                // Keep the original authored mesh UV as the primary channel
                // for the stable source material. Preserve the glTF bake UV
                // separately for forensic inspection; the direct glTF atlas
                // payload was rejected after both Unity and ToonLab exposed
                // its masked padding as black/green blocks.
                authoredUvs[index] = new Vector2(
                    sourceUv0[index * 2],
                    sourceUv0[index * 2 + 1]);
                originalUvs[index] = new Vector2(
                    sourceUv1[index * 2],
                    1.0f - sourceUv1[index * 2 + 1]);
            }
            var indices = new int[sourceIndices.Length];
            for (var triangle = 0; triangle < sourceIndices.Length; triangle += 3)
            {
                indices[triangle] = sourceIndices[triangle];
                indices[triangle + 1] = sourceIndices[triangle + 2];
                indices[triangle + 2] = sourceIndices[triangle + 1];
            }
            var mesh = new Mesh
            {
                name = "Exact UE SM_CliffClassic2 attributes",
                indexFormat = vertexCount > ushort.MaxValue
                    ? IndexFormat.UInt32
                    : IndexFormat.UInt16,
            };
            mesh.vertices = vertices;
            mesh.normals = meshNormals;
            mesh.tangents = tangents;
            mesh.uv = authoredUvs;
            mesh.uv2 = originalUvs;
            mesh.triangles = indices;
            mesh.RecalculateBounds();
            return mesh;
        }

        private static float[] ReadGlbFloatAccessor(
            GlbRoot glb,
            byte[] binary,
            int accessorIndex,
            string requiredType)
        {
            var accessor = RequireGlbAccessor(glb, accessorIndex);
            if (accessor.componentType != 5126
                || !string.Equals(accessor.type, requiredType, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "The source sky GLB " + requiredType + " accessor must be float32.");
            }
            var components = requiredType == "VEC4"
                ? 4
                : requiredType == "VEC3"
                    ? 3
                    : 2;
            var view = RequireGlbBufferView(glb, accessor.bufferView);
            var stride = view.byteStride > 0 ? view.byteStride : components * 4;
            if (stride < components * 4)
                throw new InvalidOperationException("The source sky GLB float stride is invalid.");
            var start = checked(view.byteOffset + accessor.byteOffset);
            RequireByteRange(
                binary,
                start,
                checked((accessor.count - 1) * stride + components * 4),
                "GLB float accessor");
            var result = new float[checked(accessor.count * components)];
            for (var element = 0; element < accessor.count; element += 1)
            for (var component = 0; component < components; component += 1)
            {
                result[element * components + component] = BitConverter.ToSingle(
                    binary,
                    start + element * stride + component * 4);
            }
            return result;
        }

        private static int[] ReadGlbIndexAccessor(
            GlbRoot glb,
            byte[] binary,
            int accessorIndex)
        {
            var accessor = RequireGlbAccessor(glb, accessorIndex);
            if (accessor.componentType != 5123
                || !string.Equals(accessor.type, "SCALAR", StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "The exact source sky GLB index accessor must remain uint16.");
            }
            var view = RequireGlbBufferView(glb, accessor.bufferView);
            var stride = view.byteStride > 0 ? view.byteStride : 2;
            var start = checked(view.byteOffset + accessor.byteOffset);
            RequireByteRange(
                binary,
                start,
                checked((accessor.count - 1) * stride + 2),
                "GLB index accessor");
            var result = new int[accessor.count];
            for (var index = 0; index < accessor.count; index += 1)
                result[index] = BitConverter.ToUInt16(binary, start + index * stride);
            return result;
        }

        private static GlbAccessor RequireGlbAccessor(GlbRoot glb, int index)
        {
            if (glb.accessors == null || index < 0 || index >= glb.accessors.Length)
                throw new InvalidOperationException("The source sky GLB accessor index is invalid.");
            var accessor = glb.accessors[index];
            if (accessor == null || accessor.count <= 0)
                throw new InvalidOperationException("The source sky GLB accessor is empty.");
            return accessor;
        }

        private static GlbBufferView RequireGlbBufferView(GlbRoot glb, int index)
        {
            if (glb.bufferViews == null || index < 0 || index >= glb.bufferViews.Length)
                throw new InvalidOperationException("The source sky GLB buffer-view index is invalid.");
            return glb.bufferViews[index];
        }

        private static uint ReadUInt32Little(byte[] bytes, ref int offset)
        {
            RequireByteRange(bytes, offset, 4, "uint32");
            var value = BitConverter.ToUInt32(bytes, offset);
            offset += 4;
            return value;
        }

        private static ulong ReadUInt64Little(byte[] bytes, ref int offset)
        {
            RequireByteRange(bytes, offset, 8, "uint64");
            var value = BitConverter.ToUInt64(bytes, offset);
            offset += 8;
            return value;
        }

        private static int ReadInt32Little(byte[] bytes, ref int offset)
        {
            RequireByteRange(bytes, offset, 4, "int32");
            var value = BitConverter.ToInt32(bytes, offset);
            offset += 4;
            return value;
        }

        private static int ReadInt32Little(byte[] bytes, int offset)
        {
            RequireByteRange(bytes, offset, 4, "int32");
            return BitConverter.ToInt32(bytes, offset);
        }

        private static string ReadNullTerminatedAscii(byte[] bytes, ref int offset)
        {
            var end = offset;
            while (end < bytes.Length && bytes[end] != 0) end += 1;
            if (end >= bytes.Length)
                throw new InvalidOperationException("A source binary string is unterminated.");
            var result = Encoding.ASCII.GetString(bytes, offset, end - offset);
            offset = end + 1;
            return result;
        }

        private static void RequireByteRange(
            byte[] bytes,
            int offset,
            int length,
            string label)
        {
            if (offset < 0 || length < 0 || offset > bytes.Length - length)
                throw new InvalidOperationException(label + " exceeds source binary bounds.");
        }

        private static GameObject BuildSourceRock(RockContract rock, string contractPath)
        {
            var authored = rock.unity.authoredMaterial;
            var useAuthoredBake = authored != null
                && string.Equals(
                    authored.mode,
                    "ue-authored-bake-4096",
                    StringComparison.Ordinal);
            Mesh mesh;
            Material material;
            if (useAuthoredBake)
            {
                if (string.IsNullOrWhiteSpace(rock.unity.meshGlb))
                    throw new InvalidOperationException(
                        "The authored rock checkpoint has no UE geometry GLB.");
                var meshFile = ResolveContractAssetPath(contractPath, rock.unity.meshGlb);
                mesh = DecodeExactRockGlb(File.ReadAllBytes(meshFile));
                EnsureAssetFolder(authored.assetFolder);
                mesh = PersistAsset(
                    mesh,
                    authored.assetFolder + "/SM_CliffClassic2_UEAttributes.asset");
                var materialPath = string.IsNullOrWhiteSpace(rock.unity.material)
                    ? RockMaterialPath
                    : rock.unity.material;
                material = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
                if (material == null)
                    throw new InvalidOperationException(
                        "Source rock material was not found: " + materialPath);
            }
            else
            {
                var meshPath = string.IsNullOrWhiteSpace(rock.unity.mesh)
                    ? RockMeshPath
                    : rock.unity.mesh;
                var materialPath = string.IsNullOrWhiteSpace(rock.unity.material)
                    ? RockMaterialPath
                    : rock.unity.material;
                mesh = AssetDatabase.LoadAllAssetsAtPath(meshPath)
                    .OfType<Mesh>()
                    .FirstOrDefault();
                material = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
                if (mesh == null)
                    throw new InvalidOperationException(
                        "Source rock mesh was not found: " + meshPath);
                if (material == null)
                    throw new InvalidOperationException(
                        "Source rock material was not found: " + materialPath);
            }

            var instance = new GameObject("Source Rock: SM_CliffClassic2");
            instance.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = instance.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.On;
            renderer.receiveShadows = true;
            instance.transform.position = Vector3From(rock.transform.position);
            instance.transform.rotation = QuaternionFrom(
                rock.transform.rotationQuaternion)
                * Quaternion.Euler(0f, rock.unity.sourceYawDegrees, 0f);
            var authoredScale = Vector3From(rock.transform.scale);
            var sourceAxisScale = rock.unity.sourceAxisScale != null
                && rock.unity.sourceAxisScale.Length >= 3
                    ? Vector3From(rock.unity.sourceAxisScale)
                    : Vector3.one;
            instance.transform.localScale = Vector3.Scale(authoredScale, sourceAxisScale);
            renderer.shadowCastingMode = rock.castShadow
                ? ShadowCastingMode.On
                : ShadowCastingMode.Off;
            renderer.receiveShadows = rock.receiveShadow;
            return instance;
        }

        private static Material ResolveAuthoredRockBakeMaterial(
            UnityAuthoredRockMaterialSource source,
            string contractPath)
        {
            if (string.IsNullOrWhiteSpace(source.assetFolder)
                || !source.assetFolder.StartsWith("Assets/", StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "The authored rock bake must be imported under Assets/.");
            }
            EnsureAssetFolder(source.assetFolder);
            var manifestFile = ResolveContractAssetPath(contractPath, source.sourceManifest);
            var sourceFolder = Path.GetDirectoryName(manifestFile);
            if (string.IsNullOrWhiteSpace(sourceFolder))
                throw new InvalidOperationException("The authored rock manifest has no folder.");

            var shaderSource = ResolveContractAssetPath(contractPath, source.shaderSource);
            var shaderAsset = source.assetFolder + "/UnityAuthoredRockBake.shader";
            CopyIntoUnityAsset(shaderSource, shaderAsset);
            foreach (var filename in new[]
            {
                source.baseColor,
                source.metallicRoughness,
                source.emissive,
                source.normal,
                source.specular,
            })
            {
                CopyIntoUnityAsset(Path.Combine(sourceFolder, filename), source.assetFolder + "/" + filename);
            }
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);

            var baseColorPath = source.assetFolder + "/" + source.baseColor;
            var metallicRoughnessPath = source.assetFolder + "/" + source.metallicRoughness;
            var emissivePath = source.assetFolder + "/" + source.emissive;
            var normalPath = source.assetFolder + "/" + source.normal;
            var specularPath = source.assetFolder + "/" + source.specular;
            ConfigureAuthoredTexture(baseColorPath, true, false);
            ConfigureAuthoredTexture(metallicRoughnessPath, false, false);
            ConfigureAuthoredTexture(emissivePath, true, false);
            ConfigureAuthoredTexture(normalPath, false, true);
            ConfigureAuthoredTexture(specularPath, false, false);

            var shader = AssetDatabase.LoadAssetAtPath<Shader>(shaderAsset);
            if (shader == null || !shader.isSupported)
                throw new InvalidOperationException(
                    "The authored UE rock-bake shader did not compile: " + shaderAsset);
            var materialPath = source.assetFolder + "/UEAuthoredRockBake4096.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
            if (material == null)
            {
                material = new Material(shader)
                {
                    name = "SM_CliffClassic2 UE-authored 4096 bake",
                };
                AssetDatabase.CreateAsset(material, materialPath);
            }
            else if (material.shader != shader)
            {
                material.shader = shader;
            }
            material.SetTexture("_BaseMap", LoadTexture(baseColorPath));
            material.SetTexture("_MetallicRoughnessMap", LoadTexture(metallicRoughnessPath));
            material.SetTexture("_EmissiveMap", LoadTexture(emissivePath));
            material.SetTexture("_NormalMap", LoadTexture(normalPath));
            material.SetTexture("_SpecularMap", LoadTexture(specularPath));
            material.SetTextureScale(
                "_BaseMap",
                new Vector2(source.textureScale[0], source.textureScale[1]));
            material.SetTextureOffset(
                "_BaseMap",
                new Vector2(source.textureOffset[0], source.textureOffset[1]));
            material.SetColor(
                "_EmissiveFactor",
                new Color(
                    source.emissiveFactor[0],
                    source.emissiveFactor[1],
                    source.emissiveFactor[2],
                    1.0f));
            material.SetFloat("_Cutoff", source.alphaCutoff);
            material.SetFloat("_AlphaClip", 1.0f);
            material.EnableKeyword("_ALPHATEST_ON");
            EditorUtility.SetDirty(material);
            AssetDatabase.SaveAssets();
            return material;
        }

        private static void CopyIntoUnityAsset(string source, string assetPath)
        {
            if (!File.Exists(source))
                throw new FileNotFoundException("Authored rock source asset is missing.", source);
            var destination = Path.GetFullPath(Path.Combine(
                Application.dataPath,
                "..",
                assetPath.Replace('/', Path.DirectorySeparatorChar)));
            Directory.CreateDirectory(Path.GetDirectoryName(destination));
            if (!File.Exists(destination)
                || !File.ReadAllBytes(source).SequenceEqual(File.ReadAllBytes(destination)))
            {
                File.Copy(source, destination, true);
            }
        }

        private static void ConfigureAuthoredTexture(
            string assetPath,
            bool srgb,
            bool normalMap)
        {
            var importer = AssetImporter.GetAtPath(assetPath) as TextureImporter;
            if (importer == null)
                throw new InvalidOperationException("Texture import failed: " + assetPath);
            var changed = importer.sRGBTexture != srgb
                || importer.textureType != (normalMap
                    ? TextureImporterType.NormalMap
                    : TextureImporterType.Default)
                || importer.maxTextureSize != 4096
                || importer.textureCompression != TextureImporterCompression.Uncompressed
                || !importer.mipmapEnabled
                || importer.wrapMode != TextureWrapMode.Repeat
                || importer.filterMode != FilterMode.Bilinear;
            if (!changed) return;
            importer.sRGBTexture = srgb;
            importer.textureType = normalMap
                ? TextureImporterType.NormalMap
                : TextureImporterType.Default;
            importer.maxTextureSize = 4096;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.mipmapEnabled = true;
            importer.wrapMode = TextureWrapMode.Repeat;
            importer.filterMode = FilterMode.Bilinear;
            importer.SaveAndReimport();
        }

        private static Texture2D LoadTexture(string assetPath)
        {
            var texture = AssetDatabase.LoadAssetAtPath<Texture2D>(assetPath);
            if (texture == null)
                throw new InvalidOperationException("Texture asset was not found: " + assetPath);
            return texture;
        }

        private static byte[] Render(
            Camera camera,
            RenderTexture destination,
            out Texture2D pixels,
            RenderTexture hdrDestination = null,
            Material displayTransferMaterial = null)
        {
            var renderDestination = hdrDestination != null && displayTransferMaterial != null
                ? hdrDestination
                : destination;
            var request = new UniversalRenderPipeline.SingleCameraRequest
            {
                destination = renderDestination,
            };
            RenderPipeline.SubmitRenderRequest(camera, request);
            if (renderDestination != destination)
                Graphics.Blit(renderDestination, destination, displayTransferMaterial, 0);
            var previous = RenderTexture.active;
            RenderTexture.active = destination;
            pixels = new Texture2D(
                destination.width,
                destination.height,
                TextureFormat.RGBA32,
                false,
                false);
            pixels.ReadPixels(
                new Rect(0, 0, destination.width, destination.height),
                0,
                0,
                false);
            pixels.Apply(false, false);
            RenderTexture.active = previous;
            return pixels.EncodeToPNG();
        }

        private static CaptureReport BuildReport(
            string contractPath,
            string checkpoint,
            string profileId,
            int width,
            int height,
            Camera camera,
            Light sun,
            GameObject ground,
            Renderer groundRenderer,
            IReadOnlyList<GameObject> sourceObjects,
            SkyLightReport skyLightReport,
            VisibleSkyReport visibleSkyReport,
            PostContract post,
            float contractSunIntensity,
            UnityRadiometricAdapterContract unityRadiometricAdapter)
        {
            var pipeline = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            var worldToShadow = Shader.GetGlobalMatrixArray("_MainLightWorldToShadow");
            var gpuProjection = GL.GetGPUProjectionMatrix(camera.projectionMatrix, true);
            return new CaptureReport
            {
                schema = "toonlab.clean-source-parity-rig",
                contractPath = contractPath,
                checkpoint = checkpoint,
                profileId = profileId,
                unityVersion = Application.unityVersion,
                colorSpace = QualitySettings.activeColorSpace.ToString(),
                width = width,
                height = height,
                camera = TransformRecord.For(camera.transform),
                cameraAspect = camera.aspect,
                cameraFieldOfView = camera.fieldOfView,
                cameraNear = camera.nearClipPlane,
                cameraFar = camera.farClipPlane,
                cameraProjectionMatrix = MatrixChannels(camera.projectionMatrix).ToArray(),
                cameraGpuProjectionMatrix = MatrixChannels(gpuProjection).ToArray(),
                cameraWorldToCameraMatrix = MatrixChannels(camera.worldToCameraMatrix).ToArray(),
                cameraWorldToClipMatrix = MatrixChannels(
                    gpuProjection * camera.worldToCameraMatrix).ToArray(),
                cameraProjectionProbes = BuildProjectionProbes(
                    camera,
                    ground,
                    sourceObjects),
                sun = TransformRecord.For(sun.transform),
                sunColor = Channels(sun.color),
                sunIntensity = sun.intensity,
                sunContractIntensity = contractSunIntensity,
                sunRadiometricAdapter = unityRadiometricAdapter == null
                    ? null
                    : RadiometricAdapterReport.From(unityRadiometricAdapter),
                sunShadowBias = sun.shadowBias,
                sunShadowNormalBias = sun.shadowNormalBias,
                sunShadowStrength = sun.shadowStrength,
                ambientColor = Channels(RenderSettings.ambientLight),
                ambientIntensity = RenderSettings.ambientIntensity,
                ambientMode = RenderSettings.ambientMode.ToString(),
                ambientProbe = Flatten(RenderSettings.ambientProbe),
                skyLight = skyLightReport,
                visibleSky = visibleSkyReport,
                fog = RenderSettings.fog,
                postProcessing = post != null,
                displayTransfer = post == null ? null : DisplayTransferReport.From(post),
                pipelineAsset = pipeline != null ? AssetDatabase.GetAssetPath(pipeline) : null,
                shadowDistance = pipeline != null ? pipeline.shadowDistance : 0.0f,
                shadowCascadeCount = pipeline != null ? pipeline.shadowCascadeCount : 0,
                mainLightShadowmapResolution = pipeline != null
                    ? pipeline.mainLightShadowmapResolution
                    : 0,
                mainLightWorldToShadow = worldToShadow
                    .SelectMany(MatrixChannels)
                    .ToArray(),
                mainLightWorldToShadowCount = worldToShadow.Length,
                groundMaterial = groundRenderer.sharedMaterial.name,
                groundBaseColor = Channels(groundRenderer.sharedMaterial.GetColor("_BaseColor")),
                objects = sourceObjects.Select(ObjectRecord.For).ToArray(),
            };
        }

        private static ProjectionProbe[] BuildProjectionProbes(
            Camera camera,
            GameObject ground,
            IReadOnlyList<GameObject> sourceObjects)
        {
            var probes = new List<ProjectionProbe>();
            AddProjectionProbe(probes, camera, "ground-center", ground.transform.position);
            foreach (var x in new[] { -5.0f, 5.0f })
            foreach (var z in new[] { -5.0f, 5.0f })
            {
                AddProjectionProbe(
                    probes,
                    camera,
                    $"ground-corner-{x:+0;-0}-{z:+0;-0}",
                    ground.transform.TransformPoint(new Vector3(x, 0, z)));
            }

            foreach (var sourceObject in sourceObjects)
            {
                var renderer = sourceObject.GetComponentInChildren<Renderer>(true);
                if (renderer == null) continue;
                var bounds = renderer.bounds;
                AddProjectionProbe(
                    probes,
                    camera,
                    sourceObject.name + ":bounds-center",
                    bounds.center);
                for (var x = 0; x < 2; x += 1)
                for (var y = 0; y < 2; y += 1)
                for (var z = 0; z < 2; z += 1)
                {
                    AddProjectionProbe(
                        probes,
                        camera,
                        $"{sourceObject.name}:bounds-{x}{y}{z}",
                        new Vector3(
                            x == 0 ? bounds.min.x : bounds.max.x,
                            y == 0 ? bounds.min.y : bounds.max.y,
                            z == 0 ? bounds.min.z : bounds.max.z));
                }
            }
            return probes.ToArray();
        }

        private static void AddProjectionProbe(
            ICollection<ProjectionProbe> probes,
            Camera camera,
            string name,
            Vector3 worldPosition)
        {
            var viewport = camera.WorldToViewportPoint(worldPosition);
            probes.Add(new ProjectionProbe
            {
                name = name,
                worldPosition = new[] { worldPosition.x, worldPosition.y, worldPosition.z },
                viewport = new[] { viewport.x, viewport.y, viewport.z },
                ndc = new[] { viewport.x * 2.0f - 1.0f, viewport.y * 2.0f - 1.0f },
            });
        }

        private static float[] Channels(Color value)
        {
            return new[] { value.r, value.g, value.b, value.a };
        }

        private static float[] Channels(Vector3 value)
        {
            return new[] { value.x, value.y, value.z };
        }

        private static float[] Flatten(SphericalHarmonicsL2 value)
        {
            var result = new float[27];
            var offset = 0;
            for (var coefficient = 0; coefficient < 9; coefficient += 1)
            for (var channel = 0; channel < 3; channel += 1)
                result[offset++] = value[channel, coefficient];
            return result;
        }

        private static ParityContract LoadContract(string path)
        {
            if (!File.Exists(path))
                throw new FileNotFoundException("Parity contract was not found.", path);
            var json = File.ReadAllText(path);
            var contract = JsonUtility.FromJson<ParityContract>(json);
            if (contract == null || contract.schema != "toonlab.tri-engine-parity-contract")
                throw new InvalidOperationException("Unsupported parity contract: " + path);
            if (contract.render == null || contract.camera == null ||
                contract.sun == null || contract.ground == null || contract.rock == null)
                throw new InvalidOperationException("Parity contract is missing a required section: " + path);
            var hasSkyLightSection = json.IndexOf(
                "\"skyLight\"",
                StringComparison.Ordinal) >= 0;
            if (!hasSkyLightSection)
            {
                // JsonUtility may materialize an empty nested reference for a
                // missing optional section. Preserve the P00-P02 contract
                // boundary explicitly so those profiles never enter the P03
                // native-SH path.
                contract.skyLight = null;
            }
            else
            {
                // JsonUtility intentionally does not deserialize jagged arrays.
                // Parse only the two strict 9x3 numeric matrices from the same
                // immutable contract text; every other field remains handled by
                // JsonUtility's normal strongly typed path.
                contract.skyLight.threeCoefficients = ExtractJsonCoefficientMatrix(
                    json,
                    "threeCoefficients");
                contract.skyLight.unrealCoefficients = ExtractJsonCoefficientMatrix(
                    json,
                    "unrealCoefficients");
            }
            return contract;
        }

        private static double[][] ExtractJsonCoefficientMatrix(
            string json,
            string propertyName)
        {
            var token = "\"" + propertyName + "\"";
            var propertyIndex = json.IndexOf(token, StringComparison.Ordinal);
            if (propertyIndex < 0)
                throw new InvalidOperationException("Contract is missing " + propertyName + ".");
            var arrayStart = json.IndexOf('[', propertyIndex + token.Length);
            if (arrayStart < 0)
                throw new InvalidOperationException(propertyName + " is not a JSON array.");
            var depth = 0;
            var arrayEnd = -1;
            for (var index = arrayStart; index < json.Length; index += 1)
            {
                if (json[index] == '[') depth += 1;
                else if (json[index] == ']')
                {
                    depth -= 1;
                    if (depth == 0)
                    {
                        arrayEnd = index;
                        break;
                    }
                }
            }
            if (arrayEnd < 0)
                throw new InvalidOperationException(propertyName + " has no closing bracket.");

            var numbers = new List<double>(27);
            for (var index = arrayStart; index <= arrayEnd; index += 1)
            {
                var current = json[index];
                if (!(current == '-' || current == '+' || current == '.' || char.IsDigit(current)))
                    continue;
                var start = index;
                while (index + 1 <= arrayEnd)
                {
                    var next = json[index + 1];
                    if (!(next == '-' || next == '+' || next == '.' ||
                          next == 'e' || next == 'E' || char.IsDigit(next))) break;
                    index += 1;
                }
                var text = json.Substring(start, index - start + 1);
                if (!double.TryParse(
                    text,
                    NumberStyles.Float,
                    CultureInfo.InvariantCulture,
                    out var value))
                {
                    throw new InvalidOperationException(
                        propertyName + " contains an invalid number: " + text);
                }
                numbers.Add(value);
            }
            if (numbers.Count != 27)
            {
                throw new InvalidOperationException(
                    propertyName + " must contain exactly 27 numeric channels; found " +
                    numbers.Count + ".");
            }
            var result = EmptyCoefficientMatrix();
            for (var coefficient = 0; coefficient < 9; coefficient += 1)
            for (var channel = 0; channel < 3; channel += 1)
                result[coefficient][channel] = numbers[coefficient * 3 + channel];
            return result;
        }

        private static Vector3 Vector3From(float[] values)
        {
            if (values == null || values.Length < 3)
                throw new InvalidOperationException("A three-channel vector is required by the parity contract.");
            return new Vector3(values[0], values[1], values[2]);
        }

        private static Quaternion QuaternionFrom(float[] values)
        {
            if (values == null || values.Length < 4)
                throw new InvalidOperationException("A four-channel quaternion is required by the parity contract.");
            return new Quaternion(values[0], values[1], values[2], values[3]);
        }

        private static Color ColorFrom(float[] values)
        {
            if (values == null || values.Length < 3)
                throw new InvalidOperationException("A three-channel color is required by the parity contract.");
            return new Color(
                values[0],
                values[1],
                values[2],
                values.Length >= 4 ? values[3] : 1.0f);
        }

        private static IEnumerable<float> MatrixChannels(Matrix4x4 matrix)
        {
            for (var row = 0; row < 4; row += 1)
                for (var column = 0; column < 4; column += 1)
                    yield return matrix[row, column];
        }

        private static string Argument(string name, string fallback)
        {
            var args = Environment.GetCommandLineArgs();
            var index = Array.IndexOf(args, name);
            return index >= 0 && index + 1 < args.Length ? args[index + 1] : fallback;
        }

        private static int IntArgument(string name, int fallback)
        {
            return int.TryParse(Argument(name, fallback.ToString()), out var value)
                ? Math.Max(value, 1)
                : fallback;
        }

        private static float FloatArgument(string name, float fallback)
        {
            return float.TryParse(
                Argument(name, fallback.ToString(CultureInfo.InvariantCulture)),
                NumberStyles.Float,
                CultureInfo.InvariantCulture,
                out var value)
                    ? value
                    : fallback;
        }

        [Serializable]
        private sealed class CaptureReport
        {
            public string schema;
            public string contractPath;
            public string checkpoint;
            public string profileId;
            public string unityVersion;
            public string colorSpace;
            public int width;
            public int height;
            public TransformRecord camera;
            public float cameraAspect;
            public float cameraFieldOfView;
            public float cameraNear;
            public float cameraFar;
            public float[] cameraProjectionMatrix;
            public float[] cameraGpuProjectionMatrix;
            public float[] cameraWorldToCameraMatrix;
            public float[] cameraWorldToClipMatrix;
            public ProjectionProbe[] cameraProjectionProbes;
            public TransformRecord sun;
            public float[] sunColor;
            public float sunIntensity;
            public float sunContractIntensity;
            public RadiometricAdapterReport sunRadiometricAdapter;
            public float sunShadowBias;
            public float sunShadowNormalBias;
            public float sunShadowStrength;
            public float[] ambientColor;
            public float ambientIntensity;
            public string ambientMode;
            public float[] ambientProbe;
            public SkyLightReport skyLight;
            public VisibleSkyReport visibleSky;
            public bool fog;
            public bool postProcessing;
            public DisplayTransferReport displayTransfer;
            public string pipelineAsset;
            public float shadowDistance;
            public int shadowCascadeCount;
            public int mainLightShadowmapResolution;
            public float[] mainLightWorldToShadow;
            public int mainLightWorldToShadowCount;
            public string groundMaterial;
            public float[] groundBaseColor;
            public ObjectRecord[] objects;
        }

        [Serializable]
        private sealed class RadiometricAdapterReport
        {
            public string mode;
            public float directRadianceMultiplier;
            public float diffuseSkyIrradianceMultiplier;
            public string derivation;

            public static RadiometricAdapterReport From(
                UnityRadiometricAdapterContract source)
            {
                return new RadiometricAdapterReport
                {
                    mode = source.mode,
                    directRadianceMultiplier = source.directRadianceMultiplier,
                    diffuseSkyIrradianceMultiplier = source.diffuseSkyIrradianceMultiplier,
                    derivation = source.derivation,
                };
            }
        }

        [Serializable]
        private sealed class DisplayTransferReport
        {
            public string mode;
            public float fixedEv100;
            public float biasEv;
            public float exposureMultiplier;
            public float[] effectiveGlobalSaturationRgb;
            public float filmSlope;
            public float filmToe;
            public float filmShoulder;
            public float blueCorrection;
            public float expandGamut;
            public float toneCurveAmount;
            public string outputMode;
            public float displayGamma;
            public string adapter;

            public static DisplayTransferReport From(PostContract source)
            {
                return new DisplayTransferReport
                {
                    mode = source.mode,
                    fixedEv100 = source.fixedExposure.minimumEv100,
                    biasEv = source.fixedExposure.biasEv,
                    exposureMultiplier = source.fixedExposure.multiplier,
                    effectiveGlobalSaturationRgb = source.effectiveGlobalSaturationRgb,
                    filmSlope = source.postProcessSettings.film_slope,
                    filmToe = source.postProcessSettings.film_toe,
                    filmShoulder = source.postProcessSettings.film_shoulder,
                    blueCorrection = source.postProcessSettings.blue_correction,
                    expandGamut = source.postProcessSettings.expand_gamut,
                    toneCurveAmount = source.postProcessSettings.tone_curve_amount,
                    outputMode = source.outputTransfer.mode,
                    displayGamma = source.outputTransfer.displayGamma,
                    adapter = "exact UE 5.8 ACES/film/color transform in a deterministic URP full-screen pass",
                };
            }
        }

        [Serializable]
        private sealed class SkyLightReport
        {
            public bool requested;
            public bool captureAllowed;
            public string status;
            public string failureReason;
            public string mode;
            public string sourceApi;
            public string sourceBasis;
            public string coordinateTransform;
            public string unityBasis;
            public string adapter;
            public float intensity;
            public float rendererIrradianceMultiplier;
            public float[] tintLinear;
            public bool nonnegativeDiffuseClamp;
            public float tolerance;
            public float sourcePairTolerance;
            public float sourceCoefficientPairMaxError;
            public bool sourceCoefficientPairPass;
            public float cpuOracleMaximumError;
            public bool cpuOraclePass;
            public float unityApiMaximumError;
            public bool unityApiPass;
            public float installedCoefficientMaximumError;
            public bool installedProbePass;
            public float[] sourceThreeCoefficients;
            public float[] sourceUnrealCoefficients;
            public float[] adaptedUnityCoefficients;
            public SkyLightOracleProbe[] oracleProbes;
        }

        [Serializable]
        private sealed class SkyLightOracleProbe
        {
            public float[] normalUnity;
            public float[] normalThree;
            public float[] sourceIrradianceBeforeClamp;
            public float[] sourceIrradianceAfterClamp;
            public float[] unityCpuBeforeClamp;
            public float[] unityApiBeforeClamp;
            public float[] unityApiAfterUrpClamp;
        }

        [Serializable]
        private sealed class VisibleSkyReport
        {
            public bool requested;
            public bool captureAllowed;
            public string status;
            public string failureReason;
            public string mode;
            public string sourceMesh;
            public string sourceMaterial;
            public string meshPath;
            public string expectedMeshSha256;
            public string meshSha256;
            public bool meshSha256Pass;
            public string glbGenerator;
            public int meshVertexCount;
            public int meshIndexCount;
            public int meshTriangleCount;
            public int meshInwardTriangleCount;
            public bool meshInwardFacingPass;
            public float[] meshBoundsCenter;
            public float[] meshBoundsSize;
            public float[] meshUvMinimum;
            public float[] meshUvMaximum;
            public string meshCoordinateAdapter;
            public string atlasPath;
            public string expectedAtlasSha256;
            public string actualAtlasSha256;
            public bool atlasSha256Pass;
            public int exrVersion;
            public string exrCompression;
            public string[] exrChannels;
            public int atlasWidth;
            public int atlasHeight;
            public string expectedAtlasRgbaHalfSha256;
            public string atlasRgbaHalfSha256;
            public string expectedClassicDayRowRgbaHalfSha256;
            public string classicDayRowRgbaHalfSha256;
            public bool exrDecodePass;
            [NonSerialized] public byte[] atlasRgbaHalfBytes;
            public string textureFormat;
            public bool textureLinear;
            public int textureMipCount;
            public bool textureRawRoundTripPass;
            public string textureSampleCoordinateAdapter;
            public float textureSampleTolerance;
            public float textureSampleMaximumError;
            public bool textureSamplePass;
            public VisibleSkySampleProbe[] textureSampleProbes;
            public string curve;
            public string curveTime;
            public string sampleU;
            public string sampleV;
            public string exrSampleV;
            public int exrStorageRow;
            public string unityExrSampleV;
            public int unityRawStorageRow;
            public string unityExrRowOriginAdapter;
            public string filter;
            public string address;
            public float brightness;
            public float saturation;
            public bool backgroundClouds;
            public bool cloudShell;
            public float ueGltfBasisYawDegrees;
            public string lightingParticipation;
            public string shaderAsset;
            public string shaderSha256;
            public bool shaderSupported;
            public string adapter;
            public float sourceDomeRadius;
            public float targetDomeRadius;
            public float uniformScale;
            public float[] worldPosition;
            public bool castShadows;
            public bool receiveShadows;
            public string lightProbeUsage;
            public string reflectionProbeUsage;
            public float lightingIsolationTolerance;
            public float ambientProbeMaximumError;
            public bool ambientStateUnchanged;
            public bool reflectionStateUnchanged;
            public bool skyboxStateUnchanged;
            public bool lightingIsolationPass;
        }

        [Serializable]
        private sealed class VisibleSkySampleProbe
        {
            public float curveTime;
            public float[] sampleUv;
            public float[] unityCpuValidationUv;
            public float[] expectedLinearRgba;
            public float[] unityLinearRgba;
            public float maximumError;
        }

        private sealed class VisibleSkySetup
        {
            public VisibleSkyReport report;
            public GameObject root;
            public MeshRenderer renderer;
            public MeshRenderer[] renderers;
        }

        private sealed class ExrAttribute
        {
            public string type;
            public byte[] value;
        }

        [Serializable]
        private sealed class ProjectionProbe
        {
            public string name;
            public float[] worldPosition;
            public float[] viewport;
            public float[] ndc;
        }

        [Serializable]
        private sealed class ParityContract
        {
            public string schema;
            public string checkpoint;
            public string profileId;
            public RenderContract render;
            public CameraContract camera;
            public SunContract sun;
            public SkyLightContract skyLight;
            public SkyContract sky;
            public PostContract post;
            public EngineAdaptersContract engineAdapters;
            public GroundContract ground;
            public RockContract rock;
            public CaptureContract capture;
            public P18StylizedBasicContract p18StylizedBasic;
        }

        [Serializable]
        private sealed class CaptureContract
        {
            public CaptureViewsContract views;
        }

        [Serializable]
        private sealed class CaptureViewsContract
        {
            public CameraContract front;
            public CameraContract back;
            public CameraContract bench;
        }

        [Serializable]
        private sealed class P18StylizedBasicContract
        {
            public P18PropContract[] props;
        }

        [Serializable]
        private sealed class P18PropContract
        {
            public string id;
            public string label;
            public string sourceGlb;
            public string sourceNode;
            public float[] canonicalPositionMeters;
            public float[] canonicalRotationEulerDegrees;
            public float[] canonicalScale;
            public float groundInsetMeters;
            public bool castShadow;
            public bool receiveShadow;
            public P18MaterialOverridesContract materialOverrides;
        }

        [Serializable]
        private sealed class P18MaterialOverridesContract
        {
            public P18MaterialOverrideContract m_benchA;
        }

        [Serializable]
        private sealed class P18MaterialOverrideContract
        {
            public float[] baseColorSrgb;
        }

        [Serializable]
        private sealed class EngineAdaptersContract
        {
            public UnityRadiometricAdapterContract unity;
        }

        [Serializable]
        private sealed class UnityRadiometricAdapterContract
        {
            public string mode;
            public float directRadianceMultiplier;
            public float diffuseSkyIrradianceMultiplier;
            public string derivation;
        }

        [Serializable]
        private sealed class PostContract
        {
            public string mode;
            public FixedExposureContract fixedExposure;
            public PostProcessSettingsContract postProcessSettings;
            public float[] effectiveGlobalSaturationRgb;
            public OutputTransferContract outputTransfer;
            public string[] disabledModules;
        }

        [Serializable]
        private sealed class FixedExposureContract
        {
            public float minimumEv100;
            public float maximumEv100;
            public float biasEv;
            public float multiplier;
        }

        [Serializable]
        private sealed class PostProcessSettingsContract
        {
            public float film_slope;
            public float film_toe;
            public float film_shoulder;
            public float blue_correction;
            public float expand_gamut;
            public float tone_curve_amount;
        }

        [Serializable]
        private sealed class OutputTransferContract
        {
            public string mode;
            public float displayGamma;
        }

        [Serializable]
        private sealed class SkyLightContract
        {
            public string mode;
            public string sourceApi;
            public string basis;
            public string coordinateTransform;
            public float[] colorSrgb8;
            public float intensity;
            public bool nonnegativeDiffuseClamp;
            [NonSerialized] public double[][] threeCoefficients;
            [NonSerialized] public double[][] unrealCoefficients;
        }

        [Serializable]
        private sealed class SkyContract
        {
            public string mode;
            public bool visible;
            public string mesh;
            public string sourceMesh;
            public float[] sourceScale;
            public string material;
            public string atlas;
            public string atlasSha256;
            public string atlasFormat;
            public int atlasWidth;
            public int atlasHeight;
            public int curveRow;
            public string curve;
            public string curveTime;
            public string sampleU;
            public string sampleV;
            public string toonlabExrSampleV;
            public int toonlabExrStorageRow;
            public string toonlabExrRowOriginAdapter;
            public string unityExrSampleV;
            public int unityRawStorageRow;
            public string unityExrRowOriginAdapter;
            public string filter;
            public string address;
            public float brightness;
            public float saturation;
            public bool backgroundClouds;
            public string backgroundCloudTexture;
            public string backgroundCloudTextureSha256;
            public int[] backgroundCloudTextureDimensions;
            public float[] backgroundCloudTint;
            public float backgroundCloudStrength;
            public float backgroundCloudVerticalOffset;
            public float backgroundCloudVerticalStretch;
            public bool cloudShell;
            public string cloudShellMesh;
            public string cloudShellMeshSha256;
            public string cloudShellSourceMesh;
            public string cloudShellMaterial;
            public string cloudShellTexture;
            public string cloudShellTextureSha256;
            public int[] cloudShellTextureDimensions;
            public string cloudShellAtlas;
            public string cloudShellAtlasSha256;
            public string cloudShellAtlasFormat;
            public int cloudShellAtlasWidth;
            public int cloudShellAtlasHeight;
            public int cloudShellCurveRow;
            public string cloudShellCurve;
            public float cloudShellRotationSpeed;
            public float cloudShellDeterministicTime;
            public float cloudShellStrength;
            public float cloudShellVerticalOffset;
            public float cloudShellVerticalStretch;
            public string cloudShellDitherNoiseTexture;
            public string cloudShellDitherNoiseTextureSha256;
            public float cloudShellAlphaClip;
            public float cloudShellGltfUnitsToMeters;
            public float[] cloudShellSourceComponentScale;
            public float unityUeGltfBasisYawDegrees;
            public float[] skySourceComponentScale;
            public float skySourceUnitsToMeters;
            public float unityCameraFarMeters;
            public HeightFogContract heightFog;
            public string lightingParticipation;
        }

        [Serializable]
        private sealed class HeightFogContract
        {
            public bool enabled;
            public float density;
            public float heightFalloff;
            public float heightCentimeters;
            public float[] inscatteringColorLinear;
            public float maxOpacity;
            public float startDistance;
            public bool volumetricFog;
            public string source;
        }

        [Serializable]
        private sealed class GlbRoot
        {
            public GlbAsset asset;
            public int scene;
            public GlbScene[] scenes;
            public GlbNode[] nodes;
            public GlbMesh[] meshes;
            public GlbAccessor[] accessors;
            public GlbBufferView[] bufferViews;
            public GlbMaterial[] materials;
            public GlbTexture[] textures;
            public GlbImage[] images;
        }

        [Serializable]
        private sealed class GlbAsset
        {
            public string version;
            public string generator;
        }

        [Serializable]
        private sealed class GlbScene
        {
            public int[] nodes;
        }

        [Serializable]
        private sealed class GlbNode
        {
            public string name;
            public int mesh = -1;
            public int[] children;
            public float[] matrix;
            public float[] translation;
            public float[] rotation;
            public float[] scale;
        }

        [Serializable]
        private sealed class GlbMesh
        {
            public string name;
            public GlbPrimitive[] primitives;
        }

        [Serializable]
        private sealed class GlbPrimitive
        {
            public GlbAttributes attributes;
            public int indices = -1;
            public int material = -1;
            public int mode = 4;
        }

        [Serializable]
        private sealed class GlbAttributes
        {
            public int POSITION = -1;
            public int NORMAL = -1;
            public int TANGENT = -1;
            public int TEXCOORD_0 = -1;
            public int TEXCOORD_1 = -1;
        }

        [Serializable]
        private sealed class GlbMaterial
        {
            public string name;
            public GlbPbrMetallicRoughness pbrMetallicRoughness;
            public GlbTextureInfo normalTexture;
            public GlbTextureInfo emissiveTexture;
            public float[] emissiveFactor;
            public string alphaMode;
            public float alphaCutoff;
            public bool doubleSided;
        }

        [Serializable]
        private sealed class GlbPbrMetallicRoughness
        {
            public float[] baseColorFactor;
            public GlbTextureInfo baseColorTexture;
            public GlbTextureInfo metallicRoughnessTexture;
            public float metallicFactor = 1.0f;
            public float roughnessFactor = 1.0f;
        }

        [Serializable]
        private sealed class GlbTextureInfo
        {
            public int index = -1;
            public int texCoord;
        }

        [Serializable]
        private sealed class GlbTexture
        {
            public string name;
            public int source = -1;
        }

        [Serializable]
        private sealed class GlbImage
        {
            public string name;
            public string mimeType;
            public int bufferView = -1;
        }

        private sealed class PortableGlbContainer
        {
            public GlbRoot root;
            public byte[] binary;
        }

        [Serializable]
        private sealed class GlbAccessor
        {
            public int bufferView;
            public int byteOffset;
            public int componentType;
            public int count;
            public string type;
        }

        [Serializable]
        private sealed class GlbBufferView
        {
            public int buffer;
            public int byteOffset;
            public int byteLength;
            public int byteStride;
        }

        [Serializable]
        private sealed class RenderContract
        {
            public int width;
            public int height;
            public float[] clearColor;
            public float[] ambientColor;
            public float ambientIntensity;
        }

        [Serializable]
        private sealed class CameraContract
        {
            public float[] position;
            public float[] lookAt;
            public float[] up;
            public float verticalFieldOfViewDegrees;
            public float near;
            public float far;
        }

        [Serializable]
        private sealed class SunContract
        {
            public float[] worldRotationQuaternion;
            public float[] color;
            public float intensity;
            public float shadowStrength;
            public float sourceLightShadowBias;
            public float sourceLightShadowNormalBias;
            public float sourceLightShadowNearPlane;
        }

        [Serializable]
        private sealed class GroundContract
        {
            public float[] position;
            public float[] rotationQuaternion;
            public float[] size;
            public float[] baseColor;
            public float metallic;
            public float smoothness;
            public bool castShadow;
            public bool receiveShadow;
        }

        [Serializable]
        private sealed class RockContract
        {
            public RockTransformContract transform;
            public bool castShadow;
            public bool receiveShadow;
            public UnityRockSource unity;
        }

        [Serializable]
        private sealed class RockTransformContract
        {
            public float[] position;
            public float[] rotationQuaternion;
            public float[] scale;
        }

        [Serializable]
        private sealed class UnityRockSource
        {
            public string mesh;
            public string material;
            public string meshGlb;
            public float[] sourceAxisScale;
            public float sourceYawDegrees;
            public UnityAuthoredRockMaterialSource authoredMaterial;
        }

        [Serializable]
        private sealed class UnityAuthoredRockMaterialSource
        {
            public string mode;
            public string sourceManifest;
            public string shaderSource;
            public string assetFolder;
            public string baseColor;
            public string metallicRoughness;
            public string emissive;
            public string normal;
            public string specular;
            public int texCoord;
            public float[] textureScale;
            public float[] textureOffset;
            public float alphaCutoff;
            public float[] emissiveFactor;
        }

        [Serializable]
        private sealed class TransformRecord
        {
            public float[] position;
            public float[] rotation;
            public float[] scale;

            public static TransformRecord For(Transform transform)
            {
                return new TransformRecord
                {
                    position = new[]
                    {
                        transform.position.x,
                        transform.position.y,
                        transform.position.z,
                    },
                    rotation = new[]
                    {
                        transform.rotation.x,
                        transform.rotation.y,
                        transform.rotation.z,
                        transform.rotation.w,
                    },
                    scale = new[]
                    {
                        transform.lossyScale.x,
                        transform.lossyScale.y,
                        transform.lossyScale.z,
                    },
                };
            }
        }

        [Serializable]
        private sealed class ObjectRecord
        {
            public string name;
            public string prefabPath;
            public string meshPath;
            public TransformRecord transform;
            public int rendererCount;
            public int casterCount;
            public int receiverCount;
            public string[] materialNames;
            public string[] materialPaths;
            public string[] shaderNames;

            public static ObjectRecord For(GameObject instance)
            {
                var renderers = instance.GetComponentsInChildren<Renderer>(true);
                var meshFilter = instance.GetComponentInChildren<MeshFilter>(true);
                return new ObjectRecord
                {
                    name = instance.name,
                    prefabPath = PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(instance),
                    meshPath = meshFilter != null && meshFilter.sharedMesh != null
                        ? AssetDatabase.GetAssetPath(meshFilter.sharedMesh)
                        : null,
                    transform = TransformRecord.For(instance.transform),
                    rendererCount = renderers.Length,
                    casterCount = renderers.Count(renderer =>
                        renderer.shadowCastingMode != ShadowCastingMode.Off),
                    receiverCount = renderers.Count(renderer => renderer.receiveShadows),
                    materialNames = renderers
                        .SelectMany(renderer => renderer.sharedMaterials)
                        .Where(material => material != null)
                        .Select(material => material.name)
                        .Distinct()
                        .OrderBy(name => name)
                        .ToArray(),
                    materialPaths = renderers
                        .SelectMany(renderer => renderer.sharedMaterials)
                        .Where(material => material != null)
                        .Select(AssetDatabase.GetAssetPath)
                        .Distinct()
                        .OrderBy(path => path)
                        .ToArray(),
                    shaderNames = renderers
                        .SelectMany(renderer => renderer.sharedMaterials)
                        .Where(material => material != null && material.shader != null)
                        .Select(material => material.shader.name)
                        .Distinct()
                        .OrderBy(name => name)
                        .ToArray(),
                };
            }
        }
    }
}
#endif
