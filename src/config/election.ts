/** Election balance: seats and how much each part of the scorecard counts (weights sum to 1). */
export const ELECTION = {
  seats: 70,
  majority: 36,
  /** a neighbourhood's vote share = floor + span × score (score 0–1) */
  floor: 25,
  span: 50,
  weights: {
    trust: 0.28,
    air: 0.2,
    improvement: 0.1,
    jobs: 0.12,
    economy: 0.1,
    infrastructure: 0.08,
    reputation: 0.07,
    objectives: 0.05,
  },
};

/** Weekly settlement presentation. */
export const SETTLEMENT = { cardSeconds: 8 };
