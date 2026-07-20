// Shared top-bar chrome for redesigned lab workspaces.
//
// BrandLockup mirrors the ToonLab Pro site header lockup (the red ト mark +
// TOONLAB wordmark) and is the way back out of a lab: clicking it returns to
// the labs screen. There is deliberately no lab-to-lab quick switcher.
//
// RendererToggle is the permanent top-right WebGPU/WebGL control. It replaces
// the floating pill from labs/shared/rendererSwitcher.js: same semantics —
// switching navigates with an updated `?renderer=` param (a renderer cannot
// be hot-swapped), and the badge shows the ACTUAL backend the factory stamped
// on document.body.dataset.rendererBackend after init.

import { useEffect, useState } from 'react';


import { Toggle } from './primitives.jsx';
import { RENDERER_SWITCHER_KINDS, resolveRendererKind } from '../../rendererKind.js';
import {
  BACKEND_LABELS,
  EXPECTED_BACKEND,
  KIND_LABELS,
  urlForKind,
} from '../../rendererSwitcher.js';

/** The labs screen: /labs when mounted in the Pro app, the root grid otherwise. */
function labsHomeHref() {
  return window.location.pathname.startsWith('/labs') ? '/labs' : '/';
}

export function BrandLockup({ labName }) {
  return (
    <span className="tk-brand">
      <a className="tk-brand-home" href={labsHomeHref()} title="Back to Labs">
        <span aria-hidden="true" className="tk-brand-mark">ト</span>
        <span className="tk-brand-word">TOONLAB</span>
      </a>
      {labName && <span className="tk-brand-lab">{labName}</span>}
    </span>
  );
}

function useRendererBackend() {
  const [backend, setBackend] = useState(() => document.body.dataset.rendererBackend || null);
  useEffect(() => {
    // rendererFactory stamps the dataset only after async backend init.
    const read = () => setBackend(document.body.dataset.rendererBackend || null);
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-renderer-backend'] });
    return () => observer.disconnect();
  }, []);
  return backend;
}

export function RendererToggle() {
  const requested = resolveRendererKind();
  const requestedChoice = requested === 'webgpu-forced-gl' ? 'webgl' : requested;
  const backend = useRendererBackend();
  const matches = backend === EXPECTED_BACKEND[requested];

  return (
    <span className="tk-renderer" data-testid="renderer-toggle">
      <span className="tk-segmented" role="group">
        {RENDERER_SWITCHER_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={kind === requestedChoice}
            data-renderer-choice={kind}
            onClick={() => {
              if (kind !== requestedChoice) window.location.assign(urlForKind(kind));
            }}
          >
            {KIND_LABELS[kind]}
          </button>
        ))}
      </span>
      <span
        className="tk-renderer-backend"
        data-state={backend ? (matches ? 'ok' : 'fallback') : 'booting'}
        data-testid="renderer-backend"
        title={!backend
          ? 'Renderer is still starting'
          : matches
            ? 'Active backend matches the requested renderer'
            : `Requested ${KIND_LABELS[requested]} but got ${BACKEND_LABELS[backend] || backend}`}
      >
        {backend ? `● ${BACKEND_LABELS[backend] || backend}` : 'booting…'}
      </span>
    </span>
  );
}


/**
 * The ONE scene-preview bar: floating bottom-center over the viewport, amber
 * (= never saved into the document). Labs put their preview controls inside:
 * stage/model selects, debug views, scene-light sliders, walk toggles.
 */
export function PreviewBar({ children, hint = null, title = 'Preview only — nothing here is saved into your document.' }) {
  return (
    <div className="tk-previewbar tk" data-testid="preview-bar" title={title}>
      <span className="tk-previewbar-chip">Preview</span>
      {children}
      {hint && <span className="tk-previewbar-hint">{hint}</span>}
    </div>
  );
}

/** Labeled toggle for the preview bar (Walk, Idle, Rain, Spin, …). */
export function PreviewToggle({ checked, disabled = false, label, onChange, testId, title }) {
  return (
    <label className="tk-previewbar-toggle" title={title}>
      <Toggle
        checked={checked}
        disabled={disabled}
        onChange={(next) => {
          onChange(next);
          // Drop focus so keyboard input (WASD walks) reaches the scene.
          document.activeElement?.blur?.();
        }}
        testId={testId}
      />
      <span>{label}</span>
    </label>
  );
}

/** The labeled style/preset picker heading every product inspector. */
export function PresetRowShell({
  children,
  label = 'Preset',
  title = 'The preset you are editing — switching replaces every value in this panel.',
}) {
  return (
    <div className="tk-preset-row">
      <span className="tk-preset-label" title={title}>{label}</span>
      {children}
    </div>
  );
}
