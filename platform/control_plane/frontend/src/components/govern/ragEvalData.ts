/**
 * ragEvalData — RAG (Retrieval-Augmented Generation) evaluation data model.
 *
 * Ported from the AI Trust Tool's RAG-eval capability: 6-metric LLM-as-Judge
 * model (faithfulness, answer relevance, context precision/recall, hallucination,
 * groundedness) with weighted overall score, per-query drill-down, and retrieved
 * context display.
 *
 * Metric definitions, weights, and the overall-score formula match the source
 * (RagAnalysis.js RAG_METRICS) verbatim. Shapes match the live /api/eval/rag
 * response contract, so wiring to a real Bedrock Knowledge Base eval later is a
 * drop-in swap.
 */

// ─────────────────────────── Metric catalog ───────────────────────────

export interface RagMetricDef {
  id: RagMetricId;
  name: string;
  desc: string;
  weight: number;          // contribution to overall (sums to 100)
  color: string;
  /** Lower is better (hallucination). */
  negative?: boolean;
  /** Threshold for a "good" score (passing band). */
  good: number;
}

export type RagMetricId =
  | 'faithfulness'
  | 'relevance'
  | 'context_precision'
  | 'context_recall'
  | 'hallucination'
  | 'groundedness';

// Display names match Bedrock's Knowledge Base / RAG evaluation console terms.
// Bedrock generation metric "Faithfulness" captures grounding/hallucination;
// retrieval metrics are "Context relevance" and "Context coverage" (NOT the
// RAGAS "precision/recall" terms). Ids are internal keys kept stable.
// Ref: docs.aws.amazon.com/bedrock/latest/userguide/evaluation-kb.html
export const RAG_METRICS: RagMetricDef[] = [
  { id: 'faithfulness', name: 'Faithfulness', desc: 'Does the response contain only information found in / inferable from the retrieved context? (Bedrock grounding metric.)', weight: 25, color: '#059669', good: 0.90 },
  { id: 'relevance', name: 'Response Relevance', desc: 'Is the answer relevant to the question asked?', weight: 20, color: '#2563eb', good: 0.90 },
  { id: 'context_precision', name: 'Context Relevance', desc: 'Are the retrieved chunks relevant to the user prompt?', weight: 20, color: '#8b5cf6', good: 0.90 },
  { id: 'context_recall', name: 'Context Coverage', desc: 'Does the retrieved context cover the information in the ground-truth answer?', weight: 15, color: '#f59e0b', good: 0.85 },
  { id: 'hallucination', name: 'Hallucination', desc: 'Claims not supported by retrieved context (inverse of Faithfulness; shown as a governance signal).', weight: 15, color: '#dc2626', negative: true, good: 0.05 },
  { id: 'groundedness', name: 'Citation Coverage', desc: 'How well the response is supported by its cited passages.', weight: 5, color: '#10b981', good: 0.90 },
];

// ─────────────────────────── Types ───────────────────────────

export type RagScores = Record<RagMetricId, number>; // each 0–1

/** A retrieved chunk/source with its location and relevance. */
export interface RetrievedSource {
  content: string;
  location: string;     // e.g. s3 uri / doc id
  score: number;        // retrieval relevance 0–1
}

export interface RagCase {
  query: string;
  answer: string;
  scores: RagScores;
  sources: RetrievedSource[];
  latency: number;      // seconds
  category: string;
}

/** A RAG evaluation run against a knowledge base. */
export interface RagEvalRun {
  id: string;
  modelId: string;
  modelName: string;
  knowledgeBase: string;
  status: 'Completed' | 'InProgress' | 'Failed';
  created: string;
  totalQueries: number;
  overallScore: number;        // 0–100
  passing: boolean;
  aggregates: RagScores;       // mean per metric, 0–1
  cases: RagCase[];
}

// ─────────────────────────── Helpers ───────────────────────────

/** Weighted overall score (0–100). Hallucination is inverted. */
export function ragOverall(agg: RagScores): number {
  const total = RAG_METRICS.reduce((s, m) => {
    const v = m.negative ? 1 - agg[m.id] : agg[m.id];
    return s + v * m.weight;
  }, 0);
  return Math.round(total / RAG_METRICS.reduce((s, m) => s + m.weight, 0) * 100);
}

/** Passing rule from source: faithfulness ≥ 0.85 AND hallucination ≤ 0.10. */
export function ragPassing(agg: RagScores): boolean {
  return agg.faithfulness >= 0.85 && agg.hallucination <= 0.10;
}

function aggregate(cases: RagCase[]): RagScores {
  const acc = { faithfulness: 0, relevance: 0, context_precision: 0, context_recall: 0, hallucination: 0, groundedness: 0 } as RagScores;
  cases.forEach(c => RAG_METRICS.forEach(m => { acc[m.id] += c.scores[m.id]; }));
  RAG_METRICS.forEach(m => { acc[m.id] = +(acc[m.id] / cases.length).toFixed(3); });
  return acc;
}

