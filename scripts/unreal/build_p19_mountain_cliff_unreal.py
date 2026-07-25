"""Build the native UE P19 mountain/cliff comparison map.

P19 changes only the mountain/cliff family.  The source demo sky, Landscape,
RVT volumes, and the accepted P13-P17 rock/tree/grass/flower fixtures are
retained exactly as in the preceding minimal-environment checkpoint.  P18
imported props are intentionally absent.
"""

from __future__ import annotations

import copy
import json
import math
import os
from pathlib import Path
import sys
import traceback

import unreal


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import build_minimal_environment_parity as base


TARGET_MAP = "/Game/ToonLab/Parity/MinimalEnvironment/L_MinimalEnvironmentDemoP19"
DEFAULT_P19_CONTRACT = (
    Path(unreal.Paths.project_dir()).resolve().parent
    / "toonlab"
    / "assets-local"
    / "parity"
    / "environment"
    / "p19-mountain-cliff.json"
)


def _command(name: str, fallback: str) -> str:
    return base.diagnostic._command_line_value(name, fallback)


def _ensure_map() -> None:
    if unreal.EditorAssetLibrary.does_asset_exist(TARGET_MAP):
        # This is a generated parity map. Rebuild its retained source-demo
        # shell in place on subsequent captures instead of delete/duplicate:
        # UE can keep the deleted package path reserved until commandlet exit,
        # which makes an immediate duplicate fail nondeterministically.
        return
    if not unreal.EditorAssetLibrary.duplicate_asset(base.SOURCE_MAP, TARGET_MAP):
        raise RuntimeError("Could not duplicate the Visual Target source map for P19")


def _bounds_min_max(actor):
    origin, extent = actor.get_actor_bounds(False)
    minimum = unreal.Vector(
        float(origin.x) - float(extent.x),
        float(origin.y) - float(extent.y),
        float(origin.z) - float(extent.z),
    )
    maximum = unreal.Vector(
        float(origin.x) + float(extent.x),
        float(origin.y) + float(extent.y),
        float(origin.z) + float(extent.z),
    )
    return origin, extent, minimum, maximum


def _spawn_fixture(actor_subsystem, world, fixture: dict):
    mesh = unreal.EditorAssetLibrary.load_asset(fixture["unrealMesh"])
    material = unreal.EditorAssetLibrary.load_asset(fixture["sourceMaterial"])
    if not mesh or not material:
        raise RuntimeError(
            "Missing P19 native mesh/material for {}".format(
                fixture["sourceAssetName"]
            )
        )

    local = base.diagnostic._canonical_position_to_unreal(
        fixture["positionMeters"]
    )
    location = unreal.Vector(
        base.DEMO_PATCH_ANCHOR_XY[0] + float(local.x),
        base.DEMO_PATCH_ANCHOR_XY[1] + float(local.y),
        0.0,
    )
    actor = base.diagnostic._spawn_actor(
        actor_subsystem,
        unreal.StaticMeshActor,
        location,
        unreal.Rotator(
            pitch=0.0,
            yaw=float(fixture.get("rotationYDegrees", 0.0)),
            roll=0.0,
        ),
        "P19_{}_{}".format(
            "Mountain" if fixture["id"] == "mountain-control" else "Cliff",
            fixture["sourceAssetName"],
        ),
    )
    component = actor.static_mesh_component
    component.set_static_mesh(mesh)
    component.set_material(0, material)
    component.set_cast_shadow(bool(fixture.get("castShadow", True)))
    component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    component.set_forced_lod_model(1)
    try:
        component.set_editor_property("disallow_nanite", True)
    except Exception:
        pass

    # P19 records both sides of the source-unit boundary explicitly. Catalog
    # GLBs are metre-valued exports; the native StaticMesh is centimetre-valued.
    # The two renderers must nevertheless resolve the same dimensionless actor
    # scale before world-position and PixelDepth material logic is evaluated.
    native_scale = float(
        fixture.get("nativeUnrealScale", float(fixture["scale"]) * 100.0)
    )
    actor.set_actor_scale3d(
        unreal.Vector(native_scale, native_scale, native_scale)
    )

    probe = fixture.get("groundingProbeMeters", [
        fixture["positionMeters"][0],
        fixture["positionMeters"][2],
    ])
    probe_local = base.diagnostic._canonical_position_to_unreal(
        [float(probe[0]), 0.0, float(probe[1])]
    )
    probe_x = base.DEMO_PATCH_ANCHOR_XY[0] + float(probe_local.x)
    probe_y = base.DEMO_PATCH_ANCHOR_XY[1] + float(probe_local.y)
    surface_z = base._landscape_height(world, probe_x, probe_y, [actor])
    _, _, minimum, _ = _bounds_min_max(actor)
    burial = float(fixture.get("burialDepthMeters", 0.0)) * 100.0
    adjustment = surface_z - burial - float(minimum.z)
    grounded = actor.get_actor_location()
    actor.set_actor_location(
        unreal.Vector(grounded.x, grounded.y, grounded.z + adjustment),
        False,
        False,
    )
    origin, extent, minimum, maximum = _bounds_min_max(actor)
    return actor, {
        "id": fixture["id"],
        "label": str(actor.get_actor_label()),
        "mesh": fixture["unrealMesh"],
        "material": fixture["sourceMaterial"],
        "nativeScale": native_scale,
        "rotationYDegrees": float(fixture.get("rotationYDegrees", 0.0)),
        "groundProbeUnrealCentimeters": [probe_x, probe_y, surface_z],
        "burialDepthCentimeters": burial,
        "worldBoundsCenter": base.diagnostic._vector_record(origin),
        "worldBoundsExtent": base.diagnostic._vector_record(extent),
        "worldBoundsMin": base.diagnostic._vector_record(minimum),
        "worldBoundsMax": base.diagnostic._vector_record(maximum),
    }


