"""Export UE's captured SkyLight irradiance SH through the editor-only bridge.

USkyLightComponent exposes these coefficients publicly in C++, but they are
not reflected into Unreal Python.  The project-local ToonLabSourceExport
plugin writes the exact renderer values without recapturing or modifying the
licensed source level.
"""

import gc
import os

import unreal


MAP_PATH = os.environ.get(
    "TOONLAB_DEMO_MAP",
    "/Game/ToonLab/Reference/SoStylized/SnowPines/"
    "Demonstration_SnowPines_UE52Reference",
)
OUTPUT_PATH = os.path.abspath(os.environ.get(
    "TOONLAB_SKYLIGHT_IRRADIANCE_OUTPUT",
    os.path.join(
        unreal.Paths.project_dir(),
        "..",
        "toonlab",
        "assets-local",
        "sostylized",
        "demo-scenes",
        "native-reference",
        "sky-light-irradiance.json",
    ),
))


world = unreal.get_editor_subsystem(
    unreal.UnrealEditorSubsystem
).get_editor_world()
expected_map_name = MAP_PATH.rsplit("/", 1)[-1]
if str(world.get_name()) != expected_map_name:
    raise RuntimeError(
        "Exporter must open {} directly; current world is {}".format(
            MAP_PATH,
            world.get_name(),
        )
    )
try:
    actors = list(
        unreal.get_editor_subsystem(
            unreal.EditorActorSubsystem
        ).get_all_level_actors()
    )
except Exception:
    actors = list(unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Actor))

sky_lights = []
for actor in actors:
    try:
        sky_lights.extend(actor.get_components_by_class(unreal.SkyLightComponent))
    except Exception:
        pass

if len(sky_lights) != 1:
    raise RuntimeError(
        "Expected exactly one SkyLightComponent in {}, found {}".format(
            MAP_PATH,
            len(sky_lights),
        )
    )

# A captured-scene SkyLight is populated asynchronously after the world begins
# rendering. Match the native-reference viewport path: explicitly queue one
# recapture, warm the actual editor renderer, and read only after the render
# thread has published non-zero coefficients back to the component.
unreal.AutomationLibrary.finish_loading_before_screenshot()
sky_lights[0].recapture_sky()
unreal.EditorPythonScripting.set_keep_python_script_alive(True)

state = {
    "callback": None,
    "frame": 0,
}


def finish_export(success):
    global actors, sky_lights, world
    callback = state.get("callback")
    if callback is not None:
        unreal.unregister_slate_post_tick_callback(callback)
        state["callback"] = None
    actors = []
    sky_lights = []
    world = None
    callback = None
    gc.collect()
    unreal.EditorPythonScripting.set_keep_python_script_alive(False)
    if not success:
        unreal.log_error(
            "TOONLAB_SKYLIGHT_IRRADIANCE timed out waiting for the capture"
        )


def tick_export(_delta_seconds):
    state["frame"] += 1
    if state["frame"] < 120:
        return
    # Retry while outstanding shader/texture work settles. The C++ bridge
    # refuses to write an all-zero capture, so a written file is authoritative.
    if state["frame"] % 15 == 0:
        exported = unreal.ToonLabSkyLightExportLibrary.export_sky_light_irradiance(
            sky_lights[0],
            OUTPUT_PATH,
        )
        if exported:
            unreal.log(
                "TOONLAB_SKYLIGHT_IRRADIANCE_EXACT {} {}".format(
                    MAP_PATH,
                    OUTPUT_PATH,
                )
            )
            finish_export(True)
            return
    if state["frame"] >= 1200:
        finish_export(False)


state["callback"] = unreal.register_slate_post_tick_callback(tick_export)
