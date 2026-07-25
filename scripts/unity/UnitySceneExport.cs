// Deterministic Unity Editor exporter for the supplied So Stylized demo scene.
//
// Geometry and hierarchy are written to a GLB that Three.js GLTFLoader can load.
// Unity-only state (TerrainData, material properties, renderer flags, LOD groups,
// lights, and exact asset references) is written to scene-manifest.json plus
// little-endian binary terrain sidecars. Native Terrain.GetPosition authority
// and diagnostic surface probes live in terrain-native-authority.json so a
// later probe pass cannot rewrite an already capture-pinned scene manifest.
//
// Usage:
//   Unity -batchmode -projectPath <project> \
//     -executeMethod ToonLab.Editor.UnitySceneExport.Run \
//     -scene Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity \
//     -captureLabel package-recommended-urp-settings \
//     -pipeline Assets/SoStylized-Unity/Settings/URP_Asset_SoStylized.asset \
//     -output /path/to/assets-local/sostylized-unity/mega-scene -quit

#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Unity.Collections;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace ToonLab.Editor
{
    public static class UnitySceneExport
    {
        private const string DefaultScene =
            "Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity";
        private const string Schema = "toonlab.sostylized-unity.scene-export";
        private const int SchemaVersion = 2;
        private const string TerrainNativeAuthoritySchema =
            "toonlab.sostylized-unity.terrain-native-authority";
        private const int TerrainNativeAuthoritySchemaVersion = 1;

        private static ExportContext s_Context;

        public static void Run()
        {
            try
            {
                var scenePath = Argument("-scene", DefaultScene);
                var outputPath = Path.GetFullPath(Argument(
                    "-output",
                    Path.Combine(Path.GetTempPath(), "toonlab-unity-scene-export")));
                var captureLabel = Argument("-captureLabel", "project-active");
                var pipelineOverridePath = Argument("-pipeline", string.Empty);

                if (!scenePath.StartsWith("Assets/", StringComparison.Ordinal))
                    throw new ArgumentException("-scene must be an Assets-relative Unity path.");
                if (!string.IsNullOrEmpty(pipelineOverridePath))
                {
                    var pipelineOverride = AssetDatabase.LoadAssetAtPath<RenderPipelineAsset>(
                        pipelineOverridePath);
                    if (pipelineOverride == null)
                        throw new ArgumentException(
                            "-pipeline did not resolve a RenderPipelineAsset: " +
                            pipelineOverridePath);
                    QualitySettings.renderPipeline = pipelineOverride;
                }

                Directory.CreateDirectory(outputPath);
                var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                if (!scene.IsValid() || !scene.isLoaded)
                    throw new InvalidOperationException("Could not open scene: " + scenePath);

                s_Context = new ExportContext(
                    scenePath,
                    outputPath,
                    captureLabel,
                    pipelineOverridePath);
                s_Context.Export(scene);

                Debug.Log("TOONLAB_UNITY_SCENE_EXPORT=" + outputPath);
                Debug.Log("TOONLAB_UNITY_SCENE_MANIFEST=" +
                    Path.Combine(outputPath, "scene-manifest.json"));
                Debug.Log("TOONLAB_UNITY_TERRAIN_NATIVE_AUTHORITY=" +
                    Path.Combine(outputPath, "terrain-native-authority.json"));
                Debug.Log("TOONLAB_UNITY_SCENE_GLB=" + Path.Combine(outputPath, "scene.glb"));
                EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
                EditorApplication.Exit(1);
            }
        }

        private static string Argument(string name, string fallback)
        {
            var args = Environment.GetCommandLineArgs();
            var index = Array.IndexOf(args, name);
            return index >= 0 && index + 1 < args.Length ? args[index + 1] : fallback;
        }

        private sealed class ExportContext
        {
            private readonly string _scenePath;
            private readonly string _outputPath;
            private readonly string _captureLabel;
            private readonly string _pipelineOverridePath;
            private readonly SceneManifest _manifest;
            private readonly TerrainNativeAuthorityManifest _terrainNativeAuthority;
            private readonly GlbBuilder _glb;
            private readonly Dictionary<Mesh, MeshGeometry> _geometries =
                new Dictionary<Mesh, MeshGeometry>();
            private readonly Dictionary<string, int> _gltfMeshVariants =
                new Dictionary<string, int>(StringComparer.Ordinal);
            private readonly Dictionary<Material, int> _materials =
                new Dictionary<Material, int>();
            private readonly Dictionary<Texture, int> _textures =
                new Dictionary<Texture, int>();
            private readonly Dictionary<Camera, int> _cameras =
                new Dictionary<Camera, int>();
            private readonly Dictionary<GameObject, int> _nodeIndices =
                new Dictionary<GameObject, int>();
            private readonly Dictionary<GameObject, int> _prefabPrototypes =
                new Dictionary<GameObject, int>();
            private readonly List<PendingPrefabPrototype> _pendingPrefabPrototypes =
                new List<PendingPrefabPrototype>();

            public ExportContext(
                string scenePath,
                string outputPath,
                string captureLabel,
                string pipelineOverridePath)
            {
                _scenePath = scenePath;
                _outputPath = outputPath;
                _captureLabel = captureLabel;
                _pipelineOverridePath = pipelineOverridePath;
                _manifest = new SceneManifest
                {
                    schema = Schema,
                    schemaVersion = SchemaVersion,
                    sourceScene = scenePath,
                    coordinateSystem = new CoordinateSystemRecord
                    {
                        manifest = "Unity left-handed Y-up, +Z forward, metres",
                        glb = "glTF right-handed Y-up; Unity Z is reflected; triangle winding and tangent handedness are converted",
                        terrainBinaryOrder = "row-major z/y then x; little-endian",
                    },
                    glb = "scene.glb",
                };
                _terrainNativeAuthority = new TerrainNativeAuthorityManifest
                {
                    schema = TerrainNativeAuthoritySchema,
                    schemaVersion = TerrainNativeAuthoritySchemaVersion,
                    sourceScene = scenePath,
                };
                _glb = new GlbBuilder(Path.Combine(outputPath, "scene.bin.tmp"));
            }

            public void Export(Scene scene)
            {
                _manifest.sceneName = scene.name;
                _manifest.scenePath = scene.path;
                _manifest.renderSettings = CaptureRenderSettings();

                var roots = scene.GetRootGameObjects();
                foreach (var root in roots)
                {
                    var nodeIndex = ExportNode(root, -1, root.name);
                    _manifest.rootNodes.Add(nodeIndex);
                    _glb.RootNodes.Add(nodeIndex);
                }

                ResolveLodGroups(scene);
                ExportPendingPrefabPrototypes();
                _glb.WriteGlb(Path.Combine(_outputPath, "scene.glb"));
                _glb.Dispose();

                _manifest.summary = new SummaryRecord
                {
                    nodeCount = _manifest.nodes.Count,
                    meshGeometryCount = _manifest.meshes.Count,
                    gltfMeshVariantCount = _glb.MeshCount,
                    materialCount = _manifest.materials.Count,
                    textureCount = _manifest.textures.Count,
                    cameraCount = _manifest.cameras.Count,
                    lightCount = _manifest.lights.Count,
                    terrainCount = _manifest.terrains.Count,
                    lodGroupCount = _manifest.lodGroups.Count,
                    prefabPrototypeCount = _manifest.prefabPrototypes.Count,
                    prefabPrototypeNodeCount = _manifest.prefabPrototypes.Sum(item => item.nodes.Count),
                    unsupportedSkinnedMeshCount = _manifest.limitations
                        .Count(item => item.code == "skinned-mesh-no-skin"),
                };

                var json = JsonUtility.ToJson(_manifest, true) + "\n";
                File.WriteAllText(
                    Path.Combine(_outputPath, "scene-manifest.json"),
                    json,
                    new UTF8Encoding(false));
                var terrainNativeAuthorityJson =
                    JsonUtility.ToJson(_terrainNativeAuthority, true) + "\n";
                File.WriteAllText(
                    Path.Combine(_outputPath, "terrain-native-authority.json"),
                    terrainNativeAuthorityJson,
                    new UTF8Encoding(false));
            }

            private int ExportNode(GameObject gameObject, int parentIndex, string hierarchyPath)
            {
                var transform = gameObject.transform;
                var nodeIndex = _manifest.nodes.Count;
                var gltfNode = new GltfNode
                {
                    name = gameObject.name,
                    translation = ConvertPosition(transform.localPosition),
                    rotation = ConvertRotation(transform.localRotation),
                    scale = ToArray(transform.localScale),
                    extrasUnityNode = nodeIndex,
                };
                _glb.Nodes.Add(gltfNode);
                _nodeIndices[gameObject] = nodeIndex;

                var record = new NodeRecord
                {
                    index = nodeIndex,
                    gltfNode = nodeIndex,
                    name = gameObject.name,
                    hierarchyPath = hierarchyPath,
                    parent = parentIndex,
                    siblingIndex = transform.GetSiblingIndex(),
                    activeSelf = gameObject.activeSelf,
                    activeInHierarchy = gameObject.activeInHierarchy,
                    layer = gameObject.layer,
                    layerName = LayerMask.LayerToName(gameObject.layer),
                    tag = SafeTag(gameObject),
                    staticEditorFlags = GameObjectUtility.GetStaticEditorFlags(gameObject).ToString(),
                    localPosition = ToArray(transform.localPosition),
                    localRotation = ToArray(transform.localRotation),
                    localScale = ToArray(transform.localScale),
                    worldPosition = ToArray(transform.position),
                    worldRotation = ToArray(transform.rotation),
                    worldScale = ToArray(transform.lossyScale),
                    prefab = AssetReference(PrefabUtility.GetCorrespondingObjectFromSource(gameObject)),
                    components = ComponentNames(gameObject),
                };
                _manifest.nodes.Add(record);

                var meshFilter = gameObject.GetComponent<MeshFilter>();
                var meshRenderer = gameObject.GetComponent<MeshRenderer>();
                if (meshFilter != null && meshFilter.sharedMesh != null)
                {
                    record.mesh = ExportMeshGeometry(meshFilter.sharedMesh);
                    record.renderer = CaptureRenderer(meshRenderer);
                    var gltfMesh = ExportGltfMeshVariant(
                        meshFilter.sharedMesh,
                        meshRenderer == null ? null : meshRenderer.sharedMaterials,
                        hierarchyPath);
                    record.gltfMesh = gltfMesh;
                    gltfNode.mesh = gltfMesh;
                }

                var skinnedRenderer = gameObject.GetComponent<SkinnedMeshRenderer>();
                if (skinnedRenderer != null && skinnedRenderer.sharedMesh != null)
                {
                    record.mesh = ExportMeshGeometry(skinnedRenderer.sharedMesh);
                    record.renderer = CaptureRenderer(skinnedRenderer);
                    var gltfMesh = ExportGltfMeshVariant(
                        skinnedRenderer.sharedMesh,
                        skinnedRenderer.sharedMaterials,
                        hierarchyPath + "#skinned-bind-pose");
                    record.gltfMesh = gltfMesh;
                    gltfNode.mesh = gltfMesh;
                    _manifest.limitations.Add(new LimitationRecord
                    {
                        code = "skinned-mesh-no-skin",
                        node = nodeIndex,
                        message = "Bind-pose geometry is exported, but joints, weights, blend shapes, and animation are not encoded in this scene GLB.",
                    });
                }

                var camera = gameObject.GetComponent<Camera>();
                if (camera != null)
                {
                    record.camera = ExportCamera(camera, nodeIndex);
                    gltfNode.camera = record.camera;
                }

                var light = gameObject.GetComponent<Light>();
                if (light != null)
                    record.light = ExportLight(light, nodeIndex);

                var terrain = gameObject.GetComponent<Terrain>();
                if (terrain != null && terrain.terrainData != null)
                    record.terrain = ExportTerrain(terrain, nodeIndex, hierarchyPath);

                for (var i = 0; i < transform.childCount; i += 1)
                {
                    var child = transform.GetChild(i).gameObject;
                    var childIndex = ExportNode(
                        child,
                        nodeIndex,
                        hierarchyPath + "/" + child.name);
                    record.children.Add(childIndex);
                    gltfNode.children.Add(childIndex);
                }

                return nodeIndex;
            }

            private int ExportMeshGeometry(Mesh mesh)
            {
                MeshGeometry geometry;
                if (_geometries.TryGetValue(mesh, out geometry))
                    return geometry.manifestIndex;

                geometry = _glb.ExportGeometry(mesh);
                geometry.manifestIndex = _manifest.meshes.Count;
                _geometries.Add(mesh, geometry);

                var asset = AssetReference(mesh);
                var record = new MeshRecord
                {
                    index = geometry.manifestIndex,
                    name = mesh.name,
                    asset = asset,
                    vertexCount = mesh.vertexCount,
                    subMeshCount = mesh.subMeshCount,
                    indexFormat = mesh.indexFormat.ToString(),
                    boundsCenter = ToArray(mesh.bounds.center),
                    boundsSize = ToArray(mesh.bounds.size),
                    attributes = geometry.attributeNames.ToArray(),
                };
                for (var submesh = 0; submesh < mesh.subMeshCount; submesh += 1)
                {
                    var descriptor = geometry.submeshes[submesh];
                    record.submeshes.Add(new SubMeshRecord
                    {
                        index = submesh,
                        topology = descriptor.topology,
                        indexCount = descriptor.indexCount,
                        baseVertex = descriptor.baseVertex,
                        boundsCenter = descriptor.boundsCenter,
                        boundsSize = descriptor.boundsSize,
                    });
                }
                _manifest.meshes.Add(record);
                return record.index;
            }

            private int ExportGltfMeshVariant(Mesh mesh, Material[] sharedMaterials, string path)
            {
                var materialKey = sharedMaterials == null
                    ? "none"
                    : string.Join(",", sharedMaterials.Select(material =>
                        material == null ? "null" : material.GetEntityId().ToString()).ToArray());
                var key = mesh.GetEntityId() + ":" + materialKey;
                int existing;
                if (_gltfMeshVariants.TryGetValue(key, out existing))
                    return existing;

                var geometry = _geometries[mesh];
                var primitives = new List<GltfPrimitive>();
                for (var submesh = 0; submesh < geometry.submeshes.Count; submesh += 1)
                {
                    var material = -1;
                    if (sharedMaterials != null && submesh < sharedMaterials.Length &&
                        sharedMaterials[submesh] != null)
                        material = ExportMaterial(sharedMaterials[submesh]);

                    primitives.Add(new GltfPrimitive
                    {
                        attributes = geometry.attributes,
                        indices = geometry.submeshes[submesh].accessor,
                        material = material,
                        mode = geometry.submeshes[submesh].mode,
                    });
                }

                var gltfMesh = _glb.Meshes.Count;
                _glb.Meshes.Add(new GltfMesh
                {
                    name = mesh.name,
                    primitives = primitives,
                    extrasUnityPath = path,
                    extrasUnityMesh = geometry.manifestIndex,
                });
                _gltfMeshVariants.Add(key, gltfMesh);
                return gltfMesh;
            }

            private int ExportMaterial(Material material)
            {
                int existing;
                if (_materials.TryGetValue(material, out existing))
                    return existing;

                var index = _manifest.materials.Count;
                _materials.Add(material, index);
                var shader = material.shader;
                var record = new MaterialRecord
                {
                    index = index,
                    name = material.name,
                    asset = AssetReference(material),
                    shaderName = shader == null ? null : shader.name,
                    shader = AssetReference(shader),
                    renderQueue = material.renderQueue,
                    enableInstancing = material.enableInstancing,
                    doubleSidedGI = material.doubleSidedGI,
                    globalIlluminationFlags = material.globalIlluminationFlags.ToString(),
                    keywords = material.shaderKeywords.OrderBy(value => value, StringComparer.Ordinal).ToArray(),
                };

                if (shader != null)
                {
                    var count = ShaderUtil.GetPropertyCount(shader);
                    for (var propertyIndex = 0; propertyIndex < count; propertyIndex += 1)
                    {
                        var propertyName = ShaderUtil.GetPropertyName(shader, propertyIndex);
                        if (!material.HasProperty(propertyName))
                            continue;
                        var propertyType = ShaderUtil.GetPropertyType(shader, propertyIndex);
                        var property = new MaterialPropertyRecord
                        {
                            name = propertyName,
                            description = ShaderUtil.GetPropertyDescription(shader, propertyIndex),
                            type = propertyType.ToString(),
                        };
                        switch (propertyType)
                        {
                            case ShaderUtil.ShaderPropertyType.Color:
                                property.value = ToArray(material.GetColor(propertyName));
                                break;
                            case ShaderUtil.ShaderPropertyType.Vector:
                                property.value = ToArray(material.GetVector(propertyName));
                                break;
                            case ShaderUtil.ShaderPropertyType.Float:
                            case ShaderUtil.ShaderPropertyType.Range:
                                property.value = new[] { material.GetFloat(propertyName) };
                                break;
                            case ShaderUtil.ShaderPropertyType.TexEnv:
                                var texture = material.GetTexture(propertyName);
                                property.texture = texture == null ? -1 : ExportTexture(texture);
                                property.textureScale = ToArray(material.GetTextureScale(propertyName));
                                property.textureOffset = ToArray(material.GetTextureOffset(propertyName));
                                break;
                        }
                        record.properties.Add(property);
                    }
                }
                _manifest.materials.Add(record);

                _glb.Materials.Add(new GltfMaterial
                {
                    name = material.name,
                    doubleSided = material.GetTag("Cull", false, "Back") == "Off",
                    extrasUnityMaterial = index,
                    extrasUnityShader = record.shaderName,
                });
                return index;
            }

            private int ExportTexture(Texture texture)
            {
                int existing;
                if (_textures.TryGetValue(texture, out existing))
                    return existing;

                var index = _manifest.textures.Count;
                _textures.Add(texture, index);
                var assetPath = AssetDatabase.GetAssetPath(texture);
                var guid = string.IsNullOrEmpty(assetPath)
                    ? string.Empty
                    : AssetDatabase.AssetPathToGUID(assetPath);
                var extension = string.IsNullOrEmpty(assetPath)
                    ? ".bin"
                    : Path.GetExtension(assetPath);
                var fileName = (string.IsNullOrEmpty(guid) ? "runtime" : guid) + "_" +
                    SafeFileName(texture.name) + extension.ToLowerInvariant();
                var relativePath = "textures/source/" + fileName;
                var destination = Path.Combine(_outputPath, relativePath.Replace('/', Path.DirectorySeparatorChar));
                var copied = false;
                if (!string.IsNullOrEmpty(assetPath))
                {
                    var source = Path.Combine(
                        Directory.GetParent(Application.dataPath).FullName,
                        assetPath.Replace('/', Path.DirectorySeparatorChar));
                    if (File.Exists(source))
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(destination));
                        File.Copy(source, destination, true);
                        copied = true;
                    }
                }

                var importerRecord = new TextureImporterRecord();
                var importer = AssetImporter.GetAtPath(assetPath) as TextureImporter;
                if (importer != null)
                {
                    importerRecord.present = true;
                    importerRecord.textureType = importer.textureType.ToString();
                    importerRecord.textureShape = importer.textureShape.ToString();
                    importerRecord.sRGBTexture = importer.sRGBTexture;
                    importerRecord.flipGreenChannel = importer.flipGreenChannel;
                    importerRecord.mipmapEnabled = importer.mipmapEnabled;
                    importerRecord.wrapMode = importer.wrapMode.ToString();
                    importerRecord.filterMode = importer.filterMode.ToString();
                    importerRecord.anisoLevel = importer.anisoLevel;
                    importerRecord.alphaSource = importer.alphaSource.ToString();
                    importerRecord.alphaIsTransparency = importer.alphaIsTransparency;
                    importerRecord.npotScale = importer.npotScale.ToString();
                }

                _manifest.textures.Add(new TextureRecord
                {
                    index = index,
                    name = texture.name,
                    asset = AssetReference(texture),
                    width = texture.width,
                    height = texture.height,
                    dimension = texture.dimension.ToString(),
                    format = texture is Texture2D ? ((Texture2D)texture).format.ToString() : texture.graphicsFormat.ToString(),
                    exactSourceCopy = copied ? relativePath : null,
                    importer = importerRecord,
                });
                return index;
            }

            private RendererRecord CaptureRenderer(Renderer renderer)
            {
                if (renderer == null)
                    return null;
                var materials = renderer.sharedMaterials;
                var materialIndices = new int[materials.Length];
                for (var i = 0; i < materials.Length; i += 1)
                    materialIndices[i] = materials[i] == null ? -1 : ExportMaterial(materials[i]);

                return new RendererRecord
                {
                    type = renderer.GetType().FullName,
                    enabled = renderer.enabled,
                    forceRenderingOff = renderer.forceRenderingOff,
                    shadowCastingMode = renderer.shadowCastingMode.ToString(),
                    receiveShadows = renderer.receiveShadows,
                    staticShadowCaster = renderer.staticShadowCaster,
                    motionVectorGenerationMode = renderer.motionVectorGenerationMode.ToString(),
                    lightProbeUsage = renderer.lightProbeUsage.ToString(),
                    reflectionProbeUsage = renderer.reflectionProbeUsage.ToString(),
                    renderingLayerMask = renderer.renderingLayerMask.ToString(CultureInfo.InvariantCulture),
                    allowOcclusionWhenDynamic = renderer.allowOcclusionWhenDynamic,
                    sortingLayerID = renderer.sortingLayerID,
                    sortingLayerName = renderer.sortingLayerName,
                    sortingOrder = renderer.sortingOrder,
                    boundsCenter = ToArray(renderer.bounds.center),
                    boundsSize = ToArray(renderer.bounds.size),
                    materialIndices = materialIndices,
                    materialNames = materials.Select(item => item == null ? null : item.name).ToArray(),
                };
            }

            private int ExportCamera(Camera camera, int node)
            {
                int existing;
                if (_cameras.TryGetValue(camera, out existing))
                    return existing;
                var index = _manifest.cameras.Count;
                _cameras.Add(camera, index);

                var record = new CameraRecord
                {
                    index = index,
                    node = node,
                    name = camera.name,
                    enabled = camera.enabled,
                    orthographic = camera.orthographic,
                    fieldOfView = camera.fieldOfView,
                    orthographicSize = camera.orthographicSize,
                    nearClipPlane = camera.nearClipPlane,
                    farClipPlane = camera.farClipPlane,
                    aspect = camera.aspect,
                    depth = camera.depth,
                    clearFlags = camera.clearFlags.ToString(),
                    backgroundColor = ToArray(camera.backgroundColor),
                    cullingMask = camera.cullingMask,
                    eventMask = camera.eventMask,
                    allowHDR = camera.allowHDR,
                    allowMSAA = camera.allowMSAA,
                    allowDynamicResolution = camera.allowDynamicResolution,
                    useOcclusionCulling = camera.useOcclusionCulling,
                    targetDisplay = camera.targetDisplay,
                    usePhysicalProperties = camera.usePhysicalProperties,
                    focalLength = camera.focalLength,
                    sensorSize = ToArray(camera.sensorSize),
                    lensShift = ToArray(camera.lensShift),
                    gateFit = camera.gateFit.ToString(),
                };
                _manifest.cameras.Add(record);
                _glb.Cameras.Add(GltfCamera.From(record));
                return index;
            }

            private int ExportLight(Light light, int node)
            {
                var index = _manifest.lights.Count;
                _manifest.lights.Add(new LightRecord
                {
                    index = index,
                    node = node,
                    name = light.name,
                    enabled = light.enabled,
                    type = light.type.ToString(),
                    shape = light.shape.ToString(),
                    color = ToArray(light.color),
                    colorTemperature = light.colorTemperature,
                    useColorTemperature = light.useColorTemperature,
                    intensity = light.intensity,
                    bounceIntensity = light.bounceIntensity,
                    range = light.range,
                    spotAngle = light.spotAngle,
                    innerSpotAngle = light.innerSpotAngle,
                    areaSize = ToArray(light.areaSize),
                    cullingMask = light.cullingMask,
                    renderingLayerMask = light.renderingLayerMask.ToString(CultureInfo.InvariantCulture),
                    shadows = light.shadows.ToString(),
                    shadowStrength = light.shadowStrength,
                    shadowResolution = light.shadowResolution.ToString(),
                    shadowBias = light.shadowBias,
                    shadowNormalBias = light.shadowNormalBias,
                    shadowNearPlane = light.shadowNearPlane,
                    cookie = light.cookie == null ? -1 : ExportTexture(light.cookie),
                    cookieSize = light.cookieSize,
                    renderMode = light.renderMode.ToString(),
                });
                return index;
            }

            private int ExportTerrain(Terrain terrain, int node, string hierarchyPath)
            {
                var data = terrain.terrainData;
                var index = _manifest.terrains.Count;
                var folderName = index.ToString("D3", CultureInfo.InvariantCulture) + "-" +
                    SafeFileName(data.name);
                var relativeFolder = "terrain/" + folderName;
                var outputFolder = Path.Combine(_outputPath, relativeFolder.Replace('/', Path.DirectorySeparatorChar));
                Directory.CreateDirectory(outputFolder);

                var record = new TerrainRecord
                {
                    index = index,
                    node = node,
                    hierarchyPath = hierarchyPath,
                    name = terrain.name,
                    terrainDataName = data.name,
                    terrainData = AssetReference(data),
                    size = ToArray(data.size),
                    heightmapResolution = data.heightmapResolution,
                    heightmapScale = ToArray(data.heightmapScale),
                    alphamapResolution = data.alphamapResolution,
                    alphamapWidth = data.alphamapWidth,
                    alphamapHeight = data.alphamapHeight,
                    alphamapLayers = data.alphamapLayers,
                    baseMapResolution = data.baseMapResolution,
                    holesResolution = data.holesResolution,
                    detailResolution = data.detailResolution,
                    detailResolutionPerPatch = data.detailResolutionPerPatch,
                    detailPatchCount = data.detailPatchCount,
                    heightmapPixelError = terrain.heightmapPixelError,
                    basemapDistance = terrain.basemapDistance,
                    drawHeightmap = terrain.drawHeightmap,
                    drawInstanced = terrain.drawInstanced,
                    allowAutoConnect = terrain.allowAutoConnect,
                    groupingID = terrain.groupingID,
                    shadowCastingMode = terrain.shadowCastingMode.ToString(),
                    renderingLayerMask = terrain.renderingLayerMask.ToString(CultureInfo.InvariantCulture),
                    treeDistance = terrain.treeDistance,
                    treeBillboardDistance = terrain.treeBillboardDistance,
                    treeCrossFadeLength = terrain.treeCrossFadeLength,
                    treeMaximumFullLODCount = terrain.treeMaximumFullLODCount,
                    detailObjectDistance = terrain.detailObjectDistance,
                    detailObjectDensity = terrain.detailObjectDensity,
                    bakeLightProbesForTrees = terrain.bakeLightProbesForTrees,
                    preserveTreePrototypeLayers = terrain.preserveTreePrototypeLayers,
                    materialTemplate = terrain.materialTemplate == null ? -1 : ExportMaterial(terrain.materialTemplate),
                    folder = relativeFolder,
                    heights = relativeFolder + "/heights.f32",
                    alphamaps = relativeFolder + "/alphamaps.f32",
                    holes = relativeFolder + "/holes.u8",
                };
                var nativeAuthority = new TerrainNativeAuthorityRecord
                {
                    index = index,
                    node = node,
                    terrainData = record.terrainData,
                    position = ToArray(terrain.GetPosition()),
                    renderTransformAuthority =
                        "UnityEngine.Terrain.GetPosition(): translation only; rotation and scale ignored",
                };

                // Direct native TerrainData probes make row orientation,
                // interpolation, splat coordinates, and the translation-only
                // renderer frame independently testable outside Unity. The
                // serialized TransformPoint result is retained specifically
                // to prove that it is not the Terrain renderer position when
                // a scene file happens to contain rotation/scale values.
                for (var probeZ = 0; probeZ <= 8; probeZ += 1)
                for (var probeX = 0; probeX <= 8; probeX += 1)
                {
                    var heightmapX = Mathf.RoundToInt(
                        (data.heightmapResolution - 1) * probeX / 8f);
                    var heightmapZ = Mathf.RoundToInt(
                        (data.heightmapResolution - 1) * probeZ / 8f);
                    var normalizedX = heightmapX / (float)(data.heightmapResolution - 1);
                    var normalizedZ = heightmapZ / (float)(data.heightmapResolution - 1);
                    var nativeHeight = data.GetHeight(heightmapX, heightmapZ);
                    var interpolatedHeight = data.GetInterpolatedHeight(
                        normalizedX,
                        normalizedZ);
                    var localPosition = new Vector3(
                        normalizedX * data.size.x,
                        nativeHeight,
                        normalizedZ * data.size.z);
                    var rendererWorldPosition = terrain.GetPosition() + localPosition;
                    var alphamapX = Mathf.RoundToInt(
                        (data.alphamapWidth - 1) * normalizedX);
                    var alphamapZ = Mathf.RoundToInt(
                        (data.alphamapHeight - 1) * normalizedZ);
                    var weights = data.GetAlphamaps(alphamapX, alphamapZ, 1, 1);
                    var splatWeights = new float[data.alphamapLayers];
                    for (var layer = 0; layer < splatWeights.Length; layer += 1)
                        splatWeights[layer] = weights[0, 0, layer];
                    nativeAuthority.surfaceProbes.Add(new TerrainSurfaceProbeRecord
                    {
                        heightmapX = heightmapX,
                        heightmapZ = heightmapZ,
                        normalizedX = normalizedX,
                        normalizedZ = normalizedZ,
                        nativeHeight = nativeHeight,
                        interpolatedHeight = interpolatedHeight,
                        interpolatedNormal = ToArray(data.GetInterpolatedNormal(
                            normalizedX,
                            normalizedZ)),
                        localPosition = ToArray(localPosition),
                        rendererWorldPosition = ToArray(rendererWorldPosition),
                        serializedTransformWorldPosition = ToArray(
                            terrain.transform.TransformPoint(localPosition)),
                        alphamapX = alphamapX,
                        alphamapZ = alphamapZ,
                        splatWeights = splatWeights,
                    });
                }

                WriteFloatGrid(
                    Path.Combine(outputFolder, "heights.f32"),
                    data.GetHeights(0, 0, data.heightmapResolution, data.heightmapResolution));

                var alphamaps = data.GetAlphamaps(0, 0, data.alphamapWidth, data.alphamapHeight);
                WriteFloatVolume(Path.Combine(outputFolder, "alphamaps.f32"), alphamaps);
                ExportControlMaps(outputFolder, relativeFolder, alphamaps, record);

                var holes = data.GetHoles(0, 0, data.holesResolution, data.holesResolution);
                WriteBoolGrid(Path.Combine(outputFolder, "holes.u8"), holes);

                var terrainLayers = data.terrainLayers;
                for (var layer = 0; layer < terrainLayers.Length; layer += 1)
                {
                    var source = terrainLayers[layer];
                    if (source == null)
                    {
                        record.layers.Add(new TerrainLayerRecord { index = layer, name = null });
                        continue;
                    }
                    record.layers.Add(new TerrainLayerRecord
                    {
                        index = layer,
                        name = source.name,
                        asset = AssetReference(source),
                        diffuseTexture = source.diffuseTexture == null ? -1 : ExportTexture(source.diffuseTexture),
                        normalMapTexture = source.normalMapTexture == null ? -1 : ExportTexture(source.normalMapTexture),
                        maskMapTexture = source.maskMapTexture == null ? -1 : ExportTexture(source.maskMapTexture),
                        tileSize = ToArray(source.tileSize),
                        tileOffset = ToArray(source.tileOffset),
                        specular = ToArray(source.specular),
                        metallic = source.metallic,
                        smoothness = source.smoothness,
                        normalScale = source.normalScale,
                        diffuseRemapMin = ToArray(source.diffuseRemapMin),
                        diffuseRemapMax = ToArray(source.diffuseRemapMax),
                        maskMapRemapMin = ToArray(source.maskMapRemapMin),
                        maskMapRemapMax = ToArray(source.maskMapRemapMax),
                    });
                }

                var detailPrototypes = data.detailPrototypes;
                for (var prototype = 0; prototype < detailPrototypes.Length; prototype += 1)
                {
                    var detail = detailPrototypes[prototype];
                    var detailFile = "detail-" + prototype.ToString("D3", CultureInfo.InvariantCulture) + ".i32";
                    var transformFile = "detail-" + prototype.ToString("D3", CultureInfo.InvariantCulture) +
                        "-native-transforms.f32";
                    WriteIntGrid(
                        Path.Combine(outputFolder, detailFile),
                        data.GetDetailLayer(0, 0, data.detailWidth, data.detailHeight, prototype));
                    record.detailPrototypes.Add(new DetailPrototypeRecord
                    {
                        index = prototype,
                        prototype = AssetReference(detail.prototype),
                        gltfPrefab = detail.prototype == null
                            ? -1
                            : QueuePrefabPrototype(detail.prototype),
                        prototypeTexture = detail.prototypeTexture == null ? -1 : ExportTexture(detail.prototypeTexture),
                        minWidth = detail.minWidth,
                        maxWidth = detail.maxWidth,
                        minHeight = detail.minHeight,
                        maxHeight = detail.maxHeight,
                        noiseSeed = detail.noiseSeed,
                        noiseSpread = detail.noiseSpread,
                        density = detail.density,
                        healthyColor = ToArray(detail.healthyColor),
                        dryColor = ToArray(detail.dryColor),
                        renderMode = detail.renderMode.ToString(),
                        usePrototypeMesh = detail.usePrototypeMesh,
                        useInstancing = detail.useInstancing,
                        useDensityScaling = detail.useDensityScaling,
                        positionJitter = detail.positionJitter,
                        targetCoverage = detail.targetCoverage,
                        data = relativeFolder + "/" + detailFile,
                        nativeTransforms = ExportNativeDetailTransforms(
                            data,
                            prototype,
                            terrain.detailObjectDensity,
                            Path.Combine(outputFolder, transformFile),
                            relativeFolder + "/" + transformFile),
                    });
                }

                var treePrototypes = data.treePrototypes;
                for (var prototype = 0; prototype < treePrototypes.Length; prototype += 1)
                {
                    var tree = treePrototypes[prototype];
                    record.treePrototypes.Add(new TreePrototypeRecord
                    {
                        index = prototype,
                        prefab = AssetReference(tree.prefab),
                        gltfPrefab = tree.prefab == null
                            ? -1
                            : QueuePrefabPrototype(tree.prefab),
                        bendFactor = tree.bendFactor,
                        navMeshLod = tree.navMeshLod,
                    });
                }
                foreach (var tree in data.treeInstances)
                {
                    record.treeInstances.Add(new TreeInstanceRecord
                    {
                        position = ToArray(tree.position),
                        widthScale = tree.widthScale,
                        heightScale = tree.heightScale,
                        rotation = tree.rotation,
                        color = ToArray(tree.color),
                        lightmapColor = ToArray(tree.lightmapColor),
                        prototypeIndex = tree.prototypeIndex,
                    });
                }

                _manifest.terrains.Add(record);
                _terrainNativeAuthority.terrains.Add(nativeAuthority);
                return index;
            }

            private static NativeDetailTransformSetRecord ExportNativeDetailTransforms(
                TerrainData data,
                int prototypeIndex,
                float density,
                string outputPath,
                string relativePath)
            {
                var record = new NativeDetailTransformSetRecord
                {
                    api = "UnityEngine.TerrainData.ComputeDetailInstanceTransforms",
                    authority = "exact same transform data Unity uses for detail rendering",
                    coordinateSystem = "Unity Terrain local left-handed; runtime reflects posZ and rotationY",
                    data = relativePath,
                    density = density,
                    densityAuthority = "Terrain.detailObjectDensity passed verbatim",
                    format = "little-endian float32",
                    layout = "patch-major source Z then X; posX,posY,posZ,rotationY,scaleXZ,scaleY",
                    patchCount = data.detailPatchCount * data.detailPatchCount,
                    patchCountPerAxis = data.detailPatchCount,
                    strideFloats = 6,
                    unityVersion = Application.unityVersion,
                };
                var transformOffset = 0;
                using (var stream = new FileStream(outputPath, FileMode.Create, FileAccess.Write, FileShare.None))
                using (var writer = new BinaryWriter(stream))
                {
                    for (var patchZ = 0; patchZ < data.detailPatchCount; patchZ += 1)
                    for (var patchX = 0; patchX < data.detailPatchCount; patchX += 1)
                    {
                        Bounds bounds;
                        var transforms = data.ComputeDetailInstanceTransforms(
                            patchX,
                            patchZ,
                            prototypeIndex,
                            density,
                            out bounds);
                        var patch = new NativeDetailTransformPatchRecord
                        {
                            index = patchZ * data.detailPatchCount + patchX,
                            patchX = patchX,
                            patchZ = patchZ,
                            transformOffset = transformOffset,
                            count = transforms.Length,
                            boundsCenter = ToArray(bounds.center),
                            boundsSize = ToArray(bounds.size),
                        };
                        record.patches.Add(patch);
                        foreach (var transform in transforms)
                        {
                            writer.Write(transform.posX);
                            writer.Write(transform.posY);
                            writer.Write(transform.posZ);
                            writer.Write(transform.rotationY);
                            writer.Write(transform.scaleXZ);
                            writer.Write(transform.scaleY);
                        }
                        transformOffset += transforms.Length;
                    }
                }
                record.transformCount = transformOffset;
                record.byteLength = transformOffset * record.strideFloats * sizeof(float);
                record.sha256 = FileSha256(outputPath);
                return record;
            }

            private static void ExportControlMaps(
                string outputFolder,
                string relativeFolder,
                float[,,] alphamaps,
                TerrainRecord record)
            {
                var height = alphamaps.GetLength(0);
                var width = alphamaps.GetLength(1);
                var layers = alphamaps.GetLength(2);
                var maps = (layers + 3) / 4;
                for (var map = 0; map < maps; map += 1)
                {
                    var raw = new byte[width * height * 4];
                    var cursor = 0;
                    for (var y = 0; y < height; y += 1)
                    for (var x = 0; x < width; x += 1)
                    for (var channel = 0; channel < 4; channel += 1)
                    {
                        var layer = map * 4 + channel;
                        var value = layer < layers ? alphamaps[y, x, layer] : 0f;
                        raw[cursor++] = (byte)Mathf.Clamp(Mathf.RoundToInt(value * 255f), 0, 255);
                    }
                    var rawName = "control-" + map.ToString("D2", CultureInfo.InvariantCulture) + ".rgba8";
                    File.WriteAllBytes(Path.Combine(outputFolder, rawName), raw);
                    var texture = new Texture2D(width, height, TextureFormat.RGBA32, false, true);
                    texture.LoadRawTextureData(raw);
                    texture.Apply(false, false);
                    var pngName = "control-" + map.ToString("D2", CultureInfo.InvariantCulture) + ".png";
                    File.WriteAllBytes(Path.Combine(outputFolder, pngName), texture.EncodeToPNG());
                    UnityEngine.Object.DestroyImmediate(texture);
                    record.controlMaps.Add(new ControlMapRecord
                    {
                        index = map,
                        firstLayer = map * 4,
                        raw = relativeFolder + "/" + rawName,
                        png = relativeFolder + "/" + pngName,
                    });
                }
            }

            private int QueuePrefabPrototype(GameObject prefab)
            {
                int existing;
                if (_prefabPrototypes.TryGetValue(prefab, out existing))
                    return existing;

                var index = _manifest.prefabPrototypes.Count;
                var record = new PrefabPrototypeRecord
                {
                    index = index,
                    prefab = AssetReference(prefab),
                };
                _prefabPrototypes.Add(prefab, index);
                _manifest.prefabPrototypes.Add(record);
                _pendingPrefabPrototypes.Add(new PendingPrefabPrototype
                {
                    prefab = prefab,
                    record = record,
                });
                return index;
            }

            private void ExportPendingPrefabPrototypes()
            {
                foreach (var pending in _pendingPrefabPrototypes)
                {
                    var objectToLocalNode = new Dictionary<GameObject, int>();
                    pending.record.gltfRoot = ExportPrefabNode(
                        pending.prefab,
                        -1,
                        pending.prefab.name,
                        pending.record,
                        objectToLocalNode);
                    _glb.PrototypeRoots.Add(pending.record.gltfRoot);
                    ResolvePrefabLodGroups(pending.prefab, pending.record, objectToLocalNode);
                }
            }

            private int ExportPrefabNode(
                GameObject gameObject,
                int parentLocalNode,
                string hierarchyPath,
                PrefabPrototypeRecord prototype,
                Dictionary<GameObject, int> objectToLocalNode)
            {
                var transform = gameObject.transform;
                var localNode = prototype.nodes.Count;
                var gltfNodeIndex = _glb.Nodes.Count;
                var gltfNode = new GltfNode
                {
                    name = gameObject.name,
                    translation = ConvertPosition(transform.localPosition),
                    rotation = ConvertRotation(transform.localRotation),
                    scale = ToArray(transform.localScale),
                    extrasUnityNode = -1,
                    extrasUnityPrefab = prototype.index,
                    extrasUnityPrefabNode = localNode,
                };
                _glb.Nodes.Add(gltfNode);
                objectToLocalNode[gameObject] = localNode;

                var record = new PrefabNodeRecord
                {
                    index = localNode,
                    gltfNode = gltfNodeIndex,
                    parent = parentLocalNode,
                    name = gameObject.name,
                    hierarchyPath = hierarchyPath,
                    activeSelf = gameObject.activeSelf,
                    layer = gameObject.layer,
                    layerName = LayerMask.LayerToName(gameObject.layer),
                    tag = SafeTag(gameObject),
                    localPosition = ToArray(transform.localPosition),
                    localRotation = ToArray(transform.localRotation),
                    localScale = ToArray(transform.localScale),
                    components = ComponentNames(gameObject),
                };
                prototype.nodes.Add(record);

                var meshFilter = gameObject.GetComponent<MeshFilter>();
                var meshRenderer = gameObject.GetComponent<MeshRenderer>();
                if (meshFilter != null && meshFilter.sharedMesh != null)
                {
                    record.mesh = ExportMeshGeometry(meshFilter.sharedMesh);
                    record.renderer = CaptureRenderer(meshRenderer);
                    record.gltfMesh = ExportGltfMeshVariant(
                        meshFilter.sharedMesh,
                        meshRenderer == null ? null : meshRenderer.sharedMaterials,
                        "prefab:" + prototype.index + "/" + hierarchyPath);
                    gltfNode.mesh = record.gltfMesh;
                }

                var skinnedRenderer = gameObject.GetComponent<SkinnedMeshRenderer>();
                if (skinnedRenderer != null && skinnedRenderer.sharedMesh != null)
                {
                    record.mesh = ExportMeshGeometry(skinnedRenderer.sharedMesh);
                    record.renderer = CaptureRenderer(skinnedRenderer);
                    record.gltfMesh = ExportGltfMeshVariant(
                        skinnedRenderer.sharedMesh,
                        skinnedRenderer.sharedMaterials,
                        "prefab:" + prototype.index + "/" + hierarchyPath + "#skinned-bind-pose");
                    gltfNode.mesh = record.gltfMesh;
                    _manifest.limitations.Add(new LimitationRecord
                    {
                        code = "skinned-prefab-no-skin",
                        node = -1,
                        message = "Prefab " + prototype.index + " node " + localNode +
                            " exports bind-pose geometry without joints, weights, blend shapes, or animation.",
                    });
                }

                for (var i = 0; i < transform.childCount; i += 1)
                {
                    var child = transform.GetChild(i).gameObject;
                    var childGltfNode = ExportPrefabNode(
                        child,
                        localNode,
                        hierarchyPath + "/" + child.name,
                        prototype,
                        objectToLocalNode);
                    var childLocalNode = prototype.nodes.Count - 1;
                    // Recursion may have added descendants, so resolve the direct child by object.
                    childLocalNode = objectToLocalNode[child];
                    record.children.Add(childLocalNode);
                    gltfNode.children.Add(childGltfNode);
                }
                return gltfNodeIndex;
            }

            private static void ResolvePrefabLodGroups(
                GameObject prefab,
                PrefabPrototypeRecord prototype,
                Dictionary<GameObject, int> objectToLocalNode)
            {
                foreach (var group in prefab.GetComponentsInChildren<LODGroup>(true))
                {
                    int localNode;
                    if (!objectToLocalNode.TryGetValue(group.gameObject, out localNode))
                        continue;
                    var record = new PrefabLodGroupRecord
                    {
                        node = localNode,
                        enabled = group.enabled,
                        size = group.size,
                        localReferencePoint = ToArray(group.localReferencePoint),
                        fadeMode = group.fadeMode.ToString(),
                        animateCrossFading = group.animateCrossFading,
                    };
                    foreach (var lod in group.GetLODs())
                    {
                        var lodRecord = new LodRecord
                        {
                            screenRelativeTransitionHeight = lod.screenRelativeTransitionHeight,
                            fadeTransitionWidth = lod.fadeTransitionWidth,
                        };
                        foreach (var renderer in lod.renderers)
                        {
                            int rendererNode;
                            lodRecord.rendererNodes.Add(
                                renderer != null && objectToLocalNode.TryGetValue(renderer.gameObject, out rendererNode)
                                    ? rendererNode
                                    : -1);
                        }
                        record.lods.Add(lodRecord);
                    }
                    prototype.lodGroups.Add(record);
                }
            }

            private void ResolveLodGroups(Scene scene)
            {
                var groups = scene.GetRootGameObjects()
                    .SelectMany(root => root.GetComponentsInChildren<LODGroup>(true))
                    .OrderBy(group => HierarchyPath(group.transform), StringComparer.Ordinal)
                    .ToArray();
                foreach (var group in groups)
                {
                    int node;
                    if (!_nodeIndices.TryGetValue(group.gameObject, out node))
                        continue;
                    var record = new LodGroupRecord
                    {
                        index = _manifest.lodGroups.Count,
                        node = node,
                        enabled = group.enabled,
                        size = group.size,
                        localReferencePoint = ToArray(group.localReferencePoint),
                        fadeMode = group.fadeMode.ToString(),
                        animateCrossFading = group.animateCrossFading,
                    };
                    foreach (var lod in group.GetLODs())
                    {
                        var lodRecord = new LodRecord
                        {
                            screenRelativeTransitionHeight = lod.screenRelativeTransitionHeight,
                            fadeTransitionWidth = lod.fadeTransitionWidth,
                        };
                        foreach (var renderer in lod.renderers)
                        {
                            if (renderer == null)
                            {
                                lodRecord.rendererNodes.Add(-1);
                                continue;
                            }
                            int rendererNode;
                            lodRecord.rendererNodes.Add(
                                _nodeIndices.TryGetValue(renderer.gameObject, out rendererNode)
                                    ? rendererNode
                                    : -1);
                        }
                        record.lods.Add(lodRecord);
                    }
                    _manifest.lodGroups.Add(record);
                    _manifest.nodes[node].lodGroup = record.index;
                }
            }

            private RenderSettingsRecord CaptureRenderSettings()
            {
                var pipeline = GraphicsSettings.currentRenderPipeline;
                return new RenderSettingsRecord
                {
                    captureLabel = _captureLabel,
                    colorSpace = QualitySettings.activeColorSpace.ToString(),
                    pipelineOverrideApplied = string.IsNullOrEmpty(_pipelineOverridePath)
                        || AssetDatabase.GetAssetPath(pipeline) == _pipelineOverridePath,
                    pipelineOverrideRequested = _pipelineOverridePath,
                    pipelineSettings = CapturePipelineSettings(pipeline),
                    qualityLevel = QualitySettings.names[QualitySettings.GetQualityLevel()],
                    unityVersion = Application.unityVersion,
                    fog = RenderSettings.fog,
                    fogMode = RenderSettings.fogMode.ToString(),
                    fogColor = ToArray(RenderSettings.fogColor),
                    fogDensity = RenderSettings.fogDensity,
                    fogStartDistance = RenderSettings.fogStartDistance,
                    fogEndDistance = RenderSettings.fogEndDistance,
                    ambientMode = RenderSettings.ambientMode.ToString(),
                    ambientIntensity = RenderSettings.ambientIntensity,
                    ambientSkyColor = ToArray(RenderSettings.ambientSkyColor),
                    ambientEquatorColor = ToArray(RenderSettings.ambientEquatorColor),
                    ambientGroundColor = ToArray(RenderSettings.ambientGroundColor),
                    reflectionIntensity = RenderSettings.reflectionIntensity,
                    reflectionBounces = RenderSettings.reflectionBounces,
                    defaultReflectionMode = RenderSettings.defaultReflectionMode.ToString(),
                    defaultReflectionResolution = RenderSettings.defaultReflectionResolution,
                    haloStrength = RenderSettings.haloStrength,
                    flareStrength = RenderSettings.flareStrength,
                    flareFadeSpeed = RenderSettings.flareFadeSpeed,
                    subtractiveShadowColor = ToArray(RenderSettings.subtractiveShadowColor),
                    skybox = RenderSettings.skybox == null ? -1 : ExportMaterial(RenderSettings.skybox),
                    customReflection = RenderSettings.customReflectionTexture == null
                        ? -1
                        : ExportTexture(RenderSettings.customReflectionTexture),
                    pipeline = AssetReference(pipeline),
                    sunName = RenderSettings.sun == null ? null : RenderSettings.sun.name,
                };
            }

            private static PipelineSettingsRecord CapturePipelineSettings(
                RenderPipelineAsset pipeline)
            {
                if (pipeline == null)
                    return null;
                var source = new SerializedObject(pipeline);
                var defaultRendererIndex = SerializedInt(source, "m_DefaultRendererIndex");
                var rendererList = source.FindProperty("m_RendererDataList");
                UnityEngine.Object renderer = null;
                if (rendererList != null && rendererList.isArray && rendererList.arraySize > 0)
                {
                    var rendererIndex = Mathf.Clamp(
                        defaultRendererIndex,
                        0,
                        rendererList.arraySize - 1);
                    renderer = rendererList.GetArrayElementAtIndex(rendererIndex)
                        .objectReferenceValue;
                }
                var record = new PipelineSettingsRecord
                {
                    asset = AssetReference(pipeline),
                    assetSha256 = AssetSha256(pipeline),
                    cascade4Split = ToArray(SerializedVector3(source, "m_Cascade4Split")),
                    colorGradingLutSize = SerializedInt(source, "m_ColorGradingLutSize"),
                    colorGradingMode = SerializedInt(source, "m_ColorGradingMode"),
                    defaultRendererIndex = defaultRendererIndex,
                    hdrColorBufferPrecision = SerializedInt(source, "m_HDRColorBufferPrecision"),
                    mainLightShadowmapResolution =
                        SerializedInt(source, "m_MainLightShadowmapResolution"),
                    msaa = SerializedInt(source, "m_MSAA"),
                    requiresDepthTexture = SerializedBool(source, "m_RequireDepthTexture"),
                    requiresOpaqueTexture = SerializedBool(source, "m_RequireOpaqueTexture"),
                    renderer = AssetReference(renderer),
                    rendererAssetSha256 = AssetSha256(renderer),
                    shadowCascadeCount = SerializedInt(source, "m_ShadowCascadeCount"),
                    shadowDepthBias = SerializedFloat(source, "m_ShadowDepthBias"),
                    shadowDistance = SerializedFloat(source, "m_ShadowDistance"),
                    shadowNormalBias = SerializedFloat(source, "m_ShadowNormalBias"),
                    supportsHdr = SerializedBool(source, "m_SupportsHDR"),
                };
                if (renderer == null)
                    return record;
                var rendererSource = new SerializedObject(renderer);
                record.rendererMode = SerializedInt(rendererSource, "m_RenderingMode");
                record.rendererNativeRenderPass =
                    SerializedBool(rendererSource, "m_UseNativeRenderPass");
                var features = rendererSource.FindProperty("m_RendererFeatures");
                if (features == null || !features.isArray)
                    return record;
                for (var index = 0; index < features.arraySize; index += 1)
                {
                    var feature = features.GetArrayElementAtIndex(index).objectReferenceValue;
                    if (feature == null)
                        continue;
                    var featureSource = new SerializedObject(feature);
                    var aoMethod = SerializedInt(featureSource, "m_Settings.AOMethod");
                    var radius = SerializedFloat(featureSource, "m_Settings.Radius");
                    var samples = SerializedInt(featureSource, "m_Settings.Samples");
                    record.rendererFeatures.Add(new RendererFeatureSettingsRecord
                    {
                        active = SerializedBool(featureSource, "m_Active"),
                        aoMethod = aoMethod,
                        aoMethodName = aoMethod == 0
                            ? "BlueNoise"
                            : aoMethod == 1 ? "InterleavedGradient" : "Unknown",
                        directLightingStrength = SerializedFloat(
                            featureSource,
                            "m_Settings.DirectLightingStrength"),
                        effectiveRadius = aoMethod == 0 ? radius * 1.5f : radius,
                        name = feature.name,
                        radius = radius,
                        reference = AssetReference(feature),
                        sampleCount = samples == 0 ? 12 : samples == 1 ? 8 : 4,
                        sampleQuality = samples == 0 ? "High" : samples == 1 ? "Medium" : "Low",
                        type = feature.GetType().FullName,
                    });
                }
                return record;
            }

            private static int SerializedInt(SerializedObject source, string path)
            {
                var property = source.FindProperty(path);
                return property == null ? 0 : property.intValue;
            }

            private static float SerializedFloat(SerializedObject source, string path)
            {
                var property = source.FindProperty(path);
                return property == null ? 0f : property.floatValue;
            }

            private static bool SerializedBool(SerializedObject source, string path)
            {
                var property = source.FindProperty(path);
                return property != null && property.boolValue;
            }

            private static Vector3 SerializedVector3(SerializedObject source, string path)
            {
                var property = source.FindProperty(path);
                return property == null ? Vector3.zero : property.vector3Value;
            }

            private static string AssetSha256(UnityEngine.Object value)
            {
                if (value == null)
                    return null;
                var path = AssetDatabase.GetAssetPath(value);
                return string.IsNullOrEmpty(path) || !File.Exists(path)
                    ? null
                    : FileSha256(path);
            }

            private static string FileSha256(string path)
            {
                using (var sha = SHA256.Create())
                using (var stream = File.OpenRead(path))
                {
                    return BitConverter.ToString(sha.ComputeHash(stream))
                        .Replace("-", string.Empty)
                        .ToLowerInvariant();
                }
            }

            private static AssetReferenceRecord AssetReference(UnityEngine.Object value)
            {
                if (value == null)
                    return null;
                var path = AssetDatabase.GetAssetPath(value);
                string guid;
                long localId;
                AssetDatabase.TryGetGUIDAndLocalFileIdentifier(value, out guid, out localId);
                return new AssetReferenceRecord
                {
                    name = value.name,
                    type = value.GetType().FullName,
                    path = path,
                    guid = guid,
                    localFileId = localId.ToString(CultureInfo.InvariantCulture),
                };
            }

            private static string[] ComponentNames(GameObject gameObject)
            {
                return gameObject.GetComponents<Component>()
                    .Select(component => component == null
                        ? "MissingScript"
                        : component.GetType().FullName)
                    .ToArray();
            }

            private static string SafeTag(GameObject gameObject)
            {
                try { return gameObject.tag; }
                catch { return "Untagged"; }
            }
        }

        private sealed class GlbBuilder : IDisposable
        {
            private readonly string _binaryPath;
            private readonly FileStream _binary;
            private readonly BinaryWriter _writer;

            public readonly List<int> RootNodes = new List<int>();
            public readonly List<int> PrototypeRoots = new List<int>();
            public readonly List<GltfNode> Nodes = new List<GltfNode>();
            public readonly List<GltfMesh> Meshes = new List<GltfMesh>();
            public readonly List<GltfMaterial> Materials = new List<GltfMaterial>();
            public readonly List<GltfCamera> Cameras = new List<GltfCamera>();
            public readonly List<GltfBufferView> BufferViews = new List<GltfBufferView>();
            public readonly List<GltfAccessor> Accessors = new List<GltfAccessor>();

            public int MeshCount { get { return Meshes.Count; } }

            public GlbBuilder(string binaryPath)
            {
                _binaryPath = binaryPath;
                _binary = new FileStream(binaryPath, FileMode.Create, FileAccess.ReadWrite, FileShare.None);
                _writer = new BinaryWriter(_binary, new UTF8Encoding(false), true);
            }

            public MeshGeometry ExportGeometry(Mesh mesh)
            {
                var geometry = new MeshGeometry();
                using (var meshDataArray = Mesh.AcquireReadOnlyMeshData(mesh))
                {
                    var meshData = meshDataArray[0];
                    var vertexCount = meshData.vertexCount;

                    var positions = new NativeArray<Vector3>(vertexCount, Allocator.Temp);
                    try
                    {
                        meshData.GetVertices(positions);
                        var converted = new float[vertexCount * 3];
                        var minimum = new[] { float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity };
                        var maximum = new[] { float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity };
                        for (var i = 0; i < vertexCount; i += 1)
                        {
                            var value = positions[i];
                            var x = value.x;
                            var y = value.y;
                            var z = -value.z;
                            converted[i * 3] = x;
                            converted[i * 3 + 1] = y;
                            converted[i * 3 + 2] = z;
                            minimum[0] = Mathf.Min(minimum[0], x);
                            minimum[1] = Mathf.Min(minimum[1], y);
                            minimum[2] = Mathf.Min(minimum[2], z);
                            maximum[0] = Mathf.Max(maximum[0], x);
                            maximum[1] = Mathf.Max(maximum[1], y);
                            maximum[2] = Mathf.Max(maximum[2], z);
                        }
                        geometry.attributes.Add("POSITION", AddFloatAccessor(converted, 3, minimum, maximum));
                        geometry.attributeNames.Add("POSITION");
                    }
                    finally { positions.Dispose(); }

                    if (meshData.HasVertexAttribute(VertexAttribute.Normal))
                    {
                        var source = new NativeArray<Vector3>(vertexCount, Allocator.Temp);
                        try
                        {
                            meshData.GetNormals(source);
                            var values = new float[vertexCount * 3];
                            for (var i = 0; i < vertexCount; i += 1)
                            {
                                values[i * 3] = source[i].x;
                                values[i * 3 + 1] = source[i].y;
                                values[i * 3 + 2] = -source[i].z;
                            }
                            geometry.attributes.Add("NORMAL", AddFloatAccessor(values, 3, null, null));
                            geometry.attributeNames.Add("NORMAL");
                        }
                        finally { source.Dispose(); }
                    }

                    if (meshData.HasVertexAttribute(VertexAttribute.Tangent))
                    {
                        var source = new NativeArray<Vector4>(vertexCount, Allocator.Temp);
                        try
                        {
                            meshData.GetTangents(source);
                            var values = new float[vertexCount * 4];
                            for (var i = 0; i < vertexCount; i += 1)
                            {
                                values[i * 4] = source[i].x;
                                values[i * 4 + 1] = source[i].y;
                                values[i * 4 + 2] = -source[i].z;
                                values[i * 4 + 3] = -source[i].w;
                            }
                            geometry.attributes.Add("TANGENT", AddFloatAccessor(values, 4, null, null));
                            geometry.attributeNames.Add("TANGENT");
                        }
                        finally { source.Dispose(); }
                    }

                    if (meshData.HasVertexAttribute(VertexAttribute.Color))
                    {
                        var source = new NativeArray<Color>(vertexCount, Allocator.Temp);
                        try
                        {
                            meshData.GetColors(source);
                            var values = new float[vertexCount * 4];
                            for (var i = 0; i < vertexCount; i += 1)
                            {
                                values[i * 4] = source[i].r;
                                values[i * 4 + 1] = source[i].g;
                                values[i * 4 + 2] = source[i].b;
                                values[i * 4 + 3] = source[i].a;
                            }
                            geometry.attributes.Add("COLOR_0", AddFloatAccessor(values, 4, null, null));
                            geometry.attributeNames.Add("COLOR_0");
                        }
                        finally { source.Dispose(); }
                    }

                    for (var channel = 0; channel < 8; channel += 1)
                    {
                        var attribute = (VertexAttribute)((int)VertexAttribute.TexCoord0 + channel);
                        if (!meshData.HasVertexAttribute(attribute))
                            continue;
                        var dimension = meshData.GetVertexAttributeDimension(attribute);
                        var source = new NativeArray<Vector4>(vertexCount, Allocator.Temp);
                        try
                        {
                            meshData.GetUVs(channel, source);
                            var componentCount = Mathf.Clamp(dimension, 2, 4);
                            var values = new float[vertexCount * componentCount];
                            for (var i = 0; i < vertexCount; i += 1)
                            {
                                values[i * componentCount] = source[i].x;
                                values[i * componentCount + 1] = source[i].y;
                                if (componentCount > 2) values[i * componentCount + 2] = source[i].z;
                                if (componentCount > 3) values[i * componentCount + 3] = source[i].w;
                            }
                            var semantic = componentCount == 2
                                ? "TEXCOORD_" + channel
                                : "_UNITY_TEXCOORD_" + channel;
                            geometry.attributes.Add(semantic, AddFloatAccessor(values, componentCount, null, null));
                            geometry.attributeNames.Add(semantic);
                        }
                        finally { source.Dispose(); }
                    }

                    NativeArray<ushort> indices16 = default(NativeArray<ushort>);
                    NativeArray<uint> indices32 = default(NativeArray<uint>);
                    if (meshData.indexFormat == IndexFormat.UInt16)
                        indices16 = meshData.GetIndexData<ushort>();
                    else
                        indices32 = meshData.GetIndexData<uint>();

                    for (var submesh = 0; submesh < meshData.subMeshCount; submesh += 1)
                    {
                        var descriptor = meshData.GetSubMesh(submesh);
                        var sourceIndices = new uint[descriptor.indexCount];
                        for (var i = 0; i < descriptor.indexCount; i += 1)
                        {
                            var rawIndex = descriptor.indexStart + i;
                            var value = meshData.indexFormat == IndexFormat.UInt16
                                ? indices16[rawIndex]
                                : indices32[rawIndex];
                            sourceIndices[i] = value + (uint)descriptor.baseVertex;
                        }
                        if (descriptor.topology == MeshTopology.Triangles)
                        {
                            for (var i = 0; i + 2 < sourceIndices.Length; i += 3)
                            {
                                var swap = sourceIndices[i + 1];
                                sourceIndices[i + 1] = sourceIndices[i + 2];
                                sourceIndices[i + 2] = swap;
                            }
                        }
                        else if (descriptor.topology == MeshTopology.Quads)
                        {
                            sourceIndices = ConvertQuads(sourceIndices);
                        }
                        geometry.submeshes.Add(new MeshSubmeshGeometry
                        {
                            accessor = AddIndexAccessor(sourceIndices),
                            mode = GltfMode(descriptor.topology),
                            topology = descriptor.topology.ToString(),
                            indexCount = sourceIndices.Length,
                            baseVertex = descriptor.baseVertex,
                            boundsCenter = ToArray(descriptor.bounds.center),
                            boundsSize = ToArray(descriptor.bounds.size),
                        });
                    }
                }
                return geometry;
            }

            private int AddFloatAccessor(float[] values, int components, float[] min, float[] max)
            {
                Align4();
                var offset = checked((int)_binary.Position);
                foreach (var value in values) _writer.Write(value);
                var byteLength = checked((int)_binary.Position - offset);
                var bufferView = BufferViews.Count;
                BufferViews.Add(new GltfBufferView { byteOffset = offset, byteLength = byteLength });
                var accessor = Accessors.Count;
                Accessors.Add(new GltfAccessor
                {
                    bufferView = bufferView,
                    componentType = 5126,
                    count = values.Length / components,
                    type = GltfType(components),
                    min = min,
                    max = max,
                });
                return accessor;
            }

            private int AddIndexAccessor(uint[] values)
            {
                Align4();
                var use16 = values.All(value => value <= ushort.MaxValue);
                var offset = checked((int)_binary.Position);
                if (use16)
                    foreach (var value in values) _writer.Write((ushort)value);
                else
                    foreach (var value in values) _writer.Write(value);
                var byteLength = checked((int)_binary.Position - offset);
                var bufferView = BufferViews.Count;
                BufferViews.Add(new GltfBufferView
                {
                    byteOffset = offset,
                    byteLength = byteLength,
                    target = 34963,
                });
                var accessor = Accessors.Count;
                Accessors.Add(new GltfAccessor
                {
                    bufferView = bufferView,
                    componentType = use16 ? 5123 : 5125,
                    count = values.Length,
                    type = "SCALAR",
                    min = values.Length == 0 ? null : new[] { (float)values.Min() },
                    max = values.Length == 0 ? null : new[] { (float)values.Max() },
                });
                return accessor;
            }

            public void WriteGlb(string destination)
            {
                Align4();
                _writer.Flush();
                var binaryLength = checked((int)_binary.Length);
                var json = BuildJson(binaryLength);
                var jsonBytes = Encoding.UTF8.GetBytes(json);
                var jsonPadding = (4 - (jsonBytes.Length & 3)) & 3;
                var binaryPadding = (4 - (binaryLength & 3)) & 3;
                var totalLength = 12 + 8 + jsonBytes.Length + jsonPadding + 8 + binaryLength + binaryPadding;

                _binary.Position = 0;
                using (var output = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None))
                using (var writer = new BinaryWriter(output, new UTF8Encoding(false), true))
                {
                    writer.Write(0x46546C67u);
                    writer.Write(2u);
                    writer.Write((uint)totalLength);
                    writer.Write((uint)(jsonBytes.Length + jsonPadding));
                    writer.Write(0x4E4F534Au);
                    writer.Write(jsonBytes);
                    for (var i = 0; i < jsonPadding; i += 1) writer.Write((byte)0x20);
                    writer.Write((uint)(binaryLength + binaryPadding));
                    writer.Write(0x004E4942u);
                    _binary.CopyTo(output);
                    for (var i = 0; i < binaryPadding; i += 1) writer.Write((byte)0);
                }
            }

            private string BuildJson(int binaryLength)
            {
                var json = new StringBuilder(1024 * 1024);
                json.Append("{\"asset\":{\"version\":\"2.0\",\"generator\":\"ToonLab UnitySceneExport 1\"},");
                json.Append("\"scene\":0,\"scenes\":[{\"name\":\"Unity Scene\",\"nodes\":");
                AppendIntArray(json, RootNodes);
                json.Append('}');
                if (PrototypeRoots.Count > 0)
                {
                    json.Append(",{\"name\":\"Unity Terrain Prefab Prototypes\",\"nodes\":");
                    AppendIntArray(json, PrototypeRoots);
                    json.Append('}');
                }
                json.Append("],\"nodes\":[");
                for (var i = 0; i < Nodes.Count; i += 1)
                {
                    if (i > 0) json.Append(',');
                    Nodes[i].AppendJson(json);
                }
                json.Append("],\"meshes\":[");
                for (var i = 0; i < Meshes.Count; i += 1)
                {
                    if (i > 0) json.Append(',');
                    Meshes[i].AppendJson(json);
                }
                json.Append("],\"materials\":[");
                for (var i = 0; i < Materials.Count; i += 1)
                {
                    if (i > 0) json.Append(',');
                    Materials[i].AppendJson(json);
                }
                json.Append("],\"cameras\":[");
                for (var i = 0; i < Cameras.Count; i += 1)
                {
                    if (i > 0) json.Append(',');
                    Cameras[i].AppendJson(json);
                }
                json.Append("],\"bufferViews\":[");
                for (var i = 0; i < BufferViews.Count; i += 1)
                {
                    if (i > 0) json.Append(',');
                    BufferViews[i].AppendJson(json);
                }
                json.Append("],\"accessors\":[");
                for (var i = 0; i < Accessors.Count; i += 1)
                {
                    if (i > 0) json.Append(',');
                    Accessors[i].AppendJson(json);
                }
                json.Append("],\"buffers\":[{\"byteLength\":");
                json.Append(binaryLength.ToString(CultureInfo.InvariantCulture));
                json.Append("}]}");
                return json.ToString();
            }

            private void Align4()
            {
                while ((_binary.Position & 3) != 0) _writer.Write((byte)0);
            }

            public void Dispose()
            {
                _writer.Dispose();
                _binary.Dispose();
                if (File.Exists(_binaryPath)) File.Delete(_binaryPath);
            }
        }

        private sealed class MeshGeometry
        {
            public int manifestIndex;
            public readonly Dictionary<string, int> attributes = new Dictionary<string, int>();
            public readonly List<string> attributeNames = new List<string>();
            public readonly List<MeshSubmeshGeometry> submeshes = new List<MeshSubmeshGeometry>();
        }

        private sealed class PendingPrefabPrototype
        {
            public GameObject prefab;
            public PrefabPrototypeRecord record;
        }

        private sealed class MeshSubmeshGeometry
        {
            public int accessor;
            public int mode;
            public string topology;
            public int indexCount;
            public int baseVertex;
            public float[] boundsCenter;
            public float[] boundsSize;
        }

        private sealed class GltfNode
        {
            public string name;
            public float[] translation;
            public float[] rotation;
            public float[] scale;
            public int mesh = -1;
            public int camera = -1;
            public int extrasUnityNode;
            public int extrasUnityPrefab = -1;
            public int extrasUnityPrefabNode = -1;
            public readonly List<int> children = new List<int>();

            public void AppendJson(StringBuilder json)
            {
                json.Append('{');
                AppendStringProperty(json, "name", name, false);
                AppendFloatArrayProperty(json, "translation", translation, true);
                AppendFloatArrayProperty(json, "rotation", rotation, true);
                AppendFloatArrayProperty(json, "scale", scale, true);
                if (mesh >= 0) AppendIntProperty(json, "mesh", mesh, true);
                if (camera >= 0) AppendIntProperty(json, "camera", camera, true);
                if (children.Count > 0)
                {
                    json.Append(",\"children\":");
                    AppendIntArray(json, children);
                }
                json.Append(",\"extras\":{\"unityNode\":");
                json.Append(extrasUnityNode.ToString(CultureInfo.InvariantCulture));
                if (extrasUnityPrefab >= 0)
                {
                    json.Append(",\"unityPrefab\":");
                    json.Append(extrasUnityPrefab.ToString(CultureInfo.InvariantCulture));
                    json.Append(",\"unityPrefabNode\":");
                    json.Append(extrasUnityPrefabNode.ToString(CultureInfo.InvariantCulture));
                }
                json.Append("}}");
            }
        }

        private sealed class GltfMesh
        {
            public string name;
            public List<GltfPrimitive> primitives;
            public string extrasUnityPath;
            public int extrasUnityMesh;

            public void AppendJson(StringBuilder json)
            {
                json.Append('{');
                AppendStringProperty(json, "name", name, false);
                json.Append(",\"primitives\":[");
                for (var i = 0; i < primitives.Count; i += 1)
                {
                    if (i > 0) json.Append(',');
                    primitives[i].AppendJson(json);
                }
                json.Append("],\"extras\":{\"unityPath\":");
                AppendJsonString(json, extrasUnityPath);
                json.Append(",\"unityMesh\":");
                json.Append(extrasUnityMesh.ToString(CultureInfo.InvariantCulture));
                json.Append("}}");
            }
        }

        private sealed class GltfPrimitive
        {
            public Dictionary<string, int> attributes;
            public int indices;
            public int material;
            public int mode;

            public void AppendJson(StringBuilder json)
            {
                json.Append("{\"attributes\":{");
                var first = true;
                foreach (var pair in attributes.OrderBy(item => item.Key, StringComparer.Ordinal))
                {
                    if (!first) json.Append(',');
                    first = false;
                    AppendJsonString(json, pair.Key);
                    json.Append(':');
                    json.Append(pair.Value.ToString(CultureInfo.InvariantCulture));
                }
                json.Append("},\"indices\":");
                json.Append(indices.ToString(CultureInfo.InvariantCulture));
                if (material >= 0)
                {
                    json.Append(",\"material\":");
                    json.Append(material.ToString(CultureInfo.InvariantCulture));
                }
                json.Append(",\"mode\":");
                json.Append(mode.ToString(CultureInfo.InvariantCulture));
                json.Append('}');
            }
        }

        private sealed class GltfMaterial
        {
            public string name;
            public bool doubleSided;
            public int extrasUnityMaterial;
            public string extrasUnityShader;

            public void AppendJson(StringBuilder json)
            {
                json.Append('{');
                AppendStringProperty(json, "name", name, false);
                json.Append(",\"pbrMetallicRoughness\":{\"baseColorFactor\":[1,1,1,1],\"metallicFactor\":0,\"roughnessFactor\":1}");
                if (doubleSided) json.Append(",\"doubleSided\":true");
                json.Append(",\"extras\":{\"unityMaterial\":");
                json.Append(extrasUnityMaterial.ToString(CultureInfo.InvariantCulture));
                json.Append(",\"unityShader\":");
                AppendJsonString(json, extrasUnityShader);
                json.Append("}}");
            }
        }

        private sealed class GltfCamera
        {
            public string name;
            public bool orthographic;
            public float yfov;
            public float aspect;
            public float znear;
            public float zfar;
            public float xmag;
            public float ymag;

            public static GltfCamera From(CameraRecord record)
            {
                return new GltfCamera
                {
                    name = record.name,
                    orthographic = record.orthographic,
                    yfov = record.fieldOfView * Mathf.Deg2Rad,
                    aspect = record.aspect,
                    znear = record.nearClipPlane,
                    zfar = record.farClipPlane,
                    ymag = record.orthographicSize,
                    xmag = record.orthographicSize * record.aspect,
                };
            }

            public void AppendJson(StringBuilder json)
            {
                json.Append('{');
                AppendStringProperty(json, "name", name, false);
                if (orthographic)
                {
                    json.Append(",\"type\":\"orthographic\",\"orthographic\":{");
                    AppendFloatProperty(json, "xmag", xmag, false);
                    AppendFloatProperty(json, "ymag", ymag, true);
                    AppendFloatProperty(json, "znear", znear, true);
                    AppendFloatProperty(json, "zfar", zfar, true);
                    json.Append("}}");
                }
                else
                {
                    json.Append(",\"type\":\"perspective\",\"perspective\":{");
                    AppendFloatProperty(json, "yfov", yfov, false);
                    AppendFloatProperty(json, "aspectRatio", aspect, true);
                    AppendFloatProperty(json, "znear", znear, true);
                    AppendFloatProperty(json, "zfar", zfar, true);
                    json.Append("}}");
                }
            }
        }

        private sealed class GltfBufferView
        {
            public int byteOffset;
            public int byteLength;
            public int target;

            public void AppendJson(StringBuilder json)
            {
                json.Append("{\"buffer\":0,\"byteOffset\":");
                json.Append(byteOffset.ToString(CultureInfo.InvariantCulture));
                json.Append(",\"byteLength\":");
                json.Append(byteLength.ToString(CultureInfo.InvariantCulture));
                if (target != 0)
                {
                    json.Append(",\"target\":");
                    json.Append(target.ToString(CultureInfo.InvariantCulture));
                }
                json.Append('}');
            }
        }

        private sealed class GltfAccessor
        {
            public int bufferView;
            public int componentType;
            public int count;
            public string type;
            public float[] min;
            public float[] max;

            public void AppendJson(StringBuilder json)
            {
                json.Append("{\"bufferView\":");
                json.Append(bufferView.ToString(CultureInfo.InvariantCulture));
                json.Append(",\"byteOffset\":0,\"componentType\":");
                json.Append(componentType.ToString(CultureInfo.InvariantCulture));
                json.Append(",\"count\":");
                json.Append(count.ToString(CultureInfo.InvariantCulture));
                json.Append(",\"type\":");
                AppendJsonString(json, type);
                if (min != null) AppendFloatArrayProperty(json, "min", min, true);
                if (max != null) AppendFloatArrayProperty(json, "max", max, true);
                json.Append('}');
            }
        }

        [Serializable]
        private sealed class SceneManifest
        {
            public string schema;
            public int schemaVersion;
            public string sourceScene;
            public string sceneName;
            public string scenePath;
            public string glb;
            public CoordinateSystemRecord coordinateSystem;
            public RenderSettingsRecord renderSettings;
            public SummaryRecord summary;
            public List<int> rootNodes = new List<int>();
            public List<NodeRecord> nodes = new List<NodeRecord>();
            public List<MeshRecord> meshes = new List<MeshRecord>();
            public List<MaterialRecord> materials = new List<MaterialRecord>();
            public List<TextureRecord> textures = new List<TextureRecord>();
            public List<CameraRecord> cameras = new List<CameraRecord>();
            public List<LightRecord> lights = new List<LightRecord>();
            public List<TerrainRecord> terrains = new List<TerrainRecord>();
            public List<LodGroupRecord> lodGroups = new List<LodGroupRecord>();
            public List<PrefabPrototypeRecord> prefabPrototypes = new List<PrefabPrototypeRecord>();
            public List<LimitationRecord> limitations = new List<LimitationRecord>();
        }

        [Serializable]
        private sealed class CoordinateSystemRecord
        {
            public string manifest;
            public string glb;
            public string terrainBinaryOrder;
        }

        [Serializable]
        private sealed class SummaryRecord
        {
            public int nodeCount;
            public int meshGeometryCount;
            public int gltfMeshVariantCount;
            public int materialCount;
            public int textureCount;
            public int cameraCount;
            public int lightCount;
            public int terrainCount;
            public int lodGroupCount;
            public int prefabPrototypeCount;
            public int prefabPrototypeNodeCount;
            public int unsupportedSkinnedMeshCount;
        }

        [Serializable]
        private sealed class NodeRecord
        {
            public int index;
            public int gltfNode;
            public string name;
            public string hierarchyPath;
            public int parent;
            public int siblingIndex;
            public bool activeSelf;
            public bool activeInHierarchy;
            public int layer;
            public string layerName;
            public string tag;
            public string staticEditorFlags;
            public float[] localPosition;
            public float[] localRotation;
            public float[] localScale;
            public float[] worldPosition;
            public float[] worldRotation;
            public float[] worldScale;
            public AssetReferenceRecord prefab;
            public string[] components;
            public List<int> children = new List<int>();
            public int mesh = -1;
            public int gltfMesh = -1;
            public RendererRecord renderer;
            public int camera = -1;
            public int light = -1;
            public int terrain = -1;
            public int lodGroup = -1;
        }

        [Serializable]
        private sealed class MeshRecord
        {
            public int index;
            public string name;
            public AssetReferenceRecord asset;
            public int vertexCount;
            public int subMeshCount;
            public string indexFormat;
            public float[] boundsCenter;
            public float[] boundsSize;
            public string[] attributes;
            public List<SubMeshRecord> submeshes = new List<SubMeshRecord>();
        }

        [Serializable]
        private sealed class SubMeshRecord
        {
            public int index;
            public string topology;
            public int indexCount;
            public int baseVertex;
            public float[] boundsCenter;
            public float[] boundsSize;
        }

        [Serializable]
        private sealed class RendererRecord
        {
            public string type;
            public bool enabled;
            public bool forceRenderingOff;
            public string shadowCastingMode;
            public bool receiveShadows;
            public bool staticShadowCaster;
            public string motionVectorGenerationMode;
            public string lightProbeUsage;
            public string reflectionProbeUsage;
            public string renderingLayerMask;
            public bool allowOcclusionWhenDynamic;
            public int sortingLayerID;
            public string sortingLayerName;
            public int sortingOrder;
            public float[] boundsCenter;
            public float[] boundsSize;
            public int[] materialIndices;
            public string[] materialNames;
        }

        [Serializable]
        private sealed class MaterialRecord
        {
            public int index;
            public string name;
            public AssetReferenceRecord asset;
            public string shaderName;
            public AssetReferenceRecord shader;
            public int renderQueue;
            public bool enableInstancing;
            public bool doubleSidedGI;
            public string globalIlluminationFlags;
            public string[] keywords;
            public List<MaterialPropertyRecord> properties = new List<MaterialPropertyRecord>();
        }

        [Serializable]
        private sealed class MaterialPropertyRecord
        {
            public string name;
            public string description;
            public string type;
            public float[] value;
            public int texture = -1;
            public float[] textureScale;
            public float[] textureOffset;
        }

        [Serializable]
        private sealed class TextureRecord
        {
            public int index;
            public string name;
            public AssetReferenceRecord asset;
            public int width;
            public int height;
            public string dimension;
            public string format;
            public string exactSourceCopy;
            public TextureImporterRecord importer;
        }

        [Serializable]
        private sealed class TextureImporterRecord
        {
            public bool present;
            public string textureType;
            public string textureShape;
            public bool sRGBTexture;
            public bool flipGreenChannel;
            public bool mipmapEnabled;
            public string wrapMode;
            public string filterMode;
            public int anisoLevel;
            public string alphaSource;
            public bool alphaIsTransparency;
            public string npotScale;
        }

        [Serializable]
        private sealed class CameraRecord
        {
            public int index;
            public int node;
            public string name;
            public bool enabled;
            public bool orthographic;
            public float fieldOfView;
            public float orthographicSize;
            public float nearClipPlane;
            public float farClipPlane;
            public float aspect;
            public float depth;
            public string clearFlags;
            public float[] backgroundColor;
            public int cullingMask;
            public int eventMask;
            public bool allowHDR;
            public bool allowMSAA;
            public bool allowDynamicResolution;
            public bool useOcclusionCulling;
            public int targetDisplay;
            public bool usePhysicalProperties;
            public float focalLength;
            public float[] sensorSize;
            public float[] lensShift;
            public string gateFit;
        }

        [Serializable]
        private sealed class LightRecord
        {
            public int index;
            public int node;
            public string name;
            public bool enabled;
            public string type;
            public string shape;
            public float[] color;
            public float colorTemperature;
            public bool useColorTemperature;
            public float intensity;
            public float bounceIntensity;
            public float range;
            public float spotAngle;
            public float innerSpotAngle;
            public float[] areaSize;
            public int cullingMask;
            public string renderingLayerMask;
            public string shadows;
            public float shadowStrength;
            public string shadowResolution;
            public float shadowBias;
            public float shadowNormalBias;
            public float shadowNearPlane;
            public int cookie;
            public float cookieSize;
            public string renderMode;
        }

        [Serializable]
        private sealed class TerrainRecord
        {
            public int index;
            public int node;
            public string hierarchyPath;
            public string name;
            public string terrainDataName;
            public AssetReferenceRecord terrainData;
            public float[] size;
            public int heightmapResolution;
            public float[] heightmapScale;
            public int alphamapResolution;
            public int alphamapWidth;
            public int alphamapHeight;
            public int alphamapLayers;
            public int baseMapResolution;
            public int holesResolution;
            public int detailResolution;
            public int detailResolutionPerPatch;
            public int detailPatchCount;
            public float heightmapPixelError;
            public float basemapDistance;
            public bool drawHeightmap;
            public bool drawInstanced;
            public bool allowAutoConnect;
            public int groupingID;
            public string shadowCastingMode;
            public string renderingLayerMask;
            public float treeDistance;
            public float treeBillboardDistance;
            public float treeCrossFadeLength;
            public int treeMaximumFullLODCount;
            public float detailObjectDistance;
            public float detailObjectDensity;
            public bool bakeLightProbesForTrees;
            public bool preserveTreePrototypeLayers;
            public int materialTemplate;
            public string folder;
            public string heights;
            public string alphamaps;
            public string holes;
            public List<ControlMapRecord> controlMaps = new List<ControlMapRecord>();
            public List<TerrainLayerRecord> layers = new List<TerrainLayerRecord>();
            public List<DetailPrototypeRecord> detailPrototypes = new List<DetailPrototypeRecord>();
            public List<TreePrototypeRecord> treePrototypes = new List<TreePrototypeRecord>();
            public List<TreeInstanceRecord> treeInstances = new List<TreeInstanceRecord>();
        }

        [Serializable]
        private sealed class TerrainNativeAuthorityManifest
        {
            public string schema;
            public int schemaVersion;
            public string sourceScene;
            public List<TerrainNativeAuthorityRecord> terrains =
                new List<TerrainNativeAuthorityRecord>();
        }

        [Serializable]
        private sealed class TerrainNativeAuthorityRecord
        {
            public int index;
            public int node;
            public AssetReferenceRecord terrainData;
            public float[] position;
            public string renderTransformAuthority;
            public List<TerrainSurfaceProbeRecord> surfaceProbes =
                new List<TerrainSurfaceProbeRecord>();
        }

        [Serializable]
        private sealed class TerrainSurfaceProbeRecord
        {
            public int heightmapX;
            public int heightmapZ;
            public float normalizedX;
            public float normalizedZ;
            public float nativeHeight;
            public float interpolatedHeight;
            public float[] interpolatedNormal;
            public float[] localPosition;
            public float[] rendererWorldPosition;
            public float[] serializedTransformWorldPosition;
            public int alphamapX;
            public int alphamapZ;
            public float[] splatWeights;
        }

        [Serializable]
        private sealed class ControlMapRecord
        {
            public int index;
            public int firstLayer;
            public string raw;
            public string png;
        }

        [Serializable]
        private sealed class TerrainLayerRecord
        {
            public int index;
            public string name;
            public AssetReferenceRecord asset;
            public int diffuseTexture = -1;
            public int normalMapTexture = -1;
            public int maskMapTexture = -1;
            public float[] tileSize;
            public float[] tileOffset;
            public float[] specular;
            public float metallic;
            public float smoothness;
            public float normalScale;
            public float[] diffuseRemapMin;
            public float[] diffuseRemapMax;
            public float[] maskMapRemapMin;
            public float[] maskMapRemapMax;
        }

        [Serializable]
        private sealed class DetailPrototypeRecord
        {
            public int index;
            public AssetReferenceRecord prototype;
            public int gltfPrefab = -1;
            public int prototypeTexture = -1;
            public float minWidth;
            public float maxWidth;
            public float minHeight;
            public float maxHeight;
            public int noiseSeed;
            public float noiseSpread;
            public float density;
            public float[] healthyColor;
            public float[] dryColor;
            public string renderMode;
            public bool usePrototypeMesh;
            public bool useInstancing;
            public bool useDensityScaling;
            public float positionJitter;
            public float targetCoverage;
            public string data;
            public NativeDetailTransformSetRecord nativeTransforms;
        }

        [Serializable]
        private sealed class NativeDetailTransformSetRecord
        {
            public string api;
            public string authority;
            public string coordinateSystem;
            public string data;
            public float density;
            public string densityAuthority;
            public string format;
            public string layout;
            public int byteLength;
            public int patchCount;
            public int patchCountPerAxis;
            public string sha256;
            public int strideFloats;
            public int transformCount;
            public string unityVersion;
            public List<NativeDetailTransformPatchRecord> patches =
                new List<NativeDetailTransformPatchRecord>();
        }

        [Serializable]
        private sealed class NativeDetailTransformPatchRecord
        {
            public int index;
            public int patchX;
            public int patchZ;
            public int transformOffset;
            public int count;
            public float[] boundsCenter;
            public float[] boundsSize;
        }

        [Serializable]
        private sealed class TreePrototypeRecord
        {
            public int index;
            public AssetReferenceRecord prefab;
            public int gltfPrefab = -1;
            public float bendFactor;
            public int navMeshLod;
        }

        [Serializable]
        private sealed class PrefabPrototypeRecord
        {
            public int index;
            public AssetReferenceRecord prefab;
            public int gltfRoot = -1;
            public List<PrefabNodeRecord> nodes = new List<PrefabNodeRecord>();
            public List<PrefabLodGroupRecord> lodGroups = new List<PrefabLodGroupRecord>();
        }

        [Serializable]
        private sealed class PrefabNodeRecord
        {
            public int index;
            public int gltfNode;
            public int parent;
            public string name;
            public string hierarchyPath;
            public bool activeSelf;
            public int layer;
            public string layerName;
            public string tag;
            public float[] localPosition;
            public float[] localRotation;
            public float[] localScale;
            public string[] components;
            public List<int> children = new List<int>();
            public int mesh = -1;
            public int gltfMesh = -1;
            public RendererRecord renderer;
        }

        [Serializable]
        private sealed class PrefabLodGroupRecord
        {
            public int node;
            public bool enabled;
            public float size;
            public float[] localReferencePoint;
            public string fadeMode;
            public bool animateCrossFading;
            public List<LodRecord> lods = new List<LodRecord>();
        }

        [Serializable]
        private sealed class TreeInstanceRecord
        {
            public float[] position;
            public float widthScale;
            public float heightScale;
            public float rotation;
            public float[] color;
            public float[] lightmapColor;
            public int prototypeIndex;
        }

        [Serializable]
        private sealed class LodGroupRecord
        {
            public int index;
            public int node;
            public bool enabled;
            public float size;
            public float[] localReferencePoint;
            public string fadeMode;
            public bool animateCrossFading;
            public List<LodRecord> lods = new List<LodRecord>();
        }

        [Serializable]
        private sealed class LodRecord
        {
            public float screenRelativeTransitionHeight;
            public float fadeTransitionWidth;
            public List<int> rendererNodes = new List<int>();
        }

        [Serializable]
        private sealed class RenderSettingsRecord
        {
            public string captureLabel;
            public string colorSpace;
            public bool pipelineOverrideApplied;
            public string pipelineOverrideRequested;
            public PipelineSettingsRecord pipelineSettings;
            public string qualityLevel;
            public string unityVersion;
            public bool fog;
            public string fogMode;
            public float[] fogColor;
            public float fogDensity;
            public float fogStartDistance;
            public float fogEndDistance;
            public string ambientMode;
            public float ambientIntensity;
            public float[] ambientSkyColor;
            public float[] ambientEquatorColor;
            public float[] ambientGroundColor;
            public float reflectionIntensity;
            public int reflectionBounces;
            public string defaultReflectionMode;
            public int defaultReflectionResolution;
            public float haloStrength;
            public float flareStrength;
            public float flareFadeSpeed;
            public float[] subtractiveShadowColor;
            public int skybox;
            public int customReflection;
            public AssetReferenceRecord pipeline;
            public string sunName;
        }

        [Serializable]
        private sealed class PipelineSettingsRecord
        {
            public AssetReferenceRecord asset;
            public string assetSha256;
            public float[] cascade4Split;
            public int colorGradingLutSize;
            public int colorGradingMode;
            public int defaultRendererIndex;
            public int hdrColorBufferPrecision;
            public int mainLightShadowmapResolution;
            public int msaa;
            public bool requiresDepthTexture;
            public bool requiresOpaqueTexture;
            public AssetReferenceRecord renderer;
            public string rendererAssetSha256;
            public List<RendererFeatureSettingsRecord> rendererFeatures =
                new List<RendererFeatureSettingsRecord>();
            public int rendererMode;
            public bool rendererNativeRenderPass;
            public int shadowCascadeCount;
            public float shadowDepthBias;
            public float shadowDistance;
            public float shadowNormalBias;
            public bool supportsHdr;
        }

        [Serializable]
        private sealed class RendererFeatureSettingsRecord
        {
            public bool active;
            public int aoMethod;
            public string aoMethodName;
            public float directLightingStrength;
            public float effectiveRadius;
            public string name;
            public float radius;
            public AssetReferenceRecord reference;
            public int sampleCount;
            public string sampleQuality;
            public string type;
        }

        [Serializable]
        private sealed class AssetReferenceRecord
        {
            public string name;
            public string type;
            public string path;
            public string guid;
            public string localFileId;
        }

        [Serializable]
        private sealed class LimitationRecord
        {
            public string code;
            public int node;
            public string message;
        }

        private static void WriteFloatGrid(string path, float[,] values)
        {
            using (var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None))
            using (var writer = new BinaryWriter(stream))
            {
                for (var y = 0; y < values.GetLength(0); y += 1)
                for (var x = 0; x < values.GetLength(1); x += 1)
                    writer.Write(values[y, x]);
            }
        }

        private static void WriteFloatVolume(string path, float[,,] values)
        {
            using (var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None))
            using (var writer = new BinaryWriter(stream))
            {
                for (var y = 0; y < values.GetLength(0); y += 1)
                for (var x = 0; x < values.GetLength(1); x += 1)
                for (var layer = 0; layer < values.GetLength(2); layer += 1)
                    writer.Write(values[y, x, layer]);
            }
        }

        private static void WriteBoolGrid(string path, bool[,] values)
        {
            using (var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                for (var y = 0; y < values.GetLength(0); y += 1)
                for (var x = 0; x < values.GetLength(1); x += 1)
                    stream.WriteByte(values[y, x] ? (byte)1 : (byte)0);
            }
        }

        private static void WriteIntGrid(string path, int[,] values)
        {
            using (var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None))
            using (var writer = new BinaryWriter(stream))
            {
                for (var y = 0; y < values.GetLength(0); y += 1)
                for (var x = 0; x < values.GetLength(1); x += 1)
                    writer.Write(values[y, x]);
            }
        }

        private static uint[] ConvertQuads(uint[] source)
        {
            var result = new uint[(source.Length / 4) * 6];
            var cursor = 0;
            for (var i = 0; i + 3 < source.Length; i += 4)
            {
                result[cursor++] = source[i];
                result[cursor++] = source[i + 2];
                result[cursor++] = source[i + 1];
                result[cursor++] = source[i];
                result[cursor++] = source[i + 3];
                result[cursor++] = source[i + 2];
            }
            return result;
        }

        private static int GltfMode(MeshTopology topology)
        {
            switch (topology)
            {
                case MeshTopology.Points: return 0;
                case MeshTopology.Lines: return 1;
                case MeshTopology.LineStrip: return 3;
                default: return 4;
            }
        }

        private static string GltfType(int components)
        {
            switch (components)
            {
                case 1: return "SCALAR";
                case 2: return "VEC2";
                case 3: return "VEC3";
                default: return "VEC4";
            }
        }

        private static string HierarchyPath(Transform transform)
        {
            var names = new List<string>();
            while (transform != null)
            {
                names.Add(transform.name);
                transform = transform.parent;
            }
            names.Reverse();
            return string.Join("/", names.ToArray());
        }

        private static string SafeFileName(string value)
        {
            if (string.IsNullOrEmpty(value)) return "unnamed";
            var invalid = Path.GetInvalidFileNameChars();
            var output = new StringBuilder(value.Length);
            foreach (var character in value)
                output.Append(invalid.Contains(character) ? '_' : character);
            return output.ToString();
        }

        private static float[] ConvertPosition(Vector3 value)
        {
            return new[] { value.x, value.y, -value.z };
        }

        private static float[] ConvertRotation(Quaternion value)
        {
            return new[] { -value.x, -value.y, value.z, value.w };
        }

        private static float[] ToArray(Vector2 value) { return new[] { value.x, value.y }; }
        private static float[] ToArray(Vector3 value) { return new[] { value.x, value.y, value.z }; }
        private static float[] ToArray(Vector4 value) { return new[] { value.x, value.y, value.z, value.w }; }
        private static float[] ToArray(Quaternion value) { return new[] { value.x, value.y, value.z, value.w }; }
        private static float[] ToArray(Color value) { return new[] { value.r, value.g, value.b, value.a }; }
        private static float[] ToArray(Color32 value) { return new[] { value.r / 255f, value.g / 255f, value.b / 255f, value.a / 255f }; }

        private static void AppendIntArray(StringBuilder json, IEnumerable<int> values)
        {
            json.Append('[');
            var first = true;
            foreach (var value in values)
            {
                if (!first) json.Append(',');
                first = false;
                json.Append(value.ToString(CultureInfo.InvariantCulture));
            }
            json.Append(']');
        }

        private static void AppendFloatArrayProperty(StringBuilder json, string name, float[] values, bool comma)
        {
            if (comma) json.Append(',');
            AppendJsonString(json, name);
            json.Append(": [".Replace(" ", string.Empty));
            for (var i = 0; i < values.Length; i += 1)
            {
                if (i > 0) json.Append(',');
                json.Append(FloatString(values[i]));
            }
            json.Append(']');
        }

        private static void AppendStringProperty(StringBuilder json, string name, string value, bool comma)
        {
            if (comma) json.Append(',');
            AppendJsonString(json, name);
            json.Append(':');
            AppendJsonString(json, value);
        }

        private static void AppendIntProperty(StringBuilder json, string name, int value, bool comma)
        {
            if (comma) json.Append(',');
            AppendJsonString(json, name);
            json.Append(':');
            json.Append(value.ToString(CultureInfo.InvariantCulture));
        }

        private static void AppendFloatProperty(StringBuilder json, string name, float value, bool comma)
        {
            if (comma) json.Append(',');
            AppendJsonString(json, name);
            json.Append(':');
            json.Append(FloatString(value));
        }

        private static string FloatString(float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value)) return "0";
            return value.ToString("R", CultureInfo.InvariantCulture);
        }

        private static void AppendJsonString(StringBuilder json, string value)
        {
            if (value == null)
            {
                json.Append("null");
                return;
            }
            json.Append('"');
            foreach (var character in value)
            {
                switch (character)
                {
                    case '"': json.Append("\\\""); break;
                    case '\\': json.Append("\\\\"); break;
                    case '\b': json.Append("\\b"); break;
                    case '\f': json.Append("\\f"); break;
                    case '\n': json.Append("\\n"); break;
                    case '\r': json.Append("\\r"); break;
                    case '\t': json.Append("\\t"); break;
                    default:
                        if (character < 32)
                            json.Append("\\u" + ((int)character).ToString("x4"));
                        else
                            json.Append(character);
                        break;
                }
            }
            json.Append('"');
        }
    }
}
#endif
