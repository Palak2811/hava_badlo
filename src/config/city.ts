/** Living-city balance: population, employment, demand, traffic and organic growth. */
export const CITY_SIM = {
  /** share of housing capacity occupied on day one */
  startOccupancy: 0.95,
  workforceShare: 0.45,
  /** fraction of the gap to target population closed each week */
  migrationRate: 0.12,
  minOccupancy: 0.7,
  maxOccupancy: 1.15,

  /** trips per employed worker (to work and back) and per resident (shopping, school) */
  tripsPerWorker: 2,
  tripsPerResident: 0.3,
  /** daily trips each kind of public transport can absorb */
  metroStationCapacity: 5000,
  busStopCapacity: 700,
  /** each E-Bus Depot level boosts every bus stop and adds its own capacity */
  depotStopBonus: 0.6,
  depotCapacity: 4000,
  ptShareMin: 0.1,
  ptShareMax: 0.65,
  /** each parking tile induces this extra share of private trips */
  parkingInduced: 0.002,
  arterialCapacity: 900,
  streetCapacity: 250,
  /** roads are scaled so the starting city sits at this volume/capacity ratio */
  baseCongestion: 1.05,
  /** above this ratio, idling adds emissions */
  congestionFree: 0.9,
  congestionPenalty: 0.6,

  /** retail jobs residents need */
  retailJobsPerResident: 0.09,
  unemploymentTolerance: 0.08,
  unemploymentTrust: 15,
  overcrowdingTolerance: 0.05,
  overcrowdingTrust: 20,

  growth: {
    threshold: 0.15,
    maxPerWeek: 4,
    maxActiveSites: 8,
    /** developers pay this share of a building's value to the city */
    devFeeShare: 0.15,
  },
};
