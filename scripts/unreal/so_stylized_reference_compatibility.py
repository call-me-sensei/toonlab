"""Non-destructive UE 5.8 compatibility helpers for the UE 5.2 So Stylized pack.

The licensed source assets are shared by several demonstration maps.  In the
SnowPines map a subset of those shared instances still resolves to the Vol1
grass colour map.  The pack documentation explicitly calls this out as a
reason rocks and grass can look wrong.  These helpers create or apply
SnowPines-scoped overrides without ever modifying the supplied assets.
"""

import gc
import os
import re

import unreal


SOURCE_MAP = "/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines"
REFERENCE_MAP = (
    "/Game/ToonLab/Reference/SoStylized/SnowPines/"
    "Demonstration_SnowPines_UE52Reference"
)
REFERENCE_MATERIAL_ROOT = (
    "/Game/ToonLab/Reference/SoStylized/SnowPines/Materials"
)
SNOW_COLORMAP = (
    "/Game/SoStylized/Environment/Landscape/Textures/"
    "T_Grass_ColormapSnow.T_Grass_ColormapSnow"
)
SNOW_COLORMAP_SCALE = 50000.0


# These are the effective material instances actually assigned by the
# SnowPines demonstration map.  Some only consume Color Map when an inherited
# static switch enables a grass top layer; setting the parameter on all of
# them keeps the map-scoped family internally consistent and is harmless for
# disabled branches.
SNOWPINES_COLORMAP_MATERIALS = (
    "/Game/SoStylized/Environment/Foliage/Materials/MI_Grass_NoRVT.MI_Grass_NoRVT",
    "/Game/SoStylized/Environment/Foliage/Materials/LODs/MI_Grass_NoRVT_LOD1.MI_Grass_NoRVT_LOD1",
    "/Game/SoStylized/Environment/Foliage/Materials/LODs/MI_Grass_NoRVT_LOD2.MI_Grass_NoRVT_LOD2",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_Rocks.MI_RockClassic_Rocks",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_Rocks_Snow.MI_RockClassic_Rocks_Snow",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_Rocks_MossWorld.MI_RockClassic_Rocks_MossWorld",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_Cliff.MI_RockClassic_Cliff",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_Cliff_Snow.MI_RockClassic_Cliff_Snow",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_Cliff_NoGrass.MI_RockClassic_Cliff_NoGrass",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_Shelves.MI_RockClassic_Shelves",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_Shelves_Snow.MI_RockClassic_Shelves_Snow",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_Boulders.MI_RockClassic_Boulders",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_Boulders_Snow.MI_RockClassic_Boulders_Snow",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_Boulders_MossWorld.MI_RockClassic_Boulders_MossWorld",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_BoulderClumps.MI_RockClassic_BoulderClumps",
    "/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_BoulderClumps_Snow.MI_RockClassic_BoulderClumps_Snow",
)


def _package_path(object_path):
    """Return /Game/Package/Asset from /Game/Package/Asset.Asset."""
    value = str(object_path or "")
    if "." in value:
        value = value.rsplit(".", 1)[0]
    return value


def _object_path(asset):
    if asset is None:
        return ""
    try:
        return str(asset.get_path_name())
    except Exception:
        return str(asset)


def _reference_material_path(source_object_path):
    asset_name = _package_path(source_object_path).rsplit("/", 1)[-1]
    safe_name = re.sub(r"[^A-Za-z0-9_]", "_", asset_name)
    return "{}/{}_SnowPinesReference".format(
        REFERENCE_MATERIAL_ROOT,
        safe_name,
    )


def load_snow_colormap():
    texture = unreal.EditorAssetLibrary.load_asset(SNOW_COLORMAP)
    if texture is None:
        raise RuntimeError("Missing SnowPines colour map: {}".format(SNOW_COLORMAP))
    return texture


def configure_material_instance(instance, snow_colormap=None):
    if instance is None:
        raise RuntimeError("Cannot configure a null SnowPines material instance")
    snow_colormap = snow_colormap or load_snow_colormap()
    unreal.MaterialEditingLibrary.set_material_instance_texture_parameter_value(
        instance,
        "Color Map",
        snow_colormap,
    )
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
        instance,
        "Grass Colormap ScaleX",
        SNOW_COLORMAP_SCALE,
    )
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
        instance,
        "Grass Colormap ScaleY",
        SNOW_COLORMAP_SCALE,
    )
    try:
        unreal.MaterialEditingLibrary.update_material_instance(instance)
    except Exception:
        pass
    return instance


def create_reference_materials():
    """Create idempotent, project-owned children of the supplied instances."""
    snow_colormap = load_snow_colormap()
    replacements = {}
    created = 0
    updated = 0
    for source_object_path in SNOWPINES_COLORMAP_MATERIALS:
        source_package_path = _package_path(source_object_path)
        destination_path = _reference_material_path(source_object_path)
        if not unreal.EditorAssetLibrary.does_asset_exist(destination_path):
            duplicated = unreal.EditorAssetLibrary.duplicate_asset(
                source_package_path,
                destination_path,
            )
            if not duplicated:
                raise RuntimeError(
                    "Unable to duplicate {} to {}".format(
                        source_package_path,
                        destination_path,
                    )
                )
            created += 1
        instance = unreal.EditorAssetLibrary.load_asset(destination_path)
        configure_material_instance(instance, snow_colormap)
        unreal.EditorAssetLibrary.save_loaded_asset(instance, False)
        replacements[source_object_path] = instance
        replacements[_object_path(instance)] = instance
        updated += 1
    return replacements, {"created": created, "updated": updated}


