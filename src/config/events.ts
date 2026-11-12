import type { Cost, Deltas, GameState, Modifier, SeasonId, Source } from '../engine/types';

export interface EventCtx {
  s: GameState;
  day: number;
  season: SeasonId;
  aqi: number;
  official: number;
}

export interface ChoiceDef {
  label: string;
  desc: string;
  cost?: Cost;
  deltas?: Deltas;
  temp?: { days: number; modifier: Modifier; label: string; kind?: 'good' | 'bad' | 'optics' };
  tough?: boolean;
  /** Optional state-dependent extra outcome; returns deltas and a result line. */
  dynamic?: (ctx: EventCtx) => { deltas: Deltas; text: string };
  result: string;
  headline?: string;
}

export type EventCategory = 'Seasonal' | 'Transport' | 'Industry' | 'Waste' | 'Politics' | 'Media' | 'Weather' | 'Opportunity' | 'Regional' | 'Construction';

export interface EventDef {
  id: string;
  title: string;
  art: string;
  category: EventCategory;
  severity: 1 | 2 | 3;
  source: Source | 'none';
  description: string;
  /** If set, the event is forced on this day (once). */
  scriptedDay?: number;
  once?: boolean;
  cooldownDays: number;
  condition: (c: EventCtx) => boolean;
  weight: (c: EventCtx) => number;
  choices: ChoiceDef[];
}

const spike = (src: Source, mult: number, days: number, label: string) => ({
  days,
  modifier: { emissionMult: { [src]: mult } as Partial<Record<Source, number>> },
  label,
  kind: 'bad' as const,
});

