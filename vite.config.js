import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { toonlabWorkspacePlugin } from './mcp/vite-plugin.mjs';

// examples/ import ToonLab by its published package name so they read
// exactly like consumer code; these aliases resolve those specifiers to the
// in-repo source. Subpath entries must come before the bare root entry.
const packageAliases = [
  ...['toon', 'environment', 'lighting', 'water', 'vegetation', 'sky', 'weather', 'post', 'camera',
    'game-feel', 'rockgen',
    'debrisgen', 'pathgen', 'propgen', 'buildinggen', 'villagegen', 'ambientfx',
    'vfxgen', 'fauna', 'catalog', 'texgen', 'assetlib', 'character', 'loaders', 'debug'].map((subpath) => ({
    find: `@call-me-sensei/toonlab/${subpath}`,
    replacement: resolve(__dirname, `src/${subpath}/index.js`),
  })),
  { find: '@call-me-sensei/toonlab/toon-settings', replacement: resolve(__dirname, 'src/toon/toonSettings.js') },
  { find: '@call-me-sensei/toonlab/water-settings', replacement: resolve(__dirname, 'src/water/waterSettings.js') },
  { find: '@call-me-sensei/toonlab/grass', replacement: resolve(__dirname, 'src/vegetation/stylizedGrass.js') },
  { find: '@call-me-sensei/toonlab/post-processing', replacement: resolve(__dirname, 'src/post/postProcessing.js') },
  { find: '@call-me-sensei/toonlab', replacement: resolve(__dirname, 'src/index.js') },
];

export default defineConfig(({ mode }) => {
  // BYO keys come from .env / shell env — read here so proxies can inject
  // them server-side (they never reach client code or bundles).
  const env = { ...loadEnv(mode, __dirname, ''), ...process.env };
  const polyPizzaKey = env.TOONLAB_POLYPIZZA_KEY ?? env.POLYPIZZA_API_KEY ?? '';
  const assetApiUserAgent = 'ToonLab/0.2 (+https://toonlab.io; contact=jack@hyperbond.studio)';

  return {
  // Fast Refresh for the React HUD (labs/**/ui). Vanilla .js modules —
  // engines, generators, shaders — pass through untouched.
  plugins: [toonlabWorkspacePlugin({ rootDirectory: __dirname }), react()],
  resolve: {
    alias: packageAliases,
  },
  server: {
    open: true,
    port: 5175,
    // ambientCG sends no CORS headers, so the browser reaches it through
    // these dev-server routes (a real backend takes them over if the labs
    // ever ship with one — the client only knows the /api/… paths).
    // NOTE: '-get' must stay listed before the plain prefix (first match
    // wins), and followRedirects is required — /get 302s to their CDN,
    // which the browser could not follow cross-origin.
    proxy: {
      // Poly Haven requires a unique application User-Agent on every API
      // request. Browsers cannot set it, so metadata calls go through this
      // identifying proxy; asset bytes still download from their CORS CDN.
      '/api/polyhaven': {
        changeOrigin: true,
        headers: { 'user-agent': assetApiUserAgent },
        rewrite: (path) => path.replace(/^\/api\/polyhaven/, ''),
        target: 'https://api.polyhaven.com',
      },
      '/api/ambientcg-get': {
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/api\/ambientcg-get/, '/get'),
        target: 'https://ambientcg.com',
      },
      '/api/ambientcg': {
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ambientcg/, '/api/v2/full_json'),
        target: 'https://ambientcg.com',
      },
      // Poly Pizza wants an x-auth-token header AND sends no CORS — the key
      // is injected here from TOONLAB_POLYPIZZA_KEY so it never reaches the
      // browser. '-static' proxies the GLB downloads. ('-static' before the
      // plain prefix — first match wins.)
      '/api/polypizza-static': {
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/polypizza-static/, ''),
        target: 'https://static.poly.pizza',
      },
      '/api/polypizza': {
        changeOrigin: true,
        headers: polyPizzaKey ? { 'x-auth-token': polyPizzaKey } : {},
        rewrite: (path) => path.replace(/^\/api\/polypizza/, ''),
        target: 'https://api.poly.pizza/v1.1',
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // WebGPU-first pages: every supported browser is evergreen, and the
    // examples use top-level await (vite's default es2020 target rejects it).
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        shaderLab: resolve(__dirname, 'shader-lab/index.html'),
        environmentLab: resolve(__dirname, 'environment-lab/index.html'),
        grassLab: resolve(__dirname, 'grass-lab/index.html'),
        vegetationShaderLab: resolve(__dirname, 'vegetation-shader-lab/index.html'),
        shaderLabLegacy: resolve(__dirname, 'shader-lab/legacy/index.html'),
        playground: resolve(__dirname, 'playground/index.html'),
        rockLab: resolve(__dirname, 'rock-lab/index.html'),
        treeLab: resolve(__dirname, 'tree-lab/index.html'),
        flowerLab: resolve(__dirname, 'flower-lab/index.html'),
        debrisLab: resolve(__dirname, 'debris-lab/index.html'),
        propLab: resolve(__dirname, 'prop-lab/index.html'),
        buildingLab: resolve(__dirname, 'building-lab/index.html'),
        textureLab: resolve(__dirname, 'texture-lab/index.html'),
        gallery: resolve(__dirname, 'gallery/index.html'),
        // Gallery detail page + the unlisted embed stage it iframes.
        assetPage: resolve(__dirname, 'asset/index.html'),
        assetLab: resolve(__dirname, 'asset-lab/index.html'),
        skyLab: resolve(__dirname, 'sky-lab/index.html'),
        waterLab: resolve(__dirname, 'water-lab/index.html'),
        lightingLab: resolve(__dirname, 'lighting-lab/index.html'),
        weatherLab: resolve(__dirname, 'weather-lab/index.html'),
        settings: resolve(__dirname, 'settings/index.html'),
        docs: resolve(__dirname, 'docs/index.html'),
        vfxLab: resolve(__dirname, 'vfx-lab/index.html'),
        treeDesignerLegacy: resolve(__dirname, 'tree-designer/index.html'),
        outdoorWorld: resolve(__dirname, 'examples/outdoor-world/index.html'),
        vfxArena: resolve(__dirname, 'examples/vfx-arena/index.html'),
        // Hub-listed demos — without inputs they resolve in dev but 404 in
        // production builds.
        faunaDemo: resolve(__dirname, 'examples/fauna-demo/index.html'),
        ambientFxDemo: resolve(__dirname, 'examples/ambientfx-demo/index.html'),
      },
    },
  },
  };
});
