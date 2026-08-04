# Dandewa Painted Anime Sky release review

Status: **blocked — do not upload, mirror, extract, thumbnail, or seed**

Reviewed on: 2026-08-03

Candidate license ID: `LicenseRef-DENDEWA-ASSETS-2026-04-07`

Canonical site terms: <https://dendewa.vercel.app/legal/assets-license>

The public site terms appear to allow modification, commercial use, and
redistribution with credit. That is useful evidence, but it does not establish
which author/license category governs the Painted Anime Sky pack, whether its
README narrows those terms, or whether public per-file redistribution and
copied previews are allowed. The source download also presents a security
check; ToonLab must not bypass it.

## Evidence still required

- Obtain the original archive through the normal upstream download flow.
- Identify the creator and whether the pack is original Dandewa work or a
  contributed asset.
- Preserve every README, license, copyright notice, and upstream dependency
  notice exactly as distributed.
- Record a SHA-256 for the original archive and every retained notice.
- Confirm permission for all of these independently:
  - Public mirroring of the untouched ZIP.
  - Public downloads of extracted individual files.
  - Copied artwork in catalog thumbnails/previews.
  - Searchable catalog discovery and continued hosting by an open-source
    project.
- If the pack or creator terms do not explicitly cover every item, obtain
  written permission from the actual creator.

## Release record required to unblock

The release manifest must retain:

- Permission evidence reference.
- License URL and reviewed version/date.
- Pack README SHA-256.
- Reviewer identity.
- Allowed redistribution scope.
- Exact required credit.
- Upstream source page and creator identity.
- Original archive filename and checksum.

The checked-in reviewed-license policy intentionally has `approved: false`
and both redistribution flags disabled. The catalog seed generator rejects the
candidate ID until the evidence is checked in and those explicit flags are
changed. No Dandewa catalog row or R2 object belongs in a release before then.

If the gate remains blocked, ToonLab may link to the upstream source page with
a generic ToonLab-created thumbnail. It must not copy the archive, extracted
files, or original artwork.
