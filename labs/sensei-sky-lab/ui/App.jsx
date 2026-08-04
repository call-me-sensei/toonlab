import { useEffect } from 'react';

import {
  BrandLockup,
  Button,
  IconButton,
  LabTimeOfDayControl,
  PresetRowShell,
  PreviewBar,
  PreviewToggle,
  RendererToggle,
  SegmentedControl,
  Select,
  ToastStack,
  toast,
  useStoreState,
} from '../../shared/ui/index.js';
import { downloadBlob } from '../../shared/download.js';
import { SENSEI_SKY_ASSET_ROOT, SENSEI_SKY_PARAMS } from '../params.js';

function compareOptions(state) {
  const referenceBlocked = state.referenceAvailable === false;
  return [
    { label: 'Sensei', value: 'sensei' },
    { disabled: referenceBlocked, label: 'Split', value: 'split' },
    { disabled: referenceBlocked, label: 'Reference', value: 'reference' },
  ];
}

function TopBar() {
  return (
    <header className="gr-topbar tk">
      <BrandLockup labName="Sensei Sky Lab" />
      <span className="gr-title" data-testid="doc-title">
        Call Me Sensei sky &amp; cloud variation
      </span>
      <span className="gr-topbar-spacer" />
      <RendererToggle />
    </header>
  );
}

function Inspector({ actions, state }) {
  const scenarioOptions = state.scenarios.map((entry) => ({
    label: entry.label,
    value: entry.id,
  }));

  async function copyParams() {
    const text = JSON.stringify(SENSEI_SKY_PARAMS, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied the full parameter document.');
    } catch {
      toast('Clipboard unavailable — use Export params instead.', { tone: 'danger' });
    }
  }

  return (
    <aside className="gr-inspector tk" data-testid="inspector">
      <PresetRowShell
        label="Scenario"
        title="Scenario = baked atlas row + celestial state. Palettes live in params.js."
      >
        <Select
          onChange={(id) => {
            if (id) actions.setScenario(id);
          }}
          options={scenarioOptions}
          testId="sensei-sky-scenario"
          value={state.scenarioId}
        />
      </PresetRowShell>

      <div className="cloud-boundary-note">
        <strong>Procedural variation.</strong>
        {' '}Every mesh, texture, and atlas in this scene is baked from
        {' '}<code>labs/sensei-sky-lab/params.js</code> — no licensed source
        pixels. Edit the params, then rebake with
        {' '}<code>npm run assets:sensei-sky</code> and reload.
      </div>

      <h2 className="gr-inspector-header">Parameter document</h2>
      <p className="gr-inspector-caption">
        The committed params are the asset source of truth; the baked
        contract mirrors them for runtime use.
      </p>
      <div className="sensei-actions">
        <Button kind="secondary" onClick={copyParams}>
          Copy params JSON
        </Button>
        <Button
          kind="secondary"
          onClick={() => downloadBlob(
            JSON.stringify(SENSEI_SKY_PARAMS, null, 2),
            'sensei-sky-params.json',
            'application/json',
          )}
        >
          Export params
        </Button>
        <Button
          kind="secondary"
          onClick={async () => {
            const response = await fetch(
              `${SENSEI_SKY_ASSET_ROOT}/contract.json`,
              { cache: 'no-store' },
            );
            if (!response.ok) {
              toast('Contract not baked yet — run assets:sensei-sky.', { tone: 'danger' });
              return;
            }
            downloadBlob(
              await response.text(),
              'sensei-sky-contract.json',
              'application/json',
            );
          }}
        >
          Export baked contract
        </Button>
      </div>
      {state.contractMeta && (
        <p className="sensei-meta">
          seed {state.contractMeta.seed}
          {' · '}
          baked {new Date(state.contractMeta.generatedAt).toLocaleString()}
        </p>
      )}
    </aside>
  );
}

function SkyPreviewBar({ actions, engine, state }) {
  return (
    <PreviewBar
      hint="Left-drag rotate · wheel zoom · C resets the camera"
      title="Review scene for the baked Sensei sky set. Split shows the licensed reference on the right for side-by-side comparison."
    >
      <SegmentedControl
        onChange={(compare) => actions.setView({ compare })}
        options={compareOptions(state)}
        testId="sensei-sky-compare"
        value={state.view.compare}
      />
      <PreviewToggle
        checked={state.view.drift}
        label="Drift"
        onChange={(drift) => actions.setView({ drift })}
        testId="sensei-sky-drift"
        title="Animate the cloud-shell rotation."
      />
      <PreviewToggle
        checked={state.view.ground}
        label="Ground"
        onChange={(ground) => actions.setView({ ground })}
        testId="sensei-sky-ground"
        title="Show the flat stage ground that anchors the horizon line."
      />
      <LabTimeOfDayControl
        autoCycle={state.view.autoCycle}
        hour={state.view.hour}
        onAutoCycleChange={actions.setPreviewAutoCycle}
        onHourChange={actions.setPreviewHour}
      />
      <IconButton
        icon="reset"
        label="Reset camera (C)"
        onClick={() => engine.resetCamera()}
      />
    </PreviewBar>
  );
}

function StatusBar({ state }) {
  const reference = state.referenceAvailable === false
    ? 'reference archive absent'
    : 'reference comparison available';
  return (
    <footer className="gr-status tk" data-testid="status-bar">
      <span className="gr-status-message">
        {state.status || (state.engineReady
          ? 'Sensei sky variation ready.'
          : 'Baking preview…')}
      </span>
      <span className="gr-status-spacer" />
      <span className="gr-status-meta">
        {state.scenarios.length || '…'} scenarios · {reference}
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;

  useEffect(() => {
    document.title = 'Sensei Sky Lab — ToonLab';
  }, []);

  return (
    <div className="tk">
      <div className="gr-root sensei-root">
        <TopBar />
        <Inspector actions={actions} state={state} />
        <StatusBar state={state} />
      </div>
      <SkyPreviewBar actions={actions} engine={engine} state={state} />
      <ToastStack />
    </div>
  );
}
