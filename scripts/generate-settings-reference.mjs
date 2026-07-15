// Generates docs/settings-reference.md from the settings field schemas.
//
// The settings modules can't be imported in Node directly (the clusters pull
// in GLSL sources through Vite-only imports), so this script loads them
// through a Vite dev server with Playwright instead — same pattern as
// scripts/lab-probe.mjs. Each module is dynamic-imported inside a blank page
// and its `*_SETTING_GROUPS` + `*_SETTING_FIELD_SCHEMA` exports are dumped as
// markdown tables. The output is generated — never hand-edit it.
//
// Usage:
//   node scripts/generate-settings-reference.mjs
//     Starts its own dev server on port 5192 (--strictPort) and stops it when
//     done.
//   TOONLAB_DOCS_BASE_URL=http://[::1]:5175 node scripts/generate-settings-reference.mjs
//     Reuses an already-running dev server instead.

import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT, 'docs', 'settings-reference.md');
const PORT = Number(process.env.TOONLAB_DOCS_PORT || 5192);
const EXTERNAL_BASE_URL = process.env.TOONLAB_DOCS_BASE_URL || null;

// Every settings module that follows the groups + field-schema convention.
// `module` is the dev-server path; `groups`/`schema` are the export names.
const MODULES = [
  {
    title: 'Character toon shading',
    subpath: 'toonlab/toon',
    module: '/src/toon/toonSettings.js',
    groups: 'TOON_SETTING_GROUPS',
    schema: 'TOON_SETTING_FIELD_SCHEMA',
    note: 'Settings are nested per group: `createToonSettings({ rimLight: { intensity: 0.2 } })`.',
  },
  {
    title: 'Environment shading',
    subpath: 'toonlab/environment',
    module: '/src/environment/environmentSettings.js',
    groups: 'ENVIRONMENT_SETTING_GROUPS',
    schema: 'ENVIRONMENT_SETTING_FIELD_SCHEMA',
    note: 'Settings are `{ features, parameters }`: `createEnvironmentSettings({ parameters: { exposure: 0.95 } })`.',
  },
  {
    title: 'Water',
    subpath: 'toonlab/water',
    module: '/src/water/waterSettings.js',
    groups: 'WATER_SETTING_GROUPS',
    schema: 'WATER_SETTING_FIELD_SCHEMA_BY_GROUP',
    note: 'Settings are flat: `createWaterSettings({ preset: "ocean", waveIntensity: 0.6 })`. Groups exist for UI organization only.',
  },
  {
    title: 'Post-processing',
    subpath: 'toonlab/post',
    module: '/src/post/postProcessing.js',
    groups: 'POST_PROCESSING_SETTING_GROUPS',
    schema: 'POST_PROCESSING_SETTING_FIELD_SCHEMA',
    note: 'Settings are `{ features, parameters }`: `createPostProcessingSettings({ preset: "softAnime" })`.',
  },
  {
    title: 'Grass',
    subpath: 'toonlab/vegetation',
    module: '/src/vegetation/stylizedGrass.js',
    groups: 'GRASS_SETTING_GROUPS',
    schema: 'GRASS_SETTING_FIELD_SCHEMA',
    note: 'Flat settings consumed by `new StylizedGrassField(options)` and `grass.applySettings(options)`.',
  },
  {
    title: 'Flowers',
    subpath: 'toonlab/vegetation',
    module: '/src/vegetation/stylizedFlowers.js',
    groups: 'FLOWER_SETTING_GROUPS',
    schema: 'FLOWER_SETTING_FIELD_SCHEMA',
    note: 'Flat settings consumed by `new StylizedFlowerField(options)` and `flowers.applySettings(options)`.',
  },
  {
    title: 'Trees',
    subpath: 'toonlab/vegetation',
    module: '/src/vegetation/stylizedTree.js',
    groups: 'STYLIZED_TREE_SETTING_GROUPS',
    schema: 'STYLIZED_TREE_SETTING_FIELD_SCHEMA',
    note: 'Grouped settings consumed by `new StylizedTree(options)` and `tree.applySettings(options)`.',
  },
  {
    title: 'Sky',
    subpath: 'toonlab/sky',
    module: '/src/sky/stylizedSky.js',
    groups: 'SKY_SETTING_GROUPS',
    schema: 'SKY_SETTING_FIELD_SCHEMA',
    note: 'Flat settings consumed by `new StylizedSky(options)` and `sky.applySettings(options)`.',
  },
  {
    title: 'Paths, roads & bridges',
    subpath: 'toonlab/pathgen',
    module: '/src/pathgen/pathSettings.js',
    groups: 'PATH_SETTING_GROUPS',
    schema: 'PATH_SETTING_FIELD_SCHEMA',
    note: 'Grouped settings consumed by `createStylizedPaths({ settings })` and serialized in path recipes.',
  },
  {
    title: 'Ambient VFX',
    subpath: 'toonlab/ambientfx',
    module: '/src/ambientfx/ambientFxSettings.js',
    groups: 'AMBIENTFX_SETTING_GROUPS',
    schema: 'AMBIENTFX_SETTING_FIELD_SCHEMA',
    note: 'Settings are nested per group: `createAmbientFx({ settings: { fireflies: { blinkSpeed: 0.8 } } })`. Effect entries in `effects` override their group; `density` there is a multiplier.',
  },
  {
    title: 'Gameplay VFX',
    subpath: 'toonlab/vfxgen',
    module: '/src/vfxgen/vfxSettings.js',
    groups: 'VFX_SETTING_GROUPS',
    schema: 'VFX_SETTING_FIELD_SCHEMA',
    note: 'Settings are nested per group: `createVfxSystem({ settings: { impact: { sparkCount: 40 } } })`. Per-spawn `look` overrides re-tint one spawn without touching settings.',
  },
  {
    title: 'Fauna',
    subpath: 'toonlab/fauna',
    module: '/src/fauna/faunaSettings.js',
    groups: 'FAUNA_SETTING_GROUPS',
    schema: 'FAUNA_SETTING_FIELD_SCHEMA',
    note: 'Settings are nested per species group: `createFauna({ settings: { birds: { fleeRadius: 15 } } })`. Populations are passed separately: `createFauna({ species: { birds: 40, fish: 80 } })`.',
  },
  {
    title: 'Buildings',
    subpath: 'toonlab/buildinggen',
    module: '/src/buildinggen/buildingSettings.js',
    groups: 'BUILDING_SETTING_GROUPS',
    schema: 'BUILDING_SETTING_FIELD_SCHEMA',
    note: 'Grouped settings consumed by `createBuildingFromRecipe(...)` / `buildingAsset(...)`; `{ type, seed }` ride alongside the groups.',
  },
  {
    title: 'Procedural textures',
    subpath: 'toonlab/texgen',
    module: '/src/texgen/textureSettings.js',
    groups: 'TEXTURE_SETTING_GROUPS',
    schema: 'TEXTURE_SETTING_FIELD_SCHEMA',
    note: 'Grouped settings consumed by `evaluateTextureMaps(settings)` and serialized in texture recipes (`createTextureSettings`).',
  },
];

