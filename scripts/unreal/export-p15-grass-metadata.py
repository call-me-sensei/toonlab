"""Export the authored P15 grass contract directly from Unreal Engine 5.8.

This is intentionally a read-only audit. It records the LandscapeGrassType
varieties, source meshes, material slots/LODs, and resolved material-instance
parameters used by the SnowPines grass path.
"""

import json
import os

import unreal


OUTPUT_PATH = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "assets-local",
        "sostylized",
        "grass",
        "p15-ue-grass-contract.json",
    )
)

GRASS_TYPE_PATH = "/Game/SoStylized/Environment/Landscape/LG_Grass.LG_Grass"
GRASS_MESH_PATHS = (
    "/Game/SoStylized/Environment/Foliage/SM_Grass1.SM_Grass1",
    "/Game/SoStylized/Environment/Foliage/SM_Grass2.SM_Grass2",
)
MATERIAL_PATHS = (
    "/Game/SoStylized/Environment/Foliage/Materials/MI_Grass.MI_Grass",
    "/Game/SoStylized/Environment/Foliage/Materials/MI_Grass_LOD1.MI_Grass_LOD1",
    "/Game/SoStylized/Environment/Foliage/Materials/MI_Grass_LOD2.MI_Grass_LOD2",
    "/Game/SoStylized/Environment/Foliage/Materials/MI_Grass_NoRVT.MI_Grass_NoRVT",
    "/Game/SoStylized/Environment/Foliage/Materials/LODs/MI_Grass_NoRVT_LOD1.MI_Grass_NoRVT_LOD1",
    "/Game/SoStylized/Environment/Foliage/Materials/LODs/MI_Grass_NoRVT_LOD2.MI_Grass_NoRVT_LOD2",
)
LANDSCAPE_MATERIAL_PATH = (
    "/Game/SoStylized/Environment/Landscape/Materials/"
    "MI_Landscape_Snow.MI_Landscape_Snow"
)
AUTO_GRASS_LAYERS = ("Grass", "SnowGrass", "SnowGrassBlue")
AUTO_CLIFF_NOISE_PATH = (
    "/Game/SoStylized/Textures/Noise/T_NoiseStylized.T_NoiseStylized"
)


def object_path(value):
    if value is None:
        return None
    try:
        return value.get_path_name()
    except Exception:
        return str(value)


def enum_name(value):
    if value is None:
        return None
    try:
        return value.name
    except Exception:
        return str(value)


def vector_interval(value):
    if value is None:
        return None
    result = {}
    for key in ("min", "max"):
        try:
            result[key] = float(value.get_editor_property(key))
        except Exception:
            try:
                result[key] = float(getattr(value, key))
            except Exception:
                result[key] = None
    return result


def property_value(source, name):
    try:
        return source.get_editor_property(name)
    except Exception as exc:
        return {"unavailable": str(exc)}


def serialize_value(value):
    if isinstance(value, dict):
        return value
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [serialize_value(item) for item in value]
    if hasattr(value, "get_path_name"):
        return object_path(value)
    if hasattr(value, "name"):
        return enum_name(value)
    return str(value)


def export_variety(variety):
    scalar_properties = (
        "grass_density",
        "grass_density_quality",
        "use_grid",
        "placement_jitter",
        "start_cull_distance",
        "end_cull_distance",
        "min_lod",
        "random_rotation",
        "align_to_surface",
        "use_landscape_lightmap",
        "receives_decals",
        "cast_dynamic_shadow",
        "keep_instance_buffer_cpu_copy",
        "instance_world_position_offset_disable_distance",
    )
    record = {
        "grassMesh": object_path(property_value(variety, "grass_mesh")),
        "scaling": enum_name(property_value(variety, "scaling")),
        "scaleX": vector_interval(property_value(variety, "scale_x")),
        "scaleY": vector_interval(property_value(variety, "scale_y")),
        "scaleZ": vector_interval(property_value(variety, "scale_z")),
    }
    for property_name in scalar_properties:
        record[property_name] = serialize_value(property_value(variety, property_name))
    return record


