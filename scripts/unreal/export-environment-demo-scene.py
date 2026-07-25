"""Export authored actor/component placements from a So Stylized demo map.

The JSON output is deliberately geometry-free. ToonLab combines these exact
Unreal transforms with the separately exported source meshes, material slots,
and authored LODs instead of baking a flattened approximation of the level.
"""

import json
import os
import re
from datetime import datetime, timezone

import unreal


MAP_PATH = os.environ.get(
    "TOONLAB_DEMO_MAP",
    "/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines",
)
DEFAULT_OUTPUT = os.path.abspath(os.path.join(
    unreal.Paths.project_dir(),
    "..",
    "toonlab",
    "assets-local",
    "sostylized",
    "demo-scenes",
    "{}.json".format(re.sub(r"[^A-Za-z0-9_-]", "-", MAP_PATH.rsplit("/", 1)[-1])),
))
OUTPUT_PATH = os.path.abspath(os.environ.get("TOONLAB_DEMO_SCENE_OUTPUT", DEFAULT_OUTPUT))
GLTF_OUTPUT_PATH = os.environ.get("TOONLAB_DEMO_GLTF_OUTPUT", "").strip()
AUTHORED_GLTF_OUTPUT_PATH = os.environ.get(
    "TOONLAB_DEMO_AUTHORED_GLTF_OUTPUT",
    "",
).strip()
try:
    MATERIAL_BAKE_SIZE = max(
        64,
        min(2048, int(os.environ.get("TOONLAB_DEMO_MATERIAL_BAKE_SIZE", "256"))),
    )
except (TypeError, ValueError):
    MATERIAL_BAKE_SIZE = 256


def safe_text(value):
    try:
        return str(value)
    except Exception:
        return ""


def object_path(value):
    try:
        return value.get_path_name() if value else None
    except Exception:
        return None


def xyz(value):
    return [float(value.x), float(value.y), float(value.z)]


def quat(value):
    return [float(value.x), float(value.y), float(value.z), float(value.w)]


def transform_json(value):
    return {
        "translation": xyz(value.translation),
        "rotation": quat(value.rotation),
        "scale": xyz(value.scale3d),
    }


def json_value(value, depth=0):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if depth > 2:
        return safe_text(value)
    if isinstance(value, (list, tuple)):
        return [json_value(item, depth + 1) for item in value]
    if not isinstance(value, (dict, str, bytes)) and hasattr(value, "__iter__"):
        try:
            return [json_value(item, depth + 1) for item in value]
        except Exception:
            pass
    if all(hasattr(value, name) for name in ("r", "g", "b", "a")):
        return [float(value.r), float(value.g), float(value.b), float(value.a)]
    if all(hasattr(value, name) for name in ("x", "y", "z", "w")):
        return [float(value.x), float(value.y), float(value.z), float(value.w)]
    if all(hasattr(value, name) for name in ("x", "y", "z")):
        return [float(value.x), float(value.y), float(value.z)]
    if all(hasattr(value, name) for name in ("pitch", "yaw", "roll")):
        return {
            "pitch": float(value.pitch),
            "yaw": float(value.yaw),
            "roll": float(value.roll),
        }
    path = object_path(value)
    if path:
        return path
    return safe_text(value)


def editor_property(value, name, default=None):
    try:
        return value.get_editor_property(name)
    except Exception:
        return default


def property_snapshot(value, names):
    snapshot = {}
    for name in names:
        item = editor_property(value, name)
        if item is not None:
            snapshot[name] = json_value(item)
    return snapshot


