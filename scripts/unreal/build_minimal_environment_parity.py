"""Build the P13 demo-derived front/back native Unreal capture map.

The source sky *and* the authored SnowPines Landscape/RVT stack are retained.
Only unrelated demo actors are removed before the controlled rock, pine,
grass, daisies, and cameras are added.  This keeps the test modular while
avoiding the false dark/static-mesh fallback produced when a Landscape-layer
material is evaluated on an Engine plane.
"""

from __future__ import annotations

import copy
import json
import math
import os
from pathlib import Path
import re
import sys
import traceback

import unreal


PROJECT_SCRIPTS = Path(unreal.Paths.project_dir()).resolve() / "Scripts"
if str(PROJECT_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(PROJECT_SCRIPTS))

import single_rock_parity_unreal as diagnostic
import build_source_single_rock_reference_unreal as source_builder


SOURCE_MAP = source_builder.SOURCE_MAP
TARGET_MAP = "/Game/ToonLab/Parity/MinimalEnvironment/L_MinimalEnvironmentDemoP13"
SKY_ACTOR_CLASS = source_builder.SKY_ACTOR_CLASS
TREE_MESH = "/Game/SoStylized/Environment/Trees/Pine/SM_Pine01.SM_Pine01"
GRASS_MESH = "/Game/SoStylized/Environment/Foliage/SM_Grass1.SM_Grass1"
FLOWER_MESH = (
    "/Game/SoStylized/Environment/Foliage/"
    "SM_Flower_Daisies1.SM_Flower_Daisies1"
)
TREE_BARK_MATERIAL = (
    "/Game/SoStylized/Environment/Trees/Materials/"
    "MI_PineBark.MI_PineBark"
)
TREE_LEAVES_MATERIAL = (
    "/Game/SoStylized/Environment/Trees/Materials/"
    "MI_PineLeaves.MI_PineLeaves"
)
GRASS_MATERIAL = (
    "/Game/SoStylized/Environment/Foliage/Materials/"
    "MI_Grass.MI_Grass"
)
FLOWER_MATERIAL = (
    "/Game/SoStylized/Environment/Foliage/Materials/"
    "MI_Daisy.MI_Daisy"
)
GROUND_COLOR_TEXTURE = (
    "/Game/SoStylized/Environment/Landscape/Textures/"
    "T_Grass1_BC.T_Grass1_BC"
)
GROUND_ROUGHNESS_TEXTURE = (
    "/Game/SoStylized/Environment/Landscape/Textures/"
    "T_Grass1_R.T_Grass1_R"
)
GROUND_MATERIAL_PACKAGE = "/Game/ToonLab/Parity/MinimalEnvironment/M_ParitySourceGrass"
P18_IMPORT_ROOT = "/Game/ToonLab/Parity/P18/Imports"
P18_MATERIAL_ROOT = "/Game/ToonLab/Parity/P18/Materials"
P18_GENERIC_TEMPLATE = (
    "/Game/SoStylized/Environment/Misc/Materials/"
    "MI_BeachShells.MI_BeachShells"
)
P18_PROP_CONTRACT = (
    Path(unreal.Paths.project_dir()).resolve().parent
    / "toonlab"
    / "assets-local"
    / "parity"
    / "environment"
    / "p18-stylized-basic-props.json"
)
P18_SURFACE_DEFAULTS = {
    "outdoor-bench": {"metallic": 0.0, "roughness": 0.6, "specular": 0.25},
    "lamp-post": {"metallic": 0.65, "roughness": 0.35, "specular": 0.5},
    "painted-sword": {
        "metallic": 0.43866305,
        "roughness": 0.4763659,
        "specular": 0.5,
    },
    "megascans-storage-crate": {
        "metallic": 0.0,
        "roughness": 0.75,
        "specular": 0.25,
    },
}
# CameraRender1 starts over the authored grassy foreground visible in the demo
# reference.  Use its XY footprint as the centre of the controlled patch; the
# actual Z is sampled from the retained Landscape at build time.
DEMO_PATCH_ANCHOR_XY = (19876.090883374, -18119.57621749962)
RETAINED_DEMO_ACTOR_CLASSES = {
    SKY_ACTOR_CLASS,
    "Landscape",
    "RuntimeVirtualTextureVolume",
}


def _command(name: str, fallback: str) -> str:
    return diagnostic._command_line_value(name, fallback)


def _write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(temporary, path)


