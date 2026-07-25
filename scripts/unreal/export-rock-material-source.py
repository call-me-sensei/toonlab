"""Export source textures and runtime profiles from a material audit.

Rock Lab remains the default target. The complete So Stylized environment
export uses the same pipeline with environment-variable overrides, keeping all
licensed output under ToonLab's gitignored assets-local directory.
"""

import json
import os
import re

import unreal


DEFAULT_ROOT = os.path.abspath(
    os.path.join(unreal.Paths.project_dir(), "..", "toonlab", "assets-local", "rock-references")
)


def safe_text(value):
    try:
        return str(value)
    except Exception:
        return ""


def editor_property(value, name, default=None):
    try:
        return value.get_editor_property(name)
    except Exception:
        return default


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def texture_filename(path):
    package_path = path.split(".", 1)[0]
    relative = re.sub(r"^/Game/", "", package_path)
    return "textures/{}.png".format(relative)


def collect_expression_textures(record):
    paths = []
    for expression in record.get("expressions", []):
        for field in ("texture", "default_texture", "atlas", "virtual_texture"):
            path = expression.get(field)
            if isinstance(path, str) and path.startswith("/"):
                paths.append(path)
    return paths


def texture_size(texture, axis):
    method = getattr(texture, "blueprint_get_size_{}".format(axis), None)
    if method:
        try:
            return int(method())
        except Exception:
            pass
    return 0


output_root = os.path.abspath(
    os.environ.get(
        "TOONLAB_MATERIAL_SOURCE_OUTPUT",
        os.environ.get("TOONLAB_ROCK_MATERIAL_SOURCE_OUTPUT", DEFAULT_ROOT),
    )
)
force = env_bool(
    "TOONLAB_MATERIAL_SOURCE_FORCE",
    env_bool("TOONLAB_ROCK_MATERIAL_SOURCE_FORCE", False),
)
include_all_materials = env_bool("TOONLAB_MATERIAL_SOURCE_INCLUDE_ALL", False)
manifest_schema = os.environ.get(
    "TOONLAB_MATERIAL_SOURCE_SCHEMA",
    "toonlab.rock-material-source",
)
audit_path = os.path.abspath(
    os.environ.get(
        "TOONLAB_MATERIAL_AUDIT_OUTPUT",
        os.environ.get(
            "TOONLAB_ROCK_MATERIAL_AUDIT_OUTPUT",
            os.path.join(output_root, "material-audit.json"),
        ),
    )
)
if not os.path.isfile(audit_path):
    raise RuntimeError("Material audit is missing: {}".format(audit_path))

with open(audit_path, "r", encoding="utf-8") as handle:
    audit = json.load(handle)

materials_by_path = {
    record.get("path"): record for record in audit.get("materials", [])
}
source_root = audit.get("sourceRoot") or "/Game/SoStylized/"
used_material_paths = sorted(
    path
    for path in (
        materials_by_path.keys()
        if include_all_materials
        else {
            material_path
            for mesh in audit.get("meshes", [])
            for material_path in mesh.get("materials", [])
            if material_path
        }
    )
    if path and path.startswith(source_root)
)

texture_paths = set()
runtime_materials = []
for path in used_material_paths:
    record = materials_by_path.get(path)
    if not record:
        continue
    for value in record.get("parameters", {}).get("texture", {}).values():
        if isinstance(value, str) and value.startswith("/"):
            texture_paths.add(value)
    texture_paths.update(record.get("usedTextures", []))
    for chain_path in record.get("chain", []):
        chain_record = materials_by_path.get(chain_path, {})
        texture_paths.update(chain_record.get("usedTextures", []))
        texture_paths.update(collect_expression_textures(chain_record))
    runtime_materials.append({
        "path": path,
        "category": record.get("category"),
        "class": record.get("class"),
        "chain": record.get("chain", []),
        "parameters": record.get("parameters", {}),
    })

for function_record in audit.get("materialFunctions", []):
    texture_paths.update(collect_expression_textures(function_record))

external_texture_paths = sorted(
    path for path in texture_paths if not path.startswith(source_root)
)
texture_paths = {
    path for path in texture_paths if path.startswith(source_root)
}

texture_records = {}
unsupported_textures = []
for index, path in enumerate(sorted(texture_paths)):
    texture = unreal.EditorAssetLibrary.load_asset(path.split(".", 1)[0])
    if not texture:
        unreal.log_warning("TOONLAB_MATERIAL_SOURCE missing texture {}".format(path))
        continue
    texture_class = texture.get_class().get_name()
    # Curve atlases and runtime virtual textures inherit texture-like classes
    # but TextureExporterPNG asserts on them. Curve rows are already captured
    # as sampled source data in the audit; only plain Texture2D is safe here.
    if texture_class != "Texture2D":
        unsupported_textures.append({"path": path, "class": texture_class})
        continue
    relative_file = texture_filename(path)
    output_path = os.path.join(output_root, "material-source", relative_file)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    if force or not os.path.isfile(output_path):
        task = unreal.AssetExportTask()
        task.set_editor_property("object", texture)
        task.set_editor_property("filename", output_path)
        task.set_editor_property("automated", True)
        task.set_editor_property("prompt", False)
        task.set_editor_property("replace_identical", True)
        task.set_editor_property("write_empty_files", False)
        task.set_editor_property("exporter", unreal.TextureExporterPNG())
        result = unreal.Exporter.run_asset_export_task(task)
        if not result or not os.path.isfile(output_path):
            unreal.log_warning("TOONLAB_MATERIAL_SOURCE unable to export {}".format(path))
            continue

    texture_records[path] = {
        "file": relative_file,
        "class": texture_class,
        "width": texture_size(texture, "x"),
        "height": texture_size(texture, "y"),
        "srgb": bool(editor_property(texture, "srgb", True)),
        "compression": safe_text(editor_property(texture, "compression_settings")),
        "addressX": safe_text(editor_property(texture, "address_x")),
        "addressY": safe_text(editor_property(texture, "address_y")),
    }
    unreal.log(
        "TOONLAB_MATERIAL_SOURCE_TEXTURE {}/{} {}".format(
            index + 1, len(texture_paths), path
        )
    )

runtime_manifest = {
    "schema": manifest_schema,
    "version": 1,
    "sourceAuditSchema": audit.get("schema"),
    "assetRoot": audit.get("assetRoot"),
    "sourceRoot": source_root,
    "assetClassCounts": audit.get("assetClassCounts", {}),
    "categoryCounts": audit.get("categoryCounts", {}),
    "meshes": audit.get("meshes", []),
    "materials": runtime_materials,
    "materialFunctions": audit.get("materialFunctions", []),
    "parameterCollections": audit.get("parameterCollections", []),
    "curves": audit.get("curves", []),
    "textures": texture_records,
    "externalTextures": external_texture_paths,
    "unsupportedTextures": unsupported_textures,
}
manifest_path = os.path.join(output_root, "material-source", "manifest.json")
os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(runtime_manifest, handle, indent=2, ensure_ascii=False)
    handle.write("\n")

unreal.log(
    "TOONLAB_MATERIAL_SOURCE_DONE materials={} textures={} unsupported={} output={}".format(
        len(runtime_materials),
        len(texture_records),
        len(unsupported_textures),
        manifest_path,
    )
)
