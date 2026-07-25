#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOONLAB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOT = path.resolve(TOONLAB_ROOT, '..');
const CHECKPOINT_ROOT = path.join(
  TOONLAB_ROOT,
  'assets-local/parity/single-rock',
);

const profileId = process.argv[2];
const verifyOnly = process.argv.includes('--verify');
if (!profileId || profileId.startsWith('--')) {
  throw new Error('Usage: write-single-rock-profile-manifest.mjs <profile-id> [--verify]');
}

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function sha256(file) {
  const bytes = await readFile(file);
  return createHash('sha256').update(bytes).digest('hex');
}

async function recursiveFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return recursiveFiles(target);
    return entry.name === 'manifest.json' ? [] : [target];
  }));
  return nested.flat().sort();
}

async function fileRecord(file, relativeRoot) {
  const metadata = await stat(file);
  return {
    path: path.relative(relativeRoot, file).split(path.sep).join('/'),
    bytes: metadata.size,
    sha256: await sha256(file),
  };
}

const registryPath = path.join(CHECKPOINT_ROOT, 'profiles.json');
const adaptersPath = path.join(CHECKPOINT_ROOT, 'engine-adapters.json');
const operationsPath = path.join(CHECKPOINT_ROOT, 'engine-operation-log.json');
const registry = await json(registryPath);
const profile = registry.profiles.find((candidate) => candidate.id === profileId);
if (!profile) throw new Error(`Unknown single-rock profile: ${profileId}`);

const profileRoot = path.join(CHECKPOINT_ROOT, profile.path);
const manifestPath = path.join(profileRoot, 'manifest.json');
const contractPath = path.join(profileRoot, 'contract.json');
const contract = await json(contractPath);
if (contract.profileId !== profileId) {
  throw new Error(`Profile registry/contract mismatch: ${profileId} vs ${contract.profileId}`);
}

const profileFiles = await recursiveFiles(profileRoot);
const sourceFiles = [
  registryPath,
  adaptersPath,
  operationsPath,
  path.join(TOONLAB_ROOT, 'scripts/unity/UnityCleanParityRigCapture.cs'),
  path.join(WORKSPACE_ROOT, 'StylizedExploration/Scripts/single_rock_parity_unreal.py'),
  path.join(WORKSPACE_ROOT, 'StylizedExploration/Scripts/run_single_rock_parity_unreal.sh'),
  path.join(TOONLAB_ROOT, 'examples/tri-engine-parity/main.js'),
  path.join(TOONLAB_ROOT, 'scripts/measure-single-rock-parity.py'),
];
const operationLog = await json(operationsPath);
const manifest = {
  schema: 'toonlab.tri-engine-parity-profile-manifest',
  version: 1,
  checkpoint: contract.checkpoint,
  profileId,
  profile: structuredClone(profile),
  contractSha256: await sha256(contractPath),
  files: await Promise.all(
    profileFiles.map((file) => fileRecord(file, CHECKPOINT_ROOT)),
  ),
  sourceSpecifications: await Promise.all(
    sourceFiles.map((file) => fileRecord(file, WORKSPACE_ROOT)),
  ),
  operations: operationLog.operations
    .filter((operation) => operation.profileId === null || operation.profileId === profileId)
    .map((operation) => operation.id),
  invariants: registry.policy,
};
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (verifyOnly) {
  const existing = await readFile(manifestPath, 'utf8');
  if (existing !== serialized) {
    throw new Error(`Profile manifest is stale: ${manifestPath}`);
  }
  console.log(`Verified ${profileId} manifest.`);
} else {
  try {
    await stat(manifestPath);
    if (profile.status === 'frozen') {
      throw new Error(`Refusing to overwrite frozen profile manifest: ${manifestPath}`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await writeFile(manifestPath, serialized);
  console.log(`Wrote ${profileId} manifest: ${manifestPath}`);
}
