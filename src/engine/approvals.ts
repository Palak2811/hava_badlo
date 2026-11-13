/** Pending approvals, standing policies and delayed consequences. */
import { TICKS_PER_WEEK } from '../config/balance';
import { PLACEABLE_MAP } from '../config/build';
import { APPROVALS_CFG, PROPOSALS, PROPOSAL_MAP, type Outcome, type PolicyDef } from '../config/approvals';
import { addNews, applyDeltas, weekOf, type ActionResult } from './core';
import { liveMap, refreshMap } from './build';
import { roadAccess, tileAt, zoneAt, type CityMap } from './map';
import { nextRandom } from './rng';
import type { GameState, Modifier, PolicyInstance, Proposal, Zone } from './types';

function findSite(s: GameState, m: CityMap, zone: Zone, w: number, h: number) {
  const offset = Math.floor(nextRandom(s) * m.tiles.length);
  for (let k = 0; k < m.tiles.length; k++) {
    const i = (offset + k * 11) % m.tiles.length;
    const x = i % m.cols, y = Math.floor(i / m.cols);
    let ok = true;
    for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w && ok; dx++) {
      if (tileAt(m, x + dx, y + dy) !== 'grass' || zoneAt(m, x + dx, y + dy) !== zone) ok = false;
    }
    if (ok && roadAccess(m, x, y, w, h)) return { x, y };
  }
  return null;
}

function siteStillFree(m: CityMap, p: Proposal) {
  const t = PROPOSAL_MAP[p.templateId];
  if (!t.site || !p.site) return true;
  const d = PLACEABLE_MAP[t.site.kind];
  for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) if (tileAt(m, p.site.x + dx, p.site.y + dy) !== 'grass') return false;
  return true;
}

export function instantiatePolicy(s: GameState, def: PolicyDef): PolicyInstance {
  return { id: def.id, name: def.name, since: s.tick, until: def.weeks ? s.tick + def.weeks * TICKS_PER_WEEK : null, modifier: def.modifier, repealable: def.repealable, repealDeltas: def.repealDeltas };
}

/** Create a proposal from a template (if it can be placed). Exported for tests. */
export function propose(s: GameState, templateId: string): Proposal | null {
  const t = PROPOSAL_MAP[templateId];
  if (!t) return null;
  let site: Proposal['site'];
  if (t.site) {
    const d = PLACEABLE_MAP[t.site.kind];
    site = findSite(s, liveMap(s), t.site.zone, d.w, d.h) ?? undefined;
    if (!site) return null;
  }
  const p: Proposal = { uid: ++s.proposalsSeen, templateId, arrived: s.tick, expires: s.tick + APPROVALS_CFG.expireWeeks * TICKS_PER_WEEK, site, amount: t.amount ? t.amount(s) : 0 };
  s.proposals.push(p);
  addNews(s, 'gov', `New Proposal: ${t.title}`, `${t.proposer}: ${t.quote}`);
  return p;
}

/** Weekly: maybe a new proposal lands on the desk. */
export function rollProposals(s: GameState) {
  if (weekOf(s) < APPROVALS_CFG.firstWeek || s.proposals.length >= APPROVALS_CFG.maxPending) return;
  if (nextRandom(s) > APPROVALS_CFG.weeklyChance) return;
  const pool = PROPOSALS.filter((t) => t.condition(s) && !s.proposals.some((p) => p.templateId === t.id));
  const weights = pool.map((t) => Math.max(0, t.weight(s)));
  let roll = nextRandom(s) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      propose(s, pool[i].id);
      return;
    }
  }
}

