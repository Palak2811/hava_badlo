import Phaser from 'phaser';
import { CELL, type LandmarkId, type MapBuilding } from '../engine/map';

/**
 * Hand-drawn Delhi landmarks for the diorama city: Connaught Place's rings, India Gate on Rajpath,
 * Humayun's Tomb in its charbagh, the Lotus Temple, the Red Fort and Qutub Minar.
 *
 * Each landmark has a ground part (paving, lawns, roads, water — drawn on the ground layer, under
 * traffic and trees) and a raised part (walls, roofs, domes — drawn with the buildings, back to front).
 * Raised shapes use the same convention as ordinary buildings: roof lifted by its height, a darker
 * south wall below it, and a shadow cast to the east.
 */

export interface LandmarkPalette {
  park: number; grass: number; walk: number; road: number; street: number; lane: number; water: number; tree: number; treeHi: number;
}

/** Visual height of each landmark, used for hit-testing and the fog. */
export const LANDMARK_HEIGHT: Record<LandmarkId, number> = { cp: 22, indiagate: 46, humayun: 78, lotus: 28, redfort: 40, qutub: 124 };

const SHADOW = 0x283246;
const SANDSTONE = 0xb5533c;
const MARBLE = 0xf6f3ec;
const BUFF = 0xdcb08a;

function mix(c1: number, c2: number, t: number) {
  const ch = (s: number) => Math.round(((c1 >> s) & 255) + ((((c2 >> s) & 255) - ((c1 >> s) & 255)) * t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
const P = (x: number, y: number) => new Phaser.Geom.Point(x, y);

/** Centre of the Connaught Place circle (shifted onto the street that runs through it). */
export function cpCentre(m: MapBuilding) {
  return { cx: (m.x + m.w / 2) * CELL, cy: (m.y + m.h / 2) * CELL + 20 };
}
/** Inner ring road radius (lane centre) at Connaught Place. */
export const CP_RING = 82;

/* ------------------------------------------------------------------ primitives */

/** Raised box: darker south wall of height `hz`, roof lifted by `hz`, light rim. */
function box(g: Phaser.GameObjects.Graphics, col: number, x: number, y: number, w: number, h: number, hz: number) {
  g.fillStyle(mix(col, 0x2a3040, 0.3), 1);
  g.fillRect(x, y + h - hz, w, hz);
  g.fillStyle(col, 1);
  g.fillRect(x, y - hz, w, h);
  g.lineStyle(1.5, mix(col, 0xffffff, 0.4), 1);
  g.strokeRect(x + 0.75, y - hz + 0.75, w - 1.5, h - 1.5);
}

/** Shadow of a raised rectangle on the ground. */
function shadow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, hz: number) {
  const dx = hz * 0.85, dy = hz * 0.15;
  g.fillStyle(SHADOW, 0.17);
  g.fillPoints([P(x, y), P(x + w, y), P(x + w + dx, y + dy), P(x + w + dx, y + h + dy), P(x + dx, y + h + dy), P(x, y + h)], true);
}

/** Filled ring segment between radii r0 and r1, angles a0→a1. */
function arc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, col: number, alpha = 1) {
  const pts: Phaser.Geom.Point[] = [];
  const n = Math.max(4, Math.ceil((a1 - a0) / 0.04));
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push(P(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)); }
  for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; pts.push(P(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)); }
  g.fillStyle(col, alpha);
  g.fillPoints(pts, true);
}

/** Pointed petal from radius r0 outward, `len` long and `wid` wide. */
function petal(g: Phaser.GameObjects.Graphics, cx: number, cy: number, a: number, r0: number, len: number, wid: number, col: number) {
  const ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
  const left: Phaser.Geom.Point[] = [], right: Phaser.Geom.Point[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, d = r0 + len * t, half = (wid / 2) * Math.pow(Math.sin(Math.PI * t), 0.75);
    left.push(P(cx + ux * d + px * half, cy + uy * d + py * half));
    right.push(P(cx + ux * d - px * half, cy + uy * d - py * half));
  }
  g.fillStyle(col, 1);
  g.fillPoints([...left, ...right.reverse()], true);
}

