import { createAssetGapRecord } from '../asset-policy/index.js';
import { resolveStyleBundleSettings, validateStyleBundleDocument } from './styleBundle.js';

export const STYLE_DOMAIN_SLOT_ROUTES = Object.freeze({
  character: 'toon',
  cloud: 'cloud',
  equipment: 'toon',
  'manufactured.environment': 'environment',
  'natural.debris': 'debris',
  'natural.rock': 'rock',
  post: 'post',
  prop: 'toon',
  sky: 'sky',
  'terrain.ground': 'groundShader',
  'vegetation.flower': 'flowerShader',
  'vegetation.grass': 'grassShader',
  'vegetation.tree': 'treeShader',
  water: 'water',
  weather: 'weather',
});

export const STYLE_TARGET_DOMAINS = Object.freeze(
  Object.keys(STYLE_DOMAIN_SLOT_ROUTES),
);

function issue(code, message, targetId, severity = 'error') {
  return { code, message, severity, targetId };
}

function normalizeTargets(targets) {
  return Array.isArray(targets) ? targets : [];
}

/**
 * Build a complete application plan without mutating any target. A domain is
 * always explicit; object names, texture colors, and scene parenting are not
 * classification inputs.
 */
export function auditStyleBundleApplication(bundleInput, targetsInput, {
  allowCustomAdapters = true,
} = {}) {
  const validation = validateStyleBundleDocument(bundleInput);
  if (!validation.ok) {
    return {
      gaps: [],
      issues: validation.errors.map((message) => issue('invalid-bundle', message, null)),
      ok: false,
      plan: [],
      settings: {},
    };
  }
  const settings = resolveStyleBundleSettings(validation.value);
  const issues = [];
  const plan = [];
  const gaps = [];
  const ids = new Set();
  for (const [index, target] of normalizeTargets(targetsInput).entries()) {
    const targetId = String(target?.id ?? `target-${index}`).trim();
    if (!targetId) {
      issues.push(issue('missing-target-id', 'Every style target needs a stable id.', null));
      continue;
    }
    if (ids.has(targetId)) {
      issues.push(issue('duplicate-target-id', `Style target id "${targetId}" is duplicated.`, targetId));
      continue;
    }
    ids.add(targetId);
    const domain = String(target?.domain ?? '').trim();
    const slot = STYLE_DOMAIN_SLOT_ROUTES[domain];
    if (!slot) {
      issues.push(issue('unknown-domain', `Style target "${targetId}" has unknown domain "${domain || '(missing)'}".`, targetId));
      continue;
    }
    if (!Object.hasOwn(settings, slot)) {
      issues.push(issue('missing-slot', `Bundle does not define required slot "${slot}" for target "${targetId}".`, targetId));
      continue;
    }
    if (target?.labels?.mixedMaterials === true && !target?.labels?.materialIdMask) {
      issues.push(issue('mixed-materials-without-mask', `Target "${targetId}" mixes material roles without a material ID mask.`, targetId));
      continue;
    }
    const apply = typeof target?.apply === 'function'
      ? target.apply
      : typeof target?.adapter?.apply === 'function'
        ? target.adapter.apply.bind(target.adapter)
        : null;
    if (!apply) {
      issues.push(issue('unsupported-renderer', `Target "${targetId}" needs an explicit apply callback or adapter.`, targetId));
      continue;
    }
    const custom = target?.custom === true || target?.adapter?.custom === true;
    if (custom) {
      const severity = allowCustomAdapters ? 'warning' : 'error';
      issues.push(issue('custom-adapter', `Target "${targetId}" uses a custom style adapter and must be documented.`, targetId, severity));
      gaps.push(createAssetGapRecord({
        bundleSlot: slot,
        customImplementation: { adapter: target?.adapter?.id ?? 'inline' },
        domain,
        feedbackNeeded: 'Review whether this behavior should become a supported ToonLab adapter.',
        id: `custom-style-adapter-${targetId}`,
        kind: 'custom-shader-adapter',
        reason: 'The public runtime has no supported adapter for this renderer.',
        targetId,
      }));
    }
    plan.push({
      apply,
      domain,
      settings: settings[slot],
      slot,
      subject: target?.subject,
      target,
      targetId,
    });
  }
  return {
    bundle: validation.value,
    gaps,
    issues,
    ok: !issues.some(({ severity }) => severity === 'error'),
    plan,
    settings,
    warnings: validation.warnings ?? [],
  };
}

export class StyleBundleApplicationError extends Error {
  constructor(audit) {
    super(audit.issues.map(({ message }) => message).join(' '));
    this.audit = audit;
    this.name = 'StyleBundleApplicationError';
  }
}

/**
 * Apply only after every target has passed preflight. `strict` rejects the
 * full operation before the first mutation; `advisory` skips invalid targets
 * and returns their issues.
 */
export async function applyStyleBundle(bundle, {
  allowCustomAdapters = true,
  mode = 'strict',
  targets = [],
} = {}) {
  if (!['strict', 'advisory'].includes(mode)) {
    throw new Error('Style bundle application mode must be "strict" or "advisory".');
  }
  const audit = auditStyleBundleApplication(bundle, targets, { allowCustomAdapters });
  if (mode === 'strict' && !audit.ok) throw new StyleBundleApplicationError(audit);
  const applied = [];
  for (const entry of audit.plan) {
    await entry.apply(entry.subject, entry.settings, {
      bundle: audit.bundle,
      domain: entry.domain,
      slot: entry.slot,
      target: entry.target,
    });
    applied.push({ domain: entry.domain, slot: entry.slot, targetId: entry.targetId });
  }
  return {
    ...audit,
    applied,
    ok: mode === 'advisory' ? audit.ok : true,
  };
}
