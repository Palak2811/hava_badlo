/**
 * Pure simulation engine. No DOM, no rendering — fully deterministic given a seed.
 *
 * Pollution model (illustrative, NOT official data):
 *   emission_i   = base_i × seasonMult_i × tempEmissionMult_i × (1 − control_i)
 *   C*           = emissionToConc × Σ emission_i / (seasonDispersion × wind × tempDispersionMult)
 *   C(t+1)       = C(t) + (C* − C(t)) × relaxation          (atmosphere responds gradually)
 *   AQI          = piecewise-linear map of C through NAQI-style PM2.5 breakpoints
 *   officialAQI  = AQI × (1 − perceptionBias)                (optics, not physics)
 * A parallel "baseline" concentration evolves with zero player controls to measure impact.
 */
import {
  AQI_BREAKPOINTS, BUILDINGS, BUILDING_MAP, CAMPAIGN_DAYS, DAYS_PER_WEEK, COMMITTEE, CREDIBILITY, ECONOMY, EVENTS_CFG,
  OPTICS, OPTICS_MAP, POLLUTION, PRESSURE, RESEARCH, RESEARCH_MAP, SAVE_VERSION, SEASONS, STAGE2_AUTO_DAY,
  STAGE2_GRANT, START, START_PARTICIPATION, TICKS_PER_DAY, TRUST, VICTORY, type SeasonDef,
} from '../config/balance';
import { EVENTS, EVENT_MAP, type EventCtx } from '../config/events';
import { ACHIEVEMENTS, NEWS_TEMPLATES, OBJECTIVE_TEMPLATES, STAGE_OBJECTIVES } from '../config/content';
import { nextRandom } from './rng';
import { SOURCES, type WeekSnap, type BuildingId, type Cost, type Deltas, type EndingId, type GameState, type Modifier, type NewsKind, type Source } from './types';

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ setup */

export function newGame(seed = Date.now() % 2147483647, now = Date.now()): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    rngState: seed || 1,
    tick: 0,
    speed: 1,
    res: { ...START },
    participation: START_PARTICIPATION,
    exposureRisk: 0,
    buildings: { monitor: 0, dust: 0, bus: 0, greenery: 0, industrial: 0, waste: 0, parali: 0, pr: 0 },
    builtAt: {},
    research: [],
    conc: POLLUTION.startConc,
    baselineConc: POLLUTION.startConc,
    windFactor: 1,
    effects: [],
    events: [],
    eventHistory: [],
    eventCooldown: {},
    opticsCooldown: {},
    committeesPending: [],
    victoryCheckAt: null,
    news: [],
    newsSeq: 0,
    history: [],
    daily: [],
    objectives: [],
    stage: 1,
    stageObjectivesDone: [],
    achievements: [],
    stats: {
      highestAqi: 0, lowestAqi: 999, totalSpent: 0, eventsHandled: 0, opticsUsed: 0, committees: 0, reports: 0,
      purifiers: 0, toughDecisions: 0, exposures: 0, buildingsBought: 0, upgradesBought: 0, cacEarned: 0, aqiReductionDays: 0, objectivesDone: 0,
    },
    ended: null,
    sandbox: false,
    tutorialDone: false,
    lastActive: now,
    aqiRenamed: false,
    pressureMaxedDays: 0,
    lastOpticsDay: 0,
    weekStart: null as unknown as WeekSnap,
    weekReports: [],
    reportPending: false,
    briefingSeen: 0,
  };
  // settle the atmosphere to day-1 steady state
  const target = steadyConc(s, false);
  s.conc = target;
  s.baselineConc = steadyConc(s, true);
  s.weekStart = weekSnap(s);
  rollDailyObjectives(s);
  addNews(s, 'gov', 'New Commissioner Appointed to Department of Clean Air; Department Consists of One Desk', 'Your office has a chair, a kettle and a view of the smog. Let us begin.');
  sample(s);
  return s;
}

/* -------------------------------------------------------------- calendar */

export const dayOf = (s: GameState) => Math.floor(s.tick / TICKS_PER_DAY) + 1;
export const timeOfDay = (s: GameState) => (s.tick % TICKS_PER_DAY) / TICKS_PER_DAY;
export function seasonOf(day: number): SeasonDef {
  let cur = SEASONS[0];
  for (const se of SEASONS) if (day >= se.fromDay) cur = se;
  return cur;
}

/* -------------------------------------------------------------- modifiers */

/** Collect every active modifier: building levels, research, temporary effects. */
export function collectModifiers(s: GameState): Modifier[] {
  const mods: Modifier[] = [];
  for (const b of BUILDINGS) {
    const lvl = s.buildings[b.id];
    if (lvl <= 0) continue;
    const m = b.levels[lvl - 1].modifier;
    if (b.maturityDays && m.control) {
      const age = (s.tick - (s.builtAt[b.id] ?? s.tick)) / TICKS_PER_DAY;
      const f = clamp(0.25 + age / b.maturityDays, 0.25, 1);
      const control: Partial<Record<Source, number>> = {};
      for (const k of Object.keys(m.control) as Source[]) control[k] = (m.control[k] ?? 0) * f;
      mods.push({ ...m, control });
    } else mods.push(m);
  }
  for (const id of s.research) {
    const r = RESEARCH_MAP[id];
    if (r) mods.push(r.modifier);
  }
  if (s.stats.purifiers > 0) mods.push({ control: { other: Math.min(0.05, 0.005 * s.stats.purifiers) } });
  for (const e of s.effects) mods.push(e.modifier);
  return mods;
}

