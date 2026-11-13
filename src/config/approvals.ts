/**
 * Pending Approvals: proposals that land on the Commissioner's desk.
 * Each approval has money now, money every week, environmental, trust and political effects,
 * and sometimes consequences that arrive weeks later. Reject outcomes have consequences too.
 */
import type { Deltas, GameState, Modifier, Placeable, Zone } from '../engine/types';

export interface PolicyDef {
  id: string;
  name: string;
  modifier: Modifier;
  /** weeks until it lapses; omit for a standing policy */
  weeks?: number;
  repealable: boolean;
  repealDeltas?: Deltas;
}

export interface Outcome {
  /** positive = money in, negative = cost (must be affordable) */
  budget?: number;
  deltas?: Deltas;
  policy?: PolicyDef;
  /** put up a building on the proposal's site (private construction) */
  build?: Placeable;
  delayed?: { weeks: number; label: string; deltas?: Deltas; policy?: PolicyDef; endPolicy?: string; news: string };
  news: string;
}

export interface ImpactText {
  immediate: string;
  recurring: string;
  environment: string;
  trust: string;
  political: string;
  delayed: string;
}

export interface ProposalTemplate {
  id: string;
  title: string;
  proposer: string;
  /** one line of personality */
  quote: string;
  category: 'Industry' | 'Development' | 'Transport' | 'Finance' | 'Environment';
  site?: { zone: Zone; kind: Placeable };
  /** fixed number rolled when the proposal arrives (e.g. sponsorship money) */
  amount?: (s: GameState) => number;
  condition: (s: GameState) => boolean;
  weight: (s: GameState) => number;
  approve: (amount: number) => Outcome;
  reject: Outcome;
  impact: (amount: number) => ImpactText;
  rejectText: string;
}

