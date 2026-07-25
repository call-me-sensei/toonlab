"""Capture the authored So Stylized demo through Unreal's editor viewport.

The pack's lighting relies on the normal editor render loop (notably its
captured-scene skylight and runtime virtual textures).  A SceneCapture2D can
produce a materially different result, so this script uses Unreal's own high
resolution viewport screenshot task while piloting each authored CineCamera.
"""

import gc
import os
import re
import sys

import unreal


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from so_stylized_reference_compatibility import (
    REFERENCE_MAP,
    SOURCE_MAP,
    apply_transient_snowpines_compatibility,
)


MAP_PATH = os.environ.get(
    "TOONLAB_DEMO_MAP",
    REFERENCE_MAP,
)
OUTPUT_ROOT = os.path.abspath(os.environ.get(
    "TOONLAB_DEMO_CAPTURE_OUTPUT",
    os.path.join(
        unreal.Paths.project_dir(),
        "..",
        "toonlab",
        "assets-local",
        "sostylized",
        "demo-scenes",
        "native-reference",
    ),
))
WIDTH = max(320, min(7680, int(os.environ.get("TOONLAB_DEMO_CAPTURE_WIDTH", "1920"))))
HEIGHT = max(180, min(4320, int(os.environ.get("TOONLAB_DEMO_CAPTURE_HEIGHT", "1080"))))
CAMERA_INDEX = int(os.environ.get("TOONLAB_DEMO_CAPTURE_CAMERA", "1"))
CAPTURE_ALL = os.environ.get("TOONLAB_DEMO_CAPTURE_ALL", "0").lower() in (
    "1",
    "true",
    "yes",
    "on",
)
APPLY_SNOWPINES_COMPATIBILITY = os.environ.get(
    "TOONLAB_DEMO_APPLY_SNOWPINES_COMPATIBILITY",
    "1",
).lower() in ("1", "true", "yes", "on")
WARMUP_FRAMES = max(
    2,
    min(600, int(os.environ.get("TOONLAB_DEMO_CAPTURE_WARMUP_FRAMES", "180"))),
)
SCREENSHOT_DELAY_SECONDS = max(
    0.0,
    min(10.0, float(os.environ.get("TOONLAB_DEMO_CAPTURE_DELAY", "1.0"))),
)
SKYLIGHT_MULTIPLIER = max(
    0.0,
    min(8.0, float(os.environ.get("TOONLAB_DEMO_SKYLIGHT_MULTIPLIER", "1.0"))),
)
SUNLIGHT_MULTIPLIER = max(
    0.0,
    min(8.0, float(os.environ.get("TOONLAB_DEMO_SUNLIGHT_MULTIPLIER", "1.0"))),
)
VIEW_MODE = os.environ.get("TOONLAB_DEMO_VIEW_MODE", "lit").strip().lower()
if VIEW_MODE not in ("lit", "lightingonly", "unlit"):
    raise RuntimeError("Unsupported reference view mode: {}".format(VIEW_MODE))
SHADOW_MODE = os.environ.get("TOONLAB_DEMO_SHADOW_MODE", "source").strip().lower()
if SHADOW_MODE not in ("source", "hard", "off"):
    raise RuntimeError("Unsupported reference shadow mode: {}".format(SHADOW_MODE))
FOG_DENSITY_MULTIPLIER = max(
    0.0,
    min(8.0, float(os.environ.get("TOONLAB_DEMO_FOG_DENSITY_MULTIPLIER", "1.0"))),
)
EXPOSURE_COMPENSATION_ADD = max(
    -8.0,
    min(8.0, float(os.environ.get("TOONLAB_DEMO_EXPOSURE_ADD", "0.0"))),
)
RECAPTURE_SKYLIGHT = os.environ.get(
    "TOONLAB_DEMO_RECAPTURE_SKYLIGHT",
    "0",
).lower() in ("1", "true", "yes", "on")
SKY_LAYER_MODE = os.environ.get(
    "TOONLAB_DEMO_SKY_LAYER_MODE",
    "both",
).strip().lower()
if SKY_LAYER_MODE not in ("both", "background", "shell"):
    raise RuntimeError("Unsupported sky layer mode: {}".format(SKY_LAYER_MODE))
P19_FAMILY_ISOLATION = os.environ.get(
    "TOONLAB_DEMO_P19_FAMILY_ISOLATION",
    "0",
).lower() in ("1", "true", "yes", "on")


def natural_key(value):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]


