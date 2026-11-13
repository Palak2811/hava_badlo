import { describe, expect, it } from 'vitest';
import { TICKS_PER_WEEK } from '../src/config/balance';
import { CITY_SIM } from '../src/config/city';
import { buildRoad, checkPlacement, demolish, liveMap, placeBuilding, zoneArea } from '../src/engine/build';
import { BASE_TRAFFIC, assessCity, computeTraffic, cityWeek, growCity } from '../src/engine/city';
import { buyBuilding, finishAllConstruction, newGame, step } from '../src/engine/core';
import { BASE_STATS, COLS, ROWS, tileAt, zoneAt } from '../src/engine/map';
import { load, save, serialize, type StorageLike } from '../src/engine/save';
import { SAVE_KEY } from '../src/config/balance';
import type { GameState } from '../src/engine/types';

const fresh = (week = 8) => {
  const s = newGame(5, 0);
  s.introDone = true;
  s.tutorialDone = true;
  s.objectives = [];
  s.res.budget = 1e6;
  s.tick = (week - 1) * TICKS_PER_WEEK;
  return s;
};
const weeks = (s: GameState, n: number) => {
  for (let i = 0; i < n * TICKS_PER_WEEK; i++) step(s);
};
class Mem implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('traffic model', () => {
  it('starts at a congested but normalised baseline', () => {
    const s = fresh();
    expect(s.city.traffic.congestion).toBeCloseTo(CITY_SIM.baseCongestion, 2);
    expect(s.city.traffic.transportMult).toBeCloseTo(1, 5);
    expect(BASE_TRAFFIC.ptShare).toBeGreaterThan(0.3);
    expect(BASE_TRAFFIC.ptShare).toBeLessThan(0.5);
  });

  it('more roads lower congestion; more parking raises private trips', () => {
    const st = { ...BASE_STATS };
    const pop = BASE_STATS.population * 0.95;
    const base = computeTraffic(st, pop, 0);
    expect(computeTraffic({ ...st, streetTiles: st.streetTiles + 60 }, pop, 0).congestion).toBeLessThan(base.congestion);
    expect(computeTraffic({ ...st, parkingTiles: 20 }, pop, 0).privateTrips).toBeGreaterThan(base.privateTrips);
  });

  it('bus stops and the E-Bus Depot shift trips to public transport', () => {
    const st = { ...BASE_STATS };
    const pop = BASE_STATS.population * 0.95;
    const base = computeTraffic(st, pop, 0);
    const depot = computeTraffic(st, pop, 2);
    const stops = computeTraffic({ ...st, busStops: st.busStops + 15 }, pop, 0);
    expect(depot.ptShare).toBeGreaterThan(base.ptShare);
    expect(depot.transportMult).toBeLessThan(base.transportMult);
    expect(stops.privateTrips).toBeLessThan(base.privateTrips);
  });

  it('a real bus depot changes the weekly traffic numbers', () => {
    const s = fresh();
    const before = s.city.traffic.privateTrips;
    buyBuilding(s, 'bus');
    finishAllConstruction(s);
    assessCity(s);
    expect(s.city.traffic.privateTrips).toBeLessThan(before);
  });
});

describe('population and employment', () => {
  it('population moves toward new housing capacity', () => {
    const s = fresh(7);
    const p0 = s.city.population;
    // build a few apartment societies
    const m = liveMap(s);
    let built = 0;
    for (let y = 0; y < ROWS && built < 4; y++) for (let x = 0; x < COLS && built < 4; x++) {
      if (checkPlacement(s, liveMap(s), 'apartment', x, y).ok) {
        placeBuilding(s, 'apartment', x, y);
        built++;
      }
    }
    expect(built).toBe(4);
    expect(m).toBeDefined();
    finishAllConstruction(s);
    for (let i = 0; i < 6; i++) cityWeek(s);
    expect(s.mapStats.population).toBeGreaterThan(BASE_STATS.population);
    expect(s.city.population).toBeGreaterThan(p0);
  });

  it('closing factories creates unemployment, which costs trust', () => {
    const s = fresh();
    s.city.population = s.mapStats.population; // a full city
    for (const b of liveMap(s).buildings.filter((x) => x.kind === 'factory' || x.kind === 'office')) demolish(s, b.id);
    assessCity(s);
    expect(s.city.unemployment).toBeGreaterThan(CITY_SIM.unemploymentTolerance);
    expect(s.city.demand.ind).toBeGreaterThan(0.15);
  });
});

