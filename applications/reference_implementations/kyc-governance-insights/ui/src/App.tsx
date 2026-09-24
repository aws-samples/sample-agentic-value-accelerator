import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import TabBar from './components/TabBar';
import GuidedTour from './components/GuidedTour';
import OverviewTab from './components/tabs/OverviewTab';
import PersonaSelector from './components/PersonaSelector';
import TabErrorBoundary from './components/shared/TabErrorBoundary';
import FleetDashboard from './components/fleet/FleetDashboard';
import PresentationMode from './components/presentation/PresentationMode';
import BasicModeView from './components/BasicMode/BasicModeView';
import { PersonaProvider, usePersona } from './contexts/PersonaContext';
import { PolicyConfigProvider } from './contexts/PolicyConfigContext';
import { PERSONA_TABS } from './config/personaTabs';
import { FALLBACK_RESPONSE } from './data/fallbackResponse';
import { invokeLive, API_BASE_URL } from './api/client';
import { callLLMJudge, callDeterministicCheck } from './api/governanceControls';
import type { JudgeScores } from './api/governanceControls';
import { mapKYCResponseToSteps } from './utils/mapResponseToSteps';
import { cacheLiveResponse, getCachedResponse } from './utils/liveCache';
import type { TabId } from './types/tabs';
import type { ScenarioId, SimStep } from './types/simulation';
import type { KYCResponse } from './types/index';
import { useTheme } from './hooks/useTheme';
import { useOfflineMode } from './hooks/useOfflineMode';

// Code-split: lazy-load all tabs except Overview (landing page)
const SimulationTab = lazy(() => import('./components/SimulationTab'));
const ComplianceAuditTab = lazy(() => import('./components/tabs/ComplianceAuditTab'));
const RiskRegisterTab = lazy(() => import('./components/tabs/RiskRegisterTab'));
const GovernanceTab = lazy(() => import('./components/tabs/GovernanceTab'));
const CedarPolicyTab = lazy(() => import('./components/tabs/CedarPolicyTab'));
const ArchitectureTab = lazy(() => import('./components/tabs/ArchitectureTab'));
const KYCReportTab = lazy(() => import('./components/tabs/KYCReportTab'));
const TalkingPointsTab = lazy(() => import('./components/tabs/TalkingPointsTab'));
const MoreInfoTab = lazy(() => import('./components/tabs/MoreInfoTab'));
const EvidenceTrailTab = lazy(() => import('./components/tabs/EvidenceTrailTab'));
const ReviewQueueTab = lazy(() => import('./components/tabs/ReviewQueueTab'));
const ROIProjectionTab = lazy(() => import('./components/tabs/ROIProjectionTab'));
const OperationsTab = lazy(() => import('./components/tabs/OperationsTab'));
const EvaluationsTab = lazy(() => import('./components/tabs/EvaluationsTab'));

