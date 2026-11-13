/**
 * City-building rules: placement, demolition, relocation, roads, zoning and construction timers.
 * Every action mutates the GameState passed in (callers clone first) and keeps `mapStats`
 * in sync so the simulation feels the change.
 */
import { TICKS_PER_WEEK } from '../config/balance';
import { CANCEL_REFUND, DEMOLITION, PLACEABLES, PLACEABLE_MAP, RELOCATION, ROAD, ZONE_INFO, ZONING, type PlaceableDef } from '../config/build';
import { addNews, applyDeltas, canAfford, checkProgress, clamp, pay, weekOf, type ActionResult } from './core';
import {
  BASE_STATS, CITY, KIND_INFO, buildMap, computeMapStats, districtAt, idx, inBounds, isRoad, roadAccess, tileAt, zoneAt,
  type CityMap, type MapBuilding,
} from './map';
import type { Deltas, GameState, Modifier, Placeable, Zone } from './types';
import { CITY_SIM } from '../config/city';
import { districtBreakdown, updateAir } from './air';

/* ------------------------------------------------------------------ map access */

export const liveMap = (s: GameState) => buildMap(s.cityEdits);

function upkeepOf(b: MapBuilding) {
  if (b.placedUid === undefined) return 0;
  return PLACEABLES.find((p) => p.kind === b.kind)?.upkeep ?? 0;
}

/** Recompute derived map numbers after any edit. */
export function refreshMap(s: GameState) {
  s.mapVersion += 1;
  const m = liveMap(s);
  s.mapStats = computeMapStats(m, upkeepOf);
  s.districts = districtBreakdown(m);
  updateAir(s);
}

export function placeableUnlocked(s: GameState, def: PlaceableDef) {
  return weekOf(s) >= def.unlockWeek || (s.stage >= 2 && def.unlockWeek <= 14);
}

/* ------------------------------------------------------------------ placement */

export interface PlacementCheck {
  ok: boolean;
  reasons: string[];
  land: boolean;
  road: boolean;
  zone: boolean;
  zoneName: string;
  cost: number;
  weeks: number;
  w: number;
  h: number;
}

export function checkPlacement(s: GameState, m: CityMap, kind: Placeable, x: number, y: number, relocating = false): PlacementCheck {
  const def = PLACEABLE_MAP[kind];
  const reasons: string[] = [];
  let land = true;
  let zone = true;
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
    const tx = x + dx, ty = y + dy;
    if (!inBounds(tx, ty) || tileAt(m, tx, ty) !== 'grass') land = false;
    const z = zoneAt(m, tx, ty);
    if (!z || !def.zones.includes(z)) zone = false;
  }
  if (!land) reasons.push('Needs empty land');
  let road = !def.needsRoad || roadAccess(m, x, y, def.w, def.h);
  if (def.needsArterial) {
    road = false;
    for (let dy = -1; dy <= def.h; dy++) for (let dx = -1; dx <= def.w; dx++) {
      const t = tileAt(m, x + dx, y + dy);
      if (t === 'arterial' || t === 'bridge') road = true;
    }
  }
  if (!road) reasons.push(def.needsArterial ? 'Must be beside a main road' : 'No road access');
  if (!zone) reasons.push(`Not allowed in this zone (needs ${def.zones.map((z) => ZONE_INFO[z].name.toLowerCase()).join(' / ')})`);
  if (!placeableUnlocked(s, def)) reasons.push(`Unlocks in week ${def.unlockWeek}`);
  const cost = relocating ? Math.round(def.cost * RELOCATION.costFactor) : def.cost;
  if (s.res.budget < cost) reasons.push('Not enough money');
  const z0 = zoneAt(m, x, y);
  return { ok: reasons.length === 0, reasons, land, road, zone, zoneName: z0 ? ZONE_INFO[z0].name : '—', cost, weeks: def.weeks, w: def.w, h: def.h };
}

export function placeBuilding(s: GameState, kind: Placeable, x: number, y: number, relocateFrom?: number): ActionResult {
  const def = PLACEABLE_MAP[kind];
  if (!def) return { ok: false, msg: 'Unknown building' };
  const m = liveMap(s);
  let source: MapBuilding | undefined;
  if (relocateFrom !== undefined) {
    source = m.buildings[relocateFrom];
    if (!source || source.removed || source.kind !== 'factory' || source.progress) return { ok: false, msg: 'Only a working factory can be relocated' };
    if (def.kind !== 'factory') return { ok: false, msg: 'A factory can only be relocated as a factory' };
  }
  const c = checkPlacement(s, m, kind, x, y, !!source);
  if (!c.ok) return { ok: false, msg: c.reasons[0] };
  pay(s, { budget: c.cost });
  const uid = s.cityEdits.nextUid++;
  s.cityEdits.placed.push({ uid, kind, x, y, w: def.w, h: def.h, cost: c.cost, started: s.tick, done: s.tick + def.weeks * TICKS_PER_WEEK, built: false, modern: !!source });
  const where = districtAt(m, x, y)?.name ?? 'Delhi';
  if (source) {
    removeBuilding(s, source);
    applyDeltas(s, RELOCATION.deltas);
    addNews(s, 'gov', `Factory Relocated to ${where} With Modern Emission Controls; Workers Keep Their Jobs`, 'The old site is cleared. Compensation was negotiated over 47 cups of tea.');
  } else {
    addNews(s, 'gov', `Construction Begins: ${def.name} in ${where}`, `Expected completion in ${def.weeks} week${def.weeks > 1 ? 's' : ''}.`);
  }
  refreshMap(s);
  return { ok: true, msg: `${def.name}: construction started (${def.weeks} wk)` };
}