export const EVENTS: EventDef[] = [
  {
    id: 'parali',
    title: 'Parali Burning Season',
    art: '🌾🔥',
    category: 'Seasonal',
    severity: 3,
    source: 'agriculture',
    description:
      'Harvest is done and farmers have barely two weeks to clear paddy stubble before sowing wheat. Machines are expensive, labour is scarce, and a matchstick costs one rupee. Satellite images show hundreds of fires upwind.',
    scriptedDay: 6,
    once: true,
    cooldownDays: 99,
    condition: (c) => c.season === 'postmonsoon',
    weight: () => 0,
    choices: [
      { label: 'Subsidise Happy Seeders & bio-decomposer', desc: 'Pay for machines and free decomposer spray.', cost: { budget: 6000, capital: 3 }, deltas: { trust: 4, participation: 4 }, temp: { days: 8, modifier: { emissionMult: { agriculture: 0.75 } }, label: 'Machinery subsidy reaching farms', kind: 'good' }, tough: true, result: 'Fewer fires are spotted. Farmers appreciate an option that is not a fine.', headline: 'Department Pays for Machines Instead of Press Releases; Farmers Surprised' },
      { label: 'Coordinate with neighbouring states', desc: 'Spend political capital on a joint action plan.', cost: { capital: 8 }, deltas: { pressure: -4 }, temp: { days: 6, modifier: { emissionMult: { agriculture: 0.88 } }, label: 'Inter-state task force', kind: 'good' }, result: 'A joint task force meets. Some districts actually act.' },
      { label: 'Blame the farmers on TV', desc: 'Free. Satisfying. Useless.', deltas: { pressure: -6, trust: -5, credibility: -4 }, temp: spike('agriculture', 1.25, 6, 'Fires continue unabated'), result: 'Ratings soar. So do the fires.', headline: 'Official Solves Pollution by Identifying Someone Else to Blame' },
      { label: 'Do nothing', desc: 'It is somebody else’s state.', temp: spike('agriculture', 1.35, 8, 'Unchecked stubble fires'), deltas: { trust: -3 }, result: 'The smoke arrives on schedule, as it does every year.' },
    ],
  },
  {
    id: 'diwali',
    title: 'Diwali Is Approaching',
    art: '🪔🎆',
    category: 'Seasonal',
    severity: 3,
    source: 'other',
    description:
      'The festival season is here. Firecracker sales are increasing, and pollution-control authorities are preparing for a difficult week. Every uncle has a "green cracker" that is suspiciously loud.',
    scriptedDay: 12,
    once: true,
    cooldownDays: 99,
    condition: () => true,
    weight: () => 0,
    choices: [
      { label: 'Promote greener celebrations', desc: 'Diya drives, community laser shows, sweets not smoke.', cost: { budget: 4000 }, deltas: { trust: 3, participation: 6 }, temp: { days: 2, modifier: { emissionMult: { other: 1.2 } }, label: 'Mostly green Diwali', kind: 'bad' }, result: 'Many colonies opt for diyas and light shows. A few rockets still go up.' },
      { label: 'Strengthen enforcement', desc: 'Raids on illegal cracker godowns.', cost: { budget: 3000, capital: 4 }, deltas: { trust: -4, pressure: 6 }, temp: { days: 2, modifier: { emissionMult: { other: 1.15 } }, label: 'Cracker enforcement drive', kind: 'bad' }, tough: true, result: 'Emissions stay lower. Talk shows call it an attack on festivals.' },
      { label: 'Launch a nationwide awareness campaign', desc: 'Celebrity video: “Iss Diwali, saans lo.”', cost: { budget: 2500 }, deltas: { trust: 5, credibility: -1 }, temp: { days: 2, modifier: { emissionMult: { other: 1.45 } }, label: 'Campaign-only Diwali', kind: 'bad' }, result: 'The video is lovely. The night sky is lovelier — and smokier.' },
      { label: 'Ignore it', desc: 'Festivals are not a pollution issue, officially.', temp: { days: 3, modifier: { emissionMult: { other: 1.8, waste: 1.2 } }, label: 'Unrestricted firecrackers', kind: 'bad' }, deltas: { trust: -2 }, result: 'The morning after, you can chew the air.', headline: 'City Wakes Up to AQI “Beyond Index”; Index Requests Leave' },
    ],
  },
  {
    id: 'smog',
    title: 'The Great Winter Smog',
    art: '🌫️❄️',
    category: 'Weather',
    severity: 3,
    source: 'other',
    description:
      'A temperature inversion has put a lid on the city. Wind speed: zero. Visibility: one cricket pitch. Flights are diverted and schools are asking whether to close.',
    scriptedDay: 17,
    once: true,
    cooldownDays: 99,
    condition: (c) => c.season === 'winter',
    weight: () => 0,
    choices: [
      { label: 'Activate Emergency Action Plan', desc: 'Stop construction, restrict trucks, odd-even, close schools.', cost: { budget: 5000, capital: 8 }, deltas: { trust: 3, pressure: 4 }, temp: { days: 4, modifier: { dispersionMult: 0.8, emissionMult: { transport: 0.7, dust: 0.6, industry: 0.85 } }, label: 'Emergency restrictions', kind: 'good' }, tough: true, result: 'Traders complain, parents relieved. The worst of the peak is blunted.' },
      { label: 'Issue honest health advisories', desc: 'Tell people the truth and hand out masks.', cost: { budget: 2000 }, deltas: { trust: 6, credibility: 4, participation: 3 }, temp: { days: 4, modifier: { dispersionMult: 0.75 }, label: 'Inversion layer', kind: 'bad' }, result: 'The air is awful, but people trust you for saying so.' },
      { label: 'Install anti-smog guns for TV cameras', desc: 'Spray water in the general direction of the problem.', cost: { budget: 3000 }, deltas: { pressure: -5, credibility: -4 }, temp: { days: 4, modifier: { dispersionMult: 0.73 }, label: 'Inversion layer (with mist)', kind: 'bad' }, result: 'Great visuals. Negligible effect.', headline: 'Anti-Smog Gun Successfully Wets Reporter' },
      { label: 'Wait for the wind', desc: 'Pray to Vayu Dev.', temp: { days: 5, modifier: { dispersionMult: 0.65 }, label: 'Severe inversion', kind: 'bad' }, deltas: { trust: -6, pressure: 8 }, result: 'Vayu Dev is on leave until further notice.' },
    ],
  },
  {
    id: 'construction',
    title: 'Construction Boom',
    art: '🏗️🚧',
    category: 'Construction',
    severity: 2,
    source: 'dust',
    description: 'Four flyovers, two malls and a “world-class” bus stand are being built simultaneously. Nobody has covered the sand.',
    cooldownDays: 6,
    condition: () => true,
    weight: (c) => (c.season === 'winter' ? 1.3 : 1),
    choices: [
      { label: 'Mandate dust nets & sprinkling', desc: 'Inspect sites and fine violators.', cost: { budget: 2500, capital: 3 }, deltas: { pressure: 3 }, temp: { days: 4, modifier: { emissionMult: { dust: 1.05 } }, label: 'Compliant construction', kind: 'bad' }, tough: true, result: 'Builders grumble; sites get covered.' },
      { label: 'Negotiate a voluntary code', desc: 'Builders promise to try their best.', cost: { capital: 2 }, temp: { days: 4, modifier: { emissionMult: { dust: 1.2 } }, label: 'Voluntary dust code', kind: 'bad' }, result: 'Their best turns out to be quite dusty.' },
      { label: 'Celebrate development', desc: 'Cut a ribbon. Breathe in.', deltas: { capital: 4, pressure: -2 }, temp: { days: 5, modifier: { emissionMult: { dust: 1.4 } }, label: 'Unchecked construction dust', kind: 'bad' }, result: 'Progress has a distinctive taste.' },
    ],
  },
  {
    id: 'traffic',
    title: 'Monday Morning Traffic',
    art: '🚗🚕🛺',
    category: 'Transport',
    severity: 1,
    source: 'transport',
    description: 'A broken signal at a major junction has created a 9 km jam. Engines idle. Horns compose a symphony.',
    cooldownDays: 3,
    condition: () => true,
    weight: () => 1.2,
    choices: [
      { label: 'Deploy traffic marshals', desc: 'Humans with whistles, the original smart traffic.', cost: { budget: 1200 }, deltas: { trust: 2 }, result: 'The jam clears by noon.' },
      { label: 'Push work-from-home advisory', desc: 'Ask offices to stagger hours.', cost: { capital: 3 }, temp: { days: 2, modifier: { emissionMult: { transport: 0.9 } }, label: 'Staggered office hours', kind: 'good' }, result: 'Roads breathe a little easier.' },
      { label: 'Tweet “drive responsibly”', desc: 'Costs nothing. Achieves the same.', temp: { days: 2, modifier: { emissionMult: { transport: 1.15 } }, label: 'Gridlock emissions', kind: 'bad' }, deltas: { trust: -2 }, result: 'The tweet gets 12 likes, mostly from your own department.' },
    ],
  },
  {
    id: 'factory',
    title: 'Factory Emission Violation',
    art: '🏭💨',
    category: 'Industry',
    severity: 2,
    source: 'industry',
    description: 'A large unit in the industrial area is caught burning banned pet-coke at night. The owner is a well-connected donor to everyone.',
    cooldownDays: 5,
    condition: (c) => c.day >= 3,
    weight: (c) => (c.s.buildings.industrial > 0 ? 1.4 : 1),
    choices: [
      { label: 'Seal the unit', desc: 'Close it until it complies.', cost: { capital: 6 }, deltas: { trust: 6, pressure: 6, credibility: 3 }, temp: { days: 5, modifier: { emissionMult: { industry: 0.9 } }, label: 'Violator sealed', kind: 'good' }, tough: true, result: 'Phones ring at midnight. You don’t pick up.' },
      { label: 'Impose a fine', desc: 'Pay up, carry on.', deltas: { budget: 2500, trust: 1 }, result: 'The fine is paid in cash. The chimney resumes.' },
      { label: 'Accept a “CSR donation”', desc: 'A tree-planting drive sponsored by the polluter.', deltas: { budget: 5000, credibility: -10, trust: -3, exposureRisk: 0.15 }, temp: spike('industry', 1.15, 5, 'Pet-coke continues'), result: 'Forty saplings are planted next to the chimney.', headline: 'Polluter Sponsors Clean Air Drive; Plants Trees in Own Smoke' },
    ],
  },
  {
    id: 'garbage',
    title: 'Garbage Burning',
    art: '🗑️🔥',
    category: 'Waste',
    severity: 2,
    source: 'waste',
    description: 'Night guards are burning garbage to keep warm and a landfill has caught “fire on its own”. Again.',
    cooldownDays: 4,
    condition: () => true,
    weight: (c) => (c.season === 'winter' ? 1.6 : 0.8),
    choices: [
      { label: 'Distribute heaters to guards & douse landfill', desc: 'Address the reason, not just the smoke.', cost: { budget: 2500 }, deltas: { trust: 3, participation: 2 }, temp: { days: 4, modifier: { emissionMult: { waste: 0.85 } }, label: 'Heaters distributed', kind: 'good' }, result: 'Fewer bonfires. Warmer guards.' },
      { label: 'Fine anyone burning waste', desc: 'Enforcement drive.', cost: { capital: 3 }, deltas: { trust: -2 }, temp: { days: 3, modifier: { emissionMult: { waste: 0.95 } }, label: 'Burning fines', kind: 'good' }, tough: true, result: 'Some fires stop. Some just move behind a wall.' },
      { label: 'Ignore it', desc: 'It’s only a little smoke.', temp: spike('waste', 1.4, 4, 'Landfill fire'), result: 'The landfill burns for four days.' },
    ],
  },
  {
    id: 'protest',
    title: 'Citizen Protest',
    art: '🪧✊',
    category: 'Politics',
    severity: 2,
    source: 'none',
    description: 'Parents, doctors and students are marching to your office with placards: “We want to breathe, not wait.”',
    cooldownDays: 4,
    condition: (c) => c.aqi > 250 || c.s.res.trust < 45,
    weight: (c) => 1 + Math.max(0, c.aqi - 250) / 80,
    choices: [
      { label: 'Meet them and share real data', desc: 'Open the dashboards, take questions.', cost: { capital: 2 }, dynamic: (c) => (c.s.res.credibility >= 60 ? { deltas: { trust: 8, pressure: -8, participation: 5 }, text: 'Your numbers hold up. Protesters leave as volunteers.' } : { deltas: { trust: -4, pressure: 6 }, text: 'Someone compares your numbers with an independent monitor. It gets ugly.' }), result: '' },
      { label: 'Promise a committee', desc: 'The classic.', cost: { budget: 1000 }, deltas: { pressure: -6, trust: -3, credibility: -2 }, result: 'Protesters are told the committee will meet “very soon”.', headline: 'Government Forms Committee to Investigate Why Previous Committee Failed' },
      { label: 'Wait them out', desc: 'It is cold. They will go home.', deltas: { trust: -8, pressure: 10 }, result: 'They do go home — and post everything online.' },
    ],
  },
  {
    id: 'viral',
    title: 'Viral Pollution Video',
    art: '📱🎥',
    category: 'Media',
    severity: 2,
    source: 'none',
    description: 'A video of a child drawing the sun in grey crayon “because that’s what it looks like” has 20 million views.',
    cooldownDays: 5,
    condition: (c) => c.aqi > 200,
    weight: () => 1,
    choices: [
      { label: 'Respond with an honest plan', desc: 'Publish what you are doing and the timeline.', cost: { budget: 1500 }, dynamic: (c) => { const built = Object.values(c.s.buildings).filter((l) => l > 0).length; return built >= 4 ? { deltas: { trust: 7, pressure: -6 }, text: 'You have real work to show. The response goes viral too.' } : { deltas: { trust: 1, pressure: -2 }, text: 'Your plan is honest, but thin. People are polite.' }; }, result: '' },
      { label: 'Get influencers to post blue skies', desc: '#DelhiIsBeautiful (filters applied).', cost: { budget: 2000 }, deltas: { pressure: -8, credibility: -7, exposureRisk: 0.1 }, result: 'The filters are spotted within an hour.', headline: 'Influencers Discover Delhi Sky Is Blue After Applying “Clarendon”' },
      { label: 'No comment', desc: 'Let it pass.', deltas: { trust: -5, pressure: 7 }, result: 'It does not pass.' },
    ],
  },
  {
    id: 'minister',
    title: "Minister's Surprise Visit",
    art: '🚘🎖️',
    category: 'Politics',
    severity: 2,
    source: 'none',
    description: 'Hon’ble Minister Shri Pawan Kumar Dhuanwala is arriving in 40 minutes with 14 cameras and 3 garlands.',
    cooldownDays: 6,
    condition: (c) => c.day >= 4,
    weight: (c) => 1 + c.s.res.pressure / 100,
    choices: [
      { label: 'Show actual progress', desc: 'Walk him through your buildings and data.', dynamic: (c) => { const lv = Object.values(c.s.buildings).reduce((a, b) => a + b, 0); return lv >= 6 ? { deltas: { budget: 6000, capital: 6, pressure: -8 }, text: 'Impressed, he sanctions a supplementary grant on the spot.' } : { deltas: { pressure: 6, capital: -2 }, text: '“So… where is the work?” he asks, loudly, on camera.' }; }, result: '' },
      { label: 'Stage a tree-planting photo-op', desc: 'Same sapling, fifth ceremony this year.', cost: { budget: 800 }, deltas: { capital: 4, pressure: -5, credibility: -3 }, result: 'The sapling has now been planted by four ministers.' },
      { label: 'Hide in the server room', desc: 'Your deputy will handle it.', deltas: { capital: -5, pressure: 5 }, result: 'The deputy promises a 50% AQI reduction by Thursday.' },
    ],
  },
  {
    id: 'celebrity',
    title: 'Celebrity Awareness Campaign',
    art: '🎬⭐',
    category: 'Media',
    severity: 1,
    source: 'none',
    description: 'Bollywood star Rajveer Kapoorna (fictional, unlike his abs) offers to be your Clean Air Ambassador — for a fee.',
    cooldownDays: 8,
    condition: (c) => c.day >= 3,
    weight: () => 0.8,
    choices: [
      { label: 'Sign him for a public-transport campaign', desc: 'He rides an e-bus on camera.', cost: { budget: 4000 }, deltas: { trust: 5, participation: 6 }, temp: { days: 6, modifier: { emissionMult: { transport: 0.94 } }, label: 'Celebrity rides the bus', kind: 'good' }, result: 'E-bus ridership spikes. He is spotted in a gas-guzzler next day.' },
      { label: 'Sign him for a vague “Breathe” campaign', desc: 'Slow-motion, white kurta, wind machine.', cost: { budget: 3000 }, deltas: { trust: 3, credibility: -1 }, result: 'Gorgeous ad. No measurable effect.' },
      { label: 'Politely decline', desc: 'Spend the money on buses.', deltas: { budget: 0 }, result: 'His fans are briefly upset; they move on.' },
    ],
  },
  {
    id: 'rain',
    title: 'Unexpected Rain',
    art: '🌧️☔',
    category: 'Weather',
    severity: 1,
    source: 'none',
    description: 'A western disturbance brings surprise showers. The air is washed clean — for now.',
    cooldownDays: 5,
    condition: (c) => c.season !== 'monsoon',
    weight: () => 0.7,
    choices: [
      { label: 'Tell people why it’s better', desc: 'Explain wet deposition; it is temporary.', deltas: { trust: 3, credibility: 2 }, temp: { days: 2, modifier: { dispersionMult: 2 }, label: 'Rain washout', kind: 'good' }, result: 'People enjoy the air and learn something.' },
      { label: 'Take credit for the rain', desc: '“Our policies are working.”', deltas: { trust: 4, pressure: -6, credibility: -6, exposureRisk: 0.05 }, temp: { days: 2, modifier: { dispersionMult: 2 }, label: 'Rain washout', kind: 'good' }, result: 'The Met department releases a pointed statement.', headline: 'Minister Announces Historic Reduction in Pollution. Clouds Disagree.' },
    ],
  },
  {
    id: 'subsidy',
    title: 'Electric Bus Subsidy Opportunity',
    art: '🚌⚡',
    category: 'Opportunity',
    severity: 1,
    source: 'transport',
    description: 'A central scheme offers matching funds for electric buses — if you file the application properly and on time.',
    cooldownDays: 10,
    condition: (c) => c.day >= 4,
    weight: (c) => (c.s.buildings.bus > 0 ? 1.4 : 0.8),
    choices: [
      { label: 'File a strong application', desc: 'Costs research effort and some co-funding.', cost: { rp: 40, budget: 3000 }, dynamic: (c) => (c.s.buildings.bus > 0 ? { deltas: { budget: 12000, trust: 3 }, text: 'Approved! Your existing depot made the case.' } : { deltas: { budget: 6000 }, text: 'Partially approved — you have no depot yet.' }), result: '' },
      { label: 'Use it for a PR event instead', desc: 'Inaugurate the application.', deltas: { capital: 3, credibility: -2 }, result: 'The application is inaugurated. It is not submitted.' },
      { label: 'Skip it', desc: 'Too much paperwork.', result: 'The neighbouring city gets the buses.' },
    ],
  },
  {
    id: 'journalist',
    title: 'Investigative Journalist Investigation',
    art: '🕵️📰',
    category: 'Media',
    severity: 3,
    source: 'none',
    description: 'A reporter from “The Daily Inhale” has been comparing your official numbers with independent sensors, RTI replies and the monitoring station’s water bill.',
    cooldownDays: 4,
    condition: (c) => c.s.res.credibility < 70 || c.s.exposureRisk > 0.2,
    weight: (c) => 0.5 + (100 - c.s.res.credibility) / 30 + c.s.exposureRisk * 3,
    choices: [
      { label: 'Come clean & publish raw data', desc: 'Painful but honest.', deltas: { trust: -4, credibility: 20, pressure: 4, exposureRisk: -0.5 }, tough: true, result: 'The story runs, but so does your full data dump. Respect, grudgingly.' },
      { label: 'Deny everything', desc: '“Baseless and motivated.”', dynamic: (c) => (c.s.res.credibility < 45 ? { deltas: { trust: -14, credibility: -12, pressure: 15 }, text: 'The story runs with photos of the sprinkler truck. It is everywhere.' } : { deltas: { trust: -3, credibility: -4 }, text: 'The story fizzles, but doubts remain.' }), result: '', headline: 'Independent Monitor and Official Monitor Agree to Disagree' },
      { label: 'Divert to a celebrity wedding', desc: 'Leak a guest list.', cost: { capital: 6 }, deltas: { pressure: -4, credibility: -6, exposureRisk: 0.1 }, result: 'Prime-time moves on. The reporter does not.' },
    ],
  },
  {
    id: 'interstate',
    title: 'Inter-State Pollution Disagreement',
    art: '🗺️🤝',
    category: 'Regional',
    severity: 2,
    source: 'agriculture',
    description: 'Neighbouring states say Delhi’s pollution is Delhi’s fault. Delhi says it’s the neighbours. The wind says nothing and keeps blowing.',
    cooldownDays: 6,
    condition: (c) => c.day >= 5,
    weight: (c) => (c.season === 'postmonsoon' ? 1.6 : 0.6),
    choices: [
      { label: 'Propose a joint airshed commission', desc: 'Share data, share costs, share credit.', cost: { capital: 8, budget: 2000 }, deltas: { trust: 3, credibility: 3 }, temp: { days: 10, modifier: { emissionMult: { agriculture: 0.85, other: 0.92 } }, label: 'Regional airshed cooperation', kind: 'good' }, tough: true, result: 'Air does not respect borders; for once, neither does cooperation.' },
      { label: 'Hold a fiery press conference', desc: 'Blame them, loudly.', deltas: { pressure: -6, capital: 2, credibility: -3 }, temp: spike('other', 1.08, 5, 'Regional blame game'), result: 'They hold a fierier one. Nothing changes.' },
      { label: 'Form a committee to study the issue', desc: 'Meets quarterly. Next quarter.', cost: { budget: 1000 }, deltas: { pressure: -4 }, result: 'The committee’s first meeting is postponed due to smog.' },
    ],
  },
  {
    id: 'notice',
    title: 'Show-Cause Notice from the Ministry',
    art: '📜⚠️',
    category: 'Politics',
    severity: 3,
    source: 'none',
    description: 'Political pressure is off the charts. The Ministry demands to know why it shouldn’t cut your budget.',
    cooldownDays: 5,
    condition: (c) => c.s.pressureMaxedDays >= 2,
    weight: () => 4,
    choices: [
      { label: 'Submit a frank progress report', desc: 'Show what is working and what needs time.', dynamic: (c) => (c.s.res.credibility >= 55 ? { deltas: { pressure: -25, capital: 2 }, text: 'The Ministry is satisfied. Pressure eases.' } : { deltas: { pressure: -10, budget: -4000 }, text: 'Your report contradicts your press releases. Budget is trimmed.' }), result: '' },
      { label: 'Accept a budget cut', desc: 'Take the hit.', deltas: { budget: -6000, pressure: -30 }, result: 'Belt tightened. Breathing still difficult.' },
    ],
  },
];

export const EVENT_MAP = Object.fromEntries(EVENTS.map((e) => [e.id, e])) as Record<string, EventDef>;
