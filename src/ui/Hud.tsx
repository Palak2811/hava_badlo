import { useRef } from 'react';
import { CAMPAIGN_WEEKS } from '../config/balance';
import { PHASE_BRIEFS } from '../config/content';
import { actualAqi, aqiBand, phaseOf, rates, seasonOf, weekOf, weekProgress } from '../engine/core';
import { useGame } from '../state/store';
import { Icon } from './icons';
import { inr, num, signed } from './format';

/** Direction of the last change of a value: 1, -1 or 0 (fades after 2.5 s). */
function useTrend(v: number) {
  const ref = useRef({ v, t: 0, at: 0 });
  if (v !== ref.current.v) ref.current = { v, t: Math.sign(v - ref.current.v), at: Date.now() };
  return Date.now() - ref.current.at < 2500 ? ref.current.t : 0;
}

const SPEEDS = [1, 2, 3] as const;

export function Hud() {
  const g = useGame((s) => s.game);
  const floaters = useGame((s) => s.floaters);
  const setSpeed = useGame((s) => s.setSpeed);
  const r = rates(g);
  const aqi = actualAqi(g);
  const band = aqiBand(aqi);
  const tAqi = useTrend(aqi);
  const tTrust = useTrend(Math.round(g.res.trust));
  const week = Math.min(weekOf(g), CAMPAIGN_WEEKS);
  const paused = g.speed === 0;
  const progress = weekProgress(g);

  return (
    <header className="hud">
      <div className="hud-brand">Hawa <b>Badlo</b></div>

      <div className="hud-stats">
        <button className="stat stat-money" onClick={() => useGame.getState().setTab('finance')} title={`Income ${inr(r.income)}/week − spending ${inr(r.maintenance)}/week · click for finances`}>
          <span className="stat-icon money"><Icon name="wallet" /></span>
          <span className="stat-text">
            <small>Treasury</small>
            <b className={g.res.budget < 0 ? 'neg' : ''}>{inr(g.res.budget)}</b>
          </span>
          <em className={`stat-sub ${r.net < 0 ? 'neg' : 'pos'}`}>{signed(r.net)}/wk</em>
          <span className="floaters" aria-hidden>
            {floaters.map((f) => <i key={f.id} style={{ color: f.color }}>{f.text}</i>)}
          </span>
        </button>

        <div className={`stat stat-aqi ${tAqi > 0 ? 'flash-bad' : tAqi < 0 ? 'flash-good' : ''}`} title="Actual air quality from independent sensors (simulated). Lower is better.">
          <span className="stat-icon" style={{ background: band.color }}><Icon name="wind" /></span>
          <span className="stat-text">
            <small>Actual AQI</small>
            <b>{aqi}</b>
          </span>
          <em className="stat-sub band" style={{ color: band.color }}>{band.label}</em>
        </div>

        <div className={`stat stat-trust ${tTrust > 0 ? 'flash-good' : tTrust < 0 ? 'flash-bad' : ''}`} title="How much citizens trust you. Raises your weekly allocation and decides the election.">
          <span className="stat-icon trust"><Icon name="smile" /></span>
          <span className="stat-text">
            <small>Public trust</small>
            <b>{num(g.res.trust)}%</b>
          </span>
          <span className="meter"><i style={{ width: `${g.res.trust}%` }} /></span>
        </div>
      </div>

      <div className="hud-time">
        <div className="week" title={`${PHASE_BRIEFS[phaseOf(g) - 1].title} · ${seasonOf(week).name}. ${seasonOf(week).blurb}`}>
          <small>{PHASE_BRIEFS[phaseOf(g) - 1].title}</small>
          <b>Week {week} <span>/ {CAMPAIGN_WEEKS}</span></b>
          <span className="week-timer" aria-label={`${Math.round(progress * 100)}% of this week elapsed`}><i style={{ width: `${progress * 100}%` }} /></span>
        </div>
        <button className="icon-btn primary" onClick={() => setSpeed(paused ? 1 : 0)} aria-label={paused ? 'Play' : 'Pause'} title={paused ? 'Play' : 'Pause'}>
          <Icon name={paused ? 'play' : 'pause'} />
        </button>
        <div className="speeds" role="group" aria-label="Simulation speed">
          {SPEEDS.map((sp) => (
            <button key={sp} className={`speed-btn ${g.speed === sp ? 'on' : ''}`} onClick={() => setSpeed(sp)} aria-pressed={g.speed === sp}>{sp}×</button>
          ))}
        </div>
        <button className="icon-btn" onClick={() => useGame.setState({ showSettings: true })} aria-label="Settings"><Icon name="settings" /></button>
      </div>
    </header>
  );
}
