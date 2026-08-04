/**
 * NistAiRmfView — NIST AI Risk Management Framework deep-dive view.
 *
 * Comprehensive view of NIST AI RMF 1.0 implementation status showing the
 * four-function lifecycle (Govern -> Map -> Measure -> Manage) as a visual
 * pipeline. Each function displays its controls with status, AWS service
 * mappings for automated detection, and evidence links. The hero element is
 * the horizontal lifecycle visualization showing overall compliance by function.
 *
 * Key features:
 * - Visual lifecycle pipeline (Govern/Map/Measure/Manage horizontal flow)
 * - Per-function compliance scores with expandable control details
 * - AWS service mapping showing which services satisfy each control
 * - Live detection status (auto-detected vs manual attestation)
 * - Overall RMF compliance score and trend
 * - Evidence links for audit trail
 * - Supports `embedded` prop for ComplianceCenter integration
 */
import { useState, useMemo } from 'react';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';

// ─────────────────────────── Types ───────────────────────────

interface NistControl {
  id: string;
  label: string;
  status: 'pass' | 'in-progress' | 'fail' | 'not-started';
  evidence?: string;
  awsServices?: AwsServiceMapping[];
  detectionType: 'auto' | 'manual' | 'hybrid';
  subcategory?: string;
  description?: string;
}

interface AwsServiceMapping {
  service: string;
  icon: string;
  description: string;
  status: 'active' | 'configured' | 'pending';
}

interface NistFunction {
  key: 'govern' | 'map' | 'measure' | 'manage';
  name: string;
  shortName: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  controls: NistControl[];
}

// ─────────────────────────── AWS Service Mappings ───────────────────────────

const AWS_SERVICE_ICONS: Record<string, string> = {
  'Bedrock Guardrails': 'shield-check',
  'CloudWatch': 'chart-bar',
  'CloudTrail': 'document-text',
  'Config': 'cog',
  'Security Hub': 'shield-exclamation',
  'IAM': 'key',
  'S3': 'archive-box',
  'Lambda': 'bolt',
  'Step Functions': 'squares-2x2',
  'SageMaker': 'cpu-chip',
  'Bedrock': 'sparkles',
  'Cost Explorer': 'currency-dollar',
  'EventBridge': 'signal',
  'SNS': 'bell',
};