def _ensure_map() -> None:
    # This is a generated map. Recreate it from the source authority on every
    # build so a previous stripped-map experiment cannot silently survive.
    if unreal.EditorAssetLibrary.does_asset_exist(TARGET_MAP):
        if not unreal.EditorAssetLibrary.delete_asset(TARGET_MAP):
            unreal.log_warning(
                "Could not replace generated minimal-environment map; "
                "refreshing its controlled actors and cameras in place"
            )
            return
        unreal.SystemLibrary.collect_garbage()
        if unreal.EditorAssetLibrary.does_asset_exist(TARGET_MAP):
            unreal.log_warning(
                "Generated minimal-environment map remained after deletion; "
                "refreshing its controlled actors and cameras in place"
            )
            return
    if not unreal.EditorAssetLibrary.duplicate_asset(SOURCE_MAP, TARGET_MAP):
        raise RuntimeError("Could not duplicate Visual Target source map")


def _landscape_height(world, x: float, y: float, actors_to_ignore=None) -> float:
    """Trace the retained Landscape; fail instead of guessing its elevation."""
    result = unreal.SystemLibrary.line_trace_single(
        world,
        unreal.Vector(x, y, 100000.0),
        unreal.Vector(x, y, -100000.0),
        unreal.TraceTypeQuery.ECC_VISIBILITY,
        True,
        list(actors_to_ignore or []),
        unreal.DrawDebugTrace.NONE,
        True,
    )
    hit_values = result.to_dict() if result is not None else {}
    if not bool(hit_values.get("blocking_hit", False)):
        raise RuntimeError(
            "Could not sample retained demo Landscape at ({:.3f}, {:.3f})".format(x, y)
        )
    location = hit_values["location"]
    return float(location.z)


def _place_on_demo_patch(world, actor, preserve_local_z: bool = True):
    local = actor.get_actor_location()
    world_x = float(local.x) + DEMO_PATCH_ANCHOR_XY[0]
    world_y = float(local.y) + DEMO_PATCH_ANCHOR_XY[1]
    surface_z = _landscape_height(world, world_x, world_y)
    local_z = float(local.z) if preserve_local_z else 0.0
    actor.set_actor_location(
        unreal.Vector(world_x, world_y, surface_z + local_z),
        False,
        False,
    )
    return surface_z


def _spawn_mesh(
    actor_subsystem,
    mesh_path: str,
    label: str,
    canonical_position,
    scale: float,
    cast_shadow: bool,
    material_paths=(),
):
    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
    if not mesh:
        raise RuntimeError("Missing source mesh: %s" % mesh_path)
    actor = diagnostic._spawn_actor(
        actor_subsystem,
        unreal.StaticMeshActor,
        diagnostic._canonical_position_to_unreal(canonical_position),
        unreal.Rotator(pitch=0.0, yaw=-90.0, roll=0.0),
        label,
    )
    component = actor.static_mesh_component
    component.set_static_mesh(mesh)
    component.set_cast_shadow(cast_shadow)
    component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    component.set_forced_lod_model(1)
    for slot, material_path in enumerate(material_paths):
        material = unreal.EditorAssetLibrary.load_asset(material_path)
        if not material:
            raise RuntimeError("Missing source material: %s" % material_path)
        component.set_material(slot, material)
    actor.set_actor_scale3d(unreal.Vector(scale, scale, scale))
    return actor


def _ensure_source_grass_material():
    """Build a plane-compatible receiver from the authored grass textures.

    MI_LandscapeVol1 is Landscape-only: assigning it to a StaticMesh plane
    drops its LandscapeLayer inputs and produces the dark fallback seen in the
    previous capture. This compatibility material preserves the source grass
    color/roughness texture data and the documented 1600 cm projection scale
    without changing exposure or the retained author sky.
    """
    material = None
    if unreal.EditorAssetLibrary.does_asset_exist(GROUND_MATERIAL_PACKAGE):
        material = unreal.EditorAssetLibrary.load_asset(GROUND_MATERIAL_PACKAGE)
    if material is None:
        material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            "M_ParitySourceGrass",
            "/Game/ToonLab/Parity/MinimalEnvironment",
            unreal.Material,
            unreal.MaterialFactoryNew(),
        )
    if not material:
        raise RuntimeError("Could not create source grass compatibility material")

    color_texture = unreal.EditorAssetLibrary.load_asset(GROUND_COLOR_TEXTURE)
    roughness_texture = unreal.EditorAssetLibrary.load_asset(GROUND_ROUGHNESS_TEXTURE)
    if not color_texture or not roughness_texture:
        raise RuntimeError("Missing authored T_Grass1 source textures")

    editing = unreal.MaterialEditingLibrary
    editing.delete_all_material_expressions(material)
    texcoord = editing.create_material_expression(
        material, unreal.MaterialExpressionTextureCoordinate, -720, 0
    )
    # The parity ground is 20x16 m and the source projection period is 16 m.
    texcoord.set_editor_property("u_tiling", 1.25)
    texcoord.set_editor_property("v_tiling", 1.0)
    color_sample = editing.create_material_expression(
        material, unreal.MaterialExpressionTextureSample, -450, -90
    )
    color_sample.set_editor_property("texture", color_texture)
    roughness_sample = editing.create_material_expression(
        material, unreal.MaterialExpressionTextureSample, -450, 150
    )
    roughness_sample.set_editor_property("texture", roughness_texture)
    editing.connect_material_expressions(texcoord, "", color_sample, "UVs")
    editing.connect_material_expressions(texcoord, "", roughness_sample, "UVs")
    editing.connect_material_property(
        color_sample, "RGB", unreal.MaterialProperty.MP_BASE_COLOR
    )
    editing.connect_material_property(
        roughness_sample, "R", unreal.MaterialProperty.MP_ROUGHNESS
    )
    specular = editing.create_material_expression(
        material, unreal.MaterialExpressionConstant, -220, 270
    )
    specular.set_editor_property("r", 0.1)
    editing.connect_material_property(
        specular, "", unreal.MaterialProperty.MP_SPECULAR
    )
    material.set_editor_property("blend_mode", unreal.BlendMode.BLEND_OPAQUE)
    material.set_editor_property(
        "shading_model", unreal.MaterialShadingModel.MSM_DEFAULT_LIT
    )
    material.set_editor_property("two_sided", False)
    editing.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)
    return material


