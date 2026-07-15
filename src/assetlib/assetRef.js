// Normalized third-party asset references — the one shape every CC0 source
// client (Poly Haven, ambientCG, …) produces, so the lab UI, catalog entries,
// and the MCP tools filter and display them identically:
//
//   {
//     source: 'polyhaven',              // client id
//     id: 'wooden_crate_01',            // source-native id
//     kind: 'model',                    // model | texture | hdri
//     name: 'Wooden Crate 01',
//     categories: ['furniture'],
//     tags: ['crate', 'wood'],
//     authors: ['Kirill Sannikov'],
//     thumbnailUrl: 'https://…',        // the source's own preview render
//     pageUrl: 'https://…',             // human page, used for attribution links
//     attribution: { license: 'CC0', sourceLabel: 'Poly Haven', sourceUrl: '…' },
//     …source-specific extras (polycount, maxResolution, downloads, …)
//   }
//
// Everything here is pure data-in/data-out (no fetch, no three) so it runs
// in the browser, in Node MCP tools, and in verify scripts unchanged.

export const ASSET_REF_KINDS = Object.freeze(['model', 'texture', 'hdri']);

/** Identify-yourself header value the Poly Haven API ToS asks for (Node
 * callers only — browsers send the page Referer instead and cannot set UA). */
export const ASSETLIB_USER_AGENT = 'toonlab-assetlib (+https://github.com/call-me-sensei/toonlab)';

/** Source-native ids → catalog-safe id segments ("ArmChair_01" → "armchair-01"). */
export function slugifyAssetId(id) {
  return String(id ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Shared search over normalized refs — mirrors catalog.list() semantics
 * (free text over id/name/tags/categories; exact kind/category match).
 */
export function filterAssetRefs(refs, { text = null, kind = null, category = null } = {}) {
  const query = text ? String(text).toLowerCase() : null;
  const results = [];
  for (const ref of refs ?? []) {
    if (kind && ref.kind !== kind) continue;
    if (category && !ref.categories.includes(category)) continue;
    if (query) {
      const haystack = `${ref.id} ${ref.name} ${ref.tags.join(' ')} ${ref.categories.join(' ')}`.toLowerCase();
      if (!haystack.includes(query)) continue;
    }
    results.push(ref);
  }
  return results;
}

/** Distinct categories across refs, most-used first (the lab's filter chips). */
export function collectAssetCategories(refs) {
  const counts = new Map();
  for (const ref of refs ?? []) {
    for (const category of ref.categories) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

/**
 * Nearest available resolution key ('1k' | '2k' | …) to the wanted one.
 * Exact match wins; otherwise the closest by pixel count, preferring the
 * smaller side on ties (imports should err cheap).
 */
export function pickResolution(available, wanted = '1k') {
  const keys = Object.keys(available ?? {});
  if (keys.length === 0) return null;
  if (available[wanted]) return wanted;
  const parse = (key) => Number.parseInt(key, 10) || 0;
  const target = parse(wanted);
  return keys.sort((a, b) => {
    const da = Math.abs(parse(a) - target);
    const db = Math.abs(parse(b) - target);
    return da - db || parse(a) - parse(b);
  })[0];
}
