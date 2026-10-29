import { Field, Segmented } from './ui';
import { ELO_MAX, ELO_MIN, LEVELS, clamp, describeConfig } from '../lib/engine/strength';
import type { OpponentConfig, StrengthMode } from '../lib/engine/strength';

const THINK_CHOICES = [200, 500, 1000, 2000, 5000];

/** Choose how an engine opponent plays. Every control maps to a real Stockfish UCI option or search limit. */
export function OpponentPicker({ value, onChange, idPrefix, timed }: { value: OpponentConfig; onChange: (c: OpponentConfig) => void; idPrefix: string; timed: boolean }) {
  const set = (patch: Partial<OpponentConfig>) => onChange({ ...value, ...patch });
  const level = LEVELS.find((l) => JSON.stringify(l.config) === JSON.stringify(value));
  return (
    <div className="stack-sm">
      <Field label="Level" hint={level?.hint ?? 'Custom settings, tuned below.'} htmlFor={`${idPrefix}-level`}>
        <select
          id={`${idPrefix}-level`}
          className="select"
          value={level?.id ?? 'custom'}
          onChange={(e) => {
            const l = LEVELS.find((x) => x.id === e.target.value);
            if (l) onChange({ ...l.config });
          }}
        >
          {LEVELS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
          {!level ? <option value="custom">Custom</option> : null}
        </select>
      </Field>
      <details>
        <summary className="small" style={{ cursor: 'pointer' }}>
          Fine-tune the engine
        </summary>
        <div className="stack-sm" style={{ marginTop: 10 }}>
          <Segmented<StrengthMode>
            label="How strength is limited"
            value={value.mode}
            onChange={(mode) => set({ mode })}
            options={[
              { value: 'full', label: 'Full' },
              { value: 'elo', label: 'UCI_Elo' },
              { value: 'skill', label: 'Skill Level' },
              { value: 'beginner', label: 'Shallow' },
              { value: 'human', label: 'Human-like' },
            ]}
          />
          {value.mode === 'elo' ? (
            <Field label={`UCI_Elo: ${value.elo}`} hint="Stockfish's own scale, from its engine-vs-engine rating list. It is not a Chess.com, Lichess or FIDE rating, and people usually find it harder or easier than the number suggests." htmlFor={`${idPrefix}-elo`}>
              <input id={`${idPrefix}-elo`} type="range" min={ELO_MIN} max={ELO_MAX} step={10} value={value.elo} onChange={(e) => set({ elo: clamp(Number(e.target.value), ELO_MIN, ELO_MAX) })} style={{ accentColor: 'var(--accent)' }} />
            </Field>
          ) : null}
          {value.mode === 'skill' || value.mode === 'beginner' || value.mode === 'human' ? (
            <Field label={value.mode === 'human' ? `Carefulness: ${value.skill}` : `Skill Level: ${value.skill}`} hint={value.mode === 'human' ? 'Full-strength Stockfish picks among its top five moves. Low carefulness means it often picks a slightly worse one; high means almost always the best. Not a rating.' : '0 plays many weak moves, 20 plays none on purpose.'} htmlFor={`${idPrefix}-skill`}>
              <input id={`${idPrefix}-skill`} type="range" min={0} max={20} step={1} value={value.skill} onChange={(e) => set({ skill: clamp(Number(e.target.value), 0, 20) })} style={{ accentColor: 'var(--accent)' }} />
            </Field>
          ) : null}
          {value.mode === 'beginner' || value.depthCap ? (
            <Field label={`Search depth cap: ${value.depthCap ?? 2}`} hint="A shallow search keeps weak play weak: even Skill Level 0 is strong when it can think deeply." htmlFor={`${idPrefix}-depth`}>
              <input id={`${idPrefix}-depth`} type="range" min={1} max={20} step={1} value={value.depthCap ?? 2} onChange={(e) => set({ depthCap: clamp(Number(e.target.value), 1, 20) })} style={{ accentColor: 'var(--accent)' }} />
            </Field>
          ) : null}
          <Field label="Thinking time per move" htmlFor={`${idPrefix}-think`} hint={timed ? 'With a clock, the engine can instead budget from its own remaining time.' : undefined}>
            <select id={`${idPrefix}-think`} className="select" value={value.movetimeMs} onChange={(e) => set({ movetimeMs: Number(e.target.value) })}>
              {[...new Set([...THINK_CHOICES, value.movetimeMs])]
                .sort((a, b) => a - b)
                .map((ms) => (
                  <option key={ms} value={ms}>
                    {ms < 1000 ? `${ms} ms` : `${ms / 1000} s`}
                  </option>
                ))}
            </select>
          </Field>
          {timed ? (
            <label className="row-nowrap">
              <input type="checkbox" checked={value.useClock} onChange={(e) => set({ useClock: e.target.checked })} />
              <span>Budget thinking time from the game clock</span>
            </label>
          ) : null}
          {value.mode !== 'beginner' && !value.depthCap ? (
            <button className="btn btn-sm" type="button" onClick={() => set({ depthCap: 8 })}>
              Add a depth cap
            </button>
          ) : null}
        </div>
      </details>
      <p className="hint" style={{ margin: 0 }}>
        {describeConfig(value)}
      </p>
    </div>
  );
}