def _safe_asset_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", value).strip("_") or "Asset"


def _source_glb_path(prop: dict) -> Path:
    source = str(prop["sourceGlb"])
    if not source.startswith("/assets-local/"):
        raise RuntimeError("P18 source must be under /assets-local: %s" % source)
    resolved = (
        Path(unreal.Paths.project_dir()).resolve().parent
        / "toonlab"
        / source.lstrip("/")
    )
    if not resolved.is_file():
        raise RuntimeError("Missing P18 GLB: %s" % resolved)
    return resolved


def _import_p18_prop(prop: dict) -> list:
    """Import one exact source GLB and return its StaticMesh assets.

    Interchange bakes the GLB node transforms into each imported StaticMesh.
    Every part can therefore share the immutable P18 root transform while
    preserving the source assembly and its original material-slot mapping.
    """
    prop_id = str(prop["id"])
    unreal.log_warning("TOONLAB_P18_IMPORT_START %s" % prop_id)
    destination = "{}/{}".format(P18_IMPORT_ROOT, _safe_asset_name(prop_id))
    # Never force-delete an imported directory during an incremental parity
    # build. The saved comparison map and generated material instances can
    # still reference those packages, which makes ObjectTools fail to unload
    # them and causes a successful commandlet build to exit with errors.
    # Source GLBs are immutable P18 fixtures, so reuse their imported assets.
    existing_paths = (
        unreal.EditorAssetLibrary.list_assets(
            destination,
            recursive=True,
            include_folder=False,
        )
        if unreal.EditorAssetLibrary.does_directory_exist(destination)
        else []
    )
    assets = [
        unreal.EditorAssetLibrary.load_asset(path)
        for path in existing_paths
    ]
    meshes = sorted(
        [asset for asset in assets if isinstance(asset, unreal.StaticMesh)],
        key=lambda asset: str(asset.get_path_name()),
    )
    if not meshes:
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", str(_source_glb_path(prop)))
        task.set_editor_property("destination_path", destination)
        task.set_editor_property("automated", True)
        task.set_editor_property("replace_existing", False)
        task.set_editor_property("save", True)
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
        imported_paths = list(task.get_editor_property("imported_object_paths"))
        unreal.log_warning(
            "TOONLAB_P18_IMPORT_FINISH {} {}".format(prop_id, imported_paths)
        )
        assets = [
            unreal.EditorAssetLibrary.load_asset(path)
            for path in imported_paths
        ]
        meshes = sorted(
            [asset for asset in assets if isinstance(asset, unreal.StaticMesh)],
            key=lambda asset: str(asset.get_path_name()),
        )
    else:
        unreal.log_warning(
            "TOONLAB_P18_IMPORT_REUSED {} {}".format(
                prop_id,
                [str(mesh.get_path_name()) for mesh in meshes],
            )
        )
    if not meshes:
        raise RuntimeError("P18 import produced no StaticMesh for %s" % prop_id)
    if prop_id == "outdoor-bench":
        source_node = str(prop.get("sourceNode", "")).lower()
        matching = [
            mesh for mesh in meshes
            if source_node in str(mesh.get_name()).lower()
        ]
        if not matching:
            raise RuntimeError(
                "P18 bench import did not preserve source node %s" % source_node
            )
        # ToonLab consumes firstObjectByName("BenchA"). Keep the same single
        # authored fixture rather than importing BenchB or a duplicate BenchA.
        meshes = [matching[0]]
    return meshes


