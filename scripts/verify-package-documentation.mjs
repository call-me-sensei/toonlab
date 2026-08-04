import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

const packagePaths = [
  join(packageRoot, 'README.md'),
  ...await markdownFiles(join(packageRoot, 'agents')),
].sort();
const repositoryPaths = [
  ...packagePaths,
  ...await markdownFiles(join(packageRoot, 'docs')),
  join(packageRoot, 'docs', 'main.jsx'),
].filter((path, index, entries) => entries.indexOf(path) === index).sort();
const documents = await Promise.all(repositoryPaths.map(async (path) => ({
  path,
  source: await readFile(path, 'utf8'),
})));
const packageDocuments = documents.filter(({ path }) => packagePaths.includes(path));

const unavailableApiNames = [
  'createGlowRing',
  'createMotionTrails',
  'createStylizedWorld',
];
for (const document of packageDocuments) {
  for (const name of unavailableApiNames) {
    assert.ok(
      !document.source.includes(name),
      `${relative(packageRoot, document.path)} directs developers to unavailable API ${name}`,
    );
  }
  assert.ok(
    !document.source.includes('private-cdn.toonlab.io'),
    `${relative(packageRoot, document.path)} contains a private CDN reference`,
  );
}

const moduleCache = new Map();
async function packageModule(specifier, sourcePath) {
  const suffix = specifier.slice(packageJson.name.length);
  const exportKey = suffix ? `.${suffix}` : '.';
  const target = packageJson.exports[exportKey];
  assert.equal(
    typeof target,
    'string',
    `${relative(packageRoot, sourcePath)} imports undocumented package subpath ${specifier}`,
  );
  const targetPath = resolve(packageRoot, target);
  assert.ok(
    targetPath.startsWith(`${packageRoot}/`),
    `${specifier} export escapes the package root`,
  );
  if (!moduleCache.has(targetPath)) {
    moduleCache.set(targetPath, import(pathToFileURL(targetPath).href));
  }
  return moduleCache.get(targetPath);
}

let verifiedBindings = 0;
for (const document of documents) {
  const imports = document.source.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*['"](@call-me-sensei\/toonlab(?:\/[^'"]+)?)['"]/g,
  );
  for (const match of imports) {
    const module = await packageModule(match[2], document.path);
    const names = match[1]
      .split(',')
      .map((entry) => entry.trim().split(/\s+as\s+/)[0])
      .filter(Boolean);
    for (const name of names) {
      assert.ok(
        name in module,
        `${relative(packageRoot, document.path)} imports missing ${name} from ${match[2]}`,
      );
      verifiedBindings += 1;
    }
  }
}

const runtimeEntryPoints = documents.find(({ path }) => path.endsWith('/agents/references/runtime-entry-points.md'));
assert.ok(runtimeEntryPoints, 'packaged runtime-entry-points reference is missing');
assert.match(
  runtimeEntryPoints.source,
  new RegExp(`\\b${packageJson.version.replaceAll('.', '\\.')}\\b`),
  'runtime-entry-points version must match package.json',
);

const readme = documents.find(({ path }) => path === join(packageRoot, 'README.md'))?.source ?? '';
assert.doesNotMatch(readme, /\]\(docs\//,
  'packaged README must use durable repository URLs for docs excluded from the tarball');
assert.match(readme, /mannequin[^\n]*not bundled|not bundled[^\n]*mannequin/i,
  'README must state that the optional mannequin binary is not bundled');
assert.match(readme, /assets\.toonlab\.io/, 'README must name the public immutable asset domain');

assert.match(
  readme,
  /does \*\*not\*\* currently make a coding agent reliable at constructing a[\s\S]*complete polished world from one prompt/i,
  'README must state the current one-shot world-construction limitation',
);
assert.match(readme, /existing scene/i, 'README must recommend existing-scene integration');
assert.match(readme, /ToonLab Gallery/i, 'README must route developers to the Gallery');
assert.match(readme, /ToonLab OSS local MCP/i, 'README must describe the OSS MCP path');
assert.match(readme, /ToonLab Pro remote MCP/i, 'README must describe the Pro MCP path');

const capabilityStatus = documents.find(({ path }) => path === join(packageRoot, 'docs', 'capability-status.md'))?.source ?? '';
assert.match(capabilityStatus, /## Recommended uses/);
assert.match(capabilityStatus, /## Experimental uses/);
assert.match(capabilityStatus, /Style an existing scene/);
assert.match(capabilityStatus, /Find and reuse assets/);
assert.match(capabilityStatus, /Use ToonLab through MCP/);
assert.match(capabilityStatus, /Sky and Cloud authoring\/composition/);

const docsApp = documents.find(({ path }) => path === join(packageRoot, 'docs', 'main.jsx'))?.source ?? '';
assert.match(docsApp, /Current capability status/);
assert.match(docsApp, /EXISTING_SCENE_SNIPPET/);
assert.doesNotMatch(docsApp, /Build a 1 km seeded open world/);

assert.match(runtimeEntryPoints.source, /qualification surfaces/);
assert.match(runtimeEntryPoints.source, /Public export status and product maturity are different/);
console.log(
  `Documentation verified: ${packageDocuments.length} packaged files, ${documents.length} repository files, ${verifiedBindings} executable import bindings, stable ${packageJson.version} package API only.`,
);
