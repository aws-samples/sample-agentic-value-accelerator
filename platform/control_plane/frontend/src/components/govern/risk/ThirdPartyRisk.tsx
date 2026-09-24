/**
 * ThirdPartyRisk — Third-party and vendor AI risk management
 *
 * Covers:
 * - AI/ML model vendor assessment (Anthropic, OpenAI, AWS Bedrock, etc.)
 * - SaaS AI tool governance (Copilot, Cursor, etc.)
 * - Supply chain risk for AI components
 * - Vendor due diligence and ongoing monitoring
 */

import { useState, useMemo } from 'react';
import { RISKS, CONTROLS } from './riskData';
import { Icon, type IconName } from '../icons';
import { rowButtonProps } from '../a11y';
import { getRiskScoreTextColor } from '../riskScoring';
import { MockDataBadge } from '../DataSourceIndicator';
import ConcentrationRiskCard from './ConcentrationRiskCard';
import DDQManagement from './DDQManagement';
import VendorActivityLog from './VendorActivityLog';
import IntelligenceSummary from './IntelligenceSummary';
import RiskAssessmentWorkflow, { type AssessmentResult } from './RiskAssessmentWorkflow';
import VendorMonitoring from './VendorMonitoring';
import VendorIAMAccess from './VendorIAMAccess';
import VendorCostSummary from './VendorCostSummary';

type TabId = 'inventory' | 'monitoring' | 'analytics';
import VendorOnboardingWizard from './VendorOnboardingWizard';

type VendorStatus = 'approved' | 'under-review' | 'conditional' | 'blocked';
type VendorTier = 'critical' | 'high' | 'medium' | 'low';
type DataAccessLevel = 'none' | 'public' | 'internal' | 'confidential' | 'restricted';
type ServiceCriticality = 'non-critical' | 'important' | 'critical' | 'mission-critical';

interface DomainRiskScores {
  financial: number;
  operational: number;
  compliance: number;
  reputation: number;
  cyber: number;
}

interface TPIAAssessment {
  dataAccessLevel: DataAccessLevel;
  serviceCriticality: ServiceCriticality;
  dataVolume: 'low' | 'medium' | 'high';
  integrationDepth: 'api-only' | 'data-sharing' | 'deep-integration';
  inherentRiskLevel: 'lower' | 'moderate' | 'higher';
  assessedDate: string;
}

interface Vendor {
  id: string;
  name: string;
  type: 'model-provider' | 'saas-tool' | 'infrastructure' | 'data-provider';
  tier: VendorTier;
  status: VendorStatus;
  services: string[];
  riskScore: number;
  domainScores: DomainRiskScores;
  tpia: TPIAAssessment;
  lastAssessment: string;
  nextAssessment: string;
  contractExpiry: string;
  ddqStatus: 'complete' | 'pending' | 'overdue';
  findings: number;
  criticalFindings: number;
}

