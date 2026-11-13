/**
 * Neighbourhood air quality.
 *
 * The city-wide concentration (core.ts: seasons, weather, events, controls) is the mean level.
 * Each source is distributed over neighbourhoods by what is actually there (factories, roads &
 * congestion, construction, residents, upwind farms), pollution spills into adjacent areas, and
 * parks give local relief. City AQI = population-weighted exposure, so WHERE pollution happens matters.
 */
import { POLLUTION, SEASONS } from '../config/balance';
import { CITY, COLS, DISTRICTS, LANDMARKS, ROWS, idx, infoOf, type CityMap } from './map';
import { concToAqi } from './core';
import { SOURCES, type AirState, type DistrictStats, type GameState, type Source } from './types';

/** stubble smoke arrives from the north-west */
const REGIONAL: Record<string, number> = {
  narela: 1.7, modeltown: 1.4, karolbagh: 1.25, dwarka: 1.25, cp: 1.05, centralvista: 1.0, lajpat: 0.95,
  okhla: 0.9, nehruplace: 0.9, mayurvihar: 0.8, anandvihar: 0.8, saritavihar: 0.8,
};

const districtIndex = (() => {
  const a = new Int16Array(COLS * ROWS).fill(-1);
  DISTRICTS.forEach((d, i) => {
    for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) a[idx(x, y)] = i;
  });
  return a;
})();

/** Districts sharing a border. */
export const ADJACENT: Record<string, string[]> = Object.fromEntries(
  DISTRICTS.map((a) => [
    a.id,
    DISTRICTS.filter((b) => b !== a && a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h &&
      !((a.x + a.w === b.x || b.x + b.w === a.x) && (a.y + a.h === b.y || b.y + b.h === a.y))).map((b) => b.id),
  ]),
);

const empty = (): DistrictStats => ({ capacity: 0, jobs: 0, retailJobs: 0, officeJobs: 0, industryLoad: 0, parkingTiles: 0, arterial: 0, street: 0, roadwork: 0, sites: 0, parkTiles: 0, land: 0, busTerminal: 0 });

/** Per-neighbourhood totals from the live map. */
export function districtBreakdown(m: CityMap): Record<string, DistrictStats> {
  const out: Record<string, DistrictStats> = Object.fromEntries(DISTRICTS.map((d) => [d.id, empty()]));
  for (let i = 0; i < m.tiles.length; i++) {
    const di = districtIndex[i];
    if (di < 0) continue;
    const s = out[DISTRICTS[di].id];
    const t = m.tiles[i];
    if (t !== 'water') s.land++;
    if (t === 'arterial' || t === 'bridge') s.arterial++;
    else if (t === 'street') s.street++;
    else if (t === 'roadwork') s.roadwork++;
    else if (t === 'park' && m.owner[i] < 0) s.parkTiles++;
  }
  for (const b of m.buildings) {
    if (b.removed) continue;
    const s = out[b.district] ?? out[DISTRICTS[districtIndex[idx(b.x, b.y)]]?.id];
    if (!s) continue;
    if (b.progress) { s.sites++; continue; }
    const k = infoOf(b);
    const area = b.w * b.h;
    const scale = b.kind === 'house' || b.kind === 'shop' ? area : 1;
    s.capacity += k.residents * scale;
    s.jobs += k.jobs * scale;
    if (b.kind === 'shop' || b.kind === 'market') s.retailJobs += k.jobs * scale;
    if (b.landmark) s.retailJobs += LANDMARKS[b.landmark].retailJobs ?? 0;
    if (b.kind === 'office') s.officeJobs += k.jobs;
    if (b.kind === 'factory') s.industryLoad += area * (b.modern ? 0.5 : 1);
    if (b.kind === 'warehouse') s.industryLoad += area * 0.3;
    if (b.kind === 'construction') s.sites++;
    if (b.kind === 'parking') s.parkingTiles += area;
    if (b.kind === 'park') s.parkTiles += area;
    if (b.kind === 'forest') s.parkTiles += area * 2;
    if (b.kind === 'busterminal') s.busTerminal++;
  }
  return out;
}

