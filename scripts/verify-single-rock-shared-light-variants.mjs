#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKPOINT = path.join(ROOT, 'assets-local/parity/single-rock');
const REGISTRY = path.join(CHECKPOINT, 'profiles.json');
const PAGE_SCRIPT = path.join(ROOT, 'examples/tri-engine-parity/main.js');
const PAGE_HTML = path.join(ROOT, 'examples/tri-engine-parity/index.html');
const PROFILE_SELECTION = path.join(ROOT, 'examples/tri-engine-parity/profileSelection.js');

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const registry = await json(REGISTRY);
const variants = new Map(registry.sharedLightVariants.map((variant) => [variant.id, variant]));

assert.equal(variants.get('contract')?.profileId, 'p01-cool-sh0');
assert.equal(variants.get('author')?.profileId, 'p01-author-light');

const profileById = new Map(registry.profiles.map((profile) => [profile.id, profile]));
const contractProfile = profileById.get(variants.get('contract').profileId);
const authorProfile = profileById.get(variants.get('author').profileId);
assert.equal(contractProfile?.lightDirectionMode, 'contract');
assert.equal(authorProfile?.lightDirectionMode, 'author');
assert.deepEqual(authorProfile?.changes, ['directSun']);

const { resolveSharedLightSelection } = await import(PROFILE_SELECTION);
const resolve = (profile, light) => resolveSharedLightSelection(registry, {
  requestedLightMode: light,
  requestedProfileId: profile,
}).profile?.id;
assert.equal(resolve('p01-cool-sh0', 'author'), 'p01-author-light');
assert.equal(resolve('p01-author-light', 'contract'), 'p01-cool-sh0');
assert.equal(resolve(null, 'author'), 'p01-author-light');
assert.equal(resolve('p00-neutral-direct', 'contract'), 'p00-neutral-direct');
assert.equal(resolve('p00-neutral-direct', 'author'), 'p00-neutral-direct');

const contract = await json(path.join(CHECKPOINT, contractProfile.path, 'contract.json'));
const author = await json(path.join(CHECKPOINT, authorProfile.path, 'contract.json'));
assert.equal(contract.profileId, contractProfile.id);
assert.equal(author.profileId, authorProfile.id);

const authorQuaternion = [
  0.39713126196710286,
  -0.30997551921944466,
  0.144543958452599,
  0.8516507396391465,
];
assert.deepEqual(author.sun.worldRotationQuaternion, authorQuaternion);
assert.notDeepEqual(author.sun.worldRotationQuaternion, contract.sun.worldRotationQuaternion);

function withoutDeclaredLightChange(source) {
  const clone = structuredClone(source);
  delete clone.profileId;
  delete clone.description;
  delete clone.sun.worldRotationQuaternion;
  return clone;
}

assert.deepEqual(
  withoutDeclaredLightChange(author),
  withoutDeclaredLightChange(contract),
  'The author-light contract changed a field outside the declared directional-light rotation.',
);

const [script, html] = await Promise.all([
  readFile(PAGE_SCRIPT, 'utf8'),
  readFile(PAGE_HTML, 'utf8'),
]);
assert.match(html, /id="shared-light-select"/);
assert.doesNotMatch(html, /id="visual-light-select"/);
assert.match(script, /query\.get\('light'\) \?\? query\.get\('visualLight'\)/);
assert.match(script, /variant\.profileId/);
assert.match(script, /\$\{profileRoot\}\/unity-shadow-\$\{shadowMode\}\.png/);
assert.match(script, /\$\{profileRoot\}\/unreal\/unreal-shadow-\$\{shadowMode\}\.png/);
assert.match(script, /lightRayDirection\(contract\)/);
assert.match(script, /unreal-\$\{lightMode\}-light-shadow-\$\{shadowMode\}\.png/);
assert.doesNotMatch(script, /visualLightMode/);

const requiredNativeCaptures = [
  path.join(CHECKPOINT, contractProfile.path, 'unity-shadow-off.png'),
  path.join(CHECKPOINT, contractProfile.path, 'unity-shadow-hard.png'),
  path.join(CHECKPOINT, contractProfile.path, 'unreal/unreal-shadow-off.png'),
  path.join(CHECKPOINT, contractProfile.path, 'unreal/unreal-shadow-hard.png'),
  path.join(CHECKPOINT, authorProfile.path, 'unity-shadow-off.png'),
  path.join(CHECKPOINT, authorProfile.path, 'unity-shadow-hard.png'),
  path.join(CHECKPOINT, authorProfile.path, 'unreal/unreal-shadow-off.png'),
  path.join(CHECKPOINT, authorProfile.path, 'unreal/unreal-shadow-hard.png'),
  path.join(CHECKPOINT, 'source-references/ue-documented/unreal-contract-light-shadow-off.png'),
  path.join(CHECKPOINT, 'source-references/ue-documented/unreal-contract-light-shadow-hard.png'),
  path.join(CHECKPOINT, 'source-references/ue-documented/unreal-author-light-shadow-off.png'),
  path.join(CHECKPOINT, 'source-references/ue-documented/unreal-author-light-shadow-hard.png'),
];
for (const capture of requiredNativeCaptures) {
  assert.ok((await stat(capture)).size > 0, `Missing shared-light native capture: ${capture}`);
}

console.log('Verified shared contract/author light variants across all four parity panels.');
