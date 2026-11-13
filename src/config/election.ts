/** Election balance: seats and how much each part of the scorecard counts (weights sum to 1). */
export const ELECTION = {
  seats: 70,
  majority: 36,
  /** vote share = 50 + span × (score − pivot): a scorecard of `pivot` is a toss-up */
  pivot: 0.6,
  span: 60,
  minShare: 15,
  maxShare: 85,
  weights: {
    trust: 0.32,
    air: 0.2,
    improvement: 0.12,
    jobs: 0.1,
    economy: 0.08,
    infrastructure: 0.06,
    reputation: 0.07,
    objectives: 0.05,
  },
  /** each constituency's fixed political lean, in vote-share points */
  lean: {
    narela: -3, modeltown: -4, karolbagh: 2, cp: -2, centralvista: -5, mayurvihar: 1,
    dwarka: -1, lajpat: 3, nehruplace: 0, anandvihar: 4, okhla: 2, saritavihar: -2,
  } as Record<string, number>,
};

/** Weekly settlement presentation. */
export const SETTLEMENT = { cardSeconds: 8 };
