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
import { Icon } from '../icons';
import { rowButtonProps } from '../a11y';
import { getRiskScoreTextColor } from '../riskScoring';
import ConcentrationRiskCard from './ConcentrationRiskCard';

type VendorStatus = 'approved' | 'under-review' | 'conditional' | 'blocked';
type VendorTier = 'critical' | 'high' | 'medium' | 'low';

interface Vendor {
  id: string;
  name: string;
  type: 'model-provider' | 'saas-tool' | 'infrastructure' | 'data-provider';
  tier: VendorTier;
  status: VendorStatus;
  services: string[];
  riskScore: number;
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

// Vendor riskScore is on the canonical 0-100 scale — route through the shared
// helper so colors use the same 75/50/25 tier thresholds as the rest of Govern.
function riskScoreColor(score: number): string {
  return getRiskScoreTextColor(score);
}

export default function ThirdPartyRisk() {
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [filterStatus, setFilterStatus] = useState<VendorStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [toast, setToast] = useState<string | null>(null);

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
  const avgRiskScore = Math.round(VENDORS.reduce((sum, v) => sum + v.riskScore, 0) / VENDORS.length);

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

      {/* Concentration Risk Analysis */}
      <ConcentrationRiskCard />

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
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

      {/* Vendor Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">AI Vendor Inventory</h3>
            <button
              onClick={() => {
                setToast('Opening vendor registration form — enter vendor details');
                setTimeout(() => setToast(null), 2800);
              }}
              className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              + Add Vendor
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/30">
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Vendor</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Type</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Tier</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Status</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Risk Score</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">DDQ</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Findings</th>
                <th scope="col" className="text-left px-4 py-2 font-medium text-slate-600">Next Assessment</th>
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
                    <div className="text-slate-500 text-[10px] mt-0.5">
                      {vendor.services.slice(0, 2).join(', ')}
                      {vendor.services.length > 2 && ` +${vendor.services.length - 2}`}
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600">
                    {vendor.type.replace('-', ' ')}
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
                    <span className={`font-semibold ${riskScoreColor(vendor.riskScore)}`}>
                      {vendor.riskScore}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${ddqColors[vendor.ddqStatus].bg} ${ddqColors[vendor.ddqStatus].text}`}>
                      {vendor.ddqStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-600">{vendor.findings}</span>
                    {vendor.criticalFindings > 0 && (
                      <span className="text-rose-600 ml-1">({vendor.criticalFindings} critical)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{vendor.nextAssessment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two-column: Related Risks & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Third-Party Risks */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-semibold text-slate-800">Third-Party Risks</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">From Risk Register</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {thirdPartyRisks.map(risk => (
              <div key={risk.id} className="px-4 py-3 hover:bg-slate-50/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-900">{risk.title}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{risk.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${
                      risk.status === 'open' ? 'bg-rose-50 text-rose-700' :
                      risk.status === 'mitigated' ? 'bg-emerald-50 text-emerald-700' :
                      risk.status === 'accepted' ? 'bg-amber-50 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {risk.status}
                    </span>
                    <span className={`text-xs font-semibold ${
                      risk.residualScore >= 15 ? 'text-rose-600' :
                      risk.residualScore >= 10 ? 'text-orange-600' :
                      risk.residualScore >= 5 ? 'text-amber-600' :
                      'text-emerald-600'
                    }`}>
                      {risk.residualScore}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Third-Party Controls */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-semibold text-slate-800">Vendor Controls</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Implemented mitigations</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {thirdPartyControls.map(control => (
              <div key={control.id} className="px-4 py-3 hover:bg-slate-50/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-900">{control.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{control.description}</div>
                    <div className="text-[10px] text-slate-400 mt-1">Owner: {control.owner}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${
                      control.status === 'implemented' ? 'bg-emerald-50 text-emerald-700' :
                      control.status === 'planned' ? 'bg-blue-50 text-blue-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {control.status}
                    </span>
                    <span className={`text-[10px] capitalize ${
                      control.effectiveness === 'high' ? 'text-emerald-600' :
                      control.effectiveness === 'medium' ? 'text-amber-600' :
                      'text-rose-600'
                    }`}>
                      {control.effectiveness} effectiveness
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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

              {/* Risk Score */}
              <div>
                <div className="text-xs font-medium text-slate-700 mb-2">Risk Assessment</div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Overall Risk Score</span>
                    <span className={`text-2xl font-bold ${riskScoreColor(selectedVendor.riskScore)}`}>
                      {selectedVendor.riskScore}
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        selectedVendor.riskScore <= 30 ? 'bg-emerald-500' :
                        selectedVendor.riskScore <= 50 ? 'bg-amber-500' :
                        selectedVendor.riskScore <= 70 ? 'bg-orange-500' :
                        'bg-rose-500'
                      }`}
                      style={{ width: `${selectedVendor.riskScore}%` }}
                    />
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

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-slate-200">
                <button
                  onClick={() => {
                    setToast(`Running assessment for ${selectedVendor.name} — analysis in progress`);
                    setTimeout(() => setToast(null), 2800);
                  }}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Run Assessment
                </button>
                <button
                  onClick={() => {
                    setToast(`Opening Due Diligence Questionnaire for ${selectedVendor.name}`);
                    setTimeout(() => setToast(null), 2800);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  View DDQ
                </button>
              </div>
            </div>
          </div>
        </div>
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