// ─────────────────────────── Real source cases (ported verbatim) ───────────────────────────

const FSI_GOV_CASES: RagCase[] = [
  {
    query: 'What are the capital requirements for AI model risk under SR 26-2?',
    answer: 'Under SR 26-2, institutions must maintain capital reserves proportionate to model risk. The guidance requires risk-weighted assessment of AI/ML models with quarterly revalidation for high-risk tiers.',
    scores: { faithfulness: 0.95, relevance: 0.98, context_precision: 0.92, context_recall: 0.88, hallucination: 0.02, groundedness: 0.94 },
    sources: [
      { content: 'SR 26-2 Section III requires institutions to maintain capital reserves proportionate to model risk, with risk-weighted assessment of AI/ML systems.', location: 's3://kb-governance/sr-26-2/section-iii.pdf', score: 0.94 },
      { content: 'High-risk model tiers require quarterly revalidation and independent effective challenge.', location: 's3://kb-governance/sr-26-2/revalidation.pdf', score: 0.88 },
      { content: 'Capital adequacy for model risk is addressed under the institution\'s overall risk appetite framework.', location: 's3://kb-governance/risk-appetite.pdf', score: 0.71 },
    ],
    latency: 2.3,
    category: 'Model Risk',
  },
  {
    query: 'How does ECOA apply to AI-driven lending decisions?',
    answer: 'ECOA requires that AI-driven lending decisions provide specific, actionable reasons for adverse actions. The top factors from explainability models (LIME/SHAP) must be translated into consumer-friendly language per §1002.9.',
    scores: { faithfulness: 0.92, relevance: 0.96, context_precision: 0.90, context_recall: 0.85, hallucination: 0.05, groundedness: 0.91 },
    sources: [
      { content: 'ECOA §1002.9 requires creditors to provide specific reasons for adverse actions. When AI models are used, the principal reasons must be disclosed.', location: 's3://kb-governance/ecoa/1002-9.pdf', score: 0.93 },
      { content: 'Explainability outputs (LIME/SHAP feature attributions) should be mapped to consumer-friendly adverse-action reason codes.', location: 's3://kb-governance/fair-lending/adverse-action.pdf', score: 0.86 },
    ],
    latency: 2.8,
    category: 'Fair Lending',
  },
  {
    query: 'What guardrails should be configured for PHI data in insurance claims?',
    answer: 'For insurance claims with PHI, configure Bedrock Guardrails with: PII/sensitive-information filters (configured for the relevant PHI entity types), content filter (HIGH for medical topics), denied topics (diagnosis speculation), and contextual grounding check. All 18 HIPAA Safe Harbor identifiers should be blocked or redacted before model input.',
    scores: { faithfulness: 0.88, relevance: 0.94, context_precision: 0.86, context_recall: 0.82, hallucination: 0.08, groundedness: 0.87 },
    sources: [
      { content: 'HIPAA Safe Harbor §164.514(b)(2) defines 18 identifier types that must be removed for de-identification.', location: 's3://kb-governance/hipaa/safe-harbor.pdf', score: 0.91 },
      { content: 'Bedrock Guardrails PII filter supports configurable entity types with block or redact actions.', location: 's3://kb-governance/bedrock/guardrails-pii.pdf', score: 0.84 },
      { content: 'Contextual grounding checks reduce hallucination by verifying responses against source material.', location: 's3://kb-governance/bedrock/grounding.pdf', score: 0.79 },
    ],
    latency: 3.1,
    category: 'Insurance',
  },
  {
    query: 'What is the revalidation cadence for Critical-tier AI models?',
    answer: 'Critical-tier AI models require quarterly revalidation per the platform\'s risk tiering framework. This includes re-running the full evaluation suite (596 test cases, 12 metrics), updating the evidence package, and obtaining MRM committee sign-off.',
    scores: { faithfulness: 0.97, relevance: 0.99, context_precision: 0.95, context_recall: 0.93, hallucination: 0.01, groundedness: 0.96 },
    sources: [
      { content: 'Risk tiering determines revalidation frequency: Critical = quarterly, High = semi-annual, Medium = annual.', location: 's3://kb-governance/mrm/risk-tiering.pdf', score: 0.96 },
      { content: 'Revalidation requires re-running the full eval suite and MRM committee sign-off before continued production use.', location: 's3://kb-governance/mrm/revalidation-process.pdf', score: 0.90 },
    ],
    latency: 1.9,
    category: 'Model Risk',
  },
  {
    query: 'How does Cedar authorization work for AI agents?',
    answer: 'Cedar enforces deny-by-default authorization for all AI agents. Every action (tool call, data access, external API) requires an explicit permit policy. The kill switch is implemented as a forbid-all policy that overrides all permits, immediately stopping all agent sessions.',
    scores: { faithfulness: 0.94, relevance: 0.97, context_precision: 0.91, context_recall: 0.89, hallucination: 0.03, groundedness: 0.93 },
    sources: [
      { content: 'Cedar is a policy language that enforces deny-by-default authorization. Each agent action requires an explicit permit.', location: 's3://kb-governance/cedar/overview.pdf', score: 0.92 },
      { content: 'Forbid policies override permits; a forbid-all policy implements an emergency kill switch.', location: 's3://kb-governance/cedar/kill-switch.pdf', score: 0.87 },
    ],
    latency: 2.1,
    category: 'Agentic Security',
  },
  {
    query: 'What are the ISO 42001 Annex A requirements for AI data governance?',
    answer: 'ISO 42001 Annex A.7 requires organizations to establish data governance for AI including: data quality metrics, provenance tracking, bias assessment in training data, consent management, and data lifecycle policies. The platform maps 15 capabilities across A.7.1 through A.7.5 with 88% coverage.',
    scores: { faithfulness: 0.91, relevance: 0.95, context_precision: 0.88, context_recall: 0.84, hallucination: 0.06, groundedness: 0.90 },
    sources: [
      { content: 'ISO 42001 Annex A.7 covers data for AI systems including quality, provenance, and bias assessment.', location: 's3://kb-governance/iso-42001/annex-a7.pdf', score: 0.90 },
      { content: 'Data lifecycle and consent management are required controls under A.7.4 and A.7.5.', location: 's3://kb-governance/iso-42001/data-lifecycle.pdf', score: 0.83 },
    ],
    latency: 2.6,
    category: 'Data Governance',
  },
];

