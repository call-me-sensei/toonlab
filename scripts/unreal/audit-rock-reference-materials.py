"""Audit a licensed So Stylized material system from Unreal.

The rock audit remains the default. Environment variables can widen the same
read-only graph walk to the complete environment pack, including material
instances that are not assigned directly to a static mesh (sky, water,
landscape, post materials), source-owned function dependencies, curves, and
the global material-parameter collection.
"""

import hashlib
import json
import os
import re
from datetime import datetime, timezone

import unreal


ASSET_ROOT = os.environ.get(
    "TOONLAB_MATERIAL_AUDIT_ASSET_ROOT",
    "/Game/SoStylized/Environment/Rocks",
)
SOURCE_ROOT = os.environ.get(
    "TOONLAB_MATERIAL_AUDIT_SOURCE_ROOT",
    "/Game/SoStylized/",
)
REPORT_SCHEMA = os.environ.get(
    "TOONLAB_MATERIAL_AUDIT_SCHEMA",
    "toonlab.rock-material-audit",
)
DEFAULT_OUTPUT = os.path.abspath(
    os.path.join(
        unreal.Paths.project_dir(),
        "..",
        "toonlab",
        "assets-local",
        "rock-references",
        "material-audit.json",
    )
)


def safe_text(value):
    try:
        return str(value)
    except Exception:
        return ""


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def object_path(value):
    if not value:
        return None
    try:
        return value.get_path_name()
    except Exception:
        return safe_text(value)


def class_name(value):
    try:
        return value.get_class().get_name()
    except Exception:
        return type(value).__name__


def editor_property(value, name, default=None):
    try:
        return value.get_editor_property(name)
    except Exception:
        try:
            return getattr(value, name)
        except Exception:
            return default


EXPRESSION_PROPERTY_NAMES_BY_CLASS = {}
GRAPH_T3D_CACHE = {}
GRAPH_EXPORT_ROOT = os.environ.get("TOONLAB_MATERIAL_GRAPH_EXPORT_ROOT", "")
EXPRESSION_PROPERTY_SKIP = {
    "desc",
    "graph_node",
    "material_expression_editor_x",
    "material_expression_editor_y",
    "name",
}


def reflected_expression_property_names(expression):
    """Discover every editor-exposed property once per UE expression class."""
    key = class_name(expression)
    if key in EXPRESSION_PROPERTY_NAMES_BY_CLASS:
        return EXPRESSION_PROPERTY_NAMES_BY_CLASS[key]
    names = []
    for name in dir(expression):
        if name.startswith("_") or name in EXPRESSION_PROPERTY_SKIP:
            continue
        try:
            expression.get_editor_property(name)
        except Exception:
            continue
        names.append(name)
    names.sort()
    EXPRESSION_PROPERTY_NAMES_BY_CLASS[key] = names
    return names


def json_value(value):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple, set)):
        return [json_value(item) for item in value]
    if isinstance(value, dict):
        return {safe_text(key): json_value(item) for key, item in value.items()}
    if not isinstance(value, (str, bytes)) and hasattr(value, "__iter__"):
        try:
            return [json_value(item) for item in value]
        except Exception:
            pass
    channels = []
    for channel in ("r", "g", "b", "a"):
        if hasattr(value, channel):
            channels.append(float(getattr(value, channel)))
    if len(channels) in (3, 4):
        return channels
    xyz = []
    for channel in ("x", "y", "z"):
        if hasattr(value, channel):
            xyz.append(float(getattr(value, channel)))
    if len(xyz) == 3:
        return xyz
    path = object_path(value)
    return path if path else safe_text(value)


def call_library(name, *args):
    method = getattr(unreal.MaterialEditingLibrary, name, None)
    if not method:
        return None
    try:
        return method(*args)
    except Exception:
        return None


def parameter_names(material, kind):
    values = call_library("get_{}_parameter_names".format(kind), material) or []
    return sorted({safe_text(value) for value in values})


def instance_parameter(material, kind, name):
    result = call_library(
        "get_material_instance_{}_parameter_value".format(kind),
        material,
        name,
    )
    if result is None:
        result = call_library(
            "get_material_instance_{}_parameter_value".format(kind),
            material,
            unreal.Name(name),
        )
    return json_value(result)


def material_parent(material):
    return editor_property(material, "parent")


