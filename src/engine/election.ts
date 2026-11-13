/**
 * The week-52 election. Delhi's 70 seats are split across neighbourhoods by population; each
 * neighbourhood votes on a weighted scorecard. Air quality matters — but it cannot win alone.
 */
import { BUILDINGS } from '../config/balance';
import { ELECTION } from '../config/election';
import { districtAqi } from './air';
import { clamp, reductionPct, weekOf } from './core';
import { DISTRICTS } from './map';
import type { GameState } from './types';

export interface Factor { id: string; label: string; score: number; weight: number }
export interface DistrictResult { id: string; name: string; seats: number; share: number; won: boolean; aqi: number; residents: number }
export interface ElectionResult {
  voteShare: number;
  seatsWon: number;
  totalSeats: number;
  majority: number;
  won: boolean;
  factors: Factor[];
  districts: DistrictResult[];
  strengths: string[];
  weaknesses: string[];
  headline: string;
}

/** Largest-remainder seat allocation by residents. */
export function allocateSeats(pop: Record<string, number>, total = ELECTION.seats) {
  const ids = DISTRICTS.map((d) => d.id);
  const sum = ids.reduce((t, id) => t + Math.max(0, pop[id] ?? 0), 0) || 1;
  const quota = ids.map((id) => ({ id, q: (Math.max(0, pop[id] ?? 0) / sum) * total }));
  const seats: Record<string, number> = {};
  let used = 0;
  for (const { id, q } of quota) {
    seats[id] = Math.floor(q);
    used += seats[id];
  }
  for (const { id } of [...quota].sort((a, b) => (b.q % 1) - (a.q % 1)).slice(0, total - used)) seats[id] += 1;
  return seats;
}

const TEXT: Record<string, [string, string]> = {
  trust: ['Citizens trusted you', 'Voters stopped believing you'],
  air: ['People could breathe in their own neighbourhoods', 'Neighbourhoods still choked'],
  improvement: ['You measurably beat “doing nothing”', 'Your work barely moved the needle'],
  jobs: ['There was work for those who wanted it', 'Unemployment hurt'],
  economy: ['The books balanced', 'The treasury was a mess'],
  infrastructure: ['You built things people can see', 'Little to show on the ground'],
  reputation: ['Your reputation stayed clean', 'Scandals and pressure caught up with you'],
  objectives: ['You delivered on weekly promises', 'Too many missed targets'],
};

export function computeElection(s: GameState): ElectionResult {
  const W = ELECTION.weights;
  const st = s.stats;
  const facilityLevels = BUILDINGS.reduce((t, b) => t + s.buildings[b.id], 0);
  const maxLevels = BUILDINGS.reduce((t, b) => t + b.levels.length, 0);
  const weeks = Math.max(1, Math.min(weekOf(s), 52));
  const net = s.settlement?.net ?? 0;
  const playerProjects = s.cityEdits.placed.filter((p) => !p.organic && p.built).length;
  const city: Record<string, number> = {
    trust: s.res.trust / 100,
    improvement: clamp(reductionPct(s) / 40, 0, 1),
    jobs: 1 - clamp(s.city.unemployment * 4, 0, 1),
    economy: clamp(0.5 + net / 4000, 0, 1) - (s.res.budget < 0 ? 0.3 : 0),
    // only what the Commissioner built — private developers don't count
    infrastructure: clamp(0.6 * (facilityLevels / maxLevels) + 0.4 * (playerProjects / 15), 0, 1),
    reputation: clamp(0.7 * (s.res.credibility / 100) + 0.3 * (1 - s.res.pressure / 100), 0, 1),
    objectives: clamp(st.objectivesDone / (weeks * 1.5), 0, 1),
  };
  const seats = allocateSeats(s.air.pop);
  const districts: DistrictResult[] = DISTRICTS.map((d) => {
    const aqi = districtAqi(s.air, s.conc, d.id);
    const air = 1 - clamp((aqi - 100) / 300, 0, 1);
    const ds = s.districts[d.id];
    const workers = (s.air.pop[d.id] ?? 0) * 0.45;
    const localJobs = workers > 0 ? clamp((ds?.jobs ?? 0) / workers, 0, 1.5) / 1.5 : 1;
    const jobs = 0.7 * city.jobs + 0.3 * localJobs;
    const score = W.trust * city.trust + W.air * air + W.improvement * city.improvement + W.jobs * jobs + W.economy * city.economy +
      W.infrastructure * city.infrastructure + W.reputation * city.reputation + W.objectives * city.objectives;
    const share = ELECTION.floor + ELECTION.span * score;
    return { id: d.id, name: d.name, seats: seats[d.id], share, won: share >= 50, aqi, residents: Math.round(s.air.pop[d.id] ?? 0) };
  });
  const totalPop = districts.reduce((t, d) => t + d.residents, 0) || 1;
  const voteShare = districts.reduce((t, d) => t + d.share * d.residents, 0) / totalPop;
  const seatsWon = districts.reduce((t, d) => t + (d.won ? d.seats : 0), 0);
  const airAvg = districts.reduce((t, d) => t + (1 - clamp((d.aqi - 100) / 300, 0, 1)) * d.residents, 0) / totalPop;
  const factors: Factor[] = [
    { id: 'trust', label: 'Public trust', score: city.trust, weight: W.trust },
    { id: 'air', label: 'Air in neighbourhoods', score: airAvg, weight: W.air },
    { id: 'improvement', label: 'Improvement vs doing nothing', score: city.improvement, weight: W.improvement },
    { id: 'jobs', label: 'Jobs', score: city.jobs, weight: W.jobs },
    { id: 'economy', label: 'City finances', score: city.economy, weight: W.economy },
    { id: 'infrastructure', label: 'Infrastructure', score: city.infrastructure, weight: W.infrastructure },
    { id: 'reputation', label: 'Reputation', score: city.reputation, weight: W.reputation },
    { id: 'objectives', label: 'Promises kept', score: city.objectives, weight: W.objectives },
  ];
  const ranked = [...factors].sort((a, b) => b.score - a.score);
  const strengths = ranked.slice(0, 2).filter((f) => f.score >= 0.5).map((f) => TEXT[f.id][0]);
  const weaknesses = ranked.slice(-2).filter((f) => f.score < 0.5).map((f) => TEXT[f.id][1]);
  const won = seatsWon >= ELECTION.majority;
  const headline = won
    ? seatsWon >= 50 ? 'Landslide! Delhi Votes for Cleaner Air' : 'Commissioner’s Party Scrapes Through'
    : seatsWon >= 30 ? 'Hung Assembly; Coalition Talks Begin Over Samosas' : 'Voters Show the Door — Through the Smog';
  return { voteShare, seatsWon, totalSeats: ELECTION.seats, majority: ELECTION.majority, won, factors, districts, strengths, weaknesses, headline };
}