export interface Aggregate {
  control: Record<Source, number>;
  emissionMult: Record<Source, number>;
  dispersionMult: number;
  incomePerDay: number;
  incomeMult: number;
  maintenanceMult: number;
  researchPerDay: number;
  researchMult: number;
  trustPerDay: number;
  pressurePerDay: number;
  capitalPerDay: number;
  participationPerDay: number;
  perceptionBias: number;
  eventSeverityMult: number;
  coverage: number;
}

export function aggregate(mods: Modifier[]): Aggregate {
  const keep: Record<Source, number> = { transport: 1, dust: 1, industry: 1, agriculture: 1, waste: 1, other: 1 };
  const em: Record<Source, number> = { transport: 1, dust: 1, industry: 1, agriculture: 1, waste: 1, other: 1 };
  const a: Aggregate = {
    control: { ...keep }, emissionMult: em, dispersionMult: 1, incomePerDay: 0, incomeMult: 1, maintenanceMult: 1,
    researchPerDay: 0, researchMult: 1, trustPerDay: 0, pressurePerDay: 0, capitalPerDay: 0, participationPerDay: 0,
    perceptionBias: 0, eventSeverityMult: 1, coverage: 0,
  };
  for (const m of mods) {
    if (m.control) for (const k of SOURCES) if (m.control[k]) keep[k] *= 1 - (m.control[k] as number);
    if (m.emissionMult) for (const k of SOURCES) if (m.emissionMult[k] !== undefined) em[k] *= m.emissionMult[k] as number;
    if (m.dispersionMult) a.dispersionMult *= m.dispersionMult;
    a.incomePerDay += m.incomePerDay ?? 0;
    if (m.incomeMult) a.incomeMult *= m.incomeMult;
    if (m.maintenanceMult) a.maintenanceMult *= m.maintenanceMult;
    a.researchPerDay += m.researchPerDay ?? 0;
    if (m.researchMult) a.researchMult *= m.researchMult;
    a.trustPerDay += m.trustPerDay ?? 0;
    a.pressurePerDay += m.pressurePerDay ?? 0;
    a.capitalPerDay += m.capitalPerDay ?? 0;
    a.participationPerDay += m.participationPerDay ?? 0;
    a.perceptionBias += m.perceptionBias ?? 0;
    if (m.eventSeverityMult) a.eventSeverityMult *= m.eventSeverityMult;
    a.coverage += m.coverage ?? 0;
  }
  for (const k of SOURCES) a.control[k] = clamp(1 - keep[k], 0, POLLUTION.maxControl);
  a.perceptionBias = clamp(a.perceptionBias, 0, 0.6);
  a.coverage = clamp(a.coverage, 0, 100);
  return a;
}

export const agg = (s: GameState) => aggregate(collectModifiers(s));

/* -------------------------------------------------------------- pollution */

export function emissions(s: GameState, baseline = false, a: Aggregate = agg(s)): Record<Source, number> {
  const se = seasonOf(dayOf(s));
  // natural (non-player) emission spikes like Diwali apply to both worlds; player reductions only to actual
  const out = {} as Record<Source, number>;
  for (const k of SOURCES) {
    const tempMult = baseline ? naturalMult(s, k) : a.emissionMult[k];
    const ctrl = baseline ? 0 : a.control[k];
    out[k] = POLLUTION.base[k] * se.mult[k] * tempMult * (1 - ctrl);
  }
  return out;
}

/** For the baseline world, only adverse ('bad') temporary effects apply. */
function naturalMult(s: GameState, k: Source) {
  let m = 1;
  for (const e of s.effects) if (e.kind === 'bad' && e.modifier.emissionMult?.[k] && (e.modifier.emissionMult[k] as number) > 1) m *= e.modifier.emissionMult[k] as number;
  return m;
}
function naturalDispersion(s: GameState) {
  let m = 1;
  for (const e of s.effects) if (e.modifier.dispersionMult && e.kind !== 'optics') m *= e.modifier.dispersionMult;
  return m;
}

export function dispersion(s: GameState, a: Aggregate = agg(s)) {
  return seasonOf(dayOf(s)).dispersion * s.windFactor * a.dispersionMult;
}

export function steadyConc(s: GameState, baseline: boolean, a: Aggregate = agg(s)) {
  const e = emissions(s, baseline, a);
  const total = SOURCES.reduce((t, k) => t + e[k], 0);
  const disp = baseline ? seasonOf(dayOf(s)).dispersion * s.windFactor * naturalDispersion(s) : dispersion(s, a);
  return (POLLUTION.emissionToConc * total) / Math.max(0.2, disp);
}

export function concToAqi(c: number): number {
  if (c <= 0) return 0;
  for (const [cl, ch, il, ih] of AQI_BREAKPOINTS) {
    if (c <= ch) return Math.round(il + ((c - cl) * (ih - il)) / (ch - cl));
  }
  return 500;
}

