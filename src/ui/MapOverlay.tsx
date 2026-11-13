import { BUILDING_MAP, RESEARCH_MAP } from '../config/balance';
import { EVENT_MAP } from '../config/events';
import { agg, buildingUnlocked, canAfford, nextLevelInfo } from '../engine/core';
import { useGame } from '../state/store';
import { SOURCE_META } from './components/Charts';
import { Icon } from './icons';
import { costText, inr, num } from './format';

/** One prominent alert at a time, floating over the map. */
export function EventChip() {
  const events = useGame((s) => s.game.events);
  const open = useGame((s) => s.openEvent);
  if (!events.length) return null;
  const e = events[0];
  const d = EVENT_MAP[e.defId];
  return (
    <button className={`event-chip sev-${d.severity}`} onClick={() => open(e.uid)}>
      <span className="pulse-dot" />
      <span className="chip-art" aria-hidden>{d.art}</span>
      <span className="chip-text">
        <small>{d.category} · decision needed</small>
        <b>{d.title}</b>
      </span>
      {events.length > 1 && <em className="more">+{events.length - 1}</em>}
      <Icon name="chevron" />
    </button>
  );
}

/** Contextual panel for the selected plot / facility (bottom sheet on phones). */
export function ContextPanel() {
  const id = useGame((s) => s.selected);
  const g = useGame((s) => s.game);
  const buy = useGame((s) => s.buy);
  const select = useGame((s) => s.select);
  const askConfirm = useGame((s) => s.askConfirm);
  if (!id) return null;
  const def = BUILDING_MAP[id];
  const lvl = g.buildings[id];
  const unlocked = buildingUnlocked(g, id);
  const next = nextLevelInfo(g, id);
  const cur = lvl > 0 ? def.levels[lvl - 1] : null;
  const needs = next?.requiresResearch && !g.research.includes(next.requiresResearch) ? next.requiresResearch : null;
  const afford = next ? canAfford(g, next.cost) : false;
  const a = agg(g);
  const disabled = !unlocked || !next || !!needs || !afford;

  const act = () => {
    if (!next) return;
    const big = (next.cost.budget ?? 0) >= 10000 || (next.cost.budget ?? 0) > g.res.budget * 0.6;
    if (big) askConfirm({ title: `${lvl ? 'Upgrade' : 'Build'} ${def.name}?`, body: `Costs ${costText(next.cost)} and upkeep becomes ${inr(next.maintenance)}/day.`, onYes: () => buy(id) });
    else buy(id);
  };

  let label = lvl === 0 ? 'Build' : `Upgrade to level ${lvl + 1}`;
  if (!unlocked) label = 'Locked';
  else if (!next) label = 'Fully upgraded';
  else if (needs) label = 'Needs research';
  else if (!afford) label = 'Not enough funds';

  return (
    <section className="context" style={{ ['--c' as string]: def.color }} aria-label={def.name}>
      <button className="icon-btn ghost close" onClick={() => select(null)} aria-label="Close"><Icon name="x" /></button>
      <div className="ctx-head">
        <span className="ctx-badge" aria-hidden>{def.icon}</span>
        <div>
          <small>{lvl === 0 ? (unlocked ? 'Empty plot' : 'Locked plot') : 'Facility'}</small>
          <h3>{def.name}</h3>
          <span className="pips">{def.levels.map((_, i) => <i key={i} className={i < lvl ? 'on' : ''} />)}<em>{lvl ? `Level ${lvl}/${def.levels.length}` : 'Not built'}</em></span>
        </div>
      </div>
      <p className="ctx-desc">{def.description}</p>

      {def.sources.length > 0 && (
        <div className="ctx-impact">
          {def.sources.map((src) => (
            <div key={src} className="impact-row">
              <span>{SOURCE_META[src].label}</span>
              <span className="meter"><i style={{ width: `${(a.control[src] / 0.85) * 100}%`, background: SOURCE_META[src].color }} /></span>
              <b>−{num(a.control[src] * 100)}%</b>
            </div>
          ))}
          <small>Total control of these sources (all facilities & research)</small>
        </div>
      )}

      <dl className="ctx-facts">
        {cur && (<><dt>Now</dt><dd>{cur.summary}</dd></>)}
        {next && unlocked && (<><dt>{lvl ? 'Next level' : 'On build'}</dt><dd>{next.summary}</dd></>)}
        {next && unlocked && (<><dt>Upkeep</dt><dd>{inr(next.maintenance)}/day</dd></>)}
        {!unlocked && (<><dt>Unlock</dt><dd>{def.unlockText}</dd></>)}
        {needs && (<><dt>Requires</dt><dd>Research “{RESEARCH_MAP[needs].name}”</dd></>)}
      </dl>

      <button className="btn primary block" disabled={disabled} onClick={act}>
        <Icon name={lvl ? 'up' : 'hammer'} />
        <span>{label}</span>
        {next && unlocked && !needs && <em>{costText(next.cost)}</em>}
      </button>
    </section>
  );
}
