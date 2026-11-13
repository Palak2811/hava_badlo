import { describe, expect, it } from 'vitest';
import { TICKS_PER_WEEK } from '../src/config/balance';
import { ELECTION } from '../src/config/election';
import { buyBuilding, finishAllConstruction, newGame, rates, step } from '../src/engine/core';
import { allocateSeats, computeElection } from '../src/engine/election';
import { OBJECTIVES, districtReduction, evaluateObjectives, rollWeeklyObjectives } from '../src/engine/objectives';
import { decideProposal, propose } from '../src/engine/approvals';
import { DISTRICTS } from '../src/engine/map';
import { load, save, type StorageLike } from '../src/engine/save';
import type { GameState } from '../src/engine/types';

const fresh = (week = 10) => {
  const s = newGame(21, 0);
  s.introDone = true;
  s.tutorialDone = true;
  s.res.budget = 50000;
  s.tick = (week - 1) * TICKS_PER_WEEK;
  return s;
};
const ticks = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) step(s);
};
class Mem implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('weekly settlement', () => {
  it('money is booked at the end of the week, not every tick', () => {
    const s = fresh();
    s.objectives = [];
    const b0 = s.res.budget;
    ticks(s, 30);
    expect(s.res.budget).toBe(b0);
    expect(s.ledger.income).toBeGreaterThan(0);
    ticks(s, TICKS_PER_WEEK - 30);
    expect(s.settlement).not.toBeNull();
    // plus any development fees private builders paid when breaking ground this week-end
    expect(s.res.budget).toBe(Math.max(-5000, b0 + s.settlement!.net) + s.finance.devFeesLastWeek);
    expect(s.ledger.income).toBeLessThan(rates(s).income); // reset and refilling for the new week
  });

  it('the settlement reports the week', () => {
    const s = fresh();
    ticks(s, TICKS_PER_WEEK);
    const r = s.settlement!;
    expect(r.week).toBe(10);
    expect(r.income).toBeGreaterThan(r.expenses);
    expect(r.net).toBe(r.income - r.expenses);
    expect(r.aqi.length).toBe(2);
    expect(r.objectivesTotal).toBeGreaterThan(0);
  });
});

describe('objectives', () => {
  it('every week has an air, a city and an action objective', () => {
    const s = fresh(12);
    ticks(s, TICKS_PER_WEEK);
    const groups = s.objectives.map((o) => OBJECTIVES.find((t) => t.id === o.templateId)!.group);
    expect(groups.sort()).toEqual(['action', 'air', 'city']);
  });

  it('a neighbourhood objective targets a populated, polluted area and completes when met', () => {
    const s = fresh(12);
    // force the district template
    for (let i = 0; i < 40; i++) {
      rollWeeklyObjectives(s);
      if (s.objectives.some((o) => o.templateId === 'district')) break;
    }
    const o = s.objectives.find((x) => x.templateId === 'district')!;
    expect(o).toBeDefined();
    expect(DISTRICTS.map((d) => d.id)).toContain(o.param);
    expect(districtReduction(s, o.param!)).toBeLessThan(o.target);
    evaluateObjectives(s, true);
    expect(o.done).toBe(false);
    s.conc *= 0.5; // real reductions, not weather: the baseline stays where it was
    evaluateObjectives(s, true);
    expect(o.done).toBe(true);
  });

  it('deciding a proposal completes the decide objective', () => {
    const s = fresh(12);
    const p = propose(s, 'congestion')!;
    s.objectives = [];
    for (let i = 0; i < 40 && !s.objectives.some((o) => o.templateId === 'decide'); i++) rollWeeklyObjectives(s);
    const o = s.objectives.find((x) => x.templateId === 'decide')!;
    expect(o).toBeDefined();
    decideProposal(s, p.uid, false);
    evaluateObjectives(s, false);
    expect(o.done).toBe(true);
    expect(s.stats.industryDecisions).toBe(0);
  });

  it('templates always produce sane objectives', () => {
    const s = fresh(30);
    ticks(s, 1);
    s.settlement = { week: 30, income: 3000, expenses: 1000, net: 2000, budget: 1, aqi: [300, 300], trust: [50, 50], population: [1, 1], objectives: 0, objectivesTotal: 3, projects: 0, decisions: 0, highlights: [] };
    for (const t of OBJECTIVES) {
      const m = t.make(s, 30);
      if (!m) continue;
      expect(m.label.length).toBeGreaterThan(5);
      expect(Number.isFinite(m.target)).toBe(true);
    }
  });
});

describe('election', () => {
  it('allocates exactly 70 seats by population', () => {
    const s = fresh();
    const seats = allocateSeats(s.air.pop);
    expect(Object.values(seats).reduce((a, b) => a + b, 0)).toBe(ELECTION.seats);
    const big = DISTRICTS.reduce((a, b) => ((s.air.pop[a.id] ?? 0) > (s.air.pop[b.id] ?? 0) ? a : b));
    expect(seats[big.id]).toBe(Math.max(...Object.values(seats)));
  });

  it('a strong term wins; good air alone does not', () => {
    const s = fresh(2);
    s.res.budget = 5e5;
    s.res.rp = 1e4;
    s.stage = 2;
    for (const id of ['monitor', 'dust', 'bus', 'greenery', 'waste', 'pr', 'industrial', 'parali'] as const) {
      for (let l = 0; l < 3; l++) {
        buyBuilding(s, id);
        finishAllConstruction(s);
      }
    }
    ticks(s, 2 * TICKS_PER_WEEK);
    s.res.trust = 80;
    const good = computeElection(s);
    expect(good.won).toBe(true);
    const bad = structuredClone(s);
    bad.res.trust = 0;
    bad.res.credibility = 5;
    bad.res.pressure = 100;
    const lost = computeElection(bad);
    expect(lost.won).toBe(false);
    expect(lost.voteShare).toBeLessThan(good.voteShare);
  });

  it('an idle term loses and the result is stored at week 52', () => {
    const s = newGame(4, 0);
    s.introDone = true;
    s.tutorialDone = true;
    ticks(s, 52 * TICKS_PER_WEEK + 1);
    expect(s.ended).not.toBeNull();
    expect(s.election).not.toBeNull();
    expect(s.election!.won).toBe(false);
    expect(s.election!.districts.reduce((t, d) => t + d.seats, 0)).toBe(70);
    expect(s.election!.weaknesses.length).toBeGreaterThan(0);
  });

  it('cleaner neighbourhoods vote more favourably', () => {
    const s = fresh();
    ticks(s, 1);
    const e = computeElection(s);
    const clean = e.districts.reduce((a, b) => (a.aqi < b.aqi ? a : b));
    const dirty = e.districts.reduce((a, b) => (a.aqi > b.aqi ? a : b));
    expect(clean.share).toBeGreaterThan(dirty.share);
  });
});

describe('persistence', () => {
  it('keeps the ledger and last settlement', () => {
    const st = new Mem();
    const s = fresh();
    ticks(s, TICKS_PER_WEEK + 20);
    save(st, s, 1);
    const r = load(st, 1);
    expect(r.state.settlement?.week).toBe(s.settlement?.week);
    expect(r.state.ledger.income).toBeCloseTo(s.ledger.income, 5);
  });
});
