# Cloud shader

> **Experimental in the current product boundary.** The portable settings and
> compatibility runtime remain available for lab cleanup and qualification,
> but Cloud authoring and complete sky/world composition are not yet a
> recommended production workflow. See
> [What ToonLab is ready for today](capability-status.md).

`@call-me-sensei/toonlab/cloud` defines the reusable appearance of an
authored sky-dome cloud stack. Cloud Shader is an independent style-bundle
domain. It is not a sky-gradient preset, weather condition, generated cloud
asset, cloud-shadow field, or preview-scene configuration.

The Call Me Sensei default is initialized from the accepted P18 comparison:

- the source sky dome and sky color atlas provide sky context;
- a distant cloud texture is screen-blended into the sky gradient;
- a separate cloud-shell mesh samples its authored cloud texture;
- the texture red channel addresses the authored cloud color atlas;
- the texture alpha channel supplies the cloud-shell silhouette;
- the P18 UV offsets, vertical stretches, strengths, tints, basis rotation,
  source scales, and source assets remain the reset baseline.

Cloud Shader Lab must render that stack directly. A generic procedural-noise
sky is not an acceptable visual substitute for the Call Me Sensei profile.

## Profile versus source assets

The shader profile and its source assets are separate artifacts.

The profile owns reusable treatment values such as foreground/background
balance, tint, opacity, UV placement, alpha response, and drift. The renderer
or host supplies:

- sky and cloud-shell geometry;
- background-cloud and cloud-shell textures;
- sky and cloud color atlases;
- source basis, scale, and texture color-space metadata;
- time, weather, fog, precipitation, camera, and scene lighting.

This separation lets one shader style be reviewed against multiple cloud
source sets without embedding licensed or project-local asset paths in a
portable npm document. A future Cloud Source Asset Lab may author those source
sets; it must not be merged into Cloud Shader Lab.

## Exact ownership

Cloud Shader owns 31 live, serializable settings in four groups:

| Group | Fields |
| --- | --- |
| Composition | Background strength and opacity; cloud-shell strength, opacity, and coverage bias |
| Shape | Background vertical offset/stretch; cloud-shell horizontal offset/scale, vertical offset/stretch, and edge contrast |
| Lighting | Background-cloud tint and cloud-shell tint |
| Motion | Cloud-shell rotation speed and runtime motion multiplier |

The public schema is `CLOUD_SHADER_SETTING_GROUPS` plus
`CLOUD_SHADER_FIELD_SCHEMA`. Every visible Lab control must update the
corresponding renderer uniform. The Lab must not show disabled placeholders or
preview controls that do not affect the active renderer.

Cloud Shader does **not** own:

- sky zenith, horizon, or below-horizon color;
- sun, moon, or star rendering;
- time of day or the selected clock hour;
- current weather, rain, snow, hail, lightning, dust, or fog;
- source mesh, texture, mask, atlas, or procedural-generation recipes;
- backend selection, camera, terrain, or preview framing;
- the world-projected cloud-shadow field.

The visible cloud dome and world-projected cloud shadows are related signals,
but they are not automatically the same texture space. Exact registration
requires an explicit host adapter. Weather may temporarily modulate scene
response without rewriting the authored Cloud Shader document.

## Settings and documents

```js
import {
  applyCloudShaderSettings,
  createCloudShaderSettings,
  createCloudShaderPresetDocument,
} from '@call-me-sensei/toonlab/cloud';

const settings = createCloudShaderSettings({
  preset: 'call_me_sensei',
  cloudShellCoverage: 0.08,
  cloudShellTint: [0.92, 0.97, 1],
});

// The target is a cloud-dome renderer supplied by the host. It must expose
// applyCloudShaderSettings(settings).
applyCloudShaderSettings(cloudRenderer, settings);

const document = createCloudShaderPresetDocument('soft_layered_clouds', {
  label: 'Soft Layered Clouds',
  settings,
});
```

`createCloudShaderSettings()` defaults to `call_me_sensei`. `default` is the
unchanged source-reference treatment. Both currently reset to the accepted P18
values; Call Me Sensei may diverge only through an explicit visual-approval
change.

Documents use `type: "toonlab/cloud-shader-preset"` and version `1`. Unknown
settings are ignored with warnings. Numeric fields clamp to the published
schema and colors serialize as RGB arrays.

The OSS package does not require a database. A project may commit the JSON,
store it in its own configuration, or reference a registered style from a
style bundle. Hosted persistence and collaboration are optional host services.

```js
import { createStyleBundleDocument } from '@call-me-sensei/toonlab/styles';

const bundle = createStyleBundleDocument('project-look', {
  slots: {
    sky: { style: 'call_me_sensei' },
    cloud: { style: 'call_me_sensei' },
    weather: { style: 'call_me_sensei' },
  },
});
```

The `cloud` slot accepts either `{ style }` or an inline
`toonlab/cloud-shader-preset` document. It stays independent from `sky` and
`weather` so developers can mix them deliberately.

## Cloud Shader Lab review contract

Cloud Shader Lab lives at `/cloud-shader-lab/` and starts with **Call Me
Sensei**. Its default Cloud Focus view must show the P18 sky and cloud layers
as the dominant image. It must not start on terrain, primitive test objects,
fog, precipitation, or a weather condition.
Cloud Shader Lab must never route into Atmospheric Condition Lab; conditions
are optional preview stress tests, not cloud shader documents.

The default preview rules are:

- P18 sky dome, background clouds, cloud shell, texture, and color atlases;
- sky and clouds visible together;
- cloud-focused camera tilted above the horizon;
- no terrain in Cloud Focus;
- Day at 13:00;
- no weather condition and no particles;
- all 31 shader controls live;
- P18 Framing available as a second camera view;
- Dawn, Day, Sunset, Night, and continuous time as preview-only inputs;
- weather-condition stress testing explicit and optional.

Changing time must visibly tint and attenuate the sky/cloud context without
changing the saved cloud profile. Selecting weather is a stress test, not a
style choice. Source-asset selection, when added, must also remain preview
state unless the user explicitly authors a separate source-asset document.

Cloud Shader Lab and the npm library have separate status. The Lab remains
**In progress** and the library remains **Migration required** until visual
acceptance, the reusable renderer migration, backend degradation,
cloud-shadow coordination, documentation, verification, and package review
are explicitly approved. A passing build alone does not make either status
Ready.
