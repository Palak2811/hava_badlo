import { useEffect, useState } from 'react';
import { CATEGORIES, PLACEABLES, PLACEABLE_MAP, ROAD, ZONE_INFO, ZONING, type Category } from '../config/build';
import { checkPlacement, checkRoad, demolitionInfo, placeableUnlocked, zoneTiles } from '../engine/build';
import { KIND_INFO, buildingAt, zoneAt } from '../engine/map';
import type { Zone } from '../engine/types';
import { getLiveMap, useGame, type Tool } from '../state/store';
import { Icon } from './icons';
import { inr } from './format';

/** Bottom palette: building categories and the Road / Zone / Demolish tools. */
export function BuildPalette() {
  const open = useGame((s) => s.buildOpen);
  const g = useGame((s) => s.game);
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const [cat, setCat] = useState<Category | 'tools'>('environment');
  if (!open) return null;
  const items = PLACEABLES.filter((p) => p.category === cat);
  const isTool = (t: Tool['type'], extra?: (x: Tool) => boolean) => tool?.type === t && (!extra || extra(tool));

  return (
    <section className="palette" aria-label="Build menu">
      <div className="palette-tabs" role="tablist">
        {CATEGORIES.map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
            <span aria-hidden>{c.icon}</span> {c.name}
          </button>
        ))}
        <button role="tab" aria-selected={cat === 'tools'} className={cat === 'tools' ? 'on' : ''} onClick={() => setCat('tools')}>
          <Icon name="hammer" size={14} /> Roads & zoning
        </button>
      </div>
      <div className="palette-items">
        {cat !== 'tools' && items.map((p) => {
          const unlocked = placeableUnlocked(g, p);
          const active = isTool('place', (t) => t.type === 'place' && t.kind === p.id && t.relocateFrom === undefined);
          return (
            <button key={p.id} className={`pitem ${active ? 'on' : ''}`} disabled={!unlocked} onClick={() => setTool(active ? null : { type: 'place', kind: p.id })} title={p.blurb}>
              <span className="pitem-icon" aria-hidden>{unlocked ? CATEGORIES.find((c) => c.id === p.category)!.icon : <Icon name="lock" size={16} />}</span>
              <b>{p.name}</b>
              <small>{unlocked ? `${inr(p.cost)} · ${p.weeks} wk · ${p.w}×${p.h}` : `Unlocks week ${p.unlockWeek}`}</small>
            </button>
          );
        })}
        {cat === 'tools' && (
          <>
            <button className={`pitem ${isTool('road') ? 'on' : ''}`} onClick={() => setTool(isTool('road') ? null : { type: 'road' })}>
              <span className="pitem-icon" aria-hidden>🛣️</span><b>Build road</b><small>{inr(ROAD.costPerTile)}/tile · {ROAD.weeks} wk</small>
            </button>
            {(['res', 'com', 'ind', 'green'] as Zone[]).map((z) => (
              <button key={z} className={`pitem ${isTool('zone', (t) => t.type === 'zone' && t.zone === z) ? 'on' : ''}`} onClick={() => setTool(isTool('zone', (t) => t.type === 'zone' && t.zone === z) ? null : { type: 'zone', zone: z })}>
                <span className="pitem-icon swatch" style={{ background: ZONE_INFO[z].css }} aria-hidden /><b>Zone {ZONE_INFO[z].name.toLowerCase()}</b><small>{inr(ZONING.costPerTile)}/plot</small>
              </button>
            ))}
            <button className={`pitem ${isTool('zone', (t) => t.type === 'zone' && t.zone === 'clear') ? 'on' : ''}`} onClick={() => setTool({ type: 'zone', zone: 'clear' })}>
              <span className="pitem-icon" aria-hidden>🧽</span><b>Clear zoning</b><small>Free</small>
            </button>
            <button className={`pitem danger ${isTool('demolish') ? 'on' : ''}`} onClick={() => setTool(isTool('demolish') ? null : { type: 'demolish' })}>
              <span className="pitem-icon" aria-hidden>🚜</span><b>Demolish</b><small>Compensation applies</small>
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`chk ${ok ? 'ok' : 'no'}`}><Icon name={ok ? 'check' : 'x'} size={12} stroke={3} /> {label}</span>;
}

