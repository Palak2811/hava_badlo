/**
 * Living city: residents, employment, RCI demand, organic growth and traffic.
 * Runs once per in-game week (never per frame). Deterministic: growth uses the seeded RNG.
 */
import { TICKS_PER_WEEK } from '../config/balance';
import { PLACEABLE_MAP } from '../config/build';
import { CITY_SIM as C } from '../config/city';
import { actualAqi, addNews, weekOf } from './core';

// local copy: this module computes constants at load time, before core.ts finishes initialising
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
import { refreshMap, liveMap } from './build';
import { BASE_STATS, districtAt, idx, roadAccess, tileAt, zoneAt, type CityMap } from './map';
import { nextRandom } from './rng';
import type { CitySim, GameState, MapStats, Placeable, TrafficStats, Zone } from './types';

/* ------------------------------------------------------------------ traffic */

function rawTraffic(st: MapStats, population: number, busLevel: number) {
  const workforce = population * C.workforceShare;
  const commuters = Math.min(workforce, st.jobs);
  const trips = commuters * C.tripsPerWorker + population * C.tripsPerResident;
  const ptCapacity =
    st.metroStations * C.metroStationCapacity +
    st.busStops * C.busStopCapacity * (1 + C.depotStopBonus * busLevel) +
    busLevel * C.depotCapacity;
  const ptShare = clamp(ptCapacity / Math.max(1, trips), C.ptShareMin, C.ptShareMax);
  const privateTrips = trips * (1 - ptShare) * (1 + C.parkingInduced * st.parkingTiles);
  const roadCapacity = st.arterialTiles * C.arterialCapacity + st.streetTiles * C.streetCapacity;
  return { trips, ptShare, privateTrips, roadCapacity };
}

const BASE_POP = BASE_STATS.population * C.startOccupancy;
const BASE_RAW = rawTraffic(BASE_STATS, BASE_POP, 0);
/** scale so the original city sits at `baseCongestion` */
const ROAD_K = BASE_RAW.privateTrips / (C.baseCongestion * BASE_RAW.roadCapacity);
const penalty = (cong: number) => 1 + C.congestionPenalty * Math.max(0, cong - C.congestionFree);
const BASE_PENALTY = penalty(C.baseCongestion);

export function computeTraffic(st: MapStats, population: number, busLevel: number): TrafficStats {
  const r = rawTraffic(st, population, busLevel);
  const congestion = r.privateTrips / Math.max(1, r.roadCapacity * ROAD_K);
  return {
    trips: Math.round(r.trips),
    ptShare: r.ptShare,
    privateTrips: Math.round(r.privateTrips),
    congestion,
    transportMult: (r.privateTrips / BASE_RAW.privateTrips) * (penalty(congestion) / BASE_PENALTY),
  };
}

export const BASE_TRAFFIC = computeTraffic(BASE_STATS, BASE_POP, 0);

export function congestionLabel(c: number) {
  if (c < 0.7) return 'Free-flowing';
  if (c < 0.95) return 'Moderate';
  if (c < 1.15) return 'Heavy';
  return 'Gridlock';
}

/* ------------------------------------------------------------------ population, jobs & demand */

export function initialCity(st: MapStats): CitySim {
  const population = st.population * C.startOccupancy;
  return {
    population,
    unemployment: 0,
    overcrowding: 0,
    demand: { res: 0, com: 0, ind: 0 },
    traffic: computeTraffic(st, population, 0),
    developments: 0,
  };
}

/** Recompute employment and demand from the current population (no migration). */
export function assessCity(s: GameState) {
  const st = s.mapStats;
  const c = s.city;
  const workforce = c.population * C.workforceShare;
  const unemployment = clamp((workforce - st.jobs) / Math.max(1, workforce), 0, 1);
  const vacancy = clamp((st.jobs - workforce) / Math.max(1, st.jobs), 0, 1);
  const overcrowding = Math.max(0, c.population / Math.max(1, st.population) - 1);
  const aqiPenalty = clamp((actualAqi(s) - 200) / 300, 0, 0.5);
  const retailNeed = c.population * C.retailJobsPerResident;
  c.unemployment = unemployment;
  c.overcrowding = overcrowding;
  c.demand = {
    res: clamp(vacancy * 2 + overcrowding * 3 - unemployment * 2 - aqiPenalty * 0.5 + 0.05, -1, 1),
    com: clamp(((retailNeed - st.retailJobs) / Math.max(1, retailNeed)) * 2 + 0.1, -1, 1),
    ind: clamp(unemployment * 3 + 0.1 - aqiPenalty * 0.3, -1, 1),
  };
  c.traffic = computeTraffic(st, c.population, s.buildings.bus);
}

