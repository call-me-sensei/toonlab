import { useEffect, useMemo, useRef, useState } from 'react';

import {
  CLOUD_SHADER_FIELD_SCHEMA,
  getCloudSourcePresetOptions,
} from '../../../src/cloud/index.js';
import { downloadBlob } from '../../shared/download.js';
import { BrandLockup, Button, RendererToggle, useStoreState } from '../../shared/ui/index.js';

const TABS = [
  ['preview', 'Preview'],
  ['cloud-look', 'Cloud Look'],
  ['atmosphere', 'Atmosphere & Time'],
  ['composition', 'Composition'],
  ['assets', 'Assets'],
  ['export', 'Export'],
  ['painter', 'Cloud Painter · Experimental'],
];

const WEATHER_PREVIEW_OPTIONS = [
  ['clear', 'Clear'],
  ['partlyCloudy', 'Partly cloudy'],
  ['overcast', 'Overcast'],
  ['rain', 'Rain'],
  ['thunderstorm', 'Thunderstorm'],
  ['snow', 'Snow'],
];

function colorToHex(channels) {
  return `#${channels.slice(0, 3).map((value) =>
    Math.round(Math.min(Math.max(value, 0), 1) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function hexToColor(value) {
  return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function RangeField({ label, max, min, onChange, step = 0.01, value }) {
  return (
    <label className="sc-field">
      <span>{label}<output>{Number(value).toFixed(step < 0.01 ? 3 : 2)}</output></span>
      <input
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ColorField({ label, onChange, value }) {
  return (
    <label className="sc-color-field">
      <span>{label}</span>
      <input type="color" value={colorToHex(value)} onChange={(event) => onChange(hexToColor(event.target.value))} />
    </label>
  );
}

function PreviewPanel({ actions, state }) {
  return (
    <div className="sc-panel-copy">
      <span className="sc-kicker">Hero cloud benchmark</span>
      <h1>Make one cloud beautiful before making a hundred.</h1>
      <p>
        This scene isolates one connected 3D cumulus volume with realistic
        cauliflower macro-form. Stylization belongs in its clean lighting,
        pale-blue underside, reduced detail, translucency, and silver lining;
        painter and procedural placement come after it passes.
      </p>
      <div className="sc-metric-grid">
        <div><strong>{state.documents.sky.timeKeyframes.length}</strong><span>time keys</span></div>
        <div><strong>3D</strong><span>macro-form</span></div>
        <div><strong>{state.documents.cloudComposition.layers.reduce((sum, layer) => sum + (layer.placements.length || layer.count), 0)}</strong><span>volumes</span></div>
        <div><strong>45</strong><span>connected lobes</span></div>
      </div>
      <Button kind="primary" onClick={() => actions.setActiveTab('cloud-look')}>Develop the hero cloud</Button>
    </div>
  );
}

function AtmospherePanel({ actions, state }) {
  const sky = state.documents.sky;
  const selected = sky.timeKeyframes.find((entry) => entry.id === state.selectedKeyframeId)
    ?? sky.timeKeyframes[0];
  return (
    <div className="sc-panel-stack">
      <section>
        <h2>Preetham atmosphere</h2>
        <p className="sc-help">Physical scattering first; artistic grading is sampled after scattering.</p>
        <RangeField label="Turbidity" min={0} max={20} step={0.1} value={sky.atmosphere.turbidity} onChange={(value) => actions.setAtmosphere('turbidity', value)} />
        <RangeField label="Rayleigh" min={0} max={8} value={sky.atmosphere.rayleigh} onChange={(value) => actions.setAtmosphere('rayleigh', value)} />
        <RangeField label="Mie coefficient" min={0} max={0.1} step={0.001} value={sky.atmosphere.mieCoefficient} onChange={(value) => actions.setAtmosphere('mieCoefficient', value)} />
        <RangeField label="Mie direction" min={0} max={0.999} step={0.001} value={sky.atmosphere.mieDirectionalG} onChange={(value) => actions.setAtmosphere('mieDirectionalG', value)} />
      </section>
      <section>
        <div className="sc-section-title"><h2>24-hour curve</h2><Button kind="secondary" onClick={actions.addKeyframe}>Add at preview time</Button></div>
        <div className="sc-timeline">
          {sky.timeKeyframes.map((keyframe) => (
            <button
              key={keyframe.id}
              className="sc-time-key"
              data-active={keyframe.id === selected?.id}
              style={{ left: `${(keyframe.hour / 24) * 100}%`, background: colorToHex(keyframe.horizonTint) }}
              title={`${keyframe.label} · ${keyframe.hour.toFixed(2)}`}
              onClick={() => actions.selectKeyframe(keyframe.id)}
            />
          ))}
        </div>
        {selected && (
          <div className="sc-key-editor">
            <label className="sc-text-field">Name<input value={selected.label} onChange={(event) => actions.setKeyframe(selected.id, { label: event.target.value })} /></label>
            <RangeField label="Time" min={0} max={23.99} step={0.01} value={selected.hour} onChange={(hour) => actions.setKeyframe(selected.id, { hour })} />
            <ColorField label="Zenith" value={selected.zenithTint} onChange={(value) => actions.setKeyframe(selected.id, { zenithTint: value })} />
            <ColorField label="Horizon" value={selected.horizonTint} onChange={(value) => actions.setKeyframe(selected.id, { horizonTint: value })} />
            <ColorField label="Below horizon" value={selected.belowHorizonTint} onChange={(value) => actions.setKeyframe(selected.id, { belowHorizonTint: value })} />
            <ColorField label="Glow" value={selected.horizonGlowColor} onChange={(value) => actions.setKeyframe(selected.id, { horizonGlowColor: value })} />
            <RangeField label="Saturation" min={0} max={3} value={selected.saturation} onChange={(value) => actions.setKeyframe(selected.id, { saturation: value })} />
            <RangeField label="Contrast" min={0} max={3} value={selected.contrast} onChange={(value) => actions.setKeyframe(selected.id, { contrast: value })} />
            <RangeField label="Exposure" min={0} max={4} value={selected.exposure} onChange={(value) => actions.setKeyframe(selected.id, { exposure: value })} />
            <RangeField label="Horizon glow" min={0} max={3} value={selected.horizonGlow} onChange={(value) => actions.setKeyframe(selected.id, { horizonGlow: value })} />
            <Button kind="danger" onClick={() => actions.deleteKeyframe(selected.id)}>Delete keyframe</Button>
          </div>
        )}
      </section>
    </div>
  );
}

function drawStroke(context, stroke, width, height) {
  if (!stroke.points.length) return;
  context.save();
  context.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over';
  context.strokeStyle = '#fff';
  context.fillStyle = '#fff';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = stroke.radius * Math.min(width, height) * 2;
  context.beginPath();
  stroke.points.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    context.arc(point.x * width, point.y * height, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
  } else context.stroke();
  context.restore();
}

function PainterCanvas({ actions, state }) {
  const canvasRef = useRef(null);
  const draftRef = useRef(null);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of state.documents.cloudSource.strokes) drawStroke(context, stroke, canvas.width, canvas.height);
    if (draftRef.current) drawStroke(context, draftRef.current, canvas.width, canvas.height);
  }

  useEffect(redraw, [state.documents.cloudSource.strokes, state.brush]);

  function pointFromEvent(event) {
    const bounds = canvasRef.current.getBoundingClientRect();
    return {
      pressure: event.pressure || 1,
      x: Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1),
      y: Math.min(Math.max((event.clientY - bounds.top) / bounds.height, 0), 1),
    };
  }

  return (
    <canvas
      ref={canvasRef}
      className="sc-paint-canvas"
      height="512"
      width="512"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        draftRef.current = {
          id: `stroke-${Date.now()}`,
          mode: state.brush.mode,
          points: [pointFromEvent(event)],
          radius: state.brush.radius,
        };
        redraw();
      }}
      onPointerMove={(event) => {
        if (!draftRef.current) return;
        draftRef.current.points.push(pointFromEvent(event));
        redraw();
      }}
      onPointerUp={(event) => {
        if (!draftRef.current) return;
        draftRef.current.points.push(pointFromEvent(event));
        actions.addStroke(draftRef.current);
        draftRef.current = null;
      }}
    />
  );
}

function GeneratedPreview({ maps }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!maps || !ref.current) return;
    const canvas = ref.current;
    canvas.width = maps.width;
    canvas.height = maps.height;
    const pixels = new Uint8ClampedArray(maps.surface.length);
    for (let index = 0; index < maps.surface.length; index += 4) {
      const depth = maps.volume[index] / 255;
      const ao = maps.volume[index + 1] / 255;
      const rim = maps.volume[index + 2] / 255;
      const alpha = maps.surface[index + 3];
      pixels[index] = Math.min(255, 130 + depth * 105 + rim * 70);
      pixels[index + 1] = Math.min(255, 155 + depth * 92 + rim * 55);
      pixels[index + 2] = Math.min(255, 190 + depth * 62 + rim * 35);
      pixels[index + 3] = alpha * ao;
    }
    ref.current.getContext('2d').putImageData(
      new ImageData(pixels, maps.width, maps.height), 0, 0,
    );
  }, [maps]);
  return <canvas ref={ref} className="sc-generated-canvas" />;
}

function PainterPanel({ actions, state }) {
  const source = state.documents.cloudSource;
  return (
    <div className="sc-painter-panel">
      <div className="sc-painter-workspace">
        <div><span className="sc-canvas-label">Normalized silhouette</span><PainterCanvas actions={actions} state={state} /></div>
        <div><span className="sc-canvas-label">Generated 2.5D preview</span><GeneratedPreview maps={state.generation.maps} /></div>
      </div>
      <div className="sc-painter-tools">
        <div className="sc-segmented">
          <button data-active={state.brush.mode === 'paint'} onClick={() => actions.setBrush({ mode: 'paint' })}>Cloud brush</button>
          <button data-active={state.brush.mode === 'erase'} onClick={() => actions.setBrush({ mode: 'erase' })}>Eraser</button>
        </div>
        <RangeField label="Brush size" min={0.01} max={0.2} step={0.005} value={state.brush.radius} onChange={(radius) => actions.setBrush({ radius })} />
        <label className="sc-select-field">Preset<select value={source.preset} onChange={(event) => actions.setPreset(event.target.value)}>{getCloudSourcePresetOptions().map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <details open>
          <summary>Advanced generation</summary>
          <RangeField label="Puffiness" min={0} max={1} value={source.generation.puffiness} onChange={(value) => actions.setGenerationSetting('puffiness', value)} />
          <RangeField label="Lobe scale" min={0.025} max={0.4} value={source.generation.lobeScale} onChange={(value) => actions.setGenerationSetting('lobeScale', value)} />
          <RangeField label="Erosion" min={0} max={1} value={source.generation.erosion} onChange={(value) => actions.setGenerationSetting('erosion', value)} />
          <RangeField label="Softness" min={0.01} max={0.35} value={source.generation.softness} onChange={(value) => actions.setGenerationSetting('softness', value)} />
          <RangeField label="Depth" min={0.05} max={1} value={source.generation.depth} onChange={(value) => actions.setGenerationSetting('depth', value)} />
          <RangeField label="Underside weight" min={0} max={1} value={source.generation.undersideWeight} onChange={(value) => actions.setGenerationSetting('undersideWeight', value)} />
          <RangeField label="Detail" min={0} max={1} value={source.generation.detail} onChange={(value) => actions.setGenerationSetting('detail', value)} />
          <label className="sc-number-field">Seed<input type="number" value={source.seed} onChange={(event) => actions.setGenerationSetting('seed', Number(event.target.value))} /></label>
        </details>
        <div className="sc-button-row">
          <Button kind="secondary" disabled={!state.canUndo} onClick={actions.undo}>Undo</Button>
          <Button kind="secondary" disabled={!state.canRedo} onClick={actions.redo}>Redo</Button>
          <Button kind="secondary" onClick={actions.clearStrokes}>Clear</Button>
          <Button kind="secondary" onClick={actions.regenerate}>Regenerate seed</Button>
          <Button kind="primary" disabled={state.generation.status === 'working'} onClick={() => actions.generate(512)}>Generate 512²</Button>
        </div>
        {state.generation.error && <p className="sc-error">{state.generation.error}</p>}
      </div>
    </div>
  );
}

const CLOUD_LOOK_KEYS = [
  'opacity', 'litColor', 'shadeColor', 'shadowStrength', 'normalStrength',
  'depthStrength', 'translucencyStrength', 'rimColor', 'rimStrength', 'rimPower',
  'edgeSoftness', 'erosion', 'windResponse', 'worldShadowStrength', 'worldShadowSoftness',
];

function CloudLookPanel({ actions, state }) {
  const fields = Object.values(CLOUD_SHADER_FIELD_SCHEMA).flat()
    .filter((field) => CLOUD_LOOK_KEYS.includes(field.key));
  return (
    <div className="sc-panel-stack"><section><h2>Runtime cloud lighting</h2><p className="sc-help">Structure is baked; the final sun direction and lighting remain live.</p>{fields.map((field) => field.type === 'color' ? (
      <ColorField key={field.key} label={field.label} value={state.documents.cloudShader.settings[field.key]} onChange={(value) => actions.setCloudSetting(field.key, value)} />
    ) : (
      <RangeField key={field.key} label={field.label} {...field.range} value={state.documents.cloudShader.settings[field.key]} onChange={(value) => actions.setCloudSetting(field.key, value)} />
    ))}</section></div>
  );
}

function CompositionPanel({ actions, state }) {
  return <div className="sc-panel-stack">{state.documents.cloudComposition.layers.map((layer, index) => (
    <section key={layer.id}>
      <h2>{layer.id.replaceAll('-', ' ')}</h2>
      <RangeField label="Count" min={0} max={64} step={1} value={layer.count} onChange={(value) => actions.setLayer(index, { count: value })} />
      <RangeField label="Radius" min={200} max={6000} step={10} value={layer.radius} onChange={(value) => actions.setLayer(index, { radius: value })} />
      <RangeField label="Min elevation" min={-8} max={80} step={1} value={layer.elevation[0]} onChange={(value) => actions.setLayer(index, { elevation: [value, layer.elevation[1]] })} />
      <RangeField label="Max elevation" min={-8} max={80} step={1} value={layer.elevation[1]} onChange={(value) => actions.setLayer(index, { elevation: [layer.elevation[0], value] })} />
      <RangeField label="Min scale" min={20} max={1000} step={10} value={layer.scale[0]} onChange={(value) => actions.setLayer(index, { scale: [value, layer.scale[1]] })} />
      <RangeField label="Max scale" min={20} max={1000} step={10} value={layer.scale[1]} onChange={(value) => actions.setLayer(index, { scale: [layer.scale[0], value] })} />
      <RangeField label="Opacity" min={0} max={1} value={layer.opacity} onChange={(value) => actions.setLayer(index, { opacity: value })} />
      <RangeField label="Parallax" min={0} max={2} value={layer.parallax} onChange={(value) => actions.setLayer(index, { parallax: value })} />
      <RangeField label="Wind X" min={-8} max={8} value={layer.wind[0]} onChange={(value) => actions.setLayer(index, { wind: [value, layer.wind[1]] })} />
      <RangeField label="Wind Y" min={-8} max={8} value={layer.wind[1]} onChange={(value) => actions.setLayer(index, { wind: [layer.wind[0], value] })} />
    </section>
  ))}</div>;
}

function AssetsPanel() {
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState([]);
  const [status, setStatus] = useState('Loading catalog…');
  useEffect(() => {
    fetch('/api/toonlab/catalog?kind=skybox&limit=100')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Catalog unavailable')))
      .then((result) => { setAssets(result.assets ?? result.items ?? []); setStatus(''); })
      .catch(() => setStatus('The local catalog is unavailable. Core procedural clouds do not depend on hosted packs.'));
  }, []);
  const filtered = assets.filter((asset) => `${asset.name} ${asset.description} ${(asset.tags ?? []).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="sc-panel-stack"><section><h2>Hosted skybox catalog</h2><p className="sc-help">Only release-gated packs appear here. Dandewa files cannot be mirrored until redistribution evidence is approved.</p><label className="sc-text-field">Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="anime, painted, cloudscape…" /></label>{status && <p>{status}</p>}<div className="sc-asset-list">{filtered.map((asset) => <article key={asset.id}><strong>{asset.name}</strong><span>{asset.license_spdx || asset.license_id}</span><a href={`/asset/?src=official&id=${encodeURIComponent(asset.id)}`}>View pack</a></article>)}</div></section></div>;
}

function rgbaMapBlob(maps, key) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = maps.width;
    canvas.height = maps.height;
    const source = key === 'surface' ? maps.surface : maps.volume;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(source), maps.width, maps.height), 0, 0);
    canvas.toBlob(resolve, 'image/png');
  });
}

