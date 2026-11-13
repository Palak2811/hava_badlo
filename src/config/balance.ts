/**
 * HAWA BADLO — central balance configuration.
 * Every number that shapes the economy or the simulation lives here.
 */
import type { BuildingId, Cost, Modifier, Resources, SeasonId, Source } from '../engine/types';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'hawa-badlo-save-v1';
export const SETTINGS_KEY = 'hawa-badlo-settings';

/** One tick = one in-game "second". At 1x speed one tick happens every real second. */
export const TICKS_PER_WEEK = 60;
export const CAMPAIGN_WEEKS = 52;
export const WEEKS_PER_PHASE = 13;
export const CAMPAIGN_PHASES = CAMPAIGN_WEEKS / WEEKS_PER_PHASE;

export const START: Resources = {
  budget: 10000,
  rp: 0,
  trust: 65,
  pressure: 30,
  credibility: 100,
  capital: 10,
  cac: 0,
};
export const START_PARTICIPATION = 10;

export const ECONOMY = {
  /** Base central allocation, ₹ per in-game day. */
  /** central allocation (see also config/economy.ts for city revenue streams) */
  baseIncomePerWeek: 900,
  /** income multiplier = trustIncomeBase + trust/100 * trustIncomeSlope */
  trustIncomeBase: 0.6,
  trustIncomeSlope: 0.6,
  baseCapitalPerWeek: 1,
  /** Budget may not fall below this (an overdraft from the Finance Ministry). */
  debtFloor: -5000,
  /** When in debt, trust and pressure suffer per day. */
  debtTrustPerWeek: -2,
  debtPressurePerWeek: 3,
  /** Clean Air Credits earned per day per AQI point of reduction vs baseline. */
  cacPerAqiPointDay: 0.1,
  grantCac: 20,
  grantBudget: 6000,
};

export const OFFLINE = {
  maxSeconds: 8 * 3600,
  /** Real seconds per offline tick-equivalent. The department works at 1x while you are away. */
  efficiency: 0.5,
  /** offline income cannot exceed this many in-game days worth */
  maxWeeksOfIncome: 6,
};

export const POLLUTION = {
  base: { transport: 120, dust: 100, industry: 90, agriculture: 80, waste: 50, other: 60 } as Record<Source, number>,
  /** concentration produced per unit of emission at dispersion 1 */
  emissionToConc: 0.35,
  /** fraction of the gap to steady-state closed per tick */
  relaxation: 0.08,
  /** maximum combined control efficiency for any single source */
  maxControl: 0.85,
  startConc: 95,
  windMin: 0.85,
  windMax: 1.15,
};

/** PM2.5-style breakpoints → illustrative game AQI (inspired by India's NAQI bands). */
export const AQI_BREAKPOINTS: [number, number, number, number][] = [
  [0, 30, 0, 50],
  [30, 60, 50, 100],
  [60, 90, 100, 200],
  [90, 120, 200, 300],
  [120, 250, 300, 400],
  [250, 380, 400, 500],
];

export interface SeasonDef {
  id: SeasonId;
  name: string;
  fromWeek: number;
  dispersion: number;
  mult: Record<Source, number>;
  blurb: string;
}

export const SEASONS: SeasonDef[] = [
  {
    id: 'monsoon',
    name: 'Late Monsoon',
    fromWeek: 1,
    dispersion: 1.5,
    mult: { transport: 1, dust: 0.8, industry: 1, agriculture: 0.3, waste: 1, other: 1 },
    blurb: 'Rain and strong winds wash pollutants out. Enjoy it while it lasts.',
  },
  {
    id: 'postmonsoon',
    name: 'Post-Monsoon (Parali)',
    fromWeek: 14,
    dispersion: 1.1,
    mult: { transport: 1, dust: 1.05, industry: 1, agriculture: 1.8, waste: 1.1, other: 1.1 },
    blurb: 'Paddy harvest ends; farmers have ~2 weeks to clear fields for wheat. Smoke drifts in from the north-west.',
  },
  {
    id: 'winter',
    name: 'Winter Inversion',
    fromWeek: 27,
    dispersion: 0.75,
    mult: { transport: 1.05, dust: 1, industry: 1, agriculture: 0.8, waste: 1.3, other: 1.15 },
    blurb: 'Cold, still air traps a lid of pollution near the ground. Low winds = low dispersion.',
  },
  {
    id: 'spring',
    name: 'Spring (Election Season)',
    fromWeek: 40,
    dispersion: 1.25,
    mult: { transport: 1.05, dust: 1.15, industry: 1, agriculture: 0.4, waste: 1, other: 1 },
    blurb: 'Warmer air mixes higher and the smog lifts — just as voters start paying attention.',
  },
];

