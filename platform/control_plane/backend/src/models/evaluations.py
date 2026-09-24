"""Evaluation module models.

Field names are camelCase on purpose: they are the wire contract shared with
frontend/src/components/evaluation/types.ts. Keep the two in sync.
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

Category = Literal["accuracy", "safety", "compliance", "quality", "performance"]
GateType = Literal["hard", "soft"]
Verdict = Literal["autonomy-eligible", "conditional", "blocked"]
RunStatus = Literal["running", "completed", "failed"]


class EvaluatorResult(BaseModel):
    id: str
    name: str
    category: Category
    gate: GateType
    score: float
    threshold: float
    passed: bool
    stddev: Optional[float] = None


class JudgeVerdict(BaseModel):
    evaluatorId: str
    evaluatorName: str
    score: float
    passed: bool
    reasoning: str


class EvalCase(BaseModel):
    id: str
    input: str
    expectedBehavior: str
    agentResponse: str
    judgeVerdicts: List[JudgeVerdict] = Field(default_factory=list)
    latencyMs: float = 0
    estCostUsd: float = 0
    passed: bool = True


class RunSummary(BaseModel):
    id: str
    startedAt: str
    status: RunStatus
    overallScore: float = 0
    hardGatesPassed: int = 0
    hardGatesTotal: int = 0
    evaluatorsPassed: int = 0
    evaluatorsTotal: int = 0
    verdict: Verdict = "conditional"


class EvalRun(RunSummary):
    deploymentId: str
    appName: str
    suiteName: str
    results: List[EvaluatorResult] = Field(default_factory=list)
    cases: List[EvalCase] = Field(default_factory=list)
    error: Optional[str] = None
    progressNote: Optional[str] = None
    recommendations: Optional[List[dict]] = None
    recommendationsStatus: Optional[str] = None
    recommendationsError: Optional[str] = None


class EvaluatedApp(BaseModel):
    deploymentId: str
    name: str
    domain: str = ""
    framework: str = ""
    source: str = "FSI Foundry"
    status: Literal["evaluated", "running", "never-evaluated"] = "never-evaluated"
    lastRun: Optional[RunSummary] = None
    history: List[RunSummary] = Field(default_factory=list)
    # Deployment without an invocable runtime (web app / infra): the UI must
    # offer judge-only guidance, not a "Run first evaluation" call-to-action.
    isWebApp: bool = False


class SuiteEvaluatorConfig(BaseModel):
    id: str
    threshold: float
    enabled: bool = True


class SuiteCreateRequest(BaseModel):
    name: str
    target_deployment_id: str
    cases: List[dict] = Field(default_factory=list)
    evaluators: List[SuiteEvaluatorConfig] = Field(default_factory=list)
    # Performance targets are a risk-appetite choice per suite, not a global
    # constant — multi-agent pipelines legitimately take 30-60s per decision.
    latency_sla_ms: float = Field(default=60000, gt=0)
    cost_budget_usd: float = Field(default=0.10, gt=0)
    # Repeats per case: >1 measures run-to-run noise and yields error bars.
    repeats: int = Field(default=1, ge=1, le=5)


class PairwiseRequest(BaseModel):
    run_id_a: str
    run_id_b: str


class RunCreateRequest(BaseModel):
    deployment_id: str
    suite_id: Optional[str] = None
    app_name: Optional[str] = None


class JudgePreviewCase(BaseModel):
    """Judge-only mode: score a provided (input, response) pair without
    invoking a deployed agent. This is how the judge engine is demonstrated
    before any agent exists in the account."""

    input: str
    expectedBehavior: str
    agentResponse: str
    evaluatorIds: Optional[List[str]] = None
