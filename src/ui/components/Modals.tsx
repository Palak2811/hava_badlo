import { useEffect, type ReactNode } from 'react';
import { CAMPAIGN_PHASES } from '../../config/balance';
import { PHASE_BRIEFS } from '../../config/content';
import { EVENT_MAP, type ChoiceDef } from '../../config/events';
import { actualAqi, aqiBand, canAfford, weekOf, phaseOf } from '../../engine/core';
import { SOURCES, type PhaseReport } from '../../engine/types';
import { useGame } from '../../state/store';
import { Icon } from '../icons';
import { costText, inr, num, signed } from '../format';
import { SOURCE_META } from './Charts';

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
        {onClose && <button className="icon-btn ghost close" onClick={onClose} aria-label="Close"><Icon name="x" /></button>}
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- policy decision */

function Effect({ label, value, good }: { label: string; value: string; good: boolean | null }) {
  return (
    <div className={`fx ${good === null ? 'neutral' : good ? 'good' : 'bad'}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function airEffect(c: ChoiceDef): { now: string | null; good: boolean | null } {
  const m = c.temp?.modifier;
  if (!m) return { now: null, good: null };
  const em = m.emissionMult ? Object.values(m.emissionMult) : [];
  const worse = em.some((v) => (v ?? 1) > 1) || (m.dispersionMult ?? 1) < 1;
  const better = em.some((v) => (v ?? 1) < 1) || (m.dispersionMult ?? 1) > 1;
  if (worse && !better) return { now: 'Worse', good: false };
  if (better && !worse) return { now: 'Better', good: true };
  return { now: 'Mixed', good: null };
}

export function DecisionModal() {
  const uid = useGame((s) => s.eventOpen);
  const g = useGame((s) => s.game);
  const choose = useGame((s) => s.choose);
  const close = () => useGame.getState().openEvent(null);
  const ev = g.events.find((e) => e.uid === uid);
  if (!uid || !ev) return null;
  const d = EVENT_MAP[ev.defId];
  const left = Math.max(0, (ev.expires - g.tick) / 60);
  return (
    <Modal onClose={close} className="decision" label={d.title}>
      <div className="decision-head">
        <span className={`sev sev-${d.severity}`}>{['', 'Minor', 'Serious', 'Critical'][d.severity]} · {d.category}</span>
        <span className="timer"><Icon name="clock" size={14} /> Decide within {num(left, 1)} days</span>
      </div>
      <div className="decision-title">
        <span className="decision-art" aria-hidden>{d.art}</span>
        <div>
          <h2>{d.title}</h2>
          <p>{d.description}</p>
        </div>
      </div>
      <div className="options" style={{ ['--n' as string]: d.choices.length }}>
        {d.choices.map((c, i) => {
          const afford = !c.cost || canAfford(g, c.cost);
          const air = airEffect(c);
          return (
            <article key={i} className={`option ${afford ? '' : 'cant'}`}>
              <span className="opt-letter">{String.fromCharCode(65 + i)}</span>
              <h3>{c.label}</h3>
              <p>{c.desc}</p>
              <div className="fx-list">
                <Effect label="Cost" value={c.cost ? costText(c.cost) : 'Free'} good={null} />
                {c.deltas?.budget ? <Effect label="Budget" value={inr(c.deltas.budget)} good={c.deltas.budget > 0} /> : null}
                {c.deltas?.trust ? <Effect label="Trust now" value={signed(c.deltas.trust)} good={c.deltas.trust > 0} /> : null}
                {c.deltas?.pressure ? <Effect label="Pressure" value={signed(c.deltas.pressure)} good={c.deltas.pressure < 0} /> : null}
                {air.now && <Effect label="Air quality" value={air.now} good={air.good} />}
                {c.deltas?.credibility && c.deltas.credibility < 0 ? <Effect label="Credibility" value="Takes a hit" good={false} /> : null}
              </div>
              {(c.temp || c.dynamic || c.tough) && (
                <div className="later">
                  <small>Later</small>
                  {c.temp && <span>{c.temp.label} for {c.temp.days} days</span>}
                  {c.dynamic && <span>Outcome depends on your record so far</span>}
                  {c.tough && <span>Counts as a tough decision</span>}
                </div>
              )}
              <button className="btn block" disabled={!afford} onClick={() => choose(ev.uid, i)}>
                {afford ? 'Choose' : 'Can’t afford'}
              </button>
            </article>
          );
        })}
      </div>
      <p className="hint center">If you don’t decide, the last option is taken for you.</p>
    </Modal>
  );
}

/* --------------------------------------------------------------- weekly briefing */

export function BriefingModal() {
  const g = useGame((s) => s.game);
  const dismiss = useGame((s) => s.dismissBriefing);
  const offline = useGame((s) => s.offline);
  const w = phaseOf(g);
  if (!g.introDone || !g.tutorialDone || g.reportPending || offline || g.sandbox || (g.ended && !g.sandbox) || g.briefingSeen >= w) return null;
  const brief = PHASE_BRIEFS[w - 1];
  const aqi = actualAqi(g);
  return (
    <Modal className="briefing" label={`Week ${w} briefing`}>
      <div className="memo-top">
        <span>Office of the Commissioner · Clean Air Mission</span>
        <span className="stamp">Phase {w} / {CAMPAIGN_PHASES}</span>
      </div>
      <small className="eyebrow">Quarterly briefing · {brief.weeks} · now week {weekOf(g)}</small>
      <h2>{brief.title}</h2>
      <p className="memo-text">{brief.text}</p>
      <div className="trio">
        <div><small>Budget</small><b>{inr(g.res.budget)}</b></div>
        <div><small>Actual AQI</small><b style={{ color: aqiBand(aqi).color }}>{aqi}</b><em>{aqiBand(aqi).label}</em></div>
        <div><small>Public trust</small><b>{num(g.res.trust)}%</b></div>
      </div>
      <div className="challenge"><Icon name="flame" /> <span><small>This quarter’s challenge</small>{brief.challenge}</span></div>
      <button className="btn primary block" onClick={dismiss}>Begin {brief.title} <Icon name="arrow" /></button>
    </Modal>
  );
}

/* --------------------------------------------------------------- end-of-week report */

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function narrative(r: PhaseReport) {
  const dA = r.end.aqi - r.start.aqi;
  const dT = r.end.trust - r.start.trust;
  if (dA < -20 && dT >= 0) return 'A genuinely good week. Somebody in the Ministry asked what you’re doing differently, then forgot to write it down.';
  if (dA < -20) return 'The air improved, though not everyone noticed — people rarely thank you for what they no longer have to breathe.';
  if (dA > 40 && dT < 0) return 'A rough week. The air got worse, and so did the mood. The RWA WhatsApp group has gone fully nuclear.';
  if (dA > 40) return 'The season was against you. The air got worse, but the city hasn’t given up on you — yet.';
  if (dT > 5) return 'People are warming to you. The air is still deciding.';
  return 'A week of holding the line. Nothing collapsed, which in Delhi counts as a minor miracle.';
}

export function ReportModal() {
  const g = useGame((s) => s.game);
  const dismiss = useGame((s) => s.dismissReport);
  if (!g.reportPending || !g.phaseReports.length) return null;
  const r = g.phaseReports[g.phaseReports.length - 1];
  const final = r.phase >= CAMPAIGN_PHASES;
  const max = Math.max(1, ...SOURCES.map((k) => Math.max(r.start.emissions[k], r.end.emissions[k])));
  const rows = [
    { k: 'Budget', a: inr(r.start.budget), b: inr(r.end.budget), d: r.end.budget - r.start.budget, good: r.end.budget >= r.start.budget, fmt: inr },
    { k: 'Actual AQI', a: String(r.start.aqi), b: String(r.end.aqi), d: r.end.aqi - r.start.aqi, good: r.end.aqi <= r.start.aqi, fmt: (n: number) => signed(n) },
    { k: 'Public trust', a: `${r.start.trust}%`, b: `${r.end.trust}%`, d: r.end.trust - r.start.trust, good: r.end.trust >= r.start.trust, fmt: (n: number) => signed(n) },
  ];
  return (
    <Modal className="report" label={`Phase ${r.phase} report`}>
      <small className="eyebrow">End of phase {r.phase} · {PHASE_BRIEFS[r.phase - 1].title}</small>
      <h2>Quarterly performance report</h2>
      <p className="memo-text">{narrative(r)}</p>
      <div className="report-rows">
        {rows.map((x) => (
          <div key={x.k} className="report-row">
            <span>{x.k}</span>
            <span className="from">{x.a}</span>
            <Icon name="arrow" size={14} />
            <b>{x.b}</b>
            <em className={x.good ? 'pos' : 'neg'}>{x.fmt(x.d)}</em>
          </div>
        ))}
      </div>
      <div className="report-grid">
        <div>
          <h4>Pollution sources</h4>
          {SOURCES.map((k) => {
            const d = r.end.emissions[k] - r.start.emissions[k];
            return (
              <div key={k} className="src-row">
                <span>{SOURCE_META[k].label}</span>
                <span className="src-bars">
                  <i className="was" style={{ width: `${(r.start.emissions[k] / max) * 100}%` }} />
                  <i className="now" style={{ width: `${(r.end.emissions[k] / max) * 100}%`, background: SOURCE_META[k].color }} />
                </span>
                <em className={Math.round(d) <= 0 ? 'pos' : 'neg'}>{signed(Math.round(d) || 0)}</em>
              </div>
            );
          })}
        </div>
        <div>
          <h4>This week</h4>
          <ul className="ticks">
            <li><Icon name="check" size={14} /> {plural(r.end.objectivesDone - r.start.objectivesDone, 'objective')} completed</li>
            <li><Icon name="check" size={14} /> {plural(r.end.eventsHandled - r.start.eventsHandled, 'decision')} taken</li>
            {r.consequences.map((c, i) => <li key={i} className="warn"><Icon name="alert" size={14} /> {c}</li>)}
          </ul>
          {r.headlines.length > 0 && (
            <>
              <h4>In the papers</h4>
              {r.headlines.map((h, i) => <p key={i} className="clip">{/^[“"]/.test(h) ? h : `“${h}”`}</p>)}
            </>
          )}
        </div>
      </div>
      <button className="btn primary block" onClick={dismiss}>{final ? 'See the final verdict' : `On to ${PHASE_BRIEFS[r.phase].title}`} <Icon name="arrow" /></button>
    </Modal>
  );
}

/* --------------------------------------------------------------- misc */

export function ConfirmModal() {
  const c = useGame((s) => s.confirm);
  if (!c) return null;
  const close = () => useGame.setState({ confirm: null });
  return (
    <Modal onClose={close} className="small" label={c.title}>
      <h2>{c.title}</h2>
      <p className="memo-text">{c.body}</p>
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
    <Modal onClose={close} className="small" label="Settings">
      <h2>Settings</h2>
      <label className="setting"><span>Sound effects</span><input type="checkbox" checked={st.sound} onChange={(e) => upd({ sound: e.target.checked })} /></label>
      <label className="setting"><span>Effects volume</span><input type="range" min={0} max={1} step={0.05} value={st.sfxVolume} onChange={(e) => upd({ sfxVolume: +e.target.value })} /></label>
      <label className="setting"><span>Music</span><input type="checkbox" checked={st.music} onChange={(e) => upd({ music: e.target.checked })} /></label>
      <label className="setting"><span>Music volume</span><input type="range" min={0} max={1} step={0.05} value={st.musicVolume} onChange={(e) => upd({ musicVolume: +e.target.value })} /></label>
      <label className="setting"><span>Pause when a week settles</span><input type="checkbox" checked={st.pauseOnWeekEnd} onChange={(e) => upd({ pauseOnWeekEnd: e.target.checked })} /></label>
      <label className="setting"><span>Animations</span><input type="checkbox" checked={st.animations} onChange={(e) => upd({ animations: e.target.checked })} /></label>
      <div className="row-btns">
        <button className="btn ghost" onClick={() => { close(); useGame.getState().replayTutorial(); }}>Replay tutorial</button>
        <button className="btn ghost" onClick={() => { close(); useGame.setState({ game: { ...useGame.getState().game, introDone: false } }); }}>Replay intro</button>
        <button className="btn danger" onClick={() => askConfirm({ title: 'Reset your term?', body: 'All progress, facilities and achievements will be permanently deleted. This cannot be undone.', onYes: () => { close(); resetGame(); } })}>Reset game</button>
      </div>
      <p className="hint">Progress saves automatically.</p>
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
    <Modal onClose={close} className="small" label="Welcome back">
      <small className="eyebrow">While you were away</small>
      <h2>Welcome back, Commissioner</h2>
      <p className="memo-text">You were away for {h > 0 ? `${h}h ` : ''}{m}m{o.seconds >= 8 * 3600 ? ' (capped at 8 hours)' : ''}. The department kept working at half speed.</p>
      <div className="trio">
        <div><small>Budget</small><b className={o.budget >= 0 ? 'pos' : 'neg'}>{inr(o.budget)}</b></div>
        <div><small>Research</small><b>{signed(o.rp)}</b></div>
        <div><small>Trust</small><b className={o.trust >= 0 ? 'pos' : 'neg'}>{signed(o.trust, 1)}</b></div>
      </div>
      {o.notes.map((n) => <p key={n} className="hint">• {n}</p>)}
      <button className="btn primary block" onClick={close}>Back to work</button>
    </Modal>
  );
}

