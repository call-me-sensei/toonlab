import { ROCK_PRESET_THUMBNAILS } from './thumbnailAssets.js';

export function getRockPresetThumbnails(entries) {
  const result = {};
  for (const entry of entries) {
    const thumbnail = ROCK_PRESET_THUMBNAILS[entry.value];
    if (thumbnail) result[entry.value] = thumbnail;
  }
  return result;
}