function ExportPanel({ actions, state }) {
  const documents = state.documents;
  function exportJson(document, suffix) {
    downloadBlob(JSON.stringify(document, null, 2), `${document.id}.${suffix}.json`, 'application/json');
  }
  return <div className="sc-panel-stack"><section><h2>Separate durable documents</h2><p className="sc-help">The workspace manifest references these documents by type and id; it does not embed them in an environment style bundle.</p><div className="sc-export-grid"><Button kind="secondary" onClick={() => exportJson(documents.sky, 'sky-shader')}>Sky preset v2</Button><Button kind="secondary" onClick={() => exportJson(documents.cloudSource, 'cloud-source')}>Cloud source v1</Button><Button kind="secondary" onClick={() => exportJson(documents.cloudShader, 'cloud-shader')}>Cloud look v2</Button><Button kind="secondary" onClick={() => exportJson(documents.cloudComposition, 'cloud-composition')}>Composition v1</Button><Button kind="primary" onClick={() => downloadBlob(JSON.stringify({ type: 'toonlab/sky-cloud-workspace', version: 1, references: Object.fromEntries(Object.entries(documents).map(([key, value]) => [key, { id: value.id, type: value.type, version: value.version }])) }, null, 2), 'sky-cloud-workspace.json', 'application/json')}>Export reference manifest</Button></div></section><section><h2>Baked structural maps</h2><p className="sc-help">512² is interactive, 1024² is the default export, and 2048² is optional. Generation runs off the UI thread.</p><div className="sc-button-row"><Button kind="secondary" onClick={() => actions.generate(1024)}>Generate 1024²</Button><Button kind="secondary" onClick={() => actions.generate(2048)}>Generate 2048²</Button>{state.generation.maps && <><Button kind="secondary" onClick={async () => downloadBlob(await rgbaMapBlob(state.generation.maps, 'surface'), `${documents.cloudSource.id}.surface.png`, 'image/png')}>Surface PNG</Button><Button kind="secondary" onClick={async () => downloadBlob(await rgbaMapBlob(state.generation.maps, 'volume'), `${documents.cloudSource.id}.volume.png`, 'image/png')}>Volume PNG</Button></>}</div></section></div>;
}

