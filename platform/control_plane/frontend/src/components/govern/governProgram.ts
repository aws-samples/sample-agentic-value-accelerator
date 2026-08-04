/**
 * governProgram — the AI-governance program spine and its live grader.
 *
 * The Govern landing has long carried a passive "Discover → Report" journey in
 * the getting-started guide. This turns that journey into a *stateful program
 * tracker*: the same six causal steps, but each graded from the signals the
 * platform already computes (via useGovernanceAggregator — the Command Center's
 * data source), so the module can tell a user where they are and what to do next
 * rather than just listing where they could go.
 *
 * Design rules:
 * - Reads existing aggregator signals; computes nothing new about the estate.
 * - Steps are causal: you can't Assess what you haven't Inventoried, can't
 *   Report what you haven't Monitored. So next-best-action is the EARLIEST
 *   incomplete step, not the lowest-scoring one.
 * - Maturity is an OUTPUT (computed from completeness), not a self-declared input.
 * - Honest in the OSS prototype: where a signal is illustrative (compliance,
 *   cost), the step says so via the aggregator's own mock/real split.
 */
import type { GovernanceAggregatorResult } from './useGovernanceAggregator';

export type StepStatus = 'complete' | 'partial' | 'empty';

export interface ProgramStepDef {
  id: string;
  step: number;
  title: string;
  /** One-line intent of the step. */
  desc: string;
  color: string;
  /** Modules that live at this step (label + landing nav slug). */
  modules: { label: string; nav: string }[];
}

export interface GradedStep extends ProgramStepDef {
  status: StepStatus;
  /** 0..1 completeness contribution used for the program roll-up. */
  score: number;
  /** Short live metric shown on the chip, e.g. "2 / 11 frameworks". */
  metric: string;
  /** The single next action for this step when it isn't complete. */
  action?: string;
  /** Landing nav slug the action deep-links to. */
  actionNav?: string;
}

export interface MaturityStage {
  key: 'ad-hoc' | 'defined' | 'managed' | 'optimized';
  label: string;
  blurb: string;
  color: string;
}

/** "Start by role" entry points — each persona routes into the spine. */
export interface Persona {
  role: string;
  color: string;
  description: string;
  startWith: string;
  nav: string;
}

export const PERSONAS: Persona[] = [
  { role: 'Executives', color: '#4338ca', description: '30-second governance snapshot', startWith: 'Command Center', nav: 'command-center' },
  { role: 'Risk Teams', color: '#8b5cf6', description: 'Heatmaps, controls, issue tracking', startWith: 'Risk Management', nav: 'risk' },
  { role: 'Compliance', color: '#a21caf', description: 'Frameworks: SR 26-2, NIST, EU AI Act', startWith: 'Compliance Center', nav: 'compliance' },
  { role: 'Security', color: '#e11d48', description: 'Guardrails, policies, access control', startWith: 'Fleet Overview', nav: 'fleet' },
  { role: 'Data Stewards', color: '#0891b2', description: 'Lineage, quality, AI readiness', startWith: 'Data Governance', nav: 'data' },
  { role: 'Safety / RAI', color: '#6366f1', description: 'RAI coverage, frontier thresholds, incidents', startWith: 'AI Safety', nav: 'safety' },
  { role: 'FinOps', color: '#ec4899', description: 'Budgets, anomalies, cost optimization', startWith: 'Cost & FinOps', nav: 'finops' },
];

export const MATURITY_STAGES: MaturityStage[] = [
  { key: 'ad-hoc', label: 'Ad-hoc', blurb: 'No formal AI governance', color: '#ef4444' },
  { key: 'defined', label: 'Defined', blurb: 'Policies exist, partial coverage', color: '#f59e0b' },
  { key: 'managed', label: 'Managed', blurb: 'Full coverage, regular reviews', color: '#3b82f6' },
  { key: 'optimized', label: 'Optimized', blurb: 'Automated, proactive, integrated', color: '#10b981' },
];

