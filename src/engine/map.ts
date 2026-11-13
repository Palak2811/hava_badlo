/**
 * Grid-based city model for Delhi.
 *
 * The city is a COLS×ROWS grid of tiles. Roads, water and parks are tiles; everything else
 * (houses, apartments, factories, offices…) is an entity occupying a rectangle of "lot" tiles.
 * Generation is deterministic (fixed seed) so every player starts in the same Delhi and the
 * layout can be unit-tested. Rendering lives in src/city; this module has no DOM dependency.
 */
import type { BuildingId, CityEdits, MapStats, Zone } from './types';

export const COLS = 64;
export const ROWS = 40;
export const CELL = 40;

export type Tile = 'grass' | 'water' | 'street' | 'arterial' | 'bridge' | 'lot' | 'plot' | 'park' | 'roadwork';
export type Kind =
  | 'house' | 'apartment' | 'shop' | 'market' | 'office' | 'factory' | 'warehouse'
  | 'construction' | 'park' | 'monument' | 'busterminal' | 'school' | 'hospital' | 'forest' | 'parking' | 'busstop';
export type Character = 'industry' | 'commercial' | 'dense' | 'apartments' | 'offices' | 'transport' | 'green' | 'residential';

export interface District {
  id: string;
  name: string;
  x: number; y: number; w: number; h: number;
  character: Character;
  blurb: string;
}

export interface MapBuilding {
  id: number;
  kind: Kind;
  x: number; y: number; w: number; h: number;
  district: string;
  seed: number;
  /** demolished (or relocated away) */
  removed?: boolean;
  /** set for player-placed buildings */
  placedUid?: number;
  /** set while a placed building is still under construction */
  progress?: { started: number; done: number };
  modern?: boolean;
}

/** Anything the player can select on the map. */
export type Pick =
  | { type: 'plot'; id: BuildingId }
  | { type: 'building'; id: number }
  | { type: 'road'; x: number; y: number }
  | { type: 'district'; id: string; x: number; y: number };

export interface Station { x: number; y: number; name: string }

export interface CityMap {
  cols: number;
  rows: number;
  tiles: Tile[];
  owner: Int32Array; // building id per tile, or -1
  districts: District[];
  buildings: MapBuilding[];
  plots: Record<BuildingId, { x: number; y: number; w: number; h: number }>;
  metro: { stations: Station[]; lines: { x1: number; y1: number; x2: number; y2: number }[] };
  busStops: { x: number; y: number }[];
  riverX: number[];
  zones: Record<string, Zone>;
}

export const H_ARTERIALS = [9, 20, 31];
export const V_ARTERIALS = [12, 28, 44];
const BRIDGE_ROWS = [20, 31];

export const DISTRICTS: District[] = [
  { id: 'narela', name: 'Narela Industrial Area', x: 0, y: 0, w: 28, h: 9, character: 'industry', blurb: 'Factories, godowns and diesel generators. Upwind of everything, unfortunately.' },
  { id: 'modeltown', name: 'Model Town', x: 28, y: 0, w: 36, h: 9, character: 'residential', blurb: 'Leafy bungalows and RWA WhatsApp groups with strong opinions.' },
  { id: 'karolbagh', name: 'Karol Bagh', x: 0, y: 9, w: 12, h: 11, character: 'dense', blurb: 'Dense lanes, wedding shopping and parking as a contact sport.' },
  { id: 'cp', name: 'Connaught Place', x: 12, y: 9, w: 16, h: 11, character: 'commercial', blurb: 'The commercial heart. White colonnades, black smoke.' },
  { id: 'centralvista', name: 'Central Vista', x: 28, y: 9, w: 16, h: 11, character: 'green', blurb: 'India Gate, lawns, ministries — and every press conference.' },
  { id: 'mayurvihar', name: 'Mayur Vihar', x: 44, y: 9, w: 20, h: 11, character: 'apartments', blurb: 'Apartment societies along the Yamuna.' },
  { id: 'dwarka', name: 'Dwarka', x: 0, y: 20, w: 12, h: 11, character: 'apartments', blurb: 'Planned sectors of DDA flats. Wide roads, long commutes.' },
  { id: 'lajpat', name: 'Lajpat Nagar', x: 12, y: 20, w: 16, h: 11, character: 'dense', blurb: 'Markets, momos and more scooters than people.' },
  { id: 'nehruplace', name: 'Nehru Place', x: 28, y: 20, w: 16, h: 11, character: 'offices', blurb: 'Office towers, IT markets and permanent construction.' },
  { id: 'anandvihar', name: 'Anand Vihar', x: 44, y: 20, w: 20, h: 11, character: 'transport', blurb: 'Interstate bus terminal. Often Delhi’s worst-reading monitor.' },
  { id: 'okhla', name: 'Okhla Industrial Area', x: 0, y: 31, w: 28, h: 9, character: 'industry', blurb: 'Units, workshops and a landfill with a view.' },
  { id: 'saritavihar', name: 'Sarita Vihar', x: 28, y: 31, w: 36, h: 9, character: 'residential', blurb: 'Quiet colonies near the river, downwind of Okhla.' },
];

