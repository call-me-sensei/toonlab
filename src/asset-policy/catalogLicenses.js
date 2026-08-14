export const APPROVED_CATALOG_SPDX_LICENSES = Object.freeze([
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'MIT',
]);

// Custom terms are deny-by-default. Applications may maintain their own
// reviewed registry, but ToonLab ships no vendor-specific custom-license
// approvals or pending vendor records.
export const REVIEWED_CATALOG_LICENSES = Object.freeze({});

export function resolveCatalogLicense(id) {
  const licenseId = String(id ?? '').trim();
  if (APPROVED_CATALOG_SPDX_LICENSES.includes(licenseId)) {
    return {
      approved: true,
      extractedFileRedistribution: true,
      id: licenseId,
      originalArchiveRedistribution: true,
      spdx: true,
      status: 'approved',
    };
  }
  return REVIEWED_CATALOG_LICENSES[licenseId] ?? null;
}

export function assertCatalogLicenseRelease({ id, redistributionScope, evidence } = {}) {
  const policy = resolveCatalogLicense(id);
  if (!policy) throw new Error(`${id || '(missing license)'} is not in the reviewed-license registry`);
  if (!policy.approved) throw new Error(`${id}: reviewed-license policy is ${policy.status ?? 'not approved'}`);
  if (redistributionScope !== 'external-only' && !policy.originalArchiveRedistribution) {
    throw new Error(`${id}: original-archive redistribution is not approved`);
  }
  if (redistributionScope === 'archive-and-files' && !policy.extractedFileRedistribution) {
    throw new Error(`${id}: extracted-file redistribution is not approved`);
  }
  if (!policy.spdx && !(evidence ?? policy.approvalEvidence)) {
    throw new Error(`${id}: custom licenses require checked-in approval evidence`);
  }
  return policy;
}
