export type Source = 'transport' | 'dust' | 'industry' | 'agriculture' | 'waste' | 'other';
export const SOURCES: Source[] = ['transport', 'dust', 'industry', 'agriculture', 'waste', 'other'];

export type SeasonId = 'monsoon' | 'postmonsoon' | 'winter' | 'spring';

export type BuildingId =
  | 'monitor'
  | 'dust'
  | 'bus'
  | 'greenery'
  | 'industrial'
  | 'waste'
  | 'parali'
  | 'pr';

/** A bundle of effects. Everything that changes the simulation is expressed as a Modifier. */
export interface Modifier {
  /** Fractional control efficiency per source (combined multiplicatively). */
  control?: Partial<Record<Source, number>>;
  /** Multiplier on emissions per source (temporary spikes / dips). */
  emissionMult?: Partial<Record<Source, number>>;
  /** Multiplier on atmospheric dispersion (rain > 1, inversion < 1). */
  dispersionMult?: number;
  incomePerWeek?: number;
  incomeMult?: number;
  maintenanceMult?: number;
  researchPerWeek?: number;
  researchMult?: number;
  trustPerWeek?: number;
  pressurePerWeek?: number;
  capitalPerWeek?: number;
  participationPerWeek?: number;
  /** Fraction by which the OFFICIAL AQI under-reports the actual AQI. */
  perceptionBias?: number;
  /** Multiplier on negative event severity. */
  eventSeverityMult?: number;
  /** Monitoring coverage % contribution. */
  coverage?: number;
  /** Flat upkeep added to weekly maintenance (₹). */
  upkeepPerWeek?: number;
}

export interface Cost {
  budget?: number;
  rp?: number;
  capital?: number;
  cac?: number;
}

export interface Deltas {
  budget?: number;
  rp?: number;
  trust?: number;
  pressure?: number;
  credibility?: number;
  capital?: number;
  cac?: number;
  participation?: number;
  exposureRisk?: number;
}

export interface TempEffect {
  id: string;
  label: string;
  /** Absolute tick at which the effect ends. */
  until: number;
  modifier: Modifier;
  kind: 'good' | 'bad' | 'optics';
}

export interface Resources {
  budget: number;
  rp: number;
  trust: number;
  pressure: number;
  credibility: number;
  capital: number;
  cac: number;
}

export interface ActiveEvent {
  uid: string;
  defId: string;
  /** Tick it appeared. */
  at: number;
  /** Tick it auto-resolves with the last choice. */
  expires: number;
}

export type NewsKind = 'breaking' | 'alert' | 'gov' | 'citizen' | 'viral' | 'satire' | 'investigation' | 'achievement';

export interface NewsItem {
  id: number;
  tick: number;
  week: number;
  kind: NewsKind;
  headline: string;
  body?: string;
}

export interface Sample {
  tick: number;
  week: number;
  aqi: number;
  official: number;
  baseline: number;
  emissions: number;
  trust: number;
  credibility: number;
  pressure: number;
  budget: number;
}

export interface DailyObjective {
  id: string;
  templateId: string;
  label: string;
  target: number;
  /** value snapshot at start of the day for counter objectives */
  start: number;
  reward: Deltas;
  done: boolean;
}

export interface PendingCommittee {
  until: number;
  name: string;
}

export type EndingId = 'hero' | 'pr' | 'committee' | 'people';

export interface GameStats {
  highestAqi: number;
  lowestAqi: number;
  totalSpent: number;
  eventsHandled: number;
  opticsUsed: number;
  committees: number;
  reports: number;
  purifiers: number;
  toughDecisions: number;
  exposures: number;
  buildingsBought: number;
  upgradesBought: number;
  cacEarned: number;
  /** sum of (baseline - actual) AQI integrated per day */
  aqiReductionWeeks: number;
  objectivesDone: number;
  projectsCompleted: number;
  demolitions: number;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  musicVolume: number;
  sfxVolume: number;
  animations: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  tick: number;
  speed: 0 | 1 | 2 | 3;
  res: Resources;
  participation: number;
  exposureRisk: number;
  buildings: Record<BuildingId, number>;
  /** tick each building was first bought (for maturity effects) */
  builtAt: Partial<Record<BuildingId, number>>;
  research: string[];
  /** concentration (µg/m³-like) actual and the no-intervention baseline */
  conc: number;
  baselineConc: number;
  windFactor: number;
  effects: TempEffect[];
  events: ActiveEvent[];
  eventHistory: { defId: string; choice: number; week: number }[];
  eventCooldown: Record<string, number>;
  opticsCooldown: Record<string, number>;
  committeesPending: PendingCommittee[];
  victoryCheckAt: number | null;
  news: NewsItem[];
  newsSeq: number;
  history: Sample[];
  weekly: { week: number; aqi: number; official: number; baseline: number; trust: number; credibility: number }[];
  objectives: DailyObjective[];
  stage: number;
  stageObjectivesDone: string[];
  achievements: string[];
  stats: GameStats;
  ended: EndingId | null;
  sandbox: boolean;
  tutorialDone: boolean;
  introDone: boolean;
  tutorialStep: number;
  lastActive: number;
  aqiRenamed: boolean;
  pressureMaxedWeeks: number;
  lastOpticsWeek: number;
  phaseStart: PhaseSnap;
  /** Department facilities under construction or upgrade. */
  upgrading: Partial<Record<BuildingId, { to: number; started: number; done: number }>>;
  /** Everything the player changed on the map since week 1. */
  cityEdits: CityEdits;
  /** Bumped whenever the map changes (renderer cache key). */
  mapVersion: number;
  /** Derived from the map whenever it changes; feeds the simulation. */
  mapStats: MapStats;
  phaseReports: PhaseReport[];
  reportPending: boolean;
  briefingSeen: number;
}

export type Zone = 'res' | 'com' | 'ind' | 'green';
export type Placeable =
  | 'house' | 'apartment' | 'shop' | 'market' | 'office' | 'factory' | 'bigfactory' | 'warehouse'
  | 'busstop' | 'parking' | 'park' | 'forest' | 'school' | 'hospital';

export interface Placed {
  uid: number;
  kind: Placeable;
  x: number; y: number; w: number; h: number;
  cost: number;
  started: number;
  done: number;
  built: boolean;
  /** relocated (modernised) factories emit less */
  modern?: boolean;
}

export interface CityEdits {
  placed: Placed[];
  /** ids of base-city buildings that were demolished or relocated */
  demolished: number[];
  roads: { i: number; done: number; built: boolean }[];
  /** zoning designations keyed by tile index */
  zones: Record<string, Zone>;
  nextUid: number;
}

export interface MapStats {
  population: number;
  jobs: number;
  industryLoad: number;
  commercialTiles: number;
  constructionSites: number;
  parkTiles: number;
  hospitals: number;
  schools: number;
  parkingTiles: number;
  busStops: number;
  upkeep: number;
}

export interface PhaseSnap {
  phase: number;
  week: number;
  budget: number;
  aqi: number;
  baseline: number;
  trust: number;
  emissions: Record<Source, number>;
  eventsHandled: number;
  objectivesDone: number;
  newsSeq: number;
}

export interface PhaseReport {
  phase: number;
  start: PhaseSnap;
  end: PhaseSnap;
  headlines: string[];
  consequences: string[];
}

export interface OfflineSummary {
  seconds: number;
  budget: number;
  rp: number;
  capital: number;
  trust: number;
  notes: string[];
}
