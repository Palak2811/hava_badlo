import { BRANCHES, RESEARCH, RESEARCH_MAP, type Branch, type ResearchDef } from '../../config/balance';
import { canAfford, researchStatus } from '../../engine/core';
import { useGame } from '../../state/store';
import { costText } from '../format';

/** depth of a node = longest prerequisite chain */
function depth(r: ResearchDef): number {
  return r.requires.length ? 1 + Math.max(...r.requires.map((q) => depth(RESEARCH_MAP[q]))) : 0;
}

export default function ResearchTab() {
  const g = useGame((s) => s.game);
  const research = useGame((s) => s.research);
  return (
    <div className="tab-page">
      <div className="page-head">
        <h2>🔬 Research & Technology</h2>
        <p>You have <b>{Math.floor(g.res.rp)} RP</b>. Build or upgrade the AQI Monitoring Centre to earn more. Three philosophies; one budget.</p>
      </div>
      <div className="tree">
        {(Object.keys(BRANCHES) as Branch[]).map((br) => {
          const nodes = RESEARCH.filter((r) => r.branch === br);
          const tiers: ResearchDef[][] = [];
          for (const n of nodes) (tiers[depth(n)] ??= []).push(n);
          return (
            <div key={br} className="branch" style={{ ['--c' as string]: BRANCHES[br].color }}>
              <div className="branch-head">
                <h3>{BRANCHES[br].name}</h3>
                <small>{BRANCHES[br].blurb}</small>
              </div>
              {tiers.map((tier, i) => (
                <div key={i} className="tier">
                  {tier.map((r) => {
                    const st = researchStatus(g, r.id);
                    const afford = canAfford(g, r.cost);
                    return (
                      <button
                        key={r.id}
                        className={`node ${st} ${st === 'available' && afford ? 'ready' : ''}`}
                        disabled={st !== 'available' || !afford}
                        onClick={() => research(r.id)}
                        title={st === 'locked' ? `Requires: ${r.requires.map((q) => RESEARCH_MAP[q].name).join(', ')}` : r.description}
                      >
                        <span className="node-icon">{st === 'done' ? '✅' : st === 'locked' ? '🔒' : r.icon}</span>
                        <span className="node-name">{r.name}</span>
                        <span className="node-effect">{r.effectText}</span>
                        {st !== 'done' && <span className="node-cost">{costText(r.cost)}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
