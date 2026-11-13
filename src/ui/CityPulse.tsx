import { useState } from 'react';
import { CITY_SIM } from '../config/city';
import { congestionLabel } from '../engine/city';
import { useGame } from '../state/store';
import { Icon } from './icons';
import { num } from './format';

const lakh = (n: number) => `${num(n / 100000, 2)} lakh`;

function Demand({ label, v, title }: { label: string; v: number; title: string }) {
  const h = Math.round(Math.abs(v) * 100);
  return (
    <span className="rci" title={`${title} demand: ${v > 0 ? '+' : ''}${Math.round(v * 100)}`}>
      <span className="rci-bar">
        <i className={v >= 0 ? 'up' : 'down'} style={{ height: `${Math.max(4, h / 2)}%` }} />
      </span>
      <b>{label}</b>
    </span>
  );
}

/** Compact living-city readout: residents, jobs, traffic and R/C/I demand. */
export function CityPulse() {
  const c = useGame((s) => s.game.city);
  const cap = useGame((s) => s.game.mapStats.population);
  const jobs = useGame((s) => s.game.mapStats.jobs);
  const [open, setOpen] = useState(true);
  const cong = c.traffic.congestion;
  const congTone = cong < 0.95 ? 'good' : cong < 1.15 ? 'warn' : 'bad';
  return (
    <aside className="pulse" aria-label="City pulse">
      <button className="pulse-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="users" size={14} /> City pulse <Icon name="chevron" size={14} className={open ? 'rot' : ''} />
      </button>
      {open && (
        <div className="pulse-body">
          <div className="pulse-row">
            <span>Residents</span>
            <b>{lakh(c.population)}</b>
            <em className={c.overcrowding > CITY_SIM.overcrowdingTolerance ? 'neg' : ''}>{c.overcrowding > 0.005 ? `${Math.round(c.overcrowding * 100)}% overcrowded` : `${Math.round((c.population / cap) * 100)}% of homes`}</em>
          </div>
          <div className="pulse-row">
            <span>Jobs</span>
            <b>{lakh(jobs)}</b>
            <em className={c.unemployment > CITY_SIM.unemploymentTolerance ? 'neg' : ''}>{c.unemployment > 0.005 ? `${Math.round(c.unemployment * 100)}% unemployed` : 'Full employment'}</em>
          </div>
          <div className="pulse-row">
            <span>Traffic</span>
            <b className={`tone-${congTone}`}>{congestionLabel(cong)}</b>
            <em>{Math.round(c.traffic.ptShare * 100)}% public transport</em>
          </div>
          <span className={`meter cong ${congTone}`}><i style={{ width: `${Math.min(100, (cong / 1.4) * 100)}%` }} /></span>
          <div className="pulse-demand" title="Demand for new residential, commercial and industrial buildings. Developers build on zoned empty land when demand is positive.">
            <Demand label="R" v={c.demand.res} title="Residential" />
            <Demand label="C" v={c.demand.com} title="Commercial" />
            <Demand label="I" v={c.demand.ind} title="Industrial" />
            <small>Demand · {c.developments} private projects so far</small>
          </div>
        </div>
      )}
    </aside>
  );
}