/** Facility plots for the eight department facilities (3×2 cells each, with road access). */
export const PLOT_POS: Record<BuildingId, { x: number; y: number }> = {
  monitor: { x: 14, y: 13 },
  pr: { x: 30, y: 16 },
  greenery: { x: 38, y: 16 },
  bus: { x: 47, y: 21 },
  dust: { x: 18, y: 24 },
  waste: { x: 47, y: 35 },
  parali: { x: 16, y: 3 },
  industrial: { x: 5, y: 32 },
};

export const KIND_INFO: Record<Kind, { label: string; residents: number; jobs: number; blurb: string }> = {
  house: { label: 'Houses', residents: 180, jobs: 0, blurb: 'Three-storey family homes with a black water tank on top.' },
  apartment: { label: 'Apartment society', residents: 2400, jobs: 30, blurb: 'Group housing with a guard, a gate and a residents’ association.' },
  shop: { label: 'Shops', residents: 30, jobs: 24, blurb: 'Ground-floor shops: kirana, chemist, mobile recharge.' },
  market: { label: 'Market', residents: 0, jobs: 240, blurb: 'A busy market — great for revenue, terrible for parking.' },
  office: { label: 'Office complex', residents: 0, jobs: 1200, blurb: 'Glass, air-conditioning and a car park that fills by 10 am.' },
  factory: { label: 'Factory', residents: 0, jobs: 800, blurb: 'Manufacturing unit with boilers and a chimney. Jobs and smoke.' },
  warehouse: { label: 'Godown', residents: 0, jobs: 120, blurb: 'Storage and logistics. Trucks in, trucks out, all night.' },
  construction: { label: 'Construction site', residents: 0, jobs: 300, blurb: 'Something is being built. The dust is free.' },
  park: { label: 'Park', residents: 0, jobs: 4, blurb: 'Grass, trees and morning walkers in reflective jackets.' },
  monument: { label: 'India Gate', residents: 0, jobs: 40, blurb: 'War memorial and the city’s favourite evening picnic spot.' },
  busterminal: { label: 'Interstate Bus Terminal', residents: 0, jobs: 600, blurb: 'Buses to every corner of North India. Diesel to every corner of the lungs.' },
  school: { label: 'School', residents: 0, jobs: 160, blurb: 'Closes when AQI crosses 450, reopens when it drops to 449.' },
  forest: { label: 'Urban forest', residents: 0, jobs: 4, blurb: 'Dense native trees planted close together. Birds approve.' },
  parking: { label: 'Parking facility', residents: 0, jobs: 20, blurb: 'Multi-level parking. Earns fees; invites more cars.' },
  busstop: { label: 'Bus stop', residents: 0, jobs: 0, blurb: 'A shelter, a route map and a crowd at 9 am.' },
  hospital: { label: 'Hospital', residents: 0, jobs: 1000, blurb: 'Respiratory OPD queues start at 6 am in winter.' },
};

