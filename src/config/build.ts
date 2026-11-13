/**
 * City-building catalogue: everything the player can place on the map, plus demolition and
 * tool costs. Numbers here are balance values (₹, weeks); the engine reads them, never hard-codes them.
 */
import type { Kind } from '../engine/map';
import type { Deltas, Placeable, Zone } from '../engine/types';

export type Category = 'residential' | 'commercial' | 'industrial' | 'transport' | 'environment' | 'services';

export interface PlaceableDef {
  id: Placeable;
  name: string;
  category: Category;
  kind: Kind;
  w: number;
  h: number;
  cost: number;
  weeks: number;
  upkeep: number;
  zones: Zone[];
  needsRoad: boolean;
  /** must touch an arterial road (e.g. bus stops) */
  needsArterial?: boolean;
  unlockWeek: number;
  impact: string;
  blurb: string;
}

export const CATEGORIES: { id: Category; name: string; icon: string }[] = [
  { id: 'residential', name: 'Residential', icon: '🏠' },
  { id: 'commercial', name: 'Commercial', icon: '🛍️' },
  { id: 'industrial', name: 'Industrial', icon: '🏭' },
  { id: 'transport', name: 'Transport', icon: '🚌' },
  { id: 'environment', name: 'Environment', icon: '🌳' },
  { id: 'services', name: 'Public services', icon: '🏥' },
];

export const PLACEABLES: PlaceableDef[] = [
  { id: 'house', name: 'Houses', category: 'residential', kind: 'house', w: 1, h: 1, cost: 1200, weeks: 1, upkeep: 0, zones: ['res'], needsRoad: true, unlockWeek: 1, impact: '+180 residents · small tax income', blurb: 'A plotted family home. Comes with a water tank and an opinion.' },
  { id: 'apartment', name: 'Apartment society', category: 'residential', kind: 'apartment', w: 2, h: 2, cost: 6000, weeks: 3, upkeep: 0, zones: ['res'], needsRoad: true, unlockWeek: 6, impact: '+2,400 residents · tax income · more traffic', blurb: 'Group housing. Dense, efficient, and a generator of car traffic.' },
  { id: 'shop', name: 'Shops', category: 'commercial', kind: 'shop', w: 1, h: 1, cost: 1000, weeks: 1, upkeep: 0, zones: ['com', 'res'], needsRoad: true, unlockWeek: 1, impact: '+24 jobs · commercial revenue', blurb: 'Kirana, chemist and a mobile repair counter.' },
  { id: 'market', name: 'Market', category: 'commercial', kind: 'market', w: 2, h: 1, cost: 3500, weeks: 2, upkeep: 0, zones: ['com'], needsRoad: true, unlockWeek: 6, impact: '+240 jobs · strong revenue · traffic', blurb: 'Busy stalls and bargaining. Parking not included.' },
  { id: 'office', name: 'Office complex', category: 'commercial', kind: 'office', w: 2, h: 2, cost: 9000, weeks: 3, upkeep: 0, zones: ['com'], needsRoad: true, unlockWeek: 14, impact: '+1,200 jobs · high revenue · commuter traffic', blurb: 'Glass and air-conditioning. Development fees are lovely.' },
  { id: 'warehouse', name: 'Godown', category: 'industrial', kind: 'warehouse', w: 2, h: 1, cost: 3000, weeks: 2, upkeep: 0, zones: ['ind'], needsRoad: true, unlockWeek: 6, impact: '+120 jobs · truck traffic', blurb: 'Logistics hub. Trucks all night.' },
  { id: 'factory', name: 'Small factory', category: 'industrial', kind: 'factory', w: 2, h: 2, cost: 7000, weeks: 3, upkeep: 0, zones: ['ind'], needsRoad: true, unlockWeek: 6, impact: '+800 jobs · permit income · industrial smoke', blurb: 'A manufacturing unit. Profitable, employs many, pollutes.' },
  { id: 'bigfactory', name: 'Large factory', category: 'industrial', kind: 'factory', w: 3, h: 2, cost: 14000, weeks: 5, upkeep: 0, zones: ['ind'], needsRoad: true, unlockWeek: 27, impact: '+1,600 jobs · big permit income · heavy smoke', blurb: 'A large plant. The industrialist promises “world-class filters”.' },
  { id: 'busstop', name: 'Bus stop', category: 'transport', kind: 'busstop', w: 1, h: 1, cost: 400, weeks: 1, upkeep: 10, zones: ['res', 'com', 'ind', 'green'], needsRoad: true, needsArterial: true, unlockWeek: 1, impact: 'More bus coverage · fewer private trips', blurb: 'A shelter and a route number. Works best with an E-Bus Depot.' },
  { id: 'parking', name: 'Parking facility', category: 'transport', kind: 'parking', w: 2, h: 2, cost: 4000, weeks: 2, upkeep: 20, zones: ['com', 'ind'], needsRoad: true, unlockWeek: 14, impact: 'Parking fees · encourages driving', blurb: 'Multi-level parking. Revenue now, more cars later.' },
  { id: 'park', name: 'Park', category: 'environment', kind: 'park', w: 2, h: 2, cost: 2500, weeks: 2, upkeep: 30, zones: ['res', 'com', 'green'], needsRoad: false, unlockWeek: 1, impact: 'Local greenery · trust · traps dust', blurb: 'Lawns, trees and a walking track.' },
  { id: 'forest', name: 'Urban forest', category: 'environment', kind: 'forest', w: 3, h: 3, cost: 6000, weeks: 4, upkeep: 60, zones: ['res', 'com', 'ind', 'green'], needsRoad: false, unlockWeek: 14, impact: 'Dense trees · strong dust & smoke buffer', blurb: 'A Miyawaki-style mini forest. Grows fast, cools faster.' },
  { id: 'school', name: 'School', category: 'services', kind: 'school', w: 2, h: 1, cost: 5000, weeks: 3, upkeep: 80, zones: ['res', 'com'], needsRoad: true, unlockWeek: 6, impact: 'Trust · civic participation', blurb: 'Classrooms, a playground, and smog holidays.' },
  { id: 'hospital', name: 'Hospital', category: 'services', kind: 'hospital', w: 2, h: 2, cost: 12000, weeks: 6, upkeep: 200, zones: ['res', 'com'], needsRoad: true, unlockWeek: 27, impact: 'Large trust boost · respiratory care', blurb: 'A public hospital with a dedicated respiratory wing.' },
];
export const PLACEABLE_MAP = Object.fromEntries(PLACEABLES.map((p) => [p.id, p])) as Record<Placeable, PlaceableDef>;

