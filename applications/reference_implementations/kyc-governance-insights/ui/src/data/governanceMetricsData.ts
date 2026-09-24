// TypeScript interfaces and 30-day synthetic governance metrics
// Matches KYC_Governance_Business_Metrics_Spec.md format

export type RAGStatus = 'green' | 'amber' | 'red';
export type TrendDirection = 'up' | 'down' | 'stable';

export interface TimeToDecision {
  medianSeconds: number;
  meanSeconds: number;
  p95Seconds: number;
}

export interface EvaluationScores {
  accuracy: number;
  faithfulness: number;
  safety: number;
  groundedness: number;
}

export interface BreachCount {
  nearMisses: number;
  customerFacing: number;
}

export interface DailyMetrics {
  falsePositiveRate: number;
  falseNegativeRate: number;
  escalationRate: number;
  timeToDecision: TimeToDecision;
  sarConversionRate: number;
  overrideRate: number;
  stpRate: number;
  agentAgreementRate: number;
  policyTriggerRate: number;
  evaluationScores: EvaluationScores;
  regulatoryBreachCount: BreachCount;
  meanTimeToEscalation: number;
}

export interface GovernanceEvent {
  type: 'drift_start' | 'drift_peak' | 'drift_recovered' | 'auto_tighten' | 'regulatory_update' | 'incident';
  severity: 'info' | 'warning' | 'critical';
  description: string;
}

export interface DailyDataPoint {
  date: string;
  dayIndex: number;
  volume: number;
  metrics: DailyMetrics;
  events: GovernanceEvent[];
}

export interface MetricSummary {
  current: number;
  sparkline: number[];
  trend: TrendDirection;
  status: RAGStatus;
  target: string;
}

export interface GovernanceMetricsSummary {
  falsePositiveRate: MetricSummary;
  falseNegativeRate: MetricSummary;
  escalationRate: MetricSummary;
  timeToDecision: MetricSummary;
  sarConversionRate: MetricSummary;
  overrideRate: MetricSummary;
  stpRate: MetricSummary;
  agentAgreementRate: MetricSummary;
  policyTriggerRate: MetricSummary;
  evalScoreTrend: MetricSummary;
  breachCount: MetricSummary;
  meanTimeToEscalation: MetricSummary;
}