world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
expected_map_name = MAP_PATH.rsplit("/", 1)[-1]
if str(world.get_name()) != expected_map_name:
    raise RuntimeError(
        "Capture launcher must open {} directly; current world is {}".format(
            MAP_PATH,
            world.get_name(),
        )
    )

# Editor scalability is stored in a machine-wide user file, so a developer's
# local preference must not be allowed to change the reference capture. The
# pack documentation asks for Epic quality; lock every group and native
# resolution before any RVT or temporal warm-up frames are rendered.
EPIC_SCALABILITY = {
    "sg.ResolutionQuality": 100,
    "sg.ViewDistanceQuality": 3,
    "sg.AntiAliasingQuality": 3,
    "sg.ShadowQuality": 3,
    "sg.GlobalIlluminationQuality": 3,
    "sg.ReflectionQuality": 3,
    "sg.PostProcessQuality": 3,
    "sg.TextureQuality": 3,
    "sg.EffectsQuality": 3,
    "sg.FoliageQuality": 3,
    "sg.ShadingQuality": 3,
    "sg.LandscapeQuality": 3,
}
for scalability_name, scalability_value in EPIC_SCALABILITY.items():
    unreal.SystemLibrary.execute_console_command(
        world,
        "{} {}".format(scalability_name, scalability_value),
    )

# Epic scalability sets the desktop texture pool to 1 GiB.  That is sensible
# for gameplay, but it can silently reduce mips in a deterministic art
# reference.  The capture process is short-lived and runs on a 36 GiB machine,
# so keep every used texture fully resident and pin an SDR sRGB output path.
REFERENCE_CVARS = {
    "r.ScreenPercentage": 100,
    "r.Streaming.Boost": 1,
    "r.Streaming.DropMips": 0,
    "r.Streaming.FullyLoadUsedTextures": 1,
    "r.Streaming.MipBias": 0,
    "r.Streaming.PoolSize": 8192,
    "r.HDR.EnableHDROutput": 0,
    "r.HDR.Display.ColorGamut": 0,
    "r.HDR.Display.OutputDevice": 0,
    "r.TonemapperGamma": 0,
}
for cvar_name, cvar_value in REFERENCE_CVARS.items():
    unreal.SystemLibrary.execute_console_command(
        world,
        "{} {}".format(cvar_name, cvar_value),
    )

try:
    actors = list(
        unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
    )
except Exception:
    actors = list(unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Actor))

# Callers may deliberately request the licensed source map.  Reconstruct the
# SnowPines colour-map correction with transient MIDs in that case so no
# supplied asset or shared material is dirtied.  The normal path uses the
# persistent project-owned reference map prepared by the companion utility.
compatibility_instances = []
compatibility_report = {"components": 0, "slots": 0}
if MAP_PATH == SOURCE_MAP and APPLY_SNOWPINES_COMPATIBILITY:
    compatibility_instances, compatibility_report = (
        apply_transient_snowpines_compatibility(actors)
    )

# Optional read-only layer isolation for the generated single-rock Visual
# Target.  This changes transient component state only; it never saves the map
# or supplied material instances.  The captures let the browser port verify
# each authored layer against UE instead of inferring UV orientation from a
# composite frame.
sky_layer_instances = []
if SKY_LAYER_MODE != "both":
    sky_dome = None
    sky_clouds = None
    for actor in actors:
        for component in actor.get_components_by_class(unreal.StaticMeshComponent):
            component_name = str(component.get_name())
            if component_name == "SkyDome":
                sky_dome = component
            elif component_name == "SkyDomeClouds":
                sky_clouds = component
    if sky_dome is None or sky_clouds is None:
        raise RuntimeError(
            "Sky layer isolation requires SkyDome and SkyDomeClouds components"
        )
    if SKY_LAYER_MODE == "background":
        sky_clouds.set_visibility(False, True)
        sky_clouds.set_hidden_in_game(True)
    else:
        source_material = sky_dome.get_material(0)
        sky_mid = sky_dome.create_dynamic_material_instance(
            0,
            source_material,
            "ToonLab_ShellOnly_Sky",
        )
        if sky_mid is None:
            raise RuntimeError("Could not create transient shell-only sky MID")
        sky_mid.set_scalar_parameter_value("BackgroundClouds?", 0.0)
        sky_layer_instances.append(sky_mid)

