import Phaser from 'phaser';
import { BUILDINGS } from '../config/balance';
import { actualAqi, seasonOf, weekOf, weekProgress } from '../engine/core';
import {
  CELL, CITY, COLS, ROWS, buildingAt, districtAt, idx, isRoad, plotAt, roadNeighbours, tileAt, zoneAt, type CityMap, type MapBuilding, type Pick,
} from '../engine/map';
import { checkPlacement, checkRoad, demolitionInfo, roadPath, zoneTiles } from '../engine/build';
import { PLACEABLE_MAP, ZONE_INFO } from '../config/build';
import type { Tool } from '../state/store';
import type { BuildingId, GameState } from '../engine/types';
import { cityControls } from './controls';

/**
 * Renders the grid city (src/engine/map.ts) in a Mini Motorways-like flat top-down style.
 * World objects live under `world` and are seen by the main (pannable, zoomable) camera;
 * screen-space atmosphere (haze, smog, rain, night) is drawn by a second, fixed camera.
 */

export interface CityBridge {
  getState: () => GameState;
  getMap: () => CityMap;
  getTool: () => Tool | null;
  onToolClick: (x: number, y: number) => void;
  onHover: (t: { x: number; y: number } | null) => void;
  getHighlight: () => Pick | null;
  onPick: (p: Pick | null) => void;
  onCamera: (kind: 'pan' | 'zoom') => void;
  animations: () => boolean;
}

const WW = COLS * CELL;
const WH = ROWS * CELL;
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

function palette(haze: number) {
  const grey = 0xb9b4a6;
  const d = (c: number, k = 0.5) => mix(c, grey, haze * k);
  return {
    land: d(0xf0eadb, 0.3),
    grass: d(0xd9e7b8),
    park: d(0xa5d47f),
    tree: d(0x5fae5a),
    treeDark: d(0x478f45),
    road: mix(0x464b55, 0x55575c, haze * 0.4),
    street: mix(0x5b616c, 0x66686c, haze * 0.4),
    lane: 0xf5f1e6,
    water: d(0x8fcbe8),
    waterDeep: d(0x77b8da),
    houses: [0xe08b6d, 0xf2d7b0, 0xf5b971, 0xe9a3a0, 0xa9cbb7, 0xd9c7ee, 0xf7e3a1, 0xc9dcef].map((c) => d(c)),
    flats: [0xf3e6cf, 0xe7d2c0, 0xd6e4ea, 0xefd9b7].map((c) => d(c)),
    shops: [0x6aa9e0, 0xf2c14e, 0xf08a4b, 0x7cc6c0, 0xe76f6f].map((c) => d(c)),
    glass: d(0x7fb3d9),
    industry: [0xa8a29a, 0x9ca3af, 0xb6aea0].map((c) => d(c, 0.25)),
    sand: d(0xe8d3a8),
    metro: d(0x9b6bd6),
  };
}

interface Vehicle { obj: Phaser.GameObjects.Container; fx: number; fy: number; tx: number; ty: number; t: number; speed: number }

export class CityScene extends Phaser.Scene {
  private bridge!: CityBridge;
  private map: CityMap = CITY;
  private zoneLayer!: Phaser.GameObjects.Graphics;
  private toolKey = '';
  private world!: Phaser.GameObjects.Container;
  private ground!: Phaser.GameObjects.Graphics;
  private blds!: Phaser.GameObjects.Graphics;
  private trees!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private plotLayer!: Phaser.GameObjects.Container;
  private traffic!: Phaser.GameObjects.Container;
  private trains: { obj: Phaser.GameObjects.Container; line: number; t: number; dir: number }[] = [];
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private haze!: Phaser.GameObjects.Rectangle;
  private night!: Phaser.GameObjects.Rectangle;
  private smog!: Phaser.GameObjects.Particles.ParticleEmitter;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private vehicles: Vehicle[] = [];
  private roadTiles: [number, number][] = [];
  private bucket = -1;
  private levelsKey = '';
  private hazeT = 0;
  private minZoom = 0.3;
  private drag: { x: number; y: number; moved: boolean; pinch: number | null } | null = null;
  private hover: { x: number; y: number } | null = null;

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

    this.map = this.bridge.getMap();
    this.collectRoads();

    this.world = this.add.container(0, 0);
    this.ground = this.add.graphics();
    this.blds = this.add.graphics();
    this.trees = this.add.graphics();
    this.zoneLayer = this.add.graphics();
    this.traffic = this.add.container(0, 0);
    this.plotLayer = this.add.container(0, 0);
    this.overlay = this.add.graphics();
    this.smoke = this.add.particles(0, 0, 'puff', { lifespan: 4200, speedX: { min: 6, max: 22 }, speedY: { min: -26, max: -10 }, scale: { start: 0.5, end: 2.4 }, alpha: { start: 0.45, end: 0 }, tint: 0x7a7670, frequency: 140 });
    this.dust = this.add.particles(0, 0, 'puff', { lifespan: 2600, speedX: { min: -10, max: 14 }, speedY: { min: -12, max: -2 }, scale: { start: 0.4, end: 1.6 }, alpha: { start: 0.4, end: 0 }, tint: 0xcfb27c, frequency: 260 });
    this.world.add([this.ground, this.zoneLayer, this.blds, this.trees, this.traffic, this.plotLayer, this.smoke, this.dust, this.overlay]);

    this.haze = this.add.rectangle(0, 0, 10, 10, 0xa59c87, 0).setOrigin(0);
    this.smog = this.add.particles(0, 0, 'puff', { lifespan: 10000, speedX: { min: -6, max: 10 }, speedY: { min: -3, max: 3 }, scale: { start: 3, end: 6 }, alpha: { start: 0.35, end: 0 }, tint: 0xb3a88f, frequency: 160 });
    this.rain = this.add.particles(0, 0, 'drop', { lifespan: 900, speedY: { min: 520, max: 650 }, speedX: -40, alpha: 0.5, frequency: 10, quantity: 2, emitting: false });
    this.night = this.add.rectangle(0, 0, 10, 10, 0x101a3d, 0).setOrigin(0);