export const actualAqi = (s: GameState) => concToAqi(s.conc);
export const baselineAqi = (s: GameState) => concToAqi(s.baselineConc);
export function officialAqi(s: GameState, a: Aggregate = agg(s)) {
  let bias = a.perceptionBias;
  if (s.res.credibility < CREDIBILITY.challengedBelow) bias *= 0.5; // reports are being challenged
  return Math.round(actualAqi(s) * (1 - bias));
}
export function reductionPct(s: GameState) {
  const b = baselineAqi(s);
  return b <= 0 ? 0 : clamp(((b - actualAqi(s)) / b) * 100, -100, 100);
}

export interface AqiBand { label: string; color: string; level: number }
export function aqiBand(aqi: number): AqiBand {
  if (aqi <= 50) return { label: 'Good', color: '#22c55e', level: 0 };
  if (aqi <= 100) return { label: 'Satisfactory', color: '#84cc16', level: 1 };
  if (aqi <= 200) return { label: 'Moderate', color: '#eab308', level: 2 };
  if (aqi <= 300) return { label: 'Poor', color: '#f97316', level: 3 };
  if (aqi <= 400) return { label: 'Very Poor', color: '#ef4444', level: 4 };
  return { label: 'Severe', color: '#7f1d1d', level: 5 };
}

/* -------------------------------------------------------------- economy */

export function maintenancePerDay(s: GameState, a: Aggregate = agg(s)) {
  let m = 0;
  for (const b of BUILDINGS) {
    const lvl = s.buildings[b.id];
    if (lvl > 0) m += b.levels[lvl - 1].maintenance;
  }
  return m * a.maintenanceMult;
}
export function incomePerDay(s: GameState, a: Aggregate = agg(s)) {
  const trustMult = ECONOMY.trustIncomeBase + (s.res.trust / 100) * ECONOMY.trustIncomeSlope;
  return (ECONOMY.baseIncomePerDay * trustMult + a.incomePerDay) * a.incomeMult;
}
export const researchPerDay = (_s: GameState, a: Aggregate) => a.researchPerDay * a.researchMult;
export const capitalPerDay = (_s: GameState, a: Aggregate) => ECONOMY.baseCapitalPerDay + a.capitalPerDay;

export function rates(s: GameState) {
  const a = agg(s);
  const income = incomePerDay(s, a);
  const maint = maintenancePerDay(s, a);
  return { income, maintenance: maint, net: income - maint, research: researchPerDay(s, a), capital: capitalPerDay(s, a), a };
}

export function canAfford(s: GameState, c: Cost) {
  return (c.budget ?? 0) <= s.res.budget && (c.rp ?? 0) <= s.res.rp && (c.capital ?? 0) <= s.res.capital && (c.cac ?? 0) <= s.res.cac;
}
function pay(s: GameState, c: Cost) {
  s.res.budget -= c.budget ?? 0;
  s.res.rp -= c.rp ?? 0;
  s.res.capital -= c.capital ?? 0;
  s.res.cac -= c.cac ?? 0;
  s.stats.totalSpent += c.budget ?? 0;
}

export function applyDeltas(s: GameState, d: Deltas, severity = 1) {
  const sev = (v: number | undefined, badIfNegative: boolean) => {
    if (!v) return 0;
    const bad = badIfNegative ? v < 0 : v > 0;
    return bad ? v * severity : v;
  };
  s.res.budget += d.budget ?? 0;
  s.res.rp = Math.max(0, s.res.rp + (d.rp ?? 0));
  s.res.trust = clamp(s.res.trust + sev(d.trust, true), 0, 100);
  s.res.pressure = clamp(s.res.pressure + sev(d.pressure, false), 0, 100);
  s.res.credibility = clamp(s.res.credibility + (d.credibility ?? 0), 0, 100);
  s.res.capital = Math.max(0, s.res.capital + (d.capital ?? 0));
  s.res.cac = Math.max(0, s.res.cac + (d.cac ?? 0));
  s.participation = clamp(s.participation + (d.participation ?? 0), 0, 100);
  s.exposureRisk = clamp(s.exposureRisk + (d.exposureRisk ?? 0), 0, 1);
  if (s.res.budget < ECONOMY.debtFloor) s.res.budget = ECONOMY.debtFloor;
}

/* -------------------------------------------------------------- news */

export function addNews(s: GameState, kind: NewsKind, headline: string, body?: string) {
  s.newsSeq += 1;
  s.news.unshift({ id: s.newsSeq, tick: s.tick, day: dayOf(s), kind, headline, body });
  if (s.news.length > 80) s.news.length = 80;
}
/** Cosmetic headline choice uses a hash, NOT the simulation RNG, so flavour text never changes outcomes. */
function templ(s: GameState, key: keyof typeof NEWS_TEMPLATES, vars: Record<string, string | number> = {}) {
  const arr = NEWS_TEMPLATES[key];
  let t = arr[(Math.imul(s.newsSeq + 1, 2654435761) >>> 0) % arr.length];
  for (const [k, v] of Object.entries(vars)) t = t.replace(`{${k}}`, String(v));
  return t;
}

/* -------------------------------------------------------------- unlocks */

