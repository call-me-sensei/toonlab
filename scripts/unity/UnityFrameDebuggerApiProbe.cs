// Reflection-only helper for discovering the exact Unity 6000.5 frame
// debugger API used by the native Mega-scene draw inventory probe.

#if UNITY_EDITOR
using System;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace ToonLab.Editor
{
    public static class UnityFrameDebuggerApiProbe
    {
        public static void Run()
        {
            try
            {
                var assemblies = AppDomain.CurrentDomain.GetAssemblies();
                var types = assemblies
                    .SelectMany(assembly =>
                    {
                        try { return assembly.GetTypes(); }
                        catch (ReflectionTypeLoadException error)
                        {
                            return error.Types.Where(type => type != null);
                        }
                    })
                    .Where(type => type.FullName != null
                        && type.FullName.IndexOf("FrameDebugger", StringComparison.OrdinalIgnoreCase) >= 0)
                    .OrderBy(type => type.FullName)
                    .ToArray();
                foreach (var type in types)
                {
                    Debug.Log("TOONLAB_FRAME_DEBUGGER_TYPE=" + type.AssemblyQualifiedName);
                    foreach (var method in type.GetMethods(
                        BindingFlags.Public | BindingFlags.NonPublic |
                        BindingFlags.Static | BindingFlags.Instance |
                        BindingFlags.DeclaredOnly))
                    {
                        Debug.Log("TOONLAB_FRAME_DEBUGGER_METHOD=" + type.FullName + "." + method);
                    }
                    foreach (var property in type.GetProperties(
                        BindingFlags.Public | BindingFlags.NonPublic |
                        BindingFlags.Static | BindingFlags.Instance |
                        BindingFlags.DeclaredOnly))
                    {
                        Debug.Log("TOONLAB_FRAME_DEBUGGER_PROPERTY=" + type.FullName + "." + property);
                    }
                    foreach (var field in type.GetFields(
                        BindingFlags.Public | BindingFlags.NonPublic |
                        BindingFlags.Static | BindingFlags.Instance |
                        BindingFlags.DeclaredOnly))
                    {
                        Debug.Log("TOONLAB_FRAME_DEBUGGER_FIELD=" + type.FullName + "." + field);
                    }
                }
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
                EditorApplication.Exit(1);
            }
        }
    }
}
#endif
