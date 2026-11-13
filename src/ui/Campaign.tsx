import { useEffect, useRef, useState } from 'react';
import { SETTLEMENT } from '../config/election';
import { ENDINGS } from '../config/content';
import { computeElection, type ElectionResult } from '../engine/election';
import { aqiBand } from '../engine/core';
import { useGame } from '../state/store';
import { Icon } from './icons';
import { inr, num, signed } from './format';

/** Slides in when a week settles; auto-hides unless hovered. */
export function WeekCard() {
  const week = useGame((s) => s.weekCard);
  const r = useGame((s) => s.game.settlement);
  const close = useGame((s) => s.closeWeekCard);
  const [hover, setHover] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (week === null || hover) return;
    timer.current = window.setTimeout(close, SETTLEMENT.cardSeconds * 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [week, hover, close]);
  if (week === null || !r || r.week !== week) return null;
  const dA = r.aqi[1] - r.aqi[0];
  const dT = r.trust[1] - r.trust[0];
  const dP = r.population[1] - r.population[0];
  return (
    <aside className="week-card" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} aria-live="polite">
      <header>
        <span><small>Weekly settlement</small><b>Week {r.week}</b></span>
        <button className="icon-btn ghost" onClick={close} aria-label="Close"><Icon name="x" /></button>
      </header>
      <div className="wc-money">
        <div><small>Revenue</small><b className="pos">{inr(r.income)}</b></div>
        <div><small>Spending</small><b className="neg">{inr(r.expenses)}</b></div>
        <div><small>Net</small><b className={r.net >= 0 ? 'pos' : 'neg'}>{r.net >= 0 ? '+' : ''}{inr(r.net)}</b></div>
      </div>
      <ul className="wc-deltas">
        <li><span>City AQI</span><b>{r.aqi[1]}</b><em className={dA <= 0 ? 'pos' : 'neg'}>{signed(dA)}</em></li>
        <li><span>Public trust</span><b>{r.trust[1]}%</b><em className={dT >= 0 ? 'pos' : 'neg'}>{signed(dT)}</em></li>
        <li><span>Residents</span><b>{num(r.population[1] / 100000, 2)} lakh</b><em className={dP >= 0 ? 'pos' : 'neg'}>{signed(dP)}</em></li>
        <li><span>Objectives</span><b>{r.objectives}/{r.objectivesTotal}</b><em>{r.projects} built · {r.decisions} decided</em></li>
      </ul>
      {r.highlights.length > 0 && <p className="wc-news">📰 {r.highlights[0]}</p>}
    </aside>
  );
}

function SeatBar({ e }: { e: ElectionResult }) {
  return (
    <div className="seatbar" aria-label={`${e.seatsWon} of ${e.totalSeats} seats`}>
      {Array.from({ length: e.totalSeats }, (_, i) => <i key={i} className={i < e.seatsWon ? 'won' : ''} />)}
      <span className="majority" style={{ left: `${(e.majority / e.totalSeats) * 100}%` }} title={`Majority: ${e.majority}`} />
    </div>
  );
}

function Scorecard({ e }: { e: ElectionResult }) {
  return (
    <ul className="scorecard">
      {e.factors.map((f) => (
        <li key={f.id}>
          <span>{f.label}<small>{Math.round(f.weight * 100)}% of the vote</small></span>
          <span className="meter"><i style={{ width: `${Math.round(f.score * 100)}%`, background: f.score >= 0.6 ? 'var(--good)' : f.score >= 0.4 ? 'var(--warn)' : 'var(--bad)' }} /></span>
          <b>{Math.round(f.score * 100)}</b>
        </li>
      ))}
    </ul>
  );
}

/** "If the election were held today" — for the Administration screen. */
export function OpinionPoll() {
  const g = useGame((s) => s.game);
  const e = computeElection(g);
  const verdict = e.won ? 'You would win' : e.seatsWon >= 30 ? 'Hung assembly' : 'You would lose';
  return (
    <section className="poll">
      <h3 className="section-h">Opinion poll <span>If the election were held today · week 52 decides</span></h3>
      <div className="poll-top">
        <div><small>Vote share</small><b>{num(e.voteShare, 1)}%</b></div>
        <div><small>Seats</small><b>{e.seatsWon}<span>/{e.totalSeats}</span></b></div>
        <div><small>Verdict</small><b className={e.won ? 'pos' : 'neg'}>{verdict}</b></div>
      </div>
      <SeatBar e={e} />
      <Scorecard e={e} />
    </section>
  );
}

/** Election night: replaces the old ending screen. */
export function ElectionNight() {
  const g = useGame((s) => s.game);
  const resetGame = useGame((s) => s.resetGame);
  const sandbox = useGame((s) => s.continueSandbox);
  if (!g.ended || g.sandbox || g.reportPending) return null;
  const e = g.election ?? computeElection(g);
  const legacy = ENDINGS[g.ended];
  return (
    <div className="overlay" role="dialog" aria-modal aria-label="Election results">
      <div className={`modal election ${e.won ? 'won' : 'lost'}`}>
        <div className="el-hero">
          <small>Election night · week 52</small>
          <h1>{e.won ? 'You won!' : 'You lost.'}</h1>
          <p className="el-headline">“{e.headline}”</p>
          <div className="el-numbers">
            <div><b>{e.seatsWon}</b><small>of {e.totalSeats} seats</small></div>
            <div><b>{num(e.voteShare, 1)}%</b><small>vote share</small></div>
          </div>
          <SeatBar e={e} />
        </div>
        <div className="el-body">
          <section>
            <h4>Constituencies</h4>
            <ul className="el-districts">
              {[...e.districts].sort((a, b) => b.seats - a.seats).map((d) => (
                <li key={d.id} className={d.won ? 'won' : 'lost'}>
                  <span>{d.name}<small style={{ color: aqiBand(d.aqi).color }}>AQI {d.aqi}</small></span>
                  <b>{num(d.share, 1)}%</b>
                  <em>{d.won ? `+${d.seats}` : `0/${d.seats}`}</em>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4>Why voters decided</h4>
            <Scorecard e={e} />
            {e.strengths.length > 0 && <ul className="ticks">{e.strengths.map((t) => <li key={t}><Icon name="check" size={14} /> {t}</li>)}</ul>}
            {e.weaknesses.length > 0 && <ul className="ticks">{e.weaknesses.map((t) => <li key={t} className="warn"><Icon name="alert" size={14} /> {t}</li>)}</ul>}
          </section>
        </div>
        <div className="legacy" style={{ ['--c' as string]: legacy.color }}>
          <span className="ending-art" aria-hidden>{legacy.art}</span>
          <div>
            <small>Your legacy</small>
            <b>{legacy.title}</b>
            <p>{legacy.subtitle}</p>
            <em><Icon name="trophy" size={14} /> {legacy.award}</em>
          </div>
        </div>
        <div className="row-btns">
          <button className="btn ghost" onClick={sandbox}>Keep governing (sandbox)</button>
          <button className="btn primary" onClick={resetGame}>Start a new term</button>
        </div>
      </div>
    </div>
  );
}
