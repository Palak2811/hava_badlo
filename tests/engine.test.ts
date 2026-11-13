import { describe, expect, it } from 'vitest';
import { BUILDING_MAP, CAMPAIGN_WEEKS, ECONOMY, OPTICS, RESEARCH, SAVE_KEY, START, TICKS_PER_WEEK } from '../src/config/balance';
import { EVENTS, EVENT_MAP } from '../src/config/events';
import { ACHIEVEMENTS } from '../src/config/content';
import {
  actualAqi, advance, finishAllConstruction, agg, baselineAqi, buyBuilding, claimGrant, concToAqi, weekOf, doResearch, emissions, endingInput,
  evaluateEnding, incomePerWeek, maintenancePerWeek, newGame, officialAqi, opticsUnlocked, rates, reductionPct,
  researchStatus, resolveEvent, rollEvents, seasonOf, spawnEvent, step, steadyConc, executeOptics, type EndingInput,
} from '../src/engine/core';
import { applyOffline, load, save, serialize, validate, type StorageLike } from '../src/engine/save';
import { SOURCES, type GameState } from '../src/engine/types';

const fresh = (seed = 7) => {
  const s = newGame(seed, 0);
  s.tutorialDone = true;
  s.introDone = true;
  s.objectives = []; // isolate tests from daily-objective rewards
  return s;
};
/** Buy a facility and finish its construction immediately. */
const build = (s: GameState, id: Parameters<typeof buyBuilding>[1]) => {
  const r = buyBuilding(s, id);
  finishAllConstruction(s);
  return r;
};
const run = (s: GameState, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(s);
  return s;
};
class MemStorage implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('economy', () => {
  it('starts with configured resources', () => {
    const s = fresh();
    expect(s.res).toMatchObject(START);
    expect(s.res.budget).toBe(10000);
  });

  it('generates income automatically over time', () => {
    const s = fresh();
    const b0 = s.res.budget;
    const expected = rates(s).net;
    run(s, TICKS_PER_WEEK);
    // trust drifts slightly during the day so allow a small tolerance
    expect(s.res.budget - b0).toBeGreaterThan(expected * 0.9);
    expect(s.res.budget - b0).toBeLessThan(expected * 1.1 + 2000); // objectives may pay out
  });

  it('income scales with trust', () => {
    const s = fresh();
    s.res.trust = 100;
    const hi = incomePerWeek(s);
    s.res.trust = 0;
    const lo = incomePerWeek(s);
    expect(hi).toBeGreaterThan(lo);
    expect(hi - lo).toBeCloseTo(ECONOMY.baseIncomePerWeek * ECONOMY.trustIncomeSlope);
  });

  it('maintenance reduces net income and budget cannot fall below the debt floor', () => {
    const s = fresh();
    s.res.trust = 0;
    for (const id of Object.keys(s.buildings) as (keyof GameState['buildings'])[]) s.buildings[id] = BUILDING_MAP[id].levels.length;
    expect(maintenancePerWeek(s)).toBeGreaterThan(incomePerWeek(s));
    s.res.budget = 0;
    run(s, TICKS_PER_WEEK * 20);
    expect(s.res.budget).toBeGreaterThanOrEqual(ECONOMY.debtFloor);
  });
});