// Enhanced control data with AWS service mappings
const NIST_FUNCTIONS: NistFunction[] = [
  {
    key: 'govern',
    name: 'Govern',
    shortName: 'GV',
    description: 'Establish and maintain governance structures for AI risk management',
    color: 'text-violet-700',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    icon: 'building-office',
    controls: [
      {
        id: 'GV-1.1',
        label: 'AI policies and procedures documented',
        status: 'pass',
        evidence: 'Policy Center v2.3',
        detectionType: 'manual',
        subcategory: 'Policies',
        description: 'Organizational AI governance policies are established, documented, and communicated.',
        awsServices: [
          { service: 'S3', icon: 'archive-box', description: 'Policy document storage', status: 'active' },
          { service: 'Config', icon: 'cog', description: 'Policy compliance rules', status: 'configured' },
        ],
      },
      {
        id: 'GV-1.4',
        label: 'Accountability for AI risk defined',
        status: 'pass',
        evidence: 'RACI matrix - MRM',
        detectionType: 'manual',
        subcategory: 'Accountability',
        description: 'Roles, responsibilities, and authorities for AI risk management are defined and assigned.',
        awsServices: [
          { service: 'IAM', icon: 'key', description: 'Role-based access control', status: 'active' },
        ],
      },
      {
        id: 'GV-3.2',
        label: 'Workforce trained on AI risk',
        status: 'in-progress',
        evidence: '78% of required roles',
        detectionType: 'manual',
        subcategory: 'Training',
        description: 'Personnel with AI-related responsibilities are trained appropriately.',
      },
      {
        id: 'GV-1.6',
        label: 'AI system inventory maintained',
        status: 'pass',
        evidence: 'Model Inventory',
        detectionType: 'auto',
        subcategory: 'Inventory',
        description: 'AI systems and their contexts are inventoried and documented.',
        awsServices: [
          { service: 'Bedrock', icon: 'sparkles', description: 'Foundation model catalog', status: 'active' },
          { service: 'SageMaker', icon: 'cpu-chip', description: 'Custom model registry', status: 'active' },
          { service: 'Config', icon: 'cog', description: 'Resource inventory', status: 'active' },
        ],
      },
      {
        id: 'GV-2.1',
        label: 'AI risk management integrated into ERM',
        status: 'pass',
        evidence: 'ERM integration doc',
        detectionType: 'manual',
        subcategory: 'ERM Integration',
        description: 'AI risk management is integrated into broader enterprise risk management.',
      },
    ],
  },
  {
    key: 'map',
    name: 'Map',
    shortName: 'MP',
    description: 'Identify and analyze AI system context, capabilities, and risks',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: 'map',
    controls: [
      {
        id: 'MP-1.1',
        label: 'Intended use and context documented',
        status: 'pass',
        evidence: 'Use case intake forms',
        detectionType: 'manual',
        subcategory: 'Context',
        description: 'The business value, intended purpose, and deployment context are defined.',
      },
      {
        id: 'MP-3.1',
        label: 'AI capabilities and limitations mapped',
        status: 'pass',
        evidence: 'Model cards',
        detectionType: 'hybrid',
        subcategory: 'Capabilities',
        description: 'AI system capabilities and limitations are understood and documented.',
        awsServices: [
          { service: 'Bedrock', icon: 'sparkles', description: 'Model metadata & capabilities', status: 'active' },
          { service: 'SageMaker', icon: 'cpu-chip', description: 'Model cards registry', status: 'active' },
        ],
      },
      {
        id: 'MP-4.1',
        label: 'Impact assessment performed',
        status: 'in-progress',
        evidence: '31 of 34 agents assessed',
        detectionType: 'manual',
        subcategory: 'Impact',
        description: 'Potential impacts of AI systems on individuals and communities are assessed.',
      },
      {
        id: 'MP-2.3',
        label: 'Stakeholders identified and engaged',
        status: 'pass',
        evidence: 'Stakeholder registry',
        detectionType: 'manual',
        subcategory: 'Stakeholders',
        description: 'Relevant stakeholders are identified and engaged throughout the AI lifecycle.',
      },
      {
        id: 'MP-5.1',
        label: 'Third-party AI risks assessed',
        status: 'in-progress',
        evidence: 'Vendor assessment Q2',
        detectionType: 'manual',
        subcategory: 'Third Party',
        description: 'Risks from third-party AI components and services are assessed.',
        awsServices: [
          { service: 'Security Hub', icon: 'shield-exclamation', description: 'Third-party findings', status: 'configured' },
        ],
      },
    ],
  },
  {
    key: 'measure',
    name: 'Measure',
    shortName: 'MS',
    description: 'Assess, analyze, and track AI risks through metrics and testing',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: 'chart-bar',
    controls: [
      {
        id: 'MS-1.1',
        label: 'Performance metrics defined',
        status: 'pass',
        evidence: 'Eval harness configured',
        detectionType: 'auto',
        subcategory: 'Metrics',
        description: 'Appropriate metrics for AI system performance are defined and tracked.',
        awsServices: [
          { service: 'CloudWatch', icon: 'chart-bar', description: 'Runtime metrics & dashboards', status: 'active' },
          { service: 'Bedrock', icon: 'sparkles', description: 'Model evaluation jobs', status: 'active' },
        ],
      },
      {
        id: 'MS-2.3',
        label: 'Bias testing conducted',
        status: 'pass',
        evidence: 'Quarterly bias reports',
        detectionType: 'hybrid',
        subcategory: 'Bias',
        description: 'AI systems are tested for biases that could lead to discrimination.',
        awsServices: [
          { service: 'SageMaker', icon: 'cpu-chip', description: 'Clarify bias detection', status: 'active' },
          { service: 'Bedrock', icon: 'sparkles', description: 'Responsible AI evaluations', status: 'configured' },
        ],
      },
      {
        id: 'MS-2.7',
        label: 'Robustness and adversarial testing',
        status: 'in-progress',
        evidence: 'Red-team engagement in flight',
        detectionType: 'manual',
        subcategory: 'Robustness',
        description: 'AI systems are tested for robustness against adversarial inputs.',
        awsServices: [
          { service: 'Bedrock Guardrails', icon: 'shield-check', description: 'Prompt injection protection', status: 'active' },
        ],
      },
      {
        id: 'MS-3.2',
        label: 'Human oversight effectiveness measured',
        status: 'fail',
        evidence: 'No signal captured yet',
        detectionType: 'hybrid',
        subcategory: 'Oversight',
        description: 'The effectiveness of human oversight mechanisms is measured.',
        awsServices: [
          { service: 'CloudTrail', icon: 'document-text', description: 'Override audit logs', status: 'pending' },
        ],
      },
      {
        id: 'MS-1.3',
        label: 'Continuous monitoring active',
        status: 'pass',
        evidence: 'Langfuse + CloudWatch',
        detectionType: 'auto',
        subcategory: 'Monitoring',
        description: 'AI system performance is continuously monitored in production.',
        awsServices: [
          { service: 'CloudWatch', icon: 'chart-bar', description: 'Real-time monitoring', status: 'active' },
          { service: 'EventBridge', icon: 'signal', description: 'Anomaly detection events', status: 'active' },
        ],
      },
    ],
  },
  {
    key: 'manage',
    name: 'Manage',
    shortName: 'MG',
    description: 'Prioritize and act on AI risks through controls and response plans',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: 'adjustments-horizontal',
    controls: [
      {
        id: 'MG-1.1',
        label: 'Incident response plan in place',
        status: 'pass',
        evidence: 'IR playbook v4',
        detectionType: 'manual',
        subcategory: 'Incident Response',
        description: 'Plans are in place for responding to AI-related incidents.',
        awsServices: [
          { service: 'SNS', icon: 'bell', description: 'Alert notifications', status: 'active' },
          { service: 'Step Functions', icon: 'squares-2x2', description: 'Automated response workflows', status: 'configured' },
        ],
      },
      {
        id: 'MG-3.1',
        label: 'Continuous monitoring active',
        status: 'pass',
        evidence: 'Langfuse + Observability',
        detectionType: 'auto',
        subcategory: 'Monitoring',
        description: 'AI risks are continuously monitored and managed.',
        awsServices: [
          { service: 'CloudWatch', icon: 'chart-bar', description: 'Risk dashboards', status: 'active' },
          { service: 'Security Hub', icon: 'shield-exclamation', description: 'Security posture', status: 'active' },
        ],
      },
      {
        id: 'MG-4.1',
        label: 'Decommissioning procedure defined',
        status: 'in-progress',
        evidence: 'Runbook v0.3 draft',
        detectionType: 'manual',
        subcategory: 'Lifecycle',
        description: 'Procedures exist for safely decommissioning AI systems.',
      },
      {
        id: 'MG-2.1',
        label: 'Risk treatment plans documented',
        status: 'pass',
        evidence: 'Risk register',
        detectionType: 'manual',
        subcategory: 'Treatment',
        description: 'Risk treatment strategies are documented and implemented.',
      },
      {
        id: 'MG-2.4',
        label: 'Human override mechanisms available',
        status: 'pass',
        evidence: 'Kill-switch documented',
        detectionType: 'hybrid',
        subcategory: 'Override',
        description: 'Mechanisms for human override and intervention are available.',
        awsServices: [
          { service: 'Lambda', icon: 'bolt', description: 'Emergency shutdown triggers', status: 'active' },
          { service: 'CloudTrail', icon: 'document-text', description: 'Override audit logging', status: 'active' },
        ],
      },
    ],
  },
];

