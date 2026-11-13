import { describe, expect, it } from 'vitest';
import { SAVE_KEY, TICKS_PER_WEEK } from '../src/config/balance';
import { RECOVERY, REVENUE } from '../src/config/economy';
import { PROPOSAL_MAP } from '../src/config/approvals';
import { districtAqi, exposureAqi } from '../src/engine/air';
import { decideProposal, propose, repealPolicy, rollProposals } from '../src/engine/approvals';
import { checkPlacement, demolish, liveMap, placeBuilding } from '../src/engine/build';
import { assessCity } from '../src/engine/city';
import { actualAqi, finishAllConstruction, maintenancePerWeek, newGame, step } from '../src/engine/core';
import { financeModifier, recoveryOptions, revenueStreams, applyRecovery } from '../src/engine/economy';
import { COLS, DISTRICTS, ROWS } from '../src/engine/map';
import { load, save, type StorageLike } from '../src/engine/save';
import { concToAqi } from '../src/engine/core';
import type { GameState } from '../src/engine/types';

const fresh = (week = 12) => {
  const s = newGame(9, 0);
  s.introDone = true;
  s.tutorialDone = true;
  s.objectives = [];
  s.res.budget = 1e6;
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

describe('neighbourhood air quality', () => {
  it('industrial areas are worse than the Central Vista lawns', () => {
    const s = fresh();
    ticks(s, 1);
    expect(districtAqi(s.air, s.conc, 'okhla')).toBeGreaterThan(districtAqi(s.air, s.conc, 'centralvista'));
    expect(districtAqi(s.air, s.conc, 'narela')).toBeGreaterThan(districtAqi(s.air, s.conc, 'modeltown'));
  });

  it('city AQI is the population-weighted exposure', () => {
    const s = fresh();
    ticks(s, 1);
    let num = 0, den = 0;
    for (const d of DISTRICTS) {
      num += s.air.pop[d.id] * concToAqi(s.conc * s.air.factors[d.id]);
      den += s.air.pop[d.id];
    }
    expect(actualAqi(s)).toBe(Math.round(num / den));
    expect(actualAqi(s)).toBe(exposureAqi(s.air, s.conc));
  });

  it('closing Okhla factories cleans Okhla’s air', () => {
    const s = fresh();
    ticks(s, 1);
    const before = districtAqi(s.air, s.conc, 'okhla');
    for (const b of liveMap(s).buildings.filter((x) => x.kind === 'factory' && x.district === 'okhla')) demolish(s, b.id);
    ticks(s, 1);
    expect(s.air.factors.okhla).toBeLessThan(1e9);
    expect(districtAqi(s.air, s.conc, 'okhla')).toBeLessThan(before);
  });

  it('parks give local relief', () => {
    const s = fresh();
    ticks(s, 1);
    const d = 'modeltown';
    const f0 = s.air.factors[d];
    let n = 0;
    for (let y = 0; y < ROWS && n < 3; y++) for (let x = 0; x < COLS && n < 3; x++) {
      const m = liveMap(s);
      if (DISTRICTS.find((q) => q.id === d && x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h) && checkPlacement(s, m, 'park', x, y).ok) {
        placeBuilding(s, 'park', x, y);
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
    finishAllConstruction(s);
    ticks(s, 1);
    expect(s.air.relief[d]).toBeGreaterThan(0);
    expect(s.air.factors[d]).toBeLessThan(f0);
  });
});

describe('revenue', () => {
  it('property tax grows with residents', () => {
    const s = fresh();
    const p = (x: GameState) => revenueStreams(x).find((l) => l.id === 'property')!.amount;
    const a = p(s);
    s.city.population *= 1.2;
    expect(p(s)).toBeCloseTo(a * 1.2, 5);
    expect(a).toBeCloseTo(s.city.population / 1.2 * REVENUE.propertyTaxPerResident, 5);
  });

  it('streams feed weekly income', () => {
    const s = fresh();
    const total = revenueStreams(s).reduce((t, l) => t + l.amount, 0);
    expect(financeModifier(s).incomePerWeek).toBeCloseTo(total, 5);
    expect(total).toBeGreaterThan(500);
  });
});

describe('financial recovery', () => {
  it('a loan adds money now and repayments every week until repaid', () => {
    const s = fresh();
    const m0 = maintenancePerWeek(s);
    const b0 = s.res.budget;
    expect(applyRecovery(s, 'loan').ok).toBe(true);
    expect(s.res.budget).toBe(b0 + RECOVERY.loan.principal);
    expect(maintenancePerWeek(s)).toBeCloseTo(m0 + RECOVERY.loan.perWeek, 5);
    ticks(s, RECOVERY.loan.weeks * TICKS_PER_WEEK + 1);
    expect(s.finance.loans.length).toBe(0);
  });

  it('the emergency grant needs an empty treasury and works once per quarter', () => {
    const s = fresh();
    expect(applyRecovery(s, 'grant').ok).toBe(false);
    s.res.budget = 1000;
    expect(applyRecovery(s, 'grant').ok).toBe(true);
    s.res.budget = 1000;
    expect(applyRecovery(s, 'grant').ok).toBe(false);
    expect(recoveryOptions(s).find((o) => o.id === 'grant')!.reason).toMatch(/quarter/);
  });

  it('spending cuts lower upkeep for a while', () => {
    const s = fresh();
    s.buildings.monitor = 2;
    const m0 = maintenancePerWeek(s);
    expect(applyRecovery(s, 'cuts').ok).toBe(true);
    expect(maintenancePerWeek(s)).toBeLessThan(m0);
    expect(applyRecovery(s, 'cuts').ok).toBe(false);
  });
});

describe('approvals', () => {
  it('a factory permit pays now and builds on its site', () => {
    const s = fresh();
    const p = propose(s, 'factory')!;
    expect(p.site).toBeDefined();
    const b0 = s.res.budget;
    expect(decideProposal(s, p.uid, true).ok).toBe(true);
    expect(s.res.budget).toBe(b0 + 6000);
    const placed = s.cityEdits.placed.find((x) => x.x === p.site!.x && x.y === p.site!.y)!;
    expect(placed.kind).toBe('factory');
    expect(s.proposals.length).toBe(0);
  });

  it('rejecting has consequences too', () => {
    const s = fresh();
    const p = propose(s, 'factory')!;
    const pr = s.res.pressure;
    decideProposal(s, p.uid, false);
    expect(s.res.pressure).toBe(pr + 2);
  });

  it('unanswered proposals lapse as rejections', () => {
    const s = fresh();
    propose(s, 'mall');
    ticks(s, 3 * TICKS_PER_WEEK + 1);
    expect(s.proposals.find((x) => x.templateId === 'mall')).toBeUndefined();
  });

  it('a congestion charge cuts car trips and earns money until repealed', () => {
    const s = fresh();
    const trips0 = s.city.traffic.privateTrips;
    const p = propose(s, 'congestion')!;
    decideProposal(s, p.uid, true);
    assessCity(s);
    expect(s.city.traffic.privateTrips).toBeLessThan(trips0);
    expect(revenueStreams(s).some((l) => l.id === 'congestion')).toBe(true);
    const t = s.res.trust;
    expect(repealPolicy(s, 'congestion').ok).toBe(true);
    expect(s.res.trust).toBe(t + 3);
    expect(revenueStreams(s).some((l) => l.id === 'congestion')).toBe(false);
  });

  it('sponsorship money now, scandal later', () => {
    const s = fresh();
    const p = propose(s, 'sponsor')!;
    const c0 = s.res.credibility;
    decideProposal(s, p.uid, true);
    expect(s.res.credibility).toBe(c0 - 10);
    expect(s.delayed.length).toBe(1);
    const trust = s.res.trust;
    s.delayed[0].at = s.tick + 1;
    ticks(s, 2);
    expect(s.delayed.length).toBe(0);
    expect(s.res.trust).toBeLessThan(trust);
  });

  it('the relocation scheme costs money and pays off later', () => {
    const s = fresh();
    const p = propose(s, 'relocate')!;
    s.res.budget = 100;
    expect(decideProposal(s, p.uid, true).ok).toBe(false);
    s.res.budget = 1e6;
    expect(decideProposal(s, p.uid, true).ok).toBe(true);
    expect(s.policies.some((x) => x.id === 'relocation')).toBe(true);
    s.delayed[0].at = s.tick + 1;
    ticks(s, 2);
    expect(s.policies.some((x) => x.id === 'industrialpark')).toBe(true);
  });

  it('repealing a subsidy early cancels its delayed benefit', () => {
    const s = fresh();
    const p = propose(s, 'cleantech')!;
    decideProposal(s, p.uid, true);
    expect(s.delayed.length).toBe(1);
    repealPolicy(s, 'cleantech');
    expect(s.delayed.length).toBe(0);
  });

  it('proposals keep arriving over the term, deterministically', () => {
    const a = fresh(2), b = fresh(2);
    for (let w = 0; w < 20; w++) {
      rollProposals(a);
      rollProposals(b);
    }
    expect(a.proposals.map((p) => p.templateId)).toEqual(b.proposals.map((p) => p.templateId));
    expect(a.proposals.length).toBeGreaterThan(0);
    expect(a.proposals.length).toBeLessThanOrEqual(3);
    for (const p of a.proposals) expect(PROPOSAL_MAP[p.templateId]).toBeDefined();
  });
});

describe('persistence', () => {
  it('saves proposals, policies, delayed effects and loans', () => {
    const st = new Mem();
    const s = fresh();
    const p = propose(s, 'congestion')!;
    decideProposal(s, p.uid, true);
    propose(s, 'parkingfees');
    applyRecovery(s, 'loan');
    const sp = propose(s, 'sponsor')!;
    decideProposal(s, sp.uid, true);
    save(st, s, 1);
    const r = load(st, 1);
    expect(r.state.policies.map((x) => x.id)).toContain('congestion');
    expect(r.state.proposals.map((x) => x.templateId)).toContain('parkingfees');
    expect(r.state.delayed.length).toBe(1);
    expect(r.state.finance.loans.length).toBe(1);
    expect(Object.keys(r.state.air.factors).length).toBe(DISTRICTS.length);
    expect(st.getItem(SAVE_KEY)).toBeTruthy();
  });
});
