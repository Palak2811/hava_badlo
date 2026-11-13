/**
 * City finances: recurring revenue streams that depend on the actual city, debts, and
 * the recovery options available when money runs out.
 */
import { CAMPAIGN_WEEKS, ECONOMY, TICKS_PER_WEEK, WEEKS_PER_PHASE } from '../config/balance';
import { RECOVERY, REVENUE } from '../config/economy';
import { addEffect, addNews, applyDeltas, phaseOf, weekOf, type ActionResult } from './core';
import type { GameState, Modifier } from './types';

export interface RevenueLine { id: string; label: string; amount: number; note?: string }

const hasPolicy = (s: GameState, id: string) => s.policies.some((p) => p.id === id);

export function allocation(s: GameState) {
  return REVENUE.allocation * (ECONOMY.trustIncomeBase + (s.res.trust / 100) * ECONOMY.trustIncomeSlope);
}

/** Recurring weekly city revenue (excluding the trust-based central allocation). */
export function revenueStreams(s: GameState): RevenueLine[] {
  const st = s.mapStats;
  const commercialJobs = Object.values(s.districts).reduce((t, d) => t + d.retailJobs + d.officeJobs, 0);
  const lines: RevenueLine[] = [
    { id: 'property', label: 'Property tax', amount: s.city.population * REVENUE.propertyTaxPerResident, note: 'Grows with residents' },
    { id: 'commercial', label: 'Commercial tax', amount: commercialJobs * REVENUE.commercialTaxPerJob, note: 'Shops, markets and offices' },
    { id: 'industry', label: 'Industrial permits', amount: st.industryLoad * REVENUE.permitPerIndustryTile, note: 'Factories and godowns' },
  ];
  const parking = st.parkingTiles * REVENUE.parkingFeePerTile + (hasPolicy(s, 'parkingfees') ? s.city.traffic.privateTrips * REVENUE.smartParkingPerTrip : 0);
  if (parking > 0) lines.push({ id: 'parking', label: 'Parking fees', amount: parking });
  if (hasPolicy(s, 'congestion')) lines.push({ id: 'congestion', label: 'Congestion charges', amount: s.city.traffic.privateTrips * REVENUE.congestionChargePerTrip });
  if (hasPolicy(s, 'fines')) lines.push({ id: 'fines', label: 'Pollution fines', amount: st.industryLoad * REVENUE.finesPerIndustryTile });
  return lines;
}

export function districtRevenue(s: GameState, id: string) {
  const d = s.districts[id];
  if (!d) return 0;
  const occ = s.city.population / Math.max(1, s.mapStats.population);
  return d.capacity * occ * REVENUE.propertyTaxPerResident + (d.retailJobs + d.officeJobs) * REVENUE.commercialTaxPerJob +
    d.industryLoad * REVENUE.permitPerIndustryTile + d.parkingTiles * REVENUE.parkingFeePerTile;
}

export interface ExpenseLine { label: string; amount: number }

/** Weekly revenue and debt service as a simulation modifier. */
export function financeModifier(s: GameState): Modifier {
  return {
    incomePerWeek: revenueStreams(s).reduce((t, l) => t + l.amount, 0),
    upkeepPerWeek: s.finance.loans.reduce((t, l) => t + l.perWeek, 0),
  };
}

/** Called at the end of every week. */
export function weeklyFinance(s: GameState) {
  for (const l of s.finance.loans) l.weeksLeft -= 1;
  const done = s.finance.loans.filter((l) => l.weeksLeft <= 0);
  if (done.length) addNews(s, 'gov', 'Loan Fully Repaid; Finance Ministry Sends a Rare Thank-You Note');
  s.finance.loans = s.finance.loans.filter((l) => l.weeksLeft > 0);
  s.finance.devFeesLastWeek = s.finance.devFeesWeek;
  s.finance.devFeesWeek = 0;
}

/* ------------------------------------------------------------------ recovery options */

export interface RecoveryOption { id: 'grant' | 'loan' | 'investment' | 'cuts'; name: string; available: boolean; reason?: string; summary: string }