function ActivePanel({ actions, state }) {
  switch (state.activeTab) {
    case 'atmosphere': return <AtmospherePanel actions={actions} state={state} />;
    case 'painter': return <PainterPanel actions={actions} state={state} />;
    case 'cloud-look': return <CloudLookPanel actions={actions} state={state} />;
    case 'composition': return <CompositionPanel actions={actions} state={state} />;
    case 'assets': return <AssetsPanel />;
    case 'export': return <ExportPanel actions={actions} state={state} />;
    default: return <PreviewPanel actions={actions} state={state} />;
  }
}

export function App({ store }) {
  const state = useStoreState(store);
  const actions = useMemo(() => store.actions, [store]);
  return (
    <div className="sc-shell" data-tab={state.activeTab}>
      <header className="sc-topbar"><BrandLockup labName="Sky & Cloud Lab" /><div className="sc-top-actions"><button disabled={!state.canUndo} onClick={actions.undo}>Undo</button><button disabled={!state.canRedo} onClick={actions.redo}>Redo</button><RendererToggle /></div></header>
      <nav className="sc-tabs" aria-label="Sky and Cloud Lab sections">{TABS.map(([id, label]) => <button key={id} data-active={state.activeTab === id} onClick={() => actions.setActiveTab(id)}>{label}</button>)}</nav>
      <aside className="sc-inspector"><ActivePanel actions={actions} state={state} /></aside>
      <div className="sc-preview-controls"><label className="sc-time-control">Time <input type="range" min="0" max="23.99" step="0.01" value={state.view.hour} onChange={(event) => actions.setView({ hour: Number(event.target.value) })} /><output>{String(Math.floor(state.view.hour)).padStart(2, '0')}:{String(Math.round((state.view.hour % 1) * 60)).padStart(2, '0')}</output></label><label className="sc-weather-control">Weather <select value={state.view.weather} onChange={(event) => actions.setView({ weather: event.target.value })}>{WEATHER_PREVIEW_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label><input type="checkbox" checked={state.view.autoCycle} onChange={(event) => actions.setView({ autoCycle: event.target.checked })} /> Cycle</label></div>
      <footer className="sc-status" data-tone={state.generation.status === 'error' ? 'error' : 'neutral'}>{state.status}</footer>
    </div>
  );
}