# Optional A/B controls are deliberately transient.  They let the native
# calibration harness isolate lighting and post-process differences without
# dirtying either the supplied map or the project-owned reference level.
for actor in actors:
    for directional_light_component in actor.get_components_by_class(
        unreal.DirectionalLightComponent
    ):
        if SHADOW_MODE != "source":
            directional_light_component.set_cast_shadows(SHADOW_MODE == "hard")
        if SUNLIGHT_MULTIPLIER != 1.0:
            directional_light_component.set_intensity(
                float(directional_light_component.get_editor_property("intensity"))
                * SUNLIGHT_MULTIPLIER
            )
    for sky_light_component in actor.get_components_by_class(unreal.SkyLightComponent):
        if SKYLIGHT_MULTIPLIER != 1.0:
            sky_light_component.set_intensity(
                float(sky_light_component.get_editor_property("intensity"))
                * SKYLIGHT_MULTIPLIER
            )
    for fog_component in actor.get_components_by_class(unreal.ExponentialHeightFogComponent):
        if FOG_DENSITY_MULTIPLIER != 1.0:
            fog_component.set_editor_property(
                "fog_density",
                float(fog_component.get_editor_property("fog_density"))
                * FOG_DENSITY_MULTIPLIER,
            )
    for post_component in actor.get_components_by_class(unreal.PostProcessComponent):
        if EXPOSURE_COMPENSATION_ADD == 0.0:
            continue
        settings = post_component.get_editor_property("settings")
        if not bool(settings.get_editor_property("override_auto_exposure_min_brightness")):
            continue
        settings.set_editor_property("override_auto_exposure_bias", True)
        settings.set_editor_property(
            "auto_exposure_bias",
            float(settings.get_editor_property("auto_exposure_bias"))
            + EXPOSURE_COMPENSATION_ADD,
        )
        post_component.set_editor_property("settings", settings)

unreal.SystemLibrary.execute_console_command(world, "viewmode {}".format(VIEW_MODE))

cameras = sorted(
    [actor for actor in actors if isinstance(actor, unreal.CineCameraActor)],
    key=lambda actor: natural_key(str(actor.get_actor_label())),
)
if not cameras:
    raise RuntimeError("{} contains no CineCameraActor".format(MAP_PATH))
if CAPTURE_ALL:
    selected = cameras
else:
    index = max(0, min(len(cameras) - 1, CAMERA_INDEX - 1))
    selected = [cameras[index]]

os.makedirs(OUTPUT_ROOT, exist_ok=True)
unreal.AutomationLibrary.finish_loading_before_screenshot()

# The authored sky uses a stored captured-scene skylight with realtime capture
# disabled. Preserve it unless the launcher explicitly requests a recapture.
recaptured_skylights = 0
scene_actor = None
sky_lights = []
sky_light = None
recapture = None
for scene_actor in actors:
    try:
        sky_lights = scene_actor.get_components_by_class(unreal.SkyLightComponent)
    except Exception:
        sky_lights = []
    for sky_light in sky_lights:
        recapture = getattr(sky_light, "recapture_sky", None)
        if recapture and RECAPTURE_SKYLIGHT:
            recapture()
            recaptured_skylights += 1

unreal.log(
    "TOONLAB_NATIVE_REFERENCE prepared {} camera(s), {} skylight recapture(s), "
    "{} compatibility slot(s), Epic/max texture quality, SDR sRGB, "
    "sun x{:.3g}, sky x{:.3g}, fog x{:.3g}, exposure {:+.3g} EV, {} view, {} shadows, {} sky layers".format(
        len(selected),
        recaptured_skylights,
        compatibility_report["slots"],
        SUNLIGHT_MULTIPLIER,
        SKYLIGHT_MULTIPLIER,
        FOG_DENSITY_MULTIPLIER,
        EXPOSURE_COMPENSATION_ADD,
        VIEW_MODE,
        SHADOW_MODE,
        SKY_LAYER_MODE,
    )
)

# -ExecutePythonScript normally closes the editor on the following frame. Keep
# it alive until the asynchronous viewport screenshot task reports completion.
unreal.EditorPythonScripting.set_keep_python_script_alive(True)

state = {
    "frame": 0,
    "camera_index": 0,
    "visibility_camera_index": -1,
    "task": None,
    "task_started_frame": 0,
    "callback": None,
}


def set_actor_editor_visibility(actor, visible):
    """Set transient capture visibility without dirtying the generated map."""
    hidden = not visible
    try:
        actor.set_is_temporarily_hidden_in_editor(hidden)
    except Exception:
        try:
            actor.set_editor_property("is_temporarily_hidden_in_editor", hidden)
        except Exception:
            pass
    try:
        actor.set_actor_hidden_in_game(hidden)
    except Exception:
        pass


