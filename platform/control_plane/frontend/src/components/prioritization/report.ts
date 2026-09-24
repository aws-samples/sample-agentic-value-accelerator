// Use Case (Prioritization) → ReportDefinition adapter.
// Formatting is owned by the shared toolkit (src/lib/pdf); this only supplies data.
// Structure: summary + visualization first, explicit per-criterion answers last.

import type { UseCase, UseCaseStatus, GoNoGo } from '../../api/client';
import { computeLocal } from './scoring';
import { DIMENSIONS, SUB_CRITERIA } from './types';
import type { ReportDefinition, ReportBlock, KpiItem, Tone } from '../../lib/pdf';

const STATUS_TONE: Record<UseCaseStatus, Tone> = {
  Concept: 'default',
  Active: 'info',
  Pilot: 'info',
  Production: 'positive',
  Paused: 'warning',
  Archived: 'default',
};

const DIM_SHORT: Record<string, string> = {
  business_value: 'Business',
  technical_feasibility: 'Technical',
  risk_governance: 'Risk',
  org_readiness: 'Readiness',
  strategic_alignment: 'Strategic',
  cost_efficiency: 'Cost',
};

function verdictTone(v: GoNoGo): Tone {
  if (v === 'GO') return 'positive';
  if (v === 'NO GO') return 'negative';
  return 'warning';
}

function riskTone(risk: number): Tone {
  if (risk <= 15) return 'positive';
  if (risk <= 20) return 'warning';
  return 'negative';
}

function readinessTone(r: number): Tone {
  if (r >= 3) return 'positive';
  if (r >= 2) return 'warning';
  return 'negative';
}

export function buildUseCaseReport(uc: UseCase): ReportDefinition {
  const computed = uc.computed ?? computeLocal(uc.scores, uc.weights);
  const subtotals = computed.dimension_subtotals as unknown as Record<string, number>;
  const weights = uc.weights as unknown as Record<string, number>;
  const scores = uc.scores as unknown as Record<string, Record<string, number>>;

  const kpis: KpiItem[] = [
    { label: 'Composite', value: `${computed.composite.toFixed(2)} / 5`, tone: verdictTone(computed.go_no_go) },
    { label: 'Verdict', value: computed.go_no_go, tone: verdictTone(computed.go_no_go) },
    { label: 'Risk Score', value: `${computed.risk_score} / 25`, tone: riskTone(computed.risk_score) },
    { label: 'Readiness', value: `${computed.readiness_score.toFixed(2)} / 5`, tone: readinessTone(computed.readiness_score) },
  ];

  // Strongest / weakest dimension by subtotal.
  const ranked = DIMENSIONS
    .map((d) => ({ name: d.name, value: subtotals[d.key] ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];

  const summary =
    `This use case scores a composite priority of ${computed.composite.toFixed(2)} / 5 against the AWS Enterprise ` +
    `AI Scoring Model, with a risk score of ${computed.risk_score} / 25 and organizational readiness of ` +
    `${computed.readiness_score.toFixed(2)} / 5. Its strongest dimension is ${strongest.name} ` +
    `(${strongest.value.toFixed(2)}) and its weakest is ${weakest.name} (${weakest.value.toFixed(2)}). ` +
    `Recommended gate decision: ${computed.go_no_go}.`;

  const dimRows = DIMENSIONS.map((d) => {
    const weight = weights[d.key] ?? 0;
    const subtotal = subtotals[d.key] ?? 0;
    return [
      d.name,
      `${Math.round(weight * 100)}%`,
      subtotal.toFixed(2),
      (subtotal * weight).toFixed(2),
    ];
  });
  dimRows.push([
    'Composite (weighted)',
    '100%',
    computed.composite.toFixed(2),
    computed.composite.toFixed(2),
  ]);

  const blocks: ReportBlock[] = [
    { kind: 'heading', text: 'Executive Summary' },
    { kind: 'kpis', items: kpis, columns: 4 },
    { kind: 'paragraph', text: summary },
    {
      kind: 'radar',
      title: 'Priority Profile',
      max: 5,
      axes: DIMENSIONS.map((d) => ({
        label: DIM_SHORT[d.key] ?? d.name,
        value: subtotals[d.key] ?? 0,
      })),
    },

    { kind: 'heading', text: 'Dimension Scores' },
    {
      kind: 'table',
      caption: 'Six weighted dimensions scored 1–5; weighted contribution rolls up to the composite.',
      emphasizeLastRow: true,
      columns: [
        { header: 'Dimension' },
        { header: 'Weight', align: 'right' },
        { header: 'Subtotal', align: 'right' },
        { header: 'Weighted', align: 'right' },
      ],
      rows: dimRows,
    },
  ];

  // --- Detailed responses (explicit per-criterion answers), grouped by dimension.
  const detailTables: ReportBlock[] = [];
  for (const d of DIMENSIONS) {
    const rows = SUB_CRITERIA[d.key].map((s) => [
      s.label,
      `${Math.round(s.weight * 100)}%`,
      String(scores[d.key]?.[s.key] ?? 0),
      s.help,
    ]);
    if (!rows.length) continue;
    detailTables.push({
      kind: 'table',
      caption: d.name,
      columns: [
        { header: 'Sub-Criterion' },
        { header: 'Weight', align: 'right' },
        { header: 'Score', align: 'center' },
        { header: 'Guidance' },
      ],
      rows,
    });
  }
  if (detailTables.length) {
    blocks.push(
      { kind: 'heading', text: 'Sub-Criteria Detail' },
      {
        kind: 'paragraph',
        muted: true,
        text: 'Every sub-criterion with the score you selected (1 low – 5 high) and the scoring guidance.',
      },
      ...detailTables,
    );
  }

  return {
    meta: {
      recordType: 'Use Case',
      title: uc.name,
      subtitle: uc.description || undefined,
      status: uc.status,
      statusTone: STATUS_TONE[uc.status],
      fields: [
        { label: 'Business Domain', value: uc.business_domain || '—' },
        { label: 'AI Type', value: uc.ai_type },
        { label: 'Complexity', value: uc.complexity },
        { label: 'Business Owner', value: uc.business_owner || '—' },
        { label: 'Technical Owner', value: uc.technical_owner || '—' },
        { label: 'Target Go-Live', value: uc.target_go_live || '—' },
      ],
    },
    blocks,
  };
}