describe('buildings', () => {
  it('purchases deduct cost and set level', () => {
    const s = fresh();
    const r = build(s, 'monitor');
    expect(r.ok).toBe(true);
    expect(s.buildings.monitor).toBe(1);
    expect(s.res.budget).toBe(10000 - 2500 + 1000); // + First Building achievement
    expect(s.stats.buildingsBought).toBe(1);
  });

  it('rejects purchase with insufficient money and does not change state', () => {
    const s = fresh();
    s.res.budget = 100;
    const r = build(s, 'dust');
    expect(r.ok).toBe(false);
    expect(s.buildings.dust).toBe(0);
    expect(s.res.budget).toBe(100);
  });

  it('respects unlock conditions (day, building, stage)', () => {
    const s = fresh();
    expect(build(s, 'bus').ok).toBe(false); // day 3
    expect(build(s, 'industrial').ok).toBe(false); // needs monitor
    expect(build(s, 'parali').ok).toBe(false); // stage 2
    build(s, 'monitor');
    expect(build(s, 'industrial').ok).toBe(true);
  });

  it('upgrades raise level, need research for gated levels, and stop at max', () => {
    const s = fresh();
    s.res.budget = 1e6;
    s.res.rp = 1e4;
    for (let i = 0; i < 3; i++) expect(build(s, 'dust').ok).toBe(true);
    const gated = build(s, 'dust');
    expect(gated.ok).toBe(false);
    expect(gated.msg).toMatch(/research/i);
    s.research.push('a_network', 'a_dust');
    expect(build(s, 'dust').ok).toBe(true);
    expect(s.buildings.dust).toBe(4);
    const max = build(s, 'dust');
    expect(max.ok).toBe(false);
    expect(max.msg).toMatch(/maximum/i);
  });

  it('buildings actually reduce emissions and AQI', () => {
    const a = fresh();
    const b = fresh();
    b.res.budget = 1e6;
    build(b, 'dust');
    build(b, 'dust');
    build(b, 'waste');
    expect(emissions(b).dust).toBeLessThan(emissions(a).dust);
    run(a, 50);
    run(b, 50);
    expect(actualAqi(b)).toBeLessThan(actualAqi(a));
    expect(reductionPct(b)).toBeGreaterThan(0);
  });

  it('monitoring centre produces research points', () => {
    const s = fresh();
    build(s, 'monitor');
    const rp0 = s.res.rp;
    run(s, TICKS_PER_WEEK);
    expect(s.res.rp - rp0).toBeGreaterThanOrEqual(35);
  });
});

describe('pollution simulation', () => {
  it('maps concentration to AQI with band breakpoints', () => {
    expect(concToAqi(0)).toBe(0);
    expect(concToAqi(30)).toBe(50);
    expect(concToAqi(60)).toBe(100);
    expect(concToAqi(90)).toBe(200);
    expect(concToAqi(250)).toBe(400);
    expect(concToAqi(9999)).toBe(500);
  });

  it('keeps emissions, concentration and AQI distinct', () => {
    const s = fresh();
    const total = SOURCES.reduce((t, k) => t + emissions(s)[k], 0);
    expect(total).not.toBe(actualAqi(s));
    expect(s.conc).not.toBe(actualAqi(s));
  });

  it('winter is worse than late monsoon without intervention', () => {
    const s = fresh();
    const early = steadyConc(s, true);
    s.tick = 30 * TICKS_PER_WEEK;
    expect(seasonOf(weekOf(s)).id).toBe('winter');
    expect(steadyConc(s, true)).toBeGreaterThan(early);
  });

  it('is deterministic for a given seed', () => {
    const a = advance(fresh(99), 600);
    const b = advance(fresh(99), 600);
    expect(a.conc).toBe(b.conc);
    expect(a.events.map((e) => e.defId)).toEqual(b.events.map((e) => e.defId));
    expect(a.news.map((n) => n.headline)).toEqual(b.news.map((n) => n.headline));
  });

  it('control efficiency is capped', () => {
    const s = fresh();
    s.res.budget = 1e7;
    s.res.rp = 1e5;
    s.research = RESEARCH.map((r) => r.id);
    s.stage = 2;
    s.tick = 10 * TICKS_PER_WEEK;
    for (const id of Object.keys(s.buildings) as (keyof GameState['buildings'])[]) s.buildings[id] = BUILDING_MAP[id].levels.length;
    const a = agg(s);
    for (const k of SOURCES) expect(a.control[k]).toBeLessThanOrEqual(0.85);
  });
});