// ─────────────────────────── Status Metadata ───────────────────────────

const statusMeta: Record<string, { icon: string; label: string; badge: string }> = {
  pass: { icon: 'check', label: 'Compliant', badge: 'bg-emerald-100 text-emerald-700' },
  'in-progress': { icon: 'clock', label: 'In Progress', badge: 'bg-amber-100 text-amber-700' },
  fail: { icon: 'x-mark', label: 'Gap', badge: 'bg-rose-100 text-rose-700' },
  'not-started': { icon: 'minus', label: 'Not Started', badge: 'bg-slate-100 text-slate-500' },
};

const detectionMeta: Record<string, { label: string; badge: string; description: string }> = {
  auto: { label: 'Auto', badge: 'bg-emerald-50 text-emerald-600 border-emerald-200', description: 'Automatically detected via AWS services' },
  manual: { label: 'Manual', badge: 'bg-slate-50 text-slate-600 border-slate-200', description: 'Requires manual attestation' },
  hybrid: { label: 'Hybrid', badge: 'bg-blue-50 text-blue-600 border-blue-200', description: 'Partially automated, partially manual' },
};

const awsStatusMeta: Record<string, { dot: string; label: string }> = {
  active: { dot: 'bg-emerald-500', label: 'Active' },
  configured: { dot: 'bg-blue-500', label: 'Configured' },
  pending: { dot: 'bg-amber-400', label: 'Pending' },
};

