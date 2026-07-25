import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
};
const sourceYawArgument = argumentValue('unity-source-yaw');
const outputArgument = argumentValue('output');
const basePath = resolve(
  root,
  'assets-local/parity/single-rock/profiles/p13-ue-authored-background-clouds/contract.json',
);
const outputPath = outputArgument
  ? resolve(root, outputArgument)
  : resolve(
      root,
      'assets-local/parity/minimal-environment/p13-author-hard/spire-05/contract.json',
    );
const manifestPath = resolve(dirname(outputPath), 'capture-manifest.json');
const contract = JSON.parse(readFileSync(basePath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const p18PropContractPath = resolve(
  root,
  'assets-local/parity/environment/p18-stylized-basic-props.json',
);
const p18PropContract = JSON.parse(readFileSync(p18PropContractPath, 'utf8'));
const sourceBounds = manifest.rock.normalization.sourceBounds;
const sourceAnchor = [
  (sourceBounds.min[0] + sourceBounds.max[0]) * 0.5,
  sourceBounds.min[1],
  (sourceBounds.min[2] + sourceBounds.max[2]) * 0.5,
];
const targetCenter = contract.rock.sourceMeshBounds.center;
const targetSize = contract.rock.sourceMeshBounds.size;
const targetAnchor = [
  targetCenter[0],
  targetCenter[1] - targetSize[1] * 0.5
    - targetSize[1] * manifest.rock.groundInsetFraction,
  targetCenter[2],
];
const normalizationScale = manifest.rock.normalization.scale;
const outerScale = contract.rock.transform.scale[0];
const equivalentPosition = contract.rock.transform.position.map(
  (value, index) => value
    + outerScale * (targetAnchor[index] - normalizationScale * sourceAnchor[index]),
);

contract.checkpoint = 'minimal-environment-spire-05-001';
contract.rock.id = manifest.rock.assetName;
contract.rock.transform = {
  position: equivalentPosition,
  rotationQuaternion: [0, 0, 0, 1],
  scale: Array(3).fill(outerScale * normalizationScale),
};
contract.rock.unity = {
  mesh: 'Assets/SoStylized-Unity/Environment/Rocks/Spire/Meshes/SM_RockSpire_Spire05.fbx',
  material: 'Assets/SoStylized-Unity/Environment/Rocks/Materials/Spire/MV_RockSpire_Spires.mat',
  // ToonLab converts the contract camera from Unity's left-handed world into
  // Three's right-handed world, then rotates this source GLB 180 degrees
  // around +Y. Expressed back in Unity world space, the exact equivalent is
  // the unmirrored imported FBX plus this 180-degree source yaw.
  sourceAxisScale: [1, 1, 1],
  sourceYawDegrees: sourceYawArgument === undefined
    ? 180
    : Number(sourceYawArgument),
};
contract.rock.unreal = {
  mesh: '/Game/SoStylized/Environment/Rocks/Spire/SM_RockSpire_Spire05.SM_RockSpire_Spire05',
  material: '/Game/SoStylized/Environment/Rocks/Materials/Spire/MI_RockSpire_Spires.MI_RockSpire_Spires',
};
contract.capture = {
  content: 'source-ground-grass-pine-daisies',
  views: {
    front: manifest.camera.front,
    back: {
      ...manifest.camera.back,
      position: [
        2 * contract.camera.lookAt[0] - contract.camera.position[0],
        contract.camera.position[1],
        2 * contract.camera.lookAt[2] - contract.camera.position[2],
      ],
    },
    bench: {
      ...p18PropContract.composition.benchCamera,
    },
  },
  hardCastAndSelfShadow: true,
  environment: manifest.content,
  policy: 'One immutable scene contract drives Unity, Unreal, ToonLab, and Visual Target captures.',
};
contract.p18StylizedBasic = {
  ...p18PropContract,
  contractPath: 'assets-local/parity/environment/p18-stylized-basic-props.json',
  props: p18PropContract.props.map((prop) => ({
    ...prop,
    sourceGlb: prop.sourceGlb.replace(/^\//, ''),
  })),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(contract, null, 2)}\n`);
console.log(outputPath);
