import json
import os
import unreal


def command_value(prefix):
    for argument in unreal.SystemLibrary.get_command_line().split():
        if argument.startswith(prefix):
            return argument.split("=", 1)[1].strip('"')
    return None


output_path = command_value("-ParitySkyBoundsOutput=")
if not output_path:
    raise RuntimeError("-ParitySkyBoundsOutput is required")

asset_paths = {
    "sky": "/Game/SoStylized/Environment/Sky/Meshes/SM_StylizedSkyDome.SM_StylizedSkyDome",
    "clouds": "/Game/SoStylized/Environment/Sky/Meshes/SM_StylizedSkyDome_Clouds.SM_StylizedSkyDome_Clouds",
}
assets = {}
for label, asset_path in asset_paths.items():
    asset = unreal.load_asset(asset_path)
    if not asset:
        raise RuntimeError("Unable to load {}".format(asset_path))
    bounds = asset.get_bounding_box()
    minimum = bounds.min
    maximum = bounds.max
    assets[label] = {
        "path": asset_path,
        "minimumCentimeters": [minimum.x, minimum.y, minimum.z],
        "maximumCentimeters": [maximum.x, maximum.y, maximum.z],
        "sizeCentimeters": [
            maximum.x - minimum.x,
            maximum.y - minimum.y,
            maximum.z - minimum.z,
        ],
    }

level_path = "/Game/ToonLab/Parity/SingleRock/L_SingleRockSourceReference"
world = unreal.EditorLoadingAndSavingUtils.load_map(level_path)
if not world:
    raise RuntimeError("Unable to load {}".format(level_path))
actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
sky_actors = [
    actor
    for actor in actor_subsystem.get_all_level_actors()
    if str(actor.get_class().get_name()) == "BP_StylizedSky_Lite_C"
]
if len(sky_actors) != 1:
    raise RuntimeError("Expected one BP_StylizedSky_Lite_C; found {}".format(len(sky_actors)))
sky_actor = sky_actors[0]
components = []
for component in sky_actor.get_components_by_class(unreal.StaticMeshComponent):
    mesh = component.static_mesh
    if not mesh:
        continue
    relative_location = component.get_editor_property("relative_location")
    relative_rotation = component.get_editor_property("relative_rotation")
    relative_scale = component.get_editor_property("relative_scale3d")
    components.append({
        "name": str(component.get_name()),
        "mesh": str(mesh.get_path_name()),
        "relativeLocationCentimeters": [
            relative_location.x,
            relative_location.y,
            relative_location.z,
        ],
        "relativeRotationPitchYawRoll": [
            relative_rotation.pitch,
            relative_rotation.yaw,
            relative_rotation.roll,
        ],
        "relativeScale": [relative_scale.x, relative_scale.y, relative_scale.z],
    })

os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, "w", encoding="utf-8") as output_file:
    json.dump({
        "schema": "toonlab.ue-visual-target-sky-bounds",
        "version": 1,
        "engine": "Unreal Engine 5.8",
        "assets": assets,
        "level": {
            "path": level_path,
            "actor": {
                "label": str(sky_actor.get_actor_label()),
                "locationCentimeters": [
                    sky_actor.get_actor_location().x,
                    sky_actor.get_actor_location().y,
                    sky_actor.get_actor_location().z,
                ],
                "rotationPitchYawRoll": [
                    sky_actor.get_actor_rotation().pitch,
                    sky_actor.get_actor_rotation().yaw,
                    sky_actor.get_actor_rotation().roll,
                ],
                "scale": [
                    sky_actor.get_actor_scale3d().x,
                    sky_actor.get_actor_scale3d().y,
                    sky_actor.get_actor_scale3d().z,
                ],
            },
            "staticMeshComponents": components,
        },
    }, output_file, indent=2)
    output_file.write("\n")

unreal.log("Wrote Visual Target sky bounds to {}".format(output_path))
