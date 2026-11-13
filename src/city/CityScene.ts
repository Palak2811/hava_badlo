import Phaser from 'phaser';
import { BUILDINGS } from '../config/balance';
import { actualAqi, dayOf, seasonOf, timeOfDay } from '../engine/core';
import type { BuildingId, GameState } from '../engine/types';

/**
 * Top-down, flat, minimalist Delhi neighbourhood (Mini Motorways-inspired visual language).
 * The world is authored in a 1600×1000 coordinate space and scaled to cover the canvas;
 * when the canvas is narrower than the world (phones), the player can drag to pan.
 */
export interface CityBridge {
  getState: () => GameState;
  getSelected: () => BuildingId | null;
  onSelect: (id: BuildingId | null) => void;
  animations: () => boolean;
}

const WW = 1600;
const WH = 1000;
const ROAD = 34;
const H_ROADS = [140, 480, 860];
const V_ROADS = [360, 800, 1240];
const RIVER_X = 1505;
const METRO_Y = 418;
const STATION_X = 1020;

type Rect = { x: number; y: number; w: number; h: number };
type Zone = 'res' | 'market' | 'park' | 'industry' | 'res-low';

/** Facility plots (centre points). */
export const PLOTS: { id: BuildingId; x: number; y: number }[] = [
  { id: 'monitor', x: 180, y: 262 },
  { id: 'pr', x: 580, y: 262 },
  { id: 'greenery', x: 1020, y: 262 },
  { id: 'bus', x: 1372, y: 262 },
  { id: 'dust', x: 180, y: 588 },
  { id: 'waste', x: 580, y: 588 },
  { id: 'parali', x: 1020, y: 588 },
  { id: 'industrial', x: 1372, y: 588 },
];
const PW = 128;
const PH = 92;

