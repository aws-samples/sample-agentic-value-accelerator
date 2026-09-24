// =============================================================================
// slaMonitoringData.ts — Iteration 24: SLA Monitoring
// Real-time SLA compliance tracker with breach prediction
// =============================================================================

export interface SlaTier {
  id: string;
  name: string;
  targetHours: number;
  compliance: number;
  atRiskCount: number;
  atRiskBreachMinutes: number;
  description: string;
}

export interface QueueCase {
  caseId: string;
  tier: string;
  ageMinutes: number;
  predictedBreachInMinutes: number | null;
}

export interface BreachHistory {
  day: string;
  breachCount: number;
}

// --- SLA Tiers ---

export const slaTiers: SlaTier[] = [
  {
    id: 'urgent',
    name: 'Urgent',
    targetHours: 1,
    compliance: 89,
    atRiskCount: 2,
    atRiskBreachMinutes: 15,
    description: 'PEP hits, sanctions matches, high-risk jurisdictions',
  },
  {
    id: 'priority',
    name: 'Priority',
    targetHours: 4,
    compliance: 93,
    atRiskCount: 1,
    atRiskBreachMinutes: 30,
    description: 'Medium-risk, repeat reviews, triggered by rule changes',
  },
  {
    id: 'standard',
    name: 'Standard',
    targetHours: 8,
    compliance: 97,
    atRiskCount: 0,
    atRiskBreachMinutes: 0,
    description: 'Standard CDD, periodic reviews, low-risk escalations',
  },
];

// --- Queue Cases (representative sample) ---

export const queueCases: QueueCase[] = [
  { caseId: 'KYC-2026-1892', tier: 'urgent', ageMinutes: 45, predictedBreachInMinutes: 15 },
  { caseId: 'KYC-2026-1894', tier: 'urgent', ageMinutes: 42, predictedBreachInMinutes: 18 },
  { caseId: 'KYC-2026-1876', tier: 'priority', ageMinutes: 210, predictedBreachInMinutes: 30 },
  { caseId: 'KYC-2026-1880', tier: 'priority', ageMinutes: 145, predictedBreachInMinutes: null },
  { caseId: 'KYC-2026-1881', tier: 'priority', ageMinutes: 120, predictedBreachInMinutes: null },
  { caseId: 'KYC-2026-1862', tier: 'standard', ageMinutes: 340, predictedBreachInMinutes: null },
  { caseId: 'KYC-2026-1865', tier: 'standard', ageMinutes: 280, predictedBreachInMinutes: null },
  { caseId: 'KYC-2026-1870', tier: 'standard', ageMinutes: 195, predictedBreachInMinutes: null },
];

// --- Breach History (last 7 days) ---

export const breachHistory: BreachHistory[] = [
  { day: 'Mon', breachCount: 2 },
  { day: 'Tue', breachCount: 0 },
  { day: 'Wed', breachCount: 1 },
  { day: 'Thu', breachCount: 3 },
  { day: 'Fri', breachCount: 1 },
  { day: 'Sat', breachCount: 0 },
  { day: 'Sun', breachCount: 0 },
];

// --- Computed Summary ---

export function getSlaSummary() {
  const totalCases = queueCases.length;
  const atRiskCases = queueCases.filter(c => c.predictedBreachInMinutes !== null);
  const avgBreachesPerDay = breachHistory.reduce((s, d) => s + d.breachCount, 0) / breachHistory.length;

  // Overall compliance = weighted average by tier volume
  const overallCompliance = Math.round(
    slaTiers.reduce((sum, t) => sum + t.compliance, 0) / slaTiers.length
  );

  return {
    overallCompliance,
    totalInQueue: totalCases,
    atRiskCount: atRiskCases.length,
    avgBreachesPerDay: Math.round(avgBreachesPerDay * 10) / 10,
    breachTarget: 2, // target: <2 breaches/day
  };
}