def iter_mesh_components(actors):
    seen = set()
    for actor in actors:
        try:
            components = actor.get_components_by_class(unreal.ActorComponent)
        except Exception:
            components = []
        for component in components:
            if not isinstance(component, unreal.MeshComponent):
                continue
            key = _object_path(component)
            if key in seen:
                continue
            seen.add(key)
            yield actor, component


def assign_reference_materials(actors, replacements):
    """Persist project-owned overrides on components in the duplicate map."""
    component_count = 0
    slot_count = 0
    material_paths = set()
    for actor, component in iter_mesh_components(actors):
        component_changed = False
        try:
            material_count = int(component.get_num_materials())
        except Exception:
            material_count = 0
        for material_index in range(material_count):
            source_material = component.get_material(material_index)
            source_path = _object_path(source_material)
            replacement = replacements.get(source_path)
            if replacement is None:
                continue
            if not component_changed:
                actor.modify()
                component.modify()
                component_changed = True
                component_count += 1
            component.set_material(material_index, replacement)
            material_paths.add(source_path)
            slot_count += 1
    return {
        "components": component_count,
        "materialPaths": sorted(material_paths),
        "slots": slot_count,
    }


def apply_transient_snowpines_compatibility(actors):
    """Apply the same correction in memory when capturing the source map.

    This fallback is useful when callers explicitly pass the licensed source
    map to the capture command.  It does not dirty or save any source asset.
    """
    snow_colormap = load_snow_colormap()
    source_paths = set(SNOWPINES_COLORMAP_MATERIALS)
    dynamic_instances = []
    component_count = 0
    slot_count = 0
    for _actor, component in iter_mesh_components(actors):
        changed = False
        try:
            material_count = int(component.get_num_materials())
        except Exception:
            material_count = 0
        for material_index in range(material_count):
            source_material = component.get_material(material_index)
            if _object_path(source_material) not in source_paths:
                continue
            instance = component.create_dynamic_material_instance(
                material_index,
                source_material,
                "ToonLabSnowPinesReference_{}".format(material_index),
            )
            if instance is None:
                raise RuntimeError(
                    "Unable to create transient material override for {}".format(
                        _object_path(component)
                    )
                )
            instance.set_texture_parameter_value("Color Map", snow_colormap)
            instance.set_scalar_parameter_value(
                "Grass Colormap ScaleX",
                SNOW_COLORMAP_SCALE,
            )
            instance.set_scalar_parameter_value(
                "Grass Colormap ScaleY",
                SNOW_COLORMAP_SCALE,
            )
            dynamic_instances.append(instance)
            slot_count += 1
            changed = True
        if changed:
            component_count += 1
    return dynamic_instances, {
        "components": component_count,
        "slots": slot_count,
    }


def ensure_reference_level(source_map=None, reference_map=None):
    """Duplicate SnowPines without attempting a Python-driven map switch."""
    source_map = source_map or os.environ.get("TOONLAB_SOURCE_MAP", SOURCE_MAP)
    reference_map = reference_map or os.environ.get(
        "TOONLAB_REFERENCE_MAP",
        REFERENCE_MAP,
    )
    created = False
    if not unreal.EditorAssetLibrary.does_asset_exist(reference_map):
        duplicated = unreal.EditorAssetLibrary.duplicate_asset(source_map, reference_map)
        if not duplicated:
            raise RuntimeError(
                "Unable to duplicate {} to {}".format(source_map, reference_map)
            )
        created = True
        if not unreal.EditorAssetLibrary.save_loaded_asset(duplicated, False):
            raise RuntimeError("Unable to save duplicated map {}".format(reference_map))
        # duplicate_asset returns the duplicated UWorld.  A live Python
        # wrapper prevents UE 5.8 from collecting that world during load and
        # triggers EditorServer's fatal world-leak guard.
        duplicated = None
        gc.collect()
    return {
        "created": created,
        "referenceMap": reference_map,
        "sourceMap": source_map,
    }


def prepare_reference_level(source_map=None, reference_map=None):
    """Refresh compatibility assignments in an already-open reference map.

    UE 5.8's macOS Python bridge can retain a standalone UWorld wrapper across
    EditorLoadingAndSavingUtils.load_map and trip the editor's fatal world-leak
    guard.  The Node launcher therefore opens the target map on the command
    line; Python never switches maps.
    """
    ensured = ensure_reference_level(source_map, reference_map)
    source_map = ensured["sourceMap"]
    reference_map = ensured["referenceMap"]

    current_world = unreal.get_editor_subsystem(
        unreal.UnrealEditorSubsystem
    ).get_editor_world()
    current_map = _package_path(_object_path(current_world))
    current_name = str(current_world.get_name())
    current_world = None
    gc.collect()
    expected_name = reference_map.rsplit("/", 1)[-1]
    if current_map != reference_map and current_name != expected_name:
        raise RuntimeError(
            "Open {} on the Unreal command line before preparing it; current map is {} ({})".format(
                reference_map,
                current_map,
                current_name,
            )
        )

    replacements, material_report = create_reference_materials()
    actors = list(
        unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
    )
    assignment_report = assign_reference_materials(actors, replacements)
    if assignment_report["slots"] <= 0:
        raise RuntimeError(
            "The reference level contained no SnowPines colour-map material slots"
        )

    saved = unreal.get_editor_subsystem(
        unreal.LevelEditorSubsystem
    ).save_current_level()
    if not saved:
        raise RuntimeError("Unable to save {}".format(reference_map))
    unreal.EditorAssetLibrary.save_directory(
        REFERENCE_MATERIAL_ROOT,
        False,
        True,
    )
    return {
        "assignments": assignment_report,
        "materials": material_report,
        "referenceMap": reference_map,
        "sourceMap": source_map,
    }