function startDevServer() {
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return child;
}

async function waitForServer(baseUrl, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok || response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Dev server did not come up at ${baseUrl}: ${lastError?.message ?? 'timeout'}`);
}

// Runs inside the page: import the module and flatten groups + schema into
// JSON-safe data. Field shape is shared across every settings module
// (id, key, label, description, type, range, defaultValue, options).
async function extractModuleData({ module, groups, schema }) {
  const mod = await import(module);
  const groupList = mod[groups];
  const fieldSchema = mod[schema];
  if (!groupList || !fieldSchema) {
    throw new Error(`${module}: missing export ${!groupList ? groups : schema}`);
  }

  function safeValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(safeValue);
    return String(value);
  }

  return groupList.map((group) => {
    const fields = fieldSchema[group.id] ?? {};
    const fieldList = Array.isArray(fields) ? fields : Object.values(fields);
    return {
      id: group.id,
      label: group.label,
      description: group.description ?? '',
      fields: fieldList.map((field) => ({
        key: field.key,
        label: field.label,
        description: field.description ?? '',
        type: field.type,
        range: field.range ? { min: field.range.min, max: field.range.max, step: field.range.step } : null,
        options: field.options ? field.options.map(String) : null,
        defaultValue: safeValue(field.defaultValue),
      })),
    };
  });
}

function formatDefault(value, type) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) {
    if (type === 'color' && value.length === 3) {
      const hex = value
        .map((channel) => Math.round(Math.min(1, Math.max(0, Number(channel))) * 255)
          .toString(16)
          .padStart(2, '0'))
        .join('');
      return `\`[${value.join(', ')}]\` (#${hex})`;
    }
    return `\`[${value.join(', ')}]\``;
  }
  if (typeof value === 'string') return `\`'${value}'\``;
  return `\`${String(value)}\``;
}

