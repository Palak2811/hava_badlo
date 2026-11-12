import { ACHIEVEMENTS } from '../../config/content';
import { actualAqi, agg, baselineAqi, emissions, reductionPct } from '../../engine/core';
import { SOURCES } from '../../engine/types';
import { useGame } from '../../state/store';
import { LineChart, SOURCE_META } from '../components/Charts';
import { inr, num } from '../format';

export default function StatsTab() {
  const g = useGame((s) => s.game);
  const a = agg(g);
  const em = emissions(g, false, a);
  const base = emissions(g, true, a);
  const h = g.history;
  const built = Object.values(g.buildings).filter((l) => l > 0).length;
  const firstDay = g.daily[0];
  const lastDay = g.daily[g.daily.length - 1];

  const tiles = [
    ['Current actual AQI', actualAqi(g)],
    ['Highest AQI', g.stats.highestAqi],
    ['Lowest AQI', g.stats.lowestAqi === 999 ? '—' : g.stats.lowestAqi],
    ['Reduction vs baseline', `${num(reductionPct(g), 1)}%`],
    ['Government spending', inr(g.stats.totalSpent)],
    ['Facilities built', built],
    ['Research completed', g.research.length],
    ['Events handled', g.stats.eventsHandled],
    ['Optics schemes used', g.stats.opticsUsed],
    ['Tough decisions', g.stats.toughDecisions],
    ['Citizen participation', `${num(g.participation)}%`],
    ['Exposés survived', g.stats.exposures],
  ];

  return (
    <div className="tab-page">
      <div className="page-head">
        <h2>📊 Statistics <span className="sim-tag">SIMULATED DATA</span></h2>
        <p>An illustrative model — emissions, concentration and AQI are separate quantities. This is not official Delhi data.</p>
      </div>
      <div className="tiles">
        {tiles.map(([k, v]) => (
          <div key={k as string} className="tile"><small>{k}</small><b>{v}</b></div>
        ))}
      </div>
      <div className="charts">
        <div className="card">
          <h3>AQI trend</h3>
          <LineChart data={h} series={[{ key: 'baseline', label: 'No-action baseline', color: '#94a3b8', dash: true }, { key: 'aqi', label: 'Actual', color: '#ef4444' }, { key: 'official', label: 'Official', color: '#ec4899', dash: true }]} />
        </div>
        <div className="card">
          <h3>Trust, credibility & pressure</h3>
          <LineChart data={h} max={100} series={[{ key: 'trust', label: 'Trust', color: '#0ea5e9' }, { key: 'credibility', label: 'Credibility', color: '#a855f7' }, { key: 'pressure', label: 'Pressure', color: '#f97316' }]} />
        </div>
        <div className="card">
          <h3>Total emissions trend</h3>
          <LineChart data={h} series={[{ key: 'emissions', label: 'Emissions (units)', color: '#eab308' }]} />
        </div>
        <div className="card">
          <h3>Source contributions — today vs no-action</h3>
          <div className="compare">
            {SOURCES.map((k) => {
              const max = Math.max(...SOURCES.map((x) => base[x]), 1);
              return (
                <div key={k} className="cmp-row">
                  <span>{SOURCE_META[k].icon} {SOURCE_META[k].label}</span>
                  <div className="cmp-bars">
                    <div className="cmp base" style={{ width: `${(base[k] / max) * 100}%` }} />
                    <div className="cmp now" style={{ width: `${(em[k] / max) * 100}%`, background: SOURCE_META[k].color }} />
                  </div>
                  <em>{num(em[k])} / {num(base[k])}{a.control[k] > 0 ? ` (−${num(a.control[k] * 100)}%)` : ''}</em>
                </div>
              );
            })}
          </div>
          {firstDay && lastDay && <p className="hint">Day {firstDay.day}: actual {firstDay.aqi} → Day {lastDay.day}: actual {lastDay.aqi} (baseline {lastDay.baseline}). Current baseline AQI: {baselineAqi(g)}.</p>}
        </div>
      </div>
      <h3 className="section-title">🏅 Achievements ({g.achievements.length}/{ACHIEVEMENTS.length})</h3>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((x) => {
          const got = g.achievements.includes(x.id);
          return (
            <div key={x.id} className={`ach ${got ? 'got' : ''}`}>
              <span className="ach-icon">{got ? x.icon : '🔒'}</span>
              <b>{x.name}</b>
              <small>{x.description}</small>
              <em>Reward: {x.rewardText}</em>
            </div>
          );
        })}
      </div>
    </div>
  );
}
