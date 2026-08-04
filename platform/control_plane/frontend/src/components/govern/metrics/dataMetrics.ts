/**
 * dataMetrics — Govern Data Governance's contribution to the shared metric
 * contract. PROPOSED (see metricContract.ts).
 *
 * Data Governance OWNS these; Plan/Command Center READ them. Mirrors the DATA
 * rows of the workbook's "Data & AI Quality" sheet (accuracy, completeness,
 * freshness, consistency, lineage coverage, catalog coverage, PII protection,
 * governance compliance). MODEL-governance rows (model accuracy, drift, bias,
 * versioning) are intentionally EXCLUDED — those belong to Model Management, so
 * each metric lands with its true owner and there's no double-counting.
 */
import {
  type ComputedMetric,
  type MetricContribution,
  type MetricTier,
  computeVariance,
  ragForVariance,
} from './metricContract';

interface DataQualityDef {
  id: string;
  label: string;
  category: string;
  expected: number;   // target (0..1)
  actual: number;     // measured (0..1)
  tier: MetricTier;
  owner: string;
  source: string;
}

/**
 * Data-quality metric definitions. Values mirror the workbook's Data & AI
 * Quality sheet DATA rows so the numbers are recognizable across modules.
 * (Data Governance would populate `actual` from live profiling in a real
 * integration; these are the current illustrative values.)
 */
const DATA_QUALITY_DEFS: DataQualityDef[] = [
  { id: 'data.accuracy',        label: 'Data Accuracy Score',      category: 'Data Quality',      expected: 0.95,  actual: 0.92, tier: 'management', owner: 'Data Quality Lead',      source: 'Automated data profiling' },
  { id: 'data.completeness',    label: 'Data Completeness',        category: 'Data Quality',      expected: 0.98,  actual: 0.95, tier: 'management', owner: 'Data Quality Lead',      source: 'Null/missing value analysis' },
  { id: 'data.freshness',       label: 'Data Freshness (SLA)',     category: 'Data Quality',      expected: 0.99,  actual: 0.88, tier: 'management', owner: 'Data Eng Lead',          source: 'Pipeline latency monitoring' },
  { id: 'data.consistency',     label: 'Data Consistency Score',   category: 'Data Quality',      expected: 0.95,  actual: 0.85, tier: 'diagnostic', owner: 'Data Quality Lead',      source: 'Cross-source reconciliation' },
  { id: 'data.pipeline',        label: 'Data Pipeline Reliability', category: 'Data Architecture', expected: 0.995, actual: 0.80, tier: 'management', owner: 'Data Eng Lead',          source: 'Pipeline success rate' },
  { id: 'data.schema-drift',    label: 'Schema Drift Detection',   category: 'Data Architecture', expected: 1.0,   actual: 0.90, tier: 'diagnostic', owner: 'Data Eng Lead',          source: 'Automated schema monitoring' },
  { id: 'data.catalog',         label: 'Data Catalog Coverage',    category: 'Data Architecture', expected: 0.90,  actual: 0.75, tier: 'diagnostic', owner: 'Data Governance Lead',    source: 'Cataloged assets / total' },
  { id: 'data.governance',      label: 'Data Governance Compliance', category: 'Data Governance', expected: 0.95,  actual: 0.85, tier: 'management', owner: 'DPO',                     source: 'Policy adherence audit' },
  { id: 'data.lineage',         label: 'Data Lineage Coverage',    category: 'Data Governance',   expected: 0.90,  actual: 0.70, tier: 'diagnostic', owner: 'Data Governance Lead',    source: 'Traced datasets / total' },
  // PII protection is a diagnostic-tier data parameter in the workbook (not one of
  // the 12 board KPIs); the Data Quality Health composite is the board-tier roll-up.
  { id: 'data.pii',             label: 'PII Data Protection Score', category: 'Data Governance',  expected: 0.99,  actual: 0.82, tier: 'diagnostic', owner: 'DPO',                     source: 'Encryption & masking compliance' },
];

export interface DataQualityRow extends ComputedMetric {
  category: string;
}

export function dataQualityRows(): DataQualityRow[] {
  return DATA_QUALITY_DEFS.map(d => {
    const { variance, variancePct } = computeVariance(d.expected, d.actual);
    return {
      id: d.id,
      label: d.label,
      tier: d.tier,
      owningModule: 'data',
      cadence: 'weekly',
      polarity: 'higher-is-better',
      unit: '%',
      expected: d.expected,
      actual: d.actual,
      target: d.expected,
      owner: d.owner,
      source: `Govern · Data Governance — ${d.source}`,
      variance,
      variancePct,
      rag: ragForVariance(variancePct, 'higher-is-better'),
      category: d.category,
    };
  });
}

/** Board-level composite: mean actual across the data-quality metrics. */
export function dataQualityComposite(rows: DataQualityRow[]): ComputedMetric {
  const actuals = rows.map(r => r.actual ?? 0);
  const composite = actuals.length
    ? Math.round((actuals.reduce((a, b) => a + b, 0) / actuals.length) * 1000) / 1000
    : 0;
  const target = 0.95;
  const { variance, variancePct } = computeVariance(target, composite);
  return {
    id: 'data.quality-composite',
    label: 'Data Quality Health',
    tier: 'board',
    owningModule: 'data',
    cadence: 'weekly',
    polarity: 'higher-is-better',
    unit: '%',
    expected: target,
    actual: composite,
    target,
    owner: 'Data Governance Lead',
    source: 'Govern · Data Governance (composite)',
    variance,
    variancePct,
    rag: ragForVariance(variancePct, 'higher-is-better'),
  };
}

export function dataContribution(generatedAt: string): MetricContribution {
  const rows = dataQualityRows();
  return {
    owningModule: 'data',
    generatedAt,
    metrics: [dataQualityComposite(rows), ...rows],
  };
}