export interface BuildingLevel {
  cost: Cost;
  maintenance: number;
  modifier: Modifier;
  requiresResearch?: string;
  summary: string;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  short: string;
  description: string;
  icon: string;
  color: string;
  sources: Source[];
  unlock: { week?: number; building?: BuildingId; stage?: number };
  unlockText: string;
  /** greenery-style long-term maturity: days to reach full strength */
  maturityWeeks?: number;
  levels: BuildingLevel[];
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'monitor',
    name: 'AQI Monitoring Centre',
    short: 'Monitoring',
    description: 'Sensors, data scientists and one very tired intern. Generates research and reveals pollution spikes before they hit.',
    icon: '📡',
    color: '#8b5cf6',
    sources: [],
    unlock: { week: 1 },
    unlockText: 'Available from week 1',
    levels: [
      { cost: { budget: 2500 }, maintenance: 60, summary: '+40 RP/wk · 25% coverage', modifier: { researchPerWeek: 40, coverage: 25 } },
      { cost: { budget: 6000 }, maintenance: 110, summary: '+90 RP/wk · 55% coverage · warns of spikes', modifier: { researchPerWeek: 90, coverage: 55, eventSeverityMult: 0.9 } },
      { cost: { budget: 14000, rp: 100 }, maintenance: 180, summary: '+160 RP/wk · 90% coverage · spikes -20%', modifier: { researchPerWeek: 160, coverage: 90, eventSeverityMult: 0.8, trustPerWeek: 0.3 } },
    ],
  },
  {
    id: 'dust',
    name: 'Dust Control Unit',
    short: 'Dust Control',
    description: 'Mechanical sweepers, water sprinklers and stern letters to construction sites.',
    icon: '🧹',
    color: '#f59e0b',
    sources: ['dust'],
    unlock: { week: 1 },
    unlockText: 'Available from week 1',
    levels: [
      { cost: { budget: 4000 }, maintenance: 90, summary: 'Road dust -20%', modifier: { control: { dust: 0.2 } } },
      { cost: { budget: 9000 }, maintenance: 150, summary: 'Road dust -35%', modifier: { control: { dust: 0.35 } } },
      { cost: { budget: 18000 }, maintenance: 230, summary: 'Road dust -50%', modifier: { control: { dust: 0.5 }, trustPerWeek: 0.2 } },
      { cost: { budget: 30000, rp: 150 }, maintenance: 320, requiresResearch: 'a_dust', summary: 'Road dust -65% (paved shoulders, misting)', modifier: { control: { dust: 0.65 }, trustPerWeek: 0.3 } },
    ],
  },
  {
    id: 'bus',
    name: 'Electric Bus Depot',
    short: 'E-Bus Depot',
    description: 'Silent electric buses that actually show up. Fewer cars, cleaner roads.',
    icon: '🚌',
    color: '#0ea5e9',
    sources: ['transport'],
    unlock: { week: 3 },
    unlockText: 'Unlocks in week 3 (procurement paperwork)',
    levels: [
      { cost: { budget: 9000 }, maintenance: 150, summary: 'Transport -15% · trust +', modifier: { control: { transport: 0.15 }, trustPerWeek: 0.3 } },
      { cost: { budget: 18000 }, maintenance: 240, summary: 'Transport -28%', modifier: { control: { transport: 0.28 }, trustPerWeek: 0.5 } },
      { cost: { budget: 32000, rp: 200 }, maintenance: 340, requiresResearch: 'a_ebus', summary: 'Transport -42% · fare revenue', modifier: { control: { transport: 0.42 }, trustPerWeek: 0.7, incomePerWeek: 200 } },
    ],
  },
  {
    id: 'greenery',
    name: 'Urban Greenery Office',
    short: 'Greenery',
    description: 'Trees, green belts and dust-trapping hedges. Slow to grow, hard to stop.',
    icon: '🌳',
    color: '#22c55e',
    sources: ['dust', 'other'],
    unlock: { week: 1 },
    unlockText: 'Available from week 1',
    maturityWeeks: 5,
    levels: [
      { cost: { budget: 3000 }, maintenance: 50, summary: 'Dust/other -5% (matures over 5 days) · trust +', modifier: { control: { dust: 0.05, other: 0.05 }, trustPerWeek: 0.4, participationPerWeek: 0.3 } },
      { cost: { budget: 8000 }, maintenance: 90, summary: 'Dust/other -10%', modifier: { control: { dust: 0.1, other: 0.1 }, trustPerWeek: 0.6, participationPerWeek: 0.5 } },
      { cost: { budget: 16000 }, maintenance: 140, summary: 'Dust/other -16% · city cools down', modifier: { control: { dust: 0.15, other: 0.16 }, trustPerWeek: 0.8, participationPerWeek: 0.7 } },
    ],
  },
  {
    id: 'industrial',
    name: 'Industrial Inspection Office',
    short: 'Inspections',
    description: 'Inspectors who inspect. Revolutionary. Industry lobbies are not amused.',
    icon: '🏭',
    color: '#64748b',
    sources: ['industry'],
    unlock: { building: 'monitor' },
    unlockText: 'Requires an AQI Monitoring Centre',
    levels: [
      { cost: { budget: 7000 }, maintenance: 120, summary: 'Industry -20% · lobby pressure +', modifier: { control: { industry: 0.2 }, pressurePerWeek: 0.5 } },
      { cost: { budget: 15000 }, maintenance: 190, summary: 'Industry -35%', modifier: { control: { industry: 0.35 }, pressurePerWeek: 0.7 } },
      { cost: { budget: 28000, rp: 180 }, maintenance: 280, requiresResearch: 'a_industry', summary: 'Industry -50% (continuous monitoring)', modifier: { control: { industry: 0.5 }, pressurePerWeek: 0.5, trustPerWeek: 0.3 } },
    ],
  },
  {
    id: 'waste',
    name: 'Waste Management Centre',
    short: 'Waste Mgmt',
    description: 'Segregation, collection and composting so nobody has to burn the garbage mountain.',
    icon: '♻️',
    color: '#14b8a6',
    sources: ['waste'],
    unlock: { week: 2 },
    unlockText: 'Unlocks in week 2',
    levels: [
      { cost: { budget: 5000 }, maintenance: 90, summary: 'Waste burning -25%', modifier: { control: { waste: 0.25 } } },
      { cost: { budget: 11000 }, maintenance: 150, summary: 'Waste burning -40%', modifier: { control: { waste: 0.4 }, trustPerWeek: 0.2 } },
      { cost: { budget: 22000, rp: 150 }, maintenance: 200, requiresResearch: 'a_waste', summary: 'Waste burning -60% · compost income', modifier: { control: { waste: 0.6 }, trustPerWeek: 0.3, incomePerWeek: 150 } },
    ],
  },
  {
    id: 'parali',
    name: 'Parali Management Cell',
    short: 'Parali Cell',
    description: 'Happy-seeder subsidies, bio-decomposers and actually talking to farmers and neighbouring states. Carrots, not just sticks.',
    icon: '🌾',
    color: '#eab308',
    sources: ['agriculture'],
    unlock: { stage: 2 },
    unlockText: 'Unlocks in Stage 2: Operation Clean Air',
    levels: [
      { cost: { budget: 12000, capital: 5 }, maintenance: 200, summary: 'Stubble smoke -20%', modifier: { control: { agriculture: 0.2 }, trustPerWeek: 0.2 } },
      { cost: { budget: 24000, capital: 8 }, maintenance: 300, summary: 'Stubble smoke -35%', modifier: { control: { agriculture: 0.35 }, trustPerWeek: 0.3 } },
      { cost: { budget: 40000, capital: 12, rp: 220 }, maintenance: 420, requiresResearch: 'a_crop', summary: 'Stubble smoke -55% (residue markets)', modifier: { control: { agriculture: 0.55 }, trustPerWeek: 0.5, participationPerWeek: 0.4 } },
    ],
  },
  {
    id: 'pr',
    name: 'Public Relations Office',
    short: 'PR Office',
    description: 'Press releases, hashtags and the sacred art of looking busy. Unlocks the Department of Optics.',
    icon: '📣',
    color: '#ec4899',
    sources: [],
    unlock: { week: 1 },
    unlockText: 'Available from week 1',
    levels: [
      { cost: { budget: 2000 }, maintenance: 40, summary: '+1.5 capital/wk · pressure − · unlocks Optics', modifier: { capitalPerWeek: 1.5, pressurePerWeek: -0.5 } },
      { cost: { budget: 5000 }, maintenance: 80, summary: '+3 capital/wk · more schemes', modifier: { capitalPerWeek: 3, pressurePerWeek: -0.8 } },
      { cost: { budget: 10000 }, maintenance: 130, summary: '+5 capital/wk · official AQI "smoothing" 5%', modifier: { capitalPerWeek: 5, pressurePerWeek: -1, perceptionBias: 0.05 } },
    ],
  },
];