// A weaker model's run — same queries, degraded scores (more hallucination, lower recall).
function degrade(cases: RagCase[], factor: number): RagCase[] {
  return cases.map((c, i) => {
    const seed = ((i + 1) * 9301 + 49297) % 233280 / 233280;
    const s = c.scores;
    return {
      ...c,
      scores: {
        faithfulness: +Math.max(0.6, s.faithfulness - factor - seed * 0.05).toFixed(2),
        relevance: +Math.max(0.6, s.relevance - factor * 0.6).toFixed(2),
        context_precision: +Math.max(0.55, s.context_precision - factor).toFixed(2),
        context_recall: +Math.max(0.5, s.context_recall - factor - seed * 0.05).toFixed(2),
        hallucination: +Math.min(0.35, s.hallucination + factor + seed * 0.04).toFixed(2),
        groundedness: +Math.max(0.55, s.groundedness - factor).toFixed(2),
      },
      latency: +(c.latency + factor * 4).toFixed(1),
    };
  });
}

// ─────────────────────────── Runs (keyed to the fleet) ───────────────────────────

function makeRun(id: string, modelId: string, modelName: string, kb: string, created: string, cases: RagCase[]): RagEvalRun {
  const aggregates = aggregate(cases);
  return {
    id,
    modelId,
    modelName,
    knowledgeBase: kb,
    status: 'Completed',
    created,
    totalQueries: cases.length,
    overallScore: ragOverall(aggregates),
    passing: ragPassing(aggregates),
    aggregates,
    cases,
  };
}

export const RAG_RUNS: RagEvalRun[] = [
  makeRun('rag-sonnet-4-5', 'sonnet-4-5', 'Claude Sonnet 4.5', 'kb-governance (FSI Regs)', '2026-05-26 10:00', FSI_GOV_CASES),
  makeRun('rag-opus-4-7', 'opus-4-7', 'Claude Opus 4.7', 'kb-governance (FSI Regs)', '2026-05-26 10:00', degrade(FSI_GOV_CASES, -0.01)),
  makeRun('rag-haiku-4-5', 'haiku-4-5', 'Claude Haiku 4.5', 'kb-governance (FSI Regs)', '2026-05-25 10:00', degrade(FSI_GOV_CASES, 0.06)),
  makeRun('rag-nova-pro', 'nova-pro', 'Nova Pro', 'kb-governance (FSI Regs)', '2026-05-24 10:00', degrade(FSI_GOV_CASES, 0.10)),
  makeRun('rag-nova-lite', 'nova-lite', 'Nova Lite', 'kb-governance (FSI Regs)', '2026-05-24 10:00', degrade(FSI_GOV_CASES, 0.14)),
];

export const RAG_KNOWLEDGE_BASES = [
  { id: 'kb-governance', name: 'kb-governance (FSI Regs)', docs: 1240, lastSynced: '2026-05-26' },
  { id: 'kb-products', name: 'kb-products (Banking Catalog)', docs: 680, lastSynced: '2026-05-24' },
];
