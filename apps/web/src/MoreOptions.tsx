import { type ReactNode, type Ref, useEffect, useRef, useState } from 'react';
import { useEscapeClose } from './useEscapeClose';
import Credits from './Credits';
import Feedback, { AboutRow } from './Feedback';
import { ChatSoundsRow, ReduceEffectsRow, SoundFields, SoundQuickActions } from './SoundControls';
import ThemeToggle from './ThemeToggle';
import { type SectionOpenMap, type SettingsSectionId, loadSectionOpen, saveSectionOpen } from './settingsSections';

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="row">
      <span className="row-label">{label}{hint && <small>{hint}</small>}</span>
      <span className="row-control">{children}</span>
    </label>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" className={`toggle ${value ? 'on' : ''}`} role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}>
      <span />
    </button>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <span className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" role="radio" aria-label={text} aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{text}</button>
      ))}
    </span>
  );
}

/** One collapsible group card in the Settings sheet (owner, 2026-10-23):
 *  the header is a toggle (chevron affordance, aria-expanded); the body
 *  stays MOUNTED and folds on the .set-group-body height track, so folding
 *  never unmounts a control or loses its state — presentation only. */
export function SectionGroup({ label, open, onToggle, groupRef, testId, children }: {
  label: string; open: boolean; onToggle: () => void;
  groupRef?: Ref<HTMLElement>; testId?: string; children: ReactNode;
}) {
  return (
    <section className="set-group" aria-label={label} ref={groupRef} data-testid={testId}>
      <h3 className="sheet-h">
        <button type="button" className="set-group-toggle" aria-expanded={open} onClick={onToggle}>
          <span>{label}</span>
          <span className={`set-chev ${open ? 'open' : ''}`} aria-hidden>▾</span>
        </button>
      </h3>
      <div className={`set-group-body ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="set-group-inner">{children}</div>
      </div>
    </section>
  );
}

/** THE one settings sheet: sound + music, look, beta feedback and credits. Game rules live on the
 *  Setup screen (each mode's options); Bid Wit Me's Spades house rules, bot skill, trash talk, venue,
 *  graphics and slam options were removed in milestone 3a. The speaker opens this sheet landed on
 *  Sound & music via initialSection="sound" (settingsSheet.ts). */
export default function MoreOptions({ onClose, initialSection, anchorSeq }: {
  onClose: () => void;
  /** Open landed on a group instead of the top (the speaker's sound landing). */
  initialSection?: 'sound';
  /** Bumped per open request so a repeat request while open re-lands the anchor. */
  anchorSeq?: number;
}) {
  const [credits, setCredits] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [openMap, setOpenMap] = useState<SectionOpenMap>(() => loadSectionOpen());
  const [forced, setForced] = useState<SettingsSectionId | null>(() => (initialSection === 'sound' ? 'sound' : null));
  useEffect(() => {
    if (initialSection === 'sound') setForced('sound');
  }, [initialSection, anchorSeq]);
  const isOpen = (id: SettingsSectionId) => forced === id || openMap[id];
  const toggleSection = (id: SettingsSectionId) => {
    const next: SectionOpenMap = { ...openMap, [id]: !isOpen(id) };
    setOpenMap(next);
    saveSectionOpen(next);
    if (forced === id) setForced(null);
  };
  const esc = useEscapeClose(onClose);
  const soundGroupRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (initialSection !== 'sound') return;
    const el = soundGroupRef.current;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  }, [initialSection, anchorSeq]);
  return (
    <>
    <div className="modal-backdrop sheet-backdrop" ref={esc} onClick={onClose}>
      <div className="sheet glass slant" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()} data-testid="more-options">
        <header className="sheet-head">
          <span className="panel-title">SETTINGS</span>
          <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="scroll sheet-body">
          <SectionGroup label="Sound & music" open={isOpen('sound')} onToggle={() => toggleSection('sound')} groupRef={soundGroupRef} testId="settings-sound-group">
          <SoundQuickActions />
          <SoundFields />
          <ChatSoundsRow />
          </SectionGroup>
          <SectionGroup label="Look & effects" open={isOpen('look')} onToggle={() => toggleSection('look')}>
          <Row label="Appearance">
            <ThemeToggle />
          </Row>
          <ReduceEffectsRow />
          </SectionGroup>
          <SectionGroup label="Beta feedback & support" open={isOpen('beta')} onToggle={() => toggleSection('beta')}>
          <AboutRow onFeedback={() => setFeedback(true)} />
          <button type="button" className="link sheet-h gold-tab-row" onClick={() => setCredits(true)}>Credits &amp; licenses</button>
          </SectionGroup>
        </div>
      </div>
    </div>
    {credits && <Credits onClose={() => setCredits(false)} />}
    {feedback && <Feedback onClose={() => setFeedback(false)} />}
    </>
  );
}
