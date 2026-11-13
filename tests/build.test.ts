import { describe, expect, it } from 'vitest';
import { TICKS_PER_WEEK } from '../src/config/balance';
import { CANCEL_REFUND, PLACEABLE_MAP, ROAD, ZONING } from '../src/config/build';
import {
  buildRoad, checkPlacement, checkRoad, demolish, demolitionInfo, liveMap, mapModifier, placeBuilding, zoneArea,
} from '../src/engine/build';
import { agg, buyBuilding, emissions, finishAllConstruction, newGame, step } from '../src/engine/core';
import { BASE_STATS, COLS, ROWS, idx, roadNeighbours, tileAt, zoneAt, type CityMap } from '../src/engine/map';
import { load, save, serialize, type StorageLike } from '../src/engine/save';
import { revenueStreams } from '../src/engine/economy';
import type { GameState, Placeable } from '../src/engine/types';
import { SAVE_KEY } from '../src/config/balance';

const fresh = () => {
  const s = newGame(11, 0);
  s.tutorialDone = true;
  s.introDone = true;
  s.objectives = [];
  s.res.budget = 1e6;
  s.tick = 30 * TICKS_PER_WEEK; // everything unlocked
  return s;
};
const run = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) step(s);
};
/** First tile where `kind` can legally be placed. */
function findSpot(s: GameState, kind: Placeable, filter: (m: CityMap, x: number, y: number) => boolean = () => true) {
  const m = liveMap(s);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (filter(m, x, y) && checkPlacement(s, m, kind, x, y).ok) return { x, y };
  }
  throw new Error(`no spot for ${kind}`);
}
class Mem implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('facility construction timers', () => {
  it('a facility only works after its construction time', () => {
    const s = fresh();
    expect(buyBuilding(s, 'waste').ok).toBe(true);
    expect(s.buildings.waste).toBe(0);
    expect(s.upgrading.waste).toBeDefined();
    expect(buyBuilding(s, 'waste').ok).toBe(false); // already building
    run(s, 3 * TICKS_PER_WEEK - 1);
    expect(s.buildings.waste).toBe(0);
    run(s, 2);
    expect(s.buildings.waste).toBe(1);
    expect(s.upgrading.waste).toBeUndefined();
  });
});

describe('placement rules', () => {
  it('factories need industrial land; housing is not allowed there', () => {
    const s = fresh();
    const m = liveMap(s);
    const spot = findSpot(s, 'factory');
    expect(zoneAt(m, spot.x, spot.y)).toBe('ind');
    expect(checkPlacement(s, m, 'house', spot.x, spot.y).zone).toBe(false);
    const res = findSpot(s, 'house');
    expect(checkPlacement(s, m, 'factory', res.x, res.y).ok).toBe(false);
  });

  it('rejects occupied land and reports reasons', () => {
    const s = fresh();
    const m = liveMap(s);
    const b = m.buildings.find((x) => x.kind === 'house')!;
    const c = checkPlacement(s, m, 'house', b.x, b.y);
    expect(c.ok).toBe(false);
    expect(c.land).toBe(false);
    expect(c.reasons[0]).toMatch(/empty land/);
  });

  it('bus stops must be beside a main road', () => {
    const s = fresh();
    const spot = findSpot(s, 'busstop');
    const m = liveMap(s);
    const near = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]].some(([dx, dy]) => tileAt(m, spot.x + dx, spot.y + dy) === 'arterial' || tileAt(m, spot.x + dx, spot.y + dy) === 'bridge');
    expect(near).toBe(true);
  });

  it('respects unlock weeks', () => {
    const s = fresh();
    s.tick = 0;
    const m = liveMap(s);
    const c = checkPlacement(s, m, 'bigfactory', 0, 0);
    expect(c.reasons.join()).toMatch(/Unlocks in week 27/);
  });
});

