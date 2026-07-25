#!/usr/bin/env node

/**
 * Extract the licensed SoStylized Unity rock-material library into ToonLab's
 * gitignored local-asset area. This script deliberately has no runtime imports
 * and emits no licensed data outside assets-local/sostylized-unity/.
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..', '..');
const LICENSED_OUTPUT_ROOT = resolve(ROOT_DIR, 'assets-local', 'sostylized-unity');
const DEFAULT_SOURCE = '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Assets/SoStylized-Unity';
const MATERIAL_SCOPE = 'Environment/Rocks';
const OUTPUT_FILENAME = 'rock-material-library.json';

function usage() {
  console.log(`Usage: node scripts/unity/extract-rock-materials.mjs [options]

Options:
  --source <path>          SoStylized-Unity asset root
  --output <path>          Output directory inside assets-local/sostylized-unity
  --no-copy-textures       Index textures without copying their source files
  --allow-unresolved       Emit diagnostics instead of failing on missing GUIDs
  --help                   Show this help

Environment:
  TOONLAB_SOSTYLIZED_UNITY_SOURCE
  TOONLAB_SOSTYLIZED_UNITY_OUTPUT

Licensed output is restricted to:
  ${LICENSED_OUTPUT_ROOT}`);
}

function parseArguments(argv) {
  const result = {
    source: null,
    output: null,
    copyTextures: true,
    allowUnresolved: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      usage();
      process.exit(0);
    } else if (argument === '--no-copy-textures') {
      result.copyTextures = false;
    } else if (argument === '--allow-unresolved') {
      result.allowUnresolved = true;
    } else if (argument === '--source' || argument === '--output') {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a path.`);
      result[argument.slice(2)] = value;
      index += 1;
    } else if (argument.startsWith('--source=')) {
      result.source = argument.slice('--source='.length);
    } else if (argument.startsWith('--output=')) {
      result.output = argument.slice('--output='.length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return result;
}

function toPosix(path) {
  return path.split(sep).join('/');
}

function isWithin(root, target) {
  const next = relative(root, target);
  return next === '' || (!next.startsWith('..') && !isAbsolute(next));
}

function assertWithin(root, target, label) {
  if (!isWithin(root, target)) {
    throw new Error(`${label} must stay inside ${root}; received ${target}`);
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
}

function parseScalar(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (value === '') return '';
  if (value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if ((value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (/^[-+]?\d+$/.test(value)) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : value;
  }
  if (/^[-+]?(?:\d+\.\d*|\d*\.\d+)(?:e[-+]?\d+)?$/i.test(value)
    || /^[-+]?\d+e[-+]?\d+$/i.test(value)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  return value;
}

function splitInlineFields(value) {
  const fields = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '{' || character === '[') {
      depth += 1;
    } else if (character === '}' || character === ']') {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      fields.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  fields.push(value.slice(start).trim());
  return fields.filter(Boolean);
}

function parseInlineMap(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value.startsWith('{') || !value.endsWith('}')) return null;
  const result = {};
  for (const field of splitInlineFields(value.slice(1, -1))) {
    const separator = field.indexOf(':');
    if (separator < 0) continue;
    const key = field.slice(0, separator).trim();
    result[key] = parseScalar(field.slice(separator + 1));
  }
  return result;
}

function normalizeAssetReference(rawReference) {
  const reference = rawReference ?? {};
  const fileID = reference.fileID ?? 0;
  const guid = typeof reference.guid === 'string' && reference.guid !== ''
    ? reference.guid
    : null;
  return {
    fileID,
    guid,
    type: reference.type ?? null,
  };
}

function isNullReference(reference) {
  return !reference || (String(reference.fileID ?? 0) === '0' && !reference.guid);
}

function yamlScalar(text, key) {
  const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}:\\s*(.*?)\\s*$`, 'm');
  const match = text.match(pattern);
  return match ? parseScalar(match[1]) : null;
}

function importerTypeName(textureType) {
  if (textureType === 0) return 'Default';
  if (textureType === 1) return 'NormalMap';
  return textureType == null ? null : `UnityTextureImporterType(${textureType})`;
}

function wrapModeName(value) {
  return ({ 0: 'Repeat', 1: 'Clamp', 2: 'Mirror', 3: 'MirrorOnce' })[value] ?? null;
}

function filterModeName(value) {
  return ({ 0: 'Point', 1: 'Bilinear', 2: 'Trilinear' })[value] ?? null;
}

function parseMeta(assetPath, text) {
  const guidMatch = text.match(/^guid:\s*([^\s]+)\s*$/m);
  if (!guidMatch) return null;
  const importerMatch = text.match(/^([A-Za-z][A-Za-z0-9_.]*Importer):\s*$/m);
  const importer = importerMatch?.[1] ?? null;
  let textureImport = null;
  if (importer === 'TextureImporter') {
    const textureType = yamlScalar(text, 'textureType');
    const sRGBTexture = yamlScalar(text, 'sRGBTexture');
    const wrapU = yamlScalar(text, 'wrapU');
    const wrapV = yamlScalar(text, 'wrapV');
    const wrapW = yamlScalar(text, 'wrapW');
    const filterMode = yamlScalar(text, 'filterMode');
    textureImport = {
      textureType,
      textureTypeName: importerTypeName(textureType),
      colorSpace: sRGBTexture === 1 ? 'srgb' : 'linear',
      sRGBTexture: sRGBTexture === 1,
      flipGreenChannel: yamlScalar(text, 'flipGreenChannel') === 1,
      alphaIsTransparency: yamlScalar(text, 'alphaIsTransparency') === 1,
      mipmapEnabled: yamlScalar(text, 'enableMipMap') === 1,
      isReadable: yamlScalar(text, 'isReadable') === 1,
      filterMode,
      filterModeName: filterModeName(filterMode),
      aniso: yamlScalar(text, 'aniso'),
      wrapU,
      wrapUName: wrapModeName(wrapU),
      wrapV,
      wrapVName: wrapModeName(wrapV),
      wrapW,
      wrapWName: wrapModeName(wrapW),
    };
  }
  return {
    guid: guidMatch[1],
    assetPath,
    importer,
    extension: extname(assetPath).toLowerCase(),
    textureImport,
  };
}

async function walkFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await visit(root);
  return files;
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function hashText(text) {
  return createHash('sha256').update(text).digest('hex');
}

function materialDocumentLines(text, assetPath) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^--- !u!21(?:\s|$)/.test(lines[index])) continue;
    let end = index + 1;
    while (end < lines.length && !/^--- !u!/.test(lines[end])) end += 1;
    const document = lines.slice(index, end);
    if (document.some((line) => line === 'Material:')) return document;
  }
  throw new Error(`Unity Material document was not found in ${assetPath}`);
}

function materialLineValue(lines, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^  ${escaped}:\\s*(.*?)\\s*$`);
  const match = lines.map((line) => line.match(pattern)).find(Boolean);
  return match ? parseScalar(match[1]) : null;
}

function materialReference(lines, key) {
  const value = materialLineValue(lines, key);
  return normalizeAssetReference(typeof value === 'string' ? parseInlineMap(value) : value);
}

function materialList(lines, key) {
  const startPattern = new RegExp(`^  ${key}:\\s*(.*?)\\s*$`);
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) return [];
  const inline = lines[start].match(startPattern)?.[1];
  if (inline === '[]') return [];
  const result = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^  -\s+(.*?)\s*$/);
    if (match) result.push(parseScalar(match[1]));
    else if (/^  \S/.test(lines[index])) break;
  }
  return result;
}

function lockedProperties(lines) {
  const start = lines.findIndex((line) => /^  m_LockedProperties:/.test(line));
  if (start < 0) return [];
  const fragments = [lines[start].replace(/^  m_LockedProperties:\s*/, '')];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  \S/.test(lines[index])) break;
    if (/^ {4}\S/.test(lines[index])) fragments.push(lines[index].trim());
  }
  return fragments.join(' ').split(/\s+/).filter(Boolean).sort();
}