/** Spatial weights (area-mean = 1 for every source), residents and park relief per district. */
export function airWeights(d: Record<string, DistrictStats>, occupancy: number, congestion: number): Omit<AirState, 'factors' | 'shares'> {
  const ids = DISTRICTS.map((x) => x.id);
  const pop: Record<string, number> = {};
  const raw: Record<Source, Record<string, number>> = { transport: {}, dust: {}, industry: {}, agriculture: {}, waste: {}, other: {} };
  for (const id of ids) {
    const s = d[id];
    const res = s.capacity * occupancy;
    pop[id] = res;
    raw.industry[id] = s.industryLoad + 0.5;
    raw.transport[id] = (s.arterial + 0.35 * s.street) * (0.7 + 0.3 * congestion) + 25 * s.busTerminal + (s.jobs + res) / 2000;
    raw.dust[id] = 12 * s.sites + 3 * s.roadwork + 0.3 * (s.arterial + s.street) + 1;
    raw.waste[id] = res / 1000 + 1;
    raw.agriculture[id] = (REGIONAL[id] ?? 1) * s.land;
    raw.other[id] = s.land * (1 + (s.jobs + res) / 20000 / Math.max(1, s.land) * 10);
  }
  const w = {} as Record<Source, Record<string, number>>;
  const totalLand = ids.reduce((t, id) => t + d[id].land, 0);
  for (const k of SOURCES) {
    const total = ids.reduce((t, id) => t + raw[k][id], 0);
    const mean = total / Math.max(1, totalLand); // per land tile, city-wide
    w[k] = {};
    for (const id of ids) w[k][id] = mean > 0 ? raw[k][id] / Math.max(1, d[id].land) / mean : 1;
  }
  const relief: Record<string, number> = {};
  for (const id of ids) relief[id] = Math.min(0.25, (d[id].parkTiles / Math.max(1, d[id].land)) * 1.2);
  return { w, pop, relief };
}

function rawFactors(air: Omit<AirState, 'factors' | 'shares'>, shares: Record<Source, number>) {
  const f: Record<string, number> = {};
  for (const dd of DISTRICTS) f[dd.id] = SOURCES.reduce((t, k) => t + shares[k] * air.w[k][dd.id], 0);
  const smooth: Record<string, number> = {};
  for (const dd of DISTRICTS) {
    const nb = ADJACENT[dd.id];
    const avg = nb.length ? nb.reduce((t, id) => t + f[id], 0) / nb.length : f[dd.id];
    smooth[dd.id] = (0.65 * f[dd.id] + 0.35 * avg) * (1 - air.relief[dd.id]);
  }
  return smooth;
}

export function sharesOf(e: Record<Source, number>): Record<Source, number> {
  const total = SOURCES.reduce((t, k) => t + e[k], 0) || 1;
  return Object.fromEntries(SOURCES.map((k) => [k, e[k] / total])) as Record<Source, number>;
}

/* ------------------------------------------------------------------ calibration: start city exposure = 1 */

const BASE_D = districtBreakdown(CITY);
const BASE_W = airWeights(BASE_D, 0.95, 1.05);
const BASE_SHARES = sharesOf(Object.fromEntries(SOURCES.map((k) => [k, POLLUTION.base[k] * SEASONS[0].mult[k]])) as Record<Source, number>);
const K = (() => {
  const f = rawFactors(BASE_W, BASE_SHARES);
  const totalPop = DISTRICTS.reduce((t, d) => t + BASE_W.pop[d.id], 0);
  return totalPop / DISTRICTS.reduce((t, d) => t + BASE_W.pop[d.id] * f[d.id], 0);
})();

export function districtFactors(air: Omit<AirState, 'factors' | 'shares'>, shares: Record<Source, number>) {
  const f = rawFactors(air, shares);
  for (const id of Object.keys(f)) f[id] *= K;
  return f;
}

export function makeAir(d: Record<string, DistrictStats>, occupancy: number, congestion: number, shares: Record<Source, number> = BASE_SHARES): AirState {
  const w = airWeights(d, occupancy, congestion);
  return { ...w, shares, factors: districtFactors(w, shares) };
}

/** The untouched city, used for the "if you did nothing" comparison. */
export const BASE_AIR = makeAir(BASE_D, 0.95, 1.05);

export function districtAqi(air: AirState, conc: number, id: string) {
  return concToAqi(conc * (air.factors[id] ?? 1));
}

/** Population-weighted exposure AQI. */
export function exposureAqi(air: AirState, conc: number) {
  let num = 0, den = 0;
  for (const d of DISTRICTS) {
    const p = air.pop[d.id] ?? 0;
    num += p * concToAqi(conc * (air.factors[d.id] ?? 1));
    den += p;
  }
  return den > 0 ? Math.round(num / den) : concToAqi(conc);
}

export function topSources(air: AirState, id: string, n = 2): Source[] {
  return [...SOURCES].sort((a, b) => air.shares[b] * air.w[b][id] - air.shares[a] * air.w[a][id]).slice(0, n);
}

export const BASE_DISTRICTS = BASE_D;

/** Recompute spatial weights after the map, population or traffic changed. */
export function updateAir(s: GameState) {
  const occ = s.city ? s.city.population / Math.max(1, s.mapStats.population) : 0.95;
  const cong = s.city ? s.city.traffic.congestion : 1.05;
  s.air = makeAir(s.districts, occ, cong, s.air?.shares ?? BASE_SHARES);
}
