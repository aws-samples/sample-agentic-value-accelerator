// Business Case → ReportDefinition adapter.
//
// Maps a BusinessCase record + its computed financials/risk into the shared
// declarative report model. All formatting is owned by the shared toolkit
// (src/lib/pdf); this file only decides *what* data appears and in what order.
// Structure: summary + visualization first, explicit line-item answers last.

import type { BusinessCase, BusinessCaseStatus, CostLineItem, BenefitLineItem } from '../../api/client';
import { computeFromCase, fmtMoney, fmtPct } from './scoring';
import { RISK_CATEGORIES } from './types';
import type { ReportDefinition, ReportBlock, KpiItem, Tone } from '../../lib/pdf';

const STATUS_TONE: Record<BusinessCaseStatus, Tone> = {
  Draft: 'info',
  Review: 'warning',
  Approved: 'positive',
  Rejected: 'negative',
  Archived: 'default',
};

// Concise axis labels so the risk radar stays legible.
const RISK_SHORT: Record<string, string> = {
  technical: 'Technical',
  data: 'Data',
  model: 'Model',
  regulatory: 'Regulatory',
  organizational: 'Org',
  vendor_lockin: 'Vendor',
  change_management: 'Change',
  cybersecurity: 'Cyber',
};

function decisionTone(decision: string): Tone {
  if (decision.startsWith('POSITIVE')) return 'positive';
  if (decision.startsWith('NEGATIVE')) return 'negative';
  return 'warning';
}

function riskTone(level: string): Tone {
  if (level.startsWith('LOW')) return 'positive';
  if (level.startsWith('HIGH')) return 'negative';
  return 'warning';
}

function paybackLabel(years: number | null | undefined): string {
  if (years === null || years === undefined) return '>3 yrs';
  return `${years.toFixed(1)} yrs`;
}

const sumField = (items: Array<CostLineItem | BenefitLineItem>, key: string): number =>
  items.reduce((s, it) => s + (Number((it as unknown as Record<string, number>)[key]) || 0), 0);

function costLineRows(items: CostLineItem[]): (string | number)[][] {
  return items.map((it) => {
    const total = it.year_0 + it.year_1 + it.year_2 + it.year_3;
    return [it.label, fmtMoney(it.year_0), fmtMoney(it.year_1), fmtMoney(it.year_2), fmtMoney(it.year_3), fmtMoney(total)];
  });
}

function benefitLineRows(items: BenefitLineItem[]): (string | number)[][] {
  return items.map((it) => {
    const total = it.year_1 + it.year_2 + it.year_3;
    return [it.label, fmtMoney(it.year_1), fmtMoney(it.year_2), fmtMoney(it.year_3), fmtMoney(total)];
  });
}