/**
 * The canonical program spine. Every Govern module maps to exactly one step —
 * AI Safety sits in Govern as the capability-safety counterpart to Trust Stack.
 */
export const PROGRAM_STEPS: ProgramStepDef[] = [
  {
    id: 'discover', step: 1, title: 'Discover', color: '#e11d48',
    desc: 'Find ungoverned AI before it becomes an incident.',
    modules: [{ label: 'Shadow AI', nav: 'shadow-ai' }],
  },
  {
    id: 'inventory', step: 2, title: 'Inventory', color: '#7c3aed',
    desc: 'Build the system of record — agents, models, data, tools.',
    modules: [
      { label: 'Agent Registry', nav: 'agents' },
      { label: 'Model Management', nav: 'models' },
      { label: 'Data Governance', nav: 'data' },
      { label: 'Agentic Coding', nav: 'dev-tools' },
    ],
  },
  {
    id: 'assess', step: 3, title: 'Assess', color: '#a21caf',
    desc: 'Score risk and map assets to your compliance frameworks.',
    modules: [
      { label: 'Risk Management', nav: 'risk' },
      { label: 'Compliance Center', nav: 'compliance' },
    ],
  },
  {
    id: 'govern', step: 4, title: 'Govern', color: '#4338ca',
    desc: 'Set autonomy, guardrails, safety cases, and the trust model.',
    modules: [
      { label: 'Playbook', nav: 'playbook' },
      { label: 'Trust Stack', nav: 'trust-stack' },
      { label: 'AI Safety', nav: 'safety' },
    ],
  },
  {
    id: 'monitor', step: 5, title: 'Monitor', color: '#2563eb',
    desc: 'Track fleet health, cost, and posture continuously.',
    modules: [
      { label: 'Agentic Fleet', nav: 'fleet' },
      { label: 'Cost & FinOps', nav: 'finops' },
    ],
  },
  {
    id: 'report', step: 6, title: 'Report', color: '#0891b2',
    desc: 'Roll everything up for executives and auditors.',
    modules: [
      { label: 'Command Center', nav: 'command-center' },
      { label: 'Audit & Incidents', nav: 'audit' },
    ],
  },
];

/** Map a raw 0..1 score to a discrete status with consistent thresholds. */
function statusFor(score: number): StepStatus {
  if (score >= 0.99) return 'complete';
  if (score > 0) return 'partial';
  return 'empty';
}

/**
 * Grade every step from live aggregator signals. Pure: same input → same output.
 */