POST_PROCESS_PROPERTIES = (
    "ambient_occlusion_intensity",
    "ambient_occlusion_power",
    "ambient_occlusion_radius",
    "auto_exposure_bias",
    "auto_exposure_high_percent",
    "auto_exposure_low_percent",
    "auto_exposure_max_brightness",
    "auto_exposure_method",
    "auto_exposure_min_brightness",
    "auto_exposure_speed_down",
    "auto_exposure_speed_up",
    "bloom_intensity",
    "bloom_method",
    "bloom_threshold",
    "blue_correction",
    "color_contrast",
    "color_gamma",
    "color_gain",
    "color_offset",
    "color_saturation",
    "expand_gamut",
    "film_black_clip",
    "film_slope",
    "film_toe",
    "film_white_clip",
    "film_shoulder",
    "lens_flare_intensity",
    "motion_blur_amount",
    "override_ambient_occlusion_intensity",
    "override_ambient_occlusion_power",
    "override_ambient_occlusion_radius",
    "override_auto_exposure_bias",
    "override_auto_exposure_high_percent",
    "override_auto_exposure_low_percent",
    "override_auto_exposure_max_brightness",
    "override_auto_exposure_method",
    "override_auto_exposure_min_brightness",
    "override_auto_exposure_speed_down",
    "override_auto_exposure_speed_up",
    "override_bloom_intensity",
    "override_bloom_method",
    "override_bloom_threshold",
    "override_blue_correction",
    "override_color_contrast",
    "override_color_gamma",
    "override_color_gain",
    "override_color_offset",
    "override_color_saturation",
    "override_expand_gamut",
    "override_film_black_clip",
    "override_film_slope",
    "override_film_toe",
    "override_film_white_clip",
    "override_film_shoulder",
    "override_lens_flare_intensity",
    "override_motion_blur_amount",
    "override_scene_color_tint",
    "override_tone_curve_amount",
    "override_temperature_type",
    "override_vignette_intensity",
    "override_white_temp",
    "override_white_tint",
    "scene_color_tint",
    "temperature_type",
    "tone_curve_amount",
    "vignette_intensity",
    "white_temp",
    "white_tint",
    "weighted_blendables",
)


COMPONENT_SPECS = (
    ("DirectionalLightComponent", (
        "atmosphere_sun_light",
        "atmosphere_sun_light_index",
        "cascade_distribution_exponent",
        "cascade_transition_fraction",
        "shadow_cascade_bias_distribution",
        "cast_ray_traced_shadow",
        "cast_dynamic_shadows",
        "cast_static_shadows",
        "cast_shadows",
        "contact_shadow_length",
        "distance_field_shadow_distance",
        "disabled_brightness",
        "dynamic_shadow_cascades",
        "dynamic_shadow_distance_movable_light",
        "far_shadow_cascade_count",
        "far_shadow_distance",
        "forward_shading_priority",
        "indirect_lighting_intensity",
        "intensity",
        "light_color",
        "light_function_fade_distance",
        "light_function_material",
        "light_function_scale",
        "light_source_angle",
        "mobility",
        "shadow_amount",
        "shadow_bias",
        "shadow_distance_fadeout_fraction",
        "shadow_resolution_scale",
        "shadow_slope_bias",
        "temperature",
        "use_ray_traced_distance_field_shadows",
        "use_temperature",
    )),
    ("PointLightComponent", (
        "attenuation_radius",
        "cast_dynamic_shadows",
        "cast_static_shadows",
        "cast_shadows",
        "indirect_lighting_intensity",
        "intensity",
        "intensity_units",
        "light_falloff_exponent",
        "light_color",
        "mobility",
        "shadow_bias",
        "source_radius",
        "temperature",
        "use_inverse_squared_falloff",
        "use_temperature",
    )),
    ("SkyLightComponent", (
        "affect_global_illumination",
        "affect_reflection",
        "capture_emissive_only",
        "cast_volumetric_shadow",
        "cast_ray_traced_shadow",
        "cast_shadows",
        "cloud_ambient_occlusion",
        "cubemap",
        "cubemap_resolution",
        "indirect_lighting_intensity",
        "intensity",
        "light_color",
        "lower_hemisphere_color",
        # UE's UI label says "Lower Hemisphere Is Solid Color", but the
        # serialized USkyLightComponent field remains bLowerHemisphereIsBlack.
        "lower_hemisphere_is_black",
        "mobility",
        "real_time_capture",
        "sky_distance_threshold",
        "source_cubemap_angle",
        "source_type",
    )),
    ("ExponentialHeightFogComponent", (
        "directional_inscattering_luminance",
        "directional_inscattering_exponent",
        "directional_inscattering_start_distance",
        "fog_cutoff_distance",
        "fog_density",
        "fog_height_falloff",
        "fog_inscattering_luminance",
        "fog_max_opacity",
        "start_distance",
        "enable_volumetric_fog",
        "volumetric_fog_albedo",
        "volumetric_fog_distance",
        "volumetric_fog_emissive",
        "volumetric_fog_extinction_scale",
        "volumetric_fog_scattering_distribution",
    )),
    ("PostProcessComponent", (
        "blend_radius",
        "blend_weight",
        "priority",
        "unbound",
    )),
    ("SkyAtmosphereComponent", (
        "aerial_perspective_view_distance_scale",
        "atmosphere_height",
        "bottom_radius",
        "ground_albedo",
        "mie_absorption",
        "mie_anisotropy",
        "mie_scattering",
        "rayleigh_scattering",
        "rayleigh_scattering_scale",
        "sky_luminance_factor",
        "trace_sample_count_scale",
    )),
    ("VolumetricCloudComponent", (
        "bottom_altitude",
        "layer_height",
        "material",
        "planet_radius",
        "reflection_sample_count_scale",
        "shadow_reflection_sample_count_scale",
        "shadow_tracing_distance",
        "tracing_max_distance",
        "view_sample_count_scale",
    )),
    ("CineCameraComponent", (
        "aspect_ratio",
        "constrain_aspect_ratio",
        "current_aperture",
        "current_focal_length",
        "field_of_view",
        "filmback",
        "focus_settings",
        "lens_settings",
        "post_process_blend_weight",
    )),
)