def _material_texture(source_material, parameter_names):
    if not isinstance(source_material, unreal.MaterialInstance):
        return None
    for parameter_name in parameter_names:
        try:
            value = (
                unreal.MaterialEditingLibrary
                .get_material_instance_texture_parameter_value(
                    source_material,
                    parameter_name,
                )
            )
        except Exception:
            value = None
        if value is not None:
            return value
    return None


def _drop_interchange_placeholder(texture, role: str):
    """Ignore glTF fallback maps that would incorrectly enable a shader branch."""
    if texture is None:
        return None
    path = str(texture.get_path_name()).lower()
    if "t_white_srgb" in path:
        return None
    if role == "normal" and "t_generic_n" in path:
        return None
    return texture


def _srgb_channel_to_linear(value: float) -> float:
    value = max(0.0, min(1.0, float(value)))
    if value <= 0.04045:
        return value / 12.92
    return ((value + 0.055) / 1.055) ** 2.4


def _create_p18_generic_material(
    prop: dict,
    source_material,
    material_index: int,
):
    """Create one M_StylizedBasic child without flattening source textures."""
    prop_id = str(prop["id"])
    source_name = (
        str(source_material.get_name())
        if source_material is not None
        else "Default"
    )
    asset_name = "MI_P18_{}_{}_{}".format(
        _safe_asset_name(prop_id),
        _safe_asset_name(source_name),
        material_index,
    )
    target_path = "{}/{}".format(P18_MATERIAL_ROOT, asset_name)
    if unreal.EditorAssetLibrary.does_asset_exist(target_path):
        material = unreal.EditorAssetLibrary.load_asset(target_path)
    else:
        if not unreal.EditorAssetLibrary.duplicate_asset(
            P18_GENERIC_TEMPLATE,
            target_path,
        ):
            raise RuntimeError(
                "Could not create P18 generic material %s" % target_path
            )
        material = unreal.EditorAssetLibrary.load_asset(target_path)
    if not isinstance(material, unreal.MaterialInstanceConstant):
        raise RuntimeError("P18 generic material is not a constant instance")

    base_texture = _drop_interchange_placeholder(
        _material_texture(
            source_material,
            ("BaseColorTexture", "Base Color Texture", "BaseColor"),
        ),
        "base",
    )
    normal_texture = _drop_interchange_placeholder(
        _material_texture(
            source_material,
            ("NormalTexture", "Normal Texture", "Normal"),
        ),
        "normal",
    )
    emissive_texture = _drop_interchange_placeholder(
        _material_texture(
            source_material,
            ("EmissiveTexture", "Emissive Texture", "EmissiveColor"),
        ),
        "emissive",
    )
    editing = unreal.MaterialEditingLibrary
    for switch_name, switch_value in (
        ("BlendNormals?", False),
        ("BlendWithLandscape?", False),
        ("DebugChecker?", False),
        ("DebugMaterial?", False),
        ("DebugWorldAligned?", False),
        ("UseColorTexture?", base_texture is not None),
        ("NormalMap?", normal_texture is not None),
        ("EmissiveMap?", emissive_texture is not None),
        ("MetallicMap?", False),
        ("RoughnessMap?", False),
        ("SpecularMap?", False),
        ("UseDayCycleEmission?", emissive_texture is not None),
        ("UseWeather?", True),
    ):
        editing.set_material_instance_static_switch_parameter_value(
            material,
            switch_name,
            switch_value,
        )
    if base_texture is not None:
        editing.set_material_instance_texture_parameter_value(
            material,
            "Base Color Texture",
            base_texture,
        )
    if normal_texture is not None:
        editing.set_material_instance_texture_parameter_value(
            material,
            "Normal Texture",
            normal_texture,
        )
    if emissive_texture is not None:
        editing.set_material_instance_texture_parameter_value(
            material,
            "Emissive Texture",
            emissive_texture,
        )

    defaults = P18_SURFACE_DEFAULTS[prop_id]
    for scalar_name, scalar_value in (
        ("Metallic", defaults["metallic"]),
        ("Roughness", defaults["roughness"]),
        ("Specular", defaults["specular"]),
        ("Normal Strength", 1.0 if normal_texture is not None else 0.0),
        ("Emissive Strength", 1.0 if emissive_texture is not None else 0.0),
    ):
        editing.set_material_instance_scalar_parameter_value(
            material,
            scalar_name,
            float(scalar_value),
        )

    overrides = prop.get("materialOverrides", {})
    override = overrides.get(source_name, {})
    if not override and len(overrides) == 1:
        override = next(iter(overrides.values()))
    base_color_srgb = override.get("baseColorSrgb")
    if base_color_srgb is not None:
        editing.set_material_instance_vector_parameter_value(
            material,
            "Base Color",
            unreal.LinearColor(
                _srgb_channel_to_linear(base_color_srgb[0]),
                _srgb_channel_to_linear(base_color_srgb[1]),
                _srgb_channel_to_linear(base_color_srgb[2]),
                1.0,
            ),
        )
        editing.set_material_instance_static_switch_parameter_value(
            material,
            "UseColorTexture?",
            False,
        )
    editing.update_material_instance(material)
    if not unreal.EditorAssetLibrary.save_asset(
        target_path,
        only_if_is_dirty=False,
    ):
        raise RuntimeError("Could not save P18 generic material %s" % target_path)
    return material, {
        "sourceMaterial": (
            str(source_material.get_path_name())
            if source_material is not None
            else None
        ),
        "generatedMaterial": str(material.get_path_name()),
        "parent": "/Game/SoStylized/Materials/M_StylizedBasic.M_StylizedBasic",
        "baseColorTexture": (
            str(base_texture.get_path_name()) if base_texture is not None else None
        ),
        "normalTexture": (
            str(normal_texture.get_path_name()) if normal_texture is not None else None
        ),
        "emissiveTexture": (
            str(emissive_texture.get_path_name())
            if emissive_texture is not None
            else None
        ),
    }