export function buildingUnlocked(s: GameState, id: BuildingId) {
  const u = BUILDING_MAP[id].unlock;
  if (u.day && dayOf(s) < u.day) return false;
  if (u.building && s.buildings[u.building] <= 0) return false;
  if (u.stage && s.stage < u.stage) return false;
  return true;
}

export type ActionResult = { ok: true; msg: string } | { ok: false; msg: string };

export function nextLevelInfo(s: GameState, id: BuildingId) {
  const def = BUILDING_MAP[id];
  const lvl = s.buildings[id];
  if (lvl >= def.levels.length) return null;
  return { level: lvl + 1, ...def.levels[lvl] };
}

export function buyBuilding(s: GameState, id: BuildingId): ActionResult {
  const def = BUILDING_MAP[id];
  if (!def) return { ok: false, msg: 'Unknown building' };
  if (!buildingUnlocked(s, id)) return { ok: false, msg: def.unlockText };
  const next = nextLevelInfo(s, id);
  if (!next) return { ok: false, msg: 'Already at maximum level' };
  if (next.requiresResearch && !s.research.includes(next.requiresResearch)) return { ok: false, msg: `Requires research: ${RESEARCH_MAP[next.requiresResearch].name}` };
  if (!canAfford(s, next.cost)) return { ok: false, msg: 'Insufficient resources' };
  pay(s, next.cost);
  const first = s.buildings[id] === 0;
  s.buildings[id] = next.level;
  if (first) {
    s.builtAt[id] = s.tick;
    s.stats.buildingsBought += 1;
    addNews(s, 'gov', templ(s, 'buy', { name: def.name }));
  } else {
    s.stats.upgradesBought += 1;
    addNews(s, 'gov', templ(s, 'upgrade', { name: def.name, lvl: next.level }));
  }
  checkProgress(s);
  return { ok: true, msg: first ? `${def.name} built!` : `${def.name} upgraded to level ${next.level}` };
}

export type ResearchStatus = 'done' | 'available' | 'locked';
export function researchStatus(s: GameState, id: string): ResearchStatus {
  if (s.research.includes(id)) return 'done';
  const r = RESEARCH_MAP[id];
  return r.requires.every((q) => s.research.includes(q)) ? 'available' : 'locked';
}
export function doResearch(s: GameState, id: string): ActionResult {
  const r = RESEARCH_MAP[id];
  if (!r) return { ok: false, msg: 'Unknown research' };
  const st = researchStatus(s, id);
  if (st === 'done') return { ok: false, msg: 'Already researched' };
  if (st === 'locked') return { ok: false, msg: 'Prerequisites not met' };
  if (!canAfford(s, r.cost)) return { ok: false, msg: 'Insufficient resources' };
  pay(s, r.cost);
  s.research.push(id);
  addNews(s, 'gov', templ(s, 'research', { name: r.name }));
  checkProgress(s);
  return { ok: true, msg: `Research complete: ${r.name}` };
}

export function opticsUnlocked(s: GameState, id: string) {
  const o = OPTICS_MAP[id];
  if (o.unlock.pr && s.buildings.pr < o.unlock.pr) return false;
  if (o.unlock.building && s.buildings[o.unlock.building] <= 0) return false;
  if (o.unlock.research && !s.research.includes(o.unlock.research)) return false;
  return true;
}
export function opticsCost(s: GameState, id: string): Cost {
  const o = OPTICS_MAP[id];
  if (id === 'committee' && s.research.includes('c_committee')) return { budget: Math.round((o.cost.budget ?? 0) * COMMITTEE.cheaperWithResearch), capital: o.cost.capital };
  return o.cost;
}
export function opticsReadyIn(s: GameState, id: string) {
  return Math.max(0, (s.opticsCooldown[id] ?? 0) - s.tick);
}

export function executeOptics(s: GameState, id: string): ActionResult {
  const o = OPTICS_MAP[id];
  if (!o) return { ok: false, msg: 'Unknown scheme' };
  if (!opticsUnlocked(s, id)) return { ok: false, msg: o.unlockText };
  if (opticsReadyIn(s, id) > 0) return { ok: false, msg: 'On cooldown' };
  const cost = opticsCost(s, id);
  if (!canAfford(s, cost)) return { ok: false, msg: 'Insufficient resources' };
  pay(s, cost);
  const d: Deltas = { ...o.deltas };
  if (id === 'press') d.trust = s.res.credibility > 50 ? 2 : -3;
  applyDeltas(s, d);
  if (o.temp) addEffect(s, `opt_${id}`, o.temp.label, o.temp.days, o.temp.modifier, 'optics');
  s.opticsCooldown[id] = s.tick + o.cooldownDays * TICKS_PER_DAY;
  s.stats.opticsUsed += 1;
  s.lastOpticsDay = dayOf(s);
  switch (id) {
    case 'committee':
      s.stats.committees += 1;
      s.committeesPending.push({ until: s.tick + COMMITTEE.reportDays * TICKS_PER_DAY, name: `Committee #${s.stats.committees}` });
      addNews(s, 'satire', templ(s, 'committee', { n: s.stats.committees }));
      break;
    case 'purifier':
      s.stats.purifiers += 1;
      addNews(s, 'satire', templ(s, 'purifier'));
      break;
    case 'plan':
      s.stats.reports += 1;
      addNews(s, 'satire', templ(s, 'plan'));
      break;
    case 'rename':
      s.aqiRenamed = true;
      addNews(s, 'satire', templ(s, 'rename'));
      break;
    case 'victory':
      s.victoryCheckAt = s.tick + VICTORY.checkDays * TICKS_PER_DAY;
      addNews(s, 'breaking', templ(s, 'victory'));
      break;
    default:
      addNews(s, id === 'awareness' ? 'gov' : 'satire', templ(s, id as keyof typeof NEWS_TEMPLATES));
  }
  checkProgress(s);
  return { ok: true, msg: `${o.name}: done.` };
}

