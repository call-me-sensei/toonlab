// Native Unity frame-debugger draw inventory for the supplied Mega scene.
//
// This deliberately uses Unity's internal frame-debugger API through
// reflection.  The API is editor-version-specific, but it is the only native
// authority that can tell us which Terrain tree/detail mesh and LOD Unity
// actually submitted for Camera0 rather than which mesh we infer from the
// serialized prefab metadata.

#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace ToonLab.Editor
{
    public static class UnityFrameDebuggerDrawProbe
    {
        private const string DefaultScene =
            "Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity";

        [Serializable]
        private sealed class Report
        {
            public string scene;
            public string unityVersion;
            public string cameraName;
            public Vector3 cameraPosition;
            public Vector3 cameraEuler;
            public float cameraFieldOfView;
            public float cameraAspect;
            public int frameEventCount;
            public List<EventRecord> events = new List<EventRecord>();
        }

        [Serializable]
        private sealed class EventRecord
        {
            public int index;
            public string eventName;
            public string frameObjectName;
            public string frameObjectType;
            public string frameObjectAssetPath;
            public string meshName;
            public string meshAssetPath;
            public int meshSubset;
            public int vertexCount;
            public int indexCount;
            public int instanceCount;
            public int drawCallCount;
            public string originalShaderName;
            public string realShaderName;
            public string passName;
            public string passLightMode;
            public string shaderKeywords;
        }

        public static void Run()
        {
            RenderTexture destination = null;
            var frameDebuggerEnabled = false;
            try
            {
                var scenePath = Argument("-scene", DefaultScene);
                var outputPath = Path.GetFullPath(Argument(
                    "-output",
                    Path.Combine(Path.GetTempPath(), "toonlab-unity-frame-draws.json")));
                var width = IntArgument("-width", 1920);
                var height = IntArgument("-height", 1080);
                var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                if (!scene.IsValid() || !scene.isLoaded)
                    throw new InvalidOperationException("Could not open Unity scene: " + scenePath);

                var camera = Resources.FindObjectsOfTypeAll<Camera>()
                    .Where(candidate => candidate.gameObject.scene == scene)
                    .Where(candidate => candidate.gameObject.activeInHierarchy && candidate.enabled)
                    .OrderByDescending(candidate => candidate.CompareTag("MainCamera"))
                    .FirstOrDefault();
                if (camera == null)
                    throw new InvalidOperationException("No active camera found in Unity scene.");

                foreach (var behaviour in Resources.FindObjectsOfTypeAll<MonoBehaviour>())
                {
                    if (behaviour != null && behaviour.GetType().Name == "CamearMovement")
                        behaviour.enabled = false;
                }

                camera.aspect = (float)width / height;
                camera.ResetProjectionMatrix();
                Shader.WarmupAllShaders();
                destination = new RenderTexture(
                    width,
                    height,
                    24,
                    RenderTextureFormat.ARGB32,
                    RenderTextureReadWrite.sRGB)
                {
                    antiAliasing = 1,
                    name = "ToonLab.UnityFrameDebuggerDrawProbe",
                    useMipMap = false,
                    autoGenerateMips = false,
                };
                destination.Create();

                var utilityType = FindType(
                    "UnityEditorInternal.FrameDebuggerInternal.FrameDebuggerUtility");
                var eventDataType = FindType(
                    "UnityEditorInternal.FrameDebuggerInternal.FrameDebuggerEventData");
                var setEnabled = RequiredMethod(
                    utilityType,
                    "SetEnabled",
                    BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
                    typeof(bool),
                    typeof(int));
                var countProperty = RequiredProperty(utilityType, "count");
                var limitProperty = RequiredProperty(utilityType, "limit");
                var getInfoName = RequiredMethod(
                    utilityType,
                    "GetFrameEventInfoName",
                    BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
                    typeof(int));
                var getEventObject = RequiredMethod(
                    utilityType,
                    "GetFrameEventObject",
                    BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
                    typeof(int));
                var getEventData = RequiredMethod(
                    utilityType,
                    "GetFrameEventData",
                    BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
                    typeof(int),
                    eventDataType);

                // Zero is Unity's local-editor connection id.  Enabling before
                // SubmitRenderRequest makes this exact camera request the
                // frame-debugger authority even in headless batch mode.
                setEnabled.Invoke(null, new object[] { true, 0 });
                frameDebuggerEnabled = true;
                if (limitProperty.CanWrite)
                    limitProperty.SetValue(null, int.MaxValue, null);
                var request = new UniversalRenderPipeline.SingleCameraRequest
                {
                    destination = destination,
                };
                RenderPipeline.SubmitRenderRequest(camera, request);

                var count = (int)countProperty.GetValue(null, null);
                var locallySupported = RequiredProperty(utilityType, "locallySupported");
                var eventsHash = RequiredProperty(utilityType, "eventsHash");
                Debug.Log(string.Join(" ", new[]
                {
                    "TOONLAB_UNITY_FRAME_DEBUGGER_STATE",
                    "locallySupported=" + locallySupported.GetValue(null, null),
                    "count=" + count,
                    "limit=" + limitProperty.GetValue(null, null),
                    "eventsHash=" + eventsHash.GetValue(null, null),
                }));
                if (count <= 0)
                    throw new InvalidOperationException(
                        "Unity frame debugger captured zero events for the camera request.");
                if (limitProperty.CanWrite)
                    limitProperty.SetValue(null, count, null);

                var report = new Report
                {
                    scene = scenePath,
                    unityVersion = Application.unityVersion,
                    cameraName = camera.name,
                    cameraPosition = camera.transform.position,
                    cameraEuler = camera.transform.rotation.eulerAngles,
                    cameraFieldOfView = camera.fieldOfView,
                    cameraAspect = camera.aspect,
                    frameEventCount = count,
                };

                for (var index = 0; index < count; index += 1)
                {
                    var eventData = Activator.CreateInstance(eventDataType, true);
                    var hasData = (bool)getEventData.Invoke(null, new[] { (object)index, eventData });
                    var frameObject = getEventObject.Invoke(null, new object[] { index }) as UnityEngine.Object;
                    var mesh = hasData
                        ? ReadField(eventDataType, eventData, "m_Mesh") as Mesh
                        : null;
                    report.events.Add(new EventRecord
                    {
                        index = index,
                        eventName = Convert.ToString(getInfoName.Invoke(null, new object[] { index })),
                        frameObjectName = frameObject == null ? string.Empty : frameObject.name,
                        frameObjectType = frameObject == null ? string.Empty : frameObject.GetType().FullName,
                        frameObjectAssetPath = frameObject == null
                            ? string.Empty
                            : AssetDatabase.GetAssetPath(frameObject),
                        meshName = mesh == null ? string.Empty : mesh.name,
                        meshAssetPath = mesh == null ? string.Empty : AssetDatabase.GetAssetPath(mesh),
                        meshSubset = ReadInt(eventDataType, eventData, "m_MeshSubset", hasData),
                        vertexCount = ReadInt(eventDataType, eventData, "m_VertexCount", hasData),
                        indexCount = ReadInt(eventDataType, eventData, "m_IndexCount", hasData),
                        instanceCount = ReadInt(eventDataType, eventData, "m_InstanceCount", hasData),
                        drawCallCount = ReadInt(eventDataType, eventData, "m_DrawCallCount", hasData),
                        originalShaderName = ReadString(
                            eventDataType,
                            eventData,
                            "m_OriginalShaderName",
                            hasData),
                        realShaderName = ReadString(
                            eventDataType,
                            eventData,
                            "m_RealShaderName",
                            hasData),
                        passName = ReadString(eventDataType, eventData, "m_PassName", hasData),
                        passLightMode = ReadString(
                            eventDataType,
                            eventData,
                            "m_PassLightMode",
                            hasData),
                        shaderKeywords = ReadString(
                            eventDataType,
                            eventData,
                            "shaderKeywords",
                            hasData),
                    });
                }

                Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? Path.GetTempPath());
                File.WriteAllText(outputPath, JsonUtility.ToJson(report, true));
                Debug.Log("TOONLAB_UNITY_FRAME_DRAWS=" + outputPath);
                setEnabled.Invoke(null, new object[] { false, 0 });
                frameDebuggerEnabled = false;
                destination.Release();
                UnityEngine.Object.DestroyImmediate(destination);
                destination = null;
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
                try
                {
                    if (frameDebuggerEnabled)
                    {
                        var utilityType = FindType(
                            "UnityEditorInternal.FrameDebuggerInternal.FrameDebuggerUtility");
                        RequiredMethod(
                            utilityType,
                            "SetEnabled",
                            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
                            typeof(bool),
                            typeof(int)).Invoke(null, new object[] { false, 0 });
                    }
                }
                catch { }
                if (destination != null)
                {
                    destination.Release();
                    UnityEngine.Object.DestroyImmediate(destination);
                }
                EditorApplication.Exit(1);
            }
        }

        private static Type FindType(string fullName)
        {
            var type = AppDomain.CurrentDomain.GetAssemblies()
                .Select(assembly => assembly.GetType(fullName, false))
                .FirstOrDefault(candidate => candidate != null);
            if (type == null)
                throw new MissingMemberException("Unity editor type not found: " + fullName);
            return type;
        }

        private static MethodInfo RequiredMethod(
            Type type,
            string name,
            BindingFlags flags,
            params Type[] parameters)
        {
            var method = type.GetMethod(name, flags, null, parameters, null);
            if (method == null)
                throw new MissingMethodException(type.FullName, name);
            return method;
        }

        private static PropertyInfo RequiredProperty(Type type, string name)
        {
            var property = type.GetProperty(
                name,
                BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
            if (property == null)
                throw new MissingMemberException(type.FullName, name);
            return property;
        }

        private static object ReadField(Type type, object value, string name)
        {
            var field = type.GetField(
                name,
                BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            return field == null ? null : field.GetValue(value);
        }

        private static int ReadInt(Type type, object value, string name, bool hasData)
        {
            if (!hasData)
                return 0;
            var fieldValue = ReadField(type, value, name);
            return fieldValue == null ? 0 : Convert.ToInt32(fieldValue);
        }

        private static string ReadString(Type type, object value, string name, bool hasData)
        {
            if (!hasData)
                return string.Empty;
            return Convert.ToString(ReadField(type, value, name)) ?? string.Empty;
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