PROJECT_RENDER_CVARS = (
    "r.AllowStaticLighting",
    "r.LegacyLuminanceFactors",
    "r.VirtualTextures",
    "r.VT.EnableAutoImport",
    "r.GenerateMeshDistanceFields",
    "r.CustomDepth",
    "r.AntiAliasingMethod",
    "r.Shadow.Virtual.Enable",
    "r.Shadow.CSM.MaxCascades",
    "r.Shadow.CSM.TransitionScale",
    "r.Shadow.CSMDepthBias",
    "r.Shadow.CSMSlopeScaleDepthBias",
    "r.Shadow.CSMReceiverBias",
    "r.Shadow.ShadowMaxSlopeScaleDepthBias",
    "r.Shadow.DistanceScale",
    "r.Shadow.MaxCSMResolution",
    "r.Shadow.MaxResolution",
    "r.Shadow.MinResolution",
    "r.Shadow.RadiusThreshold",
    "r.Shadow.TexelsPerPixel",
    "r.Shadow.FilterMethod",
    "r.ShadowQuality",
    "r.DistanceFieldShadowing",
    "r.DynamicGlobalIlluminationMethod",
    "r.ReflectionMethod",
    "r.RayTracing",
    "r.RayTracing.RayTracingProxies.ProjectEnabled",
    "r.Substrate",
    "r.DefaultFeature.AutoExposure.ExtendDefaultLuminanceRange",
    "r.DefaultFeature.LocalExposure.HighlightContrastScale",
    "r.DefaultFeature.LocalExposure.ShadowContrastScale",
)


STATIC_MESH_RENDER_PROPERTIES = (
    "cast_shadow",
    "cast_dynamic_shadow",
    "cast_static_shadow",
    "cast_contact_shadow",
    "cast_far_shadow",
    "cast_hidden_shadow",
    "cast_inset_shadow",
    "cast_volumetric_translucent_shadow",
    "self_shadow_only",
    "affect_distance_field_lighting",
    "affect_dynamic_indirect_lighting",
    "affect_indirect_lighting_while_hidden",
    "visible_in_ray_tracing",
    "evaluate_world_position_offset",
    "world_position_offset_disable_distance",
    "shadow_cache_invalidation_behavior",
    "bounds_scale",
    "forced_lod_model",
    "min_lod",
    "min_draw_distance",
    "cached_max_draw_distance",
    "allow_cull_distance_volume",
    "lighting_channels",
)

