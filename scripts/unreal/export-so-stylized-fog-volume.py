"""Export the authored So Stylized 64^3 fog-noise source without baking it.

UE stores T_3DNoise as a VolumeTexture whose lossless source is a 4096x64
RGBA16F Texture2D strip (64 horizontal 64x64 slices).  Three can rebuild the
same volume from an EXR at runtime; this exporter keeps the source precision
and records the layout instead of replacing the volume with procedural noise.
"""

import hashlib
import json
import os
from datetime import datetime, timezone

import unreal


VOLUME_PATH = "/Game/SoStylized/Textures/Noise/T_3DNoise.T_3DNoise"
SOURCE_PATH = "/Game/SoStylized/Textures/Noise/T_3DNoise_Source.T_3DNoise_Source"
MAKE_FLOAT4_PATH = "/Engine/Functions/Engine_MaterialFunctions02/Utility/MakeFloat4.MakeFloat4"


def editor_property(value, name, default=None):
    try:
        return value.get_editor_property(name)
    except Exception:
        return default


def safe_text(value):
    try:
        return str(value)
    except Exception:
        return ""


def texture_size(texture, axis):
    method = getattr(texture, "blueprint_get_size_{}".format(axis), None)
    if method:
        try:
            return int(method())
        except Exception:
            pass
    return 0


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while True:
            block = handle.read(1024 * 1024)
            if not block:
                return digest.hexdigest()
            digest.update(block)


output_root = os.path.abspath(
    os.environ.get(
        "TOONLAB_FOG_VOLUME_OUTPUT",
        os.path.join(
            unreal.Paths.project_dir(),
            "..",
            "toonlab",
            "assets-local",
            "sostylized",
            "fog-volume",
        ),
    )
)
os.makedirs(output_root, exist_ok=True)

volume = unreal.EditorAssetLibrary.load_asset(VOLUME_PATH.split(".", 1)[0])
source = unreal.EditorAssetLibrary.load_asset(SOURCE_PATH.split(".", 1)[0])
try:
    # Engine material functions are loadable even when the commandlet's
    # project Asset Registry omits /Engine entries.
    make_float4 = unreal.load_object(None, MAKE_FLOAT4_PATH)
except Exception:
    make_float4 = None
if not volume or not source:
    raise RuntimeError("The fog volume or its source strip is missing.")

exr_path = os.path.join(output_root, "T_3DNoise_Source.exr")
task = unreal.AssetExportTask()
task.set_editor_property("object", source)
task.set_editor_property("filename", exr_path)
task.set_editor_property("automated", True)
task.set_editor_property("prompt", False)
task.set_editor_property("replace_identical", True)
task.set_editor_property("write_empty_files", False)
task.set_editor_property("exporter", unreal.TextureExporterEXR())
if not unreal.Exporter.run_asset_export_task(task) or not os.path.isfile(exr_path):
    raise RuntimeError("Unable to export the authored fog-volume source strip as EXR.")

make_float4_inputs = []
expressions = (
    unreal.MaterialEditingLibrary.get_material_function_expressions(make_float4) or []
    if make_float4
    else []
)
for expression in expressions:
    if expression.get_class().get_name() != "MaterialExpressionFunctionInput":
        continue
    preview = editor_property(expression, "preview_value")
    preview_value = [
        float(getattr(preview, channel, 0.0))
        for channel in ("x", "y", "z", "w")
    ] if preview is not None else None
    make_float4_inputs.append({
        "name": safe_text(editor_property(expression, "input_name")),
        "previewValue": preview_value,
        "sortPriority": editor_property(expression, "sort_priority"),
        "usePreviewValueAsDefault": bool(
            editor_property(expression, "use_preview_value_as_default", False)
        ),
    })
make_float4_inputs.sort(key=lambda value: value.get("sortPriority") or 0)

manifest = {
    "schema": "toonlab.sostylized-fog-volume-source",
    "version": 1,
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "volumeAsset": VOLUME_PATH,
    "sourceAsset": SOURCE_PATH,
    "sourceFile": "T_3DNoise_Source.exr",
    "sourceSha256": sha256(exr_path),
    "layout": {
        "axis": "x",
        "columns": 64,
        "rows": 1,
        "sliceWidth": 64,
        "sliceHeight": 64,
        "depth": 64,
        "sourceWidth": texture_size(source, "x"),
        "sourceHeight": texture_size(source, "y"),
    },
    "source": {
        "srgb": bool(editor_property(source, "srgb", False)),
        "compression": safe_text(editor_property(source, "compression_settings")),
        "filter": safe_text(editor_property(source, "filter")),
        "addressX": safe_text(editor_property(source, "address_x")),
        "addressY": safe_text(editor_property(source, "address_y")),
    },
    "volume": {
        "class": volume.get_class().get_name(),
        "srgb": bool(editor_property(volume, "srgb", False)),
        "compression": safe_text(editor_property(volume, "compression_settings")),
        "filter": safe_text(editor_property(volume, "filter")),
        "addressMode": safe_text(editor_property(volume, "address_mode")),
        "source2DTexture": safe_text(editor_property(volume, "source2d_texture")),
        "source2DTileSizeX": editor_property(volume, "source2d_tile_size_x"),
        "source2DTileSizeY": editor_property(volume, "source2d_tile_size_y"),
    },
    "engineFunctionContracts": {
        "MakeFloat4": {
            "path": MAKE_FLOAT4_PATH,
            "inputs": make_float4_inputs,
        },
    },
}

manifest_path = os.path.join(output_root, "manifest.json")
with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2, ensure_ascii=False)
    handle.write("\n")

unreal.log(
    "TOONLAB_FOG_VOLUME_DONE source={}x{} volume=64x64x64 output={}".format(
        manifest["layout"]["sourceWidth"],
        manifest["layout"]["sourceHeight"],
        output_root,
    )
)
