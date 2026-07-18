// Vite's local workspace bridge. It runs as a classic blocking script before
// lab modules so synchronous localStorage-based stores can keep their public
// API while `.toonlab/storage/local-storage.json` becomes the source of truth.
// Static/hosted builds receive a 404 and fall back to normal browser storage.
(function bootstrapToonLabWorkspace() {
  const storageUrl = '/api/toonlab/storage';
  const sensitiveKeys = new Set([
    'toonlab.asset-lab.polypizza-key.v1',
    'toonlab.texture-lab.ai.v1',
  ]);
  const persistable = (key) => {
    const value = String(key ?? '');
    return !sensitiveKeys.has(value)
      && !value.includes('.thumb')
      && !value.endsWith('.__probe__')
      && (value.startsWith('toonlab.') || value.startsWith('threejs-toon-shader.'));
  };

  const prototype = globalThis.Storage?.prototype;
  if (!prototype) return;
  const native = {
    clear: prototype.clear,
    getItem: prototype.getItem,
    key: prototype.key,
    removeItem: prototype.removeItem,
    setItem: prototype.setItem,
  };

  function syncRequest(method, url, payload = null) {
    try {
      const request = new XMLHttpRequest();
      request.open(method, url, false);
      request.setRequestHeader('accept', 'application/json');
      if (payload !== null) request.setRequestHeader('content-type', 'application/json');
      request.send(payload === null ? null : JSON.stringify(payload));
      if (request.status < 200 || request.status >= 300) return null;
      return JSON.parse(request.responseText);
    } catch {
      return null;
    }
  }

  const disk = syncRequest('GET', storageUrl);
  if (!disk) {
    globalThis.__TOONLAB_WORKSPACE__ = { connected: false, mode: 'browser' };
    return;
  }

  const local = globalThis.localStorage;
  if (disk.initialized) {
    const diskKeys = new Set(Object.keys(disk.entries ?? {}));
    const browserKeys = [];
    for (let index = 0; index < local.length; index += 1) {
      const key = native.key.call(local, index);
      if (persistable(key)) browserKeys.push(key);
    }
    for (const key of browserKeys) {
      if (!diskKeys.has(key)) native.removeItem.call(local, key);
    }
    for (const [key, value] of Object.entries(disk.entries ?? {})) {
      native.setItem.call(local, key, value);
    }
  } else {
    const entries = {};
    for (let index = 0; index < local.length; index += 1) {
      const key = native.key.call(local, index);
      if (persistable(key)) entries[key] = native.getItem.call(local, key);
    }
    syncRequest('POST', `${storageUrl}/import`, { entries });
  }

  let writeQueue = Promise.resolve();
  function enqueue(path, options) {
    writeQueue = writeQueue
      .catch(() => {})
      .then(() => fetch(path, { ...options, keepalive: true }))
      .catch(() => {});
  }

  function isLocalStorage(target) {
    try {
      return target === globalThis.localStorage;
    } catch {
      return false;
    }
  }

  prototype.setItem = function setItem(key, value) {
    native.setItem.call(this, key, value);
    if (isLocalStorage(this) && persistable(key)) {
      enqueue(`${storageUrl}/${encodeURIComponent(key)}`, {
        body: JSON.stringify({ value: String(value) }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      });
    }
  };

  prototype.removeItem = function removeItem(key) {
    native.removeItem.call(this, key);
    if (isLocalStorage(this) && persistable(key)) {
      enqueue(`${storageUrl}/${encodeURIComponent(key)}`, { method: 'DELETE' });
    }
  };

  prototype.clear = function clear() {
    const mirrorsDisk = isLocalStorage(this);
    native.clear.call(this);
    if (mirrorsDisk) enqueue(storageUrl, { method: 'DELETE' });
  };

  globalThis.__TOONLAB_WORKSPACE__ = {
    connected: true,
    flush: () => writeQueue,
    mode: 'disk',
  };
  globalThis.dispatchEvent(new CustomEvent('toonlab:workspace-ready', {
    detail: globalThis.__TOONLAB_WORKSPACE__,
  }));
}());
