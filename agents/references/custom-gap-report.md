# Custom Asset and Shader Gap Reports

Custom work is feedback, not an invisible fallback. Before adding it, use
`record_asset_gap` or `createAssetGapRecord()` and record:

- Target and rendering domain.
- Relevant style-bundle slot.
- MCP searches, queries, candidate IDs, and rejection reasons.
- Why permitted library, gallery, external, or procedural routes failed.
- What custom model, texture, shader, or adapter was introduced.
- Provenance, license, generator/recipe/seed where relevant, and approver.
- The concrete question or improvement request for the ToonLab developer.

The MCP server maintains `.toonlab/reports/style-asset-gaps.json` and the
project-level `TOONLAB_ASSET_GAPS.md`. Commit or attach both when the project
uses custom rendering or content because the supported library was
insufficient.