def apply_p19_family_isolation(camera):
    if not P19_FAMILY_ISOLATION:
        return
    label = str(camera.get_actor_label())
    detail_family = None
    if label in ("CameraRender3", "CameraRender4"):
        detail_family = "mountain"
    elif label == "CameraRender5":
        detail_family = "cliff"

    for actor in actors:
        actor_label = str(actor.get_actor_label())
        actor_class = str(actor.get_class().get_name())
        if detail_family is None:
            # P19's native mountain is several kilometers wide. Leaving the
            # P19 fixtures enabled here lets their cast shadows mutate the
            # already-accepted P13-P17 front/back baseline. The dedicated
            # CameraRender3-5 views below remain the P19 family authority.
            visible = not (
                actor_label.startswith("P19_Mountain_")
                or actor_label.startswith("P19_Cliff_")
            )
        else:
            visible = (
                isinstance(actor, unreal.CineCameraActor)
                or actor_class == "BP_StylizedSky_Lite_C"
                or actor_class == "RuntimeVirtualTextureVolume"
                or (
                    detail_family == "mountain"
                    and actor_label.startswith("P19_Mountain_")
                )
                or (
                    detail_family == "cliff"
                    and actor_label.startswith("P19_Cliff_")
                )
            )
        set_actor_editor_visibility(actor, visible)
    unreal.log(
        "TOONLAB_P19_VISIBILITY {} {}".format(
            label,
            detail_family or "integrated",
        )
    )


def finish_capture():
    global actors, cameras, selected, world, compatibility_instances
    global scene_actor, sky_lights, sky_light, recapture, sky_layer_instances
    callback = state.get("callback")
    if callback is not None:
        unreal.unregister_slate_post_tick_callback(callback)
        state["callback"] = None
    # Release Unreal Python wrappers before the editor begins tearing down its
    # UObject world. UE 5.8's macOS Python finalizer can otherwise encounter a
    # stale weak reference after a multi-camera asynchronous screenshot run.
    state["task"] = None
    actors = []
    cameras = []
    selected = []
    compatibility_instances = []
    sky_layer_instances = []
    world = None
    scene_actor = None
    sky_lights = []
    sky_light = None
    recapture = None
    callback = None
    gc.collect()
    unreal.EditorPythonScripting.set_keep_python_script_alive(False)


def tick_capture(_delta_seconds):
    state["frame"] += 1

    if state["frame"] > 7200:
        unreal.log_error("TOONLAB_NATIVE_REFERENCE timed out")
        finish_capture()
        return

    task = state["task"]
    if task is not None:
        if not task.is_task_done():
            return

        camera = selected[state["camera_index"]]
        label = str(camera.get_actor_label())
        file_name = "{}.png".format(re.sub(r"[^A-Za-z0-9_-]", "-", label))
        output_path = os.path.join(OUTPUT_ROOT, file_name)
        if not os.path.isfile(output_path):
            unreal.log_error(
                "TOONLAB_NATIVE_REFERENCE task completed without {}".format(output_path)
            )
            finish_capture()
            return

        unreal.log("TOONLAB_NATIVE_REFERENCE {}".format(output_path))
        state["camera_index"] += 1
        state["task"] = None
        state["frame"] = 0
        if state["camera_index"] >= len(selected):
            # Do not leave UObject Python wrappers alive in this callback frame
            # while the editor begins its embedded-Python shutdown.
            task = None
            camera = None
            finish_capture()
        return

    if state["visibility_camera_index"] != state["camera_index"]:
        apply_p19_family_isolation(selected[state["camera_index"]])
        state["visibility_camera_index"] = state["camera_index"]
        state["frame"] = 0
        return

    # Let the authored skylight, RVT pages, shaders, and temporal history settle
    # before every authored camera capture.
    if state["frame"] < WARMUP_FRAMES:
        return

    camera = selected[state["camera_index"]]
    label = str(camera.get_actor_label())
    file_name = "{}.png".format(re.sub(r"[^A-Za-z0-9_-]", "-", label))
    output_path = os.path.join(OUTPUT_ROOT, file_name)
    state["task"] = unreal.AutomationLibrary.take_high_res_screenshot(
        WIDTH,
        HEIGHT,
        output_path,
        camera,
        False,
        False,
        unreal.ComparisonTolerance.LOW,
        "So Stylized authored renderer reference",
        SCREENSHOT_DELAY_SECONDS,
        True,
    )
    state["task_started_frame"] = state["frame"]
    if not state["task"].is_valid_task():
        unreal.log_error("TOONLAB_NATIVE_REFERENCE could not start viewport screenshot")
        finish_capture()


state["callback"] = unreal.register_slate_post_tick_callback(tick_capture)