const BLOCKS: { r: Rect; zone: Zone }[] = [];
{
  const xs = [0, ...V_ROADS, RIVER_X];
  const ys = [0, ...H_ROADS, WH];
  const zoneMap: Zone[][] = [
    ['res-low', 'res-low', 'res-low', 'res-low'],
    ['res', 'market', 'park', 'res'],
    ['res', 'res', 'market', 'industry'],
    ['res-low', 'res-low', 'res-low', 'industry'],
  ];
  for (let r = 0; r < ys.length - 1; r++)
    for (let c = 0; c < xs.length - 1; c++) {
      const x0 = xs[c] + (c ? ROAD / 2 : 0) + 10;
      const x1 = xs[c + 1] - (c < xs.length - 2 ? ROAD / 2 : 0) - 10;
      const y0 = ys[r] + (r ? ROAD / 2 : 0) + 10;
      const y1 = ys[r + 1] - (r < ys.length - 2 ? ROAD / 2 : 0) - 10;
      BLOCKS.push({ r: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, zone: zoneMap[r][c] });
    }
}

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(c1: number, c2: number, t: number) {
  const r = lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t);
  const g = lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t);
  const b = lerp(c1 & 255, c2 & 255, t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
const hex = (s: string) => parseInt(s.replace('#', ''), 16);
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Palette; `haze` 0 = clean & saturated, 1 = smoggy & desaturated. */
function palette(haze: number) {
  const grey = 0xb9b4a6;
  const d = (c: number, k = 0.55) => mix(c, grey, haze * k);
  return {
    land: d(0xf1ecdf, 0.35),
    grass: d(0xb7dd8f),
    park: d(0x9fd27a),
    tree: d(0x5fae5a),
    treeDark: d(0x4b9449),
    road: mix(0x40454f, 0x55575c, haze * 0.4),
    lane: 0xf4f1e8,
    water: d(0x8fcbe8),
    houses: [0xe08b6d, 0xf2d7b0, 0xf5b971, 0xe9a3a0, 0xa9cbb7, 0xd9c7ee, 0xf7e3a1].map((c) => d(c)),
    shops: [0x6aa9e0, 0xf2c14e, 0xf08a4b, 0x7cc6c0].map((c) => d(c)),
    industry: [0xa8a29a, 0x9ca3af, 0xb6aea0].map((c) => d(c, 0.3)),
    tank: 0x2b2b2b,
    metro: d(0x9b6bd6),
    pillar: d(0xcfc6e6),
  };
}

interface Vehicle { obj: Phaser.GameObjects.Container; vx: number; vy: number }

export class CityScene extends Phaser.Scene {
  private bridge!: CityBridge;
  private world!: Phaser.GameObjects.Container;
  private base!: Phaser.GameObjects.Graphics;
  private trees!: Phaser.GameObjects.Graphics;
  private plotLayer!: Phaser.GameObjects.Container;
  private traffic!: Phaser.GameObjects.Container;
  private train!: Phaser.GameObjects.Container;
  private selRing!: Phaser.GameObjects.Graphics;
  private haze!: Phaser.GameObjects.Rectangle;
  private night!: Phaser.GameObjects.Rectangle;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smog!: Phaser.GameObjects.Particles.ParticleEmitter;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private vehicles: Vehicle[] = [];
  private walkers: { obj: Phaser.GameObjects.Arc; vx: number; vy: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  private zoom = 1;
  private bucket = -1;
  private levelsKey = '';
  private hazeT = 0;
  private drag: { x: number; y: number; wx: number; wy: number; moved: boolean } | null = null;

  constructor() {
    super('city');
  }

  init(data: { bridge: CityBridge }) {
    this.bridge = data.bridge;
  }

  create() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    for (let r = 16; r > 0; r -= 2) {
      g.fillStyle(0xffffff, 0.09);
      g.fillCircle(16, 16, r);
    }
    g.generateTexture('puff', 32, 32);
    g.clear();
    g.fillStyle(0xcfe8ff, 1);
    g.fillRect(0, 0, 2, 9);
    g.generateTexture('drop', 2, 9);
    g.destroy();

    this.world = this.add.container(0, 0);
    this.base = this.add.graphics();
    this.trees = this.add.graphics();
    this.traffic = this.add.container(0, 0);
    this.train = this.add.container(0, 0);
    this.plotLayer = this.add.container(0, 0);
    this.selRing = this.add.graphics();
    this.smoke = this.add.particles(0, 0, 'puff', { lifespan: 4200, speedX: { min: 6, max: 22 }, speedY: { min: -26, max: -10 }, scale: { start: 0.5, end: 2.4 }, alpha: { start: 0.45, end: 0 }, tint: 0x7a7670, frequency: 240 });
    this.world.add([this.base, this.trees, this.traffic, this.train, this.plotLayer, this.selRing, this.smoke]);

    this.haze = this.add.rectangle(0, 0, 10, 10, 0xa59c87, 0).setOrigin(0);
    this.smog = this.add.particles(0, 0, 'puff', { lifespan: 10000, speedX: { min: -6, max: 10 }, speedY: { min: -3, max: 3 }, scale: { start: 3, end: 6 }, alpha: { start: 0.35, end: 0 }, tint: 0xb3a88f, frequency: 160 });
    this.rain = this.add.particles(0, 0, 'drop', { lifespan: 900, speedY: { min: 520, max: 650 }, speedX: -40, alpha: 0.5, frequency: 10, quantity: 2, emitting: false });
    this.night = this.add.rectangle(0, 0, 10, 10, 0x101a3d, 0).setOrigin(0);

    this.setupInput();
    this.scale.on('resize', () => this.fit());
    this.fit();
    this.spawnWalkers();
    for (let i = 0; i < 18; i++) this.spawnVehicle(this.bridge.getState(), true);
  }

  /* ------------------------------------------------------------ framing & input */

  private fit() {
    const W = this.scale.width, H = this.scale.height;
    this.zoom = Math.max(W / WW, H / WH);
    this.world.setScale(this.zoom);
    this.world.setPosition((W - WW * this.zoom) / 2, (H - WH * this.zoom) / 2);
    this.haze.setSize(W, H);
    this.night.setSize(W, H);
    this.smog.clearEmitZones?.();
    this.smog.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(-100, 0, W + 100, H), quantity: 1 } as never);
    this.rain.clearEmitZones?.();
    this.rain.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(-40, -20, W + 80, 10), quantity: 1 } as never);
  }

  private clampWorld() {
    const W = this.scale.width, H = this.scale.height;
    const minX = W - WW * this.zoom, minY = H - WH * this.zoom;
    this.world.x = Phaser.Math.Clamp(this.world.x, Math.min(0, minX), Math.max(0, minX));
    this.world.y = Phaser.Math.Clamp(this.world.y, Math.min(0, minY), Math.max(0, minY));
  }

  private setupInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.drag = { x: p.x, y: p.y, wx: this.world.x, wy: this.world.y, moved: false };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag || !p.isDown) return;
      const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) this.drag.moved = true;
      if (this.drag.moved) {
        this.world.x = this.drag.wx + dx;
        this.world.y = this.drag.wy + dy;
        this.clampWorld();
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const moved = this.drag?.moved ?? false;
      this.drag = null;
      if (moved) return;
      const wx = (p.x - this.world.x) / this.zoom;
      const wy = (p.y - this.world.y) / this.zoom;
      const hit = PLOTS.find((q) => Math.abs(wx - q.x) <= PW / 2 + 6 && Math.abs(wy - q.y) <= PH / 2 + 6);
      this.bridge.onSelect(hit ? hit.id : null);
    });
  }

  /* ------------------------------------------------------------ static map */

  private reserved(): Rect[] {
    const r: Rect[] = PLOTS.map((p) => ({ x: p.x - PW / 2 - 14, y: p.y - PH / 2 - 14, w: PW + 28, h: PH + 40 }));
    r.push({ x: 0, y: METRO_Y - 22, w: RIVER_X, h: 44 }); // metro corridor
    r.push({ x: 560, y: 700, w: 210, h: 130 }); // construction site
    return r;
  }

  private drawMap(haze: number) {
    const p = palette(haze);
    const g = this.base;
    g.clear();
    g.fillStyle(p.land, 1);
    g.fillRect(-400, -400, WW + 800, WH + 800);

    // river (Yamuna-ish) on the east
    g.fillStyle(p.water, 1);
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let y = -50; y <= WH + 50; y += 50) pts.push({ x: RIVER_X + 30 + Math.sin(y / 140) * 18, y });
    pts.push({ x: WW + 400, y: WH + 50 }, { x: WW + 400, y: -50 });
    g.fillPoints(pts, true);
    g.fillStyle(p.grass, 1);
    for (let y = 0; y < WH; y += 50) g.fillCircle(RIVER_X + 18 + Math.sin(y / 140) * 18, y, 14);

    // block grounds
    for (const b of BLOCKS) {
      const col = b.zone === 'park' ? p.park : b.zone === 'industry' ? mix(p.land, 0xd6d0c4, 0.6) : mix(p.land, p.grass, 0.18);
      g.fillStyle(col, 1);
      g.fillRoundedRect(b.r.x, b.r.y, b.r.w, b.r.h, 18);
    }

    // roads
    g.fillStyle(p.road, 1);
    for (const y of H_ROADS) g.fillRect(-400, y - ROAD / 2, RIVER_X + 400, ROAD);
    for (const x of V_ROADS) g.fillRect(x - ROAD / 2, -400, ROAD, WH + 800);
    // bridge over the river
    g.fillRect(RIVER_X - 10, H_ROADS[1] - ROAD / 2, WW + 400 - RIVER_X, ROAD);
    g.fillStyle(p.lane, 0.55);
    for (const y of H_ROADS) for (let x = -400; x < WW + 400; x += 34) if (!V_ROADS.some((v) => Math.abs(v - x) < ROAD)) g.fillRect(x, y - 1, 16, 2);
    for (const x of V_ROADS) for (let y = -400; y < WH + 400; y += 34) if (!H_ROADS.some((h) => Math.abs(h - y) < ROAD)) g.fillRect(x - 1, y, 2, 16);
    // zebra crossings
    g.fillStyle(p.lane, 0.8);
    for (const x of V_ROADS) for (const y of H_ROADS) for (let k = -12; k <= 12; k += 6) {
      g.fillRect(x + k - 2, y - ROAD / 2 - 12, 3, 9);
      g.fillRect(x + k - 2, y + ROAD / 2 + 3, 3, 9);
    }

    // buildings per zone
    const res = this.reserved();
    let seed = 1;
    for (const b of BLOCKS) {
      if (b.zone === 'park') continue;
      const step = b.zone === 'industry' ? 88 : b.zone === 'market' ? 58 : 50;
      for (let y = b.r.y + 10; y + 30 < b.r.y + b.r.h; y += step) {
        for (let x = b.r.x + 10; x + 30 < b.r.x + b.r.w; x += step) {
          seed++;
          const rnd = hash(seed);
          if (b.zone === 'res-low' && rnd < 0.35) continue;
          const w = b.zone === 'industry' ? 70 : b.zone === 'market' ? 48 : 30 + Math.floor(hash(seed * 3) * 10);
          const h = b.zone === 'industry' ? 56 : b.zone === 'market' ? 30 : 30 + Math.floor(hash(seed * 7) * 8);
          const r = { x, y, w, h };
          if (r.x + r.w > b.r.x + b.r.w - 6 || r.y + r.h > b.r.y + b.r.h - 6) continue;
          if (res.some((q) => overlaps(q, r))) continue;
          this.drawBuilding(g, p, b.zone, r, rnd);
        }
      }
    }

    // central park with India Gate & a pond
    const park = BLOCKS.find((b) => b.zone === 'park')!.r;
    g.fillStyle(mix(p.park, 0xffffff, 0.2), 1);
    g.fillRoundedRect(park.x + 18, park.y + park.h / 2 - 9 + 70, park.w - 36, 18, 9); // path
    const ix = park.x + park.w - 70, iy = park.y + 60;
    g.fillStyle(0xd9a27a, 1);
    g.fillRoundedRect(ix - 26, iy - 12, 52, 24, 4);
    g.fillStyle(mix(p.park, 0x000000, 0.08), 1);
    g.fillRect(ix - 8, iy - 12, 16, 24);
    g.fillStyle(0xc68b63, 1);
    g.fillRect(ix - 26, iy - 12, 52, 5);
    g.fillStyle(p.water, 1);
    g.fillEllipse(park.x + 70, park.y + 70, 80, 44);

    // construction site
    g.lineStyle(3, 0xf2a541, 1);
    g.strokeRoundedRect(570, 712, 190, 110, 10);
    g.fillStyle(0xe8d3a8, 1);
    g.fillRoundedRect(574, 716, 182, 102, 8);
    g.fillStyle(0xcfb27c, 1);
    g.fillCircle(620, 770, 22);
    g.fillCircle(650, 790, 14);
    g.fillStyle(0xf2a541, 1);
    g.fillRect(690, 730, 8, 80);
    g.fillRect(650, 730, 100, 6);
    g.fillStyle(0x40454f, 1);
    g.fillRect(740, 736, 3, 30);

    // metro viaduct + station
    g.fillStyle(p.pillar, 1);
    for (let x = 20; x < RIVER_X; x += 90) g.fillCircle(x, METRO_Y, 6);
    g.fillStyle(p.metro, 1);
    g.fillRoundedRect(-400, METRO_Y - 5, RIVER_X + 410, 10, 5);
    g.fillStyle(mix(p.metro, 0xffffff, 0.75), 1);
    g.fillRoundedRect(STATION_X - 70, METRO_Y - 20, 140, 40, 12);
    g.fillStyle(p.metro, 1);
    g.fillCircle(STATION_X, METRO_Y, 11);
    g.fillStyle(0xffffff, 1);
    g.fillRect(STATION_X - 5, METRO_Y - 5, 3, 10);
    g.fillRect(STATION_X + 2, METRO_Y - 5, 3, 10);
    g.fillRect(STATION_X - 5, METRO_Y - 5, 10, 3);

    this.smoke.setPosition(0, 0);
    this.smoke.clearEmitZones?.();
    this.smoke.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(1290, 720, 160, 230), quantity: 1 } as never);
  }

  private drawBuilding(g: Phaser.GameObjects.Graphics, p: ReturnType<typeof palette>, zone: Zone, r: Rect, rnd: number) {
    g.fillStyle(0x000000, 0.08);
    g.fillRoundedRect(r.x + 3, r.y + 4, r.w, r.h, 6);
    if (zone === 'industry') {
      g.fillStyle(p.industry[Math.floor(rnd * 3)], 1);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 6);
      g.fillStyle(0x000000, 0.08);
      for (let k = 1; k < 4; k++) g.fillRect(r.x + (r.w * k) / 4 - 1, r.y + 4, 2, r.h - 8);
      g.fillStyle(0x7b7b7b, 1);
      g.fillCircle(r.x + r.w - 12, r.y + 12, 7);
      g.fillStyle(0x4a4a4a, 1);
      g.fillCircle(r.x + r.w - 12, r.y + 12, 4);
      return;
    }
    if (zone === 'market') {
      g.fillStyle(p.shops[Math.floor(rnd * 4)], 1);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 6);
      g.fillStyle(0xffffff, 0.55);
      for (let k = 0; k < r.w; k += 8) g.fillRect(r.x + k, r.y + r.h - 7, 4, 7); // awning
      return;
    }
    g.fillStyle(p.houses[Math.floor(rnd * p.houses.length)], 1);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, 6);
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(r.x + 3, r.y + 3, r.w - 6, 4, 2);
    if (rnd > 0.25) {
      // the iconic black rooftop water tank
      g.fillStyle(p.tank, 1);
      g.fillCircle(r.x + r.w - 9, r.y + 10, 5);
    }
    if (rnd > 0.7) {
      g.fillStyle(0xffffff, 0.6);
      g.fillRect(r.x + 5, r.y + r.h - 9, r.w * 0.4, 2); // clothesline
    }
  }

  private drawTrees(s: GameState, haze: number) {
    const p = palette(haze);
    const g = this.trees;
    g.clear();
    const green = s.buildings.greenery;
    // roadside trees: more with greenery level
    const density = 0.28 + green * 0.2 + (1 - haze) * 0.1;
    let k = 0;
    for (const y of H_ROADS) for (let x = 30; x < RIVER_X - 20; x += 46) {
      k++;
      if (V_ROADS.some((v) => Math.abs(v - x) < 50) || hash(k) > density) continue;
      for (const side of [-1, 1]) {
        const ty = y + side * (ROAD / 2 + 10);
        const r = this.reserved();
        if (r.some((q) => overlaps(q, { x: x - 8, y: ty - 8, w: 16, h: 16 }))) continue;
        g.fillStyle(p.treeDark, 1);
        g.fillCircle(x + 1, ty + 2, 8);
        g.fillStyle(p.tree, 1);
        g.fillCircle(x, ty, 8);
      }
    }
    // park canopy
    const park = BLOCKS.find((b) => b.zone === 'park')!.r;
    const n = 14 + green * 10;
    for (let i = 0; i < n; i++) {
      const x = park.x + 20 + hash(i * 11) * (park.w - 40), y = park.y + 20 + hash(i * 17) * (park.h - 40);
      if (Math.abs(x - 1020) < 80 && Math.abs(y - 262) < 70) continue;
      if (Math.abs(y - METRO_Y) < 26) continue;
      const rr = 9 + hash(i) * 7;
      g.fillStyle(p.treeDark, 1);
      g.fillCircle(x + 2, y + 2, rr);
      g.fillStyle(p.tree, 1);
      g.fillCircle(x, y, rr);
    }
  }

  /* ------------------------------------------------------------ facilities */

  private drawPlots(s: GameState, changed: BuildingId[]) {
    this.plotLayer.removeAll(true);
    for (const plot of PLOTS) {
      const def = BUILDINGS.find((b) => b.id === plot.id)!;
      const lvl = s.buildings[plot.id];
      const c = this.add.container(plot.x, plot.y);
      const g = this.add.graphics();
      if (lvl === 0) {
        g.fillStyle(0xffffff, 0.45);
        g.fillRoundedRect(-PW / 2, -PH / 2, PW, PH, 16);
        g.lineStyle(2, 0x1b2a5c, 0.35);
        for (let x = -PW / 2 + 10; x < PW / 2 - 10; x += 14) {
          g.lineBetween(x, -PH / 2, x + 7, -PH / 2);
          g.lineBetween(x, PH / 2, x + 7, PH / 2);
        }
        for (let y = -PH / 2 + 10; y < PH / 2 - 10; y += 14) {
          g.lineBetween(-PW / 2, y, -PW / 2, y + 7);
          g.lineBetween(PW / 2, y, PW / 2, y + 7);
        }
        g.fillStyle(0x1b2a5c, 1);
        g.fillCircle(0, -6, 15);
        g.fillStyle(0xffffff, 1);
        g.fillRect(-7, -7, 14, 3);
        g.fillRect(-1.5, -13, 3, 14);
        c.add(g);
        c.add(this.add.text(0, 22, def.short.toUpperCase(), { fontFamily: 'Inter, sans-serif', fontSize: '11px', fontStyle: '700', color: '#1b2a5c' }).setOrigin(0.5).setAlpha(0.75));
      } else {
        const col = hex(def.color);
        g.fillStyle(0x000000, 0.12);
        g.fillRoundedRect(-PW / 2 + 5, -PH / 2 + 7, PW, PH, 16);
        g.fillStyle(col, 1);
        g.fillRoundedRect(-PW / 2, -PH / 2, PW, PH, 16);
        g.fillStyle(0xffffff, 0.18);
        g.fillRoundedRect(-PW / 2 + 8, -PH / 2 + 8, PW - 16, 10, 5);
        // roof modules grow with level
        g.fillStyle(mix(col, 0xffffff, 0.3), 1);
        for (let i = 0; i < lvl; i++) g.fillRoundedRect(-PW / 2 + 12 + i * 26, PH / 2 - 26, 20, 14, 4);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(0, -8, 19);
        c.add(g);
        c.add(this.add.text(0, -8, def.icon, { fontSize: '20px' }).setOrigin(0.5));
        this.decorate(c, plot.id, lvl);
        if (changed.includes(plot.id) && this.bridge.animations()) {
          c.setScale(0.4);
          this.tweens.add({ targets: c, scale: 1, duration: 520, ease: 'Back.easeOut' });
          const ring = this.add.circle(plot.x, plot.y, 30, 0xffffff, 0).setStrokeStyle(4, col, 1);
          this.world.add(ring);
          this.tweens.add({ targets: ring, radius: 110, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
        }
      }
      const zone = this.add.zone(0, 0, PW + 10, PH + 10).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.05, duration: 140 }));
      zone.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 140 }));
      c.add(zone);
      this.plotLayer.add(c);
    }
  }

  private decorate(c: Phaser.GameObjects.Container, id: BuildingId, lvl: number) {
    const g = this.add.graphics();
    if (id === 'monitor') {
      g.lineStyle(2, 0xffffff, 0.9);
      g.lineBetween(PW / 2 - 18, -PH / 2 + 10, PW / 2 - 18, -PH / 2 - 10);
      g.fillStyle(0xf43f5e, 1);
      g.fillCircle(PW / 2 - 18, -PH / 2 - 10, 4);
      const pulse = this.add.circle(PW / 2 - 18, -PH / 2 - 10, 6, 0xf43f5e, 0.4);
      this.tweens.add({ targets: pulse, scale: 3, alpha: 0, duration: 1600, repeat: -1 });
      c.add(pulse);
    }
    if (id === 'bus') {
      for (let i = 0; i < lvl + 1; i++) {
        g.fillStyle(0x16a34a, 1);
        g.fillRoundedRect(-PW / 2 - 10 + i * 30, PH / 2 + 6, 26, 10, 3);
        g.fillStyle(0x93c5fd, 1);
        g.fillRect(-PW / 2 - 6 + i * 30, PH / 2 + 8, 18, 3);
      }
    }
    if (id === 'greenery') {
      for (let i = 0; i < 3 + lvl * 2; i++) {
        g.fillStyle(0x4b9449, 1);
        g.fillCircle(-PW / 2 - 6 + (i % 4) * 46, i < 4 ? -PH / 2 - 8 : PH / 2 + 8, 9);
      }
    }
    if (id === 'waste') {
      g.fillStyle(0x0f766e, 1);
      for (let i = 0; i < lvl + 1; i++) g.fillRoundedRect(PW / 2 + 4, -PH / 2 + 8 + i * 18, 14, 14, 3);
    }
    if (id === 'parali') {
      g.fillStyle(0xe9c46a, 1);
      for (let i = 0; i < 3; i++) g.fillRoundedRect(-PW / 2 + 8 + i * 40, PH / 2 + 6, 32, 10, 5);
    }
    c.add(g);
  }

  /* ------------------------------------------------------------ life */

  private spawnVehicle(s: GameState, anywhere = false) {
    const horizontal = Math.random() < 0.6;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const busShare = 0.08 + s.buildings.bus * 0.1;
    const r = Math.random();
    const kind = r < busShare ? 'ebus' : r < busShare + 0.08 ? 'dtc' : r < 0.45 ? 'car' : r < 0.65 ? 'auto' : r < 0.85 ? 'scooter' : 'truck';
    const len = { ebus: 34, dtc: 34, car: 18, auto: 12, scooter: 8, truck: 28 }[kind];
    const wid = { ebus: 12, dtc: 12, car: 10, auto: 9, scooter: 5, truck: 12 }[kind];
    const color = { ebus: 0x22a35a, dtc: 0xd94b3d, car: [0xffffff, 0x2f6fd6, 0xe0483e, 0x334155, 0xf4c84a][Math.floor(Math.random() * 5)], auto: 0x2f9e44, scooter: [0x111827, 0xef4444, 0x3b82f6][Math.floor(Math.random() * 3)], truck: 0xe8a33d }[kind];
    const v = this.add.container(0, 0);
    const body = this.add.rectangle(0, 0, len, wid, color).setStrokeStyle(1, 0x000000, 0.15);
    v.add(this.add.rectangle(2, 2, len, wid, 0x000000, 0.12));
    v.add(body);
    if (kind === 'auto') v.add(this.add.rectangle(-1, 0, 6, wid, 0xf6d32d));
    if (kind === 'ebus') v.add(this.add.rectangle(0, 0, len - 6, 3, 0x93c5fd));
    if (kind === 'dtc') v.add(this.add.rectangle(0, 0, len - 6, 3, 0xffe4b5));
    if (kind === 'car') v.add(this.add.rectangle(dir * 2, 0, len * 0.4, wid - 4, 0x1e293b, 0.55));
    const speed = (kind === 'scooter' ? 95 : kind === 'auto' ? 70 : kind === 'ebus' || kind === 'dtc' || kind === 'truck' ? 50 : 80) * (0.85 + Math.random() * 0.3);
    if (horizontal) {
      const y = H_ROADS[Math.floor(Math.random() * 3)] + dir * 8;
      v.setPosition(anywhere ? Math.random() * RIVER_X : dir > 0 ? -60 : WW + 60, y);
      this.vehicles.push({ obj: v, vx: speed * dir, vy: 0 });
    } else {
      const x = V_ROADS[Math.floor(Math.random() * 3)] - dir * 8;
      v.setPosition(x, anywhere ? Math.random() * WH : dir > 0 ? -60 : WH + 60).setAngle(90);
      this.vehicles.push({ obj: v, vx: 0, vy: speed * dir });
    }
    this.traffic.add(v);
  }

  private spawnWalkers() {
    const cols = [0xf97316, 0x0ea5e9, 0xe11d48, 0xfacc15, 0x8b5cf6, 0x10b981];
    for (let i = 0; i < 26; i++) {
      const y = H_ROADS[i % 3] + (i % 2 ? 1 : -1) * (ROAD / 2 + 4);
      const dot = this.add.circle(hash(i * 5) * RIVER_X, y, 3, cols[i % cols.length]);
      this.traffic.add(dot);
      this.walkers.push({ obj: dot, vx: (hash(i) < 0.5 ? -1 : 1) * (8 + hash(i * 3) * 10), vy: 0, x0: 0, x1: RIVER_X - 10, y0: y, y1: y });
    }
  }

  private buildTrain() {
    this.train.removeAll(true);
    for (let i = 0; i < 4; i++) {
      this.train.add(this.add.rectangle(i * 40, 0, 37, 14, 0xf5f3ff).setStrokeStyle(2, 0x9b6bd6));
      this.train.add(this.add.rectangle(i * 40, 0, 28, 3, 0x9b6bd6));
    }
    this.train.setPosition(-200, METRO_Y);
  }

  update(_t: number, delta: number) {
    const s = this.bridge.getState();
    const dt = Math.min(0.1, delta / 1000);
    const anim = this.bridge.animations();
    const aqi = actualAqi(s);
    const haze = Phaser.Math.Clamp((aqi - 90) / 330, 0, 1);

    const b = Math.round(haze * 8);
    if (b !== this.bucket) {
      this.bucket = b;
      this.drawMap(haze);
      this.drawTrees(s, haze);
      if (!this.train.length) this.buildTrain();
    }
    const key = BUILDINGS.map((x) => s.buildings[x.id]).join(',');
    if (key !== this.levelsKey) {
      const prev = this.levelsKey ? this.levelsKey.split(',').map(Number) : null;
      const changed = prev ? BUILDINGS.filter((x, i) => s.buildings[x.id] > prev[i]).map((x) => x.id) : [];
      this.levelsKey = key;
      this.drawPlots(s, changed);
      this.drawTrees(s, haze);
    }

    // selection ring
    const sel = this.bridge.getSelected();
    this.selRing.clear();
    if (sel) {
      const p = PLOTS.find((q) => q.id === sel)!;
      const pulse = 4 + Math.sin(this.time.now / 200) * 2;
      this.selRing.lineStyle(4, 0x38bdf8, 1);
      this.selRing.strokeRoundedRect(p.x - PW / 2 - pulse - 4, p.y - PH / 2 - pulse - 4, PW + 2 * pulse + 8, PH + 2 * pulse + 8, 20);
    }

    // haze over the map (eased so changes feel gradual)
    this.hazeT += (haze - this.hazeT) * Math.min(1, dt * 1.5);
    this.haze.setFillStyle(0xa59c87, this.hazeT * 0.42);
    this.smog.emitting = anim && this.hazeT > 0.15;
    this.smog.setAlpha(this.hazeT);

    // subtle night
    const tod = timeOfDay(s);
    const night = tod > 0.85 ? (tod - 0.85) / 0.15 : tod < 0.05 ? 1 - tod / 0.05 : 0;
    this.night.setFillStyle(0x101a3d, night * 0.28);

    // weather & industry
    const raining = s.effects.some((e) => (e.modifier.dispersionMult ?? 1) >= 1.5) || (seasonOf(dayOf(s)).id === 'monsoon' && tod > 0.35 && tod < 0.5);
    this.rain.emitting = anim && raining;
    this.smoke.emitting = anim;
    this.smoke.frequency = [220, 420, 800, 1600][Math.min(3, s.buildings.industrial)];

    if (!anim) return;
    this.train.x += 140 * dt;
    if (this.train.x > WW + 220) this.train.x = -260;

    const target = Math.max(10, 26 - s.buildings.bus * 4);
    if (this.vehicles.length < target && Math.random() < dt * 4) this.spawnVehicle(s);
    this.vehicles = this.vehicles.filter((v) => {
      v.obj.x += v.vx * dt;
      v.obj.y += v.vy * dt;
      const out = v.obj.x < -100 || v.obj.x > WW + 100 || v.obj.y < -100 || v.obj.y > WH + 100;
      if (out) v.obj.destroy();
      return !out;
    });
    for (const w of this.walkers) {
      w.obj.x += w.vx * dt;
      if (w.obj.x < w.x0) w.obj.x = w.x1;
      if (w.obj.x > w.x1) w.obj.x = w.x0;
    }
  }
}