SCALABILITY_CVARS = (
    "sg.ResolutionQuality",
    "sg.ViewDistanceQuality",
    "sg.AntiAliasingQuality",
    "sg.ShadowQuality",
    "sg.GlobalIlluminationQuality",
    "sg.ReflectionQuality",
    "sg.PostProcessQuality",
    "sg.TextureQuality",
    "sg.EffectsQuality",
    "sg.FoliageQuality",
    "sg.ShadingQuality",
)


def console_variable_value(name):
    for getter_name in (
        "get_console_variable_int_value",
        "get_console_variable_float_value",
        "get_console_variable_bool_value",
    ):
        getter = getattr(unreal.SystemLibrary, getter_name, None)
        if not getter:
            continue
        try:
            return json_value(getter(name))
        except Exception:
            pass
    return None


def project_settings_json():
    cvars = {
        name: console_variable_value(name)
        for name in PROJECT_RENDER_CVARS
    }
    scalability = {
        name: console_variable_value(name)
        for name in SCALABILITY_CVARS
    }
    near_clip_plane = None
    try:
        near_clip_plane = editor_property(
            unreal.get_default_object(unreal.Engine),
            "near_clip_plane",
        )
    except Exception:
        pass
    if near_clip_plane is None:
        config_path = os.path.join(
            unreal.Paths.project_config_dir(),
            "DefaultEngine.ini",
        )
        try:
            with open(config_path, "r", encoding="utf-8") as config_handle:
                match = re.search(
                    r"^NearClipPlane\s*=\s*([0-9.+-]+)\s*$",
                    config_handle.read(),
                    re.MULTILINE,
                )
            if match:
                near_clip_plane = float(match.group(1))
        except Exception:
            pass
    return {
        "cvars": cvars,
        "nearClipPlane": json_value(near_clip_plane),
        "scalability": scalability,
    }


def actor_folder(actor):
    getter = getattr(actor, "get_folder_path", None)
    if not getter:
        return None
    try:
        return safe_text(getter())
    except Exception:
        return None


def scene_setup_json(actors, world):
    landscapes = []
    rvt_volumes = []
    for actor in actors:
        class_name = safe_text(actor.get_class().get_name())
        if class_name in ("Landscape", "LandscapeStreamingProxy"):
            landscapes.append({
                "actor": safe_text(actor.get_actor_label()),
                "class": class_name,
                "folder": actor_folder(actor),
                "properties": property_snapshot(actor, (
                    "landscape_material",
                    "landscape_hole_material",
                    "runtime_virtual_textures",
                    "virtual_texture_lod_bias",
                    "virtual_texture_num_lods",
                    "virtual_texture_render_pass_type",
                )),
            })
        if class_name == "RuntimeVirtualTextureVolume":
            components = []
            component_class = getattr(unreal, "RuntimeVirtualTextureComponent", None)
            if component_class:
                try:
                    components = actor.get_components_by_class(component_class)
                except Exception:
                    components = []
            bounds_components = []
            bounds_class = getattr(unreal, "BoundsCopyComponent", None)
            if bounds_class:
                try:
                    bounds_components = actor.get_components_by_class(bounds_class)
                except Exception:
                    bounds_components = []
            rvt_volumes.append({
                "actor": safe_text(actor.get_actor_label()),
                "folder": actor_folder(actor),
                "runtimeVirtualTextures": [
                    object_path(editor_property(component, "virtual_texture"))
                    for component in components
                ],
                "boundsSourceActors": [
                    object_path(editor_property(component, "bounds_source_actor"))
                    for component in bounds_components
                ],
                "transform": transform_json(actor.get_actor_transform()),
            })
    world_settings = None
    try:
        settings = world.get_world_settings()
        world_settings = property_snapshot(settings, ("default_game_mode",))
    except Exception:
        pass
    return {
        "landscapes": landscapes,
        "runtimeVirtualTextureVolumes": rvt_volumes,
        "worldSettings": world_settings,
    }


