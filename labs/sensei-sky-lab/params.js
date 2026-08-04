// Call Me Sensei sky-dome + cloud variation — authored parameter document.
//
// This file IS the asset: every mesh, texture, and atlas under
// assets-local/generated/sensei-sky is deterministically baked from these
// values by `npm run assets:sensei-sky`. Nothing here samples, measures, or
// derives from licensed reference material — palettes and shapes are authored
// against the anime-cumulus look (billowy flat-bottomed heaps, 2–3 cel shading
// bands, clean scalloped silhouettes) from scratch.
//
// The baked set is contract-compatible with the P18 preview sky renderer
// (labs/shared/p18/referenceSky.js), so the same runtime that shows the
// licensed reference can show this original set by pointing at a different
// contract URL. Colors are sRGB hex for readability; the generator converts
// to linear when baking EXR atlases.

export const SENSEI_SKY_ASSET_ROOT = '/assets-local/generated/sensei-sky';

export const SENSEI_SKY_PARAMS = Object.freeze({
  schema: 'toonlab.sensei-sky-variation.params',
  version: 1,
  seed: 20260802,

  dome: Object.freeze({
    // Sky dome: full unit sphere, inward faces. v=1 at zenith, so the
    // preview shader's curveTime (1 - v) samples atlas column 0 at zenith.
    sky: Object.freeze({ radiusMeters: 4000, segments: Object.freeze([96, 48]) }),
    // Cloud shell: squashed partial sphere band. v=0 at the rim (slightly
    // below the horizon so cloud bottoms can kiss the horizon line), v=1 at
    // the top of the band.
    shell: Object.freeze({
      radiusMeters: 3400,
      rimElevationDegrees: -4,
      topElevationDegrees: 68,
      verticalScale: 0.8,
      segments: Object.freeze([128, 32]),
    }),
  }),

  atlas: Object.freeze({ width: 256, height: 4 }),

  // Scenario rows: one sky-gradient row and one cloud-shading-ramp row per
  // scenario. Gradient stops run t=0 zenith → t=0.5 horizon → t=1 below.
  // Cloud ramps run t=0 deep shadow → t=1 lit face, and the cel bands are
  // baked into the ramp so the unmodified preview shader shows stepped
  // anime shading.
  scenarios: Object.freeze([
    Object.freeze({
      id: 'clear_day',
      label: 'Clear Day',
      hour: 13,
      curveRow: 0,
      cloudShellCurveRow: 0,
      energy: 1,
      tint: Object.freeze([1, 1, 1]),
      gradient: Object.freeze([
        Object.freeze({ t: 0.0, color: '#1F55C7' }),
        Object.freeze({ t: 0.24, color: '#2E74DC' }),
        Object.freeze({ t: 0.47, color: '#4D9AE9' }),
        Object.freeze({ t: 0.49, color: '#A5D4F1' }),
        Object.freeze({ t: 0.5, color: '#E4F4F1' }),
        Object.freeze({ t: 0.56, color: '#C2D3D6' }),
        Object.freeze({ t: 1.0, color: '#8FA6AE' }),
      ]),
      cloudRamp: Object.freeze({
        bands: 0,
        hardness: 0,
        stops: Object.freeze([
          Object.freeze({ t: 0.0, color: '#85C6FA' }),
          Object.freeze({ t: 0.18, color: '#B8E6FE' }),
          Object.freeze({ t: 0.38, color: '#DFFCFF' }),
          Object.freeze({ t: 0.6, color: '#FFFFFF' }),
          Object.freeze({ t: 1.0, color: '#FFFFFF' }),
        ]),
      }),
      groundColor: '#5E9C55',
      skyShader: Object.freeze({
        horizonGlowStrength: 0.12,
        horizonGlowColor: Object.freeze([1, 0.9, 0.74]),
        sunColor: Object.freeze([1, 0.97, 0.88]),
        sunDiscSize: 0.028,
        sunDiscSoftness: 0.24,
        sunDiscIntensity: 1.9,
        sunGlowColor: Object.freeze([1, 0.9, 0.7]),
        sunGlowStrength: 0.34,
        sunGlowSpread: 6,
        starsStrength: 0,
      }),
      cloudShader: Object.freeze({
        backgroundCloudStrength: 0.24,
        backgroundCloudOpacity: 0.85,
        cloudShellStrength: 1,
        cloudShellOpacity: 1,
      }),
    }),
    Object.freeze({
      id: 'golden_hour',
      label: 'Golden Hour',
      hour: 17.7,
      curveRow: 1,
      cloudShellCurveRow: 1,
      energy: 0.94,
      tint: Object.freeze([1, 0.97, 0.94]),
      gradient: Object.freeze([
        Object.freeze({ t: 0.0, color: '#2E4488' }),
        Object.freeze({ t: 0.2, color: '#5B549E' }),
        Object.freeze({ t: 0.34, color: '#9868A6' }),
        Object.freeze({ t: 0.42, color: '#D98B98' }),
        Object.freeze({ t: 0.47, color: '#F5B282' }),
        Object.freeze({ t: 0.5, color: '#FFD693' }),
        Object.freeze({ t: 0.56, color: '#9A7B6C' }),
        Object.freeze({ t: 1.0, color: '#6E5A52' }),
      ]),
      cloudRamp: Object.freeze({
        bands: 0,
        hardness: 0,
        stops: Object.freeze([
          Object.freeze({ t: 0.0, color: '#B06CB4' }),
          Object.freeze({ t: 0.2, color: '#EE9C86' }),
          Object.freeze({ t: 0.42, color: '#FFCF9E' }),
          Object.freeze({ t: 0.62, color: '#FFF3D8' }),
          Object.freeze({ t: 1.0, color: '#FFF9E8' }),
        ]),
      }),
      groundColor: '#4E6B48',
      skyShader: Object.freeze({
        horizonGlowStrength: 0.85,
        horizonGlowColor: Object.freeze([1, 0.66, 0.4]),
        horizonGlowWidth: 0.16,
        horizonGlowFocus: 3.2,
        sunColor: Object.freeze([1, 0.82, 0.6]),
        sunDiscSize: 0.04,
        sunDiscSoftness: 0.42,
        sunDiscIntensity: 1.55,
        sunGlowColor: Object.freeze([1, 0.7, 0.42]),
        sunGlowStrength: 0.62,
        sunGlowSpread: 3.6,
        starsStrength: 0,
      }),
      cloudShader: Object.freeze({
        backgroundCloudStrength: 0.45,
        backgroundCloudOpacity: 0.9,
        cloudShellStrength: 1,
        cloudShellOpacity: 1,
      }),
    }),
    Object.freeze({
      id: 'night',
      label: 'Night',
      hour: 22,
      curveRow: 2,
      cloudShellCurveRow: 2,
      energy: 0.62,
      tint: Object.freeze([0.86, 0.9, 1]),
      gradient: Object.freeze([
        Object.freeze({ t: 0.0, color: '#0A1230' }),
        Object.freeze({ t: 0.22, color: '#16264E' }),
        Object.freeze({ t: 0.38, color: '#24406B' }),
        Object.freeze({ t: 0.5, color: '#3A6684' }),
        Object.freeze({ t: 0.57, color: '#1C2C38' }),
        Object.freeze({ t: 1.0, color: '#101B24' }),
      ]),
      cloudRamp: Object.freeze({
        bands: 0,
        hardness: 0,
        stops: Object.freeze([
          Object.freeze({ t: 0.0, color: '#31486E' }),
          Object.freeze({ t: 0.22, color: '#546F9A' }),
          Object.freeze({ t: 0.45, color: '#8AA5C8' }),
          Object.freeze({ t: 0.68, color: '#B7CBE4' }),
          Object.freeze({ t: 1.0, color: '#C9DCF2' }),
        ]),
      }),
      groundColor: '#20301F',
      skyShader: Object.freeze({
        horizonGlowStrength: 0,
        moonColor: Object.freeze([0.86, 0.92, 1]),
        moonDiscSize: 0.03,
        moonDiscIntensity: 1.35,
        moonGlowColor: Object.freeze([0.5, 0.68, 1]),
        moonGlowStrength: 0.4,
        starsStrength: 1.15,
        starsDensity: 0.4,
        starsScale: 20,
        starsSize: 0.05,
        starsTwinkleStrength: 0.42,
      }),
      cloudShader: Object.freeze({
        backgroundCloudStrength: 0.12,
        backgroundCloudOpacity: 0.5,
        cloudShellStrength: 0.9,
        cloudShellOpacity: 0.92,
      }),
    }),
  ]),

  clouds: Object.freeze({
    // Foreground cumulus shell texture. r = cel-shading curve index
    // (0 shadow → 1 lit, remapped by the per-scenario ramp), a = silhouette.
    shellTexture: Object.freeze({
      width: 8192,
      height: 1024,
      // Envelope scaffolds only rough out each cloud's mass; the density
      // field's billow noise supplies every visible shape detail.
      archetypes: Object.freeze({
        banks: Object.freeze({
          count: 6,
          elevationBand: Object.freeze([0.13, 0.36]),
          size: Object.freeze([0.075, 0.13]),
          aspect: Object.freeze([1.5, 2.4]),
        }),
        towers: Object.freeze({
          count: 2,
          elevationBand: Object.freeze([0.14, 0.22]),
          size: Object.freeze([0.13, 0.18]),
          aspect: Object.freeze([1.3, 1.7]),
        }),
        fragments: Object.freeze({
          count: 12,
          elevationBand: Object.freeze([0.16, 0.5]),
          size: Object.freeze([0.012, 0.03]),
        }),
      }),
      // `threshold` is the iso-level that becomes the silhouette; the noise
      // now only crumbles the boundary, since blobs supply the lobes.
      // Blob growth builds the silhouette's rounded lobes; the density
      // field merges them and the light march shades the merged mass.
      growth: Object.freeze({
        maxDepth: 3,
        children: Object.freeze([3, 5]),
        childScale: Object.freeze([0.46, 0.64]),
        spawnFalloff: 0.62,
      }),
      field: Object.freeze({
        seed: 4801,
        threshold: 0.42,
        envelopeReach: 1.0,
        envelopeCap: 1.15,
        noiseAmplitude: 0.36,
        // Octave sizes as fractions of each cloud's size — coarsest lobes
        // are cloud-scale, finest are a few pixels.
        cellFractions: Object.freeze([0.22, 0.12, 0.065, 0.035]),
        octaveFalloff: 0.66,
        edgeSoftness: 0.13,
        depthScale: 0.55,
        baseSoftness: 0.35,
        baseNoiseCalm: 0.45,
      }),
      // Light marching: mass accumulated toward the sun shadows each pixel,
      // so shading detail matches silhouette detail exactly.
      lighting: Object.freeze({
        direction: Object.freeze([0.32, 1]),
        nearDecay: 0.93,
        nearAbsorption: 0.055,
        farDecay: 0.994,
        farAbsorption: 0.016,
        ambient: 0.1,
        direct: 0.88,
        heightLift: 0.05,
        depthDarken: 0.06,
      }),
      fades: Object.freeze({
        zenithStart: 0.78,
        zenithEnd: 0.95,
        floorStart: 0.08,
        floorEnd: 0.02,
      }),
    }),
    // Distant flat streak banks, screened over the gradient near the horizon.
    backgroundTexture: Object.freeze({
      width: 1024,
      height: 512,
      bands: Object.freeze([
        Object.freeze({ elevation: 0.54, thickness: 0.013, blobs: 7, stretch: 13, intensity: 0.55 }),
        Object.freeze({ elevation: 0.62, thickness: 0.017, blobs: 5, stretch: 11, intensity: 0.4 }),
        Object.freeze({ elevation: 0.72, thickness: 0.02, blobs: 4, stretch: 9, intensity: 0.26 }),
      ]),
      edgeSoftness: 0.26,
      noise: Object.freeze({
        seed: 31,
        amplitude: 0.55,
        cellsPx: Object.freeze([128, 48]),
      }),
    }),
    // Contract-level placement of the background texture across the dome UV.
    backgroundMapping: Object.freeze({ verticalStretch: 0.5, verticalOffset: 0 }),
    drift: Object.freeze({ rotationSpeed: 0.0035 }),
  }),

  stage: Object.freeze({
    camera: Object.freeze({
      position: Object.freeze([0, 2.2, 0]),
      lookAt: Object.freeze([0, 9, -60]),
      up: Object.freeze([0, 1, 0]),
      verticalFieldOfViewDegrees: 45,
      near: 0.1,
      farMeters: 14000,
    }),
    ground: Object.freeze({ visible: true, radiusMeters: 3800 }),
    clearColor: Object.freeze([0.02, 0.03, 0.05, 1]),
  }),
});
