import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// examples/ import ToonLab by its published package name so they read
// exactly like consumer code; these aliases resolve those specifiers to the
// in-repo source. Subpath entries must come before the bare root entry.
const packageAliases = [
  ...['toon', 'environment', 'water', 'vegetation', 'sky', 'post', 'rockgen',
    'debrisgen', 'character', 'loaders', 'debug'].map((subpath) => ({
    find: `@call-me-sensei/toonlab/${subpath}`,
    replacement: resolve(__dirname, `src/${subpath}/index.js`),
  })),
  { find: '@call-me-sensei/toonlab/toon-settings', replacement: resolve(__dirname, 'src/toon/toonSettings.js') },
  { find: '@call-me-sensei/toonlab/water-settings', replacement: resolve(__dirname, 'src/water/waterSettings.js') },
  { find: '@call-me-sensei/toonlab/grass', replacement: resolve(__dirname, 'src/vegetation/stylizedGrass.js') },
  { find: '@call-me-sensei/toonlab/post-processing', replacement: resolve(__dirname, 'src/post/postProcessing.js') },
  { find: '@call-me-sensei/toonlab', replacement: resolve(__dirname, 'src/index.js') },
];

export default defineConfig({
  // Fast Refresh for the React HUD (labs/**/ui). Vanilla .js modules —
  // engines, generators, shaders — pass through untouched.
  plugins: [react()],
  resolve: {
    alias: packageAliases,
  },
  server: {
    open: true,
    port: 5175,
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
        treeDesignerLegacy: resolve(__dirname, 'tree-designer/index.html'),
        outdoorWorld: resolve(__dirname, 'examples/outdoor-world/index.html'),
      },
    },
  },
});
