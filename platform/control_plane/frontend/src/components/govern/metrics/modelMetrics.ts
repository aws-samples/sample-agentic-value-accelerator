/**
 * modelMetrics — Govern Model Management's contribution to the shared metric
 * contract. PROPOSED (see metricContract.ts).
 *
 * Model Management OWNS the model-governance metrics — the "model rows" of the
 * workbook's Data & AI Quality sheet (Model Accuracy, Drift Detection Rate,
 * Bias Detection, Versioning Compliance). These are deliberately kept out of
 * Data Governance (which owns data-quality) so each lands with its true owner.
 *
 * Includes hallucination/grounding metrics:
 * - model.grounding: Pass rate from Bedrock Guardrails ContextualGroundingPolicy
 * - model.hallucination: Failure rate (lower-is-better, inverted polarity)
 * - model.rag-faithfulness: From RAG evaluation pipeline
 *
 * Where possible values derive from the model registry (MODELS.evalScore /
 * status) or Bedrock Guardrails telemetry; the aggregate targets match the
 * workbook's Model Data Gov rows.
 */
import { MODELS } from '../mockData';
import {
  type ComputedMetric,
  type MetricContribution,
  computeVariance,
  ragForVariance,
} from './metricContract';

interface ModelMetricDef {
  id: string;
  label: string;
  expected: number;  // target (0-1)
  actual: number;    // measured (0-1)
  tier: ComputedMetric['tier'];
  owner: string;
  source: string;
}

// Production model accuracy derived from the registry's eval scores (avg of
// Production models, normalized 0-1). Other rows use the workbook's Model Data
// Gov values (a live integration would read SageMaker Model Monitor etc.).
const prodModels = MODELS.filter(m => m.status === 'Production');
const avgEval = prodModels.length
  ? prodModels.reduce((s, m) => s + m.evalScore, 0) / prodModels.length / 100
  : 0;

const MODEL_METRIC_DEFS: ModelMetricDef[] = [
  { id: 'model.accuracy',         label: 'Model Accuracy (production avg)',   expected: 0.90, actual: Math.round(avgEval * 100) / 100, tier: 'board',      owner: 'ML Lead',        source: 'Model evaluation pipeline (registry eval scores)' },
  { id: 'model.grounding',        label: 'Grounding Score (hallucination)',   expected: 0.95, actual: 0.97, tier: 'board',      owner: 'ML Lead',        source: 'Bedrock Guardrails ContextualGroundingPolicy' },
  { id: 'model.drift',            label: 'Model Drift Detection Rate',        expected: 1.0,  actual: 1.0,  tier: 'management', owner: 'ML Lead',        source: 'SageMaker Model Monitor' },
  { id: 'model.hallucination',    label: 'Hallucination Rate',                expected: 0.02, actual: 0.023, tier: 'management', owner: 'ML Lead',        source: 'Bedrock Guardrails grounding failures / total invocations' },
  { id: 'model.rag-faithfulness', label: 'RAG Faithfulness',                  expected: 0.85, actual: 0.91, tier: 'management', owner: 'ML Lead',        source: 'RAG evaluation pipeline (LLM-as-judge)' },
  { id: 'model.bias',             label: 'Model Bias Detection',              expected: 0.95, actual: 0.95, tier: 'management', owner: 'AI Ethics Lead', source: 'Fairness metrics monitoring' },
  { id: 'model.versioning',       label: 'Model Versioning Compliance',       expected: 1.0,  actual: 1.0,  tier: 'diagnostic', owner: 'ML Lead',        source: 'Model registry audit' },
];

export interface ModelMetricRow extends ComputedMetric {}

export function modelMetricRows(): ModelMetricRow[] {
  return MODEL_METRIC_DEFS.map(d => {
    // Hallucination rate is lower-is-better (we want fewer hallucinations)
    const polarity: ComputedMetric['polarity'] = d.id === 'model.hallucination' ? 'lower-is-better' : 'higher-is-better';
    const { variance, variancePct } = computeVariance(d.expected, d.actual);
    return {
      id: d.id,
      label: d.label,
      tier: d.tier,
      owningModule: 'model',
      cadence: d.id === 'model.bias' || d.id === 'model.versioning' ? 'monthly' : 'weekly',
      polarity,
      unit: '%',
      expected: d.expected,
      actual: d.actual,
      target: d.expected,
      owner: d.owner,
      source: `Govern · Model Management — ${d.source}`,
      variance,
      variancePct,
      rag: ragForVariance(variancePct, polarity),
    };
  });
}

/** Board-level headline: production model accuracy. */
export function modelAccuracyHeadline(rows: ModelMetricRow[]): ComputedMetric {
  return rows.find(r => r.id === 'model.accuracy') ?? rows[0];
}

export function modelContribution(generatedAt: string): MetricContribution {
  return {
    owningModule: 'model',
    generatedAt,
    metrics: modelMetricRows(),
  };
}
