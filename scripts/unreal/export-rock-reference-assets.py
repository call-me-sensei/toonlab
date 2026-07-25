"""Export licensed So Stylized rock meshes for ToonLab's local Rock Lab.

Run this script through Unreal Editor, normally via
``node scripts/export-rock-reference-assets.mjs``. Output is deliberately
written beneath ToonLab's gitignored ``assets-local`` directory.

Each reference gets:
  - ``lodN.glb``: exact render geometry for every authored Unreal LOD,
    including UVs, tangents, vertex colors, and source material slot names,
    but no baked textures.
  - ``authored.glb``: LOD0 plus a compact material bake for honest visual
    comparison in Rock Lab.
  - one aggregate ``manifest.json`` describing availability and source
    triangle counts.
"""

import json
import os
import re
from datetime import datetime, timezone

import unreal


ASSET_ROOT = os.environ.get(
    "TOONLAB_REFERENCE_ASSET_ROOT",
    "/Game/SoStylized/Environment/Rocks",
)
DEFAULT_OUTPUT = os.path.abspath(
    os.path.join(unreal.Paths.project_dir(), "..", "toonlab", "assets-local", "rock-references")
)


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def env_int(name, default, minimum, maximum):
    try:
        value = int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def safe_text(value):
    try:
        return str(value)
    except Exception:
        return ""


def package_name(asset_data):
    try:
        return safe_text(asset_data.package_name)
    except Exception:
        return safe_text(asset_data.get_editor_property("package_name"))


def export_result_ok(result):
    if isinstance(result, tuple):
        return bool(result[0])
    return bool(result)


def export_glb(mesh, output_path, options):
    result = unreal.GLTFExporter.export_to_gltf(mesh, output_path, options, set())
    if not export_result_ok(result):
        raise RuntimeError("glTF export failed: {}".format(output_path))


def geometry_options(lod_index):
    options = unreal.GLTFExportOptions()
    options.reset_to_default()
    options.set_editor_property("default_level_of_detail", lod_index)
    options.set_editor_property("export_source_model", False)
    options.set_editor_property("export_vertex_colors", True)
    options.set_editor_property("bake_material_inputs", unreal.GLTFMaterialBakeMode.DISABLED)
    options.set_editor_property("texture_image_format", unreal.GLTFTextureImageFormat.NONE)
    return options


def authored_options(bake_size):
    options = unreal.GLTFExportOptions()
    options.reset_to_default()
    options.set_editor_property("default_level_of_detail", 0)
    options.set_editor_property("export_source_model", False)
    options.set_editor_property(
        "default_material_bake_size",
        unreal.GLTFMaterialBakeSize(x=bake_size, y=bake_size, auto_detect=False),
    )
    return options


output_root = os.path.abspath(os.environ.get(
    "TOONLAB_REFERENCE_OUTPUT",
    os.environ.get("TOONLAB_ROCK_REFERENCE_OUTPUT", DEFAULT_OUTPUT),
))
bake_size = env_int("TOONLAB_ROCK_REFERENCE_BAKE_SIZE", 256, 64, 4096)
force = env_bool("TOONLAB_ROCK_REFERENCE_FORCE", False)
materials_enabled = env_bool("TOONLAB_ROCK_REFERENCE_MATERIALS", True)
filter_pattern = os.environ.get("TOONLAB_ROCK_REFERENCE_FILTER", "").strip()
filter_regex = re.compile(filter_pattern, re.IGNORECASE) if filter_pattern else None
preserve_paths = env_bool("TOONLAB_REFERENCE_PRESERVE_PATHS", False)
manifest_schema = os.environ.get(
    "TOONLAB_REFERENCE_MANIFEST_SCHEMA",
    "toonlab.local-rock-references",
)

os.makedirs(output_root, exist_ok=True)