export function claimGrant(s: GameState): ActionResult {
  if (s.res.cac < ECONOMY.grantCac) return { ok: false, msg: `Need ${ECONOMY.grantCac} Clean Air Credits` };
  s.res.cac -= ECONOMY.grantCac;
  s.res.budget += ECONOMY.grantBudget;
  addNews(s, 'gov', 'Department Wins Environmental Grant for Measurable Results; Auditors Confused by Real Numbers');
  return { ok: true, msg: `Grant received: +₹${ECONOMY.grantBudget.toLocaleString('en-IN')}` };
}

export function addEffect(s: GameState, id: string, label: string, days: number, modifier: Modifier, kind: 'good' | 'bad' | 'optics') {
  s.effects = s.effects.filter((e) => e.id !== id);
  s.effects.push({ id, label, until: s.tick + Math.round(days * TICKS_PER_DAY), modifier, kind });
}

/* -------------------------------------------------------------- events */

export function eventCtx(s: GameState): EventCtx {
  const day = dayOf(s);
  return { s, day, season: seasonOf(day).id, aqi: actualAqi(s), official: officialAqi(s) };
}

export function spawnEvent(s: GameState, defId: string) {
  const uid = `${defId}_${s.tick}_${s.events.length}`;
  s.events.push({ uid, defId, at: s.tick, expires: s.tick + Math.round(EVENTS_CFG.expireDays * TICKS_PER_DAY) });
  s.eventCooldown[defId] = dayOf(s) + EVENT_MAP[defId].cooldownDays;
  const def = EVENT_MAP[defId];
  addNews(s, def.severity >= 3 ? 'breaking' : 'alert', `${def.title.toUpperCase()}`, def.description);
}

/** Choose and spawn random events at the start of a day. Deterministic via seeded RNG. */
export function rollEvents(s: GameState) {
  const day = dayOf(s);
  const ctx = eventCtx(s);
  // scripted
  for (const e of EVENTS) {
    if (e.scriptedDay === day && !s.eventHistory.some((h) => h.defId === e.id) && !s.events.some((x) => x.defId === e.id)) spawnEvent(s, e.id);
  }
  if (s.events.length >= EVENTS_CFG.maxActive) return;
  const r = nextRandom(s);
  if (r > EVENTS_CFG.dailyChance) return;
  const pool = EVENTS.filter((e) => !e.scriptedDay && (s.eventCooldown[e.id] ?? 0) <= day && !s.events.some((x) => x.defId === e.id) && e.condition(ctx));
  if (!pool.length) return;
  const weights = pool.map((e) => Math.max(0, e.weight(ctx)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return;
  let roll = nextRandom(s) * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      spawnEvent(s, pool[i].id);
      return;
    }
  }
}

export function resolveEvent(s: GameState, uid: string, choiceIdx: number, auto = false): ActionResult {
  const ev = s.events.find((e) => e.uid === uid);
  if (!ev) return { ok: false, msg: 'Event not found' };
  const def = EVENT_MAP[ev.defId];
  const ch = def.choices[choiceIdx];
  if (!ch) return { ok: false, msg: 'Invalid choice' };
  if (ch.cost && !canAfford(s, ch.cost)) return { ok: false, msg: 'Insufficient resources' };
  const sev = agg(s).eventSeverityMult;
  if (ch.cost) pay(s, ch.cost);
  if (ch.deltas) applyDeltas(s, ch.deltas, sev);
  let text = ch.result;
  if (ch.dynamic) {
    const out = ch.dynamic(eventCtx(s));
    applyDeltas(s, out.deltas, sev);
    text = out.text;
  }
  if (ch.temp) {
    const m = ch.temp.modifier;
    // severity reduces adverse emission multipliers (monitoring = early warning)
    let mod = m;
    if (ch.temp.kind === 'bad' && m.emissionMult && sev < 1) {
      const em: Partial<Record<Source, number>> = {};
      for (const k of Object.keys(m.emissionMult) as Source[]) {
        const v = m.emissionMult[k] as number;
        em[k] = v > 1 ? 1 + (v - 1) * sev : v;
      }
      mod = { ...m, emissionMult: em };
    }
    addEffect(s, `ev_${def.id}`, ch.temp.label, ch.temp.days, mod, ch.temp.kind ?? 'good');
  }
  if (ch.tough) s.stats.toughDecisions += 1;
  s.events = s.events.filter((e) => e.uid !== uid);
  s.eventHistory.push({ defId: def.id, choice: choiceIdx, day: dayOf(s) });
  if (!auto) s.stats.eventsHandled += 1;
  addNews(s, ch.headline ? 'satire' : 'gov', ch.headline ?? `${def.title}: ${ch.label}`, (auto ? 'No decision was taken in time. ' : '') + text);
  checkProgress(s);
  return { ok: true, msg: text };
}

