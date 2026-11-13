import { useRef } from 'react';
import { CAMPAIGN_WEEKS } from '../config/balance';
import { actualAqi, aqiBand, dayOfWeek, rates, seasonOf, dayOf, weekOf } from '../engine/core';
import { useGame } from '../state/store';
import { Icon } from './icons';
import { inr, num, signed } from './format';

/** Direction of the last change of a value: 1, -1 or 0. */
function useTrend(v: number) {
  const ref = useRef({ v, t: 0, at: 0 });
  if (v !== ref.current.v) ref.current = { v, t: Math.sign(v - ref.current.v), at: Date.now() };
  return Date.now() - ref.current.at < 2500 ? ref.current.t : 0;
}

export function Hud() {
  const g = useGame((s) => s.game);
  const floaters = useGame((s) => s.floaters);
  const setSpeed = useGame((s) => s.setSpeed);
  const r = rates(g);
  const aqi = actualAqi(g);
  const band = aqiBand(aqi);
  const tAqi = useTrend(aqi);
  const tTrust = useTrend(Math.round(g.res.trust));
  const paused = g.speed === 0;
  const nextSpeed = g.speed === 1 ? 2 : g.speed === 2 ? 4 : 1;

  return (
    <header className="hud">
      <div className="hud-brand">Hawa <b>Badlo</b></div>

      <div className="hud-stats">
        <div className="stat" title={`Income ${inr(r.income)}/day − upkeep ${inr(r.maintenance)}/day`}>
          <span className="stat-icon money"><Icon name="wallet" /></span>
          <span className="stat-text">
            <small>Budget</small>
            <b className={g.res.budget < 0 ? 'neg' : ''}>{inr(g.res.budget)}</b>
          </span>
          <em className={`stat-sub ${r.net < 0 ? 'neg' : 'pos'}`}>{signed(r.net)}/day</em>
          <span className="floaters" aria-hidden>
            {floaters.map((f) => <i key={f.id} style={{ color: f.color }}>{f.text}</i>)}
          </span>
        </div>

        <div className={`stat ${tAqi > 0 ? 'flash-bad' : tAqi < 0 ? 'flash-good' : ''}`} title="Actual air quality from independent sensors (simulated). Lower is better.">
          <span className="stat-icon" style={{ background: band.color }}><Icon name="wind" /></span>
          <span className="stat-text">
            <small>Actual AQI</small>
            <b>{aqi}</b>
          </span>
          <em className="stat-sub band" style={{ color: band.color }}>{band.label}</em>
        </div>

        <div className={`stat ${tTrust > 0 ? 'flash-good' : tTrust < 0 ? 'flash-bad' : ''}`} title="How much citizens trust you. Raises your daily allocation.">
          <span className="stat-icon trust"><Icon name="smile" /></span>
          <span className="stat-text">
            <small>Public trust</small>
            <b>{num(g.res.trust)}%</b>
          </span>
          <span className="meter"><i style={{ width: `${g.res.trust}%` }} /></span>
        </div>
      </div>

      <div className="hud-time">
        <div className="week" title={seasonOf(dayOf(g)).blurb}>
          <small>{seasonOf(dayOf(g)).name}</small>
          <b>Week {weekOf(g)} <span>of {CAMPAIGN_WEEKS}</span></b>
          <span className="days">{Array.from({ length: 7 }, (_, i) => <i key={i} className={i < dayOfWeek(g) ? 'on' : ''} />)}</span>
        </div>
        <button className="icon-btn primary" onClick={() => setSpeed(paused ? 1 : 0)} aria-label={paused ? 'Play' : 'Pause'}>
          <Icon name={paused ? 'play' : 'pause'} />
        </button>
        <button className="icon-btn speed" onClick={() => setSpeed(paused ? 1 : nextSpeed)} aria-label="Change speed">
          <Icon name="fast" size={16} /> {paused ? '1' : g.speed}×
        </button>
        <button className="icon-btn" onClick={() => useGame.setState({ showSettings: true })} aria-label="Settings"><Icon name="settings" /></button>
      </div>
    </header>
  );
}