function applyOutcome(s: GameState, o: Outcome, p: Proposal) {
  if (o.budget) s.res.budget += o.budget;
  if (o.deltas) applyDeltas(s, o.deltas);
  if (o.policy) {
    s.policies = s.policies.filter((x) => x.id !== o.policy!.id);
    s.policies.push(instantiatePolicy(s, o.policy));
  }
  if (o.build && p.site) {
    const d = PLACEABLE_MAP[o.build];
    s.cityEdits.placed.push({ uid: s.cityEdits.nextUid++, kind: o.build, x: p.site.x, y: p.site.y, w: d.w, h: d.h, cost: 0, started: s.tick, done: s.tick + d.weeks * TICKS_PER_WEEK, built: false, organic: true });
    refreshMap(s);
  }
  if (o.delayed) {
    s.delayed.push({
      at: s.tick + o.delayed.weeks * TICKS_PER_WEEK, label: o.delayed.label, deltas: o.delayed.deltas,
      policy: o.delayed.policy ? { ...instantiatePolicy(s, o.delayed.policy), since: s.tick + o.delayed.weeks * TICKS_PER_WEEK } : undefined,
      endPolicy: o.delayed.endPolicy, news: o.delayed.news,
    });
  }
  addNews(s, o.deltas?.credibility && o.deltas.credibility < 0 ? 'satire' : 'gov', o.news);
}

export function decideProposal(s: GameState, uid: number, approve: boolean): ActionResult {
  const p = s.proposals.find((x) => x.uid === uid);
  if (!p) return { ok: false, msg: 'Proposal not found' };
  const t = PROPOSAL_MAP[p.templateId];
  const o = approve ? t.approve(p.amount) : t.reject;
  if (approve && o.budget && o.budget < 0 && s.res.budget < -o.budget) return { ok: false, msg: 'Not enough money' };
  if (approve && o.build && !siteStillFree(liveMap(s), p)) {
    s.proposals = s.proposals.filter((x) => x.uid !== uid);
    return { ok: false, msg: 'The site has been taken; the proposal lapses' };
  }
  s.proposals = s.proposals.filter((x) => x.uid !== uid);
  applyOutcome(s, o, p);
  return { ok: true, msg: `${approve ? 'Approved' : 'Rejected'}: ${t.title}` };
}

export function repealPolicy(s: GameState, id: string): ActionResult {
  const p = s.policies.find((x) => x.id === id);
  if (!p) return { ok: false, msg: 'No such policy' };
  if (!p.repealable) return { ok: false, msg: 'This cannot be repealed' };
  s.policies = s.policies.filter((x) => x.id !== id);
  if (p.repealDeltas) applyDeltas(s, p.repealDeltas);
  // repealing a subsidy before it takes effect cancels the benefit
  if (id === 'cleantech') s.delayed = s.delayed.filter((d) => d.label !== 'Clean tech adopted');
  addNews(s, 'gov', `${p.name} Repealed`);
  return { ok: true, msg: `${p.name} repealed` };
}

/** Every tick: expire proposals and policies, fire delayed consequences. */
export function advanceApprovals(s: GameState) {
  for (const p of s.proposals.filter((x) => x.expires <= s.tick)) {
    s.proposals = s.proposals.filter((x) => x.uid !== p.uid);
    applyOutcome(s, { ...PROPOSAL_MAP[p.templateId].reject, news: `Proposal Lapsed: ${PROPOSAL_MAP[p.templateId].title}` }, p);
  }
  for (const pol of s.policies.filter((x) => x.until !== null && x.until <= s.tick)) {
    s.policies = s.policies.filter((x) => x !== pol);
    addNews(s, 'gov', `${pol.name} Ends`);
  }
  for (const d of s.delayed.filter((x) => x.at <= s.tick)) {
    s.delayed = s.delayed.filter((x) => x !== d);
    if (d.deltas) applyDeltas(s, d.deltas);
    if (d.policy) {
      s.policies = s.policies.filter((x) => x.id !== d.policy!.id);
      s.policies.push({ ...d.policy, since: s.tick });
    }
    if (d.endPolicy) s.policies = s.policies.filter((x) => x.id !== d.endPolicy);
    addNews(s, d.deltas && (d.deltas.trust ?? 0) < 0 ? 'investigation' : 'gov', d.news);
  }
}

export function policyModifiers(s: GameState): Modifier[] {
  return s.policies.map((p) => p.modifier);
}

export function privateTripMult(s: GameState) {
  return s.policies.reduce((t, p) => t * (p.modifier.privateTripMult ?? 1), 1);
}
