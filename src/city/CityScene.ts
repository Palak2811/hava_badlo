import Phaser from 'phaser';
import { BUILDINGS } from '../config/balance';
import { actualAqi, seasonOf, weekOf, weekProgress } from '../engine/core';
import {
  CELL, CITY, COLS, H_ARTERIALS, ROWS, V_ARTERIALS, buildingAt, districtAt, idx, isRoad, plotAt, roadNeighbours, tileAt, zoneAt, type CityMap, type MapBuilding, type Pick,
} from '../engine/map';
import { checkPlacement, checkRoad, demolitionInfo, roadPath, zoneTiles } from '../engine/build';
import { PLACEABLE_MAP, ZONE_INFO } from '../config/build';
import type { MapMode, Tool } from '../state/store';
import { districtAqi } from '../engine/air';
import { districtRevenue } from '../engine/economy';
import { aqiBand } from '../engine/core';
import { BASE_TRAFFIC } from '../engine/city';
import { infoOf } from '../engine/map';
import type { BuildingId, GameState } from '../engine/types';
import { cityControls } from './controls';
import { CP_RING, LANDMARK_HEIGHT, cpCentre, drawLandmark, drawLandmarkGround } from './landmarks';

/**
 * Renders the grid city (src/engine/map.ts) in a Mini Motorways-like flat top-down style.
 * World objects live under `world` and are seen by the main (pannable, zoomable) camera;
 * screen-space atmosphere (haze, smog, rain, night) is drawn by a second, fixed camera.
 */

export interface CityBridge {
  getState: () => GameState;
  getMap: () => CityMap;
  getTool: () => Tool | null;
  getMode: () => MapMode;
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

/** Diorama palette: bright toy-model roofs over a cool ground, slightly greyed by haze. */
function palette(haze: number) {
  const grey = 0xb9b4a6;
  const d = (c: number, k = 0.3) => mix(c, grey, haze * k);
  return {
    land: d(0xe4e9dc, 0.3),
    grass: d(0xcde3ad),
    park: d(0x93cf6c),
    tree: d(0x4f9d48),
    treeHi: d(0x7cc35f),
    road: mix(0x5e6470, 0x62656b, haze * 0.4),
    street: mix(0x7b818c, 0x7c7e83, haze * 0.4),
    walk: d(0xf4f4ee, 0.3),
    lane: 0xeef1f5,
    water: d(0x69b7e3),
    waterDeep: d(0x58a8d8),
    houses: [0xf28c6b, 0xffcf86, 0xf6aea4, 0x93d1bb, 0xb7a6ea, 0x8fc1ec, 0xf7e08a, 0xef9fbe].map((c) => d(c)),
    flats: [0xf3eee4, 0xe9dccb, 0xdfe7ee, 0xf2e2c8].map((c) => d(c)),
    shops: [0x4e9be0, 0xf5c043, 0xf2874a, 0x5cc2b6, 0xe96a6a].map((c) => d(c)),
    glass: d(0xa5c7ec),
    industry: [0xc9c9c3, 0xbfc3c9, 0xd0cabc].map((c) => d(c, 0.25)),
    sand: d(0xe8d3a8),
    metro: d(0x9b6bd6),
  };
}

/** How many cells of countryside are drawn around the city. */
const OUTSKIRTS = 16;
/** Smooth west bank of the Yamuna (always on or east of the first water tile of each row). */
const nearBankX = (wy: number) => (57 + Math.sin((wy / CELL - 0.5) / 4.5) * 1.3) * CELL + 28;
/** Far (east) bank, just beyond the map edge. */
const farBankX = (wy: number) => WW + 36 + Math.sin(wy / 170) * 12;

/** Fog colour for low-lying smog; tall roofs are redrawn above it. */
const FOG = 0xd9d5ca;
/** Roofs at or above this height poke out of the smog. */
const TALL = 34;
/** Height the elevated metro runs at. */
const METRO_LIFT = 18;

/** Visual height (world px) of a map building, by kind and size. */
function heightOf(m: MapBuilding): number {
  if (m.progress) return 6;
  const r = hash(m.seed * 7.31);
  switch (m.kind) {
    case 'house': return 12 + r * 8;
    case 'shop': return 10 + r * 5;
    case 'apartment': return 30 + r * 18;
    case 'office': return m.w * m.h >= 4 ? 46 + r * 26 : 30 + r * 12;
    case 'market': return 9;
    case 'factory': return 16 + r * 4;
    case 'warehouse': return 13;
    case 'school': return 14;
    case 'hospital': return 30;
    case 'parking': return 16;
    case 'monument': return m.landmark ? LANDMARK_HEIGHT[m.landmark] : 22;
    default: return 0;
  }
}

/** Footprint inset used for drawing and hit-testing. */
const footprint = (m: { x: number; y: number; w: number; h: number }) => ({ bx: m.x * CELL + 5, by: m.y * CELL + 5, bw: m.w * CELL - 10, bh: m.h * CELL - 10 });

interface Vehicle { obj: Phaser.GameObjects.Container; fx: number; fy: number; tx: number; ty: number; t: number; speed: number; commuter: boolean; ped: boolean }

export class CityScene extends Phaser.Scene {
  private bridge!: CityBridge;
  private map: CityMap = CITY;
  private zoneLayer!: Phaser.GameObjects.Graphics;
  private toolKey = '';
  private modeLayer!: Phaser.GameObjects.Graphics;
  private modeLabels!: Phaser.GameObjects.Container;
  private modeT = 0;
  private modeShown: MapMode = 'normal';
  private builtSeen: Set<number> | null = null;
  private world!: Phaser.GameObjects.Container;
  private ground!: Phaser.GameObjects.Graphics;
  private blds!: Phaser.GameObjects.Graphics;
  private trees!: Phaser.GameObjects.Graphics;
  private fog!: Phaser.GameObjects.Graphics;
  private tops!: Phaser.GameObjects.Graphics;
  private rail!: Phaser.GameObjects.Container;
  private districtLabels!: Phaser.GameObjects.Container;
  /** Buildings in back-to-front draw order, for hit-testing raised roofs. */
  private drawOrder: MapBuilding[] = [];
  private overlay!: Phaser.GameObjects.Graphics;
  private plotLayer!: Phaser.GameObjects.Container;
  private traffic!: Phaser.GameObjects.Container;
  /** Decorative traffic circling the Connaught Place roundabout. */
  private ringCars: { obj: Phaser.GameObjects.Container; a: number; r: number; speed: number }[] = [];
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
  private streetTiles: [number, number][] = [];
  private jobsAt = { x: 0, y: 0 };
  private homesAt = { x: 0, y: 0 };
  private peds: Vehicle[] = [];
  private bucket = -1;
  private levelsKey = '';
  private hazeT = 0;
  private minZoom = 0.3;
  private drag: { x: number; y: number; moved: boolean; pinch: number | null } | null = null;
  private hover: { x: number; y: number } | null = null;
  private hoverWorld: { x: number; y: number } | null = null;

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
    this.fog = this.add.graphics();
    this.fog.fillStyle(FOG, 1);
    this.fog.fillRect(-CELL * 4, -CELL * 4, WW + CELL * 8, WH + CELL * 8);
    this.fog.setAlpha(0);
    this.tops = this.add.graphics();
    this.rail = this.add.container(0, 0);
    this.districtLabels = this.add.container(0, 0);
    this.zoneLayer = this.add.graphics();
    this.traffic = this.add.container(0, 0);
    this.plotLayer = this.add.container(0, 0);
    this.overlay = this.add.graphics();
    this.modeLayer = this.add.graphics();
    this.modeLabels = this.add.container(0, 0);
    this.smoke = this.add.particles(0, 0, 'puff', { lifespan: 4200, speedX: { min: 6, max: 22 }, speedY: { min: -26, max: -10 }, scale: { start: 0.5, end: 2.4 }, alpha: { start: 0.45, end: 0 }, tint: 0x7a7670, frequency: 140 });
    this.dust = this.add.particles(0, 0, 'puff', { lifespan: 2600, speedX: { min: -10, max: 14 }, speedY: { min: -12, max: -2 }, scale: { start: 0.4, end: 1.6 }, alpha: { start: 0.4, end: 0 }, tint: 0xcfb27c, frequency: 260 });
    // Traffic and trees sit below the buildings so raised roofs and walls occlude them;
    // fog covers everything low, then tall roofs (`tops`) are redrawn above it.
    this.world.add([this.ground, this.zoneLayer, this.traffic, this.trees, this.blds, this.fog, this.tops, this.rail, this.plotLayer, this.smoke, this.dust, this.districtLabels, this.modeLayer, this.modeLabels, this.overlay]);
    this.buildDistrictLabels();

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
    this.buildRingCars();
    for (let i = 0; i < 70; i++) this.spawnVehicle(this.bridge.getState(), true);

