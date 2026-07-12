// One settings-schema field rendered with kit controls: label (with help
// tooltip + reset affordance), typed control, scrubbable value. Schema shape
// per src/debug/fieldValues.js conventions: { type, label, description,
// range, options, optionLabels, defaultValue } plus the redesign's optional
// { unit, display, control } extensions.

import {
  ColorWell, SegmentedControl, Select, TextField, Toggle,
} from '../components/primitives.jsx';
import { ScrubValue, Slider } from '../components/Slider.jsx';
import { Tooltip } from '../components/overlays.jsx';

function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => entry === b[index]);
  }
  return a === b;
}

function displayValue(field, value) {
  const scale = field.display?.scale ?? 1;
  return value * scale;
}

function storedValue(field, shown) {
  const scale = field.display?.scale ?? 1;
  return shown / scale;
}

export function SchemaField({
  disabled = false, disabledReason = null, field, onChange, value,
}) {
  const dirty = field.defaultValue !== undefined && !sameValue(value, field.defaultValue);
  const testId = `field-${field.group}-${field.key}`;

  let control = null;
  let readout = null;

  if (field.type === 'boolean') {
    control = <Toggle checked={Boolean(value)} disabled={disabled} onChange={onChange} testId={testId} />;
  } else if (field.type === 'select' && field.control === 'segmented' && (field.options?.length ?? 0) <= 4) {
    control = (
      <SegmentedControl
        onChange={(next) => onChange(typeof field.defaultValue === 'number' ? Number(next) : next)}
        options={field.options.map((option) => ({
          label: field.optionLabels?.[String(option)] ?? String(option),
          value: option,
        }))}
        testId={testId}
        value={value}
      />
    );
  } else if (field.type === 'select') {
    control = (
      <Select
        disabled={disabled}
        onChange={(next) => onChange(typeof field.defaultValue === 'number' ? Number(next) : next)}
        options={(field.options ?? []).map((option) => ({
          label: field.optionLabels?.[String(option)] ?? String(option),
          value: option,
        }))}
        testId={testId}
        value={value}
      />
    );
  } else if (field.type === 'color') {
    // Multi-color specs (list of hex strings — e.g. autumn palettes) render
    // as a swatch strip; editing happens in the feature UI that set them.
    if (Array.isArray(value) && typeof value[0] === 'string') {
      control = (
        <span style={{ display: 'flex', gap: 3 }}>
          {value.map((hex, index) => (
            <span
              key={`${hex}-${index}`}
              style={{
                background: hex, border: '1px solid var(--border-strong)', borderRadius: 3, height: 16, width: 16,
              }}
            />
          ))}
        </span>
      );
    } else {
      control = <ColorWell onChange={onChange} testId={testId} value={value} />;
    }
  } else if (field.type === 'number') {
    const range = field.range ?? { max: 1, min: 0, step: 0.01 };
    const scale = field.display?.scale ?? 1;
    control = (
      <Slider
        defaultValue={field.defaultValue}
        disabled={disabled}
        max={range.max}
        min={range.min}
        onChange={onChange}
        step={range.step}
        testId={testId}
        value={value}
      />
    );
    readout = (
      <ScrubValue
        max={displayValue(field, range.max)}
        min={displayValue(field, range.min)}
        onChange={(shown) => onChange(storedValue(field, shown))}
        step={range.step * scale}
        unit={field.unit ?? null}
        value={displayValue(field, value)}
      />
    );
  } else {
    control = <TextField onCommit={onChange} testId={testId} value={String(value ?? '')} />;
  }

  return (
    <div className="tk-field" data-disabled={disabled || undefined}>
      <Tooltip
        content={disabled && disabledReason ? disabledReason : field.description}
        meta={field.defaultValue !== undefined && !disabled ? `Default: ${String(field.defaultValue)}` : null}
      >
        <span className="tk-field-label">
          <button
            type="button"
            className="tk-field-reset"
            data-dirty={dirty || undefined}
            aria-label={`Reset ${field.label} to default`}
            onClick={() => onChange(field.defaultValue)}
          >
            ●
          </button>
          <span className="tk-field-label-text">{field.label}</span>
        </span>
      </Tooltip>
      {control}
      {readout ?? <span />}
    </div>
  );
}