describe('research', () => {
  it('requires prerequisites and resources', () => {
    const s = fresh();
    expect(researchStatus(s, 'a_dust')).toBe('locked');
    expect(doResearch(s, 'a_dust').ok).toBe(false);
    expect(doResearch(s, 'a_network').ok).toBe(false); // 0 RP
    s.res.rp = 500;
    expect(doResearch(s, 'a_network').ok).toBe(true);
    expect(s.res.rp).toBe(460);
    expect(researchStatus(s, 'a_dust')).toBe('available');
    expect(doResearch(s, 'a_network').ok).toBe(false); // already done
  });

  it('research effects apply to the simulation', () => {
    const s = fresh();
    s.res.rp = 1000;
    s.res.budget = 1e5;
    const before = emissions(s).transport;
    doResearch(s, 'a_network');
    doResearch(s, 'a_traffic');
    expect(emissions(s).transport).toBeLessThan(before);
  });

  it('every research node is reachable', () => {
    const s = fresh();
    s.res = { ...s.res, rp: 1e6, budget: 1e7, capital: 1e4, cac: 1e4 };
    let progress = true;
    while (progress) {
      progress = false;
      for (const r of RESEARCH) if (researchStatus(s, r.id) === 'available' && doResearch(s, r.id).ok) progress = true;
    }
    expect(s.research.length).toBe(RESEARCH.length);
  });
});