type Weights = Partial<Record<Kind | 'empty', number>>;
const WEIGHTS: Record<Character, Weights> = {
  industry: { factory: 0.42, warehouse: 0.28, house: 0.12, construction: 0.04, empty: 0.14 },
  commercial: { office: 0.3, market: 0.25, shop: 0.25, apartment: 0.1, empty: 0.1 },
  dense: { house: 0.58, shop: 0.18, market: 0.08, apartment: 0.06, school: 0.02, empty: 0.08 },
  apartments: { apartment: 0.5, house: 0.18, shop: 0.1, park: 0.08, school: 0.03, hospital: 0.01, empty: 0.1 },
  offices: { office: 0.42, shop: 0.18, apartment: 0.15, construction: 0.1, empty: 0.15 },
  transport: { house: 0.38, shop: 0.22, market: 0.12, warehouse: 0.12, apartment: 0.06, empty: 0.1 },
  green: { office: 0.25, park: 0.35, apartment: 0.1, hospital: 0.03, empty: 0.27 },
  residential: { house: 0.5, apartment: 0.18, park: 0.12, shop: 0.08, school: 0.03, empty: 0.09 },
};
const SIZE: Record<Kind, [number, number][]> = {
  house: [[1, 1]], shop: [[1, 1]], apartment: [[2, 2]], market: [[2, 1], [1, 1]], office: [[2, 2], [2, 1]],
  factory: [[3, 2], [2, 2]], warehouse: [[2, 1], [2, 2]], construction: [[2, 2]], park: [[2, 2], [2, 1]],
  monument: [[2, 1]], busterminal: [[4, 2]], school: [[2, 1]], hospital: [[2, 2]], forest: [[3, 3]], parking: [[2, 2]], busstop: [[1, 1]],
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const idx = (x: number, y: number) => y * COLS + x;
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
export const isRoad = (t: Tile | undefined) => t === 'street' || t === 'arterial' || t === 'bridge';

export function generateCity(seed = 1947): CityMap {
  const r = rng(seed);
  const tiles: Tile[] = new Array(COLS * ROWS).fill('grass');
  const owner = new Int32Array(COLS * ROWS).fill(-1);
  const riverX: number[] = [];
  const set = (x: number, y: number, t: Tile) => inBounds(x, y) && (tiles[idx(x, y)] = t);
  const get = (x: number, y: number): Tile | undefined => (inBounds(x, y) ? tiles[idx(x, y)] : undefined);

  // river (Yamuna) along the east edge
  for (let y = 0; y < ROWS; y++) {
    const rx = 57 + Math.round(Math.sin(y / 4.5) * 1.3);
    riverX.push(rx);
    for (let x = rx; x < COLS; x++) set(x, y, 'water');
  }

  // facility plots are reserved first so streets route around them
  const plots = {} as CityMap['plots'];
  const reserved = new Set<number>();
  for (const [id, p] of Object.entries(PLOT_POS) as [BuildingId, { x: number; y: number }][]) {
    plots[id] = { x: p.x, y: p.y, w: 3, h: 2 };
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) reserved.add(idx(p.x + dx, p.y + dy));
  }

  // big Central Vista lawns with India Gate
  const lawn = { x: 33, y: 10, w: 11, h: 5 };
  for (let y = lawn.y; y < lawn.y + lawn.h; y++) for (let x = lawn.x; x < lawn.x + lawn.w; x++) reserved.add(idx(x, y));

  // arterials
  for (const y of H_ARTERIALS) for (let x = 0; x < COLS; x++) {
    if (get(x, y) === 'water') {
      if (BRIDGE_ROWS.includes(y)) set(x, y, 'bridge');
    } else set(x, y, 'arterial');
  }
  for (const x of V_ARTERIALS) for (let y = 0; y < ROWS; y++) if (get(x, y) !== 'water') set(x, y, 'arterial');

  // local streets inside each block (between arterials)
  const bandTops = [0, 10, 21, 32];
  const bandBots = [8, 19, 30, 39];
  const colLefts = [0, 13, 29, 45];
  const colRights = [11, 27, 43, 63];
  for (let b = 0; b < 4; b++) {
    for (let y = bandTops[b] + 2; y < bandBots[b]; y += 3) {
      for (let x = 0; x < COLS; x++) if (get(x, y) === 'grass' && !reserved.has(idx(x, y))) set(x, y, 'street');
    }
  }
  for (let c = 0; c < 4; c++) {
    const xl = colLefts[c], xr = colRights[c];
    const step = c === 0 ? 6 : 7;
    for (let x = xl + 3 + (c % 2); x < xr - 1; x += step) {
      for (let y = 0; y < ROWS; y++) if (get(x, y) === 'grass' && !reserved.has(idx(x, y))) set(x, y, 'street');
    }
  }

  // reserved areas become their final tiles
  for (const p of Object.values(plots)) for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) set(p.x + dx, p.y + dy, 'plot');
  for (let y = lawn.y; y < lawn.y + lawn.h; y++) for (let x = lawn.x; x < lawn.x + lawn.w; x++) set(x, y, 'park');

  const buildings: MapBuilding[] = [];
  const districtAtXY = (x: number, y: number) => DISTRICTS.find((d) => x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h)!;
  const place = (kind: Kind, x: number, y: number, w: number, h: number) => {
    const id = buildings.length;
    buildings.push({ id, kind, x, y, w, h, district: districtAtXY(x, y).id, seed: Math.floor(r() * 1e6) });
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      set(x + dx, y + dy, kind === 'park' ? 'park' : 'lot');
      owner[idx(x + dx, y + dy)] = id;
    }
  };
  const free = (x: number, y: number, w: number, h: number) => {
    const d = districtAtXY(x, y);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      if (get(x + dx, y + dy) !== 'grass') return false;
      if (districtAtXY(x + dx, y + dy) !== d) return false;
    }
    return true;
  };
  const access = (x: number, y: number, w: number, h: number) => roadAccess({ tiles } as CityMap, x, y, w, h);

  // landmarks
  place('monument', 37, 12, 2, 1);
  tiles[idx(37, 12)] = 'lot';
  tiles[idx(38, 12)] = 'lot';
  place('busterminal', 51, 24, 4, 2);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (get(x, y) !== 'grass') continue;
      const d = districtAtXY(x, y);
      const w = WEIGHTS[d.character];
      const frontage = H_ARTERIALS.some((a) => Math.abs(a - y) === 1) || V_ARTERIALS.some((a) => Math.abs(a - x) === 1);
      let roll = r();
      let kind: Kind | 'empty' = 'empty';
      for (const [k, p] of Object.entries(w) as [Kind | 'empty', number][]) {
        roll -= p;
        if (roll <= 0) { kind = k; break; }
      }
      if (frontage && kind === 'house' && r() < 0.45) kind = 'shop';
      if (kind === 'empty') continue;
      for (const [sw, sh] of SIZE[kind]) {
        if (free(x, y, sw, sh) && access(x, y, sw, sh)) {
          place(kind, x, y, sw, sh);
          break;
        }
      }
    }
  }

  // public transport
  const metroDefs: Station[] = [
    { x: 4, y: 20, name: 'Dwarka Mor' }, { x: 12, y: 20, name: 'Karol Bagh' }, { x: 28, y: 20, name: 'Rajiv Chowk' },
    { x: 44, y: 20, name: 'Mandi House' }, { x: 53, y: 20, name: 'Yamuna Bank' }, { x: 28, y: 9, name: 'Kashmere Gate' }, { x: 28, y: 31, name: 'Kalkaji Mandir' },
  ];
  const busStops: { x: number; y: number }[] = [];
  for (const y of H_ARTERIALS) for (let x = 3; x < COLS; x += 9) if (get(x, y) === 'arterial' && !V_ARTERIALS.includes(x)) busStops.push({ x, y });
  for (const x of V_ARTERIALS) for (let y = 4; y < ROWS; y += 9) if (get(x, y) === 'arterial' && !H_ARTERIALS.includes(y)) busStops.push({ x, y });

  return {
    cols: COLS, rows: ROWS, tiles, owner, districts: DISTRICTS, buildings, plots,
    metro: { stations: metroDefs, lines: [{ x1: 0, y1: 20, x2: riverX[20] + 4, y2: 20 }, { x1: 28, y1: 0, x2: 28, y2: ROWS - 1 }] },
    busStops, riverX, zones: {},
  };
}

