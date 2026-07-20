# Lab responsibilities

ToonLab separates authoring tools by the lifetime and reuse scope of the
artifact they produce. A lab is not named after every shader program it happens
to use; it is named after the reusable thing a developer saves and ships.

## What “shader” means here

A shader is GPU code plus a stable parameter contract that defines how a class
of materials responds to light, view direction, shadows, and other world
inputs. The shader implementation may have several technical variants, while
one saved profile supplies the coherent art direction for an IP.

The shader profile does not own an asset's geometry, textures, base color, or
species. It also does not own the scene's current sun, wind, wetness, or snow.
Those values are inputs to the profile.

## Catalog groups

| Group | Saved artifact | Labs | Responsibility |
|---|---|---|---|
| Shader Labs | An IP-wide rendering profile | Character Shader Lab, Vegetation Shader Lab, Environment Shader Lab | Reusable material treatment across many compatible assets. |
| Asset Labs | A model, texture, or asset recipe | Rock Lab, Tree Lab, Flower Lab, Grass Lab, Debris Lab, Texture Lab | Geometry, species/shape identity, material data, and export. |
| World Systems | A complete runtime-system preset | Water Lab, Sky Lab | Coupled appearance, animation/simulation, runtime integration, and quality behavior. |
| Playgrounds & demos | No production preset of their own | Playground, Water Playground, Outdoor World, VFX Arena, Fauna Demo, Ambient VFX Demo | Validate authored artifacts in gameplay-scale scenes. |

Weather Lab and Lighting Lab are direct supporting editors for their npm
systems. They are not shader profiles: Weather coordinates current world
state, while Lighting authors light rigs and day-cycle behavior.

## Why Water and Sky are not separate Shader Labs

Water and sky both contain substantial GPU shading, but their useful shipping
artifact is larger than a material profile.

- A Water preset keeps surface color, refraction, reflections, and foam
  together with waves, shoreline behavior, ripples, splashes, underwater
  response, and quality limits. Its Surface, Foam, and Lighting groups are the
  embedded water-shader controls.
- A Sky preset keeps the gradient, horizon scattering, sun, procedural clouds,
  stars, and animation behavior together. Its
  Gradient, Sun, Clouds, and Stars groups are the embedded sky-shader controls.

Splitting either system into a second shader lab would create two documents
that must be kept compatible and would make ownership of shared parameters
unclear. The system lab therefore owns one versioned preset and exposes its
shader/appearance section explicitly.

## Parameter scope

| Scope | Examples | Saved by |
|---|---|---|
| IP shader profile | Cel bands, shadow-color treatment, thin-surface response, role-specific bark or petal lighting | Character, Vegetation, or Environment Shader Lab |
| Runtime-system preset | Water spectrum and surface response; sky gradient, sun disc, cloud shapes, star field, and cloud motion | Water or Sky Lab |
| Asset/material | Grass base/tip/shadow palette, flower species colors, bark texture, mesh topology | Asset Lab document |
| Scene/world state | Current time, sun direction, weather, wind, wetness, snow, exposure | Host game, Weather, or Lighting system |
| Instance/interaction | Placement, seed, scale, bend target, splash source | Host game or preview scene |

Every lab keeps the IP style axis visually and semantically separate from its
own preset/scenario axis. `Call Me Sensei` belongs in **Style**; it must apply
over `Boulder`, `River`, `Thunderstorm`, and other domain presets rather than
appearing beside them as another preset. Legacy APIs may continue accepting a
style id in a `preset` field, but lab pickers and new code use explicit
`style × preset` state.

Lab previews may expose scene and instance controls so an artifact can be
tested, but preview-only values are labeled and excluded from exported preset
documents. Sky-dome radius remains a runtime constructor option for
compatibility, but because the dome is pinned to the far plane it has no
art-direction effect and is not surfaced or saved by Sky Lab.

System presets may carry authored fallback sun/sky values so Water or Sky
renders coherently in isolation. In a composed world those are baselines, not
competing owners: Lighting installs priority-100 Sky/Water layers and drives
the world sun-direction adapter; Weather supplies Lighting modulation plus
priority-200 Sky/Water layers; a manual scene layer is priority 300. Portable
`settings` remain unchanged and effective `renderedSettings` stay inspectable.
Each system clears only its own Symbol-keyed layer on teardown.

World Systems also own deployment behavior without confusing it with art. Sky
quality is a non-portable compile-time preview/device tier. Water retains a
portable preferred quality default for compatibility, but hosts choose the
actual tier when constructing the surface. Neither is a reason to split out a
second shader document.

## npm boundary

Labs are development tools and are not published in the npm package. Every
artifact they produce maps to a public runtime import:

```text
Character Shader Lab   -> @call-me-sensei/toonlab/toon
Vegetation Shader Lab  -> @call-me-sensei/toonlab/vegetation
Environment Shader Lab -> @call-me-sensei/toonlab/environment
Water Lab              -> @call-me-sensei/toonlab/water
Sky Lab                -> @call-me-sensei/toonlab/sky
```

The package owns settings normalization, schemas, preset registries, versioned
document validation and serialization, runtime application, and lifecycle
methods. The lab is a consumer of those APIs; it must not maintain a private
copy of the production contract.

`@call-me-sensei/toonlab/styles` can embed the typed documents produced by
these labs. Its `vegetationShader`, `grass`, `water`, and `sky` slots validate
the corresponding public document type and resolve it to runtime settings, so
a published style bundle does not depend on a browser lab's private storage.
