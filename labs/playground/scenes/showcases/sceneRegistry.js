import { CONTROLLER_SCENE, ControllerScene } from './controllerScene.jsx';
import { INDOOR_ROOM_SCENE, IndoorRoomScene } from './indoorRoomScene.jsx';
import { WALKABLE_SAMPLE_SCENE, WalkableSampleScene } from './walkableSampleScene.jsx';

const REGISTRY = new Map([
  [CONTROLLER_SCENE.id, { ...CONTROLLER_SCENE, Component: ControllerScene }],
  [INDOOR_ROOM_SCENE.id, { ...INDOOR_ROOM_SCENE, Component: IndoorRoomScene }],
  [WALKABLE_SAMPLE_SCENE.id, { ...WALKABLE_SAMPLE_SCENE, Component: WalkableSampleScene }],
]);
for (const scene of [...REGISTRY.values()]) {
  for (const alias of scene.aliases) REGISTRY.set(alias, scene);
}

export function resolveShowcaseScene(id = 'walkable-sample') {
  return REGISTRY.get(String(id).toLowerCase()) ?? REGISTRY.get('walkable-sample');
}

export {
  CONTROLLER_SCENE,
  ControllerScene,
  INDOOR_ROOM_SCENE,
  IndoorRoomScene,
  WALKABLE_SAMPLE_SCENE,
  WalkableSampleScene,
};
