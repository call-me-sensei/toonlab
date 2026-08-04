// ToonLab verdant-world — the from-scratch outdoor world being built to the
// ToonLab / Genshin environment quality bar (see the outdoor-quality-bar
// plan). This example is the parity vehicle: every environment upgrade
// (ground-field color adoption, unified wind, day cycle, stylized fog) lands
// here first and is screenshot-compared against the ToonLab reference captures.
// It intentionally starts leaner than examples/outdoor-world (no minimap,
// villages, or set dressing) — systems earn their way in as they hit the bar.
//
// Views: 1 Explore (third-person) · 2 Flyover · ?cam=x,y,z[,lx,ly,lz] fixes
// the camera for parity captures. ?groundDebug=1 billboards the ground-field
// color target near spawn. Same seed → same world.

import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

import { createSkyDayCycle, createStylizedTerrain, createStylizedWorld } from '@call-me-sensei/toonlab';
import { applyToonShader, createCharacterRenderPasses, createToonSettings } from '@call-me-sensei/toonlab/toon';
import { createPostProcessingPipeline } from '@call-me-sensei/toonlab/post';
import { loadModelAsset } from '@call-me-sensei/toonlab/loaders';
import {
  setEnvironmentPlayer,
  setEnvironmentState,
  setGlobalWind,
} from '@call-me-sensei/toonlab/environment';
import { createRockDocument, meshDocument, resolveRockgenQuality } from '@call-me-sensei/toonlab/rockgen';
import { combineMasks, createNoisePatchMask, createSlopeMask, createWaterMask, scatterInRect } from '@call-me-sensei/toonlab/vegetation';

const WORLD = {
  bounds: { x: 440, z: 440 },
  seed: 20260720,
  spawn: { x: 0, y: 0, z: 0 },
  waterLevel: 0,
};
let heightAt = () => 0;

// ------------------------------------------------------------------ rocks
// A small rockgen set near the meadow: these are ground-field CONSUMERS
// (their bases melt into the terrain color once P3 lands), never writers.

function addNeutralUv(geometry) {
  if (!geometry.attributes.uv) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(
      new Float32Array(geometry.attributes.position.count * 2), 2,
    ));
  }
  return geometry;
}

function buildRocks() {
  const quality = resolveRockgenQuality('gameplayHigh');
  const geometryFor = (preset, seed) => addNeutralUv(meshDocument(
    createRockDocument({ preset, seed, style: 'call_me_sensei' }),
    { normals: quality.normalsMode, resolution: Math.min(quality.previewResolution, 36) },
  ));
  const variants = [
    geometryFor('boulder', 61),
    geometryFor('granite-boulder', 62),
    geometryFor('river-boulder', 63),
  ];
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const group = new THREE.Group();
  group.name = 'rocks';
  const blockers = [];

  const dry = combineMasks(
    createWaterMask({ heightAt, margin: 0.4, waterLevel: WORLD.waterLevel }),
    createSlopeMask({ heightAt, maxSlope: 0.8 }),
  );
  scatterInRect({
    count: 36,
    heightAt,
    mask: dry,
    max: { x: WORLD.bounds.x - 12, z: WORLD.bounds.z - 12 },
    min: { x: -WORLD.bounds.x + 12, z: -WORLD.bounds.z + 12 },
    minSpacing: 30,
    seed: 8,
  }).forEach((p, i) => {
    const rock = new THREE.Mesh(variants[i % variants.length], material);
    const scale = 0.9 + ((i * 2654435761) % 100) / 55;
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.scale.setScalar(scale);
    rock.position.set(p.x, p.y - scale * 0.28, p.z);
    rock.rotation.y = i * 2.39996;
    group.add(rock);
    blockers.push({ radius: scale * 0.8, x: p.x, z: p.z });
  });
  return { blockers, group };
}

// -------------------------------------------------------------- character

