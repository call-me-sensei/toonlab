// Export Unity's generated Shader Graph pass source verbatim through
// ShaderUtil.GetShaderPassSourceCode. This is the executable source authority
// for source-to-source ToonLab parity; screenshots are not involved.
//
// Usage:
//   Unity -batchmode -projectPath <project> \
//     -executeMethod ToonLab.Editor.UnityGeneratedShaderExport.Run \
//     -output /path/to/output -quit

#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace ToonLab.Editor
{
    public static class UnityGeneratedShaderExport
    {
        private const string Schema = "toonlab.sostylized-unity.generated-shaders";
        private const string SearchRoot = "Assets/SoStylized-Unity";

        private static readonly BindingFlags MethodFlags = BindingFlags.Public
            | BindingFlags.NonPublic | BindingFlags.Static;

        public static void Run()
        {
            try
            {
                var output = Path.GetFullPath(Argument(
                    "-output",
                    Path.Combine(Path.GetTempPath(), "toonlab-unity-generated-shaders")));
                Directory.CreateDirectory(output);

                var getSubshaderCount = RequiredMethod(
                    "GetShaderSubshaderCount",
                    typeof(Shader));
                var getPassCount = RequiredMethod(
                    "GetShaderTotalPassCount",
                    typeof(Shader),
                    typeof(int));
                var getPassName = RequiredMethod(
                    "GetShaderPassName",
                    typeof(Shader),
                    typeof(int),
                    typeof(int));
                var getPassSource = RequiredMethod(
                    "GetShaderPassSourceCode",
                    typeof(Shader),
                    typeof(int),
                    typeof(int));

                var manifest = new ExportManifest
                {
                    schema = Schema,
                    schemaVersion = 1,
                    unityVersion = Application.unityVersion,
                    searchRoot = SearchRoot,
                };

                var paths = AssetDatabase.FindAssets("t:Shader", new[] { SearchRoot })
                    .Select(AssetDatabase.GUIDToAssetPath)
                    .Where(path => path.EndsWith(".shadergraph", StringComparison.OrdinalIgnoreCase))
                    .OrderBy(path => path, StringComparer.Ordinal)
                    .ToArray();

                foreach (var path in paths)
                {
                    var shader = AssetDatabase.LoadAssetAtPath<Shader>(path);
                    if (shader == null)
                        throw new InvalidOperationException("Could not load Shader Graph: " + path);
                    var record = new ShaderRecord
                    {
                        assetPath = path,
                        assetGuid = AssetDatabase.AssetPathToGUID(path),
                        graphSha256 = Sha256(File.ReadAllBytes(Path.GetFullPath(path))),
                        shaderName = shader.name,
                    };

                    var subshaderCount = (int)getSubshaderCount.Invoke(null, new object[] { shader });
                    for (var subshader = 0; subshader < subshaderCount; subshader += 1)
                    {
                        var passCount = (int)getPassCount.Invoke(
                            null,
                            new object[] { shader, subshader });
                        for (var pass = 0; pass < passCount; pass += 1)
                        {
                            var passName = (string)getPassName.Invoke(
                                null,
                                new object[] { shader, subshader, pass });
                            var source = (string)getPassSource.Invoke(
                                null,
                                new object[] { shader, subshader, pass });
                            var relative = Path.Combine(
                                "passes",
                                Path.GetFileNameWithoutExtension(path),
                                string.Format(
                                    CultureInfo.InvariantCulture,
                                    "sub-{0:D2}-pass-{1:D2}-{2}.shader",
                                    subshader,
                                    pass,
                                    SafeFileName(passName)));
                            var target = Path.Combine(output, relative);
                            Directory.CreateDirectory(Path.GetDirectoryName(target));
                            File.WriteAllText(
                                target,
                                source ?? string.Empty,
                                new UTF8Encoding(false));
                            record.passes.Add(new PassRecord
                            {
                                subshader = subshader,
                                pass = pass,
                                name = passName,
                                file = relative.Replace('\\', '/'),
                                sha256 = Sha256(Encoding.UTF8.GetBytes(source ?? string.Empty)),
                                byteLength = Encoding.UTF8.GetByteCount(source ?? string.Empty),
                            });
                        }
                    }
                    record.subshaderCount = subshaderCount;
                    record.passCount = record.passes.Count;
                    manifest.shaders.Add(record);
                }

                manifest.shaderCount = manifest.shaders.Count;
                manifest.passCount = manifest.shaders.Sum(item => item.passCount);
                File.WriteAllText(
                    Path.Combine(output, "manifest.json"),
                    JsonUtility.ToJson(manifest, true) + "\n",
                    new UTF8Encoding(false));
                Debug.Log("TOONLAB_UNITY_GENERATED_SHADERS=" + output);
                Debug.Log("TOONLAB_UNITY_GENERATED_SHADER_COUNT=" + manifest.shaderCount);
                Debug.Log("TOONLAB_UNITY_GENERATED_PASS_COUNT=" + manifest.passCount);
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
                EditorApplication.Exit(1);
            }
        }

        private static MethodInfo RequiredMethod(string name, params Type[] arguments)
        {
            var method = typeof(ShaderUtil).GetMethod(
                name,
                MethodFlags,
                null,
                arguments,
                null);
            if (method == null)
                throw new MissingMethodException(typeof(ShaderUtil).FullName, name);
            return method;
        }

        private static string SafeFileName(string value)
        {
            var invalid = Path.GetInvalidFileNameChars();
            var result = new string((value ?? "Unnamed")
                .Select(character => invalid.Contains(character) ? '_' : character)
                .ToArray());
            return string.IsNullOrWhiteSpace(result) ? "Unnamed" : result;
        }

        private static string Sha256(byte[] value)
        {
            using (var hash = SHA256.Create())
                return string.Concat(hash.ComputeHash(value).Select(item => item.ToString("x2")));
        }

        private static string Argument(string name, string fallback)
        {
            var args = Environment.GetCommandLineArgs();
            var index = Array.IndexOf(args, name);
            return index >= 0 && index + 1 < args.Length ? args[index + 1] : fallback;
        }

        [Serializable]
        private sealed class ExportManifest
        {
            public string schema;
            public int schemaVersion;
            public string unityVersion;
            public string searchRoot;
            public int shaderCount;
            public int passCount;
            public List<ShaderRecord> shaders = new List<ShaderRecord>();
        }

        [Serializable]
        private sealed class ShaderRecord
        {
            public string assetPath;
            public string assetGuid;
            public string graphSha256;
            public string shaderName;
            public int subshaderCount;
            public int passCount;
            public List<PassRecord> passes = new List<PassRecord>();
        }

        [Serializable]
        private sealed class PassRecord
        {
            public int subshader;
            public int pass;
            public string name;
            public string file;
            public string sha256;
            public int byteLength;
        }
    }
}
#endif
