// Native Unity oracle for the main-light cascade matrices, culling spheres,
// and culling planes used by the supplied URP project.
//
// Usage (do not add Unity's command-line -quit flag):
//   Unity -batchmode -projectPath <isolated project copy> \
//     -executeMethod ToonLab.Editor.UnityShadowCascadeOracle.Run \
//     -scene Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity \
//     -output /tmp/toonlab-unity-shadow-cascades.json \
//     -width 1920 -height 1080
//
// The oracle intentionally calls the same native
// CullingResults.ComputeDirectionalShadowMatricesAndCullingPrimitives API as
// URP 17.5's ShadowUtils.ExtractDirectionalLightMatrix. It is a test fixture,
// not a second implementation of the cascade algorithm.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace ToonLab.Editor
{
    public static class UnityShadowCascadeOracle
    {
        private const string DefaultScene =
            "Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity";

        private static string s_OutputPath;
        private static Camera s_Camera;
        private static Light s_Light;
        private static RenderTexture s_RenderTexture;
        private static bool s_Submitted;
        private static bool s_Completed;
        private static int s_Width;
        private static int s_Height;
        private static int s_ConservativeOverride;
        private static int s_IterationsOverride;

        public static void Run()
        {
            var scenePath = Argument("-scene", DefaultScene);
            s_OutputPath = Path.GetFullPath(Argument(
                "-output",
                Path.Combine(Path.GetTempPath(), "toonlab-unity-shadow-cascades.json")));
            s_Width = IntArgument("-width", 1920);
            s_Height = IntArgument("-height", 1080);
            s_ConservativeOverride = OptionalIntArgument("-conservative", -1);
            s_IterationsOverride = OptionalIntArgument("-iterations", -1);
            s_Submitted = false;
            s_Completed = false;

            var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            if (!scene.IsValid())
                throw new InvalidOperationException($"Could not open Unity scene: {scenePath}");

            s_Camera = Resources.FindObjectsOfTypeAll<Camera>()
                .Where(candidate => candidate.gameObject.scene == scene)
                .Where(candidate => candidate.gameObject.activeInHierarchy && candidate.enabled)
                .OrderByDescending(candidate => candidate.CompareTag("MainCamera"))
                .FirstOrDefault();
            s_Light = Resources.FindObjectsOfTypeAll<Light>()
                .Where(candidate => candidate.gameObject.scene == scene)
                .Where(candidate => candidate.gameObject.activeInHierarchy && candidate.enabled)
                .FirstOrDefault(candidate => candidate.type == LightType.Directional);
            if (s_Camera == null || s_Light == null)
                throw new InvalidOperationException("The source camera or directional light is missing.");

            // Match the native reference target aspect before culling. Unity's
            // cascade spheres depend on the camera projection/aspect.
            s_RenderTexture = new RenderTexture(
                s_Width,
                s_Height,
                24,
                RenderTextureFormat.ARGB32,
                RenderTextureReadWrite.sRGB)
            {
                antiAliasing = 1,
                name = "ToonLab.UnityShadowCascadeOracle",
                useMipMap = false,
                autoGenerateMips = false,
            };
            s_RenderTexture.Create();
            s_Camera.targetTexture = s_RenderTexture;

            Directory.CreateDirectory(Path.GetDirectoryName(s_OutputPath) ?? Path.GetTempPath());
            RenderPipelineManager.beginCameraRendering -= OnBeginCameraRendering;
            RenderPipelineManager.beginCameraRendering += OnBeginCameraRendering;
            EditorApplication.update -= Tick;
            EditorApplication.update += Tick;
        }

        private static void Tick()
        {
            try
            {
                if (s_Completed)
                    return;

                if (!s_Submitted)
                {
                    s_Submitted = true;
                    var request = new UniversalRenderPipeline.SingleCameraRequest
                    {
                        destination = s_RenderTexture,
                    };
                    RenderPipeline.SubmitRenderRequest(s_Camera, request);
                    EditorApplication.QueuePlayerLoopUpdate();
                }
            }
            catch (Exception exception)
            {
                Fail(exception);
            }
        }

        private static void OnBeginCameraRendering(
            ScriptableRenderContext context,
            Camera camera)
        {
            if (s_Completed || camera != s_Camera)
                return;

            try
            {
                var pipeline = GraphicsSettings.currentRenderPipeline
                    as UniversalRenderPipelineAsset;
                if (pipeline == null)
                    throw new InvalidOperationException("The active pipeline is not URP.");
                if (!camera.TryGetCullingParameters(out var cullingParameters))
                    throw new InvalidOperationException("Camera.TryGetCullingParameters failed.");

                cullingParameters.shadowDistance = Mathf.Min(
                    pipeline.shadowDistance,
                    camera.farClipPlane);
                cullingParameters.conservativeEnclosingSphere =
                    s_ConservativeOverride < 0
                        ? pipeline.conservativeEnclosingSphere
                        : s_ConservativeOverride != 0;
                cullingParameters.numIterationsEnclosingSphere =
                    s_IterationsOverride < 0
                        ? pipeline.numIterationsEnclosingSphere
                        : Math.Max(0, s_IterationsOverride);

                var cullingResults = context.Cull(ref cullingParameters);
                var lightIndex = -1;
                for (var index = 0; index < cullingResults.visibleLights.Length; index += 1)
                {
                    if (cullingResults.visibleLights[index].light == s_Light)
                    {
                        lightIndex = index;
                        break;
                    }
                }
                if (lightIndex < 0)
                    throw new InvalidOperationException("The source sun is not a visible light.");

                var cascadeCount = pipeline.shadowCascadeCount;
                var splitRatios = cascadeCount == 4
                    ? pipeline.cascade4Split
                    : cascadeCount == 3
                        ? new Vector3(pipeline.cascade3Split.x, pipeline.cascade3Split.y, 1)
                        : new Vector3(pipeline.cascade2Split, 1, 0);
                var tileResolution = cascadeCount > 1
                    ? pipeline.mainLightShadowmapResolution / 2
                    : pipeline.mainLightShadowmapResolution;
                var cascades = new List<CascadeRecord>();

                for (var cascadeIndex = 0; cascadeIndex < cascadeCount; cascadeIndex += 1)
                {
                    var success = cullingResults
                        .ComputeDirectionalShadowMatricesAndCullingPrimitives(
                            lightIndex,
                            cascadeIndex,
                            cascadeCount,
                            splitRatios,
                            tileResolution,
                            s_Light.shadowNearPlane,
                            out var viewMatrix,
                            out var projectionMatrix,
                            out var splitData);
                    if (!success)
                        throw new InvalidOperationException(
                            $"Native cascade extraction failed for cascade {cascadeIndex}.");

                    var planes = new List<PlaneRecord>();
                    for (var planeIndex = 0; planeIndex < splitData.cullingPlaneCount; planeIndex += 1)
                    {
                        var plane = splitData.GetCullingPlane(planeIndex);
                        planes.Add(new PlaneRecord
                        {
                            equation = new[]
                            {
                                plane.normal.x,
                                plane.normal.y,
                                plane.normal.z,
                                plane.distance,
                            },
                        });
                    }
                    cascades.Add(new CascadeRecord
                    {
                        index = cascadeIndex,
                        cullingSphere = Vector(splitData.cullingSphere),
                        cullingPlanes = planes.ToArray(),
                        projectionMatrix = Matrix(projectionMatrix),
                        shadowCascadeBlendCullingFactor =
                            splitData.shadowCascadeBlendCullingFactor,
                        viewMatrix = Matrix(viewMatrix),
                    });
                }

                var record = new OracleRecord
                {
                    schema = "toonlab.unity-shadow-cascade-oracle",
                    schemaVersion = 1,
                    unityVersion = Application.unityVersion,
                    scene = camera.gameObject.scene.path,
                    resolution = new[] { s_Width, s_Height },
                    cameraPosition = Vector(camera.transform.position),
                    cameraRotation = Vector(camera.transform.rotation),
                    cameraFieldOfView = camera.fieldOfView,
                    cameraAspect = camera.aspect,
                    cameraNear = camera.nearClipPlane,
                    cameraFar = camera.farClipPlane,
                    cameraProjectionMatrix = Matrix(camera.projectionMatrix),
                    cameraNonJitteredProjectionMatrix = Matrix(
                        camera.nonJitteredProjectionMatrix),
                    cameraWorldToCameraMatrix = Matrix(camera.worldToCameraMatrix),
                    lightForward = Vector(s_Light.transform.forward),
                    lightShadowNearPlane = s_Light.shadowNearPlane,
                    pipelineName = pipeline.name,
                    shadowDistance = pipeline.shadowDistance,
                    cascadeCount = cascadeCount,
                    cascadeSplits = new[]
                    {
                        splitRatios.x,
                        splitRatios.y,
                        splitRatios.z,
                        1,
                    },
                    atlasResolution = pipeline.mainLightShadowmapResolution,
                    tileResolution = tileResolution,
                    conservativeEnclosingSphere =
                        cullingParameters.conservativeEnclosingSphere,
                    enclosingSphereIterations =
                        cullingParameters.numIterationsEnclosingSphere,
                    cascades = cascades.ToArray(),
                };

                File.WriteAllText(s_OutputPath, JsonUtility.ToJson(record, true));
                Debug.Log($"TOONLAB_UNITY_SHADOW_CASCADE_ORACLE={s_OutputPath}");
                Complete(0);
            }
            catch (Exception exception)
            {
                Fail(exception);
            }
        }

        private static float[] Matrix(Matrix4x4 matrix)
        {
            var result = new float[16];
            for (var row = 0; row < 4; row += 1)
            for (var column = 0; column < 4; column += 1)
                result[row * 4 + column] = matrix[row, column];
            return result;
        }

        private static float[] Vector(Vector3 vector) =>
            new[] { vector.x, vector.y, vector.z };

        private static float[] Vector(Vector4 vector) =>
            new[] { vector.x, vector.y, vector.z, vector.w };

        private static float[] Vector(Quaternion value) =>
            new[] { value.x, value.y, value.z, value.w };

        private static void Complete(int exitCode)
        {
            s_Completed = true;
            RenderPipelineManager.beginCameraRendering -= OnBeginCameraRendering;
            EditorApplication.update -= Tick;
            if (s_Camera != null)
                s_Camera.targetTexture = null;
            if (s_RenderTexture != null)
            {
                s_RenderTexture.Release();
                UnityEngine.Object.DestroyImmediate(s_RenderTexture);
                s_RenderTexture = null;
            }
            EditorApplication.Exit(exitCode);
        }

        private static void Fail(Exception exception)
        {
            Debug.LogException(exception);
            Complete(1);
        }

        private static string Argument(string name, string fallback)
        {
            var arguments = Environment.GetCommandLineArgs();
            for (var index = 0; index < arguments.Length - 1; index += 1)
            {
                if (arguments[index] == name)
                    return arguments[index + 1];
            }
            return fallback;
        }

        private static int IntArgument(string name, int fallback)
        {
            return int.TryParse(Argument(name, fallback.ToString()), out var value)
                ? Math.Max(1, value)
                : fallback;
        }

        private static int OptionalIntArgument(string name, int fallback)
        {
            return int.TryParse(Argument(name, fallback.ToString()), out var value)
                ? value
                : fallback;
        }

        [Serializable]
        private sealed class OracleRecord
        {
            public string schema;
            public int schemaVersion;
            public string unityVersion;
            public string scene;
            public int[] resolution;
            public float[] cameraPosition;
            public float[] cameraRotation;
            public float cameraFieldOfView;
            public float cameraAspect;
            public float cameraNear;
            public float cameraFar;
            public float[] cameraProjectionMatrix;
            public float[] cameraNonJitteredProjectionMatrix;
            public float[] cameraWorldToCameraMatrix;
            public float[] lightForward;
            public float lightShadowNearPlane;
            public string pipelineName;
            public float shadowDistance;
            public int cascadeCount;
            public float[] cascadeSplits;
            public int atlasResolution;
            public int tileResolution;
            public bool conservativeEnclosingSphere;
            public int enclosingSphereIterations;
            public CascadeRecord[] cascades;
        }

        [Serializable]
        private sealed class CascadeRecord
        {
            public int index;
            public float[] cullingSphere;
            public PlaneRecord[] cullingPlanes;
            public float[] projectionMatrix;
            public float shadowCascadeBlendCullingFactor;
            public float[] viewMatrix;
        }

        [Serializable]
        private sealed class PlaneRecord
        {
            public float[] equation;
        }
    }
}
