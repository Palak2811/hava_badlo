import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/config/balance';
import {
  CITY, COLS, ROWS, DISTRICTS, areaStats, buildingAt, districtAt, generateCity, idx, isRoad, plotAt, roadAccess, roadNeighbours,
} from '../src/engine/map';

describe('city map', () => {
  it('is deterministic', () => {
    const a = generateCity();
    const b = generateCity();
    expect(a.tiles).toEqual(b.tiles);
    expect(a.buildings.length).toBe(b.buildings.length);
  });

  it('has a dense existing city', () => {
    expect(CITY.buildings.length).toBeGreaterThan(250);
    const kinds = new Set(CITY.buildings.map((b) => b.kind));
    for (const k of ['house', 'apartment', 'shop', 'market', 'office', 'factory', 'warehouse', 'construction', 'park', 'monument', 'busterminal']) {
      expect(kinds.has(k as never)).toBe(true);
    }
  });

  it('every building is on the map, owns its tiles, and nothing overlaps', () => {
    const seen = new Set<number>();
    for (const b of CITY.buildings) {
      if (b.removed) continue; // cleared to make room for a landmark
      expect(b.x + b.w).toBeLessThanOrEqual(COLS);
      expect(b.y + b.h).toBeLessThanOrEqual(ROWS);
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
        expect(seen.has(idx(x, y))).toBe(false);
        seen.add(idx(x, y));
        expect(buildingAt(CITY, x, y)?.id).toBe(b.id);
      }
    }
  });

  it('every building (except lawns and the memorial) has road access', () => {
    for (const b of CITY.buildings) {
      if (b.removed || b.kind === 'park' || b.kind === 'monument') continue;
      expect(roadAccess(CITY, b.x, b.y, b.w, b.h)).toBe(true);
    }
  });

  it('all eight facility plots exist, are free of buildings and touch a road', () => {
    for (const def of BUILDINGS) {
      const p = CITY.plots[def.id];
      expect(p).toBeDefined();
      expect(roadAccess(CITY, p.x, p.y, p.w, p.h)).toBe(true);
      expect(plotAt(CITY, p.x + 1, p.y + 1)).toBe(def.id);
      expect(buildingAt(CITY, p.x, p.y)).toBeNull();
    }
  });

  it('the road network is fully connected', () => {
    const roads: number[] = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isRoad(CITY.tiles[idx(x, y)])) roads.push(idx(x, y));
    const start = roads[0];
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const c = q.pop()!;
      for (const [nx, ny] of roadNeighbours(CITY, c % COLS, Math.floor(c / COLS))) {
        const k = idx(nx, ny);
        if (!seen.has(k)) { seen.add(k); q.push(k); }
      }
    }
    expect(seen.size).toBe(roads.length);
  });

  it('every neighbourhood has people or jobs, and the river has bridges', () => {
    for (const d of DISTRICTS) {
      const st = areaStats(CITY, d.id);
      expect(st.population + st.jobs).toBeGreaterThan(0);
    }
    expect(CITY.tiles.filter((t) => t === 'bridge').length).toBeGreaterThan(0);
    const all = areaStats(CITY);
    expect(all.population).toBeGreaterThan(100000);
    expect(all.jobs).toBeGreaterThan(50000);
  });

  it('looks up neighbourhoods by tile', () => {
    expect(districtAt(CITY, 30, 12)?.id).toBe('centralvista');
    expect(districtAt(CITY, 2, 35)?.id).toBe('okhla');
  });
});
