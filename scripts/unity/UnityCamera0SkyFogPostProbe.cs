// Native source-state probe for the shipped Mega demo Camera 0 atmosphere.
//
// Run under a real graphics device (for example `-batchmode -force-metal`,
// never `-nographics`) so URP uploads its final fog globals before they are
// read. This script does not mutate or save the source scene.

#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace ToonLab.Editor
{
    public static class UnityCamera0SkyFogPostProbe
    {
        private const string DefaultScene =
            "Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity";

        [Serializable]
        private sealed class ParameterRecord<T>
        {
            public bool overrideState;
            public T value;
        }

        [Serializable]
        private sealed class ColorAdjustmentsRecord
        {
            public bool present;
            public bool active;
            public ParameterRecord<float> postExposure;
            public ParameterRecord<float> contrast;
            public ParameterRecord<float[]> colorFilter;
            public ParameterRecord<float[]> colorFilterLinear;
            public ParameterRecord<float> hueShift;
            public ParameterRecord<float> saturation;
        }

        [Serializable]
        private sealed class BloomRecord
        {
            public bool present;
            public bool active;
            public ParameterRecord<float> threshold;
            public ParameterRecord<float> intensity;
            public ParameterRecord<float> scatter;
            public ParameterRecord<float> clamp;
            public ParameterRecord<float[]> tint;
            public ParameterRecord<float[]> tintLinear;
            public ParameterRecord<bool> highQualityFiltering;
            public ParameterRecord<int> maxIterations;
        }

        [Serializable]
        private sealed class VignetteRecord
        {
            public bool present;
            public bool active;
            public ParameterRecord<float[]> color;
            public ParameterRecord<float[]> center;
            public ParameterRecord<float> intensity;
            public ParameterRecord<float> smoothness;
            public ParameterRecord<bool> rounded;
        }

        [Serializable]
        private sealed class DepthOfFieldRecord
        {
            public bool present;
            public bool active;
            public ParameterRecord<int> mode;
            public ParameterRecord<float> gaussianStart;
            public ParameterRecord<float> gaussianEnd;
            public ParameterRecord<float> gaussianMaxRadius;
            public ParameterRecord<bool> highQualitySampling;
        }

        [Serializable]
        private sealed class SkyRendererRecord
        {
            public string hierarchyPath;
            public string mesh;
            public int vertexCount;
            public string material;
            public string shader;
            public int renderQueue;
            public bool enabled;
            public string shadowCastingMode;
            public bool receiveShadows;
            public float[] worldPosition;
            public float[] worldRotation;
            public float[] worldScale;
            public float[] boundsCenter;
            public float[] boundsSize;
            public bool cameraInsideBounds;
            public float[] uvMinimum;
            public float[] uvMaximum;
        }

        [Serializable]
        private sealed class Report
        {
            public string scene;
            public string unityVersion;
            public string colorSpace;
            public string quality;
            public string pipeline;
            public string renderer;
            public string camera;
            public float[] cameraPosition;
            public float[] cameraRotation;
            public float fieldOfView;
            public float nearClipPlane;
            public float farClipPlane;
            public string clearFlags;
            public float[] backgroundColor;
            public float[] backgroundColorLinear;
            public bool allowHdr;
            public bool allowMsaa;
            public bool renderPostProcessing;
            public string antialiasing;
            public bool fogEnabled;
            public string fogMode;
            public float fogDensity;
            public float[] fogColor;
            public float[] fogColorLinear;
            public float[] unityFogParams;
            public float[] unityFogColor;
            public string[] globalFogKeywords;
            public string renderSettingsSkybox;
            public string volume;
            public string volumeProfile;
            public bool volumeIsGlobal;
            public float volumeWeight;
            public float volumePriority;
            public ColorAdjustmentsRecord colorAdjustments;
            public BloomRecord bloom;
            public VignetteRecord vignette;
            public DepthOfFieldRecord depthOfField;
            public bool tonemappingPresent;
            public bool tonemappingActive;
            public string tonemappingMode;
            public SkyRendererRecord[] skyRenderers;
        }

        public static void Run()
        {
            RenderTexture destination = null;
            try
            {
                var scenePath = Argument("-scene", DefaultScene);
                var output = Path.GetFullPath(Argument(
                    "-output",
                    Path.Combine(Path.GetTempPath(), "toonlab-camera0-atmosphere.json")));
                var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var camera = Resources.FindObjectsOfTypeAll<Camera>()
                    .Where(value => value.gameObject.scene == scene)
                    .Where(value => value.gameObject.activeInHierarchy && value.enabled)
                    .OrderBy(value => HierarchyPath(value.transform))
                    .FirstOrDefault();
                if (camera == null)
                    throw new InvalidOperationException("Mega Camera 0 is missing.");
                foreach (var behaviour in Resources.FindObjectsOfTypeAll<MonoBehaviour>())
                {
                    if (behaviour != null && behaviour.GetType().Name == "CamearMovement")
                        behaviour.enabled = false;
                }

                camera.aspect = 16f / 9f;
                camera.ResetProjectionMatrix();
                destination = new RenderTexture(
                    320,
                    180,
                    24,
                    RenderTextureFormat.ARGBHalf,
                    RenderTextureReadWrite.Linear)
                {
                    antiAliasing = 1,
                    useMipMap = false,
                    autoGenerateMips = false,
                };
                destination.Create();
                var request = new UniversalRenderPipeline.SingleCameraRequest
                {
                    destination = destination,
                };
                RenderPipeline.SubmitRenderRequest(camera, request);

                var cameraData = camera.GetUniversalAdditionalCameraData();
                var pipeline = GraphicsSettings.currentRenderPipeline as
                    UniversalRenderPipelineAsset;
                var volume = Resources.FindObjectsOfTypeAll<Volume>()
                    .FirstOrDefault(value => value.gameObject.scene == scene &&
                        value.gameObject.activeInHierarchy && value.enabled);
                var profile = volume == null ? null : volume.sharedProfile;

                var report = new Report
                {
                    scene = scenePath,
                    unityVersion = Application.unityVersion,
                    colorSpace = QualitySettings.activeColorSpace.ToString(),
                    quality = QualitySettings.names[QualitySettings.GetQualityLevel()],
                    pipeline = pipeline == null ? string.Empty : pipeline.name,
                    renderer = pipeline == null || pipeline.scriptableRenderer == null
                        ? string.Empty
                        : pipeline.scriptableRenderer.GetType().Name,
                    camera = HierarchyPath(camera.transform),
                    cameraPosition = Vector(camera.transform.position),
                    cameraRotation = Quaternion(camera.transform.rotation),
                    fieldOfView = camera.fieldOfView,
                    nearClipPlane = camera.nearClipPlane,
                    farClipPlane = camera.farClipPlane,
                    clearFlags = camera.clearFlags.ToString(),
                    backgroundColor = Color(camera.backgroundColor),
                    backgroundColorLinear = Color(camera.backgroundColor.linear),
                    allowHdr = camera.allowHDR,
                    allowMsaa = camera.allowMSAA,
                    renderPostProcessing = cameraData.renderPostProcessing,
                    antialiasing = cameraData.antialiasing.ToString(),
                    fogEnabled = RenderSettings.fog,
                    fogMode = RenderSettings.fogMode.ToString(),
                    fogDensity = RenderSettings.fogDensity,
                    fogColor = Color(RenderSettings.fogColor),
                    fogColorLinear = Color(RenderSettings.fogColor.linear),
                    unityFogParams = Vector(Shader.GetGlobalVector("unity_FogParams")),
                    unityFogColor = Vector(Shader.GetGlobalVector("unity_FogColor")),
                    globalFogKeywords = Shader.globalKeywords
                        .Select(value => value.name)
                        .Where(value => value.IndexOf("FOG", StringComparison.OrdinalIgnoreCase) >= 0)
                        .OrderBy(value => value)
                        .ToArray(),
                    renderSettingsSkybox = RenderSettings.skybox == null
                        ? string.Empty
                        : RenderSettings.skybox.name,
                    volume = volume == null ? string.Empty : HierarchyPath(volume.transform),
                    volumeProfile = profile == null ? string.Empty : AssetDatabase.GetAssetPath(profile),
                    volumeIsGlobal = volume != null && volume.isGlobal,
                    volumeWeight = volume == null ? 0 : volume.weight,
                    volumePriority = volume == null ? 0 : volume.priority,
                    colorAdjustments = ReadColorAdjustments(profile),
                    bloom = ReadBloom(profile),
                    vignette = ReadVignette(profile),
                    depthOfField = ReadDepthOfField(profile),
                    skyRenderers = Resources.FindObjectsOfTypeAll<MeshRenderer>()
                        .Where(value => value.gameObject.scene == scene)
                        .Where(value => HierarchyPath(value.transform).StartsWith("P_Sky/"))
                        .OrderBy(value => HierarchyPath(value.transform))
                        .Select(value => ReadSkyRenderer(value, camera))
                        .ToArray(),
                };
                Tonemapping tonemapping = null;
                report.tonemappingPresent = profile != null && profile.TryGet(out tonemapping);
                report.tonemappingActive = report.tonemappingPresent && tonemapping.active;
                report.tonemappingMode = report.tonemappingPresent
                    ? tonemapping.mode.value.ToString()
                    : string.Empty;

                Directory.CreateDirectory(Path.GetDirectoryName(output));
                File.WriteAllText(output, JsonUtility.ToJson(report, true));
                Debug.Log("TOONLAB_CAMERA0_ATMOSPHERE=" + output);
                destination.Release();
                UnityEngine.Object.DestroyImmediate(destination);
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                if (destination != null)
                {
                    destination.Release();
                    UnityEngine.Object.DestroyImmediate(destination);
                }
                Debug.LogException(exception);
                EditorApplication.Exit(1);
            }
        }

        private static ColorAdjustmentsRecord ReadColorAdjustments(VolumeProfile profile)
        {
            ColorAdjustments value;
            if (profile == null || !profile.TryGet(out value))
                return new ColorAdjustmentsRecord { present = false };
            return new ColorAdjustmentsRecord
            {
                present = true,
                active = value.active,
                postExposure = Parameter(value.postExposure),
                contrast = Parameter(value.contrast),
                colorFilter = ColorParameter(value.colorFilter),
                colorFilterLinear = LinearColorParameter(value.colorFilter),
                hueShift = Parameter(value.hueShift),
                saturation = Parameter(value.saturation),
            };
        }

        private static BloomRecord ReadBloom(VolumeProfile profile)
        {
            Bloom value;
            if (profile == null || !profile.TryGet(out value))
                return new BloomRecord { present = false };
            return new BloomRecord
            {
                present = true,
                active = value.active,
                threshold = Parameter(value.threshold),
                intensity = Parameter(value.intensity),
                scatter = Parameter(value.scatter),
                clamp = Parameter(value.clamp),
                tint = ColorParameter(value.tint),
                tintLinear = LinearColorParameter(value.tint),
                highQualityFiltering = Parameter(value.highQualityFiltering),
                maxIterations = Parameter(value.maxIterations),
            };
        }

        private static VignetteRecord ReadVignette(VolumeProfile profile)
        {
            Vignette value;
            if (profile == null || !profile.TryGet(out value))
                return new VignetteRecord { present = false };
            return new VignetteRecord
            {
                present = true,
                active = value.active,
                color = ColorParameter(value.color),
                center = new ParameterRecord<float[]>
                {
                    overrideState = value.center.overrideState,
                    value = new[] { value.center.value.x, value.center.value.y },
                },
                intensity = Parameter(value.intensity),
                smoothness = Parameter(value.smoothness),
                rounded = Parameter(value.rounded),
            };
        }

        private static DepthOfFieldRecord ReadDepthOfField(VolumeProfile profile)
        {
            DepthOfField value;
            if (profile == null || !profile.TryGet(out value))
                return new DepthOfFieldRecord { present = false };
            return new DepthOfFieldRecord
            {
                present = true,
                active = value.active,
                mode = new ParameterRecord<int>
                {
                    overrideState = value.mode.overrideState,
                    value = (int)value.mode.value,
                },
                gaussianStart = Parameter(value.gaussianStart),
                gaussianEnd = Parameter(value.gaussianEnd),
                gaussianMaxRadius = Parameter(value.gaussianMaxRadius),
                highQualitySampling = Parameter(value.highQualitySampling),
            };
        }

        private static SkyRendererRecord ReadSkyRenderer(
            MeshRenderer renderer,
            Camera camera)
        {
            var filter = renderer.GetComponent<MeshFilter>();
            var mesh = filter == null ? null : filter.sharedMesh;
            var material = renderer.sharedMaterial;
            var uv = mesh == null ? null : mesh.uv;
            var minimum = new Vector2(float.PositiveInfinity, float.PositiveInfinity);
            var maximum = new Vector2(float.NegativeInfinity, float.NegativeInfinity);
            if (uv != null)
            {
                foreach (var value in uv)
                {
                    minimum = Vector2.Min(minimum, value);
                    maximum = Vector2.Max(maximum, value);
                }
            }
            if (uv == null || uv.Length == 0)
            {
                minimum = Vector2.zero;
                maximum = Vector2.zero;
            }
            return new SkyRendererRecord
            {
                hierarchyPath = HierarchyPath(renderer.transform),
                mesh = mesh == null ? string.Empty : mesh.name,
                vertexCount = mesh == null ? 0 : mesh.vertexCount,
                material = material == null ? string.Empty : material.name,
                shader = material == null || material.shader == null
                    ? string.Empty
                    : material.shader.name,
                renderQueue = material == null ? 0 : material.renderQueue,
                enabled = renderer.enabled,
                shadowCastingMode = renderer.shadowCastingMode.ToString(),
                receiveShadows = renderer.receiveShadows,
                worldPosition = Vector(renderer.transform.position),
                worldRotation = Quaternion(renderer.transform.rotation),
                worldScale = Vector(renderer.transform.lossyScale),
                boundsCenter = Vector(renderer.bounds.center),
                boundsSize = Vector(renderer.bounds.size),
                cameraInsideBounds = renderer.bounds.Contains(camera.transform.position),
                uvMinimum = new[] { minimum.x, minimum.y },
                uvMaximum = new[] { maximum.x, maximum.y },
            };
        }

        private static ParameterRecord<float> Parameter(FloatParameter value)
        {
            return new ParameterRecord<float>
            {
                overrideState = value.overrideState,
                value = value.value,
            };
        }

        private static ParameterRecord<float> Parameter(ClampedFloatParameter value)
        {
            return new ParameterRecord<float>
            {
                overrideState = value.overrideState,
                value = value.value,
            };
        }

        private static ParameterRecord<float> Parameter(MinFloatParameter value)
        {
            return new ParameterRecord<float>
            {
                overrideState = value.overrideState,
                value = value.value,
            };
        }

        private static ParameterRecord<int> Parameter(ClampedIntParameter value)
        {
            return new ParameterRecord<int>
            {
                overrideState = value.overrideState,
                value = value.value,
            };
        }

        private static ParameterRecord<bool> Parameter(BoolParameter value)
        {
            return new ParameterRecord<bool>
            {
                overrideState = value.overrideState,
                value = value.value,
            };
        }

        private static ParameterRecord<float[]> ColorParameter(ColorParameter value)
        {
            return new ParameterRecord<float[]>
            {
                overrideState = value.overrideState,
                value = Color(value.value),
            };
        }

        private static ParameterRecord<float[]> LinearColorParameter(ColorParameter value)
        {
            return new ParameterRecord<float[]>
            {
                overrideState = value.overrideState,
                value = Color(value.value.linear),
            };
        }

        private static float[] Vector(Vector3 value)
        {
            return new[] { value.x, value.y, value.z };
        }

        private static float[] Vector(Vector4 value)
        {
            return new[] { value.x, value.y, value.z, value.w };
        }

        private static float[] Quaternion(Quaternion value)
        {
            return new[] { value.x, value.y, value.z, value.w };
        }

        private static float[] Color(Color value)
        {
            return new[] { value.r, value.g, value.b, value.a };
        }

        private static string HierarchyPath(Transform transform)
        {
            var names = new System.Collections.Generic.List<string>();
            for (var value = transform; value != null; value = value.parent)
                names.Add(value.name);
            names.Reverse();
            return string.Join("/", names);
        }

        private static string Argument(string name, string fallback)
        {
            var args = Environment.GetCommandLineArgs();
            var index = Array.IndexOf(args, name);
            return index >= 0 && index + 1 < args.Length ? args[index + 1] : fallback;
        }
    }
}
#endif
