"""Invoke the dedicated UE 5.8 C++ bridge for Landscape weight export.

The bridge is compiled as an external editor-only plugin by the Node wrapper,
so neither the supplied StylizedExploration project nor the licensed source
assets are modified.
"""

import os

import unreal


MAP_PATH = os.environ.get(
    "TOONLAB_LANDSCAPE_WEIGHT_MAP",
    "/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines",
)
OUTPUT_ROOT = os.path.abspath(os.environ["TOONLAB_LANDSCAPE_WEIGHT_SOURCE_OUTPUT"])


def safe_text(value):
    try:
        return str(value)
    except Exception:
        return ""


loaded = False
try:
    loaded = bool(unreal.EditorLoadingAndSavingUtils.load_map(MAP_PATH))
except Exception:
    pass
if not loaded:
    loaded = bool(
        unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level(MAP_PATH)
    )
if not loaded:
    raise RuntimeError("Unable to load {}".format(MAP_PATH))

world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
actors = list(actor_subsystem.get_all_level_actors())
landscapes = [
    actor for actor in actors
    if safe_text(actor.get_class().get_name()) in ("Landscape", "LandscapeStreamingProxy")
]
if len(landscapes) != 1:
    raise RuntimeError(
        "Expected one loaded Landscape proxy in {}, found {}".format(
            MAP_PATH, len(landscapes)
        )
    )

bridge = getattr(unreal, "ToonLabLandscapeWeightExporterLibrary", None)
if bridge is None:
    raise RuntimeError(
        "ToonLabLandscapeWeightExporter plugin did not load; the external -PLUGIN bridge is required"
    )

result = bridge.export_landscape_weight_layers(landscapes[0], OUTPUT_ROOT)
if not isinstance(result, tuple) or len(result) not in (2, 3):
    raise RuntimeError("Unexpected exporter bridge result: {}".format(result))
# Unreal Python omits a native bool return when a BlueprintCallable method also
# has output parameters; packaged UE 5.8 therefore returns just the two FString
# outputs. Keep the three-value branch for source/editor builds that expose it.
if len(result) == 2:
    layout_path, error = safe_text(result[0]), safe_text(result[1])
    success = bool(layout_path) and not error
else:
    success, layout_path, error = result[0], safe_text(result[1]), safe_text(result[2])
if not success:
    raise RuntimeError(error or "Landscape weight bridge failed")
if not layout_path or not os.path.isfile(layout_path):
    raise RuntimeError("Landscape weight bridge returned no layout file")

unreal.log("TOONLAB_LANDSCAPE_WEIGHT_DONE {}".format(layout_path))