def _canonical_rotation_to_unreal(euler_degrees) -> unreal.Rotator:
    # Canonical X/Y/Z axes map to UE Y/Z/X. Rotator pitch/yaw/roll address
    # those corresponding axes and preserve the authored P18 composition.
    return unreal.Rotator(
        pitch=float(euler_degrees[0]),
        yaw=float(euler_degrees[1]),
        roll=float(euler_degrees[2]),
    )


def _spawn_p18_prop(actor_subsystem, world, prop: dict) -> dict:
    meshes = _import_p18_prop(prop)
    canonical_position = prop["canonicalPositionMeters"]
    root_local = diagnostic._canonical_position_to_unreal(canonical_position)
    root_location = unreal.Vector(
        DEMO_PATCH_ANCHOR_XY[0] + float(root_local.x),
        DEMO_PATCH_ANCHOR_XY[1] + float(root_local.y),
        0.0,
    )
    rotation_source = prop.get(
        "unrealRotationEulerDegrees",
        prop["canonicalRotationEulerDegrees"],
    )
    rotation = _canonical_rotation_to_unreal(rotation_source)
    scale = prop["canonicalScale"]
    actors = []
    material_records = []
    material_cache = {}
    for mesh_index, mesh in enumerate(meshes):
        actor = diagnostic._spawn_actor(
            actor_subsystem,
            unreal.StaticMeshActor,
            root_location,
            rotation,
            "P18_{}_Part{:02d}".format(
                _safe_asset_name(prop["id"]),
                mesh_index,
            ),
        )
        component = actor.static_mesh_component
        component.set_static_mesh(mesh)
        component.set_cast_shadow(bool(prop.get("castShadow", True)))
        component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
        actor.set_actor_scale3d(
            unreal.Vector(float(scale[0]), float(scale[1]), float(scale[2]))
        )
        for slot_index, static_material in enumerate(mesh.static_materials):
            source_material = static_material.material_interface
            source_path = (
                str(source_material.get_path_name()).lower()
                if source_material is not None
                else ""
            )
            if (
                prop["id"] == "lamp-post"
                and ("glass" in source_path or "translucent" in source_path)
            ):
                # M_StylizedBasic is opaque. Retain the exact imported glass
                # material instead of corrupting the lamp enclosure.
                material_records.append({
                    "sourceMaterial": (
                        str(source_material.get_path_name())
                        if source_material is not None
                        else None
                    ),
                    "generatedMaterial": None,
                    "parent": None,
                    "adapter": "exact imported translucent glass retained",
                })
                continue
            cache_key = source_path or "default"
            if cache_key not in material_cache:
                material_cache[cache_key] = _create_p18_generic_material(
                    prop,
                    source_material,
                    len(material_cache),
                )
                material_records.append(material_cache[cache_key][1])
            component.set_material(
                slot_index,
                material_cache[cache_key][0],
            )
        actors.append(actor)

    # Resolve support from actual imported geometry, never from authored pivots.
    minimum_z = min(
        float(actor.get_actor_bounds(False)[0].z)
        - float(actor.get_actor_bounds(False)[1].z)
        for actor in actors
    )
    surface_z = _landscape_height(
        world,
        float(root_location.x),
        float(root_location.y),
        actors,
    )
    inset = float(prop.get("groundInsetMeters", 0.0)) * 100.0
    z_adjustment = surface_z - inset - minimum_z
    for actor in actors:
        location = actor.get_actor_location()
        actor.set_actor_location(
            unreal.Vector(location.x, location.y, location.z + z_adjustment),
            False,
            False,
        )
    bounds_origins = []
    bounds_extents = []
    for actor in actors:
        origin, extent = actor.get_actor_bounds(False)
        bounds_origins.append(origin)
        bounds_extents.append(extent)
    minimum = unreal.Vector(
        min(origin.x - extent.x for origin, extent in zip(bounds_origins, bounds_extents)),
        min(origin.y - extent.y for origin, extent in zip(bounds_origins, bounds_extents)),
        min(origin.z - extent.z for origin, extent in zip(bounds_origins, bounds_extents)),
    )
    maximum = unreal.Vector(
        max(origin.x + extent.x for origin, extent in zip(bounds_origins, bounds_extents)),
        max(origin.y + extent.y for origin, extent in zip(bounds_origins, bounds_extents)),
        max(origin.z + extent.z for origin, extent in zip(bounds_origins, bounds_extents)),
    )
    return {
        "id": prop["id"],
        "actors": [str(actor.get_actor_label()) for actor in actors],
        "meshes": [str(mesh.get_path_name()) for mesh in meshes],
        "materials": material_records,
        "canonicalPositionMeters": list(canonical_position),
        "canonicalRotationEulerDegrees": list(
            prop["canonicalRotationEulerDegrees"]
        ),
        "unrealRotationEulerDegrees": list(rotation_source),
        "unrealRotationAdapter": prop.get("unrealRotationAdapter"),
        "canonicalScale": list(scale),
        "groundSurfaceZ": surface_z,
        "groundInsetCentimeters": inset,
        "worldBoundsMin": diagnostic._vector_record(minimum),
        "worldBoundsMax": diagnostic._vector_record(maximum),
    }