function parseSavedProperties(lines) {
  const start = lines.findIndex((line) => line === '  m_SavedProperties:');
  const result = {
    textures: {},
    ints: {},
    floats: {},
    colors: {},
  };
  if (start < 0) return result;

  let category = null;
  let textureName = null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^  \S/.test(line)) break;

    const categoryMatch = line.match(/^    m_(TexEnvs|Ints|Floats|Colors):(?:\s*(.*))?$/);
    if (categoryMatch) {
      category = categoryMatch[1];
      textureName = null;
      continue;
    }

    if (category === 'TexEnvs') {
      const entry = line.match(/^    - ([^:]+):\s*$/);
      if (entry) {
        textureName = entry[1].trim();
        result.textures[textureName] = {
          fileID: 0,
          guid: null,
          type: null,
          scale: { x: 1, y: 1 },
          offset: { x: 0, y: 0 },
        };
        continue;
      }
      if (!textureName) continue;
      const texture = line.match(/^        m_Texture:\s*(\{.*\})\s*$/);
      const scale = line.match(/^        m_Scale:\s*(\{.*\})\s*$/);
      const offset = line.match(/^        m_Offset:\s*(\{.*\})\s*$/);
      if (texture) {
        Object.assign(result.textures[textureName], normalizeAssetReference(parseInlineMap(texture[1])));
      } else if (scale) {
        result.textures[textureName].scale = parseInlineMap(scale[1]);
      } else if (offset) {
        result.textures[textureName].offset = parseInlineMap(offset[1]);
      }
      continue;
    }

    const scalarEntry = line.match(/^    - ([^:]+):\s*(.*?)\s*$/);
    if (!scalarEntry) continue;
    const property = scalarEntry[1].trim();
    const rawValue = scalarEntry[2];
    if (category === 'Ints') result.ints[property] = parseScalar(rawValue);
    else if (category === 'Floats') result.floats[property] = parseScalar(rawValue);
    else if (category === 'Colors') result.colors[property] = parseInlineMap(rawValue);
  }

  for (const category of Object.keys(result)) result[category] = sortedObject(result[category]);
  return result;
}

