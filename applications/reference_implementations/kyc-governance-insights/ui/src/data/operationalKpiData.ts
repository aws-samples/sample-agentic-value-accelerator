// =============================================================================
// operationalKpiData.ts — Iteration 24: Business Operations KPIs
// Real-time KPI cards with sparkline trends, targets, and period comparisons
// =============================================================================

export interface KpiMetric {
  id: string;
  label: string;
  currentValue: number;
  unit: string;
  format: 'percent' | 'number' | 'minutes' | 'hours' | 'cases';
  target: number;
  lastPeriodValue: number;
  trend: 'up' | 'down' | 'stable';
  trendIsPositive: boolean; // true = trend direction is good
  sparklineData: number[]; // 30 data points (daily)
}

export interface BacklogBreakdown {
  bucket: string;
  count: number;
  severity: 'normal' | 'warning' | 'critical';
}

export interface HourlyDecisions {
  hour: number;
  count: number;
}

export interface CapacityData {
  currentVolume: number;
  stpRate: number;
  humanReviewedPerDay: number;
  casesPerAnalystPerDay: number;
  currentFTE: number;
  costPerFTE: number; // annual £
}

// --- KPI Metrics ---

export const kpiMetrics: KpiMetric[] = [
  {
    id: 'stp-rate',
    label: 'STP Rate',
    currentValue: 80,
    unit: '%',
    format: 'percent',
    target: 85,
    lastPeriodValue: 77,
    trend: 'up',
    trendIsPositive: true,
    sparklineData: [68, 69, 70, 71, 72, 72, 73, 74, 74, 75, 75, 76, 76, 77, 77, 77, 78, 78, 78, 78, 79, 79, 79, 79, 79, 80, 80, 80, 80, 80],
  },
  {
    id: 'false-positive-rate',
    label: 'False Positive Rate',
    currentValue: 22,
    unit: '%',
    format: 'percent',
    target: 15,
    lastPeriodValue: 26,
    trend: 'down',
    trendIsPositive: true,
    sparklineData: [34, 33, 32, 31, 30, 30, 29, 28, 28, 27, 27, 26, 26, 26, 25, 25, 25, 24, 24, 24, 23, 23, 23, 23, 22, 22, 22, 22, 22, 22],
  },
  {
    id: 'avg-handling-time',
    label: 'Avg Handling Time',
    currentValue: 4.2,
    unit: 'min',
    format: 'minutes',
    target: 3.5,
    lastPeriodValue: 5.0,
    trend: 'down',
    trendIsPositive: true,
    sparklineData: [6.1, 5.9, 5.8, 5.7, 5.6, 5.5, 5.4, 5.3, 5.2, 5.1, 5.0, 4.9, 4.9, 4.8, 4.8, 4.7, 4.7, 4.6, 4.6, 4.5, 4.5, 4.4, 4.4, 4.3, 4.3, 4.3, 4.2, 4.2, 4.2, 4.2],
  },
  {
    id: 'backlog-size',
    label: 'Backlog Size',
    currentValue: 47,
    unit: 'cases',
    format: 'cases',
    target: 30,
    lastPeriodValue: 52,
    trend: 'down',
    trendIsPositive: true,
    sparklineData: [62, 60, 58, 57, 55, 54, 53, 52, 52, 51, 51, 50, 50, 49, 49, 49, 48, 48, 48, 48, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47],
  },
  {
    id: 'onboarding-time',
    label: 'Onboarding Time',
    currentValue: 2.3,
    unit: 'hrs',
    format: 'hours',
    target: 2.0,
    lastPeriodValue: 2.8,
    trend: 'down',
    trendIsPositive: true,
    sparklineData: [3.8, 3.7, 3.6, 3.5, 3.4, 3.3, 3.2, 3.1, 3.0, 2.9, 2.9, 2.8, 2.8, 2.7, 2.7, 2.6, 2.6, 2.5, 2.5, 2.5, 2.4, 2.4, 2.4, 2.4, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3],
  },
  {
    id: 'decisions-today',
    label: 'Decisions Today',
    currentValue: 1247,
    unit: '',
    format: 'number',
    target: 1500,
    lastPeriodValue: 1154,
    trend: 'up',
    trendIsPositive: true,
    sparklineData: [980, 1020, 1050, 1080, 1090, 1100, 1110, 1120, 1130, 1140, 1150, 1150, 1160, 1170, 1170, 1180, 1190, 1200, 1200, 1210, 1210, 1220, 1220, 1230, 1230, 1240, 1240, 1240, 1247, 1247],
  },
];

// --- Backlog Breakdown ---

export const backlogBreakdown: BacklogBreakdown[] = [
  { bucket: '<1hr', count: 23, severity: 'normal' },
  { bucket: '1-4hr', count: 14, severity: 'normal' },
  { bucket: '4-8hr', count: 7, severity: 'warning' },
  { bucket: '>8hr', count: 3, severity: 'critical' },
];

// --- Hourly Decisions (simulated up to current hour-ish) ---

export const hourlyDecisions: HourlyDecisions[] = [
  { hour: 6, count: 42 },
  { hour: 7, count: 78 },
  { hour: 8, count: 134 },
  { hour: 9, count: 167 },
  { hour: 10, count: 203 },
  { hour: 11, count: 189 },
  { hour: 12, count: 145 },
  { hour: 13, count: 156 },
  { hour: 14, count: 133 },
];

// --- Onboarding Percentiles ---

export const onboardingPercentiles = {
  p50: 1.8,
  p75: 3.1,
  p95: 5.2,
};

// --- Capacity Planning Data ---

export const capacityData: CapacityData = {
  currentVolume: 1247,
  stpRate: 80,
  humanReviewedPerDay: 249,
  casesPerAnalystPerDay: 62,
  currentFTE: 4,
  costPerFTE: 85000, // £85K/year
};

// --- KPI Summary for Fleet/Executive ---

export function getKpiSummary() {
  const stp = kpiMetrics.find(m => m.id === 'stp-rate')!;
  const fp = kpiMetrics.find(m => m.id === 'false-positive-rate')!;
  return {
    stpRate: stp.currentValue,
    stpTarget: stp.target,
    stpTrend: stp.trend,
    fpRate: fp.currentValue,
    fpTarget: fp.target,
    fpTrend: fp.trend,
    decisionsToday: kpiMetrics.find(m => m.id === 'decisions-today')!.currentValue,
  };
}
