/**
 * evalsData — Red-Team & Safety Evals for the AI Safety module.
 *
 * Two complementary tracks, both illustrative (demo data):
 *
 *  1) Safety BENCHMARKS per model — named, published evals with EXPLICIT polarity,
 *     because polarity is the whole point of a safety view. Getting the direction
 *     wrong ("higher = better") is a real correctness hazard for these:
 *       - HarmBench ASR (Attack Success Rate): LOWER is safer. % of harmful
 *         behaviors successfully elicited by red-team attacks.
 *       - WMDP (Weapons of Mass Destruction Proxy): INVERTED benchmark. It is a
 *         capability/knowledge probe, so a LOWER score is SAFER (less hazardous
 *         knowledge). We tag it inverted so nobody reads it as an accuracy metric.
 *       - AILuminate grade: MLCommons safety grade (Poor..Excellent); higher is safer.
 *       - TruthfulQA: HIGHER is better (% truthful & informative).
 *       - Cybench: cyber-offense CAPABILITY. High capability is NOT "good" here — in
 *         a safety view a high score means MORE scrutiny / gating, not a green light.
 *
 *  2) Red-team PROGRAM — campaigns with scope, findings-by-severity, status, and
 *     remediation rate. The aggregate rolls up open criticals and mean remediation.
 *
 * Live path would be Amazon Bedrock model evaluations / METR Inspect harness feeding
 * these tables; today the values are hand-set for illustration.
 *
 * Sources / framing: METR + UK AISI Inspect eval framework; HarmBench (CAIS);
 * WMDP (Center for AI Safety); AILuminate (MLCommons AI Risk & Reliability);
 * TruthfulQA; Cybench (cyber-capability CTF benchmark).
 */

/** Which way is "safer" for a benchmark — drives colouring and the polarity note. */
export type Polarity = 'lower-is-safer' | 'higher-is-safer' | 'capability-scrutiny';

export interface BenchmarkDef {
  id: string;
  /** Short display name. */
  name: string;
  /** One-line description of what it measures. */
  blurb: string;
  polarity: Polarity;
  /** Unit label shown after numeric values (e.g. '%'); omitted for graded scales. */
  unit?: string;
  /** True for WMDP-style probes where the number is a hazard, not an achievement. */
  inverted?: boolean;
  /** Threshold considered "passing" for a safety posture (numeric benchmarks only). */
  threshold?: number;
  source: string;
}

export const BENCHMARKS: BenchmarkDef[] = [
  {
    id: 'harmbench',
    name: 'HarmBench ASR',
    blurb: 'Attack Success Rate — share of harmful behaviors elicited by red-team attacks.',
    polarity: 'lower-is-safer',
    unit: '%',
    threshold: 10,
    source: 'HarmBench (CAIS)',
  },
  {
    id: 'wmdp',
    name: 'WMDP',
    blurb: 'Weapons of Mass Destruction Proxy — hazardous-knowledge probe (bio/chem/cyber).',
    polarity: 'lower-is-safer',
    unit: '%',
    inverted: true,
    threshold: 35,
    source: 'WMDP (Center for AI Safety)',
  },
  {
    id: 'ailuminate',
    name: 'AILuminate',
    blurb: 'MLCommons AI safety grade across 12 hazard categories.',
    polarity: 'higher-is-safer',
    source: 'AILuminate (MLCommons)',
  },
  {
    id: 'truthfulqa',
    name: 'TruthfulQA',
    blurb: 'Truthful + informative answers to questions humans often get wrong.',
    polarity: 'higher-is-safer',
    unit: '%',
    threshold: 70,
    source: 'TruthfulQA',
  },
  {
    id: 'cybench',
    name: 'Cybench',
    blurb: 'Cyber-offense capability (CTF tasks). High capability raises deployment scrutiny.',
    polarity: 'capability-scrutiny',
    unit: '%',
    threshold: 40,
    source: 'Cybench',
  },
];

/** AILuminate-style graded scale. Ordered worst→best for comparison. */
export type SafetyGrade = 'Poor' | 'Fair' | 'Good' | 'Very Good' | 'Excellent';
export const GRADE_ORDER: SafetyGrade[] = ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

export interface ModelBenchmarks {
  model: string;
  /** HarmBench Attack Success Rate (%). Lower is safer. */
  harmbench: number;
  /** WMDP hazardous-knowledge proxy (%). Lower is safer (inverted). */
  wmdp: number;
  /** AILuminate safety grade. */
  ailuminate: SafetyGrade;
  /** TruthfulQA (%). Higher is better. */
  truthfulqa: number;
  /** Cybench cyber-offense capability (%). High capability = more scrutiny. */
  cybench: number;
}

export const MODEL_BENCHMARKS: ModelBenchmarks[] = [
  { model: 'Claude (frontier)',     harmbench: 4.2,  wmdp: 28.5, ailuminate: 'Excellent', truthfulqa: 88.4, cybench: 31.0 },
  { model: 'GPT-class (frontier)',  harmbench: 6.8,  wmdp: 33.1, ailuminate: 'Very Good', truthfulqa: 84.1, cybench: 44.5 },
  { model: 'Llama (open-weight)',   harmbench: 18.5, wmdp: 41.2, ailuminate: 'Fair',      truthfulqa: 71.3, cybench: 38.2 },
  { model: 'Mistral (open-weight)', harmbench: 24.1, wmdp: 44.9, ailuminate: 'Poor',      truthfulqa: 63.7, cybench: 29.4 },
  { model: 'Internal fine-tune',    harmbench: 9.3,  wmdp: 31.8, ailuminate: 'Good',      truthfulqa: 79.5, cybench: 42.9 },
];

