// Batch-mode oracle capture for the supplied So Stylized Unity project.
//
// Usage (arguments after -executeMethod are optional):
//   Unity -batchmode -projectPath <project> \
//     -executeMethod ToonLab.Editor.UnityParityCapture.Run \
//     -scene Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity \
//     -output /tmp/toonlab-unity-oracle.png -width 1920 -height 1080
//
// Do not pass Unity's command-line `-quit`: capture is asynchronous across
// play-mode frames and this class exits the editor itself only after the PNG
// and settings report have been written. `-quit` can terminate the editor
// immediately after Run() returns, before Tick() renders the first frame.

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
    public static class UnityParityCapture
    {
        private const string DefaultScene =
            "Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity";
        private const string PendingKey = "ToonLab.UnityParityCapture.Pending";
        private const string SceneKey = "ToonLab.UnityParityCapture.Scene";
        private const string OutputKey = "ToonLab.UnityParityCapture.Output";
        private const string WidthKey = "ToonLab.UnityParityCapture.Width";
        private const string HeightKey = "ToonLab.UnityParityCapture.Height";
        private const string FramesKey = "ToonLab.UnityParityCapture.Frames";

        private static string s_ScenePath;
        private static string s_OutputPath;
        private static int s_Width;
        private static int s_Height;
        private static int s_PlayFrames;
        private static int s_RenderedFrames;
        private static bool s_PreviousEnterPlayModeOptionsEnabled;
        private static EnterPlayModeOptions s_PreviousEnterPlayModeOptions;
        private static float s_PreviousTimeScale;
        private static bool s_TimeFrozen;
        private static Camera s_Camera;
        private static RenderTexture s_RenderTexture;

        [InitializeOnLoadMethod]
        private static void ResumePendingCapture()
        {
            if (!SessionState.GetBool(PendingKey, false))
                return;

            s_ScenePath = SessionState.GetString(SceneKey, DefaultScene);
            s_OutputPath = SessionState.GetString(
                OutputKey,
                Path.Combine(Path.GetTempPath(), "toonlab-unity-oracle.png"));
            s_Width = SessionState.GetInt(WidthKey, 1920);
            s_Height = SessionState.GetInt(HeightKey, 1080);
            s_PlayFrames = SessionState.GetInt(FramesKey, 32);
            EditorApplication.update -= Tick;
            EditorApplication.update += Tick;
        }

        public static void Run()
        {
            s_ScenePath = Argument("-scene", DefaultScene);
            s_OutputPath = Path.GetFullPath(Argument(
                "-output",
                Path.Combine(Path.GetTempPath(), "toonlab-unity-oracle.png")));
            s_Width = IntArgument("-width", 1920);
            s_Height = IntArgument("-height", 1080);
            s_PlayFrames = IntArgument("-frames", 32);
            s_RenderedFrames = 0;
            s_TimeFrozen = false;
            s_Camera = null;
            CleanupRenderTarget();
            SessionState.SetBool(PendingKey, true);
            SessionState.SetString(SceneKey, s_ScenePath);
            SessionState.SetString(OutputKey, s_OutputPath);
            SessionState.SetInt(WidthKey, s_Width);
            SessionState.SetInt(HeightKey, s_Height);
            SessionState.SetInt(FramesKey, s_PlayFrames);

            var scene = EditorSceneManager.OpenScene(s_ScenePath, OpenSceneMode.Single);
            if (!scene.IsValid())
                throw new InvalidOperationException($"Could not open Unity scene: {s_ScenePath}");

            Directory.CreateDirectory(Path.GetDirectoryName(s_OutputPath) ?? Path.GetTempPath());
            s_PreviousEnterPlayModeOptionsEnabled = EditorSettings.enterPlayModeOptionsEnabled;
            s_PreviousEnterPlayModeOptions = EditorSettings.enterPlayModeOptions;
            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;

            EditorApplication.update -= Tick;
            EditorApplication.update += Tick;
            EditorApplication.EnterPlaymode();
        }

        private static void Tick()
        {
            try
            {
                if (!EditorApplication.isPlaying || EditorApplication.isPaused)
                    return;

                if (s_Camera == null)
                {
                    s_Camera = Resources.FindObjectsOfTypeAll<Camera>()
                        .Where(candidate => candidate.gameObject.scene.IsValid())
                        .Where(candidate => candidate.gameObject.activeInHierarchy && candidate.enabled)
                        .OrderByDescending(candidate => candidate.CompareTag("MainCamera"))
                        .FirstOrDefault();
                    if (s_Camera == null)
                        return;

                    foreach (var behaviour in Resources.FindObjectsOfTypeAll<MonoBehaviour>())
                    {
                        if (behaviour != null && behaviour.GetType().Name == "CamearMovement")
                            behaviour.enabled = false;
                    }

                    // Shader Graph Time reads _TimeParameters.x. The previous
                    // capture accumulated 32 TAA frames while Time advanced,
                    // so foliage geometry in the PNG had no single wind phase
                    // that the web reconstruction could reproduce. Freeze
                    // scaled Unity time before the first submitted frame and
                    // report the resulting shader global verbatim.
                    s_PreviousTimeScale = Time.timeScale;
                    Time.timeScale = 0.0f;
                    s_TimeFrozen = true;

                    // The edit-time Game View for this project is 4:3, while
                    // the parity target is 1920x1080. SingleCameraRequest
                    // temporarily binds the destination RenderTexture, but an
                    // explicit aspect makes the capture projection independent
                    // from editor window state and gives the web port one
                    // immutable projection authority.
                    s_Camera.aspect = (float)s_Width / s_Height;
                    s_Camera.ResetProjectionMatrix();
                    Shader.WarmupAllShaders();
                    s_RenderTexture = new RenderTexture(
                        s_Width,
                        s_Height,
                        24,
                        RenderTextureFormat.ARGB32,
                        RenderTextureReadWrite.sRGB)
                    {
                        antiAliasing = 1,
                        name = "ToonLab.UnityParityCapture",
                        useMipMap = false,
                        autoGenerateMips = false,
                    };
                    s_RenderTexture.Create();
                }

                var request = new UniversalRenderPipeline.SingleCameraRequest
                {
                    destination = s_RenderTexture,
                };
                RenderPipeline.SubmitRenderRequest(s_Camera, request);
                s_RenderedFrames += 1;
                if (s_RenderedFrames < s_PlayFrames)
                {
                    EditorApplication.QueuePlayerLoopUpdate();
                    return;
                }

                SaveCapture();
                ClearPendingCapture();
                RestoreEditorSettings();
                EditorApplication.update -= Tick;
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
                CleanupRenderTarget();
                ClearPendingCapture();
                RestoreEditorSettings();
                EditorApplication.update -= Tick;
                EditorApplication.Exit(1);
            }
        }

        private static void SaveCapture()
        {
            var previous = RenderTexture.active;
            RenderTexture.active = s_RenderTexture;
            var pixels = new Texture2D(
                s_Width,
                s_Height,
                TextureFormat.RGBA32,
                false,
                false);
            pixels.ReadPixels(new Rect(0, 0, s_Width, s_Height), 0, 0, false);
            pixels.Apply(false, false);
            File.WriteAllBytes(s_OutputPath, pixels.EncodeToPNG());
            RenderTexture.active = previous;

            var cameraData = s_Camera.GetUniversalAdditionalCameraData();
            var scene = s_Camera.gameObject.scene;
            var directional = Resources.FindObjectsOfTypeAll<Light>()
                .Where(light => light.gameObject.scene == scene)
                .Where(light => light.gameObject.activeInHierarchy && light.enabled)
                .FirstOrDefault(light => light.type == LightType.Directional);
            var reportPath = Path.ChangeExtension(s_OutputPath, ".txt");
            File.WriteAllText(reportPath, BuildReport(
                s_ScenePath,
                s_Camera,
                cameraData,
                directional,
                s_Width,
                s_Height));

            UnityEngine.Object.DestroyImmediate(pixels);
            CleanupRenderTarget();
            Debug.Log($"TOONLAB_UNITY_CAPTURE={s_OutputPath}");
            Debug.Log($"TOONLAB_UNITY_REPORT={reportPath}");
        }

        private static void CleanupRenderTarget()
        {
            if (s_RenderTexture == null)
                return;
            s_RenderTexture.Release();
            UnityEngine.Object.DestroyImmediate(s_RenderTexture);
            s_RenderTexture = null;
        }

        private static void ClearPendingCapture()
        {
            SessionState.EraseBool(PendingKey);
            SessionState.EraseString(SceneKey);
            SessionState.EraseString(OutputKey);
            SessionState.EraseInt(WidthKey);
            SessionState.EraseInt(HeightKey);
            SessionState.EraseInt(FramesKey);
        }

        private static void RestoreEditorSettings()
        {
            if (s_TimeFrozen)
            {
                Time.timeScale = s_PreviousTimeScale;
                s_TimeFrozen = false;
            }
            EditorSettings.enterPlayModeOptionsEnabled = s_PreviousEnterPlayModeOptionsEnabled;
            EditorSettings.enterPlayModeOptions = s_PreviousEnterPlayModeOptions;
        }

        private static string BuildReport(
            string scenePath,
            Camera camera,
            UniversalAdditionalCameraData cameraData,
            Light directional,
            int width,
            int height)
        {
            var sun = directional == null
                ? "none"
                : string.Join(",", new[]
                {
                    $"name={directional.name}",
                    $"rotation={directional.transform.rotation.eulerAngles}",
                    $"forward={directional.transform.forward}",
                    $"color={directional.color}",
                    $"intensity={directional.intensity:R}",
                    $"shadows={directional.shadows}",
                    $"shadowStrength={directional.shadowStrength:R}",
                    $"shadowBias={directional.shadowBias:R}",
                    $"shadowNormalBias={directional.shadowNormalBias:R}",
                    $"shadowNearPlane={directional.shadowNearPlane:R}",
                });

            var ambientProbe = RenderSettings.ambientProbe;
            var ambientProbeLines = Enumerable.Range(0, 9)
                .Select(index => string.Join(",", new[]
                {
                    ambientProbe[0, index].ToString("R"),
                    ambientProbe[1, index].ToString("R"),
                    ambientProbe[2, index].ToString("R"),
                }))
                .ToArray();

            var pipeline = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            var pipelineSummary = pipeline == null
                ? "none"
                : string.Join(",", new[]
                {
                    $"name={pipeline.name}",
                    $"renderScale={pipeline.renderScale:R}",
                    $"msaa={pipeline.msaaSampleCount}",
                    $"hdr={pipeline.supportsHDR}",
                    $"shadowDistance={pipeline.shadowDistance:R}",
                    $"shadowCascades={pipeline.shadowCascadeCount}",
                    $"mainShadowResolution={pipeline.mainLightShadowmapResolution}",
                    $"additionalLights={pipeline.additionalLightsRenderingMode}",
                });
            var customReflection = RenderSettings.defaultReflectionMode == DefaultReflectionMode.Custom
                ? (RenderSettings.customReflection == null
                    ? "none"
                    : RenderSettings.customReflection.name)
                : "not-custom";
            var shaderTimeParameters = Shader.GetGlobalVector("_TimeParameters");

            return string.Join("\n", new[]
            {
                $"scene={scenePath}",
                $"resolution={width}x{height}",
                $"capture.aspect={(float)width / height:R}",
                $"capture.accumulatedFrames={s_PlayFrames}",
                $"capture.timeScale={Time.timeScale:R}",
                $"capture.time={Time.time:R}",
                $"capture.unscaledTime={Time.unscaledTime:R}",
                $"capture.shaderTimeParameters={shaderTimeParameters.x:R},{shaderTimeParameters.y:R},{shaderTimeParameters.z:R},{shaderTimeParameters.w:R}",
                $"colorSpace={QualitySettings.activeColorSpace}",
                $"quality={QualitySettings.names[QualitySettings.GetQualityLevel()]}",
                $"camera.name={camera.name}",
                $"camera.position={camera.transform.position}",
                $"camera.rotation={camera.transform.rotation.eulerAngles}",
                $"camera.fieldOfView={camera.fieldOfView:R}",
                $"camera.aspect={camera.aspect:R}",
                $"camera.near={camera.nearClipPlane:R}",
                $"camera.far={camera.farClipPlane:R}",
                $"camera.worldToCameraMatrix={MatrixToString(camera.worldToCameraMatrix)}",
                $"camera.projectionMatrix={MatrixToString(camera.projectionMatrix)}",
                $"camera.hdr={camera.allowHDR}",
                $"camera.msaa={camera.allowMSAA}",
                $"camera.post={cameraData.renderPostProcessing}",
                $"camera.antialiasing={cameraData.antialiasing}",
                $"fog.enabled={RenderSettings.fog}",
                $"fog.mode={RenderSettings.fogMode}",
                $"fog.color={RenderSettings.fogColor}",
                $"fog.density={RenderSettings.fogDensity:R}",
                $"ambient.mode={RenderSettings.ambientMode}",
                $"ambient.intensity={RenderSettings.ambientIntensity:R}",
                $"ambient.sky={RenderSettings.ambientSkyColor}",
                $"ambient.equator={RenderSettings.ambientEquatorColor}",
                $"ambient.ground={RenderSettings.ambientGroundColor}",
                $"ambient.probe={string.Join(";", ambientProbeLines)}",
                $"reflection.intensity={RenderSettings.reflectionIntensity:R}",
                $"reflection.mode={RenderSettings.defaultReflectionMode}",
                $"reflection.custom={customReflection}",
                $"skybox={(RenderSettings.skybox == null ? "none" : RenderSettings.skybox.name)}",
                $"pipeline={pipelineSummary}",
                $"sun={sun}",
                string.Empty,
            });
        }

        private static string MatrixToString(Matrix4x4 value)
        {
            return string.Join(",", new[]
            {
                value.m00.ToString("R"), value.m01.ToString("R"),
                value.m02.ToString("R"), value.m03.ToString("R"),
                value.m10.ToString("R"), value.m11.ToString("R"),
                value.m12.ToString("R"), value.m13.ToString("R"),
                value.m20.ToString("R"), value.m21.ToString("R"),
                value.m22.ToString("R"), value.m23.ToString("R"),
                value.m30.ToString("R"), value.m31.ToString("R"),
                value.m32.ToString("R"), value.m33.ToString("R"),
            });
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
