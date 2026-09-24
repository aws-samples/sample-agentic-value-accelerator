export interface SliderConfig {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: string;
  tooltip: string;
  advanced?: boolean;
}

export interface ScenarioPreset {
  id: 'conservative' | 'balanced' | 'aggressive';
  name: string;
  icon: string;
  description: string;
  values: Record<string, number>;
}

export interface SliderValues {
  monthlyVolume: number;
  automationRate: number;
  analystCost: number;
  penaltyAvoidance: number;
  discountRate: number;
}

export const sliderConfigs: SliderConfig[] = [
  { id: 'monthlyVolume', label: 'Monthly AI Decisions', min: 1000, max: 100000, step: 1000, defaultValue: 25000, unit: 'decisions/month', tooltip: 'Total KYC decisions processed by AI agents per month' },
  { id: 'automationRate', label: 'Straight-Through Processing', min: 0, max: 95, step: 5, defaultValue: 80, unit: '%', tooltip: 'Percentage of decisions completed without human intervention' },
  { id: 'analystCost', label: 'Avg Analyst Fully-Loaded Cost', min: 40, max: 120, step: 5, defaultValue: 70, unit: '\u00A3/hour', tooltip: 'Total employment cost per analyst hour (salary + benefits + overhead)' },
  { id: 'penaltyAvoidance', label: 'Compliance Penalty Exposure', min: 0, max: 50000000, step: 1000000, defaultValue: 15000000, unit: '\u00A3', tooltip: 'Maximum potential regulatory fine exposure across EU AI Act, GDPR, DORA, FCA' },
  { id: 'discountRate', label: 'NPV Discount Rate', min: 5, max: 20, step: 1, defaultValue: 10, unit: '%', tooltip: 'Risk-adjusted rate for net present value calculation (FSI WACC benchmark)', advanced: true },
];

export const scenarioPresets: ScenarioPreset[] = [
  { id: 'conservative', name: 'Conservative', icon: '\uD83D\uDEE1\uFE0F', description: 'Small team, cautious automation', values: { monthlyVolume: 5000, automationRate: 60, analystCost: 55, penaltyAvoidance: 5000000, discountRate: 12 } },
  { id: 'balanced', name: 'Balanced', icon: '\u2696\uFE0F', description: 'Mid-size operation, proven model', values: { monthlyVolume: 25000, automationRate: 80, analystCost: 70, penaltyAvoidance: 15000000, discountRate: 10 } },
  { id: 'aggressive', name: 'Aggressive', icon: '\uD83D\uDE80', description: 'High-volume, maximise autonomy', values: { monthlyVolume: 75000, automationRate: 95, analystCost: 85, penaltyAvoidance: 35000000, discountRate: 8 } },
];

// Constants from research
const AVG_REVIEW_MINUTES = 12;
const MANUAL_DAYS_PER_DECISION = 12;
const PENALTY_PROBABILITY = 0.15; // 15% over 3 years
const GOVERNANCE_REDUCTION = 0.80; // 80% risk reduction
const IMPLEMENTATION_COST = 1_500_000;
const ANNUAL_PLATFORM_COST = 600_000;

export function calculateAnnualSavings(p: SliderValues): number {
  const manualCostPerDecision = p.analystCost * (AVG_REVIEW_MINUTES / 60);
  const automatedDecisions = p.monthlyVolume * (p.automationRate / 100);
  return automatedDecisions * manualCostPerDecision * 12;
}

export function calculateComplianceAvoidance(p: SliderValues): number {
  return p.penaltyAvoidance * PENALTY_PROBABILITY * GOVERNANCE_REDUCTION;
}

export function calculateSpeedMultiplier(p: SliderValues): number {
  return Math.round(1 + (p.automationRate / 100) * 14);
}

export function calculateNPV(p: SliderValues): number {
  const savings = calculateAnnualSavings(p);
  const avoidance = calculateComplianceAvoidance(p);
  const r = p.discountRate / 100;
  const y1 = savings * 0.6 + avoidance;
  const y2 = savings + avoidance;
  const y3 = savings * 1.3 + avoidance * 1.2;
  return -IMPLEMENTATION_COST
    + (y1 - ANNUAL_PLATFORM_COST) / (1 + r)
    + (y2 - ANNUAL_PLATFORM_COST) / Math.pow(1 + r, 2)
    + (y3 - ANNUAL_PLATFORM_COST) / Math.pow(1 + r, 3);
}

export function calculateROI(p: SliderValues): number {
  const savings = calculateAnnualSavings(p);
  const avoidance = calculateComplianceAvoidance(p);
  const totalBenefits = savings * 0.6 + savings + savings * 1.3 + avoidance * 3.2;
  const totalCosts = IMPLEMENTATION_COST + ANNUAL_PLATFORM_COST * 3;
  return Math.round(((totalBenefits - totalCosts) / totalCosts) * 100);
}

export function calculatePaybackMonths(p: SliderValues): number {
  const savings = calculateAnnualSavings(p);
  const avoidance = calculateComplianceAvoidance(p);
  const monthlyNet = (savings + avoidance - ANNUAL_PLATFORM_COST) / 12;
  if (monthlyNet <= 0) return 999;
  return Math.round((IMPLEMENTATION_COST / monthlyNet) * 10) / 10;
}

export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `\u00A3${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `\u00A3${(value / 1_000).toFixed(0)}K`;
  return `\u00A3${value.toFixed(0)}`;
}
