// Export-resolution GLB download for the Rock Lab. Meshing at export
// resolution blocks the main thread for a few seconds in Phase A (the
// rockgen worker lands in Phase B), so the status line paints first and
// the HUD actions are disabled for the duration.

import { exportDocumentToGLB } from '../../src/rockgen/index.js';
import { downloadBlob } from '../shared/download.js';

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function safeFilename(name) {
  return `${String(name || 'rock').toLowerCase().replace(/[^a-z0-9-_]+/g, '-')}.glb`;
}

export async function exportRockDocumentToFile(document, { onStatus = () => {}, resolution = null } = {}) {
  const exportResolution = resolution ?? document.meshing.exportResolution;
  onStatus(`Meshing at ${exportResolution}³ for export…`);
  await nextFrame();
  await nextFrame();
  const buffer = await exportDocumentToGLB(document, { resolution: exportResolution });
  downloadBlob(buffer, safeFilename(document.name), 'model/gltf-binary');
  onStatus(`Exported ${safeFilename(document.name)} (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB).`);
}
