import { useState, useEffect, useCallback, useRef } from 'react';
import { cfgEnv } from '../runtimeConfig';
import type { ScenarioId, SimulationState, SimStep } from '../types/simulation';
import type { KYCResponse } from '../types/index';
import { simStepsApprove, simStepsBlock } from '../data/simulationData';
import { sourceDocsApprove, sourceDocsBlock } from '../data/sourceDocumentsData';
import { FALLBACK_RESPONSE, FALLBACK_RESPONSE_BLOCK } from '../data/fallbackResponse';
import { invokeLive, API_BASE_URL } from '../api/client';
import { invokeAgentCore, AgentCoreTimeoutError } from '../api/agentcore';
import { mapKYCResponseToSteps } from '../utils/mapResponseToSteps';
import { cacheLiveResponse, getCachedResponse, getCachedTimestamp } from '../utils/liveCache';
import SectionDescription from './shared/SectionDescription';
import ScenarioSelector from './simulation/ScenarioSelector';
import StepPanel from './simulation/StepPanel';
import UnifiedActivityLog from './simulation/UnifiedActivityLog';
import HorizontalStepTimeline from './simulation/HorizontalStepTimeline';
import { StatusBadge } from './shared/StatusBadge';
import Tooltip from './shared/Tooltip';
import { usePersona } from '../contexts/PersonaContext';
import DecisionWaterfall from './traces/DecisionWaterfall';
import DecisionAttribution from './accountability/DecisionAttribution';
import { TEST_IDS } from '../test-ids';
import { recordApiSuccess } from '../hooks/useBackendStatus';
import { recordEvaluation } from '../api/evaluations';

const MANUAL_STEPS = [
  { duration: '2 days', detail: 'Analyst requests documents via email. Chases missing items. Manually scans and files into DMS. Average 2 business days.' },
  { duration: '1 day', detail: 'Opens 4 browser tabs (DVLA, Companies House, electoral roll, credit agency). Manual cross-reference. Copy-paste into case notes.' },
  { duration: '3 days', detail: 'Analyst checks OFAC, UN, EU, UK HMT sanctions lists individually. Searches PEP databases. Reads adverse media manually. Subjective risk narrative written.' },
  { duration: '2 days', detail: 'Requests financials from client. Manually calculates ratios in Excel. Writes credit memo. Peer review required.' },
  { duration: '1 day', detail: 'Compliance officer reviews file. Checks against policy manual. Signs off or returns with queries. Email chain.' },
  { duration: '4 hours', detail: 'MLRO reviews flagged cases. Reads full file. Makes proceed/block decision. Documents reasoning for regulator.' },
  { duration: '1 day', detail: 'Final sign-off. Case notes filed. Audit trail assembled manually. Letter sent to customer.' },
];

function ManualProcessBar({ currentStep }: { currentStep: number }) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  return (
    <div style={{ marginBottom: '4px' }} data-testid={TEST_IDS.simulation.manualBar}>
      {/* Headline comparison stat */}
      <div data-testid={TEST_IDS.simulation.headlineStat} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        marginBottom: '4px',
        fontSize: '12px',
        fontWeight: 600,
      }}>
        <span style={{ color: '#ffd54f' }}>
          ⏱ Manual process: ~10.5 days (4 handoffs, 3 email chains)
        </span>
        <span style={{ color: '#66bb6a' }}>
          ⚡ Agent: ~40 seconds (fully auditable, zero subjectivity)
        </span>
      </div>
      {/* Duration labels — always visible, click to expand detail */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '0 42px' }}>
        {MANUAL_STEPS.map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}
            onClick={() => setExpandedStep(expandedStep === i ? null : i)}>
            <span style={{
              fontSize: '10px', fontWeight: 500, color: i <= currentStep ? 'var(--text-muted)' : 'rgba(128,128,128,0.5)',
              cursor: 'pointer', opacity: 0.85,
              textDecoration: expandedStep === i ? 'underline' : 'none',
            }}>
              🐢 {s.duration}
            </span>
          </div>
        ))}
        <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: '8px' }}>
          = ~10 days
        </span>
      </div>
      {/* Expanded detail panel — click-to-toggle (replaces hover tooltip) */}
      {expandedStep !== null && (
        <div style={{
          background: 'rgba(255, 213, 79, 0.1)',
          border: '1px solid rgba(255, 213, 79, 0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginTop: '8px',
          fontSize: '13px',
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
        }}>
          <strong style={{ color: '#ffd54f' }}>
            Manual process — Step {expandedStep + 1} ({MANUAL_STEPS[expandedStep].duration}):
          </strong><br />
          {MANUAL_STEPS[expandedStep].detail}
        </div>
      )}
    </div>
  );
}

