---
name: lighting
description: Qualify project-owned lighting against ToonLab anime-game materials and shadow passes while respecting the public-package boundary. Use for missing cast shadows, flat outdoor scenes, clipped materials, mismatched sun/sky direction, exposure, or Call Me Sensei lighting reviews.
---

# Lighting Boundary

Lighting is not a stable ToonLab package entry point or style-bundle
slot. Do not import `@call-me-sensei/toonlab/lighting` and do not imply that
Call Me Sensei selects a complete lighting implementation.

Read `agents/references/anime-art-direction.md`,
`agents/references/runtime-entry-points.md`, and
`agents/references/custom-gap-report.md` first.

The host game owns lights, shadows, exposure, time of day, and renderer
configuration. Pass current light state only through documented scene adapters
for Toon, Environment, Ground, Vegetation, Water, Sky, and Weather. If a
project-local lighting adapter changes or supplements the selected anime
treatment, record it as a custom adapter gap with its owner and rationale.

## Required outdoor lighting contract

- Use at least one directional key whose direction matches the visible sky
  sun. Enable its cast shadow and frame the shadow camera around the complete
  hero composition, including cliff face, beach, water contact zone, trees,
  character, and ship—not only the plateau center.
- On WebGPU/node materials, create and update ToonLab's shared environment sun
  shadow pass after all casters are added. Invalidate or run it dynamically
  when a caster or sun moves. Native `renderer.shadowMap` alone does not feed
  every ToonLab TSL receiver.
- Create terrain through `createGroundShaderMesh()` or explicitly make custom
  terrain cast and receive shadows and join the ground field. Stable tree
  factories must return shadow-ready trunks and foliage. Rocks, manufactured
  assets, and characters must preserve cast/receive flags after shader
  conversion.
- Pass the same sun direction/color and sky fill into Ground, Vegetation,
  Water, Toon, and Environment adapters. A material that uses a stale default
  vector while the shadow map uses the host sun is a release failure.
- Keep a readable key-to-fill ratio: lit faces identify the sun side, shaded
  faces retain cool saturated albedo, and contact/cast shadows anchor forms
  without turning black. A smooth cliff with no light break or cast shadow is
  not acceptable even if the scene is technically illuminated.
- Qualify exposure with both near-white and dark textured assets. Reject clipped
  white hulls/rocks, gray veils, crushed cavities, or values that require a
  per-object exposure override. A repeated per-object correction means the
  material/preset intensity contract is deficient and must be fixed or logged.
- Verify a tree trunk/canopy shadow on ground, cliff shadow across beach and
  water, rock contact shadows, character grounding, ship self/contact shadow,
  and underwater attenuation. Inspect gameplay, opposing-light, shore,
  flyover, top-down, and underwater views.

The lighting boundary means ToonLab does not own the host's rig; it does not
relax these compatibility gates. Confirm lighting preserves the coordinated
anime look and does not push materials toward untreated PBR or unintended
photorealism. Record every manual lighting adjustment as a package-default,
scene-adapter, skill, or controlled-fixture deficiency.