function tree(g: Phaser.GameObjects.Graphics, p: LandmarkPalette, x: number, y: number, r: number) {
  g.fillStyle(SHADOW, 0.17);
  g.fillEllipse(x + r * 0.9, y + r * 0.35, r * 2, r * 1.5);
  g.fillStyle(mix(p.tree, 0x1f3a24, 0.35), 1);
  g.fillCircle(x, y - r * 0.35, r);
  g.fillStyle(p.tree, 1);
  g.fillCircle(x - r * 0.08, y - r * 0.5, r * 0.88);
  g.fillStyle(p.treeHi, 1);
  g.fillCircle(x - r * 0.32, y - r * 0.8, r * 0.42);
}

/** Tricolour on a pole whose foot is at (x, y). */
function flag(g: Phaser.GameObjects.Graphics, x: number, y: number, pole: number, fw: number) {
  g.fillStyle(SHADOW, 0.17);
  g.fillRect(x, y - 1.5, pole * 0.85, 3);
  g.fillStyle(0xe5e7eb, 1);
  g.fillRect(x - 1.5, y - pole, 3, pole);
  const fh = fw * 0.66, top = y - pole;
  g.fillStyle(0xff9933, 1);
  g.fillRect(x + 1.5, top, fw, fh / 3);
  g.fillStyle(0xffffff, 1);
  g.fillRect(x + 1.5, top + fh / 3, fw, fh / 3);
  g.fillStyle(0x138808, 1);
  g.fillRect(x + 1.5, top + (2 * fh) / 3, fw, fh / 3);
  g.fillStyle(0x000080, 1);
  g.fillCircle(x + 1.5 + fw / 2, top + fh / 2, fh / 7);
}

/** Small white-domed pavilion (chhatri) with its base at (x, y). */
function chhatri(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, lift: number) {
  g.fillStyle(mix(MARBLE, 0x2a3040, 0.3), 1);
  g.fillRect(x - r, y - lift, r * 2, lift);
  g.fillStyle(MARBLE, 1);
  g.fillCircle(x, y - lift, r);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(x - r * 0.35, y - lift - r * 0.35, r * 0.4);
}

/* ------------------------------------------------------------------ ground layer */

