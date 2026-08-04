/**
 * TrustStack3Layer — 3-Layer Trust Stack view for AVA Platform
 *
 * Shows ACTUAL implementation status of AVA capabilities:
 * - Layer 1 (75%): Guardrails done, Service Onboarding done, Tools coming, Knowledge partial
 * - Layer 2 (85%): FSI Foundry done, Deployments done, Custom Agents coming, Model Registry UI-only
 * - Layer 3 (45%): Frontier Agents 2/3, Govern UI ready but needs backend data
 *
 * Status markers: 'done' (implemented), 'partial' (UI-only / coming soon), 'todo' (not started)
 *
 * Integration opportunities (roadmap):
 * - Explainability engine (LIME, SHAP, adverse action notices)
 * - Live compliance control tracking (not just framework mapping)
 * - Real-time agent monitoring with actual metrics
 * - Model inventory with attestation workflow
 */
import { useMemo, useState } from 'react';
import { Icon, type IconName } from './icons';
import { downloadJSON, dateStamp } from './exportUtils';
import { AGENT_SCOPE_META, type AgentScopeLevel } from './autonomyLadder';
import useGovernanceAggregator, { type GovernanceAggregatorResult } from './useGovernanceAggregator';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import { useLiveKPIs } from './useLiveKPIs';
import { useGuardrailMetrics } from './useGuardrailMetrics';

type Status = 'done' | 'partial' | 'todo';

interface Capability {
  status: Status;
  text: string;
}

function statusIcon(status: Status) {
  if (status === 'done') return <Icon name="check-circle" className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2} />;
  if (status === 'partial') return <Icon name="circle-half" className="w-3.5 h-3.5 text-amber-500" strokeWidth={2} />;
  return <Icon name="circle" className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />;
}

// ─────────────────────────── Types ───────────────────────────
interface KPI {
  label: string;
  value: string | number;
  sub: string;
  color: string;
}

interface Module {
  label: string;
  icon: IconName;
  desc: string;
  route?: string;
}

interface KeyControl {
  id: string;
  name: string;
  status: 'Active' | 'Pending' | 'Review';
}

interface AwsServiceMapping {
  service: string;
  challenge: string;
  solves: string;
  features: string[];
}

interface LoDActivity {
  title: string;
  how: string;
}

interface LineOfDefense {
  role: string;
  subtitle: string;
  activities: LoDActivity[];
}

interface ThreeLoD {
  first: LineOfDefense;
  second: LineOfDefense;
  third: LineOfDefense;
}

interface FrontierAgent {
  agent: string;
  role: string;
  description: string;
  capabilities: string[];
  govRelevance: string;
  status: 'Available' | 'Coming Soon' | 'Preview';
}

interface Layer {
  id: number;
  label: string;
  name: string;
  question: string;
  color: string;
  bgGradient: string;
  score: number;
  kpis: KPI[];
  capabilities: Capability[];
  modules: Module[];
  keyControls: KeyControl[];
  awsServices: string[];
  awsServiceMap: AwsServiceMapping[];
  threeLoD: ThreeLoD;
  frontierAgents?: FrontierAgent[];
  oldLayers: string[];
  /** Build-side GenAI sourcing scopes this layer serves (3–5). */
  genaiScopes: number[];
  /** Agentic agency levels that operate at this layer (L1–L4, canonical AGENT_SCOPE_META). */
  agencyLevels: AgentScopeLevel[];
}

// ─────────────────────────── Readiness scores ───────────────────────────
// Baseline (illustrative) readiness — the platform-capability breadth story,
// used as a fallback when no live estate signals are present (fresh install /
// backend unreachable). When the aggregator returns real signals, the layers
// are graded live by computeLayerReadiness() below instead.
const L1_BASELINE = 80; // Guardrails + agent identity/registry + MCP governance
const L2_BASELINE = 85; // FSI Foundry + deployments + model registry/eval gate
const L3_BASELINE = 65; // Agentic governance surfaces built; telemetry partial

/** Result of grading one layer from live signals (or the baseline fallback). */
interface LayerReadiness {
  score: number;
  /** True when the score is computed from real estate signals, not the baseline. */
  live: boolean;
  /** Short "what fed this" note for the tooltip/caption. */
  basis: string;
}

/**
 * Grade each layer's readiness from REAL useGovernanceAggregator signals.
 *
 * Honesty rules:
 * - Only real signal families feed the score. Model-registry counts are mock in
 *   this edition (aggregator hardcodes totalModels), so they're excluded.
 * - Each layer averages a set of 0..1 "dimension" ratios drawn from live data.
 * - If a layer has NO live signal to grade (empty estate), it falls back to the
 *   documented baseline and is marked live:false so the UI can say so.
 */
function computeLayerReadiness(agg: GovernanceAggregatorResult): Record<number, LayerReadiness> {
  const s = agg.summary;
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const pct = (n: number) => Math.round(clamp01(n) * 100);

  // ── Layer 1 · Foundation — guardrails, agent identity/registry, Cedar policy ──
  const guardrailTotal = s.guardrailsActive + s.guardrailsDraft + s.guardrailsFailed;
  const l1Dims: number[] = [];
  if (guardrailTotal > 0) l1Dims.push(s.guardrailsActive / guardrailTotal);       // guardrail health
  if (s.totalAgents > 0) l1Dims.push(agg.policyMetricsTotal.activePolicies > 0 ? 1 : 0.4); // agents governed by policy
  if (agg.policyMetricsTotal.totalPolicies > 0) l1Dims.push(agg.policyMetricsTotal.activePolicies / agg.policyMetricsTotal.totalPolicies); // policy activation
  const l1 = l1Dims.length
    ? { score: pct(l1Dims.reduce((a, b) => a + b, 0) / l1Dims.length), live: true, basis: `${s.guardrailsActive} active guardrails · ${agg.policyMetricsTotal.activePolicies} active policies · ${s.totalAgents} agents` }
    : { score: L1_BASELINE, live: false, basis: 'illustrative baseline — no live guardrail/policy signals yet' };

  // ── Layer 2 · Production — use-case lifecycle, risk scoring, deployments ──
  const deployTotal = s.deploymentsActive + s.deploymentsPending + s.deploymentsFailed;
  const l2Dims: number[] = [];
  if (s.totalUseCases > 0) l2Dims.push(s.deployedUseCases / s.totalUseCases);       // lifecycle progress to production
  if (s.totalUseCases > 0) l2Dims.push(agg.useCaseRiskHeatmap.length / s.totalUseCases); // risk-scored coverage
  if (deployTotal > 0) l2Dims.push(s.deploymentsActive / deployTotal);             // deployment health
  const l2 = l2Dims.length
    ? { score: pct(l2Dims.reduce((a, b) => a + b, 0) / l2Dims.length), live: true, basis: `${s.deployedUseCases}/${s.totalUseCases} use cases in production · ${agg.useCaseRiskHeatmap.length} risk-scored · ${s.deploymentsActive} active deployments` }
    : { score: L2_BASELINE, live: false, basis: 'illustrative baseline — no live use-case/deployment signals yet' };

  // ── Layer 3 · Scale — governance controls evidenced, runtime telemetry, approvals ──
  const l3Dims: number[] = [];
  if (agg.controlStats.total > 0) l3Dims.push(agg.controlStats.implemented / agg.controlStats.total); // governance control checklist
  if (agg.guardrailMetricsTotal.totalInvocations > 0) l3Dims.push(1);              // live runtime telemetry present
  if (agg.serviceApprovalRuns.length > 0) l3Dims.push(agg.serviceApprovalRuns.filter(r => r.status === 'completed').length / agg.serviceApprovalRuns.length); // approval completion
  const l3 = l3Dims.length
    ? { score: pct(l3Dims.reduce((a, b) => a + b, 0) / l3Dims.length), live: true, basis: `${agg.controlStats.percentage}% controls evidenced · ${agg.guardrailMetricsTotal.totalInvocations > 0 ? 'runtime telemetry live' : 'no telemetry'} · ${agg.serviceApprovalRuns.length} approval runs` }
    : { score: L3_BASELINE, live: false, basis: 'illustrative baseline — no live control/telemetry signals yet' };

  return { 1: l1, 2: l2, 3: l3 };
}

/**
 * Grade the OPERATING-MODEL readiness (Step 3) from the operating models the
 * aggregator already fetches from Plan. Real signals: assessment completion,
 * maturity level (1–5), and whether a target pattern has been chosen. Falls back
 * to an illustrative baseline when no operating model has been started.
 */
function computeOperateReadiness(agg: GovernanceAggregatorResult): LayerReadiness & { maturityLevel: number | null; pattern: string | null } {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const pct = (n: number) => Math.round(clamp01(n) * 100);
  const oms = agg.operatingModels;
  if (!oms.length) {
    return { score: 40, live: false, basis: 'illustrative baseline — no operating model designed yet (start one in Plan)', maturityLevel: null, pattern: null };
  }
  // Use the most mature/complete operating model as the estate's posture.
  const best = oms.reduce((a, b) => ((b.computed?.composite ?? 0) > (a.computed?.composite ?? 0) ? b : a));
  const c = best.computed;
  const dims: number[] = [];
  if (c) {
    dims.push(clamp01(c.completion));            // assessment answered (0–1)
    dims.push(clamp01(c.maturity_level / 5));    // maturity on a 5-point ladder
  }
  dims.push(best.pattern ? 1 : 0.5);             // target operating pattern chosen
  return {
    score: pct(dims.reduce((a, b) => a + b, 0) / dims.length),
    live: true,
    basis: `${oms.length} operating model${oms.length > 1 ? 's' : ''} · maturity L${c?.maturity_level ?? '—'} · ${Math.round((c?.completion ?? 0) * 100)}% assessed`,
    maturityLevel: c?.maturity_level ?? null,
    pattern: best.pattern || null,
  };
}

