import { CAMPAIGN_WEEKS, OFFLINE, SAVE_KEY, SAVE_VERSION, TICKS_PER_WEEK } from '../config/balance';
import { BUILDINGS } from '../config/balance';
import { newGame, step, takeWeekSnap } from './core';
import { liveMap, upkeepOf } from './build';
import { assessCity, initialCity } from './city';
import { districtBreakdown, districtFactors, updateAir } from './air';
import { computeMapStats } from './map';
import type { GameState, OfflineSummary } from './types';

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface SaveFile {
  version: number;
  savedAt: number;
  state: GameState;
}

export function serialize(s: GameState, now = Date.now()): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: now, state: { ...s, lastActive: now } };
  return JSON.stringify(file);
}

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Validate and migrate a parsed save. Returns null if it is unusable. */
export function validate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Partial<SaveFile>;
  if (!isNum(f.version) || !f.state || typeof f.state !== 'object') return null;
  if ((f.version as number) > SAVE_VERSION) return null;
  const st = f.state as Partial<GameState>;
  if (!isNum(st.tick) || !st.res || !st.buildings) return null;
  const r = st.res as unknown as Record<string, unknown>;
  for (const k of ['budget', 'rp', 'trust', 'pressure', 'credibility', 'capital', 'cac']) if (!isNum(r[k])) return null;
  // merge onto a fresh template so newly added fields get defaults (forward migration)
  const base = newGame(isNum(st.seed) ? (st.seed as number) : 1, isNum(st.lastActive) ? (st.lastActive as number) : Date.now());
  const merged: GameState = { ...base, ...st, res: { ...base.res, ...st.res }, stats: { ...base.stats, ...(st.stats ?? {}) }, buildings: { ...base.buildings } } as GameState;
  for (const b of BUILDINGS) {
    const lv = (st.buildings as Record<string, unknown>)[b.id];
    merged.buildings[b.id] = isNum(lv) ? Math.max(0, Math.min(b.levels.length, Math.floor(lv as number))) : 0;
  }
  for (const k of ['research', 'effects', 'events', 'eventHistory', 'news', 'history', 'weekly', 'objectives', 'achievements', 'stageObjectivesDone', 'committeesPending', 'phaseReports'] as const) {
    if (!Array.isArray(merged[k])) (merged as unknown as Record<string, unknown>)[k] = (base as unknown as Record<string, unknown>)[k];
  }
  const ce = merged.cityEdits as unknown as Record<string, unknown> | undefined;
  if (!ce || !Array.isArray(ce.placed) || !Array.isArray(ce.demolished) || !Array.isArray(ce.roads) || typeof ce.zones !== 'object' || !isNum(ce.nextUid)) {
    merged.cityEdits = base.cityEdits;
  }
  if (!merged.upgrading || typeof merged.upgrading !== 'object') merged.upgrading = {};
  // derived data is never trusted from disk
  merged.mapStats = computeMapStats(liveMap(merged), upkeepOf);
  const c = merged.city as unknown as Record<string, unknown> | undefined;
  if (!c || !isNum(c.population) || (c.population as number) <= 0 || typeof c.demand !== 'object') merged.city = initialCity(merged.mapStats);
  if (!Array.isArray(merged.proposals)) merged.proposals = [];
  if (!Array.isArray(merged.tipsSeen)) merged.tipsSeen = [];
  if (!merged.ledger || !isNum(merged.ledger.income) || !isNum(merged.ledger.expenses)) merged.ledger = { income: 0, expenses: 0 };
  const needSnap = !merged.weekSnap || !isNum(merged.weekSnap.aqi);
  if (merged.settlement === undefined) merged.settlement = null;
  if (merged.election === undefined) merged.election = null;
  if (!Array.isArray(merged.policies)) merged.policies = [];
  if (!Array.isArray(merged.delayed)) merged.delayed = [];
  merged.finance = { ...base.finance, ...(merged.finance ?? {}) };
  if (!Array.isArray(merged.finance.loans)) merged.finance.loans = [];
  merged.districts = districtBreakdown(liveMap(merged));
  assessCity(merged);
  updateAir(merged);
  merged.air.factors = districtFactors(merged.air, merged.air.shares);
  if (needSnap) merged.weekSnap = takeWeekSnap(merged);
  merged.version = SAVE_VERSION;
  return merged;
}

export type LoadResult = { state: GameState; status: 'loaded' | 'new' | 'corrupt' | 'outdated'; savedAt?: number };

export function load(storage: StorageLike, now = Date.now()): LoadResult {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return { state: newGame(undefined, now), status: 'new' };
  try {
    const parsed = JSON.parse(raw);
    // saves from the 4-week prototype use a different clock; start a fresh 52-week term
    if (parsed && typeof parsed.version === 'number' && parsed.version < SAVE_VERSION) {
      storage.removeItem(SAVE_KEY);
      return { state: newGame(undefined, now), status: 'outdated' };
    }
    const st = validate(parsed);
    if (!st) throw new Error('invalid');
    return { state: st, status: 'loaded', savedAt: (parsed as SaveFile).savedAt };
  } catch {
    storage.setItem(SAVE_KEY + '-corrupt-backup', raw);
    storage.removeItem(SAVE_KEY);
    return { state: newGame(undefined, now), status: 'corrupt' };
  }
}

export function save(storage: StorageLike, s: GameState, now = Date.now()) {
  storage.setItem(SAVE_KEY, serialize(s, now));
}

export function reset(storage: StorageLike) {
  storage.removeItem(SAVE_KEY);
}

/**
 * Offline progression. The calendar keeps moving (the department works while you sleep) but at
 * half efficiency, events are not spawned and pending events wait for you. Capped at 8 hours,
 * and never runs past the end of the term.
 */
export function applyOffline(s: GameState, now: number): { state: GameState; summary: OfflineSummary | null } {
  const elapsed = Math.floor((now - (s.lastActive ?? now)) / 1000);
  if (elapsed < 30 || (s.ended && !s.sandbox)) return { state: s, summary: null };
  const seconds = Math.min(elapsed, OFFLINE.maxSeconds);
  let ticks = Math.floor(seconds * OFFLINE.efficiency);
  ticks = Math.min(ticks, OFFLINE.maxWeeksOfIncome * TICKS_PER_WEEK);
  // never auto-finish the campaign while away
  const lastTick = CAMPAIGN_WEEKS * TICKS_PER_WEEK - 1;
  if (!s.sandbox) ticks = Math.max(0, Math.min(ticks, lastTick - s.tick));
  const next = structuredClone(s);
  const before = { ...next.res };
  for (let i = 0; i < ticks; i++) step(next, { offline: true });
  next.lastActive = now;
  const notes: string[] = [];
  if (next.res.budget < 0) notes.push('Maintenance outran income — the department is running an overdraft.');
  if (next.events.length) notes.push(`${next.events.length} event(s) are waiting for your decision.`);
  if (next.res.trust < before.trust - 3) notes.push('The air got worse and public patience thinned.');
  if (ticks === 0) notes.push('Nothing moved — the term is about to end and needs you present.');
  return {
    state: next,
    summary: { seconds, budget: next.res.budget - before.budget, rp: next.res.rp - before.rp, capital: next.res.capital - before.capital, trust: next.res.trust - before.trust, notes },
  };
}
