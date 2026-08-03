/**
 * RiskManagement — Enterprise risk management for AI/ML systems
 *
 * Tabs:
 * - Dashboard: Portfolio view, key metrics, trends
 * - Monitoring: Real-time risk signals with five-tier alert framework
 * - Risk Register: Central inventory with CRUD
 * - Agent Profiles: Agent-specific risk assessment (tool access, data scope, autonomy)
 * - Third Party: Vendor and third-party AI risk management
 * - Assessments: Run risk assessments
 * - Controls: Control library with risk mappings
 * - Issues: Findings and remediation tracking
 * - HRAIS: EU AI Act High-Risk AI System assessment
 * - Policy as Code: Governance policies enforced via CI/CD
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import RiskDashboard from './risk/RiskDashboard';
import RiskRegister from './risk/RiskRegister';
import RiskAssessments from './risk/RiskAssessments';
import RiskControls from './risk/RiskControls';
import RiskIssues from './risk/RiskIssues';
import AgentRiskProfile from './risk/AgentRiskProfile';
import ThirdPartyRisk from './risk/ThirdPartyRisk';
import PolicyAsCode from './risk/PolicyAsCode';
import RealTimeMonitoring from './risk/RealTimeMonitoring';
import HRAISAssessment from './HRAISAssessment';
import OutcomeMonitoring from './OutcomeMonitoring';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import UnifiedGuide, { RISK_GUIDE } from './UnifiedGuide';
import GovernPageLayout from './GovernPageLayout';
import { useGovernanceAggregator } from './useGovernanceAggregator';

type Tab = 'dashboard' | 'monitoring' | 'register' | 'agent-profiles' | 'third-party' | 'assessments' | 'controls' | 'issues' | 'hrais' | 'policy-as-code' | 'outcomes';

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Portfolio risk overview' },
  { id: 'monitoring', label: 'Monitoring', description: 'Real-time risk signals' },
  { id: 'outcomes', label: 'Outcomes', description: 'Post-deployment AI impact' },
  { id: 'register', label: 'Risk Register', description: 'All identified risks' },
  { id: 'agent-profiles', label: 'Agent Profiles', description: 'Agent-specific risk assessment' },
  { id: 'third-party', label: 'Third Party', description: 'Vendor & AI supply chain risk' },
  { id: 'assessments', label: 'Assessments', description: 'Risk evaluation workflows' },
  { id: 'controls', label: 'Controls', description: 'Mitigating controls library' },
  { id: 'issues', label: 'Issues', description: 'Findings & remediation' },
  { id: 'hrais', label: 'EU AI Act', description: 'High-Risk AI System assessment' },
  { id: 'policy-as-code', label: 'Policy as Code', description: 'CI/CD governance gates' },
];

export default function RiskManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    tabFromUrl && TABS.some(t => t.id === tabFromUrl) ? tabFromUrl : 'dashboard'
  );
  const { useCases, loading } = useGovernanceAggregator();

  // Sync tab with URL param (one-way URL→state; activeTab intentionally omitted)
  useEffect(() => {
    if (tabFromUrl && TABS.some(t => t.id === tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'dashboard') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', tab);
    }
    setSearchParams(searchParams, { replace: true });
  };

  // Check if we have use case risk data
  const hasLiveRiskData = useCases.some(uc => uc.computed?.risk_score != null || uc.scores?.risk_governance);

  return (
    <GovernPageLayout
      title="Risk Management"
      description="Enterprise risk register, assessments, controls, and issue tracking for AI/ML systems."
      badge={
        <div className="flex items-center gap-2">
          {hasLiveRiskData && !loading && <LiveDataBadge />}
          <MockDataBadge integration="Controls & Issues need custom backend" />
        </div>
      }
    >
        {/* Unified Guide (How to Use + Make Live in AWS) */}
        <UnifiedGuide {...RISK_GUIDE} />

        {/* Tab navigation */}
        <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit" role="tablist" aria-label="Risk Management sections">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'dashboard' && <RiskDashboard />}
        {activeTab === 'monitoring' && <RealTimeMonitoring />}
        {activeTab === 'outcomes' && <OutcomeMonitoring />}
        {activeTab === 'register' && <RiskRegister />}
        {activeTab === 'agent-profiles' && <AgentRiskProfile />}
        {activeTab === 'third-party' && <ThirdPartyRisk />}
        {activeTab === 'assessments' && <RiskAssessments />}
        {activeTab === 'controls' && <RiskControls />}
        {activeTab === 'issues' && <RiskIssues />}
        {activeTab === 'hrais' && <HRAISAssessment />}
        {activeTab === 'policy-as-code' && <PolicyAsCode />}
    </GovernPageLayout>
  );
}
