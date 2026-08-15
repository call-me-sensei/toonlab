import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ASSET_ROOT = resolve(ROOT, 'assets-local/launch-world');
const TEXTURE_ROOT = resolve(ASSET_ROOT, 'textures');
const OUTPUT = resolve(ASSET_ROOT, 'library/launch-world-library.json');
const register = process.argv.includes('--register');
const serverArgument = process.argv.find((argument) => argument.startsWith('--server='));
const server = serverArgument?.slice('--server='.length) || 'http://127.0.0.1:5176';

const textureFamilies = [
  {
    atlas: 'anime-city-facade-atlas.png',
    description: 'Original anime-city facade, shopfront, architectural panel, and graphic decal atlas.',
    family: 'anime-city',
    names: [
      'turquoise-awning-storefront', 'blue-glass-storefront', 'warm-noodle-bar', 'cream-blue-ceramic-tile',
      'coral-painted-concrete', 'graphic-transit-panel', 'turquoise-vending-panel', 'garden-balcony-screen',
      'frosted-glass', 'wave-shutter-mural', 'geometric-graffiti', 'utility-door',
      'geometric-neon-panel', 'cream-charcoal-wall', 'charcoal-gold-wall', 'perforated-concrete',
    ],
  },
  {
    atlas: 'anime-coastal-park-atlas.png',
    description: 'Original anime coastal-park surface, vegetation, fabric, shoreline, and mural atlas.',
    family: 'anime-coastal',
    names: [
      'pale-boardwalk', 'warm-dry-sand', 'wet-sand', 'turquoise-caustics',
      'pale-limestone', 'coastal-retaining-tile', 'weathered-blue-metal', 'navy-cream-fabric',
      'coral-cream-awning', 'broadleaf-groundcover', 'flower-meadow', 'clipped-lawn',
      'blue-ceramic', 'pebble-beach', 'cloud-reflection-glass', 'tropical-mural',
    ],
  },
];

const provenance = Object.freeze({
  generatedAt: '2026-08-15',
  generatedBy: 'OpenAI image generation',
  generationClass: 'image-to-image art-direction reference',
  genAiLabel: 'Gen AI',
  originalArtwork: true,
  publicShareStatus: 'private-draft',
  referencePolicy: 'Mood, palette, and environment-density references only; no branding, characters, logos, or authored imagery copied.',
  sourceReferences: 'Developer-provided Ananta screenshots (private visual references)',
});

async function fileRecord(path, url) {
  const bytes = await readFile(path);
  const info = await stat(path);
  return {
    byteSize: info.size,
    checksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    contentType: 'image/png',
    name: basename(path),
    url,
  };
}

const entries = [];
for (const family of textureFamilies) {
  const atlasPath = resolve(TEXTURE_ROOT, family.atlas);
  entries.push({
    aiGenerated: true,
    description: family.description,
    id: `launch-world/${family.family}/atlas-v1`,
    label: family.atlas.replaceAll('-', ' ').replace('.png', ''),
    provenance,
    result: { file: await fileRecord(atlasPath, `/assets-local/launch-world/textures/${family.atlas}`) },
    tags: ['anime-environment', 'city', 'coastal', 'gen-ai', 'launch-video', 'texture-atlas', family.family],
    type: 'generated-image',
  });
  for (const name of family.names) {
    const relativePath = `textures/tiles/${family.family}/${name}.png`;
    entries.push({
      aiGenerated: true,
      description: `Reusable ${name.replaceAll('-', ' ')} texture extracted losslessly from the original ${family.family} source atlas.`,
      id: `launch-world/${family.family}/${name}-v1`,
      label: name.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      provenance: { ...provenance, parentAtlas: `launch-world/${family.family}/atlas-v1` },
      result: { file: await fileRecord(resolve(ASSET_ROOT, relativePath), `/assets-local/launch-world/${relativePath}`) },
      tags: ['anime-environment', 'gen-ai', 'launch-video', 'texture', family.family, ...name.split('-').slice(0, 3)],
      type: 'generated-image',
    });
  }
}

entries.push({
  aiGenerated: true,
  description: 'Authored launch environment connecting a contemporary anime city avenue, coastal park, waterfront, and evening food alley. Includes stable ground, bounds, material labels, and collision intent for future walkable-sample integration.',
  id: 'launch-world/anime-coastal-city-v1',
  label: 'Anime Coastal City — Launch World',
  previewUrl: '/labs/launch-world/',
  provenance: {
    ...provenance,
    assembly: 'Project-authored procedural Three.js scene using ToonLab environment and character runtimes.',
    generatedComponents: textureFamilies.map(({ family }) => `launch-world/${family}/atlas-v1`),
  },
  tags: ['anime-environment', 'city', 'coastal', 'gen-ai', 'launch-video', 'walkable-ready', 'world'],
  type: 'world-preset',
  world: {
    boundsMeters: { maxX: 42, maxZ: 30, minX: -42, minZ: -64 },
    character: '/assets-local/models/yua/yua.glb',
    entry: '/labs/launch-world/',
    groundHeightExport: 'launchGroundHeight',
    module: '/labs/launch-world/world.js',
  },
});

await mkdir(resolve(ASSET_ROOT, 'library'), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify({ entries, schema: 'toonlab/private-library-stage', version: 1 }, null, 2)}\n`);
console.log(`Staged ${entries.length} private Library entries in ${OUTPUT}`);

if (register) {
  let saved = 0;
  for (const entry of entries) {
    const response = await fetch(`${server}/api/toonlab/library/${encodeURIComponent(entry.id)}`, {
      body: JSON.stringify(entry),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    });
    if (!response.ok) throw new Error(`Library registration failed for ${entry.id}: HTTP ${response.status}`);
    saved += 1;
  }
  console.log(`Registered ${saved} private Library entries through ${server}.`);
}
