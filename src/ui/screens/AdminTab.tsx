import { CREDIBILITY, ECONOMY, OPTICS } from '../../config/balance';
import { canAfford, opticsCost, opticsReadyIn, opticsUnlocked } from '../../engine/core';
import { useGame } from '../../state/store';
import { costText, num } from '../format';

function whisper(cred: number, risk: number) {
  if (cred >= 85 && risk < 0.1) return { text: 'Your files are clean. Journalists find you boring.', tone: 'green', icon: '😇' };
  if (cred >= 60) return { text: 'A few eyebrows raised at the canteen.', tone: 'yellow', icon: '🤨' };
  if (cred >= CREDIBILITY.investigateBelow) return { text: 'An RTI application about the monitor’s water bill has been filed.', tone: 'orange', icon: '👀' };
  if (cred >= CREDIBILITY.challengedBelow) return { text: 'Investigative reporters are actively digging.', tone: 'red', icon: '🕵️' };
  return { text: 'Your official reports are being openly challenged. Nobody believes the numbers.', tone: 'red', icon: '🔥' };
}

export default function AdminTab() {
  const g = useGame((s) => s.game);
  const optics = useGame((s) => s.optics);
  const grant = useGame((s) => s.grant);
  const askConfirm = useGame((s) => s.askConfirm);
  const w = whisper(g.res.credibility, g.exposureRisk);
  return (
    <div className="tab-page">
      <div className="page-head optics-head">
        <h2>🎭 The Department of Optics — <i>“The Art of Looking Busy”</i></h2>
        <p>These schemes change how things <b>look</b>, not how they <b>are</b>. They are cheap, fast and very tempting.</p>
      </div>
      <div className="admin-top">
        <div className={`card whisper tone-${w.tone}`}>
          <h3>{w.icon} Whispers in the Corridors</h3>
          <p>{w.text}</p>
          <small>Your credibility is not shown as a number. Ministers prefer it that way.</small>
        </div>
        <div className="card">
          <h3>🍃 Environmental Grants</h3>
          <p>Trade {ECONOMY.grantCac} Clean Air Credits (earned only by real reductions) for ₹{ECONOMY.grantBudget.toLocaleString('en-IN')}.</p>
          <button className={`btn ${g.res.cac >= ECONOMY.grantCac ? 'primary' : 'disabled'}`} disabled={g.res.cac < ECONOMY.grantCac} onClick={grant}>
            Apply for grant <small>{num(g.res.cac, 1)} / {ECONOMY.grantCac} 🍃</small>
          </button>
        </div>
        <div className="card counters">
          <h3>🗂️ Bureaucratic Output</h3>
          <div className="counter-grid">
            <div><b>{g.stats.committees}</b><small>Committees</small></div>
            <div><b>{g.stats.reports}</b><small>Reports</small></div>
            <div><b>{g.stats.purifiers}</b><small>Giant purifiers</small></div>
            <div><b>{g.stats.opticsUsed}</b><small>Schemes used</small></div>
          </div>
          {g.committeesPending.length > 0 && <small>⏳ {g.committeesPending.length} committee(s) deliberating…</small>}
        </div>
      </div>
      <div className="optics-grid">
        {OPTICS.map((o) => {
          const unlocked = opticsUnlocked(g, o.id);
          const cd = opticsReadyIn(g, o.id);
          const cost = opticsCost(g, o.id);
          const afford = canAfford(g, cost);
          const ok = unlocked && cd === 0 && afford;
          const run = () => {
            if (o.id === 'victory' || o.id === 'purifier') askConfirm({ title: `${o.name}?`, body: `${o.effectText} Cost: ${costText(cost)}.`, onYes: () => optics(o.id) });
            else optics(o.id);
          };
          return (
            <div key={o.id} className={`ocard ${unlocked ? '' : 'locked'}`}>
              <div className="ocard-icon">{unlocked ? o.icon : '🔒'}</div>
              <h4>{o.name}</h4>
              <p className="flavour">{o.flavour}</p>
              <p className="oeffect">{o.effectText}</p>
              {!unlocked && <p className="beffect lock">Unlock: {o.unlockText}</p>}
              <button className={`btn ${ok ? 'pink' : 'disabled'}`} disabled={!ok} onClick={run}>
                <span>{!unlocked ? 'Locked' : cd > 0 ? `Cooldown ${Math.ceil(cd / 6) / 10}d` : !afford ? 'Can’t afford' : 'Execute'}</span>
                <small>{costText(cost)}</small>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