// ─────────────────────────── 3-Layer Data (AVA actual implementation status) ───────────────────────────
const LAYERS: Layer[] = [
  {
    id: 3,
    label: 'LAYER 3',
    name: 'Observe and Scale',
    question: 'How can we govern autonomous agents, prove AI safety, and roll up compliance?',
    color: '#3b82f6', // blue-500 — Layer 3 (Scale)
    bgGradient: 'from-blue-50 to-slate-50',
    score: L3_BASELINE,
    kpis: [
      { label: 'AI Safety', value: '6', sub: 'safety surfaces', color: '#1e40af' },
      { label: 'RAI Coverage', value: '8-dim', sub: 'AWS RAI rubric', color: '#1e3a8a' },
      { label: 'Command Center', value: 'Live', sub: 'scorecard roll-up', color: '#1e40af' },
      { label: 'Fleet & FinOps', value: 'Live', sub: 'posture + TCO', color: '#1d4ed8' },
    ],
    capabilities: [
      { status: 'done',    text: 'AI Safety module — RAI coverage rubric, frontier capability thresholds, safety cases, red-team evals, incident management' },
      { status: 'done',    text: 'Threat Modeling — MAESTRO 7-layer + OWASP Agentic T1–T17, capability → control → residual' },
      { status: 'done',    text: 'Command Center — governance scorecard roll-up across risk, audit, data, FinOps, model (shared metric contract)' },
      { status: 'done',    text: 'Agentic Fleet — health, autonomy posture, kill-switch, cost & Collaboration-TCO (human↔agent spectrum)' },
      { status: 'done',    text: 'Frontier Agents — AWS DevOps and Security agents (Available); Kiro agentic IDE (Coming Soon)' },
      { status: 'partial', text: 'Live runtime telemetry — guardrail/CloudWatch signals feed the scorecard where wired; rest illustrative in this edition' },
      { status: 'partial', text: 'Model explainability — SHAP/LIME + bias/fairness surfaced in Model Management; adverse-action notices roadmap' },
    ],
    modules: [
      { label: 'AI Safety',       icon: 'shield-check',    desc: '6 surfaces, RAI 8-dim',    route: '/govern/safety' },
      { label: 'Command Center',  icon: 'chart-bar',       desc: 'scorecard roll-up',        route: '/govern/command-center' },
      { label: 'Agentic Fleet',   icon: 'cpu-chip',        desc: 'posture + kill-switch',    route: '/govern/fleet' },
      { label: 'FinOps',          icon: 'currency-dollar', desc: 'cost + Collaboration TCO', route: '/govern/finops' },
      { label: 'Audit & Incidents', icon: 'clipboard-list', desc: 'trail + EU Art.73 clocks', route: '/govern/audit' },
    ],
    keyControls: [
      { id: 'OBS-001', name: 'AI Safety Module (RAI rubric + evals)', status: 'Active' },
      { id: 'OBS-002', name: 'MAESTRO Threat Modeling', status: 'Active' },
      { id: 'OBS-003', name: 'Governance Scorecard Roll-up', status: 'Active' },
      { id: 'OBS-004', name: 'Live Runtime Telemetry Integration', status: 'Pending' },
    ],
    awsServices: ['Bedrock AgentCore', 'CloudWatch', 'CloudTrail', 'Cost Explorer'],
    awsServiceMap: [
      { service: 'Amazon Bedrock AgentCore', challenge: 'How do we govern autonomous agents at scale?', solves: 'Agent runtime, memory, identity, and tool exposure via Gateway with full observability', features: ['Runtime', 'Memory', 'Identity', 'Gateway (MCP tools)', 'Observability'] },
      { service: 'Amazon CloudWatch', challenge: 'How do we know when AI systems degrade?', solves: 'Real-time metrics, alarms, dashboards for latency, errors, drift, and quality scores', features: ['Custom AI Metrics', 'Composite Alarms', 'Real-time Dashboards', 'Anomaly Detection', 'Logs Insights'] },
      { service: 'AWS CloudTrail', challenge: 'How do we prove every AI action was logged?', solves: 'Immutable audit trail for every Bedrock invocation — 7-year retention for regulators', features: ['Management Events', 'Data Events', 'CloudTrail Lake', 'Organization Trail', 'Log File Integrity Validation'] },
      { service: 'AWS Cost Explorer', challenge: 'How do we govern AI spend across business units?', solves: 'Per-model cost tracking, BU budgets, showback/chargeback, optimization recommendations', features: ['Cost Allocation Tags', 'Budget Alerts', 'Savings Plans', 'Forecasting', 'Anomaly Detection'] },
    ],
    threeLoD: {
      first: {
        role: '1st Line — Business & Development',
        subtitle: 'Model owners, AI/ML engineers, agent developers',
        activities: [
          { title: 'Day-to-day performance monitoring', how: 'Set CloudWatch alarms for drift >7%, latency p99 >5s, error rate >1%' },
          { title: 'Agent development & tool integration', how: 'Deploy via AgentCore, configure MCP tools, set up quality evaluators (accuracy, safety, latency)' },
          { title: 'Incident detection & first response', how: 'Use SSM runbook for auto-disable, SNS alerting within SLA' },
          { title: 'Cost tracking & optimization', how: 'Tag invocations with cost-center/BU, set AWS Budgets alerts per BU' },
        ],
      },
      second: {
        role: '2nd Line — Risk & Compliance',
        subtitle: 'CRO, CCO, MRM team, fair lending officer',
        activities: [
          { title: 'Fair lending & bias monitoring', how: 'Run paired tests (same app, different demographics), verify DI ratio >0.80' },
          { title: 'Agent policy governance', how: 'Review Cedar policies for completeness, test with Policy Simulator' },
          { title: 'Consumer protection oversight', how: 'Monitor complaint trends, verify 15/60-day SLA compliance' },
          { title: 'Regulatory exam preparation', how: 'Maintain evidence bundles, verify documentation is current' },
        ],
      },
      third: {
        role: '3rd Line — Internal Audit',
        subtitle: 'Internal audit, external auditors, regulators',
        activities: [
          { title: 'Audit trail integrity', how: 'Query CloudTrail in Athena, verify SHA-256 evidence hashes' },
          { title: 'Red team review', how: 'Review adversarial test results, verify HIGH/CRITICAL findings remediated' },
          { title: 'Trust Score validation', how: 'Re-run eval independently, compare against reported scores' },
          { title: 'Incident post-mortem', how: 'Review playbooks, verify tabletop results, check notification SLAs' },
        ],
      },
    },
    frontierAgents: [
      {
        agent: 'AWS DevOps Agent',
        role: 'Autonomous incident resolution',
        description: 'Always-available operations teammate that resolves and proactively prevents incidents across AWS, multicloud, and on-prem.',
        capabilities: ['Automatic incident triage', 'Root cause analysis', 'Correlated alarm grouping', 'Mitigation with rollback', 'Cross-agent handoff'],
        govRelevance: 'Reduces MTTR for AI system incidents. Provides audit trail of every investigation. Ensures AI infrastructure reliability meets SLAs.',
        status: 'Available',
      },
      {
        agent: 'AWS Security Agent',
        role: 'Continuous security validation',
        description: 'Proactively secures applications with context-aware penetration testing and automated security reviews.',
        capabilities: ['On-demand pen testing', 'Automated security reviews', 'Vulnerability discovery', 'OWASP LLM Top 10 validation', 'Accelerated security testing'],
        govRelevance: 'Validates AI application security continuously. Ensures guardrail bypass attempts are caught. Tests agent authorization boundaries.',
        status: 'Available',
      },
      {
        agent: 'Kiro',
        role: 'Governed AI-assisted development',
        description: 'Spec-driven development with governance hooks — requirements → design → implementation with compliance checks at every step.',
        capabilities: ['Spec-driven development', 'Pre-commit governance hooks', 'Steering files for standards', 'Multi-file refactoring', 'IaC generation'],
        govRelevance: 'Enforces coding standards during development. Hooks ensure every code change passes compliance checks before commit.',
        status: 'Coming Soon',
      },
    ],
    oldLayers: ['L5 — Explainability', 'L6 — AI Operations', 'L7 — Agentic Operations'],
    genaiScopes: [4, 5],
    agencyLevels: [3, 4],
  },
  {
    id: 2,
    label: 'LAYER 2',
    name: 'Build a Path to Production',
    question: 'How can we govern every AI system through a structured lifecycle?',
    color: '#1d4ed8', // blue-700 — Layer 2 (Production)
    bgGradient: 'from-blue-100/60 to-slate-50',
    score: L2_BASELINE,
    kpis: [
      { label: 'Use Cases',       value: 34,      sub: 'deployable',   color: '#1e40af' },
      { label: 'Frameworks',      value: 4,       sub: 'agent SDKs',   color: '#1e3a8a' },
      { label: 'Deploy Patterns', value: 3,       sub: 'IaC ready',    color: '#1d4ed8' },
      { label: 'Custom Agents',   value: 'Soon',  sub: 'coming soon',  color: '#b45309' },
    ],
    capabilities: [
      { status: 'done',    text: 'FSI Foundry: 34 use cases across Banking, Payments, Risk & Compliance, Capital Markets, Insurance, Operations, Modernization' },
      { status: 'done',    text: 'Dual-framework: LangGraph/LangChain + Strands (CrewAI, LlamaIndex available)' },
      { status: 'done',    text: 'Deployment: EC2 + ALB, Step Functions + Lambda, Bedrock AgentCore' },
      { status: 'done',    text: 'IaC generation: CDK, CloudFormation, Terraform templates' },
      { status: 'done',    text: 'Model Management: registry, evaluations, monitoring, and a deploy gate with attestation' },
      { status: 'done',    text: 'Risk tiering & compliance mapping: use cases risk-scored and mapped to frameworks (SR 26-2, NIST, EU AI Act)' },
      { status: 'partial', text: 'Custom Agent Builder — UI ready, deployment orchestration coming soon' },
    ],
    modules: [
      { label: 'FSI Foundry',       icon: 'building-office',    desc: '34 use cases, deploy now', route: '/applications/fsi-foundry' },
      { label: 'Model Management',  icon: 'clipboard-list',     desc: 'registry + eval + gate',   route: '/govern/models' },
      { label: 'Risk & Compliance', icon: 'scale',              desc: 'tiering + framework map',  route: '/govern/risk' },
      { label: 'Custom Agents',     icon: 'wrench-screwdriver', desc: 'UI ready, deploy coming',  route: '/aaas/custom' },
    ],
    keyControls: [
      { id: 'PRD-001', name: 'FSI Foundry Catalog', status: 'Active' },
      { id: 'PRD-002', name: 'Model Registry + Evaluation Gate', status: 'Active' },
      { id: 'PRD-003', name: 'Risk Tiering & Framework Mapping', status: 'Active' },
      { id: 'PRD-004', name: 'Custom Agent Deployment', status: 'Pending' },
    ],
    awsServices: ['Bedrock AgentCore', 'Step Functions', 'Lambda', 'EC2', 'ALB', 'CDK'],
    awsServiceMap: [
      { service: 'SageMaker Model Registry + AgentCore Gateway', challenge: 'How do we inventory all AI assets?', solves: 'Complete AI inventory: models in SageMaker Model Registry, agents/tools/MCP servers via AgentCore Gateway — OSFI E-23 compliant', features: ['Model Registry (SageMaker)', 'Agent inventory', 'Tools/MCP via Gateway', 'Version Tracking', 'Metadata & Tags'] },
      { service: 'Amazon Bedrock Evaluation', challenge: 'How do we validate models we didn\'t build?', solves: 'LLM-as-Judge scoring with FSI-specific metrics — independent validation', features: ['Automatic Evaluation', 'Human Evaluation', 'Custom Metrics', 'Model Comparison', 'CI/CD Integration'] },
      { service: 'Amazon Bedrock Guardrails', challenge: 'How do we enforce content policies at inference?', solves: 'Topic denial, content filters, PII redaction, prompt attack detection per use case', features: ['Content Filters', 'Denied Topics', 'PII Redaction', 'Prompt Attack Detection', 'Grounding Check'] },
      { service: 'AWS Step Functions', challenge: 'How do we enforce stage gates in governance?', solves: 'Orchestrated workflow — requirements must be met before advancement, no shortcuts', features: ['Visual Workflow', 'Choice States', 'Wait States', 'Error Handling', 'Full Audit Trail'] },
    ],
    threeLoD: {
      first: {
        role: '1st Line — Business & Development',
        subtitle: 'Model owners, AI/ML engineers, data scientists',
        activities: [
          { title: 'Use case lifecycle management', how: 'Submit via Registry, advance through staged pipeline (Concept → Pilot → Production) with evidence at each gate' },
          { title: 'Model selection & deployment', how: 'Run ListFoundationModels, pin version IDs, create evaluator jobs via Bedrock API' },
          { title: 'Guardrails configuration', how: 'Create guardrail with content filters, PII entities, denied topics per use case' },
          { title: 'Evaluation execution', how: 'Build FSI test cases, run Bedrock Evaluation with LLM-as-Judge metrics' },
        ],
      },
      second: {
        role: '2nd Line — Risk & Compliance',
        subtitle: 'CRO, CCO, MRM team, DPO',
        activities: [
          { title: 'Independent model validation', how: 'Run same eval suite against 2-3 challenger models, compare weighted scores' },
          { title: 'Framework compliance assessment', how: 'Map controls to frameworks in Compliance Center (SR 26-2, NIST AI RMF, EU AI Act, ISO 42001…), run gap analysis quarterly' },
          { title: 'Service approval gate reviews', how: 'Review at each gate: Risk, Security, Compliance, Architecture, Executive' },
          { title: 'Third-party risk management', how: 'Review DDQs for model providers, assess concentration risk, verify no-training terms' },
        ],
      },
      third: {
        role: '3rd Line — Internal Audit',
        subtitle: 'Internal audit, external auditors, board',
        activities: [
          { title: 'Evidence package verification', how: 'Check artifacts across all layers for completeness, currency, integrity' },
          { title: 'Control objective assessment', how: 'Independently assess CRI FS objectives, validate maturity scores' },
          { title: 'MRM framework review', how: 'Verify 3 lines operate independently, check for conflicts of interest' },
          { title: 'Concentration risk audit', how: 'Verify methodology, confirm fallback models tested within 90 days' },
        ],
      },
    },
    oldLayers: ['L3 — Model Assurance', 'L4 — Governance & Risk'],
    genaiScopes: [3, 4],
    agencyLevels: [2, 3],
  },
  {
    id: 1,
    label: 'LAYER 1',
    name: 'Establish a Secure Foundation',
    question: 'How do we establish a secure, responsible, and scalable foundation for AI?',
    color: '#1e3a8a', // blue-900 — Layer 1 (Foundation)
    bgGradient: 'from-slate-100/70 to-slate-50',
    score: L1_BASELINE,
    kpis: [
      { label: 'Guardrail Builder', value: 'Live',  sub: '5 protection layers', color: '#1d4ed8' },
      { label: 'PII Detection',     value: 'Live',  sub: '21 entity types', color: '#1e3a8a' },
      { label: 'Agent Identity',    value: 'Live',  sub: 'registry + Cedar', color: '#1e40af' },
      { label: 'MCP Governance',    value: 'Live',  sub: 'tool/server registry', color: '#1d4ed8' },
    ],
    capabilities: [
      { status: 'done',    text: 'Guardrail Builder: content filters, PII detection, denied topics, word filters, grounding' },
      { status: 'done',    text: 'Guardrail Templates + live preview: create, test, deploy to Bedrock Guardrails' },
      { status: 'done',    text: 'Agent identity & registry: every agent/tool/MCP server inventoried with owner, scope, and Cedar policy binding' },
      { status: 'done',    text: 'MCP governance: server/tool registry with auth method, approval state, and permission boundaries' },
      { status: 'partial', text: 'Tools Factory: MCP Gateway, Code Exec, Browser, APIs (Coming Soon)' },
      { status: 'partial', text: 'Knowledge Bases: register and govern data sources for retrieval (Bedrock Knowledge Bases)' },
    ],
    modules: [
      { label: 'Guardrails',     icon: 'shield-check',       desc: 'Builder + templates + preview', route: '/secure/guardrails' },
      { label: 'Agent Registry', icon: 'clipboard-list',     desc: 'agents, tools, MCP + Cedar',    route: '/govern/agents' },
      { label: 'Policy',         icon: 'scale',              desc: 'Cedar deny-by-default',         route: '/secure/policy' },
      { label: 'Tools',          icon: 'wrench-screwdriver', desc: '6 tools coming soon',           route: '/capabilities/tools' },
    ],
    keyControls: [
      { id: 'FND-001', name: 'Guardrail Builder', status: 'Active' },
      { id: 'FND-002', name: 'PII Detection (21 entity types)', status: 'Active' },
      { id: 'FND-003', name: 'Agent Identity & MCP Registry', status: 'Active' },
      { id: 'FND-004', name: 'Cedar Policy Enforcement', status: 'Active' },
    ],
    awsServices: ['Bedrock Guardrails', 'IAM', 'Cognito', 'KMS', 'S3', 'Textract'],
    awsServiceMap: [
      { service: 'Amazon Bedrock Guardrails', challenge: 'How do we prevent harmful outputs?', solves: 'Content filters, topic denial, and PII redaction before model input — 21 PII entity types plus custom regex', features: ['Content Filters (6 categories)', 'Denied Topics', 'PII Filters (21 types)', 'Word Filters', 'Contextual Grounding'] },
      { service: 'AWS IAM', challenge: 'How do we enforce least-privilege access?', solves: 'Service-specific roles with resource policies — no wildcard, per-model access control', features: ['Service Roles', 'Resource Policies', 'Permission Boundaries', 'IAM Access Analyzer', 'SCPs'] },
      { service: 'AWS KMS', challenge: 'How do we encrypt AI data at rest and in transit?', solves: 'AES-256 at rest, TLS 1.3 in transit — customer-managed keys for all Bedrock data', features: ['Customer Managed Keys', 'Auto Key Rotation', 'Encryption Context', 'Multi-Region Keys', 'CloudTrail Logging'] },
      { service: 'AWS Security Hub', challenge: 'How do we assess security posture?', solves: 'Aggregated findings from 50+ services, compliance scoring, prioritized remediation', features: ['Security Best Practices', 'CIS Benchmarks', 'Automated Findings', 'Custom Actions', 'Compliance Score'] },
    ],
    threeLoD: {
      first: {
        role: '1st Line — Business & Development',
        subtitle: 'Platform engineers, data engineers, AI/ML engineers',
        activities: [
          { title: 'Guardrails configuration', how: 'Create Bedrock Guardrails with content filters, PII detection, denied topics per use case' },
          { title: 'Data classification & privacy', how: 'Configure Macie for S3 scanning, classify data types across sensitivity levels' },
          { title: 'IAM & network security', how: 'Create service roles with resource policies, configure VPC PrivateLink, enable KMS CMKs' },
          { title: 'Model inventory management', how: 'Register all models in Registry with owner, risk tier, version, provenance' },
        ],
      },
      second: {
        role: '2nd Line — Risk & Compliance',
        subtitle: 'CISO, DPO, compliance officers',
        activities: [
          { title: 'Data protection compliance', how: 'Validate HIPAA Safe Harbor (18 identifiers), assess PCI DSS Req 3.3, conduct DPIA' },
          { title: 'Guardrail coverage validation', how: 'Map guardrail policies to regulatory requirements, verify no gaps' },
          { title: 'Security posture review', how: 'Review Security Hub findings, map controls to frameworks, validate Config rules' },
          { title: 'Vendor concentration assessment', how: 'Review DDQs for providers, assess concentration risk (78% threshold), verify exit strategies' },
        ],
      },
      third: {
        role: '3rd Line — Internal Audit',
        subtitle: 'Internal audit, external auditors, regulators',
        activities: [
          { title: 'Penetration testing', how: 'Run adversarial prompt injection tests, verify guardrails cannot be circumvented' },
          { title: 'Encryption audit', how: 'Verify AES-256 at rest, TLS 1.3 in transit, audit KMS key rotation' },
          { title: 'IAM least-privilege verification', how: 'Run IAM Access Analyzer, verify no wildcard permissions, audit cross-account access' },
          { title: 'DR & incident response', how: 'Test failover procedures, verify RTO/RPO targets, audit playbook execution' },
        ],
      },
    },
    oldLayers: ['L1 — Infrastructure Security', 'L2 — Data Protection'],
    genaiScopes: [3],
    agencyLevels: [1, 2],
  },
];