export function drawLandmarkGround(g: Phaser.GameObjects.Graphics, p: LandmarkPalette, m: MapBuilding) {
  const x0 = m.x * CELL, y0 = m.y * CELL, w = m.w * CELL, h = m.h * CELL;
  const cx = x0 + w / 2, cy = y0 + h / 2;
  switch (m.landmark) {
    case 'cp': {
      const c = cpCentre(m);
      const road = (x1: number, y1: number, x2: number, y2: number) => {
        g.lineStyle(32, p.walk, 1); g.lineBetween(x1, y1, x2, y2);
        g.lineStyle(22, p.street, 1); g.lineBetween(x1, y1, x2, y2);
      };
      g.fillStyle(p.grass, 1);
      g.fillRect(x0, y0, w, h);
      // the outer-block streets run in to the outer circle
      for (const yy of [12.5 * CELL, 18.5 * CELL]) {
        const dx = Math.sqrt(Math.max(0, 172 * 172 - (yy - c.cy) ** 2));
        road(x0, yy, c.cx - dx, yy);
        road(c.cx + dx, yy, x0 + w, yy);
      }
      // outer circle
      g.lineStyle(32, p.walk, 1); g.strokeCircle(c.cx, c.cy, 172);
      g.lineStyle(22, p.street, 1); g.strokeCircle(c.cx, c.cy, 172);
      // paved band where the colonnade stands
      g.lineStyle(58, mix(p.walk, 0xd9d2c2, 0.35), 1); g.strokeCircle(c.cx, c.cy, 131);
      // radial roads through the gaps; the four main ones reach the arterials and streets outside
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const reach = k % 2 === 0 ? 260 : 172;
        road(c.cx + Math.cos(a) * 60, c.cy + Math.sin(a) * 60, c.cx + Math.cos(a) * reach, c.cy + Math.sin(a) * reach);
      }
      g.lineStyle(32, p.walk, 1); g.lineBetween(c.cx, y0, c.cx, c.cy);
      g.lineStyle(22, p.street, 1); g.lineBetween(c.cx, y0, c.cx, c.cy);
      g.lineStyle(32, p.walk, 1); g.lineBetween(c.cx, c.cy, c.cx, y0 + h);
      g.lineStyle(22, p.street, 1); g.lineBetween(c.cx, c.cy, c.cx, y0 + h);
      // inner circle (the roundabout cars drive on)
      g.lineStyle(46, p.walk, 1); g.strokeCircle(c.cx, c.cy, CP_RING);
      g.lineStyle(32, p.road, 1); g.strokeCircle(c.cx, c.cy, CP_RING);
      g.fillStyle(p.lane, 0.7);
      for (let a = 0; a < Math.PI * 2; a += 0.16) g.fillCircle(c.cx + Math.cos(a) * CP_RING, c.cy + Math.sin(a) * CP_RING, 1.4);
      // Central Park
      g.fillStyle(p.park, 1);
      g.fillCircle(c.cx, c.cy, 60);
      g.lineStyle(4, p.walk, 1);
      g.strokeCircle(c.cx, c.cy, 36);
      g.lineBetween(c.cx - 58, c.cy, c.cx + 58, c.cy);
      g.lineBetween(c.cx, c.cy - 58, c.cx, c.cy + 58);
      g.fillStyle(p.walk, 1);
      g.fillCircle(c.cx, c.cy, 14);
      break;
    }
    case 'indiagate': {
      // Rajpath runs the length of the lawns, flanked by canals
      const lawnX = 33 * CELL, lawnW = 11 * CELL;
      g.fillStyle(p.park, 1);
      g.fillRect(x0, y0, w, h);
      g.fillStyle(0xd9b48a, 1);
      g.fillRect(lawnX, cy - 11, lawnW, 22);
      g.fillStyle(p.water, 1);
      g.fillRect(lawnX + 10, cy - 60, lawnW - 20, 10);
      g.fillRect(lawnX + 10, cy + 50, lawnW - 20, 10);
      g.fillStyle(mix(p.water, 0xffffff, 0.35), 1);
      g.fillRect(lawnX + 10, cy - 60, lawnW - 20, 2);
      g.fillRect(lawnX + 10, cy + 50, lawnW - 20, 2);
      g.fillStyle(p.walk, 1);
      g.fillCircle(cx, cy, 56);
      g.lineStyle(2, mix(p.walk, 0x000000, 0.1), 1);
      g.strokeCircle(cx, cy, 56);
      break;
    }
    case 'humayun': {
      // charbagh: walled garden in four parts, each split again, with water channels
      g.fillStyle(SANDSTONE, 1);
      g.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
      g.fillStyle(p.park, 1);
      g.fillRect(x0 + 9, y0 + 9, w - 18, h - 18);
      g.fillStyle(0xe8d9c0, 1);
      g.fillRect(cx - 7, y0 + 9, 14, h - 18);
      g.fillRect(x0 + 9, cy - 7, w - 18, 14);
      for (const f of [0.25, 0.75]) {
        g.fillRect(x0 + 9 + (w - 18) * f - 2, y0 + 9, 4, h - 18);
        g.fillRect(x0 + 9, y0 + 9 + (h - 18) * f - 2, w - 18, 4);
      }
      g.fillStyle(p.water, 1);
      g.fillRect(cx - 2, y0 + 9, 4, h - 18);
      g.fillRect(x0 + 9, cy - 2, w - 18, 4);
      g.fillStyle(0x9c4430, 1);
      g.fillRect(cx - 16, y0 + h - 11, 32, 11);
      break;
    }
    case 'lotus': {
      g.fillStyle(p.park, 1);
      g.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
      g.fillStyle(p.walk, 1);
      g.fillCircle(cx, cy, 50);
      // nine pools around the temple
      for (let k = 0; k < 9; k++) petal(g, cx, cy, (k * Math.PI * 2) / 9 + Math.PI / 9, 36, 22, 16, p.water);
      g.fillStyle(p.walk, 1);
      g.fillRect(cx - 6, cy + 44, 12, y0 + h - cy - 44);
      break;
    }
    case 'redfort': {
      g.fillStyle(mix(p.water, p.park, 0.55), 1);
      g.fillRect(x0, y0, w, h);
      g.fillStyle(p.park, 1);
      g.fillRect(x0 + 6, y0 + 6, w - 12, h - 12);
      g.fillStyle(0xe8d9c0, 1);
      g.fillRect(cx - 6, cy, 12, h / 2 - 6);
      g.fillRect(x0 + 24, cy + 18, w - 48, 6);
      break;
    }
    case 'qutub': {
      g.fillStyle(mix(p.grass, 0xd9b48a, 0.35), 1);
      g.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
      // ruined colonnades of the mosque around the tower, and the Iron Pillar
      g.lineStyle(3, 0xc9a27c, 1);
      g.strokeRect(x0 + 8, y0 + 8, 28, 18);
      g.strokeRect(x0 + 46, y0 + 54, 24, 16);
      g.fillStyle(0x3d3d3d, 1);
      g.fillCircle(x0 + 18, y0 + 62, 2.5);
      g.fillStyle(0xcfae86, 1);
      g.fillCircle(cx, cy, 17);
      break;
    }
  }
}