def render_state_json(actors):
    components = []
    for actor in actors:
        for class_name, properties in COMPONENT_SPECS:
            component_class = getattr(unreal, class_name, None)
            if not component_class:
                continue
            try:
                matches = actor.get_components_by_class(component_class)
            except Exception:
                matches = []
            for component in matches:
                transform = component_world_transform(component)
                record = {
                    "actor": safe_text(actor.get_actor_label()),
                    "actorClass": safe_text(actor.get_class().get_name()),
                    "component": safe_text(component.get_name()),
                    "componentClass": class_name,
                    "properties": property_snapshot(component, properties),
                    "transform": transform_json(transform) if transform else None,
                }
                if class_name == "DirectionalLightComponent":
                    get_forward_vector = getattr(component, "get_forward_vector", None)
                    if get_forward_vector:
                        try:
                            record["direction"] = xyz(get_forward_vector())
                        except Exception:
                            pass
                if class_name in ("PostProcessComponent", "CineCameraComponent"):
                    settings = editor_property(component, "settings") or editor_property(
                        component,
                        "post_process_settings",
                    )
                    if settings:
                        record["postProcessSettings"] = property_snapshot(
                            settings,
                            POST_PROCESS_PROPERTIES,
                        )
                components.append(record)
    return {"components": components}


def component_world_transform(component):
    for name in ("get_world_transform", "get_component_transform"):
        fn = getattr(component, name, None)
        if fn:
            try:
                return fn()
            except Exception:
                pass
    return None


def instance_world_transform(component, index):
    fn = getattr(component, "get_instance_transform", None)
    if not fn:
        return None
    try:
        value = fn(index, True)
    except TypeError:
        value = fn(index, world_space=True)
    except Exception:
        return None
    if isinstance(value, tuple):
        if len(value) >= 2 and isinstance(value[0], bool):
            return value[1] if value[0] else None
        return value[-1] if value else None
    return value


def component_materials(component, mesh):
    result = []
    try:
        count = int(component.get_num_materials())
    except Exception:
        count = 0
    for index in range(count):
        material = None
        try:
            material = component.get_material(index)
        except Exception:
            pass
        if not material and mesh:
            try:
                material = mesh.get_material(index)
            except Exception:
                pass
        result.append(object_path(material))
    return result


def actor_record(actor):
    record = {
        "name": safe_text(actor.get_name()),
        "label": safe_text(actor.get_actor_label()),
        "class": safe_text(actor.get_class().get_name()),
        "path": object_path(actor),
        "transform": transform_json(actor.get_actor_transform()),
        "staticMeshes": [],
    }
    try:
        components = actor.get_components_by_class(unreal.StaticMeshComponent)
    except Exception:
        components = []
    for component in components:
        mesh = editor_property(component, "static_mesh")
        if not mesh:
            continue
        component_transform = component_world_transform(component)
        component_record = {
            "name": safe_text(component.get_name()),
            "class": safe_text(component.get_class().get_name()),
            "mesh": object_path(mesh),
            "materials": component_materials(component, mesh),
            "transform": transform_json(component_transform) if component_transform else None,
            "instances": [],
            "visible": bool(editor_property(component, "visible", True)),
            "hiddenInGame": bool(editor_property(component, "hidden_in_game", False)),
            "renderProperties": property_snapshot(
                component,
                STATIC_MESH_RENDER_PROPERTIES,
            ),
        }
        count_fn = getattr(component, "get_instance_count", None) or getattr(
            component,
            "get_num_instances",
            None,
        )
        instance_count = 0
        if count_fn:
            try:
                instance_count = int(count_fn())
            except Exception:
                pass
        for instance_index in range(instance_count):
            instance_transform = instance_world_transform(component, instance_index)
            if instance_transform:
                component_record["instances"].append(transform_json(instance_transform))
        record["staticMeshes"].append(component_record)
    return record