// ─────────────────────────── Industry Implementation Patterns ───────────────────────────
interface ImplementationPattern {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  bestFor: string;
  organizations: string[];
  layers: {
    foundation: 'centralized' | 'federated' | 'hybrid';
    production: 'centralized' | 'federated' | 'hybrid';
    scale: 'centralized' | 'federated' | 'hybrid';
  };
  awsServices: string[];
  pros: string[];
  cons: string[];
}

const IMPLEMENTATION_PATTERNS: ImplementationPattern[] = [
  {
    id: 'coe',
    name: 'Centralized CoE Pattern',
    subtitle: 'Single team, full control',
    description: 'A single AI governance team owns all 3 layers. Mandatory approval gates at each layer transition. All AI decisions flow through the Center of Excellence.',
    bestFor: 'Highly regulated, risk-averse organizations',
    organizations: ['Large Banks', 'Insurance Companies', 'Global Systemically Important Banks (G-SIBs)'],
    layers: { foundation: 'centralized', production: 'centralized', scale: 'centralized' },
    awsServices: ['Central Bedrock Account', 'Cross-account Guardrails', 'Shared Model Registry', 'Centralized CloudTrail'],
    pros: [
      'Maximum control and consistency',
      'Single source of truth for AI governance',
      'Simplified regulatory reporting',
      'Clear accountability chain',
    ],
    cons: [
      'Can become a bottleneck',
      'Slower time-to-market',
      'May not scale with rapid AI adoption',
      'Requires large central team',
    ],
  },
  {
    id: 'hub-spoke',
    name: 'Hub-and-Spoke Pattern',
    subtitle: 'Central standards, distributed execution',
    description: 'Central team sets standards and owns Foundation layer. Business units implement Application layer within guardrails. Shared risk appetite with local autonomy.',
    bestFor: 'Multi-BU organizations with shared risk appetite',
    organizations: ['Regional Banks', 'Asset Managers', 'Insurance Groups', 'Financial Holding Companies'],
    layers: { foundation: 'centralized', production: 'hybrid', scale: 'federated' },
    awsServices: ['Shared Guardrails', 'BU-specific Agents', 'Federated Model Registry', 'Cross-account Observability'],
    pros: [
      'Balances control with agility',
      'BUs can innovate within guardrails',
      'Scales with organizational growth',
      'Shared infrastructure costs',
    ],
    cons: [
      'Requires clear governance boundaries',
      'Coordination overhead between hub and spokes',
      'Risk of inconsistent implementation',
      'Complex IAM and cross-account setup',
    ],
  },
  {
    id: 'federated',
    name: 'Federated Pattern',
    subtitle: 'Teams own full stack with guardrails as code',
    description: 'Engineering teams own the full stack. Policy-as-code enforcement with Cedar policies. Self-service deployment with automated compliance gates.',
    bestFor: 'Fast-moving, engineering-led organizations',
    organizations: ['Fintechs', 'Startups', 'Digital-native Banks', 'Crypto/DeFi Companies'],
    layers: { foundation: 'federated', production: 'federated', scale: 'federated' },
    awsServices: ['GitOps Pipelines', 'Cedar Policies', 'Automated Gates', 'Decentralized Observability'],
    pros: [
      'Maximum development velocity',
      'Teams accountable end-to-end',
      'Policy changes via PR workflow',
      'Scales with team count',
    ],
    cons: [
      'Requires mature engineering culture',
      'Higher risk of inconsistency',
      'Harder to get org-wide view',
      'May not satisfy conservative regulators',
    ],
  },
  {
    id: 'regulated-ai',
    name: 'Regulated AI Pattern',
    subtitle: 'Human-in-the-loop mandatory',
    description: 'Human review required at Application layer for all high-stakes decisions. Full audit trail with explainability for every AI output. RETURN_CONTROL pattern for agent actions.',
    bestFor: 'High-stakes decisions, regulatory scrutiny',
    organizations: ['Healthcare', 'Government Agencies', 'Credit Decisioning', 'Insurance Underwriting'],
    layers: { foundation: 'centralized', production: 'centralized', scale: 'hybrid' },
    awsServices: ['A2I Workflows', 'Bedrock RETURN_CONTROL', 'Explainability APIs', 'Immutable Audit Trail'],
    pros: [
      'Maximum regulatory compliance',
      'Human oversight at critical points',
      'Explainability built-in',
      'Defensible decisions',
    ],
    cons: [
      'Slowest time-to-decision',
      'Higher operational cost (human reviewers)',
      'May not scale for high-volume use cases',
      'Requires trained human reviewers',
    ],
  },
];