def _vector_length(vector) -> float:
    return math.sqrt(
        float(vector.x) ** 2 + float(vector.y) ** 2 + float(vector.z) ** 2
    )


def _normal(vector):
    length = _vector_length(vector)
    if length <= 1e-6:
        raise RuntimeError("Cannot normalize a zero-length P19 camera vector")
    return unreal.Vector(
        float(vector.x) / length,
        float(vector.y) / length,
        float(vector.z) / length,
    )


def _dot(a, b) -> float:
    return float(a.x) * float(b.x) + float(a.y) * float(b.y) + float(a.z) * float(b.z)


def _cross(a, b):
    return unreal.Vector(
        float(a.y) * float(b.z) - float(a.z) * float(b.y),
        float(a.z) * float(b.x) - float(a.x) * float(b.z),
        float(a.x) * float(b.y) - float(a.y) * float(b.x),
    )


def _spawn_detail_camera(
    actor_subsystem,
    contract: dict,
    actor,
    label: str,
    view: str,
    crop_surface: bool = False,
):
    camera_contract = copy.deepcopy(contract)
    camera, focal_length, sensor_width, sensor_height = (
        base.source_builder._spawn_camera(actor_subsystem, camera_contract)
    )
    camera.set_actor_label(label)
    center, extent, _, _ = _bounds_min_max(actor)

    canonical_position = base.diagnostic._canonical_position_to_unreal(
        contract["camera"]["position"]
    )
    canonical_target = base.diagnostic._canonical_position_to_unreal(
        contract["camera"]["lookAt"]
    )
    view_direction = _normal(canonical_position - canonical_target)
    forward = unreal.Vector(
        -float(view_direction.x),
        -float(view_direction.y),
        -float(view_direction.z),
    )
    world_up = unreal.Vector(0.0, 0.0, 1.0)
    right = _normal(_cross(forward, world_up))
    view_up = _normal(_cross(right, forward))

    vertical_fov = math.radians(
        float(contract["camera"]["verticalFieldOfViewDegrees"])
    )
    aspect = float(contract["camera"].get("aspect", 16.0 / 9.0))
    tan_vertical = math.tan(vertical_fov * 0.5)
    tan_horizontal = tan_vertical * aspect
    radius = math.sqrt(
        float(extent.x) ** 2
        + float(extent.y) ** 2
        + float(extent.z) ** 2
    )
    if crop_surface:
        distance = radius * 1.08
    else:
        distance = 0.0
        for sx in (-1.0, 1.0):
            for sy in (-1.0, 1.0):
                for sz in (-1.0, 1.0):
                    offset = unreal.Vector(
                        sx * float(extent.x),
                        sy * float(extent.y),
                        sz * float(extent.z),
                    )
                    required = max(
                        _dot(offset, view_direction)
                        + abs(_dot(offset, right)) / tan_horizontal,
                        _dot(offset, view_direction)
                        + abs(_dot(offset, view_up)) / tan_vertical,
                    )
                    distance = max(distance, required)
        distance *= 1.08

    location = center + unreal.Vector(
        float(view_direction.x) * distance,
        float(view_direction.y) * distance,
        float(view_direction.z) * distance,
    )
    camera.set_actor_location(location, False, False)
    camera.set_actor_rotation(
        unreal.MathLibrary.find_look_at_rotation(location, center),
        False,
    )
    return {
        "label": label,
        "view": view,
        "positionUnrealCentimeters": base.diagnostic._vector_record(location),
        "rotationPitchYawRoll": base.diagnostic._rotator_record(
            camera.get_actor_rotation()
        ),
        "focusUnrealCentimeters": base.diagnostic._vector_record(center),
        "focusAuthority": (
            "native fixture world bounds; intentional surface crop"
            if crop_surface
            else "native fixture projected world-bounds fit"
        ),
        "distanceCentimeters": distance,
        "focalLengthMillimeters": focal_length,
        "sensorWidthMillimeters": sensor_width,
        "sensorHeightMillimeters": sensor_height,
    }