function migrate(s: GameState) {
  const st = s.mapStats;
  const c = s.city;
  const aqiPenalty = clamp((actualAqi(s) - 200) / 300, 0, 0.5);
  const workforce = c.population * C.workforceShare;
  const vacancy = clamp((st.jobs - workforce) / Math.max(1, st.jobs), 0, 1);
  const attract = 1 + 0.5 * vacancy - 0.8 * c.unemployment - 0.4 * aqiPenalty + (s.res.trust - 50) / 400;
  const target = st.population * clamp(0.92 * attract, C.minOccupancy, C.maxOccupancy);
  c.population += (target - c.population) * C.migrationRate;
}

/* ------------------------------------------------------------------ organic growth */

function fits(m: CityMap, zone: Zone, x: number, y: number, w: number, h: number) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    if (tileAt(m, x + dx, y + dy) !== 'grass' || zoneAt(m, x + dx, y + dy) !== zone) return false;
  }
  return roadAccess(m, x, y, w, h);
}

function pickKind(m: CityMap, zone: Zone, x: number, y: number, demand: number, week: number): Placeable | null {
  const opts: Placeable[] =
    zone === 'res' ? [week >= 6 && demand > 0.4 ? 'apartment' : 'house', 'house']
      : zone === 'com' ? [week >= 14 && demand > 0.5 ? 'office' : 'market', 'market', 'shop']
        : zone === 'ind' ? [demand > 0.4 ? 'factory' : 'warehouse', 'warehouse'] : [];
  for (const k of opts) {
    const d = PLACEABLE_MAP[k];
    if ((k === 'market' || k === 'warehouse' || k === 'factory') && week < 6) continue;
    if (fits(m, zone, x, y, d.w, d.h)) return k;
  }
  return null;
}

/** Private developers build on zoned, road-connected empty land where demand exists. */
export function growCity(s: GameState) {
  const active = s.cityEdits.placed.filter((p) => p.organic && !p.built).length;
  let budget = Math.min(C.growth.maxPerWeek, C.growth.maxActiveSites - active);
  if (budget <= 0) return 0;
  const week = weekOf(s);
  const m = liveMap(s);
  const zones: (keyof CitySim['demand'])[] = ['res', 'com', 'ind'];
  let started = 0;
  const where = new Map<string, number>();
  for (const z of zones) {
    const demand = s.city.demand[z];
    if (demand <= C.growth.threshold || budget <= 0) continue;
    let want = Math.min(budget, Math.ceil(demand * 3));
    const offset = Math.floor(nextRandom(s) * m.tiles.length);
    for (let k = 0; k < m.tiles.length && want > 0; k++) {
      const i = (offset + k * 7) % m.tiles.length;
      const x = i % m.cols, y = Math.floor(i / m.cols);
      if (m.tiles[i] !== 'grass' || zoneAt(m, x, y) !== z) continue;
      const kind = pickKind(m, z, x, y, demand, week);
      if (!kind) continue;
      const d = PLACEABLE_MAP[kind];
      const uid = s.cityEdits.nextUid++;
      s.cityEdits.placed.push({ uid, kind, x, y, w: d.w, h: d.h, cost: 0, started: s.tick, done: s.tick + d.weeks * TICKS_PER_WEEK, built: false, organic: true });
      for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) m.tiles[idx(x + dx, y + dy)] = 'lot';
      s.res.budget += Math.round(d.cost * C.growth.devFeeShare);
      const dn = districtAt(m, x, y)?.name ?? 'Delhi';
      where.set(dn, (where.get(dn) ?? 0) + 1);
      want--;
      budget--;
      started++;
    }
  }
  if (started) {
    s.city.developments += started;
    const [dn] = [...where.entries()].sort((a, b) => b[1] - a[1])[0];
    addNews(s, 'gov', `Builders Start ${started} New Project${started > 1 ? 's' : ''}; ${dn} Leads the Boom`, 'Development fees flow into the treasury. Dust flows into everyone’s lungs.');
    refreshMap(s);
  }
  return started;
}

/** Weekly city update: migration, employment, demand, growth and traffic. */
export function cityWeek(s: GameState) {
  migrate(s);
  assessCity(s);
  growCity(s);
  assessCity(s);
}