// ─────────────────────────── Helper Functions ───────────────────────────

function computeFunctionStats(func: NistFunction) {
  const total = func.controls.length;
  const passed = func.controls.filter(c => c.status === 'pass').length;
  const inProgress = func.controls.filter(c => c.status === 'in-progress').length;
  const failed = func.controls.filter(c => c.status === 'fail').length;
  const autoDetected = func.controls.filter(c => c.detectionType === 'auto' || c.detectionType === 'hybrid').length;
  const compliancePct = total > 0 ? Math.round((passed / total) * 100) : 0;
  return { total, passed, inProgress, failed, autoDetected, compliancePct };
}

function computeOverallStats(functions: NistFunction[]) {
  const allControls = functions.flatMap(f => f.controls);
  const total = allControls.length;
  const passed = allControls.filter(c => c.status === 'pass').length;
  const inProgress = allControls.filter(c => c.status === 'in-progress').length;
  const failed = allControls.filter(c => c.status === 'fail').length;
  const autoDetected = allControls.filter(c => c.detectionType === 'auto' || c.detectionType === 'hybrid').length;
  const compliancePct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const automationPct = total > 0 ? Math.round((autoDetected / total) * 100) : 0;
  return { total, passed, inProgress, failed, autoDetected, compliancePct, automationPct };
}

// ─────────────────────────── Component ───────────────────────────

interface NistAiRmfViewProps {
  embedded?: boolean;
  onNavigateToProgram?: () => void;
}

