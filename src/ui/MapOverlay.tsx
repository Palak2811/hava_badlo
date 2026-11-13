import { BUILDING_MAP, RESEARCH_MAP } from '../config/balance';
import { EVENT_MAP } from '../config/events';
import { ROAD_NAMES } from '../config/content';
import { agg, buildingUnlocked, canAfford, nextLevelInfo } from '../engine/core';
import { H_ARTERIALS, KIND_INFO, V_ARTERIALS, areaStats, districtAt, tileAt, type Kind } from '../engine/map';
import { demolitionInfo } from '../engine/build';
import { PLACEABLE_MAP } from '../config/build';
import { TICKS_PER_WEEK } from '../config/balance';
import { getLiveMap } from '../state/store';
import { facilityWeeks } from '../engine/core';
import { cityControls } from '../city/controls';
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
  const job = g.upgrading[id];
  const disabled = !unlocked || !next || !!needs || !afford || !!job;

  const act = () => {
    if (!next) return;
    const big = (next.cost.budget ?? 0) >= 10000 || (next.cost.budget ?? 0) > g.res.budget * 0.6;
    if (big) askConfirm({ title: `${lvl ? 'Upgrade' : 'Build'} ${def.name}?`, body: `Costs ${costText(next.cost)} and upkeep becomes ${inr(next.maintenance)}/wk.`, onYes: () => buy(id) });
    else buy(id);
  };

  let label = lvl === 0 ? 'Build' : `Upgrade to level ${lvl + 1}`;
  if (job) label = 'Under construction';
  else if (!unlocked) label = 'Locked';
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

      {job && (
        <div className="build-progress">
          <span>{job.to === 1 ? 'Under construction' : `Upgrading to level ${job.to}`} · {Math.max(0, Math.ceil((job.done - g.tick) / TICKS_PER_WEEK * 10) / 10)} wk left</span>
          <span className="meter"><i style={{ width: `${Math.min(100, ((g.tick - job.started) / Math.max(1, job.done - job.started)) * 100)}%`, background: 'var(--good)' }} /></span>
        </div>
      )}
      <dl className="ctx-facts">
        {cur && (<><dt>Now</dt><dd>{cur.summary}</dd></>)}
        {next && unlocked && !job && (<><dt>Build time</dt><dd>{facilityWeeks(id, lvl + 1)} week{facilityWeeks(id, lvl + 1) > 1 ? 's' : ''}</dd></>)}
        {next && unlocked && (<><dt>{lvl ? 'Next level' : 'On build'}</dt><dd>{next.summary}</dd></>)}
        {next && unlocked && (<><dt>Upkeep</dt><dd>{inr(next.maintenance)}/wk</dd></>)}
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

const KIND_NAMES: Record<Kind, [string, string]> = {
  house: ['house', 'houses'], apartment: ['apartment society', 'apartment societies'], shop: ['shop', 'shops'], market: ['market', 'markets'],
  office: ['office complex', 'office complexes'], factory: ['factory', 'factories'], warehouse: ['godown', 'godowns'],
  construction: ['construction site', 'construction sites'], park: ['park', 'parks'], monument: ['memorial', 'memorials'],
  busterminal: ['bus terminal', 'bus terminals'], school: ['school', 'schools'], hospital: ['hospital', 'hospitals'],
  forest: ['urban forest', 'urban forests'], parking: ['parking facility', 'parking facilities'], busstop: ['bus stop', 'bus stops'],
};

const fmtPeople = (n: number) => (n >= 100000 ? `${num(n / 100000, 1)} lakh` : num(n));