def _spawn_p18_bench_camera(
    actor_subsystem,
    world,
    contract: dict,
    prop_contract: dict,
):
    camera_contract = copy.deepcopy(contract)
    camera_contract["camera"] = copy.deepcopy(
        prop_contract["composition"]["benchCamera"]
    )
    camera_contract["camera"]["aspect"] = float(
        camera_contract["camera"].get(
            "aspect",
            contract.get("camera", {}).get("aspect", 16.0 / 9.0),
        )
    )
    camera, focal_length, sensor_width, sensor_height = source_builder._spawn_camera(
        actor_subsystem,
        camera_contract,
    )
    camera.set_actor_label("CameraRender3")
    position_local = diagnostic._canonical_position_to_unreal(
        camera_contract["camera"]["position"]
    )
    target_local = diagnostic._canonical_position_to_unreal(
        camera_contract["camera"]["lookAt"]
    )
    target_world_x = DEMO_PATCH_ANCHOR_XY[0] + float(target_local.x)
    target_world_y = DEMO_PATCH_ANCHOR_XY[1] + float(target_local.y)
    target_ground = _landscape_height(world, target_world_x, target_world_y)
    target_world = unreal.Vector(
        target_world_x,
        target_world_y,
        target_ground
        + float(camera_contract["camera"]["lookAt"][1]) * 100.0,
    )
    offset = position_local - target_local
    camera.set_actor_location(target_world + offset, False, False)
    camera.set_actor_rotation(
        unreal.MathLibrary.find_look_at_rotation(
            camera.get_actor_location(),
            target_world,
        ),
        False,
    )
    return {
        "label": "CameraRender3",
        "view": "bench",
        "positionUnrealCentimeters": diagnostic._vector_record(
            camera.get_actor_location()
        ),
        "rotationPitchYawRoll": diagnostic._rotator_record(
            camera.get_actor_rotation()
        ),
        "focusUnrealCentimeters": diagnostic._vector_record(target_world),
        "focusAuthority": "shared P18 bench-camera contract",
        "focalLengthMillimeters": focal_length,
        "sensorWidthMillimeters": sensor_width,
        "sensorHeightMillimeters": sensor_height,
    }