function parseMaterial(assetPath, guid, text) {
  const lines = materialDocumentLines(text, assetPath);
  return {
    assetPath,
    guid,
    name: materialLineValue(lines, 'm_Name'),
    sourceSha256: hashText(text),
    parentReference: materialReference(lines, 'm_Parent'),
    shaderReference: materialReference(lines, 'm_Shader'),
    direct: parseSavedProperties(lines),
    lockedProperties: lockedProperties(lines),
    serialized: {
      customRenderQueue: materialLineValue(lines, 'm_CustomRenderQueue'),
      doubleSidedGI: materialLineValue(lines, 'm_DoubleSidedGI'),
      enableInstancingVariants: materialLineValue(lines, 'm_EnableInstancingVariants'),
      lightmapFlags: materialLineValue(lines, 'm_LightmapFlags'),
      modifiedSerializedProperties: materialLineValue(lines, 'm_ModifiedSerializedProperties'),
      validKeywords: materialList(lines, 'm_ValidKeywords'),
      invalidKeywords: materialList(lines, 'm_InvalidKeywords'),
      disabledShaderPasses: materialList(lines, 'disabledShaderPasses'),
    },
  };
}

function mergeProperties(parent, direct, assetPath) {
  const values = {};
  const sources = {};
  for (const category of ['textures', 'ints', 'floats', 'colors']) {
    values[category] = clone(parent?.values?.[category] ?? {});
    sources[category] = clone(parent?.sources?.[category] ?? {});
    for (const [property, value] of Object.entries(direct[category])) {
      values[category][property] = clone(value);
      sources[category][property] = assetPath;
    }
    values[category] = sortedObject(values[category]);
    sources[category] = sortedObject(sources[category]);
  }
  return { values, sources };
}

function enrichAssetReference(reference, guidIndex) {
  if (isNullReference(reference)) return null;
  const asset = reference.guid ? guidIndex.get(reference.guid) : null;
  return {
    ...reference,
    assetPath: asset?.assetPath ?? null,
    importer: asset?.importer ?? null,
  };
}

function enrichTextureReference(reference, texturesByGuid) {
  const texture = reference.guid ? texturesByGuid[reference.guid] : null;
  return {
    fileID: reference.fileID,
    guid: reference.guid,
    type: reference.type,
    assetPath: texture?.assetPath ?? null,
    outputFile: texture?.outputFile ?? null,
    scale: clone(reference.scale),
    offset: clone(reference.offset),
  };
}