export default function NistAiRmfView({ embedded = false, onNavigateToProgram }: NistAiRmfViewProps) {
  const [expandedFunctions, setExpandedFunctions] = useState<Set<string>>(new Set(['govern']));
  const [expandedControls, setExpandedControls] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const overallStats = useMemo(() => computeOverallStats(NIST_FUNCTIONS), []);

  const toggleFunction = (key: string) => {
    const next = new Set(expandedFunctions);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedFunctions(next);
  };

  const toggleControl = (id: string) => {
    const next = new Set(expandedControls);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedControls(next);
  };

  const filteredFunctions = useMemo(() => {
    if (filterStatus === 'all') return NIST_FUNCTIONS;
    return NIST_FUNCTIONS.map(f => ({
      ...f,
      controls: f.controls.filter(c => c.status === filterStatus),
    })).filter(f => f.controls.length > 0);
  }, [filterStatus]);

  const body = (
    <div className="space-y-6">
      {/* Hero: Lifecycle Pipeline Visualization */}
      <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl border border-slate-200/60 shadow-sm p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">NIST AI RMF Lifecycle</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Four-function risk management process with live compliance status</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900">{overallStats.compliancePct}%</div>
              <div className="text-[10px] text-slate-500">Overall Compliance</div>
            </div>
          </div>
        </div>

        {/* Pipeline visualization */}
        <div className="relative">
          {/* Connection line */}
          <div className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-violet-200 via-blue-200 via-emerald-200 to-orange-200 -translate-y-1/2 rounded-full hidden md:block" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative">
            {NIST_FUNCTIONS.map((func, idx) => {
              const stats = computeFunctionStats(func);
              const isExpanded = expandedFunctions.has(func.key);
              return (
                <button
                  key={func.key}
                  onClick={() => toggleFunction(func.key)}
                  className={`relative p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                    isExpanded
                      ? `${func.bgColor} ${func.borderColor} shadow-md`
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Step number */}
                  <div className={`absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isExpanded ? `${func.bgColor} ${func.color} border-2 ${func.borderColor}` : 'bg-slate-100 text-slate-600 border-2 border-slate-200'
                  }`}>
                    {idx + 1}
                  </div>

                  {/* Function name and icon */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isExpanded ? func.bgColor : 'bg-slate-100'
                    }`}>
                      <span className={`text-lg ${isExpanded ? func.color : 'text-slate-500'}`}>
                        {func.key === 'govern' && 'G'}
                        {func.key === 'map' && 'M'}
                        {func.key === 'measure' && 'S'}
                        {func.key === 'manage' && 'A'}
                      </span>
                    </div>
                    <div className="text-left">
                      <div className={`text-sm font-semibold ${isExpanded ? func.color : 'text-slate-700'}`}>
                        {func.name}
                      </div>
                      <div className="text-[10px] text-slate-500">{func.shortName}</div>
                    </div>
                  </div>

                  {/* Compliance meter */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-slate-500">Compliance</span>
                      <span className={`font-semibold ${
                        stats.compliancePct >= 80 ? 'text-emerald-600' :
                        stats.compliancePct >= 50 ? 'text-amber-600' : 'text-rose-600'
                      }`}>{stats.compliancePct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          stats.compliancePct >= 80 ? 'bg-emerald-500' :
                          stats.compliancePct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${stats.compliancePct}%` }}
                      />
                    </div>
                  </div>

                  {/* Control summary */}
                  <div className="flex items-center justify-center gap-3 text-[9px]">
                    <span className="text-emerald-600 font-medium">{stats.passed} pass</span>
                    <span className="text-amber-600 font-medium">{stats.inProgress} prog</span>
                    {stats.failed > 0 && <span className="text-rose-600 font-medium">{stats.failed} gap</span>}
                  </div>

                  {/* Expand indicator */}
                  <div className={`absolute bottom-2 right-2 w-4 h-4 flex items-center justify-center text-slate-400 transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Program Builder Link */}
      {onNavigateToProgram && (
        <div className="flex items-center justify-between bg-violet-50 rounded-xl border border-violet-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-violet-600 text-sm">📋</span>
            <span className="text-sm text-violet-800">Track NIST AI RMF controls in your governance program</span>
          </div>
          <button
            onClick={onNavigateToProgram}
            className="text-xs font-medium px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            Add to Program →
          </button>
        </div>
      )}

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="Total Controls" value={overallStats.total} />
        <StatCard label="Compliant" value={overallStats.passed} variant="success" />
        <StatCard label="In Progress" value={overallStats.inProgress} variant="warning" />
        <StatCard label="Gaps" value={overallStats.failed} variant={overallStats.failed > 0 ? 'danger' : 'muted'} />
        <StatCard label="Compliance" value={`${overallStats.compliancePct}%`} variant="info" />
        <StatCard label="Auto-Detected" value={`${overallStats.automationPct}%`} variant="success" sub="via AWS services" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-4 bg-white/80 rounded-xl border border-slate-200/60 px-4 py-2.5">
        <span className="text-[11px] text-slate-500 font-medium">Filter by status:</span>
        <div className="flex items-center gap-2">
          {[
            { value: 'all', label: 'All' },
            { value: 'pass', label: 'Compliant' },
            { value: 'in-progress', label: 'In Progress' },
            { value: 'fail', label: 'Gaps' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`text-[10px] px-2.5 py-1 rounded-lg transition-colors ${
                filterStatus === opt.value
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Auto
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Hybrid
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Manual
          </span>
        </div>
      </div>

      {/* Function Detail Panels */}
      {filteredFunctions.map(func => {
        const isExpanded = expandedFunctions.has(func.key);
        const stats = computeFunctionStats(func);

        return (
          <div
            key={func.key}
            className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm overflow-hidden transition-all ${
              isExpanded ? func.borderColor : 'border-slate-200/60'
            }`}
          >
            {/* Function header */}
            <button
              onClick={() => toggleFunction(func.key)}
              className={`w-full px-5 py-3 flex items-center gap-4 hover:bg-slate-50/50 transition-colors ${
                isExpanded ? func.bgColor : ''
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isExpanded ? `${func.bgColor} border ${func.borderColor}` : 'bg-slate-100'
              }`}>
                <span className={`text-xl font-bold ${isExpanded ? func.color : 'text-slate-500'}`}>
                  {func.shortName}
                </span>
              </div>
              <div className="flex-1 text-left">
                <div className={`text-sm font-semibold ${isExpanded ? func.color : 'text-slate-900'}`}>
                  {func.name}
                </div>
                <div className="text-[10px] text-slate-500">{func.description}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className={`text-lg font-bold ${
                    stats.compliancePct >= 80 ? 'text-emerald-600' :
                    stats.compliancePct >= 50 ? 'text-amber-600' : 'text-rose-600'
                  }`}>{stats.compliancePct}%</div>
                  <div className="text-[9px] text-slate-500">{stats.passed}/{stats.total} controls</div>
                </div>
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Controls list */}
            {isExpanded && (
              <div className="border-t border-slate-100 divide-y divide-slate-100">
                {func.controls.map(ctrl => {
                  const sm = statusMeta[ctrl.status];
                  const dm = detectionMeta[ctrl.detectionType];
                  const isControlExpanded = expandedControls.has(ctrl.id);

                  return (
                    <div key={ctrl.id} className="px-5 py-3">
                      {/* Control row */}
                      <div className="flex items-start gap-3">
                        {/* Status icon */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${sm.badge}`}>
                          {ctrl.status === 'pass' && <span className="text-[11px] font-bold">+</span>}
                          {ctrl.status === 'in-progress' && <span className="text-[11px] font-bold">!</span>}
                          {ctrl.status === 'fail' && <span className="text-[11px] font-bold">-</span>}
                          {ctrl.status === 'not-started' && <span className="text-[11px] font-bold">=</span>}
                        </div>

                        {/* Control info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold text-slate-800">{ctrl.id}</span>
                            <span className="text-[11px] text-slate-700">{ctrl.label}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${dm.badge}`} title={dm.description}>
                              {dm.label}
                            </span>
                            {ctrl.subcategory && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                {ctrl.subcategory}
                              </span>
                            )}
                          </div>
                          {ctrl.evidence && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Evidence: <span className="text-slate-600">{ctrl.evidence}</span>
                            </div>
                          )}
                        </div>

                        {/* Expand button for AWS services */}
                        {ctrl.awsServices && ctrl.awsServices.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleControl(ctrl.id); }}
                            className="text-[10px] text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          >
                            <span>{ctrl.awsServices.length} AWS service{ctrl.awsServices.length > 1 ? 's' : ''}</span>
                            <svg
                              className={`w-3 h-3 transition-transform ${isControlExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Expanded: AWS service mappings */}
                      {isControlExpanded && ctrl.awsServices && (
                        <div className="mt-3 ml-9 p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="text-[10px] font-medium text-slate-600 mb-2">AWS Service Mappings</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {ctrl.awsServices.map((svc, i) => {
                              const asm = awsStatusMeta[svc.status];
                              return (
                                <div key={i} className="flex items-center gap-2 p-2 bg-white rounded border border-slate-100">
                                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                                    <span className="text-white text-[10px] font-bold">AWS</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-medium text-slate-800">{svc.service}</div>
                                    <div className="text-[9px] text-slate-500 truncate">{svc.description}</div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${asm.dot}`} />
                                    <span className="text-[9px] text-slate-500">{asm.label}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {ctrl.description && (
                            <div className="mt-2 text-[10px] text-slate-500 italic">
                              {ctrl.description}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* AWS Service Coverage Summary */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900">AWS Service Coverage</div>
          <div className="text-[10px] text-slate-500">Services providing automated detection and evidence for NIST AI RMF controls</div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Object.entries(AWS_SERVICE_ICONS).slice(0, 12).map(([service]) => {
              // Count controls using this service
              const controlCount = NIST_FUNCTIONS.flatMap(f => f.controls)
                .filter(c => c.awsServices?.some(s => s.service === service))
                .length;
              const activeCount = NIST_FUNCTIONS.flatMap(f => f.controls)
                .flatMap(c => c.awsServices || [])
                .filter(s => s.service === service && s.status === 'active')
                .length;

              if (controlCount === 0) return null;

              return (
                <div key={service} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center">
                    <span className="text-white text-[9px] font-bold">AWS</span>
                  </div>
                  <div className="text-[11px] font-medium text-slate-800 truncate">{service}</div>
                  <div className="text-[10px] text-slate-500">{controlCount} controls</div>
                  {activeCount > 0 && (
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[9px] text-emerald-600">{activeCount} active</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="text-[10px] text-slate-400 text-center">
        NIST AI RMF 1.0 (Jan 2023) implementation status. Control IDs follow the official NIST AI RMF Core subcategory structure.
        AWS service integrations provide automated evidence collection where available.
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <GovernPageLayout
      title="NIST AI RMF"
      description="NIST AI Risk Management Framework 1.0 — Govern, Map, Measure, Manage lifecycle with AWS service mappings and automated detection status."
      badge={<MockDataBadge integration="NIST AI RMF controls — control-plane backend (DynamoDB)" />}
    >
      {body}
    </GovernPageLayout>
  );
}
