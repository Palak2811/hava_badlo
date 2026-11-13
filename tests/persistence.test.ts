/**
 * Save/load robustness: a campaign interrupted by save → load must continue exactly as if
 * it had never stopped, saves must stay small, and odd moments (mid-construction, pending
 * proposals, loans, ended terms) must survive.
 */
import { describe, expect, it } from 'vitest';
import { TICKS_PER_WEEK } from '../src/config/balance';
import { STRATEGIES } from './sim/strategies';
import { newGame, step } from '../src/engine/core';
import { load, save, serialize, type StorageLike } from '../src/engine/save';
import type { GameState } from '../src/engine/types';

class Mem implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const green = STRATEGIES.find((s) => s.name === 'green')!;
function play(s: GameState, untilTick: number) {
  while (s.tick < untilTick && !s.ended) {
    if (s.tick % TICKS_PER_WEEK === 1) {
      green.week(s);
      s.reportPending = false;
    }
    step(s);
  }
}
const fresh = () => {
  const s = newGame(31, 0);
  s.introDone = true;
  s.tutorialDone = true;
  return s;
};
/** the parts of the state that define the game (derived caches and timestamps excluded) */
const essence = (s: GameState) => ({
  tick: s.tick, res: s.res, conc: s.conc, baselineConc: s.baselineConc, rng: s.rngState, buildings: s.buildings, upgrading: s.upgrading,
  edits: s.cityEdits, city: s.city, proposals: s.proposals, policies: s.policies, delayed: s.delayed, finance: s.finance, events: s.events,
  objectives: s.objectives, research: s.research, effects: s.effects, ledger: s.ledger, stats: s.stats, news: s.news.map((n) => n.headline),
});

describe('save/load determinism', () => {
  for (const at of [3.5, 10.2, 27.7]) {
    it(`saving and loading at week ${at} does not change the future`, () => {
      const a = fresh();
      play(a, 34 * TICKS_PER_WEEK);

      const b = fresh();
      play(b, Math.floor(at * TICKS_PER_WEEK));
      const st = new Mem();
      save(st, b, 1);
      const r = load(st, 1);
      expect(r.status).toBe('loaded');
      const c = r.state;
      play(c, 34 * TICKS_PER_WEEK);

      expect(JSON.parse(JSON.stringify(essence(c)))).toEqual(JSON.parse(JSON.stringify(essence(a))));
    }, 60000);
  }
});

describe('save robustness', () => {
  it('a full-term save stays small', () => {
    const s = fresh();
    play(s, 52 * TICKS_PER_WEEK + 1);
    const bytes = serialize(s).length;
    expect(bytes).toBeLessThan(400_000);
  }, 60000);

  it('an ended term reloads straight to election night', () => {
    const s = fresh();
    play(s, 52 * TICKS_PER_WEEK + 1);
    expect(s.ended).not.toBeNull();
    const st = new Mem();
    save(st, s, 1);
    const r = load(st, 1).state;
    expect(r.ended).toBe(s.ended);
    expect(r.election?.seatsWon).toBe(s.election?.seatsWon);
  }, 60000);

  it('survives truncated, mistyped or partial saves without crashing', () => {
    const good = serialize(fresh());
    const cases = [good.slice(0, good.length / 2), '[]', 'null', '{"version":2}', JSON.stringify({ version: 2, state: { ...JSON.parse(good).state, cityEdits: 5, city: 'x', air: null } })];
    for (const raw of cases) {
      const st = new Mem();
      st.setItem('hawa-badlo-save-v1', raw);
      const r = load(st);
      expect(['corrupt', 'loaded']).toContain(r.status);
      // the game keeps running either way
      for (let i = 0; i < 5; i++) step(r.state);
      expect(Number.isFinite(r.state.res.budget)).toBe(true);
    }
  });
});

describe('performance', () => {
  it('a full 52-week year simulates in well under a few seconds', () => {
    const s = fresh();
    const t0 = performance.now();
    for (let i = 0; i < 52 * TICKS_PER_WEEK; i++) step(s);
    expect(performance.now() - t0).toBeLessThan(4000);
  }, 60000);
});
