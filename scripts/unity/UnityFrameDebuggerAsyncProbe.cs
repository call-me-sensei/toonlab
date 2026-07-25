// Async camera-request frame debugger probe.  Unity only publishes native
// frame-debugger events after the render loop has advanced, so this helper
// deliberately enables capture and submits the Camera0 request on later
// EditorApplication.update ticks.

#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace ToonLab.Editor
{
    public static class UnityFrameDebuggerAsyncProbe
    {
        private const string DefaultScene =
            "Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity";
        private static string s_Output;
        private static Camera s_Camera;
        private static RenderTexture s_Destination;
        private static Type s_UtilityType;
        private static Type s_EventDataType;
        private static MethodInfo s_SetEnabled;
        private static MethodInfo s_GetInfoName;
        private static MethodInfo s_GetEventObject;
        private static MethodInfo s_GetEventData;
        private static PropertyInfo s_Count;
        private static PropertyInfo s_Limit;
        private static EditorWindow s_GameView;
        private static int s_Attempts;
        private static bool s_CaptureRequested;
        private static Timer s_BackgroundPoll;
        private static SynchronizationContext s_MainThreadContext;
        private static int s_MainThreadPollQueued;

        public static void Run()
        {
            try
            {
                var scenePath = Argument("-scene", DefaultScene);
                s_MainThreadContext = SynchronizationContext.Current;
                if (s_MainThreadContext == null)
                    throw new InvalidOperationException("Unity main-thread synchronization context is missing.");
                s_Output = Path.GetFullPath(Argument(
                    "-output",
                    Path.Combine(Path.GetTempPath(), "toonlab-unity-frame-draws.tsv")));
                var width = IntArgument("-width", 1920);
                var height = IntArgument("-height", 1080);
                var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                s_Camera = Resources.FindObjectsOfTypeAll<Camera>()
                    .Where(camera => camera.gameObject.scene == scene)
                    .Where(camera => camera.gameObject.activeInHierarchy && camera.enabled)
                    .OrderByDescending(camera => camera.CompareTag("MainCamera"))
                    .FirstOrDefault();
                if (s_Camera == null)
                    throw new InvalidOperationException("No active camera in Mega scene.");
                foreach (var behaviour in Resources.FindObjectsOfTypeAll<MonoBehaviour>())
                {
                    if (behaviour != null && behaviour.GetType().Name == "CamearMovement")
                        behaviour.enabled = false;
                }
                s_Camera.aspect = (float)width / height;
                s_Camera.ResetProjectionMatrix();
                Shader.WarmupAllShaders();
                s_Destination = new RenderTexture(
                    width,
                    height,
                    24,
                    RenderTextureFormat.ARGB32,
                    RenderTextureReadWrite.sRGB)
                {
                    name = "ToonLab.UnityFrameDebuggerAsyncProbe",
                    antiAliasing = 1,
                    useMipMap = false,
                    autoGenerateMips = false,
                };
                s_Destination.Create();

                s_UtilityType = FindType(
                    "UnityEditorInternal.FrameDebuggerInternal.FrameDebuggerUtility");
                s_EventDataType = FindType(
                    "UnityEditorInternal.FrameDebuggerInternal.FrameDebuggerEventData");
                const BindingFlags flags = BindingFlags.Public |
                    BindingFlags.NonPublic | BindingFlags.Static;
                s_SetEnabled = RequiredMethod(
                    s_UtilityType, "SetEnabled", flags, typeof(bool), typeof(int));
                s_GetInfoName = RequiredMethod(
                    s_UtilityType, "GetFrameEventInfoName", flags, typeof(int));
                s_GetEventObject = RequiredMethod(
                    s_UtilityType, "GetFrameEventObject", flags, typeof(int));
                s_GetEventData = RequiredMethod(
                    s_UtilityType,
                    "GetFrameEventData",
                    flags,
                    typeof(int),
                    s_EventDataType);
                s_Count = RequiredProperty(s_UtilityType, "count");
                s_Limit = RequiredProperty(s_UtilityType, "limit");
                var supported = RequiredProperty(s_UtilityType, "locallySupported")
                    .GetValue(null, null);
                Debug.Log("TOONLAB_UNITY_FRAME_DEBUGGER_SUPPORTED=" + supported);

                var gameViewType = FindType("UnityEditor.GameView");
                s_GameView = EditorWindow.GetWindow(gameViewType);
                s_GameView.Show();
                s_GameView.Repaint();

                s_Attempts = 0;
                s_CaptureRequested = false;
                EditorApplication.update -= Tick;
                EditorApplication.update += Tick;
                EditorApplication.pauseStateChanged -= OnPauseStateChanged;
                EditorApplication.pauseStateChanged += OnPauseStateChanged;
                EditorSettings.enterPlayModeOptionsEnabled = true;
                EditorSettings.enterPlayModeOptions =
                    EnterPlayModeOptions.DisableDomainReload |
                    EnterPlayModeOptions.DisableSceneReload;
                EditorApplication.EnterPlaymode();
            }
            catch (Exception exception)
            {
                Fail(exception);
            }
        }

        private static void Tick()
        {
            try
            {
                if (!EditorApplication.isPlaying)
                    return;
                if (!s_CaptureRequested)
                {
                    var frameDebuggerWindowType = FindType("UnityEditor.FrameDebuggerWindow");
                    Debug.Log("TOONLAB_UNITY_FRAME_DEBUGGER_OPEN_BEGIN");
                    RequiredMethod(
                        frameDebuggerWindowType,
                        "OpenWindowAndToggleEnabled",
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)
                        .Invoke(null, null);
                    if (s_Limit.CanWrite)
                        s_Limit.SetValue(null, int.MaxValue, null);
                    s_CaptureRequested = true;
                    Debug.Log("TOONLAB_UNITY_FRAME_DEBUGGER_OPEN_END");
                    s_BackgroundPoll = new Timer(
                        BackgroundPoll,
                        null,
                        TimeSpan.FromSeconds(1),
                        TimeSpan.FromSeconds(1));
                    s_GameView.Repaint();
                    EditorApplication.QueuePlayerLoopUpdate();
                    return;
                }
                var count = (int)s_Count.GetValue(null, null);
                Debug.Log(
                    "TOONLAB_UNITY_FRAME_DEBUGGER_TICK=" + s_Attempts +
                    " count=" + count);
                if (count <= 0 && s_Attempts < 16)
                {
                    // Frame Debugger captures a PlayModeView, not an arbitrary
                    // SRP camera request.  Repaint Unity's real GameView and
                    // let its editor render loop publish the event stream.
                    s_GameView.Repaint();
                    UnityEditorInternal.InternalEditorUtility.RepaintAllViews();
                    s_Attempts += 1;
                    EditorApplication.QueuePlayerLoopUpdate();
                    return;
                }
                if (count <= 0)
                    throw new InvalidOperationException(
                        "Unity frame debugger still had zero events after " +
                        s_Attempts + " deferred camera requests.");
                if (s_Limit.CanWrite)
                    s_Limit.SetValue(null, count, null);

                var rows = new List<string>
                {
                    string.Join("\t", new[]
                    {
                        "index", "event", "object", "objectType", "objectAsset",
                        "mesh", "meshAsset", "subset", "vertices", "indices",
                        "instances", "drawCalls", "shader", "realShader", "pass",
                        "lightMode",
                    }),
                };
                for (var index = 0; index < count; index += 1)
                {
                    var eventData = Activator.CreateInstance(s_EventDataType, true);
                    var hasData = (bool)s_GetEventData.Invoke(
                        null,
                        new[] { (object)index, eventData });
                    var frameObject = s_GetEventObject.Invoke(
                        null,
                        new object[] { index }) as UnityEngine.Object;
                    var mesh = hasData ? Field("m_Mesh").GetValue(eventData) as Mesh : null;
                    rows.Add(string.Join("\t", new[]
                    {
                        index.ToString(),
                        Clean(Convert.ToString(s_GetInfoName.Invoke(null, new object[] { index }))),
                        Clean(frameObject == null ? string.Empty : frameObject.name),
                        Clean(frameObject == null ? string.Empty : frameObject.GetType().FullName),
                        Clean(frameObject == null ? string.Empty : AssetDatabase.GetAssetPath(frameObject)),
                        Clean(mesh == null ? string.Empty : mesh.name),
                        Clean(mesh == null ? string.Empty : AssetDatabase.GetAssetPath(mesh)),
                        IntField(eventData, "m_MeshSubset", hasData),
                        IntField(eventData, "m_VertexCount", hasData),
                        IntField(eventData, "m_IndexCount", hasData),
                        IntField(eventData, "m_InstanceCount", hasData),
                        IntField(eventData, "m_DrawCallCount", hasData),
                        StringField(eventData, "m_OriginalShaderName", hasData),
                        StringField(eventData, "m_RealShaderName", hasData),
                        StringField(eventData, "m_PassName", hasData),
                        StringField(eventData, "m_PassLightMode", hasData),
                    }));
                }
                Directory.CreateDirectory(Path.GetDirectoryName(s_Output) ?? Path.GetTempPath());
                File.WriteAllLines(s_Output, rows);
                Debug.Log("TOONLAB_UNITY_FRAME_DRAWS=" + s_Output);
                Debug.Log("TOONLAB_UNITY_FRAME_EVENT_COUNT=" + count);
                Finish(0);
            }
            catch (Exception exception)
            {
                Fail(exception);
            }
        }

        private static void OnPauseStateChanged(PauseState state)
        {
            Debug.Log("TOONLAB_UNITY_FRAME_DEBUGGER_PAUSE=" + state);
            EditorApplication.QueuePlayerLoopUpdate();
        }

        // Frame Debugger deliberately suspends the normal EditorApplication
        // update stream after capturing a frame. A timer queues a poll onto
        // UnitySynchronizationContext; all debugger and Unity Object access
        // still happens on Unity's main thread.
        private static void BackgroundPoll(object state)
        {
            if (s_MainThreadContext == null ||
                Interlocked.Exchange(ref s_MainThreadPollQueued, 1) != 0)
                return;
            s_MainThreadContext.Post(_ =>
            {
                Interlocked.Exchange(ref s_MainThreadPollQueued, 0);
                try
                {
                    File.WriteAllText(
                        s_Output + ".main-thread-poll",
                        "count\t" + s_Count.GetValue(null, null));
                    Tick();
                }
                catch (Exception exception)
                {
                    File.WriteAllText(
                        s_Output + ".background-error",
                        exception.ToString());
                }
            }, null);
        }

        private static void Fail(Exception exception)
        {
            Debug.LogException(exception);
            Finish(1);
        }

        private static void Finish(int exitCode)
        {
            EditorApplication.update -= Tick;
            EditorApplication.pauseStateChanged -= OnPauseStateChanged;
            if (s_BackgroundPoll != null)
            {
                s_BackgroundPoll.Dispose();
                s_BackgroundPoll = null;
            }
            try
            {
                if (s_SetEnabled != null)
                    s_SetEnabled.Invoke(null, new object[] { false, 0 });
            }
            catch { }
            if (s_Destination != null)
            {
                s_Destination.Release();
                UnityEngine.Object.DestroyImmediate(s_Destination);
                s_Destination = null;
            }
            EditorApplication.Exit(exitCode);
        }

        private static FieldInfo Field(string name)
        {
            return s_EventDataType.GetField(
                name,
                BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
        }

        private static string IntField(object value, string name, bool hasData)
        {
            return hasData ? Convert.ToString(Field(name).GetValue(value)) : string.Empty;
        }

        private static string StringField(object value, string name, bool hasData)
        {
            return Clean(hasData ? Convert.ToString(Field(name).GetValue(value)) : string.Empty);
        }

        private static string Clean(string value)
        {
            return (value ?? string.Empty).Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
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