def material_chain(material):
    chain = []
    seen = set()
    current = material
    while current:
        path = object_path(current)
        if not path or path in seen:
            break
        chain.append(path)
        seen.add(path)
        current = material_parent(current)
    return chain


def direct_expression_collection(owner, is_function=False):
    if is_function:
        expressions = call_library("get_material_function_expressions", owner)
        return list(expressions or [])
    expressions = call_library("get_material_expressions", owner)
    if expressions:
        return list(expressions)
    candidates = [
        editor_property(owner, "expressions"),
        editor_property(editor_property(owner, "editor_only_data"), "expressions"),
    ]
    editor_data = editor_property(owner, "editor_only_data")
    expression_data = editor_property(editor_data, "expression_collection")
    candidates.append(editor_property(expression_data, "expressions"))
    for candidate in candidates:
        if candidate:
            return list(candidate)
    return []


def expression_inputs(owner, expression, is_function=False):
    return (
        call_library("get_inputs_for_material_function_expression", owner, expression)
        if is_function
        else call_library("get_inputs_for_material_expression", owner, expression)
    ) or []


INPUT_PROPERTY_ALIASES = {
    "none": "input",
    "exp": "exponent",
    "uvs": "coordinates",
    "tex": "texture_object",
    "apply view mipbias": "automatic_view_mip_bias_value",
    "a > b": "a_greater_than_b",
    "a == b": "a_equals_b",
    "a < b": "a_less_than_b",
}


def snake_case(value):
    text = safe_text(value).strip()
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", text)
    text = re.sub(r"[^A-Za-z0-9]+", "_", text)
    return text.strip("_").lower()


def graph_t3d_filename(owner):
    path = object_path(owner) or safe_text(owner.get_name())
    package_path = path.split(".", 1)[0].strip("/")
    return "__".join(part for part in package_path.split("/") if part) + ".T3D"


def parse_t3d_input_value(value):
    expression_match = re.search(r'Expression="[^"]*:([^\'\"]+)\'"', value)
    output_match = re.search(r'(?:^|,)OutputIndex=(-?\d+)(?:,|\))', value)
    mask = {
        name: int(bool(re.search(
            r'(?:^|,){}=(?:1|True)(?:,|\))'.format(serialized),
            value,
            re.IGNORECASE,
        )))
        for name, serialized in (
            ("mask", "Mask"),
            ("mask_r", "MaskR"),
            ("mask_g", "MaskG"),
            ("mask_b", "MaskB"),
            ("mask_a", "MaskA"),
        )
    }
    source_node = expression_match.group(1) if expression_match else None
    output_index = int(output_match.group(1)) if output_match else (0 if source_node else None)
    return {
        "sourceNode": source_node,
        "outputIndex": output_index,
        "mask": mask,
    }


def parse_t3d_connected_inputs(value):
    """Return every connected FExpressionInput serialized on one property line."""
    pattern = re.compile(
        r'Expression="[^"]+"'
        r'(?:,(?:OutputIndex|Mask|MaskR|MaskG|MaskB|MaskA)=(?:-?\d+|True|False))*',
        re.IGNORECASE,
    )
    return [parse_t3d_input_value(match.group(0)) for match in pattern.finditer(value)]


def parse_graph_t3d(text):
    """Read exact FExpressionInput pins from UE's authoritative text export."""
    inputs_by_node = {}
    current_node = None
    current_depth = 0
    begin_pattern = re.compile(r'^\s*Begin Object(?:\s+Class=[^ ]+)?\s+Name="([^"]+)"')
    property_pattern = re.compile(
        r'^\s*([A-Za-z_][A-Za-z0-9_]*)(?:\((\d+)\))?=(.*)$'
    )
    for raw_line in text.splitlines():
        begin_match = begin_pattern.match(raw_line)
        if begin_match:
            current_depth += 1
            if current_depth == 2 and "MaterialExpression" in begin_match.group(1):
                current_node = begin_match.group(1)
                inputs_by_node.setdefault(current_node, {})
            continue
        if raw_line.strip() == "End Object":
            if current_depth == 2:
                current_node = None
            current_depth = max(0, current_depth - 1)
            continue
        if current_depth != 2 or not current_node:
            continue
        property_match = property_pattern.match(raw_line)
        if not property_match:
            continue
        property_name, array_index, value = property_match.groups()
        if "Expression=" not in value and "OutputIndex=" not in value:
            continue
        connected_inputs = parse_t3d_connected_inputs(value)
        inputs_by_node[current_node].setdefault("__ordered__", []).extend(connected_inputs)
        key = snake_case(property_name)
        if array_index is not None:
            key = "{}[{}]".format(key, int(array_index))
        inputs_by_node[current_node][key] = parse_t3d_input_value(value)
    return inputs_by_node