// --- Deterministic seeded random (mulberry32) ---
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianRandom(rand: () => number, mean: number, stddev: number): number {
  const u1 = rand();
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

// --- Generate 30 days of daily metrics ---
function generateDailyData(): DailyDataPoint[] {
  const rand = seededRandom(42);
  const startDate = new Date('2026-05-26');
  const days: DailyDataPoint[] = [];

  for (let i = 0; i < 30; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    // Incident pattern: accuracy drops days 18-22, recovers by day 23
    let driftFactor = 0;
    if (i >= 18 && i <= 22) {
      const progress = (i - 18) / 4;
      driftFactor = Math.sin(progress * Math.PI) * 0.06;
    }
    let recoveryFactor = 0;
    if (i >= 23 && i <= 25) {
      recoveryFactor = (i - 23) / 2 * 0.015;
    }

    const improvement = i * 0.0003;
    const volumeBase = isWeekend ? 220 : 850;
    const volume = Math.round(volumeBase * (0.9 + rand() * 0.2));

    // False Positive Rate (lower is better; green < 0.85)
    const fpr = clamp(
      0.78 - improvement + gaussianRandom(rand, 0, 0.015) * (isWeekend ? 1.5 : 1) + driftFactor * 0.5,
      0.60, 0.95
    );

    // False Negative Rate (lower is better; green < 0.0001)
    const fnr = clamp(
      0.00005 + Math.abs(gaussianRandom(rand, 0, 0.00003)) + driftFactor * 0.001,
      0, 0.005
    );

    // Escalation Rate (green 0.15-0.25)
    const escalation = clamp(
      0.22 - improvement * 0.5 + gaussianRandom(rand, 0, 0.02) * (isWeekend ? 1.3 : 1) + driftFactor * 1.2,
      0.10, 0.55
    );

    // Time-to-Decision median seconds (green < 180s for low-risk)
    const t2dMedian = clamp(
      108 - improvement * 200 + gaussianRandom(rand, 0, 15) + driftFactor * 300,
      45, 600
    );

    // SAR Conversion Rate (green 0.08-0.15)
    const sarConversion = clamp(
      0.11 + gaussianRandom(rand, 0, 0.015) - driftFactor * 0.3,
      0.02, 0.30
    );

    // Override Rate (green < 0.05)
    const override = clamp(
      0.04 - improvement * 0.3 + gaussianRandom(rand, 0, 0.008) * (isWeekend ? 1.4 : 1) + driftFactor * 1.5,
      0.01, 0.25
    );

    // STP Rate (green 0.55-0.75)
    const stp = clamp(
      0.68 + improvement * 0.5 + gaussianRandom(rand, 0, 0.02) - driftFactor * 1.5,
      0.30, 0.85
    );

    // Agent Agreement Rate (green > 0.90)
    const agreement = clamp(
      0.94 + improvement * 0.2 + gaussianRandom(rand, 0, 0.012) - driftFactor * 1.8,
      0.70, 0.99
    );

    // Policy Trigger Rate (green 0.02-0.08)
    const policy = clamp(
      0.042 + gaussianRandom(rand, 0, 0.005) + driftFactor * 0.8 + recoveryFactor * 0.3,
      0.01, 0.20
    );

    // Evaluation Scores
    const evalAccuracy = clamp(0.94 + improvement - driftFactor * 1.0 + gaussianRandom(rand, 0, 0.008), 0.75, 0.98);
    const evalFaithfulness = clamp(0.95 + improvement * 0.5 - driftFactor * 0.5 + gaussianRandom(rand, 0, 0.006), 0.80, 0.99);
    const evalSafety = clamp(0.97 - driftFactor * 0.3 + gaussianRandom(rand, 0, 0.004), 0.85, 0.99);
    const evalGroundedness = clamp(0.93 + improvement - driftFactor * 0.8 + gaussianRandom(rand, 0, 0.007), 0.80, 0.99);

    // Breach Count
    const nearMisses = Math.max(0, Math.round(gaussianRandom(rand, 2, 1.2) + driftFactor * 30));
    const customerFacing = (driftFactor > 0.04 && rand() < 0.15) ? 1 : 0;

    // Mean Time to Escalation (seconds; green < 30)
    const mtte = clamp(8 + gaussianRandom(rand, 0, 2) + driftFactor * 80, 2, 120);

    // Events
    const events: GovernanceEvent[] = [];
    if (i === 18) {
      events.push({ type: 'drift_start', severity: 'warning', description: 'Model accuracy drift detected — evaluation scores declining' });
    }
    if (i === 20) {
      events.push({ type: 'drift_peak', severity: 'critical', description: 'Accuracy below threshold — EAI reduced to Supervised mode' });
    }
    if (i === 23) {
      events.push({ type: 'auto_tighten', severity: 'info', description: 'Auto-tighten activated — policy constraints increased' });
    }
    if (i === 24) {
      events.push({ type: 'drift_recovered', severity: 'info', description: 'Metrics recovered to baseline — autonomy restored' });
    }

    days.push({
      date: dateStr,
      dayIndex: i,
      volume,
      metrics: {
        falsePositiveRate: round(fpr, 4),
        falseNegativeRate: round(fnr, 6),
        escalationRate: round(escalation, 4),
        timeToDecision: {
          medianSeconds: round(t2dMedian, 1),
          meanSeconds: round(t2dMedian * 1.3, 1),
          p95Seconds: round(t2dMedian * 3.2, 1),
        },
        sarConversionRate: round(sarConversion, 4),
        overrideRate: round(override, 4),
        stpRate: round(stp, 4),
        agentAgreementRate: round(agreement, 4),
        policyTriggerRate: round(policy, 4),
        evaluationScores: {
          accuracy: round(evalAccuracy, 4),
          faithfulness: round(evalFaithfulness, 4),
          safety: round(evalSafety, 4),
          groundedness: round(evalGroundedness, 4),
        },
        regulatoryBreachCount: { nearMisses, customerFacing },
        meanTimeToEscalation: round(mtte, 2),
      },
      events,
    });
  }

  return days;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round(val: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

// --- Compute trend from first/last thirds of sparkline ---
function computeTrend(sparkline: number[], invertedBetter: boolean): TrendDirection {
  const third = Math.floor(sparkline.length / 3);
  const firstAvg = sparkline.slice(0, third).reduce((a, b) => a + b, 0) / third;
  const lastAvg = sparkline.slice(-third).reduce((a, b) => a + b, 0) / third;
  const delta = lastAvg - firstAvg;
  const threshold = Math.abs(firstAvg) * 0.03;
  if (Math.abs(delta) < threshold) return 'stable';
  if (invertedBetter) return delta < 0 ? 'up' : 'down';
  return delta > 0 ? 'up' : 'down';
}

// --- Compute RAG status ---
function computeRAG(
  value: number,
  thresholds: { greenBelow?: number; greenAbove?: number; greenRange?: [number, number]; redBelow?: number; redAbove?: number }
): RAGStatus {
  if (thresholds.greenBelow !== undefined) {
    if (value < thresholds.greenBelow) return 'green';
    if (thresholds.redAbove !== undefined && value > thresholds.redAbove) return 'red';
    return 'amber';
  }
  if (thresholds.greenAbove !== undefined) {
    if (value > thresholds.greenAbove) return 'green';
    if (thresholds.redBelow !== undefined && value < thresholds.redBelow) return 'red';
    return 'amber';
  }
  if (thresholds.greenRange) {
    const [lo, hi] = thresholds.greenRange;
    if (value >= lo && value <= hi) return 'green';
    if (thresholds.redBelow !== undefined && value < thresholds.redBelow) return 'red';
    if (thresholds.redAbove !== undefined && value > thresholds.redAbove) return 'red';
    return 'amber';
  }
  return 'green';
}

// --- Export generated daily data ---
export const dailyGovernanceMetrics: DailyDataPoint[] = generateDailyData();

// --- Export summary with sparklines, trend, RAG, target for each metric ---
function buildSummary(): GovernanceMetricsSummary {
  const data = dailyGovernanceMetrics;
  const last = data[data.length - 1].metrics;

  const fprSparkline = data.map((d) => d.metrics.falsePositiveRate);
  const fnrSparkline = data.map((d) => d.metrics.falseNegativeRate);
  const escSparkline = data.map((d) => d.metrics.escalationRate);
  const t2dSparkline = data.map((d) => d.metrics.timeToDecision.medianSeconds);
  const sarSparkline = data.map((d) => d.metrics.sarConversionRate);
  const ovrSparkline = data.map((d) => d.metrics.overrideRate);
  const stpSparkline = data.map((d) => d.metrics.stpRate);
  const agrSparkline = data.map((d) => d.metrics.agentAgreementRate);
  const polSparkline = data.map((d) => d.metrics.policyTriggerRate);
  const evalSparkline = data.map((d) => d.metrics.evaluationScores.accuracy);
  const brchSparkline = data.map((d) => d.metrics.regulatoryBreachCount.nearMisses);
  const mtteSparkline = data.map((d) => d.metrics.meanTimeToEscalation);

  return {
    falsePositiveRate: {
      current: last.falsePositiveRate,
      sparkline: fprSparkline,
      trend: computeTrend(fprSparkline, true),
      status: computeRAG(last.falsePositiveRate, { greenBelow: 0.85, redAbove: 0.92 }),
      target: '< 85%',
    },
    falseNegativeRate: {
      current: last.falseNegativeRate,
      sparkline: fnrSparkline,
      trend: computeTrend(fnrSparkline, true),
      status: computeRAG(last.falseNegativeRate, { greenBelow: 0.0001, redAbove: 0.0005 }),
      target: '< 0.01%',
    },
    escalationRate: {
      current: last.escalationRate,
      sparkline: escSparkline,
      trend: computeTrend(escSparkline, false),
      status: computeRAG(last.escalationRate, { greenRange: [0.15, 0.25], redAbove: 0.40, redBelow: 0.10 }),
      target: '15–25%',
    },
    timeToDecision: {
      current: last.timeToDecision.medianSeconds,
      sparkline: t2dSparkline,
      trend: computeTrend(t2dSparkline, true),
      status: computeRAG(last.timeToDecision.medianSeconds, { greenBelow: 180, redAbove: 900 }),
      target: '< 3 min (low-risk)',
    },
    sarConversionRate: {
      current: last.sarConversionRate,
      sparkline: sarSparkline,
      trend: computeTrend(sarSparkline, false),
      status: computeRAG(last.sarConversionRate, { greenRange: [0.08, 0.15], redBelow: 0.03, redAbove: 0.25 }),
      target: '8–15%',
    },
    overrideRate: {
      current: last.overrideRate,
      sparkline: ovrSparkline,
      trend: computeTrend(ovrSparkline, true),
      status: computeRAG(last.overrideRate, { greenBelow: 0.05, redAbove: 0.12 }),
      target: '< 5%',
    },
    stpRate: {
      current: last.stpRate,
      sparkline: stpSparkline,
      trend: computeTrend(stpSparkline, false),
      status: computeRAG(last.stpRate, { greenRange: [0.55, 0.75], redBelow: 0.40, redAbove: 0.85 }),
      target: '55–75%',
    },
    agentAgreementRate: {
      current: last.agentAgreementRate,
      sparkline: agrSparkline,
      trend: computeTrend(agrSparkline, false),
      status: computeRAG(last.agentAgreementRate, { greenAbove: 0.90, redBelow: 0.80 }),
      target: '> 90%',
    },
    policyTriggerRate: {
      current: last.policyTriggerRate,
      sparkline: polSparkline,
      trend: computeTrend(polSparkline, false),
      status: computeRAG(last.policyTriggerRate, { greenRange: [0.02, 0.08], redBelow: 0.01, redAbove: 0.15 }),
      target: '2–8%',
    },
    evalScoreTrend: {
      current: last.evaluationScores.accuracy,
      sparkline: evalSparkline,
      trend: computeTrend(evalSparkline, false),
      status: computeRAG(last.evaluationScores.accuracy, { greenAbove: 0.92, redBelow: 0.85 }),
      target: '> 92%',
    },
    breachCount: {
      current: last.regulatoryBreachCount.nearMisses,
      sparkline: brchSparkline,
      trend: computeTrend(brchSparkline, true),
      status: computeRAG(last.regulatoryBreachCount.customerFacing, { greenBelow: 1, redAbove: 0 }),
      target: '0 customer-facing',
    },
    meanTimeToEscalation: {
      current: last.meanTimeToEscalation,
      sparkline: mtteSparkline,
      trend: computeTrend(mtteSparkline, true),
      status: computeRAG(last.meanTimeToEscalation, { greenBelow: 30, redAbove: 300 }),
      target: '< 30 seconds',
    },
  };
}

export const governanceMetricsSummary: GovernanceMetricsSummary = buildSummary();
