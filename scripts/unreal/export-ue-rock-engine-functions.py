"""Export the UE 5.8 engine material functions used by SoStylized surfaces.

The licensed pack's rock graph delegates its most important normal operations
to built-in Engine functions.  Keeping their T3D graphs under gitignored
``assets-local`` gives the web port a version-pinned implementation oracle.
"""

import os

import unreal


OUTPUT_ROOT = os.path.abspath(
    os.environ.get(
        "TOONLAB_UE_ROCK_FUNCTION_OUTPUT",
        os.path.join(
            unreal.Paths.project_dir(),
            "..",
            "toonlab",
            "assets-local",
            "sostylized",
            "ue-rock-engine-functions",
        ),
    )
)

ASSETS = (
    (
        "/Engine/Functions/Engine_MaterialFunctions01/WorldPositionOffset/SimpleGrassWind",
        "SimpleGrassWind.T3D",
    ),
    (
        "/Engine/Functions/Engine_MaterialFunctions01/Texturing/WorldAlignedNormal",
        "WorldAlignedNormal.T3D",
    ),
    (
        "/Engine/Functions/Engine_MaterialFunctions01/Texturing/FlattenNormal",
        "FlattenNormal.T3D",
    ),
    (
        "/Engine/Functions/Engine_MaterialFunctions02/WorldAlignedNormals_HighQuality",
        "WorldAlignedNormals_HighQuality.T3D",
    ),
    (
        "/Engine/Functions/Engine_MaterialFunctions02/Math/CreateThirdOrthogonalVector",
        "CreateThirdOrthogonalVector.T3D",
    ),
    (
        "/Engine/Functions/Engine_MaterialFunctions02/Math/Transform3x3Matrix",
        "Transform3x3Matrix.T3D",
    ),
    (
        "/Engine/Functions/Engine_MaterialFunctions02/Utility/BlendAngleCorrectedNormals",
        "BlendAngleCorrectedNormals.T3D",
    ),
)


os.makedirs(OUTPUT_ROOT, exist_ok=True)
exporter_class = getattr(unreal, "ObjectExporterT3D", None)
if exporter_class is None:
    raise RuntimeError("UE ObjectExporterT3D is unavailable")

asset_registry = unreal.AssetRegistryHelpers.get_asset_registry()
asset_registry.scan_paths_synchronous(["/Engine"], True)

for asset_path, filename in ASSETS:
    asset = unreal.load_asset(asset_path)
    if not asset:
        raise RuntimeError("Unable to load {}".format(asset_path))

    output_path = os.path.join(OUTPUT_ROOT, filename)
    task = unreal.AssetExportTask()
    task.set_editor_property("object", asset)
    task.set_editor_property("filename", output_path)
    task.set_editor_property("automated", True)
    task.set_editor_property("prompt", False)
    task.set_editor_property("replace_identical", True)
    task.set_editor_property("write_empty_files", False)
    task.set_editor_property("exporter", exporter_class())
    if not unreal.Exporter.run_asset_export_task(task):
        raise RuntimeError("Unable to export {}".format(asset_path))
    unreal.log("TOONLAB_UE_ROCK_ENGINE_FUNCTION {}".format(output_path))