function enrichPropertySet(properties, texturesByGuid) {
  return {
    textures: sortedObject(Object.fromEntries(
      Object.entries(properties.textures).map(([property, reference]) => [
        property,
        enrichTextureReference(reference, texturesByGuid),
      ]),
    )),
    ints: sortedObject(properties.ints),
    floats: sortedObject(properties.floats),
    colors: sortedObject(properties.colors),
  };
}

function propertySlotCount(properties) {
  return ['textures', 'ints', 'floats', 'colors']
    .reduce((sum, category) => sum + Object.keys(properties[category]).length, 0);
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const requestedSource = arguments_.source
    || process.env.TOONLAB_SOSTYLIZED_UNITY_SOURCE
    || DEFAULT_SOURCE;
  const fallbackSource = resolve(ROOT_DIR, '..', 'SoStylized-Unity');
  const sourceRoot = resolve(existsSync(requestedSource) ? requestedSource : fallbackSource);
  const outputRoot = resolve(
    arguments_.output
      || process.env.TOONLAB_SOSTYLIZED_UNITY_OUTPUT
      || LICENSED_OUTPUT_ROOT,
  );

  if (!existsSync(sourceRoot)) {
    throw new Error(`SoStylized-Unity source was not found at ${requestedSource} or ${fallbackSource}`);
  }
  if (!existsSync(resolve(sourceRoot, MATERIAL_SCOPE))) {
    throw new Error(`Unity rock scope was not found: ${resolve(sourceRoot, MATERIAL_SCOPE)}`);
  }
  assertWithin(LICENSED_OUTPUT_ROOT, outputRoot, 'Licensed output');

  const allFiles = await walkFiles(sourceRoot);
  const metaFiles = allFiles.filter((path) => path.endsWith('.meta'));
  const guidIndex = new Map();
  const assetIndex = new Map();
  const duplicateGuids = [];

  for (const metaPath of metaFiles) {
    const assetPath = toPosix(relative(sourceRoot, metaPath.slice(0, -'.meta'.length)));
    const record = parseMeta(assetPath, await readFile(metaPath, 'utf8'));
    if (!record) continue;
    if (guidIndex.has(record.guid)) {
      duplicateGuids.push({
        guid: record.guid,
        assetPaths: [guidIndex.get(record.guid).assetPath, record.assetPath].sort(),
      });
      continue;
    }
    guidIndex.set(record.guid, record);
    assetIndex.set(record.assetPath, record);
  }
  if (duplicateGuids.length > 0) {
    throw new Error(`Duplicate Unity GUIDs were found: ${JSON.stringify(duplicateGuids)}`);
  }

  const scopedMaterialPaths = allFiles
    .map((path) => toPosix(relative(sourceRoot, path)))
    .filter((path) => path.startsWith(`${MATERIAL_SCOPE}/`) && path.endsWith('.mat'))
    .sort();
  if (scopedMaterialPaths.length === 0) throw new Error('No Unity rock materials were found.');

  const rawMaterialCache = new Map();
  async function loadMaterial(assetPath) {
    if (rawMaterialCache.has(assetPath)) return rawMaterialCache.get(assetPath);
    const meta = assetIndex.get(assetPath);
    if (!meta) throw new Error(`Material metadata is missing for ${assetPath}`);
    const absolutePath = resolve(sourceRoot, assetPath);
    assertWithin(sourceRoot, absolutePath, 'Material source');
    const raw = parseMaterial(assetPath, meta.guid, await readFile(absolutePath, 'utf8'));
    rawMaterialCache.set(assetPath, raw);
    return raw;
  }

  const diagnostics = {
    unresolvedParents: [],
    unresolvedTextureGuids: [],
    nonFileTextureAssets: [],
  };
  const resolvedMaterialCache = new Map();
  const resolving = new Set();

  async function resolveMaterial(assetPath) {
    if (resolvedMaterialCache.has(assetPath)) return resolvedMaterialCache.get(assetPath);
    if (resolving.has(assetPath)) {
      throw new Error(`Material inheritance cycle detected at ${assetPath}`);
    }
    resolving.add(assetPath);
    const raw = await loadMaterial(assetPath);
    let parent = null;
    let parentAssetPath = null;
    if (!isNullReference(raw.parentReference)) {
      parentAssetPath = guidIndex.get(raw.parentReference.guid)?.assetPath ?? null;
      if (!parentAssetPath || !parentAssetPath.endsWith('.mat')) {
        diagnostics.unresolvedParents.push({
          materialAssetPath: assetPath,
          parentGuid: raw.parentReference.guid,
        });
      } else {
        parent = await resolveMaterial(parentAssetPath);
      }
    }
    const merged = mergeProperties(parent?.properties, raw.direct, assetPath);
    const shaderReference = !isNullReference(raw.shaderReference)
      ? raw.shaderReference
      : parent?.shaderReference ?? null;
    const resolved = {
      raw,
      parentAssetPath,
      inheritanceChain: [...(parent?.inheritanceChain ?? []), assetPath],
      properties: merged,
      shaderReference,
    };
    resolving.delete(assetPath);
    resolvedMaterialCache.set(assetPath, resolved);
    return resolved;
  }

  const resolvedMaterials = [];
  for (const materialPath of scopedMaterialPaths) {
    resolvedMaterials.push(await resolveMaterial(materialPath));
  }

  const textureReferences = new Map();
  for (const material of resolvedMaterials) {
    for (const [property, reference] of Object.entries(material.properties.values.textures)) {
      if (!reference.guid || String(reference.fileID ?? 0) === '0') continue;
      if (!textureReferences.has(reference.guid)) textureReferences.set(reference.guid, []);
      textureReferences.get(reference.guid).push({
        materialAssetPath: material.raw.assetPath,
        property,
      });
    }
  }

  await mkdir(outputRoot, { recursive: true });
  const texturesByGuid = {};
  let copiedTextureCount = 0;
  for (const guid of [...textureReferences.keys()].sort()) {
    const meta = guidIndex.get(guid);
    const references = textureReferences.get(guid)
      .sort((a, b) => `${a.materialAssetPath}|${a.property}`
        .localeCompare(`${b.materialAssetPath}|${b.property}`));
    if (!meta) {
      diagnostics.unresolvedTextureGuids.push({ guid, references });
      continue;
    }
    const sourcePath = resolve(sourceRoot, meta.assetPath);
    let sourceStats = null;
    try {
      sourceStats = await stat(sourcePath);
    } catch {
      // Diagnosed below.
    }
    if (!sourceStats?.isFile()) {
      diagnostics.nonFileTextureAssets.push({ guid, assetPath: meta.assetPath, references });
      continue;
    }
    const outputFile = toPosix(`textures/${meta.assetPath}`);
    const outputPath = resolve(outputRoot, outputFile);
    assertWithin(outputRoot, outputPath, 'Texture output');
    if (arguments_.copyTextures) {
      await mkdir(dirname(outputPath), { recursive: true });
      await copyFile(sourcePath, outputPath);
      copiedTextureCount += 1;
    }
    texturesByGuid[guid] = {
      guid,
      assetPath: meta.assetPath,
      outputFile: arguments_.copyTextures ? outputFile : null,
      importer: meta.importer,
      importSettings: meta.textureImport,
      extension: meta.extension,
      byteLength: sourceStats.size,
      sha256: await sha256File(sourcePath),
      references,
    };
  }

  for (const key of Object.keys(diagnostics)) {
    diagnostics[key].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  const unresolvedCount = diagnostics.unresolvedParents.length
    + diagnostics.unresolvedTextureGuids.length
    + diagnostics.nonFileTextureAssets.length;
  if (unresolvedCount > 0 && !arguments_.allowUnresolved) {
    throw new Error(`Unity extraction has unresolved dependencies: ${JSON.stringify(diagnostics, null, 2)}`);
  }

  const materials = [];
  for (const material of resolvedMaterials) {
    const raw = material.raw;
    let parent = null;
    if (material.parentAssetPath) {
      const parentRaw = await loadMaterial(material.parentAssetPath);
      parent = {
        guid: parentRaw.guid,
        name: parentRaw.name,
        assetPath: parentRaw.assetPath,
      };
    }
    materials.push({
      guid: raw.guid,
      name: raw.name,
      assetPath: raw.assetPath,
      sourceSha256: raw.sourceSha256,
      shader: enrichAssetReference(material.shaderReference, guidIndex),
      directShader: enrichAssetReference(raw.shaderReference, guidIndex),
      parent,
      isVariant: Boolean(parent),
      variantDepth: material.inheritanceChain.length - 1,
      inheritanceChain: material.inheritanceChain,
      lockedProperties: raw.lockedProperties,
      serialized: raw.serialized,
      direct: enrichPropertySet(raw.direct, texturesByGuid),
      resolved: enrichPropertySet(material.properties.values, texturesByGuid),
      propertySources: material.properties.sources,
    });
  }

  const shaderGuids = new Set(materials.map((material) => material.shader?.guid).filter(Boolean));
  const directPropertySlots = materials.reduce(
    (sum, material) => sum + propertySlotCount(material.direct),
    0,
  );
  const resolvedPropertySlots = materials.reduce(
    (sum, material) => sum + propertySlotCount(material.resolved),
    0,
  );
  const textureReferenceSlots = materials.reduce(
    (sum, material) => sum + Object.values(material.resolved.textures)
      .filter((reference) => reference.guid && String(reference.fileID ?? 0) !== '0').length,
    0,
  );

  const output = {
    schema: 'toonlab.sostylized-unity.rock-material-library',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      root: sourceRoot,
      scope: MATERIAL_SCOPE,
    },
    output: {
      root: outputRoot,
      texturesCopied: arguments_.copyTextures,
      textureRoot: 'textures',
    },
    contract: {
      assetPaths: 'POSIX paths relative to source.root.',
      direct: 'Properties serialized directly on this Material or Material Variant.',
      resolved: 'Root-to-leaf merge of direct properties; child entries replace parent entries by property name and category.',
      propertySources: 'For each resolved property, the source-relative Material path that supplied its final value.',
      inheritanceChain: 'Material paths ordered root first and selected variant last.',
      textureLookup: 'A non-null resolved texture guid indexes texturesByGuid. fileID 0 denotes an explicitly null texture.',
      numericValues: 'Raw serialized Unity values; no centimeters/meters, color-space, or roughness conversions are applied.',
      licensedFiles: 'JSON and copied textures are generated only under the gitignored output.root.',
    },
    counts: {
      metaFilesScanned: metaFiles.length,
      guidAssetsIndexed: guidIndex.size,
      materials: materials.length,
      rootMaterials: materials.filter((material) => !material.isVariant).length,
      materialVariants: materials.filter((material) => material.isVariant).length,
      maxVariantDepth: Math.max(...materials.map((material) => material.variantDepth)),
      shaderAssetsReferenced: shaderGuids.size,
      directPropertySlots,
      resolvedPropertySlots,
      resolvedTextureReferenceSlots: textureReferenceSlots,
      uniqueTextureAssetsReferenced: Object.keys(texturesByGuid).length,
      textureFilesCopied: copiedTextureCount,
      normalMapTextures: Object.values(texturesByGuid)
        .filter((texture) => texture.importSettings?.textureType === 1).length,
      srgbTextures: Object.values(texturesByGuid)
        .filter((texture) => texture.importSettings?.sRGBTexture).length,
      unresolvedDependencies: unresolvedCount,
    },
    materials,
    texturesByGuid: sortedObject(texturesByGuid),
    diagnostics,
  };

  const outputPath = resolve(outputRoot, OUTPUT_FILENAME);
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Unity rock material library: ${outputPath}`);
  console.log(`Materials: ${output.counts.materials} (${output.counts.materialVariants} variants, max depth ${output.counts.maxVariantDepth})`);
  console.log(`Textures: ${output.counts.uniqueTextureAssetsReferenced} referenced, ${output.counts.textureFilesCopied} copied`);
  console.log(`GUID assets indexed: ${output.counts.guidAssetsIndexed}; unresolved: ${output.counts.unresolvedDependencies}`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message ?? error);
  process.exitCode = 1;
});
