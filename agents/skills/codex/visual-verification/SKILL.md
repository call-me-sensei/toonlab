---
name: visual-verification
description: How to prove a ToonLab scene actually looks right — settling the scene before screenshotting, isolating a subsystem to attribute a defect, measuring colour against sampled targets with CIEDE2000, scanning the scene graph for outliers, and running an adversarial critic loop. Use whenever judging, reviewing, or iterating on a rendered scene, and before reporting that any visual defect is a ToonLab limitation.
---

# Verifying that it looks right

A passing build is not visual approval, and a screenshot is not evidence unless
you know what was in the frame when it was taken. This skill is the measurement
discipline that turns "it looks wrong" into "this surface, this value, this
owner".

## Settle the scene before you screenshot

ToonLab subsystems keep resolving work **after their factory returns** — GLB
loads, render-target passes, texture uploads. Screenshotting on a fixed frame
count produces frames with whole subsystems missing while your manifest happily
reports them as present.

Observed: the same command produced 273,520 triangles with the entire lagoon
absent on one run and 606,056 on the next.

So: await every readiness promise the host exposes, render through the real
pipeline, and re-read the scene graph until triangle and drawable counts are
**unchanged across several consecutive reads**. Treat count stability as a
necessary signal, not proof that GPU compilation, render targets, or external
loads succeeded. Then screenshot. Report `settled`, the readiness signals, and
a non-zero rendered frame count in the capture manifest, and **fail the
capture** if any required signal is wrong. A black or half-built frame must
never be able to pass as a render.

Before accepting the final frame, inspect pixels from the real output (a
small `readPixels` grid or the captured image). Fail when nearly every sample
matches the renderer clear/background color, when useful RGB variance or
non-background coverage is effectively zero, or when alpha is invalid. Do not
hardcode black as the only empty-frame value: sky blue, transparent, and custom
clear colors can hide the same failure. Record the distinct-color count or
coverage ratio with the capture.

Also fail on any browser console error. A texture that failed to decode is a
defect, not a warning.

## Isolate before you blame

Render subsystems alone to attribute a defect — and include the light rig, or
you get a black frame and learn nothing.

A "flowing water" texture smeared over every cliff was investigated as a
waterfall bug for two review cycles. One isolated capture of terrain plus its
lighting settled it in a minute: the ground shader was painting it.

Support a query flag that takes a **list** (`?only=terrain,lighting,sky`), and a
flag that bypasses post. Most attribution questions collapse to two captures.

## Measure colour, do not argue about it

Sample the frame at fixed points and compare against your target values in
**CIEDE2000**, not by eye and not by RGB distance. Average a small patch rather
than a single pixel so dithering does not decide the answer.

Two disciplines that matter more than the metric:

- **Probe the right surface.** A probe that lands on terrain when you think it
  is on rock will report a rock defect that does not exist. Prove it: change the
  suspected material's value and re-measure. If the probe does not move, it is
  not on that material. This exact check revealed that two "rock" probes were
  reading the ground shader.
- **Probe where the reference has that material.** A probe placed at coordinates
  the reference fills with sky, on a frame where your scene has a cliff, measures
  a composition difference and reports it as a colour failure.

Keep a second sampler for arbitrary points, so a question like "is the shaded
wall darker than the lit one, and by how much" is one command.

## Scan the scene graph for outliers

Traverse for meshes above a size threshold and print path, world-space extent
and position. This catches the things nobody sees because they read as
background:

- a 104 m slab lying across a 72 m channel, damming it;
- "cliff-top caps" built at 70–90 m across when the tower crown is 20 m.

Both survived several visual reviews. A ten-line traversal found each in
seconds.

Audit transforms the same way. Report per-role mean and max uniform scale and
the worst axis ratio; a mean scale of 6× with a max of 22× is a stretched
surface, and it is visible long before anyone can articulate why.

## Judge from every approved camera

A formation can read as one coherent mass from the hero camera and as a kit row
from above. Fix a small set of cameras — hero, wide, close, flyover, top-down —
and require all of them before approving a change. Never approve from one view.

## Run an adversarial critic

Separate the builder from the judge. When the active tool surface and developer
authorization permit an independent agent/thread, have that critic capture its
**own** fresh evidence rather than trusting the builder's screenshots. Otherwise
perform a separate critic pass after clearing builder assumptions. Read the
module source and return structured blockers: region, expected, actual, fix,
owner.

Make the critic's standard a specific shipped frame, not "good". Give it the
sampled palette and an explicit auto-fail list, and require a verdict field that
is hard to fudge — a boolean like `readsAsOneMass` forces a judgement that a
score can blur.

Then feed the blockers back to the builder with instructions not to argue but to
disprove with a capture if it disagrees. Loop until the critic passes it.

In the qualifying run, independent critics scored subsystems 1.5–3.0 out of 10
with 9–11 blockers each and drove the useful visual fixes. Code inspection
still found contract defects; rendered evidence determined whether they were
visible and whether a correction actually improved the target frame.

## Keep the harness honest under parallelism

If several agents capture at once:

- give each run its own port, or they fight over a fixed one;
- serialise the browser through a small semaphore — GPU-backed browsers
  exhaust WASM memory a few instances in, and the failure surfaces to an agent
  as a broken module rather than as machine pressure;
- expect transient failures from another agent's mid-edit file, and retry rather
  than "fixing" a module you do not own.

## Record the measurement, not the conclusion

Write down the number and the command that produced it. "The wall is too blue"
ages badly; "left wall `#4B6E97` L105 against target `#93A9C6` L168, from
`capture --view hero` then a point sample at 300,250" can be re-checked after
the scene has moved on — and it repeatedly turned out that the conclusion was
wrong while the measurement was still useful.
