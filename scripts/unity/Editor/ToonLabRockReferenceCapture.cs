#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace ToonLab.UnityReference
{
    public static class ToonLabRockReferenceCapture
    {
        private const string MeshPath =
            "Assets/SoStylized-Unity/Environment/Rocks/Classic/Meshes/SM_CliffClassic2.fbx";
        private const string MaterialPath =
            "Assets/SoStylized-Unity/Environment/Rocks/Materials/Classic/MV_RockClassic_Cliff.mat";

        public static void Capture()
        {
            try
            {
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var mesh = AssetDatabase.LoadAllAssetsAtPath(MeshPath).OfType<Mesh>().FirstOrDefault();
                var material = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
                if (mesh == null) throw new InvalidOperationException($"Mesh not found: {MeshPath}");
                if (material == null) throw new InvalidOperationException($"Material not found: {MaterialPath}");

                var root = new GameObject("SM_CliffClassic2_Reference");
                root.AddComponent<MeshFilter>().sharedMesh = mesh;
                root.AddComponent<MeshRenderer>().sharedMaterial = material;

                var bounds = mesh.bounds;
                root.transform.position = -bounds.center;
                var radius = Mathf.Max(bounds.extents.magnitude, 0.01f);

                var lightObject = new GameObject("Reference Sun");
                var sun = lightObject.AddComponent<Light>();
                sun.type = LightType.Directional;
                sun.intensity = 1.1f;
                sun.color = new Color(1.0f, 0.93f, 0.82f);
                sun.shadows = LightShadows.Soft;
                lightObject.transform.rotation = Quaternion.Euler(42f, -38f, 0f);
                RenderSettings.sun = sun;
                RenderSettings.ambientMode = AmbientMode.Trilight;
                RenderSettings.ambientSkyColor = new Color(0.34f, 0.43f, 0.62f);
                RenderSettings.ambientEquatorColor = new Color(0.18f, 0.25f, 0.39f);
                RenderSettings.ambientGroundColor = new Color(0.08f, 0.10f, 0.16f);
                RenderSettings.ambientIntensity = 1f;
                RenderSettings.skybox = null;
                RenderSettings.fog = false;

                var cameraObject = new GameObject("Reference Camera");
                var camera = cameraObject.AddComponent<Camera>();
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = new Color(0.035f, 0.052f, 0.085f, 1f);
                camera.fieldOfView = 35f;
                camera.nearClipPlane = Mathf.Max(radius * 0.01f, 0.01f);
                camera.farClipPlane = radius * 20f;
                camera.transform.position = new Vector3(radius * 1.55f, radius * 0.7f, -radius * 2.75f);
                camera.transform.LookAt(Vector3.zero, Vector3.up);

                const int size = 1024;
                var target = new RenderTexture(size, size, 24, RenderTextureFormat.ARGB32)
                {
                    antiAliasing = 4,
                    name = "ToonLab Unity Rock Reference",
                    useMipMap = false,
                };
                target.Create();
                camera.targetTexture = target;
                camera.Render();

                var previous = RenderTexture.active;
                RenderTexture.active = target;
                var pixels = new Texture2D(size, size, TextureFormat.RGBA32, false, false);
                pixels.ReadPixels(new Rect(0, 0, size, size), 0, 0, false);
                pixels.Apply(false, false);
                RenderTexture.active = previous;

                var outputPath = Environment.GetEnvironmentVariable("TOONLAB_UNITY_CAPTURE");
                if (string.IsNullOrWhiteSpace(outputPath))
                    outputPath = "/private/tmp/toonlab-unity-rock-reference.png";
                Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
                File.WriteAllBytes(outputPath, pixels.EncodeToPNG());

                var reportPath = Path.ChangeExtension(outputPath, ".json");
                var report = JsonUtility.ToJson(new CaptureReport
                {
                    mesh = mesh.name,
                    material = material.name,
                    shader = material.shader != null ? material.shader.name : null,
                    boundsCenter = bounds.center,
                    boundsSize = bounds.size,
                    vertexCount = mesh.vertexCount,
                    subMeshCount = mesh.subMeshCount,
                    output = outputPath,
                }, true);
                File.WriteAllText(reportPath, report);

                UnityEngine.Object.DestroyImmediate(pixels);
                camera.targetTexture = null;
                target.Release();
                UnityEngine.Object.DestroyImmediate(target);
                Debug.Log($"TOONLAB_UNITY_CAPTURE_OK {outputPath}");
                EditorApplication.Exit(0);
            }
            catch (Exception error)
            {
                Debug.LogException(error);
                EditorApplication.Exit(1);
            }
        }

        [Serializable]
        private sealed class CaptureReport
        {
            public string mesh;
            public string material;
            public string shader;
            public Vector3 boundsCenter;
            public Vector3 boundsSize;
            public int vertexCount;
            public int subMeshCount;
            public string output;
        }
    }
}
#endif