def graph_t3d_data(owner):
    """Export one source graph losslessly so hidden FExpressionInput data survives."""
    path = object_path(owner)
    if not path:
        return None
    if path in GRAPH_T3D_CACHE:
        return GRAPH_T3D_CACHE[path]
    os.makedirs(GRAPH_EXPORT_ROOT, exist_ok=True)
    filename = graph_t3d_filename(owner)
    output_file = os.path.join(GRAPH_EXPORT_ROOT, filename)
    exported = False
    try:
        task = unreal.AssetExportTask()
        task.set_editor_property("object", owner)
        task.set_editor_property("filename", output_file)
        task.set_editor_property("automated", True)
        task.set_editor_property("prompt", False)
        task.set_editor_property("replace_identical", True)
        task.set_editor_property("write_empty_files", False)
        exporter_class = getattr(unreal, "ObjectExporterT3D", None)
        if exporter_class:
            task.set_editor_property("exporter", exporter_class())
        exported = bool(unreal.Exporter.run_asset_export_task(task))
    except Exception as error:
        unreal.log_warning(
            "TOONLAB_MATERIAL_GRAPH_EXPORT failed {}: {}".format(path, safe_text(error))
        )
    if not exported or not os.path.isfile(output_file):
        GRAPH_T3D_CACHE[path] = None
        return None
    with open(output_file, "r", encoding="utf-8-sig") as handle:
        text = handle.read()
    data = {
        "file": filename,
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "inputsByNode": parse_graph_t3d(text),
    }
    GRAPH_T3D_CACHE[path] = data
    return data


def t3d_input_for_expression(
    owner,
    expression,
    input_name,
    input_index,
    fallback_node=None,
    input_sources=None,
):
    data = graph_t3d_data(owner)
    if not data:
        return None
    node_inputs = data["inputsByNode"].get(safe_text(expression.get_name()), {})
    expression_class = class_name(expression)
    direct = None
    if expression_class == "MaterialExpressionMaterialFunctionCall":
        direct = node_inputs.get("function_inputs[{}]".format(input_index))
    elif expression_class == "MaterialExpressionCustom":
        direct = node_inputs.get("inputs[{}]".format(input_index))
    normalized = safe_text(input_name).strip().lower()
    property_name = INPUT_PROPERTY_ALIASES.get(normalized, snake_case(input_name))
    direct = direct or node_inputs.get(property_name)
    if direct and direct.get("sourceNode"):
        return direct
    fallback_path = object_path(fallback_node)
    fallback_name = fallback_path.rsplit(":", 1)[-1] if fallback_path else None
    if not fallback_name:
        return direct
    matches = [
        value for value in node_inputs.get("__ordered__", [])
        if value.get("sourceNode") == fallback_name
    ]
    occurrence = 0
    for prior_source in list(input_sources or [])[:input_index]:
        prior_path = object_path(prior_source)
        if prior_path and prior_path.rsplit(":", 1)[-1] == fallback_name:
            occurrence += 1
    if occurrence < len(matches):
        return matches[occurrence]
    return direct


def input_structs_for_expression(expression, input_names):
    """Resolve FExpressionInput structs so repeated-source output pins survive."""
    expression_class = class_name(expression)
    if expression_class == "MaterialExpressionMaterialFunctionCall":
        result = []
        for item in editor_property(expression, "function_inputs", []) or []:
            result.append(editor_property(item, "input"))
        if len(result) == len(input_names):
            return result
    if expression_class == "MaterialExpressionCustom":
        result = []
        for item in editor_property(expression, "inputs", []) or []:
            result.append(editor_property(item, "input"))
        if len(result) == len(input_names):
            return result
    result = []
    for input_name in input_names:
        normalized = safe_text(input_name).strip().lower()
        property_name = INPUT_PROPERTY_ALIASES.get(normalized, snake_case(input_name))
        result.append(editor_property(expression, property_name))
    return result


