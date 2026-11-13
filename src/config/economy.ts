/** Revenue streams and financial-recovery options (₹ per in-game week unless stated). */
import type { Deltas, Modifier } from '../engine/types';

export const REVENUE = {
  /** grant from the Centre; scaled by public trust (see ECONOMY.trust* in balance.ts) */
  allocation: 900,
  propertyTaxPerResident: 0.004,
  commercialTaxPerJob: 0.008,
  permitPerIndustryTile: 1.5,
  parkingFeePerTile: 25,
  /** only while the matching policy is active */
  congestionChargePerTrip: 0.012,
  finesPerIndustryTile: 4,
  smartParkingPerTrip: 0.002,
  /** private developers pay this share of a building's value (organic growth & approvals) */
};

export const RECOVERY = {
  grant: { amount: 15000, budgetBelow: 5000, deltas: { pressure: 8, capital: -4 } as Deltas },
  loan: { principal: 20000, perWeek: 600, weeks: 40, max: 2 },
  investment: { amount: 12000, perWeek: 500, weeks: 30, budgetBelow: 5000, deltas: { credibility: -3 } as Deltas },
  cuts: { weeks: 8, cooldownWeeks: 13, modifier: { maintenanceMult: 0.7, researchMult: 0.7, trustPerWeek: -0.6 } as Modifier },
};
