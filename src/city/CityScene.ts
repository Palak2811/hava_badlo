import Phaser from 'phaser';
import { BUILDINGS } from '../config/balance';
import { actualAqi, dayOf, seasonOf, timeOfDay } from '../engine/core';
import type { BuildingId, GameState } from '../engine/types';

export interface CityBridge {
  getState: () => GameState;
  onSelect: (id: BuildingId) => void;
  animations: () => boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(c1: number, c2: number, t: number) {
  const r = lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t);
  const g = lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t);
  const b = lerp(c1 & 255, c2 & 255, t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
const hex = (s: string) => parseInt(s.replace('#', ''), 16);

interface Vehicle { obj: Phaser.GameObjects.Container; speed: number; lane: number; kind: 'car' | 'auto' | 'bus' | 'ebus' | 'truck' }
interface Walker { obj: Phaser.GameObjects.Container; mask: Phaser.GameObjects.Arc; speed: number }

/** Plot positions as fractions of the canvas (pseudo-isometric rows). */
const PLOTS: { id: BuildingId; x: number; y: number }[] = [
  { id: 'monitor', x: 0.14, y: 0.62 },
  { id: 'pr', x: 0.3, y: 0.6 },
  { id: 'greenery', x: 0.46, y: 0.62 },
  { id: 'bus', x: 0.62, y: 0.6 },
  { id: 'waste', x: 0.8, y: 0.62 },
  { id: 'dust', x: 0.22, y: 0.9 },
  { id: 'industrial', x: 0.5, y: 0.92 },
  { id: 'parali', x: 0.78, y: 0.9 },
];

export class CityScene extends Phaser.Scene {
  private bridge!: CityBridge;
  private sky!: Phaser.GameObjects.Graphics;
  private stat!: Phaser.GameObjects.Graphics;
  private plotsLayer!: Phaser.GameObjects.Container;
  private treesLayer!: Phaser.GameObjects.Container;
  private smogOverlay!: Phaser.GameObjects.Rectangle;
  private nightOverlay!: Phaser.GameObjects.Rectangle;
  private smog!: Phaser.GameObjects.Particles.ParticleEmitter;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private chimney!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fields!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sun!: Phaser.GameObjects.Arc;
  private stars!: Phaser.GameObjects.Graphics;
  private train!: Phaser.GameObjects.Container;
  private vehicles: Vehicle[] = [];
  private walkers: Walker[] = [];
  private levelsKey = '';
  private lastCleanBucket = -1;
  private W = 800;
  private H = 450;
  private roadY = 0;
  private skyTimer = 0;

  constructor() {
    super('city');
  }

  init(data: { bridge: CityBridge }) {
    this.bridge = data.bridge;
  }

  create() {
    this.makeTextures();
    this.sky = this.add.graphics().setDepth(0);
    this.stars = this.add.graphics().setDepth(1);
    this.sun = this.add.circle(0, 0, 26, 0xfff2b3).setDepth(2);
    this.stat = this.add.graphics().setDepth(5);
    this.train = this.add.container(0, 0).setDepth(6);
    this.treesLayer = this.add.container(0, 0).setDepth(9);
    this.plotsLayer = this.add.container(0, 0).setDepth(10);
    this.fields = this.add.particles(0, 0, 'puff', { lifespan: 6000, speedX: { min: 10, max: 30 }, speedY: { min: -14, max: -4 }, scale: { start: 0.4, end: 2.2 }, alpha: { start: 0.35, end: 0 }, tint: 0x8a7f72, frequency: 260, emitting: false }).setDepth(3);
    this.chimney = this.add.particles(0, 0, 'puff', { lifespan: 3500, speedX: { min: 8, max: 20 }, speedY: { min: -30, max: -15 }, scale: { start: 0.25, end: 1.4 }, alpha: { start: 0.5, end: 0 }, tint: 0x555555, frequency: 180 }).setDepth(4);
    this.smog = this.add.particles(0, 0, 'puff', { lifespan: 9000, speedX: { min: -8, max: 8 }, speedY: { min: -3, max: 3 }, scale: { start: 2.5, end: 4.5 }, alpha: { start: 0.45, end: 0 }, tint: 0xb8a98c, frequency: 120, quantity: 1 }).setDepth(30);
    this.rain = this.add.particles(0, 0, 'drop', { lifespan: 900, speedY: { min: 500, max: 650 }, speedX: -60, alpha: 0.55, frequency: 12, quantity: 2, emitting: false }).setDepth(31);
    this.smogOverlay = this.add.rectangle(0, 0, 10, 10, 0x9b8d70, 0).setOrigin(0).setDepth(29);
    this.nightOverlay = this.add.rectangle(0, 0, 10, 10, 0x0b1230, 0).setOrigin(0).setDepth(32);
    this.scale.on('resize', () => this.layout());
    this.layout();
  }

  private makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    for (let r = 16; r > 0; r -= 2) {
      g.fillStyle(0xffffff, 0.08);
      g.fillCircle(16, 16, r);
    }
    g.generateTexture('puff', 32, 32);
    g.clear();
    g.fillStyle(0xbfe4ff, 1);
    g.fillRect(0, 0, 2, 10);
    g.generateTexture('drop', 2, 10);
    g.destroy();
  }

  /** Rebuild everything that depends on canvas size. */
  private layout() {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.roadY = this.H * 0.76;
    this.smogOverlay.setSize(this.W, this.H);
    this.nightOverlay.setSize(this.W, this.H);
    this.smog.setPosition(0, 0);
    this.smog.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(0, this.H * 0.1, this.W, this.H * 0.8), quantity: 1 } as never);
    this.rain.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(-50, -20, this.W + 100, 10), quantity: 1 } as never);
    this.fields.setPosition(0, this.H * 0.42);
    this.fields.addEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(0, 0, this.W * 0.35, 8), quantity: 1 } as never);
    this.drawStatic(0);
    this.buildTrain();
    this.spawnTraffic();
    this.levelsKey = '';
    this.lastCleanBucket = -1;
  }

  private cleanliness(aqi: number) {
    return Phaser.Math.Clamp((420 - aqi) / 340, 0, 1); // 0 = smog, 1 = clean
  }

  private drawSky(clean: number, tod: number) {
    const W = this.W, H = this.H;
    const top = mix(0x8d8574, 0x3aa8f0, clean);
    const bot = mix(0xcdbb95, 0xbfe9ff, clean);
    const dusk = Math.max(0, 1 - Math.abs(tod - 0.78) * 8);
    this.sky.clear();
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      let c = mix(top, bot, i / bands);
      if (dusk > 0) c = mix(c, 0xff9a62, dusk * 0.45 * (i / bands));
      this.sky.fillStyle(c, 1);
      this.sky.fillRect(0, (H * 0.55 * i) / bands, W, H * 0.55 / bands + 1);
    }
    // sun arc across day
    const sx = lerp(W * 0.08, W * 0.92, Math.min(1, tod / 0.85));
    const sy = H * 0.32 - Math.sin(Math.min(1, tod / 0.85) * Math.PI) * H * 0.22;
    this.sun.setPosition(sx, sy).setFillStyle(mix(0xe8c79a, 0xfff2b3, clean), lerp(0.45, 1, clean));
  }

  private isoBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, d: number, h: number, color: number) {
    const top = mix(color, 0xffffff, 0.25);
    const left = mix(color, 0x000000, 0.15);
    const right = mix(color, 0x000000, 0.35);
    g.fillStyle(left, 1);
    g.fillPoints([{ x: x - w, y }, { x, y: y + d }, { x, y: y + d - h }, { x: x - w, y: y - h }] as Phaser.Types.Math.Vector2Like[], true);
    g.fillStyle(right, 1);
    g.fillPoints([{ x, y: y + d }, { x: x + w, y }, { x: x + w, y: y - h }, { x, y: y + d - h }] as Phaser.Types.Math.Vector2Like[], true);
    g.fillStyle(top, 1);
    g.fillPoints([{ x: x - w, y: y - h }, { x, y: y + d - h }, { x: x + w, y: y - h }, { x, y: y - d - h }] as Phaser.Types.Math.Vector2Like[], true);
  }

  private drawStatic(clean: number) {
    const g = this.stat;
    const W = this.W, H = this.H;
    g.clear();
    // distant skyline
    const far = mix(0x7d7466, 0x8fb7d9, clean);
    g.fillStyle(far, 1);
    for (let i = 0; i < 26; i++) {
      const bw = W / 26;
      const bh = H * (0.06 + ((i * 37) % 11) / 90);
      g.fillRect(i * bw, H * 0.5 - bh, bw - 2, bh);
    }
    // Qutub-like minaret (left) and India Gate (centre)
    const mon = mix(0x8f6d55, 0xd98b5f, clean);
    g.fillStyle(mon, 1);
    g.fillTriangle(W * 0.07 - 8, H * 0.5, W * 0.07 + 8, H * 0.5, W * 0.07, H * 0.22);
    const ig = mix(0x9a7d67, 0xe7b48a, clean);
    const cx = W * 0.5, base = H * 0.5, gw = Math.min(90, W * 0.09), gh = H * 0.2;
    g.fillStyle(ig, 1);
    g.fillRect(cx - gw / 2, base - gh, gw * 0.3, gh);
    g.fillRect(cx + gw / 2 - gw * 0.3, base - gh, gw * 0.3, gh);
    g.fillRect(cx - gw / 2 - 4, base - gh - 10, gw + 8, 14);
    g.fillRect(cx - gw * 0.2, base - gh - 20, gw * 0.4, 10);
    g.fillStyle(mix(ig, 0x000000, 0.25), 1);
    g.fillRect(cx - gw * 0.2, base - gh * 0.75, gw * 0.4, gh * 0.75);
    // ground
    const grass = mix(0x9c9270, 0x7fd36a, clean);
    g.fillStyle(grass, 1);
    g.fillRect(0, H * 0.5, W, H * 0.5);
    // farm fields on the horizon (parali source)
    g.fillStyle(mix(0xa89060, 0xd8c26a, clean), 1);
    g.fillRect(0, H * 0.48, W * 0.35, H * 0.03);
    // residential blocks between skyline and plots
    const res = [0xf2a65a, 0xe07a5f, 0x81b29a, 0xf4d35e, 0x6a8caf, 0xc77dff];
    for (let i = 0; i < 9; i++) {
      const x = W * (0.06 + i * 0.11), y = H * 0.53;
      this.isoBox(g, x, y, Math.min(24, W * 0.025), 8, H * (0.05 + ((i * 7) % 5) / 60), mix(0x8a8176, res[i % res.length], 0.35 + clean * 0.65));
    }
    // metro viaduct
    g.fillStyle(mix(0x6b6b6b, 0xc9d3dd, clean), 1);
    g.fillRect(0, H * 0.43, W, 6);
    for (let x = 20; x < W; x += 70) g.fillRect(x, H * 0.43, 6, H * 0.07);
    // industrial zone (right horizon)
    g.fillStyle(mix(0x5c5650, 0x8d99a6, clean), 1);
    g.fillRect(W * 0.86, H * 0.4, 12, H * 0.1);
    g.fillRect(W * 0.9, H * 0.36, 10, H * 0.14);
    g.fillRect(W * 0.83, H * 0.45, W * 0.15, H * 0.05);
    this.chimney.setPosition(W * 0.905, H * 0.36);
    // construction site with crane
    g.lineStyle(3, 0xf59e0b, 1);
    g.lineBetween(W * 0.7, H * 0.52, W * 0.7, H * 0.3);
    g.lineBetween(W * 0.66, H * 0.31, W * 0.78, H * 0.31);
    // road
    g.fillStyle(0x3b3f4a, 1);
    g.fillRect(0, this.roadY - 18, W, 38);
    g.fillStyle(0xfafafa, 0.8);
    for (let x = 0; x < W; x += 40) g.fillRect(x, this.roadY, 20, 2);
    g.fillStyle(mix(0xb5ab95, 0xe5e7eb, clean), 1);
    g.fillRect(0, this.roadY - 24, W, 6);
    g.fillRect(0, this.roadY + 20, W, 6);
  }

  private buildTrain() {
    this.train.removeAll(true);
    const y = this.H * 0.43 - 12;
    for (let i = 0; i < 4; i++) {
      const car = this.add.rectangle(i * 46, y, 44, 12, 0xe2e8f0).setOrigin(0, 0);
      const stripe = this.add.rectangle(i * 46, y + 7, 44, 3, 0xd946ef).setOrigin(0, 0);
      const win = this.add.rectangle(i * 46 + 4, y + 2, 36, 4, 0x1e3a8a).setOrigin(0, 0);
      this.train.add([car, stripe, win]);
    }
    this.train.x = -200;
  }

  private makeVehicle(kind: Vehicle['kind'], lane: number) {
    const dir = lane === 0 ? 1 : -1;
    const c = this.add.container(dir > 0 ? -60 : this.W + 60, this.roadY + (lane === 0 ? -9 : 9)).setDepth(lane === 0 ? 12 : 13);
    const colors: Record<Vehicle['kind'], number> = { car: [0xef4444, 0x3b82f6, 0xfafafa, 0x111827][Math.floor(Math.random() * 4)], auto: 0x16a34a, bus: 0xdc2626, ebus: 0x10b981, truck: 0xf59e0b };
    const len = kind === 'bus' || kind === 'ebus' || kind === 'truck' ? 38 : kind === 'auto' ? 16 : 22;
    const body = this.add.rectangle(0, -6, len, kind === 'car' ? 9 : 12, colors[kind]).setStrokeStyle(1, 0x000000, 0.25);
    const top = kind === 'auto' ? this.add.rectangle(0, -14, 12, 5, 0xfacc15) : this.add.rectangle(dir * 2, -11, len * 0.6, 4, 0x93c5fd, 0.9);
    const w1 = this.add.circle(-len / 2 + 5, 0, 3, 0x111111);
    const w2 = this.add.circle(len / 2 - 5, 0, 3, 0x111111);
    c.add([body, top, w1, w2]);
    if (kind === 'ebus') c.add(this.add.text(-6, -12, '⚡', { fontSize: '9px' }));
    const v: Vehicle = { obj: c, speed: (kind === 'bus' || kind === 'ebus' ? 40 : kind === 'truck' ? 35 : 60 + Math.random() * 40) * dir, lane, kind };
    this.vehicles.push(v);
  }

  private spawnTraffic() {
    for (const v of this.vehicles) v.obj.destroy();
    this.vehicles = [];
    for (const w of this.walkers) w.obj.destroy();
    this.walkers = [];
    for (let i = 0; i < 14; i++) {
      const w = this.add.container(Math.random() * this.W, this.roadY + (i % 2 ? 23 : -21)).setDepth(14);
      const body = this.add.rectangle(0, -5, 4, 8, [0xf97316, 0x22d3ee, 0xa3e635, 0xf472b6, 0xfacc15][i % 5]);
      const head = this.add.circle(0, -11, 2.6, 0x8d5524);
      const mask = this.add.circle(0, -10.3, 1.8, 0xffffff);
      w.add([body, head, mask]);
      this.walkers.push({ obj: w, mask, speed: (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 12) });
    }
  }

  private drawPlots(s: GameState) {
    this.plotsLayer.removeAll(true);
    const W = this.W, H = this.H;
    const pw = Math.min(56, W * 0.06);
    for (const p of PLOTS) {
      const def = BUILDINGS.find((b) => b.id === p.id)!;
      const lvl = s.buildings[p.id];
      const x = p.x * W, y = p.y * H - (p.y > 0.8 ? H * 0.06 : 0);
      const g = this.add.graphics();
      // plot base diamond
      g.fillStyle(lvl > 0 ? 0xd6d3c4 : 0xc4b28a, 1);
      g.fillPoints([{ x: x - pw, y }, { x, y: y + pw * 0.5 }, { x: x + pw, y }, { x, y: y - pw * 0.5 }] as Phaser.Types.Math.Vector2Like[], true);
      g.lineStyle(2, lvl > 0 ? hex(def.color) : 0xffffff, lvl > 0 ? 0.8 : 0.6);
      g.strokePoints([{ x: x - pw, y }, { x, y: y + pw * 0.5 }, { x: x + pw, y }, { x, y: y - pw * 0.5 }] as Phaser.Types.Math.Vector2Like[], true);
      const cont = this.add.container(0, 0);
      cont.add(g);
      if (lvl > 0) {
        const b = this.add.graphics();
        const h = 18 + lvl * 12;
        this.isoBox(b, x, y, pw * 0.62, pw * 0.31, h, hex(def.color));
        if (p.id === 'greenery') {
          b.fillStyle(0x15803d, 1);
          b.fillCircle(x - pw * 0.4, y - h - 6, 9);
          b.fillCircle(x + pw * 0.35, y - h - 4, 8);
        }
        if (p.id === 'monitor') {
          b.lineStyle(2, 0xffffff, 1);
          b.lineBetween(x, y - h, x, y - h - 18);
          b.fillStyle(0xf43f5e, 1);
          b.fillCircle(x, y - h - 18, 3);
        }
        cont.add(b);
        const icon = this.add.text(x, y - h - 2, def.icon, { fontSize: `${Math.round(pw * 0.42)}px` }).setOrigin(0.5, 1);
        const lv = this.add.text(x + pw * 0.62, y - h + 4, '★'.repeat(lvl), { fontSize: '10px', color: '#fde047', stroke: '#1f2937', strokeThickness: 3 }).setOrigin(1, 1);
        cont.add([icon, lv]);
        if (this.bridge.animations()) {
          b.setScale(1, 1);
          this.tweens.add({ targets: icon, y: icon.y - 3, yoyo: true, repeat: -1, duration: 1200 + Math.random() * 600, ease: 'Sine.easeInOut' });
        }
      } else {
        const sign = this.add.text(x, y - 4, '＋', { fontSize: `${Math.round(pw * 0.5)}px`, color: '#ffffff', stroke: '#334155', strokeThickness: 4 }).setOrigin(0.5);
        cont.add(sign);
        this.tweens.add({ targets: sign, alpha: 0.4, yoyo: true, repeat: -1, duration: 900 });
      }
      const label = this.add.text(x, y + pw * 0.5 + 4, def.short, { fontSize: '11px', fontFamily: 'Inter, sans-serif', color: '#0f172a', backgroundColor: '#ffffffcc', padding: { x: 4, y: 1 } }).setOrigin(0.5, 0);
      cont.add(label);
      const zone = this.add.zone(x, y - 20, pw * 2, pw * 1.6 + 30).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.bridge.onSelect(p.id));
      zone.on('pointerover', () => cont.setScale(1.0).setAlpha(0.85));
      zone.on('pointerout', () => cont.setAlpha(1));
      cont.add(zone);
      this.plotsLayer.add(cont);
    }
  }

  private construct(id: BuildingId) {
    const p = PLOTS.find((q) => q.id === id)!;
    const x = p.x * this.W, y = p.y * this.H - (p.y > 0.8 ? this.H * 0.06 : 0);
    const em = this.add.particles(x, y - 20, 'puff', { lifespan: 800, speed: { min: 40, max: 120 }, scale: { start: 0.6, end: 0 }, tint: [0xfde047, 0xffffff, 0xf59e0b], quantity: 24, emitting: false }).setDepth(40);
    em.explode(24);
    this.time.delayedCall(1200, () => em.destroy());
  }

  private drawTrees(s: GameState, clean: number) {
    this.treesLayer.removeAll(true);
    const n = 6 + s.buildings.greenery * 7 + Math.round(clean * 6);
    for (let i = 0; i < n; i++) {
      const x = ((i * 97) % 100) / 100 * this.W;
      const y = this.H * (0.66 + ((i * 53) % 7) / 100);
      if (Math.abs(y - this.roadY) < 30) continue;
      const leaf = mix(0x6b7a4a, 0x22c55e, clean);
      const t = this.add.container(x, y);
      t.add(this.add.rectangle(0, 0, 3, 8, 0x7c4a1e));
      t.add(this.add.circle(0, -8, 7, leaf));
      t.add(this.add.circle(-4, -5, 5, mix(leaf, 0x000000, 0.1)));
      this.treesLayer.add(t);
    }
  }

  update(_time: number, delta: number) {
    const s = this.bridge.getState();
    const dt = delta / 1000;
    const aqi = actualAqi(s);
    const clean = this.cleanliness(aqi);
    const tod = timeOfDay(s);
    const anim = this.bridge.animations();

    this.skyTimer -= delta;
    if (this.skyTimer <= 0) {
      this.drawSky(clean, tod);
      this.skyTimer = 250;
    }
    const bucket = Math.round(clean * 10);
    if (bucket !== this.lastCleanBucket) {
      this.lastCleanBucket = bucket;
      this.drawStatic(clean);
      this.drawTrees(s, clean);
    }
    const key = BUILDINGS.map((b) => s.buildings[b.id]).join(',');
    if (key !== this.levelsKey) {
      const prev = this.levelsKey.split(',').map(Number);
      const changed = this.levelsKey ? BUILDINGS.filter((b, i) => s.buildings[b.id] > (prev[i] ?? 0)) : [];
      this.levelsKey = key;
      this.drawPlots(s);
      this.drawTrees(s, clean);
      if (anim) for (const b of changed) this.construct(b.id);
    }

    // smog
    const smogA = Phaser.Math.Clamp((aqi - 120) / 380, 0, 0.55);
    this.smogOverlay.setFillStyle(0x9b8d70, smogA * 0.7);
    this.smog.setAlpha(Math.min(1, smogA * 1.8));
    this.smog.emitting = anim && smogA > 0.05;
    this.smog.frequency = Math.max(40, 300 - smogA * 500);

    // night
    const night = tod > 0.82 ? (tod - 0.82) / 0.18 : tod < 0.06 ? 1 - tod / 0.06 : 0;
    this.nightOverlay.setFillStyle(0x0b1230, night * 0.45);
    this.stars.clear();
    if (night > 0.3) {
      this.stars.fillStyle(0xffffff, (night - 0.3) * clean);
      for (let i = 0; i < 30; i++) this.stars.fillRect((i * 137) % this.W, ((i * 71) % 100) / 100 * this.H * 0.35, 2, 2);
    }

    // weather
    const day = dayOf(s);
    const raining = s.effects.some((e) => (e.modifier.dispersionMult ?? 1) >= 1.5) || (seasonOf(day).id === 'monsoon' && tod > 0.3 && tod < 0.45);
    this.rain.emitting = anim && raining;
    this.fields.emitting = anim && seasonOf(day).id === 'postmonsoon' && s.buildings.parali < 3;
    this.chimney.frequency = s.buildings.industrial >= 2 ? 700 : s.buildings.industrial === 1 ? 350 : 160;
    this.chimney.emitting = anim;

    // metro
    if (anim) {
      this.train.x += 120 * dt;
      if (this.train.x > this.W + 50) this.train.x = -220;
    }

    // traffic: fewer polluting vehicles as transport control rises; e-buses appear with the depot
    const cars = Math.max(4, 12 - s.buildings.bus * 2);
    if (anim && this.vehicles.length < cars + 2 && Math.random() < dt * 1.5) {
      const r = Math.random();
      const kind: Vehicle['kind'] = s.buildings.bus > 0 && r < 0.12 + s.buildings.bus * 0.08 ? 'ebus' : r < 0.5 ? 'car' : r < 0.72 ? 'auto' : r < 0.86 ? 'truck' : 'bus';
      this.makeVehicle(kind, Math.random() < 0.5 ? 0 : 1);
    }
    for (const v of this.vehicles) {
      if (anim) v.obj.x += v.speed * dt;
    }
    this.vehicles = this.vehicles.filter((v) => {
      const out = v.obj.x < -80 || v.obj.x > this.W + 80;
      if (out) v.obj.destroy();
      return !out;
    });
    for (const w of this.walkers) {
      if (anim) {
        w.obj.x += w.speed * dt;
        if (w.obj.x < -10) w.obj.x = this.W + 10;
        if (w.obj.x > this.W + 10) w.obj.x = -10;
      }
      w.mask.setVisible(aqi > 200);
    }
  }
}