const VENDORS: Vendor[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'model-provider',
    tier: 'critical',
    status: 'approved',
    services: ['Claude 3.5 Sonnet', 'Claude 3 Opus', 'Claude API'],
    riskScore: 32,
    domainScores: { financial: 25, operational: 30, compliance: 28, reputation: 20, cyber: 35 },
    tpia: {
      dataAccessLevel: 'confidential',
      serviceCriticality: 'mission-critical',
      dataVolume: 'high',
      integrationDepth: 'deep-integration',
      inherentRiskLevel: 'higher',
      assessedDate: '2026-03-15',
    },
    lastAssessment: '2026-03-15',
    nextAssessment: '2026-09-15',
    contractExpiry: '2027-12-31',
    ddqStatus: 'complete',
    findings: 2,
    criticalFindings: 0,
  },
  {
    id: 'aws-bedrock',
    name: 'AWS Bedrock',
    type: 'infrastructure',
    tier: 'critical',
    status: 'approved',
    services: ['Model Hosting', 'Guardrails', 'Knowledge Bases', 'Agents'],
    riskScore: 25,
    domainScores: { financial: 20, operational: 25, compliance: 22, reputation: 18, cyber: 28 },
    tpia: {
      dataAccessLevel: 'restricted',
      serviceCriticality: 'mission-critical',
      dataVolume: 'high',
      integrationDepth: 'deep-integration',
      inherentRiskLevel: 'higher',
      assessedDate: '2026-04-01',
    },
    lastAssessment: '2026-04-01',
    nextAssessment: '2026-10-01',
    contractExpiry: '2027-06-30',
    ddqStatus: 'complete',
    findings: 1,
    criticalFindings: 0,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'model-provider',
    tier: 'high',
    status: 'conditional',
    services: ['GPT-4o', 'Embeddings API'],
    riskScore: 48,
    domainScores: { financial: 45, operational: 42, compliance: 55, reputation: 38, cyber: 52 },
    tpia: {
      dataAccessLevel: 'confidential',
      serviceCriticality: 'critical',
      dataVolume: 'medium',
      integrationDepth: 'data-sharing',
      inherentRiskLevel: 'moderate',
      assessedDate: '2026-02-20',
    },
    lastAssessment: '2026-02-20',
    nextAssessment: '2026-08-20',
    contractExpiry: '2026-12-31',
    ddqStatus: 'pending',
    findings: 4,
    criticalFindings: 1,
  },
  {
    id: 'cursor',
    name: 'Cursor AI',
    type: 'saas-tool',
    tier: 'medium',
    status: 'under-review',
    services: ['Code Assistant', 'AI IDE'],
    riskScore: 55,
    domainScores: { financial: 48, operational: 52, compliance: 60, reputation: 45, cyber: 62 },
    tpia: {
      dataAccessLevel: 'internal',
      serviceCriticality: 'important',
      dataVolume: 'medium',
      integrationDepth: 'data-sharing',
      inherentRiskLevel: 'moderate',
      assessedDate: '2026-01-10',
    },
    lastAssessment: '2026-01-10',
    nextAssessment: '2026-07-10',
    contractExpiry: '2026-12-31',
    ddqStatus: 'overdue',
    findings: 3,
    criticalFindings: 0,
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    type: 'saas-tool',
    tier: 'high',
    status: 'approved',
    services: ['Code Completion', 'Chat', 'PR Summaries'],
    riskScore: 38,
    domainScores: { financial: 30, operational: 35, compliance: 42, reputation: 32, cyber: 45 },
    tpia: {
      dataAccessLevel: 'internal',
      serviceCriticality: 'critical',
      dataVolume: 'high',
      integrationDepth: 'deep-integration',
      inherentRiskLevel: 'moderate',
      assessedDate: '2026-03-01',
    },
    lastAssessment: '2026-03-01',
    nextAssessment: '2026-09-01',
    contractExpiry: '2027-03-31',
    ddqStatus: 'complete',
    findings: 2,
    criticalFindings: 0,
  },
  {
    id: 'cohere',
    name: 'Cohere',
    type: 'model-provider',
    tier: 'low',
    status: 'blocked',
    services: ['Embed v3', 'Rerank'],
    riskScore: 72,
    domainScores: { financial: 68, operational: 70, compliance: 78, reputation: 65, cyber: 75 },
    tpia: {
      dataAccessLevel: 'public',
      serviceCriticality: 'non-critical',
      dataVolume: 'low',
      integrationDepth: 'api-only',
      inherentRiskLevel: 'lower',
      assessedDate: '2025-11-15',
    },
    lastAssessment: '2025-11-15',
    nextAssessment: '2026-05-15',
    contractExpiry: '2026-06-30',
    ddqStatus: 'overdue',
    findings: 6,
    criticalFindings: 2,
  },
];

const statusColors: Record<VendorStatus, { bg: string; text: string; label: string }> = {
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Approved' },
  'under-review': { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Under Review' },
  conditional: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Conditional' },
  blocked: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'Blocked' },
};