// ─────────────────────────── Scoping Matrices ───────────────────────────
// Trust Stack was originally an LLM/Bedrock-first story (implicitly GenAI
// Scope 3 — pre-trained models via API). AVA is now in the agentic space, so
// the trust model has to classify along BOTH authoritative AWS matrices:
//   1. GenAI Security Scoping Matrix — sourcing scope 1–5 (buy → build)
//   2. Agentic AI Security Scoping Matrix — agency L1–L4 (canonical AGENT_SCOPE_META)
// Each scope routes to the Govern surface that carries its governance load, so
// this is a classifier that ROUTES, not just a diagram.

type ScopeSide = 'buy' | 'build';

interface GenAiScope {
  id: number;
  name: string;
  side: ScopeSide;
  blurb: string;
  /** Where the governance load sits at this scope. */
  focus: string;
  color: string;
  /** Cross-link to the Govern surface that serves this scope. */
  to: { label: string; href: string };
}

// AWS Generative AI Security Scoping Matrix — 5 scopes, least → most ownership.
const GENAI_SCOPES: GenAiScope[] = [
  {
    id: 1, name: 'Consumer app', side: 'buy',
    blurb: 'Employees use a public third-party AI service under the provider’s terms.',
    focus: 'Provider assessment · acceptable-use · shadow-AI detection',
    color: '#0891b2',
    to: { label: 'Shadow AI', href: '/govern/shadow-ai' },
  },
  {
    id: 2, name: 'Enterprise app', side: 'buy',
    blurb: 'A third-party enterprise app with embedded GenAI, under a vendor relationship.',
    focus: 'Vendor DDQ · TOS & licensing · data sovereignty',
    color: '#2563eb',
    to: { label: 'Third-Party Risk', href: '/govern/risk?tab=third-party' },
  },
  {
    id: 3, name: 'Pre-trained models', side: 'build',
    blurb: 'You build an app on an existing foundation model via API (e.g. Claude on Bedrock).',
    focus: 'Guardrails · prompt-injection threat modeling · evals',
    color: '#7c3aed',
    to: { label: 'AI Safety', href: '/govern/safety' },
  },
  {
    id: 4, name: 'Fine-tuned models', side: 'build',
    blurb: 'You refine a foundation model with your own data into a specialized model.',
    focus: 'Data classification · model attestation · lineage',
    color: '#c026d3',
    to: { label: 'Model Management', href: '/govern/models' },
  },
  {
    id: 5, name: 'Self-trained models', side: 'build',
    blurb: 'You train a model from scratch on data you own — you own every aspect.',
    focus: 'Full lifecycle · own legal terms · frontier thresholds',
    color: '#db2777',
    to: { label: 'Frontier Thresholds', href: '/govern/safety/capabilities' },
  },
];

// The 5 security disciplines from the matrix, mapped to the Govern surface that
// carries each. Shown as the "responsibility rows" that apply across all scopes.
const SCOPE_DISCIPLINES: { name: string; to: { label: string; href: string } }[] = [
  { name: 'Governance & Compliance', to: { label: 'Compliance', href: '/govern/compliance' } },
  { name: 'Legal & Privacy', to: { label: 'Data Governance', href: '/govern/data' } },
  { name: 'Risk Management', to: { label: 'Risk', href: '/govern/risk' } },
  { name: 'Controls', to: { label: 'AI Safety', href: '/govern/safety' } },
  { name: 'Resilience', to: { label: 'Fleet & Incidents', href: '/govern/fleet' } },
];

const GENAI_SCOPE_BY_ID: Record<number, GenAiScope> = Object.fromEntries(GENAI_SCOPES.map(s => [s.id, s]));
const BUY_SCOPES = GENAI_SCOPES.filter(s => s.side === 'buy');

// Agentic agency scope → the Govern surface that governs at that agency level.
const AGENCY_LINK: Record<number, { label: string; href: string }> = {
  1: { label: 'Agent Registry', href: '/govern/agents' },
  2: { label: 'Human Oversight', href: '/govern/agents?tab=human-oversight' },
  3: { label: 'AI Safety', href: '/govern/safety' },
  4: { label: 'Threat Modeling', href: '/govern/safety/threat-modeling' },
};

// ─────────────────────────── Score Colors ───────────────────────────
function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-rose-600';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-100';
  if (score >= 60) return 'bg-amber-100';
  return 'bg-rose-100';
}

// Key-control status badge — reflect the real status, not always green.
const controlStatusBadge: Record<KeyControl['status'], string> = {
  Active: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Review: 'bg-blue-100 text-blue-700',
};