const CLIP_NAMES = {
  idle: ['Idle_Loop', 'Idle'],
  jump: ['Jump_Start', 'Jump_Loop', 'Jump'],
  run: ['Sprint_Loop', 'Jog_Fwd_Loop', 'Running', 'Run'],
  walk: ['Walk_Loop', 'Walking', 'Walk'],
};

async function loadCharacter() {
  const asset = await loadModelAsset('/characters/mannequin.glb');
  applyToonShader(asset.root, {
    settings: createToonSettings({ preset: 'call_me_sensei' }),
  });
  const character = new THREE.Group();
  character.add(asset.root);
  character.position.set(WORLD.spawn.x, heightAt(WORLD.spawn.x, WORLD.spawn.z), WORLD.spawn.z);
  const mixer = new THREE.AnimationMixer(asset.root);
  const actions = {};
  for (const [role, names] of Object.entries(CLIP_NAMES)) {
    const clip = names.map((name) => THREE.AnimationClip.findByName(asset.clips, name)).find(Boolean);
    if (clip) actions[role] = mixer.clipAction(clip);
  }
  actions.idle?.play();
  return { actions, character, mixer };
}

// ------------------------------------------------------------------- app

const keys = new Set();
window.addEventListener('keydown', (event) => keys.add(event.code));
window.addEventListener('keyup', (event) => keys.delete(event.code));

