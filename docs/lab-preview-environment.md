# Universal lab preview environment

Every canonical ToonLab lab must expose the same time-of-day preview harness.
An artifact cannot be approved from one fixed neutral light.

The canonical development contract is
`toonlab/lab-preview-environment`, version 1, defined in
`labs/shared/previewEnvironmentContract.js`.

## Reference rollout

Rock Shader Lab is the first implementation and the quality-control reference
for this contract. Complete and approve its behavior before replicating the
shared control and scene adapter to another lab. Reuse the contract and shared
components; do not copy private values into each editor.

Ground, Tree, Grass, and Flower Shader Labs now use the same shared P18 scene
adapter as their migration baseline. This implementation work does not promote
them to Ready; each is **In progress** until its complete public contract,
additional fixtures, renderer gates, and visual review are explicitly
approved.

Its initial scene is the accepted P18 outdoor comparison composition, copied
as one coupled checkpoint: ground, grass, pine, flowers, manufactured props,
sky, clouds, camera, lighting, and the original non-baked Spire 05 LOD0
geometry. The rock uses the live editable Call Me Sensei graph. Do not replace
this scene with a newer, similar, or more convenient checkpoint.

The **Preview styles** modal is the reference cross-domain comparison
interaction. It selects one complete style bundle, then optionally overrides
registered context domains such as Ground, Grass, Tree, Flowers, Objects,
Sky, Clouds, and Lighting. “From bundle” removes an override. Bundle
selection and all individual overrides are preview-only and never enter the
authored shader document.

The default mode shows the full coupled composition so domain interactions
remain visible. Each shader lab also provides an isolation mode and
component-visibility controls. Isolation is a viewing aid, not a replacement
scene, and it does not alter the P18 baseline or the exported shader profile.

Every shader lab also exposes **Preview assets**. P18 remains the default
immutable fixture, while the modal can select additional procedural,
project/saved, or imported assets for the authored domain. Selected asset,
recipe, seed, palette, geometry, texture inputs, and placement are preview
state. Switching assets must reapply the same shader profile, rerun
material-role coverage, and leave P18 available as the fallback. The selector
is required even when a domain currently ships only one fixture, because the
lab is incomplete until representative types can be added without changing
its shader document format.

Adoption requires all three layers:

1. The shared UI control is present and changes continuous preview time.
2. The preview engine consumes the resolved state and changes the rendered
   light, shadow, and relevant environment response.
3. Visual captures prove the intended result. Debug metadata is supporting
   evidence, not visual approval.

An editor must not display a working-looking time selector while leaving its
preview rig unchanged. Its lab status remains Migration required until its own
fixtures and renderer paths pass.

For Rock Shader Lab, the clock must visibly update all of the following
together:

- direct-light direction, color, intensity, and shadow;
- diffuse sky-light color and energy;
- sky-dome and cloud-shell tint and energy;
- height-fog inscattering color and energy;
- time-aware ground, grass, tree, flower, and prop material inputs.

Tinting only the light while leaving static blue height fog is a failure:
distant fog can cover the dome and make Dawn, Day, Sunset, and Night appear to
have the same sky.

## Required controls

Every lab provides:

1. A continuous 0–24 hour control.
2. One-click Dawn (06:00), Day (13:00), Sunset (18:00), and Night (22:00)
   reference states.
3. Freeze and automatic-cycle modes.
4. The currently resolved time, light, and shadow state in automation/debug
   metadata.
5. A four-state capture/compare action for visual regression.

The time selector is preview state. It is never serialized into a rock,
character, asset, shader, VFX, SFX, animation, or other unrelated artifact.
Style profiles may save **how they respond** across the day; the current hour
belongs to the preview or host scene.

## Reference daylight requirement

At the Day reference state:

- direct sunlight is neutral-to-warm;
- ambient/sky fill is cool;
- cast and self-shadow treatment is visibly blue/cool rather than black,
  neutral gray, or only a darkened albedo;
- shadow detail remains readable;
- the same response is visible across character, rock, vegetation, terrain,
  manufactured, transparent, decal, water, VFX, and imported-asset fixtures.

The reference harness supplies `#647fbd` as its daylight shadow-tint target.
The final Call Me Sensei profile may tune the exact curve, but it must retain
the approved cool-shadow relationship. A lab must expose a shadow/debug view
or comparison crop that makes the result unambiguous.

For Rock Shader Lab, the cool-shadow target stays in the preview environment,
not in the portable rock shader. The rock shader owns the rock surface
response; the preview owns the current hour, sun, diffuse fill, atmosphere,
and reference illumination.

## What changes with time

The shared preview environment publishes the current reference state to all
relevant consumers:

- sun/moon direction, color, intensity, and shadow direction;
- cool/warm ambient fill and shadow-tint input;
- sky, cloud, atmosphere, fog, and exposure;
- emissive/lamp response;
- weather rendering and accumulated surface-layer preview;
- water reflection/refraction and underwater context;
- vegetation wind/color gates and ambient VFX gates;
- SFX, soundscape, music, and dialogue context where the authored recipe
  responds to time.

A lab consumes only relevant inputs but still shows the same clock so
cross-lab captures remain comparable.

## Acceptance matrix

Every Ready lab must pass Dawn, Day, Sunset, and Night on:

1. an easy first-party fixture;
2. a difficult first-party fixture;
3. an accepted open/imported fixture when the domain accepts external assets;
4. the Call Me Sensei style bundle;
5. every supported renderer/device quality tier;
6. normal view plus the relevant debug views.

The Day capture must explicitly verify the cool/blue shadow relationship.
Failures keep both Lab and/or npm-library status below Ready, depending on
whether the problem is editor-only or in the portable runtime contract.

## Non-visual labs

Pipeline, audio, and data-oriented labs still expose the clock in their preview
or regression pane:

- sound recipes can be auditioned under day/night context and gates;
- scene coverage and routing audits can rerun the four-state matrix;
- export and release labs can verify that captures remain stable;
- pure metadata panels may keep the clock in the shared preview header even
  when the selected artifact has no time-dependent behavior.

This keeps the test environment universal without polluting unrelated
portable documents.
