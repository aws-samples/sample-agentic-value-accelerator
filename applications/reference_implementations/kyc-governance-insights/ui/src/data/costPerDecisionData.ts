// =============================================================================
// costPerDecisionData.ts — Iteration 24: Cost Per Decision
// All-in unit economics with donut breakdown and manual-process comparison
// =============================================================================

export interface CostCategory {
  id: string;
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface CostTrend {
  month: string;
  costPerDecision: number;
}

export interface CostComparison {
  aiGoverned: number;
  manual: number;
  reductionPercentage: number;
}

// --- Cost Breakdown ---

export const costBreakdown: CostCategory[] = [
  { id: 'token', category: 'Token cost', amount: 0.44, percentage: 18, color: '#8b5cf6' },
  { id: 'analyst', category: 'Analyst time', amount: 1.04, percentage: 42, color: '#3b82f6' },
  { id: 'infra', category: 'Infrastructure', amount: 0.62, percentage: 25, color: '#10b981' },
  { id: 'qa', category: 'QA/Evaluation', amount: 0.37, percentage: 15, color: '#f59e0b' },
];

export const totalCostPerDecision = 2.47;
export const lastMonthCost = 2.81;
export const costChangePercent = -12; // negative = improvement

// --- Monthly Trend (5 months) ---

export const costTrend: CostTrend[] = [
  { month: 'Feb', costPerDecision: 3.12 },
  { month: 'Mar', costPerDecision: 2.89 },
  { month: 'Apr', costPerDecision: 2.81 },
  { month: 'May', costPerDecision: 2.63 },
  { month: 'Jun', costPerDecision: 2.47 },
];

// --- Manual vs AI Comparison ---

export const costComparison: CostComparison = {
  aiGoverned: 2.47,
  manual: 8.33,
  reductionPercentage: 70,
};

// --- 5-month overall reduction ---
export const fiveMonthReductionPercent = 21;