/* -------------------------------------------------------------- objectives & progress */

export function rollDailyObjectives(s: GameState) {
  const day = dayOf(s);
  const pool = [...OBJECTIVE_TEMPLATES];
  const chosen = [];
  // always one AQI objective after day 2, plus two random others
  const aqiT = pool.find((t) => t.id === 'aqi')!;
  const rest = pool.filter((t) => t.id !== 'aqi');
  for (let i = 0; i < 2 && rest.length; i++) {
    const idx = Math.floor(nextRandom(s) * rest.length);
    chosen.push(rest.splice(idx, 1)[0]);
  }
  if (day >= 2) chosen.push(aqiT);
  s.objectives = chosen.map((t) => {
    const target = t.target(day);
    return { id: `${t.id}_${day}`, templateId: t.id, label: t.label(target), target, start: t.metric(s), reward: t.reward(day), done: false };
  });
}

function evaluateObjectives(s: GameState, dayEnd: boolean) {
  for (const o of s.objectives) {
    if (o.done) continue;
    const t = OBJECTIVE_TEMPLATES.find((x) => x.id === o.templateId);
    if (!t) continue;
    let done = false;
    if (t.belowAtDayEnd) done = dayEnd && actualAqi(s) <= o.target;
    else done = t.metric(s) - o.start >= o.target;
    if (done) {
      o.done = true;
      s.stats.objectivesDone += 1;
      applyDeltas(s, o.reward);
    }
  }
}

export function checkProgress(s: GameState) {
  const red = reductionPct(s);
  for (const so of STAGE_OBJECTIVES) {
    if (so.stage > s.stage || s.stageObjectivesDone.includes(so.id)) continue;
    if (so.check(s, red)) s.stageObjectivesDone.push(so.id);
  }
  if (s.stage === 1 && STAGE_OBJECTIVES.filter((o) => o.stage === 1).every((o) => s.stageObjectivesDone.includes(o.id))) unlockStage2(s, false);
  evaluateObjectives(s, false);
  checkAchievements(s);
}

export function unlockStage2(s: GameState, auto: boolean) {
  if (s.stage >= 2) return;
  s.stage = 2;
  s.res.budget += STAGE2_GRANT;
  addNews(s, 'breaking', 'Stage 2: Operation Clean Air Begins', `${auto ? 'The Ministry is impatient. ' : 'Your first week impressed the Ministry. '}A special grant of ₹${STAGE2_GRANT.toLocaleString('en-IN')} is released and the Parali Management Cell is approved.`);
}

export function checkAchievements(s: GameState) {
  const day = dayOf(s);
  const aqi = actualAqi(s);
  const owned = (id: string) => s.achievements.includes(id);
  const cond: Record<string, boolean> = {
    first_building: s.stats.buildingsBought >= 1,
    first_reduction: reductionPct(s) >= 5,
    bureaucrat: s.stats.committees >= 3,
    committee_factory: s.stats.committees >= 6,
    green_delhi: s.buildings.greenery >= 3,
    media_master: s.stats.opticsUsed >= 8,
    public_favourite: s.res.trust >= 85,
    aqi_warrior: day > 15 && aqi < 200,
    peoples_officer: s.participation >= 60,
    clean_air: aqi < 100,
  };
  for (const a of ACHIEVEMENTS) {
    if (!owned(a.id) && cond[a.id]) {
      s.achievements.push(a.id);
      applyDeltas(s, a.reward);
      addNews(s, 'achievement', `Achievement unlocked: ${a.name}`, `${a.description} Reward: ${a.rewardText}.`);
    }
  }
}

/* -------------------------------------------------------------- endings */

export interface EndingInput {
  reduction: number;
  trust: number;
  credibility: number;
  participation: number;
  committees: number;
  reports: number;
  opticsUsed: number;
  toughDecisions: number;
  actualAqi: number;
  officialAqi: number;
}

export function endingInput(s: GameState): EndingInput {
  const last = s.daily.slice(-5);
  const avg = (f: (d: GameState['daily'][number]) => number, fallback: number) => (last.length ? last.reduce((t, d) => t + f(d), 0) / last.length : fallback);
  const act = avg((d) => d.aqi, actualAqi(s));
  const base = avg((d) => d.baseline, baselineAqi(s));
  return {
    reduction: base > 0 ? ((base - act) / base) * 100 : 0,
    trust: s.res.trust,
    credibility: s.res.credibility,
    participation: s.participation,
    committees: s.stats.committees,
    reports: s.stats.reports,
    opticsUsed: s.stats.opticsUsed,
    toughDecisions: s.stats.toughDecisions,
    actualAqi: act,
    officialAqi: avg((d) => d.official, officialAqi(s)),
  };
}