describe('events', () => {
  it('has at least 15 events each with 2+ choices', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(15);
    for (const e of EVENTS) expect(e.choices.length).toBeGreaterThanOrEqual(2);
  });

  it('applies costs and consequences of a choice', () => {
    const s = fresh();
    spawnEvent(s, 'diwali');
    const uid = s.events[0].uid;
    const b0 = s.res.budget;
    const r = resolveEvent(s, uid, 0);
    expect(r.ok).toBe(true);
    expect(s.res.budget).toBe(b0 - 4000);
    expect(s.events.length).toBe(0);
    expect(s.effects.some((e) => e.id === 'ev_diwali')).toBe(true);
    expect(s.stats.eventsHandled).toBe(1);
  });

  it('choices are meaningfully different (ignore Diwali is worse for air)', () => {
    const good = fresh();
    const bad = fresh();
    for (const [s, i] of [[good, 0], [bad, 3]] as const) {
      spawnEvent(s, 'diwali');
      resolveEvent(s, s.events[0].uid, i);
    }
    expect(steadyConc(bad, false)).toBeGreaterThan(steadyConc(good, false));
  });

  it('rejects unaffordable choices', () => {
    const s = fresh();
    s.res.budget = 0;
    spawnEvent(s, 'diwali');
    expect(resolveEvent(s, s.events[0].uid, 0).ok).toBe(false);
    expect(s.events.length).toBe(1);
  });

  it('unanswered events auto-resolve with the last option', () => {
    const s = fresh();
    spawnEvent(s, 'traffic');
    run(s, TICKS_PER_WEEK * 2);
    expect(s.events.find((e) => e.defId === 'traffic')).toBeUndefined();
    const h = s.eventHistory.find((x) => x.defId === 'traffic')!;
    expect(h.choice).toBe(EVENT_MAP.traffic.choices.length - 1);
  });

  it('does not exceed the max simultaneous events and respects cooldowns', () => {
    const s = fresh();
    s.tick = 20 * TICKS_PER_WEEK;
    for (let i = 0; i < 50; i++) rollEvents(s);
    expect(s.events.length).toBeLessThanOrEqual(3);
    const ids = s.events.map((e) => e.defId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('scripted seasonal events fire on schedule', () => {
    const s = fresh();
    run(s, 16 * TICKS_PER_WEEK + 1);
    const seen = s.events.some((e) => e.defId === 'parali') || s.eventHistory.some((e) => e.defId === 'parali');
    expect(seen).toBe(true);
  });

  it('every choice of every event resolves without error', () => {
    for (const e of EVENTS) {
      e.choices.forEach((_, i) => {
        const s = fresh();
        s.res = { ...s.res, budget: 1e6, rp: 1e4, capital: 1e3 };
        spawnEvent(s, e.id);
        expect(resolveEvent(s, s.events[0].uid, i).ok).toBe(true);
      });
    }
  });
});

describe('optics / satire', () => {
  it('watering the monitor improves official AQI but not actual, and costs credibility', () => {
    const s = fresh();
    s.res.budget = 1e5;
    build(s, 'monitor');
    build(s, 'pr');
    const act = actualAqi(s);
    expect(executeOptics(s, 'water').ok).toBe(true);
    expect(officialAqi(s)).toBeLessThan(act);
    expect(actualAqi(s)).toBe(act);
    expect(s.res.credibility).toBe(92);
    expect(s.exposureRisk).toBeGreaterThan(0);
  });

  it('committees reduce pressure and produce a report later', () => {
    const s = fresh();
    s.res.budget = 1e5;
    build(s, 'pr');
    const p0 = s.res.pressure;
    expect(executeOptics(s, 'committee').ok).toBe(true);
    expect(s.res.pressure).toBe(p0 - 12);
    expect(s.stats.reports).toBe(0);
    run(s, 3 * TICKS_PER_WEEK + 1);
    expect(s.stats.reports).toBe(1);
  });

  it('enforces cooldowns and unlocks', () => {
    const s = fresh();
    s.res.budget = 1e5;
    expect(executeOptics(s, 'committee').ok).toBe(false); // no PR office
    build(s, 'pr');
    expect(executeOptics(s, 'committee').ok).toBe(true);
    expect(executeOptics(s, 'committee').ok).toBe(false); // cooldown
    expect(opticsUnlocked(s, 'victory')).toBe(false);
  });

  it('declaring victory with high actual AQI backfires', () => {
    const s = fresh();
    s.res = { ...s.res, budget: 1e5, capital: 100 };
    s.research.push('c_committee', 'c_press', 'c_pr', 'c_negotiate', 'c_media', 'c_reports', 'c_emergency');
    s.tick = 16 * TICKS_PER_WEEK;
    s.conc = 300;
    s.baselineConc = 300;
    expect(executeOptics(s, 'victory').ok).toBe(true);
    const trustAfterBoost = s.res.trust;
    run(s, 2 * TICKS_PER_WEEK + 1);
    expect(s.res.trust).toBeLessThan(trustAfterBoost - 15);
    expect(s.res.credibility).toBeLessThanOrEqual(75);
  });

  it('all 10 optics actions exist and can be executed once unlocked', () => {
    expect(OPTICS.length).toBe(10);
    const s = fresh();
    s.res = { ...s.res, budget: 1e6, capital: 1e3, rp: 1e4 };
    s.buildings.pr = 3;
    s.buildings.monitor = 1;
    s.research = RESEARCH.map((r) => r.id);
    for (const o of OPTICS) expect(executeOptics(s, o.id).ok).toBe(true);
    expect(s.stats.opticsUsed).toBe(10);
  });
});

describe('grants and clean air credits', () => {
  it('converts credits to budget only when enough are held', () => {
    const s = fresh();
    expect(claimGrant(s).ok).toBe(false);
    s.res.cac = 25;
    const b = s.res.budget;
    expect(claimGrant(s).ok).toBe(true);
    expect(s.res.budget).toBe(b + ECONOMY.grantBudget);
    expect(s.res.cac).toBe(5);
  });

  it('credits accrue only from real reduction', () => {
    const idle = run(fresh(), 120);
    expect(idle.res.cac).toBe(0);
    const s = fresh();
    s.res.budget = 1e5;
    build(s, 'dust');
    build(s, 'waste');
    run(s, 120);
    expect(s.res.cac).toBeGreaterThan(0);
  });
});

describe('save / load', () => {
  it('round-trips state through storage', () => {
    const st = new MemStorage();
    const s = fresh();
    build(s, 'monitor');
    run(s, 100);
    save(st, s, 1000);
    const r = load(st, 1000);
    expect(r.status).toBe('loaded');
    expect(r.state.buildings.monitor).toBe(1);
    expect(r.state.tick).toBe(s.tick);
    expect(r.state.res.budget).toBeCloseTo(s.res.budget);
  });

  it('replaces saves from an older clock version with a fresh term', () => {
    const st = new MemStorage();
    const f = JSON.parse(serialize(fresh()));
    f.version = 1;
    st.setItem(SAVE_KEY, JSON.stringify(f));
    const r = load(st);
    expect(r.status).toBe('outdated');
    expect(r.state.tick).toBe(0);
  });

  it('starts fresh when nothing is saved', () => {
    expect(load(new MemStorage()).status).toBe('new');
  });

  it('handles corrupted saves gracefully and keeps a backup', () => {
    const st = new MemStorage();
    st.setItem(SAVE_KEY, '{not json');
    const r = load(st);
    expect(r.status).toBe('corrupt');
    expect(st.getItem(SAVE_KEY + '-corrupt-backup')).toBe('{not json');
    expect(r.state.res.budget).toBe(10000);
  });

  it('rejects structurally invalid saves', () => {
    expect(validate(null)).toBeNull();
    expect(validate({ version: 1, state: { tick: 'x' } })).toBeNull();
    expect(validate({ version: 999, state: fresh() })).toBeNull();
    const bad = JSON.parse(serialize(fresh()));
    bad.state.res.budget = 'lots';
    expect(validate(bad)).toBeNull();
  });

  it('clamps out-of-range building levels and fills missing fields', () => {
    const f = JSON.parse(serialize(fresh()));
    f.state.buildings.dust = 99;
    delete f.state.news;
    const v = validate(f)!;
    expect(v.buildings.dust).toBe(4);
    expect(Array.isArray(v.news)).toBe(true);
  });
});

describe('offline progression', () => {
  it('produces resources while away and reports a summary', () => {
    const s = fresh();
    build(s, 'monitor');
    s.lastActive = 0;
    const { state, summary } = applyOffline(s, 600 * 1000);
    expect(summary).not.toBeNull();
    expect(state.tick).toBeGreaterThan(s.tick);
    expect(summary!.rp).toBeGreaterThan(0);
  });

  it('caps offline time at 8 hours and never ends the campaign', () => {
    const s = fresh();
    s.lastActive = 0;
    const { state, summary } = applyOffline(s, 100 * 3600 * 1000);
    expect(summary!.seconds).toBe(8 * 3600);
    expect(state.ended).toBeNull();
    s.tick = (CAMPAIGN_WEEKS - 1) * TICKS_PER_WEEK + 50;
    const late = applyOffline(s, 100 * 3600 * 1000).state;
    expect(late.ended).toBeNull();
    expect(late.tick).toBeLessThan(CAMPAIGN_WEEKS * TICKS_PER_WEEK);
  });

  it('handles negative net income offline without going below the debt floor', () => {
    const s = fresh();
    for (const id of Object.keys(s.buildings) as (keyof GameState['buildings'])[]) s.buildings[id] = BUILDING_MAP[id].levels.length;
    s.res.budget = 0;
    s.res.trust = 0;
    s.achievements = ACHIEVEMENTS.map((a) => a.id); // no reward windfalls
    s.lastActive = 0;
    const { state, summary } = applyOffline(s, 8 * 3600 * 1000);
    expect(state.res.budget).toBeGreaterThanOrEqual(ECONOMY.debtFloor);
    if (state.res.budget < 0) expect(summary!.notes.join(' ')).toMatch(/overdraft/);
    // a deeply indebted department with only upkeep and no trust stays clamped at the floor
    const broke = fresh();
    broke.buildings = { ...broke.buildings, monitor: 3, dust: 3, pr: 3 };
    broke.res.budget = ECONOMY.debtFloor;
    broke.res.trust = 0;
    broke.achievements = ACHIEVEMENTS.map((a) => a.id);
    broke.lastActive = 0;
    const r2 = applyOffline(broke, 3600 * 1000);
    expect(r2.state.res.budget).toBeGreaterThanOrEqual(ECONOMY.debtFloor);
  });

  it('ignores very short absences and does not spawn events offline', () => {
    const s = fresh();
    s.lastActive = 0;
    expect(applyOffline(s, 5000).summary).toBeNull();
    const { state } = applyOffline(s, 8 * 3600 * 1000);
    expect(state.events.length).toBe(0);
  });
});

describe('endings', () => {
  const base: EndingInput = { reduction: 0, trust: 50, credibility: 80, participation: 10, committees: 0, reports: 0, opticsUsed: 0, toughDecisions: 0, actualAqi: 380, officialAqi: 380 };
  it('Actual Hero', () => expect(evaluateEnding({ ...base, reduction: 40, trust: 70, credibility: 80 })).toBe('hero'));
  it("People's Officer", () => expect(evaluateEnding({ ...base, reduction: 40, participation: 60, toughDecisions: 5, credibility: 70 })).toBe('people'));
  it('Committee Specialist', () => expect(evaluateEnding({ ...base, committees: 4, reports: 3, reduction: 5 })).toBe('committee'));
  it('PR Champion', () => expect(evaluateEnding({ ...base, opticsUsed: 9, officialAqi: 200, reduction: 3 })).toBe('pr'));

  it('the campaign ends after the last day with an ending', () => {
    const s = fresh();
    run(s, CAMPAIGN_WEEKS * TICKS_PER_WEEK + 1);
    expect(s.ended).not.toBeNull();
    const t = s.tick;
    run(s, 100);
    expect(s.tick).toBe(t); // frozen after ending
    expect(endingInput(s).actualAqi).toBeGreaterThan(0);
  });

  it('sandbox continues after the ending', () => {
    const s = fresh();
    run(s, CAMPAIGN_WEEKS * TICKS_PER_WEEK + 1);
    s.sandbox = true;
    const t = s.tick;
    run(s, 10);
    expect(s.tick).toBe(t + 10);
  });
});

describe('progression & achievements', () => {
  it('awards First Building with a reward', () => {
    const s = fresh();
    const b = s.res.budget;
    build(s, 'pr');
    expect(s.achievements).toContain('first_building');
    expect(s.res.budget).toBe(b - 2000 + 1000);
  });

  it('stage 2 unlocks after stage 1 objectives or by week 14', () => {
    const s = fresh();
    run(s, 14 * TICKS_PER_WEEK + 1);
    expect(s.stage).toBe(2);
    expect(build({ ...s, res: { ...s.res, budget: 1e6, capital: 100 } } as GameState, 'parali').ok).toBe(true);
  });

  it('daily objectives refresh each day', () => {
    const s = fresh();
    run(s, TICKS_PER_WEEK);
    expect(s.objectives.length).toBeGreaterThanOrEqual(2);
    expect(s.objectives[0].id.endsWith('_2')).toBe(true);
  });

  it('baseline is unaffected by player buildings', () => {
    const a = fresh();
    const b = fresh();
    b.res.budget = 1e5;
    build(b, 'dust');
    run(a, 50);
    run(b, 50);
    expect(baselineAqi(a)).toBe(baselineAqi(b));
  });
});

describe('weeks', () => {
  it('produces a weekly report every 7 days with start/end snapshots', () => {
    const s = fresh();
    run(s, 13 * TICKS_PER_WEEK);
    expect(s.phaseReports.length).toBe(1);
    expect(s.reportPending).toBe(true);
    const r = s.phaseReports[0];
    expect(r.phase).toBe(1);
    expect(r.start.week).toBe(1);
    expect(r.end.week).toBe(14);
    expect(s.phaseStart.phase).toBe(2);
  });

  it('a full campaign is exactly four weeks with four reports', () => {
    const s = fresh();
    run(s, CAMPAIGN_WEEKS * TICKS_PER_WEEK + 1);
    expect(s.phaseReports.map((r) => r.phase)).toEqual([1, 2, 3, 4]);
    expect(s.ended).not.toBeNull();
  });
});
