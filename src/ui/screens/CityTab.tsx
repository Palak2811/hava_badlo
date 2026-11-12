import { STAGES } from '../../config/balance';
import { STAGE_OBJECTIVES } from '../../config/content';
import { EVENT_MAP } from '../../config/events';
import { actualAqi, agg, aqiBand, baselineAqi, emissions, officialAqi, reductionPct } from '../../engine/core';
import { SOURCES } from '../../engine/types';
import { useGame } from '../../state/store';
import { Gauge, SOURCE_META } from '../components/Charts';
import { num } from '../format';

export default function CityTab() {
  const g = useGame((s) => s.game);
  const openEvent = useGame((s) => s.openEvent);
  const setTab = useGame((s) => s.setTab);
  const a = agg(g);
  const aqi = actualAqi(g);
  const off = officialAqi(g, a);
  const base = baselineAqi(g);
  const em = emissions(g, false, a);
  const total = SOURCES.reduce((t, k) => t + em[k], 0);
  const red = reductionPct(g);
  const stageObjs = STAGE_OBJECTIVES.filter((o) => o.stage === g.stage);

  return (
    <div className="city-panels">
      <div className="card aqi-card">
        <h3>Air Quality <span className="sim-tag">SIMULATED</span></h3>
        <div className="aqi-row">
          <Gauge value={off} label={g.aqiRenamed ? 'Aspirational QI' : 'Official AQI'} />
          <div className="aqi-side">
            <div className="aqi-actual" style={{ color: aqiBand(aqi).color }}>
              <span>Actual (independent)</span>
              <b>{aqi}</b>
            </div>
            <div className="aqi-actual muted">
              <span>If you did nothing</span>
              <b>{base}</b>
            </div>
            <div className={`chip ${red > 0 ? 'chip-green' : 'chip-grey'}`}>{red > 0 ? `▼ ${num(red, 1)}% from your work` : 'No measurable impact yet'}</div>
            {off < aqi - 5 && <div className="chip chip-pink">🎭 Optics gap: {aqi - off}</div>}
          </div>
        </div>
        <div className="source-bars">
          {SOURCES.map((k) => (
            <div key={k} className="source-bar" title={`${SOURCE_META[k].label}: ${num(em[k])} units, control ${num(a.control[k] * 100)}%`}>
              <span>{SOURCE_META[k].icon} {SOURCE_META[k].label}</span>
              <div className="track"><div style={{ width: `${(em[k] / total) * 100}%`, background: SOURCE_META[k].color }} /></div>
              <em>{num((em[k] / total) * 100)}%</em>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>⚡ Active Events</h3>
        {g.events.length === 0 ? (
          <p className="empty">☕ All quiet. Suspiciously quiet.</p>
        ) : (
          g.events.map((e) => {
            const d = EVENT_MAP[e.defId];
            return (
              <button key={e.uid} className={`event-row sev-${d.severity}`} onClick={() => openEvent(e.uid)}>
                <span className="event-art">{d.art}</span>
                <span><b>{d.title}</b><small>{d.category} · decide before it decides for you</small></span>
                <span className="go">Decide →</span>
              </button>
            );
          })
        )}
        {g.effects.length > 0 && (
          <div className="effects">
            {g.effects.map((e) => (
              <span key={e.id} className={`effect effect-${e.kind}`} title={`${Math.ceil((e.until - g.tick) / 60 * 10) / 10} days left`}>{e.label}</span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>🎯 Today's Objectives</h3>
        <ul className="objectives">
          {g.objectives.map((o) => (
            <li key={o.id} className={o.done ? 'done' : ''}>
              <span className="check">{o.done ? '✔' : '○'}</span>
              <span>{o.label}</span>
              <small>{o.reward.budget ? `₹${o.reward.budget}` : ''}{o.reward.rp ? ` ${o.reward.rp} RP` : ''}{o.reward.capital ? ` ${o.reward.capital}🏛️` : ''}{o.reward.trust ? ` +${o.reward.trust} trust` : ''}</small>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h3>🗺️ Campaign — Stage {g.stage}: {STAGES[g.stage - 1].name}</h3>
        <ul className="objectives">
          {stageObjs.map((o) => (
            <li key={o.id} className={g.stageObjectivesDone.includes(o.id) ? 'done' : ''}>
              <span className="check">{g.stageObjectivesDone.includes(o.id) ? '✔' : '○'}</span>
              <span>{o.label}</span>
            </li>
          ))}
        </ul>
        <div className="stage-track">
          {STAGES.map((s) => (
            <span key={s.id} className={`stage-dot ${s.id < g.stage ? 'past' : s.id === g.stage ? 'now' : ''} ${s.locked ? 'locked' : ''}`} title={`${s.name}${s.locked ? ' — future expansion' : ''}: ${s.blurb}`}>
              {s.locked ? '🔒' : s.id}
            </span>
          ))}
        </div>
        {g.stage === 2 && <p className="hint">Stages 3–5 arrive in future expansions. Finish the 30-day term to see your ending.</p>}
      </div>

      <div className="card announcements">
        <h3>📢 Recent Announcements</h3>
        {g.news.slice(0, 5).map((n) => (
          <div key={n.id} className={`ann kind-${n.kind}`}>
            <small>Day {n.day}</small> {n.headline}
          </div>
        ))}
        <button className="link" onClick={() => setTab('news')}>All news →</button>
      </div>
    </div>
  );
}
