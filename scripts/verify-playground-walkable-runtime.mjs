import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const entry = await source('../labs/playground/ecctrlMain.jsx');
const character = await source('../labs/playground/ShowcaseCharacter.jsx');
const controllerScene = await source('../labs/playground/scenes/showcases/controllerScene.jsx');
const indoorScene = await source('../labs/playground/scenes/showcases/indoorRoomScene.jsx');
const walkableScene = await source('../labs/playground/scenes/showcases/walkableSampleScene.jsx');
const walkableHost = await source('../labs/playground/scenes/showcases/WalkableSceneHost.jsx');
const physicsReadiness = await source('../labs/playground/scenes/showcases/walkablePhysicsReadiness.jsx');
const indoorInfrastructure = await source('../labs/playground/scenes/indoorScene.jsx');
const waterSceneComponents = await source('../labs/playground/scenes/waterScenes.jsx');
const waterRuntimeView = await source('../labs/playground/scenes/waterRuntimeView.jsx');
const catalogRock = await source('../labs/playground/scenes/officialCatalogRock.jsx');
const waterHud = await source('../labs/playground/scenes/waterHud.jsx');

assert.match(character, /createWalkableCharacterRuntime/);
assert.match(character, /styleTarget:\s*\{\s*targetId:\s*'walkable\/character'\s*\}/,
  'Walkable character must expose one stable package style target id');
assert.match(character, /toon:\s*false/,
  'Walkable character source materials must remain neutral until the bundle owns styling');
assert.doesNotMatch(character, /SHADER_MODE|applyToonShader/,
  'Walkable character must not pre-apply a second scene-local character shader');
assert.match(character, /walkableRuntime\.update/);
assert.match(character, /walkableRuntimeRef\.current\?\.enforce/);
assert.match(character, /groundStabilizer:\s*\{\s*lockGrounded:\s*false\s*\}/,
  'Ecctrl adapter must not enable a second grounded-body lock');
assert.match(character, /upright:\s*false/,
  'Ecctrl adapter must leave upright balance to the physics controller');
assert.match(walkableScene, /ground=\{seaBedHeight\}/);
assert.match(walkableScene, /waterApiRef=\{waterApiRef\}/);
assert.match(controllerScene, /ground=\{FLAT_GROUND\}/);
assert.match(indoorScene, /ground=\{ground\}/);
assert.match(walkableHost, /createWalkableCharacterRuntime|<Character/);
assert.match(walkableHost, /<Ecctrl/);
assert.match(walkableHost, /<KeyboardControls/);
assert.match(walkableHost, /<Physics/);
assert.match(walkableHost, /timeStep="vary"/,
  'shared walkable physics must use the stable variable-step contract');
assert.match(walkableHost, /WalkablePhysicsReadinessProvider/,
  'shared walkable host must own async collider readiness');
assert.match(walkableHost, /paused=\{physicsProps\.paused === true \|\| pendingPhysicsAssets > 0\}/,
  'Rapier must remain paused while any async collider producer is pending');
assert.match(physicsReadiness, /useLayoutEffect/,
  'async collider producers must register before the first animation frame');
assert.match(physicsReadiness, /gate\.begin\(token\)/);
assert.match(physicsReadiness, /gate\?\.complete\(token\)/);
assert.doesNotMatch(physicsReadiness, /setTimeout|requestAnimationFrame/,
  'physics readiness must be lifecycle-driven rather than timing-driven');
assert.doesNotMatch(walkableScene, /physicsProps=|timeStep/,
  'individual showcase scenes must not reactivate Rapier fixed-step interpolation');
assert.match(entry, /runtime\.inspector/);
assert.match(character, /ENABLE_NATIVE_ANIMATION \|\| ENABLE_IDLE_ANIMATION \|\| ENABLE_WALKING_ANIMATION/,
  'native animation mode must initialize the shared character animation runtime');
assert.match(entry, /discovery:\s*'scene-labels'/,
  'Walkable scene must use package-owned label discovery');
assert.match(entry, /watch:\s*true/,
  'Walkable scene must watch async and replacement targets');
assert.match(waterHud, /toonlab-style-inspector/);
assert.match(waterHud, /setDomainEnabled/);
assert.match(waterHud, /exact pre-ToonLab state/);
assert.match(waterRuntimeView, /BODY_CENTER_AT_REST/,
  'water interaction callbacks must import the shared character body offset');
assert.doesNotMatch(waterSceneComponents, /applyManufacturedFurnitureShader/,
  'Manufactured props must be styled by the bundle adapter, not scene-local shader code');
assert.match(waterSceneComponents, /setTrimesh\(collectEnvironmentTrimesh\(model\)\);\s*completePhysicsReadiness\(\);/,
  'manufactured collider readiness must complete in the trimesh commit');
assert.match(catalogRock, /loadOfficialCatalogAsset\(\{[\s\S]*inspector,/,
  'Playground catalog rocks must register through the package placement runtime');
assert.match(catalogRock, /useWalkablePhysicsReadiness\([\s\S]*collidable/,
  'async catalog colliders must participate in the shared physics gate');
assert.match(catalogRock, /setPlacement\(next\);\s*completePhysicsReadiness\(\);/,
  'catalog physics readiness must complete in the collider placement commit');
assert.doesNotMatch(catalogRock, /inspector\.registerApplication/,
  'Playground must not duplicate package inspector registration');
for (const scene of [controllerScene, indoorScene, walkableScene]) {
  assert.match(scene, /<WalkableSceneHost/);
  assert.doesNotMatch(scene, /<Ecctrl|<KeyboardControls|<Physics/,
    'showcase scene files must consume the shared controller host');
}

for (const retiredImplementation of [
  'ControllerGroundStabilizer',
  'FlatGroundRecovery',
  'IndoorGroundRecovery',
  'SwimController',
  'blendRef',
  'setLocomotionActionWeights',
]) {
  assert.equal(
    [entry, character, controllerScene, indoorScene, walkableScene, indoorInfrastructure]
      .some((text) => text.includes(retiredImplementation)),
    false,
    `Playground must not restore ${retiredImplementation}`,
  );
}

assert.ok(entry.split('\n').length < 500, 'Playground entry remains orchestration-sized');
assert.ok(character.split('\n').length < 400, 'R3F character binding remains adapter-sized');
assert.ok(waterSceneComponents.split('\n').length < 900,
  'water showcase helpers stay split by HUD, sky, atmosphere, and water runtime concerns');
for (const scene of [controllerScene, indoorScene, walkableScene]) {
  assert.ok(scene.split('\n').length < 260, 'individual showcase scene files remain composition-sized');
}

console.log('Playground walkable runtime migration verification passed.');