const has = (s: GameState, id: string) => s.policies.some((p) => p.id === id);
const week = (s: GameState) => Math.floor(s.tick / 60) + 1;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const PROPOSALS: ProposalTemplate[] = [
  {
    id: 'factory',
    title: 'Steel plant permit',
    proposer: 'Seth Dhanraj Ghoshal, Ghoshal Steel & Alloys',
    quote: '“Commissioner-ji, 800 jobs, crores in taxes, and the smoke will mostly go up.”',
    category: 'Industry',
    site: { zone: 'ind', kind: 'factory' },
    amount: () => 6000,
    condition: (s) => week(s) >= 2,
    weight: (s) => 1 + s.city.unemployment * 4,
    approve: (a) => ({ budget: a, build: 'factory', deltas: { capital: 3, trust: -1 }, news: 'Permit Granted to Ghoshal Steel; Seth-ji Distributes Laddoos and Dust Masks' }),
    reject: { deltas: { capital: -2, pressure: 2 }, news: 'Commissioner Rejects Steel Plant; Industry Body Calls It “Anti-Development”' },
    impact: (a) => ({ immediate: `+${inr(a)} permit fee`, recurring: '≈ +₹250/wk permits & taxes once running', environment: 'More industrial smoke near the site', trust: '−1 (neighbours worried)', political: 'Industry lobby pleased: +3 capital', delayed: 'Plant opens after 3 weeks of construction' }),
    rejectText: 'Industry lobby displeased: −2 capital, +2 pressure',
  },
  {
    id: 'mall',
    title: 'Commercial complex',
    proposer: 'Ms. Kavya Bansal, Mega Malls Pvt Ltd',
    quote: '“Delhi deserves a world-class mall. With world-class parking, obviously.”',
    category: 'Development',
    site: { zone: 'com', kind: 'office' },
    amount: () => 5000,
    condition: (s) => week(s) >= 3,
    weight: () => 1,
    approve: (a) => ({ budget: a, build: 'office', deltas: { trust: 1 }, news: 'Mega Mall Approved; Residents Excited About Food Court, Less About Traffic' }),
    reject: { deltas: { pressure: 1 }, news: 'Mall Proposal Rejected; Developer Threatens to Build in Gurugram Instead' },
    impact: (a) => ({ immediate: `+${inr(a)} development fee`, recurring: '+ commercial tax from 1,200 jobs', environment: 'Construction dust now; more car trips later', trust: '+1 (jobs, food court)', political: 'Neutral', delayed: 'Opens after 3 weeks' }),
    rejectText: 'Developers grumble: +1 pressure',
  },
  {
    id: 'housing',
    title: 'Affordable housing project',
    proposer: 'Sunrise Builders & Promoters',
    quote: '“2BHK, 3BHK, and a brochure with a lot of trees in it.”',
    category: 'Development',
    site: { zone: 'res', kind: 'apartment' },
    amount: () => 3500,
    condition: (s) => week(s) >= 6 && s.city.demand.res > 0,
    weight: (s) => 1 + Math.max(0, s.city.overcrowding) * 10,
    approve: (a) => ({ budget: a, build: 'apartment', deltas: { trust: 2 }, news: 'Housing Society Approved; Brochure Trees Expected to Remain on Brochure' }),
    reject: { deltas: { trust: -1 }, news: 'Housing Project Rejected; Renters’ Association Disappointed' },
    impact: (a) => ({ immediate: `+${inr(a)} development fee`, recurring: '+ property tax from 2,400 residents', environment: 'More households, more trips and waste', trust: '+2 (homes for families)', political: 'Neutral', delayed: 'Ready after 3 weeks' }),
    rejectText: 'Renters disappointed: −1 trust',
  },
  {
    id: 'congestion',
    title: 'Congestion charge on central roads',
    proposer: 'Jaswant Rao, Traffic Police Commissioner',
    quote: '“Make them pay to sit in traffic. They already pay with their patience.”',
    category: 'Transport',
    condition: (s) => s.city.traffic.congestion > 0.95 && !has(s, 'congestion'),
    weight: (s) => s.city.traffic.congestion,
    approve: () => ({ deltas: { trust: -6, pressure: 2 }, policy: { id: 'congestion', name: 'Congestion charge', modifier: { privateTripMult: 0.9, trustPerWeek: -0.3 }, repealable: true, repealDeltas: { trust: 3 } }, news: 'Congestion Charge Approved; Drivers Discover Public Transport Exists' }),
    reject: { news: 'Congestion Charge Shelved; Traffic Remains Free (and Stationary)' },
    impact: () => ({ immediate: 'No cost', recurring: '≈ +₹900/wk in charges', environment: '−10% private car trips', trust: '−6 now, −0.3 every week', political: '+2 pressure from car owners', delayed: 'Can be repealed later (+3 trust)' }),
    rejectText: 'No effect',
  },
  {
    id: 'fines',
    title: 'Fine polluting units',
    proposer: 'Delhi Pollution Control Committee',
    quote: '“We have the instruments. We would like permission to use them.”',
    category: 'Environment',
    condition: (s) => !has(s, 'fines') && s.mapStats.industryLoad > 40,
    weight: () => 1,
    approve: () => ({ deltas: { capital: -4, pressure: 4 }, policy: { id: 'fines', name: 'Polluter fines', modifier: { control: { industry: 0.06 }, pressurePerWeek: 0.3 }, repealable: true, repealDeltas: { capital: 3 } }, news: 'Pollution Fines Begin; Factory Owners Discover the Phrase “Compliance Officer”' }),
    reject: { deltas: { credibility: -2 }, news: 'Fines Proposal Returned for “Further Examination”' },
    impact: () => ({ immediate: 'No cost', recurring: '≈ +₹500/wk in fines', environment: 'Industrial emissions −6%', trust: 'Neutral', political: '−4 capital, +4 pressure now, +0.3 pressure/wk', delayed: 'Industry may ask for a waiver later' }),
    rejectText: '−2 credibility',
  },
  {
    id: 'sponsor',
    title: 'Corporate sponsorship offer',
    proposer: 'Smoky Cola Beverages Ltd',
    quote: '“Clean Air Mission, presented by Smoky Cola. Refreshingly breathable.”',
    category: 'Finance',
    amount: (s) => 12000 + Math.floor((s.rngState >>> 0) % 5) * 1000,
    condition: (s) => week(s) >= 3,
    weight: (s) => (s.res.budget < 10000 ? 2 : 0.8),
    approve: (a) => ({ budget: a, deltas: { credibility: -10, exposureRisk: 0.2 }, delayed: { weeks: 6, label: 'Sponsor scandal', deltas: { trust: -4 }, news: 'Sponsor’s Bottling Plant Caught Burning Plastic; Clean Air Logo Quietly Removed' }, news: 'Clean Air Mission Now Sponsored by Smoky Cola; Critics Choke on Irony' }),
    reject: { deltas: { credibility: 2 }, news: 'Commissioner Declines Cola Money; Journalists Briefly Impressed' },
    impact: (a) => ({ immediate: `+${inr(a)}`, recurring: 'None', environment: 'None', trust: 'Conflict-of-interest questions', political: '−10 credibility, journalists start digging', delayed: 'Scandal likely in ~6 weeks (−4 trust)' }),
    rejectText: '+2 credibility',
  },
  {
    id: 'waiver',
    title: 'Pollution-fine waiver request',
    proposer: 'Okhla Industries Association',
    quote: '“A small waiver, a big contribution to… the city. Nothing in writing.”',
    category: 'Industry',
    amount: () => 4000,
    condition: (s) => (has(s, 'fines') || s.buildings.industrial > 0) && week(s) >= 5,
    weight: () => 1.2,
    approve: (a) => ({ budget: a, deltas: { capital: 6, credibility: -6, exposureRisk: 0.1 }, policy: { id: 'waiver', name: 'Fine waiver for industry', modifier: { emissionMult: { industry: 1.08 } }, weeks: 20, repealable: false }, news: 'Industry Granted “Temporary” Waiver; Chimneys Celebrate' }),
    reject: { deltas: { pressure: 3, capital: -2 }, news: 'Waiver Denied; Industrialists Call Minister From Golf Course' },
    impact: (a) => ({ immediate: `+${inr(a)} “contribution”`, recurring: 'None', environment: 'Industrial emissions +8% for 20 weeks', trust: 'Hidden — until it isn’t', political: '+6 capital, −6 credibility', delayed: 'Waiver lapses after 20 weeks' }),
    rejectText: '+3 pressure, −2 capital',
  },
  {
    id: 'relocate',
    title: 'Shift polluting units to an industrial park',
    proposer: 'Delhi State Industrial Development Corp.',
    quote: '“New sheds, CNG boilers, and a bus route. Only slightly far away.”',
    category: 'Industry',
    amount: () => 20000,
    condition: (s) => week(s) >= 10 && !has(s, 'industrialpark') && !s.delayed.some((d) => d.label === 'Industrial park opens'),
    weight: () => 0.8,
    approve: (a) => ({ budget: -a, deltas: { trust: -3, pressure: 3 }, policy: { id: 'relocation', name: 'Relocation disruption', modifier: { trustPerWeek: -0.4 }, weeks: 8, repealable: false }, delayed: { weeks: 8, label: 'Industrial park opens', deltas: { trust: 4 }, policy: { id: 'industrialpark', name: 'Modern industrial park', modifier: { emissionMult: { industry: 0.85 } }, repealable: false }, news: 'Industrial Park Opens; Units Move to CNG; Okhla Residents Open Windows' }, news: 'Relocation Scheme Approved; Workers Face Longer Commutes for Now' }),
    reject: { news: 'Relocation Scheme Shelved; Units Stay Where They Are (and Where You Live)' },
    impact: (a) => ({ immediate: `−${inr(a)} compensation & sheds`, recurring: 'None', environment: 'Industrial emissions −15% once complete', trust: '−3 now, −0.4/wk during the move, +4 when done', political: '+3 pressure (job disruption)', delayed: 'Industrial park opens in 8 weeks' }),
    rejectText: 'No effect',
  },
  {
    id: 'cleantech',
    title: 'Clean-technology incentives',
    proposer: 'Dr. Meera Iyer, Clean Energy Council',
    quote: '“Subsidise the boilers today, breathe easier the year after.”',
    category: 'Environment',
    condition: (s) => week(s) >= 8 && !has(s, 'cleantech') && !has(s, 'cleantech-active'),
    weight: () => 0.9,
    approve: () => ({ deltas: { trust: 1 }, policy: { id: 'cleantech', name: 'Clean-tech subsidy', modifier: { upkeepPerWeek: 600 }, repealable: true }, delayed: { weeks: 6, label: 'Clean tech adopted', policy: { id: 'cleantech-active', name: 'Clean-tech adoption', modifier: { control: { industry: 0.08, transport: 0.04 }, incomePerWeek: 120 }, repealable: false }, news: 'Factories Switch to Cleaner Boilers; Subsidy Officially “Not Wasted”' }, news: 'Clean-Tech Incentives Approved; Economists Nod Thoughtfully' }),
    reject: { news: 'Clean-Tech Incentives Deferred to Next Financial Year (Again)' },
    impact: () => ({ immediate: 'No cost now', recurring: '−₹600/wk subsidy (repealable)', environment: 'Industry −8%, transport −4% after 6 weeks', trust: '+1', political: 'Neutral', delayed: 'Benefits arrive in 6 weeks (+₹120/wk revenue)' }),
    rejectText: 'No effect',
  },
  {
    id: 'parkingfees',
    title: 'Smart parking fees',
    proposer: 'Municipal Corporation of Delhi',
    quote: '“Parking is not a fundamental right. Please do not quote us.”',
    category: 'Transport',
    condition: (s) => week(s) >= 4 && !has(s, 'parkingfees'),
    weight: () => 0.8,
    approve: () => ({ deltas: { trust: -2 }, policy: { id: 'parkingfees', name: 'Smart parking fees', modifier: { privateTripMult: 0.97 }, repealable: true, repealDeltas: { trust: 1 } }, news: 'Smart Parking Fees Begin; Uncles Discover QR Codes' }),
    reject: { news: 'Parking Fees Rejected; Footpaths Remain Car Parks' },
    impact: () => ({ immediate: 'No cost', recurring: '≈ +₹150/wk', environment: '−3% private car trips', trust: '−2', political: 'Neutral', delayed: 'Can be repealed later' }),
    rejectText: 'No effect',
  },
];

export const PROPOSAL_MAP = Object.fromEntries(PROPOSALS.map((p) => [p.id, p])) as Record<string, ProposalTemplate>;

export const APPROVALS_CFG = { weeklyChance: 0.5, maxPending: 3, expireWeeks: 3, firstWeek: 2 };