export const ROAD = { costPerTile: 150, weeks: 1, maxLength: 24 };
export const ZONING = { costPerTile: 100 };
export const ZONE_INFO: Record<Zone, { name: string; color: number; css: string }> = {
  res: { name: 'Residential', color: 0x4ade80, css: '#4ade80' },
  com: { name: 'Commercial', color: 0x60a5fa, css: '#60a5fa' },
  ind: { name: 'Industrial', color: 0xfbbf24, css: '#fbbf24' },
  green: { name: 'Green belt', color: 0x22c55e, css: '#22c55e' },
};

/** Compensation and political consequences of demolishing each kind of building (per building). */
export const DEMOLITION: Partial<Record<Kind, { cost: number; perTile?: number; deltas: Deltas; note: string }>> = {
  house: { cost: 0, perTile: 900, deltas: { trust: -1.5, pressure: 1 }, note: 'Families must be resettled.' },
  apartment: { cost: 6000, deltas: { trust: -4, pressure: 3 }, note: 'Hundreds of residents displaced; the RWA is furious.' },
  shop: { cost: 700, deltas: { trust: -0.5 }, note: 'Shopkeepers compensated.' },
  market: { cost: 2000, deltas: { trust: -2, pressure: 1 }, note: 'Traders’ association protests.' },
  office: { cost: 3000, deltas: { pressure: 2 }, note: 'Lost development revenue and jobs.' },
  factory: { cost: 2500, perTile: 200, deltas: { pressure: 4, trust: -1, capital: -2 }, note: 'Job losses; the industry lobby calls the Minister.' },
  warehouse: { cost: 1200, deltas: { pressure: 1 }, note: 'Logistics firms relocate grumbling.' },
  construction: { cost: 1500, deltas: { pressure: 2 }, note: 'Developer cancelled; lawyers sharpen pencils.' },
  park: { cost: 400, deltas: { trust: -3 }, note: 'Morning walkers will never forgive you.' },
  forest: { cost: 600, deltas: { trust: -5 }, note: 'Cutting a forest in a smog crisis. Bold.' },
  parking: { cost: 800, deltas: {}, note: 'Parking revenue lost.' },
  busstop: { cost: 100, deltas: { trust: -0.5 }, note: 'Commuters lose a stop.' },
  school: { cost: 5000, deltas: { trust: -8, pressure: 3 }, note: 'Closing a school. Parents will remember.' },
  hospital: { cost: 8000, deltas: { trust: -10, pressure: 4 }, note: 'Closing a hospital during a pollution crisis.' },
};

export const RELOCATION = { costFactor: 0.6, deltas: { pressure: 1, trust: 1 } as Deltas, emissionFactor: 0.5 };
export const CANCEL_REFUND = 0.5;

/** Construction duration (weeks) of department facilities, per level. */
export const FACILITY_WEEKS: Record<string, number[]> = {
  monitor: [1, 1, 2],
  dust: [1, 1, 2, 2],
  bus: [2, 2, 3],
  greenery: [2, 2, 2],
  industrial: [2, 2, 3],
  waste: [3, 3, 4],
  parali: [2, 3, 3],
  pr: [1, 1, 1],
};
