export type Source = 'transport' | 'dust' | 'industry' | 'agriculture' | 'waste' | 'other';
export const SOURCES: Source[] = ['transport', 'dust', 'industry', 'agriculture', 'waste', 'other'];

export type SeasonId = 'monsoon' | 'postmonsoon' | 'winter';

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
  incomePerDay?: number;
  incomeMult?: number;
  maintenanceMult?: number;
  researchPerDay?: number;
  researchMult?: number;
  trustPerDay?: number;
  pressurePerDay?: number;
  capitalPerDay?: number;
  participationPerDay?: number;
  /** Fraction by which the OFFICIAL AQI under-reports the actual AQI. */
  perceptionBias?: number;
  /** Multiplier on negative event severity. */
  eventSeverityMult?: number;
  /** Monitoring coverage % contribution. */
  coverage?: number;
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
  day: number;
  kind: NewsKind;
  headline: string;
  body?: string;
}

export interface Sample {
  tick: number;
  day: number;
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
  aqiReductionDays: number;
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
  speed: 0 | 1 | 2 | 4;
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
  eventHistory: { defId: string; choice: number; day: number }[];
  eventCooldown: Record<string, number>;
  opticsCooldown: Record<string, number>;
  committeesPending: PendingCommittee[];
  victoryCheckAt: number | null;
  news: NewsItem[];
  newsSeq: number;
  history: Sample[];
  daily: { day: number; aqi: number; official: number; baseline: number; trust: number; credibility: number }[];
  objectives: DailyObjective[];
  stage: number;
  stageObjectivesDone: string[];
  achievements: string[];
  stats: GameStats;
  ended: EndingId | null;
  sandbox: boolean;
  tutorialDone: boolean;
  lastActive: number;
  aqiRenamed: boolean;
  pressureMaxedDays: number;
  lastOpticsDay: number;
}

export interface OfflineSummary {
  seconds: number;
  budget: number;
  rp: number;
  capital: number;
  trust: number;
  notes: string[];
}