def expression_input_record(input_struct, fallback_node, fallback_output, t3d_input=None):
    source = editor_property(input_struct, "expression") if input_struct else None
    if not source:
        source = fallback_node
    output_index = editor_property(input_struct, "output_index") if input_struct else None
    if t3d_input is not None:
        output_index = t3d_input.get("outputIndex")
    try:
        output_index = int(output_index) if output_index is not None else None
    except Exception:
        output_index = None
    output_name = fallback_output
    if source and output_index is not None:
        output_names = call_library("get_material_expression_output_names", source) or []
        if 0 <= output_index < len(output_names):
            output_name = safe_text(output_names[output_index])
    mask = t3d_input.get("mask") if t3d_input is not None else None
    if mask is None and input_struct:
        mask = {
            name: int(editor_property(input_struct, name, 0) or 0)
            for name in ("mask", "mask_r", "mask_g", "mask_b", "mask_a")
        }
    return {
        "node": object_path(source),
        "output": output_name,
        "outputIndex": output_index,
        "mask": mask,
    }


def expression_collection(owner, is_function=False):
    """Return the complete reachable graph, including omitted editor nodes.

    UE's MaterialEditingLibrary occasionally omits a connected expression from
    get_material_function_expressions() even though an input pin still returns
    the live UObject.  Walking input references closes that hole without
    inventing graph data.  Only expressions owned by this graph are admitted.
    """
    owner_path = object_path(owner)
    expressions = direct_expression_collection(owner, is_function)
    result = []
    queue = list(expressions)
    seen = set()
    while queue:
        expression = queue.pop(0)
        path = object_path(expression)
        if not path or path in seen:
            continue
        if owner_path and not path.startswith(owner_path + ":"):
            continue
        seen.add(path)
        result.append(expression)
        for input_node in expression_inputs(owner, expression, is_function):
            input_path = object_path(input_node)
            if input_path and input_path not in seen:
                queue.append(input_node)
        declaration = editor_property(expression, "declaration")
        declaration_path = object_path(declaration)
        if declaration_path and declaration_path not in seen:
            queue.append(declaration)
    return result


def expression_record(owner, expression, is_function=False):
    record = {
        "class": class_name(expression),
        "name": safe_text(expression.get_name()),
    }
    explicit_properties = (
        "desc",
        "parameter_name",
        "default_value",
        "constant",
        "const_a",
        "const_b",
        "const_alpha",
        "const_exponent",
        "equals_threshold",
        "clamp_mode",
        "min_default",
        "max_default",
        "r",
        "g",
        "b",
        "a",
        "exponent",
        "base_reflect_fraction",
        "input_low_default",
        "input_high_default",
        "target_low_default",
        "target_high_default",
        "texture",
        "default_texture",
        "atlas",
        "curve",
        "collection",
        "virtual_texture",
        "material_function",
        "sampler_type",
        "channel_names",
        "coordinate_index",
        "const_coordinate",
        "mapping_scale",
        "mapping_rotation",
        "mapping_pan_u",
        "mapping_pan_v",
        "bias",
        "scale",
        "period",
        "ignore_pause",
        "override_period",
        "speed_x",
        "speed_y",
        "fractional_part",
        "center_x",
        "center_y",
        "speed",
        "u_tiling",
        "v_tiling",
        "unmirror_u",
        "unmirror_v",
        "scene_texture_id",
        "world_position_shader_offset",
        "world_position_origin_type",
        "transform_source_type",
        "transform_type",
        "code",
        "output_type",
        "description",
        "sampler_source",
        "height_ratio",
        "reference_plane",
        "fade_distance_default",
        "use_custom_output_name",
        "output_name",
        "blend_type",
        "preview_weight",
        "group",
        "sort_priority",
    )
    captured_properties = set()
    for property_name in explicit_properties:
        value = editor_property(expression, property_name)
        if value is not None:
            record[property_name] = json_value(value)
            captured_properties.add(property_name)
    # UE exposes class-specific literals under different names (`R`,
    # `ConstExponent`, `ClampMode`, `MinDefault`, etc.).  Maintaining a hand
    # list silently lost exact graph values.  Reflect the complete editor
    # property set and retain any class-specific field not handled above.
    for property_name in reflected_expression_property_names(expression):
        if property_name in captured_properties or property_name in EXPRESSION_PROPERTY_SKIP:
            continue
        value = editor_property(expression, property_name)
        if value is not None:
            record[property_name] = json_value(value)
    declaration = editor_property(expression, "declaration")
    if declaration is not None:
        record["declaration"] = object_path(declaration)
    for guid_property in ("variable_guid", "declaration_guid"):
        guid = editor_property(expression, guid_property)
        if guid is not None:
            record[guid_property] = json_value(guid)
    reroute_name = editor_property(expression, "name")
    if reroute_name is not None:
        record["reroute_name"] = safe_text(reroute_name)
    input_names = call_library("get_material_expression_input_names", expression) or []
    input_nodes = expression_inputs(owner, expression, is_function)
    if input_names or input_nodes:
        input_sources = list(input_nodes)
        fallback_outputs = [
            safe_text(call_library(
                "get_input_node_output_name_for_material_expression",
                expression,
                value,
            )) if value else ""
            for value in input_sources
        ]
        input_structs = input_structs_for_expression(expression, input_names)
        input_records = [
            expression_input_record(
                input_structs[index] if index < len(input_structs) else None,
                input_sources[index] if index < len(input_sources) else None,
                fallback_outputs[index] if index < len(fallback_outputs) else "",
                t3d_input_for_expression(
                    owner,
                    expression,
                    input_names[index] if index < len(input_names) else "",
                    index,
                    input_sources[index] if index < len(input_sources) else None,
                    input_sources,
                ),
            )
            for index in range(max(len(input_names), len(input_sources)))
        ]
        record["inputs"] = {
            "names": [safe_text(value) for value in input_names],
            "nodes": [value["node"] for value in input_records],
            "outputs": [value["output"] for value in input_records],
            "outputIndices": [value["outputIndex"] for value in input_records],
            "masks": [value["mask"] for value in input_records],
        }
    output_names = call_library("get_material_expression_output_names", expression) or []
    if output_names:
        record["outputs"] = [safe_text(value) for value in output_names]
    position = call_library("get_material_expression_node_position", owner, expression)
    if position is not None:
        record["position"] = json_value(position)
    return record