def _build(contract_path: Path, p19_path: Path, output_dir: Path) -> dict:
    with contract_path.open("r", encoding="utf-8") as handle:
        contract = json.load(handle)
    with p19_path.open("r", encoding="utf-8") as handle:
        p19 = json.load(handle)
    if p19.get("schema") != "toonlab.p19-mountain-cliff-contract":
        raise RuntimeError("Unexpected P19 mountain/cliff contract schema")

    unreal.log_warning("TOONLAB_P19_BUILD_START")
    _ensure_map()
    world = unreal.EditorLoadingAndSavingUtils.load_map(TARGET_MAP)
    if not world:
        raise RuntimeError("Could not load generated P19 comparison map")
    actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    all_actors = list(actor_subsystem.get_all_level_actors())
    sky_actors = [
        actor for actor in all_actors
        if str(actor.get_class().get_name()) == base.SKY_ACTOR_CLASS
    ]
    if len(sky_actors) != 1:
        raise RuntimeError("Expected one retained Visual Target sky actor")
    sky = sky_actors[0]
    for actor in all_actors:
        if str(actor.get_class().get_name()) not in base.RETAINED_DEMO_ACTOR_CLASSES:
            actor_subsystem.destroy_actor(actor)

    retained_landscapes = [
        actor for actor in actor_subsystem.get_all_level_actors()
        if str(actor.get_class().get_name()) == "Landscape"
    ]
    retained_rvt_volumes = [
        actor for actor in actor_subsystem.get_all_level_actors()
        if str(actor.get_class().get_name()) == "RuntimeVirtualTextureVolume"
    ]
    if len(retained_landscapes) != 1 or len(retained_rvt_volumes) != 2:
        raise RuntimeError("P19 requires one Landscape and two RVT volumes")

    base.source_builder._apply_light_variant(sky, contract, "author")
    rock, _, _ = base.source_builder._spawn_rock(actor_subsystem, contract)
    rock.set_actor_label("Parity_Rock_SM_RockSpire_Spire05")
    base._place_on_demo_patch(world, rock)
    tree = base._spawn_mesh(
        actor_subsystem,
        base.TREE_MESH,
        "Parity_Tree_SM_Pine01",
        [-4.1, 0.0, 1.25],
        0.36,
        True,
        (base.TREE_BARK_MATERIAL, base.TREE_LEAVES_MATERIAL),
    )
    base._place_on_demo_patch(world, tree)
    grass = base._spawn_mesh(
        actor_subsystem,
        base.GRASS_MESH,
        "Parity_Grass_SM_Grass1",
        [3.15, 0.02, 1.2],
        0.68,
        False,
        (base.GRASS_MATERIAL,),
    )
    base._place_on_demo_patch(world, grass)
    flowers = base._spawn_mesh(
        actor_subsystem,
        base.FLOWER_MESH,
        "Parity_Flowers_SM_Flower_Daisies1",
        [1.6, 0.02, -1.5],
        0.8,
        False,
        (base.FLOWER_MATERIAL,),
    )
    base._place_on_demo_patch(world, flowers)

    fixture_actors = {}
    fixture_records = []
    for fixture in p19["fixtures"]:
        fixture_actor, fixture_record = _spawn_fixture(
            actor_subsystem, world, fixture
        )
        fixture_actors[fixture["id"]] = fixture_actor
        fixture_records.append(fixture_record)

    cameras = [
        base._spawn_camera(
            actor_subsystem, world, contract, "front", "CameraRender1", rock
        ),
        base._spawn_camera(
            actor_subsystem, world, contract, "back", "CameraRender2", rock
        ),
        _spawn_detail_camera(
            actor_subsystem,
            contract,
            fixture_actors["mountain-control"],
            "CameraRender3",
            "mountain",
        ),
        _spawn_detail_camera(
            actor_subsystem,
            contract,
            fixture_actors["mountain-control"],
            "CameraRender4",
            "mountain-surface",
            True,
        ),
        _spawn_detail_camera(
            actor_subsystem,
            contract,
            fixture_actors["classic-cliff-control"],
            "CameraRender5",
            "cliff",
        ),
    ]
    world.get_world_settings().set_editor_property(
        "force_no_precomputed_lighting", True
    )
    unreal.SystemLibrary.execute_console_command(world, "r.SetNearClipPlane 5")
    if not unreal.EditorLoadingAndSavingUtils.save_map(world, TARGET_MAP):
        raise RuntimeError("Could not save generated P19 comparison map")

    report = {
        "schema": "toonlab.p19-native-unreal-level",
        "version": 1,
        "status": "complete",
        "map": TARGET_MAP,
        "sourceMap": base.SOURCE_MAP,
        "contract": str(contract_path),
        "p19Contract": str(p19_path),
        "visualTargetAuthority": "retained BP_StylizedSky_Lite source actor",
        "changedFamily": "mountain-cliff",
        "excludedFamily": "P18 imported props",
        "cameras": cameras,
        "actors": {
            "rock": str(rock.get_actor_label()),
            "tree": str(tree.get_actor_label()),
            "grass": str(grass.get_actor_label()),
            "flowers": str(flowers.get_actor_label()),
            "ground": str(retained_landscapes[0].get_actor_label()),
            "sky": str(sky.get_actor_label()),
            "mountainCliff": fixture_records,
        },
    }
    base._write_json(output_dir / "unreal-level-report.json", report)
    unreal.log_warning("TOONLAB_P19_MAP_SAVED")
    return report


def main() -> None:
    contract_path = Path(_command("ParityContract", "")).resolve()
    p19_path = Path(
        _command("P19MountainCliffContract", str(DEFAULT_P19_CONTRACT))
    ).resolve()
    output_dir = Path(
        _command("ParityOutput", str(p19_path.parent))
    ).resolve()
    report_path = output_dir / "unreal-level-report.json"
    try:
        _build(contract_path, p19_path, output_dir)
        unreal.log("TOONLAB_P19_NATIVE_LEVEL_COMPLETE %s" % report_path)
    except Exception as error:
        base._write_json(
            report_path,
            {
                "schema": "toonlab.p19-native-unreal-level",
                "version": 1,
                "status": "failed",
                "error": str(error),
                "traceback": traceback.format_exc(),
            },
        )
        unreal.log_error("TOONLAB_P19_NATIVE_LEVEL_FAILED %s" % error)
        raise


if __name__ == "__main__":
    main()