/** Live preview of the active tool for the tile under the cursor. */
export function ToolPanel() {
  const tool = useGame((s) => s.tool);
  const hover = useGame((s) => s.hover);
  const g = useGame((s) => s.game);
  const setTool = useGame((s) => s.setTool);
  useEffect(() => {
    if (!tool) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setTool(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [tool, setTool]);
  if (!tool) return null;
  const m = getLiveMap(g);

  let title = '';
  let body: React.ReactNode = null;
  let hint = '';
  if (tool.type === 'place') {
    const def = PLACEABLE_MAP[tool.kind];
    title = tool.relocateFrom !== undefined ? 'Relocate factory' : def.name;
    hint = tool.relocateFrom !== undefined ? 'Tap an empty industrial site for the new, modernised factory' : 'Tap the map to place · Esc to cancel';
    const c = hover ? checkPlacement(g, m, tool.kind, hover.x, hover.y, tool.relocateFrom !== undefined) : null;
    body = (
      <>
        <div className="tp-facts"><b>{inr(c?.cost ?? def.cost)}</b><span>{def.weeks} wk build</span><span>{def.w}×{def.h} land</span>{def.upkeep > 0 && <span>{inr(def.upkeep)}/wk upkeep</span>}</div>
        {c && (
          <div className="tp-checks">
            <Check ok={c.land} label="Empty land" />
            <Check ok={c.road} label={def.needsArterial ? 'Main road' : def.needsRoad ? 'Road access' : 'No road needed'} />
            <Check ok={c.zone} label={`${c.zoneName} zone`} />
          </div>
        )}
        <p className="tp-impact">{def.impact}</p>
        {c && !c.ok && <p className="tp-reason">{c.reasons[0]}</p>}
      </>
    );
  } else if (tool.type === 'road') {
    title = 'Build road';
    hint = tool.start ? 'Tap the end point · roads follow an L-shape' : 'Tap a start point next to an existing road';
    const c = tool.start && hover ? checkRoad(g, m, tool.start[0], tool.start[1], hover.x, hover.y) : null;
    body = (
      <>
        <div className="tp-facts"><b>{c ? inr(c.cost) : `${inr(ROAD.costPerTile)}/tile`}</b>{c && <span>{c.tiles.length} new tiles</span>}<span>{ROAD.weeks} wk build</span></div>
        {c && !c.ok && <p className="tp-reason">{c.reasons[0]}</p>}
        <p className="tp-impact">New roads open land for development and give vehicles more routes.</p>
      </>
    );
  } else if (tool.type === 'zone') {
    title = tool.zone === 'clear' ? 'Clear zoning' : `Zone ${ZONE_INFO[tool.zone].name.toLowerCase()}`;
    hint = tool.start ? 'Tap the opposite corner' : 'Tap the first corner of the area';
    const n = tool.start && hover ? zoneTiles(m, tool.start[0], tool.start[1], hover.x, hover.y, tool.zone).length : 0;
    const cur = hover ? zoneAt(m, hover.x, hover.y) : null;
    body = (
      <>
        <div className="tp-facts"><b>{tool.zone === 'clear' ? 'Free' : tool.start ? inr(n * ZONING.costPerTile) : `${inr(ZONING.costPerTile)}/plot`}</b>{tool.start && <span>{n} empty plots</span>}{cur && <span>Here: {ZONE_INFO[cur].name}</span>}</div>
        <p className="tp-impact">Zoning decides what may be built on empty land. Factories need industrial land; housing is not allowed there.</p>
      </>
    );
  } else {
    title = 'Demolish';
    hint = 'Tap a building to see the compensation and consequences';
    const b = hover ? buildingAt(m, hover.x, hover.y) : null;
    const info = b ? demolitionInfo(g, m, b.id) : null;
    body = b && info ? (
      <>
        <div className="tp-facts"><b>{KIND_INFO[b.kind].label}</b>{info.allowed && <span>{info.cancel ? `Refund ${inr(info.refund)}` : `Compensation ${inr(info.cost)}`}</span>}</div>
        <p className={info.allowed ? 'tp-impact' : 'tp-reason'}>{info.allowed ? info.note : info.reason}</p>
      </>
    ) : <p className="tp-impact">Demolition frees land, but people lose homes, jobs or parks.</p>;
  }

  return (
    <section className="tool-panel" aria-live="polite">
      <header>
        <b>{title}</b>
        <button className="icon-btn ghost" onClick={() => setTool(null)} aria-label="Cancel tool"><Icon name="x" /></button>
      </header>
      {body}
      <small className="tp-hint">{hint}</small>
    </section>
  );
}
