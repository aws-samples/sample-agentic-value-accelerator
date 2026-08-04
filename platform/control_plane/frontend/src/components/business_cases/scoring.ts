import type {
  BusinessCase, ComputedBC, ComputedFinancials, ComputedRisk, CashFlowYear,
  ProjectInputs, CostModel, BenefitModel, RiskScorecard, RiskWeights,
} from '../../api/client';

function r(n: number) { return Math.round(n * 10000) / 10000; }

function sumCost(items: Array<{ year_0: number; year_1: number; year_2: number; year_3: number }>, y: number): number {
  const k = `year_${y}` as 'year_0' | 'year_1' | 'year_2' | 'year_3';
  return items.reduce((s, it) => s + (it[k] || 0), 0);
}

function sumBenefit(items: Array<{ year_1: number; year_2: number; year_3: number }>, y: number): number {
  if (y === 0) return 0;
  const k = `year_${y}` as 'year_1' | 'year_2' | 'year_3';
  return items.reduce((s, it) => s + (it[k] || 0), 0);
}

function irrCalc(flows: number[], guess = 0.1): number | null {
  const hasPos = flows.some((c) => c > 0);
  const hasNeg = flows.some((c) => c < 0);
  if (!(hasPos && hasNeg)) return null;
  let rate = guess;
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0;
    let deriv = 0;
    for (let i = 0; i < flows.length; i++) {
      const c = flows[i];
      const d = (1 + rate) ** i;
      npv += c / d;
      deriv += -i * c / ((1 + rate) ** (i + 1));
    }
    if (Math.abs(deriv) < 1e-12) return null;
    const next = rate - npv / deriv;
    if (Math.abs(next - rate) < 1e-7) return r(next);
    rate = next;
  }
  return null;
}

function paybackYearEnd(cumulative: number[]): number | null {
  for (let i = 1; i < cumulative.length; i++) {
    if (cumulative[i - 1] < 0 && cumulative[i] >= 0) {
      const prev = cumulative[i - 1];
      const curr = cumulative[i];
      const flow = curr - prev;
      if (flow === 0) return i;
      return r(i + (-prev) / flow);
    }
  }
  return null;
}

export function computeBC(
  inputs: ProjectInputs,
  costs: CostModel,
  benefits: BenefitModel,
  riskScores: RiskScorecard,
  riskWeights: RiskWeights,
): ComputedBC {
  const rate = r(inputs.wacc_base + inputs.technology_risk_premium);

  const baseCosts: number[] = [];
  for (let y = 0; y <= 3; y++) {
    const sub = sumCost(costs.initial, y) + sumCost(costs.operating, y) + sumCost(costs.staffing, y);
    baseCosts.push(r(sub * (1 + inputs.compliance_adder_pct)));
  }

  const yearBenefits = [0, 1, 2, 3].map((y) => r(sumBenefit(benefits.tangible, y) + sumBenefit(benefits.intangible, y)));

  const cashFlow: CashFlowYear[] = [];
  let cumulative = 0;
  const afterTaxFlows: number[] = [];
  let totalBenefits = 0;
  let totalCosts = 0;

  for (let y = 0; y <= 3; y++) {
    const b = yearBenefits[y];
    const c = baseCosts[y];
    const preTax = r(b - c);
    const tax = r(Math.max(0, preTax) * inputs.tax_rate);
    const afterTax = r(preTax - tax);
    cumulative = r(cumulative + afterTax);
    const df = r(1 / (1 + rate) ** y);
    const disc = r(afterTax * df);
    cashFlow.push({
      year: y, benefits: b, costs: c, pre_tax: preTax,
      tax_impact: tax, after_tax: afterTax, cumulative,
      discount_factor: df, discounted: disc,
    });
    afterTaxFlows.push(afterTax);
    totalBenefits += b;
    totalCosts += c;
  }

  const npv = r(cashFlow.reduce((s, yr) => s + yr.discounted, 0));
  const irr = irrCalc(afterTaxFlows);
  const payback = paybackYearEnd(cashFlow.map((yr) => yr.cumulative));
  const bcRatio = totalCosts ? r(totalBenefits / totalCosts) : 0;
  const roi = totalCosts ? r((totalBenefits - totalCosts) / totalCosts) : 0;
  const irrPasses = irr !== null && irr >= inputs.hurdle_rate;
  const decision = npv > 0 ? 'POSITIVE NPV - Proceed' : npv < 0 ? 'NEGATIVE NPV - Reject' : 'BREAKEVEN - Review';

  const fin: ComputedFinancials = {
    discount_rate: rate,
    cash_flow: cashFlow,
    total_benefits: r(totalBenefits),
    total_costs: r(totalCosts),
    npv,
    irr,
    roi,
    payback_years: payback,
    benefit_cost_ratio: bcRatio,
    irr_passes_hurdle: irrPasses,
    npv_decision: decision as any,
  };

  // Risk
  const byCat: Record<string, number> = {};
  let composite = 0;
  for (const k of Object.keys(riskWeights) as (keyof RiskWeights)[]) {
    const v = r((riskScores as any)[k] * (riskWeights as any)[k]);
    byCat[k as string] = v;
    composite += v;
  }
  composite = r(composite);
  const level = composite <= 2 ? 'LOW (Green)' : composite <= 3 ? 'MODERATE (Yellow)' : 'HIGH (Red)';

  const risk: ComputedRisk = { composite, level, by_category: byCat };

  return { financials: fin, risk };
}

export function computeFromCase(bc: BusinessCase): ComputedBC {
  return computeBC(bc.inputs, bc.costs, bc.benefits, bc.risk_scores, bc.risk_weights);
}

export function decisionColor(decision: string): string {
  if (decision.startsWith('POSITIVE')) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (decision.startsWith('NEGATIVE')) return 'text-red-700 bg-red-50 border-red-200';
  return 'text-amber-700 bg-amber-50 border-amber-200';
}

export function riskColor(level: string): string {
  if (level.startsWith('LOW')) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (level.startsWith('HIGH')) return 'text-red-700 bg-red-50 border-red-200';
  return 'text-amber-700 bg-amber-50 border-amber-200';
}

export function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}M`;
  return `$${Math.round(n)}K`;
}
export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}
