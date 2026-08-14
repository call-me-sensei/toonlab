export function createAnimeNodeMaterial(params: any): {
    [x: string]: any;
    setupPosition(builder: any): any;
};
import { updateToonStorageSkinning } from './chunks/character-skinning.js';
import { withToonStorageSkinning } from './chunks/character-skinning.js';
import { syncToonSceneLights } from './chunks/character-scene-lights.js';
import { toonSceneLights } from './chunks/character-scene-lights.js';
export { updateToonStorageSkinning, withToonStorageSkinning, syncToonSceneLights, toonSceneLights };
