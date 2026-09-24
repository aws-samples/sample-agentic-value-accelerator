/**
 * FinosAirView — FINOS AI Risk (AIR) Governance Framework deep-dive view
 *
 * Comprehensive visualization of the FINOS AIR framework for GenAI governance
 * in financial services. Key features:
 * - Three-pillar architecture: AIR-OP (Operational), AIR-SEC (Security), AIR-RC (Regulatory)
 * - Preventative vs Detective mitigations section
 * - Cross-mapping to OWASP LLM Top 10 and MITRE ATLAS
 * - AWS service coverage for each control
 * - Agentic-specific risk highlighting
 * - Financial services context callouts
 * - Auto-detection status indicators
 *
 * Backend-first pattern with graceful degradation to mock data.
 */

import { useState, useMemo } from 'react';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { Icon, type IconName } from './icons';
import { useControlEvaluation } from './useControlEvaluation';
import {
  COMPLIANCE_CENTER_FRAMEWORKS,
  type ComplianceControl,
  type ComplianceFramework,
} from './mockData';

/**
 * A control's autoDetectSource is "live" when the control-evaluation backend
 * returned live AWS data for that source. The evaluator tracks `config-rules`
 * under the `config` key, so normalize that alias before the lookup.
 */
function isEvalSourceLive(
  sources: Record<string, { live: boolean; latency_ms: number }>,
  autoDetectSource?: string,
): boolean {
  if (!autoDetectSource) return false;
  const key = autoDetectSource.toLowerCase() === 'config-rules' ? 'config' : autoDetectSource.toLowerCase();
  return sources[key]?.live === true;
}

// ─────────────────────────── Status & Source Metadata ───────────────────────────

const statusMeta: Record<string, { icon: IconName; badge: string; label: string }> = {
  pass: { icon: 'check', badge: 'bg-emerald-100 text-emerald-700', label: 'Satisfied' },
  'in-progress': { icon: 'exclamation-triangle', badge: 'bg-amber-100 text-amber-700', label: 'In Progress' },
  fail: { icon: 'x-mark', badge: 'bg-rose-100 text-rose-700', label: 'Gap' },
  'not-started': { icon: 'minus', badge: 'bg-slate-100 text-slate-500', label: 'Not Started' },
};

const controlTypeMeta: Record<string, { label: string; cls: string }> = {
  technical: { label: 'Technical', cls: 'bg-blue-100 text-blue-700' },
  'non-technical': { label: 'Non-Tech', cls: 'bg-slate-100 text-slate-600' },
  hybrid: { label: 'Hybrid', cls: 'bg-purple-100 text-purple-700' },
};