export function evaluateEnding(e: EndingInput): EndingId {
  if (e.reduction >= 35 && e.participation >= 45 && e.toughDecisions >= 4 && e.credibility >= 55) return 'people';
  if (e.reduction >= 30 && e.trust >= 50 && e.credibility >= 55) return 'hero';
  if (e.committees + e.reports >= 5 && e.reduction < 25) return 'committee';
  if (e.opticsUsed >= 4 || e.officialAqi < e.actualAqi * 0.85) return 'pr';
  // fallback: whichever the player leaned toward
  if (e.reduction >= 20) return 'hero';
  return e.committees + e.reports >= 2 ? 'committee' : 'pr';
}

/* -------------------------------------------------------------- tick */

function sample(s: GameState) {
  const a = agg(s);
  const e = emissions(s, false, a);
  s.history.push({
    tick: s.tick, day: dayOf(s), aqi: actualAqi(s), official: officialAqi(s, a), baseline: baselineAqi(s),
    emissions: Math.round(SOURCES.reduce((t, k) => t + e[k], 0)), trust: Math.round(s.res.trust), credibility: Math.round(s.res.credibility),
    pressure: Math.round(s.res.pressure), budget: Math.round(s.res.budget),
  });
  if (s.history.length > 600) s.history.splice(0, s.history.length - 600);
}

/** Advance the simulation by one tick. Mutates `s`. */
export function step(s: GameState, opts: { offline?: boolean } = {}) {
  if (s.ended && !s.sandbox) return;
  const a = agg(s);
  const perTick = 1 / TICKS_PER_DAY;
  const offF = 1;

  // economy
  const net = incomePerDay(s, a) - maintenancePerDay(s, a);
  s.res.budget = Math.max(ECONOMY.debtFloor, s.res.budget + net * perTick * offF);
  s.res.rp += researchPerDay(s, a) * perTick * offF;
  s.res.capital += capitalPerDay(s, a) * perTick * offF;

  // social dynamics
  const actual = actualAqi(s);
  const official = officialAqi(s, a);
  const perceived = official * PRESSURE.officialWeight + actual * (1 - PRESSURE.officialWeight);
  let dPressure = (perceived - PRESSURE.neutralAqi) / PRESSURE.scale + a.pressurePerDay;
  let dTrust = -(actual - TRUST.neutralAqi) / TRUST.scale + a.trustPerDay;
  if (s.res.budget < 0) {
    dTrust += ECONOMY.debtTrustPerDay;
    dPressure += ECONOMY.debtPressurePerDay;
  }
  if (s.res.credibility < CREDIBILITY.challengedBelow) {
    dTrust += CREDIBILITY.challengedTrustPerDay;
    dPressure += CREDIBILITY.challengedPressurePerDay;
  }
  if (opts.offline) {
    dTrust = Math.max(-1, dTrust);
    dPressure = Math.min(1, dPressure);
  }
  s.res.pressure = clamp(s.res.pressure + dPressure * perTick, 0, 100);
  s.res.trust = clamp(s.res.trust + dTrust * perTick, 0, 100);
  s.participation = clamp(s.participation + a.participationPerDay * perTick, 0, 100);

  // atmosphere
  const target = steadyConc(s, false, a);
  const btarget = steadyConc(s, true, a);
  s.conc += (target - s.conc) * POLLUTION.relaxation;
  s.baselineConc += (btarget - s.baselineConc) * POLLUTION.relaxation;
  const newAqi = actualAqi(s);
  s.stats.highestAqi = Math.max(s.stats.highestAqi, newAqi);
  s.stats.lowestAqi = Math.min(s.stats.lowestAqi, newAqi);

  // clean-air credits accrue continuously for measured reduction
  const gain = Math.max(0, baselineAqi(s) - newAqi) * ECONOMY.cacPerAqiPointDay * perTick;
  s.res.cac += gain;
  s.stats.cacEarned += gain;
  s.stats.aqiReductionDays += (baselineAqi(s) - newAqi) * perTick;

  s.tick += 1;

  // expiries
  s.effects = s.effects.filter((e) => e.until > s.tick);
  for (const c of s.committeesPending.filter((c) => c.until <= s.tick)) {
    applyDeltas(s, { capital: COMMITTEE.reportCapital });
    s.stats.reports += 1;
    addNews(s, 'satire', templ(s, 'report'), `${c.name} has submitted its findings. Key recommendation: further study.`);
  }
  s.committeesPending = s.committeesPending.filter((c) => c.until > s.tick);
  if (s.victoryCheckAt !== null && s.tick >= s.victoryCheckAt) {
    s.victoryCheckAt = null;
    if (actualAqi(s) > VICTORY.threshold) {
      applyDeltas(s, { trust: VICTORY.trust, credibility: VICTORY.credibility, pressure: VICTORY.pressure });
      s.effects = s.effects.filter((e) => e.id !== 'opt_victory');
      addNews(s, 'investigation', templ(s, 'victoryBackfire'), 'The independent monitor’s readings were shown side-by-side with your victory speech on every channel.');
    } else {
      applyDeltas(s, { trust: 5, capital: 5 });
      addNews(s, 'gov', 'Victory Declaration Holds Up; Even Critics Admit the Air Is Better');
    }
  }
  if (!opts.offline) {
    for (const ev of s.events.filter((e) => e.expires <= s.tick)) {
      const def = EVENT_MAP[ev.defId];
      resolveEvent(s, ev.uid, def.choices.length - 1, true);
    }
  }

  if (s.tick % 10 === 0) sample(s);
  if (s.tick % TICKS_PER_DAY === 0) endOfDay(s, opts.offline ?? false);
  else if (s.tick % 5 === 0) {
    evaluateObjectives(s, false);
    checkAchievements(s);
  }
}