const tierColors: Record<VendorTier, { bg: string; text: string }> = {
  critical: { bg: 'bg-rose-100', text: 'text-rose-800' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-800' },
  low: { bg: 'bg-slate-100', text: 'text-slate-700' },
};

const ddqColors: Record<string, { bg: string; text: string }> = {
  complete: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700' },
  overdue: { bg: 'bg-rose-50', text: 'text-rose-700' },
};

const dataAccessColors: Record<DataAccessLevel, { bg: string; text: string; label: string }> = {
  none: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'No Access' },
  public: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Public Only' },
  internal: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Internal' },
  confidential: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Confidential' },
  restricted: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'Restricted' },
};

const criticalityColors: Record<ServiceCriticality, { bg: string; text: string; label: string }> = {
  'non-critical': { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Non-Critical' },
  important: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Important' },
  critical: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Critical' },
  'mission-critical': { bg: 'bg-rose-50', text: 'text-rose-700', label: 'Mission-Critical' },
};

const inherentRiskColors: Record<string, { bg: string; text: string; border: string }> = {
  lower: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  moderate: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  higher: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

const domainLabels: Record<keyof DomainRiskScores, { label: string; icon: IconName; weight: string }> = {
  financial: { label: 'Financial', icon: 'currency-dollar', weight: '25%' },
  operational: { label: 'Operational', icon: 'cog-6-tooth', weight: '20%' },
  compliance: { label: 'Compliance', icon: 'scale', weight: '20%' },
  reputation: { label: 'Reputation', icon: 'megaphone', weight: '15%' },
  cyber: { label: 'Cyber', icon: 'shield-check', weight: '20%' },
};

// Vendor riskScore is on the canonical 0-100 scale — route through the shared
// helper so colors use the same 75/50/25 tier thresholds as the rest of Govern.
function riskScoreColor(score: number): string {
  return getRiskScoreTextColor(score);
}

// The overall vendor risk score is the weighted roll-up of the 5 domain scores
// using the exact weights shown in the detail-drawer caption. Deriving it here
// (rather than trusting an independent stored literal) keeps every displayed
// score honest against that formula.
function weightedRiskScore(d: DomainRiskScores): number {
  return Math.round(
    d.financial * 0.25 +
    d.operational * 0.2 +
    d.compliance * 0.2 +
    d.reputation * 0.15 +
    d.cyber * 0.2
  );
}

export default function ThirdPartyRisk() {
  const [activeTab, setActiveTab] = useState<TabId>('inventory');
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [filterStatus, setFilterStatus] = useState<VendorStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [showTPIAModal, setShowTPIAModal] = useState(false);
  const [tpiaForm, setTpiaForm] = useState<TPIAAssessment | null>(null);
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [showAssessmentWorkflow, setShowAssessmentWorkflow] = useState(false);
  const [assessmentVendor, setAssessmentVendor] = useState<Vendor | null>(null);
  const [activityLogExpanded, setActivityLogExpanded] = useState(false);
  const [showDDQForVendor, setShowDDQForVendor] = useState<string | null>(null);

  // Get third-party risks from risk register
  const thirdPartyRisks = useMemo(() =>
    RISKS.filter(r => r.category === 'third-party'),
    []
  );

  // Get third-party controls
  const thirdPartyControls = useMemo(() =>
    CONTROLS.filter(c => c.category === 'third-party'),
    []
  );

  // Filter vendors
  const filteredVendors = useMemo(() =>
    VENDORS.filter(v =>
      (filterStatus === 'all' || v.status === filterStatus) &&
      (filterType === 'all' || v.type === filterType)
    ),
    [filterStatus, filterType]
  );

  // KPIs
  const approvedCount = VENDORS.filter(v => v.status === 'approved').length;
  const overdueAssessments = VENDORS.filter(v => v.ddqStatus === 'overdue').length;
  const criticalVendors = VENDORS.filter(v => v.tier === 'critical').length;
  const avgRiskScore = Math.round(VENDORS.reduce((sum, v) => sum + weightedRiskScore(v.domainScores), 0) / VENDORS.length);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">AI Vendors</div>
          <div className="text-2xl font-bold text-slate-900">{VENDORS.length}</div>
          <div className="text-xs text-emerald-600 mt-1">{approvedCount} approved</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Critical Vendors</div>
          <div className="text-2xl font-bold text-rose-600">{criticalVendors}</div>
          <div className="text-xs text-slate-500 mt-1">Tier 1 dependency</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Avg Risk Score</div>
          <div className={`text-2xl font-bold ${riskScoreColor(avgRiskScore)}`}>{avgRiskScore}</div>
          <div className="text-xs text-slate-500 mt-1">Portfolio average</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Overdue Assessments</div>
          <div className={`text-2xl font-bold ${overdueAssessments > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {overdueAssessments}
          </div>
          <div className="text-xs text-slate-500 mt-1">DDQ/assessment due</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl border border-slate-200 p-1">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'inventory'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon name="rectangle-stack" className="w-4 h-4" />
            Vendor Inventory
          </button>
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'monitoring'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon name="signal" className="w-4 h-4" />
            Ongoing Monitoring
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'analytics'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon name="chart-pie" className="w-4 h-4" />
            Analytics
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'monitoring' ? (
        <VendorMonitoring />
      ) : activeTab === 'analytics' ? (
        <div className="space-y-6">
          {/* Concentration Risk Analysis - Full Width */}
          <ConcentrationRiskCard />
        </div>
      ) : (
        <>
          {/* 2-Column Layout: Vendor Table (left) + Summary Panels (right) */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left Column - Vendor Table (2/3 width on xl) */}
            <div className="xl:col-span-2 space-y-4">
              {/* Filters + Add Button */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 flex-wrap">
                  <MockDataBadge integration="Connect a vendor-risk / TPRM platform for live vendor inventory and scores" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Status:</span>
                    <select
                      aria-label="Filter vendors by status"
                      value={filterStatus}
                      onChange={e => setFilterStatus(e.target.value as VendorStatus | 'all')}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1"
                    >
                      <option value="all">All</option>
                      <option value="approved">Approved</option>
                      <option value="conditional">Conditional</option>
                      <option value="under-review">Under Review</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Type:</span>
                    <select
                      aria-label="Filter vendors by type"
                      value={filterType}
                      onChange={e => setFilterType(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1"
                    >
                      <option value="all">All</option>
                      <option value="model-provider">Model Provider</option>
                      <option value="saas-tool">SaaS Tool</option>
                      <option value="infrastructure">Infrastructure</option>
                      <option value="data-provider">Data Provider</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  title="Demo — vendor onboarding is not wired to a backend in this build"
                  className="text-xs px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg cursor-not-allowed flex items-center gap-1.5"
                >
                  <Icon name="plus" className="w-3.5 h-3.5" />
                  Add Vendor
                  <span className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-500 font-medium">Demo</span>
                </button>
              </div>

              {/* Vendor Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th scope="col" className="text-left px-4 py-2.5 font-medium text-slate-600">Vendor</th>
                        <th scope="col" className="text-left px-4 py-2.5 font-medium text-slate-600">Tier</th>
                        <th scope="col" className="text-left px-4 py-2.5 font-medium text-slate-600">Status</th>
                        <th scope="col" className="text-left px-4 py-2.5 font-medium text-slate-600">Risk</th>
                        <th scope="col" className="text-left px-4 py-2.5 font-medium text-slate-600">DDQ</th>
                        <th scope="col" className="text-left px-4 py-2.5 font-medium text-slate-600">Next Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVendors.map(vendor => (
                        <tr
                          key={vendor.id}
                          {...rowButtonProps(() => setSelectedVendor(vendor), `View vendor ${vendor.name}`)}
                          className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors focus:outline-none focus:bg-blue-50/50"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{vendor.name}</div>
                            <div className="text-slate-500 text-[10px] mt-0.5 capitalize">
                              {vendor.type.replace('-', ' ')}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${tierColors[vendor.tier].bg} ${tierColors[vendor.tier].text}`}>
                              {vendor.tier}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[vendor.status].bg} ${statusColors[vendor.status].text}`}>
                              {statusColors[vendor.status].label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-semibold ${riskScoreColor(weightedRiskScore(vendor.domainScores))}`}>
                              {weightedRiskScore(vendor.domainScores)}
                            </span>
                            {vendor.criticalFindings > 0 && (
                              <span className="text-rose-500 ml-1 text-[10px]">!</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${ddqColors[vendor.ddqStatus].bg} ${ddqColors[vendor.ddqStatus].text}`}>
                              {vendor.ddqStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{vendor.nextAssessment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* DDQ Management - Collapsible */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setShowDDQForVendor(showDDQForVendor === '__all__' ? null : '__all__')}
                  className="w-full px-4 py-3 flex items-center justify-between bg-slate-50/50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Icon name="clipboard-document-list" className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-800">Due Diligence Questionnaires</span>
                  </div>
                  <Icon name={showDDQForVendor ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-slate-400" />
                </button>
                {showDDQForVendor && (
                  <div className="p-4 border-t border-slate-100">
                    <DDQManagement vendorId={showDDQForVendor === '__all__' ? undefined : showDDQForVendor} />
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Summary Panels (1/3 width on xl) */}
            <div className="space-y-4">
              {/* Third-Party Risks */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-sm font-semibold text-slate-800">Third-Party Risks</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">From Risk Register</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {thirdPartyRisks.slice(0, 5).map(risk => (
                    <div key={risk.id} className="px-4 py-2.5 hover:bg-slate-50/50">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-slate-900 truncate flex-1">{risk.title}</div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
                            risk.status === 'open' ? 'bg-rose-50 text-rose-700' :
                            risk.status === 'mitigated' ? 'bg-emerald-50 text-emerald-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            {risk.status}
                          </span>
                          <span className={`text-xs font-semibold ${
                            risk.residualScore >= 15 ? 'text-rose-600' :
                            risk.residualScore >= 10 ? 'text-orange-600' :
                            'text-emerald-600'
                          }`}>
                            {risk.residualScore}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {thirdPartyRisks.length > 5 && (
                  <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/30">
                    <span className="text-[10px] text-slate-500">+{thirdPartyRisks.length - 5} more risks</span>
                  </div>
                )}
              </div>

              {/* Vendor Controls */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-sm font-semibold text-slate-800">Vendor Controls</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">Implemented mitigations</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {thirdPartyControls.slice(0, 5).map(control => (
                    <div key={control.id} className="px-4 py-2.5 hover:bg-slate-50/50">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-slate-900 truncate flex-1">{control.name}</div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize flex-shrink-0 ${
                          control.status === 'implemented' ? 'bg-emerald-50 text-emerald-700' :
                          'bg-blue-50 text-blue-700'
                        }`}>
                          {control.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {thirdPartyControls.length > 5 && (
                  <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/30">
                    <span className="text-[10px] text-slate-500">+{thirdPartyControls.length - 5} more controls</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Vendor Detail Drawer */}
      {selectedVendor && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setSelectedVendor(null)} />
          <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedVendor.name}</h2>
                <p className="text-xs text-slate-500 capitalize">{selectedVendor.type.replace('-', ' ')}</p>
              </div>
              <button
                onClick={() => setSelectedVendor(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Icon name="x-mark" className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Status & Tier */}
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[selectedVendor.status].bg} ${statusColors[selectedVendor.status].text}`}>
                  {statusColors[selectedVendor.status].label}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${tierColors[selectedVendor.tier].bg} ${tierColors[selectedVendor.tier].text}`}>
                  {selectedVendor.tier} tier
                </span>
              </div>

              {/* Services */}
              <div>
                <div className="text-xs font-medium text-slate-700 mb-2">Services</div>
                <div className="flex flex-wrap gap-1">
                  {selectedVendor.services.map(s => (
                    <span key={s} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* TPIA Assessment */}
              <div>
                <div className="text-xs font-medium text-slate-700 mb-2">TPIA - Inherent Risk Assessment</div>
                <div className={`rounded-lg p-4 border ${inherentRiskColors[selectedVendor.tpia.inherentRiskLevel].bg} ${inherentRiskColors[selectedVendor.tpia.inherentRiskLevel].border}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-slate-700">Inherent Risk Level</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${inherentRiskColors[selectedVendor.tpia.inherentRiskLevel].text}`}>
                      {selectedVendor.tpia.inherentRiskLevel}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between bg-white/60 rounded px-2 py-1.5">
                      <span className="text-slate-600">Data Access</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${dataAccessColors[selectedVendor.tpia.dataAccessLevel].bg} ${dataAccessColors[selectedVendor.tpia.dataAccessLevel].text}`}>
                        {dataAccessColors[selectedVendor.tpia.dataAccessLevel].label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-white/60 rounded px-2 py-1.5">
                      <span className="text-slate-600">Criticality</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${criticalityColors[selectedVendor.tpia.serviceCriticality].bg} ${criticalityColors[selectedVendor.tpia.serviceCriticality].text}`}>
                        {criticalityColors[selectedVendor.tpia.serviceCriticality].label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-white/60 rounded px-2 py-1.5">
                      <span className="text-slate-600">Data Volume</span>
                      <span className="text-slate-800 font-medium capitalize">{selectedVendor.tpia.dataVolume}</span>
                    </div>
                    <div className="flex items-center justify-between bg-white/60 rounded px-2 py-1.5">
                      <span className="text-slate-600">Integration</span>
                      <span className="text-slate-800 font-medium capitalize">{selectedVendor.tpia.integrationDepth.replace('-', ' ')}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500">
                    Assessed: {selectedVendor.tpia.assessedDate}
                  </div>
                </div>
              </div>

              {/* Intelligence Summary */}
              <IntelligenceSummary
                vendorId={selectedVendor.id}
                vendorName={selectedVendor.name}
              />

              {/* 5-Domain Risk Breakdown */}
              <div>
                <div className="text-xs font-medium text-slate-700 mb-2 flex items-center justify-between">
                  <span>5-Domain Risk Assessment</span>
                  <MockDataBadge integration="Vendor risk scores from a TPRM / vendor-risk platform" />
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-slate-600">Weighted Overall Score</span>
                    <span className={`text-2xl font-bold ${riskScoreColor(weightedRiskScore(selectedVendor.domainScores))}`}>
                      {weightedRiskScore(selectedVendor.domainScores)}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {(Object.keys(domainLabels) as Array<keyof DomainRiskScores>).map(domain => {
                      const score = selectedVendor.domainScores[domain];
                      const { label, icon, weight } = domainLabels[domain];
                      return (
                        <div key={domain}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <div className="flex items-center gap-1.5">
                              <Icon name={icon} className="w-3.5 h-3.5 text-slate-500" />
                              <span className="text-slate-700">{label}</span>
                              <span className="text-slate-400">({weight})</span>
                            </div>
                            <span className={`font-semibold ${riskScoreColor(score)}`}>{score}</span>
                          </div>
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                score <= 30 ? 'bg-emerald-500' :
                                score <= 50 ? 'bg-amber-500' :
                                score <= 70 ? 'bg-orange-500' :
                                'bg-rose-500'
                              }`}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200 text-[10px] text-slate-500">
                    Weighted formula: (Fin x 25%) + (Ops x 20%) + (Comp x 20%) + (Rep x 15%) + (Cyber x 20%)
                  </div>
                </div>
              </div>

              {/* Key Dates */}
              <div>
                <div className="text-xs font-medium text-slate-700 mb-2">Key Dates</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-[10px] text-slate-500">Last Assessment</div>
                    <div className="text-sm font-medium text-slate-900">{selectedVendor.lastAssessment}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-[10px] text-slate-500">Next Assessment</div>
                    <div className="text-sm font-medium text-slate-900">{selectedVendor.nextAssessment}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-[10px] text-slate-500">Contract Expiry</div>
                    <div className="text-sm font-medium text-slate-900">{selectedVendor.contractExpiry}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-[10px] text-slate-500">DDQ Status</div>
                    <span className={`text-sm font-medium capitalize ${ddqColors[selectedVendor.ddqStatus].text}`}>
                      {selectedVendor.ddqStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* FinOps Cost Data */}
              <VendorCostSummary vendorName={selectedVendor.name} />

              {/* IAM Access Summary */}
              <VendorIAMAccess
                vendorId={selectedVendor.id}
                vendorName={selectedVendor.name}
              />

              {/* Findings */}
              <div>
                <div className="text-xs font-medium text-slate-700 mb-2">Open Findings</div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-slate-900">{selectedVendor.findings}</span>
                    <span className="text-xs text-slate-500">total</span>
                  </div>
                  {selectedVendor.criticalFindings > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-rose-600">{selectedVendor.criticalFindings}</span>
                      <span className="text-xs text-rose-600">critical</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Activity History */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setActivityLogExpanded(!activityLogExpanded)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Icon name="clock" className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-medium text-slate-700">Activity History</span>
                  </div>
                  <Icon
                    name={activityLogExpanded ? 'chevron-up' : 'chevron-down'}
                    className="w-4 h-4 text-slate-400"
                  />
                </button>
                {activityLogExpanded && (
                  <div className="p-4 border-t border-slate-200 max-h-96 overflow-y-auto">
                    <VendorActivityLog vendorId={selectedVendor.id} />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled
                    title="Demo — TPIA editing is not wired to a backend in this build"
                    className="flex-1 px-4 py-2 bg-slate-100 text-slate-400 text-xs font-medium rounded-lg cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    <Icon name="clipboard-document-check" className="w-4 h-4" />
                    Update TPIA
                    <span className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-500 font-medium">Demo</span>
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Demo — the assessment workflow is not wired to a backend in this build"
                    className="flex-1 px-4 py-2 bg-slate-100 text-slate-400 text-xs font-medium rounded-lg cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    <Icon name="chart-bar" className="w-4 h-4" />
                    Run Assessment
                    <span className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-500 font-medium">Demo</span>
                  </button>
                </div>
                <button
                  onClick={() => {
                    setShowDDQForVendor(selectedVendor.id);
                    setSelectedVendor(null);
                  }}
                  className="w-full px-4 py-2 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Icon name="clipboard-document-list" className="w-4 h-4" />
                  View DDQ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TPIA Quick Assessment Modal */}
      {showTPIAModal && tpiaForm && selectedVendor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowTPIAModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-600 to-indigo-700">
              <h3 className="text-lg font-semibold text-white">TPIA Quick Assessment</h3>
              <p className="text-xs text-indigo-200 mt-0.5">{selectedVendor.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                  Data Access Level
                </label>
                <select
                  value={tpiaForm.dataAccessLevel}
                  onChange={e => setTpiaForm({ ...tpiaForm, dataAccessLevel: e.target.value as DataAccessLevel })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                >
                  <option value="none">No Access - No data shared</option>
                  <option value="public">Public Only - Public data only</option>
                  <option value="internal">Internal - Internal business data</option>
                  <option value="confidential">Confidential - Sensitive customer data</option>
                  <option value="restricted">Restricted - PII, financial, health data</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                  Service Criticality
                </label>
                <select
                  value={tpiaForm.serviceCriticality}
                  onChange={e => setTpiaForm({ ...tpiaForm, serviceCriticality: e.target.value as ServiceCriticality })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                >
                  <option value="non-critical">Non-Critical - Nice to have</option>
                  <option value="important">Important - Supports key processes</option>
                  <option value="critical">Critical - Core business dependency</option>
                  <option value="mission-critical">Mission-Critical - Business stops without</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                    Data Volume
                  </label>
                  <select
                    value={tpiaForm.dataVolume}
                    onChange={e => setTpiaForm({ ...tpiaForm, dataVolume: e.target.value as 'low' | 'medium' | 'high' })}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                    Integration Depth
                  </label>
                  <select
                    value={tpiaForm.integrationDepth}
                    onChange={e => setTpiaForm({ ...tpiaForm, integrationDepth: e.target.value as 'api-only' | 'data-sharing' | 'deep-integration' })}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <option value="api-only">API Only</option>
                    <option value="data-sharing">Data Sharing</option>
                    <option value="deep-integration">Deep Integration</option>
                  </select>
                </div>
              </div>

              {/* Auto-calculated inherent risk */}
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-600 mb-2">Calculated Inherent Risk</div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    Based on data sensitivity + criticality + volume + integration
                  </div>
                  {(() => {
                    const dataScore = { none: 0, public: 1, internal: 2, confidential: 3, restricted: 4 }[tpiaForm.dataAccessLevel];
                    const critScore = { 'non-critical': 0, important: 1, critical: 2, 'mission-critical': 3 }[tpiaForm.serviceCriticality];
                    const volScore = { low: 0, medium: 1, high: 2 }[tpiaForm.dataVolume];
                    const intScore = { 'api-only': 0, 'data-sharing': 1, 'deep-integration': 2 }[tpiaForm.integrationDepth];
                    const total = dataScore + critScore + volScore + intScore;
                    const level = total <= 3 ? 'lower' : total <= 7 ? 'moderate' : 'higher';
                    return (
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${inherentRiskColors[level].bg} ${inherentRiskColors[level].text}`}>
                        {level}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex gap-3">
              <button
                onClick={() => setShowTPIAModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const dataScore = { none: 0, public: 1, internal: 2, confidential: 3, restricted: 4 }[tpiaForm.dataAccessLevel];
                  const critScore = { 'non-critical': 0, important: 1, critical: 2, 'mission-critical': 3 }[tpiaForm.serviceCriticality];
                  const volScore = { low: 0, medium: 1, high: 2 }[tpiaForm.dataVolume];
                  const intScore = { 'api-only': 0, 'data-sharing': 1, 'deep-integration': 2 }[tpiaForm.integrationDepth];
                  const total = dataScore + critScore + volScore + intScore;
                  const level = total <= 3 ? 'lower' : total <= 7 ? 'moderate' : 'higher';
                  setToast(`TPIA updated for ${selectedVendor.name} — Inherent Risk: ${level}`);
                  setShowTPIAModal(false);
                  setTimeout(() => setToast(null), 2800);
                }}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Save Assessment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Onboarding Wizard */}
      <VendorOnboardingWizard
        isOpen={showOnboardingWizard}
        onClose={() => setShowOnboardingWizard(false)}
        onSubmit={(vendorData) => {
          setToast(`Vendor "${vendorData.basicInfo.vendorName}" onboarded successfully with risk score ${vendorData.overallRiskScore}`);
          setTimeout(() => setToast(null), 3500);
        }}
      />

      {/* 5-Domain Risk Assessment Workflow */}
      {showAssessmentWorkflow && assessmentVendor && (
        <RiskAssessmentWorkflow
          vendorId={assessmentVendor.id}
          vendorName={assessmentVendor.name}
          previousScore={weightedRiskScore(assessmentVendor.domainScores)}
          onClose={() => {
            setShowAssessmentWorkflow(false);
            setAssessmentVendor(null);
          }}
          onSubmit={(assessment: AssessmentResult) => {
            setToast(`Assessment submitted for ${assessment.vendorName} - Score: ${assessment.weightedScore} (${assessment.recommendation})`);
            setShowAssessmentWorkflow(false);
            setAssessmentVendor(null);
            setTimeout(() => setToast(null), 3500);
          }}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
