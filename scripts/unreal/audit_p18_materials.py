"""Read the effective UE 5.8 parameters of every generated P18 material."""

import unreal


MATERIAL_ROOT = "/Game/ToonLab/Parity/P18/Materials"


def object_path(value):
    return value.get_path_name() if value is not None else None


def snapshot(material):
    library = unreal.MaterialEditingLibrary
    scalar = {}
    vector = {}
    texture = {}
    switches = {}
    for parameter in library.get_scalar_parameter_names(material):
        scalar[str(parameter)] = float(
            library.get_material_instance_scalar_parameter_value(
                material,
                parameter,
            )
        )
    for parameter in library.get_vector_parameter_names(material):
        value = library.get_material_instance_vector_parameter_value(
            material,
            parameter,
        )
        vector[str(parameter)] = [value.r, value.g, value.b, value.a]
    for parameter in library.get_texture_parameter_names(material):
        texture[str(parameter)] = object_path(
            library.get_material_instance_texture_parameter_value(
                material,
                parameter,
            )
        )
    for parameter in library.get_static_switch_parameter_names(material):
        switches[str(parameter)] = bool(
            library.get_material_instance_static_switch_parameter_value(
                material,
                parameter,
            )
        )
    return {
        "parent": object_path(material.get_editor_property("parent")),
        "scalar": scalar,
        "vector": vector,
        "texture": texture,
        "staticSwitch": switches,
    }


for asset_path in sorted(
    unreal.EditorAssetLibrary.list_assets(
        MATERIAL_ROOT,
        recursive=False,
        include_folder=False,
    )
):
    material = unreal.EditorAssetLibrary.load_asset(asset_path)
    if not isinstance(material, unreal.MaterialInstanceConstant):
        continue
    unreal.log_warning(
        "TOONLAB_P18_MATERIAL_AUDIT {} {}".format(
            asset_path,
            snapshot(material),
        )
    )
