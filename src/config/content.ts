import type { Deltas, EndingId, GameState } from '../engine/types';

export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  reward: Deltas;
  rewardText: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_building', name: 'First Building', icon: '🏢', description: 'Construct your first facility.', reward: { budget: 1000 }, rewardText: '+₹1,000' },
  { id: 'first_reduction', name: 'First Pollution Reduction', icon: '📉', description: 'Push actual AQI 5% below the no-action baseline.', reward: { rp: 30 }, rewardText: '+30 RP' },
  { id: 'bureaucrat', name: 'The Bureaucrat', icon: '🗂️', description: 'Form 3 committees.', reward: { capital: 5 }, rewardText: '+5 capital' },
  { id: 'committee_factory', name: 'Committee Factory', icon: '🏭', description: 'Form 6 committees. The committees have formed a union.', reward: { capital: 10 }, rewardText: '+10 capital' },
  { id: 'green_delhi', name: 'Green Delhi', icon: '🌳', description: 'Upgrade Urban Greenery to level 3.', reward: { trust: 5 }, rewardText: '+5 trust' },
  { id: 'media_master', name: 'Media Master', icon: '📺', description: 'Use 8 optics schemes.', reward: { capital: 8 }, rewardText: '+8 capital' },
  { id: 'public_favourite', name: 'Public Favourite', icon: '❤️', description: 'Reach 85% public trust.', reward: { budget: 4000 }, rewardText: '+₹4,000' },
  { id: 'aqi_warrior', name: 'AQI Warrior', icon: '⚔️', description: 'Keep actual AQI below 200 after Day 15.', reward: { rp: 80, budget: 3000 }, rewardText: '+80 RP, +₹3,000' },
  { id: 'peoples_officer', name: "The People's Officer", icon: '🤲', description: 'Reach 60% citizen participation.', reward: { trust: 5, capital: 5 }, rewardText: '+5 trust, +5 capital' },
  { id: 'clean_air', name: 'Clean Air Champion', icon: '🏅', description: 'Bring actual AQI below 100.', reward: { budget: 10000 }, rewardText: '+₹10,000' },
];

export interface ObjectiveTemplate {
  id: string;
  label: (t: number) => string;
  /** counter value read from state; objective is done when value - start >= target */
  metric: (s: GameState) => number;
  target: (day: number) => number;
  reward: (day: number) => Deltas;
  /** if true, evaluate as absolute threshold (value <= target), only at end of day */
  belowAtWeekEnd?: boolean;
}

export const OBJECTIVE_TEMPLATES: ObjectiveTemplate[] = [
  { id: 'build', label: (t) => `Complete ${t} construction project${t > 1 ? 's' : ''}`, metric: (s) => s.stats.buildingsBought + s.stats.upgradesBought + s.stats.projectsCompleted, target: (d) => (d < 14 ? 1 : 2), reward: (d) => ({ budget: 800 + d * 40 }) },
  { id: 'research', label: () => 'Complete a research project', metric: (s) => s.research.length, target: () => 1, reward: () => ({ rp: 20 }) },
  { id: 'events', label: (t) => `Handle ${t} event${t > 1 ? 's' : ''}`, metric: (s) => s.stats.eventsHandled, target: (d) => (d < 20 ? 1 : 2), reward: (d) => ({ capital: 2 + Math.floor(d / 15) }) },
  { id: 'cac', label: (t) => `Earn ${t} Clean Air Credits`, metric: (s) => s.stats.cacEarned, target: (d) => Math.max(2, Math.round(d / 5)), reward: () => ({ trust: 2, budget: 600 }) },
  { id: 'aqi', label: (t) => `End the week with actual AQI ≤ ${t}`, metric: () => 0, target: (d) => (d < 14 ? 240 : d < 27 ? 330 : d < 40 ? 380 : 260), reward: () => ({ budget: 1500, trust: 2 }), belowAtWeekEnd: true },
];

