---
name: game-feel
description: Help developers add juice with ToonLab game feel — hit-stop/time warp, camera punch, squash, screen flash, audio cues, and haptics driven by named gameplay events.
---

# Game Feel

Use this skill when a developer wants impact feedback ("juice"): hit-stop,
slow-motion time warps, camera punches/shake, squash-and-stretch, screen
flashes, audio stingers, or controller haptics, coordinated per gameplay
event with cooldowns and concurrency budgets.

Public imports:
- `@call-me-sensei/toonlab/game-feel`

Read first:
- `docs/style-labs.md` (Game feel section)

Quickstart:

```js
import { createGameFeelRuntime, createGameFeelDomAdapters } from '@call-me-sensei/toonlab/game-feel';

const feel = createGameFeelRuntime({
  settings: preset,             // generated/saved preset, or raw settings
  cameraRig,                    // optional: camera punches route to rig.addImpulse
  adapters: createGameFeelDomAdapters({ flashElement }), // demo audio/flash; replace in production
});

feel.trigger('hit', { intensity: 1.2, target: enemyMesh });

// per frame — pass REAL delta, advance gameplay with the SCALED delta
const { delta: scaledDelta, timeScale } = feel.update(realDelta);
world.update(scaledDelta);
```

Developer guidance:
- The clock split is the whole point: `update(realDelta)` returns the scaled
  gameplay delta while camera/flash/haptics advance on real time. Never feed
  the scaled delta back into `feel.update`, and never apply `timeScale` a
  second time.
- Events and effects are registries — add project events
  (`registerGameFeelEventType('parry', …)`) and custom effect factories that
  drive the app's own VFX/particles instead of hard-coding responses in
  gameplay code.
- Squash (`scalePunch`) composes onto `target.scale` and restores it;
  don't also animate that object's scale during an effect.
- Haptics and audio are capability-gated adapters; the built-in gamepad
  vibration fallback works without setup, and unsupported effects are dropped
  with diagnostics in `stats()` rather than throwing.
- Cooldowns and concurrency budgets are enforced by the runtime — trigger
  freely from gameplay code and let the scheduler drop excess.
- For portable tuning, generate presets in code with
  `createGameFeelGeneratorRecipe` + `createGeneratedGameFeelPresetDocument`;
  the MCP `generate_style_presets` tool is only for persisting validated
  batches to the shared workspace.

Verify:
- Run the consumer app, trigger the wired events, and confirm hit-stop pauses
  gameplay motion while the camera/flash keep moving in real time.
- Check `feel.stats()` for unexpected dropped or declined effects.
