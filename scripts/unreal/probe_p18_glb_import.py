"""Temporary P18 GLB import/API probe.

Run through UnrealEditor-Cmd to record the exact assets and material APIs
available in the UE 5.8 project before the production parity builder imports
the four P18 fixtures.
"""

from pathlib import Path

import unreal


SOURCE = (
    Path(unreal.Paths.project_dir()).resolve().parent
    / "toonlab"
    / "assets-local"
    / "props"
    / "buildings"
    / "lamp_post_light.glb"
)
DESTINATION = "/Game/ToonLab/Parity/P18Probe/Lamp"

if unreal.EditorAssetLibrary.does_directory_exist(DESTINATION):
    unreal.EditorAssetLibrary.delete_directory(DESTINATION)

task = unreal.AssetImportTask()
task.set_editor_property("filename", str(SOURCE))
task.set_editor_property("destination_path", DESTINATION)
task.set_editor_property("automated", True)
task.set_editor_property("replace_existing", True)
task.set_editor_property("save", True)
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

unreal.log_warning("P18_PROBE_IMPORTED {}".format(task.imported_object_paths))
for object_path in task.imported_object_paths:
    asset = unreal.EditorAssetLibrary.load_asset(object_path)
    unreal.log_warning(
        "P18_PROBE_ASSET path={} class={}".format(
            object_path,
            asset.get_class().get_name() if asset else "missing",
        )
    )
    if isinstance(asset, unreal.StaticMesh):
        bounds = asset.get_bounds()
        unreal.log_warning(
            "P18_PROBE_BOUNDS mesh={} origin={} extent={} radius={}".format(
                object_path,
                bounds.origin,
                bounds.box_extent,
                bounds.sphere_radius,
            )
        )
        for slot_index, slot in enumerate(asset.static_materials):
            material = slot.material_interface
            unreal.log_warning(
                "P18_PROBE_SLOT mesh={} index={} slot={} imported={} material={} class={}"
                .format(
                    object_path,
                    slot_index,
                    slot.material_slot_name,
                    slot.get_editor_property("imported_material_slot_name"),
                    material.get_path_name() if material else "missing",
                    material.get_class().get_name() if material else "missing",
                )
            )
            if isinstance(material, unreal.MaterialInstance):
                for parameter_kind, getter_name in (
                    ("scalar", "get_scalar_parameter_names"),
                    ("vector", "get_vector_parameter_names"),
                    ("texture", "get_texture_parameter_names"),
                ):
                    getter = getattr(unreal.MaterialEditingLibrary, getter_name, None)
                    if getter:
                        unreal.log_warning(
                            "P18_PROBE_PARAMETERS material={} kind={} names={}".format(
                                material.get_path_name(),
                                parameter_kind,
                                getter(material),
                            )
                        )

unreal.log_warning(
    "P18_PROBE_MATERIAL_API {}".format(
        sorted(
            name
            for name in dir(unreal.MaterialEditingLibrary)
            if "material_instance" in name.lower()
            or "parameter" in name.lower()
        )
    )
)