export interface StageObjective {
  id: string;
  stage: number;
  label: string;
  check: (s: GameState, aqiReductionPct: number) => boolean;
}

export const STAGE_OBJECTIVES: StageObjective[] = [
  { id: 's1_build3', stage: 1, label: 'Own 3 different facilities', check: (s) => Object.values(s.buildings).filter((l) => l > 0).length >= 3 },
  { id: 's1_research2', stage: 1, label: 'Complete 2 research projects', check: (s) => s.research.length >= 2 },
  { id: 's1_events3', stage: 1, label: 'Handle 3 events', check: (s) => s.stats.eventsHandled >= 3 },
  { id: 's1_week5', stage: 1, label: 'Survive until week 5', check: (s) => Math.floor(s.tick / 60) + 1 >= 5 },
  { id: 's2_reduce', stage: 2, label: 'Cut actual AQI 20% below baseline', check: (_s, r) => r >= 20 },
  { id: 's2_build6', stage: 2, label: 'Own 6 different facilities', check: (s) => Object.values(s.buildings).filter((l) => l > 0).length >= 6 },
  { id: 's2_parali', stage: 2, label: 'Build the Parali Management Cell', check: (s) => s.buildings.parali > 0 },
  { id: 's2_trust', stage: 2, label: 'Keep public trust ≥ 60%', check: (s) => s.res.trust >= 60 },
];

export interface EndingDef {
  id: EndingId;
  title: string;
  subtitle: string;
  art: string;
  color: string;
  award: string;
  text: string;
}

export const ENDINGS: Record<EndingId, EndingDef> = {
  hero: {
    id: 'hero',
    title: 'The Actual Hero',
    subtitle: 'You cleaned the air. Nobody threw a party, because they were busy breathing.',
    art: '🦸‍♀️🌤️',
    color: '#22c55e',
    award: 'Commendation for Genuine Public Service (it exists, apparently)',
    text: 'Buses run, sweepers sweep, inspectors inspect and the sky is a colour children recognise. You did it the boring way: infrastructure, data and maintenance budgets. The newspapers call it “an unexpectedly competent term”.',
  },
  pr: {
    id: 'pr',
    title: 'The PR Champion',
    subtitle: 'Official AQI: excellent. Actual AQI: please don’t ask.',
    art: '🏆📸',
    color: '#ec4899',
    award: 'Golden Inhaler for Excellence in Perception Management',
    text: 'Your press releases breathed easier than anyone in the city. The monitoring stations were the cleanest, wettest and most rebranded in the country. You are being promoted to a bigger city with a bigger problem.',
  },
  committee: {
    id: 'committee',
    title: 'The Committee Specialist',
    subtitle: 'Your committees have formed sub-committees to evaluate their committees.',
    art: '🧑‍💼📚',
    color: '#a855f7',
    award: 'Lifetime Achievement in Constituting Bodies',
    text: 'You leave behind a magnificent legacy of reports — stacked, they would reach the smog layer. The air, meanwhile, remains under consideration. A committee has been formed to decide your farewell gift.',
  },
  people: {
    id: 'people',
    title: "The People's Officer",
    subtitle: 'You made hard calls, the citizens joined in — and powerful people noticed.',
    art: '🤝🌱',
    color: '#0ea5e9',
    award: 'Honorary Membership of Every RWA WhatsApp Group',
    text: 'You sealed polluting units, paid farmers instead of blaming them and told the truth during the smog. A few lobbies want you transferred to the Department of Lighthouse Maintenance, but a million citizens now report garbage fires on your app. The movement outlives your term.',
  },
};

