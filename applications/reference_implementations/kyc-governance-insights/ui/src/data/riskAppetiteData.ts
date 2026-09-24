// =============================================================================
// riskAppetiteData.ts — Iteration 25: Risk Appetite vs Actual
// Board-set appetite thresholds — configurable, quarterly review cycle
// =============================================================================

export type RagStatus = 'green' | 'amber' | 'red';

export interface AppetiteThreshold {
  useCaseId: string;
  label: string;
  floor: number; // board-set minimum acceptable score
  amberBuffer: number; // margin within which status is amber (0 to amberBuffer above floor)
  actual: number; // current composite health score
}

export interface RiskAppetiteConfig {
  thresholds: AppetiteThreshold[];
  lastReviewed: string;
  nextReview: string;
  approvedBy: string;
}

// --- Board-approved thresholds (configurable — quarterly review cycle) ---

export const riskAppetiteConfig: RiskAppetiteConfig = {
  thresholds: [
    { useCaseId: 'kyc', label: 'KYC Banking', floor: 85, amberBuffer: 5, actual: 92 },
    { useCaseId: 'trade', label: 'Trade Surveillance', floor: 85, amberBuffer: 5, actual: 88 },
    { useCaseId: 'claims', label: 'Claims Processing', floor: 80, amberBuffer: 5, actual: 94 },
    { useCaseId: 'mortgage', label: 'Mortgage Assessment', floor: 80, amberBuffer: 5, actual: 78 },
  ],
  lastReviewed: '2026-Q2 Board Risk Committee',
  nextReview: '2026-Q3',
  approvedBy: 'Sarah Thompson, CRO (SMF4)',
};

// --- Utility functions ---

export function computeRag(threshold: AppetiteThreshold): RagStatus {
  const gap = threshold.actual - threshold.floor;
  if (gap < 0) return 'red';
  if (gap < threshold.amberBuffer) return 'amber';
  return 'green';
}

export function computeGap(threshold: AppetiteThreshold): number {
  return threshold.actual - threshold.floor;
}

export function getAppetiteSummary() {
  const statuses = riskAppetiteConfig.thresholds.map(t => ({
    threshold: t,
    rag: computeRag(t),
    gap: computeGap(t),
  }));

  return {
    green: statuses.filter(s => s.rag === 'green').length,
    amber: statuses.filter(s => s.rag === 'amber').length,
    red: statuses.filter(s => s.rag === 'red').length,
    breaching: statuses.filter(s => s.rag === 'red'),
    statuses,
  };
}
