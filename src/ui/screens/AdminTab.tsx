import { CREDIBILITY, ECONOMY, OPTICS } from '../../config/balance';
import { ACHIEVEMENTS } from '../../config/content';
import { canAfford, opticsCost, opticsReadyIn, opticsUnlocked, rates, reductionPct } from '../../engine/core';
import { useGame } from '../../state/store';
import { LineChart } from '../components/Charts';
import { Icon } from '../icons';
import { CityPulse } from '../CityPulse';
import { costText, inr, num } from '../format';

function whisper(cred: number) {
  if (cred >= 85) return { text: 'Your files are clean. Journalists find you boring.', tone: 'good' };
  if (cred >= 60) return { text: 'A few eyebrows raised at the canteen.', tone: 'warn' };
  if (cred >= CREDIBILITY.investigateBelow) return { text: 'Someone filed an RTI about the monitor’s water bill.', tone: 'warn' };
  return { text: 'Reporters are digging. Your numbers are being openly questioned.', tone: 'bad' };
}

export default function AdminScreen() {
  const g = useGame((s) => s.game);
  const optics = useGame((s) => s.optics);
  const grant = useGame((s) => s.grant);
  const askConfirm = useGame((s) => s.askConfirm);
  const r = rates(g);
  const w = whisper(g.res.credibility);

  // progressive reveal: unlocked cards + the next two locked ones
  const unlocked = OPTICS.filter((o) => opticsUnlocked(g, o.id));
  const locked = OPTICS.filter((o) => !opticsUnlocked(g, o.id)).slice(0, 2);

  return (
    <div className="screen">
      <CityPulse />
      <div className="gauges">
        <div className="gauge-tile">
          <small><Icon name="flame" size={14} /> Political pressure</small>
          <b>{num(g.res.pressure)}%</b>
          <span className="meter warm"><i style={{ width: `${g.res.pressure}%` }} /></span>
        </div>
        <div className="gauge-tile">
          <small><Icon name="landmark" size={14} /> Political capital</small>
          <b>{num(g.res.capital)}</b>
          <em>+{num(r.capital, 1)}/day</em>
        </div>
        <div className="gauge-tile">
          <small><Icon name="users" size={14} /> Citizen participation</small>
          <b>{num(g.participation)}%</b>
          <span className="meter"><i style={{ width: `${g.participation}%` }} /></span>
        </div>
        <div className={`gauge-tile whisper ${w.tone}`}>
          <small><Icon name="eye" size={14} /> Whispers in the corridors</small>
          <p>{w.text}</p>
        </div>
      </div>

      <section>
        <h3 className="section-h">Optics cards <span>Change how things look — not how they are.</span></h3>
        {unlocked.length === 0 && <p className="empty">Build a Public Relations Office on the map to unlock your first optics cards.</p>}
        <div className="cards">
          {unlocked.map((o) => {
            const cd = opticsReadyIn(g, o.id);
            const cost = opticsCost(g, o.id);
            const ok = cd === 0 && canAfford(g, cost);
            const run = () => (o.id === 'victory' || o.id === 'purifier' ? askConfirm({ title: `${o.name}?`, body: `${o.effectText} Cost: ${costText(cost)}.`, onYes: () => optics(o.id) }) : optics(o.id));
            return (
              <article key={o.id} className="ocard">
                <span className="ocard-art" aria-hidden>{o.icon}</span>
                <h4>{o.name}</h4>
                <p className="flavour">{o.flavour}</p>
                <p className="oeffect">{o.effectText}</p>
                <button className="btn block optics" disabled={!ok} onClick={run}>
                  {cd > 0 ? <><Icon name="clock" size={14} /> Ready in {Math.ceil(cd / 6) / 10}d</> : <>Play card · {costText(cost)}</>}
                </button>
              </article>
            );
          })}
          {locked.map((o) => (
            <article key={o.id} className="ocard locked">
              <span className="ocard-art"><Icon name="lock" size={22} /></span>
              <h4>{o.name}</h4>
              <p className="flavour">Unlock: {o.unlockText}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grant">
        <div>
          <h3 className="section-h">Environmental grant</h3>
          <p>Trade {ECONOMY.grantCac} Clean Air Credits — earned only through real reductions — for {inr(ECONOMY.grantBudget)}.</p>
          <span className="meter"><i style={{ width: `${Math.min(100, (g.res.cac / ECONOMY.grantCac) * 100)}%`, background: 'var(--good)' }} /></span>
          <small>{num(g.res.cac, 1)} / {ECONOMY.grantCac} credits</small>
        </div>
        <button className="btn primary" disabled={g.res.cac < ECONOMY.grantCac} onClick={grant}><Icon name="leaf" /> Claim</button>
      </section>

      <section>
        <h3 className="section-h">The record <span>Simulated data, not official Delhi readings.</span></h3>
        <div className="records">
          <div><small>vs doing nothing</small><b>{num(reductionPct(g), 1)}%</b></div>
          <div><small>Worst AQI</small><b>{g.stats.highestAqi}</b></div>
          <div><small>Total spent</small><b>{inr(g.stats.totalSpent)}</b></div>
          <div><small>Committees</small><b>{g.stats.committees}</b></div>
          <div><small>Optics played</small><b>{g.stats.opticsUsed}</b></div>
          <div><small>Tough calls</small><b>{g.stats.toughDecisions}</b></div>
        </div>
        <LineChart data={g.history} series={[{ key: 'baseline', label: 'If you did nothing', color: '#a8a29e', dash: true }, { key: 'aqi', label: 'Actual AQI', color: '#e4572e' }, { key: 'official', label: 'Official AQI', color: '#c2417a', dash: true }]} />
      </section>

      <section>
        <h3 className="section-h">Achievements <span>{g.achievements.length} of {ACHIEVEMENTS.length}</span></h3>
        <div className="achievements">
          {ACHIEVEMENTS.map((a) => {
            const got = g.achievements.includes(a.id);
            return (
              <div key={a.id} className={`ach ${got ? 'got' : ''}`} title={`${a.description} Reward: ${a.rewardText}`}>
                <span aria-hidden>{got ? a.icon : <Icon name="lock" size={16} />}</span>
                <b>{a.name}</b>
                <small>{a.description}</small>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