function formatRange(field) {
  // Plain '|' here; escapeCell escapes it for the table cell.
  if (field.options) return field.options.map((option) => `\`${option}\``).join(' | ');
  if (field.range) return `${field.range.min} – ${field.range.max}`;
  return '—';
}

function escapeCell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderMarkdown(sections) {
  const lines = [];
  lines.push('# Settings reference');
  lines.push('');
  lines.push('<!-- GENERATED FILE — do not edit by hand. -->');
  lines.push('<!-- Regenerate with: node scripts/generate-settings-reference.mjs -->');
  lines.push('');
  lines.push('Every tunable field in the settings schemas, generated from the');
  lines.push('`*_SETTING_GROUPS` / `*_SETTING_FIELD_SCHEMA` exports. The same schemas');
  lines.push('drive the [debug panel](debug-panel.md), so everything listed here appears');
  lines.push('as a live control in the labs.');
  lines.push('');

  // Table of contents.
  for (const section of sections) {
    lines.push(`- [${section.title}](#${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')})`);
  }
  lines.push('');

  for (const section of sections) {
    const fieldCount = section.groups.reduce((sum, group) => sum + group.fields.length, 0);
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(`Module: \`${section.subpath}\` — ${section.groups.length} groups, ${fieldCount} fields.`);
    if (section.note) {
      lines.push('');
      lines.push(section.note);
    }
    lines.push('');

    for (const group of section.groups) {
      if (group.fields.length === 0) continue;
      lines.push(`### ${section.title}: ${group.label}`);
      lines.push('');
      if (group.description) {
        lines.push(escapeCell(group.description));
        lines.push('');
      }
      lines.push('| Field | Type | Default | Range / options | Description |');
      lines.push('|---|---|---|---|---|');
      for (const field of group.fields) {
        lines.push([
          '',
          `\`${field.key}\``,
          field.type,
          escapeCell(formatDefault(field.defaultValue, field.type)),
          escapeCell(formatRange(field)),
          escapeCell(field.description),
          '',
        ].join(' | ').trim());
      }
      lines.push('');
    }
  }

  return `${lines.join('\n').trim()}\n`;
}

async function main() {
  const baseUrl = EXTERNAL_BASE_URL ?? `http://[::1]:${PORT}`;
  const server = EXTERNAL_BASE_URL ? null : startDevServer();

  let browser = null;
  try {
    await waitForServer(baseUrl);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    // Serve a blank same-origin page so dynamic imports resolve against the
    // dev server without booting any of the lab apps.
    await page.route('**/__settings-probe__', (route) => route.fulfill({
      body: '<!doctype html><html><head></head><body></body></html>',
      contentType: 'text/html',
    }));
    await page.goto(`${baseUrl}/__settings-probe__`, { waitUntil: 'domcontentloaded' });

    const sections = [];
    for (const spec of MODULES) {
      const groups = await page.evaluate(extractModuleData, {
        groups: spec.groups,
        module: spec.module,
        schema: spec.schema,
      });
      sections.push({ ...spec, groups });
      const fieldCount = groups.reduce((sum, group) => sum + group.fields.length, 0);
      console.log(`${spec.title}: ${groups.length} groups, ${fieldCount} fields`);
    }

    if (pageErrors.length > 0) {
      throw new Error(`Page errors while importing settings modules:\n${pageErrors.join('\n')}`);
    }

    await writeFile(OUTPUT_PATH, renderMarkdown(sections));
    console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
  } finally {
    await browser?.close();
    server?.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
