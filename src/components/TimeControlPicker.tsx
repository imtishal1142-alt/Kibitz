import { useState } from 'react';
import { Field } from './ui';
import type { SessionTime } from '../lib/play/session';

export interface TimePreset {
  id: string;
  label: string;
  time: SessionTime;
}

const m = (min: number, inc = 0): SessionTime => ({ baseMs: min * 60_000, incMs: inc * 1000 });

export const TIME_PRESETS: TimePreset[] = [
  { id: 'none', label: 'No clock', time: null },
  { id: '1+0', label: '1 min (bullet)', time: m(1) },
  { id: '3+0', label: '3 min (blitz)', time: m(3) },
  { id: '3+2', label: '3 min + 2 s', time: m(3, 2) },
  { id: '5+0', label: '5 min (blitz)', time: m(5) },
  { id: '10+0', label: '10 min (rapid)', time: m(10) },
  { id: '15+10', label: '15 min + 10 s', time: m(15, 10) },
  { id: '30+0', label: '30 min', time: m(30) },
];

/** Pick a clock: a preset or custom minutes and increment. */
export function TimeControlPicker({ presetId, onChange, idPrefix }: { presetId: string; onChange: (id: string, time: SessionTime) => void; idPrefix: string }) {
  const [minutes, setMinutes] = useState(10);
  const [inc, setInc] = useState(0);
  const custom = presetId === 'custom';
  return (
    <div className="stack-sm">
      <Field label="Clock" htmlFor={`${idPrefix}-tc`}>
        <select
          id={`${idPrefix}-tc`}
          className="select"
          value={presetId}
          onChange={(e) => {
            const id = e.target.value;
            if (id === 'custom') onChange(id, m(minutes, inc));
            else onChange(id, TIME_PRESETS.find((p) => p.id === id)?.time ?? null);
          }}
        >
          {TIME_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </Field>
      {custom ? (
        <div className="row">
          <Field label="Minutes" htmlFor={`${idPrefix}-min`}>
            <input
              id={`${idPrefix}-min`}
              className="input"
              type="number"
              min={0.5}
              max={180}
              step={0.5}
              value={minutes}
              onChange={(e) => {
                const v = Math.min(180, Math.max(0.5, Number(e.target.value) || 1));
                setMinutes(v);
                onChange('custom', m(v, inc));
              }}
              style={{ width: 100 }}
            />
          </Field>
          <Field label="Increment (s)" htmlFor={`${idPrefix}-inc`}>
            <input
              id={`${idPrefix}-inc`}
              className="input"
              type="number"
              min={0}
              max={60}
              step={1}
              value={inc}
              onChange={(e) => {
                const v = Math.min(60, Math.max(0, Math.round(Number(e.target.value) || 0)));
                setInc(v);
                onChange('custom', m(minutes, v));
              }}
              style={{ width: 100 }}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