describe('placing buildings', () => {
  it('costs money, builds over time, then changes the simulation', () => {
    const s = fresh();
    const spot = findSpot(s, 'factory');
    const before = { budget: s.res.budget, jobs: s.mapStats.jobs, ind: emissions(s).industry, income: revenueStreams(s).find((l) => l.id === 'industry')!.amount, sites: s.mapStats.constructionSites };
    const r = placeBuilding(s, 'factory', spot.x, spot.y);
    expect(r.ok).toBe(true);
    expect(s.res.budget).toBe(before.budget - PLACEABLE_MAP.factory.cost);
    expect(s.mapStats.constructionSites).toBe(before.sites + 1);
    expect(s.mapStats.jobs).toBe(before.jobs);
    expect(agg(s).emissionMult.dust).toBeGreaterThan(1);
    run(s, PLACEABLE_MAP.factory.weeks * TICKS_PER_WEEK + 1);
    expect(s.cityEdits.placed[0].built).toBe(true);
    expect(s.mapStats.jobs).toBeGreaterThan(before.jobs);
    expect(emissions(s).industry).toBeGreaterThan(before.ind);
    expect(revenueStreams(s).find((l) => l.id === 'industry')!.amount).toBeGreaterThan(before.income);
    expect(s.stats.projectsCompleted).toBeGreaterThanOrEqual(1);
  });

  it('parks add green control and cost upkeep', () => {
    const s = fresh();
    const spot = findSpot(s, 'park');
    placeBuilding(s, 'park', spot.x, spot.y);
    finishAllConstruction(s);
    expect(s.mapStats.parkTiles).toBeGreaterThan(BASE_STATS.parkTiles);
    expect(mapModifier(s).control?.other).toBeGreaterThan(0);
    expect(mapModifier(s).upkeepPerWeek).toBe(PLACEABLE_MAP.park.upkeep);
  });

  it('cannot place on top of a construction site', () => {
    const s = fresh();
    const spot = findSpot(s, 'house');
    expect(placeBuilding(s, 'house', spot.x, spot.y).ok).toBe(true);
    expect(placeBuilding(s, 'house', spot.x, spot.y).ok).toBe(false);
  });
});

describe('demolition and relocation', () => {
  it('demolishing a factory costs compensation, angers the lobby and cuts industrial load', () => {
    const s = fresh();
    const m = liveMap(s);
    const f = m.buildings.find((b) => b.kind === 'factory')!;
    const info = demolitionInfo(s, m, f.id);
    const before = { budget: s.res.budget, pressure: s.res.pressure, load: s.mapStats.industryLoad };
    expect(demolish(s, f.id).ok).toBe(true);
    expect(s.res.budget).toBe(before.budget - info.cost);
    expect(s.res.pressure).toBeGreaterThan(before.pressure);
    expect(s.mapStats.industryLoad).toBeLessThan(before.load);
    expect(tileAt(liveMap(s), f.x, f.y)).toBe('grass');
    expect(s.stats.demolitions).toBe(1);
  });

  it('protects landmarks', () => {
    const s = fresh();
    const m = liveMap(s);
    const g = m.buildings.find((b) => b.kind === 'monument')!;
    expect(demolish(s, g.id).ok).toBe(false);
  });

  it('cancelling construction refunds part of the cost', () => {
    const s = fresh();
    const spot = findSpot(s, 'apartment');
    placeBuilding(s, 'apartment', spot.x, spot.y);
    const m = liveMap(s);
    const site = m.buildings.find((b) => b.progress)!;
    const b0 = s.res.budget;
    expect(demolish(s, site.id).ok).toBe(true);
    expect(s.res.budget).toBe(b0 + Math.round(PLACEABLE_MAP.apartment.cost * CANCEL_REFUND));
    expect(s.cityEdits.placed.length).toBe(0);
  });

  it('relocation moves a factory, keeps the jobs and modernises it', () => {
    const s = fresh();
    const m = liveMap(s);
    const f = m.buildings.find((b) => b.kind === 'factory' && b.w * b.h >= 4)!;
    const load0 = s.mapStats.industryLoad;
    const spot = findSpot(s, 'factory', (_m, x, y) => Math.abs(x - f.x) + Math.abs(y - f.y) > 4);
    expect(placeBuilding(s, 'factory', spot.x, spot.y, f.id).ok).toBe(true);
    expect(s.cityEdits.demolished).toContain(f.id);
    finishAllConstruction(s);
    expect(s.cityEdits.placed[0].modern).toBe(true);
    expect(s.mapStats.industryLoad).toBeLessThan(load0);
  });
});

