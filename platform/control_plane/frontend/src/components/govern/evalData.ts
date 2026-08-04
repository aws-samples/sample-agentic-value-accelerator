/**
 * evalData — Model-evaluation data model + access layer.
 *
 * Backed by REAL AWS Bedrock LLM-as-Judge evaluation results migrated from the
 * AI Trust Tool (596-case FSI dataset, 12 Builtin.* metrics, judge = Nova Pro).
 *
 *  - The lightweight INDEX (jobs, leaderboard, per-job metric/category summaries)
 *    is bundled from evalIndex.json — small, always needed on mount.
 *  - The heavy PER-CASE results (596 cases × 12 metrics × judge explanations) are
 *    lazy-loaded from /eval/<jobName>.json only when a job is opened.
 *
 * Shapes match the live Bedrock job-results contract, so swapping the fetch from
 * /eval/*.json to a real GetEvaluationJob / S3 endpoint is a drop-in change.
 */

import indexRaw from './evalIndex.json';

// ─────────────────────────── Metric catalog ───────────────────────────

/**
 * The 12 LLM-as-Judge metrics present in these real Bedrock eval runs:
 * 9 quality (higher better) + 3 safety (lower better).
 * Note: Bedrock's current built-in catalog lists 11 (Correctness, Completeness,
 * Faithfulness, Helpfulness, Logical coherence, Relevance, Following instructions,
 * Professional style and tone, Harmfulness, Stereotyping, Refusal). "Readability"
 * appears in this dataset's runs but is not in the current Builtin list — treat
 * it as a custom metric. Ref: docs.aws.amazon.com/bedrock/latest/userguide/model-evaluation-metrics.html
 */
export const QUALITY_METRICS = [
  'Helpfulness',
  'Faithfulness',
  'Completeness',
  'Correctness',
  'ProfessionalStyleAndTone',
  'Coherence',
  'Relevance',
  'FollowingInstructions',
  'Readability',
] as const;

export const SAFETY_METRICS = ['Harmfulness', 'Stereotyping', 'Refusal'] as const;

export type QualityMetric = typeof QUALITY_METRICS[number];
export type SafetyMetric = typeof SAFETY_METRICS[number];
export type EvalMetric = QualityMetric | SafetyMetric;

/** Metrics where a LOWER score is better (safety/negative metrics). */
export const NEGATIVE_METRICS: EvalMetric[] = ['Harmfulness', 'Stereotyping', 'Refusal'];

/** Per-metric display color (light-theme tuned). */
export const METRIC_COLOR: Record<EvalMetric, string> = {
  Helpfulness: '#3b82f6',
  Faithfulness: '#10b981',
  Completeness: '#d97706',
  Correctness: '#2563eb',
  ProfessionalStyleAndTone: '#8b5cf6',
  Coherence: '#059669',
  Relevance: '#f59e0b',
  FollowingInstructions: '#7c3aed',
  Readability: '#ea580c',
  Harmfulness: '#dc2626',
  Stereotyping: '#b91c1c',
  Refusal: '#64748b',
};

/** Short labels for cramped chart axes / table headers. */
export const METRIC_SHORT: Record<EvalMetric, string> = {
  Helpfulness: 'Helpfulness',
  Faithfulness: 'Faithfulness',
  Completeness: 'Completeness',
  Correctness: 'Correctness',
  ProfessionalStyleAndTone: 'Style & Tone',
  Coherence: 'Logical Coherence',
  Relevance: 'Relevance',
  FollowingInstructions: 'Follow Instructions',
  Readability: 'Readability',
  Harmfulness: 'Harmfulness',
  Stereotyping: 'Stereotyping',
  Refusal: 'Refusal',
};

export function isNegativeMetric(m: string): boolean {
  return NEGATIVE_METRICS.includes(m as EvalMetric);
}

// ─────────────────────────── Types ───────────────────────────

export type EvalJobStatus = 'Completed' | 'InProgress' | 'Failed';

/** Aggregate score for one metric across all cases in a job. */
export interface MetricSummary {
  percent: number;   // 0–100 headline number
  average: number;   // 0–1 mean (for progress bars)
  count: number;     // cases scored
  perfect: number;   // perfect cases (1.0 quality / 0.0 safety)
}

/** Per-metric judge verdict on a single test case (real Bedrock 0–1 score). */
export interface CaseMetricScore {
  /** Continuous 0–1 judge score (1 best for quality, 0 best for safety). */
  score: number;
  /** The judge model's written rationale for this score. */
  explanation: string;
}

/** One evaluated test case with the full prompt/response and per-metric judge scores. */
export interface EvalCase {
  prompt: string;
  reference: string;
  response: string;
  category: string;
  scores: Partial<Record<EvalMetric, CaseMetricScore>>;
}

export interface CategorySummary {
  avg_score: number; // 0–100
  count: number;
}

/** A completed (or in-flight) evaluation job against one model. */
export interface EvalJob {
  jobName: string;
  modelId: string;
  model: string;
  evaluator: string;
  status: EvalJobStatus;
  created: string;
  metricCount: number;
  totalCases: number;
  datasetId: string;
  triggeredBy: string;
}

