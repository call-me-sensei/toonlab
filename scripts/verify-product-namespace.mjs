import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const productPaths = [
  resolve(root, 'src'),
  resolve(root, 'examples'),
  resolve(root, 'labs'),
  resolve(root, 'mcp'),
  resolve(root, 'scripts'),
  resolve(root, 'docs'),
  resolve(root, 'vite.config.js'),
  resolve(root, 'package.json'),
  resolve(root, '..', 'toonlab-pro', 'src'),
  resolve(root, '..', 'toonlab-pro', 'scripts'),
  resolve(root, '..', 'toonlab-pro', 'vite.config.js'),
  resolve(root, '..', 'toonlab-pro', 'package.json'),
];
const readableExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
]);
const ignoredDirectories = new Set([
  '.git',
  '.local-reference',
  'assets-local',
  'dist',
  'node_modules',
  'public',
]);
const producerTerms = [
  ['so', 'stylized'].join('[\\s_-]*'),
  [...[117, 110, 105, 116, 121]].map((code) => String.fromCharCode(code)).join(''),
  [...[117, 110, 114, 101, 97, 108]].map((code) => String.fromCharCode(code)).join(''),
  [...[117, 114, 112]].map((code) => String.fromCharCode(code)).join(''),
];
const abbreviatedProducer = [...[117, 101]]
  .map((code) => String.fromCharCode(code))
  .join('');
const forbidden = new RegExp(
  [
    ...producerTerms.map((term) => `\\b${term}\\b`),
    `\\b${abbreviatedProducer}(?:4|5)?\\b`,
    `\\b${abbreviatedProducer}[_-]`,
    `[_-]${abbreviatedProducer}\\b`,
  ].join('|'),
  'i',
);
const violations = [];

function displayPath(filePath) {
  const relativePath = filePath.startsWith(root)
    ? filePath.slice(root.length + 1)
    : filePath;
  return relativePath || filePath;
}

function inspectFile(filePath) {
  if (!readableExtensions.has(extname(filePath))) return;
  const source = readFileSync(filePath, 'utf8');
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (forbidden.test(line)) {
      violations.push(`${displayPath(filePath)}:${index + 1}: ${line.trim()}`);
    }
  }
}

function inspectPath(path) {
  if (!existsSync(path)) return;
  if (forbidden.test(path.split('/').at(-1) ?? '')) {
    violations.push(`${displayPath(path)}: producer-specific path`);
  }
  const stats = statSync(path);
  if (stats.isFile()) {
    inspectFile(path);
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    inspectPath(resolve(path, entry.name));
  }
}

for (const productPath of productPaths) {
  inspectPath(productPath);
}

if (violations.length > 0) {
  console.error('Product namespace migration contains producer-specific references:');
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Product namespace migration is clean.');
}