    cityControls.zoomBy = (f) => this.zoomAt(f, this.scale.width / 2, this.scale.height / 2);
    cityControls.reset = () => {
      this.fit(false);
      const c = this.cameras.main;
      this.tweens.add({ targets: c, zoom: this.minZoom, duration: 450, ease: 'Sine.easeInOut' });
      c.pan(WW / 2, WH / 2, 450, 'Sine.easeInOut');
      this.bridge.onCamera('zoom');
    };
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
      this.hoverWorld = { x: wp.x, y: wp.y };
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
      this.hoverWorld = { x: wp.x, y: wp.y };
      this.bridge.onHover(this.hover);
      if (this.bridge.getTool()) this.bridge.onToolClick(tx, ty);
      else this.bridge.onPick(this.pick(wp.x, wp.y));
    });
    this.input.on('gameout', () => {
      this.hover = null;
      this.hoverWorld = null;
      this.bridge.onHover(null);
    });
  }

  /** The front-most building whose raised shape (walls + roof) covers a world point. */
  private buildingAtPoint(wx: number, wy: number): MapBuilding | null {
    for (let i = this.drawOrder.length - 1; i >= 0; i--) {
      const m = this.drawOrder[i];
      if (m.removed || m.kind === 'busstop') continue;
      const { bx, by, bw, bh } = footprint(m);
      const hz = heightOf(m);
      if (wx >= bx && wx <= bx + bw && wy >= by - hz && wy <= by + bh) return m;
    }
    return null;
  }

  /** Outline rectangle of a building as drawn (including its raised roof). */
  private visualRect(m: MapBuilding) {
    const hz = heightOf(m);
    return { x: m.x * CELL, y: m.y * CELL - hz, w: m.w * CELL, h: m.h * CELL + hz };
  }

  private pick(wx: number, wy: number): Pick | null {
    const x = Math.floor(wx / CELL), y = Math.floor(wy / CELL);
    const plot = plotAt(this.map, x, y);
    if (plot) return { type: 'plot', id: plot };
    const b = this.buildingAtPoint(wx, wy) ?? buildingAt(this.map, x, y);
    if (b) return { type: 'building', id: b.id };
    if (isRoad(tileAt(this.map, x, y))) return { type: 'road', x, y };
    const d = districtAt(this.map, x, y);
    if (d && tileAt(this.map, x, y) !== 'water') return { type: 'district', id: d.id, x, y };
    return null;
  }

  private collectRoads() {
    this.roadTiles = [];
    this.streetTiles = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = this.map.tiles[idx(x, y)];
      if (isRoad(t)) this.roadTiles.push([x, y]);
      if (t === 'street') this.streetTiles.push([x, y]);
    }
    // where people live and where they work: commuters flow between the two
    let jx = 0, jy = 0, jw = 0, hx = 0, hy = 0, hw = 0;
    for (const b of this.map.buildings) {
      if (b.removed || b.progress) continue;
      const k = infoOf(b);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      jx += cx * k.jobs; jy += cy * k.jobs; jw += k.jobs;
      hx += cx * k.residents; hy += cy * k.residents; hw += k.residents;
    }
    this.jobsAt = { x: jx / Math.max(1, jw), y: jy / Math.max(1, jw) };
    this.homesAt = { x: hx / Math.max(1, hw), y: hy / Math.max(1, hw) };
  }

  /** Neighbourhood names shown when the camera is zoomed out. */
  private buildDistrictLabels() {
    this.districtLabels.removeAll(true);
    for (const d of this.map.districts) {
      const label = this.add.text((d.x + d.w / 2) * CELL, (d.y + d.h / 2) * CELL, d.name.toUpperCase(), {
        fontFamily: 'Inter, sans-serif', fontSize: '46px', fontStyle: '800', color: '#1b2a5c',
        stroke: '#ffffff', strokeThickness: 12, align: 'center',
        wordWrap: { width: d.w * CELL - 60 },
      }).setOrigin(0.5).setLetterSpacing(5);
      this.districtLabels.add(label);
    }
    this.districtLabels.setAlpha(0);
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
    this.drawSurroundings(g, p);
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
    const streetShape = (x: number, y: number, w: number) => {
      const cx = x * CELL + CELL / 2, cy = y * CELL + CELL / 2;
      g.fillRect(cx - w / 2, cy - w / 2, w, w);
      for (const [nx, ny] of roadNeighbours(this.map, x, y)) {
        // each tile paints its own half of the link, from its centre to the shared edge
        if (nx !== x) g.fillRect(nx > x ? cx : cx - CELL / 2 - 1, cy - w / 2, CELL / 2 + 1, w);
        else g.fillRect(cx - w / 2, ny > y ? cy : cy - CELL / 2 - 1, w, CELL / 2 + 1);
      }
    };
    // pale pavements first, then asphalt on top
    g.fillStyle(p.walk, 1);
    for (const [x, y] of this.roadTiles) {
      const t = this.map.tiles[idx(x, y)];
      if (t === 'street') streetShape(x, y, 32);
      else g.fillRect(x * CELL - 3, y * CELL - 3, CELL + 6, CELL + 6);
    }
    for (const [x, y] of this.roadTiles) {
      const t = this.map.tiles[idx(x, y)];
      if (t === 'arterial' || t === 'bridge') {
        g.fillStyle(p.road, 1);
        g.fillRect(x * CELL, y * CELL, CELL + 0.5, CELL + 0.5);
      } else {
        g.fillStyle(p.street, 1);
        streetShape(x, y, 22);
      }
    }
    this.drawBridgeSpans(g, p);
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
    // landmark paving, lawns and their own roads sit on the ground, under traffic
    for (const m of this.map.buildings) if (m.landmark && !m.removed) drawLandmarkGround(g, p, m);

    // back-to-front: rows further south are drawn later so their walls cover what is behind
    this.drawOrder = this.map.buildings.filter((m) => !m.removed).sort((m1, m2) => (m1.y + m1.h) - (m2.y + m2.h) || m1.x - m2.x);
    for (const m of this.drawOrder) this.drawShadow(b, m);
    // flat parks go on the ground layer so the tree layer (below buildings) still shows on them
    for (const m of this.drawOrder) this.drawBuilding(m.kind === 'park' ? g : b, p, m);

    // tall roofs again, above the fog layer, so towers poke out of the smog
    const t = this.tops;
    t.clear();
    for (const m of this.drawOrder) {
      const hz = heightOf(m);
      if (hz < TALL || m.landmark) continue;
      const { bx, by, bw, bh } = footprint(m);
      const col = this.roofColour(p, m);
      t.fillStyle(col, 1);
      t.fillRect(bx, by - hz, bw, bh);
      t.lineStyle(2, mix(col, 0xffffff, 0.45), 1);
      t.strokeRect(bx + 1, by - hz + 1, bw - 2, bh - 2);
      this.roofDetails(t, p, m, bx, by - hz, bw, bh);
    }

    // elevated metro: shadow on the road, pillars, then the viaduct
    for (const l of this.map.metro.lines) {
      const horiz = l.y1 === l.y2;
      // lines that reach the map edge (or the river) carry on into the countryside
      const out = OUTSKIRTS * CELL;
      const start = horiz ? (l.x1 <= 0 ? -out : l.x1 * CELL) : (l.y1 <= 0 ? -out : l.y1 * CELL);
      const stop = horiz
        ? (l.x2 >= this.map.riverX[Math.min(ROWS - 1, l.y1)] ? WW + out : l.x2 * CELL)
        : (l.y2 >= ROWS - 1 ? WH + out : (l.y2 + 1) * CELL);
      const x0 = horiz ? start : l.x1 * CELL, y0 = horiz ? l.y1 * CELL : start, len = stop - start;
      b.fillStyle(0x283246, 0.16);
      if (horiz) b.fillRect(x0 + 10, y0 + 16, len, 9);
      else b.fillRect(x0 + 18, y0 + 8, 9, len);
      b.fillStyle(0xb9bec8, 1);
      for (let k = 20; k < len; k += 80) {
        if (horiz) b.fillRect(x0 + k, y0 + 12 - METRO_LIFT + 6, 6, METRO_LIFT);
        else b.fillRect(x0 + 10, y0 + k - METRO_LIFT + 6, 6, METRO_LIFT);
      }
      b.fillStyle(mix(p.metro, 0x2a3040, 0.3), 1);
      if (horiz) b.fillRect(x0, y0 + 9 - METRO_LIFT + 7, len, 4);
      else b.fillRect(x0 + 9, y0 - METRO_LIFT + 4, 7, len);
      b.fillStyle(p.metro, 1);
      if (horiz) b.fillRect(x0, y0 + 9 - METRO_LIFT, len, 7);
      else b.fillRect(x0 + 9, y0 - METRO_LIFT, 7, len);
    }
    for (const s of this.map.metro.stations) {
      const cx = s.x * CELL + CELL / 2, cy = s.y * CELL + CELL / 2 - METRO_LIFT;
      b.fillStyle(0x283246, 0.16);
      b.fillRoundedRect(cx - 22, cy - 10 + METRO_LIFT, 60, 30, 9);
      b.fillStyle(mix(p.metro, 0x2a3040, 0.25), 1);
      b.fillRoundedRect(cx - 28, cy - 4, 56, 30, 9);
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

  /**
   * Everything around the playable city: farmland beyond the edges, main roads running off the map,
   * and the Yamuna with smooth banks and a far bank (East Delhi) for the bridges to land on.
   */
  private drawSurroundings(g: Phaser.GameObjects.Graphics, p: ReturnType<typeof palette>) {
    const M = OUTSKIRTS;
    // farmland: patchwork fields separated by pale earth tracks
    g.fillStyle(mix(p.land, 0xc9b98f, 0.35), 1);
    g.fillRect(-M * CELL, -M * CELL, WW + 2 * M * CELL, WH + 2 * M * CELL);
    const crops = [mix(p.grass, 0x9fbf6a, 0.4), p.grass, mix(p.grass, 0xd9c48a, 0.55), mix(p.park, p.grass, 0.5), mix(p.grass, 0xe8d3a8, 0.35)];
    for (let y = -M; y < ROWS + M; y += 2) for (let x = -M; x < COLS + M; x += 2) {
      if (x + 2 > 0 && x < COLS && y + 2 > 0 && y < ROWS) continue;
      const h = hash(x * 92.7 + y * 13.1);
      const wide = h > 0.7 && x + 4 <= 0;
      g.fillStyle(crops[Math.floor(h * crops.length)], 1);
      g.fillRect(x * CELL + 4, y * CELL + 4, (wide ? 3 : 2) * CELL - 8, 2 * CELL - 8);
      if (h < 0.35) {
        // furrows
        g.fillStyle(0x000000, 0.05);
        for (let k = 10; k < 2 * CELL - 10; k += 8) g.fillRect(x * CELL + 8, y * CELL + k, 2 * CELL - 16, 2);
      }
    }
    // the city itself, with its edge softened into the fields
    g.fillStyle(p.land, 1);
    g.fillRect(0, 0, WW, WH);
    for (let i = 1; i <= 4; i++) {
      g.lineStyle(10, p.land, 0.55 - i * 0.12);
      g.strokeRect(-5 - (i - 1) * 10, -5 - (i - 1) * 10, WW + 10 + (i - 1) * 20, WH + 10 + (i - 1) * 20);
    }
    // main roads carry on out of the map
    const out = M * CELL;
    for (const y of H_ARTERIALS) {
      g.fillStyle(p.walk, 1); g.fillRect(-out, y * CELL - 3, out, CELL + 6);
      g.fillStyle(p.road, 1); g.fillRect(-out, y * CELL, out, CELL);
    }
    for (const x of V_ARTERIALS) {
      g.fillStyle(p.walk, 1);
      g.fillRect(x * CELL - 3, -out, CELL + 6, out);
      g.fillRect(x * CELL - 3, WH, CELL + 6, out);
      g.fillStyle(p.road, 1);
      g.fillRect(x * CELL, -out, CELL, out);
      g.fillRect(x * CELL, WH, CELL, out);
    }
    // the Yamuna: smooth near bank (never over a land tile), far bank beyond the map edge
    const top = -M * CELL, bottom = WH + M * CELL;
    const near: Phaser.Geom.Point[] = [], far: Phaser.Geom.Point[] = [], chanL: Phaser.Geom.Point[] = [], chanR: Phaser.Geom.Point[] = [];
    for (let y = top; y <= bottom; y += 10) {
      near.push(new Phaser.Geom.Point(nearBankX(y), y));
      far.push(new Phaser.Geom.Point(farBankX(y), y));
      const mid = (nearBankX(y) + farBankX(y)) / 2 + Math.sin(y / 230) * 30;
      chanL.push(new Phaser.Geom.Point(mid - 34, y));
      chanR.push(new Phaser.Geom.Point(mid + 34, y));
    }
    // sandy ghats and floodplain along both banks
    g.lineStyle(14, mix(p.sand, p.land, 0.3), 1);
    g.strokePoints(near, false);
    g.strokePoints(far, false);
    g.fillStyle(p.water, 1);
    g.fillPoints([...near, ...far.slice().reverse()], true);
    g.fillStyle(p.waterDeep, 1);
    g.fillPoints([...chanL, ...chanR.slice().reverse()], true);
    // a sandbar and a few ripples
    g.fillStyle(mix(p.sand, p.water, 0.25), 1);
    g.fillEllipse((nearBankX(26 * CELL) + farBankX(26 * CELL)) / 2 + 30, 26 * CELL, 46, 150);
    g.lineStyle(2, 0xffffff, 0.25);
    for (let y = top + 37; y < bottom; y += 61) {
      const x = nearBankX(y) + 30 + hash(y) * (farBankX(y) - nearBankX(y) - 80);
      g.lineBetween(x, y, x + 22, y);
    }
  }

  /** Bridges reach across to the far bank and carry on east. */
  private drawBridgeSpans(g: Phaser.GameObjects.Graphics, p: ReturnType<typeof palette>) {
    for (let y = 0; y < ROWS; y++) {
      if (this.map.tiles[idx(COLS - 1, y)] !== 'bridge') continue;
      const y0 = y * CELL, x0 = WW, x1 = farBankX(y0 + CELL / 2) + 20, end = WW + OUTSKIRTS * CELL;
      g.fillStyle(0x283246, 0.18);
      g.fillRect(x0, y0 + CELL, x1 - x0, 8);
      g.fillStyle(p.road, 1);
      g.fillRect(x0, y0, end - x0, CELL);
      g.fillStyle(p.walk, 1);
      g.fillRect(x1, y0 - 3, end - x1, 3);
      g.fillRect(x1, y0 + CELL, end - x1, 3);
      // railings along the whole span over water
      const r0 = Math.max(this.map.riverX[y] * CELL, 0);
      g.fillStyle(0xe9ecef, 1);
      g.fillRect(r0, y0 - 1, x1 - r0, 4);
      g.fillRect(r0, y0 + CELL - 3, x1 - r0, 4);
      g.fillStyle(p.lane, 0.6);
      for (let x = x0 + 10; x < end; x += CELL) g.fillRect(x, y0 + CELL / 2 - 1, 20, 2);
    }
  }

  /** Long shadow cast to the east of a raised building. */
  private drawShadow(g: Phaser.GameObjects.Graphics, m: MapBuilding) {
    const hz = heightOf(m);
    if (hz <= 0 || m.landmark) return; // landmarks cast their own shadows
    const { bx, by, bw, bh } = footprint(m);
    const dx = hz * 0.85, dy = hz * 0.15;
    g.fillStyle(0x283246, 0.17);
    g.fillPoints([
      new Phaser.Geom.Point(bx, by), new Phaser.Geom.Point(bx + bw, by), new Phaser.Geom.Point(bx + bw + dx, by + dy),
      new Phaser.Geom.Point(bx + bw + dx, by + bh + dy), new Phaser.Geom.Point(bx + dx, by + bh + dy), new Phaser.Geom.Point(bx, by + bh),
    ], true);
  }

  private roofColour(p: ReturnType<typeof palette>, m: MapBuilding): number {
    const r = hash(m.seed);
    switch (m.kind) {
      case 'house': return p.houses[Math.floor(r * p.houses.length)];
      case 'apartment': return p.flats[Math.floor(r * p.flats.length)];
      case 'shop': return p.shops[Math.floor(r * p.shops.length)];
      case 'office': return p.glass;
      case 'factory': return p.industry[Math.floor(r * 3)];
      case 'warehouse': return mix(p.industry[1], 0xe9d8b5, 0.4);
      case 'hospital': return 0xf8fafc;
      case 'school': return p.shops[1];
      case 'parking': return 0xb8bec7;
      case 'monument': return 0xd9a27a;
      default: return p.sand;
    }
  }

  /** Raised box: darker south wall of height `hz`, roof lifted by `hz`, light rim. */
  private box(g: Phaser.GameObjects.Graphics, col: number, bx: number, by: number, bw: number, bh: number, hz: number, windows?: number) {
    const top = by - hz;
    g.fillStyle(mix(col, 0x2a3040, 0.3), 1);
    g.fillRect(bx, by + bh - hz, bw, hz);
    if (windows !== undefined && hz > 10) {
      g.fillStyle(windows, 0.6);
      for (let yy = by + bh - hz + 4; yy < by + bh - 4; yy += 7) g.fillRect(bx + 3, yy, bw - 6, 2.5);
    }
    g.fillStyle(col, 1);
    g.fillRect(bx, top, bw, bh);
    g.lineStyle(2, mix(col, 0xffffff, 0.45), 1);
    g.strokeRect(bx + 1, top + 1, bw - 2, bh - 2);
  }

  /** Rooftop details (tanks, AC units, skylights…) drawn relative to the lifted roof. */
  private roofDetails(g: Phaser.GameObjects.Graphics, p: ReturnType<typeof palette>, m: MapBuilding, rx: number, ry: number, rw: number, rh: number) {
    const r = hash(m.seed);
    switch (m.kind) {
      case 'house':
        if (r > 0.2) { g.fillStyle(0x262626, 1); g.fillCircle(rx + rw - 8, ry + 9, 5); }
        if (r > 0.6) { g.fillStyle(0x3d5b86, 1); g.fillRect(rx + 4, ry + rh - 10, rw * 0.45, 6); }
        break;
      case 'apartment':
        g.fillStyle(0x000000, 0.07);
        g.fillRect(rx + 8, ry + 8, rw - 16, rh - 16);
        g.fillStyle(0x262626, 1);
        g.fillCircle(rx + 10, ry + 10, 5);
        g.fillCircle(rx + rw - 10, ry + 10, 5);
        g.fillStyle(0x9aa3ad, 1);
        for (let k = 0; k < 3; k++) g.fillRect(rx + 12 + k * 10, ry + rh - 14, 7, 5);
        break;
      case 'office':
        g.fillStyle(0xffffff, 0.28);
        g.fillTriangle(rx, ry + rh * 0.6, rx + rw * 0.6, ry, rx + rw * 0.85, ry);
        g.fillTriangle(rx, ry + rh * 0.6, rx + rw * 0.85, ry, rx, ry + rh * 0.95);
        g.fillStyle(0x6f93bd, 1);
        g.fillRect(rx + rw / 2 - 6, ry + rh / 2 - 6, 12, 12);
        break;
      case 'shop':
        g.fillStyle(p.shops[(Math.floor(r * 5) + 2) % 5], 1);
        g.fillRect(rx, ry + rh - 4, rw, 4);
        break;
      case 'factory':
      case 'warehouse':
        g.fillStyle(0x000000, 0.08);
        for (let k = 4; k < rh - 2; k += 6) g.fillRect(rx + 3, ry + k, rw - 6, 2);
        break;
      case 'hospital':
        g.fillStyle(0xe11d48, 1);
        g.fillRect(rx + rw / 2 - 4, ry + rh / 2 - 12, 8, 24);
        g.fillRect(rx + rw / 2 - 12, ry + rh / 2 - 4, 24, 8);
        break;
      case 'parking':
        g.fillStyle(0xffffff, 0.7);
        for (let k = 8; k < rw - 6; k += 12) g.fillRect(rx + k, ry + 6, 2, rh / 2 - 10);
        break;
    }
  }

  private drawBuilding(g: Phaser.GameObjects.Graphics, p: ReturnType<typeof palette>, m: MapBuilding) {
    if (m.removed) return;
    const r = hash(m.seed);
    const x = m.x * CELL, y = m.y * CELL, w = m.w * CELL, h = m.h * CELL;
    const { bx, by, bw, bh } = footprint(m);
    const hz = heightOf(m);
    const col = this.roofColour(p, m);
    const crane = () => {
      // tower crane: mast rising from the south-east corner, jib over the site
      const mx = bx + bw - 14, base = by + bh - 6, top = base - 64;
      g.fillStyle(0x283246, 0.15);
      g.fillRect(mx + 4, base - 2, 38, 4);
      g.fillStyle(0xd98a1f, 1);
      g.fillRect(mx, top, 5, base - top);
      g.fillStyle(0xf2a541, 1);
      g.fillRect(mx - bw * 0.55, top, bw * 0.55 + 16, 4);
      g.fillStyle(0x6b6b6b, 1);
      g.fillRect(mx + 8, top + 4, 8, 6);
    };
    if (m.progress) {
      g.fillStyle(p.sand, 1);
      g.fillRoundedRect(bx, by, bw, bh, 6);
      this.box(g, 0xe9dcc4, bx + 6, by + 6, bw - 12, bh - 12, hz);
      g.lineStyle(2, 0xf2a541, 1);
      g.strokeRect(bx + 6, by + 6 - hz, bw - 12, bh - 12);
      crane();
      this.dust.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(bx, by, bw, bh), quantity: 1 } as never);
      return;
    }
    switch (m.kind) {
      case 'forest': {
        g.fillStyle(p.park, 1);
        g.fillRoundedRect(x + 2, y + 2, w - 4, h - 4, 10);
        for (let i = 0; i < 14; i++) {
          const tx = bx + 6 + hash(m.seed + i) * (bw - 12), ty = by + 6 + hash(m.seed * 3 + i) * (bh - 12);
          this.tree(g, p, tx, ty, 11);
        }
        break;
      }
      case 'park': {
        g.fillStyle(p.park, 1);
        g.fillRoundedRect(x + 2, y + 2, w - 4, h - 4, 8);
        break;
      }
      case 'busstop': {
        g.fillStyle(0x283246, 0.15);
        g.fillRect(bx + 8, by + bh / 2 - 2, bw - 8, 10);
        g.fillStyle(0x1d4ed8, 1);
        g.fillRect(bx + 4, by + bh / 2 - 2, bw - 8, 6);
        g.fillStyle(0x2563eb, 1);
        g.fillRoundedRect(bx + 4, by + bh / 2 - 10, bw - 8, 10, 3);
        break;
      }
      case 'busterminal': {
        g.fillStyle(0xcfd6de, 1);
        g.fillRoundedRect(bx, by, bw, bh, 8);
        g.fillStyle(0xffffff, 0.8);
        g.fillRect(bx + 4, by + bh / 2 - 2, bw - 8, 4);
        for (let i = 0; i < 7; i++) {
          const c = i % 3 === 0 ? 0x22a35a : 0xd94b3d;
          this.box(g, c, bx + 8 + i * 20, by + 8, 12, 26, 6);
          this.box(g, c, bx + 8 + i * 20, by + bh - 34, 12, 26, 6);
        }
        break;
      }
      case 'market': {
        g.fillStyle(p.sand, 1);
        g.fillRoundedRect(bx, by, bw, bh, 6);
        // rows of stalls, each a tiny box with a coloured awning
        for (let j = 0; j < Math.floor(bh / 15); j++) for (let i = 0; i < Math.floor(bw / 14); i++) {
          this.box(g, p.shops[(i + j + Math.floor(r * 5)) % p.shops.length], bx + 3 + i * 14, by + 5 + j * 15, 10, 9, 5);
        }
        break;
      }
      case 'school': {
        g.fillStyle(p.park, 1);
        g.fillRoundedRect(bx, by, bw, bh, 5);
        g.lineStyle(2, 0xffffff, 0.8);
        g.strokeRect(bx + bw * 0.62, by + 6, bw * 0.34, bh - 12);
        this.box(g, col, bx, by, bw * 0.55, bh, hz, 0xfff1cc);
        break;
      }
      case 'monument': {
        if (m.landmark) {
          drawLandmark(g, p, m);
          break;
        }
        // India Gate: sandstone arch on a lawn
        const cx = x + w / 2, cy = y + h / 2;
        g.fillStyle(mix(p.park, 0xffffff, 0.15), 1);
        g.fillRoundedRect(x + 4, y + 4, w - 8, h - 8, 8);
        g.fillStyle(0x283246, 0.17);
        g.fillRect(cx - 32, cy - 13, 64 + hz * 0.85, 26);
        this.box(g, col, cx - 32, cy - 13, 64, 26, hz);
        g.fillStyle(mix(col, 0x2a3040, 0.55), 1);
        g.fillRect(cx - 7, cy + 13 - hz + 4, 14, hz - 4);
        g.fillStyle(0xc68b63, 1);
        g.fillRect(cx - 32, cy - 13 - hz, 64, 6);
        break;
      }
      case 'house': case 'apartment': case 'shop': case 'office': case 'factory': case 'warehouse': case 'hospital': case 'parking': {
        const win = m.kind === 'office' ? 0xdff0ff : m.kind === 'apartment' || m.kind === 'hospital' ? 0xfff1cc : undefined;
        this.box(g, col, bx, by, bw, bh, hz, win);
        if (m.kind === 'house' || m.kind === 'shop') {
          // a door on the street-facing wall
          g.fillStyle(mix(col, 0x2a3040, 0.55), 1);
          g.fillRect(bx + bw / 2 - 3, by + bh - Math.min(hz, 9), 6, Math.min(hz, 9));
        }
        this.roofDetails(g, p, m, bx, by - hz, bw, bh);
        if (m.kind === 'factory') {
          // chimney stack rising above the roof; smoke comes out of its top
          const cx = bx + bw - 14, top = by - hz - 26;
          g.fillStyle(0x6b6b6b, 1);
          g.fillRect(cx - 6, top, 12, 30);
          g.fillStyle(0xd94b3d, 1);
          g.fillRect(cx - 6, top + 4, 12, 4);
          g.fillStyle(0x8a8a8a, 1);
          g.fillEllipse(cx, top, 12, 6);
          g.fillStyle(0x3d3d3d, 1);
          g.fillEllipse(cx, top, 7, 3);
          this.smoke.addEmitZone({ type: 'random', source: new Phaser.Geom.Circle(cx, top, 3), quantity: 1 } as never);
        }
        break;
      }
      case 'construction': {
        g.fillStyle(p.sand, 1);
        g.fillRoundedRect(bx, by, bw, bh, 6);
        g.lineStyle(2, 0xf2a541, 1);
        g.strokeRoundedRect(bx, by, bw, bh, 6);
        g.fillStyle(0xcfb27c, 1);
        g.fillCircle(bx + bw * 0.3, by + bh * 0.6, 10);
        this.box(g, 0xe9dcc4, bx + bw * 0.45, by + 10, bw * 0.4, bh * 0.5, 10 + r * 14);
        crane();
        this.dust.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(bx, by, bw, bh), quantity: 1 } as never);
        break;
      }
    }
  }

  /** A round tree with a ground shadow, canopy lifted slightly off the ground. */
  private tree(g: Phaser.GameObjects.Graphics, p: ReturnType<typeof palette>, x: number, y: number, r: number) {
    g.fillStyle(0x283246, 0.17);
    g.fillEllipse(x + r * 0.9, y + r * 0.35, r * 2, r * 1.5);
    g.fillStyle(mix(p.tree, 0x1f3a24, 0.35), 1);
    g.fillCircle(x, y - r * 0.35, r);
    g.fillStyle(p.tree, 1);
    g.fillCircle(x - r * 0.08, y - r * 0.5, r * 0.88);
    g.fillStyle(p.treeHi, 1);
    g.fillCircle(x - r * 0.32, y - r * 0.8, r * 0.42);
  }

  private drawTrees(s: GameState, haze: number) {
    const p = palette(haze);
    const g = this.trees;
    g.clear();
    const tree = (x: number, y: number, r: number) => this.tree(g, p, x, y, r);
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
        // raised like the rest of the diorama: shadow and wall on a base layer, the pad lifted by `lift`
        const lift = 16;
        const base = this.add.graphics();
        base.fillStyle(0x283246, 0.17);
        base.fillRoundedRect(-PW / 2 + lift * 0.85, -PH / 2 + 3, PW, PH, 12);
        base.fillStyle(mix(col, 0x2a3040, 0.3), 1);
        base.fillRoundedRect(-PW / 2, -PH / 2, PW, PH, 12);
        c.add(base);
        g.setY(-lift);
        g.fillStyle(col, 1);
        g.fillRoundedRect(-PW / 2, -PH / 2, PW, PH, 12);
        g.fillStyle(0xffffff, 0.2);
        g.fillRoundedRect(-PW / 2 + 6, -PH / 2 + 6, PW - 12, 8, 4);
        g.fillStyle(mix(col, 0xffffff, 0.35), 1);
        for (let i = 0; i < lvl; i++) g.fillRoundedRect(-PW / 2 + 10 + i * 22, PH / 2 - 20, 16, 11, 3);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(0, -6, 16);
        c.add(g);
        c.add(this.add.text(0, -6 - lift, def.icon, { fontSize: '17px' }).setOrigin(0.5));
        if (def.id === 'monitor') {
          const pulse = this.add.circle(PW / 2 - 12, -PH / 2 + 12 - lift, 5, 0xf43f5e, 0.5);
          this.tweens.add({ targets: pulse, scale: 3, alpha: 0, duration: 1600, repeat: -1 });
          c.add([this.add.circle(PW / 2 - 12, -PH / 2 + 12 - lift, 4, 0xf43f5e), pulse]);
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

  /** A ring bursts from each of the player's buildings when construction completes. */
  private pulseCompletions(s: GameState) {
    const built = new Set(s.cityEdits.placed.filter((p) => p.built && !p.organic).map((p) => p.uid));
    if (this.builtSeen && this.bridge.animations()) {
      for (const p of s.cityEdits.placed) {
        if (!built.has(p.uid) || this.builtSeen.has(p.uid)) continue;
        const cx = (p.x + p.w / 2) * CELL, cy = (p.y + p.h / 2) * CELL;
        const ring = this.add.circle(cx, cy, 20, 0xffffff, 0).setStrokeStyle(4, 0x2f9e5b, 1);
        const star = this.add.text(cx, cy - 10, '✨', { fontSize: '26px' }).setOrigin(0.5);
        this.world.add([ring, star]);
        this.tweens.add({ targets: ring, radius: 90, alpha: 0, duration: 800, onComplete: () => ring.destroy() });
        this.tweens.add({ targets: star, y: cy - 60, alpha: 0, duration: 1100, onComplete: () => star.destroy() });
      }
    }
    this.builtSeen = built;
  }

  /* ------------------------------------------------------------ map modes */

  /** Pollution heatmap or economy view, drawn per neighbourhood with labels. */
  private drawMode(s: GameState, mode: MapMode) {
    const g = this.modeLayer;
    g.clear();
    this.modeLabels.removeAll(true);
    if (mode === 'normal') return;
    const revs = this.map.districts.map((d) => districtRevenue(s, d.id) / Math.max(1, d.w * d.h));
    const maxRev = Math.max(...revs, 1);
    this.map.districts.forEach((d, i) => {
      let color: number, label: string, sub: string;
      if (mode === 'pollution') {
        const aqi = districtAqi(s.air, s.conc, d.id);
        color = hex(aqiBand(aqi).color);
        label = `${aqi}`;
        sub = aqiBand(aqi).label;
      } else {
        const rev = districtRevenue(s, d.id);
        const t = revs[i] / maxRev;
        color = mix(0xe76f51, 0x2a9d8f, Math.sqrt(t));
        label = `₹${Math.round(rev).toLocaleString('en-IN')}/wk`;
        sub = t < 0.25 ? 'Struggling' : t > 0.7 ? 'Thriving' : 'Steady';
      }
      g.fillStyle(color, 0.42);
      g.fillRoundedRect(d.x * CELL + 6, d.y * CELL + 6, d.w * CELL - 12, d.h * CELL - 12, 24);
      g.lineStyle(3, color, 0.9);
      g.strokeRoundedRect(d.x * CELL + 6, d.y * CELL + 6, d.w * CELL - 12, d.h * CELL - 12, 24);
      const cx = (d.x + d.w / 2) * CELL, cy = (d.y + d.h / 2) * CELL;
      const box = this.add.container(cx, cy);
      const name = this.add.text(0, -26, d.name, { fontFamily: 'Inter, sans-serif', fontSize: '20px', fontStyle: '700', color: '#14213d' }).setOrigin(0.5);
      const big = this.add.text(0, 6, label, { fontFamily: 'Inter, sans-serif', fontSize: mode === 'pollution' ? '44px' : '30px', fontStyle: '800', color: '#14213d' }).setOrigin(0.5);
      const small = this.add.text(0, 40, sub, { fontFamily: 'Inter, sans-serif', fontSize: '18px', fontStyle: '600', color: '#4a5470' }).setOrigin(0.5);
      const w = Math.max(name.width, big.width, small.width) + 36;
      const bg = this.add.graphics();
      bg.fillStyle(0xffffff, 0.92);
      bg.fillRoundedRect(-w / 2, -48, w, 112, 18);
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-w / 2, -48, 8, 112, { tl: 18, bl: 18, tr: 0, br: 0 });
      box.add([bg, name, big, small]);
      this.modeLabels.add(box);
    });
    if (mode === 'pollution') {
      // hotspots: chimneys and construction dust
      for (const b of this.map.buildings) {
        if (b.removed) continue;
        const cx = (b.x + b.w / 2) * CELL, cy = (b.y + b.h / 2) * CELL;
        if (b.kind === 'factory' && !b.progress) {
          g.fillStyle(0x7f1d1d, b.modern ? 0.18 : 0.32);
          g.fillCircle(cx, cy, b.modern ? 40 : 60);
        } else if (b.kind === 'construction' || b.progress) {
          g.fillStyle(0xd97706, 0.28);
          g.fillCircle(cx, cy, 40);
        }
      }
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
      const hb = hp ? null : (this.hoverWorld && this.buildingAtPoint(this.hoverWorld.x, this.hoverWorld.y)) ?? buildingAt(this.map, this.hover.x, this.hover.y);
      o.lineStyle(2, 0xffffff, 0.85);
      if (hb) {
        const v = this.visualRect(hb);
        o.strokeRoundedRect(v.x + 1, v.y + 1, v.w - 2, v.h - 2, 8);
      } else {
        const r = hp ? this.map.plots[hp] : { x: this.hover.x, y: this.hover.y, w: 1, h: 1 };
        o.strokeRoundedRect(r.x * CELL + 1, r.y * CELL + 1, r.w * CELL - 2, r.h * CELL - 2, 8);
      }
    }
    if (!hl) return;
    o.lineStyle(4, 0x38bdf8, 1);
    if (hl.type === 'plot') {
      const r = this.map.plots[hl.id];
      o.strokeRoundedRect(r.x * CELL - pulse, r.y * CELL - pulse, r.w * CELL + pulse * 2, r.h * CELL + pulse * 2, 14);
    } else if (hl.type === 'building') {
      const v = this.visualRect(this.map.buildings[hl.id]);
      o.strokeRoundedRect(v.x - pulse, v.y - pulse, v.w + pulse * 2, v.h + pulse * 2, 10);
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
    const busShare = 0.03 + s.buildings.bus * 0.07;
    const dtcShare = 0.02 + s.city.traffic.ptShare * 0.1;
    const r = Math.random();
    const kind = r < busShare ? 'ebus' : r < busShare + dtcShare ? 'dtc' : r < 0.42 ? 'car' : r < 0.62 ? 'auto' : r < 0.84 ? 'scooter' : 'truck';
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
    const veh: Vehicle = { obj: v, fx: x, fy: y, tx, ty, t: anywhere ? Math.random() : 0, speed, commuter: Math.random() < 0.55, ped: false };
    this.placeVehicle(veh);
    this.vehicles.push(veh);
  }

  private placeVehicle(v: Vehicle) {
    const dx = v.tx - v.fx, dy = v.ty - v.fy;
    const lane = v.ped ? 15 : 7; // India drives on the left; pedestrians keep to the pavement
    v.obj.setPosition((lerp(v.fx, v.tx, v.t) + 0.5) * CELL + dy * lane, (lerp(v.fy, v.ty, v.t) + 0.5) * CELL - dx * lane);
    if (!v.ped) v.obj.setAngle(dx !== 0 ? (dx > 0 ? 0 : 180) : dy > 0 ? 90 : 270);
  }

  private stepVehicle(v: Vehicle, dt: number, goal: { x: number; y: number } | null) {
    v.t += v.speed * dt;
    while (v.t >= 1) {
      v.t -= 1;
      let opts = roadNeighbours(this.map, v.tx, v.ty).filter(([nx, ny]) => !(nx === v.fx && ny === v.fy));
      if (v.ped) opts = opts.filter(([nx, ny]) => this.map.tiles[idx(nx, ny)] === 'street');
      const dx = v.tx - v.fx, dy = v.ty - v.fy;
      const straight = opts.find(([nx, ny]) => nx - v.tx === dx && ny - v.ty === dy);
      let next: [number, number];
      if (!opts.length) next = [v.fx, v.fy];
      else if (goal && v.commuter && Math.random() < 0.7) {
        // head toward offices in the morning, toward homes in the evening
        next = opts.reduce((best, o) => (Math.hypot(o[0] - goal.x, o[1] - goal.y) < Math.hypot(best[0] - goal.x, best[1] - goal.y) ? o : best));
      } else if (straight && Math.random() < 0.65) next = straight;
      else next = opts[Math.floor(Math.random() * opts.length)];
      v.fx = v.tx;
      v.fy = v.ty;
      [v.tx, v.ty] = next;
    }
    this.placeVehicle(v);
  }

  private spawnPed() {
    const [x, y] = this.streetTiles[Math.floor(Math.random() * this.streetTiles.length)];
    const nb = roadNeighbours(this.map, x, y).filter(([nx, ny]) => this.map.tiles[idx(nx, ny)] === 'street');
    if (!nb.length) return;
    const [tx, ty] = nb[Math.floor(Math.random() * nb.length)];
    const c = this.add.container(0, 0);
    const cols = [0xf97316, 0x0ea5e9, 0xe11d48, 0xfacc15, 0x8b5cf6, 0x10b981, 0xffffff];
    c.add(this.add.circle(0, 0, 3, cols[Math.floor(Math.random() * cols.length)]).setStrokeStyle(1, 0x000000, 0.25));
    this.traffic.add(c);
    const p: Vehicle = { obj: c, fx: x, fy: y, tx, ty, t: Math.random(), speed: 0.35 + Math.random() * 0.25, commuter: Math.random() < 0.5, ped: true };
    this.placeVehicle(p);
    this.peds.push(p);
  }

  private buildRingCars() {
    const cp = this.map.buildings.find((b) => b.landmark === 'cp');
    if (!cp) return;
    const cols = [0xffffff, 0x2f6fd6, 0xe0483e, 0x334155, 0xf4c84a, 0x2f9e44];
    for (let i = 0; i < 12; i++) {
      const c = this.add.container(0, 0);
      const col = cols[i % cols.length];
      const len = col === 0x2f9e44 ? 10 : 14;
      c.add(this.add.rectangle(1.5, 1.5, len, 8, 0x000000, 0.15));
      c.add(this.add.rectangle(0, 0, len, 8, col).setStrokeStyle(1, 0x000000, 0.15));
      if (col === 0x2f9e44) c.add(this.add.rectangle(-1, 0, 5, 8, 0xf6d32d));
      this.traffic.add(c);
      // India drives on the left, so the roundabout turns clockwise; outer lane is a touch slower
      const outer = i % 2 === 0;
      this.ringCars.push({ obj: c, a: (i / 12) * Math.PI * 2, r: CP_RING + (outer ? 7 : -7), speed: outer ? 0.32 : 0.4 });
    }
    this.placeRingCars();
  }

  private placeRingCars() {
    const cp = this.map.buildings.find((b) => b.landmark === 'cp');
    if (!cp) return;
    const { cx, cy } = cpCentre(cp);
    for (const rc of this.ringCars) {
      rc.obj.setPosition(cx + Math.cos(rc.a) * rc.r, cy + Math.sin(rc.a) * rc.r);
      rc.obj.setRotation(rc.a + Math.PI / 2);
    }
  }

  private buildTrains() {
    this.map.metro.lines.forEach((l, i) => {
      const c = this.add.container(0, 0);
      const horiz = l.y1 === l.y2;
      for (let k = 0; k < 4; k++) c.add(this.add.rectangle(horiz ? k * 30 : 0, horiz ? 0 : k * 30, horiz ? 27 : 11, horiz ? 11 : 27, 0xf5f3ff).setStrokeStyle(2, 0x9b6bd6));
      this.rail.add(c);
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
      this.pulseCompletions(s);
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
    const mode = this.bridge.getMode();
    this.modeT -= delta;
    if (mode !== this.modeShown || this.modeT <= 0 || mapChanged) {
      if (mode !== this.modeShown) {
        this.modeLayer.setAlpha(0);
        this.modeLabels.setAlpha(0);
        this.tweens.add({ targets: [this.modeLayer, this.modeLabels], alpha: 1, duration: 280 });
      }
      this.modeShown = mode;
      this.modeT = 800;
      this.drawMode(s, mode);
    }
    this.drawOverlay();

    this.hazeT += (haze - this.hazeT) * Math.min(1, dt * 1.5);
    this.haze.setFillStyle(0xa59c87, this.hazeT * 0.1);
    this.fog.setAlpha(this.hazeT * 0.5);
    // neighbourhood names fade in as you zoom out (hidden while a data map mode has its own labels)
    const zoom = this.cameras.main.zoom;
    const hi = Math.max(0.5, this.minZoom * 1.18);
    const labelA = mode === 'normal' ? Phaser.Math.Clamp((hi - zoom) / (hi * 0.12), 0, 1) : 0;
    this.districtLabels.setAlpha(labelA);
    this.districtLabels.setVisible(labelA > 0.01);
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
    const ringFlow = 1 / (0.55 + 0.45 * s.city.traffic.congestion);
    for (const rc of this.ringCars) rc.a += rc.speed * dt * ringFlow;
    this.placeRingCars();
    for (const tr of this.trains) {
      const l = this.map.metro.lines[tr.line];
      tr.t += dt * 0.05 * tr.dir;
      if (tr.t > 1 || tr.t < 0) {
        tr.dir *= -1;
        tr.t = Phaser.Math.Clamp(tr.t, 0, 1);
      }
      const x = lerp(l.x1, l.x2, tr.t) * CELL + 12, y = lerp(l.y1, l.y2, tr.t) * CELL + 12 - METRO_LIFT;
      tr.obj.setPosition(l.y1 === l.y2 ? x - 45 : x, l.y1 === l.y2 ? y : y - 45);
    }
    // vehicle numbers follow private trips; congestion slows everyone down
    const tr = s.city.traffic;
    const target = Phaser.Math.Clamp(Math.round(75 * (tr.privateTrips / BASE_TRAFFIC.privateTrips)), 25, 150);
    if (this.vehicles.length < target && Math.random() < dt * 8) this.spawnVehicle(s);
    if (this.vehicles.length > target + 4) this.vehicles.pop()?.obj.destroy();
    const flow = 1 / (0.55 + 0.45 * tr.congestion);
    const goal = tod > 0.08 && tod < 0.4 ? this.jobsAt : tod > 0.55 && tod < 0.85 ? this.homesAt : null;
    for (const v of this.vehicles) this.stepVehicle(v, dt * flow, goal);
    const pedTarget = Phaser.Math.Clamp(Math.round(s.city.population / 2500), 15, 70);
    if (this.peds.length < pedTarget && this.streetTiles.length) this.spawnPed();
    if (this.peds.length > pedTarget + 3) this.peds.pop()?.obj.destroy();
    for (const p of this.peds) this.stepVehicle(p, dt, goal);
  }
}
