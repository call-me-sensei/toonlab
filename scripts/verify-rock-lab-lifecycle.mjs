import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const values = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  },
};

const [{ createRockDocument }, {
  AUTOSAVE_ID,
  listRockProjects,
  loadRockProject,
  saveRockProject,
}, storeSource, appSource] = await Promise.all([
  import('../src/rockgen/rockDocument.js'),
  import('../labs/rock-lab/rockProjectStore.js'),
  readFile(new URL('../labs/rock-lab/store/rockStore.js', import.meta.url), 'utf8'),
  readFile(new URL('../labs/rock-lab/ui/App.jsx', import.meta.url), 'utf8'),
]);

const document = createRockDocument({ preset: 'boulder', seed: 7 });
document.name = 'Quarry Study';
const namedId = 'rock_quarry_study_test';
saveRockProject(document, { id: namedId, meta: { preset: 'boulder', seed: 7 } });
assert.notEqual(namedId, AUTOSAVE_ID);
assert.equal(loadRockProject(namedId).document.name, 'Quarry Study');
assert.deepEqual(listRockProjects().map(({ id, document }) => ({ id, name: document.name })), [
  { id: namedId, name: 'Quarry Study' },
]);

document.name = 'Quarry Study Revised';
saveRockProject(document, { id: namedId, meta: { preset: 'boulder', seed: 7 } });
assert.equal(listRockProjects().length, 1);
assert.equal(loadRockProject(namedId).document.name, 'Quarry Study Revised');

assert.match(storeSource, /saveNamedProject\(name\)/);
assert.match(storeSource, /projectId:\s*id/);
assert.match(appSource, /actions\.saveNamedProject\(name\)/);
assert.match(appSource, /Saved projects/);
assert.doesNotMatch(appSource, /saveRockProject\(state\.document/);

console.log('Rock Lab named-save lifecycle verified.');