def _spawn_camera(
    actor_subsystem,
    world,
    contract: dict,
    view: str,
    label: str,
    focus_actor,
):
    camera_contract = copy.deepcopy(contract)
    if view == "back":
        position = camera_contract["camera"]["position"]
        target = camera_contract["camera"]["lookAt"]
        camera_contract["camera"]["position"] = [
            2.0 * target[0] - position[0],
            position[1],
            2.0 * target[2] - position[2],
        ]
    camera, focal_length, sensor_width, sensor_height = source_builder._spawn_camera(
        actor_subsystem, camera_contract
    )
    camera.set_actor_label(label)
    focus_location = focus_actor.get_actor_location()
    patch_height = _landscape_height(
        world,
        float(focus_location.x),
        float(focus_location.y),
        [focus_actor],
    )
    canonical_target = diagnostic._canonical_position_to_unreal(
        camera_contract["camera"]["lookAt"]
    )
    canonical_offset = camera.get_actor_location() - canonical_target
    # Do not use Actor.get_actor_bounds() as the camera target. The imported
    # spire's UE bounds origin includes an authored pivot/bounds offset that is
    # not the visible-rock focus used by Unity and ToonLab. The shared contract
    # defines the focus explicitly as lookAt.y metres above the receiver.
    focus_target = unreal.Vector(
        float(focus_location.x),
        float(focus_location.y),
        patch_height + float(camera_contract["camera"]["lookAt"][1]) * 100.0,
    )
    camera.set_actor_location(focus_target + canonical_offset, False, False)
    camera.set_actor_rotation(
        unreal.MathLibrary.find_look_at_rotation(
            camera.get_actor_location(),
            focus_target,
        ),
        False,
    )
    return {
        "label": label,
        "view": view,
        "positionUnrealCentimeters": diagnostic._vector_record(
            camera.get_actor_location()
        ),
        "rotationPitchYawRoll": diagnostic._rotator_record(
            camera.get_actor_rotation()
        ),
        "focusUnrealCentimeters": diagnostic._vector_record(focus_target),
        "focusAuthority": "shared contract lookAt.y above sampled receiver",
        "focalLengthMillimeters": focal_length,
        "sensorWidthMillimeters": sensor_width,
        "sensorHeightMillimeters": sensor_height,
    }


