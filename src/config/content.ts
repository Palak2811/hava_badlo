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
  belowAtDayEnd?: boolean;
}

export const OBJECTIVE_TEMPLATES: ObjectiveTemplate[] = [
  { id: 'build', label: (t) => `Buy or upgrade ${t} building${t > 1 ? 's' : ''}`, metric: (s) => s.stats.buildingsBought + s.stats.upgradesBought, target: (d) => (d < 6 ? 1 : 2), reward: (d) => ({ budget: 800 + d * 60 }) },
  { id: 'research', label: () => 'Complete a research project', metric: (s) => s.research.length, target: () => 1, reward: () => ({ rp: 20 }) },
  { id: 'events', label: (t) => `Handle ${t} event${t > 1 ? 's' : ''}`, metric: (s) => s.stats.eventsHandled, target: (d) => (d < 10 ? 1 : 2), reward: (d) => ({ capital: 2 + Math.floor(d / 10) }) },
  { id: 'cac', label: (t) => `Earn ${t} Clean Air Credits`, metric: (s) => s.stats.cacEarned, target: (d) => Math.max(2, Math.round(d / 3)), reward: () => ({ trust: 2, budget: 600 }) },
  { id: 'aqi', label: (t) => `End the day with actual AQI ≤ ${t}`, metric: () => 0, target: (d) => (d < 6 ? 240 : d < 15 ? 320 : 360), reward: () => ({ budget: 1500, trust: 2 }), belowAtDayEnd: true },
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
  { id: 's1_day5', stage: 1, label: 'Survive until Day 5', check: (s) => Math.floor(s.tick / 60) + 1 >= 5 },
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

export const TUTORIAL_STEPS = [
  { title: 'Welcome, Commissioner!', icon: '🎖️', text: 'You run the brand-new Department of Clean Air. Your mission: bring Delhi’s AQI below 100 in 4 weeks. Your resources: almost nothing. Good luck.' },
  { title: 'Reading the air', icon: '🌫️', text: 'The top bar shows the ACTUAL AQI measured by independent sensors — lower is better. Seasons matter: parali smoke drifts in during Week 1, the winter inversion arrives in Week 3.' },
  { title: 'Earning money', icon: '💰', text: 'The government pays you an allocation every day — more when public trust is high. Buildings cost maintenance, so watch your net income.' },
  { title: 'Building the city', icon: '🏗️', text: 'Tap any dashed plot on the map to build a facility. Tap a facility to inspect or upgrade it. Each one attacks a specific pollution source.' },
  { title: 'Research', icon: '🔬', text: 'The Monitoring Centre generates Research Points. Spend them in the tech tree: real pollution control, public awareness, or… political survival.' },
  { title: 'Events', icon: '📰', text: 'Things happen: Diwali, protests, ministers. Each event has choices with real trade-offs. Ignore them and the worst option is picked for you.' },
  { title: 'Actual vs Official', icon: '🎭', text: 'The Department of Optics can make the OFFICIAL AQI look great without changing the air. It works… until a journalist notices. Your ending depends on what you really did.' },
];

export const WEEK_BRIEFS = [
  {
    title: 'Welcome to Delhi',
    challenge: 'Set up your first facilities before the parali smoke arrives.',
    text: 'Congratulations, Commissioner! Delhi has a small problem. Actually, quite a large one. The air is not particularly breathable, your office has one chair, and the Ministry would like results by Tuesday.',
  },
  {
    title: 'The smoke season',
    challenge: 'Stubble burning upwind and Diwali in the city. Protect the air without losing the people.',
    text: 'Satellites show hundreds of farm fires to the north-west. Firecracker shops have opened. Every uncle has a “green cracker” that is suspiciously loud. Brace yourself.',
  },
  {
    title: 'Winter is coming (it’s here)',
    challenge: 'The inversion traps everything near the ground. Real infrastructure matters now.',
    text: 'Cold, still air has put a lid on the city. Flights are diverted, schools are asking questions, and a minister has discovered the word “unprecedented”.',
  },
  {
    title: 'The final stretch',
    challenge: 'Your term ends this week. What will the record say — the air, or the press releases?',
    text: 'The Ministry is drafting your evaluation. Journalists are drafting theirs. The air, as usual, is not drafting anything; it is simply sitting there.',
  },
];