export function gradeProgram(agg: GovernanceAggregatorResult): GradedStep[] {
  const s = agg.summary;
  const riskScored = agg.useCaseRiskHeatmap.length;
  const activePolicies = agg.policyMetricsTotal.activePolicies;
  const runtimeSignals = agg.guardrailMetricsTotal.totalInvocations;

  const graded: GradedStep[] = PROGRAM_STEPS.map(def => {
    switch (def.id) {
      case 'discover': {
        // Visibility into the estate. You can't have discovered nothing; any
        // known agent/model means discovery has run at least once.
        const known = s.totalAgents + s.totalModels;
        const score = known > 0 ? 1 : 0;
        return {
          ...def, score, status: statusFor(score),
          metric: known > 0 ? `${known} assets in view` : 'no estate scan yet',
          action: score < 1 ? 'Run Shadow AI detection to surface ungoverned assets' : undefined,
          actionNav: 'shadow-ai',
        };
      }
      case 'inventory': {
        // System of record across agents + models. Partial if only one exists.
        const dims = [s.totalAgents > 0, s.totalModels > 0, s.totalUseCases > 0];
        const score = dims.filter(Boolean).length / dims.length;
        const missing = s.totalAgents === 0 ? 'agents' : s.totalModels === 0 ? 'models' : 'use cases';
        return {
          ...def, score, status: statusFor(score),
          metric: `${s.totalAgents} agents · ${s.totalModels} models`,
          action: score < 1 ? `Register your ${missing} to complete the system of record` : undefined,
          actionNav: s.totalAgents === 0 ? 'agents' : s.totalModels === 0 ? 'models' : 'agents',
        };
      }
      case 'assess': {
        // Two halves: risk-scored use cases, and compliance frameworks mapped.
        const riskScore = s.totalUseCases > 0 ? Math.min(1, riskScored / s.totalUseCases) : (riskScored > 0 ? 1 : 0);
        const compScore = s.frameworksTotal > 0 ? s.frameworksCovered / s.frameworksTotal : 0;
        const score = (riskScore + compScore) / 2;
        const weakest = compScore < riskScore ? 'compliance' : 'risk';
        return {
          ...def, score, status: statusFor(score),
          metric: `${s.frameworksCovered}/${s.frameworksTotal} frameworks · ${riskScored} risk-scored`,
          action: score < 1
            ? (weakest === 'compliance'
                ? `Map more frameworks — ${s.frameworksNeedingAttention[0] ?? 'SR 26-2'} needs attention`
                : 'Score remaining use cases for risk')
            : undefined,
          actionNav: weakest === 'compliance' ? 'compliance' : 'risk',
        };
      }
      case 'govern': {
        // Enforcement posture: active guardrails + active policies present.
        const dims = [s.guardrailsActive > 0, activePolicies > 0];
        const score = dims.filter(Boolean).length / dims.length;
        return {
          ...def, score, status: statusFor(score),
          metric: `${s.guardrailsActive} guardrails · ${activePolicies} policies active`,
          action: score < 1
            ? (s.guardrailsActive === 0 ? 'Publish a guardrail to enforce content safety' : 'Activate a Cedar policy for tool/agent access')
            : undefined,
          actionNav: 'safety',
        };
      }
      case 'monitor': {
        // Continuous signals: runtime guardrail telemetry + cost tracking.
        const dims = [runtimeSignals > 0, s.monthlySpend > 0];
        const score = dims.filter(Boolean).length / dims.length;
        return {
          ...def, score, status: statusFor(score),
          metric: runtimeSignals > 0 ? `${runtimeSignals.toLocaleString()} runtime events` : 'no runtime telemetry',
          action: score < 1
            ? (runtimeSignals === 0 ? 'Wire runtime guardrail telemetry from the fleet' : 'Enable cost tracking in FinOps')
            : undefined,
          actionNav: runtimeSignals === 0 ? 'fleet' : 'finops',
        };
      }
      case 'report': {
        // Capstone: governance-control evidence completeness (real checklist).
        const score = agg.controlStats.total > 0 ? agg.controlStats.implemented / agg.controlStats.total : 0;
        return {
          ...def, score, status: statusFor(score),
          metric: `${agg.controlStats.percentage}% controls evidenced`,
          action: score < 1 ? 'Close remaining governance controls, then roll up for auditors' : undefined,
          actionNav: 'command-center',
        };
      }
      default:
        return { ...def, score: 0, status: 'empty', metric: '' };
    }
  });

  return graded;
}

/** Overall program completeness (0..100), evenly weighted across the six steps. */
export function programCompleteness(graded: GradedStep[]): number {
  if (!graded.length) return 0;
  const sum = graded.reduce((a, g) => a + g.score, 0);
  return Math.round((sum / graded.length) * 100);
}

/** Maturity stage is derived from completeness — an output, never self-declared. */
export function maturityFor(completeness: number): MaturityStage {
  if (completeness >= 90) return MATURITY_STAGES[3];
  if (completeness >= 60) return MATURITY_STAGES[2];
  if (completeness >= 25) return MATURITY_STAGES[1];
  return MATURITY_STAGES[0];
}

/**
 * Next-best-action = the earliest incomplete step (causal ordering). Returns the
 * step plus its action; null when the whole program is complete.
 */
export function nextBestAction(graded: GradedStep[]): GradedStep | null {
  return graded.find(g => g.status !== 'complete' && g.action) ?? null;
}