def _build(contract_path: Path, output_dir: Path) -> dict:
    unreal.log_warning("TOONLAB_P18_BUILD_START")
    with contract_path.open("r", encoding="utf-8") as handle:
        contract = json.load(handle)
    prop_contract_path = Path(
        _command("P18PropContract", str(P18_PROP_CONTRACT))
    ).resolve()
    with prop_contract_path.open("r", encoding="utf-8") as handle:
        prop_contract = json.load(handle)
    if prop_contract.get("schema") != "toonlab.p18-stylized-basic-prop-contract":
        raise RuntimeError("Unexpected P18 prop contract schema")
    if contract.get("schema") not in (
        "toonlab.single-rock-parity-contract",
        "toonlab.tri-engine-parity-contract",
    ):
        raise RuntimeError("Unexpected parity contract schema")
    _ensure_map()
    unreal.log_warning("TOONLAB_P18_MAP_READY")
    world = unreal.EditorLoadingAndSavingUtils.load_map(TARGET_MAP)
    if not world:
        raise RuntimeError("Could not load generated minimal-environment map")
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    all_actors = list(actors.get_all_level_actors())
    sky_actors = [
        actor
        for actor in all_actors
        if str(actor.get_class().get_name()) == SKY_ACTOR_CLASS
    ]
    if len(sky_actors) != 1:
        raise RuntimeError("Expected one retained Visual Target sky actor")
    sky = sky_actors[0]
    for actor in all_actors:
        actor_class = str(actor.get_class().get_name())
        if actor_class not in RETAINED_DEMO_ACTOR_CLASSES:
            actors.destroy_actor(actor)

    retained_landscapes = [
        actor for actor in actors.get_all_level_actors()
        if str(actor.get_class().get_name()) == "Landscape"
    ]
    retained_rvt_volumes = [
        actor for actor in actors.get_all_level_actors()
        if str(actor.get_class().get_name()) == "RuntimeVirtualTextureVolume"
    ]
    if len(retained_landscapes) != 1 or len(retained_rvt_volumes) != 2:
        raise RuntimeError(
            "Expected one retained Landscape and two retained RVT volumes; found {} and {}"
            .format(len(retained_landscapes), len(retained_rvt_volumes))
        )

    source_builder._apply_light_variant(sky, contract, "author")
    unreal.log_warning("TOONLAB_P18_RETAINED_AUTHORITY_READY")
    rock, _, _ = source_builder._spawn_rock(actors, contract)
    rock.set_actor_label("Parity_Rock_SM_RockSpire_Spire05")
    _place_on_demo_patch(world, rock)
    tree = _spawn_mesh(
        actors,
        TREE_MESH,
        "Parity_Tree_SM_Pine01",
        [-4.1, 0.0, 1.25],
        0.36,
        True,
        (TREE_BARK_MATERIAL, TREE_LEAVES_MATERIAL),
    )
    _place_on_demo_patch(world, tree)
    grass = _spawn_mesh(
        actors,
        GRASS_MESH,
        "Parity_Grass_SM_Grass1",
        [3.15, 0.02, 1.2],
        0.68,
        False,
        (GRASS_MATERIAL,),
    )
    _place_on_demo_patch(world, grass)
    flowers = _spawn_mesh(
        actors,
        FLOWER_MESH,
        "Parity_Flowers_SM_Flower_Daisies1",
        [1.6, 0.02, -1.5],
        0.8,
        False,
        (FLOWER_MATERIAL,),
    )
    _place_on_demo_patch(world, flowers)
    unreal.log_warning("TOONLAB_P18_BASE_ENVIRONMENT_READY")
    p18_props = [
        _spawn_p18_prop(actors, world, prop)
        for prop in prop_contract["props"]
    ]
    unreal.log_warning("TOONLAB_P18_PROPS_READY")
    cameras = [
        _spawn_camera(actors, world, contract, "front", "CameraRender1", rock),
        _spawn_camera(actors, world, contract, "back", "CameraRender2", rock),
        _spawn_p18_bench_camera(actors, world, contract, prop_contract),
    ]
    world.get_world_settings().set_editor_property("force_no_precomputed_lighting", True)
    unreal.SystemLibrary.execute_console_command(world, "r.SetNearClipPlane 5")
    if not unreal.EditorLoadingAndSavingUtils.save_map(world, TARGET_MAP):
        raise RuntimeError("Could not save generated minimal-environment map")
    unreal.log_warning("TOONLAB_P18_MAP_SAVED")

    report = {
        "schema": "toonlab.minimal-environment-unreal-level",
        "version": 2,
        "status": "complete",
        "contract": str(contract_path),
        "p18PropContract": str(prop_contract_path),
        "map": TARGET_MAP,
        "sourceMap": SOURCE_MAP,
        "visualTargetAuthority": "retained BP_StylizedSky_Lite source actor",
        "hardCastAndSelfShadow": True,
        "cameras": cameras,
        "actors": {
            "rock": str(rock.get_actor_label()),
            "tree": str(tree.get_actor_label()),
            "grass": str(grass.get_actor_label()),
            "flowers": str(flowers.get_actor_label()),
            "ground": str(retained_landscapes[0].get_actor_label()),
            "sky": str(sky.get_actor_label()),
            "runtimeVirtualTextureVolumes": [
                str(actor.get_actor_label()) for actor in retained_rvt_volumes
            ],
            "p18Props": p18_props,
        },
        "sourceAssets": {
            "rock": contract["rock"]["unreal"],
            "tree": TREE_MESH,
            "grass": GRASS_MESH,
            "flowers": FLOWER_MESH,
            "treeMaterials": [TREE_BARK_MATERIAL, TREE_LEAVES_MATERIAL],
            "grassMaterial": GRASS_MATERIAL,
            "flowerMaterial": FLOWER_MATERIAL,
            "groundMaterial": (
                "/Game/SoStylized/Environment/Landscape/Materials/"
                "MI_Landscape_Snow.MI_Landscape_Snow"
            ),
            "groundColorTexture": GROUND_COLOR_TEXTURE,
            "groundRoughnessTexture": GROUND_ROUGHNESS_TEXTURE,
            "p18GenericMaterialTemplate": P18_GENERIC_TEMPLATE,
        },
        "p18MaterialPolicy": {
            "opaque": (
                "Every opaque P18 prop slot is a generated child of the exact "
                "So Stylized M_StylizedBasic material."
            ),
            "lampGlass": (
                "The exact imported translucent glass slot is retained because "
                "M_StylizedBasic is opaque."
            ),
            "unityBlocking": False,
        },
        "demoPatch": {
            "anchorUnrealCentimetersXY": list(DEMO_PATCH_ANCHOR_XY),
            "authority": "CameraRender1 authored grassy foreground footprint",
            "retainedLandscape": True,
            "retainedRuntimeVirtualTextureVolumes": True,
        },
    }
    _write_json(output_dir / "unreal-level-report.json", report)
    return report


def main() -> None:
    contract_path = Path(_command("ParityContract", "")).resolve()
    output_dir = Path(_command("ParityOutput", str(contract_path.parent))).resolve()
    report_path = output_dir / "unreal-level-report.json"
    try:
        _build(contract_path, output_dir)
        unreal.log("TOONLAB_MINIMAL_ENVIRONMENT_LEVEL_COMPLETE %s" % report_path)
    except Exception as error:
        _write_json(
            report_path,
            {
                "schema": "toonlab.minimal-environment-unreal-level",
                "version": 1,
                "status": "failed",
                "error": str(error),
                "traceback": traceback.format_exc(),
            },
        )
        unreal.log_error("TOONLAB_MINIMAL_ENVIRONMENT_LEVEL_FAILED %s" % error)
        raise


if __name__ == "__main__":
    main()