describe('organic growth', () => {
  it('developers build on zoned land when demand exists, paying fees', () => {
    const s = fresh(8);
    s.city.demand = { res: 0.8, com: -1, ind: -1 };
    const b0 = s.res.budget;
    const n = growCity(s);
    expect(n).toBeGreaterThan(0);
    const organic = s.cityEdits.placed.filter((p) => p.organic);
    expect(organic.length).toBe(n);
    for (const p of organic) expect(zoneAt(liveMap(s), p.x, p.y)).toBe('res');
    expect(s.res.budget).toBeGreaterThan(b0);
    expect(organic.every((p) => !p.built && p.cost === 0)).toBe(true);
  });

  it('no growth where demand is weak, and a cap on active sites', () => {
    const s = fresh(8);
    s.city.demand = { res: 0, com: 0, ind: 0 };
    expect(growCity(s)).toBe(0);
    s.city.demand = { res: 1, com: 1, ind: 1 };
    for (let i = 0; i < 5; i++) growCity(s);
    expect(s.cityEdits.placed.filter((p) => p.organic && !p.built).length).toBeLessThanOrEqual(CITY_SIM.growth.maxActiveSites);
  });

  it('zoning industrial land lets factories appear when workers need jobs', () => {
    const s = fresh(10);
    const m = liveMap(s);
    // find a 2x2 residential patch with road access and rezone it
    let spot: [number, number] | null = null;
    for (let y = 0; y < ROWS - 1 && !spot; y++) for (let x = 0; x < COLS - 1 && !spot; x++) {
      if (zoneAt(m, x, y) === 'res' && checkPlacement(s, m, 'apartment', x, y).ok) spot = [x, y];
    }
    expect(spot).not.toBeNull();
    zoneArea(s, spot![0], spot![1], spot![0] + 1, spot![1] + 1, 'ind');
    s.city.demand = { res: -1, com: -1, ind: 0.9 };
    growCity(s);
    const kinds = s.cityEdits.placed.filter((p) => p.organic).map((p) => p.kind);
    expect(kinds.some((k) => k === 'factory' || k === 'warehouse')).toBe(true);
  });

  it('private construction finishes and adds homes over the weeks', () => {
    const s = fresh(8);
    const cap0 = s.mapStats.population;
    weeks(s, 6);
    expect(s.city.developments).toBeGreaterThan(0);
    expect(s.cityEdits.placed.some((p) => p.organic && p.built)).toBe(true);
    expect(s.mapStats.population).toBeGreaterThan(cap0);
  });

  it('is deterministic for the same seed', () => {
    const a = fresh(8), b = fresh(8);
    weeks(a, 4);
    weeks(b, 4);
    expect(a.cityEdits.placed.map((p) => [p.kind, p.x, p.y])).toEqual(b.cityEdits.placed.map((p) => [p.kind, p.x, p.y]));
    expect(a.city.population).toBe(b.city.population);
  });
});

describe('persistence', () => {
  it('keeps residents and demand across save/load', () => {
    const st = new Mem();
    const s = fresh(8);
    weeks(s, 3);
    save(st, s, 1);
    const r = load(st, 1);
    expect(r.state.city.population).toBeCloseTo(s.city.population, 3);
    expect(r.state.city.developments).toBe(s.city.developments);
  });

  it('rebuilds a missing city block from the map', () => {
    const st = new Mem();
    const f = JSON.parse(serialize(fresh(8)));
    delete f.state.city;
    st.setItem(SAVE_KEY, JSON.stringify(f));
    const r = load(st);
    expect(r.state.city.population).toBeGreaterThan(0);
    expect(r.state.city.traffic.trips).toBeGreaterThan(0);
  });
});

describe('roads relieve congestion in play', () => {
  it('a finished road raises capacity', () => {
    const s = fresh();
    const m = liveMap(s);
    let start: [number, number] | null = null;
    for (let y = 1; y < ROWS - 1 && !start; y++) for (let x = 1; x < COLS - 6 && !start; x++) {
      if (tileAt(m, x - 1, y) === 'street' && [0, 1, 2, 3].every((k) => tileAt(m, x + k, y) === 'grass')) start = [x, y];
    }
    expect(start).not.toBeNull();
    const before = s.city.traffic.congestion;
    expect(buildRoad(s, start![0], start![1], start![0] + 3, start![1]).ok).toBe(true);
    finishAllConstruction(s);
    assessCity(s);
    expect(s.city.traffic.congestion).toBeLessThan(before);
  });
});