export const BUILDING_MAP = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<BuildingId, BuildingDef>;

export type Branch = 'A' | 'B' | 'C';
export interface ResearchDef {
  id: string;
  branch: Branch;
  name: string;
  description: string;
  icon: string;
  cost: Cost;
  requires: string[];
  modifier: Modifier;
  effectText: string;
}

export const RESEARCH: ResearchDef[] = [
  // Branch A — actual pollution control
  { id: 'a_network', branch: 'A', name: 'AQI Monitoring Network', icon: '🛰️', description: 'Low-cost sensors in every ward.', cost: { rp: 40 }, requires: [], modifier: { researchMult: 1.25, coverage: 10 }, effectText: '+25% research · +10% coverage' },
  { id: 'a_dust', branch: 'A', name: 'Advanced Dust Suppression', icon: '💧', description: 'Anti-smog guns that are aimed at the actual dust.', cost: { rp: 80, budget: 2000 }, requires: ['a_network'], modifier: { control: { dust: 0.05 } }, effectText: 'Dust -5% · unlocks Dust Unit L4' },
  { id: 'a_traffic', branch: 'A', name: 'Smart Traffic Management', icon: '🚦', description: 'Signals synchronised with reality instead of astrology.', cost: { rp: 90, budget: 3000 }, requires: ['a_network'], modifier: { control: { transport: 0.08 } }, effectText: 'Transport -8%' },
  { id: 'a_ebus', branch: 'A', name: 'Electric Public Transport', icon: '🔋', description: 'Charging grids and battery-swap stations.', cost: { rp: 140, budget: 5000 }, requires: ['a_traffic'], modifier: { control: { transport: 0.05 } }, effectText: 'Transport -5% · unlocks E-Bus L3' },
  { id: 'a_industry', branch: 'A', name: 'Industrial Emission Monitoring', icon: '📈', description: 'Stack sensors that report 24×7, even on Sundays.', cost: { rp: 140, budget: 4000 }, requires: ['a_network'], modifier: { control: { industry: 0.05 } }, effectText: 'Industry -5% · unlocks Inspections L3' },
  { id: 'a_crop', branch: 'A', name: 'Crop Residue Management', icon: '🚜', description: 'Make stubble worth more as fuel than as smoke.', cost: { rp: 160, budget: 5000, capital: 5 }, requires: ['a_industry'], modifier: { control: { agriculture: 0.08 } }, effectText: 'Stubble -8% · unlocks Parali Cell L3' },
  { id: 'a_energy', branch: 'A', name: 'Clean Energy Transition', icon: '☀️', description: 'Rooftop solar and gas for small industries.', cost: { rp: 240, budget: 8000, cac: 10 }, requires: ['a_ebus', 'a_industry'], modifier: { control: { industry: 0.1, other: 0.08 } }, effectText: 'Industry -10% · Other -8%' },
  { id: 'a_waste', branch: 'A', name: 'Advanced Waste Processing', icon: '🧪', description: 'Biomethanation and material recovery facilities.', cost: { rp: 120, budget: 4000 }, requires: ['a_network'], modifier: { control: { waste: 0.05 } }, effectText: 'Waste -5% · unlocks Waste L3' },
  // Branch B — public awareness
  { id: 'b_school', branch: 'B', name: 'School Awareness Campaign', icon: '🎒', description: 'Children: the most effective enforcement agency in any household.', cost: { rp: 30 }, requires: [], modifier: { participationPerWeek: 0.5, trustPerWeek: 0.2 }, effectText: '+participation · +trust' },
  { id: 'b_app', branch: 'B', name: 'Citizen Reporting App', icon: '📱', description: 'Snap a photo of garbage burning, get it fixed. Revolutionary.', cost: { rp: 70, budget: 1500 }, requires: ['b_school'], modifier: { control: { waste: 0.06, dust: 0.03 }, participationPerWeek: 0.6 }, effectText: 'Waste -6% · Dust -3% · +participation' },
  { id: 'b_carpool', branch: 'B', name: 'Carpooling Incentives', icon: '🚗', description: 'Four colleagues, one car, zero conversation.', cost: { rp: 80, budget: 2500 }, requires: ['b_school'], modifier: { control: { transport: 0.06 }, participationPerWeek: 0.4 }, effectText: 'Transport -6%' },
  { id: 'b_health', branch: 'B', name: 'Public Health Advisories', icon: '🩺', description: 'Honest warnings so people can protect themselves.', cost: { rp: 60 }, requires: ['b_school'], modifier: { trustPerWeek: 0.5 }, effectText: '+trust/wk' },
  { id: 'b_community', branch: 'B', name: 'Community Clean-Air Program', icon: '🤝', description: 'RWAs adopt parks, roads and garbage points.', cost: { rp: 130, budget: 3000 }, requires: ['b_app', 'b_carpool'], modifier: { control: { waste: 0.05, dust: 0.05, other: 0.04 }, participationPerWeek: 0.8 }, effectText: 'Waste/Dust -5% · Other -4%' },
  { id: 'b_network', branch: 'B', name: 'Citizen Participation Network', icon: '🌐', description: 'A million eyes, all of them watering.', cost: { rp: 200, cac: 15 }, requires: ['b_community', 'b_health'], modifier: { participationPerWeek: 1.2, trustPerWeek: 0.6, control: { transport: 0.04, waste: 0.04 } }, effectText: 'Big participation & trust boost' },
  // Branch C — administrative & political survival
  { id: 'c_committee', branch: 'C', name: 'High-Level Committees', icon: '🧑‍💼', description: 'The ancient art of forming a group to discuss forming a group.', cost: { rp: 20 }, requires: [], modifier: { pressurePerWeek: -0.3 }, effectText: 'Committees cheaper & -pressure' },
  { id: 'c_press', branch: 'C', name: 'Government Press Conferences', icon: '🎤', description: 'Podium, flags, zero questions.', cost: { rp: 40 }, requires: ['c_committee'], modifier: {}, effectText: 'Unlocks: Press Conference' },
  { id: 'c_pr', branch: 'C', name: 'Strategic PR Campaigns', icon: '📺', description: 'Hire the agency that made a cement ad go viral.', cost: { rp: 60, budget: 2000 }, requires: ['c_press'], modifier: {}, effectText: 'Unlocks: National Awareness Campaign' },
  { id: 'c_negotiate', branch: 'C', name: 'Interdepartmental Negotiations', icon: '🤜', description: 'Learn which file to put on top of which other file.', cost: { rp: 70, capital: 5 }, requires: ['c_press'], modifier: { capitalPerWeek: 1.5 }, effectText: '+1.5 capital/wk' },
  { id: 'c_media', branch: 'C', name: 'Media Management', icon: '📰', description: 'Prime-time slots, strategically filled with cricket.', cost: { rp: 90, capital: 5 }, requires: ['c_pr'], modifier: {}, effectText: 'Unlocks: Divert Public Attention' },
  { id: 'c_reports', branch: 'C', name: 'Official Report Management', icon: '📚', description: 'If it is long enough, nobody can prove it says nothing.', cost: { rp: 90 }, requires: ['c_negotiate'], modifier: {}, effectText: 'Unlocks: 200-Page Action Plan' },
  { id: 'c_emergency', branch: 'C', name: 'Emergency Publicity Operations', icon: '🚨', description: 'For when the smog is visible from space.', cost: { rp: 150, capital: 10 }, requires: ['c_media', 'c_reports'], modifier: {}, effectText: 'Unlocks: Declare Victory' },
];
export const RESEARCH_MAP = Object.fromEntries(RESEARCH.map((r) => [r.id, r])) as Record<string, ResearchDef>;

