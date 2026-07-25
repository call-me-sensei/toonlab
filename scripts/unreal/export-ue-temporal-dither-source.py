"""Export UE 5.8's DitherTemporalAA material-function source for auditing.

The source showcase needs the engine function itself, not a visual guess.  The
text exports stay under gitignored ``assets-local`` and are consumed manually
when updating the checked-in audit/verifier.
"""

import os

import unreal


OUTPUT_ROOT = os.path.abspath(
    os.environ.get(
        "TOONLAB_UE_TEMPORAL_DITHER_OUTPUT",
        os.path.join(
            unreal.Paths.project_dir(),
            "..",
            "toonlab",
            "assets-local",
            "sostylized",
            "ue-temporal-dither",
        ),
    )
)

ASSETS = (
    (
        "/Engine/Functions/Engine_MaterialFunctions02/Utility/DitherTemporalAA",
        "DitherTemporalAA.T3D",
    ),
    (
        "/Engine/Functions/Engine_MaterialFunctions02/Texturing/ScreenAlignedPixelToPixelUVs",
        "ScreenAlignedPixelToPixelUVs.T3D",
    ),
)


os.makedirs(OUTPUT_ROOT, exist_ok=True)
exporter_class = getattr(unreal, "ObjectExporterT3D", None)
if exporter_class is None:
    raise RuntimeError("UE ObjectExporterT3D is unavailable")

# Python commandlets normally scan project content only.  These two assets
# live under /Engine, so make that mount visible before loading them.
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
    unreal.log("TOONLAB_UE_TEMPORAL_DITHER_SOURCE {}".format(output_path))

noise_path = "/Engine/EngineMaterials/Good64x64TilingNoiseHighFreq"
noise = unreal.load_asset(noise_path)
if not noise:
    raise RuntimeError("Unable to load {}".format(noise_path))
noise_output = os.path.join(OUTPUT_ROOT, "Good64x64TilingNoiseHighFreq.png")
noise_task = unreal.AssetExportTask()
noise_task.set_editor_property("object", noise)
noise_task.set_editor_property("filename", noise_output)
noise_task.set_editor_property("automated", True)
noise_task.set_editor_property("prompt", False)
noise_task.set_editor_property("replace_identical", True)
noise_task.set_editor_property("write_empty_files", False)
noise_task.set_editor_property("exporter", unreal.TextureExporterPNG())
if not unreal.Exporter.run_asset_export_task(noise_task):
    raise RuntimeError("Unable to export {}".format(noise_path))
unreal.log("TOONLAB_UE_TEMPORAL_DITHER_NOISE {}".format(noise_output))
