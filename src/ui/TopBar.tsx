import { useRef } from 'react';
import { CAMPAIGN_DAYS, STAGES } from '../config/balance';
import { actualAqi, aqiBand, dayOf, officialAqi, rates, seasonOf } from '../engine/core';
import { useGame } from '../state/store';
import { inr, num, signed } from './format';

function Metric({ icon, label, value, sub, tip, tone, trend }: { icon: string; label: string; value: string; sub?: string; tip: string; tone: string; trend?: number }) {
  return (
    <div className={`metric tone-${tone}`} tabIndex={0}>
      <span className="metric-icon">{icon}</span>
      <div className="metric-body">
        <span className="metric-label">{label}</span>
        <span className="metric-value">
          {value}
          {trend !== undefined && trend !== 0 && <em className={trend > 0 ? 'up' : 'down'}>{trend > 0 ? '▲' : '▼'}</em>}
        </span>
        {sub && <span className="metric-sub">{sub}</span>}
      </div>
      <div className="tooltip" role="tooltip">{tip}</div>
    </div>
  );
}

/** Remember the last non-zero direction of change for a value. */
function useTrend(v: number) {
  const ref = useRef({ v, t: 0 });
  if (v !== ref.current.v) ref.current = { v, t: Math.sign(v - ref.current.v) };
  return ref.current.t;
}

export default function TopBar() {
  const g = useGame((s) => s.game);
  const setSpeed = useGame((s) => s.setSpeed);
  const r = rates(g);
  const aqi = actualAqi(g);
  const off = officialAqi(g, r.a);
  const band = aqiBand(off);
  const day = dayOf(g);
  const season = seasonOf(day);
  const tTrust = useTrend(Math.round(g.res.trust));
  const tPress = useTrend(Math.round(g.res.pressure));
  const tAqi = useTrend(off);
  return (
    <header className="topbar">
      <div className="brand">
        <h1 className="logo small">HAWA <span>BADLO</span></h1>
        <span className="stage-pill">Stage {g.stage}: {STAGES[g.stage - 1].name}</span>
      </div>
      <div className="metrics">
        <Metric icon="💰" label="Budget" value={inr(g.res.budget)} sub={`${signed(r.net)}/day`} tone={g.res.budget < 0 ? 'red' : 'green'} tip={`Income ${inr(r.income)}/day (scales with trust) − maintenance ${inr(r.maintenance)}/day = net ${inr(r.net)}/day. One in-game day ≈ 1 real minute at 1×. You can overdraw to −₹5,000, but debt erodes trust.`} />
        <Metric icon="🌫️" label={g.aqiRenamed ? 'Aspirational QI' : 'Official AQI'} value={num(off)} sub={`${band.label} · actual ${aqi}`} tone={band.level >= 4 ? 'red' : band.level >= 3 ? 'orange' : band.level >= 2 ? 'yellow' : 'sky'} trend={-tAqi} tip="SIMULATED game AQI, not live Delhi data. 'Official' is what your department reports; 'actual' is the independent estimate of the real air. Optics schemes widen the gap." />
        <Metric icon="🙂" label="Public Trust" value={`${num(g.res.trust)}%`} tone={g.res.trust < 35 ? 'red' : 'sky'} trend={tTrust} tip="How much citizens believe you. Raises your daily allocation. Falls when the air is bad, when you are caught fibbing, or when you are broke." />
        <Metric icon="🔥" label="Pressure" value={`${num(g.res.pressure)}%`} tone={g.res.pressure > 75 ? 'red' : g.res.pressure > 50 ? 'orange' : 'yellow'} trend={-tPress} tip="Political pressure from the Ministry and media. Rises with perceived AQI. At 100% for 2 days a show-cause notice arrives." />
        <Metric icon="🔬" label="Research" value={num(g.res.rp)} sub={`+${num(r.research)}/day`} tone="purple" tip="Research Points, produced by the AQI Monitoring Centre. Spend them in Research & Technology." />
        <Metric icon="🏛️" label="Capital" value={num(g.res.capital)} sub={`+${num(r.capital, 1)}/day`} tone="purple" tip="Political capital: needed for tough policies and some schemes. Earned slowly; faster with a PR Office." />
        <Metric icon="🍃" label="Clean Air Credits" value={num(g.res.cac, 1)} tone="green" tip="Earned continuously for every AQI point your real interventions remove versus the no-action baseline. Trade for grants or advanced research." />
        <Metric icon="📅" label={`Day ${Math.min(day, CAMPAIGN_DAYS)} / ${CAMPAIGN_DAYS}`} value={season.name} tone="sky" tip={season.blurb} />
      </div>
      <div className="controls">
        {([0, 1, 2, 4] as const).map((sp) => (
          <button key={sp} className={`speed ${g.speed === sp ? 'on' : ''}`} onClick={() => setSpeed(sp)} aria-label={sp === 0 ? 'Pause' : `Speed ${sp}x`} title={sp === 0 ? 'Pause' : `${sp}× speed`}>
            {sp === 0 ? '⏸' : `${sp}×`}
          </button>
        ))}
        <button className="speed" onClick={() => useGame.setState({ showSettings: true })} aria-label="Settings" title="Settings">⚙️</button>
      </div>
    </header>
  );
}
