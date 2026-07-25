// Serialized/native material binding inventory for all Mega Terrain detail
// prototypes. This does not infer which renderer path Unity selects; it
// records every possible `_MainTex`/MainTexture binding on the source prefab
// material so a frame-debugger or render-difference oracle can decide it.

#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace ToonLab.Editor
{
    public static class UnityTerrainDetailMaterialProbe
    {
        private const string DefaultScene =
            "Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity";

        [Serializable]
        private sealed class Report
        {
            public string scene;
            public string unityVersion;
            public List<PrototypeRecord> prototypes = new List<PrototypeRecord>();
        }

        [Serializable]
        private sealed class PrototypeRecord
        {
            public int index;
            public string renderMode;
            public bool usePrototypeMesh;
            public bool useInstancing;
            public string prototypeName;
            public string prototypePath;
            public string rendererType;
            public string meshName;
            public string meshPath;
            public List<MaterialRecord> materials = new List<MaterialRecord>();
        }

        [Serializable]
        private sealed class MaterialRecord
        {
            public int slot;
            public string materialName;
            public string materialPath;
            public string shaderName;
            public string shaderPath;
            public int renderQueue;
            public bool enableInstancing;
            public string mainTextureName;
            public string mainTexturePath;
            public float[] mainTextureScale;
            public float[] mainTextureOffset;
            public int mainTexPropertyIndex;
            public bool hasMainTex;
            public string mainTexTextureName;
            public string mainTexTexturePath;
            public List<TexturePropertyRecord> flaggedMainTextures =
                new List<TexturePropertyRecord>();
            public List<TexturePropertyRecord> allTextureProperties =
                new List<TexturePropertyRecord>();
        }

        [Serializable]
        private sealed class TexturePropertyRecord
        {
            public int index;
            public string name;
            public string description;
            public string flags;
            public string textureName;
            public string texturePath;
            public float[] scale;
            public float[] offset;
        }

        public static void Run()
        {
            try
            {
                var scenePath = Argument("-scene", DefaultScene);
                var output = Path.GetFullPath(Argument(
                    "-output",
                    Path.Combine(Path.GetTempPath(), "toonlab-unity-detail-materials.json")));
                var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                if (!scene.IsValid() || !scene.isLoaded)
                    throw new InvalidOperationException("Could not open scene: " + scenePath);
                var terrain = Resources.FindObjectsOfTypeAll<Terrain>()
                    .FirstOrDefault(candidate => candidate.gameObject.scene == scene);
                if (terrain == null)
                    throw new InvalidOperationException("Mega scene Terrain is missing.");

                var report = new Report
                {
                    scene = scenePath,
                    unityVersion = Application.unityVersion,
                };
                var prototypes = terrain.terrainData.detailPrototypes;
                for (var index = 0; index < prototypes.Length; index += 1)
                {
                    var source = prototypes[index];
                    var prefab = source.prototype;
                    var renderer = prefab == null
                        ? null
                        : prefab.GetComponentInChildren<Renderer>(true);
                    var meshFilter = renderer == null
                        ? null
                        : renderer.GetComponent<MeshFilter>();
                    var skinned = renderer as SkinnedMeshRenderer;
                    var mesh = meshFilter == null ? skinned?.sharedMesh : meshFilter.sharedMesh;
                    var record = new PrototypeRecord
                    {
                        index = index,
                        renderMode = source.renderMode.ToString(),
                        usePrototypeMesh = source.usePrototypeMesh,
                        useInstancing = source.useInstancing,
                        prototypeName = prefab == null ? string.Empty : prefab.name,
                        prototypePath = prefab == null ? string.Empty : AssetDatabase.GetAssetPath(prefab),
                        rendererType = renderer == null ? string.Empty : renderer.GetType().FullName,
                        meshName = mesh == null ? string.Empty : mesh.name,
                        meshPath = mesh == null ? string.Empty : AssetDatabase.GetAssetPath(mesh),
                    };
                    var materials = renderer == null
                        ? Array.Empty<Material>()
                        : renderer.sharedMaterials;
                    for (var slot = 0; slot < materials.Length; slot += 1)
                    {
                        var material = materials[slot];
                        if (material == null)
                            continue;
                        var shader = material.shader;
                        var mainTexIndex = shader == null
                            ? -1
                            : shader.FindPropertyIndex("_MainTex");
                        var materialRecord = new MaterialRecord
                        {
                            slot = slot,
                            materialName = material.name,
                            materialPath = AssetDatabase.GetAssetPath(material),
                            shaderName = shader == null ? string.Empty : shader.name,
                            shaderPath = shader == null ? string.Empty : AssetDatabase.GetAssetPath(shader),
                            renderQueue = material.renderQueue,
                            enableInstancing = material.enableInstancing,
                            mainTextureName = material.mainTexture == null
                                ? string.Empty
                                : material.mainTexture.name,
                            mainTexturePath = material.mainTexture == null
                                ? string.Empty
                                : AssetDatabase.GetAssetPath(material.mainTexture),
                            mainTextureScale = ToArray(material.mainTextureScale),
                            mainTextureOffset = ToArray(material.mainTextureOffset),
                            mainTexPropertyIndex = mainTexIndex,
                            hasMainTex = material.HasProperty("_MainTex"),
                            mainTexTextureName = material.HasProperty("_MainTex") &&
                                material.GetTexture("_MainTex") != null
                                ? material.GetTexture("_MainTex").name
                                : string.Empty,
                            mainTexTexturePath = material.HasProperty("_MainTex") &&
                                material.GetTexture("_MainTex") != null
                                ? AssetDatabase.GetAssetPath(material.GetTexture("_MainTex"))
                                : string.Empty,
                        };
                        if (shader != null)
                        {
                            for (var propertyIndex = 0;
                                propertyIndex < shader.GetPropertyCount();
                                propertyIndex += 1)
                            {
                                if (shader.GetPropertyType(propertyIndex) !=
                                    UnityEngine.Rendering.ShaderPropertyType.Texture)
                                    continue;
                                var propertyName = shader.GetPropertyName(propertyIndex);
                                var texture = material.HasProperty(propertyName)
                                    ? material.GetTexture(propertyName)
                                    : null;
                                var property = new TexturePropertyRecord
                                {
                                    index = propertyIndex,
                                    name = propertyName,
                                    description = shader.GetPropertyDescription(propertyIndex),
                                    flags = shader.GetPropertyFlags(propertyIndex).ToString(),
                                    textureName = texture == null ? string.Empty : texture.name,
                                    texturePath = texture == null
                                        ? string.Empty
                                        : AssetDatabase.GetAssetPath(texture),
                                    scale = material.HasProperty(propertyName)
                                        ? ToArray(material.GetTextureScale(propertyName))
                                        : Array.Empty<float>(),
                                    offset = material.HasProperty(propertyName)
                                        ? ToArray(material.GetTextureOffset(propertyName))
                                        : Array.Empty<float>(),
                                };
                                materialRecord.allTextureProperties.Add(property);
                                if ((shader.GetPropertyFlags(propertyIndex) &
                                    UnityEngine.Rendering.ShaderPropertyFlags.MainTexture) != 0)
                                    materialRecord.flaggedMainTextures.Add(property);
                            }
                        }
                        record.materials.Add(materialRecord);
                    }
                    report.prototypes.Add(record);
                }
                Directory.CreateDirectory(Path.GetDirectoryName(output) ?? Path.GetTempPath());
                File.WriteAllText(output, JsonUtility.ToJson(report, true));
                Debug.Log("TOONLAB_UNITY_DETAIL_MATERIALS=" + output);
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
                EditorApplication.Exit(1);
            }
        }

        private static float[] ToArray(Vector2 value)
        {
            return new[] { value.x, value.y };
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
