/**
 * AgenticCodingGovernance — Enterprise governance for agentic coding tools
 *
 * Provides visibility and control over AI-powered coding assistants:
 * - Dashboard: Usage metrics, API routing compliance, risk overview
 * - Inventory: Detected tools with status, routing, cost
 * - Policies: Allowed tools, routing requirements, context filters
 * - Detection: Shadow usage discovery, direct API alerts
 * - Analytics: Cost trends, token usage, compliance metrics
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, Legend,
} from 'recharts';
import {
  CODING_TOOL_CONFIG, CODING_TOOL_INSTANCES, API_ROUTING_CONFIG,
  type CodingToolStatus, type APIRoutingType,
  tooltipStyle,
} from './mockData';
// Model prices/labels come from the single shared source so this efficiency
// panel cannot drift from FinOps. See ./finops/modelPricing.
import { MODEL_PRICING, PRICED_MODEL_LABELS } from './finops/modelPricing';
import {
  AIDLC_PROJECTS, AIDLC_EXTENSIONS, AIDLC_RULES, AIDLC_FINDINGS,
  AIDLC_STAGES, AIDLC_AUDIT_LOG, AIDLC_METRICS,
  PHASE_CONFIG, EXTENSION_CATEGORY_CONFIG,
  type AidlcPhase,
} from './aidlcData';
import GovernPageLayout from './GovernPageLayout';
import UnifiedGuide, { DEV_TOOLS_GUIDE } from './UnifiedGuide';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import { DataSourceInfo, getPageDataSources } from './DataSourceInfo';
import { Icon, type IconName } from './icons';
import ValidationPanelUI from './ValidationPanelUI';
import GovernPostureScore from './GovernPostureScore';
import AiToolProvenancePanel from './AiToolProvenancePanel';
import { useDataSources } from './DataSourceContext';
import { PolicyDriftContent } from './PolicyDriftDashboard';
import {
  governDeveloperAiApi,
  governAidlcApi,
  governHarnessPolicyApi,
  governPolicyDriftApi,
  governComplianceEvidenceApi,
  type DeveloperAiUsageResponse,
  type LocalAgentDiscoveryResponse,
  type LocalAgentConfig,
  type PolicyEvaluationResult,
  type AgentPolicy,
  type CostAttributionResponse,
  type AidlcProjectsResponse,
  type AidlcFindingsResponse,
  type AidlcMetricsResponse,
  type AidlcAuditResponse,
  type AidlcExtensionsResponse,
  type AidlcHarnessResponse,
  type DetectionSource,
  type KillswitchStatusResponse,
  type HarnessPolicyListResponse,
  type TierBreakdownResponse,
  type HarnessPolicy,
  type HarnessPolicyUpdate,
  type ToolTier,
  type BackendComparisonResponse,
  type HarnessBackend,
  type DriftAnalysisResponse,
  type DriftType,
  type DriftSeverity,
  type ComplianceFramework,
  type FrameworkListResponse,
  type FrameworkCoverageResponse,
  type ControlMappingsResponse,
  type ComplianceEvidenceResponse,
  type ComplianceReport,
  type ComplianceEvidenceStatus,
} from '../../api/client';

type ViewTab = 'dashboard' | 'inventory' | 'policies' | 'detection' | 'analytics' | 'workflows' | 'compliance' | 'policy-drift';

const TABS: { id: ViewTab; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'squares-2x2' },
  { id: 'inventory', label: 'Inventory', icon: 'rectangle-stack' },
  { id: 'policies', label: 'Policies', icon: 'shield-check' },
  { id: 'policy-drift', label: 'Policy Drift', icon: 'exclamation-triangle' },
  { id: 'detection', label: 'Detection', icon: 'magnifying-glass' },
  { id: 'analytics', label: 'Analytics', icon: 'chart-bar' },
  { id: 'workflows', label: 'AI-DLC Workflows', icon: 'arrow-path' },
  { id: 'compliance', label: 'Compliance', icon: 'clipboard-document-check' },
];

/** Framework display names and colors for compliance tab. */
const FRAMEWORK_CONFIG: Record<ComplianceFramework, { name: string; color: string; bgColor: string }> = {
  'soc2': { name: 'SOC 2', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  'nist-ai-rmf': { name: 'NIST AI RMF', color: 'text-purple-700', bgColor: 'bg-purple-50' },
  'iso-42001': { name: 'ISO 42001', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  'ffiec': { name: 'FFIEC', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  'pci-dss': { name: 'PCI DSS', color: 'text-rose-700', bgColor: 'bg-rose-50' },
  'gdpr-ai': { name: 'GDPR AI', color: 'text-indigo-700', bgColor: 'bg-indigo-50' },
};

/** Daily cost threshold for budget alerts (USD per day, prorated from period) */
const DAILY_COST_THRESHOLD_USD = 50;

/** Latest known versions for each harness type (used for version drift detection) */
const LATEST_HARNESS_VERSIONS: Record<string, string> = {
  'claude-code': '2.2.0',
  'kiro-ide': '1.5.0',
  'kiro-cli': '1.5.0',
  'codex-cli': '1.0.0',
  'opencode': '0.8.0',
  'q-desktop': '1.0.0',
  'cursor': '0.5.0',
  'copilot': '1.0.0',
};

/** Detection source labels and colors */
const DETECTION_SOURCE_CONFIG: Record<string, { label: string; bgColor: string; textColor: string; icon: IconName }> = {
  cloudtrail: { label: 'CloudTrail', bgColor: 'bg-blue-100', textColor: 'text-blue-700', icon: 'cloud' },
  config_file: { label: 'Config', bgColor: 'bg-purple-100', textColor: 'text-purple-700', icon: 'document-text' },
  git_commit: { label: 'Git', bgColor: 'bg-orange-100', textColor: 'text-orange-700', icon: 'code-bracket-square' },
  ide_telemetry: { label: 'IDE', bgColor: 'bg-emerald-100', textColor: 'text-emerald-700', icon: 'computer-desktop' },
};

/**
 * Compare two semver-style version strings.
 * Returns true if `version` is older than `latest`.
 */
function isVersionOutdated(version: string | null | undefined, latest: string): boolean {
  if (!version) return false; // Can't determine if version is unknown
  const parseParts = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [vMajor, vMinor = 0, vPatch = 0] = parseParts(version);
  const [lMajor, lMinor = 0, lPatch = 0] = parseParts(latest);
  if (vMajor < lMajor) return true;
  if (vMajor > lMajor) return false;
  if (vMinor < lMinor) return true;
  if (vMinor > lMinor) return false;
  return vPatch < lPatch;
}

function statusBadge(status: CodingToolStatus) {
  const styles: Record<CodingToolStatus, string> = {
    sanctioned: 'bg-emerald-100 text-emerald-700',
    'under-review': 'bg-amber-100 text-amber-700',
    unsanctioned: 'bg-rose-100 text-rose-700',
    blocked: 'bg-slate-200 text-slate-600',
  };
  const labels: Record<CodingToolStatus, string> = {
    sanctioned: 'Sanctioned',
    'under-review': 'Under Review',
    unsanctioned: 'Unsanctioned',
    blocked: 'Blocked',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function routingBadge(routing: APIRoutingType) {
  const config = API_ROUTING_CONFIG[routing];
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${config.compliant ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
      title={config.description}
    >
      {config.label}
    </span>
  );
}

function riskBadge(score: number) {
  if (score <= 25) return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Low</span>;
  if (score <= 50) return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Medium</span>;
  if (score <= 75) return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">High</span>;
  return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">Critical</span>;
}

// ═══════════════════════════════════════════════════════════════════════════
// NULL-SAFE MEASUREMENT HELPERS
//
// The cost/token DTOs are deliberately nullable: `null` means "not measured"
// (no Bedrock invocation-log record matched, or the model has no published
// rate — the `default` pricing fallback was removed). `null` is NOT zero, and
// must never render as 0, $0.00 or an empty string under a Live badge.
//
// Rules enforced here:
//  - Always test with `== null` / `!= null`, never truthiness — `if (cost)`
//    silently reclassifies a genuinely measured 0 as "not measured".
//  - `Math.max` is the wrong reducer over nullable data. Verified behaviour:
//    `Math.max(11.2, null)` === 11.2 (null coerces to 0, so it silently ranks
//    an UNMEASURED row as the cheapest one); `Math.max(1, undefined)` is NaN;
//    `Math.max(...[])` is -Infinity. All three poison downstream bar widths.
//    `maxMeasured` drops non-finite/nullish entries and returns `null` for
//    "no scale available" instead of -Infinity.
//  - Never fabricate a denominator (e.g. `|| 1`). `barWidthPct` guards the
//    divisor explicitly and returns `null` for unmeasured rows so callers can
//    render a visually distinct track rather than a 0-width bar that would
//    read as "cheapest".
// ═══════════════════════════════════════════════════════════════════════════

/** Glyph used for a value the backend explicitly reported as unmeasured. */
const NOT_MEASURED = '—';

/**
 * Largest measured value in `values`, or `null` when nothing is measured.
 * Nulls/undefined/NaN/Infinity are excluded rather than propagated, so a single
 * unpriced row cannot turn the chart scale into NaN. An empty or all-null input
 * returns `null` (never -Infinity).
 */
function maxMeasured(values: Array<number | null | undefined>): number | null {
  let max: number | null = null;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (max === null || v > max) max = v;
  }
  return max;
}

/**
 * Bar width as a CSS percentage string, or `null` when `value` is unmeasured.
 *
 * - value unmeasured        -> null   (caller renders an "unmeasured" track)
 * - value measured, no scale-> '0%'   (max is null/0: nothing to scale against,
 *                                      but the row IS measured, so it still
 *                                      gets a real — empty — bar)
 * - otherwise               -> clamped 0-100% ; never NaN/Infinity
 */
function barWidthPct(value: number | null | undefined, max: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (max == null || !Number.isFinite(max) || max <= 0) return '0%';
  const pct = (value / max) * 100;
  if (!Number.isFinite(pct)) return '0%';
  return `${Math.min(100, Math.max(0, pct))}%`;
}

/** Compact token count. Keeps small counts readable (33 stays "33", not "0k"). */
function formatTokens(n: number): string {
  if (Math.abs(n) < 1000) return n.toLocaleString();
  if (Math.abs(n) < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000).toLocaleString()}k`;
}

/**
 * USD for display. Returns the em-dash for an unmeasured value, `$0.00` for a
 * measured 0, and `<$0.01` for a measured value under a cent.
 *
 * The sub-cent branch is not hypothetical: live `by_user` contains
 * `bedrock_evaluation_rQN7qgxzrU` at `estimated_cost_usd: 0.0001`, and it ranks
 * inside the top 5 by cost, so `toFixed(2)` alone would print a real measured
 * spend as an indistinguishable `$0.00` — the same
 * measured-value-flattened-to-zero defect already fixed for `formatTokens`
 * (`33` must not render `0k`) and in `ShadowAI.tsx`'s `formatCostUsd`.
 */
function formatUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return NOT_MEASURED;
  if (v > 0 && v < 0.005) return '<$0.01';
  return `$${v.toFixed(2)}`;
}

/** Tooltip for a cost cell: full precision when measured, an explanation when not. */
function usdTitle(v: number | null | undefined, subject: string): string {
  if (v == null || !Number.isFinite(v)) {
    return `${subject} cost not measured — the model has no published per-1K rate, or no invocation-log record supplied token counts. Unknown, not zero.`;
  }
  return `Measured: $${v.toFixed(6)}`;
}

/**
 * Render text + tooltip for an input/output token pair where either side may be
 * unmeasured.
 *  - both null      -> em-dash ("unknown", explicitly not zero)
 *  - one null       -> the measured side prefixed with "≥" (a disclosed floor)
 *  - both measured  -> the exact sum (a measured 0 renders as "0")
 */
function describeTokenPair(
  input: number | null | undefined,
  output: number | null | undefined
): { text: string; title: string; measured: boolean } {
  const inOk = input != null && Number.isFinite(input);
  const outOk = output != null && Number.isFinite(output);
  if (!inOk && !outOk) {
    return {
      text: NOT_MEASURED,
      title: 'Input and output tokens were not measured for this row — unknown, not zero.',
      measured: false,
    };
  }
  const total = (inOk ? (input as number) : 0) + (outOk ? (output as number) : 0);
  const parts = [
    inOk ? `${(input as number).toLocaleString()} input` : 'input not measured',
    outOk ? `${(output as number).toLocaleString()} output` : 'output not measured',
  ];
  const partial = !inOk || !outOk;
  return {
    text: partial ? `≥${formatTokens(total)}` : formatTokens(total),
    title: partial
      ? `${parts.join(', ')} — floor only; the unmeasured side is unknown, not zero.`
      : `${parts.join(', ')} = ${total.toLocaleString()} tokens`,
    measured: true,
  };
}

/**
 * Token display for a shadow-AI identity. Prefers the input/output breakdown
 * when the backend supplied either side (so a partial measurement is disclosed
 * as a floor), and falls back to the `tokens` total. Only a genuinely absent
 * measurement renders as the em-dash.
 */
function describeShadowTokens(u: {
  tokens: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
}): { text: string; title: string; measured: boolean } {
  if (u.input_tokens != null || u.output_tokens != null) {
    return describeTokenPair(u.input_tokens, u.output_tokens);
  }
  if (u.tokens == null) {
    return {
      text: NOT_MEASURED,
      title: 'Tokens not measured for this identity — no Bedrock invocation-log record matched it. Unknown, not zero.',
      measured: false,
    };
  }
  return {
    text: formatTokens(u.tokens),
    title: `${u.tokens.toLocaleString()} tokens measured`,
    measured: true,
  };
}

export default function DevToolsGovernance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ViewTab | null;
  const activeTab = tabParam && TABS.some(t => t.id === tabParam) ? tabParam : 'dashboard';

  // Data source context for health tracking
  const { updateSource } = useDataSources();

  const [statusFilter, setStatusFilter] = useState<'all' | CodingToolStatus>('all');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [toolStatuses, setToolStatuses] = useState<Record<string, CodingToolStatus>>(
    Object.fromEntries(CODING_TOOL_INSTANCES.map(t => [t.id, t.status]))
  );
  const [showActionToast, setShowActionToast] = useState<string | null>(null);

  // Live data from API
  const [liveData, setLiveData] = useState<DeveloperAiUsageResponse | null>(null);
  const [liveDataLoading, setLiveDataLoading] = useState(true);

  // Local agent discovery from API
  const [localAgentsData, setLocalAgentsData] = useState<LocalAgentDiscoveryResponse | null>(null);
  const [localAgentsLoading, setLocalAgentsLoading] = useState(false);
  const [localAgentsScanTriggered, setLocalAgentsScanTriggered] = useState(false);

  // Bring into governance drawer state
  const [governanceAgent, setGovernanceAgent] = useState<LocalAgentConfig | null>(null);
  const [governanceAction, setGovernanceAction] = useState<'register' | 'policy' | 'block'>('register');
  const [notifyOwner, setNotifyOwner] = useState(true);

  // Policy engine data
  const [policyData, setPolicyData] = useState<AgentPolicy | null>(null);
  const [policyEvaluation, setPolicyEvaluation] = useState<PolicyEvaluationResult | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);

  // Cost attribution data
  const [costData, setCostData] = useState<CostAttributionResponse | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  // AI-DLC workflow data
  const [aidlcProjects, setAidlcProjects] = useState<AidlcProjectsResponse | null>(null);
  const [aidlcFindings, setAidlcFindings] = useState<AidlcFindingsResponse | null>(null);
  const [aidlcMetrics, setAidlcMetrics] = useState<AidlcMetricsResponse | null>(null);
  const [, setAidlcAudit] = useState<AidlcAuditResponse | null>(null);

  // Harness detection source filter
  const [harnessSourceFilter, setHarnessSourceFilter] = useState<string>('all');
  const [aidlcExtensions, setAidlcExtensions] = useState<AidlcExtensionsResponse | null>(null);
  const [aidlcHarnesses, setAidlcHarnesses] = useState<AidlcHarnessResponse | null>(null);
  const [aidlcLoading, setAidlcLoading] = useState(false);

  // Backend sandboxing state
  const [backendComparison, setBackendComparison] = useState<BackendComparisonResponse | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);

  // Kill-switch state
  const [killswitchStatus, setKillswitchStatus] = useState<KillswitchStatusResponse | null>(null);
  const [killswitchLoading, setKillswitchLoading] = useState(false);
  const [killswitchToggling, setKillswitchToggling] = useState(false);
  const [killswitchReason, setKillswitchReason] = useState('');

  // Harness tool policy state
  const [harnessPolicies, setHarnessPolicies] = useState<HarnessPolicyListResponse | null>(null);
  const [tierBreakdown, setTierBreakdown] = useState<TierBreakdownResponse | null>(null);
  const [harnessPolicyLoading, setHarnessPolicyLoading] = useState(false);
  const [selectedHarnessPolicy, setSelectedHarnessPolicy] = useState<HarnessPolicy | null>(null);
  const [harnessPolicyEditing, setHarnessPolicyEditing] = useState(false);
  const [harnessPolicySaving, setHarnessPolicySaving] = useState(false);

  // Policy drift detection state
  const [driftData, setDriftData] = useState<DriftAnalysisResponse | null>(null);
  const [driftLoading, setDriftLoading] = useState(false);
  const [driftTypeFilter, setDriftTypeFilter] = useState<DriftType | 'all'>('all');
  const [driftSeverityFilter, setDriftSeverityFilter] = useState<DriftSeverity | 'all'>('all');
  const [driftShowResolved, setDriftShowResolved] = useState(false);
  const [driftResolving, setDriftResolving] = useState<string | null>(null);

  // Compliance Evidence Chain state
  const [complianceFrameworks, setComplianceFrameworks] = useState<FrameworkListResponse | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<ComplianceFramework>('soc2');
  const [frameworkCoverage, setFrameworkCoverage] = useState<FrameworkCoverageResponse | null>(null);
  const [controlMappings, setControlMappings] = useState<ControlMappingsResponse | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceReport, setComplianceReport] = useState<ComplianceReport | null>(null);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [selectedControlEvidence, setSelectedControlEvidence] = useState<ComplianceEvidenceResponse | null>(null);
  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  // Fetch live usage data from API
  useEffect(() => {
    let cancelled = false;
    setLiveDataLoading(true);
    governDeveloperAiApi.usage()
      .then(d => {
        if (!cancelled) {
          setLiveData(d);
          // Update data source health when we get live data
          if (d.live) {
            updateSource('aws-cloudtrail', { status: 'live', lastFetch: Date.now() });
            updateSource('aws-cloudwatch', { status: 'live', lastFetch: Date.now() });
          }
        }
      })
      .catch(() => {
        updateSource('aws-cloudtrail', { status: 'error', error: 'API unavailable' });
      })
      .finally(() => { if (!cancelled) setLiveDataLoading(false); });
    return () => { cancelled = true; };
  }, [updateSource]);

  // Fetch local agents when on detection tab or scan triggered
  useEffect(() => {
    if (activeTab !== 'detection' && !localAgentsScanTriggered) return;
    if (localAgentsData && !localAgentsScanTriggered) return; // Don't refetch if we have data
    let cancelled = false;
    setLocalAgentsLoading(true);
    governDeveloperAiApi.localAgents(100)
      .then(d => { if (!cancelled) setLocalAgentsData(d); })
      .catch(() => { /* Fall back to mock data */ })
      .finally(() => {
        if (!cancelled) {
          setLocalAgentsLoading(false);
          setLocalAgentsScanTriggered(false);
        }
      });
    return () => { cancelled = true; };
  }, [activeTab, localAgentsScanTriggered]);

  // Fetch policy data when on policies tab
  useEffect(() => {
    if (activeTab !== 'policies') return;
    if (policyData && policyEvaluation) return; // Don't refetch if we have data
    let cancelled = false;
    setPolicyLoading(true);
    Promise.all([
      governDeveloperAiApi.policy('default'),
      governDeveloperAiApi.evaluatePolicy('default', 7),
    ])
      .then(([policy, evaluation]) => {
        if (!cancelled) {
          setPolicyData(policy);
          setPolicyEvaluation(evaluation);
        }
      })
      .catch(() => { /* Fall back gracefully */ })
      .finally(() => { if (!cancelled) setPolicyLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab]);

  // Fetch cost data when on analytics tab
  useEffect(() => {
    if (activeTab !== 'analytics') return;
    if (costData) return; // Don't refetch if we have data
    let cancelled = false;
    setCostLoading(true);
    governDeveloperAiApi.costAttribution(7)
      .then(data => { if (!cancelled) setCostData(data); })
      .catch(() => { /* Fall back gracefully */ })
      .finally(() => { if (!cancelled) setCostLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab]);

  // Fetch all workflows tab data in parallel (AI-DLC, harness policies, backend comparison)
  useEffect(() => {
    if (activeTab !== 'workflows') return;
    // Skip fetches for data we already have
    const needsAidlc = !aidlcProjects;
    const needsHarnessPolicy = !harnessPolicies;
    const needsBackend = !backendComparison;
    if (!needsAidlc && !needsHarnessPolicy && !needsBackend) return;

    let cancelled = false;

    // Set loading states for what we're fetching
    if (needsAidlc) setAidlcLoading(true);
    if (needsHarnessPolicy) setHarnessPolicyLoading(true);
    if (needsBackend) setBackendLoading(true);

    // Build fetch groups - each group handles its own errors independently
    const fetchGroups: Promise<void>[] = [];

    if (needsAidlc) {
      fetchGroups.push(
        Promise.all([
          governAidlcApi.projects(50),
          governAidlcApi.findings(),
          governAidlcApi.metrics(),
          governAidlcApi.audit(),
          governAidlcApi.extensions(),
          governAidlcApi.harnesses(7),
        ])
          .then(([projects, findings, metrics, audit, extensions, harnesses]) => {
            if (!cancelled) {
              setAidlcProjects(projects);
              setAidlcFindings(findings);
              setAidlcMetrics(metrics);
              setAidlcAudit(audit);
              setAidlcExtensions(extensions);
              setAidlcHarnesses(harnesses);
              // Update Bedrock data source status
              if (harnesses?.live) {
                updateSource('aws-bedrock', { status: 'live', lastFetch: Date.now() });
              }
            }
          })
          .catch(() => { /* Fall back to mock data */ })
          .finally(() => { if (!cancelled) setAidlcLoading(false); })
      );
    }

    if (needsHarnessPolicy) {
      fetchGroups.push(
        Promise.all([
          governHarnessPolicyApi.list(),
          governHarnessPolicyApi.tiers(),
        ])
          .then(([policies, tiers]) => {
            if (!cancelled) {
              setHarnessPolicies(policies);
              setTierBreakdown(tiers);
            }
          })
          .catch(() => { /* Fall back gracefully */ })
          .finally(() => { if (!cancelled) setHarnessPolicyLoading(false); })
      );
    }

    if (needsBackend) {
      fetchGroups.push(
        governAidlcApi.backendComparison()
          .then(data => { if (!cancelled) setBackendComparison(data); })
          .catch(() => { /* Fall back gracefully */ })
          .finally(() => { if (!cancelled) setBackendLoading(false); })
      );
    }

    // Fire all groups in parallel - each handles its own errors
    Promise.allSettled(fetchGroups);

    return () => { cancelled = true; };
  }, [activeTab]);

  // Fetch policy drift data when on policies tab
  useEffect(() => {
    if (activeTab !== 'policies') return;
    if (driftData) return; // Don't refetch if we have data
    let cancelled = false;
    setDriftLoading(true);
    governPolicyDriftApi.analyze(24)
      .then(data => { if (!cancelled) setDriftData(data); })
      .catch(() => { /* Fall back gracefully */ })
      .finally(() => { if (!cancelled) setDriftLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab]);

  // Handle resolving a drift finding
  const handleResolveDriftFinding = async (findingId: string) => {
    setDriftResolving(findingId);
    try {
      await governPolicyDriftApi.resolve(findingId, 'Resolved via Govern UI');
      // Refresh drift data
      const refreshed = await governPolicyDriftApi.analyze(24);
      setDriftData(refreshed);
      setShowActionToast('Drift finding resolved');
      setTimeout(() => setShowActionToast(null), 3000);
    } catch {
      setShowActionToast('Failed to resolve finding');
      setTimeout(() => setShowActionToast(null), 3000);
    } finally {
      setDriftResolving(null);
    }
  };

  // Harness policy save handler
  const handleHarnessPolicySave = async (harnessType: string, update: HarnessPolicyUpdate) => {
    setHarnessPolicySaving(true);
    try {
      const updated = await governHarnessPolicyApi.update(harnessType, update);
      // Refresh the policies list
      const refreshedPolicies = await governHarnessPolicyApi.list();
      setHarnessPolicies(refreshedPolicies);
      setSelectedHarnessPolicy(updated);
      setHarnessPolicyEditing(false);
      setShowActionToast('Harness policy updated successfully');
      setTimeout(() => setShowActionToast(null), 3000);
    } catch {
      setShowActionToast('Failed to update harness policy');
      setTimeout(() => setShowActionToast(null), 3000);
    } finally {
      setHarnessPolicySaving(false);
    }
  };

  // Fetch kill-switch status when on workflows tab
  useEffect(() => {
    if (activeTab !== 'workflows') return;
    let cancelled = false;
    setKillswitchLoading(true);
    governAidlcApi.killswitchStatus()
      .then(status => { if (!cancelled) setKillswitchStatus(status); })
      .catch(() => { /* Graceful fallback - assume enabled */ })
      .finally(() => { if (!cancelled) setKillswitchLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab]);

  // Handle kill-switch toggle
  const handleKillswitchToggle = async () => {
    if (!killswitchStatus) return;
    setKillswitchToggling(true);
    try {
      const result = await governAidlcApi.updateKillswitch(!killswitchStatus.disabled, killswitchReason || undefined);
      setKillswitchStatus(result.status);
      setKillswitchReason('');
      setShowActionToast(result.message);
      setTimeout(() => setShowActionToast(null), 5000);
      // Refresh harness data if we just re-enabled
      if (result.status.disabled === false) {
        governAidlcApi.harnesses(7).then(setAidlcHarnesses).catch(() => {});
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to toggle kill-switch';
      setShowActionToast(message);
      setTimeout(() => setShowActionToast(null), 5000);
    } finally {
      setKillswitchToggling(false);
    }
  };

  // Fetch compliance frameworks list when on compliance tab
  useEffect(() => {
    if (activeTab !== 'compliance') return;
    if (complianceFrameworks) return; // Don't refetch if we have data
    let cancelled = false;
    setComplianceLoading(true);
    governComplianceEvidenceApi.listFrameworks()
      .then(data => { if (!cancelled) setComplianceFrameworks(data); })
      .catch(() => { /* Fall back gracefully */ })
      .finally(() => { if (!cancelled) setComplianceLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab]);

  // Fetch framework coverage and mappings when framework changes
  useEffect(() => {
    if (activeTab !== 'compliance') return;
    let cancelled = false;
    setComplianceLoading(true);
    Promise.all([
      governComplianceEvidenceApi.getCoverage(selectedFramework),
      governComplianceEvidenceApi.getControlMappings(selectedFramework),
    ])
      .then(([coverage, mappings]) => {
        if (!cancelled) {
          setFrameworkCoverage(coverage);
          setControlMappings(mappings);
        }
      })
      .catch(() => { /* Fall back gracefully */ })
      .finally(() => { if (!cancelled) setComplianceLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, selectedFramework]);

  // Generate compliance report handler
  const handleGenerateReport = async () => {
    setReportGenerating(true);
    try {
      const report = await governComplianceEvidenceApi.generateReport(selectedFramework);
      setComplianceReport(report);
      setShowActionToast('Compliance report generated successfully');
      setTimeout(() => setShowActionToast(null), 3000);
    } catch {
      setShowActionToast('Failed to generate compliance report');
      setTimeout(() => setShowActionToast(null), 3000);
    } finally {
      setReportGenerating(false);
    }
  };

  // Export evidence handler
  const handleExportEvidence = async () => {
    try {
      const exportData = await governComplianceEvidenceApi.exportEvidence(selectedFramework, 'json');
      // Download as JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-evidence-${selectedFramework}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowActionToast('Evidence export downloaded');
      setTimeout(() => setShowActionToast(null), 3000);
    } catch {
      setShowActionToast('Failed to export evidence');
      setTimeout(() => setShowActionToast(null), 3000);
    }
  };

  // View evidence for a control
  const handleViewEvidence = async (controlId: string) => {
    setEvidenceLoading(true);
    setEvidenceDrawerOpen(true);
    try {
      const evidence = await governComplianceEvidenceApi.getEvidence(selectedFramework, controlId);
      setSelectedControlEvidence(evidence);
    } catch {
      setShowActionToast('Failed to load evidence');
      setTimeout(() => setShowActionToast(null), 3000);
    } finally {
      setEvidenceLoading(false);
    }
  };

  // Focus trap for tool detail drawer
  useEffect(() => {
    if (!selectedTool) return;

    const drawer = document.querySelector('[role="dialog"]');
    if (!drawer) return;

    const focusableEls = drawer.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstEl = focusableEls[0] as HTMLElement;
    const lastEl = focusableEls[focusableEls.length - 1] as HTMLElement;

    firstEl?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedTool(null);
        return;
      }
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl?.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedTool]);

  const isLiveData = liveData?.live === true;

  const setActiveTab = (tab: ViewTab) => {
    setSearchParams({ tab });
  };

  // Computed stats - merges live data with mock tool inventory
  const stats = useMemo(() => {
    const tools = CODING_TOOL_INSTANCES;
    const activeTools = tools.filter(t => t.status !== 'blocked');
    const sanctioned = tools.filter(t => t.status === 'sanctioned');
    const compliantRouting = activeTools.filter(t => API_ROUTING_CONFIG[t.apiRouting].compliant);

    // Use live data for active users and cost when available (flat fields from backend)
    const liveActiveUsers = liveData?.active_users;
    const liveCost = liveData?.total_cost_usd;
    const liveTokens = liveData?.total_tokens;

    // Shadow AI count from live data — prefer total_shadow_events if available
    const liveShadowCount = liveData?.shadow_ai?.total_shadow_events
      ?? (liveData?.shadow_ai
        ? (liveData.shadow_ai.unapproved_users?.length || 0) +
          (liveData.shadow_ai.unknown_tools?.length || 0) +
          (liveData.shadow_ai.unapproved_models?.length || 0)
        : null);

    return {
      totalTools: tools.length,
      sanctioned: sanctioned.length,
      underReview: tools.filter(t => t.status === 'under-review').length,
      unsanctioned: tools.filter(t => t.status === 'unsanctioned').length,
      blocked: tools.filter(t => t.status === 'blocked').length,
      totalUsers: tools.reduce((sum, t) => sum + t.userCount, 0),
      activeUsers: liveActiveUsers ?? activeTools.reduce((sum, t) => sum + t.userCount, 0),
      routingCompliance: activeTools.length > 0 ? Math.round((compliantRouting.length / activeTools.length) * 100) : 0,
      totalCost: liveCost ?? tools.reduce((sum, t) => sum + t.costMonthly, 0), // total_cost_usd is already the total
      totalTokens: liveTokens ?? tools.reduce((sum, t) => sum + t.tokensConsumed30d, 0),
      totalLines: tools.reduce((sum, t) => sum + t.linesShared30d, 0),
      shadowCount: liveShadowCount ?? tools.filter(t => t.status === 'unsanctioned' || t.status === 'under-review').length,
      // Track which stats are from live data
      hasLiveUsers: liveActiveUsers != null,
      hasLiveCost: liveCost != null,
    };
  }, [liveData]);

  const filteredTools = useMemo(() => {
    if (statusFilter === 'all') return CODING_TOOL_INSTANCES;
    return CODING_TOOL_INSTANCES.filter(t => t.status === statusFilter);
  }, [statusFilter]);

  const toolDistribution = useMemo(() => {
    return CODING_TOOL_INSTANCES.filter(t => t.status !== 'blocked').map(t => ({
      name: CODING_TOOL_CONFIG[t.toolType].label,
      value: t.userCount,
      color: CODING_TOOL_CONFIG[t.toolType].color,
    }));
  }, []);

  const routingDistribution = useMemo(() => {
    const byRouting: Record<string, number> = {};
    CODING_TOOL_INSTANCES.filter(t => t.status !== 'blocked').forEach(t => {
      const label = API_ROUTING_CONFIG[t.apiRouting].label;
      byRouting[label] = (byRouting[label] || 0) + t.userCount;
    });
    return Object.entries(byRouting).map(([name, value]) => ({
      name,
      value,
      color: Object.values(API_ROUTING_CONFIG).find(c => c.label === name)?.color || '#6B7280',
      compliant: Object.values(API_ROUTING_CONFIG).find(c => c.label === name)?.compliant || false,
    }));
  }, []);

  const selectedToolData = selectedTool ? CODING_TOOL_INSTANCES.find(t => t.id === selectedTool) : null;

  // The page-level badge must NOT imply that everything below it is measured. It
  // previously read "Live team breakdown and usage data", which was false twice over:
  // there is no team dimension in CloudTrail or the Bedrock invocation logs (the
  // Usage-by-Team panel now says so explicitly), and most panels on this page are still
  // illustrative. Because this badge sits in the page header, a page-wide "Live" claim
  // silently vouches for every unbadged card below it. It now names only what this
  // endpoint actually feeds and defers to the per-panel badges.
  const pageBadge = isLiveData
    ? (
      <LiveDataBadge
        source={liveData?.source}
        detail="Tool and principal usage from CloudTrail and Bedrock invocation logs. Other panels on this page are marked individually — a Live badge here does not cover them."
      />
    )
    : <MockDataBadge integration="Amazon Q Developer + Amazon Bedrock" />;

  return (
    <GovernPageLayout
      title="Agentic Coding Governance"
      description="Govern AI-powered coding assistants — track API routing, code context exposure, and enforce developer tool policies."
      badge={pageBadge}
      actions={<Link to="/govern/shadow-ai" className="text-sm text-blue-600 hover:text-blue-800 font-medium">Shadow AI →</Link>}
    >
      {/* How to Use Guide */}
      <UnifiedGuide {...DEV_TOOLS_GUIDE} />

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl mb-6 overflow-x-auto" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════ DASHBOARD TAB ════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Governance Posture Score — prominent display */}
          <GovernPostureScore />

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-slate-500">Tools Detected</span>
                <MockDataBadge integration="Endpoint/MDM tool detection" />
              </div>
              <div className="text-2xl font-bold text-slate-900">{stats.totalTools}</div>
              <div className="text-[10px] text-slate-500 mt-1">{stats.sanctioned} sanctioned, {stats.unsanctioned + stats.underReview} shadow</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-slate-500">Active Users</span>
                {stats.hasLiveUsers && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Live data" />}
              </div>
              <div className="text-2xl font-bold text-blue-600">{stats.activeUsers.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 mt-1">across all tools</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-slate-500">API Compliance</span>
                <MockDataBadge integration="API routing telemetry" />
              </div>
              <div className={`text-2xl font-bold ${stats.routingCompliance >= 80 ? 'text-emerald-600' : stats.routingCompliance >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                {stats.routingCompliance}%
              </div>
              <div className="text-[10px] text-slate-500 mt-1">routed through governed APIs</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-slate-500">Context Exposure</span>
                <MockDataBadge integration="Code context DLP telemetry" />
              </div>
              <div className="text-2xl font-bold text-rose-600">{(stats.totalLines / 1000000).toFixed(1)}M</div>
              <div className="text-[10px] text-slate-500 mt-1">lines of code shared (30d)</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-slate-500">Monthly Cost</span>
                {stats.hasLiveCost && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Live data" />}
              </div>
              <div className="text-2xl font-bold text-emerald-600">${(stats.totalCost / 1000).toFixed(1)}K</div>
              <div className="text-[10px] text-slate-500 mt-1">all coding tools</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-slate-500">Shadow Usage</span>
                {isLiveData && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Live data" />}
              </div>
              <div className={`text-2xl font-bold ${stats.shadowCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{stats.shadowCount}</div>
              <div className="text-[10px] text-slate-500 mt-1">ungoverned tools detected</div>
            </div>
          </div>

          {/* Loading skeleton for Live Activity */}
          {liveDataLoading && !liveData && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5 animate-pulse">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-2 h-2 rounded-full bg-slate-300" />
                <div className="h-4 w-48 bg-slate-200 rounded" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="text-center p-3 rounded-lg bg-slate-100 border border-slate-200">
                    <div className="h-6 w-8 bg-slate-200 rounded mx-auto mb-1" />
                    <div className="h-3 w-12 bg-slate-200 rounded mx-auto" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <div className="h-4 w-24 bg-slate-200 rounded mb-2" />
                    <div className="space-y-2">
                      {[1, 2, 3].map(j => (
                        <div key={j} className="h-8 bg-slate-200 rounded" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Agentic Coding Usage — from CloudTrail */}
          {liveData?.shadow_ai && (liveData.shadow_ai.unknown_tools?.length > 0 || liveData.shadow_ai.unapproved_users?.length > 0) && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-semibold text-slate-900">Live Agentic Coding Activity</span>
                </div>
                {/* Honesty gate: use the backend's own live/source triple rather than
                    inferring "live" from the fact that the fetch succeeded. */}
                <LiveDataBadge
                  live={liveData.shadow_ai.live === true}
                  source={liveData.shadow_ai.source || 'CloudTrail'}
                />
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="text-xl font-bold text-slate-900">{liveData.shadow_ai.unknown_tools?.length || 0}</div>
                  <div className="text-[10px] text-amber-700">Tools</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="text-xl font-bold text-slate-900">{liveData.shadow_ai.unapproved_users?.length || 0}</div>
                  <div className="text-[10px] text-blue-700">Users</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-purple-50 border border-purple-200">
                  <div className="text-xl font-bold text-slate-900">{liveData.shadow_ai.unapproved_models?.length || 0}</div>
                  <div className="text-[10px] text-purple-700">Models</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="text-xl font-bold text-slate-900">
                    {liveData.shadow_ai.unknown_tools?.reduce((sum, t) => sum + t.requests, 0) || 0}
                  </div>
                  <div className="text-[10px] text-emerald-700">API Calls</div>
                </div>
              </div>

              {/* Detailed Lists */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Tools */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                    <Icon name="command-line" className="w-3.5 h-3.5" />
                    Active Tools
                  </div>
                  <div className="space-y-2">
                    {liveData.shadow_ai.unknown_tools?.slice(0, 3).map((tool, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-white border border-slate-100">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                          <span className="text-xs font-medium text-slate-800 truncate" title={tool.tool_name}>{tool.tool_name}</span>
                        </div>
                        <span className="text-xs text-slate-500 ml-2 flex-shrink-0">{tool.requests} req</span>
                      </div>
                    ))}
                    {(!liveData.shadow_ai.unknown_tools || liveData.shadow_ai.unknown_tools.length === 0) && (
                      <div className="text-xs text-slate-400 text-center py-2">No tools detected</div>
                    )}
                  </div>
                </div>

                {/* Users */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                    <Icon name="users" className="w-3.5 h-3.5" />
                    Active Users
                  </div>
                  <div className="space-y-2">
                    {liveData.shadow_ai.unapproved_users?.slice(0, 3).map((user, i) => {
                      // tokens / input_tokens / output_tokens are all nullable — a null is
                      // "not measured", so it renders as an em-dash, never as 0k.
                      const tokenView = describeShadowTokens(user);
                      return (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-white border border-slate-100">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-medium text-blue-700 flex-shrink-0">
                              {user.email.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-slate-800 truncate" title={user.email}>{user.email}</span>
                          </div>
                          <span
                            className={`text-xs ml-2 flex-shrink-0 cursor-help ${tokenView.measured ? 'text-slate-500' : 'text-slate-300 italic'}`}
                            title={tokenView.title}
                          >
                            {tokenView.text}
                          </span>
                        </div>
                      );
                    })}
                    {(!liveData.shadow_ai.unapproved_users || liveData.shadow_ai.unapproved_users.length === 0) && (
                      <div className="text-xs text-slate-400 text-center py-2">No users detected</div>
                    )}
                  </div>
                </div>

                {/* Models */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                    <Icon name="cpu-chip" className="w-3.5 h-3.5" />
                    Models Used
                  </div>
                  <div className="space-y-2">
                    {liveData.shadow_ai.unapproved_models?.slice(0, 3).map((model, i) => {
                      const shortName = model.model_id.split('/').pop()?.replace(/v\d+:\d+$/, '').replace('us.anthropic.', '').replace('us.amazon.', '') || model.model_id;
                      return (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-white border border-slate-100">
                          <span className="text-xs font-medium text-slate-800 truncate flex-1 min-w-0" title={model.model_id}>
                            {shortName}
                          </span>
                          {/* cost is nullable: no published per-1K rate (the `default`
                              rate was removed) or no measured tokens. Render unknown,
                              not $0.00 — a measured 0 still renders as $0.00. */}
                          <span
                            className={`text-xs font-medium ml-2 flex-shrink-0 cursor-help ${
                              model.cost == null ? 'text-slate-300 italic' : 'text-emerald-600'
                            }`}
                            title={usdTitle(model.cost, model.model_id)}
                          >
                            {formatUsd(model.cost)}
                          </span>
                        </div>
                      );
                    })}
                    {(!liveData.shadow_ai.unapproved_models || liveData.shadow_ai.unapproved_models.length === 0) && (
                      <div className="text-xs text-slate-400 text-center py-2">No models detected</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Coverage disclosure: how many rows in this panel are unmeasured, plus
                  the backend's own caveat. Without this, an em-dash row is easy to miss
                  and the panel reads as complete. */}
              {(() => {
                const unpricedModels = liveData.shadow_ai.unapproved_models?.filter(m => m.cost == null).length || 0;
                const unmeasuredUsers = liveData.shadow_ai.unapproved_users?.filter(u => !describeShadowTokens(u).measured).length || 0;
                const partialUsers = liveData.shadow_ai.unapproved_users?.filter(
                  u => u.input_tokens == null || u.output_tokens == null
                ).length || 0;
                const caveats: string[] = [];
                if (unpricedModels > 0) caveats.push(`${unpricedModels} model${unpricedModels !== 1 ? 's' : ''} unpriced (cost unknown, not $0)`);
                if (unmeasuredUsers > 0) caveats.push(`${unmeasuredUsers} identit${unmeasuredUsers !== 1 ? 'ies' : 'y'} with no token measurement`);
                if (partialUsers > 0) caveats.push(`${partialUsers} identit${partialUsers !== 1 ? 'ies' : 'y'} measured on one side only (shown as a floor)`);
                if (caveats.length === 0 && !liveData.shadow_ai.note) return null;
                return (
                  <div className="mt-4 pt-3 border-t border-slate-200 space-y-1">
                    {caveats.length > 0 && (
                      <div className="text-[10px] text-amber-700 flex items-start gap-1.5">
                        <Icon name="exclamation-triangle" className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span>Coverage: {caveats.join('; ')}.</span>
                      </div>
                    )}
                    {liveData.shadow_ai.note && (
                      <div className="text-[10px] text-slate-500">{liveData.shadow_ai.note}</div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tool Distribution */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Users by Coding Tool</div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={toolDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    dataKey="value"
                    label={false}
                  >
                    {toolDistribution.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [`${value} users`, name]} />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '11px', paddingLeft: '10px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* API Routing Compliance */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">API Routing Compliance</div>
              <div className="space-y-3">
                {routingDistribution.map((entry, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-24 text-xs font-medium text-slate-700">{entry.name}</div>
                    <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min((entry.value / stats.activeUsers) * 100, 100)}%`,
                          backgroundColor: entry.compliant ? '#10B981' : '#EF4444'
                        }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-700">
                        {entry.value} users
                      </span>
                    </div>
                    <span className={`w-20 text-right text-[10px] font-semibold ${entry.compliant ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {entry.compliant ? 'Governed' : 'Ungoverned'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-lg bg-slate-50 flex items-center justify-between">
                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">{stats.routingCompliance}%</span> of users on governed APIs
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Bedrock / Azure / Vertex</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Direct API</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tool Capability Matrix */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Tool Governance Capabilities</div>
              <div className="text-xs text-slate-500">Enterprise readiness comparison</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Tool</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Bedrock</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Azure</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Self-Host</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Prompt Log</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(CODING_TOOL_CONFIG).filter(([key]) => key !== 'other').map(([key, config]) => (
                    <tr key={key} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
                          <span className="font-medium text-slate-900">{config.label}</span>
                          <span className="text-[10px] text-slate-400">{config.vendor}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {config.routingOptions.includes('bedrock') ? (
                          <Icon name="check" className="w-4 h-4 text-emerald-600 mx-auto" strokeWidth={2} />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {config.routingOptions.includes('azure-openai') ? (
                          <Icon name="check" className="w-4 h-4 text-emerald-600 mx-auto" strokeWidth={2} />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {config.selfHosted ? (
                          <Icon name="check" className="w-4 h-4 text-emerald-600 mx-auto" strokeWidth={2} />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {config.promptLogging ? (
                          <Icon name="check" className="w-4 h-4 text-emerald-600 mx-auto" strokeWidth={2} />
                        ) : (
                          <Icon name="x-mark" className="w-4 h-4 text-rose-500 mx-auto" strokeWidth={2} />
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {config.enterpriseTier ? (
                          <Icon name="check" className="w-4 h-4 text-emerald-600 mx-auto" strokeWidth={2} />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-2">
                <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <strong>Governance Gap:</strong> GitHub Copilot and Cursor cannot be routed through AWS Bedrock or Azure OpenAI.
                  They use direct vendor APIs, bypassing enterprise guardrails and audit logging. Consider Claude Code, Kiro, Cody, or Tabnine for governed alternatives.
                </div>
              </div>
            </div>
          </div>

          {/* Risk Overview */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="text-sm font-semibold text-slate-900 mb-4">Tool Risk Assessment</div>
            <div className="space-y-3">
              {CODING_TOOL_INSTANCES.sort((a, b) => b.riskScore - a.riskScore).map(tool => {
                const config = CODING_TOOL_CONFIG[tool.toolType];
                return (
                  <div key={tool.id} className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-2 w-40">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
                      <span className="text-sm font-medium text-slate-900">{config.label}</span>
                    </div>
                    <div className="flex-1">
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            tool.riskScore <= 25 ? 'bg-emerald-500' :
                            tool.riskScore <= 50 ? 'bg-amber-500' :
                            tool.riskScore <= 75 ? 'bg-orange-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${tool.riskScore}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-16 text-right">
                      {riskBadge(tool.riskScore)}
                    </div>
                    <div className="w-24">
                      {statusBadge(tool.status)}
                    </div>
                    <div className="w-24 text-right text-xs text-slate-600">
                      {tool.userCount} users
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ INVENTORY TAB ════════════════════════════════ */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          {/* This tab had no badge at all. Its rows come entirely from
              CODING_TOOL_INSTANCES in mockData, so without one it inherited the page
              header's claim - and that header can read Live when the usage endpoint is up. */}
          <div className="flex items-center justify-end">
            <MockDataBadge integration="Endpoint/MDM tool inventory — coding-tool instances, user counts and API routing are illustrative; connect an MDM or endpoint agent to populate them" />
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-slate-600">Filter by Status:</span>
            <div className="flex gap-1 flex-wrap">
              {(['all', 'sanctioned', 'under-review', 'unsanctioned', 'blocked'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === status
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {status === 'all' ? 'All' : status === 'under-review' ? 'Under Review' : status.charAt(0).toUpperCase() + status.slice(1)}
                  {status === 'all' && ` (${CODING_TOOL_INSTANCES.length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Tools Table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Tool</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Vendor</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Routing</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-slate-600">Users</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-slate-600">Cost/Mo</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Risk</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTools.map(tool => {
                    const config = CODING_TOOL_CONFIG[tool.toolType];
                    return (
                      <tr key={tool.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
                            <div>
                              <div className="font-medium text-slate-900">{config.label}</div>
                              <div className="text-[10px] text-slate-500">v{tool.version}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{config.vendor}</td>
                        <td className="px-4 py-3 text-center">{statusBadge(tool.status)}</td>
                        <td className="px-4 py-3 text-center">{routingBadge(tool.apiRouting)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{tool.userCount}</td>
                        <td className="px-4 py-3 text-right text-slate-700">${tool.costMonthly.toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">{riskBadge(tool.riskScore)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedTool(tool.id)}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tool Detail Drawer */}
          {selectedToolData && (
            <div
              className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl border-l border-slate-200 z-50 overflow-y-auto"
              role="dialog"
              aria-modal="true"
            >
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CODING_TOOL_CONFIG[selectedToolData.toolType].color }} />
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{CODING_TOOL_CONFIG[selectedToolData.toolType].label}</h3>
                    <div className="text-xs text-slate-500">v{selectedToolData.version} • {CODING_TOOL_CONFIG[selectedToolData.toolType].vendor}</div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTool(null)}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                  aria-label="Close"
                >
                  <Icon name="x-mark" className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Status & Routing */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-slate-50">
                    <div className="text-[10px] font-medium text-slate-500 mb-1">Status</div>
                    {statusBadge(toolStatuses[selectedToolData.id])}
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50">
                    <div className="text-[10px] font-medium text-slate-500 mb-1">API Routing</div>
                    {routingBadge(selectedToolData.apiRouting)}
                  </div>
                </div>

                {/* Usage Stats */}
                <div>
                  <div className="text-sm font-semibold text-slate-900 mb-3">Usage Statistics</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-lg font-bold text-slate-900">{selectedToolData.userCount}</div>
                      <div className="text-[10px] text-slate-500">Active Users</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-lg font-bold text-slate-900">{selectedToolData.repoCount}</div>
                      <div className="text-[10px] text-slate-500">Repos Accessed</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-lg font-bold text-slate-900">{(selectedToolData.invocations30d / 1000).toFixed(1)}K</div>
                      <div className="text-[10px] text-slate-500">Invocations (30d)</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-lg font-bold text-slate-900">{(selectedToolData.tokensConsumed30d / 1000000).toFixed(0)}M</div>
                      <div className="text-[10px] text-slate-500">Tokens (30d)</div>
                    </div>
                  </div>
                </div>

                {/* Code Context Exposure */}
                <div>
                  <div className="text-sm font-semibold text-slate-900 mb-3">Code Context Exposure</div>
                  <div className="p-4 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="eye" className="w-4 h-4 text-rose-600" />
                      <span className="text-sm font-semibold text-rose-800">{(selectedToolData.linesShared30d / 1000000).toFixed(1)}M lines shared</span>
                    </div>
                    <div className="text-xs text-rose-700">
                      Code from {selectedToolData.repoCount} repositories has been sent to external AI models in the last 30 days.
                    </div>
                  </div>
                </div>

                {/* Context Filters */}
                <div>
                  <div className="text-sm font-semibold text-slate-900 mb-3">Context Filters</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 rounded bg-slate-50">
                      <span className="text-xs text-slate-700">PII Masking</span>
                      <span className={`text-xs font-semibold ${selectedToolData.contextFilters.piiMaskingEnabled ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {selectedToolData.contextFilters.piiMaskingEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-slate-50">
                      <span className="text-xs text-slate-700">Secrets Filter</span>
                      <span className={`text-xs font-semibold ${selectedToolData.contextFilters.secretsFilterEnabled ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {selectedToolData.contextFilters.secretsFilterEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    {selectedToolData.contextFilters.excludedRepos.length > 0 && (
                      <div className="p-2 rounded bg-slate-50">
                        <span className="text-xs text-slate-700">Excluded Repos:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedToolData.contextFilters.excludedRepos.map(repo => (
                            <span key={repo} className="px-2 py-0.5 rounded bg-slate-200 text-[10px] text-slate-700">{repo}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Risk Factors */}
                {selectedToolData.riskFactors.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold text-slate-900 mb-3">Risk Factors</div>
                    <div className="space-y-2">
                      {selectedToolData.riskFactors.map((factor, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200">
                          <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600 mt-0.5" />
                          <span className="text-xs text-amber-800">{factor}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Teams */}
                <div>
                  <div className="text-sm font-semibold text-slate-900 mb-3">Teams Using</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedToolData.teams.map(team => (
                      <span key={team} className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-medium text-slate-700">{team}</span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  {toolStatuses[selectedToolData.id] === 'unsanctioned' && (
                    <>
                      <button
                        onClick={() => {
                          setToolStatuses(prev => ({ ...prev, [selectedToolData.id]: 'sanctioned' }));
                          setShowActionToast('Tool sanctioned successfully');
                          setTimeout(() => setShowActionToast(null), 3000);
                        }}
                        className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        Sanction Tool
                      </button>
                      <button
                        onClick={() => {
                          setToolStatuses(prev => ({ ...prev, [selectedToolData.id]: 'blocked' }));
                          setShowActionToast('Tool blocked');
                          setTimeout(() => setShowActionToast(null), 3000);
                        }}
                        className="flex-1 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
                      >
                        Block Tool
                      </button>
                    </>
                  )}
                  {toolStatuses[selectedToolData.id] === 'under-review' && (
                    <>
                      <button
                        onClick={() => {
                          setToolStatuses(prev => ({ ...prev, [selectedToolData.id]: 'sanctioned' }));
                          setShowActionToast('Tool approved and sanctioned');
                          setTimeout(() => setShowActionToast(null), 3000);
                        }}
                        className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          setToolStatuses(prev => ({ ...prev, [selectedToolData.id]: 'blocked' }));
                          setShowActionToast('Tool rejected and blocked');
                          setTimeout(() => setShowActionToast(null), 3000);
                        }}
                        className="flex-1 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {toolStatuses[selectedToolData.id] === 'sanctioned' && (
                    <button
                      onClick={() => {
                        setShowActionToast('Policy configuration coming soon');
                        setTimeout(() => setShowActionToast(null), 3000);
                      }}
                      className="flex-1 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
                    >
                      Configure Policies
                    </button>
                  )}
                  {toolStatuses[selectedToolData.id] === 'blocked' && (
                    <button
                      onClick={() => {
                        setToolStatuses(prev => ({ ...prev, [selectedToolData.id]: 'under-review' }));
                        setShowActionToast('Tool moved to review');
                        setTimeout(() => setShowActionToast(null), 3000);
                      }}
                      className="flex-1 px-4 py-2 rounded-lg bg-amber-100 text-amber-700 text-sm font-semibold hover:bg-amber-200 transition-colors"
                    >
                      Re-evaluate
                    </button>
                  )}
                </div>
                {showActionToast && (
                  <div
                    className="fixed bottom-4 right-4 z-[60] bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4"
                    role="alert"
                    aria-live="polite"
                  >
                    <Icon name="check-circle" className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm">{showActionToast}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════ GOVERNANCE CONFIGURATION GUIDES ═══════════════ */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">How to Govern Each Tool</div>
                <div className="text-xs text-slate-500">Official configuration guides for enterprise governance</div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Claude Code */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">CC</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">Claude Code</div>
                    <div className="text-xs text-slate-500">Route through AWS Bedrock, Azure, or Vertex for full governance</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Full Governance</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Enable Bedrock Routing</div>
                      <div className="bg-slate-900 rounded p-2 font-mono text-[10px] text-slate-100">
                        <div><span className="text-amber-400">export</span> CLAUDE_CODE_USE_BEDROCK=<span className="text-emerald-400">1</span></div>
                        <div><span className="text-amber-400">export</span> AWS_REGION=<span className="text-cyan-400">us-east-1</span></div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Attach Guardrails</div>
                      <div className="bg-slate-900 rounded p-2 font-mono text-[10px] text-slate-100">
                        <div><span className="text-amber-400">export</span> ANTHROPIC_CUSTOM_HEADERS=<span className="text-cyan-400">"X-Amzn-Bedrock-GuardrailIdentifier: gr-xxx"</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Bedrock Guardrails</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> CloudTrail Logging</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> IAM Access Control</span>
                    <a href="https://code.claude.com/docs/en/amazon-bedrock" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      Official Docs <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </details>

              {/* Kiro */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">K</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">Kiro (AWS)</div>
                    <div className="text-xs text-slate-500">Native AWS governance with IAM Identity Center and admin controls</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Full Governance</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Admin Console Controls</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>• <strong>Settings → Model</strong>: Manage allowed models</div>
                        <div>• <strong>Settings → MCP</strong>: Control MCP server access</div>
                        <div>• <strong>Settings → API Keys</strong>: Enable/disable key generation</div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">CI/CD Integration</div>
                      <div className="bg-slate-900 rounded p-2 font-mono text-[10px] text-slate-100">
                        <div><span className="text-amber-400">export</span> KIRO_API_KEY=<span className="text-cyan-400">$&#123;&#123; secrets.KIRO_API_KEY &#125;&#125;</span></div>
                        <div>kiro-cli chat --trust-tools=read,grep</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> IAM Identity Center</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Model Allowlisting</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> GovCloud Support</span>
                    <a href="https://kiro.dev/docs" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      Official Docs <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </details>

              {/* GitHub Copilot */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">GH</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">GitHub Copilot</div>
                    <div className="text-xs text-slate-500">Content exclusions and enterprise policies (no cloud routing)</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Limited Governance</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex items-start gap-2">
                      <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div className="text-xs text-amber-800">
                        <strong>Governance Gap:</strong> Copilot cannot route through Bedrock/Azure OpenAI. All traffic goes to GitHub servers. No prompt/completion logging available.
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Content Exclusions (Enterprise)</div>
                      <div className="bg-slate-900 rounded p-2 font-mono text-[10px] text-slate-100">
                        <div className="text-slate-400"># In enterprise settings</div>
                        <div><span className="text-cyan-400">"*"</span>:</div>
                        <div>  - <span className="text-emerald-400">"**/.env"</span></div>
                        <div>  - <span className="text-emerald-400">"/secrets/**"</span></div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">What You CAN Control</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>• File/repo exclusion patterns (fnmatch)</div>
                        <div>• Feature enable/disable per org</div>
                        <div>• Audit logs for admin actions</div>
                        <div>• Privacy mode (no training on your code)</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Content Exclusions</span>
                    <span className="flex items-center gap-1 text-rose-600"><Icon name="x-circle" className="w-3.5 h-3.5" /> No Cloud Routing</span>
                    <span className="flex items-center gap-1 text-rose-600"><Icon name="x-circle" className="w-3.5 h-3.5" /> No Prompt Logging</span>
                    <a href="https://docs.github.com/en/copilot/managing-copilot/managing-github-copilot-in-your-organization" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      Official Docs <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </details>

              {/* Cursor */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">C</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">Cursor</div>
                    <div className="text-xs text-slate-500">SSO and budget controls only — no API routing or content inspection</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">Minimal Governance</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="flex items-start gap-2">
                      <Icon name="x-circle" className="w-4 h-4 text-rose-600 mt-0.5" />
                      <div className="text-xs text-rose-800">
                        <strong>Not Recommended for Strict Governance:</strong> Cursor has no BYOM/API routing option. All requests go through Cursor's infrastructure. No way to intercept or route traffic through enterprise-controlled systems.
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">What You CAN Control</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>• SAML/OIDC SSO + SCIM provisioning</div>
                        <div>• Team-level budget caps</div>
                        <div>• Model access per team</div>
                        <div>• Privacy mode (no training)</div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">What You CANNOT Control</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div className="text-rose-600">• API routing (no Bedrock/Azure)</div>
                        <div className="text-rose-600">• Prompt/response inspection</div>
                        <div className="text-rose-600">• Data residency selection</div>
                        <div className="text-rose-600">• SIEM log export</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="text-xs text-blue-800">
                      <strong>Recommendation:</strong> For enterprises requiring API-level governance, consider migrating to Claude Code (Bedrock), Kiro, or Tabnine with BYOM.
                    </div>
                  </div>
                </div>
              </details>

              {/* Tabnine */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">T</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">Tabnine</div>
                    <div className="text-xs text-slate-500">Self-hosted, air-gapped, BYOM with Bedrock/Azure/Vertex</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Full Governance</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Deployment Options</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>• <strong>VPC</strong>: K8s on your AWS/GCP/Azure</div>
                        <div>• <strong>On-Premises</strong>: K8s on your servers</div>
                        <div>• <strong>Air-Gapped</strong>: Fully network isolated</div>
                        <div>• <strong>Secure SaaS</strong>: Tabnine-hosted</div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">BYOM Configuration</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>Admin Console → Settings → Models → Add AI Model</div>
                        <div className="mt-1">Supports: Bedrock, Azure AI, Vertex AI, OpenAI, self-hosted LLMs (vLLM)</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="text-xs text-emerald-800">
                      <strong>Zero Retention:</strong> Code context deleted immediately after inference. No training on your code. SOC 2, ISO 27001, HIPAA, PCI DSS compliant.
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Self-Hosted</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> BYOM</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Air-Gapped</span>
                    <a href="https://docs.tabnine.com/main/getting-started/enterprise" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      Official Docs <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </details>

              {/* Cody (Sourcegraph) */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">SG</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">Cody (Sourcegraph)</div>
                    <div className="text-xs text-slate-500">Self-hosted with Bedrock/Azure/Vertex routing, RBAC, and context filters</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Full Governance</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Bedrock Configuration</div>
                      <div className="bg-slate-900 rounded p-2 font-mono text-[10px] text-slate-100">
                        <div><span className="text-cyan-400">"provider"</span>: <span className="text-emerald-400">"aws-bedrock"</span>,</div>
                        <div><span className="text-cyan-400">"chatModel"</span>: <span className="text-emerald-400">"anthropic.claude-3-opus"</span>,</div>
                        <div><span className="text-cyan-400">"endpoint"</span>: <span className="text-emerald-400">"us-east-1"</span></div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Context Filters (Enterprise)</div>
                      <div className="bg-slate-900 rounded p-2 font-mono text-[10px] text-slate-100">
                        <div><span className="text-cyan-400">"cody.contextFilters"</span>: &#123;</div>
                        <div>  <span className="text-cyan-400">"exclude"</span>: [&#123; <span className="text-emerald-400">"repoNamePattern"</span>: <span className="text-amber-400">".*secrets.*"</span> &#125;]</div>
                        <div>&#125;</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Self-Hosted</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> BYOM</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> RBAC + SAML</span>
                    <span className="flex items-center gap-1 text-emerald-600"><Icon name="check-circle" className="w-3.5 h-3.5" /> Audit Logs</span>
                    <a href="https://sourcegraph.com/docs/cody/enterprise" target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      Official Docs <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </details>

              {/* Amazon Q Developer */}
              <details className="group border border-slate-200 rounded-lg overflow-hidden">
                <summary className="flex items-center gap-3 p-4 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">Q</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">Amazon Q Developer</div>
                    <div className="text-xs text-slate-500">AWS-native with IAM — consider upgrading to Kiro for agentic features</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">AWS Native</span>
                  <Icon name="chevron-down" className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-slate-200 bg-white space-y-4">
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="flex items-start gap-2">
                      <Icon name="arrow-up-circle" className="w-4 h-4 text-blue-600 mt-0.5" />
                      <div className="text-xs text-blue-800">
                        <strong>Recommendation:</strong> For advanced agentic coding capabilities, consider upgrading to <strong>Kiro</strong> which provides enhanced agent features, steering files, and MCP server governance while maintaining AWS-native integration.
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">IAM Permissions Required</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>• <code className="bg-slate-200 px-1 rounded text-[10px]">q:StartConversation</code></div>
                        <div>• <code className="bg-slate-200 px-1 rounded text-[10px]">q:SendMessage</code></div>
                        <div>• <code className="bg-slate-200 px-1 rounded text-[10px]">q:PassRequest</code> (for AWS API access)</div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Governance Features</div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div>• IAM Identity Center SSO</div>
                        <div>• CloudTrail logging (q.amazonaws.com)</div>
                        <div>• VPC endpoints for IDE features</div>
                      </div>
                    </div>
                  </div>
                </div>
              </details>

            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ POLICIES TAB ════════════════════════════════ */}
      {activeTab === 'policies' && (
        <div className="space-y-6">
          {/* Policy Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Icon name="check-circle" className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Allowed Tools</div>
                  <div className="text-xs text-slate-500">Sanctioned for enterprise use</div>
                </div>
              </div>
              <div className="space-y-2">
                {CODING_TOOL_INSTANCES.filter(t => t.status === 'sanctioned').map(tool => (
                  <div key={tool.id} className="flex items-center gap-2 p-2 rounded bg-emerald-50">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CODING_TOOL_CONFIG[tool.toolType].color }} />
                    <span className="text-xs font-medium text-slate-700">{CODING_TOOL_CONFIG[tool.toolType].label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Icon name="arrow-path" className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Required Routing</div>
                  <div className="text-xs text-slate-500">API gateway requirements</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="p-2 rounded bg-blue-50">
                  <div className="text-xs font-medium text-slate-700 mb-1">Compliant Routes:</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(API_ROUTING_CONFIG).filter(([, c]) => c.compliant).map(([key, config]) => (
                      <span key={key} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                        {config.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-2 rounded bg-rose-50">
                  <div className="text-xs font-medium text-slate-700 mb-1">Non-Compliant:</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(API_ROUTING_CONFIG).filter(([, c]) => !c.compliant).map(([key, config]) => (
                      <span key={key} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
                        {config.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
                  <Icon name="x-circle" className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Blocked Tools</div>
                  <div className="text-xs text-slate-500">Prohibited for security reasons</div>
                </div>
              </div>
              <div className="space-y-2">
                {CODING_TOOL_INSTANCES.filter(t => t.status === 'blocked').map(tool => (
                  <div key={tool.id} className="flex items-center gap-2 p-2 rounded bg-rose-50">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CODING_TOOL_CONFIG[tool.toolType].color }} />
                    <span className="text-xs font-medium text-slate-700">{CODING_TOOL_CONFIG[tool.toolType].label}</span>
                    <span className="text-[10px] text-rose-600 ml-auto">No governance</span>
                  </div>
                ))}
                {CODING_TOOL_INSTANCES.filter(t => t.status === 'blocked').length === 0 && (
                  <div className="text-xs text-slate-500 italic">No tools currently blocked</div>
                )}
              </div>
            </div>
          </div>

          {/* Context Filter Policies */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Code Context Exclusions</div>
              <button
                onClick={() => {
                  setShowActionToast('Exclusion configuration coming soon');
                  setTimeout(() => setShowActionToast(null), 3000);
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
              >
                + Add Exclusion
              </button>
            </div>
            <div className="space-y-3">
              {[
                { pattern: '**/secrets/**', scope: 'All Tools', reason: 'Contains API keys and credentials' },
                { pattern: '**/compliance-data/**', scope: 'All Tools', reason: 'Regulatory sensitive data' },
                { pattern: '**/customer-pii/**', scope: 'All Tools', reason: 'Customer PII' },
                { pattern: '**/proprietary-algo/**', scope: 'Non-Bedrock', reason: 'Trade secret algorithms' },
              ].map((exclusion, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                  <div className="flex items-center gap-3">
                    <code className="px-2 py-1 rounded bg-slate-200 text-xs font-mono text-slate-700">{exclusion.pattern}</code>
                    <span className="text-xs text-slate-600">{exclusion.reason}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">{exclusion.scope}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Path Jail Security - Blocked Patterns per Harness */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-rose-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon name="lock-closed" className="w-5 h-5 text-rose-600" />
                <div>
                  <span className="text-sm font-semibold text-slate-900">Path Jail Security</span>
                  <div className="text-xs text-slate-500">Blocked path patterns per harness policy (inspired by VVAH _jail())</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/govern/path-jail"
                  className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors flex items-center gap-1.5"
                >
                  <Icon name="cog" className="w-3.5 h-3.5" />
                  Manage Rules
                </Link>
                <span className="px-2 py-1 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">Security Layer</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* Default Blocked Patterns */}
              <div className="p-4 rounded-lg bg-rose-50 border border-rose-200">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="shield-exclamation" className="w-4 h-4 text-rose-600" />
                  <span className="text-xs font-semibold text-rose-800">Default Blocked Patterns</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    { pattern: '**/secrets/**', desc: 'Secret directories' },
                    { pattern: '**/.env*', desc: 'Environment files' },
                    { pattern: '**/credentials*', desc: 'Credential files' },
                    { pattern: '**/*.pem', desc: 'SSL certificates' },
                    { pattern: '**/*.key', desc: 'Private keys' },
                    { pattern: '**/id_rsa*', desc: 'SSH keys' },
                    { pattern: '**/.aws/**', desc: 'AWS config' },
                    { pattern: '**/.ssh/**', desc: 'SSH config' },
                  ].map((p, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <code className="text-[10px] font-mono text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">{p.pattern}</code>
                      <span className="text-[10px] text-rose-600">{p.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Protection Types */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="shield-check" className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-semibold text-slate-800">Active Protections</span>
                </div>
                <div className="space-y-2">
                  {[
                    { type: 'Traversal Attack', desc: 'Blocks ../ path escape attempts', icon: 'arrow-uturn-left' as IconName },
                    { type: 'Symlink Escape', desc: 'Prevents symlink-based escapes', icon: 'link' as IconName },
                    { type: 'Absolute Path', desc: 'Blocks paths outside jail root', icon: 'folder' as IconName },
                    { type: 'Pattern Blocking', desc: 'Glob-based sensitive file blocking', icon: 'funnel' as IconName },
                  ].map((p, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded bg-white border border-slate-100">
                      <Icon name={p.icon} className="w-3.5 h-3.5 text-slate-500" />
                      <div className="flex-1">
                        <div className="text-[10px] font-medium text-slate-700">{p.type}</div>
                        <div className="text-[9px] text-slate-500">{p.desc}</div>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-500" title="Active" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Jail Violation Alerts */}
            <div className="border-t border-rose-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-700">Recent Jail Violations</span>
                <span className="text-[10px] text-slate-500">Last 24 hours</span>
              </div>
              <div className="space-y-2">
                {[
                  { time: '2h ago', path: '../../../etc/passwd', type: 'Traversal Attack', harness: 'Claude Code', user: 'jsmith', severity: 'critical' },
                  { time: '4h ago', path: '/secrets/api_key.env', type: 'Blocked Pattern', harness: 'Kiro', user: 'mlee', severity: 'high' },
                  { time: '8h ago', path: 'symlink_to_outside', type: 'Symlink Escape', harness: 'Claude Code', user: 'akumar', severity: 'high' },
                  { time: '12h ago', path: '~/.ssh/id_rsa', type: 'Blocked Pattern', harness: 'Codex CLI', user: 'tchen', severity: 'medium' },
                ].map((v, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-rose-50 border border-rose-200">
                    <div className={`w-2 h-2 rounded-full ${
                      v.severity === 'critical' ? 'bg-rose-600 animate-pulse' :
                      v.severity === 'high' ? 'bg-orange-500' : 'bg-amber-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-[10px] font-mono text-rose-700 truncate max-w-[200px]" title={v.path}>{v.path}</code>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-100 text-rose-700">{v.type}</span>
                      </div>
                      <div className="text-[9px] text-slate-500">{v.harness} - {v.user} - {v.time}</div>
                    </div>
                    <button
                      onClick={() => {
                        setShowActionToast('Violation details coming soon');
                        setTimeout(() => setShowActionToast(null), 3000);
                      }}
                      className="text-[10px] text-rose-600 hover:text-rose-700 font-medium"
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-start gap-2">
                  <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <strong>Security Alert:</strong> Path jail violations are logged to CloudTrail and may trigger automated policy suspension after repeated attempts.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Usage Quotas */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="text-sm font-semibold text-slate-900 mb-4">Usage Quotas</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-slate-50">
                <div className="text-xs font-medium text-slate-500 mb-1">Daily Token Limit</div>
                <div className="text-xl font-bold text-slate-900">10M</div>
                <div className="text-[10px] text-slate-500">per user</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50">
                <div className="text-xs font-medium text-slate-500 mb-1">Session Token Limit</div>
                <div className="text-xl font-bold text-slate-900">500K</div>
                <div className="text-[10px] text-slate-500">per session</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50">
                <div className="text-xs font-medium text-slate-500 mb-1">Daily Invocations</div>
                <div className="text-xl font-bold text-slate-900">1,000</div>
                <div className="text-[10px] text-slate-500">per user</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50">
                <div className="text-xs font-medium text-slate-500 mb-1">Monthly Budget</div>
                <div className="text-xl font-bold text-slate-900">$50K</div>
                <div className="text-[10px] text-slate-500">org-wide</div>
              </div>
            </div>
          </div>

          {/* Live Policy Evaluation */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-indigo-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon name="shield-check" className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-semibold text-slate-900">Live Policy Evaluation</span>
                {policyEvaluation?.live && <LiveDataBadge source="CloudTrail" />}
              </div>
              {policyLoading && (
                <span className="text-xs text-slate-500 animate-pulse">Loading...</span>
              )}
            </div>

            {policyEvaluation && (
              <>
                {/* Evaluation Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xs font-medium text-slate-500 mb-1">Events Evaluated</div>
                    <div className="text-2xl font-bold text-slate-900">{policyEvaluation.total_evaluated}</div>
                    <div className="text-[10px] text-slate-400">Last 7 days</div>
                  </div>
                  <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="text-xs font-medium text-emerald-700 mb-1">Approved</div>
                    <div className="text-2xl font-bold text-emerald-600">{policyEvaluation.approved_count}</div>
                    <div className="text-[10px] text-emerald-500">
                      {policyEvaluation.total_evaluated > 0
                        ? `${Math.round((policyEvaluation.approved_count / policyEvaluation.total_evaluated) * 100)}%`
                        : '0%'}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="text-xs font-medium text-amber-700 mb-1">Needs Review</div>
                    <div className="text-2xl font-bold text-amber-600">{policyEvaluation.review_count}</div>
                    <div className="text-[10px] text-amber-500">Flagged for review</div>
                  </div>
                  <div className="p-4 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="text-xs font-medium text-rose-700 mb-1">Blocked</div>
                    <div className="text-2xl font-bold text-rose-600">{policyEvaluation.blocked_count}</div>
                    <div className="text-[10px] text-rose-500">Policy violations</div>
                  </div>
                </div>

                {/* Active Policy Rules */}
                {policyData && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="text-xs font-semibold text-emerald-700 mb-2">Approved Tools</div>
                      <div className="flex flex-wrap gap-1">
                        {policyData.approved_tools.map(tool => (
                          <span key={tool} className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-700">
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <div className="text-xs font-semibold text-amber-700 mb-2">Requires Review</div>
                      <div className="flex flex-wrap gap-1">
                        {policyData.review_tools.map(tool => (
                          <span key={tool} className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-100 text-amber-700">
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-xs font-semibold text-slate-700 mb-2">Approved Models</div>
                      <div className="flex flex-wrap gap-1">
                        {policyData.approved_models.slice(0, 4).map(model => (
                          <span key={model} className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600">
                            {model}
                          </span>
                        ))}
                        {policyData.approved_models.length > 4 && (
                          <span className="px-2 py-0.5 rounded text-[10px] text-slate-500">
                            +{policyData.approved_models.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Violations */}
                {policyEvaluation.violations.length > 0 && (
                  <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">Policy Violations</span>
                      <span className="text-[10px] text-slate-500">{policyEvaluation.violations.length} found</span>
                    </div>
                    <div className="divide-y divide-slate-200 max-h-48 overflow-y-auto">
                      {policyEvaluation.violations.map(violation => (
                        <div key={violation.id} className="flex items-center justify-between px-4 py-3 hover:bg-white transition-colors">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              violation.severity === 'critical' ? 'bg-rose-500' :
                              violation.severity === 'high' ? 'bg-orange-500' :
                              violation.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                            }`} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-900">{violation.user}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{violation.violation_type}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 truncate">
                                {violation.rule_matched.length > 50 ? violation.rule_matched.slice(0, 50) + '...' : violation.rule_matched}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              <div className="text-xs font-semibold text-slate-700">{violation.request_count} reqs</div>
                              <div className="text-[10px] text-slate-400">{violation.action_taken}</div>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-semibold ${
                              violation.policy_status === 'blocked' ? 'bg-rose-100 text-rose-700' :
                              violation.policy_status === 'review' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {violation.policy_status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {policyEvaluation.violations.length === 0 && (
                  <div className="text-center py-6 text-sm text-emerald-600 bg-emerald-50 rounded-lg border border-emerald-200">
                    <Icon name="check-circle" className="w-6 h-6 mx-auto mb-2" />
                    All activity compliant with policy
                  </div>
                )}

                {policyEvaluation.note && (
                  <div className="mt-3 text-[10px] text-slate-500 text-right">{policyEvaluation.note}</div>
                )}
              </>
            )}

            {!policyEvaluation && !policyLoading && (
              <div className="text-center py-6 text-sm text-slate-500">
                Policy evaluation data not available
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════ DETECTION TAB ════════════════════════════════ */}
      {activeTab === 'detection' && (
        <div className="space-y-6">
          {/* Detection Sources */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { name: 'Network Egress', status: 'active', findings: 47, desc: 'API calls to ai vendor endpoints' },
              { name: 'Endpoint Telemetry', status: 'partial', findings: 23, desc: 'IDE plugin detection via EDR' },
              { name: 'API Gateway Logs', status: 'active', findings: 156, desc: 'Requests through approved gateways' },
              { name: 'CI/CD Pipeline', status: 'active', findings: 12, desc: 'AI tools in build processes' },
            ].map(source => (
              <div key={source.name} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-900">{source.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    source.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {source.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mb-2">{source.desc}</div>
                <div className="text-lg font-bold text-slate-900">{source.findings} <span className="text-xs font-normal text-slate-500">findings (30d)</span></div>
              </div>
            ))}
          </div>

          {/* Shadow Usage Alerts */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Shadow Usage Detected</div>
              <Link to="/govern/shadow-ai" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                View All in Shadow AI →
              </Link>
            </div>
            <div className="space-y-3">
              {[
                { tool: 'Cursor', severity: 'high', detected: '2026-06-12', team: 'Platform Eng', issue: 'Direct API calls - no cloud routing available' },
                { tool: 'Windsurf', severity: 'high', detected: '2026-06-15', team: 'Frontend', issue: 'No enterprise tier or audit logging' },
                { tool: 'Claude Code', severity: 'medium', detected: '2026-06-08', team: 'ML Eng', issue: 'Using native Anthropic API instead of Bedrock' },
                { tool: 'Copilot', severity: 'medium', detected: '2026-06-10', team: 'Multiple', issue: 'No prompt logging capability' },
              ].map((alert, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${alert.severity === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                    <div>
                      <div className="text-sm font-medium text-slate-900">{alert.tool}</div>
                      <div className="text-[10px] text-slate-500">{alert.team} • Detected {alert.detected}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 max-w-xs text-right">{alert.issue}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Detection Coverage */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="text-sm font-semibold text-slate-900 mb-3">Detection Coverage by Tool Category</div>
            <div className="space-y-2.5">
              {[
                { category: 'AWS-Native', coverage: 100, tools: 'Kiro, Q Desktop, Q in VS Code', method: 'CloudTrail userAgent', color: 'emerald' },
                { category: 'Bedrock-Routed', coverage: 100, tools: 'Claude Code via Bedrock', method: 'CloudTrail userAgent', color: 'emerald' },
                { category: 'Azure-Routed', coverage: 85, tools: 'Tools via Azure OpenAI', method: 'APIM logs (requires integration)', color: 'amber' },
                { category: 'Direct API', coverage: 30, tools: 'Copilot, Cursor, direct Anthropic/OpenAI', method: 'Network egress / EDR only', color: 'rose' },
              ].map(item => (
                <div key={item.category} className="flex items-center gap-3">
                  <div className="w-28 text-xs font-medium text-slate-700">{item.category}</div>
                  <div className="flex-1">
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-${item.color}-500`}
                        style={{ width: `${item.coverage}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-10 text-right text-xs font-semibold text-slate-700">{item.coverage}%</div>
                  <div className="w-56 text-[10px] text-slate-500 truncate" title={item.tools}>{item.tools}</div>
                </div>
              ))}
            </div>

            {/* How to improve coverage */}
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-2">
                <Icon name="light-bulb" className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-800">
                  <strong>Improve Direct API coverage:</strong> Route tools through Bedrock Gateway,
                  deploy network proxy for api.openai.com / api.anthropic.com, or use EDR telemetry.
                </div>
              </div>
            </div>
          </div>

          {/* Tool Detection Matrix */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="text-sm font-semibold text-slate-900 mb-3">Tool Detection Matrix</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 pr-4 font-medium text-slate-700">Tool</th>
                    <th className="text-center py-2 px-2 font-medium text-slate-700">CloudTrail</th>
                    <th className="text-center py-2 px-2 font-medium text-slate-700">Config Files</th>
                    <th className="text-center py-2 px-2 font-medium text-slate-700">External Logs</th>
                    <th className="text-left py-2 pl-4 font-medium text-slate-700">Detection Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    { tool: 'Claude Code', ct: true, cfg: 'CLAUDE.md', ext: null, ua: 'CloudTrail userAgent: claude-cli/*' },
                    { tool: 'Kiro', ct: true, cfg: '.kiro/steering/', ext: null, ua: 'CloudTrail userAgent: kiro/*' },
                    { tool: 'Q Desktop', ct: true, cfg: '.aws/amazonq/', ext: null, ua: 'CloudTrail userAgent: amazonq/*' },
                    { tool: 'Q in VS Code', ct: true, cfg: null, ext: null, ua: 'CloudTrail userAgent: aws-toolkit-vscode/*' },
                    { tool: 'GitHub Copilot', ct: false, cfg: '.github/copilot-instructions.md', ext: 'GitHub Audit Log API', ua: 'Requires GitHub Enterprise' },
                    { tool: 'Copilot for M365', ct: false, cfg: null, ext: 'Azure AD / Purview', ua: 'Microsoft 365 Audit Logs' },
                    { tool: 'Cursor', ct: false, cfg: '.cursor/rules/', ext: 'Network/EDR', ua: 'Egress to api.cursor.sh' },
                    { tool: 'Continue.dev', ct: 'depends', cfg: '.continue/', ext: 'depends', ua: 'Routes via configured backend' },
                  ].map(item => (
                    <tr key={item.tool} className="hover:bg-slate-50">
                      <td className="py-2 pr-4 font-medium text-slate-900">{item.tool}</td>
                      <td className="py-2 px-2 text-center">
                        {item.ct === true ? (
                          <span className="inline-flex w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 items-center justify-center">
                            <Icon name="check" className="w-3 h-3" />
                          </span>
                        ) : item.ct === false ? (
                          <span className="inline-flex w-5 h-5 rounded-full bg-slate-100 text-slate-400 items-center justify-center">
                            <Icon name="x-mark" className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="text-amber-600 text-[10px]">config</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {item.cfg ? (
                          <span className="text-emerald-600 font-mono text-[10px]">{item.cfg}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {item.ext ? (
                          <span className="text-blue-600 text-[10px]">{item.ext}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 pl-4 text-slate-500 text-[10px]">{item.ua}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* External Log Source Integration */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="globe-alt" className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-900">External Log Source Integration</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">Coming Soon</span>
            </div>
            <p className="text-xs text-blue-700 mb-3">
              To get full visibility into Copilot and other direct-API tools, integrate these external log sources:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-white/80 border border-blue-200">
                <div className="font-medium text-slate-900 text-xs mb-1">GitHub Enterprise</div>
                <div className="text-[10px] text-slate-600 mb-2">Copilot usage per user, seat assignments, suggestions accepted</div>
                <code className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">GET /enterprises/:id/copilot/usage</code>
              </div>
              <div className="p-3 rounded-lg bg-white/80 border border-blue-200">
                <div className="font-medium text-slate-900 text-xs mb-1">Microsoft Purview / Azure AD</div>
                <div className="text-[10px] text-slate-600 mb-2">Copilot for M365 interactions, sensitivity labels, DLP events</div>
                <code className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Office 365 Management API</code>
              </div>
              <div className="p-3 rounded-lg bg-white/80 border border-blue-200">
                <div className="font-medium text-slate-900 text-xs mb-1">Network / EDR Telemetry</div>
                <div className="text-[10px] text-slate-600 mb-2">DNS/HTTP to api.openai.com, api.anthropic.com, api.cursor.sh</div>
                <code className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">VPC Flow Logs + DNS Query Logs</code>
              </div>
            </div>
          </div>

          {/* AI Tool Provenance — read before the discovery list below, because it states
               what these detectors can and cannot see. Both are CloudTrail-derived, so
               neither can see a tool that talks only to a vendor API. */}
          <AiToolProvenancePanel days={7} />

          {/* Local Agent Discovery - Shadow Agents in Repos */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-rose-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Icon name="exclamation-triangle" className="w-4 h-4 text-rose-600" />
                  <span className="text-sm font-semibold text-slate-900">Local Agent Discovery</span>
                  {localAgentsData?.live ? (
                    /* Source comes from the response. This said "CodeCommit" even when the
                       rows came from CloudTrail userAgent parsing, naming a source that had
                       contributed nothing. */
                    <LiveDataBadge source={localAgentsData.source} />
                  ) : localAgentsData ? (
                    <MockDataBadge />
                  ) : null}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Ungoverned AI agent configurations found in repositories — not inventoried or under policy control
                  {localAgentsData?.note && <span className="ml-1 text-slate-400">({localAgentsData.note})</span>}
                </p>
              </div>
              {localAgentsLoading ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 animate-pulse">Scanning...</span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
                  {localAgentsData?.total_found ?? 0} Found
                </span>
              )}
            </div>

            {/* Discovery Methods */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              {(localAgentsData?.by_tool && localAgentsData.by_tool.length > 0
                ? localAgentsData.by_tool
                : [
                    { tool: 'Claude Code', file_pattern: 'CLAUDE.md', count: 0, icon: 'CC' },
                    { tool: 'GitHub Copilot', file_pattern: '.github/copilot-instructions.md', count: 0, icon: 'GH' },
                    { tool: 'Cursor', file_pattern: '.cursor/rules/', count: 0, icon: 'C' },
                    { tool: 'Kiro', file_pattern: '.kiro/steering/', count: 0, icon: 'K' },
                    { tool: 'Q Desktop', file_pattern: '.aws/amazonq/', count: 0, icon: 'Q' },
                    { tool: 'OpenAI Codex', file_pattern: 'AGENTS.md', count: 0, icon: 'OA' },
                  ]
              ).map(item => (
                <div key={item.file_pattern} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                      {item.icon}
                    </div>
                    <span className="text-xs font-medium text-slate-700">{item.tool}</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 truncate mb-1" title={item.file_pattern}>{item.file_pattern}</div>
                  <div className={`text-lg font-bold ${item.count > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    {item.count} <span className="text-[10px] font-normal text-slate-500">repos</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Discovered Local Agents */}
            <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Ungoverned Local Agents</span>
                {localAgentsData && (
                  <span className="text-[10px] text-slate-500">
                    {localAgentsData.critical_count} critical, {localAgentsData.high_count} high, {localAgentsData.medium_count} medium
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-200 max-h-64 overflow-y-auto">
                {localAgentsLoading ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">
                    <Icon name="arrow-path" className="w-5 h-5 mx-auto mb-2 animate-spin text-slate-400" />
                    Scanning CodeCommit repositories...
                  </div>
                ) : localAgentsData?.agents && localAgentsData.agents.length > 0 ? (
                  localAgentsData.agents.map((agent, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-white transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          agent.risk_level === 'critical' ? 'bg-rose-500' :
                          agent.risk_level === 'high' ? 'bg-orange-500' :
                          agent.risk_level === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                        }`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900">{agent.repo_name}</span>
                            <span className="text-[10px] font-mono text-slate-400 truncate">{agent.file_path}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{agent.description || agent.tool}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] text-slate-600">{agent.owner || 'Unknown'}</div>
                          <div className="text-[10px] text-slate-400">{agent.team || agent.tool}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-semibold ${
                          agent.risk_level === 'critical' ? 'bg-rose-100 text-rose-700' :
                          agent.risk_level === 'high' ? 'bg-orange-100 text-orange-700' :
                          agent.risk_level === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {agent.risk_level}
                        </span>
                        <button className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                          Review
                        </button>
                        <button
                          onClick={() => setGovernanceAgent(agent)}
                          className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                        >
                          Govern
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">
                    {localAgentsData?.live === false
                      ? 'CodeCommit not accessible — check AWS credentials'
                      : 'No local agent configs found. Click "Scan All Repos" to search.'}
                  </div>
                )}
              </div>
            </div>

            {/* Action Bar */}
            <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-indigo-50 border border-indigo-200">
              <div className="flex items-center gap-2">
                <Icon name="light-bulb" className="w-4 h-4 text-indigo-600" />
                <span className="text-xs text-indigo-800">
                  <strong>Recommended:</strong> Run a repo scan to discover all local agent configurations and bring them under governance.
                </span>
              </div>
              <button
                onClick={() => setLocalAgentsScanTriggered(true)}
                disabled={localAgentsLoading}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {localAgentsLoading ? (
                  <Icon name="arrow-path" className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Icon name="magnifying-glass" className="w-3.5 h-3.5" />
                )}
                {localAgentsLoading ? 'Scanning...' : 'Scan All Repos'}
              </button>
            </div>
          </div>

          {/* Self-Registration Portal */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Agent Self-Registration Portal</div>
                <p className="text-xs text-slate-500 mt-1">
                  Enable developers to register their local agents for governance review
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Active</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-2xl font-bold text-slate-900 mb-1">8</div>
                <div className="text-xs text-slate-600">Agents Registered</div>
                <div className="text-[10px] text-slate-400 mt-1">Last 30 days</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-2xl font-bold text-amber-600 mb-1">3</div>
                <div className="text-xs text-slate-600">Pending Review</div>
                <div className="text-[10px] text-slate-400 mt-1">Awaiting governance approval</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-2xl font-bold text-emerald-600 mb-1">5</div>
                <div className="text-xs text-slate-600">Approved</div>
                <div className="text-[10px] text-slate-400 mt-1">Under active governance</div>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-center justify-between">
                <div className="text-xs text-blue-800">
                  <strong>Portal URL:</strong>{' '}
                  <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">https://ava.internal/govern/register-agent</code>
                </div>
                <button className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                  Copy Link <Icon name="clipboard" className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ ANALYTICS TAB ════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* ─────────────────────── COST THRESHOLD ALERT BANNER ─────────────────────── */}
          {(() => {
            if (costLoading || !costData) return null;
            const periodDays = costData.period_days || 7;
            const dailyThreshold = DAILY_COST_THRESHOLD_USD;
            const periodThreshold = dailyThreshold * periodDays;
            const usersOverBudget = costData.by_user?.filter(u => u.estimated_cost_usd > periodThreshold) || [];
            const toolsOverBudget = costData.by_tool?.filter(t => t.estimated_cost_usd > periodThreshold) || [];
            const totalOverspend = [
              ...usersOverBudget.map(u => u.estimated_cost_usd - periodThreshold),
              ...toolsOverBudget.map(t => t.estimated_cost_usd - periodThreshold),
            ].reduce((sum, v) => sum + v, 0);

            if (usersOverBudget.length === 0 && toolsOverBudget.length === 0) return null;

            return (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <Icon name="exclamation-triangle" className="w-5 h-5 text-rose-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-rose-800">Cost Threshold Exceeded</div>
                  <div className="text-xs text-rose-700 mt-1">
                    {usersOverBudget.length > 0 && (
                      <span>{usersOverBudget.length} user{usersOverBudget.length !== 1 ? 's' : ''}</span>
                    )}
                    {usersOverBudget.length > 0 && toolsOverBudget.length > 0 && <span> and </span>}
                    {toolsOverBudget.length > 0 && (
                      <span>{toolsOverBudget.length} tool{toolsOverBudget.length !== 1 ? 's' : ''}</span>
                    )}
                    <span> exceeded the ${dailyThreshold}/day budget ({periodDays}-day period threshold: ${periodThreshold})</span>
                  </div>
                  <div className="text-xs text-rose-600 mt-1 font-medium">
                    Total overspend: ${totalOverspend.toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ─────────────────────── LIVE USAGE DEEP DIVE ─────────────────────── */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-emerald-200/60 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="text-lg font-semibold text-slate-900">Real-Time Agentic Coding Intelligence</h3>
                </div>
                <p className="text-slate-500 text-xs mt-1">Live telemetry from CloudTrail InvokeModel events</p>
              </div>
              {/* Gate on the backend's own `live` flag, not on "the fetch resolved". */}
              <LiveDataBadge live={costData?.live === true} source={costData?.source || 'CloudTrail'} />
            </div>

            {/* Live Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="text-emerald-600 text-xs mb-1">Total Estimated Cost</div>
                <div className="text-2xl font-bold text-slate-900">
                  {/* `|| '0.00'` used to turn a failed/absent fetch into a confident $0.00.
                      An absent total is unknown; only a measured 0 renders as $0.00. */}
                  {costLoading ? '...' : formatUsd(costData?.total_estimated_cost_usd)}
                </div>
                <div className="text-emerald-500 text-xs mt-1">Last {costData?.period_days || 7} days</div>
                {/* Disclose what the server-side total excludes. The total is a sum over
                    priced models only; unpriced models contribute nothing, so the figure
                    is a floor, not a complete spend number. */}
                {(() => {
                  const unpriced = costData?.by_model?.filter(m => m.estimated_cost_usd == null).length || 0;
                  if (costLoading || unpriced === 0) return null;
                  return (
                    <div
                      className="text-[10px] text-amber-700 mt-1 cursor-help"
                      title={`These models have no published per-1K rate or no measured tokens, so their spend is unknown (not zero) and is not included in the total above: ${costData?.by_model?.filter(m => m.estimated_cost_usd == null).map(m => m.model).join(', ')}`}
                    >
                      Floor only — excludes {unpriced} unpriced model{unpriced !== 1 ? 's' : ''}
                    </div>
                  );
                })()}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="text-amber-600 text-xs mb-1">Active Tools</div>
                <div className="text-2xl font-bold text-slate-900">{costLoading ? '...' : costData?.by_tool?.length || 0}</div>
                <div className="text-emerald-600 text-xs mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Detected via userAgent
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-blue-600 text-xs mb-1">Active Users</div>
                <div className="text-2xl font-bold text-slate-900">{costLoading ? '...' : costData?.by_user?.length || 0}</div>
                <div className="text-blue-500 text-xs mt-1">IAM principals</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="text-purple-600 text-xs mb-1">Total API Calls</div>
                <div className="text-2xl font-bold text-slate-900">
                  {costLoading ? '...' : (costData?.total_requests || 0).toLocaleString()}
                </div>
                <div className="text-purple-500 text-xs mt-1">Bedrock InvokeModel</div>
              </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Tools */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-700">Tools by Cost</span>
                  <Icon name="command-line" className="w-4 h-4 text-slate-400" />
                </div>
                <div className="space-y-2">
                  {costLoading ? (
                    <div className="text-xs text-slate-400 text-center py-4">Loading...</div>
                  ) : costData?.by_tool && costData.by_tool.length > 0 ? (
                    // Scale hoisted out of the row loop: `Math.max(...)` inside `.map()`
                    // recomputed it per row, and the `|| [1]` fallback fabricated a
                    // denominator of 1. maxMeasured returns null when there is no
                    // positive scale, and barWidthPct guards the division.
                    (() => {
                    const maxCost = maxMeasured(costData.by_tool.map(t => t.estimated_cost_usd));
                    return costData.by_tool.map((tool, i) => {
                      const periodDays = costData.period_days || 7;
                      const periodThreshold = DAILY_COST_THRESHOLD_USD * periodDays;
                      const isOverBudget = tool.estimated_cost_usd != null && tool.estimated_cost_usd > periodThreshold;
                      const overspend = isOverBudget ? tool.estimated_cost_usd - periodThreshold : 0;
                      const barWidth = barWidthPct(tool.estimated_cost_usd, maxCost);
                      const tokenView = describeTokenPair(tool.input_tokens, tool.output_tokens);
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-slate-800">{tool.tool}</span>
                              {isOverBudget && (
                                <span title={`Exceeded $${DAILY_COST_THRESHOLD_USD}/day budget`} className="inline-flex">
                                  <Icon name="exclamation-triangle" className="w-3.5 h-3.5 text-amber-500" />
                                </span>
                              )}
                            </div>
                            <span
                              className={
                                tool.estimated_cost_usd == null
                                  ? 'text-slate-300 italic cursor-help'
                                  : isOverBudget ? 'text-rose-600 font-semibold' : 'text-emerald-600'
                              }
                              title={usdTitle(tool.estimated_cost_usd, tool.tool)}
                            >
                              {formatUsd(tool.estimated_cost_usd)}
                            </span>
                          </div>
                          {isOverBudget && (
                            <div className="flex items-center gap-1 text-[10px] text-rose-600 bg-rose-50 rounded px-1.5 py-0.5">
                              <span>Exceeded ${DAILY_COST_THRESHOLD_USD}/day budget</span>
                              <span className="font-semibold">+${overspend.toFixed(2)} over</span>
                            </div>
                          )}
                          {barWidth == null ? (
                            <div
                              className="h-1.5 rounded-full border border-dashed border-slate-300 bg-slate-100 cursor-help"
                              title="No bar: this row's cost was not measured, so there is nothing to scale."
                            />
                          ) : (
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${isOverBudget ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: barWidth }} />
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500">
                            {tool.requests} requests | {tool.users} user{tool.users !== 1 ? 's' : ''} |{' '}
                            <span className={tokenView.measured ? undefined : 'text-slate-300 italic'} title={tokenView.title}>
                              {tokenView.text}
                            </span>
                            {tokenView.measured ? ' tok' : ''}
                          </div>
                        </div>
                      );
                    });
                    })()
                  ) : (
                    <div className="text-xs text-slate-400 text-center py-4">No tool activity detected</div>
                  )}
                </div>
              </div>

              {/* Users */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-700">Users by Cost</span>
                  <Icon name="users" className="w-4 h-4 text-slate-400" />
                </div>
                <div className="space-y-2">
                  {costLoading ? (
                    <div className="text-xs text-slate-400 text-center py-4">Loading...</div>
                  ) : costData?.by_user && costData.by_user.length > 0 ? (
                    // Scale hoisted; `|| [1]` fabricated denominator removed.
                    (() => {
                    const maxCost = maxMeasured(costData.by_user.map(u => u.estimated_cost_usd));
                    return costData.by_user.map((user, i) => {
                      const periodDays = costData.period_days || 7;
                      const periodThreshold = DAILY_COST_THRESHOLD_USD * periodDays;
                      const isOverBudget = user.estimated_cost_usd != null && user.estimated_cost_usd > periodThreshold;
                      const overspend = isOverBudget ? user.estimated_cost_usd - periodThreshold : 0;
                      const barWidth = barWidthPct(user.estimated_cost_usd, maxCost);
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${isOverBudget ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>
                                {user.user.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-800">{user.user}</span>
                              {isOverBudget && (
                                <span title={`Exceeded $${DAILY_COST_THRESHOLD_USD}/day budget`} className="inline-flex">
                                  <Icon name="exclamation-triangle" className="w-3.5 h-3.5 text-amber-500" />
                                </span>
                              )}
                            </div>
                            <span
                              className={
                                user.estimated_cost_usd == null
                                  ? 'text-slate-300 italic cursor-help'
                                  : isOverBudget ? 'text-rose-600 font-semibold' : 'text-emerald-600'
                              }
                              title={usdTitle(user.estimated_cost_usd, user.user)}
                            >
                              {formatUsd(user.estimated_cost_usd)}
                            </span>
                          </div>
                          {isOverBudget && (
                            <div className="flex items-center gap-1 text-[10px] text-rose-600 bg-rose-50 rounded px-1.5 py-0.5">
                              <span>Exceeded ${DAILY_COST_THRESHOLD_USD}/day budget</span>
                              <span className="font-semibold">+${overspend.toFixed(2)} over</span>
                            </div>
                          )}
                          {barWidth == null ? (
                            <div
                              className="h-1.5 rounded-full border border-dashed border-slate-300 bg-slate-100 cursor-help"
                              title="No bar: this row's cost was not measured, so there is nothing to scale."
                            />
                          ) : (
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${isOverBudget ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: barWidth }} />
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500">{user.requests} requests | {user.tools.join(', ')} | {user.models.length} model{user.models.length !== 1 ? 's' : ''}</div>
                        </div>
                      );
                    });
                    })()
                  ) : (
                    <div className="text-xs text-slate-500 text-center py-4">No user activity detected</div>
                  )}
                </div>
              </div>

              {/* Models */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-700">Models by Cost</span>
                  <Icon name="cpu-chip" className="w-4 h-4 text-slate-400" />
                </div>
                <div className="space-y-2">
                  {costLoading ? (
                    <div className="text-xs text-slate-400 text-center py-4">Loading...</div>
                  ) : costData?.by_model && costData.by_model.length > 0 ? (
                    // estimated_cost_usd is nullable here (no published per-1K rate, or no
                    // measured tokens). Verified against live data: the old code threw
                    // `TypeError: Cannot read properties of null (reading 'toFixed')` on the
                    // unpriced anthropic.claude-opus-4-8 row, taking out the whole panel; and
                    // `null / max` evaluated to 0, so an unmeasured model would have drawn a
                    // 0-width bar that reads as "cheapest". When every row is unpriced,
                    // `Math.max` returned 0 and `null / 0` gave a NaN% width.
                    (() => {
                    const maxCost = maxMeasured(costData.by_model.map(m => m.estimated_cost_usd));
                    const unpriced = costData.by_model.filter(m => m.estimated_cost_usd == null).length;
                    return (<>
                    {costData.by_model.map((model, i) => {
                      const shortName = model.model.split('/').pop()?.replace(/v\d+:\d+$/, '').replace('us.anthropic.', '').replace('us.amazon.', '') || model.model;
                      const barWidth = barWidthPct(model.estimated_cost_usd, maxCost);
                      const tokenView = describeTokenPair(model.input_tokens, model.output_tokens);
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800 truncate max-w-[140px]" title={model.model}>{shortName}</span>
                            <span
                              className={model.estimated_cost_usd == null ? 'text-slate-300 italic cursor-help' : 'text-emerald-600 cursor-help'}
                              title={usdTitle(model.estimated_cost_usd, model.model)}
                            >
                              {formatUsd(model.estimated_cost_usd)}
                            </span>
                          </div>
                          {/* An unpriced row gets a dashed empty track, NOT a 0-width bar in a
                              solid track — otherwise "unknown" would read as "cheapest". A
                              measured $0.00 keeps the solid track with a 0% fill. */}
                          {barWidth == null ? (
                            <div
                              className="h-1.5 rounded-full border border-dashed border-slate-300 bg-slate-100 cursor-help"
                              title="No bar: this model's cost was not measured, so it cannot be ranked against the others."
                            />
                          ) : (
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500 rounded-full" style={{ width: barWidth }} />
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500">
                            {model.requests} requests |{' '}
                            <span className={tokenView.measured ? undefined : 'text-slate-300 italic'} title={tokenView.title}>
                              {tokenView.text}
                            </span>
                            {tokenView.measured ? ' tok' : ''}
                          </div>
                        </div>
                      );
                    })}
                    {unpriced > 0 && (
                      <div className="text-[10px] text-amber-700 pt-1 flex items-start gap-1.5">
                        <Icon name="exclamation-triangle" className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span>
                          {unpriced} of {costData.by_model.length} model{costData.by_model.length !== 1 ? 's' : ''} unpriced — excluded from the
                          ranking and from the total above (unknown, not $0).
                        </span>
                      </div>
                    )}
                    </>);
                    })()
                  ) : (
                    <div className="text-xs text-slate-400 text-center py-4">No model usage detected</div>
                  )}
                </div>
              </div>
            </div>

            {/* The backend's own caveat. It is the authoritative statement of what this
                panel could not measure (unmatched invocation logs, CloudTrail paging
                bounds), so it is surfaced next to the numbers rather than only in the
                Cost Summary card further down the page. */}
            {costData?.note && (
              <div className="mt-4 pt-3 border-t border-slate-200 text-[10px] text-slate-500">
                {costData.note}
              </div>
            )}
          </div>

          {/* ─────────────────────── USAGE PATTERNS & TRENDS ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Hourly Activity Heatmap */}
            <div className="lg:col-span-2 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Usage Pattern by Hour (Last 7 Days)</div>
                <MockDataBadge integration="CloudWatch Metrics" />
              </div>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-[auto_repeat(24,1fr)] gap-0.5 min-w-[600px]">
                  <div className="text-[9px] text-slate-400" />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="text-[9px] text-slate-400 text-center">{h.toString().padStart(2, '0')}</div>
                  ))}
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, dayIdx) => (
                    <React.Fragment key={day}>
                      <div className="text-[9px] text-slate-500 pr-2">{day}</div>
                      {Array.from({ length: 24 }, (_, hour) => {
                        const isWeekend = dayIdx >= 5;
                        const isWorkHour = hour >= 9 && hour <= 18;
                        // Deterministic per-cell pseudo-random so the heatmap stays stable across re-renders
                        const seeded = (((dayIdx * 24 + hour) * 9301 + 49297) % 233280) / 233280;
                        const intensity = isWeekend ? seeded * 0.2 : (isWorkHour ? 0.4 + seeded * 0.6 : seeded * 0.3);
                        return (
                          <div
                            key={hour}
                            className="w-full aspect-square rounded-sm"
                            style={{ backgroundColor: `rgba(217, 119, 6, ${intensity})` }}
                            title={`${day} ${hour}:00 - ${Math.round(intensity * 100)} requests`}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-3 text-[10px] text-slate-500">
                <span>Low</span>
                <div className="flex gap-0.5">
                  {[0.1, 0.3, 0.5, 0.7, 0.9].map(o => (
                    <div key={o} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(217, 119, 6, ${o})` }} />
                  ))}
                </div>
                <span>High</span>
              </div>
            </div>

            {/* Model Performance */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Model Efficiency Metrics</div>
              <div className="space-y-4">
                {[
                  // Labels + $/1K input list price sourced from the shared pricing table.
                  { model: PRICED_MODEL_LABELS['opus-4-7'],   latency: 2.4, throughput: 45,  costPer1k: MODEL_PRICING['opus-4-7'].input },
                  { model: PRICED_MODEL_LABELS['sonnet-4-5'], latency: 1.2, throughput: 78,  costPer1k: MODEL_PRICING['sonnet-4-5'].input },
                  { model: PRICED_MODEL_LABELS['haiku-4-5'],  latency: 0.4, throughput: 156, costPer1k: MODEL_PRICING['haiku-4-5'].input },
                ].map((m, i) => (
                  <div key={i} className="p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-800">{m.model}</span>
                      <span className="text-[10px] text-slate-500">${m.costPer1k}/1K tok</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <div className="text-slate-400">Avg Latency</div>
                        <div className="font-semibold text-slate-700">{m.latency}s</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Tok/sec</div>
                        <div className="font-semibold text-slate-700">{m.throughput}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─────────────────────── COST ANALYSIS ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Cost Trend */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Daily Cost Trend</div>
                {costData?.live ? <LiveDataBadge source="CloudTrail" /> : <MockDataBadge integration="CloudTrail" />}
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={costData?.trend?.map(t => ({
                  date: t.date.split('T')[0].slice(5), // MM-DD
                  cost: t.estimated_cost_usd,
                  requests: t.requests,
                })) || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [name === 'cost' ? `$${Number(value).toFixed(2)}` : value, name === 'cost' ? 'Cost' : 'Requests']} />
                  <Area type="monotone" dataKey="cost" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
              {!costData?.trend?.length && !costLoading && (
                <div className="text-xs text-slate-400 text-center py-8">No trend data available</div>
              )}
            </div>

            {/* Cost Summary */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Cost Summary (Last {costData?.period_days || 7} Days)</div>
                {costData?.live ? <LiveDataBadge source="CloudTrail" /> : <MockDataBadge integration="CloudTrail" />}
              </div>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name="currency-dollar" className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-medium text-emerald-800">Total Estimated Cost</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">
                      {/* An absent total is unknown, not $0.00. `?.toFixed(2) || '0.00'`
                          used to present a failed fetch as a confident zero. */}
                      {costLoading ? '...' : formatUsd(costData?.total_estimated_cost_usd)}
                    </span>
                  </div>
                  <div className="text-[10px] text-emerald-600 mt-1">
                    Based on token counts and model pricing
                    {(() => {
                      const unpriced = costData?.by_model?.filter(m => m.estimated_cost_usd == null).length || 0;
                      if (unpriced === 0) return null;
                      // Disclose the exclusion rather than letting the total read as complete.
                      return ` — floor only; ${unpriced} unpriced model${unpriced !== 1 ? 's' : ''} contribute an unknown (not zero) amount and are excluded`;
                    })()}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name="bolt" className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-medium text-blue-800">Total Requests</span>
                    </div>
                    <span className="text-sm font-bold text-blue-700">
                      {costLoading ? '...' : (costData?.total_requests || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-blue-600 mt-1">Bedrock InvokeModel calls</div>
                </div>
                <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name="cpu-chip" className="w-4 h-4 text-purple-600" />
                      <span className="text-xs font-medium text-purple-800">Models Used</span>
                    </div>
                    <span className="text-sm font-bold text-purple-700">
                      {costLoading ? '...' : costData?.by_model?.length || 0}
                    </span>
                  </div>
                  <div className="text-[10px] text-purple-600 mt-1">
                    {costData?.by_model?.map(m => m.model.split('/').pop()?.replace(/v\d+:\d+$/, '').replace('us.anthropic.', '').replace('us.amazon.', '').slice(0, 20)).join(', ') || 'No models detected'}
                  </div>
                </div>
              </div>
              {costData?.note && (
                <div className="mt-4 pt-4 border-t border-slate-200 text-xs text-slate-500">
                  {costData.note}
                </div>
              )}
            </div>
          </div>

          {/* ─────────────────────── TEAM & USER ANALYTICS ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Usage by Team — NOT MEASURED, deliberately.
                WAS: a hardcoded array of five invented teams (Frontend/Platform/
                Backend/ML Eng/DevOps) with invented user counts, invented dollar
                costs and invented trend arrows, rendered under
                `isLiveData ? <LiveDataBadge/> : <MockDataBadge/>` — so fabricated
                numbers carried a green "Live" pill whenever the *unrelated*
                developer-AI usage endpoint happened to be live.

                There is no team dimension to replace them with. Neither the
                CloudTrail event nor the Bedrock invocation-log record carries a
                team, org-unit or cost-allocation-tag field, and no other Govern
                route exposes one — cost is attributable per IAM principal only.
                The nearest real analogue, `costData.by_tool`, is ALREADY rendered
                in this same `analytics` tab as "Tools by Cost" above, so
                repeating it here would duplicate rather than inform.
                Per project precedent (no fabricated attribution), this panel now
                names the gap instead of inventing a plausible split. */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Usage by Team</div>
                <MockDataBadge integration="Team / cost-allocation-tag dimension — absent from CloudTrail and Bedrock invocation logs" />
              </div>
              <div className="flex flex-col items-center text-center py-6">
                <Icon name="user-group" className="w-8 h-8 text-slate-300 mb-3" />
                <div className="text-xs font-medium text-slate-600">Team attribution not measured</div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Spend is attributable per IAM principal, not per team. Neither the
                  CloudTrail event nor the Bedrock invocation-log record carries a team,
                  org-unit or cost-allocation-tag field, so any team split shown here
                  would be invented rather than measured.
                </p>
                <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                  To measure this, apply a team cost-allocation tag to the calling
                  principals and join on it. Available today: per-principal spend under
                  <span className="font-medium text-slate-500"> Users by Cost</span> and
                  per-tool spend under
                  <span className="font-medium text-slate-500"> Tools by Cost</span>.
                </p>
              </div>
            </div>

            {/* Top Principals by Cost — real `costData.by_user`, ranked.
                WAS: five invented human names (Sarah Chen, Mike Rodriguez, Alex
                Kim, Jordan Lee, Taylor Smith) with invented teams, invented "M
                tok" totals and invented dollar costs — and NO badge at all, so
                nothing marked it as illustrative.
                The invented `team` field is dropped entirely: there is no source
                for it (see the panel to the left). */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Top Principals by Cost</div>
                <LiveDataBadge live={costData?.live === true} source={costData?.source || 'CloudTrail'} />
              </div>
              {costLoading ? (
                <div className="text-xs text-slate-400 text-center py-8">Loading...</div>
              ) : costData?.by_user && costData.by_user.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {/* Spread before sort: `costData.by_user` is React state and
                        `Array.prototype.sort` mutates in place. */}
                    {[...costData.by_user]
                      .sort((a, b) => b.estimated_cost_usd - a.estimated_cost_usd)
                      .slice(0, 5)
                      .map((user, i) => {
                        const tokenView = describeTokenPair(user.input_tokens, user.output_tokens);
                        const hasTools = user.tools.length > 0;
                        return (
                          <div key={user.user} className="flex items-center gap-3 p-2 rounded bg-slate-50">
                            {/* Rank ordinal, not initials. The prior avatar did
                                `name.split(' ').map(n => n[0])`, which assumes a
                                two-word human name; a real principal like
                                `bedrock_evaluation_OutyyVYU7d` has no initials to
                                take and would render as a single stray letter or
                                blank. This panel IS a ranked cut, so the position
                                is meaningful, always populated, and never looks
                                broken. */}
                            <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold">
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-slate-800 truncate" title={user.user}>
                                {user.user}
                              </div>
                              <div
                                className={`text-[10px] truncate ${hasTools ? 'text-slate-500' : 'text-slate-400 italic cursor-help'}`}
                                title={
                                  hasTools
                                    ? `Tools attributed from CloudTrail: ${user.tools.join(', ')}`
                                    : 'No CloudTrail event was attributed to this principal, so the calling tool is unknown. Its tokens and cost come from Bedrock invocation-log records, which are counted independently of CloudTrail events.'
                                }
                              >
                                {hasTools ? user.tools.join(', ') : 'tool not attributed'}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div
                                className="text-xs font-semibold text-slate-900"
                                title={usdTitle(user.estimated_cost_usd, user.user)}
                              >
                                {formatUsd(user.estimated_cost_usd)}
                              </div>
                              <div className="text-[10px] text-slate-500" title={tokenView.title}>
                                {tokenView.text}{tokenView.measured ? ' tok' : ''}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200 text-[10px] text-slate-400 leading-relaxed">
                    Top 5 of {costData.by_user.length} principal{costData.by_user.length !== 1 ? 's' : ''} by
                    measured cost over {costData.period_days} days. Principals are IAM identities, not people.
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500 text-center py-8">
                  No principal-level cost activity measured
                  {costData?.period_days ? ` in the last ${costData.period_days} days` : ''}.
                </div>
              )}
            </div>

            {/* Adoption & Engagement — derived where derivable, marked where not.
                WAS: hardcoded `412 / 746`, `623 / 746`, `4.2`, `12.4K`, `+18%` MoM
                and `92%` Retention, with literal `style={{ width: '55%' }}` bars —
                and NO badge at all. Every one of those numbers was invented: the
                only user-roster source (`/developer-ai/users`) returns
                `live: false` with zero users, so there was never a real 746
                denominator to divide by.
                Kept: the three metrics that have a real numerator AND a real
                denominator. Dropped: DAU/WAU, sessions and retention — a ratio
                with a fabricated denominator is still fabricated. */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Adoption & Engagement</div>
                <LiveDataBadge live={costData?.live === true} source={costData?.source || 'CloudTrail'} />
              </div>
              {costLoading ? (
                <div className="text-xs text-slate-400 text-center py-8">Loading...</div>
              ) : costData == null ? (
                <div className="text-xs text-slate-500 text-center py-8">
                  Adoption metrics unavailable — the cost-attribution source did not respond.
                </div>
              ) : (() => {
                const periodDays = costData.period_days;
                // Distinct principals actually observed. `== null` is not needed
                // here: by_user is a non-nullable array in the DTO, and an empty
                // array is a measured zero, not an unmeasured value.
                const principals = new Set(costData.by_user.map(u => u.user)).size;
                // CloudTrail events and invocation-log records are counted
                // independently (the payload's own `note` says so), so a principal
                // can legitimately have tokens but 0 attributed requests. This
                // surfaces that split rather than hiding it.
                const withRequests = costData.by_user.filter(u => u.requests > 0).length;
                const activeDays = costData.trend.length;
                const requestShare = barWidthPct(withRequests, principals || null);
                const activeDayShare = barWidthPct(activeDays, periodDays || null);
                return (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-600">Distinct principals ({periodDays}d)</span>
                        <span className="font-semibold text-slate-900">{principals.toLocaleString()}</span>
                      </div>
                      {/* No bar: there is no measured population to divide by. */}
                      <div className="text-[10px] text-slate-400">
                        Every IAM identity with measured Bedrock activity. No seat or headcount
                        total exists to express this as a percentage.
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span
                          className="text-slate-600 cursor-help"
                          title="Principals with at least one CloudTrail event attributed to them. The remainder appear only in Bedrock invocation logs, which are counted independently — not a contradiction."
                        >
                          Principals with attributed requests
                        </span>
                        <span className="font-semibold text-slate-900">
                          {withRequests.toLocaleString()} / {principals.toLocaleString()}
                        </span>
                      </div>
                      {requestShare == null ? (
                        <div
                          className="h-2 rounded-full border border-dashed border-slate-300 bg-slate-100 cursor-help"
                          title="No bar: no principals were measured, so there is nothing to scale."
                        />
                      ) : (
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: requestShare }} />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span
                          className="text-slate-600 cursor-help"
                          title="Days in the window carrying at least one measured invocation, from the cost-attribution daily trend."
                        >
                          Days with measured activity
                        </span>
                        <span className="font-semibold text-slate-900">
                          {activeDays.toLocaleString()} / {periodDays.toLocaleString()}
                        </span>
                      </div>
                      {activeDayShare == null ? (
                        <div
                          className="h-2 rounded-full border border-dashed border-slate-300 bg-slate-100 cursor-help"
                          title="No bar: the reporting window length was not measured, so there is nothing to scale."
                        />
                      ) : (
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: activeDayShare }} />
                        </div>
                      )}
                    </div>
                    {/* Genuinely unavailable. Listed rather than silently removed so
                        the panel discloses what adoption reporting still lacks. */}
                    <div className="pt-3 border-t border-slate-200 space-y-2.5">
                      {[
                        {
                          label: 'Daily / weekly active users',
                          reason:
                            'Not measured. The daily trend carries request and cost totals but no identity dimension, so distinct users per day cannot be recovered. There is also no workforce denominator: the user-roster endpoint reports live: false with zero users.',
                        },
                        {
                          label: 'Avg sessions / day',
                          reason:
                            'Not measured. Neither CloudTrail nor the Bedrock invocation logs model a session, so there is no unit to count.',
                        },
                        {
                          label: 'Avg tokens / session',
                          reason:
                            'Not measured. Tokens are recorded per invocation, and no session boundary exists to group them by.',
                        },
                        {
                          label: 'MoM growth / retention',
                          reason:
                            'Not measured. Both need a prior-period cohort baseline, and only the current rolling window is retrieved.',
                        },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between gap-2">
                          <span
                            className="text-[11px] text-slate-400 cursor-help flex items-center gap-1 min-w-0"
                            title={row.reason}
                          >
                            <Icon name="information-circle" className="w-3 h-3 shrink-0" />
                            <span className="truncate">{row.label}</span>
                          </span>
                          <span className="text-[11px] text-slate-300 italic shrink-0 cursor-help" title={row.reason}>
                            {NOT_MEASURED} not measured
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ─────────────────────── GOVERNANCE & COMPLIANCE ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Compliance Trends */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Governance Compliance Trends</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={[
                  { week: 'W1', governed: 65, ungoverned: 35, blocked: 12 },
                  { week: 'W2', governed: 68, ungoverned: 32, blocked: 8 },
                  { week: 'W3', governed: 72, ungoverned: 28, blocked: 5 },
                  { week: 'W4', governed: 78, ungoverned: 22, blocked: 3 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}%`, '']} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area type="monotone" dataKey="governed" name="Governed" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="ungoverned" name="Ungoverned" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="blocked" name="Blocked" stroke="#EF4444" fill="#EF4444" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Security Events */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Security & Policy Events</div>
              <div className="space-y-2">
                {[
                  { type: 'guardrail', msg: 'PII detected in prompt, redacted', tool: 'Claude Code', user: 'jsmith', time: '2h ago', severity: 'medium' },
                  { type: 'policy', msg: 'Blocked access to unapproved model', tool: 'Cursor', user: 'mlee', time: '4h ago', severity: 'high' },
                  { type: 'guardrail', msg: 'Code injection attempt blocked', tool: 'Copilot', user: 'akumar', time: '6h ago', severity: 'critical' },
                  { type: 'audit', msg: 'Sensitive repo access logged', tool: 'Q Developer', user: 'tchen', time: '8h ago', severity: 'low' },
                  { type: 'policy', msg: 'Rate limit exceeded, throttled', tool: 'Claude Code', user: 'rgarcia', time: '12h ago', severity: 'medium' },
                ].map((evt, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded bg-slate-50">
                    <div className={`mt-0.5 w-2 h-2 rounded-full ${
                      evt.severity === 'critical' ? 'bg-rose-500' :
                      evt.severity === 'high' ? 'bg-orange-500' :
                      evt.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-800">{evt.msg}</div>
                      <div className="text-[10px] text-slate-500">{evt.tool} • {evt.user} • {evt.time}</div>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                      evt.type === 'guardrail' ? 'bg-purple-100 text-purple-700' :
                      evt.type === 'policy' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                    }`}>{evt.type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─────────────────────── TOKEN ECONOMICS ─────────────────────── */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-slate-900">Token Economics Deep Dive</div>
              <div className="flex gap-2">
                {['Input', 'Output', 'Cache'].map(type => (
                  <span key={type} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">{type}</span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
                <div className="text-xs text-blue-600 mb-1">Input Tokens</div>
                <div className="text-2xl font-bold text-blue-900">4.2B</div>
                <div className="text-[10px] text-blue-500 mt-1">$12,600 @ $3/M</div>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200">
                <div className="text-xs text-emerald-600 mb-1">Output Tokens</div>
                <div className="text-2xl font-bold text-emerald-900">1.8B</div>
                <div className="text-[10px] text-emerald-500 mt-1">$27,000 @ $15/M</div>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
                <div className="text-xs text-purple-600 mb-1">Cache Hits</div>
                <div className="text-2xl font-bold text-purple-900">68%</div>
                <div className="text-[10px] text-purple-500 mt-1">$8,200 saved</div>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200">
                <div className="text-xs text-amber-600 mb-1">Effective Rate</div>
                <div className="text-2xl font-bold text-amber-900">$5.24</div>
                <div className="text-[10px] text-amber-500 mt-1">per 1M tokens (blended)</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-slate-50">
                <div className="text-xs font-medium text-slate-700 mb-2">Token Distribution by Use Case</div>
                <div className="space-y-2">
                  {[
                    { use: 'Code Generation', pct: 42, color: '#6366F1' },
                    { use: 'Code Review', pct: 28, color: '#10B981' },
                    { use: 'Documentation', pct: 15, color: '#F59E0B' },
                    { use: 'Debugging', pct: 10, color: '#EF4444' },
                    { use: 'Other', pct: 5, color: '#94A3B8' },
                  ].map(item => (
                    <div key={item.use} className="flex items-center gap-2">
                      <div className="w-20 text-[10px] text-slate-600">{item.use}</div>
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${item.pct}%`, backgroundColor: item.color }} />
                      </div>
                      <div className="w-8 text-[10px] text-slate-500 text-right">{item.pct}%</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50">
                <div className="text-xs font-medium text-slate-700 mb-2">Context Window Utilization</div>
                <div className="space-y-2">
                  {[
                    { range: '0-25%', count: 1245, pct: 35 },
                    { range: '25-50%', count: 892, pct: 25 },
                    { range: '50-75%', count: 712, pct: 20 },
                    { range: '75-100%', count: 534, pct: 15 },
                    { range: '100% (truncated)', count: 178, pct: 5 },
                  ].map(item => (
                    <div key={item.range} className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-600">{item.range}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">{item.count.toLocaleString()} sessions</span>
                        <span className="font-medium text-slate-700">{item.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-2 rounded bg-amber-50 border border-amber-200">
                  <div className="text-[10px] text-amber-700">
                    <strong>Optimization tip:</strong> 5% of sessions hit context limits. Consider using Sonnet for long-context tasks.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ AI-DLC WORKFLOWS TAB ════════════════════════════════ */}
      {activeTab === 'workflows' && (
        <div className="space-y-6">
          {/* Header with AI-DLC v2 explanation */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg font-semibold text-indigo-900">AI-DLC Workflows</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">v2</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">AWS Labs</span>
                </div>
                <p className="text-sm text-indigo-700 max-w-2xl">
                  AI-Driven Development Life Cycle v2 — 5 phases, 32 stages, 14 agents. Multi-harness support for Claude Code,
                  Kiro IDE, Codex CLI. Self-correcting workflows with approval gates and 74-event audit trail.
                </p>
              </div>
              <a
                href="https://github.com/awslabs/aidlc-workflows/tree/v2"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors"
              >
                <Icon name="arrow-top-right-on-square" className="w-3.5 h-3.5" />
                View on GitHub
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-indigo-200">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                <span className="text-[11px] text-indigo-700"><strong>Init</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span className="text-[11px] text-indigo-700"><strong>Ideation</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-[11px] text-indigo-700"><strong>Inception</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-indigo-700"><strong>Construction</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-[11px] text-indigo-700"><strong>Operation</strong></span>
              </div>
              <div className="ml-auto flex items-center gap-2 text-[10px] text-indigo-600">
                <span>Harnesses: Claude Code, Kiro IDE, Codex CLI</span>
              </div>
            </div>
          </div>

          {/* Kill-Switch Status Banner */}
          <div className={`rounded-xl border p-4 ${
            killswitchLoading
              ? 'bg-slate-50 border-slate-200'
              : killswitchStatus?.disabled
                ? 'bg-rose-50 border-rose-300'
                : 'bg-emerald-50 border-emerald-300'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {killswitchLoading ? (
                  <>
                    <div className="w-3 h-3 rounded-full bg-slate-300 animate-pulse" />
                    <span className="text-sm font-medium text-slate-500">Loading harness governance status...</span>
                  </>
                ) : killswitchStatus?.disabled ? (
                  <>
                    <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
                    <div>
                      <span className="text-sm font-semibold text-rose-800">Harness Operations Disabled</span>
                      <span className="mx-2 text-rose-400">|</span>
                      <span className="text-xs text-rose-600">
                        Source: {killswitchStatus.source === 'env_var' ? 'Environment Variable' :
                                 killswitchStatus.source === 'sentinel_file' ? 'Sentinel File' :
                                 killswitchStatus.source === 'dynamodb' ? 'Admin API' : 'Unknown'}
                      </span>
                      {killswitchStatus.reason && (
                        <>
                          <span className="mx-2 text-rose-400">|</span>
                          <span className="text-xs text-rose-600">{killswitchStatus.reason}</span>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-800">Harness Operations Enabled</span>
                    <span className="text-xs text-emerald-600 ml-2">All governance controls active</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Show warning if env_var or sentinel_file is active - can't be toggled via UI */}
                {killswitchStatus?.disabled && (killswitchStatus.env_var_active || killswitchStatus.sentinel_file_active) && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-100 border border-amber-300">
                    <Icon name="exclamation-triangle" className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-[10px] text-amber-700 font-medium">
                      {killswitchStatus.env_var_active ? 'Requires ops to clear AVA_HARNESS_DISABLED' :
                       'Requires removing .ava-harness-disabled file'}
                    </span>
                  </div>
                )}
                {/* Emergency disable button (only for admins, only when enabled, only when DynamoDB can be toggled) */}
                {!killswitchLoading && !killswitchStatus?.env_var_active && !killswitchStatus?.sentinel_file_active && (
                  <details className="relative">
                    <summary className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      killswitchStatus?.disabled
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-rose-600 text-white hover:bg-rose-700'
                    }`}>
                      <Icon name={killswitchStatus?.disabled ? 'play' : 'stop-circle'} className="w-3.5 h-3.5 inline mr-1.5" />
                      {killswitchStatus?.disabled ? 'Re-enable Harnesses' : 'Emergency Disable'}
                    </summary>
                    <div className="absolute right-0 top-full mt-2 w-80 p-4 bg-white rounded-xl shadow-xl border border-slate-200 z-50">
                      <div className="text-sm font-semibold text-slate-900 mb-2">
                        {killswitchStatus?.disabled ? 'Re-enable Harness Operations' : 'Disable All Harness Operations'}
                      </div>
                      <p className="text-xs text-slate-600 mb-3">
                        {killswitchStatus?.disabled
                          ? 'This will re-enable all AI harness operations. Harness discovery and governance controls will resume.'
                          : 'This will immediately disable all AI harness operations. Use this for governance emergencies only.'}
                      </p>
                      <input
                        type="text"
                        placeholder="Reason (optional)"
                        value={killswitchReason}
                        onChange={(e) => setKillswitchReason(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleKillswitchToggle}
                          disabled={killswitchToggling}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-colors ${
                            killswitchStatus?.disabled
                              ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400'
                              : 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400'
                          }`}
                        >
                          {killswitchToggling ? 'Processing...' : killswitchStatus?.disabled ? 'Re-enable' : 'Disable Now'}
                        </button>
                      </div>
                      {killswitchStatus?.disabled_by && killswitchStatus?.disabled_at && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <div className="text-[10px] text-slate-500">
                            Last changed by <span className="font-medium">{killswitchStatus.disabled_by}</span> at{' '}
                            {new Date(killswitchStatus.disabled_at).toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>

          {/* Harness Deployment Monitoring */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Icon name="server-stack" className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-slate-900">Harness Deployment</span>
                  {aidlcHarnesses?.live ? (
                    <LiveDataBadge source={aidlcHarnesses.source} detail={`Sources: ${(aidlcHarnesses.sources_used || []).join(', ')}`} />
                  ) : (
                    <MockDataBadge integration="Multi-source Detection" />
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">AI-DLC harnesses detected via CloudTrail, config files, and git commits</p>
              </div>
              <div className="flex items-center gap-4">
                {/* Sources used indicator */}
                {aidlcHarnesses?.sources_used && aidlcHarnesses.sources_used.length > 0 && (
                  <div className="flex items-center gap-1">
                    {aidlcHarnesses.sources_used.map(src => {
                      const cfg = DETECTION_SOURCE_CONFIG[src];
                      return cfg ? (
                        <span
                          key={src}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${cfg.bgColor} ${cfg.textColor}`}
                          title={`Detected via ${cfg.label}`}
                        >
                          <Icon name={cfg.icon} className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
                {/* Outdated count */}
                {(() => {
                  const outdatedCount = (aidlcHarnesses?.instances || []).filter(inst => {
                    const latestVersion = LATEST_HARNESS_VERSIONS[inst.harness_type];
                    return latestVersion && isVersionOutdated(inst.version, latestVersion);
                  }).length;
                  return outdatedCount > 0 ? (
                    <div className="text-right">
                      <div className="text-lg font-bold text-amber-600">{outdatedCount}</div>
                      <div className="text-[10px] text-amber-600 font-medium">outdated</div>
                    </div>
                  ) : null;
                })()}
                <div className="text-right">
                  <div className="text-lg font-bold text-slate-900">{aidlcLoading ? '...' : aidlcHarnesses?.total_users || 0}</div>
                  <div className="text-[10px] text-slate-500">active users</div>
                </div>
              </div>
            </div>

            {/* Detection Source Filter */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
              <span className="text-xs text-slate-500">Filter by source:</span>
              <div className="flex gap-1">
                {(['all', 'cloudtrail', 'config_file', 'git_commit'] as const).map(src => {
                  const cfg = src !== 'all' ? DETECTION_SOURCE_CONFIG[src] : null;
                  const isActive = harnessSourceFilter === src;
                  return (
                    <button
                      key={src}
                      onClick={() => setHarnessSourceFilter(src)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                        isActive
                          ? src === 'all' ? 'bg-indigo-600 text-white' : `${cfg?.bgColor} ${cfg?.textColor} ring-1 ring-offset-1 ring-indigo-400`
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cfg && <Icon name={cfg.icon} className="w-3 h-3" />}
                      {src === 'all' ? 'All Sources' : cfg?.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(aidlcHarnesses?.harnesses || [
                { harness_type: 'claude-code', display_name: 'Claude Code', user_count: 0, total_requests: 0, versions_seen: [], detection_sources: [] },
                { harness_type: 'kiro-ide', display_name: 'Kiro IDE', user_count: 0, total_requests: 0, versions_seen: [], detection_sources: [] },
                { harness_type: 'kiro-cli', display_name: 'Kiro CLI', user_count: 0, total_requests: 0, versions_seen: [], detection_sources: [] },
                { harness_type: 'codex-cli', display_name: 'Codex CLI', user_count: 0, total_requests: 0, versions_seen: [], detection_sources: [] },
              ])
              .filter(harness => harnessSourceFilter === 'all' || (harness.detection_sources || []).includes(harnessSourceFilter as DetectionSource))
              .map(harness => {
                const colors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
                  'claude-code': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-600' },
                  'kiro-ide': { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: 'text-orange-600' },
                  'kiro-cli': { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: 'text-orange-600' },
                  'codex-cli': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'text-emerald-600' },
                  'opencode': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-600' },
                  'q-desktop': { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', icon: 'text-indigo-600' },
                  'cursor': { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', icon: 'text-pink-600' },
                  'copilot': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: 'text-purple-600' },
                };
                const c = colors[harness.harness_type] || { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', icon: 'text-slate-600' };
                // Check for version drift
                const latestVersion = LATEST_HARNESS_VERSIONS[harness.harness_type];
                const hasOutdatedVersions = latestVersion && harness.versions_seen.some(v => isVersionOutdated(v, latestVersion));
                return (
                  <div key={harness.harness_type} className={`p-3 rounded-lg ${c.bg} border ${c.border}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon name="command-line" className={`w-4 h-4 ${c.icon}`} />
                        <span className={`text-xs font-semibold ${c.text}`}>{harness.display_name}</span>
                        {hasOutdatedVersions && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 border border-amber-300"
                            title={`Latest version: ${latestVersion}`}
                          >
                            <Icon name="exclamation-triangle" className="w-3 h-3" />
                            Version Drift
                          </span>
                        )}
                      </div>
                      {harness.user_count > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-white/80 text-slate-600">
                          {harness.user_count} users
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <div className="text-slate-500">Requests</div>
                        <div className={`font-semibold ${c.text}`}>{harness.total_requests.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Versions</div>
                        <div className="font-mono text-slate-600 truncate" title={harness.versions_seen.join(', ')}>
                          {harness.versions_seen.length > 0 ? harness.versions_seen[harness.versions_seen.length - 1] : '—'}
                        </div>
                        {latestVersion && (
                          <div className="text-[9px] text-slate-400 mt-0.5">Latest: {latestVersion}</div>
                        )}
                      </div>
                    </div>
                    {/* Detection source badges */}
                    {harness.detection_sources && harness.detection_sources.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-200/50">
                        {harness.detection_sources.map(src => {
                          const cfg = DETECTION_SOURCE_CONFIG[src];
                          return cfg ? (
                            <span
                              key={src}
                              className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium ${cfg.bgColor} ${cfg.textColor}`}
                              title={`Detected via ${cfg.label}`}
                            >
                              <Icon name={cfg.icon} className="w-2.5 h-2.5" />
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {aidlcHarnesses?.instances && aidlcHarnesses.instances.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-slate-700">Top Users by Confidence</div>
                  <div className="text-[10px] text-slate-500">Higher confidence = detected by multiple sources</div>
                </div>
                <div className="space-y-1.5">
                  {aidlcHarnesses.instances
                    .filter(inst => harnessSourceFilter === 'all' || (inst.detection_sources || []).includes(harnessSourceFilter as DetectionSource))
                    .slice(0, 5)
                    .map((inst, i) => {
                    const latestVersion = LATEST_HARNESS_VERSIONS[inst.harness_type];
                    const isOutdated = latestVersion && isVersionOutdated(inst.version, latestVersion);
                    const confidenceColor = inst.detection_confidence >= 0.9 ? 'bg-emerald-500' : inst.detection_confidence >= 0.65 ? 'bg-amber-500' : 'bg-slate-400';
                    return (
                      <div key={i} className={`flex items-center justify-between text-[10px] p-2 rounded ${isOutdated ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium ${isOutdated ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                            {inst.user.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-800">{inst.user}</span>
                          <span className="text-slate-400">|</span>
                          <span className="text-slate-600">{inst.harness_type.replace('-', ' ')}</span>
                          {inst.version && <span className={`font-mono ${isOutdated ? 'text-amber-600' : 'text-slate-400'}`}>v{inst.version}</span>}
                          {isOutdated && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700"
                              title={`Upgrade to ${latestVersion}`}
                            >
                              <Icon name="arrow-up-circle" className="w-3 h-3" />
                              Upgrade
                            </span>
                          )}
                          {/* Detection source badges for instance */}
                          {inst.detection_sources && inst.detection_sources.length > 0 && (
                            <div className="flex items-center gap-0.5 ml-1">
                              {inst.detection_sources.map(src => {
                                const cfg = DETECTION_SOURCE_CONFIG[src];
                                return cfg ? (
                                  <span
                                    key={src}
                                    className={`inline-flex items-center px-1 py-0.5 rounded text-[8px] ${cfg.bgColor} ${cfg.textColor}`}
                                    title={cfg.label}
                                  >
                                    <Icon name={cfg.icon} className="w-2.5 h-2.5" />
                                  </span>
                                ) : null;
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Confidence indicator */}
                          <div className="flex items-center gap-1" title={`Confidence: ${Math.round(inst.detection_confidence * 100)}%`}>
                            <div className="w-8 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-full ${confidenceColor} rounded-full`} style={{ width: `${inst.detection_confidence * 100}%` }} />
                            </div>
                            <span className="text-slate-400">{Math.round(inst.detection_confidence * 100)}%</span>
                          </div>
                          <span className="text-slate-500">{inst.request_count} req</span>
                          <span className="text-slate-400">{inst.models_used.length} models</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Config path / Git commit info for top instance */}
                {aidlcHarnesses.instances.some(i => i.config_path || i.last_commit_sha) && (
                  <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xs font-medium text-slate-700 mb-2">Detection Details</div>
                    <div className="space-y-1.5 text-[10px]">
                      {aidlcHarnesses.instances.filter(i => i.config_path).slice(0, 3).map((inst, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Icon name="document-text" className="w-3 h-3 text-purple-500" />
                          <span className="text-slate-600">{inst.user}</span>
                          <span className="text-slate-400">-</span>
                          <span className="font-mono text-purple-600">{inst.config_path}</span>
                        </div>
                      ))}
                      {aidlcHarnesses.instances.filter(i => i.last_commit_sha).slice(0, 3).map((inst, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Icon name="code-bracket-square" className="w-3 h-3 text-orange-500" />
                          <span className="text-slate-600">{inst.user}</span>
                          <span className="text-slate-400">-</span>
                          <span className="font-mono text-orange-600">{inst.last_commit_sha}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Outdated instances summary */}
                {(() => {
                  const outdatedInstances = aidlcHarnesses.instances.filter(inst => {
                    const latestVersion = LATEST_HARNESS_VERSIONS[inst.harness_type];
                    return latestVersion && isVersionOutdated(inst.version, latestVersion);
                  });
                  return outdatedInstances.length > 0 ? (
                    <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <div className="flex items-start gap-2">
                        <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-xs font-semibold text-amber-800">
                            {outdatedInstances.length} instance{outdatedInstances.length > 1 ? 's' : ''} running outdated versions
                          </div>
                          <div className="text-[10px] text-amber-700 mt-1">
                            Recommend upgrading to latest versions for security patches and feature improvements:
                            <ul className="mt-1 ml-3 list-disc">
                              {[...new Set(outdatedInstances.map(i => i.harness_type))].map(hType => (
                                <li key={hType}>
                                  <span className="font-medium">{hType.replace('-', ' ')}</span>: upgrade to v{LATEST_HARNESS_VERSIONS[hType]}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {/* ═══════════════ TOOL ACCESS POLICY (TIERED GOVERNANCE) ═══════════════ */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Icon name="shield-check" className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-semibold text-slate-900">Harness Tool Access Policy</span>
                  {harnessPolicies?.live ? <LiveDataBadge source={harnessPolicies.source} /> : <MockDataBadge integration="Policy Engine" />}
                </div>
                <p className="text-xs text-slate-500 mt-1">Tiered tool access governance per harness type (READ_ONLY / READ_WRITE / FULL)</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{harnessPolicies?.total || 0} policies</span>
              </div>
            </div>

            {/* Tier Breakdown Legend */}
            {tierBreakdown && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                {tierBreakdown.tiers.map(tier => {
                  const tierColors: Record<ToolTier, { bg: string; border: string; text: string; icon: string }> = {
                    read_only: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-600' },
                    read_write: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-600' },
                    full: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: 'text-purple-600' },
                  };
                  const c = tierColors[tier.tier] || tierColors.read_only;
                  return (
                    <div key={tier.tier} className={`p-3 rounded-lg ${c.bg} border ${c.border}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon name={tier.tier === 'read_only' ? 'eye' : tier.tier === 'read_write' ? 'pencil-square' : 'command-line'} className={`w-4 h-4 ${c.icon}`} />
                        <span className={`text-xs font-semibold ${c.text}`}>{tier.label}</span>
                      </div>
                      <div className="text-[10px] text-slate-600 mb-2">{tier.description}</div>
                      <div className="flex flex-wrap gap-1">
                        {tier.tools.map(tool => (
                          <span key={tool} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/80 text-slate-600 border border-slate-200">
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Policies Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th scope="col" className="text-left px-3 py-2 font-medium text-slate-600">Harness</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Tier</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Blocked Tools</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Approval Required</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Output Limit</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Status</th>
                    <th scope="col" className="text-right px-3 py-2 font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {harnessPolicyLoading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                        Loading policies...
                      </td>
                    </tr>
                  ) : (harnessPolicies?.policies || []).filter(p => !p.harness_type.includes('_phase')).map(policy => {
                    const tierBadges: Record<ToolTier, { bg: string; text: string; label: string }> = {
                      read_only: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Read-Only' },
                      read_write: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Read-Write' },
                      full: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Full' },
                    };
                    const tierBadge = tierBadges[policy.allowed_tier] || tierBadges.read_only;
                    return (
                      <tr key={policy.policy_id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{policy.display_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{policy.harness_type}</div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${tierBadge.bg} ${tierBadge.text}`}>
                            {tierBadge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {policy.blocked_tools.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-1">
                              {policy.blocked_tools.slice(0, 3).map(tool => (
                                <span key={tool} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-rose-100 text-rose-700">
                                  {tool}
                                </span>
                              ))}
                              {policy.blocked_tools.length > 3 && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600">
                                  +{policy.blocked_tools.length - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400">None</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {policy.require_human_approval ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                              <Icon name="hand-raised" className="w-3 h-3" />
                              All Actions
                            </span>
                          ) : policy.approval_required_for.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-1">
                              {policy.approval_required_for.map(tool => (
                                <span key={tool} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-700">
                                  {tool}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-emerald-600">Auto-approved</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-[10px] text-slate-600">{policy.max_output_size_kb} KB</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${policy.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                            {policy.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => {
                              setSelectedHarnessPolicy(policy);
                              setHarnessPolicyEditing(true);
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Blocked Paths Info */}
            {tierBreakdown && tierBreakdown.blocked_paths_default.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200">
                <div className="flex items-start gap-2">
                  <Icon name="shield-exclamation" className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-rose-800">Default Blocked Paths (All Harnesses)</div>
                    <div className="text-[10px] text-rose-700 mt-1">
                      These paths are blocked by default to prevent credential leakage:
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {tierBreakdown.blocked_paths_default.slice(0, 8).map(path => (
                        <span key={path} className="px-2 py-0.5 rounded text-[9px] font-mono bg-rose-100 text-rose-700">
                          {path}
                        </span>
                      ))}
                      {tierBreakdown.blocked_paths_default.length > 8 && (
                        <span className="px-2 py-0.5 rounded text-[9px] bg-slate-100 text-slate-600">
                          +{tierBreakdown.blocked_paths_default.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════ POLICY-REALITY DRIFT DETECTION ═══════════════ */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-slate-900">Policy-Reality Drift</span>
                  {driftData?.live ? <LiveDataBadge source={driftData.source} /> : <MockDataBadge integration="CloudTrail + Policy Engine" />}
                </div>
                <p className="text-xs text-slate-500 mt-1">Compares harness policies against actual CloudTrail activity to detect deviations</p>
              </div>
              <button
                onClick={() => {
                  setDriftData(null);
                  setDriftLoading(true);
                  governPolicyDriftApi.analyze(24)
                    .then(data => setDriftData(data))
                    .catch(() => {})
                    .finally(() => setDriftLoading(false));
                }}
                disabled={driftLoading}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition-colors disabled:opacity-50"
              >
                {driftLoading ? 'Analyzing...' : 'Re-analyze'}
              </button>
            </div>

            {driftLoading ? (
              <div className="h-40 flex items-center justify-center text-xs text-slate-400">
                Analyzing CloudTrail activity against policies...
              </div>
            ) : driftData ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Total Findings</div>
                    <div className="text-xl font-bold text-slate-900">{driftData.summary.total_findings}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="text-[10px] font-medium text-rose-600 uppercase tracking-wide">Critical</div>
                    <div className="text-xl font-bold text-rose-700">{driftData.summary.by_severity.critical}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                    <div className="text-[10px] font-medium text-orange-600 uppercase tracking-wide">High</div>
                    <div className="text-xl font-bold text-orange-700">{driftData.summary.by_severity.high}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wide">Medium</div>
                    <div className="text-xl font-bold text-amber-700">{driftData.summary.by_severity.medium}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Compliance Gap</div>
                    <div className={`text-xl font-bold ${driftData.summary.compliance_gap_percentage > 5 ? 'text-rose-600' : driftData.summary.compliance_gap_percentage > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {driftData.summary.compliance_gap_percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Drift Type Breakdown */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {driftData.summary.by_type.tier_violation > 0 && (
                    <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                      {driftData.summary.by_type.tier_violation} Tier Violations
                    </span>
                  )}
                  {driftData.summary.by_type.path_violation > 0 && (
                    <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-rose-100 text-rose-700">
                      {driftData.summary.by_type.path_violation} Path Violations
                    </span>
                  )}
                  {driftData.summary.by_type.unknown_harness > 0 && (
                    <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                      {driftData.summary.by_type.unknown_harness} Unknown Harnesses
                    </span>
                  )}
                </div>

                {/* Filters */}
                <div className="flex items-center gap-4 mb-3">
                  <select
                    value={driftTypeFilter}
                    onChange={e => setDriftTypeFilter(e.target.value as DriftType | 'all')}
                    className="text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">All Types</option>
                    <option value="tier_violation">Tier Violation</option>
                    <option value="path_violation">Path Violation</option>
                    <option value="unknown_harness">Unknown Harness</option>
                  </select>
                  <select
                    value={driftSeverityFilter}
                    onChange={e => setDriftSeverityFilter(e.target.value as DriftSeverity | 'all')}
                    className="text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={driftShowResolved}
                      onChange={e => setDriftShowResolved(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-slate-600 focus:ring-slate-500"
                    />
                    Show resolved
                  </label>
                </div>

                {/* Findings Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                        <th scope="col" className="font-medium pb-2">Severity</th>
                        <th scope="col" className="font-medium pb-2">Type</th>
                        <th scope="col" className="font-medium pb-2">Harness</th>
                        <th scope="col" className="font-medium pb-2">Expected</th>
                        <th scope="col" className="font-medium pb-2">Actual</th>
                        <th scope="col" className="font-medium pb-2">Identity</th>
                        <th scope="col" className="font-medium pb-2">When</th>
                        <th scope="col" className="font-medium pb-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const severityBg: Record<DriftSeverity, string> = {
                          critical: 'bg-rose-200 text-rose-900',
                          high: 'bg-orange-100 text-orange-700',
                          medium: 'bg-amber-100 text-amber-700',
                          low: 'bg-slate-100 text-slate-600',
                        };
                        const typeBg: Record<DriftType, string> = {
                          tier_violation: 'bg-purple-100 text-purple-700',
                          path_violation: 'bg-rose-100 text-rose-700',
                          unknown_harness: 'bg-slate-100 text-slate-700',
                        };
                        const typeLabel: Record<DriftType, string> = {
                          tier_violation: 'Tier',
                          path_violation: 'Path',
                          unknown_harness: 'Unknown',
                        };

                        const filtered = driftData.findings
                          .filter(f => driftTypeFilter === 'all' || f.drift_type === driftTypeFilter)
                          .filter(f => driftSeverityFilter === 'all' || f.severity === driftSeverityFilter)
                          .filter(f => driftShowResolved || !f.resolved);

                        if (filtered.length === 0) {
                          return (
                            <tr>
                              <td colSpan={8} className="py-8 text-center text-slate-400">
                                {driftData.findings.length === 0
                                  ? 'No drift detected - policies and reality are aligned'
                                  : 'No findings match the current filters'}
                              </td>
                            </tr>
                          );
                        }

                        return filtered.slice(0, 15).map((f, i) => {
                          const fmtTime = (iso?: string | null) => {
                            if (!iso) return '-';
                            const d = new Date(iso);
                            return isNaN(d.getTime()) ? iso : d.toLocaleString();
                          };
                          return (
                            <tr key={f.finding_id} className={`${i > 0 ? 'border-t border-slate-100' : ''} ${f.resolved ? 'opacity-50' : ''}`}>
                              <td className="py-2 pr-2">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${severityBg[f.severity]}`}>
                                  {f.severity}
                                </span>
                              </td>
                              <td className="py-2 pr-2">
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${typeBg[f.drift_type]}`}>
                                  {typeLabel[f.drift_type]}
                                </span>
                              </td>
                              <td className="py-2 pr-2 font-medium text-slate-800">{f.harness_type}</td>
                              <td className="py-2 pr-2 text-slate-500 max-w-[150px] truncate" title={f.expected}>{f.expected}</td>
                              <td className="py-2 pr-2 text-slate-700 max-w-[150px] truncate" title={f.actual}>{f.actual}</td>
                              <td className="py-2 pr-2 text-slate-500">{f.evidence.username || '-'}</td>
                              <td className="py-2 pr-2 text-slate-500 whitespace-nowrap">{fmtTime(f.evidence.event_time)}</td>
                              <td className="py-2">
                                {!f.resolved && (
                                  <button
                                    onClick={() => handleResolveDriftFinding(f.finding_id)}
                                    disabled={driftResolving === f.finding_id}
                                    className="p-1 rounded hover:bg-emerald-100 text-slate-400 hover:text-emerald-600 transition-colors disabled:opacity-50"
                                    title="Mark as resolved"
                                  >
                                    <Icon name="check" className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {f.resolved && (
                                  <span className="text-[10px] text-emerald-600 font-medium">Resolved</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                {driftData.findings.length > 15 && (
                  <div className="text-center text-[11px] text-slate-400 pt-3 border-t border-slate-100 mt-2">
                    Showing 15 of {driftData.findings.length} findings
                  </div>
                )}

                {/* Worst Offenders Mini-List */}
                {driftData.summary.worst_offenders.length > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="user-group" className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-semibold text-amber-800">Top Offenders</span>
                    </div>
                    <div className="space-y-1">
                      {driftData.summary.worst_offenders.slice(0, 5).map((off, i) => (
                        <div key={off.identity} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-700 font-medium">{i + 1}. {off.identity}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-slate-500">{off.finding_count} findings</span>
                            {off.critical_count > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-100 text-rose-700">
                                {off.critical_count} critical
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="h-40 flex items-center justify-center text-xs text-slate-400">
                Unable to load drift analysis
              </div>
            )}
          </div>

          {/* Harness Policy Edit Drawer */}
          {selectedHarnessPolicy && harnessPolicyEditing && (
            <div
              className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl border-l border-slate-200 z-50 overflow-y-auto"
              role="dialog"
              aria-modal="true"
            >
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Edit Policy: {selectedHarnessPolicy.display_name}</h3>
                  <div className="text-xs text-slate-500 font-mono">{selectedHarnessPolicy.harness_type}</div>
                </div>
                <button
                  onClick={() => {
                    setSelectedHarnessPolicy(null);
                    setHarnessPolicyEditing(false);
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                  aria-label="Close"
                >
                  <Icon name="x-mark" className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Current Settings Display */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Tool Tier</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['read_only', 'read_write', 'full'] as const).map(tier => {
                        const tierLabels: Record<ToolTier, string> = { read_only: 'Read-Only', read_write: 'Read-Write', full: 'Full Access' };
                        const isSelected = selectedHarnessPolicy.allowed_tier === tier;
                        return (
                          <button
                            key={tier}
                            onClick={() => setSelectedHarnessPolicy({ ...selectedHarnessPolicy, allowed_tier: tier })}
                            className={`p-2 rounded-lg text-xs font-medium border transition-colors ${
                              isSelected
                                ? tier === 'read_only' ? 'bg-blue-100 border-blue-300 text-blue-700'
                                  : tier === 'read_write' ? 'bg-amber-100 border-amber-300 text-amber-700'
                                  : 'bg-purple-100 border-purple-300 text-purple-700'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {tierLabels[tier]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Output Size Limit (KB)</label>
                    <input
                      type="number"
                      value={selectedHarnessPolicy.max_output_size_kb}
                      onChange={e => setSelectedHarnessPolicy({ ...selectedHarnessPolicy, max_output_size_kb: parseInt(e.target.value) || 200 })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      min={1}
                      max={10000}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">File Size Limit (KB)</label>
                    <input
                      type="number"
                      value={selectedHarnessPolicy.max_file_size_kb}
                      onChange={e => setSelectedHarnessPolicy({ ...selectedHarnessPolicy, max_file_size_kb: parseInt(e.target.value) || 1000 })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      min={1}
                      max={100000}
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedHarnessPolicy.require_human_approval}
                        onChange={e => setSelectedHarnessPolicy({ ...selectedHarnessPolicy, require_human_approval: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700">Require human approval for all actions</span>
                    </label>
                  </div>

                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedHarnessPolicy.enabled}
                        onChange={e => setSelectedHarnessPolicy({ ...selectedHarnessPolicy, enabled: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700">Policy enabled</span>
                    </label>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    onClick={() => {
                      setSelectedHarnessPolicy(null);
                      setHarnessPolicyEditing(false);
                    }}
                    className="flex-1 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleHarnessPolicySave(selectedHarnessPolicy.harness_type, {
                      allowed_tier: selectedHarnessPolicy.allowed_tier,
                      max_output_size_kb: selectedHarnessPolicy.max_output_size_kb,
                      max_file_size_kb: selectedHarnessPolicy.max_file_size_kb,
                      require_human_approval: selectedHarnessPolicy.require_human_approval,
                      enabled: selectedHarnessPolicy.enabled,
                    })}
                    disabled={harnessPolicySaving}
                    className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {harnessPolicySaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* KPI Summary */}
          {(() => {
            const projects = aidlcProjects?.projects || AIDLC_PROJECTS;
            const findings = aidlcFindings?.findings || AIDLC_FINDINGS;
            const metrics = aidlcMetrics?.metrics || AIDLC_METRICS;
            const extensions = aidlcExtensions?.extensions || AIDLC_EXTENSIONS;
            const openFindings = findings.filter(f => f.status === 'open').length;
            const blockedProjects = projects.filter(p => p.status === 'blocked').length;
            const avgScore = metrics.length > 0 ? Math.round(metrics.reduce((sum, m) => sum + ('overall_score' in m ? m.overall_score : m.overallScore), 0) / metrics.length) : 0;
            const totalRules = extensions.reduce((sum, e) => sum + ('rule_count' in e ? e.rule_count : e.ruleCount), 0);
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                  <div className="text-xs font-medium text-slate-500 mb-1">Active Projects</div>
                  <div className="text-2xl font-bold text-slate-900">{aidlcLoading ? '...' : projects.filter(p => p.status === 'active').length}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{projects.length} total</div>
                </div>
                <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                  <div className="text-xs font-medium text-slate-500 mb-1">Open Findings</div>
                  <div className={`text-2xl font-bold ${openFindings > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {aidlcLoading ? '...' : openFindings}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">blocking violations</div>
                </div>
                <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                  <div className="text-xs font-medium text-slate-500 mb-1">Pending Approvals</div>
                  <div className="text-2xl font-bold text-amber-600">
                    {aidlcLoading ? '...' : projects.reduce((sum, p) => sum + ('pending_approvals' in p ? p.pending_approvals : p.pendingApprovals), 0)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">awaiting review</div>
                </div>
                <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                  <div className="text-xs font-medium text-slate-500 mb-1">Extensions Active</div>
                  <div className="text-2xl font-bold text-indigo-600">{aidlcLoading ? '...' : extensions.length}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{totalRules} rules total</div>
                </div>
                <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                  <div className="text-xs font-medium text-slate-500 mb-1">Avg Quality Score</div>
                  <div className="text-2xl font-bold text-emerald-600">
                    {aidlcLoading ? '...' : `${avgScore}%`}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">evaluator score</div>
                </div>
                <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                  <div className="text-xs font-medium text-slate-500 mb-1">Blocked Projects</div>
                  <div className={`text-2xl font-bold ${blockedProjects > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {aidlcLoading ? '...' : blockedProjects}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">needs attention</div>
                </div>
              </div>
            );
          })()}

          {/* Projects Table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Projects with AI-DLC Workflows</div>
              {aidlcProjects?.live ? <LiveDataBadge source="CodeCommit" /> : <MockDataBadge integration="AI-DLC State Files" />}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Project</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Phase</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-slate-600">Current Stage</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Progress</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Extensions</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Findings</th>
                    <th scope="col" className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-slate-600">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Drive the table body from live projects when available (snake_case
                    // from CodeCommit state files), falling back to the mock catalog only
                    // when not live. Fields are normalized snake→camel per-row so both the
                    // live and mock shapes render identically.
                    const projectsList = aidlcProjects?.projects || AIDLC_PROJECTS;
                    const findingsList = aidlcFindings?.findings || AIDLC_FINDINGS;
                    return projectsList.map(p => {
                      const id = p.id;
                      const currentPhase = ('current_phase' in p ? p.current_phase : p.currentPhase) as AidlcPhase;
                      const currentStage = 'current_stage' in p ? p.current_stage : p.currentStage;
                      const enabledExtensions = 'enabled_extensions' in p ? p.enabled_extensions : p.enabledExtensions;
                      const lastActivity = 'last_activity' in p ? p.last_activity : p.lastActivity;
                      const progress = p.progress;
                      const phaseConfig = PHASE_CONFIG[currentPhase];
                      const stage = AIDLC_STAGES.find(s => s.id === currentStage);
                      const projectFindings = findingsList.filter(f =>
                        ('project_id' in f ? f.project_id : f.projectId) === id && f.status === 'open'
                      );
                      return (
                        <tr key={id} className="border-t border-slate-100 hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{p.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{p.repository}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${phaseConfig.bgColor} ${phaseConfig.color}`}>
                              {phaseConfig.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-slate-700">{stage?.name || currentStage}</div>
                            <div className="text-[10px] text-slate-400">{stage?.execution === 'always' ? 'Required' : 'Conditional'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                                <div className="h-full bg-blue-500" style={{ width: `${progress.inception / 3}%` }} />
                                <div className="h-full bg-emerald-500" style={{ width: `${progress.construction / 3}%` }} />
                                <div className="h-full bg-amber-500" style={{ width: `${progress.operations / 3}%` }} />
                              </div>
                              <span className="text-[10px] text-slate-500 w-8 text-right">
                                {Math.round((progress.inception + progress.construction + progress.operations) / 3)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {enabledExtensions.map(extId => {
                                const ext = AIDLC_EXTENSIONS.find(e => e.id === extId);
                                const catConfig = ext ? EXTENSION_CATEGORY_CONFIG[ext.category] : null;
                                return ext && catConfig ? (
                                  <span
                                    key={extId}
                                    className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold ${catConfig.bgColor} ${catConfig.color}`}
                                    title={ext.name}
                                  >
                                    {ext.name.charAt(0)}
                                  </span>
                                ) : null;
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {projectFindings.length > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
                                <Icon name="exclamation-triangle" className="w-3 h-3" />
                                {projectFindings.length}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                                <Icon name="check-circle" className="w-3 h-3" />
                                0
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${
                              p.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                              p.status === 'blocked' ? 'bg-rose-100 text-rose-700' :
                              p.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-slate-500">{lastActivity}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Extensions & Findings Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Extensions */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Extension Rule Sets</div>
              <div className="space-y-3">
                {AIDLC_EXTENSIONS.map(ext => {
                  const catConfig = EXTENSION_CATEGORY_CONFIG[ext.category];
                  const extRules = AIDLC_RULES.filter(r => r.extensionId === ext.id);
                  const violations = AIDLC_FINDINGS.filter(f => extRules.some(r => r.id === f.ruleId) && f.status === 'open');
                  return (
                    <div key={ext.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${catConfig.bgColor} ${catConfig.color}`}>
                            {ext.category}
                          </span>
                          <span className="text-sm font-medium text-slate-900">{ext.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">{ext.ruleCount} rules</span>
                          {ext.blocking && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-100 text-rose-700">Blocking</span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-slate-600 mb-2">{ext.description}</div>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {extRules.slice(0, 3).map(rule => (
                            <span key={rule.id} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-200 text-slate-600">
                              {rule.id}
                            </span>
                          ))}
                          {extRules.length > 3 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] text-slate-400">+{extRules.length - 3} more</span>
                          )}
                        </div>
                        {violations.length > 0 && (
                          <span className="text-[10px] text-rose-600 font-medium">{violations.length} violations</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Open Findings */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-900">Blocking Findings</div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  AIDLC_FINDINGS.filter(f => f.status === 'open').length > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {AIDLC_FINDINGS.filter(f => f.status === 'open').length} open
                </span>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {AIDLC_FINDINGS.filter(f => f.status === 'open').map(finding => {
                  const project = AIDLC_PROJECTS.find(p => p.id === finding.projectId);
                  return (
                    <div key={finding.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            finding.severity === 'critical' ? 'bg-rose-500' :
                            finding.severity === 'high' ? 'bg-orange-500' :
                            finding.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                          }`} />
                          <span className="text-xs font-mono text-slate-600">{finding.ruleId}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                            finding.severity === 'critical' ? 'bg-rose-100 text-rose-700' :
                            finding.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                            finding.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {finding.severity}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">{finding.detectedAt}</span>
                      </div>
                      <div className="text-xs text-slate-800 mb-1">{finding.message}</div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span>{project?.name}</span>
                        {finding.file && (
                          <span className="font-mono">{finding.file}:{finding.line}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {AIDLC_FINDINGS.filter(f => f.status === 'open').length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <Icon name="check-circle" className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                    <div className="text-sm">No open findings</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Workflow Stages & Audit Log */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stage Pipeline */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">AI-DLC Stage Pipeline</div>
              {(['inception', 'construction', 'operations'] as AidlcPhase[]).map(phase => {
                const phaseConfig = PHASE_CONFIG[phase];
                const stages = AIDLC_STAGES.filter(s => s.phase === phase);
                return (
                  <div key={phase} className="mb-4 last:mb-0">
                    <div className={`flex items-center gap-2 mb-2 px-2 py-1 rounded ${phaseConfig.bgColor}`}>
                      <div className={`w-2 h-2 rounded-full ${
                        phase === 'inception' ? 'bg-blue-500' :
                        phase === 'construction' ? 'bg-emerald-500' : 'bg-amber-500'
                      }`} />
                      <span className={`text-xs font-semibold ${phaseConfig.color}`}>{phaseConfig.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-4">
                      {stages.map(stage => (
                        <span
                          key={stage.id}
                          className={`px-2 py-1 rounded text-[10px] ${
                            stage.execution === 'always'
                              ? 'bg-slate-200 text-slate-700 font-medium'
                              : 'bg-slate-100 text-slate-500 border border-dashed border-slate-300'
                          }`}
                          title={stage.description}
                        >
                          {stage.name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="mt-4 pt-4 border-t border-slate-200 flex items-center gap-4 text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-slate-200" /> Always executed
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-slate-100 border border-dashed border-slate-300" /> Conditional
                </span>
              </div>
            </div>

            {/* Recent Audit Log */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Recent Workflow Activity</div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {AIDLC_AUDIT_LOG.slice(0, 8).map(entry => {
                  const project = AIDLC_PROJECTS.find(p => p.id === entry.projectId);
                  const actionConfig: Record<string, { icon: IconName; color: string }> = {
                    'stage-started': { icon: 'play', color: 'text-blue-600' },
                    'stage-completed': { icon: 'check-circle', color: 'text-emerald-600' },
                    'approval-requested': { icon: 'hand-raised', color: 'text-amber-600' },
                    'approval-granted': { icon: 'check', color: 'text-emerald-600' },
                    'approval-rejected': { icon: 'x-mark', color: 'text-rose-600' },
                    'finding-detected': { icon: 'exclamation-triangle', color: 'text-rose-600' },
                    'finding-resolved': { icon: 'check-circle', color: 'text-emerald-600' },
                  };
                  const config = actionConfig[entry.action] || { icon: 'information-circle', color: 'text-slate-500' };
                  return (
                    <div key={entry.id} className="flex items-start gap-3 p-2 rounded hover:bg-slate-50">
                      <Icon name={config.icon} className={`w-4 h-4 mt-0.5 ${config.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-800">{entry.details}</div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                          <span>{project?.name}</span>
                          <span>•</span>
                          <span>{entry.stage}</span>
                          {entry.user && (
                            <>
                              <span>•</span>
                              <span>{entry.user}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Evaluator Metrics */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">AI-DLC Evaluator Metrics</div>
                <div className="text-xs text-slate-500">Automated quality assessment across projects</div>
              </div>
              <a
                href="https://github.com/awslabs/aidlc-workflows/tree/main/scripts/aidlc-evaluator"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
              >
                Evaluator Docs <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Project</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Linting</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Security</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Test Pass</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Coverage</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Semantic</th>
                    <th scope="col" className="text-center px-4 py-2 font-medium text-slate-600">Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {AIDLC_METRICS.map(metric => {
                    const project = AIDLC_PROJECTS.find(p => p.id === metric.projectId);
                    const scoreColor = (score: number) =>
                      score >= 90 ? 'text-emerald-600' : score >= 75 ? 'text-amber-600' : 'text-rose-600';
                    return (
                      <tr key={metric.projectId} className="border-t border-slate-100">
                        <td className="px-4 py-2 font-medium text-slate-900">{project?.name}</td>
                        <td className={`px-4 py-2 text-center font-semibold ${scoreColor(metric.codeQuality.lintingScore)}`}>
                          {metric.codeQuality.lintingScore}%
                        </td>
                        <td className={`px-4 py-2 text-center font-semibold ${scoreColor(metric.codeQuality.securityScore)}`}>
                          {metric.codeQuality.securityScore}%
                        </td>
                        <td className={`px-4 py-2 text-center font-semibold ${scoreColor(metric.testResults.passRate)}`}>
                          {metric.testResults.passRate}%
                        </td>
                        <td className={`px-4 py-2 text-center font-semibold ${scoreColor(metric.testResults.coveragePct)}`}>
                          {metric.testResults.coveragePct}%
                        </td>
                        <td className={`px-4 py-2 text-center font-semibold ${scoreColor(metric.semanticScore)}`}>
                          {metric.semanticScore}%
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded font-bold ${
                            metric.overallScore >= 90 ? 'bg-emerald-100 text-emerald-700' :
                            metric.overallScore >= 75 ? 'bg-amber-100 text-amber-700' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {metric.overallScore}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Backend Sandboxing Comparison */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Icon name="shield-check" className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-slate-900">Backend Sandboxing</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Tool capabilities and restrictions per backend provider</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                {backendLoading ? '...' : `${backendComparison?.backends.length || 0} backends`}
              </span>
            </div>

            {/* Backend comparison table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th scope="col" className="text-left px-3 py-2 font-medium text-slate-600">Backend</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Read</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Write</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Edit</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Glob</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Grep</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Bash</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">Agent</th>
                    <th scope="col" className="text-center px-3 py-2 font-medium text-slate-600">MCP</th>
                    <th scope="col" className="text-right px-3 py-2 font-medium text-slate-600">Context</th>
                  </tr>
                </thead>
                <tbody>
                  {(backendComparison?.backends || [
                    { backend: 'cli' as HarnessBackend, allowed_tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Agent'], blocked_tools: [], can_write: true, can_execute: true, max_context_tokens: 200000, supports_streaming: true, supports_tool_use: true, requires_human_approval_for: ['Bash'], supports_mcp: true, supports_agents: true },
                    { backend: 'sdk' as HarnessBackend, allowed_tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], blocked_tools: ['Bash', 'Agent'], can_write: true, can_execute: false, max_context_tokens: 200000, supports_streaming: true, supports_tool_use: true, requires_human_approval_for: ['Write', 'Edit'], supports_mcp: true, supports_agents: false },
                    { backend: 'bedrock' as HarnessBackend, allowed_tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], blocked_tools: ['Bash', 'Agent'], can_write: true, can_execute: false, max_context_tokens: 200000, supports_streaming: true, supports_tool_use: true, requires_human_approval_for: ['Write', 'Edit'], supports_mcp: false, supports_agents: false },
                    { backend: 'openai' as HarnessBackend, allowed_tools: ['Read', 'Glob', 'Grep'], blocked_tools: ['Write', 'Edit', 'Bash', 'Agent'], can_write: false, can_execute: false, max_context_tokens: 128000, supports_streaming: true, supports_tool_use: true, requires_human_approval_for: [], supports_mcp: false, supports_agents: false },
                    { backend: 'azure' as HarnessBackend, allowed_tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], blocked_tools: ['Bash', 'Agent'], can_write: true, can_execute: false, max_context_tokens: 128000, supports_streaming: true, supports_tool_use: true, requires_human_approval_for: ['Write', 'Edit'], supports_mcp: false, supports_agents: false },
                    { backend: 'vertex' as HarnessBackend, allowed_tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], blocked_tools: ['Bash', 'Agent'], can_write: true, can_execute: false, max_context_tokens: 128000, supports_streaming: true, supports_tool_use: true, requires_human_approval_for: ['Write', 'Edit'], supports_mcp: false, supports_agents: false },
                  ]).map(cap => {
                    const backendLabels: Record<HarnessBackend, { label: string; color: string; description: string }> = {
                      cli: { label: 'CLI', color: 'bg-orange-100 text-orange-700', description: 'Claude Code CLI - Full tools' },
                      sdk: { label: 'SDK', color: 'bg-blue-100 text-blue-700', description: 'Anthropic SDK - No shell' },
                      bedrock: { label: 'Bedrock', color: 'bg-amber-100 text-amber-700', description: 'AWS Bedrock - Managed sandbox' },
                      openai: { label: 'OpenAI', color: 'bg-emerald-100 text-emerald-700', description: 'OpenAI-compatible - Read-only' },
                      azure: { label: 'Azure', color: 'bg-sky-100 text-sky-700', description: 'Azure OpenAI - Enterprise' },
                      vertex: { label: 'Vertex', color: 'bg-purple-100 text-purple-700', description: 'Google Vertex AI' },
                    };
                    const label = backendLabels[cap.backend];
                    const renderToolStatus = (tool: string) => {
                      if (cap.blocked_tools.includes(tool)) {
                        return <span className="text-rose-500" title="Blocked"><Icon name="x-mark" className="w-4 h-4 mx-auto" /></span>;
                      }
                      if (cap.requires_human_approval_for.includes(tool)) {
                        return <span className="text-amber-500" title="Requires approval"><Icon name="hand-raised" className="w-4 h-4 mx-auto" /></span>;
                      }
                      if (cap.allowed_tools.includes(tool)) {
                        return <span className="text-emerald-500" title="Allowed"><Icon name="check" className="w-4 h-4 mx-auto" /></span>;
                      }
                      return <span className="text-slate-300" title="Not available">-</span>;
                    };
                    return (
                      <tr key={cap.backend} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${label.color}`}>
                              {label.label}
                            </span>
                            <span className="text-[10px] text-slate-500 hidden lg:inline" title={label.description}>
                              {label.description}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">{renderToolStatus('Read')}</td>
                        <td className="px-3 py-2 text-center">{renderToolStatus('Write')}</td>
                        <td className="px-3 py-2 text-center">{renderToolStatus('Edit')}</td>
                        <td className="px-3 py-2 text-center">{renderToolStatus('Glob')}</td>
                        <td className="px-3 py-2 text-center">{renderToolStatus('Grep')}</td>
                        <td className="px-3 py-2 text-center">{renderToolStatus('Bash')}</td>
                        <td className="px-3 py-2 text-center">{renderToolStatus('Agent')}</td>
                        <td className="px-3 py-2 text-center">
                          {cap.supports_mcp ? (
                            <span className="text-emerald-500"><Icon name="check" className="w-4 h-4 mx-auto" /></span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-slate-600">
                          {(cap.max_context_tokens / 1000).toFixed(0)}k
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-4 text-[10px]">
                <span className="flex items-center gap-1"><Icon name="check" className="w-3.5 h-3.5 text-emerald-500" /> Allowed</span>
                <span className="flex items-center gap-1"><Icon name="hand-raised" className="w-3.5 h-3.5 text-amber-500" /> Requires approval</span>
                <span className="flex items-center gap-1"><Icon name="x-mark" className="w-3.5 h-3.5 text-rose-500" /> Blocked</span>
              </div>
              <div className="text-[10px] text-slate-500">
                Backend detected from userAgent patterns in CloudTrail
              </div>
            </div>

            {/* Per-harness assignment hint */}
            <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-start gap-2">
                <Icon name="information-circle" className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-slate-600">
                  <strong>Backend Assignment:</strong> Harness instances are automatically assigned a backend based on their userAgent.
                  CLI harnesses get full tool access, while SDK/Bedrock are restricted from shell execution.
                  OpenAI-compatible backends are read-only. Admins can override assignments per-harness.
                </div>
              </div>
            </div>
          </div>

          {/* Adversarial Validation Panel */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <ValidationPanelUI />
          </div>

          {/* Integration Guide */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="text-sm font-semibold text-slate-900 mb-4">Integrate AI-DLC with Your Coding Tools</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { tool: 'Claude Code', file: 'CLAUDE.md', path: 'Project root', color: 'from-orange-500 to-amber-600' },
                { tool: 'Kiro', file: '.kiro/steering/', path: 'Steering files', color: 'from-orange-500 to-yellow-500' },
                { tool: 'Amazon Q', file: '.amazonq/rules/', path: 'Rule directory', color: 'from-blue-500 to-cyan-500' },
                { tool: 'Cursor', file: '.cursor/rules/', path: 'MDC files', color: 'from-emerald-500 to-teal-600' },
              ].map(item => (
                <div key={item.tool} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                      <span className="text-white text-[10px] font-bold">{item.tool.charAt(0)}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-900">{item.tool}</span>
                  </div>
                  <div className="text-[10px] text-slate-600">
                    <div className="font-mono bg-slate-200 px-1.5 py-0.5 rounded inline-block mb-1">{item.file}</div>
                    <div>{item.path}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
              <div className="text-xs text-indigo-800">
                <strong>Quick Start:</strong> Copy <code className="bg-indigo-100 px-1 rounded">aws-aidlc-rules/</code> and{' '}
                <code className="bg-indigo-100 px-1 rounded">aws-aidlc-rule-details/</code> to your project, then start prompts with{' '}
                <code className="bg-indigo-100 px-1 rounded">"Using AI-DLC, ..."</code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bring into Governance Drawer */}
      {governanceAgent && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setGovernanceAgent(null)}
          />
          {/* Drawer */}
          <div
            className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 overflow-y-auto animate-in slide-in-from-right"
            role="dialog"
            aria-modal="true"
            aria-labelledby="governance-drawer-title"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 id="governance-drawer-title" className="text-lg font-semibold text-slate-900">Bring into Governance</h3>
                <p className="text-xs text-slate-500">Register or manage this local agent</p>
              </div>
              <button
                onClick={() => setGovernanceAgent(null)}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <Icon name="x-mark" className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Agent Details */}
              <div>
                <div className="text-sm font-semibold text-slate-900 mb-3">Agent Details</div>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                    <Icon name="folder" className="w-4 h-4 text-slate-500 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-medium text-slate-500 mb-0.5">Repository</div>
                      <div className="text-sm font-medium text-slate-900 truncate">{governanceAgent.repo_name}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                    <Icon name="document" className="w-4 h-4 text-slate-500 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-medium text-slate-500 mb-0.5">File Path</div>
                      <div className="text-xs font-mono text-slate-700 break-all">{governanceAgent.file_path}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-[10px] font-medium text-slate-500 mb-0.5">Tool Type</div>
                      <div className="text-sm font-medium text-slate-900">{governanceAgent.tool}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <div className="text-[10px] font-medium text-slate-500 mb-0.5">Risk Level</div>
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${
                        governanceAgent.risk_level === 'critical' ? 'bg-rose-100 text-rose-700' :
                        governanceAgent.risk_level === 'high' ? 'bg-orange-100 text-orange-700' :
                        governanceAgent.risk_level === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {governanceAgent.risk_level}
                      </span>
                    </div>
                  </div>
                  {governanceAgent.owner && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                      <Icon name="user" className="w-4 h-4 text-slate-500 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-medium text-slate-500 mb-0.5">Owner</div>
                        <div className="text-sm text-slate-900">{governanceAgent.owner}</div>
                        {governanceAgent.team && (
                          <div className="text-xs text-slate-500">{governanceAgent.team}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Governance Options */}
              <div>
                <div className="text-sm font-semibold text-slate-900 mb-3">Governance Action</div>
                <div className="space-y-2">
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      governanceAction === 'register' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="governanceAction"
                      value="register"
                      checked={governanceAction === 'register'}
                      onChange={() => setGovernanceAction('register')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon name="clipboard-document-list" className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm font-medium text-slate-900">Register for Tracking</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Add to inventory for visibility. No restrictions applied.
                      </p>
                    </div>
                  </label>
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      governanceAction === 'policy' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="governanceAction"
                      value="policy"
                      checked={governanceAction === 'policy'}
                      onChange={() => setGovernanceAction('policy')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon name="shield-check" className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-slate-900">Apply Policy Template</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Register and apply standard governance policies (routing, context filters).
                      </p>
                    </div>
                  </label>
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      governanceAction === 'block' ? 'border-rose-500 bg-rose-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="governanceAction"
                      value="block"
                      checked={governanceAction === 'block'}
                      onChange={() => setGovernanceAction('block')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon name="no-symbol" className="w-4 h-4 text-rose-600" />
                        <span className="text-sm font-medium text-slate-900">Block Agent</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Flag as non-compliant and alert the owner to remediate.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Notify Owner Option */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <Icon name="bell" className="w-4 h-4 text-slate-500" />
                  <div>
                    <div className="text-sm font-medium text-slate-900">Notify Owner</div>
                    <div className="text-xs text-slate-500">
                      {governanceAgent.owner ? `Send notification to ${governanceAgent.owner}` : 'Owner email not available'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifyOwner}
                  onClick={() => setNotifyOwner(!notifyOwner)}
                  disabled={!governanceAgent.owner}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    notifyOwner && governanceAgent.owner ? 'bg-emerald-600' : 'bg-slate-300'
                  } ${!governanceAgent.owner ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      notifyOwner && governanceAgent.owner ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={() => setGovernanceAgent(null)}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const actionLabels = {
                      register: 'registered for tracking',
                      policy: 'registered with policy template',
                      block: 'blocked and owner notified',
                    };
                    setShowActionToast(`Agent ${actionLabels[governanceAction]}${notifyOwner && governanceAgent.owner ? ' — owner notified' : ''}`);
                    setTimeout(() => setShowActionToast(null), 4000);
                    setGovernanceAgent(null);
                  }}
                  className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors ${
                    governanceAction === 'block'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : governanceAction === 'policy'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {governanceAction === 'register' && 'Register Agent'}
                  {governanceAction === 'policy' && 'Apply Policy'}
                  {governanceAction === 'block' && 'Block Agent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ COMPLIANCE TAB ════════════════════════════════ */}
      {activeTab === 'compliance' && (
        <div className="space-y-6">
          {/* Also previously unbadged. The framework catalogue and control mappings are real
              backend data, but evidence COLLECTION is mostly not: 11 of the 12 collectors in
              govern_compliance_evidence_service return hardcoded worked examples, which now
              report per-control status `illustrative` rather than `collected` and are excluded
              from coverage_percentage. Badge names that split rather than claiming either. */}
          <div className="flex items-center justify-end">
            <MockDataBadge integration="Framework definitions and control mappings are live from the control plane; evidence collection is mostly illustrative — only the kill-switch reader measures a real source, so per-control status shows which is which" />
          </div>

          {/* Header */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Icon name="clipboard-document-check" className="w-5 h-5 text-blue-600" />
                  Compliance Evidence Chain
                </h2>
                <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                  Map AVA Govern controls to compliance framework requirements. Automatically collect
                  evidence from kill-switch status, audit artifacts, validation panels, policy configs,
                  and incident metrics to demonstrate compliance coverage.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateReport}
                  disabled={reportGenerating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {reportGenerating ? (
                    <>
                      <Icon name="arrow-path" className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Icon name="document-text" className="w-4 h-4" />
                      Generate Report
                    </>
                  )}
                </button>
                <button
                  onClick={handleExportEvidence}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Icon name="arrow-down-tray" className="w-4 h-4" />
                  Export
                </button>
              </div>
            </div>
          </div>

          {/* Framework Selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-slate-700">Framework:</span>
            {complianceFrameworks?.frameworks.map(fw => (
              <button
                key={fw.id}
                onClick={() => setSelectedFramework(fw.id as ComplianceFramework)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedFramework === fw.id
                    ? `${FRAMEWORK_CONFIG[fw.id as ComplianceFramework]?.bgColor || 'bg-blue-100'} ${FRAMEWORK_CONFIG[fw.id as ComplianceFramework]?.color || 'text-blue-700'} ring-2 ring-blue-500`
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {FRAMEWORK_CONFIG[fw.id as ComplianceFramework]?.name || fw.name}
                <span className="text-xs opacity-75">({fw.control_count})</span>
              </button>
            ))}
            {complianceLoading && !complianceFrameworks && (
              <span className="text-sm text-slate-500">Loading frameworks...</span>
            )}
          </div>

          {/* Coverage Overview */}
          {frameworkCoverage && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Coverage Donut */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-medium text-slate-500 mb-4">Coverage</h3>
                <div className="relative w-32 h-32 mx-auto">
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth="3"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={frameworkCoverage.coverage_percentage >= 70 ? '#10b981' : frameworkCoverage.coverage_percentage >= 40 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="3"
                      strokeDasharray={`${frameworkCoverage.coverage_percentage}, 100`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-slate-900">{frameworkCoverage.coverage_percentage}%</span>
                    <span className="text-xs text-slate-500">coverage</span>
                  </div>
                </div>
              </div>

              {/* Controls Collected */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-500">Evidence Collected</span>
                  <Icon name="check-circle" className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="text-3xl font-bold text-emerald-600">{frameworkCoverage.covered_controls}</div>
                <div className="text-sm text-slate-500 mt-1">of {frameworkCoverage.total_controls} controls</div>
              </div>

              {/* Pending */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-500">Pending Collection</span>
                  <Icon name="clock" className="w-5 h-5 text-amber-500" />
                </div>
                <div className="text-3xl font-bold text-amber-600">{frameworkCoverage.pending_controls}</div>
                <div className="text-sm text-slate-500 mt-1">controls ready to collect</div>
              </div>

              {/* Gaps */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-500">Coverage Gaps</span>
                  <Icon name="exclamation-triangle" className="w-5 h-5 text-rose-500" />
                </div>
                <div className="text-3xl font-bold text-rose-600">{frameworkCoverage.gap_controls}</div>
                <div className="text-sm text-slate-500 mt-1">controls not mapped</div>
              </div>
            </div>
          )}

          {/* Control Mappings Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                Control Mappings - {FRAMEWORK_CONFIG[selectedFramework]?.name || selectedFramework}
              </h3>
              <span className="text-sm text-slate-500">
                {controlMappings?.total || 0} controls
              </span>
            </div>

            {complianceLoading ? (
              <div className="p-8 text-center text-slate-500">
                <Icon name="arrow-path" className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading control mappings...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Control ID</th>
                      <th className="px-4 py-3 text-left font-medium">Name</th>
                      <th className="px-4 py-3 text-left font-medium">AVA Controls</th>
                      <th className="px-4 py-3 text-left font-medium">Priority</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {controlMappings?.mappings.map(mapping => {
                      // Determine status based on report if available
                      const coverage = complianceReport?.control_coverages.find(c => c.control_id === mapping.control_id);
                      const status: ComplianceEvidenceStatus = coverage?.evidence_status || (mapping.ava_controls.length > 0 ? 'pending' : 'gap');

                      return (
                        <tr key={mapping.control_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                              {mapping.control_id}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{mapping.control_name}</div>
                            <div className="text-xs text-slate-500 mt-0.5 line-clamp-2 max-w-md">
                              {mapping.description}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {mapping.ava_controls.slice(0, 3).map(ctrl => (
                                <span
                                  key={ctrl}
                                  className="inline-flex px-1.5 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700"
                                >
                                  {ctrl.replace(/_/g, ' ')}
                                </span>
                              ))}
                              {mapping.ava_controls.length > 3 && (
                                <span className="text-xs text-slate-500">
                                  +{mapping.ava_controls.length - 3} more
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              mapping.priority === 'critical' ? 'bg-rose-100 text-rose-700' :
                              mapping.priority === 'high' ? 'bg-amber-100 text-amber-700' :
                              mapping.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {mapping.priority}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                              status === 'collected' ? 'bg-emerald-100 text-emerald-700' :
                              // Slate, never emerald: illustrative evidence must not read as
                              // an evidenced control just because a record exists.
                              status === 'illustrative' ? 'bg-slate-100 text-slate-500' :
                              status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              status === 'expired' ? 'bg-orange-100 text-orange-700' :
                              'bg-rose-100 text-rose-700'
                            }`}>
                              <Icon
                                name={
                                  status === 'collected' ? 'check-circle' :
                                  status === 'illustrative' ? 'information-circle' :
                                  status === 'pending' ? 'clock' :
                                  status === 'expired' ? 'exclamation-circle' :
                                  'x-circle'
                                }
                                className="w-3.5 h-3.5"
                              />
                              {status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleViewEvidence(mapping.control_id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Icon name="eye" className="w-3.5 h-3.5" />
                              View Evidence
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Generated Report Section */}
          {complianceReport && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Icon name="document-text" className="w-5 h-5 text-blue-600" />
                  Generated Report
                </h3>
                <span className="text-xs text-slate-500">
                  Generated {new Date(complianceReport.generated_at).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-sm text-slate-500">Report ID</div>
                  <div className="font-mono text-xs mt-1">{complianceReport.report_id}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-sm text-slate-500">Coverage</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1">
                    {complianceReport.coverage_percentage}%
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-sm text-slate-500">Evidence Items</div>
                  <div className="text-lg font-bold text-blue-600 mt-1">
                    {complianceReport.evidence_items.length}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-sm text-slate-500">Validity</div>
                  <div className="text-lg font-bold text-slate-700 mt-1">
                    {complianceReport.validity_days} days
                  </div>
                </div>
              </div>

              {complianceReport.gaps.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                  <h4 className="font-medium text-rose-800 flex items-center gap-2 mb-2">
                    <Icon name="exclamation-triangle" className="w-4 h-4" />
                    Coverage Gaps ({complianceReport.gaps.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {complianceReport.gaps.map(gap => (
                      <span key={gap} className="font-mono text-xs bg-white px-2 py-1 rounded text-rose-700">
                        {gap}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Evidence Preview Drawer */}
          {evidenceDrawerOpen && (
            <div className="fixed inset-0 z-50 overflow-hidden">
              <div className="absolute inset-0 bg-black/30" onClick={() => setEvidenceDrawerOpen(false)} />
              <div className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-xl">
                <div className="h-full flex flex-col">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">Evidence Details</h3>
                    <button
                      onClick={() => setEvidenceDrawerOpen(false)}
                      className="p-1 rounded hover:bg-slate-100"
                    >
                      <Icon name="x-mark" className="w-5 h-5 text-slate-500" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5">
                    {evidenceLoading ? (
                      <div className="flex items-center justify-center h-32">
                        <Icon name="arrow-path" className="w-6 h-6 animate-spin text-slate-400" />
                      </div>
                    ) : selectedControlEvidence ? (
                      <div className="space-y-4">
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-sm text-slate-500 mb-1">Control</div>
                          <div className="font-mono text-sm">{selectedControlEvidence.control_mapping_id}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">Status:</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            selectedControlEvidence.status === 'collected' ? 'bg-emerald-100 text-emerald-700' :
                            selectedControlEvidence.status === 'illustrative' ? 'bg-slate-100 text-slate-500' :
                            selectedControlEvidence.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {selectedControlEvidence.status}
                          </span>
                        </div>

                        <div>
                          <h4 className="font-medium text-slate-900 mb-2">
                            Evidence Items ({selectedControlEvidence.total})
                          </h4>
                          <div className="space-y-3">
                            {selectedControlEvidence.evidence_items.map(item => (
                              <div key={item.evidence_id} className="bg-white border border-slate-200 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                                    {item.evidence_id}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {new Date(item.collected_at).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="text-sm mb-2">
                                  <span className="text-slate-500">Type:</span>{' '}
                                  <span className="font-medium">{item.evidence_type.replace(/_/g, ' ')}</span>
                                </div>
                                <div className="text-sm mb-2">
                                  <span className="text-slate-500">Source:</span>{' '}
                                  <span className="font-mono text-xs">{item.source}</span>
                                </div>
                                <div className="text-sm mb-2">
                                  <span className="text-slate-500">Valid for:</span>{' '}
                                  {item.validity_period_days} days
                                </div>
                                <details className="mt-2">
                                  <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-700">
                                    View Data
                                  </summary>
                                  <pre className="mt-2 p-3 bg-slate-50 rounded text-xs overflow-x-auto">
                                    {JSON.stringify(item.data, null, 2)}
                                  </pre>
                                </details>
                              </div>
                            ))}
                            {selectedControlEvidence.evidence_items.length === 0 && (
                              <div className="text-sm text-slate-500 text-center py-4">
                                No evidence collected yet
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-slate-500 py-8">
                        No evidence data available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════ POLICY DRIFT TAB ════════════════════════════════ */}
      {activeTab === 'policy-drift' && (
        <PolicyDriftContent />
      )}

      {/* Global toast for actions outside drawer */}
      {showActionToast && !selectedTool && (
        <div className="fixed bottom-4 right-4 z-[60] bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4">
          <Icon name="information-circle" className="w-5 h-5 text-blue-400" />
          <span className="text-sm">{showActionToast}</span>
        </div>
      )}

      {/* Data Source Info Panel */}
      <DataSourceInfo
        pageId="dev-tools"
        pageTitle="Developer AI Tools"
        sources={getPageDataSources('dev-tools')}
      />
    </GovernPageLayout>
  );
}
