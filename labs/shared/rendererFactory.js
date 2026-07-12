// Lab renderer factory — the single place that interprets the `?renderer=` flag.
//
// Renderer values:
//   absent / `renderer=webgpu`  → TSL via WebGPURenderer WebGPU backend
//   `renderer=webgl`            → TSL via WebGPURenderer forceWebGL
//   `renderer=webgpu-forced-gl` → compatibility alias for `renderer=webgl`
//
// WebGPURenderer construction is synchronous but its backend boots async, so
// callers keep a synchronous `const renderer = createLabRenderer(...)` and
// gate their first frame on `whenRendererReady(renderer)`.
//
// Automation contract (capture scripts assert these, do not rename):
//   document.body.dataset.rendererKind    — requested kind, set at creation
//   document.body.dataset.rendererBackend — actual backend after init:
//                                           'webgpu' | 'webgl2-fallback'

import { WebGPURenderer } from 'three/webgpu';

import { setActiveShaderBackend } from '../../src/core/shaderBackend.js';
import {
  isTslWebGlRendererKind,
  resolveRendererKind,
} from './rendererKind.js';

export { RENDERER_KINDS, resolveRendererKind } from './rendererKind.js';

function reportBackend(renderer, kind) {
  if (typeof document === 'undefined') return;
  document.body.dataset.rendererKind = kind;
  if (renderer.backend?.isWebGPUBackend === true) {
    document.body.dataset.rendererBackend = 'webgpu';
  } else {
    document.body.dataset.rendererBackend = 'webgl2-fallback';
  }
}

/**
 * Creates the renderer for the resolved `?renderer=` kind. Synchronous —
 * WebGPU backend init starts immediately; await {@link whenRendererReady}
 * before the first render call.
 */
export function createLabRenderer(options = {}, kind = resolveRendererKind()) {
  const resolvedKind = kind === 'webgpu' || isTslWebGlRendererKind(kind) ? kind : 'webgpu';
  if (resolvedKind !== kind) {
    console.warn(`Unknown renderer kind "${kind}", falling back to WebGPU`);
  }
  setActiveShaderBackend('tsl');
  const renderer = new WebGPURenderer({
    antialias: true,
    ...options,
    forceWebGL: isTslWebGlRendererKind(resolvedKind),
  });
  renderer.userData ??= {};
  renderer.userData.labRendererKind = resolvedKind;
  renderer.userData.labRendererReady = renderer
    .init()
    .then(() => {
      deferUniformBufferDestruction(renderer);
      reportBackend(renderer, resolvedKind);
    });
  return renderer;
}

/** Resolves when the renderer can render. */
export function whenRendererReady(renderer) {
  return renderer?.userData?.labRendererReady ?? Promise.resolve();
}

// three r185 destroys object uniform buffers the moment a render object is
// revalidated (RenderObjects.get → dispose), while command buffers referencing
// them can still be queued — Dawn then raises "used in submit while destroyed"
// on scenes with load-time material churn. Defer the GPU-side destroy until
// the queue has drained the submissions that might reference the buffer.
// Instance-level patch, re-evaluate on the Phase 11 three version bump.
function deferUniformBufferDestruction(renderer) {
  const backend = renderer.backend;
  const device = backend?.device;
  if (!backend?.destroyUniformBuffer || !device?.queue?.onSubmittedWorkDone) return;
  const originalDestroy = backend.destroyUniformBuffer.bind(backend);
  backend.destroyUniformBuffer = (uniformBuffer) => {
    // TWO submit boundaries, not one: a single onSubmittedWorkDone only waits
    // for work already submitted when the destroy is requested — a command
    // buffer that is ENCODED but not yet submitted in the same frame still
    // references the buffer and raises "used in submit while destroyed" when
    // its submit lands. By the first resolution that in-flight encoder has
    // submitted; the second wait drains it before the buffer actually dies.
    device.queue.onSubmittedWorkDone()
      .then(() => device.queue.onSubmittedWorkDone())
      .then(() => {
        // By the time the queue drains, another cleanup path may already have
        // freed this buffer's backend data (heavy dispose churn, e.g. the
        // thumbnail renderer disposing 20+ plants) — a second destroy then
        // dereferences undefined. The resource is gone either way.
        try {
          originalDestroy(uniformBuffer);
        } catch { /* already destroyed */ }
      });
  };
}