/** True if any cell directly around the rectangle is a road. */
export function roadAccess(m: { tiles: Tile[] }, x: number, y: number, w: number, h: number) {
  for (let dx = -1; dx <= w; dx++) for (let dy = -1; dy <= h; dy++) {
    const edge = dx === -1 || dx === w || dy === -1 || dy === h;
    const corner = (dx === -1 || dx === w) && (dy === -1 || dy === h);
    if (!edge || corner) continue;
    const xx = x + dx, yy = y + dy;
    if (inBounds(xx, yy) && isRoad(m.tiles[idx(xx, yy)])) return true;
  }
  return false;
}

export const tileAt = (m: CityMap, x: number, y: number) => (inBounds(x, y) ? m.tiles[idx(x, y)] : undefined);
export const districtAt = (m: CityMap, x: number, y: number) => m.districts.find((d) => x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) ?? null;
export const buildingAt = (m: CityMap, x: number, y: number) => {
  if (!inBounds(x, y)) return null;
  const o = m.owner[idx(x, y)];
  return o >= 0 ? m.buildings[o] : null;
};
export function plotAt(m: CityMap, x: number, y: number): BuildingId | null {
  for (const [id, p] of Object.entries(m.plots) as [BuildingId, CityMap['plots'][BuildingId]][]) {
    if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return id;
  }
  return null;
}

