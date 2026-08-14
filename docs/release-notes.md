# ToonLab 0.4.19 release notes

This release publishes an explicit capability and limitation contract for
developers using ToonLab with or without a coding agent. It records the
supported first-pass Call Me Sensei workflow, the host-owned scene-authoring
boundary, strict fail-closed behavior, measured imported-asset readiness, and
the required verification sequence. See [What ToonLab 0.4.19 can and cannot
do](capability-status.md).

This release exposes fifteen user-facing Labs, matching OSS and Pro editor
navigation, portable creation types, MCP feature descriptions, and focused npm
runtime entry points.

Highlights include:

- Gallery-style private Library discovery by name, description, type, and
  durable normalized tags across browser UI, local/hosted persistence, and
  OSS/Pro MCP, including tag-aware save and edit flows. Version 0.4.19 makes
  the slug grammar canonical across every save, edit, and exact-tag query,
  migrates existing tags, supports empty-tag clearing, provides complete
  paginated Pro results and uncapped tag facets, and directly instructs coding
  agents to save useful semantic tags;
- a checksum-pinned reconciliation path for the one known pre-release August
  catalog snapshot, allowing early local development databases to update to
  the immutable 480-asset release while every unknown seed mutation still
  fails closed;
- automatic reversible collision discovery for labeled static solids, trunk-
  scoped generated-tree blockers, walkable-character auto-binding, strict
  readiness diagnostics, and lightweight plus Rapier adapter paths;
- one authoritative sun/cloud receiver response across ground, grass, trees,
  flowers, characters, rocks, manufactured props, water, shoreline foam, and
  breaker foam, with direct-sun glints suppressed in shadow;
- visible Sky System clouds publishing their baked volumetric transmittance to
  the same receiver field instead of unrelated per-material procedural noise;
- deterministic generated-tree bark selection that preserves authored maps,
  otherwise applies the registered Call Me Sensei fissured-bark fallback, plus
  exact all-tree caster/receiver coverage gates;
- consistent Lab home/editor navigation and Help → Documentation access;
- the built-in Call Me Sensei Style Bundle;
- a 480-template Stylized rock catalog whose GLBs are editable starting meshes;
- separate procedural Rock generation with and without a physical template;
- independent rock surface, top finish, texture, weathering, composition, and
  preview-grass controls;
- portable Lab documents and expanded MCP inspection/mutation support;
- current documentation for all fifteen live Labs.

See [The 15 live ToonLab Labs](live-labs.md) for the public product boundary.