/* ------------------------------------------------------------------ demolition & relocation */

export interface DemolitionInfo {
  allowed: boolean;
  reason?: string;
  cancel: boolean;
  cost: number;
  refund: number;
  deltas: Deltas;
  note: string;
}

export function demolitionInfo(s: GameState, m: CityMap, id: number): DemolitionInfo {
  const b = m.buildings[id];
  const none = { cancel: false, cost: 0, refund: 0, deltas: {}, note: '' };
  if (!b || b.removed) return { allowed: false, reason: 'Nothing here', ...none };
  if (b.kind === 'monument' || b.kind === 'busterminal') return { allowed: false, reason: 'This is protected city infrastructure.', ...none };
  if (b.progress) {
    const p = s.cityEdits.placed.find((q) => q.uid === b.placedUid)!;
    if (p.organic) return { allowed: true, cancel: true, cost: 0, refund: 0, deltas: { pressure: 2 }, note: 'Revoke a private developer’s permit. The builders’ lobby takes note.' };
    return { allowed: true, cancel: true, cost: 0, refund: Math.round(p.cost * CANCEL_REFUND), deltas: {}, note: 'Cancel construction and recover part of the money.' };
  }
  const d = DEMOLITION[b.kind];
  if (!d) return { allowed: false, reason: 'Cannot be demolished', ...none };
  const cost = d.cost + (d.perTile ?? 0) * b.w * b.h;
  return { allowed: true, cancel: false, cost, refund: 0, deltas: d.deltas, note: d.note };
}

function removeBuilding(s: GameState, b: MapBuilding) {
  if (b.placedUid !== undefined) s.cityEdits.placed = s.cityEdits.placed.filter((p) => p.uid !== b.placedUid);
  else if (!s.cityEdits.demolished.includes(b.id)) s.cityEdits.demolished.push(b.id);
}

export function demolish(s: GameState, id: number): ActionResult {
  const m = liveMap(s);
  const info = demolitionInfo(s, m, id);
  if (!info.allowed) return { ok: false, msg: info.reason ?? 'Cannot demolish' };
  const b = m.buildings[id];
  const label = KIND_INFO[b.kind].label;
  if (info.cancel) {
    s.res.budget += info.refund;
    applyDeltas(s, info.deltas);
    removeBuilding(s, b);
    refreshMap(s);
    return { ok: true, msg: `Construction cancelled · ₹${info.refund.toLocaleString('en-IN')} recovered` };
  }
  if (s.res.budget < info.cost) return { ok: false, msg: 'Not enough money for compensation' };
  pay(s, { budget: info.cost });
  applyDeltas(s, info.deltas);
  removeBuilding(s, b);
  s.stats.demolitions += 1;
  addNews(s, 'gov', `${label} Demolished in ${districtAt(m, b.x, b.y)?.name ?? 'Delhi'}`, info.note);
  refreshMap(s);
  return { ok: true, msg: `${label} demolished` };
}

/* ------------------------------------------------------------------ roads */

/** L-shaped path: horizontal first, then vertical. */
export function roadPath(x1: number, y1: number, x2: number, y2: number): [number, number][] {
  const out: [number, number][] = [];
  const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1);
  for (let x = x1; ; x += sx) {
    out.push([x, y1]);
    if (x === x2 || sx === 0) break;
  }
  for (let y = y1 + sy; sy !== 0; y += sy) {
    out.push([x2, y]);
    if (y === y2) break;
  }
  return out;
}

export interface RoadCheck { ok: boolean; reasons: string[]; tiles: [number, number][]; cost: number }

