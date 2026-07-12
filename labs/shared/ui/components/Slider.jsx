// Slider + scrubbable value readout. Interaction contract (from the design
// spec): drag the track OR drag the mono value horizontally to adjust
// (Shift = 10× step, Alt = 0.1×), click the value to type, a 1px tick marks
// the field default, and the parent FieldRow shows a reset affordance when
// value !== default.

import { useRef, useState } from 'react';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function snap(value, min, step) {
  const steps = Math.round((value - min) / step);
  const snapped = min + steps * step;
  // Avoid float dust like 0.30000000000000004 in readouts/recipes.
  return Number(snapped.toFixed(6));
}

export function Slider({
  disabled = false, max, min, onChange, step = 0.01, testId, value, defaultValue = null,
}) {
  const trackRef = useRef(null);
  const span = max - min;
  const fraction = clamp((value - min) / span, 0, 1);

  function valueFromPointer(event) {
    const rect = trackRef.current.getBoundingClientRect();
    const t = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    return snap(min + t * span, min, step);
  }

  function onPointerDown(event) {
    if (disabled || event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch { /* synthetic pointers (tests) have no capturable id */ }
    onChange(valueFromPointer(event));
    const move = (moveEvent) => onChange(valueFromPointer(moveEvent));
    const up = (upEvent) => {
      upEvent.target.removeEventListener('pointermove', move);
      upEvent.target.removeEventListener('pointerup', up);
    };
    event.currentTarget.addEventListener('pointermove', move);
    event.currentTarget.addEventListener('pointerup', up);
  }

  const defaultFraction = defaultValue === null
    ? null
    : clamp((defaultValue - min) / span, 0, 1);

  return (
    <div
      className="tk-slider"
      data-disabled={disabled || undefined}
      data-testid={testId}
      onPointerDown={onPointerDown}
    >
      <div ref={trackRef} className="tk-slider-track">
        <div className="tk-slider-fill" style={{ width: `${fraction * 100}%` }} />
        {defaultFraction !== null && (
          <div className="tk-slider-default-tick" style={{ left: `${defaultFraction * 100}%` }} />
        )}
        <div className="tk-slider-thumb" style={{ left: `${fraction * 100}%` }} />
      </div>
    </div>
  );
}

/**
 * Scrubbable numeric readout: horizontal drag adjusts (Shift 10×, Alt 0.1×),
 * click without drag switches to a text input.
 */
export function ScrubValue({
  format = null, max, min, onChange, step = 0.01, unit = null, value,
}) {
  const [editing, setEditing] = useState(false);
  const dragState = useRef(null);

  const precision = step >= 1 ? 0 : step >= 0.01 ? 2 : 3;
  const text = format ? format(value) : `${value.toFixed(precision)}${unit ? ` ${unit}` : ''}`;

  function onPointerDown(event) {
    if (event.button !== 0) return;
    dragState.current = { moved: false, startValue: value, startX: event.clientX };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch { /* synthetic pointers (tests) have no capturable id */ }
  }

  function onPointerMove(event) {
    const drag = dragState.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    if (Math.abs(dx) > 2) drag.moved = true;
    if (!drag.moved) return;
    const scale = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    const raw = drag.startValue + dx * step * scale;
    onChange(clamp(snap(raw, min, step * (scale === 0.1 ? 0.1 : 1)), min, max));
  }

  function onPointerUp() {
    const drag = dragState.current;
    dragState.current = null;
    if (drag && !drag.moved) setEditing(true);
  }

  if (editing) {
    return (
      <input
        className="tk-field-value-input"
        autoFocus
        defaultValue={String(value)}
        onFocus={(event) => event.target.select()}
        onBlur={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) onChange(clamp(snap(parsed, min, step), min, max));
          setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <span
      className="tk-field-value"
      title="Drag to scrub · click to type (Shift 10×, Alt 0.1×)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {text}
    </span>
  );
}