// ─────────────────────────── Component ───────────────────────────
export default function TrustStack3Layer() {
  const [focusLayer, setFocusLayer] = useState<number | null>(null);
  const [showPatterns, setShowPatterns] = useState(false);
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);

  // Grade each layer live from real estate signals (falls back to baseline when
  // no signals are present). Same source the Command Center + program spine use.
  const agg = useGovernanceAggregator();
  const readiness = useMemo(() => computeLayerReadiness(agg), [agg]);
  const operate = useMemo(() => computeOperateReadiness(agg), [agg]);
  const anyLive = Object.values(readiness).some(r => r.live);
  const overallScore = Math.round(
    (readiness[1].score + readiness[2].score + readiness[3].score) / 3
  );

  // Live AWS data for KPIs
  const { kpis: liveKpis, liveFlags, liveSources } = useLiveKPIs(60_000);
  const { activeCount: guardrailsActive, totalCount: guardrailsTotal } = useGuardrailMetrics();

  // Compute live KPIs for each layer
  const liveLayerKpis = useMemo(() => ({
    // Layer 1: Foundation — guardrails, agents, compliance
    1: {
      guardrails: liveFlags.guardrails ? `${guardrailsActive}` : 'Live',
      guardrailsSub: liveFlags.guardrails ? `${guardrailsTotal} total` : '5 protection layers',
      pii: liveFlags.guardrails ? `${liveKpis.guardrailInterventions}` : 'Live',
      piiSub: liveFlags.guardrails ? 'interventions' : '21 entity types',
      agents: liveFlags.agents ? `${liveKpis.totalAgents}` : 'Live',
      agentsSub: liveFlags.agents ? `${liveKpis.bedrockAgents} Bedrock` : 'registry + Cedar',
      compliance: liveFlags.config ? `${liveKpis.configCompliancePct}%` : 'Live',
      complianceSub: liveFlags.config ? `${liveKpis.configTotalRules} rules` : 'AWS Config',
    },
    // Layer 2: Production — use cases, deployments, evals
    2: {
      useCases: `${agg.summary.totalUseCases}`,
      useCasesSub: `${agg.summary.deployedUseCases} deployed`,
      frameworks: '4',
      frameworksSub: 'agent SDKs',
      deployments: `${agg.summary.deploymentsActive}`,
      deploymentsSub: `${agg.summary.deploymentsPending} pending`,
      models: liveFlags.runtime ? `${liveKpis.totalInvocations > 0 ? Math.ceil(liveKpis.totalInvocations / 1000) + 'K' : '—'}` : 'Soon',
      modelsSub: liveFlags.runtime ? 'invocations/7d' : 'coming soon',
    },
    // Layer 3: Scale — safety, runtime, cost, fleet
    3: {
      safety: '6',
      safetySub: 'safety surfaces',
      errorRate: liveFlags.runtime ? `${liveKpis.fleetErrorRatePct}%` : '—',
      errorRateSub: liveFlags.runtime ? 'fleet errors' : 'CloudWatch',
      cost: liveFlags.cost ? `$${Math.round(liveKpis.totalCost).toLocaleString()}` : 'Live',
      costSub: liveFlags.cost ? `${liveKpis.costWindowDays}d spend` : 'Cost Explorer',
      fleet: liveFlags.agents ? `${liveKpis.governedPct}%` : 'Live',
      fleetSub: liveFlags.agents ? 'governed' : 'posture + TCO',
    },
  }), [liveKpis, liveFlags, agg.summary, guardrailsActive, guardrailsTotal]);

  const hasAnyLiveData = liveSources.length > 0;

  // Drill into the trust map by focusing the foundation layer and scrolling up.
  const openTrustMap = () => {
    setFocusLayer(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Regulator-ready evidence summary built from the live layer model.
  const exportEvidencePackage = () => {
    const pkg = {
      title: 'AVA Trust Stack — Evidence Package',
      generatedAt: new Date().toISOString(),
      overallReadiness: overallScore,
      readinessBasis: anyLive ? 'computed from live signals' : 'illustrative baseline',
      operatingModel: { readiness: operate.score, live: operate.live, basis: operate.basis, pattern: operate.pattern, maturityLevel: operate.maturityLevel },
      layers: LAYERS.map(l => ({
        layer: l.label,
        name: l.name,
        readiness: readiness[l.id].score,
        readinessLive: readiness[l.id].live,
        readinessBasis: readiness[l.id].basis,
        capabilities: l.capabilities.map(c => ({ status: c.status, item: c.text })),
        keyControls: l.keyControls.map(k => ({ id: k.id, name: k.name, status: k.status })),
        awsServices: l.awsServices,
      })),
    };
    downloadJSON(pkg, `trust-stack-evidence-${dateStamp()}.json`);
  };

  return (
    <div className="space-y-4">
      {/* Header with overall score */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Trust Stack</h2>
            {hasAnyLiveData ? <LiveDataBadge source={`${liveSources.length} AWS sources`} /> : <MockDataBadge integration="Illustrative capability mapping" />}
          </div>
          <p className="text-xs text-slate-500"><span className="font-medium text-slate-600">Decide</span> (classify + operating model) → <span className="font-medium text-slate-600">Build</span> (3-layer journey) → <span className="font-medium text-slate-600">Prove</span> (evidence)</p>
        </div>
        <div className="flex items-center gap-4">
          <a href="/govern/command-center" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            ← Command Center
          </a>
          <div className="text-center">
            <div className={`text-2xl font-bold ${scoreColor(overallScore)}`}>{overallScore}%</div>
            <div className="text-[9px] text-slate-400 uppercase tracking-wide">Trust Readiness</div>
            <div className={`text-[8px] font-medium ${anyLive ? 'text-emerald-600' : 'text-slate-400'}`}>
              {anyLive ? '● live' : 'baseline'}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════ SECTION 1: DECIDE ══════════════════════ */}
      {!focusLayer && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">1</span>
            <h3 className="text-sm font-semibold text-slate-800">Decide</h3>
            <span className="text-[10px] text-slate-400">— classify your AI systems and choose your operating model</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {/* Buy */}
          <a
            href="/govern/risk?tab=third-party"
            className="group p-4 rounded-xl border-2 border-cyan-200 bg-cyan-50/30 hover:bg-cyan-50 hover:border-cyan-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon name="shopping-cart" className="w-5 h-5 text-cyan-600" />
              <span className="text-base font-semibold text-slate-800">Buy</span>
            </div>
            <p className="text-[11px] text-slate-600 mb-3">Provider owns the model — assess vendors, monitor shadow AI</p>
            <div className="space-y-1">
              {GENAI_SCOPES.filter(s => s.side === 'buy').map(sc => (
                <div key={sc.id} className="flex items-center gap-2 text-[10px]">
                  <span className="w-4 h-4 rounded flex items-center justify-center text-white text-[8px] font-bold" style={{ background: sc.color }}>S{sc.id}</span>
                  <span className="text-slate-600">{sc.name}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-1 text-[10px] text-cyan-600 font-medium group-hover:underline">
              Third-Party Risk <Icon name="arrow-right" className="w-3 h-3" />
            </div>
          </a>

          {/* Build */}
          <a
            href="/govern/safety"
            className="group p-4 rounded-xl border-2 border-violet-200 bg-violet-50/30 hover:bg-violet-50 hover:border-violet-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon name="wrench-screwdriver" className="w-5 h-5 text-violet-600" />
              <span className="text-base font-semibold text-slate-800">Build</span>
            </div>
            <p className="text-[11px] text-slate-600 mb-3">You own the stack — guardrails, evals, threat modeling</p>
            <div className="space-y-1">
              {GENAI_SCOPES.filter(s => s.side === 'build').map(sc => (
                <div key={sc.id} className="flex items-center gap-2 text-[10px]">
                  <span className="w-4 h-4 rounded flex items-center justify-center text-white text-[8px] font-bold" style={{ background: sc.color }}>S{sc.id}</span>
                  <span className="text-slate-600">{sc.name}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-1 text-[10px] text-violet-600 font-medium group-hover:underline">
              AI Safety <Icon name="arrow-right" className="w-3 h-3" />
            </div>
          </a>

          {/* Operating Model */}
          <div className="p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Icon name="building-office" className="w-5 h-5 text-indigo-600" />
                <span className="text-base font-semibold text-slate-800">Operate</span>
              </div>
              <span className={`text-lg font-bold ${scoreColor(operate.score)}`}>{operate.score}%</span>
            </div>
            <p className="text-[11px] text-slate-600 mb-3">How you run governance — centralized, federated, or hybrid</p>

            {/* Pattern Preview Grid */}
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {IMPLEMENTATION_PATTERNS.map((pattern) => {
                const isSelected = operate.pattern === pattern.name;
                return (
                  <button
                    key={pattern.id}
                    onClick={() => { setShowPatterns(true); setExpandedPattern(pattern.id); }}
                    className={`p-1.5 rounded-lg border text-left transition-all hover:shadow-sm ${
                      isSelected ? 'bg-indigo-100 border-indigo-300' : 'bg-white border-slate-200 hover:border-indigo-200'
                    }`}
                  >
                    <div className="text-[9px] font-semibold text-slate-700 mb-1 truncate">{pattern.name}</div>
                    <div className="flex items-center gap-0.5">
                      {(['foundation', 'production', 'scale'] as const).map((layer, i) => {
                        const status = pattern.layers[layer];
                        const colors = { centralized: 'bg-blue-500', federated: 'bg-emerald-500', hybrid: 'bg-amber-500' };
                        return (
                          <div key={layer} className="flex items-center">
                            <div className={`w-4 h-4 rounded ${colors[status]} flex items-center justify-center`}>
                              <span className="text-[6px] text-white font-bold">L{i + 1}</span>
                            </div>
                            {i < 2 && <div className="w-1 h-px bg-slate-300" />}
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-2 text-[8px] text-slate-500 mb-2">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500" />Central</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500" />Hybrid</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" />Federated</span>
            </div>

            <button
              onClick={() => setShowPatterns(!showPatterns)}
              className="w-full flex items-center justify-center gap-1 text-[10px] text-indigo-600 font-medium hover:underline"
            >
              {showPatterns ? 'Hide' : 'Expand'} details <Icon name={showPatterns ? 'chevron-up' : 'chevron-down'} className="w-3 h-3" />
            </button>
          </div>
          </div>
        </div>
      )}

      {/* Operating Model Patterns (expanded) */}
      {!focusLayer && showPatterns && (
        <div className="bg-white rounded-xl border border-indigo-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white border border-indigo-200 flex items-center justify-center">
                  <Icon name="building-office" className="w-5 h-5 text-indigo-600" strokeWidth={2} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Operating Model Patterns</h4>
                  <p className="text-[10px] text-slate-500">How to centralize vs federate control across the 3 layers</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {/* Legend */}
                <div className="flex items-center gap-3 text-[9px]">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500" /> Centralized</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500" /> Hybrid</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Federated</span>
                </div>
                <button onClick={() => setShowPatterns(false)} className="text-slate-400 hover:text-slate-600">
                  <Icon name="x-mark" className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Pattern Grid */}
          <div className="p-4">
            <div className="grid grid-cols-4 gap-3 mb-4">
              {IMPLEMENTATION_PATTERNS.map((pattern) => (
                <button
                  key={pattern.id}
                  onClick={() => setExpandedPattern(expandedPattern === pattern.id ? null : pattern.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    expandedPattern === pattern.id
                      ? 'bg-indigo-50 border-indigo-300 shadow-sm ring-2 ring-indigo-200'
                      : 'bg-white border-slate-200 hover:border-indigo-200 hover:shadow-sm'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-800 mb-1">{pattern.name}</div>
                  <div className="text-[10px] text-slate-500 mb-2">{pattern.subtitle}</div>
                  {/* Layer diagram */}
                  <div className="flex items-center gap-1 mb-2">
                    {(['foundation', 'production', 'scale'] as const).map((layer, i) => {
                      const status = pattern.layers[layer];
                      const colors = { centralized: 'bg-blue-500', federated: 'bg-emerald-500', hybrid: 'bg-amber-500' };
                      return (
                        <div key={layer} className="flex items-center">
                          <div className={`w-6 h-6 rounded ${colors[status]} flex items-center justify-center`}>
                            <span className="text-[8px] text-white font-bold">L{i + 1}</span>
                          </div>
                          {i < 2 && <div className="w-3 h-0.5 bg-slate-300" />}
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[9px] text-slate-400">{pattern.bestFor}</div>
                </button>
              ))}
            </div>

            {/* Expanded Pattern Details */}
            {expandedPattern && (() => {
              const pattern = IMPLEMENTATION_PATTERNS.find(p => p.id === expandedPattern);
              if (!pattern) return null;
              return (
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h5 className="text-base font-semibold text-slate-800">{pattern.name}</h5>
                      <p className="text-xs text-slate-600 mt-1">{pattern.description}</p>
                    </div>
                  </div>

                  {/* Visual Layer Diagram */}
                  <div className="mb-4 p-4 bg-gradient-to-r from-slate-50 to-indigo-50 rounded-lg border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-3">Layer Ownership Model</div>
                    <div className="flex items-center justify-center gap-3">
                      {[
                        { layer: 'Layer 1', name: 'Foundation', key: 'foundation' as const },
                        { layer: 'Layer 2', name: 'Production', key: 'production' as const },
                        { layer: 'Layer 3', name: 'Scale', key: 'scale' as const },
                      ].map((l, i) => {
                        const status = pattern.layers[l.key];
                        const bgColors = { centralized: 'from-blue-100 to-blue-200 border-blue-300', federated: 'from-emerald-100 to-emerald-200 border-emerald-300', hybrid: 'from-amber-100 to-amber-200 border-amber-300' };
                        const textColors = { centralized: 'text-blue-700', federated: 'text-emerald-700', hybrid: 'text-amber-700' };
                        const icons = { centralized: 'building-office', federated: 'users', hybrid: 'arrows-right-left' } as const;
                        return (
                          <div key={l.key} className="flex items-center">
                            <div className={`w-28 p-3 rounded-lg bg-gradient-to-br ${bgColors[status]} border text-center`}>
                              <Icon name={icons[status]} className={`w-4 h-4 mx-auto mb-1 ${textColors[status]}`} strokeWidth={2} />
                              <div className="text-[10px] font-semibold text-slate-700">{l.layer}</div>
                              <div className="text-[9px] text-slate-500">{l.name}</div>
                              <div className={`text-[10px] font-bold mt-1 ${textColors[status]} uppercase`}>{status}</div>
                            </div>
                            {i < 2 && <Icon name="arrow-right" className="w-4 h-4 mx-2 text-slate-400" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-4 gap-3">
                    {/* Best For */}
                    <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                      <div className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wide mb-1.5">Best For</div>
                      <div className="text-[10px] text-slate-700 font-medium mb-2">{pattern.bestFor}</div>
                      <div className="flex flex-wrap gap-1">
                        {pattern.organizations.slice(0, 3).map((org, i) => (
                          <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-white border border-indigo-200 text-slate-600">{org}</span>
                        ))}
                      </div>
                    </div>
                    {/* AWS Services */}
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-600 font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Icon name="cloud" className="w-3 h-3" /> AWS Services
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {pattern.awsServices.slice(0, 4).map((svc, i) => (
                          <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">{svc}</span>
                        ))}
                      </div>
                    </div>
                    {/* Pros */}
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Icon name="check-circle" className="w-3 h-3" /> Advantages
                      </div>
                      {pattern.pros.slice(0, 3).map((pro, i) => (
                        <div key={i} className="text-[9px] text-slate-700 flex items-start gap-1 mb-0.5">
                          <span className="text-emerald-500">+</span> {pro}
                        </div>
                      ))}
                    </div>
                    {/* Cons */}
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                      <div className="text-[10px] text-rose-600 font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Icon name="exclamation-triangle" className="w-3 h-3" /> Considerations
                      </div>
                      {pattern.cons.slice(0, 3).map((con, i) => (
                        <div key={i} className="text-[9px] text-slate-700 flex items-start gap-1 mb-0.5">
                          <span className="text-rose-500">−</span> {con}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Link to Plan */}
                  <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                    <p className="text-[10px] text-slate-500">
                      Configure your operating model in <a href="/operating-model" className="text-blue-600 hover:underline font-medium">Plan → Operating Model</a> for RACI, maturity assessment, and pattern selection.
                    </p>
                    <a href="/operating-model" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors">
                      Configure <Icon name="arrow-right" className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ══════════════════════ SECTION 2: BUILD (Trust Journey + Layers) ══════════════════════ */}
      {!focusLayer && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">2</span>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Build</h3>
                <p className="text-[10px] text-slate-500">Your 3-layer trust journey — click any layer for full details</p>
              </div>
            </div>
            {hasAnyLiveData && (
              <div className="flex items-center gap-2 text-[10px] text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {liveSources.length} live sources
              </div>
            )}
          </div>

          {/* Rich Trust Journey: Layer Cards with Full KPIs */}
          <div className="flex items-stretch gap-3">
            {/* Layer 1: Foundation */}
            <button onClick={() => setFocusLayer(1)} className="flex-1 text-left group">
              <div className="h-full rounded-xl p-4 border-2 border-l-4 transition-all hover:shadow-lg hover:-translate-y-1" style={{ borderLeftColor: '#1e3a8a', borderColor: '#1e3a8a30', backgroundColor: '#1e3a8a08' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#1e3a8a' }}>Layer 1</span>
                    <div className="text-sm font-semibold text-slate-800">Foundation</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${scoreColor(readiness[1].score)}`}>{readiness[1].score}%</div>
                    <div className={`text-[8px] ${readiness[1].live ? 'text-emerald-600' : 'text-slate-400'}`}>{readiness[1].live ? '● live' : 'baseline'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="text-center p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-lg font-bold text-slate-800 flex items-center justify-center gap-1">
                      {liveLayerKpis[1].guardrails}
                      {liveFlags.guardrails && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </div>
                    <div className="text-[9px] text-slate-500">Guardrails</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-lg font-bold text-slate-800 flex items-center justify-center gap-1">
                      {liveLayerKpis[1].agents}
                      {liveFlags.agents && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </div>
                    <div className="text-[9px] text-slate-500">Agents</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-lg font-bold text-slate-800 flex items-center justify-center gap-1">
                      {liveLayerKpis[1].pii}
                      {liveFlags.guardrails && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </div>
                    <div className="text-[9px] text-slate-500">Interventions</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-lg font-bold text-slate-800 flex items-center justify-center gap-1">
                      {liveLayerKpis[1].compliance}
                      {liveFlags.config && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </div>
                    <div className="text-[9px] text-slate-500">Config</div>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${readiness[1].score}%`, backgroundColor: '#1e3a8a' }} />
                </div>
                <div className="mt-2 text-[9px] text-slate-500 text-center group-hover:text-blue-600">Click for details →</div>
              </div>
            </button>

            <div className="flex items-center"><Icon name="arrow-right" className="w-5 h-5 text-slate-300" /></div>

            {/* Layer 2: Production */}
            <button onClick={() => setFocusLayer(2)} className="flex-1 text-left group">
              <div className="h-full rounded-xl p-4 border-2 border-l-4 transition-all hover:shadow-lg hover:-translate-y-1" style={{ borderLeftColor: '#1d4ed8', borderColor: '#1d4ed830', backgroundColor: '#1d4ed808' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#1d4ed8' }}>Layer 2</span>
                    <div className="text-sm font-semibold text-slate-800">Production</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${scoreColor(readiness[2].score)}`}>{readiness[2].score}%</div>
                    <div className={`text-[8px] ${readiness[2].live ? 'text-emerald-600' : 'text-slate-400'}`}>{readiness[2].live ? '● live' : 'baseline'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="text-center p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-lg font-bold text-slate-800">{liveLayerKpis[2].useCases}</div>
                    <div className="text-[9px] text-slate-500">Use Cases</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-lg font-bold text-slate-800">{liveLayerKpis[2].deployments}</div>
                    <div className="text-[9px] text-slate-500">Deployments</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-lg font-bold text-slate-800">{liveLayerKpis[2].frameworks}</div>
                    <div className="text-[9px] text-slate-500">Frameworks</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-lg font-bold text-slate-800 flex items-center justify-center gap-1">
                      {liveLayerKpis[2].models}
                      {liveFlags.runtime && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </div>
                    <div className="text-[9px] text-slate-500">Invocations</div>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${readiness[2].score}%`, backgroundColor: '#1d4ed8' }} />
                </div>
                <div className="mt-2 text-[9px] text-slate-500 text-center group-hover:text-blue-600">Click for details →</div>
              </div>
            </button>

            <div className="flex items-center"><Icon name="arrow-right" className="w-5 h-5 text-slate-300" /></div>

            {/* Layer 3: Scale */}
            <button onClick={() => setFocusLayer(3)} className="flex-1 text-left group">
              <div className="h-full rounded-xl p-4 border-2 border-l-4 transition-all hover:shadow-lg hover:-translate-y-1" style={{ borderLeftColor: '#3b82f6', borderColor: '#3b82f630', backgroundColor: '#3b82f608' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#3b82f6' }}>Layer 3</span>
                    <div className="text-sm font-semibold text-slate-800">Scale</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${scoreColor(readiness[3].score)}`}>{readiness[3].score}%</div>
                    <div className={`text-[8px] ${readiness[3].live ? 'text-emerald-600' : 'text-slate-400'}`}>{readiness[3].live ? '● live' : 'baseline'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="text-center p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-lg font-bold text-slate-800">{liveLayerKpis[3].safety}</div>
                    <div className="text-[9px] text-slate-500">Safety</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-lg font-bold flex items-center justify-center gap-1" style={{ color: liveKpis.fleetErrorRatePct > 2 ? '#dc2626' : '#1e293b' }}>
                      {liveLayerKpis[3].errorRate}
                      {liveFlags.runtime && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </div>
                    <div className="text-[9px] text-slate-500">Error Rate</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-lg font-bold text-slate-800 flex items-center justify-center gap-1">
                      {liveLayerKpis[3].cost}
                      {liveFlags.cost && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </div>
                    <div className="text-[9px] text-slate-500">AI Spend</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white border border-slate-200">
                    <div className="text-lg font-bold text-slate-800 flex items-center justify-center gap-1">
                      {liveLayerKpis[3].fleet}
                      {liveFlags.agents && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </div>
                    <div className="text-[9px] text-slate-500">Governed</div>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${readiness[3].score}%`, backgroundColor: '#3b82f6' }} />
                </div>
                <div className="mt-2 text-[9px] text-slate-500 text-center group-hover:text-blue-600">Click for details →</div>
              </div>
            </button>
          </div>

          {/* Live Data Sources */}
          {hasAnyLiveData && (
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center gap-2 flex-wrap">
              <span className="text-[9px] text-slate-400 uppercase tracking-wide">Live from:</span>
              {liveSources.map(src => (
                <span key={src} className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {src}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Back button when focused */}
      {focusLayer && (
        <button
          onClick={() => setFocusLayer(null)}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          ← Back to Overview
        </button>
      )}

      {/* Full Layer Card — shown when a layer is focused */}
      {focusLayer && (
      <div className="space-y-3">
        {LAYERS.filter(layer => layer.id === focusLayer).map((layer) => (
          <div
            key={layer.id}
            onClick={() => !focusLayer && setFocusLayer(layer.id)}
            className={`bg-gradient-to-r ${layer.bgGradient} rounded-xl border shadow-sm overflow-hidden transition-all ${
              !focusLayer ? 'cursor-pointer hover:shadow-md hover:scale-[1.005]' : ''
            }`}
            style={{ borderColor: `${layer.color}40`, borderLeftWidth: '4px', borderLeftColor: layer.color }}
          >
            {/* Layer Header */}
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                      style={{ background: layer.color }}
                    >
                      {layer.label}
                    </span>
                    <span className="text-base font-semibold text-slate-900">{layer.name}</span>
                    {!focusLayer && <span className="text-slate-400">→</span>}
                  </div>
                  <p className="text-xs italic" style={{ color: layer.color }}>
                    "{layer.question}"
                  </p>

                  {/* Scope classification — which GenAI scopes + agency levels this layer serves */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[8px] text-slate-400 uppercase tracking-wide">Scope</span>
                    {layer.genaiScopes.map(id => {
                      const sc = GENAI_SCOPE_BY_ID[id];
                      return (
                        <a key={`g${id}`} href={sc.to.href} title={`Scope ${id}: ${sc.name}`}
                          className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium hover:underline"
                          style={{ backgroundColor: `${sc.color}14`, color: sc.color }}>
                          S{id} {sc.name}
                        </a>
                      );
                    })}
                    <span className="w-px h-3 bg-slate-200" />
                    <span className="text-[8px] text-slate-400 uppercase tracking-wide">Agency</span>
                    {layer.agencyLevels.map(lvl => {
                      const meta = AGENT_SCOPE_META[lvl];
                      const link = AGENCY_LINK[lvl];
                      return (
                        <a key={`a${lvl}`} href={link.href} title={`${meta.name} — ${meta.description}`}
                          className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium hover:underline"
                          style={{ backgroundColor: `${meta.color}14`, color: meta.color }}>
                          L{lvl} {meta.name}
                        </a>
                      );
                    })}
                  </div>

                  {/* KPI Strip — live data where available */}
                  <div className="flex gap-4 mt-3">
                    {layer.id === 1 && (
                      <>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className="text-lg font-bold" style={{ color: layer.color }}>{liveLayerKpis[1].guardrails}</div>
                            {liveFlags.guardrails && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase">Guardrails</div>
                          <div className="text-[8px] text-slate-400">{liveLayerKpis[1].guardrailsSub}</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className="text-lg font-bold" style={{ color: layer.color }}>{liveLayerKpis[1].pii}</div>
                            {liveFlags.guardrails && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase">Interventions</div>
                          <div className="text-[8px] text-slate-400">{liveLayerKpis[1].piiSub}</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className="text-lg font-bold" style={{ color: layer.color }}>{liveLayerKpis[1].agents}</div>
                            {liveFlags.agents && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase">Agents</div>
                          <div className="text-[8px] text-slate-400">{liveLayerKpis[1].agentsSub}</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className="text-lg font-bold" style={{ color: layer.color }}>{liveLayerKpis[1].compliance}</div>
                            {liveFlags.config && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase">Config</div>
                          <div className="text-[8px] text-slate-400">{liveLayerKpis[1].complianceSub}</div>
                        </div>
                      </>
                    )}
                    {layer.id === 2 && (
                      <>
                        <div className="text-center">
                          <div className="text-lg font-bold" style={{ color: layer.color }}>{liveLayerKpis[2].useCases}</div>
                          <div className="text-[9px] text-slate-500 uppercase">Use Cases</div>
                          <div className="text-[8px] text-slate-400">{liveLayerKpis[2].useCasesSub}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold" style={{ color: layer.color }}>{liveLayerKpis[2].frameworks}</div>
                          <div className="text-[9px] text-slate-500 uppercase">Frameworks</div>
                          <div className="text-[8px] text-slate-400">{liveLayerKpis[2].frameworksSub}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold" style={{ color: layer.color }}>{liveLayerKpis[2].deployments}</div>
                          <div className="text-[9px] text-slate-500 uppercase">Deployments</div>
                          <div className="text-[8px] text-slate-400">{liveLayerKpis[2].deploymentsSub}</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className="text-lg font-bold" style={{ color: layer.color }}>{liveLayerKpis[2].models}</div>
                            {liveFlags.runtime && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase">Invocations</div>
                          <div className="text-[8px] text-slate-400">{liveLayerKpis[2].modelsSub}</div>
                        </div>
                      </>
                    )}
                    {layer.id === 3 && (
                      <>
                        <div className="text-center">
                          <div className="text-lg font-bold" style={{ color: layer.color }}>{liveLayerKpis[3].safety}</div>
                          <div className="text-[9px] text-slate-500 uppercase">AI Safety</div>
                          <div className="text-[8px] text-slate-400">{liveLayerKpis[3].safetySub}</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className="text-lg font-bold" style={{ color: liveKpis.fleetErrorRatePct > 2 ? '#dc2626' : layer.color }}>{liveLayerKpis[3].errorRate}</div>
                            {liveFlags.runtime && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase">Error Rate</div>
                          <div className="text-[8px] text-slate-400">{liveLayerKpis[3].errorRateSub}</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className="text-lg font-bold" style={{ color: layer.color }}>{liveLayerKpis[3].cost}</div>
                            {liveFlags.cost && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase">AI Spend</div>
                          <div className="text-[8px] text-slate-400">{liveLayerKpis[3].costSub}</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className="text-lg font-bold" style={{ color: layer.color }}>{liveLayerKpis[3].fleet}</div>
                            {liveFlags.agents && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                          </div>
                          <div className="text-[9px] text-slate-500 uppercase">Fleet</div>
                          <div className="text-[8px] text-slate-400">{liveLayerKpis[3].fleetSub}</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Readiness Score — computed live from real signals where present */}
                <div className="text-center ml-4" title={readiness[layer.id].basis}>
                  <div className={`text-2xl font-bold ${scoreColor(readiness[layer.id].score)}`}>{readiness[layer.id].score}%</div>
                  <div className="text-[9px] text-slate-400 uppercase">Readiness</div>
                  <div className={`mt-1 h-1.5 w-16 rounded-full ${scoreBg(readiness[layer.id].score)}`}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${readiness[layer.id].score}%`, background: layer.color }}
                    />
                  </div>
                  <div className={`text-[8px] font-medium mt-0.5 ${readiness[layer.id].live ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {readiness[layer.id].live ? '● live' : 'baseline'}
                  </div>
                </div>
              </div>

              {/* Modules Grid — always shown */}
              <div className="flex gap-2 mt-4 flex-wrap">
                {layer.modules.map((mod, i) => {
                  const Wrapper = mod.route ? 'a' : 'div';
                  return (
                    <Wrapper
                      key={i}
                      {...(mod.route ? { href: mod.route } : {})}
                      className="flex-1 min-w-[140px] p-2.5 rounded-lg bg-white/70 border border-slate-200/70 hover:border-blue-400 hover:shadow-sm transition-all"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span style={{ color: layer.color }} className="flex items-center">
                          <Icon name={mod.icon} className="w-3.5 h-3.5" strokeWidth={2} />
                        </span>
                        <span className="text-xs font-semibold text-slate-800">{mod.label}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">{mod.desc}</div>
                    </Wrapper>
                  );
                })}
              </div>

              {/* AWS Services Strip */}
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1">
                  <Icon name="cloud" className="w-3 h-3 text-slate-400" strokeWidth={2} />
                  Powered by
                </span>
                {layer.awsServices.map((svc, i) => (
                  <span key={i} className="px-1.5 py-0.5 text-[9px] rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {svc}
                  </span>
                ))}
              </div>
            </div>

            {/* Expanded Details — only when focused */}
            {focusLayer === layer.id && (
              <div className="border-t border-slate-200/60 p-4 bg-white/40">
                {/* Capabilities */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2" style={{ color: layer.color }}>
                    Capabilities
                  </h4>
                  <div className="space-y-1.5">
                    {layer.capabilities.map((cap, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                        <span className="mt-0.5 flex-shrink-0">{statusIcon(cap.status)}</span>
                        <span>{cap.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AWS Services — Challenge Mapping */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      AWS Services — How They Solve Each Challenge
                    </h4>
                    <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      {layer.awsServiceMap.length} services
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {layer.awsServiceMap.map((svc, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-white/85 border border-slate-200 border-l-[3px]"
                        style={{ borderLeftColor: layer.color }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon name="cloud" className="w-3.5 h-3.5 text-slate-500" strokeWidth={2} />
                          <span className="text-xs font-bold text-slate-800">{svc.service}</span>
                        </div>
                        <div className="text-[10px] italic mb-1" style={{ color: layer.color }}>{svc.challenge}</div>
                        <div className="text-[10px] text-slate-600 leading-snug mb-2">{svc.solves}</div>
                        <div className="border-t border-slate-200/60 pt-1.5">
                          <div className="text-[8px] text-slate-400 uppercase tracking-wide mb-1">Implement</div>
                          <div className="flex flex-wrap gap-1">
                            {svc.features.map((feat, fi) => (
                              <span
                                key={fi}
                                className="text-[8px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200"
                              >
                                {feat}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Key Controls */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Key Controls</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {layer.keyControls.map((ctrl, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200/60">
                        <div>
                          <span className="text-[10px] text-blue-600 font-mono">{ctrl.id}</span>
                          <span className="text-xs text-slate-700 ml-2">{ctrl.name}</span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${controlStatusBadge[ctrl.status]}`}>{ctrl.status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Frontier Agents — only for layers that have them */}
                {layer.frontierAgents && layer.frontierAgents.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-violet-600 uppercase tracking-wide">
                        AWS Frontier Agents
                      </h4>
                      <span className="text-[10px] text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded">
                        Autonomous AI Workers
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {layer.frontierAgents.map((fa, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-lg bg-white/80 border border-violet-200/60 border-t-2 border-t-violet-400"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-800">{fa.agent}</span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded ${
                              fa.status === 'Available'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {fa.status}
                            </span>
                          </div>
                          <div className="text-[9px] text-violet-600 font-medium mb-1">{fa.role}</div>
                          <div className="text-[9px] text-slate-500 leading-snug mb-2">{fa.description}</div>

                          <div className="text-[8px] text-slate-400 uppercase tracking-wide mb-1">Capabilities</div>
                          <div className="space-y-0.5 mb-2">
                            {fa.capabilities.slice(0, 4).map((cap, ci) => (
                              <div key={ci} className="text-[8px] text-slate-600 pl-2 border-l border-violet-200">
                                {cap}
                              </div>
                            ))}
                            {fa.capabilities.length > 4 && (
                              <div className="text-[8px] text-slate-400 pl-2">+{fa.capabilities.length - 4} more</div>
                            )}
                          </div>

                          <div className="p-1.5 rounded bg-violet-50 border border-violet-100">
                            <div className="text-[8px] text-violet-600 font-medium mb-0.5">Governance Relevance</div>
                            <div className="text-[8px] text-slate-600 leading-snug">{fa.govRelevance}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3 Lines of Defense */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                    3 Lines of Defense
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { lod: layer.threeLoD.first, color: '#3b82f6', borderColor: 'border-t-blue-400' },
                      { lod: layer.threeLoD.second, color: '#f59e0b', borderColor: 'border-t-amber-400' },
                      { lod: layer.threeLoD.third, color: '#ef4444', borderColor: 'border-t-rose-400' },
                    ].map(({ lod, color, borderColor }, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-lg bg-white/80 border border-slate-200/60 border-t-2 ${borderColor}`}
                      >
                        <div className="text-[10px] font-semibold mb-0.5" style={{ color }}>
                          {lod.role}
                        </div>
                        <div className="text-[8px] text-slate-400 mb-2">{lod.subtitle}</div>
                        <div className="space-y-2">
                          {lod.activities.map((act, j) => (
                            <div
                              key={j}
                              className="pl-2 border-l-2"
                              style={{ borderLeftColor: `${color}40` }}
                            >
                              <div className="text-[9px] font-medium text-slate-700">{act.title}</div>
                              <div className="text-[8px] text-slate-500 leading-snug">
                                <span className="text-blue-600 font-medium">How: </span>
                                {act.how}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Legacy Layer Mapping */}
                <div className="pt-3 border-t border-slate-200/60">
                  <span className="text-[10px] text-slate-400">Maps to original layers: </span>
                  {layer.oldLayers.map((ol, i) => (
                    <span key={i} className="text-[10px] text-blue-600 ml-1">{ol}{i < layer.oldLayers.length - 1 ? ',' : ''}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      {/* ══════════════════════ SECTION 3: PROVE ══════════════════════ */}
      {!focusLayer && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">3</span>
            <h3 className="text-sm font-semibold text-slate-800">Prove</h3>
            <span className="text-[10px] text-slate-400">— evidence for auditors across every layer</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {/* Evidence Summary */}
            <a
              href="/govern/audit?tab=evidence"
              className="group p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50 hover:border-emerald-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon name="clipboard-document-check" className="w-5 h-5 text-emerald-600" />
                  <span className="text-base font-semibold text-slate-800">Evidence</span>
                </div>
                <span className="text-lg font-bold text-emerald-600">{agg.controlStats.percentage}%</span>
              </div>
              <p className="text-[11px] text-slate-600 mb-3">Evidence collection across all layers</p>
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-600">Controls evidenced</span>
                  <span className="font-medium text-slate-800">{agg.controlStats.implemented}/{agg.controlStats.total}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-600">Audit events (30d)</span>
                  <span className="font-medium text-slate-800">{agg.activityFeed?.length ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-600">Last refresh</span>
                  <span className="font-medium text-emerald-600">Live</span>
                </div>
              </div>
              <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${agg.controlStats.percentage}%` }} />
              </div>
              <div className="mt-3 flex items-center justify-center gap-1 text-[10px] text-emerald-600 font-medium group-hover:underline">
                View Evidence Dashboard <Icon name="arrow-right" className="w-3 h-3" />
              </div>
            </a>

            {/* Framework Reports */}
            <a
              href="/govern/audit?tab=reports"
              className="group p-4 rounded-xl border-2 border-blue-200 bg-blue-50/30 hover:bg-blue-50 hover:border-blue-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon name="document-text" className="w-5 h-5 text-blue-600" />
                <span className="text-base font-semibold text-slate-800">Reports</span>
              </div>
              <p className="text-[11px] text-slate-600 mb-3">Framework-specific compliance packages</p>
              <div className="space-y-1">
                {['SR 26-2', 'NIST AI RMF', 'EU AI Act', 'ISO 42001'].map(fw => (
                  <div key={fw} className="flex items-center justify-between p-1.5 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] font-medium text-slate-700">{fw}</span>
                    <Icon name="document-arrow-down" className="w-3 h-3 text-slate-400" />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-center gap-1 text-[10px] text-blue-600 font-medium group-hover:underline">
                Generate Reports <Icon name="arrow-right" className="w-3 h-3" />
              </div>
            </a>

            {/* Quick Export */}
            <div className="p-4 rounded-xl border-2 border-slate-200 bg-slate-50/30">
              <div className="flex items-center gap-2 mb-2">
                <Icon name="document-arrow-down" className="w-5 h-5 text-slate-600" />
                <span className="text-base font-semibold text-slate-800">Quick Export</span>
              </div>
              <p className="text-[11px] text-slate-600 mb-3">Download Trust Stack summary now</p>
              <div className="space-y-2">
                <button
                  onClick={exportEvidencePackage}
                  className="w-full flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all text-left"
                >
                  <div>
                    <div className="text-[10px] font-medium text-slate-700">Trust Stack Package</div>
                    <div className="text-[9px] text-slate-500">Layers, controls, readiness</div>
                  </div>
                  <Icon name="arrow-down-tray" className="w-4 h-4 text-slate-400" />
                </button>
                <button
                  onClick={openTrustMap}
                  className="w-full flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all text-left"
                >
                  <div>
                    <div className="text-[10px] font-medium text-slate-700">Trust Map</div>
                    <div className="text-[9px] text-slate-500">Trace systems across layers</div>
                  </div>
                  <Icon name="map" className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <a
                href="/govern/audit"
                className="mt-3 flex items-center justify-center gap-1 text-[10px] text-slate-600 font-medium hover:text-blue-600 hover:underline"
              >
                Full Audit & Evidence <Icon name="arrow-right" className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
