import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const rootPath = fileURLToPath(root);
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));

const forbiddenRoots = ['assets-local', 'docs', 'examples', 'labs', 'public'];
for (const entry of packageJson.files) {
  assert.equal(
    forbiddenRoots.some((rootName) => entry === rootName || entry.startsWith(`${rootName}/`)),
    false,
    `npm files whitelist must not include repository-only ${entry}`,
  );
}
assert.ok(packageJson.files.includes('src'), 'npm package must include runtime source');
assert.ok(packageJson.files.includes('agents'), 'npm package must include agent skills');

const preBetaRuntimeRoots = [
  'biome',
  'buildinggen',
  'camera',
  'game-feel',
  'landscape',
  'lighting',
  'motion',
  'pathgen',
  'propgen',
  'soundscape',
  'vfxgen',
  'villagegen',
];
const packageExportTargets = Object.values(packageJson.exports)
  .filter((target) => typeof target === 'string');
for (const runtimeRoot of preBetaRuntimeRoots) {
  assert.equal(
    packageExportTargets.some((target) => target.startsWith(`./src/${runtimeRoot}/`)),
    false,
    `pre-beta ${runtimeRoot} must not have an npm export`,
  );
}

function normalizeLocalPath(path) {
  return path.split(sep).join('/');
}

function resolveRuntimeDependency(importerPath, specifier) {
  if (!specifier.startsWith('.')) return null;
  const unresolved = resolve(rootPath, dirname(importerPath), specifier);
  const candidates = [
    unresolved,
    `${unresolved}.js`,
    `${unresolved}.json`,
    join(unresolved, 'index.js'),
  ];
  const absolutePath = candidates.find((candidate) => existsSync(candidate));
  if (!absolutePath) {
    throw new Error(`Unable to resolve ${specifier} imported by ${importerPath}.`);
  }
  const localPath = normalizeLocalPath(relative(rootPath, absolutePath));
  assert.ok(
    localPath.startsWith('src/'),
    `published runtime ${importerPath} reaches repository-only ${localPath}`,
  );
  return localPath;
}

function importedSpecifiers(source) {
  const specifiers = new Set();
  const staticPattern =
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g;
  const dynamicPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return specifiers;
}

async function collectPublishedRuntimeClosure() {
  const entries = new Set(
    packageExportTargets
      .filter((target) => target.startsWith('./src/'))
      .map((target) => target.slice(2)),
  );
  for (const target of [packageJson.main, packageJson.module]) {
    if (typeof target === 'string' && target.startsWith('./src/')) {
      entries.add(target.slice(2));
    }
  }

  const pending = [...entries];
  const closure = new Set();
  while (pending.length > 0) {
    const path = pending.pop();
    if (closure.has(path)) continue;
    closure.add(path);
    if (!path.endsWith('.js')) continue;
    const source = await readFile(resolve(rootPath, path), 'utf8');
    for (const specifier of importedSpecifiers(source)) {
      const dependency = resolveRuntimeDependency(path, specifier);
      if (dependency && !closure.has(dependency)) pending.push(dependency);
    }
  }
  return closure;
}

const runtimeClosure = await collectPublishedRuntimeClosure();
for (const runtimeRoot of preBetaRuntimeRoots) {
  const leakedPaths = [...runtimeClosure].filter(
    (path) => path.startsWith(`src/${runtimeRoot}/`),
  );
  assert.deepEqual(
    leakedPaths,
    [],
    `published entry points transitively reach pre-beta ${runtimeRoot}`,
  );
}
for (const path of runtimeClosure) {
  if (!path.endsWith('.js')) continue;
  const source = await readFile(resolve(rootPath, path), 'utf8');
  assert.equal(
    source.includes('/assets-local/'),
    false,
    `published runtime ${path} contains a repository-local asset URL`,
  );
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-package-boundary-'));
try {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: join(temporaryRoot, 'npm-cache'),
    },
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const report = JSON.parse(result.stdout)[0];
  const paths = report.files.map((file) => file.path);
  const packedRuntimePaths = paths.filter((path) => path.startsWith('src/'));
  const visualAssetPattern =
    /\.(?:bin|exr|gif|glb|gltf|hdr|jpe?g|ktx2|mp3|ogg|png|wav|webm|webp)$/i;
  const applicationArtifactPattern = /\.(?:css|html|jsx|tsx)$/i;

  for (const path of paths) {
    assert.equal(
      forbiddenRoots.some((rootName) => path === rootName || path.startsWith(`${rootName}/`)),
      false,
      `npm tarball contains repository-only path ${path}`,
    );
    assert.equal(
      visualAssetPattern.test(path),
      false,
      `npm tarball contains visual/media asset ${path}`,
    );
    assert.equal(
      applicationArtifactPattern.test(path),
      false,
      `npm tarball contains application UI artifact ${path}`,
    );
    if (path.startsWith('src/')) {
      assert.match(
        path,
        /\.(?:js|json)$/i,
        `npm runtime source contains non-code file ${path}`,
      );
    }
  }

  const missingRuntimePaths = [...runtimeClosure]
    .filter((path) => !packedRuntimePaths.includes(path))
    .sort();
  const unreachableRuntimePaths = packedRuntimePaths
    .filter((path) => !runtimeClosure.has(path))
    .sort();
  assert.deepEqual(
    missingRuntimePaths,
    [],
    `npm tarball is missing public runtime dependencies:\n${missingRuntimePaths.join('\n')}`,
  );
  assert.deepEqual(
    unreachableRuntimePaths,
    [],
    `npm tarball contains source outside the public runtime closure:\n`
      + unreachableRuntimePaths.join('\n'),
  );

  const skillPaths = paths.filter((path) => path.endsWith('/SKILL.md'));
  assert.ok(
    skillPaths.includes('agents/skills/codex/game-dev/SKILL.md'),
    'npm tarball must include the Codex game-development skill',
  );
  assert.ok(
    skillPaths.includes('agents/skills/claude/game-dev/SKILL.md'),
    'npm tarball must include the Claude game-development skill',
  );
  assert.ok(skillPaths.length >= 26, 'npm tarball must include every feature skill');
  assert.ok(paths.includes('mcp/server.mjs'), 'npm tarball must include the local MCP helper');

  console.log(
    `Package boundary verified: ${report.entryCount} files, `
      + `${report.size} packed bytes, ${report.unpackedSize} unpacked bytes, `
      + `${packedRuntimePaths.length} runtime modules, `
      + `${skillPaths.length} skills, zero labs/assets/pre-beta code.`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
