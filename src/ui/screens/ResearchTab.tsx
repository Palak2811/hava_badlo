import { BRANCHES, RESEARCH, RESEARCH_MAP, type Branch } from '../../config/balance';
import { canAfford, rates, researchStatus } from '../../engine/core';
import { useGame } from '../../state/store';
import { Icon } from '../icons';
import { costText, num } from '../format';

export default function ResearchScreen() {
  const g = useGame((s) => s.game);
  const research = useGame((s) => s.research);
  const r = rates(g);
  return (
    <div className="screen">
      <div className="screen-intro">
        <div className="big-number"><Icon name="flask" size={22} /> {num(g.res.rp)} <small>research points · +{num(r.research)}/day</small></div>
        <p>{g.buildings.monitor ? 'Your Monitoring Centre produces research. Upgrade it to research faster.' : 'Build an AQI Monitoring Centre on the map to start producing research.'}</p>
      </div>
      {(Object.keys(BRANCHES) as Branch[]).map((br) => (
        <section key={br} className="branch" style={{ ['--c' as string]: BRANCHES[br].color }}>
          <header><h3>{BRANCHES[br].name}</h3><span>{BRANCHES[br].blurb}</span></header>
          <div className="tech-list">
            {RESEARCH.filter((x) => x.branch === br).map((x) => {
              const st = researchStatus(g, x.id);
              const afford = canAfford(g, x.cost);
              return (
                <div key={x.id} className={`tech ${st}`}>
                  <span className="tech-icon">{st === 'done' ? <Icon name="check" /> : st === 'locked' ? <Icon name="lock" size={16} /> : <span aria-hidden>{x.icon}</span>}</span>
                  <div className="tech-body">
                    <b>{x.name}</b>
                    <small>{st === 'locked' ? `Needs ${x.requires.map((q) => RESEARCH_MAP[q].name).join(' + ')}` : x.effectText}</small>
                  </div>
                  {st === 'done' ? (
                    <span className="tag good">Done</span>
                  ) : (
                    <button className="btn small" disabled={st !== 'available' || !afford} onClick={() => research(x.id)}>{costText(x.cost)}</button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