export const NEWS_TEMPLATES = {
  buy: [
    'Department Inaugurates {name}; Ribbon Cut With Locally Sourced Scissors',
    '{name} Opens to Public. Public Asks If It Will Also Open Windows',
    'New {name} Operational, Officials Confirm After Checking Twice',
  ],
  upgrade: ['{name} Upgraded to Level {lvl}. Air Notices, Slightly', '{name} Gets Level {lvl} Upgrade; Staff Get One Extra Chair'],
  research: ['Breakthrough: Department Completes “{name}”, Promises to Read the Report', 'Scientists Finish {name}; Celebrate With Masked Selfie'],
  committee: [
    'BREAKING: Government Forms Committee to Investigate Why Previous Committee Failed',
    'High-Level Committee #{n} Constituted; First Meeting to Decide Meeting Schedule',
    'Committee #{n} Formed. Tea and Biscuit Budget Approved Unanimously',
  ],
  report: ['Committee Submits Report Recommending a Further Committee', 'Department Releases Committee Report. Air Quality Remains Unconvinced'],
  water: ['AQI Monitor Records Historic Improvement; Sprinkler Truck Spotted Nearby', 'Monitoring Station Reports Clean Air, Also Reports Being Very Wet'],
  rename: ['AQI Renamed “Aspirational Quality Indicator”; Citizens Aspire to Breathe', 'Air Quality Index Rebranded. Air Unaware of New Branding'],
  selfie: ['#GreenSelfieChallenge Trends; 40 Lakh Selfies, Zero New Trees', 'Citizens Post Selfies With Potted Plants. Plants Request Masks'],
  press: ['Press Conference Ends Before Questions; Officials Cite Visibility Issues', 'Minister Announces Historic Reduction in Pollution. Independent Monitor Disagrees'],
  purifier: ['City Gets One More Giant Air Purifier. Residents Ask About the Other 1.5 Crore People', 'Giant Purifier Cleans Air for Entire Roundabout; Roundabout Thrilled'],
  awareness: ['Awareness Campaign Reaches Crores; Jingle Now Stuck in Everyone’s Lungs', 'Nationwide Campaign Urges Citizens to “Breathe Responsibly”'],
  divert: ['Prime Time Debates Cricketer’s Haircut for Six Hours; Smog Waits Patiently', 'Breaking: Celebrity Breakfast Menu Leaked; Pollution Coverage Postponed'],
  plan: ['Department Releases 200-Page Report. Air Quality Remains Unconvinced', '200-Page Action Plan Released; 140 Pages Are Annexures of Annexures'],
  victory: ['Government Declares Victory Over Pollution; Pollution Not Informed', 'Mission Accomplished Banner Visible Through Smog, Barely'],
  victoryBackfire: ['Victory Declared Two Days Ago, AQI Crosses 400 Today; Banner Quietly Removed', 'Satellite Images Contradict Victory Speech; Speechwriter on Leave'],
  exposure: ['EXPOSED: Monitoring Station Was Watered Daily, RTI Reveals', 'Investigation: Official AQI and Actual AQI Met Once, Didn’t Get Along'],
  daily_bad: [
    'Citizens Demand Clean Air. Government Requests Citizens to Remain Patient',
    'Doctors Advise Delhiites to Avoid Breathing Between 6am and Midnight',
    'Morning Walkers Switch to Morning Sitting',
    'Air Purifier Sales Overtake Pressure Cooker Sales for First Time',
  ],
  daily_mid: ['AQI Improves From “Severe” to “Merely Very Poor”; Residents Cautiously Optimistic', 'Some Stars Visible Over Delhi; Astronomers Mistake It for Satellite Glitch'],
  daily_good: ['Delhi Child Sees Blue Sky, Asks Parents If It Is a Filter', 'Joggers Return to Lodhi Garden; Air Purifier Shares Fall', 'Residents Report Seeing Across the Road. Road Also Surprised'],
  citizen: [
    '“My mask has a mask now,” says resident of Lajpat Nagar',
    'RWA WhatsApp group posts 400 forwards about pollution, 1 suggestion',
    '“Breathing is my cardio,” says Dwarka resident',
    'Auto driver claims he can identify AQI by taste',
  ],
};

export const LOADING_LINES = [
  'Forming a committee to load the game…',
  'Watering the monitoring stations…',
  'Printing 200 pages of loading text…',
  'Waiting for the wind to change…',
  'Negotiating with neighbouring states…',
];