const criticalityMeta: Record<string, { label: string; cls: string }> = {
  critical: { label: 'Critical', cls: 'bg-rose-100 text-rose-700 border-rose-300' },
  high: { label: 'High', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  medium: { label: 'Medium', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
  low: { label: 'Low', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

const autoDetectSources: Record<string, { label: string; service: string }> = {
  'bedrock-guardrails': { label: 'Bedrock Guardrails', service: 'Amazon Bedrock' },
  'bedrock-agents': { label: 'Bedrock Agents', service: 'Amazon Bedrock' },
  cloudwatch: { label: 'CloudWatch', service: 'Amazon CloudWatch' },
  cloudtrail: { label: 'CloudTrail', service: 'AWS CloudTrail' },
  iam: { label: 'IAM', service: 'AWS IAM' },
  'secrets-manager': { label: 'Secrets Manager', service: 'AWS Secrets Manager' },
  'api-gateway': { label: 'API Gateway', service: 'Amazon API Gateway' },
  'cost-explorer': { label: 'Cost Explorer', service: 'AWS Cost Explorer' },
};

// ─────────────────────────── Cross-Mapping Tables ───────────────────────────

// ── Key contract for all three tables below ──
//
// Every key MUST be a `ComplianceControl.id` from the `finos-air` entry of
// COMPLIANCE_CENTER_FRAMEWORKS (mockData.ts). All lookups are by id —
// `airToOwaspMapping[ctrl.id]`, `awsServiceCoverage[ctrl.id]` — so a key that no control
// carries does not throw and does not warn. It simply never matches, and the control that
// really does have the mapping falls to the `|| []` default and renders as *"no OWASP
// mapping"* / no ATLAS techniques / "No AWS Coverage". The failure is silent and reads as
// an absence of data rather than a bad key.
//
// 13 keys were dead this way: `AIR-P-###` and `AIR-D-###`. Those prefixes exist in no FINOS
// AIR taxonomy at all — the published 46 controls are 23 risks (AIR-OP 11, AIR-SEC 9,
// AIR-RC 3) and 23 mitigations (AIR-PREV 15, AIR-DET 8), which is exactly what the
// checklist enumerates — so they were not merely unlisted, they were unreachable by
// construction. Re-keyed to the canonical ids using the same by-meaning table the backend
// auto-detector now emits; see the "CONTROL ID CONTRACT" block in
// backend/src/services/govern_compliance_service.py, which is the authority for each pair.
//
// One id is deliberately absent from these tables: the backend still stores an `AIR-D-002`
// attestation from its aws-config scanner, because no FINOS control means "configuration
// compliance monitoring" and inventing one was rejected. That is a *different* measurement
// from the `AIR-D-002` keys that used to sit here, which carried the anomaly-detection /
// spend-alerting sense and belong to AIR-DET-009. The unmappable aws-config row has no
// frontend control to key on, so it gets no entry rather than a dead one.

// FINOS AIR control -> OWASP LLM Top 10 mapping
const airToOwaspMapping: Record<string, string[]> = {
  'AIR-OP-004': ['LLM09:2025 Misinformation'],
  'AIR-OP-016': ['LLM02:2025 Sensitive Information Disclosure'],
  'AIR-OP-020': ['LLM09:2025 Misinformation', 'LLM02:2025 Sensitive Information Disclosure'],
  'AIR-SEC-002': ['LLM08:2025 Vector and Embedding Weaknesses', 'LLM02:2025 Sensitive Information Disclosure'],
  'AIR-SEC-008': ['LLM04:2025 Data and Model Poisoning', 'LLM03:2025 Supply Chain'],
  'AIR-SEC-009': ['LLM04:2025 Data and Model Poisoning'],
  'AIR-SEC-010': ['LLM01:2025 Prompt Injection'],
  'AIR-SEC-024': ['LLM06:2025 Excessive Agency'],
  'AIR-SEC-025': ['LLM06:2025 Excessive Agency', 'LLM05:2025 Improper Output Handling'],
  'AIR-SEC-026': ['LLM03:2025 Supply Chain'],
  'AIR-SEC-029': ['LLM02:2025 Sensitive Information Disclosure', 'LLM07:2025 System Prompt Leakage'],
  'AIR-RC-001': ['LLM02:2025 Sensitive Information Disclosure'],
  // was 'AIR-P-001' — "User/App/Model firewalling and filtering" is the input-side control
  // that blocks injected prompts.
  'AIR-PREV-003': ['LLM01:2025 Prompt Injection'],
  // was 'AIR-P-002' — "AI firewall implementation and management" is where output content
  // filtering lives.
  'AIR-PREV-017': ['LLM05:2025 Improper Output Handling'],
  // was 'AIR-P-005' — "Quality of Service (QoS) and DDoS prevention" is the preventative
  // half of unbounded consumption.
  'AIR-PREV-008': ['LLM10:2025 Unbounded Consumption'],
  // was 'AIR-D-002' — the detective half: "AI system alerting and Denial of Wallet (DoW)
  // spend monitoring". DoW *is* LLM10, so this pairing is unchanged, only reachable now.
  'AIR-DET-009': ['LLM10:2025 Unbounded Consumption'],
};

// FINOS AIR control -> MITRE ATLAS mapping
const airToAtlasMapping: Record<string, string[]> = {
  'AIR-SEC-008': ['AML.TA0003 Resource Development', 'AML.T0020 Poison Model'],
  'AIR-SEC-009': ['AML.T0020 Poison Model', 'AML.TA0001 AI Attack Staging'],
  'AIR-SEC-010': ['AML.T0051 LLM Prompt Injection', 'AML.TA0004 Initial Access'],
  'AIR-SEC-024': ['AML.TA0005 Execution'],
  'AIR-SEC-025': ['AML.T0050 Command Injection', 'AML.TA0005 Execution'],
  'AIR-SEC-027': ['AML.T0010 Persistence', 'AML.TA0011 Impact'],
  'AIR-SEC-029': ['AML.T0056 Extract LLM System Prompt', 'AML.TA0010 Exfiltration'],
  'AIR-OP-004': ['AML.TA0011 Impact'],
  // was 'AIR-D-001' — "AI data leakage prevention and detection" (autoDetectSource
  // 'cloudtrail'); the trail is what makes discovery and exfiltration visible.
  'AIR-DET-001': ['AML.TA0008 Discovery', 'AML.TA0010 Exfiltration'],
  // was 'AIR-D-002' — "AI system alerting and DoW spend monitoring"; alerting on anomalous
  // invocation volume is what surfaces an adversary staging against the model.
  'AIR-DET-009': ['AML.TA0001 AI Attack Staging'],
  // was 'AIR-P-003' — "Role-based access control for AI data" (autoDetectSource 'iam') is
  // what gates model access.
  'AIR-PREV-012': ['AML.TA0000 AI Model Access'],
};

// Agentic-specific risk IDs
const agenticRiskIds = new Set([
  'AIR-OP-028', 'AIR-SEC-024', 'AIR-SEC-025', 'AIR-SEC-026', 'AIR-SEC-027', 'AIR-SEC-029',
]);

// Financial Services context callouts
const fsiContextCallouts: Record<string, string> = {
  'AIR-OP-004': 'Critical for FSI: Inaccurate outputs in lending/trading decisions trigger regulatory scrutiny and potential fair-lending violations.',
  'AIR-OP-016': 'ECOA/FHA compliance: Bias testing mandatory for credit decisions. Document disparate impact analysis.',
  'AIR-OP-018': 'Model scope creep is a common MRM finding. Clear use-case boundaries prevent SR 26-2 violations.',
  'AIR-RC-001': 'GLBA/CCPA data residency requirements. PII must not flow to external model providers without consent.',
  'AIR-RC-022': 'Map to specific regulations: SR 26-2 (MRM), OCC 2011-12 (third-party), NYDFS 500 (cyber).',
  'AIR-SEC-010': 'Prompt injection in trading/advisory systems could trigger unauthorized transactions.',
  'AIR-SEC-024': 'Agent autonomy in FSI requires explicit authorization chains. Cedar policies enforce least-privilege.',
};

// ─────────────────────────── AWS Service Coverage ───────────────────────────

const awsServiceCoverage: Record<string, { services: string[]; coverage: 'full' | 'partial' | 'none' }> = {
  'AIR-OP-004': { services: ['Bedrock Guardrails (contextual grounding)', 'Knowledge Bases'], coverage: 'full' },
  'AIR-OP-005': { services: ['Bedrock Model Registry', 'CloudWatch model versions'], coverage: 'full' },
  'AIR-OP-006': { services: ['Bedrock inference parameters', 'CloudWatch metrics'], coverage: 'full' },
  'AIR-OP-007': { services: ['Multi-region Bedrock', 'Route 53 failover'], coverage: 'full' },
  'AIR-OP-014': { services: ['CloudWatch alarms', 'EventBridge'], coverage: 'partial' },
  'AIR-OP-019': { services: ['CloudWatch', 'SageMaker Model Monitor'], coverage: 'full' },
  'AIR-OP-020': { services: ['Bedrock Guardrails (content filters)'], coverage: 'full' },
  'AIR-SEC-002': { services: ['Knowledge Base access policies', 'IAM', 'VPC endpoints'], coverage: 'full' },
  'AIR-SEC-008': { services: ['Bedrock managed models', 'SageMaker model registry'], coverage: 'full' },
  'AIR-SEC-010': { services: ['Bedrock Guardrails (PROMPT_ATTACK)'], coverage: 'full' },
  'AIR-SEC-024': { services: ['Cedar (Amazon Verified Permissions)', 'IAM'], coverage: 'full' },
  'AIR-SEC-025': { services: ['Bedrock Agents action groups', 'Lambda authorizers'], coverage: 'partial' },
  'AIR-SEC-029': { services: ['Secrets Manager', 'IAM deny policies'], coverage: 'full' },
  'AIR-RC-001': { services: ['Bedrock Guardrails (PII)', 'Macie'], coverage: 'full' },
  // The six below were dead keys. They cost more here than in the two cross-map tables,
  // because the AWS Coverage summary counts this object two different ways: "Full/Partial
  // Coverage" count `Object.values(awsServiceCoverage)` (every entry, real control or not)
  // while "No AWS Coverage" counts `allControls.filter(c => !awsServiceCoverage[c.id])`
  // (only real controls). With six unreachable entries the three cards summed to 52 over a
  // 46-control framework — 18 full + 2 partial + 32 uncovered — and the matrix below listed
  // 14 rows while the cards claimed 20 were covered. Re-keyed, they partition 46 exactly.
  'AIR-PREV-003': { services: ['Bedrock Guardrails', 'API Gateway WAF'], coverage: 'full' },      // was AIR-P-001
  'AIR-PREV-017': { services: ['Bedrock Guardrails (content filters)'], coverage: 'full' },       // was AIR-P-002
  'AIR-PREV-012': { services: ['IAM', 'Cedar', 'VPC endpoints'], coverage: 'full' },              // was AIR-P-003
  'AIR-DET-001': { services: ['CloudTrail', 'Langfuse/OpenTelemetry'], coverage: 'full' },        // was AIR-D-001
  'AIR-DET-009': { services: ['CloudWatch alarms', 'GuardDuty'], coverage: 'full' },              // was AIR-D-002
  'AIR-DET-004': { services: ['CloudWatch', 'SageMaker Model Monitor'], coverage: 'full' },       // was AIR-D-003
};

// ─────────────────────────── Component ───────────────────────────

type ViewMode = 'pillars' | 'mitigations' | 'cross-map' | 'aws-coverage';

interface FinosAirViewProps {
  embedded?: boolean;
  onNavigateToProgram?: () => void;
}

export default function FinosAirView({ embedded = false, onNavigateToProgram }: FinosAirViewProps = {}) {
  const [viewMode, setViewMode] = useState<ViewMode>('pillars');
  const [expandedControl, setExpandedControl] = useState<string | null>(null);
  const [showAgenticOnly, setShowAgenticOnly] = useState(false);

  // Get FINOS AIR framework from mockData
  const finosAir = useMemo(() =>
    COMPLIANCE_CENTER_FRAMEWORKS.find(f => f.id === 'finos-air') as ComplianceFramework | undefined,
  []);

  // Live control evaluation — overlay real AWS pass/fail onto controls whose
  // autoDetectSource the backend evaluated live (bedrock-guardrails, bedrock-agents,
  // cloudwatch, cloudtrail, iam). Controls without a live source keep static status.
  const frameworkControls = useMemo(
    () => (finosAir ? finosAir.categories.flatMap(c => c.controls) : []),
    [finosAir],
  );
  const { sources: evalSources, mergeControl } = useControlEvaluation({ controls: frameworkControls });

  const resolvedCategories = useMemo(
    () =>
      (finosAir?.categories ?? []).map(cat => ({
        ...cat,
        controls: cat.controls.map(c =>
          isEvalSourceLive(evalSources, c.autoDetectSource) ? mergeControl(c) : c,
        ),
      })),
    [finosAir, evalSources, mergeControl],
  );

  // Show the live badge only when at least one control's source returned live data.
  const anyControlLive = useMemo(
    () =>
      (finosAir?.categories ?? []).some(cat =>
        cat.controls.some(c => isEvalSourceLive(evalSources, c.autoDetectSource)),
      ),
    [finosAir, evalSources],
  );

  if (!finosAir) {
    return (
      <div className="text-[12px] text-amber-700 bg-amber-50/70 rounded-xl border border-amber-200 px-5 py-4">
        FINOS AIR framework data not found in compliance center frameworks.
      </div>
    );
  }

  // Categorize pillars vs mitigations (from live-overlaid categories)
  const pillars = resolvedCategories.filter(c =>
    c.name.startsWith('AIR-OP') || c.name.startsWith('AIR-SEC') || c.name.startsWith('AIR-RC'));
  const mitigations = resolvedCategories.filter(c =>
    c.name.includes('Preventative') || c.name.includes('Detective'));

  // Compute stats
  const allControls = resolvedCategories.flatMap(c => c.controls);
  const passedCount = allControls.filter(c => c.status === 'pass').length;
  const inProgressCount = allControls.filter(c => c.status === 'in-progress').length;
  const agenticControls = allControls.filter(c => agenticRiskIds.has(c.id));
  const agenticPassedCount = agenticControls.filter(c => c.status === 'pass').length;
  const autoDetectedCount = allControls.filter(c => c.autoDetectSource).length;
  const technicalCount = allControls.filter(c => c.controlType === 'technical').length;

  // Match the Compliance Center hub denominator: applicable = total − not-started.
  const applicableCount = allControls.filter(c => c.status !== 'not-started').length;
  const conformancePct = applicableCount > 0
    ? Math.round((passedCount / applicableCount) * 100)
    : 0;

  // Filter controls if showing agentic-only
  const filterControls = (controls: ComplianceControl[]) =>
    showAgenticOnly ? controls.filter(c => agenticRiskIds.has(c.id)) : controls;

  const body = (
    <div className="space-y-6">
      {/* View Mode Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        {(['pillars', 'mitigations', 'cross-map', 'aws-coverage'] as ViewMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
              viewMode === mode
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {mode === 'pillars' && 'Three-Pillar View'}
            {mode === 'mitigations' && 'Mitigations'}
            {mode === 'cross-map' && 'OWASP/ATLAS Mapping'}
            {mode === 'aws-coverage' && 'AWS Coverage'}
          </button>
        ))}
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-[10px] text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showAgenticOnly}
            onChange={e => setShowAgenticOnly(e.target.checked)}
            className="rounded border-slate-300"
          />
          Agentic risks only
        </label>
      </div>

      {/* FSI Context Banner - Top prominence */}
      <div className="bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl p-4 border border-emerald-200">
        <div className="flex items-start gap-3">
          <Icon name="building-office" className="w-7 h-7 text-emerald-600 flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-slate-800">Financial Services Context</div>
            <div className="text-[11px] text-slate-600 mt-1">
              FINOS AIR is purpose-built for FSI GenAI governance. Controls map directly to:
              <span className="text-emerald-700 font-medium"> SR 26-2 (MRM)</span>,
              <span className="text-blue-700 font-medium"> OCC 2023-11 (third-party)</span>,
              <span className="text-violet-700 font-medium"> NYDFS 500 (cyber)</span>,
              <span className="text-amber-700 font-medium"> ECOA/FHA (fair lending)</span>.
              Agentic-specific controls address multi-agent trust, tool chains, and MCP server security.
            </div>
          </div>
        </div>
      </div>

      {/* Program Builder Link */}
      {onNavigateToProgram && (
        <div className="flex items-center justify-between bg-violet-50 rounded-xl border border-violet-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="clipboard-document-list" className="w-4 h-4 text-violet-600" />
            <span className="text-sm text-violet-800">Track FINOS AIR controls in your governance program</span>
          </div>
          <button
            onClick={onNavigateToProgram}
            className="text-xs font-medium px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            Add to Program →
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="Total Controls" value={allControls.length} />
        <StatCard label="Satisfied" value={passedCount} variant="success" />
        <StatCard label="In Progress" value={inProgressCount} variant="warning" />
        <StatCard label="Conformance" value={`${conformancePct}%`} variant="info" />
        <StatCard
          label="Agentic Risks"
          value={`${agenticPassedCount}/${agenticControls.length}`}
          variant={agenticPassedCount === agenticControls.length ? 'success' : 'warning'}
          sub="multi-agent, tools, MCP"
        />
        <StatCard
          label="Auto-Detected"
          value={autoDetectedCount}
          variant="info"
          sub={`${technicalCount} technical controls`}
        />
      </div>

      {/* Three-Pillar View */}
      {viewMode === 'pillars' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {pillars.map(pillar => {
            const pillarKey = pillar.name.split(':')[0];
            const pillarColor = pillarKey === 'AIR-OP' ? 'emerald' : pillarKey === 'AIR-SEC' ? 'rose' : 'blue';
            const filteredControls = filterControls(pillar.controls);
            const pillarPassed = filteredControls.filter(c => c.status === 'pass').length;
            const pillarApplicable = filteredControls.filter(c => c.status !== 'not-started').length;
            const pillarPct = pillarApplicable > 0
              ? Math.round((pillarPassed / pillarApplicable) * 100)
              : 0;

            return (
              <div key={pillar.name} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                {/* Pillar Header */}
                <div className={`px-4 py-3 border-b border-slate-100 bg-gradient-to-r ${
                  pillarColor === 'emerald' ? 'from-emerald-50 to-transparent' :
                  pillarColor === 'rose' ? 'from-rose-50 to-transparent' :
                  'from-blue-50 to-transparent'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${
                        pillarColor === 'emerald' ? 'text-emerald-600' :
                        pillarColor === 'rose' ? 'text-rose-600' :
                        'text-blue-600'
                      }`}>
                        {pillarKey}
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {pillar.name.split(': ')[1]}
                      </div>
                    </div>
                    <div className={`text-xl font-bold ${
                      pillarPct >= 90 ? 'text-emerald-600' :
                      pillarPct >= 70 ? 'text-amber-600' :
                      'text-rose-600'
                    }`}>
                      {pillarPct}%
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                  {filteredControls.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[11px] text-slate-400">
                      No agentic-specific controls in this pillar
                    </div>
                  ) : filteredControls.map(ctrl => (
                    <ControlRow
                      key={ctrl.id}
                      control={ctrl}
                      expanded={expandedControl === ctrl.id}
                      onToggle={() => setExpandedControl(expandedControl === ctrl.id ? null : ctrl.id)}
                      isAgentic={agenticRiskIds.has(ctrl.id)}
                      isLive={isEvalSourceLive(evalSources, ctrl.autoDetectSource)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mitigations View */}
      {viewMode === 'mitigations' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mitigations.map(cat => {
            const isPreventative = cat.name.includes('Preventative');
            const filteredControls = filterControls(cat.controls);

            return (
              <div key={cat.name} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                <div className={`px-4 py-3 border-b border-slate-100 ${
                  isPreventative ? 'bg-violet-50' : 'bg-cyan-50'
                }`}>
                  <div className="flex items-center gap-2">
                    <Icon
                      name={isPreventative ? 'shield-check' : 'magnifying-glass'}
                      className={`w-5 h-5 ${isPreventative ? 'text-violet-600' : 'text-cyan-600'}`}
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{cat.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {isPreventative
                          ? 'Controls that prevent risks before they materialize'
                          : 'Controls that detect issues after they occur'
                        }
                      </div>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredControls.map(ctrl => (
                    <ControlRow
                      key={ctrl.id}
                      control={ctrl}
                      expanded={expandedControl === ctrl.id}
                      onToggle={() => setExpandedControl(expandedControl === ctrl.id ? null : ctrl.id)}
                      isAgentic={agenticRiskIds.has(ctrl.id)}
                      isLive={isEvalSourceLive(evalSources, ctrl.autoDetectSource)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cross-Mapping View */}
      {viewMode === 'cross-map' && (
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex items-center gap-4 text-[10px]">
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-100 border border-red-300" />
              <span className="text-slate-600">OWASP LLM Top 10</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-pink-100 border border-pink-300" />
              <span className="text-slate-600">MITRE ATLAS</span>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <div className="text-sm font-semibold text-slate-900">FINOS AIR to Security Framework Mapping</div>
              <div className="text-[10px] text-slate-500">Controls mapped to OWASP LLM Top 10 (2025) and MITRE ATLAS</div>
            </div>
            <div className="divide-y divide-slate-100">
              {allControls
                .filter(c => airToOwaspMapping[c.id] || airToAtlasMapping[c.id])
                .filter(c => !showAgenticOnly || agenticRiskIds.has(c.id))
                .map(ctrl => {
                  const owasp = airToOwaspMapping[ctrl.id] || [];
                  const atlas = airToAtlasMapping[ctrl.id] || [];
                  const sm = statusMeta[ctrl.status] ?? statusMeta['not-started'];

                  return (
                    <div key={ctrl.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className={`text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${sm.badge}`}>
                          <Icon name={sm.icon} className="w-3 h-3" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold text-slate-800">{ctrl.id}</span>
                            {agenticRiskIds.has(ctrl.id) && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200">
                                Agentic
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-600 mt-0.5">{ctrl.label}</div>

                          {/* OWASP mappings */}
                          {owasp.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {owasp.map(o => (
                                <span key={o} className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                                  {o}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* ATLAS mappings */}
                          {atlas.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {atlas.map(a => (
                                <span key={a} className="text-[9px] px-1.5 py-0.5 rounded bg-pink-50 text-pink-700 border border-pink-200">
                                  {a}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* AWS Coverage View */}
      {viewMode === 'aws-coverage' && (
        <div className="space-y-4">
          {/* Coverage Summary */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Full Coverage"
              value={Object.values(awsServiceCoverage).filter(c => c.coverage === 'full').length}
              variant="success"
              sub="AWS services fully address"
            />
            <StatCard
              label="Partial Coverage"
              value={Object.values(awsServiceCoverage).filter(c => c.coverage === 'partial').length}
              variant="warning"
              sub="requires supplemental tooling"
            />
            <StatCard
              label="No AWS Coverage"
              value={allControls.filter(c => !awsServiceCoverage[c.id]).length}
              variant="muted"
              sub="non-technical or custom"
            />
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <div className="text-sm font-semibold text-slate-900">AWS Service Coverage Matrix</div>
              <div className="text-[10px] text-slate-500">Which Bedrock/AWS services satisfy each FINOS AIR control</div>
            </div>
            <div className="divide-y divide-slate-100">
              {allControls
                .filter(c => awsServiceCoverage[c.id])
                .filter(c => !showAgenticOnly || agenticRiskIds.has(c.id))
                .map(ctrl => {
                  const coverage = awsServiceCoverage[ctrl.id];
                  const sm = statusMeta[ctrl.status] ?? statusMeta['not-started'];

                  return (
                    <div key={ctrl.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className={`text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${sm.badge}`}>
                          <Icon name={sm.icon} className="w-3 h-3" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold text-slate-800">{ctrl.id}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                              coverage.coverage === 'full' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {coverage.coverage === 'full' ? 'Full' : 'Partial'} Coverage
                            </span>
                            {ctrl.autoDetectSource && (
                              <span className="flex items-center gap-1">
                                {isEvalSourceLive(evalSources, ctrl.autoDetectSource)
                                  ? <LiveDataBadge source="AWS control evaluation" />
                                  : <MockDataBadge integration="FINOS AIR controls" />}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-600 mt-0.5">{ctrl.label}</div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {coverage.services.map(svc => (
                              <span key={svc} className="text-[9px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">
                                {svc}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* AWS Services Legend */}
          <div className="bg-slate-50/80 rounded-xl border border-slate-200/60 p-4">
            <div className="text-[11px] font-semibold text-slate-700 mb-2">AWS Services for FINOS AIR Compliance</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
              <div>
                <div className="font-medium text-slate-700">Amazon Bedrock</div>
                <ul className="text-slate-500 mt-1 space-y-0.5">
                  <li>Guardrails (content safety, PII, prompt injection)</li>
                  <li>Agents (action groups, tool authorization)</li>
                  <li>Knowledge Bases (RAG, grounding)</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-slate-700">Security & Identity</div>
                <ul className="text-slate-500 mt-1 space-y-0.5">
                  <li>IAM (least privilege)</li>
                  <li>Verified Permissions (Cedar policies)</li>
                  <li>Secrets Manager</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-slate-700">Observability</div>
                <ul className="text-slate-500 mt-1 space-y-0.5">
                  <li>CloudWatch (metrics, alarms)</li>
                  <li>CloudTrail (audit logging)</li>
                  <li>X-Ray (tracing)</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-slate-700">Data & Compliance</div>
                <ul className="text-slate-500 mt-1 space-y-0.5">
                  <li>Macie (data discovery)</li>
                  <li>Config (compliance rules)</li>
                  <li>Security Hub (posture)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );

  // Hoisted so the embedded path can render it too. Dropping the badge when embedded left
  // this view sitting under ComplianceCenter's page-level provenance claim rather than its
  // own - a framework whose controls are seeded would inherit a Live header.
  const badge = anyControlLive
    ? <LiveDataBadge source="AWS control evaluation" detail="Controls with an auto-detect source (Bedrock Guardrails, Bedrock Agents, CloudWatch, CloudTrail, IAM) evaluated live against AWS; other controls remain illustrative." />
    : <MockDataBadge integration="FINOS AIR controls - illustrative; integrate control-plane backend for persistence" />;

  if (embedded) return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">{badge}</div>
      {body}
    </div>
  );

  return (
    <GovernPageLayout
      title="FINOS AI Governance Framework"
      description="Comprehensive AI Risk (AIR) framework for GenAI in financial services - three-pillar architecture (Operational, Security, Regulatory) with cross-mapping to OWASP LLM Top 10 and MITRE ATLAS."
      badge={badge}
    >
      {body}
    </GovernPageLayout>
  );
}

// ─────────────────────────── Control Row Component ───────────────────────────

interface ControlRowProps {
  control: ComplianceControl;
  expanded: boolean;
  onToggle: () => void;
  isAgentic: boolean;
  /** True when this control's autoDetectSource returned live AWS data. */
  isLive?: boolean;
}

function ControlRow({ control, expanded, onToggle, isAgentic, isLive = false }: ControlRowProps) {
  const sm = statusMeta[control.status] ?? statusMeta['not-started'];
  const ctm = controlTypeMeta[control.controlType || 'non-technical'];
  const crit = control.criticality ? criticalityMeta[control.criticality] : null;
  const autoSrc = control.autoDetectSource ? autoDetectSources[control.autoDetectSource] : null;
  const fsiContext = fsiContextCallouts[control.id];
  const owaspLinks = airToOwaspMapping[control.id] || [];
  const atlasLinks = airToAtlasMapping[control.id] || [];
  const awsCoverage = awsServiceCoverage[control.id];

  return (
    <div className="px-4 py-3">
      <button
        onClick={onToggle}
        className="w-full text-left flex items-start gap-3"
      >
        <span className={`text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${sm.badge}`}>
          <Icon name={sm.icon} className="w-3 h-3" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-800">{control.id}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${ctm.cls}`}>{ctm.label}</span>
            {crit && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded border ${crit.cls}`}>{crit.label}</span>
            )}
            {isAgentic && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200">
                Agentic
              </span>
            )}
            {autoSrc && (
              <span className="flex items-center gap-1">
                {isLive
                  ? <LiveDataBadge source="AWS control evaluation" />
                  : <MockDataBadge integration="FINOS AIR controls" />}
                <span className="text-[9px] text-slate-500">{autoSrc.label}</span>
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-600 mt-0.5">{control.label}</div>
          {control.evidence && (
            <div className="text-[9px] text-slate-400 mt-0.5">Evidence: {control.evidence}</div>
          )}
        </div>
        <Icon
          name="chevron-down"
          className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="mt-3 ml-8 space-y-3">
          {/* Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
            <div>
              <div className="text-slate-400">Status</div>
              <div className="font-medium text-slate-700">{sm.label}</div>
            </div>
            <div>
              <div className="text-slate-400">Owner</div>
              <div className="font-medium text-slate-700">{control.owner || 'Unassigned'}</div>
            </div>
            <div>
              <div className="text-slate-400">Control Type</div>
              <div className="font-medium text-slate-700">{ctm.label}</div>
            </div>
            {control.dueDate && (
              <div>
                <div className="text-slate-400">Due Date</div>
                <div className="font-medium text-slate-700">{control.dueDate}</div>
              </div>
            )}
          </div>

          {/* FSI Context */}
          {fsiContext && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <div className="text-[10px] font-semibold text-amber-800">FSI Context</div>
              <div className="text-[10px] text-amber-700 mt-0.5">{fsiContext}</div>
            </div>
          )}

          {/* AWS Coverage */}
          {awsCoverage && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5">
              <div className="text-[10px] font-semibold text-orange-800 flex items-center gap-2">
                AWS Coverage
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                  awsCoverage.coverage === 'full' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {awsCoverage.coverage === 'full' ? 'Full' : 'Partial'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {awsCoverage.services.map(svc => (
                  <span key={svc} className="text-[9px] px-1.5 py-0.5 rounded bg-white text-orange-700 border border-orange-200">
                    {svc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Cross-mappings */}
          {(owaspLinks.length > 0 || atlasLinks.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {owaspLinks.length > 0 && (
                <div className="text-[10px]">
                  <span className="text-slate-400">OWASP: </span>
                  {owaspLinks.map(o => (
                    <span key={o} className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 mr-1">
                      {o}
                    </span>
                  ))}
                </div>
              )}
              {atlasLinks.length > 0 && (
                <div className="text-[10px]">
                  <span className="text-slate-400">ATLAS: </span>
                  {atlasLinks.map(a => (
                    <span key={a} className="text-[9px] px-1.5 py-0.5 rounded bg-pink-50 text-pink-700 border border-pink-200 mr-1">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