describe('roads and zoning', () => {
  it('roads must connect, take a week, and then join the network', () => {
    const s = fresh();
    const m = liveMap(s);
    // find a grass tile next to a road, and extend 2 tiles away from it
    let start: [number, number] | null = null;
    let end: [number, number] | null = null;
    outer: for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 3; x++) {
      if (tileAt(m, x - 1, y) === 'street' && tileAt(m, x, y) === 'grass' && tileAt(m, x + 1, y) === 'grass') {
        start = [x, y];
        end = [x + 1, y];
        break outer;
      }
    }
    expect(start).not.toBeNull();
    const c = checkRoad(s, m, start![0], start![1], end![0], end![1]);
    expect(c.ok).toBe(true);
    expect(c.cost).toBe(2 * ROAD.costPerTile);
    expect(buildRoad(s, start![0], start![1], end![0], end![1]).ok).toBe(true);
    expect(tileAt(liveMap(s), start![0], start![1])).toBe('roadwork');
    run(s, ROAD.weeks * TICKS_PER_WEEK + 1);
    const m2 = liveMap(s);
    expect(tileAt(m2, start![0], start![1])).toBe('street');
    expect(roadNeighbours(m2, start![0], start![1]).length).toBeGreaterThan(0);
  });

  it('rejects disconnected or blocked roads', () => {
    const s = fresh();
    const m = liveMap(s);
    const b = m.buildings.find((x) => x.kind === 'apartment')!;
    expect(checkRoad(s, m, b.x, b.y, b.x + 1, b.y).ok).toBe(false);
  });

  it('zoning costs money and changes what can be built', () => {
    const s = fresh();
    const m = liveMap(s);
    const spot = findSpot(s, 'house');
    expect(checkPlacement(s, m, 'factory', spot.x, spot.y).zone).toBe(false);
    const b0 = s.res.budget;
    expect(zoneArea(s, spot.x, spot.y, spot.x + 1, spot.y + 1, 'ind').ok).toBe(true);
    expect(s.res.budget).toBeLessThan(b0);
    expect((b0 - s.res.budget) % ZONING.costPerTile).toBe(0);
    expect(zoneAt(liveMap(s), spot.x, spot.y)).toBe('ind');
    expect(s.cityEdits.zones[String(idx(spot.x, spot.y))]).toBe('ind');
  });
});

describe('persistence of city edits', () => {
  it('round-trips placed buildings, demolitions, roads and zones', () => {
    const st = new Mem();
    const s = fresh();
    const spot = findSpot(s, 'park');
    placeBuilding(s, 'park', spot.x, spot.y);
    const f = liveMap(s).buildings.find((b) => b.kind === 'warehouse')!;
    demolish(s, f.id);
    save(st, s, 1);
    const r = load(st, 1);
    expect(r.status).toBe('loaded');
    expect(r.state.cityEdits.placed.length).toBe(1);
    expect(r.state.cityEdits.demolished).toContain(f.id);
    expect(r.state.mapStats.constructionSites).toBe(s.mapStats.constructionSites);
  });

  it('replaces malformed city edits with an untouched city', () => {
    const st = new Mem();
    const f = JSON.parse(serialize(fresh()));
    f.state.cityEdits = { placed: 'nope' };
    st.setItem(SAVE_KEY, JSON.stringify(f));
    const r = load(st);
    expect(r.state.cityEdits.placed).toEqual([]);
    expect(r.state.mapStats.population).toBe(BASE_STATS.population);
  });
});