loaded = False
try:
    loaded = bool(unreal.EditorLoadingAndSavingUtils.load_map(MAP_PATH))
except Exception:
    pass
if not loaded:
    try:
        loaded = bool(unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level(MAP_PATH))
    except Exception as error:
        raise RuntimeError("Unable to load {}: {}".format(MAP_PATH, error))

world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()

try:
    actors = list(unreal.EditorLevelLibrary.get_all_level_actors())
except Exception:
    actors = list(unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Actor))

records = [actor_record(actor) for actor in actors]
mesh_components = sum(len(actor["staticMeshes"]) for actor in records)
instances = sum(
    len(component["instances"])
    for actor in records
    for component in actor["staticMeshes"]
)
unique_meshes = sorted({
    component["mesh"]
    for actor in records
    for component in actor["staticMeshes"]
    if component["mesh"]
})
class_counts = {}
for actor in records:
    class_counts[actor["class"]] = class_counts.get(actor["class"], 0) + 1

manifest = {
    "schema": "toonlab.sostylized-demo-scene",
    "version": 1,
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "sourceMap": MAP_PATH,
    "counts": {
        "actors": len(records),
        "meshComponents": mesh_components,
        "instances": instances,
        "uniqueMeshes": len(unique_meshes),
    },
    "actorClassCounts": class_counts,
    "uniqueMeshes": unique_meshes,
    "projectSettings": project_settings_json(),
    "renderState": render_state_json(actors),
    "sceneSetup": scene_setup_json(actors, world),
    "actors": records,
}

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
with open(OUTPUT_PATH, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2, ensure_ascii=False)
    handle.write("\n")

if GLTF_OUTPUT_PATH:
    gltf_output = os.path.abspath(GLTF_OUTPUT_PATH)
    os.makedirs(os.path.dirname(gltf_output), exist_ok=True)
    options = unreal.GLTFExportOptions()
    options.reset_to_default()
    options.set_editor_property("default_level_of_detail", 0)
    options.set_editor_property("export_source_model", False)
    options.set_editor_property("export_vertex_colors", True)
    options.set_editor_property("bake_material_inputs", unreal.GLTFMaterialBakeMode.DISABLED)
    options.set_editor_property("texture_image_format", unreal.GLTFTextureImageFormat.NONE)
    result = unreal.GLTFExporter.export_to_gltf(world, gltf_output, options, set())
    if isinstance(result, tuple):
        result = result[0]
    if not result:
        raise RuntimeError("Unable to export demo GLB {}".format(gltf_output))

if AUTHORED_GLTF_OUTPUT_PATH:
    authored_gltf_output = os.path.abspath(AUTHORED_GLTF_OUTPUT_PATH)
    os.makedirs(os.path.dirname(authored_gltf_output), exist_ok=True)
    options = unreal.GLTFExportOptions()
    options.reset_to_default()
    options.set_editor_property("default_level_of_detail", 0)
    options.set_editor_property("export_source_model", False)
    options.set_editor_property("export_vertex_colors", True)
    options.set_editor_property(
        "default_material_bake_size",
        unreal.GLTFMaterialBakeSize(
            x=MATERIAL_BAKE_SIZE,
            y=MATERIAL_BAKE_SIZE,
            auto_detect=False,
        ),
    )
    result = unreal.GLTFExporter.export_to_gltf(
        world,
        authored_gltf_output,
        options,
        set(),
    )
    if isinstance(result, tuple):
        result = result[0]
    if not result:
        raise RuntimeError(
            "Unable to export authored demo GLB {}".format(authored_gltf_output)
        )

unreal.log("TOONLAB_DEMO_SCENE {}".format(json.dumps(manifest["counts"])))
