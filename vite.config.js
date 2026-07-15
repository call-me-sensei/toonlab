import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// examples/ import ToonLab by its published package name so they read
// exactly like consumer code; these aliases resolve those specifiers to the
// in-repo source. Subpath entries must come before the bare root entry.
const packageAliases = [
  ...['toon', 'environment', 'water', 'vegetation', 'sky', 'post', 'rockgen',
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

  return {
  // Fast Refresh for the React HUD (labs/**/ui). Vanilla .js modules —
  // engines, generators, shaders — pass through untouched.
  plugins: [react()],
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
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        playground: resolve(__dirname, 'playground/index.html'),
        rockLab: resolve(__dirname, 'rock-lab/index.html'),
        treeLab: resolve(__dirname, 'tree-lab/index.html'),
        debrisLab: resolve(__dirname, 'debris-lab/index.html'),
        propLab: resolve(__dirname, 'prop-lab/index.html'),
        buildingLab: resolve(__dirname, 'building-lab/index.html'),
        catalog: resolve(__dirname, 'catalog/index.html'),
        textureLab: resolve(__dirname, 'texture-lab/index.html'),
        assetLab: resolve(__dirname, 'asset-lab/index.html'),
        vfxLab: resolve(__dirname, 'vfx-lab/index.html'),
        treeDesignerLegacy: resolve(__dirname, 'tree-designer/index.html'),
        outdoorWorld: resolve(__dirname, 'examples/outdoor-world/index.html'),
        vfxArena: resolve(__dirname, 'examples/vfx-arena/index.html'),
      },
    },
  },
  };
});
