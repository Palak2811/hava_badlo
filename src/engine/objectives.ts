/**
 * Weekly objectives. Each week mixes one air goal, one city goal and one action, so objectives
 * point at the systems that matter (neighbourhood air, trust, revenue, transit, traffic, approvals)
 * without dictating a strategy.
 */
import { DISTRICTS } from './map';
import { districtAqi } from './air';
import { actualAqi, applyDeltas, weekOf } from './core';
import { nextRandom } from './rng';
import type { DailyObjective, Deltas, GameState } from './types';

type Kind = 'counter' | 'weekEnd';
interface Template {
  id: string;
  group: 'air' | 'city' | 'action';
  kind: Kind;
  /** build a concrete objective, or null if it does not make sense right now */
  make: (s: GameState, week: number) => { label: string; target: number; param?: string; reward: Deltas } | null;
  /** counter: the running total; the objective completes when it rises by `target` */
  metric?: (s: GameState) => number;
  /** weekEnd: checked once, when the week settles */
  check?: (s: GameState, o: DailyObjective) => boolean;
}

const projects = (s: GameState) => s.stats.buildingsBought + s.stats.upgradesBought + s.stats.projectsCompleted;

export const OBJECTIVES: Template[] = [
  /* ---------------- air */
  {
    id: 'aqi', group: 'air', kind: 'weekEnd',
    make: (s) => {
      const target = Math.max(100, Math.round((actualAqi(s) + 10) / 10) * 10);
      return { label: `End the week with city AQI ≤ ${target}`, target, reward: { budget: 1500, trust: 2 } };
    },
    check: (s, o) => actualAqi(s) <= o.target,
  },
  {
    id: 'district', group: 'air', kind: 'weekEnd',
    make: (s, week) => {
      if (week < 3) return null;
      // the most polluted neighbourhood where people actually live
      const ranked = DISTRICTS.filter((d) => (s.air.pop[d.id] ?? 0) > 3000).sort((a, b) => districtAqi(s.air, s.conc, b.id) - districtAqi(s.air, s.conc, a.id));
      const d = ranked[0];
      if (!d) return null;
      const target = Math.max(100, Math.round((districtAqi(s.air, s.conc, d.id) - 5) / 5) * 5);
      return { label: `Bring ${d.name}’s AQI to ${target} or below`, target, param: d.id, reward: { budget: 2500, trust: 3 } };
    },
    check: (s, o) => districtAqi(s.air, s.conc, o.param!) <= o.target,
  },
  /* ---------------- city */
  {
    id: 'trust', group: 'city', kind: 'weekEnd',
    make: (s) => {
      const target = Math.max(40, Math.floor(s.res.trust / 5) * 5);
      return { label: `Keep public trust at ${target}% or more`, target, reward: { capital: 3 } };
    },
    check: (s, o) => s.res.trust >= o.target,
  },
  {
    id: 'revenue', group: 'city', kind: 'weekEnd',
    make: (s, week) => {
      if (week < 2 || !s.settlement) return null;
      const target = Math.max(500, Math.round((s.settlement.net * 1.05) / 100) * 100);
      return { label: `Settle the week with ₹${target.toLocaleString('en-IN')}+ net income`, target, reward: { capital: 2, trust: 1 } };
    },
    check: (s, o) => (s.settlement?.net ?? 0) >= o.target,
  },
  {
    id: 'transit', group: 'city', kind: 'weekEnd',
    make: (s, week) => {
      if (week < 4) return null;
      const target = Math.round(s.city.traffic.ptShare * 100) + 2;
      if (target > 64) return null;
      return { label: `Raise public transport to ${target}% of trips`, target, reward: { budget: 2000 } };
    },
    check: (s, o) => Math.round(s.city.traffic.ptShare * 100) >= o.target,
  },
  {
    id: 'congestion', group: 'city', kind: 'weekEnd',
    make: (s, week) => {
      if (week < 6) return null;
      const target = Math.round((s.city.traffic.congestion - 0.03) * 100) / 100;
      return { label: `Ease traffic: congestion below ${target.toFixed(2)}`, target, reward: { budget: 1500, trust: 1 } };
    },
    check: (s, o) => s.city.traffic.congestion < o.target,
  },
  /* ---------------- action */
  {
    id: 'build', group: 'action', kind: 'counter', metric: projects,
    make: (_s, week) => {
      const t = week < 14 ? 1 : 2;
      return { label: `Complete ${t} construction project${t > 1 ? 's' : ''}`, target: t, reward: { budget: 800 + week * 40 } };
    },
  },
  {
    id: 'research', group: 'action', kind: 'counter', metric: (s) => s.research.length,
    make: (s) => (s.buildings.monitor > 0 ? { label: 'Complete a research project', target: 1, reward: { rp: 20 } } : null),
  },
  {
    id: 'events', group: 'action', kind: 'counter', metric: (s) => s.stats.eventsHandled,
    make: () => ({ label: 'Take a decision on a city event', target: 1, reward: { capital: 2 } }),
  },
  {
    id: 'decide', group: 'action', kind: 'counter', metric: (s) => s.stats.proposalsDecided,
    make: (s) => (s.proposals.length ? { label: 'Decide on a pending proposal', target: 1, reward: { capital: 2, budget: 500 } } : null),
  },
  {
    id: 'industry', group: 'action', kind: 'counter', metric: (s) => s.stats.industryDecisions,
    make: (_s, week) => (week >= 5 ? { label: 'Resolve an industrial pollution issue', target: 1, reward: { trust: 2, capital: 2 } } : null),
  },
  {
    id: 'cac', group: 'action', kind: 'counter', metric: (s) => s.stats.cacEarned,
    make: (_s, week) => {
      const t = Math.max(2, Math.round(week / 5));
      return { label: `Earn ${t} Clean Air Credits`, target: t, reward: { trust: 2, budget: 600 } };
    },
  },
];
export const OBJECTIVE_MAP = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o])) as Record<string, Template>;