registry = unreal.AssetRegistryHelpers.get_asset_registry()
registry.scan_paths_synchronous([ASSET_ROOT], True)
assets = registry.get_assets_by_path(ASSET_ROOT, recursive=True)
mesh_paths = sorted(
    package_name(asset_data)
    for asset_data in assets
    if safe_text(asset_data.asset_class_path.asset_name) == "StaticMesh"
)
if filter_regex:
    mesh_paths = [path for path in mesh_paths if filter_regex.search(path.rsplit("/", 1)[-1])]

manifest = {
    "schema": manifest_schema,
    "version": 1,
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "assetRoot": ASSET_ROOT,
    "bakeSize": bake_size if materials_enabled else None,
    "entries": [],
}
manifest_path = os.path.join(output_root, "manifest.json")

# A focused re-export must not collapse a previously complete inventory to
# the filtered subset. Preserve untouched records and replace only the assets
# selected by the current filter. Full exports intentionally rebuild the
# manifest from the audited Unreal directory.
if filter_regex and os.path.isfile(manifest_path):
    try:
        with open(manifest_path, "r", encoding="utf-8") as handle:
            previous_manifest = json.load(handle)
        if previous_manifest.get("schema") == manifest["schema"]:
            selected_paths = set(mesh_paths)
            manifest["entries"] = [
                entry for entry in previous_manifest.get("entries", [])
                if entry.get("sourcePath") not in selected_paths
            ]
    except Exception as error:
        unreal.log_warning(
            "TOONLAB_ROCK_EXPORT unable to preserve prior manifest: {}".format(error)
        )

for asset_index, path in enumerate(mesh_paths):
    mesh = unreal.EditorAssetLibrary.load_asset(path)
    if not mesh:
        unreal.log_error("TOONLAB_ROCK_EXPORT unable to load {}".format(path))
        continue

    source_name = path.rsplit("/", 1)[-1]
    relative_path = path[len(ASSET_ROOT):].lstrip("/")
    asset_key = relative_path if preserve_paths else source_name
    asset_dir = os.path.join(output_root, *asset_key.split("/"))
    os.makedirs(asset_dir, exist_ok=True)
    lod_records = []

    for lod_index in range(mesh.get_num_lods()):
        filename = "lod{}.glb".format(lod_index)
        output_path = os.path.join(asset_dir, filename)
        if force or not os.path.isfile(output_path):
            export_glb(mesh, output_path, geometry_options(lod_index))
        lod_records.append({
            "lod": lod_index,
            "file": "{}/{}".format(asset_key, filename),
            "triangles": int(mesh.get_num_triangles(lod_index)),
        })

    authored_file = None
    if materials_enabled:
        authored_filename = "authored.glb"
        authored_path = os.path.join(asset_dir, authored_filename)
        if force or not os.path.isfile(authored_path):
            export_glb(mesh, authored_path, authored_options(bake_size))
        authored_file = "{}/{}".format(asset_key, authored_filename)

    materials = []
    try:
        for slot in mesh.get_editor_property("static_materials") or []:
            material = slot.get_editor_property("material_interface")
            materials.append(material.get_path_name() if material else None)
    except Exception:
        pass

    manifest["entries"].append({
        "assetKey": asset_key,
        "category": relative_path.split("/", 1)[0] if relative_path else "Misc",
        "sourceAssetName": source_name,
        "sourcePath": path,
        "authoredFile": authored_file,
        "lods": lod_records,
        "materials": materials,
    })
    manifest["entries"].sort(key=lambda entry: entry["sourceAssetName"])
    manifest["count"] = len(manifest["entries"])

    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    unreal.log(
        "TOONLAB_ROCK_EXPORT {}/{} {} lods={}".format(
            asset_index + 1, len(mesh_paths), source_name, len(lod_records)
        )
    )

manifest["entries"].sort(key=lambda entry: entry["sourceAssetName"])
manifest["count"] = len(manifest["entries"])
with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2, ensure_ascii=False)
    handle.write("\n")

unreal.log(
    "TOONLAB_ROCK_EXPORT_DONE count={} output={}".format(
        len(manifest["entries"]), output_root
    )
)
