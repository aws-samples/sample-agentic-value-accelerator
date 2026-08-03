/**
 * ModuleGuide — Collapsible guidance component with visual indicators.
 * Landing pages use "Getting Started with..." and sub-modules use "How to Use..."
 */
import { useState } from 'react';

interface Step {
  step?: string | number;
  title: string;
  desc: string;
  color?: string;
}

interface MaturityStage {
  stage: string;
  desc: string;
  focus?: string;
  color: string;
  nav?: string;
}

interface QuickLink {
  label: string;
  nav?: string;
  onClick?: () => void;
  icon?: string;
  color?: string;
}

interface ModuleGuideProps {
  title: string;
  steps?: Step[];
  maturityStages?: MaturityStage[];
  quickLinks?: QuickLink[];
  onNavigate?: (nav: string) => void;
  variant?: 'landing' | 'submodule';
}

const ModuleGuide = ({ title, steps, maturityStages, quickLinks, onNavigate, variant = 'submodule' }: ModuleGuideProps) => {
  const [collapsed, setCollapsed] = useState(true);

  const isLanding = variant === 'landing';

  return (
    <div className="rounded-xl border shadow-sm mb-4 overflow-hidden bg-gradient-to-r from-indigo-50 via-violet-50 to-pink-50 border-violet-200/60">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-violet-100/30"
      >
        <div className="flex items-center gap-3">
          {/* Icon container — lightning bolt on landing, lightbulb on submodule (so the two are still distinguishable) */}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-indigo-600 via-violet-500 to-pink-500 shadow-md shadow-violet-200">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {isLanding ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              )}
            </svg>
          </div>
          <div className="text-left">
            <span className="text-xs font-semibold text-violet-700">
              {title}
            </span>
            <div className="text-[10px] text-violet-500">
              {collapsed ? 'Click to expand' : 'Click to collapse'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {collapsed && steps && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
              {steps.length} steps
            </span>
          )}
          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-violet-100">
            <svg
              className={`w-4 h-4 transition-transform text-violet-600 ${collapsed ? '' : 'rotate-180'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4 bg-white/50">
          {/* Steps */}
          {steps && steps.length > 0 && (
            <div className="pt-2">
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(steps.length, 4)}, 1fr)` }}>
                {steps.map((s, i) => (
                  <div key={i} className="bg-white rounded-lg border border-slate-200/80 p-3 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: s.color || '#3b82f6' }}
                      >
                        {s.step || i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-slate-800">{s.title}</div>
                        <div className="text-[10px] text-slate-500 leading-relaxed mt-1">{s.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Maturity Stages */}
          {maturityStages && maturityStages.length > 0 && (
            <div className="pt-3 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded flex items-center justify-center bg-fuchsia-100">
                  <svg className="w-3 h-3 text-fuchsia-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-fuchsia-700">Where Are You on the Journey?</span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(maturityStages.length, 4)}, 1fr)` }}>
                {maturityStages.map((m, i) => (
                  <div
                    key={i}
                    onClick={() => m.nav && onNavigate?.(m.nav)}
                    className="p-3 rounded-lg border-2 cursor-pointer hover:shadow-md transition-all relative overflow-hidden"
                    style={{
                      backgroundColor: `${m.color}08`,
                      borderColor: `${m.color}40`,
                    }}
                  >
                    {/* Progress indicator line at top */}
                    <div
                      className="absolute top-0 left-0 right-0 h-1"
                      style={{ backgroundColor: m.color }}
                    />
                    <div className="text-[12px] font-bold mt-1" style={{ color: m.color }}>{m.stage}</div>
                    <div className="text-[10px] text-slate-600 mt-1">{m.desc}</div>
                    {m.focus && (
                      <div className="text-[9px] text-slate-500 mt-2 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        Focus: {m.focus}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Links */}
          {quickLinks && quickLinks.length > 0 && (
            <div className="pt-3 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded flex items-center justify-center bg-pink-100">
                  <svg className="w-3 h-3 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-pink-700">Quick Links</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickLinks.map((link, i) => (
                  <button
                    key={i}
                    onClick={() => link.onClick?.() || (link.nav && onNavigate?.(link.nav))}
                    className="px-3 py-1.5 text-[11px] font-medium rounded-lg border-2 transition-all hover:shadow-md hover:-translate-y-0.5"
                    style={{
                      color: link.color || '#3b82f6',
                      borderColor: `${link.color || '#3b82f6'}50`,
                      backgroundColor: `${link.color || '#3b82f6'}08`,
                    }}
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ModuleGuide;

// ═══════════════════════════════════════════════════════════════
// Pre-built guides for each Govern sub-module
// ═══════════════════════════════════════════════════════════════

export const ModelManagementGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Model Management"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Register', desc: 'Browse the model catalog with risk tiers, compliance status, and ownership in the Registry.', color: '#4338ca' },
      { step: '2', title: 'Evaluate', desc: 'Pick a model, then run the evaluation suite: Evaluations (LLM-as-judge), RAG Evaluation, and Explainability & Fairness — the selected model carries across all three.', color: '#8b5cf6' },
      { step: '3', title: 'Gate', desc: 'The Deployment Gate aggregates eval, safety, RAG, and fairness into a cleared / conditional / blocked verdict mapped to SageMaker ModelApprovalStatus.', color: '#a21caf' },
      { step: '4', title: 'Operate', desc: 'Track drift in Monitoring, attestations in Governance, and versions/sunset in Lifecycle. (Evaluating an agent? See Agentic Evals in Agent Registry.)', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Inventory', desc: 'Models cataloged, basic metadata', focus: 'Registry', color: '#4338ca' },
      { stage: 'Evaluated', desc: 'Quality, RAG, fairness scored', focus: 'Evaluation Suite', color: '#8b5cf6' },
      { stage: 'Gated', desc: 'Promotion gated on eval signals', focus: 'Deployment Gate', color: '#a21caf' },
      { stage: 'Optimized', desc: 'Continuous monitoring & lifecycle', focus: 'Monitoring & Lifecycle', color: '#ec4899' },
    ]}
  />
);

export const ModelRegistryGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Model Registry"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'View Fleet', desc: 'See all models with risk tier, eval score, attestation status, and owner.', color: '#4338ca' },
      { step: '2', title: 'Check Compliance', desc: 'Review MRM framework compliance (SR 26-2, OSFI, NIST, EU AI Act) per model.', color: '#8b5cf6' },
      { step: '3', title: 'Open Model 360', desc: 'Click any model row to see full details: evals, approvals, evidence, risk profile.', color: '#a21caf' },
      { step: '4', title: 'Monitor Alerts', desc: 'Check the alerts bar for compliance gaps, overdue revalidations, and findings.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Inventory', desc: 'Models listed, minimal metadata', focus: 'Registration', color: '#4338ca' },
      { stage: 'Classified', desc: 'Risk tiers assigned, owners set', focus: 'Risk Tiering', color: '#8b5cf6' },
      { stage: 'Governed', desc: 'Compliance mapped, approvals tracked', focus: 'MRM Frameworks', color: '#a21caf' },
      { stage: 'Optimized', desc: 'Full 360 view, automated alerts', focus: 'Continuous Monitoring', color: '#ec4899' },
    ]}
    quickLinks={[
      { label: 'Portfolio Risk Dashboard', nav: 'portfolio-risk', color: '#4338ca' },
      { label: 'Framework Compliance', nav: 'framework-compliance', color: '#8b5cf6' },
      { label: 'Approval Pipeline', nav: 'approval-pipeline', color: '#a21caf' },
    ]}
  />
);

export const ModelGovernanceGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Governance"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Risk Assessment', desc: 'View fleet risk summary and per-model risk matrix with controls.', color: '#4338ca' },
      { step: '2', title: 'MRM Frameworks', desc: 'Track compliance across 4 global frameworks with per-model progress bars.', color: '#8b5cf6' },
      { step: '3', title: 'Model Cards', desc: 'Review documentation completeness and EU AI Act classification.', color: '#a21caf' },
      { step: '4', title: 'Review Schedule', desc: 'Manage revalidation calendar and upcoming deadlines.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Reactive', desc: 'Respond to audit findings', focus: 'Risk Assessment', color: '#4338ca' },
      { stage: 'Structured', desc: 'Frameworks mapped, gaps known', focus: 'MRM Frameworks', color: '#8b5cf6' },
      { stage: 'Proactive', desc: 'Continuous monitoring', focus: 'Review Schedule', color: '#a21caf' },
      { stage: 'Embedded', desc: 'Governance in every stage', focus: 'Full Automation', color: '#ec4899' },
    ]}
  />
);

export const ModelOperationsGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Operations"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Track Issues', desc: 'View findings from audits, MRAs, and self-identified issues. Filter by severity/status.', color: '#4338ca' },
      { step: '2', title: 'Map Dependencies', desc: 'See which systems consume each model. Assess impact before changes.', color: '#8b5cf6' },
      { step: '3', title: 'Compare Models', desc: 'Side-by-side comparison of 2-4 models on 14 metrics (performance, cost, compliance).', color: '#a21caf' },
      { step: '4', title: 'Optimize Costs', desc: 'Review cost insights: underutilized models, tier mismatches, savings opportunities.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Reactive', desc: 'Fix issues as they arise', focus: 'Issue Tracking', color: '#4338ca' },
      { stage: 'Visible', desc: 'Dependencies mapped, impacts known', focus: 'Dependency Mapping', color: '#8b5cf6' },
      { stage: 'Optimized', desc: 'Active cost and performance tuning', focus: 'Model Comparison', color: '#a21caf' },
      { stage: 'Predictive', desc: 'Proactive optimization, trend-based', focus: 'Trend Analytics', color: '#ec4899' },
    ]}
    quickLinks={[
      { label: 'Issues & Findings', nav: 'findings', color: '#4338ca' },
      { label: 'Dependencies', nav: 'dependencies', color: '#8b5cf6' },
      { label: 'Model Comparison', nav: 'comparison', color: '#a21caf' },
      { label: 'Cost Optimization', nav: 'cost', color: '#ec4899' },
      { label: 'Trend Analytics', nav: 'trends', color: '#4338ca' },
      { label: 'Integrations', nav: 'integrations', color: '#8b5cf6' },
    ]}
  />
);

export const ModelExplainabilityGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Explainability & Fairness"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Attribute', desc: 'See which features drove a prediction with SHAP, LIME, and Anchor rule explanations.', color: '#4338ca' },
      { step: '2', title: 'Explain Decisions', desc: 'Generate ECOA/Reg B adverse-action notices and counterfactual "what would change the outcome" paths.', color: '#8b5cf6' },
      { step: '3', title: 'Test Fairness', desc: 'Check disparate impact (four-fifths rule) and subgroup metrics across protected attributes.', color: '#a21caf' },
      { step: '4', title: 'Trace & Audit', desc: 'Diagnose drift root-cause and review the tamper-evident decision audit trail.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Opaque', desc: 'Black-box decisions, no explanations', focus: 'Feature Attribution', color: '#4338ca' },
      { stage: 'Explained', desc: 'Per-decision explanations available', focus: 'Adverse Action', color: '#8b5cf6' },
      { stage: 'Fair', desc: 'Bias tested, disparate impact monitored', focus: 'Fairness Testing', color: '#a21caf' },
      { stage: 'Accountable', desc: 'Full audit trail, regulator-ready evidence', focus: 'Decision Audit', color: '#ec4899' },
    ]}
  />
);

export const RagEvaluationsGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use RAG Evaluation"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Pick a Run', desc: 'Select a knowledge-base evaluation run. Each scores generation + retrieval quality via Bedrock LLM-as-a-judge.', color: '#4338ca' },
      { step: '2', title: 'Read Metrics', desc: 'Faithfulness (grounding), Context Relevance, Context Coverage, Citation Coverage — the Bedrock KB-evaluation metric set.', color: '#8b5cf6' },
      { step: '3', title: 'Inspect Queries', desc: 'Open any query to see the answer and the retrieved chunks with per-chunk relevance scores.', color: '#a21caf' },
      { step: '4', title: 'Gate on Quality', desc: 'Faithfulness and hallucination feed the Deployment Gate. The weighted overall is a governance overlay on Bedrock per-metric scores.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Unmeasured', desc: 'RAG quality unknown', focus: 'Run an evaluation', color: '#4338ca' },
      { stage: 'Scored', desc: 'Per-metric scores available', focus: 'Faithfulness & Context', color: '#8b5cf6' },
      { stage: 'Grounded', desc: 'Hallucination controlled, citations verified', focus: 'Citation Coverage', color: '#a21caf' },
      { stage: 'Gated', desc: 'RAG quality gates promotion', focus: 'Deployment Gate', color: '#ec4899' },
    ]}
  />
);

export const AgentEvalGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Agentic Evaluation"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Choose Evaluators', desc: 'AgentCore built-in evaluators by scope: session (goal success), trace (quality/safety), and tool (selection & parameter accuracy).', color: '#4338ca' },
      { step: '2', title: 'Run on a Runtime', desc: 'Evaluate a deployed AgentCore runtime via on-demand, online, or batch evaluation over OpenTelemetry traces.', color: '#8b5cf6' },
      { step: '3', title: 'Inspect Scenarios', desc: 'Drill into each scenario for the agent trace and assertion compliance against supplied ground truth.', color: '#a21caf' },
      { step: '4', title: 'Track Drift', desc: 'Compare against a locked baseline; regressions beyond threshold block promotion and can suspend the runtime.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Untested', desc: 'Agent behavior unmeasured', focus: 'Evaluator Catalog', color: '#4338ca' },
      { stage: 'Evaluated', desc: 'Tool use & goals scored', focus: 'Scenario Results', color: '#8b5cf6' },
      { stage: 'Baselined', desc: 'Baseline set, drift watched', focus: 'Baseline Drift', color: '#a21caf' },
      { stage: 'Continuous', desc: 'Online evals, auto-gated', focus: 'Online Evaluation', color: '#ec4899' },
    ]}
  />
);

export const DeploymentGateGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use the Deployment Gate"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Review Verdict', desc: 'Each model rolls up to Cleared / Conditional / Blocked, mapped to SageMaker ModelApprovalStatus.', color: '#4338ca' },
      { step: '2', title: 'Check Blocking Failures', desc: 'Eval score, safety, RAG faithfulness, and four-fifths fairness are blocking checks — any failure halts promotion.', color: '#8b5cf6' },
      { step: '3', title: 'Resolve & Re-run', desc: 'Fix the failing dimension and re-run that evaluation. The gate recomputes from live results.', color: '#a21caf' },
      { step: '4', title: 'Record Evidence', desc: 'The verdict and checks are recorded on the model card as deployment evidence for auditors.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Manual', desc: 'Ad-hoc promotion decisions', focus: 'Define thresholds', color: '#4338ca' },
      { stage: 'Gated', desc: 'Checks aggregate to a verdict', focus: 'Blocking Checks', color: '#8b5cf6' },
      { stage: 'Mapped', desc: 'Verdict drives ModelApprovalStatus', focus: 'Model Registry', color: '#a21caf' },
      { stage: 'Automated', desc: 'Pipeline condition step auto-gates', focus: 'CI/CD Promotion', color: '#ec4899' },
    ]}
  />
);

export const ModelEvaluationsGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Evaluations"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Select Model', desc: 'Choose a model from the fleet to evaluate against safety, quality, and latency metrics.', color: '#4338ca' },
      { step: '2', title: 'Choose Dataset', desc: 'Use built-in FSI test cases or upload custom evaluation datasets.', color: '#8b5cf6' },
      { step: '3', title: 'Run Evaluation', desc: 'Execute the eval job. Results include per-case scores and aggregate metrics.', color: '#a21caf' },
      { step: '4', title: 'Review & Export', desc: 'Analyze results, compare against baselines, export evidence for validation.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Ad-hoc', desc: 'Manual, inconsistent testing', focus: 'Basic Evals', color: '#4338ca' },
      { stage: 'Standardized', desc: 'Consistent datasets, regular runs', focus: 'Test Suites', color: '#8b5cf6' },
      { stage: 'Automated', desc: 'CI/CD integrated, regression tests', focus: 'Automation', color: '#a21caf' },
      { stage: 'Continuous', desc: 'Real-time monitoring, auto-revalidation', focus: 'Continuous Eval', color: '#ec4899' },
    ]}
  />
);

export const ModelMonitoringGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Monitoring"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Check Drift', desc: 'Monitor quality and hallucination drift over time. Alert on threshold breaches.', color: '#4338ca' },
      { step: '2', title: 'Track Performance', desc: 'View latency, error rates, and throughput trends per model.', color: '#8b5cf6' },
      { step: '3', title: 'Review Guardrails', desc: 'Check guardrail event counts: blocked, flagged, anonymized.', color: '#a21caf' },
      { step: '4', title: 'Set Alerts', desc: 'Configure thresholds and notification channels for anomalies.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Blind', desc: 'No production visibility', focus: 'Basic Metrics', color: '#4338ca' },
      { stage: 'Observable', desc: 'Dashboards exist, manual review', focus: 'Drift Detection', color: '#8b5cf6' },
      { stage: 'Alerting', desc: 'Thresholds set, notifications active', focus: 'Alert Configuration', color: '#a21caf' },
      { stage: 'Self-healing', desc: 'Auto-remediation, predictive alerts', focus: 'Automation', color: '#ec4899' },
    ]}
  />
);

export const ModelLifecycleGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Lifecycle"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Track Stages', desc: 'View models across lifecycle stages: development, validation, production, sunset.', color: '#4338ca' },
      { step: '2', title: 'Manage Transitions', desc: 'Progress models through stage gates with required approvals and evidence.', color: '#8b5cf6' },
      { step: '3', title: 'Plan Decommissioning', desc: 'Initiate sunset workflow: assessment, migration, archival, completion.', color: '#a21caf' },
      { step: '4', title: 'Archive & Retain', desc: 'Configure data retention policies and archive locations per compliance requirements.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Informal', desc: 'No defined stages or gates', focus: 'Stage Definition', color: '#4338ca' },
      { stage: 'Gated', desc: 'Stage gates exist, manual approvals', focus: 'Gate Reviews', color: '#8b5cf6' },
      { stage: 'Controlled', desc: 'Evidence required, audit trail', focus: 'Evidence Collection', color: '#a21caf' },
      { stage: 'Automated', desc: 'CI/CD gates, auto-promotion', focus: 'Pipeline Integration', color: '#ec4899' },
    ]}
  />
);

export const FinOpsGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use FinOps"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'View Spend', desc: 'See total AI spend, daily trends, and per-model cost breakdown.', color: '#4338ca' },
      { step: '2', title: 'Analyze Unit Costs', desc: 'Understand cost per decision, per token, and per use case.', color: '#8b5cf6' },
      { step: '3', title: 'Find Savings', desc: 'Review optimization recommendations: model substitution, caching, batching.', color: '#a21caf' },
      { step: '4', title: 'Allocate & Budget', desc: 'Set budgets, track utilization, enable showback/chargeback by team.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Crawl', desc: 'No cost visibility', focus: 'Cost Overview', color: '#4338ca' },
      { stage: 'Walk', desc: 'Know total spend', focus: 'Unit Economics', color: '#8b5cf6' },
      { stage: 'Run', desc: 'Optimizing actively', focus: 'Recommendations', color: '#a21caf' },
      { stage: 'Fly', desc: 'Automated optimization', focus: 'Full FinOps Culture', color: '#ec4899' },
    ]}
  />
);

export const ComplianceCenterGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Compliance Center"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Select Frameworks', desc: 'Choose applicable frameworks: SR 26-2, OSFI E-23, NIST AI RMF, EU AI Act, ISO 42001.', color: '#4338ca' },
      { step: '2', title: 'Assess Controls', desc: 'Review control status across domains. Identify gaps and remediation priorities.', color: '#8b5cf6' },
      { step: '3', title: 'Collect Evidence', desc: 'Upload documentation, screenshots, and test results for each control.', color: '#a21caf' },
      { step: '4', title: 'Generate Reports', desc: 'Export compliance reports and evidence packages for auditors.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Aware', desc: 'Frameworks identified, gaps unknown', focus: 'Framework Selection', color: '#4338ca' },
      { stage: 'Assessed', desc: 'Controls mapped, gaps documented', focus: 'Gap Analysis', color: '#8b5cf6' },
      { stage: 'Evidenced', desc: 'Artifacts collected, audit-ready', focus: 'Evidence Management', color: '#a21caf' },
      { stage: 'Certified', desc: 'Attested, continuously maintained', focus: 'Continuous Compliance', color: '#ec4899' },
    ]}
  />
);

export const RiskManagementGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Risk Management"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Review Dashboard', desc: 'See risk heatmap, OWASP Agentic AI threat coverage, and control effectiveness trends.', color: '#4338ca' },
      { step: '2', title: 'Real-Time Monitoring', desc: 'Monitor live risk signals with 5-tier alerts (CRITICAL→INFO), cascade scores, and blast radius metrics.', color: '#e11d48' },
      { step: '3', title: 'Third-Party Risk', desc: 'Track AI vendors (Anthropic, OpenAI, AWS Bedrock) with DDQ status, risk scores, and contract expiry.', color: '#f59e0b' },
      { step: '4', title: 'Policy as Code', desc: 'Deploy OPA/Rego policies for tool permissions, MCP allowlists, data classification, and human oversight.', color: '#10b981' },
    ]}
    maturityStages={[
      { stage: 'Initial', desc: 'Risk-aware but reactive', focus: 'Risk Register', color: '#ef4444' },
      { stage: 'Monitored', desc: 'Real-time signals active', focus: 'Monitoring Tab', color: '#f59e0b' },
      { stage: 'Governed', desc: 'Policies enforced via CI/CD', focus: 'Policy as Code', color: '#3b82f6' },
      { stage: 'Optimized', desc: 'Automated response, circuit breakers', focus: 'Full Automation', color: '#10b981' },
    ]}
    quickLinks={[
      { label: 'OWASP Agentic Threats', nav: 'register', color: '#e11d48' },
      { label: 'Real-Time Monitoring', nav: 'monitoring', color: '#f59e0b' },
      { label: 'Third-Party Risk', nav: 'third-party', color: '#f59e0b' },
      { label: 'Agent Profiles', nav: 'agent-profiles', color: '#8b5cf6' },
      { label: 'OPA Policies', nav: 'policy-as-code', color: '#10b981' },
    ]}
  />
);

export const AISafetyGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use AI Safety"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Assess', desc: 'Read the RAI Coverage Rubric across AWS\'s 8 Responsible-AI dimensions, then decompose exposure with MAESTRO threat modeling.', color: '#4338ca' },
      { step: '2', title: 'Prevent', desc: 'Gate deployment on the Frontier Capability Thresholds register — per-model CBRN/cyber/autonomy attestation (FMSF, RSP, Preparedness).', color: '#e11d48' },
      { step: '3', title: 'Assure', desc: 'Evidence safety with GSN/CAE Safety Cases and continuous Red-Team & Safety Evals (HarmBench, WMDP, AILuminate, Cybench).', color: '#f59e0b' },
      { step: '4', title: 'Respond', desc: 'Manage incidents and near-misses with EU AI Act Article 73 reporting clocks (2/10/15-day).', color: '#10b981' },
    ]}
    maturityStages={[
      { stage: 'Aware', desc: 'RAI dimensions mapped, gaps visible', focus: 'Coverage Rubric', color: '#ef4444' },
      { stage: 'Gated', desc: 'Frontier thresholds block risky deploys', focus: 'Capability Thresholds', color: '#f59e0b' },
      { stage: 'Assured', desc: 'Safety cases + evals evidence each release', focus: 'Safety Cases', color: '#3b82f6' },
      { stage: 'Responsive', desc: 'Incident clocks + near-miss learning loop', focus: 'Incident Management', color: '#10b981' },
    ]}
  />
);

export const AuditIncidentsGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Audit & Incidents"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Review Audit Trail', desc: 'See all governance events: approvals, policy changes, model updates, access logs.', color: '#4338ca' },
      { step: '2', title: 'Investigate Incidents', desc: 'Drill into security incidents, policy violations, and anomalies.', color: '#8b5cf6' },
      { step: '3', title: 'Track Risk Trends', desc: 'Monitor 30-day risk trends across compliance, security, and operational domains.', color: '#a21caf' },
      { step: '4', title: 'Export Evidence', desc: 'Generate audit reports and incident timelines for regulatory review.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Logging', desc: 'Events captured, no analysis', focus: 'Audit Trail', color: '#4338ca' },
      { stage: 'Reviewed', desc: 'Regular log reviews, manual triage', focus: 'Incident Triage', color: '#8b5cf6' },
      { stage: 'Correlated', desc: 'Cross-system analysis, root cause', focus: 'Trend Analysis', color: '#a21caf' },
      { stage: 'Predictive', desc: 'Anomaly detection, auto-escalation', focus: 'Proactive Response', color: '#ec4899' },
    ]}
  />
);

export const FleetOverviewGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Fleet Overview"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'View Fleet Posture', desc: 'See 5-pillar control plane status, OWASP alignment, and emergency control readiness.', color: '#4338ca' },
      { step: '2', title: 'Analyze Agent Chains', desc: 'Visualize agent execution paths with tools, MCP servers, IAM roles, network flows, and risk metrics (cascade, blast radius, human gates).', color: '#8b5cf6' },
      { step: '3', title: 'Review Risk Heatmap', desc: 'Identify high-risk use cases across 5 dimensions with GO/NO GO decisions.', color: '#a21caf' },
      { step: '4', title: 'Monitor Guardrails', desc: 'Track real-time guardrail metrics: blocked content, PII detections, grounding checks.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Scattered', desc: 'Agents deployed, no visibility', focus: 'Agent Inventory', color: '#ef4444' },
      { stage: 'Visible', desc: 'Fleet dashboard, basic chains', focus: 'Chain Visualization', color: '#f59e0b' },
      { stage: 'Governed', desc: 'Risk metrics, human gates tracked', focus: 'Risk Analysis', color: '#3b82f6' },
      { stage: 'Automated', desc: 'Circuit breakers, kill switches ready', focus: 'Emergency Controls', color: '#10b981' },
    ]}
    quickLinks={[
      { label: 'Agent Chain Analysis', nav: 'fleet', color: '#4338ca' },
      { label: 'Risk Heatmap', nav: 'fleet', color: '#e11d48' },
      { label: 'Emergency Controls', nav: 'fleet', color: '#f59e0b' },
      { label: 'Guardrail Metrics', nav: 'fleet', color: '#10b981' },
    ]}
  />
);

export const TrustStackGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Trust Stack"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Understand Layers', desc: 'Review the 3-layer trust architecture: Foundation, Guardrails, Governance.', color: '#4338ca' },
      { step: '2', title: 'Check Layer Health', desc: 'Each layer shows status indicators for its key components.', color: '#8b5cf6' },
      { step: '3', title: 'Explore Components', desc: 'Click into any layer to see detailed configuration and metrics.', color: '#a21caf' },
      { step: '4', title: 'Validate Integration', desc: 'Ensure all layers are connected and working together.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Foundation', desc: 'Basic infra, no guardrails', focus: 'Platform Setup', color: '#4338ca' },
      { stage: 'Protected', desc: 'Guardrails active, basic policies', focus: 'Guardrail Config', color: '#8b5cf6' },
      { stage: 'Governed', desc: 'Full 3-layer coverage, audited', focus: 'Governance Layer', color: '#a21caf' },
      { stage: 'Integrated', desc: 'Layers connected, auto-enforced', focus: 'End-to-End Trust', color: '#ec4899' },
    ]}
  />
);

export const DataGovernanceGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Data Governance"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Assess Readiness', desc: 'Complete the 7-dimension AI Data Readiness assessment and maturity self-assessment.', color: '#22d3ee' },
      { step: '2', title: 'Map Lineage', desc: 'Trace data from source systems through transformations to AI model consumption.', color: '#8b5cf6' },
      { step: '3', title: 'Verify Provenance', desc: 'Ensure cryptographic integrity verification and chain of custody for all AI-feeding datasets.', color: '#ef4444' },
      { step: '4', title: 'Assign Ownership', desc: 'Define domain stewards, data product SLAs, and cross-domain sharing agreements.', color: '#10b981' },
    ]}
    maturityStages={[
      { stage: 'Initial', desc: 'Ad-hoc data handling, no lineage', focus: 'AI Readiness', color: '#ef4444', nav: '/govern/data/readiness' },
      { stage: 'Developing', desc: 'Basic classification, manual tracking', focus: 'Lineage Mapping', color: '#f59e0b', nav: '/govern/data/lineage' },
      { stage: 'Defined', desc: 'Automated quality rules, domain ownership', focus: 'Quality & Domains', color: '#3b82f6', nav: '/govern/data/quality' },
      { stage: 'Optimizing', desc: 'Full lifecycle governance, AI-ready data', focus: 'Data Products', color: '#10b981', nav: '/govern/data/glossary' },
    ]}
  />
);

export const GuardrailsGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="Getting Started with Guardrails"
    variant="landing"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Browse FSI Templates', desc: 'Explore 9 pre-configured templates aligned with FSI use cases (B01, R01, C01, etc.) and regulatory frameworks.', color: '#3b82f6' },
      { step: '2', title: 'Create Guardrail', desc: 'Start from an FSI template or configure from scratch with content filters, PII detection, denied topics, and grounding.', color: '#8b5cf6' },
      { step: '3', title: 'Deploy to Bedrock', desc: 'Push your guardrail configuration to AWS Bedrock Guardrails for real-time protection.', color: '#10b981' },
      { step: '4', title: 'Monitor & Iterate', desc: 'Track guardrail events, blocked content, and PII detections in the Observability dashboard.', color: '#f59e0b' },
    ]}
    maturityStages={[
      { stage: 'Unprotected', desc: 'No guardrails deployed', focus: 'FSI Templates', color: '#ef4444', nav: 'fsi-library' },
      { stage: 'Basic', desc: 'Content filters active', focus: 'Create Guardrail', color: '#f59e0b', nav: 'create' },
      { stage: 'Compliant', desc: 'PII, topics, grounding enabled', focus: 'Full Configuration', color: '#3b82f6', nav: 'create' },
      { stage: 'Monitored', desc: 'Real-time observability, tuning', focus: 'Observability', color: '#10b981', nav: 'observability' },
    ]}
    quickLinks={[
      { label: 'FSI Templates', nav: 'fsi-library', color: '#3b82f6' },
      { label: 'Create Guardrail', nav: 'create', color: '#8b5cf6' },
      { label: 'My Guardrails', nav: 'templates', color: '#10b981' },
      { label: 'Observability', nav: 'observability', color: '#f59e0b' },
    ]}
  />
);

export const AgentRegistryGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Agent Registry"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Inventory Agents', desc: 'Every deployed agent with its scope level, owner, business purpose, rate limits, and incident history. Click a row for the full Agent 360.', color: '#4338ca' },
      { step: '2', title: 'Review Providers', desc: 'See agent distribution across AWS, Azure, GCP, and SaaS platforms. Track governance status and costs by provider.', color: '#0078D4' },
      { step: '3', title: 'Audit Permissions', desc: 'Use the matrix to verify agent→tool and agent-to-agent (A2A) authorization, plus user-rights propagation.', color: '#a21caf' },
      { step: '4', title: 'Close Gaps', desc: 'Spot pending approvals, high-scope agents, and open incidents — then route shadow assets here to register them.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Unknown', desc: 'Agents deployed, no inventory', focus: 'Registration', color: '#4338ca' },
      { stage: 'Catalogued', desc: 'Agents listed with owners & scope', focus: 'Capabilities', color: '#8b5cf6' },
      { stage: 'Multi-Provider', desc: 'Agents across AWS, Azure, GCP, SaaS', focus: 'Providers Tab', color: '#0078D4' },
      { stage: 'Governed', desc: 'Full identity, approvals, incidents', focus: 'Continuous Oversight', color: '#ec4899' },
    ]}
  />
);

export const ShadowAIGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Shadow AI Detection"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Review Coverage', desc: 'See governed-vs-shadow coverage by asset type — every shadow asset is a gap between what is registered and what is running.', color: '#e11d48' },
      { step: '2', title: 'Understand Signals', desc: 'Detection is a pipeline: CloudTrail, VPC Flow Logs, Macie, and Config feed EventBridge, which diffs against the Agent Registry.', color: '#f97316' },
      { step: '3', title: 'Triage Findings', desc: 'Work detected assets by severity. Each shows the suspected owner, the AWS signal that found it, and the risk it poses.', color: '#f59e0b' },
      { step: '4', title: 'Route to Governance', desc: 'Onboard legitimate assets via Service Approval, or block them — making the governed path the easy path.', color: '#8b5cf6' },
    ]}
    maturityStages={[
      { stage: 'Blind', desc: 'No visibility into ungoverned AI', focus: 'Enable Signals', color: '#e11d48' },
      { stage: 'Detecting', desc: 'CloudTrail & Config signals active', focus: 'Detection Sources', color: '#f59e0b' },
      { stage: 'Triaging', desc: 'Findings worked by severity', focus: 'Remediation', color: '#3b82f6' },
      { stage: 'Converging', desc: 'Governed path is the easy path', focus: 'Self-Service Onboarding', color: '#10b981' },
    ]}
  />
);

export const PolicyAsCodeGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Policy as Code"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Browse Policies', desc: 'View 15 OPA/Rego policies covering tool permissions, MCP allowlists, data classification, chain depth, and human oversight.', color: '#4338ca' },
      { step: '2', title: 'Review Code', desc: 'Click any policy to see its Rego code with violation rules, remediation messages, and severity levels.', color: '#8b5cf6' },
      { step: '3', title: 'Check Executions', desc: 'Monitor policy evaluation results — pass/fail/warn — across all agent deployments with remediation guidance.', color: '#a21caf' },
      { step: '4', title: 'Integrate CI/CD', desc: 'Use the GitHub Actions / GitLab CI examples and Policy Check API to enforce governance gates before production.', color: '#10b981' },
    ]}
    maturityStages={[
      { stage: 'Manual', desc: 'Ad-hoc policy checks', focus: 'Policy Library', color: '#ef4444' },
      { stage: 'Defined', desc: 'Policies documented in code', focus: 'Rego Policies', color: '#f59e0b' },
      { stage: 'Enforced', desc: 'CI/CD gates block violations', focus: 'Pipeline Integration', color: '#3b82f6' },
      { stage: 'Automated', desc: 'Dynamic policy updates, auto-remediation', focus: 'Full GitOps', color: '#10b981' },
    ]}
    quickLinks={[
      { label: 'Tool Permissions', nav: 'policy-as-code', color: '#ef4444' },
      { label: 'MCP Allowlist', nav: 'policy-as-code', color: '#f59e0b' },
      { label: 'Data Classification', nav: 'policy-as-code', color: '#8b5cf6' },
      { label: 'Human Oversight', nav: 'policy-as-code', color: '#10b981' },
      { label: 'Chain Depth Limits', nav: 'policy-as-code', color: '#4338ca' },
    ]}
  />
);

export const WorkflowsGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Governance Workflows"
    variant="submodule"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Select Workflow', desc: 'Choose from 9 pre-built workflows across Compliance, Security, Risk, Operations, and Data categories.', color: '#4338ca' },
      { step: '2', title: 'Run Assessment', desc: 'Workflows analyze your live AVA data (guardrails, policies, use cases) and execute multi-step agent chains.', color: '#8b5cf6' },
      { step: '3', title: 'Review Findings', desc: 'Each step surfaces actionable findings with severity levels and direct links to remediation pages.', color: '#a21caf' },
      { step: '4', title: 'Export & Act', desc: 'Download JSON reports for evidence. Follow recommendations to close gaps and improve posture.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Manual', desc: 'Ad-hoc checks, no automation', focus: 'Run First Workflow', color: '#4338ca' },
      { stage: 'Simulated', desc: 'Workflows run with real data queries', focus: 'Review Findings', color: '#8b5cf6' },
      { stage: 'Deployed', desc: 'Real agents via AgentCore/App Factory', focus: 'Deploy Agents', color: '#a21caf' },
      { stage: 'Continuous', desc: 'Scheduled runs, auto-remediation', focus: 'Full Automation', color: '#ec4899' },
    ]}
    quickLinks={[
      { label: 'App Factory', nav: '/applications/app-factory', color: '#10b981' },
      { label: 'MCP Tools', nav: '/capabilities/tools', color: '#8b5cf6' },
      { label: 'Compliance Center', nav: '/govern/compliance', color: '#4338ca' },
      { label: 'Risk Management', nav: '/govern/risk', color: '#e11d48' },
    ]}
  />
);

export const HumanOversightGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Human Oversight"
    variant="submodule"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Define HITL Gates', desc: 'Create gates that pause agent execution when risk thresholds, data sensitivity, or compliance requirements trigger.', color: '#f59e0b' },
      { step: '2', title: 'Configure Approvers', desc: 'Assign primary approvers and escalation paths. Set timeout actions (auto-deny, escalate, or auto-approve).', color: '#ea580c' },
      { step: '3', title: 'Integrate AWS Services', desc: 'Connect gates to Bedrock RETURN_CONTROL, A2I workflows, Step Functions callbacks, or SNS notifications.', color: '#dc2626' },
      { step: '4', title: 'Monitor & Audit', desc: 'Track approval queue, response times, and decision history. Export audit trails for compliance evidence.', color: '#b91c1c' },
    ]}
    maturityStages={[
      { stage: 'Manual', desc: 'Ad-hoc human reviews, no gates', focus: 'Define First Gate', color: '#f59e0b' },
      { stage: 'Gated', desc: 'HITL gates active on high-risk actions', focus: 'AWS Integration', color: '#ea580c' },
      { stage: 'Integrated', desc: 'Full AWS service integration (A2I, Step Functions)', focus: 'Escalation Paths', color: '#dc2626' },
      { stage: 'Optimized', desc: 'Dynamic gates, SLA monitoring, continuous improvement', focus: 'Analytics & Tuning', color: '#b91c1c' },
    ]}
    quickLinks={[
      { label: 'Agent Registry', nav: '/govern/agents', color: '#8b5cf6' },
      { label: 'Risk Management', nav: '/govern/risk', color: '#e11d48' },
      { label: 'A2A Governance', nav: '/govern/agents?tab=a2a', color: '#0891b2' },
      { label: 'Compliance Center', nav: '/govern/compliance', color: '#4338ca' },
    ]}
  />
);

export const A2AGovernanceGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use A2A Governance"
    variant="submodule"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Register Agents', desc: 'Add all agents to the trust network with type (orchestrator, supervisor, specialist, worker) and trust level.', color: '#0891b2' },
      { step: '2', title: 'Define Trust Policies', desc: 'Create policies specifying which agents can invoke which, allowed actions, data classifications, and rate limits.', color: '#0d9488' },
      { step: '3', title: 'Configure Protocols', desc: 'Set up message schemas, validation rules, and AWS service integrations (EventBridge, Step Functions, IAM).', color: '#059669' },
      { step: '4', title: 'Monitor A2A Traffic', desc: 'Review audit trail for all inter-agent communications. Identify denied requests and policy violations.', color: '#047857' },
    ]}
    maturityStages={[
      { stage: 'Unmanaged', desc: 'Agents communicate freely, no policies', focus: 'Inventory Agents', color: '#0891b2' },
      { stage: 'Defined', desc: 'Trust policies established, basic controls', focus: 'Define Policies', color: '#0d9488' },
      { stage: 'Enforced', desc: 'Policies enforced via IAM/EventBridge, violations blocked', focus: 'AWS Integration', color: '#059669' },
      { stage: 'Governed', desc: 'Full observability, dynamic trust, continuous monitoring', focus: 'Analytics & Tuning', color: '#047857' },
    ]}
    quickLinks={[
      { label: 'Agent Registry', nav: '/govern/agents', color: '#8b5cf6' },
      { label: 'Human Oversight', nav: '/govern/agents?tab=human-oversight', color: '#f59e0b' },
      { label: 'Fleet Overview', nav: '/govern/fleet', color: '#4338ca' },
      { label: 'Policy as Code', nav: '/govern/risk', color: '#6366f1' },
    ]}
  />
);

export const CommandCenterGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Command Center"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Review Trust Score', desc: 'See the aggregated trust score across your AI fleet with breakdown by guardrails, policies, compliance, and security.', color: '#4338ca' },
      { step: '2', title: 'Check Compliance', desc: 'View framework compliance status — SR 26-2, NIST AI RMF, EU AI Act, ISO 42001 — with quick links to gaps.', color: '#8b5cf6' },
      { step: '3', title: 'Monitor Risk', desc: 'Track risk exposure metrics, active alerts, and OWASP Agentic AI threat coverage in real-time.', color: '#e11d48' },
      { step: '4', title: 'Drill Down', desc: 'Click any metric card to navigate directly to the relevant governance module for detailed analysis.', color: '#ec4899' },
    ]}
    maturityStages={[
      { stage: 'Blind', desc: 'No aggregated view, siloed metrics', focus: 'Deploy Command Center', color: '#ef4444' },
      { stage: 'Visible', desc: 'Metrics aggregated, manual review', focus: 'Trust Score Tracking', color: '#f59e0b' },
      { stage: 'Proactive', desc: 'Alerts configured, trends monitored', focus: 'Alert Configuration', color: '#3b82f6' },
      { stage: 'Optimized', desc: 'Automated actions, predictive insights', focus: 'Full Automation', color: '#10b981' },
    ]}
    quickLinks={[
      { label: 'Fleet Overview', nav: '/govern/fleet', color: '#4338ca' },
      { label: 'Risk Management', nav: '/govern/risk', color: '#e11d48' },
      { label: 'Compliance Center', nav: '/govern/compliance', color: '#8b5cf6' },
      { label: 'FinOps', nav: '/govern/finops', color: '#ec4899' },
    ]}
  />
);

export const ProvidersGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Providers"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Review Distribution', desc: 'See agent counts across AWS, Azure, GCP, ServiceNow, Salesforce, and other providers in one view.', color: '#FF9900' },
      { step: '2', title: 'Check Governance', desc: 'Track compliance status by provider — identify which providers have agents needing review or blocked.', color: '#0078D4' },
      { step: '3', title: 'Compare Costs', desc: 'Analyze monthly costs by provider to optimize spend and identify consolidation opportunities.', color: '#4285F4' },
      { step: '4', title: 'Drill Into Details', desc: 'Click any provider to filter the Agents tab and see detailed per-agent metrics.', color: '#6366f1' },
    ]}
    maturityStages={[
      { stage: 'Single Cloud', desc: 'Agents on one provider only', focus: 'Connect Providers', color: '#FF9900' },
      { stage: 'Multi-Provider', desc: 'Agents across 2+ providers', focus: 'Unified Inventory', color: '#0078D4' },
      { stage: 'Unified', desc: 'Single pane of glass, consistent policies', focus: 'Cross-Provider Policies', color: '#4285F4' },
      { stage: 'Optimized', desc: 'Cost/performance optimization', focus: 'FinOps Integration', color: '#10b981' },
    ]}
    quickLinks={[
      { label: 'All Agents', nav: 'agents', color: '#8b5cf6' },
      { label: 'Third-Party Risk', nav: '/govern/risk?tab=third-party', color: '#f59e0b' },
      { label: 'Cost & FinOps', nav: '/govern/finops', color: '#ec4899' },
    ]}
  />
);

export const ThirdPartyRiskGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Third-Party Risk"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Review Vendors', desc: 'See all AI vendors (Anthropic, OpenAI, AWS Bedrock, etc.) with tier, status, and risk scores.', color: '#f59e0b' },
      { step: '2', title: 'Check DDQ Status', desc: 'Track due diligence questionnaire completion — overdue DDQs are flagged for immediate action.', color: '#ea580c' },
      { step: '3', title: 'Monitor Findings', desc: 'Review open findings and controls linked to third-party risks from the Risk Register.', color: '#dc2626' },
      { step: '4', title: 'Manage Contracts', desc: 'Track contract expiry dates and schedule reassessments before renewals.', color: '#b91c1c' },
    ]}
    maturityStages={[
      { stage: 'Ad-hoc', desc: 'No formal vendor tracking', focus: 'Add Vendors', color: '#ef4444' },
      { stage: 'Registered', desc: 'Vendors tracked, basic contracts', focus: 'Complete DDQ', color: '#f59e0b' },
      { stage: 'Assessed', desc: 'DDQ complete, risks documented', focus: 'Monitor Findings', color: '#3b82f6' },
      { stage: 'Governed', desc: 'Continuous monitoring, exit plans ready', focus: 'Automate Alerts', color: '#10b981' },
    ]}
    quickLinks={[
      { label: 'Risk Register', nav: 'register', color: '#e11d48' },
      { label: 'Controls', nav: 'controls', color: '#8b5cf6' },
      { label: 'Agent Registry', nav: '/govern/agents', color: '#0ea5e9' },
    ]}
  />
);

export const MultiCloudGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Use Multi-Cloud Governance"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'View Overview', desc: 'See all providers (AWS, Azure, GCP, SaaS) with agent counts, costs, and compliance status at a glance.', color: '#FF9900' },
      { step: '2', title: 'Compare Features', desc: 'Use the radar chart and matrix to compare guardrails, tracing, policy, and cost controls across providers.', color: '#0078D4' },
      { step: '3', title: 'Plan Migrations', desc: 'Review migration scenarios with complexity assessments, considerations, and benefits for consolidation.', color: '#4285F4' },
      { step: '4', title: 'Optimize Costs', desc: 'Identify consolidation savings, model optimization opportunities, and reserved capacity discounts.', color: '#10b981' },
    ]}
    maturityStages={[
      { stage: 'Single Cloud', desc: 'Agents on one provider', focus: 'Inventory All', color: '#FF9900' },
      { stage: 'Multi-Provider', desc: 'Agents across 2+ providers', focus: 'Unified View', color: '#0078D4' },
      { stage: 'Unified Policies', desc: 'Consistent governance cross-cloud', focus: 'Cedar Policies', color: '#4285F4' },
      { stage: 'Optimized', desc: 'Cost/performance balanced', focus: 'FinOps', color: '#10b981' },
    ]}
    quickLinks={[
      { label: 'Agent Registry', nav: '/govern/agents', color: '#8b5cf6' },
      { label: 'Cost & FinOps', nav: '/govern/finops', color: '#ec4899' },
      { label: 'Policies', nav: '/secure/policy', color: '#0ea5e9' },
    ]}
  />
);

export const AgenticCodingGuide = ({ onNavigate }: { onNavigate?: (nav: string) => void }) => (
  <ModuleGuide
    title="How to Govern Agentic Coding Tools"
    onNavigate={onNavigate}
    steps={[
      { step: '1', title: 'Inventory Tools', desc: 'Discover all coding assistants in use — Claude Code, Kiro, Copilot, Cursor, Q Developer. Check sanctioned vs shadow usage.', color: '#8b5cf6' },
      { step: '2', title: 'Verify API Routing', desc: 'Ensure tools route through governed APIs (Bedrock, Azure OpenAI). Direct API calls bypass guardrails and audit logging.', color: '#FF9900' },
      { step: '3', title: 'Set Context Filters', desc: 'Exclude sensitive repos from AI context. Enable PII masking and secrets filtering to protect proprietary code.', color: '#ef4444' },
      { step: '4', title: 'Enforce Policies', desc: 'Block unsanctioned tools, require enterprise tiers, set usage quotas. Route Claude Code through Bedrock for full governance.', color: '#10b981' },
    ]}
    maturityStages={[
      { stage: 'Discovery', desc: 'Identify tools in use', focus: 'Shadow Detection', color: '#ef4444' },
      { stage: 'Sanctioning', desc: 'Approve governed tools', focus: 'API Routing', color: '#f59e0b' },
      { stage: 'Policy Enforcement', desc: 'Context filters active', focus: 'Exclusions', color: '#0ea5e9' },
      { stage: 'Full Governance', desc: 'All tools through Bedrock', focus: 'Audit Complete', color: '#10b981' },
    ]}
    quickLinks={[
      { label: 'Shadow AI', nav: '/govern/shadow-ai', color: '#ef4444' },
      { label: 'Multi-Cloud', nav: '/govern/multi-cloud', color: '#0078D4' },
      { label: 'Guardrails', nav: '/secure/guardrails', color: '#10b981' },
    ]}
  />
);