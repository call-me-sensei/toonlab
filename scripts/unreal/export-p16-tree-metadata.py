"""Export the authored P16 pine contract directly from Unreal Engine 5.8.

This is a read-only audit. It records the source SM_Pine01 mesh/LOD/material
slots and every resolved MI_PineBark / MI_PineLeaves parameter used by the
retained SnowPines Visual Target.
"""

import json
import math
import os

import unreal


OUTPUT_PATH = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "assets-local",
        "sostylized",
        "trees",
        "p16-ue-pine-contract.json",
    )
)

MESH_PATH = "/Game/SoStylized/Environment/Trees/Pine/SM_Pine01.SM_Pine01"
MATERIAL_PATHS = (
    "/Game/SoStylized/Environment/Trees/Materials/MI_PineBark.MI_PineBark",
    "/Game/SoStylized/Environment/Trees/Materials/MI_PineLeaves.MI_PineLeaves",
    "/Game/SoStylized/Environment/Trees/Materials/LODs/MI_PineBark_LOD.MI_PineBark_LOD",
    "/Game/SoStylized/Environment/Trees/Materials/LODs/MI_PineLeaves_LOD.MI_PineLeaves_LOD",
)
TEXTURE_PATHS = (
    "/Game/SoStylized/Environment/Trees/Textures/T_Leaf_Pine.T_Leaf_Pine",
    "/Game/SoStylized/Environment/Trees/Textures/T_Leaf_Pine_SS.T_Leaf_Pine_SS",
)
TARGET_MAP = "/Game/ToonLab/Parity/MinimalEnvironment/L_MinimalEnvironmentDemoP13"
TARGET_ACTOR_NAME = "Parity_Tree_SM_Pine01"


def object_path(value):
    if value is None:
        return None
    try:
        return value.get_path_name()
    except Exception:
        return str(value)


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


def editor_property_record(value, property_names):
    result = {}
    for property_name in property_names:
        try:
            property_value = value.get_editor_property(property_name)
            if hasattr(property_value, "r") and hasattr(property_value, "g"):
                result[property_name] = [
                    property_value.r,
                    property_value.g,
                    property_value.b,
                    property_value.a,
                ]
            else:
                result[property_name] = str(property_value)
        except Exception as exc:
            result[property_name] = {"readError": str(exc)}
    return result


def texture_record(texture):
    return {
        "path": texture.get_path_name(),
        "size": [texture.blueprint_get_size_x(), texture.blueprint_get_size_y()],
        "properties": editor_property_record(
            texture,
            (
                "adjust_brightness",
                "adjust_brightness_curve",
                "adjust_hue",
                "adjust_max_alpha",
                "adjust_min_alpha",
                "adjust_rgb_curve",
                "adjust_saturation",
                "alpha_coverage_thresholds",
                "compression_settings",
                "filter",
                "lod_bias",
                "lod_group",
                "mip_gen_settings",
                "never_stream",
                "preserve_border",
                "s_rgb",
                "use_legacy_gamma",
                "virtual_texture_streaming",
            ),
        ),
    }


def mesh_record(mesh):
    bounds = mesh.get_bounds()
    lod_count = mesh.get_num_lods()
    static_mesh_subsystem = unreal.get_editor_subsystem(
        unreal.StaticMeshEditorSubsystem
    )
    record = {
        "path": mesh.get_path_name(),
        "boundsOriginCm": [bounds.origin.x, bounds.origin.y, bounds.origin.z],
        "boundsExtentCm": [bounds.box_extent.x, bounds.box_extent.y, bounds.box_extent.z],
        "sphereRadiusCm": bounds.sphere_radius,
        "lodCount": lod_count,
        "materialSlots": [],
        "lods": [],
        "lodScreenSizes": list(
            static_mesh_subsystem.get_lod_screen_sizes(mesh)
        ),
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
                "triangles": mesh.get_num_triangles(lod_index),
                "vertices": mesh.get_num_vertices(lod_index),
            }
        )
    return record


def target_actor_record():
    unreal.EditorLoadingAndSavingUtils.load_map(TARGET_MAP)
    actor = next(
        (
            value
            for value in unreal.EditorLevelLibrary.get_all_level_actors()
            if value.get_actor_label() == TARGET_ACTOR_NAME
            or value.get_name() == TARGET_ACTOR_NAME
        ),
        None,
    )
    if actor is None:
        raise RuntimeError(
            "Could not find {} in {}".format(TARGET_ACTOR_NAME, TARGET_MAP)
        )
    location = actor.get_actor_location()
    rotation = actor.get_actor_rotation()
    scale = actor.get_actor_scale3d()
    component = actor.get_component_by_class(unreal.StaticMeshComponent)
    if component is None:
        raise RuntimeError("{} has no StaticMeshComponent".format(TARGET_ACTOR_NAME))
    component_materials = [
        object_path(component.get_material(index))
        for index in range(component.get_num_materials())
    ]
    override_materials = [
        object_path(value)
        for value in component.get_editor_property("override_materials")
    ]
    component_lod = {}
    for property_name in ("forced_lod_model", "min_lod"):
        try:
            component_lod[property_name] = int(
                component.get_editor_property(property_name)
            )
        except Exception as exc:
            component_lod[property_name] = {
                "readError": str(exc),
            }
    # MaterialExpressionPerInstanceRandom evaluates to zero on this ordinary
    # StaticMeshActor. MF_HueVariance still incorporates ActorPositionWS X/Y.
    raw_seed = location.x * 0.713145 + location.y * 0.713145
    seed = math.fmod(raw_seed, 1.0)
    wave = math.sin(seed * math.pi * 2.0)
    signed_cube = wave * abs(wave) * abs(wave)
    return {
        "map": TARGET_MAP,
        "actor": actor.get_name(),
        "label": actor.get_actor_label(),
        "class": actor.get_class().get_path_name(),
        "locationCm": [location.x, location.y, location.z],
        "rotationPitchYawRoll": [rotation.pitch, rotation.yaw, rotation.roll],
        "scale": [scale.x, scale.y, scale.z],
        "staticMesh": object_path(component.get_editor_property("static_mesh")),
        "componentMaterials": component_materials,
        "overrideMaterials": override_materials,
        "componentLod": component_lod,
        "perInstanceRandom": 0.0,
        "hueVariance": {
            "actorPositionScale": 0.713145,
            "rawSeed": raw_seed,
            "fmodSeed": seed,
            "signedCube": signed_cube,
        },
    }


def main():
    mesh = unreal.EditorAssetLibrary.load_asset(MESH_PATH)
    if mesh is None:
        raise RuntimeError("Could not load {}".format(MESH_PATH))
    result = {
        "schema": "toonlab.p16-ue-pine-contract",
        "version": 3,
        "engine": unreal.SystemLibrary.get_engine_version(),
        "source": MESH_PATH,
        "mesh": mesh_record(mesh),
        "materials": [],
        "textures": [],
        "visualTargetActor": target_actor_record(),
    }
    for path in MATERIAL_PATHS:
        material = unreal.EditorAssetLibrary.load_asset(path)
        if material is None:
            raise RuntimeError("Could not load {}".format(path))
        result["materials"].append(material_parameters(material))
    for path in TEXTURE_PATHS:
        texture = unreal.EditorAssetLibrary.load_asset(path)
        if texture is None:
            raise RuntimeError("Could not load {}".format(path))
        result["textures"].append(texture_record(texture))

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as output:
        json.dump(result, output, indent=2, sort_keys=True)
        output.write("\n")
    unreal.log("P16_TREE_METADATA={}".format(OUTPUT_PATH))


main()
