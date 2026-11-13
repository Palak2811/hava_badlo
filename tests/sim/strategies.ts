/**
 * Scripted players for automated playtests. They use only public engine actions, the same
 * ones the UI calls, so balance results reflect what a human could actually do.
 */
import { BUILDINGS, OPTICS, RESEARCH, TICKS_PER_WEEK } from '../../src/config/balance';
import { PROPOSAL_MAP } from '../../src/config/approvals';
import { EVENT_MAP } from '../../src/config/events';
import { checkPlacement, liveMap, placeBuilding } from '../../src/engine/build';
import {
  actualAqi, buyBuilding, canAfford, doResearch, executeOptics, newGame, nextLevelInfo, opticsCost, opticsReadyIn, opticsUnlocked,
  researchStatus, resolveEvent, step, weekOf,
} from '../../src/engine/core';
import { decideProposal } from '../../src/engine/approvals';
import { applyRecovery } from '../../src/engine/economy';
import { COLS, ROWS } from '../../src/engine/map';
import type { BuildingId, GameState, Placeable } from '../../src/engine/types';

export type Strategy = { name: string; week: (s: GameState) => void };

const buyIfCan = (s: GameState, id: BuildingId, reserve = 3000) => {
  const n = nextLevelInfo(s, id);
  if (!n || s.upgrading[id]) return false;
  if ((n.cost.budget ?? 0) + reserve > s.res.budget) return false;
  return buyBuilding(s, id).ok;
};

const researchCheapest = (s: GameState, branches: string[]) => {
  const avail = RESEARCH.filter((r) => branches.includes(r.branch) && researchStatus(s, r.id) === 'available' && canAfford(s, r.cost))
    .sort((a, b) => (a.cost.rp ?? 0) - (b.cost.rp ?? 0));
  if (avail[0]) doResearch(s, avail[0].id);
};

/** pick the event choice a given temperament prefers, falling back to anything affordable */
const decideEvents = (s: GameState, prefer: 'first' | 'cheapest') => {
  for (const ev of [...s.events]) {
    const d = EVENT_MAP[ev.defId];
    const order = prefer === 'first' ? d.choices.map((_, i) => i) : d.choices.map((c, i) => ({ i, c: c.cost?.budget ?? 0 })).sort((a, b) => a.c - b.c).map((x) => x.i);
    for (const i of order) if (resolveEvent(s, ev.uid, i).ok) break;
  }
};

const placeSome = (s: GameState, kind: Placeable, max: number, reserve: number) => {
  let n = 0;
  const m = liveMap(s);
  for (let y = 0; y < ROWS && n < max; y++) for (let x = 0; x < COLS && n < max; x++) {
    if (s.res.budget < reserve) return;
    if (checkPlacement(s, m, kind, x, y).ok && placeBuilding(s, kind, x, y).ok) n++;
  }
};

export const STRATEGIES: Strategy[] = [
  { name: 'idle', week: () => undefined },
  {
    name: 'green',
    week: (s) => {
      const order: BuildingId[] = ['monitor', 'dust', 'waste', 'greenery', 'bus', 'industrial', 'parali', 'pr'];
      for (const id of order) buyIfCan(s, id, 4000);
      researchCheapest(s, ['A', 'B']);
      decideEvents(s, 'first');
      for (const p of [...s.proposals]) {
        const good = ['congestion', 'fines', 'cleantech', 'relocate', 'housing', 'parkingfees'].includes(p.templateId);
        decideProposal(s, p.uid, good);
      }
      if (weekOf(s) % 4 === 0) placeSome(s, 'park', 1, 15000);
      if (weekOf(s) % 6 === 0) placeSome(s, 'busstop', 2, 12000);
    },
  },
  {
    name: 'pr',
    week: (s) => {
      for (const id of ['pr', 'monitor'] as BuildingId[]) buyIfCan(s, id, 1000);
      researchCheapest(s, ['C']);
      for (const o of OPTICS) if (opticsUnlocked(s, o.id) && opticsReadyIn(s, o.id) === 0 && canAfford(s, opticsCost(s, o.id))) executeOptics(s, o.id);
      decideEvents(s, 'cheapest');
      for (const p of [...s.proposals]) decideProposal(s, p.uid, ['sponsor', 'waiver', 'mall', 'factory'].includes(p.templateId));
    },
  },
  {
    name: 'balanced',
    week: (s) => {
      for (const id of ['monitor', 'dust', 'bus', 'pr'] as BuildingId[]) buyIfCan(s, id, 8000);
      researchCheapest(s, ['A']);
      decideEvents(s, 'cheapest');
      for (const p of [...s.proposals]) decideProposal(s, p.uid, !['sponsor', 'waiver'].includes(p.templateId));
    },
  },
  {
    name: 'builder-only',
    week: (s) => {
      for (const id of ['monitor', 'dust', 'waste', 'greenery', 'bus', 'industrial', 'parali'] as BuildingId[]) buyIfCan(s, id, 4000);
      researchCheapest(s, ['A']);
    },
  },
  {
    name: 'industrialist',
    week: (s) => {
      for (const p of [...s.proposals]) decideProposal(s, p.uid, (PROPOSAL_MAP[p.templateId].approve(p.amount).budget ?? 0) > 0);
      buyIfCan(s, 'monitor', 20000);
      decideEvents(s, 'cheapest');
      if (s.res.budget < 3000) applyRecovery(s, 'loan');
    },
  },
];

export interface PlaytestResult {
  strategy: string;
  won: boolean;
  seats: number;
  vote: number;
  aqi: number;
  baseline: number;
  trust: number;
  budget: number;
  minBudget: number;
  maxBudget: number;
  ending: string;
  facilityLevels: number;
}

export function playtest(strategy: Strategy, seed = 7): PlaytestResult {
  const s = newGame(seed, 0);
  s.introDone = true;
  s.tutorialDone = true;
  let minBudget = s.res.budget, maxBudget = s.res.budget;
  while (!s.ended) {
    if (s.tick % TICKS_PER_WEEK === 1) {
      strategy.week(s);
      s.reportPending = false;
    }
    step(s);
    minBudget = Math.min(minBudget, s.res.budget);
    maxBudget = Math.max(maxBudget, s.res.budget);
  }
  const e = s.election!;
  return {
    strategy: strategy.name, won: e.won, seats: e.seatsWon, vote: Math.round(e.voteShare * 10) / 10, aqi: actualAqi(s),
    baseline: s.weekly[s.weekly.length - 1]?.baseline ?? 0, trust: Math.round(s.res.trust), budget: Math.round(s.res.budget),
    minBudget: Math.round(minBudget), maxBudget: Math.round(maxBudget), ending: s.ended!, facilityLevels: BUILDINGS.reduce((t, b) => t + s.buildings[b.id], 0),
  };
}
