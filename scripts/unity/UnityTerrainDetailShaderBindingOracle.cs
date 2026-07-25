// Decisive native dispatch oracle for Terrain mesh details.
//
// It renders Camera0 with only Terrain details visible, replaces URP's global
// terrainDetailLitShader with an emissive-magenta probe, flushes Terrain, and
// renders the same frame again. A changed frame proves the hidden Terrain
// shader dispatch; an identical frame proves the source prefab materials own
// these 17 usePrototypeMesh=true draws.

#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace ToonLab.Editor
{
    public static class UnityTerrainDetailShaderBindingOracle
    {
        private const string DefaultScene =
            "Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity";
        private const string ProbeShaderName =
            "Hidden/ToonLab/TerrainDetailBindingProbe";

        [Serializable]
        private sealed class Report
        {
            public string scene;
            public string unityVersion;
            public string originalTerrainDetailShader;
            public string replacementTerrainDetailShader;
            public int width;
            public int height;
            public string baselineRgbaSha256;
            public string detailsDisabledRgbaSha256;
            public string replacementRgbaSha256;
            public int detailsDisabledChangedPixelCount;
            public int replacementVsDetailsDisabledChangedPixelCount;
            public int changedPixelCount;
            public int nonBlackBaselinePixels;
            public int nonBlackReplacementPixels;
            public int magentaBaselinePixels;
            public int magentaReplacementPixels;
            public int maximumChannelDelta;
            public bool replacementShaderSupported;
            public int replacementShaderPassCount;
            public bool resourceMutationAccepted;
            public bool detailDrawVisibleInControl;
            public bool replacementDetailDrawVisible;
            public bool hiddenTerrainDetailShaderDispatched;
            public bool prefabMaterialShaderDispatched;
        }

        public static void Run()
        {
            RenderTexture destination = null;
            UniversalRenderPipelineRuntimeTerrainShaders resources = null;
            Shader originalShader = null;
            try
            {
                var scenePath = Argument("-scene", DefaultScene);
                var output = Path.GetFullPath(Argument(
                    "-output",
                    Path.Combine(Path.GetTempPath(), "toonlab-detail-binding-oracle")));
                var width = IntArgument("-width", 640);
                var height = IntArgument("-height", 360);
                Directory.CreateDirectory(output);
                var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var camera = Resources.FindObjectsOfTypeAll<Camera>()
                    .Where(value => value.gameObject.scene == scene)
                    .Where(value => value.gameObject.activeInHierarchy && value.enabled)
                    .OrderByDescending(value => value.CompareTag("MainCamera"))
                    .FirstOrDefault();
                var terrain = Resources.FindObjectsOfTypeAll<Terrain>()
                    .FirstOrDefault(value => value.gameObject.scene == scene);
                if (camera == null || terrain == null)
                    throw new InvalidOperationException("Mega camera or Terrain is missing.");
                foreach (var behaviour in Resources.FindObjectsOfTypeAll<MonoBehaviour>())
                {
                    if (behaviour != null && behaviour.GetType().Name == "CamearMovement")
                        behaviour.enabled = false;
                }
                foreach (var renderer in Resources.FindObjectsOfTypeAll<Renderer>())
                {
                    if (renderer.gameObject.scene == scene)
                        renderer.enabled = false;
                }

                camera.aspect = (float)width / height;
                camera.ResetProjectionMatrix();
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = Color.black;
                camera.allowHDR = false;
                camera.allowMSAA = false;
                var cameraData = camera.GetUniversalAdditionalCameraData();
                cameraData.renderPostProcessing = false;
                cameraData.antialiasing = AntialiasingMode.None;
                RenderSettings.fog = false;
                RenderSettings.skybox = null;
                // Terrain details are culled with the Terrain render path when the
                // heightmap draw is disabled, so keep the heightmap visible and
                // prove the detail contribution with a separate details-off frame.
                terrain.drawHeightmap = true;
                terrain.treeDistance = 0;
                terrain.detailObjectDistance = 150;
                terrain.detailObjectDensity = 1;
                terrain.Flush();

                destination = new RenderTexture(
                    width,
                    height,
                    24,
                    RenderTextureFormat.ARGB32,
                    RenderTextureReadWrite.sRGB)
                {
                    name = "ToonLabTerrainDetailShaderBindingOracle",
                    antiAliasing = 1,
                    useMipMap = false,
                    autoGenerateMips = false,
                };
                destination.Create();

                var baseline = Render(camera, destination);
                File.WriteAllBytes(
                    Path.Combine(output, "baseline.png"),
                    EncodePng(baseline, width, height));

                terrain.detailObjectDistance = 0;
                terrain.detailObjectDensity = 0;
                terrain.Flush();
                var detailsDisabled = Render(camera, destination);
                File.WriteAllBytes(
                    Path.Combine(output, "details-disabled.png"),
                    EncodePng(detailsDisabled, width, height));

                terrain.detailObjectDistance = 150;
                terrain.detailObjectDensity = 1;
                terrain.Flush();

                if (!GraphicsSettings.TryGetRenderPipelineSettings<
                    UniversalRenderPipelineRuntimeTerrainShaders>(out resources))
                    throw new InvalidOperationException("URP Terrain runtime shader settings are missing.");
                originalShader = resources.terrainDetailLitShader;
                var replacementShader = Shader.Find(ProbeShaderName);
                if (replacementShader == null)
                    throw new InvalidOperationException("Probe shader was not imported: " + ProbeShaderName);
                resources.terrainDetailLitShader = replacementShader;
                var resourceMutationAccepted =
                    resources.terrainDetailLitShader == replacementShader;
                terrain.enabled = false;
                terrain.enabled = true;
                terrain.Flush();
                var replacement = Render(camera, destination);
                File.WriteAllBytes(
                    Path.Combine(output, "replacement.png"),
                    EncodePng(replacement, width, height));

                var changed = 0;
                var detailsDisabledChanged = 0;
                var replacementVsDetailsDisabledChanged = 0;
                var nonBlackBaseline = 0;
                var nonBlackReplacement = 0;
                var magentaBaseline = 0;
                var magentaReplacement = 0;
                var maximumDelta = 0;
                for (var offset = 0; offset < baseline.Length; offset += 4)
                {
                    var pixelChanged = false;
                    var detailsDisabledPixelChanged = false;
                    var replacementDetailsDisabledPixelChanged = false;
                    for (var channel = 0; channel < 4; channel += 1)
                    {
                        var delta = Math.Abs(baseline[offset + channel] -
                            replacement[offset + channel]);
                        maximumDelta = Math.Max(maximumDelta, delta);
                        pixelChanged |= delta != 0;
                        detailsDisabledPixelChanged |= baseline[offset + channel] !=
                            detailsDisabled[offset + channel];
                        replacementDetailsDisabledPixelChanged |=
                            replacement[offset + channel] != detailsDisabled[offset + channel];
                    }
                    if (pixelChanged) changed += 1;
                    if (detailsDisabledPixelChanged) detailsDisabledChanged += 1;
                    if (replacementDetailsDisabledPixelChanged)
                        replacementVsDetailsDisabledChanged += 1;
                    if (baseline[offset] != 0 || baseline[offset + 1] != 0 || baseline[offset + 2] != 0)
                        nonBlackBaseline += 1;
                    if (replacement[offset] != 0 || replacement[offset + 1] != 0 || replacement[offset + 2] != 0)
                        nonBlackReplacement += 1;
                    if (baseline[offset] > 240 && baseline[offset + 1] < 16 && baseline[offset + 2] > 240)
                        magentaBaseline += 1;
                    if (replacement[offset] > 240 && replacement[offset + 1] < 16 && replacement[offset + 2] > 240)
                        magentaReplacement += 1;
                }
                var report = new Report
                {
                    scene = scenePath,
                    unityVersion = Application.unityVersion,
                    originalTerrainDetailShader = originalShader == null
                        ? string.Empty
                        : originalShader.name,
                    replacementTerrainDetailShader = replacementShader.name,
                    width = width,
                    height = height,
                    baselineRgbaSha256 = Sha256(baseline),
                    detailsDisabledRgbaSha256 = Sha256(detailsDisabled),
                    replacementRgbaSha256 = Sha256(replacement),
                    detailsDisabledChangedPixelCount = detailsDisabledChanged,
                    replacementVsDetailsDisabledChangedPixelCount =
                        replacementVsDetailsDisabledChanged,
                    changedPixelCount = changed,
                    nonBlackBaselinePixels = nonBlackBaseline,
                    nonBlackReplacementPixels = nonBlackReplacement,
                    magentaBaselinePixels = magentaBaseline,
                    magentaReplacementPixels = magentaReplacement,
                    maximumChannelDelta = maximumDelta,
                    replacementShaderSupported = replacementShader.isSupported,
                    replacementShaderPassCount = replacementShader.passCount,
                    resourceMutationAccepted = resourceMutationAccepted,
                    detailDrawVisibleInControl = detailsDisabledChanged > 0,
                    replacementDetailDrawVisible =
                        replacementVsDetailsDisabledChanged > 0,
                    hiddenTerrainDetailShaderDispatched =
                        resourceMutationAccepted &&
                        replacementShader.isSupported &&
                        detailsDisabledChanged > 0 &&
                        changed > 0 &&
                        magentaReplacement > magentaBaseline,
                    prefabMaterialShaderDispatched =
                        resourceMutationAccepted &&
                        replacementShader.isSupported &&
                        detailsDisabledChanged > 0 &&
                        replacementVsDetailsDisabledChanged > 0 &&
                        magentaReplacement == magentaBaseline,
                };
                File.WriteAllText(
                    Path.Combine(output, "report.json"),
                    JsonUtility.ToJson(report, true));
                resources.terrainDetailLitShader = originalShader;
                Debug.Log("TOONLAB_UNITY_DETAIL_BINDING_ORACLE=" + output);
                Debug.Log("TOONLAB_UNITY_DETAIL_HIDDEN_DISPATCH=" +
                    report.hiddenTerrainDetailShaderDispatched);
                Debug.Log("TOONLAB_UNITY_DETAIL_PREFAB_DISPATCH=" +
                    report.prefabMaterialShaderDispatched);
                destination.Release();
                UnityEngine.Object.DestroyImmediate(destination);
                destination = null;
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                if (resources != null && originalShader != null)
                    resources.terrainDetailLitShader = originalShader;
                if (destination != null)
                {
                    destination.Release();
                    UnityEngine.Object.DestroyImmediate(destination);
                }
                Debug.LogException(exception);
                EditorApplication.Exit(1);
            }
        }

        private static byte[] Render(Camera camera, RenderTexture destination)
        {
            var request = new UniversalRenderPipeline.SingleCameraRequest
            {
                destination = destination,
            };
            RenderPipeline.SubmitRenderRequest(camera, request);
            var previous = RenderTexture.active;
            RenderTexture.active = destination;
            var texture = new Texture2D(
                destination.width,
                destination.height,
                TextureFormat.RGBA32,
                false,
                false);
            texture.ReadPixels(
                new Rect(0, 0, destination.width, destination.height),
                0,
                0,
                false);
            texture.Apply(false, false);
            var bytes = texture.GetRawTextureData<byte>().ToArray();
            RenderTexture.active = previous;
            UnityEngine.Object.DestroyImmediate(texture);
            return bytes;
        }

        private static byte[] EncodePng(byte[] rgba, int width, int height)
        {
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false, false);
            texture.LoadRawTextureData(rgba);
            texture.Apply(false, false);
            var png = texture.EncodeToPNG();
            UnityEngine.Object.DestroyImmediate(texture);
            return png;
        }

        private static string Sha256(byte[] bytes)
        {
            using (var sha = SHA256.Create())
                return string.Concat(sha.ComputeHash(bytes).Select(value => value.ToString("x2")));
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
    }
}
#endif