/** Road neighbours of a road tile (4-connected). */
export function roadNeighbours(m: CityMap, x: number, y: number) {
  const out: [number, number][] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isRoad(tileAt(m, x + dx, y + dy))) out.push([x + dx, y + dy]);
  return out;
}

export interface AreaStats {
  population: number;
  jobs: number;
  counts: Partial<Record<Kind, number>>;
  roads: number;
  greenTiles: number;
  emptyTiles: number;
}

export function areaStats(m: CityMap, districtId?: string): AreaStats {
  const st: AreaStats = { population: 0, jobs: 0, counts: {}, roads: 0, greenTiles: 0, emptyTiles: 0 };
  for (const b of m.buildings) {
    if (b.removed || b.progress) continue;
    if (districtId && b.district !== districtId) continue;
    const k = KIND_INFO[b.kind];
    const scale = b.w * b.h > 1 && (b.kind === 'house' || b.kind === 'shop') ? b.w * b.h : 1;
    st.population += k.residents * scale;
    st.jobs += k.jobs * scale;
    st.counts[b.kind] = (st.counts[b.kind] ?? 0) + 1;
  }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (districtId && districtAt(m, x, y)?.id !== districtId) continue;
    const t = m.tiles[idx(x, y)];
    if (isRoad(t)) st.roads++;
    else if (t === 'park') st.greenTiles++;
    else if (t === 'grass') st.emptyTiles++;
  }
  return st;
}

/** The one shared Delhi. */
export const CITY = generateCity();

/* ------------------------------------------------------------------ zoning */

const DEFAULT_ZONE: Record<Character, Zone> = {
  industry: 'ind', commercial: 'com', offices: 'com', transport: 'com', dense: 'res', apartments: 'res', residential: 'res', green: 'green',
};
export function zoneAt(m: CityMap, x: number, y: number): Zone | null {
  if (!inBounds(x, y)) return null;
  const z = m.zones[String(idx(x, y))];
  if (z) return z;
  const d = districtAt(m, x, y);
  return d ? DEFAULT_ZONE[d.character] : null;
}

