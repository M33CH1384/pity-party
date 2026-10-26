import type { OptionDef, OptionValues } from '@pp/game';
import { Seg, Toggle } from '../MoreOptions';
import { type ModeChoice, type ModeEntry, defaultChoice, modeCatalog } from './catalog';

/** Mode picker: the real modes are listed first but stay disabled ("coming soon") until their engines exist. */
export function ModePicker({ value, onChange, modes = modeCatalog() }: { value: ModeChoice; onChange: (c: ModeChoice) => void; modes?: ModeEntry[] }) {
  return (
    <div className="mode-picker" role="radiogroup" aria-label="Game" data-testid="mode-picker">
      {modes.map((m) => {
        const on = m.modeId === value.modeId;
        return (
          <button key={m.modeId} type="button" role="radio" aria-label={`${m.title}${m.available ? "" : " (coming soon)"}`} aria-checked={on} disabled={!m.available}
            className={`mode-tile${on ? ' on' : ''}${m.available ? '' : ' soon'}`} data-testid={`pick-${m.modeId}`}
            onClick={() => { if (m.available && !on) onChange(defaultChoice(m.modeId)); }}>
            <span className="mode-tile-title">{m.title}{!m.available && <em className="soon-chip">Coming soon</em>}</span>
            <span className="mode-tile-sub">{m.blurb}</span>
            <span className="mode-tile-seats">{m.seats}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Small "where this rule comes from" line; unverified rules get a quiet flag. */
function Source({ o }: { o: OptionDef }) {
  return (
    <small className="opt-source" data-testid={`opt-source-${o.key}`}>
      {o.source}{!o.verified && <span className="opt-unverified" title="House rule or unconfirmed: check before relying on it"> · unverified</span>}
    </small>
  );
}

/** Options form generated from a mode's schema: bool → toggle, enum → segmented choice (select when long), int → stepper. */
export function ModeOptionsForm({ schema, values, onChange, disabled }: { schema: readonly OptionDef[]; values: OptionValues; onChange: (v: OptionValues) => void; disabled?: boolean }) {
  const set = (k: string, v: boolean | number | string) => onChange({ ...values, [k]: v });
  if (!schema.length) return <p className="opt-empty">No options for this game.</p>;
  return (
    <fieldset className="mode-options" disabled={disabled} data-testid="mode-options">
      {schema.map((o) => {
        const v = values[o.key] ?? o.default;
        let control;
        if (o.type === 'bool') control = <Toggle label={o.label} value={v as boolean} onChange={(x) => set(o.key, x)} />;
        else if (o.type === 'enum') {
          const short = o.choices.length <= 3 && o.choices.every((c) => c.label.length <= 12);
          control = short
            ? <Seg label={o.label} value={v as string} options={o.choices.map((c) => [c.value, c.label] as [string, string])} onChange={(x) => set(o.key, x)} />
            : <select aria-label={o.label} value={v as string} onChange={(e) => set(o.key, e.target.value)} data-testid={`opt-${o.key}`}>{o.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>;
        } else {
          const n = v as number;
          control = (
            <span className="stepper" data-testid={`opt-${o.key}`}>
              <button type="button" aria-label={`Less ${o.label}`} disabled={n <= o.min} onClick={() => set(o.key, Math.max(o.min, n - 1))}>−</button>
              <output aria-live="polite">{n}</output>
              <button type="button" aria-label={`More ${o.label}`} disabled={n >= o.max} onClick={() => set(o.key, Math.min(o.max, n + 1))}>+</button>
            </span>
          );
        }
        return (
          <div key={o.key} className={`ess-row mode-opt${o.type === 'bool' ? '' : ' stack'}`}>
            <span className="ess-label">{o.label}{o.help && <small>{o.help}</small>}<Source o={o} /></span>
            {control}
          </div>
        );
      })}
    </fieldset>
  );
}

/** The whole "Game" card body: picker + the selected mode's options (coming-soon modes preview theirs, disabled). */
export function ModeSetup({ value, onChange }: { value: ModeChoice; onChange: (c: ModeChoice) => void }) {
  const modes = modeCatalog();
  const cur = modes.find((m) => m.modeId === value.modeId) ?? modes.find((m) => m.available)!;
  return (
    <div className="mode-setup" data-testid="mode-setup">
      <ModePicker value={value} onChange={onChange} modes={modes} />
      <p className="mode-opts-head">{cur.title} options</p>
      <ModeOptionsForm schema={cur.schema} values={value.options} onChange={(options) => onChange({ ...value, options })} />
    </div>
  );
}