function AppInner() {
  const { theme, toggle } = useTheme();
  const { persona, isFleetView } = usePersona();
  const offline = useOfflineMode();
  const tabs = PERSONA_TABS[persona];
  // Land on the persona's first (Tier 1) tab, not a hardcoded depth view.
  const [activeTab, setActiveTab] = useState<TabId>(() => tabs[0]?.id ?? 'governance');

  const [appMode, setAppMode] = useState<'basic' | 'advanced'>(() => {
    if (typeof window === 'undefined') return 'basic';
    return (localStorage.getItem('app-mode') as 'basic' | 'advanced') || 'basic';
  });

  const handleModeChange = (mode: 'basic' | 'advanced') => {
    setAppMode(mode);
    localStorage.setItem('app-mode', mode);
  };

  // On persona switch, always land on that persona's entry (tabs[0]). Do NOT retain a
  // tab shared across personas (e.g. the generic 'simulation' tab exists in every
  // persona), which previously caused personas to land on the wrong tab.
  useEffect(() => {
    if (tabs.length > 0) setActiveTab(tabs[0].id);
  }, [persona, tabs]);
  const [initialScenario, setInitialScenario] = useState<ScenarioId | undefined>();
  const [liveResponse, setLiveResponse] = useState<KYCResponse | null>(null);
  const [prewarmedSteps, setPrewarmedSteps] = useState<SimStep[] | null>(null);
  const [prewarmStatus, setPrewarmStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [judgeScores, setJudgeScores] = useState<JudgeScores | null>(null);
  const prewarmStarted = useRef(false);

  // Pre-warm: fire the live API call on app load (background, silent)
  useEffect(() => {
    if (prewarmStarted.current) return;
    prewarmStarted.current = true;

    // Skip API calls in offline mode
    if (offline) {
      const fallbackSteps = mapKYCResponseToSteps(FALLBACK_RESPONSE);
      setLiveResponse(FALLBACK_RESPONSE);
      setPrewarmedSteps(fallbackSteps);
      setPrewarmStatus('done');
      return;
    }

    const apiUrl = API_BASE_URL;
    setPrewarmStatus('loading');

    invokeLive(apiUrl, { customer_id: 'CUST001', assessment_type: 'full' })
      .then(async (response) => {
        // Fire governance controls in parallel (non-blocking — enhance steps if available)
        const [judgeScores, deterministicResult] = await Promise.all([
          callLLMJudge(response.summary || '').catch(() => null),
          callDeterministicCheck(
            { total_assets: 75000000, total_liabilities: 25000000, current_assets: 42000000, current_liabilities: 20000000, revenue: 87000000, net_income: 8500000, payments_on_time: 48, payments_total: 50 },
            { de_ratio: 0.33, current_ratio: 2.1, net_margin: 0.098, payment_pct: 96.0 },
          ).catch(() => null),
        ]);

        const steps = mapKYCResponseToSteps(response, { judgeScores, deterministicResult });
        cacheLiveResponse(steps, response);
        setLiveResponse(response);
        setPrewarmedSteps(steps);
        if (judgeScores) setJudgeScores(judgeScores);
        setPrewarmStatus('done');
      })
      .catch(() => {
        // Silent failure — try cached, then hardcoded fallback
        const cached = getCachedResponse();
        if (cached) {
          setLiveResponse(cached.response);
          setPrewarmedSteps(cached.steps);
        } else {
          // Hardcoded fallback — demo never breaks
          const fallbackSteps = mapKYCResponseToSteps(FALLBACK_RESPONSE);
          setLiveResponse(FALLBACK_RESPONSE);
          setPrewarmedSteps(fallbackSteps);
        }
        setPrewarmStatus('error');
      });
  }, []);

  const handleNavigate = (tab: TabId, scenario?: ScenarioId) => {
    setActiveTab(tab);
    if (scenario) setInitialScenario(scenario);
  };

  const handleLiveResponse = (response: KYCResponse) => {
    setLiveResponse(response);
  };

  return (
    <PresentationMode onTabChange={setActiveTab}>
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Always-visible header controls */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px', gap: '8px', alignItems: 'center' }}>
        {/* Basic/Advanced Toggle */}
        <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <button onClick={() => handleModeChange('basic')} style={{ padding: '4px 10px', fontSize: '9px', fontWeight: 600, border: 'none', cursor: 'pointer', background: appMode === 'basic' ? 'rgba(59,130,246,0.2)' : 'transparent', color: appMode === 'basic' ? 'var(--accent)' : 'var(--text-muted)' }}>Basic</button>
          <button onClick={() => handleModeChange('advanced')} style={{ padding: '4px 10px', fontSize: '9px', fontWeight: 600, border: 'none', cursor: 'pointer', background: appMode === 'advanced' ? 'rgba(59,130,246,0.2)' : 'transparent', color: appMode === 'advanced' ? 'var(--accent)' : 'var(--text-muted)' }}>Advanced</button>
        </div>
        {appMode === 'advanced' && <PersonaSelector />}
        {offline && (
          <span style={{ fontSize: '9px', fontWeight: 600, padding: '3px 7px', borderRadius: '4px', background: 'rgba(100,116,139,0.2)', color: '#94a3b8' }}>
            OFFLINE
          </span>
        )}
        <button onClick={toggle} style={{ fontSize: 22, background: 'var(--bg-card)', border: '2px solid var(--accent)', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }} aria-label="Toggle theme" title="Switch light/dark mode">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      {appMode === 'basic' ? (
        <BasicModeView />
      ) : (
        <>
          <GuidedTour />
          <div style={{ position: 'relative' }}>
            {tabs.length > 0 && <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />}
          </div>
          {isFleetView ? (
            <FleetDashboard />
          ) : (
          <main style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {activeTab === 'overview' && (
          <TabErrorBoundary tabName="Overview"><OverviewTab onNavigate={handleNavigate} /></TabErrorBoundary>
        )}
        <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>}>
          {activeTab === 'compliance-audit' && <TabErrorBoundary tabName="Compliance & Audit"><ComplianceAuditTab /></TabErrorBoundary>}
          {activeTab === 'risk-register' && <TabErrorBoundary tabName="Risk Register"><RiskRegisterTab /></TabErrorBoundary>}
          {activeTab === 'governance' && <TabErrorBoundary tabName="Governance"><GovernanceTab judgeScores={judgeScores} /></TabErrorBoundary>}
          {activeTab === 'cedar-policy' && <TabErrorBoundary tabName="Cedar Policies"><CedarPolicyTab /></TabErrorBoundary>}
          {activeTab === 'architecture' && <TabErrorBoundary tabName="Architecture"><ArchitectureTab /></TabErrorBoundary>}
          {activeTab === 'simulation' && (
            <TabErrorBoundary tabName="Agent Execution">
              <SimulationTab
                initialScenario={initialScenario}
                onLiveResponse={handleLiveResponse}
                prewarmedSteps={prewarmedSteps}
                prewarmStatus={prewarmStatus}
              />
            </TabErrorBoundary>
          )}
          {activeTab === 'kyc-report' && <TabErrorBoundary tabName="KYC Report"><KYCReportTab liveResponse={liveResponse} onNavigate={(tab) => setActiveTab(tab)} /></TabErrorBoundary>}
          {activeTab === 'more-info' && <TabErrorBoundary tabName="More Info"><MoreInfoTab /></TabErrorBoundary>}
          {activeTab === 'evidence-trail' && <TabErrorBoundary tabName="Evidence Trail"><EvidenceTrailTab /></TabErrorBoundary>}
          {activeTab === 'review-queue' && <TabErrorBoundary tabName="Review Queue"><ReviewQueueTab /></TabErrorBoundary>}
          {activeTab === 'roi-projection' && <TabErrorBoundary tabName="ROI Projection"><ROIProjectionTab /></TabErrorBoundary>}
          {activeTab === 'operations' && <TabErrorBoundary tabName="Operations"><OperationsTab /></TabErrorBoundary>}
          {activeTab === 'evaluations' && <TabErrorBoundary tabName="Evaluations"><EvaluationsTab /></TabErrorBoundary>}
          {activeTab === 'talking-points' && <TabErrorBoundary tabName="Talking Points"><TalkingPointsTab /></TabErrorBoundary>}
        </Suspense>
      </main>
          )}
        </>
      )}
    </div>
    </PresentationMode>
  );
}

export default function App() {
  return (
    <PersonaProvider>
      <PolicyConfigProvider>
        <AppInner />
      </PolicyConfigProvider>
    </PersonaProvider>
  );
}