def material_parameters(material):
    library = unreal.MaterialEditingLibrary
    record = {
        "path": material.get_path_name(),
        "parent": object_path(material.get_editor_property("parent")),
        "scalar": {},
        "vector": {},
        "texture": {},
        "staticSwitch": {},
    }
    for parameter_name in library.get_scalar_parameter_names(material):
        name = str(parameter_name)
        record["scalar"][name] = float(
            library.get_material_instance_scalar_parameter_value(material, parameter_name)
        )
    for parameter_name in library.get_vector_parameter_names(material):
        name = str(parameter_name)
        value = library.get_material_instance_vector_parameter_value(material, parameter_name)
        record["vector"][name] = [value.r, value.g, value.b, value.a]
    for parameter_name in library.get_texture_parameter_names(material):
        name = str(parameter_name)
        value = library.get_material_instance_texture_parameter_value(material, parameter_name)
        record["texture"][name] = object_path(value)
    try:
        static_parameters = material.get_editor_property("static_parameters")
        for switch in static_parameters.get_editor_property("static_switch_parameters"):
            parameter_info = switch.get_editor_property("parameter_info")
            name = str(parameter_info.get_editor_property("name"))
            record["staticSwitch"][name] = bool(switch.get_editor_property("value"))
    except Exception as exc:
        record["staticSwitchReadError"] = str(exc)
    return record


def mesh_record(mesh):
    bounds = mesh.get_bounds()
    record = {
        "path": mesh.get_path_name(),
        "boundsOriginCm": [bounds.origin.x, bounds.origin.y, bounds.origin.z],
        "boundsExtentCm": [bounds.box_extent.x, bounds.box_extent.y, bounds.box_extent.z],
        "sphereRadiusCm": bounds.sphere_radius,
        "lodCount": unreal.EditorStaticMeshLibrary.get_lod_count(mesh),
        "materialSlots": [],
        "lods": [],
    }
    for slot in mesh.get_editor_property("static_materials"):
        record["materialSlots"].append(
            {
                "slotName": str(slot.get_editor_property("material_slot_name")),
                "importedSlotName": str(slot.get_editor_property("imported_material_slot_name")),
                "material": object_path(slot.get_editor_property("material_interface")),
            }
        )
    for lod_index in range(record["lodCount"]):
        record["lods"].append(
            {
                "lod": lod_index,
                "triangles": unreal.EditorStaticMeshLibrary.get_number_triangles(mesh, lod_index),
                "vertices": unreal.EditorStaticMeshLibrary.get_number_vertices(mesh, lod_index),
            }
        )
    return record


def main():
    grass_type = unreal.EditorAssetLibrary.load_asset(GRASS_TYPE_PATH)
    if grass_type is None:
        raise RuntimeError("Could not load {}".format(GRASS_TYPE_PATH))
    varieties = grass_type.get_editor_property("grass_varieties")
    result = {
        "schema": "toonlab.p15-ue-grass-contract",
        "version": 1,
        "engine": unreal.SystemLibrary.get_engine_version(),
        "source": GRASS_TYPE_PATH,
        "grassVarieties": [export_variety(variety) for variety in varieties],
        "landscapeGrassOutput": {},
        "meshes": [],
        "materials": [],
    }
    landscape_material = unreal.EditorAssetLibrary.load_asset(LANDSCAPE_MATERIAL_PATH)
    if landscape_material is None:
        raise RuntimeError("Could not load {}".format(LANDSCAPE_MATERIAL_PATH))
    landscape_parameters = material_parameters(landscape_material)
    scalar = landscape_parameters["scalar"]
    result["landscapeGrassOutput"] = {
        "material": LANDSCAPE_MATERIAL_PATH,
        "layers": list(AUTO_GRASS_LAYERS),
        "threshold": scalar["Auto Grass Threshold"],
        "visibilityMask": True,
        "expression": (
            "threshold(saturate(Grass + SnowGrass + SnowGrassBlue) * "
            "(1 - AutoCliffMask), Auto Grass Threshold) * "
            "LandscapeVisibilityMask"
        ),
        "autoCliff": {
            "enabled": True,
            "start": scalar["Auto Cliff Start"],
            "fade": scalar["Auto Cliff Fade"],
            "noiseScale": scalar["Auto Cliff Noise Scale"],
            "noiseStrength": scalar["Auto Cliff Noise Strength"],
            "noiseTexture": AUTO_CLIFF_NOISE_PATH,
        },
    }
    for path in GRASS_MESH_PATHS:
        mesh = unreal.EditorAssetLibrary.load_asset(path)
        if mesh is None:
            raise RuntimeError("Could not load {}".format(path))
        result["meshes"].append(mesh_record(mesh))
    for path in MATERIAL_PATHS:
        material = unreal.EditorAssetLibrary.load_asset(path)
        if material is None:
            raise RuntimeError("Could not load {}".format(path))
        result["materials"].append(material_parameters(material))

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as output:
        json.dump(result, output, indent=2, sort_keys=True)
        output.write("\n")
    unreal.log("P15_GRASS_METADATA={}".format(OUTPUT_PATH))


main()
