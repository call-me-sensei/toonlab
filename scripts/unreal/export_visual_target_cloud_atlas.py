"""Export the source cloud CurveLinearColorAtlas as native linear EXR."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import unreal


ATLAS_PATH = "/Game/SoStylized/Environment/Sky/Curves/Atlas_Clouds.Atlas_Clouds"
CLASSIC_DAY_PATH = (
    "/Game/SoStylized/Environment/Sky/Curves/"
    "Curve_Clouds_Classic_Day.Curve_Clouds_Classic_Day"
)


def command_line_value(name: str, default: str) -> str:
    prefix = "-%s=" % name
    for token in unreal.SystemLibrary.get_command_line().split():
        if token.lower().startswith(prefix.lower()):
            return token[len(prefix):].strip('"')
    return default


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    output_dir = Path(
        command_line_value(
            "ParityCloudAtlasOutput",
            os.path.join(unreal.Paths.project_saved_dir(), "ToonLabParity/CloudAtlas"),
        )
    ).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    exr_path = output_dir / "Atlas_Clouds.exr"
    report_path = output_dir / "report.json"

    atlas = unreal.EditorAssetLibrary.load_asset(ATLAS_PATH)
    classic_day = unreal.EditorAssetLibrary.load_asset(CLASSIC_DAY_PATH)
    if atlas is None or classic_day is None:
        raise RuntimeError("Visual Target cloud atlas or Classic Day curve is missing")
    gradients = list(atlas.get_editor_property("gradient_curves"))
    row_index = next(
        (index for index, curve in enumerate(gradients) if curve == classic_day),
        -1,
    )
    if row_index != 0:
        raise RuntimeError("Cloud Classic Day must remain atlas row 0; got %d" % row_index)

    task = unreal.AssetExportTask()
    task.set_editor_property("object", atlas)
    task.set_editor_property("filename", str(exr_path))
    task.set_editor_property("automated", True)
    task.set_editor_property("prompt", False)
    task.set_editor_property("replace_identical", True)
    task.set_editor_property("exporter", unreal.TextureExporterEXR())
    if not unreal.Exporter.run_asset_export_task(task) or not exr_path.is_file():
        raise RuntimeError("Unreal failed to export the source cloud atlas to EXR")

    report = {
        "schema": "toonlab.ue-visual-target-cloud-atlas",
        "version": 1,
        "source": {
            "atlas": ATLAS_PATH,
            "curve": CLASSIC_DAY_PATH,
            "curveRow": row_index,
            "format": "RGBA16F linear CurveLinearColorAtlas source",
            "textureWidth": int(atlas.blueprint_get_size_x()),
            "textureHeight": int(atlas.blueprint_get_size_y()),
            "filter": str(atlas.get_editor_property("filter")),
            "srgb": bool(atlas.get_editor_property("srgb")),
            "addressX": str(atlas.get_editor_property("address_x")),
            "addressY": str(atlas.get_editor_property("address_y")),
            "gradientCount": len(gradients),
        },
        "sampling": {
            "u": "(cloudTexture.r * (width - 1) + 0.5) / width",
            "v": "(curveRow + 0.5) / height",
            "strength": 2.0,
            "opacity": "cloudTexture.a",
        },
        "output": {
            "path": str(exr_path),
            "bytes": exr_path.stat().st_size,
            "sha256": sha256(exr_path),
        },
    }
    temporary = report_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, report_path)
    unreal.log("TOONLAB_VISUAL_TARGET_CLOUD_ATLAS_COMPLETE %s" % report_path)


if __name__ == "__main__":
    main()
