// One-shot Editor reflection probe used to discover the exact Unity 6000.5
// ShaderUtil/ShaderData source-export API. It writes signatures only; no
// project state or assets are modified.

#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace ToonLab.Editor
{
    public static class UnityShaderApiProbe
    {
        public static void Run()
        {
            try
            {
                var output = Argument(
                    "-output",
                    Path.Combine(Path.GetTempPath(), "toonlab-unity-shader-api.txt"));
                var builder = new StringBuilder();
                AppendType(builder, typeof(ShaderUtil));

                var shaderPath = Argument(
                    "-shader",
                    "Assets/SoStylized-Unity/Environment/Rocks/Shaders/S_Rock.shadergraph");
                var shader = AssetDatabase.LoadAssetAtPath<Shader>(shaderPath);
                if (shader == null)
                    throw new InvalidOperationException("Could not load Shader at " + shaderPath);
                var data = ShaderUtil.GetShaderData(shader);
                builder.AppendLine();
                builder.AppendLine("SHADER_DATA_RUNTIME_TYPE=" + data.GetType().AssemblyQualifiedName);
                AppendType(builder, data.GetType());

                Directory.CreateDirectory(Path.GetDirectoryName(output) ?? Path.GetTempPath());
                File.WriteAllText(output, builder.ToString(), new UTF8Encoding(false));
                Debug.Log("TOONLAB_UNITY_SHADER_API=" + output);
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
                EditorApplication.Exit(1);
            }
        }

        private static void AppendType(StringBuilder builder, Type type)
        {
            const BindingFlags Flags = BindingFlags.Public | BindingFlags.NonPublic
                | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly;
            builder.AppendLine("TYPE=" + type.AssemblyQualifiedName);
            foreach (var property in type.GetProperties(Flags).OrderBy(item => item.Name))
                builder.AppendLine("PROPERTY " + property);
            foreach (var method in type.GetMethods(Flags)
                .Where(item => item.Name.IndexOf("Shader", StringComparison.OrdinalIgnoreCase) >= 0
                    || item.Name.IndexOf("Pass", StringComparison.OrdinalIgnoreCase) >= 0
                    || item.Name.IndexOf("Source", StringComparison.OrdinalIgnoreCase) >= 0
                    || item.Name.IndexOf("Subshader", StringComparison.OrdinalIgnoreCase) >= 0)
                .OrderBy(item => item.Name))
                builder.AppendLine("METHOD " + method);
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
