import { useEffect, useState, type ReactNode } from 'react';
import { BUILDING_MAP } from '../../config/balance';
import { ENDINGS, TUTORIAL_STEPS } from '../../config/content';
import { EVENT_MAP } from '../../config/events';
import { canAfford, dayOf, endingInput } from '../../engine/core';
import { useGame } from '../../state/store';
import { BuildingCard } from '../screens/InfraTab';
import { costText, inr, num, signed } from '../format';

function Modal({ children, onClose, className = '', label }: { children: ReactNode; onClose?: () => void; className?: string; label: string }) {
  useEffect(() => {
    if (!onClose) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal aria-label={label}>
      <div className={`modal ${className}`} onClick={(e) => e.stopPropagation()}>
        {onClose && <button className="close" onClick={onClose} aria-label="Close">✕</button>}
        {children}
      </div>
    </div>
  );
}

const SEV = ['', 'Minor', 'Serious', 'Critical'];

export function EventModal() {
  const uid = useGame((s) => s.eventOpen);
  const g = useGame((s) => s.game);
  const choose = useGame((s) => s.choose);
  const close = () => useGame.getState().openEvent(null);
  const ev = g.events.find((e) => e.uid === uid);
  if (!uid || !ev) return null;
  const d = EVENT_MAP[ev.defId];
  const left = Math.max(0, (ev.expires - g.tick) / 60);
  return (
    <Modal onClose={close} className={`event-modal sev-${d.severity}`} label={d.title}>
      <div className="news-banner">
        <span className="live">● {d.severity >= 3 ? 'BREAKING' : 'DEVELOPING'}</span>
        <span>{d.category} · {SEV[d.severity]} · Day {dayOf(g)}</span>
      </div>
      <div className="event-hero">{d.art}</div>
      <h2>{d.title}</h2>
      <p className="event-desc">{d.description}</p>
      <p className="hint">⏳ Auto-resolves (to the last option) in {num(left, 1)} days.{d.source !== 'none' ? ` Main source: ${d.source}.` : ''}</p>
      <div className="choices">
        {d.choices.map((c, i) => {
          const afford = !c.cost || canAfford(g, c.cost);
          return (
            <button key={i} className={`choice ${afford ? '' : 'disabled'}`} disabled={!afford} onClick={() => choose(ev.uid, i)}>
              <span className="choice-letter">{String.fromCharCode(65 + i)}</span>
              <span className="choice-body">
                <b>{c.label}{c.tough ? ' 💪' : ''}</b>
                <small>{c.desc}</small>
                <span className="choice-tags">
                  {c.cost && <em className="tag cost">{costText(c.cost)}</em>}
                  {c.deltas?.trust ? <em className={`tag ${c.deltas.trust > 0 ? 'good' : 'bad'}`}>Trust {signed(c.deltas.trust)}</em> : null}
                  {c.deltas?.pressure ? <em className={`tag ${c.deltas.pressure < 0 ? 'good' : 'bad'}`}>Pressure {signed(c.deltas.pressure)}</em> : null}
                  {c.deltas?.budget ? <em className={`tag ${c.deltas.budget > 0 ? 'good' : 'bad'}`}>{inr(c.deltas.budget)}</em> : null}
                  {c.deltas?.credibility && c.deltas.credibility < 0 ? <em className="tag bad">Credibility ↓</em> : null}
                  {c.temp && <em className={`tag ${c.temp.kind === 'good' ? 'good' : 'warn'}`}>{c.temp.label} · {c.temp.days}d</em>}
                  {c.dynamic && <em className="tag warn">Outcome depends on your record</em>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function BuildingModal() {
  const id = useGame((s) => s.selected);
  if (!id) return null;
  return (
    <Modal onClose={() => useGame.getState().select(null)} className="small-modal" label={BUILDING_MAP[id].name}>
      <BuildingCard def={BUILDING_MAP[id]} compact />
    </Modal>
  );
}

export function ConfirmModal() {
  const c = useGame((s) => s.confirm);
  if (!c) return null;
  const close = () => useGame.setState({ confirm: null });
  return (
    <Modal onClose={close} className="small-modal" label={c.title}>
      <h2>{c.title}</h2>
      <p>{c.body}</p>
      <div className="row-btns">
        <button className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn primary" onClick={() => { close(); c.onYes(); }}>Confirm</button>
      </div>
    </Modal>
  );
}

export function SettingsModal() {
  const open = useGame((s) => s.showSettings);
  const st = useGame((s) => s.settings);
  const upd = useGame((s) => s.updateSettings);
  const resetGame = useGame((s) => s.resetGame);
  const askConfirm = useGame((s) => s.askConfirm);
  if (!open) return null;
  const close = () => useGame.setState({ showSettings: false });
  return (
    <Modal onClose={close} className="small-modal" label="Settings">
      <h2>⚙️ Settings</h2>
      <label className="setting"><span>🔊 Sound effects</span><input type="checkbox" checked={st.sound} onChange={(e) => upd({ sound: e.target.checked })} /></label>
      <label className="setting"><span>SFX volume</span><input type="range" min={0} max={1} step={0.05} value={st.sfxVolume} onChange={(e) => upd({ sfxVolume: +e.target.value })} /></label>
      <label className="setting"><span>🎵 Music (procedural raag)</span><input type="checkbox" checked={st.music} onChange={(e) => upd({ music: e.target.checked })} /></label>
      <label className="setting"><span>Music volume</span><input type="range" min={0} max={1} step={0.05} value={st.musicVolume} onChange={(e) => upd({ musicVolume: +e.target.value })} /></label>
      <label className="setting"><span>✨ Animations & particles</span><input type="checkbox" checked={st.animations} onChange={(e) => upd({ animations: e.target.checked })} /></label>
      <div className="row-btns">
        <button className="btn ghost" onClick={() => { close(); useGame.setState({ game: { ...useGame.getState().game, tutorialDone: false } }); }}>Replay tutorial</button>
        <button className="btn danger" onClick={() => askConfirm({ title: 'Reset your term?', body: 'All progress, buildings and achievements will be permanently deleted. This cannot be undone.', onYes: () => { close(); resetGame(); } })}>Reset game</button>
      </div>
      <p className="hint">Progress auto-saves every 5 seconds and after every action.</p>
    </Modal>
  );
}

export function OfflineModal() {
  const o = useGame((s) => s.offline);
  const g = useGame((s) => s.game);
  if (!o || !g.tutorialDone) return null;
  const close = () => useGame.getState().dismissOffline();
  const h = Math.floor(o.seconds / 3600), m = Math.floor((o.seconds % 3600) / 60);
  return (
    <Modal onClose={close} className="small-modal" label="Welcome back">
      <div className="event-hero">🫖</div>
      <h2>Welcome back, Commissioner</h2>
      <p>You were away for {h > 0 ? `${h}h ` : ''}{m}m{o.seconds >= 8 * 3600 ? ' (offline progress is capped at 8 hours)' : ''}. Your department kept working at half speed.</p>
      <div className="tiles small">
        <div className="tile"><small>Budget</small><b className={o.budget >= 0 ? 'pos' : 'neg'}>{inr(o.budget)}</b></div>
        <div className="tile"><small>Research</small><b>{signed(o.rp)}</b></div>
        <div className="tile"><small>Capital</small><b>{signed(o.capital, 1)}</b></div>
        <div className="tile"><small>Trust</small><b className={o.trust >= 0 ? 'pos' : 'neg'}>{signed(o.trust, 1)}</b></div>
      </div>
      {o.notes.map((n) => <p key={n} className="hint">• {n}</p>)}
      <button className="btn primary wide" onClick={close}>Back to work</button>
    </Modal>
  );
}

export function TutorialModal() {
  const done = useGame((s) => s.game.tutorialDone);
  const finish = useGame((s) => s.finishTutorial);
  const [i, setI] = useState(0);
  if (done) return null;
  const st = TUTORIAL_STEPS[i];
  const last = i === TUTORIAL_STEPS.length - 1;
  return (
    <Modal className="tutorial" label="Tutorial">
      <div className="tut-steps">{TUTORIAL_STEPS.map((_, k) => <span key={k} className={k <= i ? 'on' : ''} />)}</div>
      <div className="event-hero">{st.icon}</div>
      <h2>{st.title}</h2>
      <p>{st.text}</p>
      <div className="row-btns">
        <button className="btn ghost" onClick={() => { setI(0); finish(); }}>Skip</button>
        {i > 0 && <button className="btn ghost" onClick={() => setI(i - 1)}>Back</button>}
        <button className="btn primary" onClick={() => (last ? (setI(0), finish()) : setI(i + 1))}>{last ? 'Take charge 🚀' : 'Next'}</button>
      </div>
    </Modal>
  );
}

export function EndingModal() {
  const g = useGame((s) => s.game);
  const resetGame = useGame((s) => s.resetGame);
  const sandbox = useGame((s) => s.continueSandbox);
  if (!g.ended || g.sandbox) return null;
  const e = ENDINGS[g.ended];
  const inp = endingInput(g);
  return (
    <Modal className="ending" label={e.title}>
      <div className="ending-hero" style={{ background: `linear-gradient(135deg, ${e.color}, #0f172a)` }}>
        <span className="ending-art">{e.art}</span>
        <small>TERM COMPLETE · 30 DAYS</small>
        <h1>{e.title}</h1>
        <p>{e.subtitle}</p>
      </div>
      <p>{e.text}</p>
      <div className="award">🏆 <b>Award:</b> {e.award}</div>
      <div className="tiles small">
        <div className="tile"><small>Final actual AQI (5-day avg)</small><b>{Math.round(inp.actualAqi)}</b></div>
        <div className="tile"><small>Official AQI</small><b>{Math.round(inp.officialAqi)}</b></div>
        <div className="tile"><small>Reduction vs baseline</small><b>{num(inp.reduction, 1)}%</b></div>
        <div className="tile"><small>Public trust</small><b>{num(inp.trust)}%</b></div>
        <div className="tile"><small>Committees + reports</small><b>{inp.committees + inp.reports}</b></div>
        <div className="tile"><small>Optics schemes</small><b>{inp.opticsUsed}</b></div>
        <div className="tile"><small>Tough decisions</small><b>{inp.toughDecisions}</b></div>
        <div className="tile"><small>Participation</small><b>{num(inp.participation)}%</b></div>
      </div>
      <div className="row-btns">
        <button className="btn ghost" onClick={sandbox}>Keep playing (sandbox)</button>
        <button className="btn primary" onClick={resetGame}>Start a new term</button>
      </div>
    </Modal>
  );
}
