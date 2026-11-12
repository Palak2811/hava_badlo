import { BUILDINGS, RESEARCH_MAP, type BuildingDef } from '../../config/balance';
import { buildingUnlocked, canAfford, nextLevelInfo } from '../../engine/core';
import { useGame } from '../../state/store';
import { costText, inr } from '../format';

export function BuildingCard({ def, compact = false }: { def: BuildingDef; compact?: boolean }) {
  const g = useGame((s) => s.game);
  const buy = useGame((s) => s.buy);
  const askConfirm = useGame((s) => s.askConfirm);
  const lvl = g.buildings[def.id];
  const unlocked = buildingUnlocked(g, def.id);
  const next = nextLevelInfo(g, def.id);
  const needsResearch = next?.requiresResearch && !g.research.includes(next.requiresResearch);
  const afford = next ? canAfford(g, next.cost) : false;
  const cur = lvl > 0 ? def.levels[lvl - 1] : null;
  const disabled = !unlocked || !next || !!needsResearch || !afford;

  const onBuy = () => {
    if (!next) return;
    const expensive = (next.cost.budget ?? 0) >= 10000 || (next.cost.budget ?? 0) > g.res.budget * 0.6;
    if (expensive) {
      askConfirm({
        title: `${lvl === 0 ? 'Build' : 'Upgrade'} ${def.name}?`,
        body: `This costs ${costText(next.cost)} and adds ${inr(next.maintenance - (cur?.maintenance ?? 0))}/day in maintenance.`,
        onYes: () => buy(def.id),
      });
    } else buy(def.id);
  };

  let btn = lvl === 0 ? 'Build' : `Upgrade to L${lvl + 1}`;
  if (!unlocked) btn = '🔒 Locked';
  else if (!next) btn = '★ Max level';
  else if (needsResearch) btn = '🔬 Needs research';
  else if (!afford) btn = 'Not enough funds';

  return (
    <div className={`bcard ${lvl > 0 ? 'owned' : ''} ${!unlocked ? 'locked' : ''} ${compact ? 'compact' : ''}`} style={{ ['--c' as string]: def.color }}>
      <div className="bcard-head">
        <div className="bicon">{def.icon}</div>
        <div>
          <h4>{def.name}</h4>
          <div className="levels">
            {def.levels.map((_, i) => <span key={i} className={i < lvl ? 'on' : ''} />)}
            <small>{lvl === 0 ? 'Not built' : `Level ${lvl}/${def.levels.length}`}</small>
          </div>
        </div>
      </div>
      <p className="bdesc">{def.description}</p>
      {cur && <p className="beffect now">Now: {cur.summary} · upkeep {inr(cur.maintenance)}/day</p>}
      {next && unlocked && (
        <p className="beffect next">
          Next: {next.summary}
          <br />
          <small>Upkeep {inr(next.maintenance)}/day{needsResearch ? ` · requires “${RESEARCH_MAP[next.requiresResearch!].name}”` : ''}</small>
        </p>
      )}
      {!unlocked && <p className="beffect lock">{def.unlockText}</p>}
      <button className={`btn ${disabled ? 'disabled' : 'primary'}`} disabled={disabled} onClick={onBuy}>
        <span>{btn}</span>
        {next && unlocked && !needsResearch && <small>{costText(next.cost)}</small>}
      </button>
    </div>
  );
}

export default function InfraTab() {
  return (
    <div className="tab-page">
      <div className="page-head">
        <h2>🏗️ Infrastructure</h2>
        <p>Real buildings attack real sources. They cost upkeep every day — invest, but watch your net income.</p>
      </div>
      <div className="bgrid">
        {BUILDINGS.map((b) => <BuildingCard key={b.id} def={b} />)}
      </div>
    </div>
  );
}