/* ------------------------------------------------------------------ raised layer */

export function drawLandmark(g: Phaser.GameObjects.Graphics, p: LandmarkPalette, m: MapBuilding) {
  const x0 = m.x * CELL, y0 = m.y * CELL, w = m.w * CELL, h = m.h * CELL;
  const cx = x0 + w / 2, cy = y0 + h / 2;
  switch (m.landmark) {
    case 'cp': {
      const c = cpCentre(m);
      const hz = LANDMARK_HEIGHT.cp, gap = 0.15;
      const segs = Array.from({ length: 8 }, (_, k) => ({ a0: (k * Math.PI) / 4 + gap, a1: ((k + 1) * Math.PI) / 4 - gap }));
      for (const s of segs) arc(g, c.cx + hz * 0.85, c.cy + hz * 0.15, 104, 158, s.a0, s.a1, SHADOW, 0.17);
      // trees in Central Park, then the flag
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI * 2) / 10 + 0.3;
        tree(g, p, c.cx + Math.cos(a) * 48, c.cy + Math.sin(a) * 48, 7);
      }
      // north blocks first so the south ones overlap them
      segs.sort((s1, s2) => Math.sin((s1.a0 + s1.a1) / 2) - Math.sin((s2.a0 + s2.a1) / 2));
      for (const s of segs) {
        arc(g, c.cx, c.cy, 104, 158, s.a0, s.a1, mix(MARBLE, 0x2a3040, 0.3));
        arc(g, c.cx, c.cy - hz, 104, 158, s.a0, s.a1, MARBLE);
        arc(g, c.cx, c.cy - hz, 123, 139, s.a0 + 0.05, s.a1 - 0.05, 0xe4ddcf);
        // colonnade columns along the outer and inner faces
        g.fillStyle(0xd8d0c0, 1);
        for (let a = s.a0 + 0.03; a < s.a1; a += 0.06) {
          g.fillCircle(c.cx + Math.cos(a) * 154, c.cy - hz + Math.sin(a) * 154, 1.6);
          g.fillCircle(c.cx + Math.cos(a) * 108, c.cy - hz + Math.sin(a) * 108, 1.4);
        }
      }
      flag(g, c.cx, c.cy, 78, 34);
      break;
    }
    case 'indiagate': {
      const hz = LANDMARK_HEIGHT.indiagate, bx = cx - 32, by = cy - 11;
      shadow(g, bx, by, 64, 22, hz);
      box(g, BUFF, bx, by, 64, 22, hz);
      g.fillStyle(0x6b4a34, 1);
      g.fillRect(cx - 8, by + 22 - hz + 14, 16, hz - 14);
      g.fillCircle(cx, by + 22 - hz + 14, 8);
      g.fillStyle(0xc68b63, 1);
      g.fillRect(bx, by - hz, 64, 5);
      g.fillStyle(0xcaa27c, 1);
      g.fillEllipse(cx, by - hz + 12, 20, 10);
      g.fillStyle(0x8a6a50, 1);
      g.fillEllipse(cx, by - hz + 12, 11, 5);
      // the empty canopy east of the gate
      const kx = cx + 92;
      shadow(g, kx - 10, cy - 10, 20, 20, 22);
      box(g, BUFF, kx - 10, cy - 10, 20, 20, 16);
      chhatri(g, kx, cy - 16, 9, 2);
      break;
    }
    case 'humayun': {
      // trees along the garden edges
      for (let t = x0 + 22; t < x0 + w - 14; t += 23) {
        if (Math.abs(t - cx) < 14) continue;
        tree(g, p, t, y0 + 20, 6);
      }
      for (let t = y0 + 40; t < y0 + h - 30; t += 23) {
        if (Math.abs(t - cy) < 14) continue;
        tree(g, p, x0 + 20, t, 6);
        tree(g, p, x0 + w - 20, t, 6);
      }
      // plinth with arcade
      const ph = 14;
      shadow(g, cx - 48, cy - 40, 96, 88, LANDMARK_HEIGHT.humayun);
      box(g, SANDSTONE, cx - 48, cy - 40, 96, 88, ph);
      g.fillStyle(0xf3e6d6, 0.85);
      for (let i = 0; i < 8; i++) g.fillRect(cx - 44 + i * 11.5, cy + 48 - ph + 3, 6, ph - 5);
      // tomb body standing on the plinth
      box(g, 0xc0603f, cx - 30, cy - 26 - ph, 60, 56, 26);
      g.lineStyle(2, 0xf3e6d6, 1);
      g.strokeRect(cx - 27, cy - 26 - ph - 26 + 3, 54, 50);
      g.fillStyle(0xf3e6d6, 1);
      g.fillRect(cx - 9, cy + 30 - ph - 22, 18, 20);
      g.fillStyle(0x6b3a2a, 1);
      g.fillRect(cx - 6, cy + 30 - ph - 19, 12, 17);
      const roof = cy - 26 - ph - 26;
      chhatri(g, cx - 22, roof + 10, 6, 6);
      chhatri(g, cx + 22, roof + 10, 6, 6);
      // marble double dome
      g.fillStyle(0xd9d3c6, 1);
      g.fillCircle(cx, roof + 26, 23);
      g.fillStyle(MARBLE, 1);
      g.fillCircle(cx, roof + 18, 21);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(cx - 7, roof + 11, 7);
      g.fillStyle(0xd4a017, 1);
      g.fillRect(cx - 1.5, roof - 8, 3, 9);
      chhatri(g, cx - 22, roof + 46, 6, 6);
      chhatri(g, cx + 22, roof + 46, 6, 6);
      break;
    }
    case 'lotus': {
      g.fillStyle(SHADOW, 0.17);
      g.fillEllipse(cx + 16, cy + 4, 78, 70);
      for (let k = 0; k < 9; k++) petal(g, cx, cy - 4, (k * Math.PI * 2) / 9, 6, 35, 23, 0xc9c3b4);
      for (let k = 0; k < 9; k++) petal(g, cx, cy - 8, (k * Math.PI * 2) / 9, 6, 34, 22, k % 2 ? 0xe3dfd4 : 0xeeebe3);
      for (let k = 0; k < 9; k++) petal(g, cx, cy - 16, (k * Math.PI * 2) / 9 + Math.PI / 9, 4, 25, 16, 0xfbfaf6);
      for (let k = 0; k < 9; k++) petal(g, cx, cy - 24, (k * Math.PI * 2) / 9, 2, 14, 11, 0xffffff);
      g.fillStyle(0xfffefa, 1);
      g.fillCircle(cx, cy - 26, 5);
      break;
    }
    case 'redfort': {
      const RED = 0xb84a32, t = 12, hz = 24;
      shadow(g, x0 + 6, y0 + 6, w - 12, h - 12, hz);
      const crenel = (x: number, y: number, len: number, horiz: boolean) => {
        g.fillStyle(mix(RED, 0xffffff, 0.3), 1);
        for (let k = 3; k < len - 3; k += 8) {
          if (horiz) g.fillRect(x + k, y + 2, 4, 3);
          else g.fillRect(x + 2, y + k, 3, 4);
        }
      };
      box(g, RED, x0 + 6, y0 + 6, w - 12, t, hz);
      crenel(x0 + 6, y0 + 6 - hz, w - 12, true);
      // white marble halls and gardens inside
      shadow(g, cx - 32, cy - 14, 64, 22, 12);
      box(g, MARBLE, cx - 32, cy - 14, 64, 22, 12);
      g.fillStyle(0xe2dccd, 1);
      for (let k = 0; k < 6; k++) g.fillRect(cx - 28 + k * 10, cy - 14 - 12 + 4, 6, 14);
      box(g, MARBLE, x0 + w - 48, y0 + 26, 24, 14, 10);
      tree(g, p, x0 + 36, cy + 14, 8);
      tree(g, p, x0 + w - 36, cy + 22, 8);
      box(g, RED, x0 + 6, y0 + 6, t, h - 12, hz);
      crenel(x0 + 6, y0 + 6 - hz, h - 12, false);
      box(g, RED, x0 + w - 6 - t, y0 + 6, t, h - 12, hz);
      crenel(x0 + w - 6 - t, y0 + 6 - hz, h - 12, false);
      box(g, RED, x0 + 6, y0 + h - 6 - t, w - 12, t, hz);
      crenel(x0 + 6, y0 + h - 6 - t - hz, w - 12, true);
      // corner bastions with chhatris
      for (const [bx, by] of [[x0 + 10, y0 + 10], [x0 + w - 10, y0 + 10], [x0 + 10, y0 + h - 10], [x0 + w - 10, y0 + h - 10]]) {
        g.fillStyle(mix(RED, 0x2a3040, 0.3), 1);
        g.fillRect(bx - 10, by - hz - 4, 20, hz + 4);
        g.fillStyle(RED, 1);
        g.fillCircle(bx, by - hz - 4, 10);
        chhatri(g, bx, by - hz - 4, 6, 6);
      }
      // Lahori Gate with its two domes and the flag
      const gy = y0 + h - 6 - t - 6;
      box(g, 0xc4553a, cx - 24, gy, 48, t + 12, LANDMARK_HEIGHT.redfort);
      g.fillStyle(0x6b3a2a, 1);
      g.fillRect(cx - 7, gy + t + 12 - 16, 14, 16);
      chhatri(g, cx - 13, gy - LANDMARK_HEIGHT.redfort + 9, 6, 4);
      chhatri(g, cx + 13, gy - LANDMARK_HEIGHT.redfort + 9, 6, 4);
      flag(g, cx, gy - LANDMARK_HEIGHT.redfort + 12, 30, 16);
      break;
    }
    case 'qutub': {
      const H = LANDMARK_HEIGHT.qutub;
      g.fillStyle(SHADOW, 0.17);
      g.fillPoints([P(cx, cy - 13), P(cx + H * 0.85, cy + H * 0.15 - 5), P(cx + H * 0.85, cy + H * 0.15 + 5), P(cx, cy + 13)], true);
      // five storeys, tapering; the top two are faced in marble
      const levels = [0, 36, 64, 88, 108, H];
      const half = (z: number) => 13 - (7 * z) / H;
      for (let i = 0; i < 5; i++) {
        const zb = levels[i], zt = levels[i + 1];
        const wb = half(zb), wt = half(zt);
        const col = i < 3 ? (i % 2 ? 0xa94a35 : SANDSTONE) : i === 3 ? 0xece4d4 : 0xd9b48a;
        g.fillStyle(col, 1);
        g.fillPoints([P(cx - wb, cy - zb), P(cx + wb, cy - zb), P(cx + wt, cy - zt), P(cx - wt, cy - zt)], true);
        // fluting: a lit edge on the sunny side
        g.fillStyle(mix(col, 0xffffff, 0.3), 1);
        g.fillPoints([P(cx - wb, cy - zb), P(cx - wb * 0.45, cy - zb), P(cx - wt * 0.45, cy - zt), P(cx - wt, cy - zt)], true);
        // balcony
        g.fillStyle(0xe8d3b0, 1);
        g.fillEllipse(cx, cy - zt, wt * 2 + 9, 6);
        g.fillStyle(mix(0xe8d3b0, 0x2a3040, 0.3), 1);
        g.fillEllipse(cx, cy - zt + 2, wt * 2 + 9, 3);
      }
      g.fillStyle(0xd9c5a3, 1);
      g.fillEllipse(cx, cy - H - 1, 9, 5);
      break;
    }
  }
}
