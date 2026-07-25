"""Export the material functions consumed by P16's M_Leaves graph.

This is intentionally read-only with respect to the Unreal project. The T3D
payloads are written into ToonLab's local source-graph cache so the browser
port can follow the authored nodes instead of approximating helper behavior.
"""

from pathlib import Path

import unreal


FUNCTIONS = {
    "/Game/SoStylized/Environment/Sky/Materials/MF_DayCycleEmission.MF_DayCycleEmission":
        "MF_DayCycleEmission.T3D",
    "/Game/SoStylized/Materials/MF_Lerp_Five_Float1.MF_Lerp_Five_Float1":
        "MF_Lerp_Five_Float1.T3D",
}

OUTPUT_DIR = (
    Path(__file__).resolve().parents[2]
    / "assets-local"
    / "sostylized"
    / "graphs"
)


def export_t3d(asset_path, output_name):
    asset = unreal.load_asset(asset_path)
    if asset is None:
        raise RuntimeError("Unable to load {}".format(asset_path))

    exporter_class = getattr(unreal, "ObjectExporterT3D", None)
    if exporter_class is None:
        raise RuntimeError("UE ObjectExporterT3D is unavailable")

    exporter = exporter_class()
    task = unreal.AssetExportTask()
    task.object = asset
    task.exporter = exporter
    task.filename = str(OUTPUT_DIR / output_name)
    task.automated = True
    task.prompt = False
    task.replace_identical = True
    task.write_empty_files = False
    if not unreal.Exporter.run_asset_export_task(task):
        raise RuntimeError("T3D export failed for {}".format(asset_path))


OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
for source_path, filename in FUNCTIONS.items():
    export_t3d(source_path, filename)
    unreal.log("P16_LEAF_FUNCTION={}".format(OUTPUT_DIR / filename))