export function recoveryOptions(s: GameState): RecoveryOption[] {
  const phase = phaseOf(s);
  const R = RECOVERY;
  const low = (lim: number) => s.res.budget < lim;
  return [
    { id: 'grant', name: 'Emergency grant from the Centre', available: low(R.grant.budgetBelow) && s.finance.grantPhase !== phase, reason: s.finance.grantPhase === phase ? 'Already used this quarter' : `Only when the treasury is below ₹${R.grant.budgetBelow.toLocaleString('en-IN')}`, summary: `+₹${R.grant.amount.toLocaleString('en-IN')} now · pressure +${R.grant.deltas.pressure} · the Ministry will remember` },
    { id: 'loan', name: 'Municipal loan', available: s.finance.loans.filter((l) => l.principal === R.loan.principal).length < R.loan.max, reason: `At most ${R.loan.max} loans at a time`, summary: `+₹${R.loan.principal.toLocaleString('en-IN')} now · repay ₹${R.loan.perWeek}/wk for ${R.loan.weeks} weeks` },
    { id: 'investment', name: 'Private investment (PPP)', available: low(R.investment.budgetBelow) && s.finance.investmentPhase !== phase, reason: s.finance.investmentPhase === phase ? 'Investors already approached this quarter' : `Only when the treasury is below ₹${R.investment.budgetBelow.toLocaleString('en-IN')}`, summary: `+₹${R.investment.amount.toLocaleString('en-IN')} now · revenue share ₹${R.investment.perWeek}/wk for ${R.investment.weeks} weeks · credibility −3` },
    { id: 'cuts', name: 'Spending cuts', available: s.tick >= s.finance.cutsUntil, reason: 'Cuts were made recently', summary: `Upkeep −30% for ${R.cuts.weeks} weeks · research slows · trust falls` },
  ];
}

export function applyRecovery(s: GameState, id: RecoveryOption['id']): ActionResult {
  const opt = recoveryOptions(s).find((o) => o.id === id);
  if (!opt) return { ok: false, msg: 'Unknown option' };
  if (!opt.available) return { ok: false, msg: opt.reason ?? 'Not available' };
  const R = RECOVERY;
  switch (id) {
    case 'grant':
      s.res.budget += R.grant.amount;
      applyDeltas(s, R.grant.deltas);
      s.finance.grantPhase = phaseOf(s);
      addNews(s, 'satire', 'Commissioner Requests Emergency Funds; Centre Sends Money and a Strongly Worded Letter');
      break;
    case 'loan':
      s.res.budget += R.loan.principal;
      s.finance.loans.push({ principal: R.loan.principal, perWeek: R.loan.perWeek, weeksLeft: R.loan.weeks });
      addNews(s, 'gov', 'Department Takes Municipal Loan; Interest Rate Described as “Reasonable” by Bank');
      break;
    case 'investment':
      s.res.budget += R.investment.amount;
      s.finance.loans.push({ principal: R.investment.amount, perWeek: R.investment.perWeek, weeksLeft: R.investment.weeks });
      applyDeltas(s, R.investment.deltas);
      s.finance.investmentPhase = phaseOf(s);
      addNews(s, 'gov', 'Private Investors Back Clean Air Mission; Ask Only for “a Small Share and a Big Hoarding”');
      break;
    case 'cuts':
      addEffect(s, 'cuts', 'Austerity measures', R.cuts.weeks, R.cuts.modifier, 'bad');
      s.finance.cutsUntil = s.tick + (R.cuts.cooldownWeeks * TICKS_PER_WEEK);
      addNews(s, 'gov', 'Department Announces Austerity; Tea Now Served Without Biscuits');
      break;
  }
  return { ok: true, msg: opt.name };
}

export const weeksLeftInTerm = (s: GameState) => Math.max(0, CAMPAIGN_WEEKS - weekOf(s) + 1);
export const WEEKS_PER_QUARTER = WEEKS_PER_PHASE;
