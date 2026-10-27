/**
 * Start screens (milestone 3a): Home → Who are you playing? → Your table.
 * The game itself is picked on the table step (ModeSetup: mode + its generated options).
 * Bid Wit Me's Spades doors (team/cutthroat, Jokers/Ace Down), house rules, deck, venue and
 * summary bar are gone; the gear still opens the app Settings sheet.
 */
import { ThemeChip } from './ThemeToggle';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { CODE_LENGTH, isRoomCode, normalizeRoomCode } from '@pp/protocol';
import { requestSettingsSheet } from './settingsSheet';
import { coverThen } from './spray';
import { serverUrl } from './online/config';
import { createTable, tableInfo } from './online/connection';
import { type PendingMusic, SetupMusicPicker, savePendingMusic } from './online/HostMusic';
import { isMusicLink } from '@pp/protocol';
import { loadName, saveName } from './online/identity';
import { navigate } from './online/nav';
import GearIcon from './GearIcon';
import { AccountEntry } from './account/AccountUI';
import { SocialButton } from './social/Social';
import { OpenTables } from './social/OpenTables';
import { ModeSetup } from './modes/ModeSetup';
import { type ModeChoice, loadModeChoice, modeEntry, saveModeChoice } from './modes/catalog';

type Step = 'home' | 'opponent' | 'table';
type Path = 'bots' | 'online';
type TableView = 'lobby' | 'create';
const ORDER: Step[] = ['home', 'opponent', 'table'];

interface Props {
  onStart: (c: ModeChoice) => void;
}

function readWiz(): { step: Step; path: Path; view: TableView } {
  const w = (history.state ?? {}) as { wiz?: string; path?: Path; view?: TableView };
  // older wizard steps (Spades doors) land on their nearest screen
  const legacy: Record<string, Step> = { door: 'opponent', branch: 'opponent', mode: 'opponent', setup: 'table' };
  const step = (w.wiz && (ORDER.includes(w.wiz as Step) ? (w.wiz as Step) : legacy[w.wiz])) || 'home';
  return { step, path: w.path === 'online' ? 'online' : 'bots', view: w.view === 'create' ? 'create' : 'lobby' };
}

/** Most recent online seat (token saved in the last 12 h) → offer to rejoin it if the table still exists. */
function useOnlineSeat(): string | null {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    try {
      const t = JSON.parse(localStorage.getItem('bwm.online.tokens') ?? '{}') as Record<string, { at: number }>;
      const recent = Object.entries(t).filter(([, v]) => Date.now() - v.at < 12 * 3600_000).sort((a, b) => b[1].at - a[1].at)[0];
      if (recent) {
        tableInfo(serverUrl(), recent[0])
          .then((i) => { if (alive && i.exists && i.phase !== 'over' && i.phase !== 'lobby') setCode(recent[0]); })
          .catch(() => {});
      }
    } catch { /* ignore */ }
    return () => { alive = false; };
  }, []);
  return code;
}

/** Bottom-anchored commit bar: the step's action plus a one-line summary of the pick. */
export function SetupBar({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <div className="setup-bar" data-testid="setup-bar">
      <p className="setup-bar-summary" data-testid="setup-bar-summary">{summary}</p>
      <div className="setup-bar-actions">{children}</div>
    </div>
  );
}

/** One collapsible section card on the table step. */
export function SetupCard({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className={`setup-card${open ? '' : ' is-closed'}`} aria-label={title}>
      <h3 className="setup-card-h">
        <button type="button" className="setup-card-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span>{title}</span>
          <span className="setup-card-chevron" aria-hidden="true" />
        </button>
      </h3>
      <div className="setup-card-body"><div className="setup-card-body-in">{children}</div></div>
    </section>
  );
}

/** One line for the setup bar: game · seats · options changed from the defaults. */
export function modeSummary(c: ModeChoice): string {
  const m = modeEntry(c.modeId);
  const changed = m.schema.filter((o) => c.options[o.key] !== undefined && c.options[o.key] !== o.default).length;
  return [m.title, m.seats, changed ? `${changed} option${changed === 1 ? '' : 's'} changed` : 'Default rules'].join(' · ');
}

function DecisionCard({ testid, title, sub, emblem, onPick }: { testid: string; title: string; sub: string; emblem: string; onPick: () => void }) {
  return (
    <button type="button" className="decision-card" data-testid={testid} onClick={onPick}>
      <span className="dc-main"><b>{title}</b><small>{sub}</small></span>
      <span className="dc-emblem">{emblem}</span>
    </button>
  );
}