export function checkRoad(s: GameState, m: CityMap, x1: number, y1: number, x2: number, y2: number): RoadCheck {
  const path = roadPath(x1, y1, x2, y2);
  const reasons: string[] = [];
  const fresh = path.filter(([x, y]) => tileAt(m, x, y) === 'grass');
  if (path.some(([x, y]) => { const t = tileAt(m, x, y); return t !== 'grass' && !isRoad(t) && t !== 'roadwork'; })) reasons.push('Blocked by buildings, parks or water');
  if (path.length > ROAD.maxLength) reasons.push(`Too long (max ${ROAD.maxLength} tiles)`);
  if (!fresh.length) reasons.push('Already a road');
  const touches = path.some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]].some(([dx, dy]) => {
    const t = tileAt(m, x + dx, y + dy);
    return isRoad(t) || t === 'roadwork';
  }));
  if (!touches) reasons.push('Must connect to an existing road');
  const cost = fresh.length * ROAD.costPerTile;
  if (s.res.budget < cost) reasons.push('Not enough money');
  return { ok: reasons.length === 0, reasons, tiles: fresh, cost };
}

export function buildRoad(s: GameState, x1: number, y1: number, x2: number, y2: number): ActionResult {
  const c = checkRoad(s, liveMap(s), x1, y1, x2, y2);
  if (!c.ok) return { ok: false, msg: c.reasons[0] };
  pay(s, { budget: c.cost });
  for (const [x, y] of c.tiles) s.cityEdits.roads.push({ i: idx(x, y), done: s.tick + ROAD.weeks * TICKS_PER_WEEK, built: false });
  refreshMap(s);
  return { ok: true, msg: `Road works started: ${c.tiles.length} tiles` };
}

/* ------------------------------------------------------------------ zoning */

export function zoneTiles(m: CityMap, x1: number, y1: number, x2: number, y2: number, zone: Zone | 'clear') {
  const out: number[] = [];
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    if (tileAt(m, x, y) !== 'grass') continue;
    const cur = m.zones[String(idx(x, y))];
    if (zone === 'clear' ? cur !== undefined : cur !== zone) out.push(idx(x, y));
  }
  return out;
}

export function zoneArea(s: GameState, x1: number, y1: number, x2: number, y2: number, zone: Zone | 'clear'): ActionResult {
  const tiles = zoneTiles(liveMap(s), x1, y1, x2, y2, zone);
  if (!tiles.length) return { ok: false, msg: 'No empty land to zone here' };
  const cost = zone === 'clear' ? 0 : tiles.length * ZONING.costPerTile;
  if (!canAfford(s, { budget: cost })) return { ok: false, msg: 'Not enough money' };
  pay(s, { budget: cost });
  for (const i of tiles) {
    if (zone === 'clear') delete s.cityEdits.zones[String(i)];
    else s.cityEdits.zones[String(i)] = zone;
  }
  refreshMap(s);
  return { ok: true, msg: zone === 'clear' ? `Zoning cleared on ${tiles.length} plots` : `${tiles.length} plots zoned ${ZONE_INFO[zone].name.toLowerCase()}` };
}

/* ------------------------------------------------------------------ construction progress (called every tick) */

export function advanceConstruction(s: GameState) {
  let changed = false;
  for (const p of s.cityEdits.placed) {
    if (p.built || p.done > s.tick) continue;
    p.built = true;
    changed = true;
    s.stats.projectsCompleted += 1;
    if (!p.organic) s.stats.playerProjects += 1;
    const d = districtAt(CITY, p.x, p.y);
    addNews(s, 'gov', `Construction Complete: ${PLACEABLE_MAP[p.kind].name} in ${d?.name ?? 'Delhi'}`, 'Ribbon cut, photographs taken, samosas distributed.');
  }
  for (const r of s.cityEdits.roads) {
    if (r.built || r.done > s.tick) continue;
    r.built = true;
    changed = true;
  }
  if (changed) {
    refreshMap(s);
    checkProgress(s);
  }
}

/* ------------------------------------------------------------------ simulation link */

/** How the current map (vs the original city) shifts emissions, revenue, trust and upkeep. */
export function mapModifier(s: GameState): Modifier {
  const st = s.mapStats, b = BASE_STATS, c = s.city;
  const parkDelta = st.parkTiles - b.parkTiles;
  const unemploymentHit = Math.max(0, c.unemployment - CITY_SIM.unemploymentTolerance) * CITY_SIM.unemploymentTrust;
  const crowdHit = Math.max(0, c.overcrowding - CITY_SIM.overcrowdingTolerance) * CITY_SIM.overcrowdingTrust;
  const greenControl = clamp(0.0025 * parkDelta, 0, 0.12);
  return {
    emissionMult: {
      industry: 0.4 + 0.6 * (st.industryLoad / b.industryLoad),
      transport: c.traffic.transportMult,
      dust: Math.max(0.7, 1 + 0.025 * (st.constructionSites - b.constructionSites)) * (1 + c.overcrowding),
      waste: 1 + c.overcrowding * 1.5,
    },
    control: {
      dust: greenControl,
      other: greenControl,
    },
    trustPerWeek: 0.5 * (st.hospitals - b.hospitals) + 0.25 * (st.schools - b.schools) + 0.004 * parkDelta - unemploymentHit - crowdHit,
    participationPerWeek: 0.1 * (st.schools - b.schools),
    upkeepPerWeek: st.upkeep,
  };
}