function endOfDay(s: GameState, offline: boolean) {
  const prevDay = dayOf(s) - 1;
  evaluateObjectives(s, true);
  s.daily.push({ day: prevDay, aqi: actualAqi(s), official: officialAqi(s), baseline: baselineAqi(s), trust: Math.round(s.res.trust), credibility: Math.round(s.res.credibility) });
  if (prevDay % DAYS_PER_WEEK === 0 && !s.sandbox) closeWeek(s);

  if (prevDay >= CAMPAIGN_DAYS && !s.ended && !s.sandbox) {
    s.ended = evaluateEnding(endingInput(s));
    addNews(s, 'breaking', 'Commissioner’s Term Ends; Final Report Submitted (Only 3 Pages)');
    return;
  }

  // weather
  s.windFactor = POLLUTION.windMin + nextRandom(s) * (POLLUTION.windMax - POLLUTION.windMin);

  // credibility & exposure
  const usedOpticsToday = s.lastOpticsDay === prevDay;
  if (!usedOpticsToday) s.res.credibility = clamp(s.res.credibility + CREDIBILITY.recoveryPerDay, 0, 100);
  const exposeChance = s.exposureRisk * (1 - s.res.credibility / 100) * 1.5;
  if (nextRandom(s) < exposeChance && !s.events.some((e) => e.defId === 'journalist')) {
    s.stats.exposures += 1;
    applyDeltas(s, { trust: -6, pressure: 8, credibility: -5 });
    addNews(s, 'investigation', templ(s, 'exposure'));
    if (!offline) spawnEvent(s, 'journalist');
  }
  s.exposureRisk *= 1 - CREDIBILITY.exposureDecay;

  // pressure maxed tracking
  s.pressureMaxedDays = s.res.pressure >= 99 ? s.pressureMaxedDays + 1 : 0;

  // stage 2 auto unlock
  if (dayOf(s) >= STAGE2_AUTO_DAY && s.stage < 2) unlockStage2(s, true);

  // daily news
  const aqi = actualAqi(s);
  addNews(s, aqi > 300 ? 'citizen' : 'viral', aqi > 300 ? templ(s, 'daily_bad') : aqi > 180 ? templ(s, 'daily_mid') : templ(s, 'daily_good'));
  if (nextRandom(s) < 0.4) addNews(s, 'citizen', templ(s, 'citizen'));
  const se = seasonOf(dayOf(s));
  if (se.fromDay === dayOf(s) && dayOf(s) > 1) addNews(s, 'alert', `Season change: ${se.name}`, se.blurb);

  rollDailyObjectives(s);
  if (!offline) rollEvents(s);
  checkProgress(s);
}

/* -------------------------------------------------------------- weeks */

export const weekOf = (s: GameState) => Math.min(CAMPAIGN_DAYS / DAYS_PER_WEEK, Math.ceil(dayOf(s) / DAYS_PER_WEEK));
export const dayOfWeek = (s: GameState) => ((dayOf(s) - 1) % DAYS_PER_WEEK) + 1;

export function weekSnap(s: GameState): WeekSnap {
  return {
    week: Math.ceil(dayOf(s) / DAYS_PER_WEEK), day: dayOf(s), budget: Math.round(s.res.budget), aqi: actualAqi(s), baseline: baselineAqi(s),
    trust: Math.round(s.res.trust), emissions: emissions(s), eventsHandled: s.stats.eventsHandled, objectivesDone: s.stats.objectivesDone, newsSeq: s.newsSeq,
  };
}

/** Called at the end of day 7, 14, 21, 28: archive a report and start a new snapshot. */
function closeWeek(s: GameState) {
  const start = s.weekStart ?? weekSnap(s);
  const end = { ...weekSnap(s), week: start.week };
  const fresh = s.news.filter((n) => n.id > start.newsSeq);
  const headlines = fresh.filter((n) => n.kind === 'satire' || n.kind === 'citizen' || n.kind === 'viral').slice(0, 3).map((n) => n.headline);
  const consequences = fresh
    .filter((n) => n.kind === 'investigation' || n.body?.startsWith('No decision') || /Report|Victory|EXPOSED/i.test(n.headline))
    .slice(0, 4)
    .map((n) => (n.body?.startsWith('No decision') ? `No decision — ${n.headline.split(':')[0]}` : n.headline));
  s.weekReports.push({ week: start.week, start, end, headlines, consequences });
  s.reportPending = true;
  s.weekStart = weekSnap(s);
}

/** Advance n ticks, returning a new state object (the input is not mutated). */
export function advance(state: GameState, n: number): GameState {
  const s = structuredClone(state);
  for (let i = 0; i < n; i++) step(s);
  return s;
}

export const ALL_OPTICS = OPTICS;
export const ALL_RESEARCH = RESEARCH;