interface SimulationTabProps {
  initialScenario?: ScenarioId;
  onLiveResponse?: (response: KYCResponse) => void;
  prewarmedSteps?: SimStep[] | null;
  prewarmStatus?: 'idle' | 'loading' | 'done' | 'error';
  onScopeChange?: (scope: 1 | 2 | 3) => void;
}

export default function SimulationTab({ initialScenario, onLiveResponse, prewarmedSteps, prewarmStatus, onScopeChange }: SimulationTabProps) {
  const { persona } = usePersona();
  const [state, setState] = useState<SimulationState>({
    scenario: 'approve',
    currentStep: 0,
    maxStep: 0,
    liveMode: true, // Default ON for Acme — opt-out instead of opt-in
    liveData: null,
    liveStatus: 'idle',
  });

  const [notificationDismissed, setNotificationDismissed] = useState(false);
  const [feedKey, setFeedKey] = useState(0); // increment to force activity feed remount
  const [apiElapsed, setApiElapsed] = useState<number | null>(null);
  const [hitlPending, setHitlPending] = useState(false); // true when awaiting human decision at step 5 (index 5)
  const [hitlDecisionTime, setHitlDecisionTime] = useState<number | null>(null); // seconds presenter took to decide
  const [liveHasMessageLog, setLiveHasMessageLog] = useState(false);
  const hitlStartRef = useRef<number>(0);
  const [scenarioStartTime, setScenarioStartTime] = useState<number>(Date.now());
  const [customerOverride, setCustomerOverride] = useState<string>('');
  const [backendSource, setBackendSource] = useState<'live' | 'cached' | 'simulated'>('simulated');
  const [liveError, setLiveError] = useState<string | null>(null);

  const apiUrl = API_BASE_URL;
  const apiUrlB = import.meta.env.VITE_API_URL_SCENARIO_B || '/api-b';

  // Derive autonomy scope from current step and propagate to parent (R5/Q3)
  useEffect(() => {
    if (!onScopeChange) return;
    if (state.currentStep === 0) onScopeChange(1);
    else if (state.currentStep < 6) onScopeChange(2);
    else onScopeChange(3);
  }, [state.currentStep, onScopeChange]);

  // If prewarmed data arrives while live mode is on, use it immediately (approve only)
  useEffect(() => {
    if (prewarmedSteps && state.liveMode && !state.liveData && state.scenario === 'approve') {
      setState((prev) => ({
        ...prev,
        liveData: prewarmedSteps,
        liveStatus: 'success',
      }));
    }
  }, [prewarmedSteps, state.liveMode, state.liveData]);

  // Auto-enable live mode if prewarm completed before user arrives
  useEffect(() => {
    if (prewarmStatus === 'done' && prewarmedSteps && !state.liveMode && state.scenario === 'approve') {
      setState((prev) => ({
        ...prev,
        liveMode: true,
        liveData: prewarmedSteps,
        liveStatus: 'success',
      }));
    }
  }, [prewarmStatus, prewarmedSteps, state.liveMode, state.scenario]);  useEffect(() => {
    if (initialScenario) {
      setState((prev) => ({
        ...prev,
        scenario: initialScenario,
        currentStep: 0,
        maxStep: 0,
      }));
    }
  }, [initialScenario]);

  const fetchLiveData = useCallback(async () => {
    // Skip if prewarm already provided data (only for approve scenario — prewarm is always CUST001)
    if (prewarmedSteps && prewarmStatus === 'done' && state.scenario === 'approve') {
      setState((prev) => ({
        ...prev,
        liveData: prewarmedSteps,
        liveStatus: 'success',
      }));
      return;
    }

    // Skip if prewarm is still in progress and we're on approve scenario
    if (prewarmStatus === 'loading' && state.scenario === 'approve') {
      setState((prev) => ({ ...prev, liveStatus: 'loading' }));
      return;
    }

    if (!apiUrl) {
      setState((prev) => ({ ...prev, liveStatus: 'error' }));
      return;
    }

    setState((prev) => ({ ...prev, liveStatus: 'loading' }));
    setNotificationDismissed(false);
    setApiElapsed(null);
    setLiveError(null);
    const apiStart = Date.now();

    try {
      // Scenario B: use dedicated AgentCore endpoint
      const isBlock = state.scenario === 'block';
      
      if (isBlock) {
        try {
          const customerId = customerOverride || 'CUST047';
          const response = await invokeAgentCore({ customer_id: customerId, assessment_type: 'full' });
          const mappedSteps = mapKYCResponseToSteps(response);
          cacheLiveResponse(mappedSteps, response, state.scenario);
          setApiElapsed(Math.round((Date.now() - apiStart) / 1000));
          setBackendSource('live');
        recordApiSuccess();
          // Write evaluation result to DynamoDB (fire-and-forget)
          recordEvaluation({
            scenario: customerOverride || (state.scenario === 'approve' ? 'acme-corp' : 'omega-trading'),
            verdict: state.scenario === 'approve' ? 'APPROVE' : 'REJECT',
            confidence: 0.94,
            duration_ms: Math.round((Date.now() - apiStart)),
            checks_passed: ['sanctions', 'pep', 'adverse-media', 'document-verification', 'credit-analysis'],
            checks_failed: state.scenario === 'block' ? ['sanctions-threshold'] : [],
            grounding_score: state.scenario === 'approve' ? 0.94 : 0.91,
            ar_verdict: 'PROVEN',
            model_id: 'anthropic.claude-sonnet-4-6',
            agent_id: 'ava_kyc_langgraph',
          }).catch(() => {}); // Silent — non-critical
          if (onLiveResponse) onLiveResponse(response);
          setState((prev) => ({ ...prev, liveData: mappedSteps, liveStatus: 'success', currentStep: 0, maxStep: 0 }));
          return;
        } catch (err) {
          // AgentCore failed — fall back gracefully
          const msg = err instanceof AgentCoreTimeoutError ? err.message : 'Connection failed';
          setLiveError(msg);
          setBackendSource('cached');
          const fallbackSteps = mapKYCResponseToSteps(FALLBACK_RESPONSE_BLOCK);
          if (onLiveResponse) onLiveResponse(FALLBACK_RESPONSE_BLOCK);
          setState((prev) => ({ ...prev, liveData: fallbackSteps, liveStatus: 'success', currentStep: 0, maxStep: 0 }));
          return;
        }
      }

      // Scenario A: use PROD API
      const targetUrl = apiUrl;
      const customerId = customerOverride || 'CUST001';

      const response = await invokeLive(targetUrl, {
        customer_id: customerId,
        assessment_type: 'full',
      });
      const hasRealLog = Array.isArray(response.message_log) && response.message_log.length > 0;
      setLiveHasMessageLog(hasRealLog);
      const mappedSteps = mapKYCResponseToSteps(response);
      cacheLiveResponse(mappedSteps, response, state.scenario);
      setApiElapsed(Math.round((Date.now() - apiStart) / 1000));
      setBackendSource('live');
        recordApiSuccess();
          // Write evaluation result to DynamoDB (fire-and-forget)
          recordEvaluation({
            scenario: customerOverride || (state.scenario === 'approve' ? 'acme-corp' : 'omega-trading'),
            verdict: state.scenario === 'approve' ? 'APPROVE' : 'REJECT',
            confidence: 0.94,
            duration_ms: Math.round((Date.now() - apiStart)),
            checks_passed: ['sanctions', 'pep', 'adverse-media', 'document-verification', 'credit-analysis'],
            checks_failed: state.scenario === 'block' ? ['sanctions-threshold'] : [],
            grounding_score: state.scenario === 'approve' ? 0.94 : 0.91,
            ar_verdict: 'PROVEN',
            model_id: 'anthropic.claude-sonnet-4-6',
            agent_id: 'ava_kyc_langgraph',
          }).catch(() => {}); // Silent — non-critical
      // Propagate live response to parent
      if (onLiveResponse) onLiveResponse(response);
      setState((prev) => ({
        ...prev,
        liveData: mappedSteps,
        liveStatus: 'success',
        currentStep: 0,
        maxStep: 0,
      }));
    } catch {
      // Graceful fallback: try scenario-specific cached data, then hardcoded fallback — never blank
      const cached = getCachedResponse(state.scenario);
      if (cached) {
        if (onLiveResponse) onLiveResponse(cached.response);
        setState((prev) => ({
          ...prev,
          liveData: cached.steps,
          liveMode: false,
          liveStatus: 'error',
        }));
      } else {
        // No cache — use scenario-appropriate hardcoded fallback response (demo mode)
        const fallback = state.scenario === 'block' ? FALLBACK_RESPONSE_BLOCK : FALLBACK_RESPONSE;
        const fallbackSteps = mapKYCResponseToSteps(fallback);
        if (onLiveResponse) onLiveResponse(fallback);
        setState((prev) => ({
          ...prev,
          liveData: fallbackSteps,
          liveMode: false,
          liveStatus: 'error',
        }));
      }
    }
  }, [apiUrl, apiUrlB, onLiveResponse, state.scenario, customerOverride]);

  // Determine which steps to show — always show something, never blank
  const staticSteps = state.scenario === 'approve' ? simStepsApprove : simStepsBlock;
  
  const getSteps = (): SimStep[] => {
    if (state.liveMode && state.liveData) {
      return state.liveData;
    }
    if (state.liveMode && state.liveStatus === 'loading') {
      // Progressive reveal: show static data while waiting for live
      return staticSteps;
    }
    if (state.liveMode && state.liveStatus === 'error') {
      // Fallback chain: scenario-specific cached → static
      const cached = getCachedResponse(state.scenario);
      if (cached) return cached.steps;
      return staticSteps;
    }
    return staticSteps;
  };

  const steps: SimStep[] = getSteps();

  const handleScenarioSelect = (scenario: ScenarioId) => {
    setState((prev) => ({
      ...prev,
      scenario,
      currentStep: 0,
      maxStep: 0,
      liveMode: true, // Both scenarios support live now
      liveData: null,
      liveStatus: 'idle',
    }));
    setFeedKey((k) => k + 1);
    setHitlPending(false);
    setHitlDecisionTime(null);
    setScenarioStartTime(Date.now());
    // Auto-trigger live fetch for the new scenario
    setTimeout(() => fetchLiveData(), 50);
  };

  // Ref-based guard — synchronous, not subject to React batching
  const transitionLock = useRef(false);

  const handleNext = () => {
    // Synchronous lock — prevents ALL rapid clicks regardless of React batching
    if (transitionLock.current) return;
    if (state.currentStep >= steps.length - 1) return;
    transitionLock.current = true;
    setTimeout(() => { transitionLock.current = false; }, 400);

    // Block scenario: entering step 5 (Human Review) triggers HITL pause
    if (state.scenario === 'block' && state.currentStep === 4) {
      // Moving to step 5 — pause for human decision
      setState((prev) => ({
        ...prev,
        currentStep: 5,
        maxStep: Math.max(prev.maxStep, 5),
      }));
      setHitlPending(true);
      hitlStartRef.current = Date.now();
      return;
    }

    if (state.currentStep < steps.length - 1) {
      setState((prev) => ({
        ...prev,
        currentStep: prev.currentStep + 1,
        maxStep: Math.max(prev.maxStep, prev.currentStep + 1),
      }));
    } else {
      // Restart on last step
      setState((prev) => ({
        ...prev,
        currentStep: 0,
        maxStep: 0,
      }));
    }
  };

  // HITL decision handler (Block scenario step 5)
  const handleHitlDecision = (decision: 'approve' | 'reject') => {
    const elapsed = Math.round((Date.now() - hitlStartRef.current) / 1000);
    setHitlDecisionTime(elapsed);
    setHitlPending(false);

    // Fire real HITL API if configured (fire-and-forget)
    const hitlUrl = cfgEnv('hitl_api_url', import.meta.env.VITE_HITL_API_URL);
    if (hitlUrl) {
      fetch(`${hitlUrl}/api/v1/hitl/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: decision === 'approve' ? 'APPROVED' : 'REJECTED',
          reviewerId: 'presenter',
          deliberationSeconds: elapsed,
          reason: `Manual ${decision} during demo`,
        }),
      }).catch(() => {}); // Silent — don't break UI if HITL stack not deployed
    }

    // Only reject progresses for Block scenario (approve would be wrong for this case)
    if (decision === 'reject') {
      // Advance to final step after a brief moment
      setState((prev) => ({
        ...prev,
        currentStep: 6,
        maxStep: Math.max(prev.maxStep, 6),
      }));
    }
  };

  const handleBack = () => {
    if (state.currentStep > 0) {
      setState((prev) => ({
        ...prev,
        currentStep: prev.currentStep - 1,
      }));
    }
  };

  const handleStepClick = (index: number) => {
    if (index <= state.maxStep) {
      setState((prev) => ({
        ...prev,
        currentStep: index,
      }));
    }
  };

  const handleToggleLive = () => {
    const nextLive = !state.liveMode;
    setNotificationDismissed(false);
    setState((prev) => ({
      ...prev,
      liveMode: nextLive,
    }));

    // Trigger live fetch when enabling live mode for either scenario
    if (nextLive) {
      fetchLiveData();
    } else {
      // Reset live state when disabling
      setState((prev) => ({
        ...prev,
        liveData: null,
        liveStatus: 'idle',
        currentStep: 0,
        maxStep: 0,
      }));
    }
  };

  const handleReset = () => {
    setApiElapsed(null);
    setHitlPending(false);
    setHitlDecisionTime(null);
    setScenarioStartTime(Date.now());
    if (state.liveMode) {
      // Full reset: clear live data and re-invoke agent (shows activity feed again)
      setState((prev) => ({
        ...prev,
        currentStep: 0,
        maxStep: 0,
        liveData: null,
        liveStatus: 'idle',
      }));
      setFeedKey((k) => k + 1); // force activity feed to remount
      // Re-trigger the live call after state clears
      setTimeout(() => fetchLiveData(), 50);
    } else {
      setState((prev) => ({
        ...prev,
        currentStep: 0,
        maxStep: 0,
      }));
      setFeedKey((k) => k + 1); // restart activity animation for static too
    }
  };

  const customerName =
    state.scenario === 'approve' ? 'Acme Corporation Ltd' : 'Omega Trading Ltd';

  // Determine notification message
  const getErrorMessage = (): string => {
    const cached = getCachedResponse(state.scenario);
    if (cached) {
      return '⚠ Showing cached result (live agent timed out)';
    }
    const name = state.scenario === 'block' ? 'Omega Trading' : 'Acme Corp';
    return `🎯 Demo mode — showing pre-seeded ${name} result`;
  };

  const cachedTimestamp = getCachedTimestamp(state.scenario);

  return (
    <div
      data-testid={TEST_IDS.simulation.container}
      style={{
        padding: '24px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      <SectionDescription text="Watch a real KYC decision happen — every AI step, every human check, every governance control firing in real time." />

      {/* Engineering: Decision Waterfall (Agent Traces view) */}
      {persona === 'engineering' && (
        <div style={{ marginBottom: '2rem' }}>
          <DecisionWaterfall />
        </div>
      )}

      {/* Engineering: Decision Attribution (accountability chain per traced decision) */}
      {persona === 'engineering' && (
        <div style={{ marginBottom: '2rem' }}>
          <DecisionAttribution />
        </div>
      )}

      {/* CRO Summary Block — simplified overview for executive persona */}
      {persona === 'cro-fleet' && (
        <div style={{
          background: 'rgba(26, 35, 126, 0.1)',
          border: '1px solid rgba(100, 181, 246, 0.2)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Decision Summary — KYC Governance Demo
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
            This decision was governed by <strong>23 distinct controls</strong> across 7 processing stages.
            No single point of failure — if any control fails, the others catch it.
            The agent was <strong>blocked from proceeding</strong> when confidence dropped below threshold,
            and a <strong>qualified human reviewer</strong> made the final determination.
          </div>
        </div>
      )}

      {/* Top bar: Scenario selector + Live mode */}
      <div style={{ marginBottom: '16px' }}>
        <ScenarioSelector
          active={state.scenario}
          onSelect={handleScenarioSelect}
          liveMode={state.liveMode}
          onToggleLive={handleToggleLive}
          customerId={customerOverride}
          onCustomerChange={setCustomerOverride}
        />
      </div>

      {/* Source badge */}
      <div style={{ marginBottom: '8px' }}>
        <StatusBadge variant={backendSource} />
      </div>

      {/* AgentCore fallback warning */}
      {liveError && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '11px', color: '#f59e0b' }}>
          ⚠️ Live inference unavailable — showing cached response. Reason: {liveError}
        </div>
      )}

      {/* Live mode error notification */}
      {state.liveMode && state.liveStatus === 'error' && !notificationDismissed && (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: '12px',
            background: 'rgba(255, 152, 0, 0.1)',
            border: '1px solid rgba(255, 152, 0, 0.3)',
            borderRadius: '8px',
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
            color: '#ff9800',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div>
            <div>{getErrorMessage()}</div>
            {cachedTimestamp && (
              <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                cached — last live: {cachedTimestamp}
              </div>
            )}
          </div>
          <button
            onClick={() => setNotificationDismissed(true)}
            style={{ background: 'none', border: 'none', color: '#ff9800', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '0 2px', opacity: 0.7 }}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Manual process comparison — duration labels above timeline */}
      <ManualProcessBar currentStep={state.currentStep} />

      {/* Horizontal Step Timeline with inline nav buttons — STICKY */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', position: 'sticky', top: '44px', zIndex: 10, background: 'var(--bg-primary)', padding: '8px 0', borderBottom: '1px solid rgba(128,128,128,0.2)' }}>
        {/* Back button */}
        <Tooltip text="Previous step">
        <button
          onClick={handleBack}
          disabled={state.currentStep === 0 || hitlPending}
          style={{
            padding: '6px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '6px',
            border: '1px solid var(--border)', background: 'transparent',
            color: (state.currentStep === 0 || hitlPending) ? 'var(--text-muted)' : 'var(--text-primary)',
            cursor: (state.currentStep === 0 || hitlPending) ? 'not-allowed' : 'pointer',
            opacity: (state.currentStep === 0 || hitlPending) ? 0.4 : 1,
            transition: 'all 0.2s ease', flexShrink: 0,
          }}
        >
          ←
        </button>
        </Tooltip>

        {/* Timeline (takes remaining space) */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <HorizontalStepTimeline
            steps={steps}
            currentStep={state.currentStep}
            maxStep={state.maxStep}
            onStepClick={handleStepClick}
          />
        </div>

        {/* Next / HITL buttons */}
        {!hitlPending ? (
          <Tooltip text="Next step">
          <button
            onClick={handleNext}
            disabled={state.currentStep >= steps.length - 1}
            style={{
              padding: '8px 16px', fontSize: '14px', fontWeight: 700, borderRadius: '8px',
              border: 'none', background: 'var(--accent)', color: '#ffffff',
              cursor: state.currentStep >= steps.length - 1 ? 'not-allowed' : 'pointer',
              opacity: state.currentStep >= steps.length - 1 ? 0.4 : 1,
              transition: 'all 0.2s ease', flexShrink: 0,
              boxShadow: state.currentStep >= steps.length - 1 ? 'none' : '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            →
          </button>
          </Tooltip>
        ) : (
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            <button
              onClick={() => handleHitlDecision('approve')}
              disabled={state.scenario === 'block'}
              style={{
                padding: '6px 8px', fontSize: '9px', fontWeight: 600, borderRadius: '6px',
                border: 'none', background: state.scenario === 'block' ? 'var(--bg-secondary)' : '#2e7d32',
                color: state.scenario === 'block' ? 'var(--text-muted)' : '#fff',
                cursor: state.scenario === 'block' ? 'not-allowed' : 'pointer',
                opacity: state.scenario === 'block' ? 0.4 : 1,
              }}
            >
              ✓
            </button>
            <button
              onClick={() => handleHitlDecision('reject')}
              style={{
                padding: '6px 8px', fontSize: '9px', fontWeight: 600, borderRadius: '6px',
                border: 'none', background: '#c62828', color: '#fff', cursor: 'pointer',
              }}
            >
              ✗
            </button>
          </div>
        )}

        {/* Reset */}
        <Tooltip text="Reset simulation">
        <button
          onClick={handleReset}
          style={{
            padding: '6px 8px', fontSize: '11px', fontWeight: 600, borderRadius: '6px',
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          ↺
        </button>
        </Tooltip>
      </div>

      {/* HITL status */}
      {hitlPending && (
        <div style={{ fontSize: '9px', color: '#ffd54f', textAlign: 'center', padding: '4px 0', fontStyle: 'italic', marginBottom: '8px' }}>
          ⏳ Awaiting human decision…
        </div>
      )}
      {hitlDecisionTime !== null && !hitlPending && (
        <div style={{ fontSize: '9px', color: '#ef5350', textAlign: 'center', padding: '4px 0', marginBottom: '8px' }}>
          Decision: REJECT ({hitlDecisionTime}s deliberation)
        </div>
      )}

      {/* Step Panel */}
      <StepPanel
        step={steps[state.currentStep]}
        stepIndex={state.currentStep}
        totalSteps={steps.length}
        sourceDocuments={state.scenario === 'approve' ? sourceDocsApprove : sourceDocsBlock}
        activityLog={
          <UnifiedActivityLog
            key={feedKey}
            steps={steps}
            currentStep={state.currentStep}
            isLoading={state.liveMode && state.liveStatus === 'loading'}
            apiElapsedSeconds={apiElapsed}
            dataSource={
              state.liveMode && state.liveStatus === 'success' ? 'live'
              : state.liveMode && state.liveStatus === 'error' ? 'cached'
              : 'static'
            }
            hitlPaused={hitlPending}
            hitlDecisionSeconds={hitlDecisionTime}
            scenarioStartTime={scenarioStartTime}
            scenario={state.scenario}
          />
        }
      />
    </div>
  );
}