async function main() {
  const params = new URLSearchParams(location.search);
  const renderer = new WebGPURenderer({
    antialias: true,
    forceWebGL: params.get('renderer') === 'webgl',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Number(params.get('dpr')) || 2));
  renderer.shadowMap.enabled = true;
  (window.__toonlabHostMount ?? document.body).appendChild(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 600);

  // Blank-canvas morphology: rolling plains only — the old karst mountain
  // range is a legacy look and is gone with the rest of the legacy assets.
  // Cliff and rock forms return as rebuilt assets when they hit the bar.
  const useReferenceGround = params.get('refground') !== '0';
  const terrain = createStylizedTerrain({
    archetype: params.get('archetype') ?? 'rollingPlains',
    height: params.has('h') ? Number(params.get('h')) : undefined,
    // A soft lip instead of the legacy rim mountain range: enough to hide
    // the mesh edge, low enough to never enter the rock/snow paint bands.
    morphology: { rim: { base: 10, ridged: 16 } },
    // With their grass texture as the base map, the vertex paint must stop
    // supplying color (green paint × green texture = the neon lawn) — the
    // meadow band goes near-white so texture + colormap own the hue.
    palette: useReferenceGround ? {
      golden: '#e6d6a4',
      meadow: '#f4f2ea',
    } : {},
    seed: Number(params.get('seed')) || WORLD.seed,
    sinkholes: false,
    size: { x: Number(params.get('sx')) || 960, z: Number(params.get('sz')) || 960 },
    waterCoverage: params.has('water') ? Number(params.get('water')) : 0.18,
  });
  heightAt = terrain.heightAt;
  WORLD.seed = terrain.resolvedSeed;
  WORLD.spawn = terrain.spawn;
  WORLD.waterLevel = terrain.waterLevel;
  WORLD.bounds = { x: terrain.size.x / 2 - 20, z: terrain.size.z / 2 - 20 };

  // Reference-first strategy: the ToonLab ground textures drive the
  // terrain while our procedural equivalents are rebuilt to match — their
  // tiling grass as the base map, their hand-painted biome colormap over
  // it, their rock albedo on steep faces. Dev-only files (gitignored);
  // silently falls back to the procedural set when absent. ?refground=0
  // A/B-toggles back to ours.
  if (useReferenceGround) {
    const textureLoader = new THREE.TextureLoader();
    const tryTexture = (url, setup) => new Promise((resolve) => {
      textureLoader.load(url, (tex) => { setup?.(tex); resolve(tex); }, undefined, () => resolve(null));
    });
    const base = '/assets-local/reference-materials/textures';
    const [grassTexture, colormapTexture, rockTexture] = await Promise.all([
      tryTexture(`${base}/T_Grass1_BC.png`, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(terrain.meshExtent.x / 16, terrain.meshExtent.z / 16); // their GlobalScale: 1600uu = 16m tile
        tex.anisotropy = 8;
        tex.updateMatrix();
      }),
      tryTexture(`${base}/T_Grass_ColormapVol1.png`, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = 4;
      }),
      tryTexture(`${base}/T_RockClassic_BC.png`, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
      }),
    ]);
    terrain.root.traverse((obj) => {
      if (!obj.isMesh || obj.name !== 'terrain') return;
      if (grassTexture) obj.material.map = grassTexture;
      if (colormapTexture) obj.material.userData.envColormapMap = colormapTexture;
      if (rockTexture) obj.material.userData.envTriplanarMap = rockTexture;
      obj.material.needsUpdate = true;
    });
    if (grassTexture) console.info('[verdant] reference ground textures active');
  }

  const terrainRoot = new THREE.Group();
  terrainRoot.add(terrain.root);
  // The terrain is the primary ground-field writer; path ribbons join the
  // set below once the world has built them.
  terrain.root.traverse((obj) => {
    if (obj.isMesh) obj.userData.groundFieldWrite = true;
  });
  // BLANK CANVAS policy: no legacy assets by default. Every asset class
  // (trees, rocks, flowers, props) re-enters only once its rebuilt version
  // hits the quality bar — the world always shows exactly the progress.
  // ?rocks=1 temporarily stages the old rockgen set (e.g. melt testing).
  const rocks = params.has('rocks') ? buildRocks() : { blockers: [], group: null };
  if (rocks.group) terrainRoot.add(rocks.group);
  scene.add(terrainRoot);

  const { actions, character, mixer } = await loadCharacter();
  scene.add(character);

  const forestPatches = createNoisePatchMask({ scale: 0.005, seed: 31, threshold: 0.46 });

  const world = await createStylizedWorld({
    camera,
    environment: {
      bakeVertexAo: false,
      // The ToonLab-derived terrain look: noise-broken cliff edges,
      // seeded macro biome colormap, dual-scale anti-tiling detail.
      parameters: {
        cliffNoiseScale: 0.05,
        cliffNoiseStrength: 0.06,
        // GROUND-FIRST parity: with their texture as ground truth, every
        // stylization multiplier is zeroed/neutralized until the bare
        // terrain matches the reference stage; effects earn their way back
        // one A/B at a time.
        colormapDecode: useReferenceGround ? 1.0 : 2.0,
        // Their landscape formula: desaturate ground, Overlay the colormap.
        colormapMode: useReferenceGround ? 1.0 : 0.0,
        colormapStrength: useReferenceGround ? 1.0 : 0.65,
        dualDetailMix: useReferenceGround ? 0.0 : 0.4,
        dualDetailScale: 0.19,
        exposure: useReferenceGround ? 1.0 : undefined,
        saturation: useReferenceGround ? 1.0 : undefined,
      },
    },
    // Blank canvas: flowers return with the rebuilt vegetation pass.
    flowers: params.has('flowers') ? { scatter: { density: 0.9, radius: 32, seed: 12 } } : false,
    followTarget: character,
    // GROUND-FIRST: blades hidden by default until the terrain texture is
    // right — they adopt whatever the ground is, so ground comes first.
    // ?grass=1 re-enables.
    grass: !params.has('grass') || params.get('grass') === '0' ? false : {
      settings: {
        // The signature ToonLab move: blades adopt the terrain color
        // beneath them (ground-field pass), lightly lifted so the meadow
        // reads sunlit rather than muddy. ?adopt=0 A/B-toggles it. The
        // gradient sits high (their "RVT gradient placed high on the
        // grass") with warm sun-kissed tips, and a warm sky response so
        // tips never go steel-blue.
        groundAdoptHeight: 0.95,
        groundAdoptStrength: params.has('adopt') ? Number(params.get('adopt')) : 0.9,
        groundAdoptTint: [1.14, 1.12, 0.96],
        shadowTint: [0.5, 0.56, 0.6],
        skyColor: [0.74, 0.86, 0.82],
        tipColor: [0.84, 0.95, 0.5],
      },
    },
    paths: params.has('nopaths') ? false : {
      auto: { count: 3, styles: ['dirt', 'dirt', 'stone'] },
      seed: WORLD.seed,
    },
    renderer,
    scene,
    shadows: params.has('noshadow') ? false : undefined,
    sky: {
      settings: {
        cloudCoverage: 0.44,
        cloudScale: 1.0,
        cloudColor: [1.0, 1.0, 1.0],
        cloudShadeColor: [0.62, 0.75, 0.95],
        horizonColor: [0.62, 0.88, 1.0],
        horizonScattering: 0.55,
        sunColor: [1.0, 0.97, 0.88],
        sunDirection: [-0.4, 0.82, -0.3],
        sunGlowStrength: 1.1,
        sunSize: 0.028,
        zenithColor: [0.12, 0.5, 0.93],
      },
    },
    terrain: {
      heightAt,
      root: terrainRoot,
      size: { depth: terrain.meshExtent.z * 0.8, width: terrain.meshExtent.x * 0.8 },
    },
    groundField: { resolution: Number(params.get('groundres')) || 2048 },
    // Blank canvas: the forest returns with the rebuilt vegetation pass.
    trees: params.has('trees') ? {
      center: { x: 0, z: 0 },
      mask: forestPatches,
      scatter: { radius: Math.max(WORLD.bounds.x, WORLD.bounds.z) },
      settings: { leafShape: { preset: 'round' } },
    } : false,
    water: params.has('nowater') ? false : {
      level: WORLD.waterLevel,
      settings: {
        passes: { reflectionScale: 0.4, sceneColorScale: 0.6 },
        quality: 'medium',
      },
    },
  });
  world.collision.addCircles(rocks.blockers);

  // Rock bases melt into the meadow (ground-field contact blend). Applied
  // after conversion — the environment shader owns these materials now.
  // ?nomelt=1 A/B-toggles it for captures.
  if (!params.has('nomelt')) {
    rocks.group?.traverse((obj) => {
      if (!obj.isMesh) return;
      for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        if (mat?.uniforms?.vtBlendStrength) {
          mat.uniforms.vtBlendStrength.value = 0.7;
          mat.uniforms.vtBlendHeight.value = 0.5;
        }
      }
    });
  }

  // ?ref=1 places the exported ToonLab assets (private, gitignored) in
  // a lineup near spawn under our shading — the apples-to-apples layer.
  if (params.has('ref')) {
    const { createReferenceLayer } = await import('./referenceLayer.js');
    await createReferenceLayer({ heightAt, spawn: WORLD.spawn, terrainRoot });
  }

  // Reference-first forest: their pines/birch stand as the world's trees
  // until our rebuilt trees match them. GROUND-FIRST: off by default,
  // ?reftrees=1 enables.
  if (params.get('reftrees') === '1') {
    const { createReferenceForest } = await import('./referenceLayer.js');
    const { combineMasks: masks, createSlopeMask: slopeMask, createWaterMask: waterMask, scatterInRect: scatter } =
      await import('@call-me-sensei/toonlab/vegetation');
    const plantable = masks(
      waterMask({ heightAt, margin: 1.2, waterLevel: WORLD.waterLevel }),
      slopeMask({ heightAt, maxSlope: 0.55 }),
    );
    const placements = scatter({
      count: 300,
      heightAt,
      mask: (x, z) => forestPatches(x, z) && plantable(x, z),
      max: { x: WORLD.bounds.x, z: WORLD.bounds.z },
      min: { x: -WORLD.bounds.x, z: -WORLD.bounds.z },
      minSpacing: 9,
      seed: 17,
    });
    const forest = await createReferenceForest({ heightAt, placements, terrainRoot });
    if (forest) {
      for (const p of placements) world.collision.addCircle(p.x, p.z, 0.45);
    }
  }

  // ?tp=x,z teleports the character (captures use it to drag the grass
  // follow-window to a specific spot, e.g. a path edge).
  if (params.has('tp')) {
    const [tpx, tpz] = params.get('tp').split(',').map(Number);
    if (Number.isFinite(tpx) && Number.isFinite(tpz)) {
      character.position.set(tpx, world.collision.groundHeight(tpx, tpz), tpz);
    }
  }

  // Path ribbons write into the ground field too — their dirt is what the
  // meadow grass adopts at path edges.
  terrainRoot.traverse((obj) => {
    if (obj.isMesh && obj.userData?.isPathRibbon) obj.userData.groundFieldWrite = true;
  });

  // createStylizedWorld owns the RVT-equivalent ground field so every grass
  // clump receives the same terrain/path color contract by default.
  const groundField = world.groundField;

  // Global wind: one direction for the whole world (grass today; trees,
  // sheen, and wind lines adopt it in the unified-wind phase).
  setGlobalWind({ angle: 0.6, speed: 1.0, strength: 1.0 });

  if (params.get('groundDebug')) {
    // Billboard the color target near spawn: the fastest "is the field
    // sane" check in a capture (also exposed at window.verdant.groundField).
    const debugMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const debugQuad = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), debugMaterial);
    debugQuad.position.set(WORLD.spawn.x, heightAt(WORLD.spawn.x, WORLD.spawn.z) + 16, WORLD.spawn.z - 20);
    debugQuad.userData.waterExclude = true;
    scene.add(debugQuad);
    const assignDebugMap = () => {
      if (groundField.colorTexture && debugMaterial.map !== groundField.colorTexture) {
        debugMaterial.map = groundField.colorTexture;
        debugMaterial.needsUpdate = true;
      }
    };
    world.onAfterUpdate = assignDebugMap; // cheap poll; map exists after first pass
    setInterval(assignDebugMap, 500);
  }

  const passes = createCharacterRenderPasses({ camera, renderer, scene });
  passes.registerCharacterRoot(character);
  const post = createPostProcessingPipeline({
    camera, renderer, scene,
    settings: { preset: 'call_me_sensei' },
  });
  if (passes.characterMaskTexture) post.setCharacterMask(passes.characterMaskTexture);
  // Day/night cycle drives the sky, the environment-state atmosphere, and
  // the sun rig from one clock. ?tod=day|sunset|night|sunrise pins a phase
  // (captures); ?cycle=SECONDS animates a full day+night in that time.
  setEnvironmentState({
    atmosphereFogHeightFalloff: 0.01,
    atmosphereGlowSpread: 0.55,
  });
  const dayCycle = createSkyDayCycle({
    dayLength: params.has('cycle') ? Number(params.get('cycle')) * (600 / 1080) : 600,
    environmentRoot: terrainRoot,
    fog: world.fog,
    nightLength: params.has('cycle') ? Number(params.get('cycle')) * (480 / 1080) : 480,
    sky: world.sky,
    water: world.water,
    weather: world.weather,
    world,
  });
  const TOD_PINS = { day: 0, sunset: 0.25, night: 0.5, sunrise: 0.75 };
  if (params.has('tod')) dayCycle.pinProgress(TOD_PINS[params.get('tod')] ?? 0);
  else if (!params.has('cycle')) dayCycle.pinProgress(0); // static day until told otherwise
  else dayCycle.apply();
  window.verdantDayCycle = dayCycle;

  // HUD time-of-day controls: pin a phase, or run the whole cycle fast.
  const setTodActive = (id) => {
    for (const button of document.querySelectorAll('#hud button[id^="tod-"]')) {
      button.dataset.active = String(button.id === id);
    }
  };
  for (const [key, progress] of Object.entries(TOD_PINS)) {
    document.getElementById(`tod-${key}`)?.addEventListener('click', () => {
      dayCycle.pinProgress(progress);
      setTodActive(`tod-${key}`);
    });
  }
  document.getElementById('tod-cycle')?.addEventListener('click', () => {
    dayCycle.pinProgress(null);
    dayCycle.setTimeScale(9); // 1080s cycle → ~2 minutes
    setTodActive('tod-cycle');
  });
  if (params.has('tod')) setTodActive(`tod-${params.get('tod')}`);
  post.setSettings({
    features: { atmosphere: true, bloom: true, vignette: true },
    parameters: {
      atmosphereBaseHeight: WORLD.waterLevel,
      atmosphereFar: 1000,
      atmosphereHeightFalloff: 0.008,
      atmosphereNear: 110,
      atmosphereStrength: 0.55,
      bloomStrength: 0.18,
      bloomThreshold: 0.92,
    },
  });

  // ------------------------------------------------------------- views

  const forward = new THREE.Vector3();
  const movement = new THREE.Vector3();
  let currentAction = actions.idle ?? null;
  const play = (action) => {
    if (!action || action === currentAction) return;
    currentAction?.fadeOut(0.2);
    action.reset().fadeIn(0.2).play();
    currentAction = action;
  };

  const orbit = { dist: 7, dragging: false, pitch: 0.3, yaw: Math.PI / 2 };
  const vertical = { grounded: true, velocity: 0 };
  renderer.domElement.addEventListener('pointerdown', (event) => {
    renderer.domElement.setPointerCapture(event.pointerId);
    orbit.dragging = true;
  });
  window.addEventListener('pointerup', () => { orbit.dragging = false; });
  window.addEventListener('pointermove', (event) => {
    if (!orbit.dragging) return;
    orbit.yaw -= event.movementX * 0.005;
    orbit.pitch = Math.min(Math.max(orbit.pitch + event.movementY * 0.004, -0.15), 1.15);
  });
  renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    orbit.dist = Math.min(Math.max(orbit.dist + event.deltaY * 0.01, 3), 16);
  }, { passive: false });

  const explore = {
    update(delta) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      movement.set(0, 0, 0);
      if (keys.has('KeyW') || keys.has('ArrowUp')) movement.add(forward);
      if (keys.has('KeyS') || keys.has('ArrowDown')) movement.sub(forward);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) movement.add(right);
      if (keys.has('KeyD') || keys.has('ArrowRight')) movement.sub(right);
      const moving = movement.lengthSq() > 0;
      const running = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
      const ground = world.collision.groundHeight(character.position.x, character.position.z);
      if (moving) {
        movement.normalize();
        character.position.addScaledVector(movement, (running ? 5.2 : 2.1) * delta);
        character.position.x = Math.min(Math.max(character.position.x, -WORLD.bounds.x), WORLD.bounds.x);
        character.position.z = Math.min(Math.max(character.position.z, -WORLD.bounds.z), WORLD.bounds.z);
        const targetYaw = Math.atan2(movement.x, movement.z);
        let yawDelta = targetYaw - character.rotation.y;
        yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
        character.rotation.y += yawDelta * Math.min(delta * 10, 1);
        world.collision.resolve(character.position, 0.35);
      }
      if (keys.has('Space') && vertical.grounded) {
        vertical.velocity = 5.4;
        vertical.grounded = false;
        if (actions.jump) play(actions.jump);
      }
      vertical.velocity -= 15 * delta;
      const floor = Math.max(ground, WORLD.waterLevel - 0.8);
      character.position.y = Math.max(character.position.y + vertical.velocity * delta, floor);
      vertical.grounded = character.position.y <= floor + 0.01;
      if (vertical.grounded) {
        vertical.velocity = 0;
        play(running ? (actions.run ?? actions.walk) : moving ? actions.walk : actions.idle);
      }

      const horizontal = Math.cos(orbit.pitch) * orbit.dist;
      const desired = new THREE.Vector3(
        character.position.x - Math.sin(orbit.yaw) * horizontal,
        character.position.y + Math.sin(orbit.pitch) * orbit.dist + 1.6,
        character.position.z - Math.cos(orbit.yaw) * horizontal,
      );
      desired.y = Math.max(desired.y, heightAt(desired.x, desired.z) + 1.2);
      camera.position.lerp(desired, 1 - Math.exp(-8 * delta));
      camera.lookAt(character.position.x, character.position.y + 1.4, character.position.z);
    },
  };

  let flyTime = 0;
  const flyover = {
    update(delta) {
      flyTime += delta * 0.05;
      const radius = 300 + Math.sin(flyTime * 0.7) * 80;
      camera.position.set(
        Math.cos(flyTime) * radius,
        160 + Math.sin(flyTime * 1.3) * 30,
        Math.sin(flyTime) * radius,
      );
      const ahead = flyTime + 0.25;
      camera.lookAt(Math.cos(ahead) * radius * 0.35, 12, Math.sin(ahead) * radius * 0.35);
    },
  };

  // Fixed parity camera, spawn-relative so shots keep framing across seeds:
  // ?camrel=dx,dy,dz[,lx,ly,lz] → position = spawn + (dx,dy,dz), look-at =
  // spawn + (lx,ly,lz). ?cam=x,y,z[,lx,ly,lz] pins absolute world coords.
  const camSpec = (params.get('cam') ?? params.get('camrel') ?? '').split(',').map(Number);
  const camBase = params.has('camrel')
    ? new THREE.Vector3(WORLD.spawn.x, heightAt(WORLD.spawn.x, WORLD.spawn.z), WORLD.spawn.z)
    : new THREE.Vector3();
  const fixed = {
    update() {
      camera.position.set(
        camBase.x + (camSpec[0] ?? 0),
        camBase.y + (camSpec[1] ?? 30),
        camBase.z + (camSpec[2] ?? 60),
      );
      camera.lookAt(
        camBase.x + (camSpec[3] ?? 0),
        camBase.y + (camSpec[4] ?? 0),
        camBase.z + (camSpec[5] ?? 0),
      );
    },
  };

  const views = { explore, flyover };
  let activeView = (params.has('cam') || params.has('camrel')) ? 'fixed' : 'explore';
  if (activeView === 'fixed') views.fixed = fixed;
  function setView(name) {
    if (!views[name]) return;
    activeView = name;
    for (const button of document.querySelectorAll('#hud button')) {
      button.dataset.active = String(button.id === `view-${name}`);
    }
  }
  document.getElementById('view-explore').addEventListener('click', () => setView('explore'));
  document.getElementById('view-flyover').addEventListener('click', () => setView('flyover'));
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Digit1') setView('explore');
    if (event.code === 'Digit2') setView('flyover');
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio, 2));
  });

  window.verdant = { groundField, terrain, world }; // console + probe access
  document.getElementById('loading').remove();
  const backendName = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  document.body.dataset.rendererBackend = backendName;
  document.body.dataset.worldReady = 'true';

  const fpsLabel = document.getElementById('fps');
  let fpsFrames = 0;
  let fpsTime = 0;
  let totalFrames = 0;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    fpsFrames += 1;
    fpsTime += delta;
    totalFrames += 1;
    if (fpsTime >= 0.5) {
      fpsLabel.textContent = `${Math.round(fpsFrames / fpsTime)} fps · ${backendName}`;
      // Rendered-frame gate for capture harnesses: cold WebGPU pipeline
      // compilation can stall the first seconds of the loop, so wall-clock
      // settles under-shoot — probes wait on frames instead.
      document.body.dataset.frames = String(totalFrames);
      fpsFrames = 0;
      fpsTime = 0;
    }
    views[activeView].update(delta);
    dayCycle.update(delta);
    setEnvironmentPlayer(character.position);
    document.body.dataset.groundFieldReady = String(Boolean(groundField.colorTexture));
    mixer.update(delta);
    if (!params.has('nochar')) passes.update();
    world.update(delta);
    world.onAfterUpdate?.();
    if (params.has('nopost')) renderer.render(scene, camera);
    else post.render(delta);
  });
}

main().catch((error) => {
  console.error(error);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${error.message}`;
});