/** Full results payload for one job (matches live job-results contract). */
export interface EvalJobResults {
  jobName: string;
  modelId: string;
  model: string;
  evaluator: string;
  overallScore: number;
  totalCases: number;
  casesReturned: number;
  metrics: Record<EvalMetric, MetricSummary>;
  categories: Record<string, CategorySummary>;
  cases: EvalCase[];
}

/** Bundled per-job summary (metrics + categories, no cases). */
export interface EvalJobSummary {
  metrics: Record<EvalMetric, MetricSummary>;
  categories: Record<string, CategorySummary>;
  overallScore: number;
  totalCases: number;
}

export interface LeaderboardEntry {
  modelId: string;
  modelName: string;
  overall: number;
  metrics: Partial<Record<EvalMetric, number>>;
}

interface EvalIndex {
  jobs: EvalJob[];
  leaderboard: LeaderboardEntry[];
  summaries: Record<string, EvalJobSummary>;
}

// ─────────────────────────── Bundled index (real data) ───────────────────────────

const INDEX = indexRaw as unknown as EvalIndex;

/** All evaluation jobs (real completed FSI-core runs) + illustrative in-flight/failed. */
export const EVAL_JOBS: EvalJob[] = [
  ...INDEX.jobs,
  {
    jobName: 'eval-sonnet-4-5-safety',
    modelId: 'sonnet-4-5',
    model: 'anthropic.claude-sonnet-4-5-v1:0',
    evaluator: 'amazon.nova-pro-v1:0',
    status: 'InProgress',
    created: '2026-05-27 14:30',
    metricCount: 3,
    totalCases: 180,
    datasetId: 'safety-adversarial-180',
    triggeredBy: 'Manual',
  },
  {
    jobName: 'eval-nova-lite-rag',
    modelId: 'nova-lite',
    model: 'amazon.nova-lite-v1:0',
    evaluator: 'amazon.nova-pro-v1:0',
    status: 'Failed',
    created: '2026-05-23 09:00',
    metricCount: 0,
    totalCases: 240,
    datasetId: 'rag-grounding-240',
    triggeredBy: 'CI Pipeline',
  },
];

export const EVAL_LEADERBOARD: LeaderboardEntry[] = INDEX.leaderboard;

/** Bundled metric/category summaries per job (cases lazy-loaded separately). */
export const EVAL_SUMMARIES: Record<string, EvalJobSummary> = INDEX.summaries;

// ─────────────────────────── Datasets ───────────────────────────

export interface EvalDataset {
  id: string;
  name: string;
  cases: number;
  categories: string[];
  description: string;
  version: string;
}

export const EVAL_DATASETS: EvalDataset[] = [
  {
    id: 'fsi-core-595',
    name: 'FSI Core Evaluation Set',
    cases: 596,
    categories: ['Mortgage Lending', 'Fraud Detection', 'KYC Verification', 'Insurance', 'Capital Markets', 'Regulatory Compliance'],
    description: 'Real 596-case financial-services evaluation dataset spanning 36 categories — lending, fraud/AML, KYC/KYB, insurance, capital markets, wealth, payments, and regulatory Q&A. Scored by Bedrock LLM-as-Judge (Nova Pro) across 12 Builtin metrics.',
    version: 'v1.0',
  },
  {
    id: 'safety-adversarial-180',
    name: 'Safety & Adversarial Suite',
    cases: 180,
    categories: ['Harmful Content', 'Bias & Stereotyping', 'PII Leakage', 'Prompt Injection', 'Refusal Compliance'],
    description: 'Red-team and safety probes mapped to guardrail categories.',
    version: 'v2.1',
  },
  {
    id: 'rag-grounding-240',
    name: 'RAG Grounding Set',
    cases: 240,
    categories: ['Faithfulness', 'Context Precision', 'Hallucination'],
    description: 'Retrieval-grounded prompts with source documents to measure faithfulness and hallucination.',
    version: 'v1.4',
  },
];

// ─────────────────────────── Lazy per-job results loader ───────────────────────────

const resultsCache: Record<string, EvalJobResults> = {};

/**
 * Load the full per-case results for a job from /eval/<jobName>.json.
 * Cached after first fetch.
 *
 * Throws on a fetch/parse failure (network error or non-OK response) so the
 * caller can distinguish a genuine ERROR from a benign "no data" case. A 404
 * (job file simply absent) is treated as no-data and resolves to null; any
 * other non-OK status or a thrown fetch/parse error propagates as an Error.
 */
export async function loadJobResults(jobName: string): Promise<EvalJobResults | null> {
  if (resultsCache[jobName]) return resultsCache[jobName];
  const base = import.meta.env.BASE_URL ?? '/';
  const resp = await fetch(`${base}eval/${jobName}.json`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Failed to load eval results for ${jobName} (HTTP ${resp.status})`);
  const data = (await resp.json()) as EvalJobResults;
  resultsCache[jobName] = data;
  return data;
}