export default function Setup({ onStart }: Props) {
  const [{ step, path, view }, setWiz] = useState(readWiz);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const onlineSeat = useOnlineSeat();
  const [modeChoice, setModeChoiceState] = useState<ModeChoice>(() => loadModeChoice());
  const setModeChoice = (c: ModeChoice) => { setModeChoiceState(c); saveModeChoice(c); };
  const gameCard = <SetupCard title="Game"><ModeSetup value={modeChoice} onChange={setModeChoice} /></SetupCard>;

  const stepRef = useRef(step);
  stepRef.current = step;
  const crossesHome = (to: Step) => (stepRef.current === 'home') !== (to === 'home');
  const swapWiz = (apply: () => void, to: Step) => { if (crossesHome(to)) coverThen(apply); else apply(); };

  useEffect(() => {
    if (!(history.state as { wiz?: Step } | null)?.wiz) history.replaceState({ ...(history.state ?? {}), wiz: 'home' }, '');
    const on = () => {
      if (location.pathname !== '/') return; // a route popstate: Root owns it
      const w = readWiz();
      const apply = () => setWiz((cur) => { setDir(ORDER.indexOf(w.step) < ORDER.indexOf(cur.step) || (w.step === cur.step && cur.view === 'create' && w.view === 'lobby') ? 'back' : 'fwd'); return w; });
      if (crossesHome(w.step)) coverThen(apply);
      else apply();
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  const go = (next: Step, p: Path = path, v: TableView = 'lobby') => {
    swapWiz(() => {
      const d = ((history.state as { d?: number } | null)?.d ?? 0) + 1;
      history.pushState({ wiz: next, path: p, view: v, d }, '');
      setDir('fwd');
      setWiz({ step: next, path: p, view: v });
    }, next);
  };
  const back = () => {
    const d = (history.state as { d?: number } | null)?.d ?? 0;
    if (d > 0) { history.back(); return; }
    if (step === 'table' && view === 'create') {
      history.replaceState({ wiz: 'table', path, view: 'lobby', d: 0 }, '', '/');
      setDir('back');
      setWiz({ step: 'table', path, view: 'lobby' });
      return;
    }
    const prev = ORDER[Math.max(0, ORDER.indexOf(step) - 1)]!;
    swapWiz(() => {
      history.replaceState({ wiz: prev, path, view: 'lobby', d: 0 }, '', '/');
      setDir('back');
      setWiz({ step: prev, path, view: 'lobby' });
    }, prev);
  };
  const home = () => swapWiz(() => {
    history.replaceState({ wiz: 'home', path, view: 'lobby', d: 0 }, '', '/');
    setDir('back');
    setWiz({ step: 'home', path, view: 'lobby' });
  }, 'home');

  let body: ReactNode;
  if (step === 'home') {
    body = (
      <div className="wiz-home">
        <div className="theme-chip-row"><ThemeChip /></div>
        <div className="splash">
          <h1 className="pp-wordmark">Pity Party</h1>
          <span className="beta-tag" data-testid="beta-tag">BETA</span>
          <p className="tagline">Pitty Pat &amp; Tonk with the crew</p>
        </div>
        <div className="wiz-actions">
          <button type="button" className="hero-btn gold" data-testid="play" onClick={() => go('opponent')}><b>PLAY</b><small>vs bots or online</small></button>
          {onlineSeat && <button type="button" className="quiet-row" data-testid="resume-online" onClick={() => navigate(`/t/${onlineSeat}`)}><span>Rejoin your online table</span><span className="value-chip">{onlineSeat}</span></button>}
        </div>
      </div>
    );
  } else if (step === 'opponent') {
    body = (
      <>
        <p className="wiz-crumb">Play</p>
        <h2 className="wiz-title">Who are you playing?</h2>
        <p className="wiz-stepno">Step 1 of 2</p>
        <div className="decision-cards">
          <DecisionCard testid="play-online" title="PLAY ONLINE" sub="Open tables, create or join with a code" emblem="TABLES" onPick={() => go('table', 'online')} />
          <DecisionCard testid="play-bots" title="VS BOTS" sub="Solo table — bots fill the seats" emblem="SOLO TABLE" onPick={() => go('table', 'bots')} />
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p className="wiz-crumb">{path === 'online' ? 'Play Online' : 'Vs Bots'}</p>
        <h2 className="wiz-title">{path === 'online' ? (view === 'create' ? 'Create a table' : 'Find a table') : 'Your Table'}<small>{modeEntry(modeChoice.modeId).title}</small></h2>
        {path === 'bots' ? (
          <div className="ess ess-barred">
            {gameCard}
            <SetupBar summary={modeSummary(modeChoice)}><button type="button" className="primary big go" data-testid="start-bots" onClick={() => onStart(modeChoice)}>DEAL ME IN</button><p className="sticky-note">Bots fill the table</p></SetupBar>
          </div>
        ) : (
          <OnlineStep gameCard={gameCard} summary={modeSummary(modeChoice)} view={view} onOpenCreate={() => go('table', 'online', 'create')} />
        )}
      </>
    );
  }

  return (
    <div className={`wizard step-${step}`} data-testid="wizard">
      <header className="wiz-bar">
        {step !== 'home' ? (
          <span className="wiz-nav">
            <button type="button" className="back-chip" aria-label="Back" data-testid="wiz-back" onClick={back}><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d="M6 1 L1.5 6 L6 11 M2 6 H17" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="square"/></svg>BACK</button>
            <button type="button" className="icon-btn home" aria-label="Home" title="Home" data-testid="wiz-home" onClick={home}>PP</button>
          </span>
        ) : <AccountEntry showChip />}
        <div className="wiz-dots" aria-hidden>{ORDER.map((x) => <i key={x} className={x === step ? 'on' : ''} />)}</div>
        <span className="wiz-right">
          <SocialButton className="wiz-social" />
          <button type="button" className="icon-btn gear" aria-label="More options" data-testid="more" onClick={() => requestSettingsSheet()}><GearIcon /></button>
          <span className="dock-slot" aria-hidden />
        </span>
      </header>
      <main key={step} className={`wiz-step slide-${dir}`}>{body}</main>
    </div>
  );
}

/** Online table step: lobby (name, join by code, open tables, one Create entry), then the create form. */
function OnlineStep({ gameCard, summary, view, onOpenCreate }: { gameCard: ReactNode; summary: string; view: TableView; onOpenCreate: () => void }) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [music, setMusic] = useState<PendingMusic | null>(null);
  const nameOk = name.trim().length > 0;
  const create = async () => {
    if (!nameOk) { setErr('Enter your name first'); return; }
    if (music?.mode === 'link' && !isMusicLink(music.url.trim())) { setErr('Paste an open.spotify.com or music.apple.com link (or set Table music to Off)'); return; }
    setBusy(true); setErr(null);
    try {
      const c = await createTable(serverUrl());
      savePendingMusic(c, music?.mode === 'link' ? { ...music, url: music.url.trim() } : music);
      saveName(name.trim());
      sessionStorage.setItem(`bwm.created.${c}`, '1');
      navigate(`/t/${c}`);
    } catch (e) { setErr((e as Error).message || "Can't reach the game server."); } finally { setBusy(false); }
  };
  const join = async (e?: FormEvent) => {
    e?.preventDefault();
    const c = normalizeRoomCode(code);
    if (!nameOk) { setErr('Enter your name first'); return; }
    if (!isRoomCode(c)) { setErr(`Table codes are ${CODE_LENGTH} letters/numbers`); return; }
    setBusy(true); setErr(null);
    try {
      const i = await tableInfo(serverUrl(), c);
      if (!i.exists) { setErr(`No table with code ${c}`); return; }
      saveName(name.trim());
      navigate(`/t/${c}`);
    } catch { setErr("Can't reach the game server."); } finally { setBusy(false); }
  };
  const nameRow = (
    <label className="ess-row">
      <span className="ess-label">Your name</span>
      <input className="name-input" value={name} maxLength={20} autoComplete="nickname" placeholder="e.g. Meech" onChange={(e) => setName(e.target.value)} aria-label="Your name" />
    </label>
  );
  if (view === 'create') {
    return (
      <div className="ess ess-barred" key="create">
        {gameCard}
        <SetupCard title="Table">{nameRow}</SetupCard>
        <SetupCard title="Sound"><SetupMusicPicker value={music} onChange={setMusic} /></SetupCard>
        {err && <div className="err" role="alert">{err}</div>}
        <SetupBar summary={summary}><button type="button" className="primary big go" disabled={busy} onClick={create} data-testid="create-table">CREATE TABLE</button></SetupBar>
      </div>
    );
  }
  return (
    <div className="ess" key="lobby">
      <section className="setup-card" aria-label="You">
        <h3 className="setup-card-h">You</h3>
        {nameRow}
      </section>
      <section className="setup-card" aria-label="Join with a code">
        <h3 className="setup-card-h">Join with a code</h3>
        <form className="join-row quiet-join" onSubmit={join}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TABLE CODE" maxLength={8} aria-label="Table code" autoCapitalize="characters" />
          <button type="submit" className="micro-action" disabled={busy} data-testid="join-code">JOIN</button>
        </form>
      </section>
      <button type="button" className="primary big go lobby-create" data-testid="create-open" onClick={onOpenCreate}>CREATE A TABLE</button>
      <OpenTables selected="all" />
      {err && <div className="err" role="alert">{err}</div>}
    </div>
  );
}