export const BRANCHES: Record<Branch, { name: string; color: string; blurb: string }> = {
  A: { name: 'Actual Pollution Control', color: '#22c55e', blurb: 'Expensive. Slow. Works.' },
  B: { name: 'Public Awareness', color: '#0ea5e9', blurb: 'Clean air is a team sport.' },
  C: { name: 'Administrative Survival', color: '#a855f7', blurb: 'Survive the next press cycle.' },
};

export interface OpticsDef {
  id: string;
  name: string;
  icon: string;
  flavour: string;
  cost: Cost;
  cooldownWeeks: number;
  unlock: { pr?: number; research?: string; building?: BuildingId };
  unlockText: string;
  deltas: {
    trust?: number;
    pressure?: number;
    credibility?: number;
    capital?: number;
    participation?: number;
    exposureRisk?: number;
  };
  temp?: { days: number; modifier: Modifier; label: string };
  effectText: string;
}

export const OPTICS: OpticsDef[] = [
  { id: 'water', name: 'Water the AQI Monitor', icon: '🚿', flavour: 'A sprinkler truck parks next to the monitoring station. Purely coincidental.', cost: { budget: 500 }, cooldownWeeks: 1, unlock: { pr: 1, building: 'monitor' }, unlockText: 'PR Office + Monitoring Centre', deltas: { credibility: -8, pressure: -5, exposureRisk: 0.15 }, temp: { days: 2, modifier: { perceptionBias: 0.25 }, label: 'Monitor is suspiciously damp' }, effectText: 'Official AQI -25% for 2 days. Actual air: unchanged.' },
  { id: 'rename', name: 'Rename the AQI', icon: '🏷️', flavour: '"Air Quality Index" is now "Aspirational Quality Indicator". Higher is more aspirational.', cost: { budget: 1000 }, cooldownWeeks: 4, unlock: { pr: 1 }, unlockText: 'PR Office', deltas: { credibility: -5, trust: -2, pressure: -4, exposureRisk: 0.05 }, temp: { days: 4, modifier: { perceptionBias: 0.1 }, label: 'AQI rebranded' }, effectText: 'Perception +10% for 4 days. Twitter is merciless.' },
  { id: 'committee', name: 'Form a High-Level Committee', icon: '🧑‍⚖️', flavour: 'Nine members. Seven sub-committees. One samosa budget.', cost: { budget: 1500, capital: 4 }, cooldownWeeks: 1, unlock: { pr: 1 }, unlockText: 'PR Office', deltas: { pressure: -12, credibility: -1 }, effectText: 'Pressure -12. Report due in 3 days. Air: still air.' },
  { id: 'selfie', name: 'Green Selfie Challenge', icon: '🤳', flavour: '#BreatheWithMe — post a selfie with a potted plant, win a mask.', cost: { budget: 800 }, cooldownWeeks: 2, unlock: { pr: 2 }, unlockText: 'PR Office Level 2', deltas: { trust: 4, participation: 3, credibility: -2, pressure: -3 }, effectText: 'Trust +4, participation +3. 40 lakh selfies, 0 trees.' },
  { id: 'press', name: 'Organise a Press Conference', icon: '🎙️', flavour: 'Questions will be taken from journalists who have pre-submitted the answers.', cost: { budget: 600, capital: 3 }, cooldownWeeks: 1, unlock: { research: 'c_press' }, unlockText: 'Research: Government Press Conferences', deltas: { pressure: -8, credibility: -3 }, effectText: 'Pressure -8. Trust ± depending on credibility.' },
  { id: 'purifier', name: 'Install One Giant Air Purifier', icon: '🗼', flavour: 'Twenty metres tall. Cleans the air of nearly an entire roundabout.', cost: { budget: 8000 }, cooldownWeeks: 3, unlock: { pr: 2 }, unlockText: 'PR Office Level 2', deltas: { trust: 3, pressure: -6, credibility: -2 }, effectText: 'Pressure -6, trust +3. Pollution -0.5% (forever!).' },
  { id: 'awareness', name: 'National Awareness Campaign', icon: '📺', flavour: 'Jingles, hoardings, and a celebrity coughing tastefully.', cost: { budget: 3000 }, cooldownWeeks: 3, unlock: { research: 'c_pr' }, unlockText: 'Research: Strategic PR Campaigns', deltas: { trust: 5, participation: 5, pressure: -4 }, temp: { days: 5, modifier: { control: { transport: 0.03, waste: 0.03 } }, label: 'Awareness jingle stuck in heads' }, effectText: 'Trust +5, participation +5, small real effect for 5 days.' },
  { id: 'divert', name: 'Divert Public Attention', icon: '🏏', flavour: 'Release a statement about a cricketer\'s haircut. Prime time is saved.', cost: { budget: 2000, capital: 5 }, cooldownWeeks: 2, unlock: { research: 'c_media' }, unlockText: 'Research: Media Management', deltas: { pressure: -15, credibility: -6, exposureRisk: 0.1 }, effectText: 'Pressure -15. Air quality: not diverted.' },
  { id: 'plan', name: 'Publish a 200-Page Action Plan', icon: '📘', flavour: 'Font size 16. Margins generous. Annexures: 140 pages.', cost: { budget: 2500 }, cooldownWeeks: 3, unlock: { research: 'c_reports' }, unlockText: 'Research: Official Report Management', deltas: { pressure: -10, capital: 2, credibility: -2 }, effectText: 'Pressure -10, capital +2. Air remains unconvinced.' },
  { id: 'victory', name: 'Declare Victory', icon: '🏆', flavour: 'Fireworks-free celebration of a historic, unprecedented, mostly theoretical success.', cost: { budget: 1000, capital: 10 }, cooldownWeeks: 6, unlock: { research: 'c_emergency' }, unlockText: 'Research: Emergency Publicity Operations', deltas: { trust: 10, pressure: -20 }, temp: { days: 3, modifier: { perceptionBias: 0.3 }, label: 'Victory has been declared' }, effectText: 'Huge short-term boost. If actual AQI > 200 in 2 days: disaster.' },
];
export const OPTICS_MAP = Object.fromEntries(OPTICS.map((o) => [o.id, o])) as Record<string, OpticsDef>;