def material_record(material):
    path = object_path(material)
    record = {
        "path": path,
        "class": class_name(material),
        "category": source_category(path),
        "chain": material_chain(material),
        "parameters": {},
    }
    for kind in ("scalar", "vector", "texture", "static_switch"):
        names = parameter_names(material, kind)
        record["parameters"][kind] = {
            name: instance_parameter(material, kind, name) for name in names
        }
    used_textures = call_library("get_material_used_textures", material) or []
    record["usedTextures"] = sorted(
        path for path in (object_path(texture) for texture in used_textures) if path
    )
    expressions = expression_collection(material)
    if expressions:
        graph_export = graph_t3d_data(material)
        if graph_export:
            record["graphExport"] = {
                "file": graph_export["file"],
                "sha256": graph_export["sha256"],
            }
        record["expressions"] = [
            expression_record(material, expression) for expression in expressions
        ]
    property_inputs = {}
    for enum_name in (
        "MP_BASE_COLOR",
        "MP_METALLIC",
        "MP_SPECULAR",
        "MP_ROUGHNESS",
        "MP_EMISSIVE_COLOR",
        "MP_NORMAL",
        "MP_AMBIENT_OCCLUSION",
        "MP_OPACITY",
        "MP_OPACITY_MASK",
        "MP_WORLD_POSITION_OFFSET",
        "MP_MATERIAL_ATTRIBUTES",
    ):
        material_property = getattr(unreal.MaterialProperty, enum_name, None)
        if material_property is None:
            continue
        node = call_library("get_material_property_input_node", material, material_property)
        if not node:
            continue
        property_inputs[enum_name] = {
            "node": object_path(node),
            "output": safe_text(call_library(
                "get_material_property_input_node_output_name",
                material,
                material_property,
            )),
        }
    if property_inputs:
        record["propertyInputs"] = property_inputs
    for property_name in (
        "blend_mode",
        "material_domain",
        "shading_model",
        "two_sided",
        "use_material_attributes",
        "blendable_location",
        "blendable_output_alpha",
        "blendable_priority",
        "is_blendable",
        "user_scene_texture",
        "user_texture_divisor",
        "resolution_relative_to_input",
        "disable_pre_exposure_scale",
        "enable_stencil_test",
        "stencil_compare",
        "stencil_ref_value",
    ):
        value = editor_property(material, property_name)
        if value is not None:
            record[property_name] = json_value(value)
    return record


