export const ACTIVE_STYLE_BUNDLE_STORAGE_KEY = 'toonlab.active-style-bundle.v1';
export const ACTIVE_STYLE_BUNDLE_EVENT = 'toonlab:active-style-bundle-change';

export const DEFAULT_STYLE_BUNDLE_OPTION = Object.freeze({
  id: 'call-me-sensei',
  label: 'Call Me Sensei',
  scope: 'built-in',
});

function isStyleBundle(entry) {
  return entry?.type === 'style-bundle' || entry?.schema === 'toonlab/style-bundle';
}

export function resolveActiveStyleBundleId(requestedId, options) {
  const normalized = String(requestedId ?? '').trim();
  return options.some(({ id }) => id === normalized)
    ? normalized
    : DEFAULT_STYLE_BUNDLE_OPTION.id;
}

export function readStoredStyleBundleId() {
  try {
    return window.localStorage.getItem(ACTIVE_STYLE_BUNDLE_STORAGE_KEY)
      || DEFAULT_STYLE_BUNDLE_OPTION.id;
  } catch {
    return DEFAULT_STYLE_BUNDLE_OPTION.id;
  }
}

/**
 * Make the persisted preference synchronously visible to Labs before their
 * stores initialize. The async library lookup later replaces these fallback
 * options with the complete local bundle list.
 */
export function primeActiveStyleBundle() {
  const id = readStoredStyleBundleId();
  const host = window;
  host.__toonlabActiveStyleBundleId = id;
  host.__toonlabStyleBundleOptions ??= [DEFAULT_STYLE_BUNDLE_OPTION];
  document.documentElement.dataset.styleBundle = id;
  if (document.body) document.body.dataset.styleBundle = id;
  return id;
}

export function publishActiveStyleBundle({ id, label, options }) {
  const detail = { id, label, options };
  document.documentElement.dataset.styleBundle = id;
  if (document.body) document.body.dataset.styleBundle = id;
  try {
    window.localStorage.setItem(ACTIVE_STYLE_BUNDLE_STORAGE_KEY, id);
  } catch {
    // Private storage modes still retain the choice for this document.
  }
  window.__toonlabActiveStyleBundleId = id;
  window.__toonlabStyleBundleOptions = options;
  window.dispatchEvent(new CustomEvent(ACTIVE_STYLE_BUNDLE_EVENT, { detail }));
  return detail;
}

export async function listLocalStyleBundleOptions({ fetchImpl = window.fetch.bind(window) } = {}) {
  const options = new Map([
    [DEFAULT_STYLE_BUNDLE_OPTION.id, DEFAULT_STYLE_BUNDLE_OPTION],
  ]);
  try {
    const response = await fetchImpl('/api/toonlab/library', {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return [...options.values()];
    const payload = await response.json();
    for (const entry of payload.entries ?? []) {
      if (!isStyleBundle(entry) || !entry.id || entry.id === DEFAULT_STYLE_BUNDLE_OPTION.id) {
        continue;
      }
      options.set(entry.id, {
        id: entry.id,
        label: entry.label || entry.name || entry.id,
        scope: 'local',
      });
    }
  } catch {
    // Static OSS builds have no workspace API and expose the built-in bundle.
  }
  return [...options.values()];
}

export async function loadActiveStyleBundlePreference(options = {}) {
  const bundleOptions = await listLocalStyleBundleOptions(options);
  const id = resolveActiveStyleBundleId(readStoredStyleBundleId(), bundleOptions);
  const selected = bundleOptions.find((option) => option.id === id)
    ?? DEFAULT_STYLE_BUNDLE_OPTION;
  return publishActiveStyleBundle({
    id: selected.id,
    label: selected.label,
    options: bundleOptions,
  });
}
