const MODEL_KINDS = new Set([
  'generated-model',
  'image_to_model',
  'model_segment',
  'multiview_to_model',
  'text_to_model',
]);

const TYPE_INFO = Object.freeze({
  'toon-preset': ['Toon preset', '/shader-lab/', 'Open in Shader Lab'],
  'tree-recipe': ['Tree', '/tree-lab/', 'Open in Tree Lab'],
  'rock-project': ['Rock', '/rock-lab/', 'Open in Rock Lab'],
  'rockLab-project': ['Rock', '/rock-lab/', 'Open in Rock Lab'],
  'debris-project': ['Debris', '/debris-lab/', 'Open in Debris Lab'],
  'grass-preset': ['Grass', '/grass-lab/', 'Open in Grass Lab'],
  'water-preset': ['Water', '/water-lab/', 'Open in Water Lab'],
  'sky-preset': ['Sky', '/sky-lab/', 'Open in Sky Lab'],
  'weather-preset': ['Weather', '/weather-lab/', 'Open in Weather Lab'],
  'world-preset': ['World', '/playground/', 'Open Playground'],
  'prop-asset': ['Prop', null, null],
  'environment-preset': ['Environment', '/environment-lab/', 'Open in Environment Lab'],
  'manufactured-surface-profile': ['Manufactured surface', '/manufactured-material-lab/', 'Open in Manufactured Surface Lab'],
  'vegetation-shader-preset': ['Vegetation shader', '/vegetation-shader-lab/', 'Open in Vegetation Shader Lab'],
  'tree-shader-preset': ['Tree shader', '/tree-shader-lab/', 'Open in Tree Shader Lab'],
  'grass-shader-preset': ['Grass shader', '/grass-shader-lab/', 'Open in Grass Shader Lab'],
  'flower-shader-preset': ['Flower shader', '/flower-shader-lab/', 'Open in Flower Shader Lab'],
  'rock-shader-preset': ['Rock shader', '/rock-shader-lab/', 'Open in Rock Shader Lab'],
  'ground-shader-preset': ['Ground shader', '/ground-shader-lab/', 'Open in Ground Shader Lab'],
  'sky-params': ['Sky & cloud', '/sky-cloud-lab/', 'Open in Sky & Cloud Lab'],
  'cloud-shader-preset': ['Cloud shader', '/cloud-shader-lab/', 'Open in Cloud Shader Lab'],
  'texture-recipe': ['Texture', '/texture-lab/', 'Open in Texture Lab'],
  'texture-lab-preset': ['Texture', '/texture-lab/', 'Open in Texture Lab'],
  'style-bundle': ['Style bundle', '/styles/', 'Open style bundle'],
  'generated-image': ['Generated image', null, null],
});

const ICONS = Object.freeze({
  Building: '🏯', Debris: '🪵', Environment: '🏯', Flower: '🌸',
  Grass: '🌿', Image: '🖼️', Rock: '🪨', Sky: '🌤️', Texture: '🧱',
  Tree: '🌳', Water: '🌊', Weather: '🌦️', World: '🗺️',
});

function typeInfo(label, href, actionLabel) {
  return { actionLabel, href, icon: ICONS[label] ?? '🎨', label };
}

export function rawLibraryDocument(entry) {
  if (entry?.document && typeof entry.document === 'object') return entry.document;
  const { _local, ...document } = entry ?? {};
  return document;
}