def material_function_record(material_function):
    expressions = expression_collection(material_function, is_function=True)
    record = {
        "path": object_path(material_function),
        "class": class_name(material_function),
        "expressions": [
            expression_record(material_function, expression, is_function=True)
            for expression in expressions
        ],
    }
    graph_export = graph_t3d_data(material_function)
    if graph_export:
        record["graphExport"] = {
            "file": graph_export["file"],
            "sha256": graph_export["sha256"],
        }
    return record


def package_name(asset_data):
    try:
        return safe_text(asset_data.package_name)
    except Exception:
        return safe_text(asset_data.get_editor_property("package_name"))


def asset_class_name(asset_data):
    try:
        return safe_text(asset_data.asset_class_path.asset_name)
    except Exception:
        return safe_text(asset_data.get_editor_property("asset_class_path"))


def source_category(path):
    marker = "/Game/SoStylized/Environment/"
    if path and path.startswith(marker):
        return path[len(marker):].split("/", 1)[0]
    return "Shared"


def add_material_chain(material, materials_by_path):
    current = material
    while current:
        current_path = object_path(current)
        if not current_path or current_path in materials_by_path:
            break
        materials_by_path[current_path] = current
        current = material_parent(current)


def parameter_collection_record(collection):
    record = {
        "path": object_path(collection),
        "class": class_name(collection),
        "scalar": [],
        "vector": [],
    }
    for kind, property_name in (
        ("scalar", "scalar_parameters"),
        ("vector", "vector_parameters"),
    ):
        for parameter in editor_property(collection, property_name, []) or []:
            item = {}
            for field in ("parameter_name", "default_value", "id"):
                value = editor_property(parameter, field)
                if value is not None:
                    item[field] = json_value(value)
            record[kind].append(item)
    return record


def curve_record(curve, samples=64):
    record = {
        "path": object_path(curve),
        "class": class_name(curve),
    }
    evaluator = None
    for method_name in (
        "get_linear_color_value",
        "get_vector_value",
        "get_float_value",
    ):
        method = getattr(curve, method_name, None)
        if method:
            evaluator = method
            break
    if evaluator:
        values = []
        for index in range(samples + 1):
            time = float(index) / float(samples)
            try:
                values.append([time, json_value(evaluator(time))])
            except Exception:
                break
        if values:
            record["samples"] = values
    for property_name in ("texture_size", "gradient_curves"):
        value = editor_property(curve, property_name)
        if value is not None:
            record[property_name] = json_value(value)
    return record


output_path = os.path.abspath(
    os.environ.get(
        "TOONLAB_MATERIAL_AUDIT_OUTPUT",
        os.environ.get("TOONLAB_ROCK_MATERIAL_AUDIT_OUTPUT", DEFAULT_OUTPUT),
    )
)
os.makedirs(os.path.dirname(output_path), exist_ok=True)
if not GRAPH_EXPORT_ROOT:
    GRAPH_EXPORT_ROOT = os.path.join(os.path.dirname(output_path), "graphs-all")
include_all_materials = env_bool("TOONLAB_MATERIAL_AUDIT_INCLUDE_ALL", False)

registry = unreal.AssetRegistryHelpers.get_asset_registry()
registry.scan_paths_synchronous([ASSET_ROOT], True)
assets = registry.get_assets_by_path(ASSET_ROOT, recursive=True)
asset_class_counts = {}
category_counts = {}
for asset_data in assets:
    asset_class = asset_class_name(asset_data)
    asset_class_counts[asset_class] = asset_class_counts.get(asset_class, 0) + 1
    category = source_category(package_name(asset_data))
    category_counts[category] = category_counts.get(category, 0) + 1

mesh_paths = sorted(
    package_name(asset_data)
    for asset_data in assets
    if asset_class_name(asset_data) == "StaticMesh"
)

