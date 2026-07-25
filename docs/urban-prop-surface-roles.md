# Urban prop surface roles

Urban prop assets and urban prop shaders share one portable material contract:
**classify once, shade many times**.

An asset declares what kind of surface each material represents. A shader
decides how that role looks in its own style. Switching from one shader preset
to another must not require reclassifying the asset.

This contract is used by the Urban Prop Shader benchmark and is the authoring
target for generated, imported, and hand-authored prop models.

## The ownership boundary

| Owner | Stores | Must not store |
|---|---|---|
| Asset / GLB | Stable `urbanSurface` role, source color and PBR maps, optional masks | Pastel amount, cel thresholds, palette overrides, reflection strength, time-of-day values |
| Shader definition | Global look settings and a profile for each supported surface role | Asset-specific mesh names or one-off color corrections |
| Scene | Lights, environment, exposure, weather, time of day | Permanent material classification |
| Optional asset override | A documented exception when the source material is genuinely ambiguous | A replacement look preset |

The role is semantic metadata, not a screenshot-matching instruction. A black
solar panel remains `technicalSurface` in every style. One shader may render it
with broad anime reflections and another with narrow ink highlights, but
neither shader should relabel it.

## Canonical roles

`urbanSurface` accepts these exact, case-sensitive IDs:

| Role | Use it for | Shader behavior it should enable |
|---|---|---|
| `paintedMetal` | Main painted metal shells and panels | Preserve source identity; allow paint flattening, cel bands, restrained pastel lift, wear, and metal response |
| `paintedTrim` | Painted frames, braces, grates, and structural trim whose darker value should remain distinct | Inherit painted-metal behavior with a darker value range and stronger edge/material response |
| `bareMetal` | Unpainted handles, rails, hinges, pipes, and exposed steel or aluminum | Keep a neutral metal base; retain roughness variation and reflections; treat rust as an overlay rather than the base color |
| `rubber` | Tires, seals, bumpers, and other non-metal black rubber | Permit true black; use low metalness, broad low-energy response, and little pastel lift |
| `lid` | Large dark prop covers whose broad planes require a deliberately controlled sheen | Preserve the source-dark identity and expose broad-plane sheen controls without turning the lid into a bright gray plate |
| `graphicPanel` | Signs, posters, billboards, decals, printed graphics, and readable text | Preserve source texels and legibility; suppress paint extraction, macro UV offsets, wear reconstruction, and aggressive pastel shifts |
| `technicalSurface` | Solar cells, electronics, displays, control panels, and instrument faces | Preserve source hue/value and fine patterns while allowing material-appropriate view reflection and roughness response |

These are **render roles**, not a replacement for PBR data. The source
metalness, roughness, normal, AO, emissive, and color maps still describe the
surface within its role.

### Choosing between the easily confused roles

- Use `graphicPanel` when the texture carries semantic content that must remain
  readable.
- Use `technicalSurface` when the repeated or fine texture describes a device
  surface and should still react to view and environment light.
- Use `paintedMetal` for the surrounding painted housing.
- Use `bareMetal` only when the material itself is exposed metal. Rust on blue
  paint does not make the whole panel `bareMetal`.
- Use `lid` only for the broad cover treatment. A small hinge on that lid is
  still `bareMetal`, and a rubber bumper remains `rubber`.

If one material or atlas spans incompatible roles, split it into separate
materials or provide a dedicated mask. Do not pick whichever role happens to
make the current shader look best.

## Authoring metadata

Explicit metadata is authoritative. Put `urbanSurface` in glTF `extras` on the
material or mesh/node:

```json
{
  "name": "MAT_solar_cells",
  "extras": {
    "urbanSurface": "technicalSurface"
  }
}
```

Three.js exposes glTF extras through `userData`:

```js
mesh.userData.urbanSurface = 'paintedMetal';
material.userData.urbanSurface = 'graphicPanel';
```

A mesh/node value applies to all of its materials. A material value is more
precise for multi-material meshes. Prefer material metadata when only one
material needs the role.

For DCC exports, add a custom property named `urbanSurface` and enable export
of custom properties. Reopen the exported GLB and inspect `userData`; do not
assume the exporter preserved the property.

## Naming fallback

Metadata should be used for production assets. Canonical role tokens in names
are a portable fallback:

```text
MAT_body_paintedMetal
MAT_frame_paintedTrim
MAT_handle_bareMetal
MAT_tire_rubber
MAT_cover_lid
MAT_advert_graphicPanel
MAT_solar_technicalSurface
```

The reference classifier resolves roles in this order:

1. Material `userData.urbanSurface`
2. Mesh/node `userData.urbanSurface`
3. An exact canonical role token in a mesh, parent, or material name
4. Conservative semantic name inference
5. `paintedMetal`

Name inference exists to make unprepared third-party GLBs inspectable. It is
not a substitute for authoring metadata. Treat an inferred result as something
to audit before shipping.

## Custom shader settings

Each shader should support the stable role list through a role-profile table.
Do not create a complete independent shader for every role, and do not put
shader settings into the GLB.

Use three layers:

1. **Global look settings** — cel bands, shadow treatment, exposure response,
   palette policy, line work, global reflection scale, and time-of-day
   behavior.
2. **Role profiles** — sparse defaults or multipliers for source-color
   authority, paint extraction, pastel eligibility, material response,
   roughness breakup, reflections, Fresnel, wear, and value limits.
3. **Rare material overrides** — a last resort for an ambiguous or exceptional
   source material, stored separately from the reusable shader preset.

```js
const urbanShader = {
  global: {
    pastelPush: 0.10,
    shadowPastel: 0.80,
    reflectionStrength: 0.62,
  },
  roles: {
    paintedMetal: {
      pastelScale: 1,
      paintExtractionScale: 1,
    },
    graphicPanel: {
      pastelScale: 0.12,
      paintExtractionScale: 0.12,
      sourceHueAuthority: 1,
      sourceValueAuthority: 1,
    },
    technicalSurface: {
      pastelScale: 0,
      paintExtractionScale: 0,
      viewReflectionScale: 0.56,
    },
  },
};
```

Role profiles should inherit from a common base and override only the settings
that differ. A shader may ignore a setting or make two roles share a profile,
but it must not reinterpret an existing role to mean something else.

When developers create a new shader, they tune `global` and `roles`. They do
**not** reassign asset classifications.

## Adding a role

Adding a role is schema evolution, not shader customization. Add one only when
all of these are true:

- Multiple assets contain the same semantic surface.
- Existing roles cannot represent it without recurring per-asset hacks.
- At least two shader styles need to treat it differently.
- The role can be assigned from what the material *is*, not how one reference
  image happens to look.

Update the shared role enum, classifier, documentation, validation, and every
official shader's fallback table together. Unknown roles must produce a visible
validation warning and fall back safely; they must never silently select a
random style.

## Model-generation and import checklist

When an agent or developer creates or prepares a prop:

1. Inventory every distinct material zone.
2. Preserve the source albedo/color, normal, roughness, metalness, AO,
   emissive, opacity, and UVs.
3. Assign one canonical `urbanSurface` role per material.
4. Split materials or add a mask where readable graphics and reconstructed
   paint share one texture.
5. Export `urbanSurface` in glTF extras.
6. Reload the GLB and verify the resolved roles, not only the final beauty
   render.
7. Test at more than one time of day and camera angle so uniform highlights,
   lost roughness, and false recoloring are visible.

The asset passes when its identity survives multiple shader presets without
role edits. A shader passes when the same profile works across unrelated assets
without model-name conditionals.
