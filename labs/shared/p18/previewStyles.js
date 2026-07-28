// Preview-only composition for every shader lab that uses the accepted P18
// comparison scene. A lab authors exactly one component; bundle selection,
// surrounding component overrides, and visibility are inspection state and
// are deliberately excluded from exported shader documents.

export const P18_PREVIEW_SCENE_PRESETS = Object.freeze([
  Object.freeze({
    id: 'reference_hillside',
    label: 'Reference hillside',
    description:
      'The accepted P18 spire comparison scene: ground, grass, pine, flowers, manufactured props, sky, clouds, camera, and lighting.',
  }),
]);

export const P18_PREVIEW_STYLE_BUNDLES = Object.freeze([
  Object.freeze({
    id: 'call_me_sensei',
    label: 'Call Me Sensei',
    assignments: Object.freeze({
      clouds: 'call_me_sensei',
      flowers: 'call_me_sensei',
      grass: 'call_me_sensei',
      ground: 'call_me_sensei',
      lighting: 'call_me_sensei',
      manufacturedProps: 'call_me_sensei',
      rock: 'call_me_sensei',
      snowSurface: 'call_me_sensei',
      sky: 'call_me_sensei',
      tree: 'call_me_sensei',
    }),
  }),
  Object.freeze({
    id: 'neutral_review',
    label: 'Neutral review',
    assignments: Object.freeze({
      clouds: 'neutral_review',
      flowers: 'neutral_review',
      grass: 'neutral_review',
      ground: 'neutral_review',
      lighting: 'neutral_review',
      manufacturedProps: 'neutral_review',
      rock: 'neutral_review',
      snowSurface: 'neutral_review',
      sky: 'neutral_review',
      tree: 'neutral_review',
    }),
  }),
]);

export const P18_PREVIEW_COMPONENTS = Object.freeze([
  Object.freeze({
    description: 'The non-baked Spire 05 geology reference.',
    id: 'rock',
    label: 'Rock',
  }),
  Object.freeze({
    description: 'Terrain and soil material surrounding the rock.',
    id: 'ground',
    label: 'Ground',
  }),
  Object.freeze({
    description: 'Grass blades and groundcover vegetation.',
    id: 'grass',
    label: 'Grass',
  }),
  Object.freeze({
    description: 'Tree canopy plus bark and woody surfaces.',
    id: 'tree',
    label: 'Tree',
  }),
  Object.freeze({
    description: 'Petals, centers, leaves, and herbaceous stems.',
    id: 'flowers',
    label: 'Flowers',
  }),
  Object.freeze({
    description: 'Crates, furniture, vehicles, buildings, and other objects.',
    id: 'manufacturedProps',
    label: 'Objects',
  }),
  Object.freeze({
    description: 'Atmospheric sky gradient, horizon, and celestial treatment.',
    id: 'sky',
    label: 'Sky',
  }),
  Object.freeze({
    description: 'Cloud shape, shade, coverage, and color treatment.',
    id: 'clouds',
    label: 'Clouds',
  }),
  Object.freeze({
    description: 'Cross-domain accumulated powder, shadow body, structure, roughness, sparkle, and melt treatment.',
    id: 'snowSurface',
    label: 'Snow Surface',
  }),
  Object.freeze({
    description: 'Sun, ambient fill, shadow color, and exposure context.',
    id: 'lighting',
    label: 'Lighting',
  }),
]);

export const P18_PREVIEW_COMPONENT_STYLE_OPTIONS = Object.freeze([
  Object.freeze({ label: 'From bundle', value: 'inherit' }),
  Object.freeze({ label: 'Call Me Sensei', value: 'call_me_sensei' }),
  Object.freeze({ label: 'Neutral review', value: 'neutral_review' }),
]);

export const DEFAULT_P18_PREVIEW_SETTINGS = Object.freeze({
  bundle: 'call_me_sensei',
  componentStyles: Object.freeze(Object.fromEntries(
    P18_PREVIEW_COMPONENTS.map(({ id }) => [id, 'inherit']),
  )),
  componentVisibility: Object.freeze(Object.fromEntries(
    P18_PREVIEW_COMPONENTS.map(({ id }) => [id, true]),
  )),
  scenePreset: 'reference_hillside',
});

export function createP18PreviewSettings(input = null) {
  const source = input && typeof input === 'object' ? input : {};
  const bundle = P18_PREVIEW_STYLE_BUNDLES.some(({ id }) => id === source.bundle)
    ? source.bundle
    : DEFAULT_P18_PREVIEW_SETTINGS.bundle;
  const scenePreset = P18_PREVIEW_SCENE_PRESETS.some(({ id }) => id === source.scenePreset)
    ? source.scenePreset
    : DEFAULT_P18_PREVIEW_SETTINGS.scenePreset;
  const componentStyles = Object.fromEntries(P18_PREVIEW_COMPONENTS.map(({ id }) => {
    const requested = source.componentStyles?.[id];
    const valid = P18_PREVIEW_COMPONENT_STYLE_OPTIONS.some(
      ({ value }) => value === requested,
    );
    return [id, valid ? requested : 'inherit'];
  }));
  const componentVisibility = Object.fromEntries(
    P18_PREVIEW_COMPONENTS.map(({ id }) => [
      id,
      source.componentVisibility?.[id] !== false,
    ]),
  );
  return {
    bundle,
    componentStyles,
    componentVisibility,
    scenePreset,
  };
}

export function resolveP18PreviewComponentStyles(input = null) {
  const settings = createP18PreviewSettings(input);
  const bundle = P18_PREVIEW_STYLE_BUNDLES.find(
    ({ id }) => id === settings.bundle,
  ) ?? P18_PREVIEW_STYLE_BUNDLES[0];
  return Object.fromEntries(P18_PREVIEW_COMPONENTS.map(({ id }) => [
    id,
    settings.componentStyles[id] === 'inherit'
      ? bundle.assignments[id]
      : settings.componentStyles[id],
  ]));
}