    const cam = this.cameras.main;
    cam.setBounds(-CELL * 2, -CELL * 2, WW + CELL * 4, WH + CELL * 4);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    cam.ignore([this.haze, this.smog, this.rain, this.night]);
    this.uiCam.ignore(this.world);

    this.input.addPointer(1);
    this.setupInput();
    this.scale.on('resize', () => this.fit(false));
    this.fit(true);
    this.buildTrains();
    for (let i = 0; i < 70; i++) this.spawnVehicle(this.bridge.getState(), true);

    cityControls.zoomBy = (f) => this.zoomAt(f, this.scale.width / 2, this.scale.height / 2);
    cityControls.reset = () => this.fit(true);
    cityControls.focusTile = (x, y, z) => {
      const c = this.cameras.main;
      this.tweens.add({ targets: c, zoom: Phaser.Math.Clamp(z ?? 1.1, this.minZoom, 2.5), duration: 500, ease: 'Sine.easeInOut' });
      c.pan(x * CELL, y * CELL, 500, 'Sine.easeInOut');
    };
  }

  /* ------------------------------------------------------------ camera & input */

  private fit(recentre: boolean) {
    const W = this.scale.width, H = this.scale.height;
    const cam = this.cameras.main;
    cam.setSize(W, H);
    this.uiCam.setSize(W, H);
    this.minZoom = Math.max(W / (WW + CELL * 4), H / (WH + CELL * 4));
    if (recentre) {
      cam.setZoom(Math.max(this.minZoom, Math.min(1, Math.max(this.minZoom * 1.25, 0.6))));
      cam.centerOn(CELL * 24, CELL * 17);
    } else if (cam.zoom < this.minZoom) cam.setZoom(this.minZoom);
    this.haze.setSize(W, H);
    this.night.setSize(W, H);
    this.smog.clearEmitZones?.();
    this.smog.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(-100, 0, W + 100, H), quantity: 1 } as never);
    this.rain.clearEmitZones?.();
    this.rain.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(-40, -20, W + 80, 10), quantity: 1 } as never);
  }

  private zoomAt(f: number, px: number, py: number) {
    const cam = this.cameras.main;
    const before = cam.getWorldPoint(px, py);
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, this.minZoom, 2.5));
    cam.preRender();
    const after = cam.getWorldPoint(px, py);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
    this.bridge.onCamera('zoom');
  }

  private setupInput() {
    const cam = this.cameras.main;
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(dy > 0 ? 0.9 : 1.11, p.x, p.y));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.drag) this.drag = { x: p.x, y: p.y, moved: false, pinch: null };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const wp = cam.getWorldPoint(p.x, p.y);
      this.hover = { x: Math.floor(wp.x / CELL), y: Math.floor(wp.y / CELL) };
      this.bridge.onHover(this.hover);
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.drag) {
          if (this.drag.pinch) this.zoomAt(d / this.drag.pinch, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
          this.drag.pinch = d;
          this.drag.moved = true;
        }
        return;
      }
      if (!this.drag || !p.isDown) return;
      if (Math.abs(p.x - this.drag.x) + Math.abs(p.y - this.drag.y) > 6) this.drag.moved = true;
      if (this.drag.moved) {
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
        this.bridge.onCamera('pan');
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const moved = this.drag?.moved ?? false;
      if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.drag = null;
      if (moved) return;
      const wp = cam.getWorldPoint(p.x, p.y);
      const tx = Math.floor(wp.x / CELL), ty = Math.floor(wp.y / CELL);
      this.hover = { x: tx, y: ty };
      this.bridge.onHover(this.hover);
      if (this.bridge.getTool()) this.bridge.onToolClick(tx, ty);
      else this.bridge.onPick(this.pick(tx, ty));
    });
    this.input.on('gameout', () => {
      this.hover = null;
      this.bridge.onHover(null);
    });
  }

  private pick(x: number, y: number): Pick | null {
    const plot = plotAt(this.map, x, y);
    if (plot) return { type: 'plot', id: plot };
    const b = buildingAt(this.map, x, y);
    if (b) return { type: 'building', id: b.id };
    if (isRoad(tileAt(this.map, x, y))) return { type: 'road', x, y };
    const d = districtAt(this.map, x, y);
    if (d && tileAt(this.map, x, y) !== 'water') return { type: 'district', id: d.id, x, y };
    return null;
  }

  private collectRoads() {
    this.roadTiles = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isRoad(this.map.tiles[idx(x, y)])) this.roadTiles.push([x, y]);
  }

  /** Tints land by zone while a building tool is active. */
  private drawZones(show: boolean) {
    const g = this.zoneLayer;
    g.clear();
    if (!show) return;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (this.map.tiles[idx(x, y)] !== 'grass') continue;
      const z = zoneAt(this.map, x, y);
      if (!z) continue;
      const designated = this.map.zones[String(idx(x, y))] !== undefined;
      g.fillStyle(ZONE_INFO[z].color, designated ? 0.45 : 0.25);
      g.fillRoundedRect(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6, 6);
    }
  }

  /* ------------------------------------------------------------ static drawing */

  private drawCity(haze: number) {
    const p = palette(haze);
    const g = this.ground;
    g.clear();
    g.fillStyle(p.land, 1);
    g.fillRect(-CELL * 4, -CELL * 4, WW + CELL * 8, WH + CELL * 8);
    g.fillStyle(p.water, 1);
    for (let y = -3; y < ROWS + 3; y++) {
      const rx = this.map.riverX[Math.max(0, Math.min(ROWS - 1, y))];
      g.fillRect(rx * CELL - 6, y * CELL, WW + CELL * 4 - rx * CELL, CELL + 1);
    }
    g.fillStyle(p.waterDeep, 1);
    for (let y = -3; y < ROWS + 3; y++) {
      const rx = this.map.riverX[Math.max(0, Math.min(ROWS - 1, y))];
      g.fillRect(rx * CELL + 34, y * CELL, 70, CELL + 1);
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = this.map.tiles[idx(x, y)];
      if (t === 'park') {
        g.fillStyle(p.park, 1);
        g.fillRect(x * CELL, y * CELL, CELL + 1, CELL + 1);
      } else if (t === 'grass') {
        g.fillStyle(p.grass, 1);
        g.fillRoundedRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4, 6);
      } else if (t === 'roadwork') {
        g.fillStyle(0xd9c49a, 1);
        g.fillRect(x * CELL + 4, y * CELL + 4, CELL - 8, CELL - 8);
        g.fillStyle(0xf2a541, 1);
        for (let k = 0; k < 4; k++) g.fillRect(x * CELL + 6 + k * 8, y * CELL + 6, 4, CELL - 12);
      }
    }
    for (const [x, y] of this.roadTiles) {
      const t = this.map.tiles[idx(x, y)];
      const cx = x * CELL + CELL / 2, cy = y * CELL + CELL / 2;
      if (t === 'arterial' || t === 'bridge') {
        g.fillStyle(p.road, 1);
        g.fillRect(x * CELL, y * CELL, CELL + 0.5, CELL + 0.5);
      } else {
        const w = 22;
        g.fillStyle(p.street, 1);
        g.fillRect(cx - w / 2, cy - w / 2, w, w);
        for (const [nx, ny] of roadNeighbours(this.map, x, y)) {
          if (nx !== x) g.fillRect(Math.min(cx, nx * CELL + CELL / 2), cy - w / 2, CELL / 2 + 1, w);
          else g.fillRect(cx - w / 2, Math.min(cy, ny * CELL + CELL / 2), w, CELL / 2 + 1);
        }
      }
    }
    g.fillStyle(p.lane, 0.6);
    for (const [x, y] of this.roadTiles) {
      if (this.map.tiles[idx(x, y)] === 'street') continue;
      const horiz = isRoad(tileAt(this.map, x - 1, y)) && isRoad(tileAt(this.map, x + 1, y));
      const vert = isRoad(tileAt(this.map, x, y - 1)) && isRoad(tileAt(this.map, x, y + 1));
      if (horiz && !vert) g.fillRect(x * CELL + 10, y * CELL + CELL / 2 - 1, 20, 2);
      else if (vert && !horiz) g.fillRect(x * CELL + CELL / 2 - 1, y * CELL + 10, 2, 20);
    }
    for (const s of this.map.busStops) {
      g.fillStyle(0x2563eb, 1);
      g.fillRoundedRect(s.x * CELL + 3, s.y * CELL + 3, 9, 9, 2);
      g.fillStyle(0xffffff, 1);
      g.fillRect(s.x * CELL + 6, s.y * CELL + 6, 3, 3);
    }

    const b = this.blds;
    b.clear();
    this.smoke.clearEmitZones?.();
    this.dust.clearEmitZones?.();
    for (const m of this.map.buildings) this.drawBuilding(b, p, m);

    for (const l of this.map.metro.lines) {
      const horiz = l.y1 === l.y2;
      b.fillStyle(0x000000, 0.12);
      if (horiz) b.fillRect(l.x1 * CELL, l.y1 * CELL + 13, (l.x2 - l.x1) * CELL, 8);
      else b.fillRect(l.x1 * CELL + 13, l.y1 * CELL, 8, (l.y2 - l.y1 + 1) * CELL);
      b.fillStyle(p.metro, 1);
      if (horiz) b.fillRect(l.x1 * CELL, l.y1 * CELL + 9, (l.x2 - l.x1) * CELL, 7);
      else b.fillRect(l.x1 * CELL + 9, l.y1 * CELL, 7, (l.y2 - l.y1 + 1) * CELL);
    }
    for (const s of this.map.metro.stations) {
      const cx = s.x * CELL + CELL / 2, cy = s.y * CELL + CELL / 2;
      b.fillStyle(0x000000, 0.15);
      b.fillRoundedRect(cx - 26, cy - 14, 56, 30, 9);
      b.fillStyle(mix(p.metro, 0xffffff, 0.8), 1);
      b.fillRoundedRect(cx - 28, cy - 16, 56, 30, 9);
      b.fillStyle(p.metro, 1);
      b.fillCircle(cx, cy - 1, 10);
      b.fillStyle(0xffffff, 1);
      b.fillRect(cx - 5, cy - 6, 3, 10);
      b.fillRect(cx + 2, cy - 6, 3, 10);
      b.fillRect(cx - 5, cy - 6, 10, 3);
    }
  }

  private drawBuilding(g: Phaser.GameObjects.Graphics, p: ReturnType<typeof palette>, m: MapBuilding) {
    const r = hash(m.seed);
    const x = m.x * CELL, y = m.y * CELL, w = m.w * CELL, h = m.h * CELL;
    const bx = x + 5, by = y + 5, bw = w - 10, bh = h - 10;
    const shadow = () => {
      g.fillStyle(0x000000, 0.1);
      g.fillRoundedRect(bx + 3, by + 4, bw, bh, 6);
    };
    if (m.removed) return;
    if (m.progress) {
      g.fillStyle(p.sand, 1);
      g.fillRoundedRect(bx, by, bw, bh, 6);
      g.lineStyle(2, 0xf2a541, 1);
      g.strokeRoundedRect(bx, by, bw, bh, 6);
      g.fillStyle(0xf2a541, 0.9);
      g.fillRect(bx + bw - 12, by + 6, 4, bh - 12);
      g.fillRect(bx + 6, by + 6, bw - 12, 3);
      g.fillStyle(0xcfb27c, 1);
      g.fillCircle(bx + 12, by + bh - 12, 7);
      this.dust.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(bx, by, bw, bh), quantity: 1 } as never);
      return;
    }
    switch (m.kind) {
      case 'forest': {
        g.fillStyle(p.park, 1);
        g.fillRoundedRect(x + 2, y + 2, w - 4, h - 4, 10);
        for (let i = 0; i < 14; i++) {
          const tx = bx + 6 + hash(m.seed + i) * (bw - 12), ty = by + 6 + hash(m.seed * 3 + i) * (bh - 12);
          g.fillStyle(p.treeDark, 1);
          g.fillCircle(tx + 2, ty + 2, 11);
          g.fillStyle(p.tree, 1);
          g.fillCircle(tx, ty, 11);
        }
        break;
      }
      case 'parking': {
        shadow();
        g.fillStyle(0xb8bec7, 1);
        g.fillRoundedRect(bx, by, bw, bh, 6);
        g.fillStyle(0xffffff, 0.7);
        for (let k = 8; k < bw - 6; k += 12) g.fillRect(bx + k, by + 6, 2, bh / 2 - 10);
        g.fillStyle(0x2563eb, 1);
        g.fillRoundedRect(bx + bw / 2 - 9, by + bh - 24, 18, 18, 4);
        g.fillStyle(0xffffff, 1);
        g.fillRect(bx + bw / 2 - 3, by + bh - 20, 3, 11);
        g.fillRect(bx + bw / 2 - 3, by + bh - 20, 7, 3);
        g.fillRect(bx + bw / 2 - 3, by + bh - 15, 7, 3);
        g.fillRect(bx + bw / 2 + 2, by + bh - 20, 2, 8);
        break;
      }
      case 'busstop': {
        g.fillStyle(0x2563eb, 1);
        g.fillRoundedRect(bx + 4, by + bh / 2 - 6, bw - 8, 12, 4);
        g.fillStyle(0xffffff, 1);
        g.fillRect(bx + 8, by + bh / 2 - 2, bw - 16, 4);
        break;
      }
      case 'house': {
        shadow();
        g.fillStyle(p.houses[Math.floor(r * p.houses.length)], 1);
        g.fillRoundedRect(bx, by, bw, bh, 6);
        g.fillStyle(0xffffff, 0.22);
        g.fillRoundedRect(bx + 3, by + 3, bw - 6, 5, 2);
        if (r > 0.2) {
          g.fillStyle(0x262626, 1);
          g.fillCircle(bx + bw - 8, by + 9, 5);
        }
        if (r > 0.6) {
          g.fillStyle(0xffffff, 0.55);
          g.fillRect(bx + 4, by + bh - 8, bw * 0.45, 2);
        }
        break;
      }
      case 'apartment': {
        shadow();
        g.fillStyle(p.flats[Math.floor(r * p.flats.length)], 1);
        g.fillRoundedRect(bx, by, bw, bh, 8);
        g.fillStyle(0x000000, 0.08);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.fillRoundedRect(bx + 8 + (i * (bw - 16)) / 3, by + 8 + (j * (bh - 16)) / 3, (bw - 16) / 3 - 6, (bh - 16) / 3 - 6, 3);
        g.fillStyle(0x262626, 1);
        g.fillCircle(bx + 10, by + 10, 5);
        g.fillCircle(bx + bw - 10, by + 10, 5);
        break;
      }
      case 'shop': {
        shadow();
        g.fillStyle(p.shops[Math.floor(r * p.shops.length)], 1);
        g.fillRoundedRect(bx, by, bw, bh, 5);
        g.fillStyle(0xffffff, 0.6);
        for (let k = 0; k < bw; k += 7) g.fillRect(bx + k, by + bh - 7, 3.5, 7);
        break;
      }
      case 'market': {
        g.fillStyle(p.sand, 1);
        g.fillRoundedRect(bx, by, bw, bh, 6);
        for (let i = 0; i < Math.floor(bw / 13); i++) for (let j = 0; j < Math.floor(bh / 13); j++) {
          g.fillStyle(p.shops[(i + j + Math.floor(r * 5)) % p.shops.length], 1);
          g.fillRoundedRect(bx + 3 + i * 13, by + 3 + j * 13, 10, 10, 2);
        }
        break;
      }
      case 'office': {
        shadow();
        g.fillStyle(p.glass, 1);
        g.fillRoundedRect(bx, by, bw, bh, 6);
        g.fillStyle(0xffffff, 0.3);
        for (let k = 6; k < bh - 4; k += 8) g.fillRect(bx + 5, by + k, bw - 10, 2);
        break;
      }
      case 'factory': {
        shadow();
        g.fillStyle(p.industry[Math.floor(r * 3)], 1);
        g.fillRoundedRect(bx, by, bw, bh, 5);
        g.fillStyle(0x000000, 0.1);
        for (let k = 8; k < bw - 6; k += 12) g.fillRect(bx + k, by + 4, 4, bh - 8);
        const cx = bx + bw - 12, cy = by + 12;
        g.fillStyle(0x6b6b6b, 1);
        g.fillCircle(cx, cy, 8);
        g.fillStyle(0x3d3d3d, 1);
        g.fillCircle(cx, cy, 4);
        this.smoke.addEmitZone({ type: 'random', source: new Phaser.Geom.Circle(cx, cy, 3), quantity: 1 } as never);
        break;
      }
      case 'warehouse': {
        shadow();
        g.fillStyle(mix(p.industry[1], 0xe9d8b5, 0.4), 1);
        g.fillRoundedRect(bx, by, bw, bh, 4);
        g.fillStyle(0x000000, 0.08);
        for (let k = 4; k < bh; k += 6) g.fillRect(bx + 3, by + k, bw - 6, 2);
        break;
      }
      case 'construction': {
        g.fillStyle(p.sand, 1);
        g.fillRoundedRect(bx, by, bw, bh, 6);
        g.lineStyle(2, 0xf2a541, 1);
        g.strokeRoundedRect(bx, by, bw, bh, 6);
        g.fillStyle(0xcfb27c, 1);
        g.fillCircle(bx + bw * 0.3, by + bh * 0.6, 10);
        g.fillStyle(0xf2a541, 1);
        g.fillRect(bx + bw * 0.65, by + 6, 5, bh - 12);
        g.fillRect(bx + 8, by + 8, bw - 16, 4);
        this.dust.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(bx, by, bw, bh), quantity: 1 } as never);
        break;
      }
      case 'park': {
        g.fillStyle(p.park, 1);
        g.fillRoundedRect(x + 2, y + 2, w - 4, h - 4, 8);
        break;
      }
      case 'monument': {
        const cx = x + w / 2, cy = y + h / 2;
        g.fillStyle(0x000000, 0.12);
        g.fillRoundedRect(cx - 30, cy - 10, 62, 26, 4);
        g.fillStyle(0xd9a27a, 1);
        g.fillRoundedRect(cx - 32, cy - 13, 64, 26, 4);
        g.fillStyle(mix(p.park, 0x000000, 0.1), 1);
        g.fillRect(cx - 9, cy - 13, 18, 26);
        g.fillStyle(0xc68b63, 1);
        g.fillRect(cx - 32, cy - 13, 64, 6);
        break;
      }
      case 'busterminal': {
        shadow();
        g.fillStyle(0xcfd6de, 1);
        g.fillRoundedRect(bx, by, bw, bh, 8);
        for (let i = 0; i < 7; i++) {
          g.fillStyle(i % 3 === 0 ? 0x22a35a : 0xd94b3d, 1);
          g.fillRoundedRect(bx + 8 + i * 20, by + 8, 12, 26, 3);
          g.fillRoundedRect(bx + 8 + i * 20, by + bh - 34, 12, 26, 3);
        }
        break;
      }
      case 'school': {
        shadow();
        g.fillStyle(p.shops[1], 1);
        g.fillRoundedRect(bx, by, bw * 0.55, bh, 5);
        g.fillStyle(p.park, 1);
        g.fillRoundedRect(bx + bw * 0.6, by, bw * 0.4, bh, 5);
        break;
      }
      case 'hospital': {
        shadow();
        g.fillStyle(0xf8fafc, 1);
        g.fillRoundedRect(bx, by, bw, bh, 7);
        g.fillStyle(0xe11d48, 1);
        g.fillRect(bx + bw / 2 - 4, by + bh / 2 - 12, 8, 24);
        g.fillRect(bx + bw / 2 - 12, by + bh / 2 - 4, 24, 8);
        break;
      }
    }
  }

  private drawTrees(s: GameState, haze: number) {
    const p = palette(haze);
    const g = this.trees;
    g.clear();
    const tree = (x: number, y: number, r: number) => {
      g.fillStyle(p.treeDark, 1);
      g.fillCircle(x + 2, y + 2, r);
      g.fillStyle(p.tree, 1);
      g.fillCircle(x, y, r);
    };
    const density = 0.35 + s.buildings.greenery * 0.15 + (1 - haze) * 0.1;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = this.map.tiles[idx(x, y)];
      const h = hash(x * 131 + y * 17);
      if (t === 'park') {
        const o = this.map.owner[idx(x, y)];
        if (o >= 0 && this.map.buildings[o].kind === 'monument') continue;
        if (h < 0.55 + s.buildings.greenery * 0.1) tree(x * CELL + 8 + h * 24, y * CELL + 10 + hash(h) * 20, 8 + h * 5);
      } else if (t === 'grass' && h < density) {
        tree(x * CELL + 10 + h * 20, y * CELL + 12 + hash(h * 3) * 16, 7 + h * 3);
        if (h < density * 0.4) tree(x * CELL + 26, y * CELL + 26, 6);
      }
    }
  }

  /* ------------------------------------------------------------ facilities */

  private drawPlots(s: GameState, changed: BuildingId[]) {
    this.plotLayer.removeAll(true);
    for (const def of BUILDINGS) {
      const pl = this.map.plots[def.id];
      const lvl = s.buildings[def.id];
      const PW = pl.w * CELL - 10, PH = pl.h * CELL - 10;
      const c = this.add.container(pl.x * CELL + (pl.w * CELL) / 2, pl.y * CELL + (pl.h * CELL) / 2);
      const g = this.add.graphics();
      if (lvl === 0 && s.upgrading[def.id]) {
        g.fillStyle(0xe8d3a8, 1);
        g.fillRoundedRect(-PW / 2, -PH / 2, PW, PH, 12);
        g.lineStyle(3, 0xf2a541, 1);
        g.strokeRoundedRect(-PW / 2, -PH / 2, PW, PH, 12);
        g.fillStyle(0xf2a541, 1);
        g.fillRect(PW / 2 - 20, -PH / 2 + 6, 6, PH - 12);
        g.fillRect(-PW / 2 + 10, -PH / 2 + 8, PW - 30, 5);
        c.add(g);
        c.add(this.add.text(0, 6, def.icon, { fontSize: '18px' }).setOrigin(0.5).setAlpha(0.6));
      } else if (lvl === 0) {
        g.fillStyle(0xffffff, 0.55);
        g.fillRoundedRect(-PW / 2, -PH / 2, PW, PH, 12);
        g.lineStyle(2, 0x1b2a5c, 0.4);
        for (let x = -PW / 2 + 8; x < PW / 2 - 8; x += 12) {
          g.lineBetween(x, -PH / 2, x + 6, -PH / 2);
          g.lineBetween(x, PH / 2, x + 6, PH / 2);
        }
        for (let y = -PH / 2 + 8; y < PH / 2 - 8; y += 12) {
          g.lineBetween(-PW / 2, y, -PW / 2, y + 6);
          g.lineBetween(PW / 2, y, PW / 2, y + 6);
        }
        g.fillStyle(0x1b2a5c, 1);
        g.fillCircle(0, -8, 13);
        g.fillStyle(0xffffff, 1);
        g.fillRect(-6, -9, 12, 3);
        g.fillRect(-1.5, -14, 3, 13);
        c.add(g);
        c.add(this.add.text(0, 16, def.short.toUpperCase(), { fontFamily: 'Inter, sans-serif', fontSize: '10px', fontStyle: '700', color: '#1b2a5c' }).setOrigin(0.5).setAlpha(0.8));
      } else {
        const col = hex(def.color);
        g.fillStyle(0x000000, 0.14);
        g.fillRoundedRect(-PW / 2 + 4, -PH / 2 + 6, PW, PH, 12);
        g.fillStyle(col, 1);
        g.fillRoundedRect(-PW / 2, -PH / 2, PW, PH, 12);
        g.fillStyle(0xffffff, 0.2);
        g.fillRoundedRect(-PW / 2 + 6, -PH / 2 + 6, PW - 12, 8, 4);
        g.fillStyle(mix(col, 0xffffff, 0.35), 1);
        for (let i = 0; i < lvl; i++) g.fillRoundedRect(-PW / 2 + 10 + i * 22, PH / 2 - 20, 16, 11, 3);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(0, -6, 16);
        c.add(g);
        c.add(this.add.text(0, -6, def.icon, { fontSize: '17px' }).setOrigin(0.5));
        if (def.id === 'monitor') {
          const pulse = this.add.circle(PW / 2 - 12, -PH / 2 + 12, 5, 0xf43f5e, 0.5);
          this.tweens.add({ targets: pulse, scale: 3, alpha: 0, duration: 1600, repeat: -1 });
          c.add([this.add.circle(PW / 2 - 12, -PH / 2 + 12, 4, 0xf43f5e), pulse]);
        }
        if (changed.includes(def.id) && this.bridge.animations()) {
          c.setScale(0.4);
          this.tweens.add({ targets: c, scale: 1, duration: 520, ease: 'Back.easeOut' });
          const ring = this.add.circle(c.x, c.y, 24, 0xffffff, 0).setStrokeStyle(4, col, 1);
          this.world.add(ring);
          this.tweens.add({ targets: ring, radius: 110, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
        }
      }
      this.plotLayer.add(c);
    }
  }

  /* ------------------------------------------------------------ highlight */

  private bar(x: number, y: number, w: number, frac: number) {
    const o = this.overlay;
    o.fillStyle(0x14213d, 0.85);
    o.fillRoundedRect(x, y, w, 9, 4);
    o.fillStyle(0x2f9e5b, 1);
    o.fillRoundedRect(x + 2, y + 2, Math.max(4, (w - 4) * Phaser.Math.Clamp(frac, 0, 1)), 5, 3);
  }

  private drawProgress(s: GameState) {
    for (const b of this.map.buildings) {
      if (!b.progress || b.removed) continue;
      const f = (s.tick - b.progress.started) / Math.max(1, b.progress.done - b.progress.started);
      this.bar(b.x * CELL + 6, (b.y + b.h) * CELL - 16, b.w * CELL - 12, f);
    }
    for (const def of BUILDINGS) {
      const job = s.upgrading[def.id];
      if (!job) continue;
      const pl = this.map.plots[def.id];
      this.bar(pl.x * CELL + 10, (pl.y + pl.h) * CELL - 18, pl.w * CELL - 20, (s.tick - job.started) / Math.max(1, job.done - job.started));
    }
  }

  private drawToolPreview(s: GameState, tool: Tool) {
    const o = this.overlay;
    const h = this.hover;
    if (!h) return;
    const ok = 0x2f9e5b, bad = 0xd64545;
    if (tool.type === 'place') {
      const def = PLACEABLE_MAP[tool.kind];
      const c = checkPlacement(s, this.map, tool.kind, h.x, h.y, tool.relocateFrom !== undefined);
      o.fillStyle(c.ok ? ok : bad, 0.35);
      o.fillRoundedRect(h.x * CELL, h.y * CELL, def.w * CELL, def.h * CELL, 8);
      o.lineStyle(3, c.ok ? ok : bad, 1);
      o.strokeRoundedRect(h.x * CELL, h.y * CELL, def.w * CELL, def.h * CELL, 8);
      if (tool.relocateFrom !== undefined) {
        const src = this.map.buildings[tool.relocateFrom];
        if (src) {
          o.lineStyle(3, 0xf2a541, 1);
          o.strokeRoundedRect(src.x * CELL, src.y * CELL, src.w * CELL, src.h * CELL, 8);
          o.lineBetween((src.x + src.w / 2) * CELL, (src.y + src.h / 2) * CELL, (h.x + def.w / 2) * CELL, (h.y + def.h / 2) * CELL);
        }
      }
    } else if (tool.type === 'road') {
      const st = tool.start ?? [h.x, h.y];
      const c = checkRoad(s, this.map, st[0], st[1], h.x, h.y);
      const valid = tool.start ? c.ok : true;
      for (const [x, y] of roadPath(st[0], st[1], h.x, h.y)) {
        o.fillStyle(valid ? 0x40454f : bad, valid ? 0.55 : 0.4);
        o.fillRoundedRect(x * CELL + 6, y * CELL + 6, CELL - 12, CELL - 12, 4);
      }
      o.lineStyle(3, 0x7cc4f2, 1);
      o.strokeRoundedRect(st[0] * CELL + 2, st[1] * CELL + 2, CELL - 4, CELL - 4, 6);
    } else if (tool.type === 'zone') {
      const st = tool.start ?? [h.x, h.y];
      const color = tool.zone === 'clear' ? 0xffffff : ZONE_INFO[tool.zone].color;
      const x0 = Math.min(st[0], h.x), y0 = Math.min(st[1], h.y);
      o.lineStyle(3, color, 1);
      o.strokeRect(x0 * CELL, y0 * CELL, (Math.abs(h.x - st[0]) + 1) * CELL, (Math.abs(h.y - st[1]) + 1) * CELL);
      for (const i of zoneTiles(this.map, st[0], st[1], h.x, h.y, tool.zone)) {
        o.fillStyle(color, 0.45);
        o.fillRect((i % COLS) * CELL + 4, Math.floor(i / COLS) * CELL + 4, CELL - 8, CELL - 8);
      }
    } else if (tool.type === 'demolish') {
      const b = buildingAt(this.map, h.x, h.y);
      if (!b) return;
      const info = demolitionInfo(s, this.map, b.id);
      o.fillStyle(info.allowed ? bad : 0x888888, 0.35);
      o.fillRoundedRect(b.x * CELL, b.y * CELL, b.w * CELL, b.h * CELL, 8);
      o.lineStyle(3, info.allowed ? bad : 0x888888, 1);
      o.strokeRoundedRect(b.x * CELL, b.y * CELL, b.w * CELL, b.h * CELL, 8);
    }
  }

  private drawOverlay() {
    const o = this.overlay;
    o.clear();
    const s = this.bridge.getState();
    this.drawProgress(s);
    const tool = this.bridge.getTool();
    if (tool) {
      this.drawToolPreview(s, tool);
      return;
    }
    const hl = this.bridge.getHighlight();
    const pulse = 3 + Math.sin(this.time.now / 220) * 2;
    if (this.hover && !this.drag) {
      const hp = plotAt(this.map, this.hover.x, this.hover.y);
      const hb = buildingAt(this.map, this.hover.x, this.hover.y);
      const r = hp ? this.map.plots[hp] : hb ?? { x: this.hover.x, y: this.hover.y, w: 1, h: 1 };
      o.lineStyle(2, 0xffffff, 0.85);
      o.strokeRoundedRect(r.x * CELL + 1, r.y * CELL + 1, r.w * CELL - 2, r.h * CELL - 2, 8);
    }
    if (!hl) return;
    o.lineStyle(4, 0x38bdf8, 1);
    if (hl.type === 'plot') {
      const r = this.map.plots[hl.id];
      o.strokeRoundedRect(r.x * CELL - pulse, r.y * CELL - pulse, r.w * CELL + pulse * 2, r.h * CELL + pulse * 2, 14);
    } else if (hl.type === 'building') {
      const r = this.map.buildings[hl.id];
      o.strokeRoundedRect(r.x * CELL - pulse, r.y * CELL - pulse, r.w * CELL + pulse * 2, r.h * CELL + pulse * 2, 10);
    } else if (hl.type === 'road') {
      o.strokeRoundedRect(hl.x * CELL - 2, hl.y * CELL - 2, CELL + 4, CELL + 4, 6);
    } else {
      const d = this.map.districts.find((q) => q.id === hl.id)!;
      o.fillStyle(0x38bdf8, 0.08);
      o.fillRect(d.x * CELL, d.y * CELL, d.w * CELL, d.h * CELL);
      o.lineStyle(3, 0x38bdf8, 0.9);
      o.strokeRect(d.x * CELL, d.y * CELL, d.w * CELL, d.h * CELL);
    }
  }

  /* ------------------------------------------------------------ life */

  private spawnVehicle(s: GameState, anywhere = false) {
    const [x, y] = this.roadTiles[Math.floor(Math.random() * this.roadTiles.length)];
    const nb = roadNeighbours(this.map, x, y);
    if (!nb.length) return;
    const [tx, ty] = nb[Math.floor(Math.random() * nb.length)];
    const busShare = 0.06 + s.buildings.bus * 0.08;
    const r = Math.random();
    const kind = r < busShare ? 'ebus' : r < busShare + 0.07 ? 'dtc' : r < 0.42 ? 'car' : r < 0.62 ? 'auto' : r < 0.84 ? 'scooter' : 'truck';
    const len = { ebus: 26, dtc: 26, car: 14, auto: 10, scooter: 7, truck: 22 }[kind];
    const wid = { ebus: 10, dtc: 10, car: 8, auto: 8, scooter: 4, truck: 10 }[kind];
    const color = { ebus: 0x22a35a, dtc: 0xd94b3d, car: [0xffffff, 0x2f6fd6, 0xe0483e, 0x334155, 0xf4c84a][Math.floor(Math.random() * 5)], auto: 0x2f9e44, scooter: [0x111827, 0xef4444, 0x3b82f6][Math.floor(Math.random() * 3)], truck: 0xe8a33d }[kind];
    const v = this.add.container(0, 0);
    v.add(this.add.rectangle(1.5, 1.5, len, wid, 0x000000, 0.15));
    v.add(this.add.rectangle(0, 0, len, wid, color).setStrokeStyle(1, 0x000000, 0.15));
    if (kind === 'auto') v.add(this.add.rectangle(-1, 0, 5, wid, 0xf6d32d));
    if (kind === 'ebus') v.add(this.add.rectangle(0, 0, len - 6, 3, 0x93c5fd));
    if (kind === 'dtc') v.add(this.add.rectangle(0, 0, len - 6, 3, 0xffe4b5));
    if (kind === 'car') v.add(this.add.rectangle(2, 0, len * 0.4, wid - 3, 0x1e293b, 0.5));
    const speed = (kind === 'scooter' ? 2.4 : kind === 'auto' ? 1.9 : kind === 'car' ? 2.1 : 1.4) * (0.85 + Math.random() * 0.3);
    this.traffic.add(v);
    const veh: Vehicle = { obj: v, fx: x, fy: y, tx, ty, t: anywhere ? Math.random() : 0, speed };
    this.placeVehicle(veh);
    this.vehicles.push(veh);
  }

  private placeVehicle(v: Vehicle) {
    const dx = v.tx - v.fx, dy = v.ty - v.fy;
    const lane = 7; // India drives on the left
    v.obj.setPosition((lerp(v.fx, v.tx, v.t) + 0.5) * CELL + dy * lane, (lerp(v.fy, v.ty, v.t) + 0.5) * CELL - dx * lane);
    v.obj.setAngle(dx !== 0 ? (dx > 0 ? 0 : 180) : dy > 0 ? 90 : 270);
  }

  private stepVehicle(v: Vehicle, dt: number) {
    v.t += v.speed * dt;
    while (v.t >= 1) {
      v.t -= 1;
      const opts = roadNeighbours(this.map, v.tx, v.ty).filter(([nx, ny]) => !(nx === v.fx && ny === v.fy));
      const dx = v.tx - v.fx, dy = v.ty - v.fy;
      const straight = opts.find(([nx, ny]) => nx - v.tx === dx && ny - v.ty === dy);
      let next: [number, number];
      if (!opts.length) next = [v.fx, v.fy];
      else if (straight && Math.random() < 0.65) next = straight;
      else next = opts[Math.floor(Math.random() * opts.length)];
      v.fx = v.tx;
      v.fy = v.ty;
      [v.tx, v.ty] = next;
    }
    this.placeVehicle(v);
  }

  private buildTrains() {
    this.map.metro.lines.forEach((l, i) => {
      const c = this.add.container(0, 0);
      const horiz = l.y1 === l.y2;
      for (let k = 0; k < 4; k++) c.add(this.add.rectangle(horiz ? k * 30 : 0, horiz ? 0 : k * 30, horiz ? 27 : 11, horiz ? 11 : 27, 0xf5f3ff).setStrokeStyle(2, 0x9b6bd6));
      this.traffic.add(c);
      this.trains.push({ obj: c, line: i, t: Math.random(), dir: 1 });
    });
  }

  update(_t: number, delta: number) {
    const s = this.bridge.getState();
    const dt = Math.min(0.1, delta / 1000);
    const anim = this.bridge.animations();
    const aqi = actualAqi(s);
    const haze = Phaser.Math.Clamp((aqi - 90) / 330, 0, 1);

    const nextMap = this.bridge.getMap();
    const mapChanged = nextMap !== this.map;
    if (mapChanged) {
      this.map = nextMap;
      this.collectRoads();
    }
    const b = Math.round(haze * 8);
    if (b !== this.bucket || mapChanged) {
      this.bucket = b;
      this.drawCity(haze);
      this.drawTrees(s, haze);
    }
    const key = BUILDINGS.map((x) => `${s.buildings[x.id]}${s.upgrading[x.id] ? 'u' : ''}`).join(',');
    if (key !== this.levelsKey) {
      const prev = this.levelsKey ? this.levelsKey.split(',').map((v) => parseInt(v, 10)) : null;
      const changed = prev ? BUILDINGS.filter((x, i) => s.buildings[x.id] > prev[i]).map((x) => x.id) : [];
      this.levelsKey = key;
      this.drawPlots(s, changed);
      this.drawTrees(s, haze);
    }
    const tool = this.bridge.getTool();
    const tk = `${tool ? tool.type : ''}|${s.mapVersion}`;
    if (tk !== this.toolKey) {
      this.toolKey = tk;
      this.drawZones(!!tool && tool.type !== 'demolish');
    }
    this.drawOverlay();

    this.hazeT += (haze - this.hazeT) * Math.min(1, dt * 1.5);
    this.haze.setFillStyle(0xa59c87, this.hazeT * 0.4);
    this.smog.emitting = anim && this.hazeT > 0.15;
    this.smog.setAlpha(this.hazeT);

    const tod = weekProgress(s);
    const night = tod > 0.85 ? (tod - 0.85) / 0.15 : tod < 0.05 ? 1 - tod / 0.05 : 0;
    this.night.setFillStyle(0x101a3d, night * 0.25);
    const raining = s.effects.some((e) => (e.modifier.dispersionMult ?? 1) >= 1.5) || (seasonOf(weekOf(s)).id === 'monsoon' && tod > 0.35 && tod < 0.5);
    this.rain.emitting = anim && raining;
    this.smoke.emitting = anim;
    this.smoke.frequency = [140, 260, 480, 900][Math.min(3, s.buildings.industrial)];
    this.dust.emitting = anim;
    this.dust.frequency = [260, 420, 700, 1000, 1400][Math.min(4, s.buildings.dust)];

    if (!anim) return;
    for (const tr of this.trains) {
      const l = this.map.metro.lines[tr.line];
      tr.t += dt * 0.05 * tr.dir;
      if (tr.t > 1 || tr.t < 0) {
        tr.dir *= -1;
        tr.t = Phaser.Math.Clamp(tr.t, 0, 1);
      }
      const x = lerp(l.x1, l.x2, tr.t) * CELL + 12, y = lerp(l.y1, l.y2, tr.t) * CELL + 12;
      tr.obj.setPosition(l.y1 === l.y2 ? x - 45 : x, l.y1 === l.y2 ? y : y - 45);
    }
    const target = Math.max(45, 80 - s.buildings.bus * 8);
    if (this.vehicles.length < target && Math.random() < dt * 6) this.spawnVehicle(s);
    if (this.vehicles.length > target + 4) this.vehicles.pop()?.obj.destroy();
    for (const v of this.vehicles) this.stepVehicle(v, dt);
  }
}