export const PHASE_BRIEFS = [
  {
    title: 'Establishing Credibility',
    weeks: 'Weeks 1–13',
    challenge: 'Learn the city, build basic infrastructure and find out where the smoke actually comes from.',
    text: 'Congratulations, Commissioner! Delhi has a small problem. Actually, quite a large one. The air is not particularly breathable, your office has one chair, and the Ministry would like results by Tuesday.',
  },
  {
    title: 'Rapid Development',
    weeks: 'Weeks 14–26',
    challenge: 'The city is growing and so are the proposals. Stubble smoke and Diwali arrive this quarter.',
    text: 'Builders want permits, industrialists want waivers, and farmers upwind have two weeks to clear their fields. Every file on your desk is marked URGENT. Some of them even are.',
  },
  {
    title: 'The Great Delhi Smog',
    weeks: 'Weeks 27–39',
    challenge: 'Winter inversion traps everything near the ground. Real infrastructure matters now.',
    text: 'Cold, still air has put a lid on the city. Flights are diverted, schools are asking questions, and a minister has discovered the word “unprecedented”.',
  },
  {
    title: 'Election Countdown',
    weeks: 'Weeks 40–52',
    challenge: 'Voters are watching. What will they remember — the air, the economy, or the press releases?',
    text: 'The smog lifts with the spring, and so does media attention. Every decision you made this year is about to be discussed loudly on television.',
  },
];

export const SECRETARY = { name: 'Pinky Sharma', role: 'Your Secretary' };

export type TutorialGate = 'next' | 'pan' | 'zoom' | 'inspect' | 'build-monitor';
export interface TutorialStep { id: string; text: string; target: string | null; gate: TutorialGate; focus?: 'monitor' }

/** Guided first steps. `target` is a CSS selector to spotlight; gates advance on real player actions. */
export const TUTORIAL: TutorialStep[] = [
  { id: 'hello', target: null, gate: 'next', text: 'Namaste, Commissioner! I’m Pinky, your Secretary. I keep the files, the tea and — occasionally — the Commissioner out of trouble. Let me show you around.' },
  { id: 'pan', target: null, gate: 'pan', text: 'This is our Delhi — twelve neighbourhoods, half a million problems. Drag the map to look around.' },
  { id: 'zoom', target: '.zoom-ctrl', gate: 'zoom', text: 'Scroll your mouse wheel, pinch, or use these buttons to zoom in and out.' },
  { id: 'inspect', target: null, gate: 'inspect', text: 'Tap any building, road or open patch of land to inspect it. Every neighbourhood has its own people, jobs and problems.' },
  { id: 'build', target: null, gate: 'build-monitor', focus: 'monitor', text: 'See the dashed plot in Connaught Place? That’s ours. Tap it and build an AQI Monitoring Centre — we can’t fix what we can’t measure. Construction takes about a week.' },
  { id: 'money', target: '.stat-money', gate: 'next', text: 'This is the treasury. Money comes in every week from taxes and the Centre; every facility costs upkeep. Watch the weekly figure.' },
  { id: 'aqi', target: '.stat-aqi', gate: 'next', text: 'And this is the city’s ACTUAL air quality — from independent sensors, not our press office. Lower is better.' },
  { id: 'objectives', target: '.objectives-widget', gate: 'next', text: 'Each week brings objectives. Think of them as suggestions from people who outrank you.' },
  { id: 'time', target: '.hud-time', gate: 'next', text: 'The clock is ticking — 52 weeks to the election. Pause whenever you need to think, speed up when you’re confident. Chalo, let’s begin!' },
];

export const ROAD_NAMES: { h: Record<number, string>; v: Record<number, string> } = {
  h: { 9: 'Outer Ring Road', 20: 'Ring Road', 31: 'Mathura Road' },
  v: { 12: 'Pusa Road', 28: 'Janpath', 44: 'Vikas Marg' },
};
