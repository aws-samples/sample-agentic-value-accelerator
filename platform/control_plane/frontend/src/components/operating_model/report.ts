// Operating Model → ReportDefinition adapter.
// Formatting is owned by the shared toolkit (src/lib/pdf); this only supplies data.
// Structure: summary + visualization first, explicit per-question answers last.

import { compute } from './scoring';
import { DIMENSIONS, CAPABILITIES, LEVEL_NAMES, QUESTION_CATALOG } from './types';
import type { OperatingModel, OperatingModelStatus, OperatingModelWeights } from './types';
import type { ReportDefinition, ReportBlock, KpiItem, Tone } from '../../lib/pdf';

const STATUS_TONE: Record<OperatingModelStatus, Tone> = {
  Draft: 'default',
  'In Progress': 'info',
  Complete: 'positive',
  Archived: 'default',
};

const DIM_SHORT: Record<string, string> = {
  strategy: 'Strategy',
  governance: 'Governance',
  organization: 'Org',
  people: 'People',
  technology: 'Technology',
  process: 'Process',
  ecosystem: 'Ecosystem',
};

function levelTone(level: number): Tone {
  if (level >= 4) return 'positive';
  if (level === 3) return 'info';
  if (level === 2) return 'warning';
  if (level === 1) return 'negative';
  return 'default';
}

const PLACEMENTS = ['Centralized', 'Hub-and-Spoke', 'Federated'] as const;