/** Inspection panel for ordinary city buildings, roads and neighbourhoods. */
export function InspectPanel() {
  const pick = useGame((s) => s.inspect);
  const g = useGame((s) => s.game);
  const close = () => useGame.getState().onPick(null);
  if (!pick || pick.type === 'plot') return null;
  const CITY = getLiveMap(g);

  if (pick.type === 'building') {
    const b = CITY.buildings[pick.id];
    if (!b || b.removed) return null;
    const info = KIND_INFO[b.kind];
    const d = CITY.districts.find((x) => x.id === b.district)!;
    const placed = b.placedUid !== undefined ? g.cityEdits.placed.find((p) => p.uid === b.placedUid) : undefined;
    const pdef = placed ? PLACEABLE_MAP[placed.kind] : undefined;
    const demo = demolitionInfo(g, CITY, b.id);
    if (b.progress && placed && pdef) {
      const frac = (g.tick - placed.started) / Math.max(1, placed.done - placed.started);
      return (
        <section className="context" aria-label={`${pdef.name} construction`}>
          <button className="icon-btn ghost close" onClick={close} aria-label="Close"><Icon name="x" /></button>
          <div className="ctx-head">
            <span className="ctx-badge site" aria-hidden><Icon name="hammer" size={22} /></span>
            <div>
              <small>{d.name} · construction site</small>
              <h3>{pdef.name}</h3>
            </div>
          </div>
          <div className="build-progress">
            <span>{Math.round(frac * 100)}% complete · {Math.max(0, Math.ceil(((placed.done - g.tick) / TICKS_PER_WEEK) * 10) / 10)} wk left</span>
            <span className="meter"><i style={{ width: `${Math.min(100, frac * 100)}%`, background: 'var(--good)' }} /></span>
          </div>
          <dl className="ctx-facts">
            <dt>Total cost</dt><dd>{inr(placed.cost)}</dd>
            <dt>On completion</dt><dd>{pdef.impact}</dd>
            {pdef.upkeep > 0 && (<><dt>Upkeep</dt><dd>{inr(pdef.upkeep)}/wk</dd></>)}
            <dt>Meanwhile</dt><dd>Construction dust nearby</dd>
          </dl>
          <button className="btn ghost block" onClick={() => useGame.getState().askDemolish(b.id)}>Cancel construction · refund {inr(demo.refund)}</button>
        </section>
      );
    }
    const scale = (b.kind === 'house' || b.kind === 'shop') ? b.w * b.h : 1;
    return (
      <section className="context" aria-label={info.label}>
        <button className="icon-btn ghost close" onClick={close} aria-label="Close"><Icon name="x" /></button>
        <div className="ctx-head">
          <span className="ctx-badge kind" aria-hidden><Icon name="city" size={22} /></span>
          <div>
            <small>{d.name}</small>
            <h3>{info.label}</h3>
            <span className="pips"><em>{b.w}×{b.h} plot</em></span>
          </div>
        </div>
        <p className="ctx-desc">{info.blurb}</p>
        <dl className="ctx-facts">
          {info.residents > 0 && (<><dt>Residents</dt><dd>{num(info.residents * scale)}</dd></>)}
          {info.jobs > 0 && (<><dt>Jobs</dt><dd>{num(info.jobs * scale)}</dd></>)}
          {b.kind === 'factory' && (<><dt>Emissions</dt><dd>Industrial smoke (boilers, diesel)</dd></>)}
          {b.kind === 'construction' && (<><dt>Emissions</dt><dd>Construction dust</dd></>)}
          {b.kind === 'warehouse' && (<><dt>Traffic</dt><dd>Heavy trucks, day and night</dd></>)}
        </dl>
        {demo.allowed ? (
          <div className="ctx-actions">
            {b.kind === 'factory' && (
              <button className="btn primary" onClick={() => useGame.getState().setTool({ type: 'place', kind: b.w * b.h >= 6 ? 'bigfactory' : 'factory', relocateFrom: b.id })}>
                <Icon name="arrow" /> Relocate & modernise
              </button>
            )}
            <button className="btn danger-ghost" onClick={() => useGame.getState().askDemolish(b.id)}>
              Demolish · {inr(demo.cost)}
            </button>
          </div>
        ) : (
          <p className="hint">{demo.reason}</p>
        )}
        {b.kind === 'factory' && demo.allowed && <p className="hint">Relocation moves the jobs to a new industrial site with modern emission controls (half the smoke). Demolition removes them.</p>}
      </section>
    );
  }

  if (pick.type === 'road') {
    const t = tileAt(CITY, pick.x, pick.y);
    const name = H_ARTERIALS.includes(pick.y) && t !== 'street' ? ROAD_NAMES.h[pick.y] : V_ARTERIALS.includes(pick.x) && t !== 'street' ? ROAD_NAMES.v[pick.x] : null;
    const d = districtAt(CITY, pick.x, pick.y);
    const station = CITY.metro.stations.find((s) => s.x === pick.x && s.y === pick.y);
    const stop = CITY.busStops.find((s) => s.x === pick.x && s.y === pick.y);
    return (
      <section className="context" aria-label="Road">
        <button className="icon-btn ghost close" onClick={close} aria-label="Close"><Icon name="x" /></button>
        <div className="ctx-head">
          <span className="ctx-badge road" aria-hidden><Icon name="arrow" size={22} /></span>
          <div>
            <small>{t === 'bridge' ? 'Bridge over the Yamuna' : t === 'arterial' ? 'Arterial road' : 'Local street'}</small>
            <h3>{name ?? (d ? `${d.name} lane` : 'Road')}</h3>
          </div>
        </div>
        <p className="ctx-desc">{t === 'street' ? 'A narrow colony lane: parked cars on both sides, a cow in the middle.' : 'A main road carrying buses, trucks and most of the city’s tailpipe emissions.'}</p>
        <dl className="ctx-facts">
          <dt>Capacity</dt><dd>{t === 'street' ? 'Low (1 lane each way)' : 'High (multi-lane)'}</dd>
          {station && (<><dt>Metro</dt><dd>{station.name} station</dd></>)}
          {stop && (<><dt>Bus stop</dt><dd>DTC & cluster bus routes</dd></>)}
        </dl>
      </section>
    );
  }

  const d = CITY.districts.find((x) => x.id === pick.id)!;
  const st = areaStats(CITY, d.id);
  const sites = CITY.buildings.filter((b) => b.district === d.id && b.progress && !b.removed).length;
  const top = Object.entries(st.counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return (
    <section className="context" aria-label={d.name}>
      <button className="icon-btn ghost close" onClick={close} aria-label="Close"><Icon name="x" /></button>
      <div className="ctx-head">
        <span className="ctx-badge district" aria-hidden><Icon name="users" size={22} /></span>
        <div>
          <small>Neighbourhood</small>
          <h3>{d.name}</h3>
        </div>
      </div>
      <p className="ctx-desc">{d.blurb}</p>
      <div className="mini-stats">
        <div><small>Population</small><b>{fmtPeople(st.population)}</b></div>
        <div><small>Jobs</small><b>{fmtPeople(st.jobs)}</b></div>
        <div><small>Open land</small><b>{st.emptyTiles} plots</b></div>
      </div>
      <dl className="ctx-facts">
        <dt>Mostly</dt><dd>{top.map(([k, n]) => `${n} ${KIND_NAMES[k as Kind][n === 1 ? 0 : 1]}`).join(', ')}</dd>
        <dt>Green cover</dt><dd>{st.greenTiles} park tiles</dd>
        {sites > 0 && (<><dt>Projects</dt><dd>{sites} under construction</dd></>)}
      </dl>
      <p className="hint">Neighbourhood-level air quality comes with the pollution map mode.</p>
    </section>
  );
}

export function ZoomControls() {
  return (
    <div className="zoom-ctrl" role="group" aria-label="Map zoom">
      <button className="icon-btn" onClick={() => cityControls.zoomBy(1.25)} aria-label="Zoom in">＋</button>
      <button className="icon-btn" onClick={() => cityControls.zoomBy(0.8)} aria-label="Zoom out">－</button>
      <button className="icon-btn" onClick={() => cityControls.reset()} aria-label="Show whole city" title="Show whole city"><Icon name="city" size={16} /></button>
    </div>
  );
}

export function ObjectivesWidget() {
  const objectives = useGame((s) => s.game.objectives);
  if (!objectives.length) return null;
  const done = objectives.filter((o) => o.done).length;
  return (
    <aside className="objectives-widget" aria-label="This week's objectives">
      <header><Icon name="check" size={14} /> This week <em>{done}/{objectives.length}</em></header>
      <ul>
        {objectives.map((o) => (
          <li key={o.id} className={o.done ? 'done' : ''}>
            <span className="tick">{o.done ? <Icon name="check" size={12} stroke={3} /> : null}</span>
            {o.label}
          </li>
        ))}
      </ul>
    </aside>
  );
}