meshes = []
materials_by_path = {}
functions_by_path = {}
parameter_collections = []
curves = []
for path in mesh_paths:
    mesh = unreal.EditorAssetLibrary.load_asset(path)
    if not mesh:
        continue
    material_paths = []
    material_slots = []
    for slot in editor_property(mesh, "static_materials", []) or []:
        material = editor_property(slot, "material_interface")
        material_path = object_path(material)
        material_paths.append(material_path)
        material_slots.append({
            "name": safe_text(editor_property(slot, "material_slot_name")),
            "importedName": safe_text(editor_property(slot, "imported_material_slot_name")),
            "material": material_path,
        })
        add_material_chain(material, materials_by_path)
    lod_count = None
    try:
        subsystem = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
        lod_count = int(subsystem.get_lod_count(mesh))
    except Exception:
        pass
    meshes.append({
        "sourcePath": path,
        "sourceAssetName": path.rsplit("/", 1)[-1],
        "category": source_category(path),
        "materials": material_paths,
        "materialSlots": material_slots,
        "lodCount": lod_count,
    })


if include_all_materials:
    for asset_data in assets:
        asset_class = asset_class_name(asset_data)
        path = package_name(asset_data)
        if asset_class in ("Material", "MaterialInstanceConstant"):
            material = unreal.EditorAssetLibrary.load_asset(path)
            if material:
                add_material_chain(material, materials_by_path)
        elif asset_class.startswith("MaterialFunction"):
            material_function = unreal.EditorAssetLibrary.load_asset(path)
            function_path = object_path(material_function)
            if material_function and function_path:
                functions_by_path[function_path] = material_function
        elif asset_class == "MaterialParameterCollection":
            collection = unreal.EditorAssetLibrary.load_asset(path)
            if collection:
                parameter_collections.append(parameter_collection_record(collection))
        elif asset_class in (
            "CurveFloat",
            "CurveLinearColor",
            "CurveLinearColorAtlas",
            "CurveVector",
        ):
            curve = unreal.EditorAssetLibrary.load_asset(path)
            if curve:
                curves.append(curve_record(curve))


def add_source_function(material_function):
    path = object_path(material_function)
    if not path or not path.startswith(SOURCE_ROOT) or path in functions_by_path:
        return False
    functions_by_path[path] = material_function
    return True


# Follow the complete source-owned function graph. M_Rock delegates its top
# layers, weather, VT blend, and day-cycle behavior to functions outside the
# Rocks folder, so limiting the audit to ASSET_ROOT loses the actual shader.
function_queue = list(functions_by_path.values())
for material in materials_by_path.values():
    for expression in expression_collection(material):
        material_function = editor_property(expression, "material_function")
        if material_function and add_source_function(material_function):
            function_queue.append(material_function)

processed_functions = set()
while function_queue:
    material_function = function_queue.pop(0)
    material_function_path = object_path(material_function)
    if not material_function_path or material_function_path in processed_functions:
        continue
    processed_functions.add(material_function_path)
    for expression in expression_collection(material_function, is_function=True):
        dependency = editor_property(expression, "material_function")
        if dependency and add_source_function(dependency):
            function_queue.append(dependency)

report = {
    "schema": REPORT_SCHEMA,
    "version": 1,
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "assetRoot": ASSET_ROOT,
    "sourceRoot": SOURCE_ROOT,
    "includeAllMaterials": include_all_materials,
    "assetCount": len(assets),
    "assetClassCounts": dict(sorted(asset_class_counts.items())),
    "categoryCounts": dict(sorted(category_counts.items())),
    "meshCount": len(meshes),
    "materialCount": len(materials_by_path),
    "materialFunctionCount": len(functions_by_path),
    "parameterCollectionCount": len(parameter_collections),
    "curveCount": len(curves),
    "meshes": meshes,
    "materials": [
        material_record(materials_by_path[path]) for path in sorted(materials_by_path)
    ],
    "materialFunctions": [
        material_function_record(functions_by_path[path]) for path in sorted(functions_by_path)
    ],
    "parameterCollections": sorted(
        parameter_collections,
        key=lambda record: record.get("path") or "",
    ),
    "curves": sorted(curves, key=lambda record: record.get("path") or ""),
    "pythonApi": {
        "materialEditingLibrary": sorted(
            name for name in dir(unreal.MaterialEditingLibrary)
            if "material" in name.lower() or "parameter" in name.lower() or "texture" in name.lower()
        ),
    },
}

with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(report, handle, indent=2, ensure_ascii=False)
    handle.write("\n")

unreal.log(
    "TOONLAB_MATERIAL_AUDIT_DONE assets={} meshes={} materials={} functions={} output={}".format(
        report["assetCount"],
        report["meshCount"],
        report["materialCount"],
        report["materialFunctionCount"],
        output_path,
    )
)