export function buildOperatingModelReport(m: OperatingModel): ReportDefinition {
  const scores = m.scores ?? {};
  const computed = m.computed ?? compute(scores, m.weights, m.roadmap, m.investment);
  const level = computed.maturity_level;
  const levelName = LEVEL_NAMES[level]?.name ?? 'Not yet assessed';
  const pct = Math.round(computed.completion * 100);

  const kpis: KpiItem[] = [
    { label: 'Composite', value: `${computed.composite.toFixed(2)} / 5`, tone: levelTone(level) },
    { label: 'Maturity Level', value: level ? `L${level}` : '—', tone: levelTone(level) },
    { label: 'Completion', value: `${pct}%` },
    { label: 'Investment', value: `$${computed.total_investment_m.toFixed(1)}M` },
  ];

  const summary =
    `This operating model scores a composite maturity of ${computed.composite.toFixed(2)} / 5 (${levelName}) ` +
    `with ${pct}% of the 21 diagnostic questions answered. Based on the assessment, the recommended design is ` +
    `${computed.recommended_pattern} with ${computed.recommended_governance} governance; the selected design is ` +
    `${m.pattern} / ${m.governance}. Planned investment across enabled roadmap phases totals ` +
    `$${computed.total_investment_m.toFixed(1)}M.`;

  const dimRows = DIMENSIONS.map((d) => {
    const r = computed.dimensions[d.key];
    const weight = (m.weights as OperatingModelWeights)[d.key as keyof OperatingModelWeights] ?? 0;
    return [
      d.label,
      `${Math.round(weight * 100)}%`,
      `${r?.answered ?? 0}/${r?.total ?? 0}`,
      (r?.average ?? 0).toFixed(2),
      r?.level ? `L${r.level}` : '—',
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

  // Capability placement rows + distribution.
  const capRows = CAPABILITIES.map((c) => {
    const choice = m.capability_choices.find((x) => x.capability_id === c.id);
    return [
      c.name,
      choice?.placement ?? c.defaultPlacement,
      choice?.ownership ?? c.defaultOwnership,
      c.awsService,
    ];
  });
  const placementCounts = PLACEMENTS.map((p) => ({
    label: p,
    value: m.capability_choices.filter((c) => c.placement === p).length,
  }));

  const enabledPhases = m.roadmap.filter((p) => p.enabled);
  const roadmapRows = m.roadmap.map((p) => [
    p.name,
    p.months || '—',
    `$${p.investment_m.toFixed(1)}M`,
    p.enabled ? 'Included' : 'Excluded',
  ]);
  roadmapRows.push([
    'Total (enabled)',
    `${enabledPhases.length} phase${enabledPhases.length === 1 ? '' : 's'}`,
    `$${computed.total_investment_m.toFixed(1)}M`,
    '',
  ]);

  const blocks: ReportBlock[] = [
    { kind: 'heading', text: 'Executive Summary' },
    { kind: 'kpis', items: kpis, columns: 4 },
    { kind: 'paragraph', text: summary },
    {
      kind: 'keyValues',
      rows: [
        { label: 'Operating Model Pattern', value: m.pattern },
        { label: 'Governance Approach', value: m.governance },
        { label: 'Recommended Pattern', value: computed.recommended_pattern },
        { label: 'Recommended Governance', value: computed.recommended_governance },
      ],
    },
    {
      kind: 'radar',
      title: 'Operating Model Profile',
      max: 5,
      axes: DIMENSIONS.map((d) => ({
        label: DIM_SHORT[d.key] ?? d.label,
        value: computed.dimensions[d.key]?.average ?? 0,
      })),
    },

    { kind: 'heading', text: 'Dimension Breakdown' },
    {
      kind: 'table',
      caption: 'Seven TOM dimensions scored 1–5, weighted per the design configuration.',
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

    { kind: 'heading', text: 'Capability Placement' },
    {
      kind: 'bars',
      title: 'Placement Distribution (of 20 capabilities)',
      max: 20,
      format: (v) => String(v),
      data: placementCounts,
    },
    {
      kind: 'table',
      caption: 'Placement and ownership for each of the 20 AI capabilities.',
      columns: [
        { header: 'Capability' },
        { header: 'Placement' },
        { header: 'Ownership' },
        { header: 'AWS Service' },
      ],
      rows: capRows,
    },

    { kind: 'heading', text: 'Investment & Roadmap' },
    {
      kind: 'keyValues',
      rows: [
        { label: 'People & Process', value: `${m.investment.people_pct}%` },
        { label: 'Technology & Platform', value: `${m.investment.technology_pct}%` },
        { label: 'Algorithms & Models', value: `${m.investment.algorithms_pct}%` },
        { label: 'Total Investment', value: `$${computed.total_investment_m.toFixed(1)}M` },
      ],
      columns: 4,
    },
    {
      kind: 'table',
      caption: 'BCG 10-20-70 investment split shown above; phased roadmap below.',
      emphasizeLastRow: true,
      columns: [
        { header: 'Phase' },
        { header: 'Timeline' },
        { header: 'Investment', align: 'right' },
        { header: 'Status' },
      ],
      rows: roadmapRows,
    },
  ];

  // --- Detailed responses (explicit per-question answers), grouped by dimension.
  const detailTables: ReportBlock[] = [];
  for (const d of DIMENSIONS) {
    const cat = QUESTION_CATALOG[d.key];
    if (!cat) continue;
    const rows = cat.questions.map((q) => {
      const score = scores[q.id];
      const has = typeof score === 'number' && score >= 1 && score <= 5;
      return [
        q.prompt,
        has ? String(score) : '—',
        has ? (q.anchors?.[String(score)] ?? '—') : '—',
      ];
    });
    if (!rows.length) continue;
    detailTables.push({
      kind: 'table',
      caption: d.label,
      columns: [
        { header: 'Question' },
        { header: 'Score', align: 'center' },
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
        text: 'Every diagnostic question with the level selected and what that level means. Unanswered questions show a dash.',
      },
      ...detailTables,
    );
  }

  return {
    meta: {
      recordType: 'Operating Model',
      title: m.name,
      subtitle: m.description || undefined,
      status: m.status,
      statusTone: STATUS_TONE[m.status],
      fields: [
        { label: 'Organization', value: m.organization || '—' },
        { label: 'Designer', value: m.designer || '—' },
        { label: 'Pattern', value: m.pattern },
        { label: 'Governance', value: m.governance },
        { label: 'Maturity Level', value: level ? `L${level} — ${levelName}` : '—' },
        { label: 'Total Investment', value: `$${computed.total_investment_m.toFixed(1)}M` },
      ],
    },
    blocks,
  };
}