/** Numeric value for a model against a benchmark (graded benchmarks return undefined). */
export function benchmarkValue(m: ModelBenchmarks, id: string): number | undefined {
  switch (id) {
    case 'harmbench': return m.harmbench;
    case 'wmdp': return m.wmdp;
    case 'truthfulqa': return m.truthfulqa;
    case 'cybench': return m.cybench;
    default: return undefined;
  }
}

/**
 * Does a model "pass" the safety threshold for a numeric benchmark?
 * - lower-is-safer: value at/under threshold passes.
 * - higher-is-safer: value at/over threshold passes.
 * - capability-scrutiny: "passes" (no extra scrutiny) when capability is BELOW the
 *   threshold; at/over it we flag for gating (returns false).
 */
export function passesThreshold(b: BenchmarkDef, value: number): boolean {
  if (b.threshold === undefined) return true;
  switch (b.polarity) {
    case 'lower-is-safer': return value <= b.threshold;
    case 'higher-is-safer': return value >= b.threshold;
    case 'capability-scrutiny': return value < b.threshold;
  }
}

// ── Red-team program ────────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

export type CampaignStatus = 'planned' | 'running' | 'complete';

export interface Findings {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface RedTeamCampaign {
  id: string;
  name: string;
  scope: string;
  status: CampaignStatus;
  findings: Findings;
  /** % of findings with a shipped fix or accepted mitigation. */
  remediationRate: number;
  /** Eval harness / methodology backing the campaign. */
  method: string;
}

export const CAMPAIGNS: RedTeamCampaign[] = [
  {
    id: 'jailbreak-q2',
    name: 'Jailbreak & prompt-injection sweep',
    scope: 'All production agents with tool access',
    status: 'complete',
    findings: { critical: 1, high: 4, medium: 9, low: 12 },
    remediationRate: 92,
    method: 'METR Inspect · HarmBench attack suite',
  },
  {
    id: 'cbrn-uplift',
    name: 'CBRN uplift probe',
    scope: 'Frontier models above capability threshold',
    status: 'complete',
    findings: { critical: 0, high: 2, medium: 5, low: 3 },
    remediationRate: 100,
    method: 'WMDP proxy · expert-led adversarial eval',
  },
  {
    id: 'agentic-autonomy',
    name: 'Agentic autonomy & tool-misuse',
    scope: 'Multi-step autonomous workflows',
    status: 'running',
    findings: { critical: 2, high: 6, medium: 8, low: 4 },
    remediationRate: 41,
    method: 'Inspect agentic eval · Cybench cyber tasks',
  },
  {
    id: 'data-exfil',
    name: 'Data-exfiltration & PII leakage',
    scope: 'Retrieval-augmented + memory-enabled agents',
    status: 'planned',
    findings: { critical: 0, high: 0, medium: 0, low: 0 },
    remediationRate: 0,
    method: 'Guardrails red-team · custom exfil probes',
  },
];

export function totalFindings(f: Findings): number {
  return f.critical + f.high + f.medium + f.low;
}

export interface EvalsAggregate {
  campaigns: number;
  openCriticals: number;
  totalFindings: number;
  meanRemediation: number;
  benchmarksTracked: number;
  benchmarksPassing: number;
}

/**
 * Roll up campaign + benchmark posture. Open criticals count criticals from any
 * campaign that is not yet complete (still-open risk); complete campaigns are
 * assumed remediated per their remediationRate.
 */
export function computeAggregate(
  campaigns: RedTeamCampaign[],
  models: ModelBenchmarks[],
  benchmarks: BenchmarkDef[],
): EvalsAggregate {
  const openCriticals = campaigns
    .filter(c => c.status !== 'complete')
    .reduce((s, c) => s + c.findings.critical, 0);

  const total = campaigns.reduce((s, c) => s + totalFindings(c.findings), 0);

  const active = campaigns.filter(c => c.status !== 'planned');
  const meanRemediation = active.length
    ? Math.round(active.reduce((s, c) => s + c.remediationRate, 0) / active.length)
    : 0;

  // Benchmarks "passing" = numeric benchmarks with a threshold where every model
  // clears it. (Graded benchmarks are excluded from the pass count.)
  const numeric = benchmarks.filter(b => b.threshold !== undefined && b.id !== 'ailuminate');
  const benchmarksPassing = numeric.filter(b =>
    models.every(m => {
      const v = benchmarkValue(m, b.id);
      return v === undefined ? true : passesThreshold(b, v);
    }),
  ).length;

  return {
    campaigns: campaigns.length,
    openCriticals,
    totalFindings: total,
    meanRemediation,
    benchmarksTracked: benchmarks.length,
    benchmarksPassing,
  };
}
