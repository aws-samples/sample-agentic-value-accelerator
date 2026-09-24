// Operate → Evaluation — shared types.
// Scores are 0–100. Hard gates must pass for an agent to act autonomously;
// soft gates inform the promotion decision.

export type Category = 'accuracy' | 'safety' | 'compliance' | 'quality' | 'performance';
export type GateType = 'hard' | 'soft';
export type Verdict = 'autonomy-eligible' | 'conditional' | 'blocked';
export type RunStatus = 'running' | 'completed' | 'failed';

export interface EvaluatorDef {
  id: string;
  name: string;
  category: Category;
  gate: GateType;
  defaultThreshold: number;
  description: string;
}

export interface EvaluatorResult {
  id: string;
  name: string;
  category: Category;
  gate: GateType;
  score: number;
  threshold: number;
  passed: boolean;
  // Run-to-run noise (± error bar), present when the suite ran repeats > 1.
  stddev?: number;
}

// Head-to-head battle results between two runs (position-bias cancelled).
export interface PairwiseBattle {
  caseId: string;
  evaluatorId: string;
  evaluatorName: string;
  winner: 'A' | 'B' | 'tie';
  reasoning: string;
  consistent: boolean;
}

export interface PairwiseResult {
  battles: PairwiseBattle[];
  byEvaluator: { evaluatorId: string; evaluatorName: string; aWins: number; bWins: number; ties: number }[];
  tally: { A: number; B: number; tie: number };
  caseCount: number;
}

export interface JudgeVerdict {
  evaluatorId: string;
  evaluatorName: string;
  score: number;
  passed: boolean;
  reasoning: string;
}

export interface EvalCase {
  id: string;
  input: string;
  expectedBehavior: string;
  agentResponse: string;
  judgeVerdicts: JudgeVerdict[];
  latencyMs: number;
  estCostUsd: number;
  passed: boolean;
}

// One suggested change from the optimization advisor — a single lever
// (system_prompt | model | guardrail | agent_logic | suite) plus specifics.
export interface OptimizationRec {
  lever: string;
  title: string;
  detail: string;
  evaluators?: string[];
}

export interface EvalRun {
  id: string;
  deploymentId: string;
  appName: string;
  suiteName: string;
  startedAt: string;
  status: RunStatus;
  overallScore: number;
  hardGatesPassed: number;
  hardGatesTotal: number;
  evaluatorsPassed: number;
  evaluatorsTotal: number;
  verdict: Verdict;
  results: EvaluatorResult[];
  cases: EvalCase[];
  error?: string;
  progressNote?: string | null;
  recommendations?: OptimizationRec[];
  recommendationsStatus?: string | null;
  recommendationsError?: string | null;
}

export interface RunSummary {
  id: string;
  startedAt: string;
  status: RunStatus;
  overallScore: number;
  hardGatesPassed: number;
  hardGatesTotal: number;
  evaluatorsPassed: number;
  evaluatorsTotal: number;
  verdict: Verdict;
}

export interface EvaluatedApp {
  deploymentId: string;
  name: string;
  domain: string;
  framework: string;
  source: 'FSI Foundry' | 'Reference App';
  status: 'evaluated' | 'running' | 'never-evaluated';
  lastRun: RunSummary | null;
  history: RunSummary[];
  // No invocable agent runtime (web app / infrastructure): live evaluation
  // does not apply; only judge-only mode with recorded outputs.
  isWebApp?: boolean;
}

export interface SuiteCase {
  id?: string;
  input: string;
  expectedBehavior: string;
  agentResponse?: string;
}

// The stored suite record as returned by GET /apps/{id}/suite.
export interface StoredSuite {
  id: string;
  name: string;
  cases: SuiteCase[];
  evaluators?: { id: string; threshold: number; enabled: boolean }[];
  latency_sla_ms?: number;
  cost_budget_usd?: number;
  repeats?: number;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  accuracy: 'Accuracy',
  safety: 'Safety',
  compliance: 'Compliance',
  quality: 'Quality',
  performance: 'Performance',
};

export const VERDICT_META: Record<Verdict, { label: string; badge: string }> = {
  'autonomy-eligible': { label: 'Autonomy-eligible', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  conditional: { label: 'Conditional', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  blocked: { label: 'Blocked', badge: 'bg-red-50 text-red-700 border-red-200' },
};