export function libraryEntryInfo(entry) {
  const payload = rawLibraryDocument(entry);
  if ((entry?.type === 'tree-recipe' || payload?.schema === 'treeRecipe') && payload?.type === 'flower') {
    return typeInfo('Flower', '/flower-lab/', 'Open in Flower Lab');
  }
  for (const candidate of [payload?.schema, payload?.type, entry?.type, entry?.kind]) {
    const normalized = String(candidate ?? '').replace(/^toonlab\//, '');
    if (TYPE_INFO[normalized]) return typeInfo(...TYPE_INFO[normalized]);
  }
  const cluster = {
    buildinggen: ['Building', '/building-lab/', 'Open in Building Lab'],
    debrisgen: TYPE_INFO['debris-project'],
    lighting: ['Lighting', '/lighting-lab/', 'Open in Lighting Lab'],
    propgen: ['Prop', '/prop-lab/', 'Open in Prop Lab'],
    rockgen: TYPE_INFO['rock-project'],
    sky: TYPE_INFO['sky-preset'],
    toon: TYPE_INFO['toon-preset'],
    vegetation: TYPE_INFO['tree-recipe'],
    water: TYPE_INFO['water-preset'],
  }[entry?.cluster];
  if (cluster) return typeInfo(...cluster);
  if (MODEL_KINDS.has(entry?.type) || MODEL_KINDS.has(entry?.kind)) {
    return typeInfo('Generated model', null, null);
  }
  return typeInfo(String(entry?.type ?? entry?.kind ?? 'Creation').replaceAll('-', ' '), null, null);
}

export function libraryResultFile(entry) {
  return entry?.result?.file ?? entry?.file ?? entry?.recipe?.download ?? entry?.download ?? null;
}

export function isLibraryModel(entry) {
  const file = libraryResultFile(entry);
  const contentType = String(file?.contentType ?? file?.content_type ?? file?.mimeType ?? '');
  const url = String(file?.url ?? '');
  return MODEL_KINDS.has(entry?.type)
    || MODEL_KINDS.has(entry?.kind)
    || entry?.kind === 'imported-glb'
    || entry?.recipe?.kind === 'model'
    || contentType === 'model/gltf-binary'
    || contentType === 'model/gltf+json'
    || /\.(?:glb|gltf)(?:\?|$)/i.test(url);
}

export function libraryImageUrl(entry) {
  const file = libraryResultFile(entry);
  const candidates = [
    entry?.result?.previewFile?.url,
    entry?.thumbnail_url,
    entry?.thumbnailUrl,
    entry?.thumbUrl,
    entry?.thumbnail,
    String(file?.contentType ?? file?.content_type ?? '').startsWith('image/') ? file?.url : null,
  ];
  const candidate = candidates.find(Boolean);
  if (!candidate) return null;
  const url = String(candidate);
  return /^(?:[a-z]+:|\/)/i.test(url) ? url : `/labs/catalog/${url.replace(/^\.\//, '')}`;
}

export function libraryTextureRecipe(entry) {
  const document = rawLibraryDocument(entry);
  const identifiers = [document?.kind, document?.schema, document?.type, entry?.kind, entry?.type]
    .filter(Boolean).join(' ').toLowerCase();
  if (!identifiers.includes('texture') || !document?.settings) return null;
  return document.kind === 'toonlab.textureRecipe' && Number(document.version) === 1
    ? document
    : {
        kind: 'toonlab.textureRecipe',
        name: document.label ?? document.name ?? entry.label ?? entry.name ?? 'Library texture',
        settings: document.settings,
        version: 1,
      };
}

export function libraryWaterDocument(entry) {
  const document = rawLibraryDocument(entry);
  const identifiers = [document?.kind, document?.schema, document?.type, entry?.kind, entry?.type]
    .filter(Boolean).join(' ').toLowerCase();
  if (!identifiers.includes('water') || !document?.settings) return null;
  return document.type === 'toonlab/water-preset' && Number(document.version) === 2
    ? document
    : {
        description: document.description ?? entry.description ?? '',
        id: document.id ?? entry.id,
        label: document.label ?? document.name ?? entry.label ?? entry.name ?? 'Library water',
        settings: document.settings,
        type: 'toonlab/water-preset',
        version: 2,
      };
}

export function libraryFormat(entry) {
  if (isLibraryModel(entry)) return '3D model';
  if (entry?.type === 'generated-image') return 'Image';
  if (entry?.type === 'style-bundle' || rawLibraryDocument(entry)?.schema === 'toonlab/style-bundle') return 'Style bundle';
  if (entry?.type === 'prop-asset') return 'Asset document';
  return 'ToonLab recipe';
}
