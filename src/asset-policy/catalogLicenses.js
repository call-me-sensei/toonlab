export const APPROVED_CATALOG_SPDX_LICENSES = Object.freeze([
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'MIT',
]);

// Custom terms are deny-by-default. A release reviewer must check in the
// permission evidence and explicitly enable each redistribution surface.
export const REVIEWED_CATALOG_LICENSES = Object.freeze({
  'LicenseRef-DENDEWA-ASSETS-2026-04-07': Object.freeze({
    approvalEvidence: null,
    approved: false,
    attributionText: 'Credit the original asset creator and link the applicable Dandewa asset page and license.',
    canonicalUrl: 'https://dendewa.vercel.app/legal/assets-license',
    commercialization: 'The site-wide terms appear to allow commercial use, subject to the applicable asset README and creator terms.',
    extractedFileRedistribution: false,
    id: 'LicenseRef-DENDEWA-ASSETS-2026-04-07',
    modification: 'The site-wide terms appear to allow modification, subject to the applicable asset README and creator terms.',
    originalArchiveRedistribution: false,
    requiredNotices: ['Original pack README', 'Applicable license notice', 'Creator attribution'],
    reviewDate: '2026-08-03',
    status: 'pending-evidence',
    version: 'Site license page reviewed 2026-08-03',
  }),
});

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