export function buildBusinessCaseReport(bc: BusinessCase): ReportDefinition {
  const computed = bc.computed ?? computeFromCase(bc);
  const fin = computed.financials;
  const risk = computed.risk;
  const inputs = bc.inputs;

  const kpis: KpiItem[] = [
    { label: 'NPV (3-yr)', value: fmtMoney(fin.npv), tone: decisionTone(fin.npv_decision) },
    {
      label: 'IRR',
      value: fmtPct(fin.irr),
      tone: fin.irr_passes_hurdle ? 'positive' : 'warning',
      hint: `Hurdle ${fmtPct(inputs.hurdle_rate, 0)}`,
    },
    { label: 'ROI', value: fmtPct(fin.roi) },
    { label: 'Payback', value: paybackLabel(fin.payback_years) },
    { label: 'Benefit / Cost', value: fin.benefit_cost_ratio.toFixed(2) },
    {
      label: 'Composite Risk',
      value: risk.composite.toFixed(2),
      tone: riskTone(risk.level),
      hint: risk.level.split(' ')[0],
    },
  ];

  const summary =
    `This business case projects a net present value of ${fmtMoney(fin.npv)} over three years at a ` +
    `${fmtPct(fin.discount_rate)} discount rate, with an IRR of ${fmtPct(fin.irr)} ` +
    `(${fin.irr_passes_hurdle ? 'above' : 'below'} the ${fmtPct(inputs.hurdle_rate, 0)} hurdle) and an ROI of ${fmtPct(fin.roi)}. ` +
    `Total benefits of ${fmtMoney(fin.total_benefits)} against total costs of ${fmtMoney(fin.total_costs)} give a ` +
    `benefit-cost ratio of ${fin.benefit_cost_ratio.toFixed(2)}. Overall risk is rated ${risk.level}. ` +
    `Recommendation: ${fin.npv_decision}.`;

  // Cash-flow table (+ totals row).
  const cfRows = fin.cash_flow.map((yr) => [
    `Year ${yr.year}`,
    fmtMoney(yr.benefits),
    fmtMoney(yr.costs),
    fmtMoney(yr.pre_tax),
    fmtMoney(yr.tax_impact),
    fmtMoney(yr.after_tax),
    fmtMoney(yr.cumulative),
    fmtMoney(yr.discounted),
  ]);
  const cfTotals = fin.cash_flow.reduce(
    (a, yr) => ({
      pre: a.pre + yr.pre_tax,
      tax: a.tax + yr.tax_impact,
      after: a.after + yr.after_tax,
    }),
    { pre: 0, tax: 0, after: 0 },
  );
  cfRows.push([
    'Total',
    fmtMoney(fin.total_benefits),
    fmtMoney(fin.total_costs),
    fmtMoney(cfTotals.pre),
    fmtMoney(cfTotals.tax),
    fmtMoney(cfTotals.after),
    '—',
    fmtMoney(fin.npv),
  ]);

  // Cost breakdown by section (subtotals).
  const costSections: Array<{ label: string; items: CostLineItem[] }> = [
    { label: 'Initial Investment', items: bc.costs.initial },
    { label: 'Annual Operating', items: bc.costs.operating },
    { label: 'Staffing', items: bc.costs.staffing },
  ];
  const costRows = costSections.map((s) => {
    const y0 = sumField(s.items, 'year_0');
    const y1 = sumField(s.items, 'year_1');
    const y2 = sumField(s.items, 'year_2');
    const y3 = sumField(s.items, 'year_3');
    return [s.label, fmtMoney(y0), fmtMoney(y1), fmtMoney(y2), fmtMoney(y3), fmtMoney(y0 + y1 + y2 + y3)];
  });
  const costTotalByYear = [0, 1, 2, 3].map((y) =>
    costSections.reduce((s, sec) => s + sumField(sec.items, `year_${y}`), 0),
  );
  costRows.push([
    'Total',
    ...costTotalByYear.map((v) => fmtMoney(v)),
    fmtMoney(costTotalByYear.reduce((a, b) => a + b, 0)),
  ]);

  // Benefit breakdown by section (subtotals, years 1-3).
  const benefitSections: Array<{ label: string; items: BenefitLineItem[] }> = [
    { label: 'Tangible', items: bc.benefits.tangible },
    { label: 'Intangible / Strategic', items: bc.benefits.intangible },
  ];
  const benefitRows = benefitSections.map((s) => {
    const y1 = sumField(s.items, 'year_1');
    const y2 = sumField(s.items, 'year_2');
    const y3 = sumField(s.items, 'year_3');
    return [s.label, fmtMoney(y1), fmtMoney(y2), fmtMoney(y3), fmtMoney(y1 + y2 + y3)];
  });
  const benefitTotalByYear = [1, 2, 3].map((y) =>
    benefitSections.reduce((s, sec) => s + sumField(sec.items, `year_${y}`), 0),
  );
  benefitRows.push([
    'Total',
    ...benefitTotalByYear.map((v) => fmtMoney(v)),
    fmtMoney(benefitTotalByYear.reduce((a, b) => a + b, 0)),
  ]);

  // Risk scorecard.
  const riskRows = RISK_CATEGORIES.map((cat) => [
    cat.label,
    `${Math.round(cat.weight * 100)}%`,
    String((bc.risk_scores as unknown as Record<string, number>)[cat.key] ?? 0),
    (risk.by_category[cat.key] ?? 0).toFixed(2),
  ]);
  riskRows.push(['Composite', '100%', '—', risk.composite.toFixed(2)]);

  const blocks: ReportBlock[] = [
    { kind: 'heading', text: 'Executive Summary' },
    { kind: 'kpis', items: kpis, columns: 3 },
    { kind: 'paragraph', text: summary },

    { kind: 'heading', text: 'Project Parameters' },
    {
      kind: 'keyValues',
      rows: [
        { label: 'Discount Rate', value: fmtPct(fin.discount_rate) },
        { label: 'WACC (Base)', value: fmtPct(inputs.wacc_base) },
        { label: 'Technology Risk Premium', value: fmtPct(inputs.technology_risk_premium) },
        { label: 'Hurdle Rate (Min IRR)', value: fmtPct(inputs.hurdle_rate) },
        { label: 'Corporate Tax Rate', value: fmtPct(inputs.tax_rate) },
        { label: 'Inflation Rate', value: fmtPct(inputs.inflation_rate) },
        { label: 'Compliance Adder', value: fmtPct(inputs.compliance_adder_pct) },
        {
          label: 'Benefit Ramp (Y1/Y2/Y3)',
          value: `${fmtPct(inputs.ramp_y1, 0)} / ${fmtPct(inputs.ramp_y2, 0)} / ${fmtPct(inputs.ramp_y3, 0)}`,
        },
      ],
    },

    { kind: 'heading', text: 'Three-Year Cash Flow' },
    {
      kind: 'table',
      caption: 'All values in $000s. Totals row shows aggregate benefits/costs and NPV.',
      emphasizeLastRow: true,
      columns: [
        { header: 'Period' },
        { header: 'Benefits', align: 'right' },
        { header: 'Costs', align: 'right' },
        { header: 'Pre-Tax', align: 'right' },
        { header: 'Tax', align: 'right' },
        { header: 'After-Tax', align: 'right' },
        { header: 'Cumulative', align: 'right' },
        { header: 'Discounted', align: 'right' },
      ],
      rows: cfRows,
    },
    {
      kind: 'bars',
      title: 'Discounted Cash Flow by Year',
      format: (v) => fmtMoney(v),
      data: fin.cash_flow.map((yr) => ({
        label: `Year ${yr.year}`,
        value: yr.discounted,
        tone: yr.discounted < 0 ? 'negative' : 'positive',
      })),
    },

    { kind: 'heading', text: 'Cost Summary' },
    {
      kind: 'table',
      caption: 'Cost subtotals in $000s (before the compliance adder applied in the cash flow).',
      emphasizeLastRow: true,
      columns: [
        { header: 'Category' },
        { header: 'Year 0', align: 'right' },
        { header: 'Year 1', align: 'right' },
        { header: 'Year 2', align: 'right' },
        { header: 'Year 3', align: 'right' },
        { header: 'Total', align: 'right' },
      ],
      rows: costRows,
    },

    { kind: 'heading', text: 'Benefit Summary' },
    {
      kind: 'table',
      caption: 'Benefit subtotals in $000s. Year 0 has no benefits by definition.',
      emphasizeLastRow: true,
      columns: [
        { header: 'Category' },
        { header: 'Year 1', align: 'right' },
        { header: 'Year 2', align: 'right' },
        { header: 'Year 3', align: 'right' },
        { header: 'Total', align: 'right' },
      ],
      rows: benefitRows,
    },

    { kind: 'heading', text: 'Risk Scorecard' },
    {
      kind: 'table',
      caption: 'Scores 1 (low) – 5 (high), weighted by the 8-category rubric.',
      emphasizeLastRow: true,
      columns: [
        { header: 'Risk Category' },
        { header: 'Weight', align: 'right' },
        { header: 'Score', align: 'right' },
        { header: 'Weighted', align: 'right' },
      ],
      rows: riskRows,
    },
    {
      kind: 'radar',
      title: 'Risk Profile',
      max: 5,
      axes: RISK_CATEGORIES.map((cat) => ({
        label: RISK_SHORT[cat.key] ?? cat.label,
        value: (bc.risk_scores as unknown as Record<string, number>)[cat.key] ?? 0,
      })),
    },
  ];

  // --- Detailed line items (explicit cost/benefit answers entered).
  const costCol = [
    { header: 'Line Item' },
    { header: 'Year 0', align: 'right' as const },
    { header: 'Year 1', align: 'right' as const },
    { header: 'Year 2', align: 'right' as const },
    { header: 'Year 3', align: 'right' as const },
    { header: 'Total', align: 'right' as const },
  ];
  const costDetail: ReportBlock[] = [];
  for (const s of costSections) {
    if (!s.items.length) continue;
    costDetail.push({ kind: 'table', caption: s.label, columns: costCol, rows: costLineRows(s.items) });
  }
  if (costDetail.length) {
    blocks.push({ kind: 'heading', text: 'Detailed Cost Line Items' }, ...costDetail);
  }

  const benefitCol = [
    { header: 'Line Item' },
    { header: 'Year 1', align: 'right' as const },
    { header: 'Year 2', align: 'right' as const },
    { header: 'Year 3', align: 'right' as const },
    { header: 'Total', align: 'right' as const },
  ];
  const benefitDetail: ReportBlock[] = [];
  for (const s of benefitSections) {
    if (!s.items.length) continue;
    benefitDetail.push({ kind: 'table', caption: `${s.label} Benefits`, columns: benefitCol, rows: benefitLineRows(s.items) });
  }
  if (benefitDetail.length) {
    blocks.push({ kind: 'heading', text: 'Detailed Benefit Line Items' }, ...benefitDetail);
  }

  return {
    meta: {
      recordType: 'Business Case',
      title: bc.name,
      subtitle: bc.description || undefined,
      status: bc.status,
      statusTone: STATUS_TONE[bc.status],
      fields: [
        { label: 'Sponsor', value: inputs.sponsor || '—' },
        { label: 'Business Unit', value: inputs.business_unit || '—' },
        { label: 'Industry', value: inputs.industry },
        { label: 'AI Technology', value: inputs.ai_technology_type },
        { label: 'Project Size', value: inputs.project_size },
        { label: 'Evaluation Date', value: inputs.evaluation_date || '—' },
      ],
    },
    blocks,
  };
}
