// Maturity Assessment → ReportDefinition adapter.
// Formatting is owned by the shared toolkit (src/lib/pdf); this only supplies data.
// Structure: summary + visualization first, explicit per-parameter answers last.

import type { MaturityAssessment, AssessmentStatus, MaturityWeights } from '../../api/client';
import { computeMaturity } from './scoring';
import { DIMENSIONS, MATURITY_LEVELS, CATALOG } from './types';
import type { ReportDefinition, ReportBlock, KpiItem, Tone } from '../../lib/pdf';

const STATUS_TONE: Record<AssessmentStatus, Tone> = {
  Draft: 'default',
  'In Progress': 'info',
  Complete: 'positive',
  Archived: 'default',
};

const DIM_SHORT: Record<string, string> = {
  people: 'People',
  process: 'Process',
  technology: 'Technology',
  data: 'Data',
  governance: 'Governance',
  strategy: 'Strategy',
};

function levelTone(level: number): Tone {
  if (level >= 4) return 'positive';
  if (level === 3) return 'info';
  if (level === 2) return 'warning';
  if (level === 1) return 'negative';
  return 'default';
}

export function buildMaturityReport(a: MaturityAssessment): ReportDefinition {
  const scores = a.scores ?? {};
  const computed = a.computed ?? computeMaturity(scores, a.weights);
  const level = computed.maturity_level;
  const levelName = MATURITY_LEVELS[level]?.name ?? 'Not yet assessed';
  const pct = Math.round(computed.completion * 100);

  const kpis: KpiItem[] = [
    { label: 'Composite', value: `${computed.composite.toFixed(2)} / 5`, tone: levelTone(level) },
    { label: 'Maturity Level', value: level ? `L${level}` : '—', tone: levelTone(level) },
    { label: 'Completion', value: `${pct}%` },
    { label: 'Parameters', value: `${computed.answered}/${computed.total}` },
  ];

  // Strongest / weakest answered dimensions for the narrative.
  const answeredDims = DIMENSIONS
    .map((d) => ({ label: d.label, r: computed.dimensions[d.key] }))
    .filter((x) => (x.r?.answered ?? 0) > 0);
  let extremes = '';
  if (answeredDims.length) {
    const strongest = answeredDims.reduce((a1, b) => ((b.r?.average ?? 0) > (a1.r?.average ?? 0) ? b : a1));
    const weakest = answeredDims.reduce((a1, b) => ((b.r?.average ?? 0) < (a1.r?.average ?? 0) ? b : a1));
    extremes =
      ` The strongest dimension is ${strongest.label} (${(strongest.r?.average ?? 0).toFixed(2)}), ` +
      `while ${weakest.label} (${(weakest.r?.average ?? 0).toFixed(2)}) has the most room to improve.`;
  }

  const summary =
    `This assessment scored ${computed.answered} of ${computed.total} parameters (${pct}% complete), ` +
    `producing a composite AI maturity of ${computed.composite.toFixed(2)} / 5 — ${levelName}.` +
    (MATURITY_LEVELS[level]?.tagline ? ` ${MATURITY_LEVELS[level].tagline}.` : '') +
    extremes;

  const dimRows = DIMENSIONS.map((d) => {
    const r = computed.dimensions[d.key];
    const weight = (a.weights as MaturityWeights)[d.key as keyof MaturityWeights] ?? 0;
    return [
      d.label,
      `${Math.round(weight * 100)}%`,
      `${r?.answered ?? 0}/${r?.total ?? 0}`,
      (r?.average ?? 0).toFixed(2),
      r?.maturity_level ? `L${r.maturity_level}` : '—',
      (r?.weighted_contribution ?? 0).toFixed(2),
    ];
  });
  dimRows.push([
    'Composite (weighted)',
    '100%',
    `${computed.answered}/${computed.total}`,
    computed.composite.toFixed(2),
    level ? `L${level}` : '—',
    computed.composite.toFixed(2),
  ]);

  const blocks: ReportBlock[] = [
    { kind: 'heading', text: 'Executive Summary' },
    { kind: 'kpis', items: kpis, columns: 4 },
    { kind: 'paragraph', text: summary },
    {
      kind: 'radar',
      title: 'Maturity Profile',
      max: 5,
      axes: DIMENSIONS.map((d) => ({
        label: DIM_SHORT[d.key] ?? d.label,
        value: computed.dimensions[d.key]?.average ?? 0,
      })),
    },

    { kind: 'heading', text: 'Dimension Breakdown' },
    {
      kind: 'table',
      caption: 'Scores 1 (Initial) – 5 (Optimizing), weighted per the assessment configuration.',
      emphasizeLastRow: true,
      columns: [
        { header: 'Dimension' },
        { header: 'Weight', align: 'right' },
        { header: 'Answered', align: 'right' },
        { header: 'Avg', align: 'right' },
        { header: 'Level', align: 'right' },
        { header: 'Weighted', align: 'right' },
      ],
      rows: dimRows,
    },
  ];

  // --- Detailed responses (explicit per-parameter answers), grouped by dimension.
  const detailTables: ReportBlock[] = [];
  for (const d of DIMENSIONS) {
    const dim = CATALOG[d.key];
    if (!dim) continue;
    const rows = dim.parameters
      .map((p) => ({ p, score: scores[p.id] }))
      .filter((x) => typeof x.score === 'number' && x.score >= 1 && x.score <= 5)
      .map((x) => [x.p.name, `L${x.score}`, x.p.anchors?.[`L${x.score}`] ?? '—']);
    if (!rows.length) continue;
    detailTables.push({
      kind: 'table',
      caption: `${d.label} — ${rows.length} scored`,
      columns: [
        { header: 'Parameter' },
        { header: 'Level', align: 'center' },
        { header: 'Selected Response' },
      ],
      rows,
    });
  }
  if (detailTables.length) {
    blocks.push(
      { kind: 'heading', text: 'Detailed Responses' },
      {
        kind: 'paragraph',
        muted: true,
        text: 'Every parameter you scored, with the maturity level selected and what that level means. Unscored parameters are omitted.',
      },
      ...detailTables,
    );
  }

  return {
    meta: {
      recordType: 'Maturity Assessment',
      title: a.name,
      subtitle: a.description || undefined,
      status: a.status,
      statusTone: STATUS_TONE[a.status],
      fields: [
        { label: 'Organization', value: a.organization || '—' },
        { label: 'Assessor', value: a.assessor || '—' },
        { label: 'Composite Score', value: `${computed.composite.toFixed(2)} / 5` },
        { label: 'Maturity Level', value: level ? `L${level} — ${levelName}` : '—' },
        { label: 'Completion', value: `${pct}%` },
        { label: 'Parameters Answered', value: `${computed.answered} / ${computed.total}` },
      ],
    },
    blocks,
  };
}