/* ------------------------------------------------------------------ live map = base city + player edits */

export function cloneMap(m: CityMap): CityMap {
  return {
    ...m,
    tiles: m.tiles.slice(),
    owner: m.owner.slice(),
    buildings: m.buildings.map((b) => ({ ...b })),
    zones: { ...m.zones },
  };
}

const PLACED_KIND: Record<string, Kind> = {
  house: 'house', apartment: 'apartment', shop: 'shop', market: 'market', office: 'office', factory: 'factory', bigfactory: 'factory',
  warehouse: 'warehouse', busstop: 'busstop', parking: 'parking', park: 'park', forest: 'forest', school: 'school', hospital: 'hospital',
};

/** Builds the current map from the base city plus every player edit (pure). */
export function buildMap(edits: CityEdits, base: CityMap = CITY): CityMap {
  const m = cloneMap(base);
  for (const id of edits.demolished) {
    const b = m.buildings[id];
    if (!b || b.removed) continue;
    b.removed = true;
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      m.tiles[idx(x, y)] = 'grass';
      m.owner[idx(x, y)] = -1;
    }
  }
  for (const r of edits.roads) m.tiles[r.i] = r.built ? 'street' : 'roadwork';
  for (const p of edits.placed) {
    const id = m.buildings.length;
    const kind = PLACED_KIND[p.kind];
    m.buildings.push({
      id, kind, x: p.x, y: p.y, w: p.w, h: p.h, district: districtAt(m, p.x, p.y)?.id ?? 'cp', seed: p.uid * 7919 + 13,
      placedUid: p.uid, progress: p.built ? undefined : { started: p.started, done: p.done }, modern: p.modern,
    });
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      m.tiles[idx(x, y)] = p.built && (kind === 'park' || kind === 'forest') ? 'park' : 'lot';
      m.owner[idx(x, y)] = id;
    }
  }
  m.zones = { ...edits.zones };
  return m;
}

/** Aggregate numbers the simulation needs from the map. */
export function computeMapStats(m: CityMap, upkeepOf: (b: MapBuilding) => number = () => 0): MapStats {
  const s: MapStats = { population: 0, jobs: 0, industryLoad: 0, commercialTiles: 0, constructionSites: 0, parkTiles: 0, hospitals: 0, schools: 0, parkingTiles: 0, busStops: m.busStops.length, upkeep: 0, retailJobs: 0, arterialTiles: 0, streetTiles: 0, metroStations: m.metro.stations.length };
  for (const b of m.buildings) {
    if (b.removed) continue;
    if (b.progress) {
      s.constructionSites++;
      continue;
    }
    const k = KIND_INFO[b.kind];
    const area = b.w * b.h;
    const scale = b.kind === 'house' || b.kind === 'shop' ? area : 1;
    s.population += k.residents * scale;
    s.jobs += k.jobs * scale;
    s.upkeep += upkeepOf(b);
    switch (b.kind) {
      case 'factory': s.industryLoad += area * (b.modern ? 0.5 : 1); break;
      case 'warehouse': s.industryLoad += area * 0.3; break;
      case 'construction': s.constructionSites++; break;
      case 'shop': case 'market': s.commercialTiles += area; s.retailJobs += k.jobs * scale; break;
      case 'office': s.commercialTiles += area; break;
      case 'park': case 'forest': s.parkTiles += area * (b.kind === 'forest' ? 2 : 1); break;
      case 'hospital': s.hospitals++; break;
      case 'school': s.schools++; break;
      case 'parking': s.parkingTiles += area; break;
      case 'busstop': s.busStops++; break;
    }
  }
  for (const t of m.tiles) {
    if (t === 'roadwork') s.constructionSites += 0.1;
    else if (t === 'arterial' || t === 'bridge') s.arterialTiles++;
    else if (t === 'street') s.streetTiles++;
  }
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === 'park' && m.owner[i] < 0) s.parkTiles++;
  return s;
}

export const BASE_STATS = computeMapStats(CITY);