function pickFrom(s: GameState, group: Template['group'], week: number) {
  const pool = OBJECTIVES.filter((t) => t.group === group);
  const start = Math.floor(nextRandom(s) * pool.length);
  for (let k = 0; k < pool.length; k++) {
    const t = pool[(start + k) % pool.length];
    const made = t.make(s, week);
    if (made) return { t, made };
  }
  return null;
}

/** Live reading for "at week end" objectives, e.g. "now 312". */
export function objectiveProgress(s: GameState, o: DailyObjective): string | null {
  switch (o.templateId) {
    case 'aqi': return `now ${actualAqi(s)}`;
    case 'district': return `now ${districtAqi(s.air, s.conc, o.param!)}`;
    case 'trust': return `now ${Math.round(s.res.trust)}%`;
    case 'transit': return `now ${Math.round(s.city.traffic.ptShare * 100)}%`;
    case 'congestion': return `now ${s.city.traffic.congestion.toFixed(2)}`;
    case 'revenue': return `this week so far ₹${Math.round(s.ledger.income - s.ledger.expenses).toLocaleString('en-IN')}`;
    default: {
      const t = OBJECTIVE_MAP[o.templateId];
      if (t?.kind !== 'counter' || o.target <= 1) return null;
      return `${Math.min(o.target, Math.floor(t.metric!(s) - o.start))}/${o.target}`;
    }
  }
}

export function rollWeeklyObjectives(s: GameState) {
  const week = weekOf(s);
  const out: DailyObjective[] = [];
  for (const group of ['air', 'city', 'action'] as const) {
    if (group === 'air' && week < 2) continue;
    const p = pickFrom(s, group, week);
    if (!p) continue;
    out.push({ id: `${p.t.id}_${week}`, templateId: p.t.id, label: p.made.label, target: p.made.target, param: p.made.param, start: p.t.metric ? p.t.metric(s) : 0, reward: p.made.reward, done: false });
  }
  s.objectives = out;
}

export function evaluateObjectives(s: GameState, weekEnd: boolean) {
  for (const o of s.objectives) {
    if (o.done) continue;
    const t = OBJECTIVE_MAP[o.templateId];
    if (!t) continue;
    const done = t.kind === 'counter' ? (t.metric!(s) - o.start >= o.target) : weekEnd && t.check!(s, o);
    if (done) {
      o.done = true;
      s.stats.objectivesDone += 1;
      applyDeltas(s, o.reward);
    }
  }
}