export const CREDIBILITY = {
  investigateBelow: 40,
  challengedBelow: 25,
  challengedTrustPerWeek: -0.8,
  challengedPressurePerWeek: 1,
  /** fraction of exposureRisk that decays per day */
  exposureDecay: 0.15,
  /** daily recovery when no optics were used */
  recoveryPerWeek: 0.6,
};

export const COMMITTEE = { reportWeeks: 3, reportCapital: 3, cheaperWithResearch: 0.6 };
export const VICTORY = { checkWeeks: 2, threshold: 200, trust: -25, credibility: -30, pressure: 35 };

export const PRESSURE = {
  /** pressure/wk = (perceivedAqi - neutral)/scale */
  neutralAqi: 170,
  scale: 60,
  /** perceived AQI = official*w + actual*(1-w) */
  officialWeight: 0.6,
  maxedDaysForNotice: 2,
};

export const TRUST = { neutralAqi: 220, scale: 120 };

export const EVENTS_CFG = {
  dailyChance: 0.55,
  maxActive: 3,
  expireWeeks: 1.5,
};

export const STAGES = [
  { id: 1, name: 'Welcome to Delhi', blurb: 'Set up a department from scratch.', locked: false },
  { id: 2, name: 'Operation Clean Air', blurb: 'Take on the parali season and winter smog.', locked: false },
  { id: 3, name: 'Development vs Pollution', blurb: 'Metro expansions, mega-projects and the construction lobby.', locked: true },
  { id: 4, name: 'The NCR Problem', blurb: 'Air does not respect state borders.', locked: true },
  { id: 5, name: 'Mission India', blurb: 'One nation. One very large AQI.', locked: true },
];

export const STAGE2_AUTO_WEEK = 14;
export const STAGE2_GRANT = 8000;
