"""Export the exact SnowPines Landscape surface used by P14.

The Demonstration_SnowPines glTF is useful for scene inventory, but its
Landscape proxy does not retain the native Landscape heightfield accurately
enough for a camera-parity checkpoint.  Sample the real UE Landscape collision
surface instead.  The resulting local grid is expressed directly in ToonLab's
parity frame:

    UE X = anchor X - local Z
    UE Y = anchor Y + local X
    local Y = UE height - height at the anchor

Only Landscape actors participate in the trace, so unrelated demo meshes
cannot contaminate the exported receiver.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import unreal


SOURCE_MAP = "/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines"
ANCHOR_XY_CM = (19876.090883374, -18119.57621749962)
HALF_EXTENT_METERS = 32
STEP_METERS = 0.5
DEFAULT_OUTPUT = (
    Path(unreal.Paths.project_dir()).resolve().parent
    / "toonlab"
    / "assets-local"
    / "sostylized"
    / "landscape-heightfields"
    / "SnowPines"
    / "p14-camera-render1-patch.json"
)


def _safe_text(value) -> str:
    try:
        return str(value)
    except Exception:
        return ""


def _trace_landscape(world, x_cm: float, y_cm: float, ignored_actors):
    result = unreal.SystemLibrary.line_trace_single(
        world,
        unreal.Vector(x_cm, y_cm, 100000.0),
        unreal.Vector(x_cm, y_cm, -100000.0),
        unreal.TraceTypeQuery.ECC_VISIBILITY,
        True,
        ignored_actors,
        unreal.DrawDebugTrace.NONE,
        True,
    )
    values = result.to_dict() if result is not None else {}
    if not bool(values.get("blocking_hit", False)):
        raise RuntimeError(
            "No retained Landscape hit at ({:.3f}, {:.3f}) cm".format(x_cm, y_cm)
        )
    location = values["location"]
    normal = values["normal"]
    return (
        float(location.z),
        [float(normal.y), float(normal.z), -float(normal.x)],
    )


def main() -> None:
    output_path = Path(
        os.environ.get("TOONLAB_P14_LANDSCAPE_OUTPUT", str(DEFAULT_OUTPUT))
    ).resolve()
    loaded = bool(unreal.EditorLoadingAndSavingUtils.load_map(SOURCE_MAP))
    if not loaded:
        loaded = bool(
            unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level(
                SOURCE_MAP
            )
        )
    if not loaded:
        raise RuntimeError("Unable to load {}".format(SOURCE_MAP))

    world = unreal.get_editor_subsystem(
        unreal.UnrealEditorSubsystem
    ).get_editor_world()
    actors = list(
        unreal.get_editor_subsystem(
            unreal.EditorActorSubsystem
        ).get_all_level_actors()
    )
    landscapes = [
        actor
        for actor in actors
        if _safe_text(actor.get_class().get_name())
        in ("Landscape", "LandscapeStreamingProxy")
    ]
    if len(landscapes) != 1:
        raise RuntimeError(
            "Expected one retained Landscape, found {}".format(len(landscapes))
        )
    ignored = [actor for actor in actors if actor not in landscapes]

    anchor_height_cm, _ = _trace_landscape(
        world,
        ANCHOR_XY_CM[0],
        ANCHOR_XY_CM[1],
        ignored,
    )
    sample_count = int((HALF_EXTENT_METERS * 2) / STEP_METERS) + 1
    heights_m = []
    normals = []
    for z_index in range(sample_count):
        local_z_m = -HALF_EXTENT_METERS + z_index * STEP_METERS
        ue_x_cm = ANCHOR_XY_CM[0] - local_z_m * 100.0
        for x_index in range(sample_count):
            local_x_m = -HALF_EXTENT_METERS + x_index * STEP_METERS
            ue_y_cm = ANCHOR_XY_CM[1] + local_x_m * 100.0
            height_cm, normal = _trace_landscape(
                world,
                ue_x_cm,
                ue_y_cm,
                ignored,
            )
            heights_m.append((height_cm - anchor_height_cm) / 100.0)
            normals.extend(normal)

    payload = {
        "schema": "toonlab.landscape-height-grid",
        "version": 1,
        "sourceMap": SOURCE_MAP,
        "sourceActor": _safe_text(landscapes[0].get_actor_label()),
        "anchorUeWorldCentimetersXY": list(ANCHOR_XY_CM),
        "anchorHeightCentimeters": anchor_height_cm,
        "coordinateAdapter": {
            "ueX": "anchorX - localZ * 100",
            "ueY": "anchorY + localX * 100",
            "localY": "(ueHeight - anchorHeight) / 100",
        },
        "halfExtentMeters": HALF_EXTENT_METERS,
        "stepMeters": STEP_METERS,
        "sampleCount": sample_count,
        "vertexOrder": "z-major, then x",
        "normalOrder": "Three XYZ, z-major then x",
        "heightsMeters": heights_m,
        "normals": normals,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
    os.replace(temporary, output_path)
    unreal.log(
        "TOONLAB_P14_LANDSCAPE_HEIGHT_GRID_COMPLETE {}".format(output_path)
    )


if __name__ == "__main__":
    main()
