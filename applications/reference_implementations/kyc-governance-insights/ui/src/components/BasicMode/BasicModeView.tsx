import React, { useState, useEffect, useRef } from 'react';
import { BASIC_STEPS, RISK_DIALS } from '../../data/basicModeContent';
import InfoPanel from '../shared/InfoPanel';
import type { InfoItem } from '../../data/infoContent';
import { evaluateAuthorization, type AuthzResult } from '../../api/cedar';
import { cfgEnv } from '../../runtimeConfig';
import { checkGrounding, type GroundingResult } from '../../api/grounding';
import { checkAutomatedReasoning, type ARResult } from '../../api/automated-reasoning';
import { fetchAgentRegistry, type RegistryAgent } from '../../api/registry';
import { checkDeterministic, type ValidatorResult } from '../../api/validator';
import { getLiveFailure, LIVE_SERVICE_LABELS, type LiveService } from '../../api/liveStatus';
import { recordEvaluation } from '../../api/evaluations';

type Scenario = 'approve' | 'block';

// Raw financial inputs + the agent's claimed figures for each scenario. The live
// deterministic validator RECOMPUTES the ratios from `raw` and checks them against
// `claimed` — producing exactly the scripted numbers (Acme D/E 0.33 pass / Omega
// 5.43 fail) but by genuine arithmetic, not a stored result. Feeds an additive badge.
const VALIDATOR_FIXTURES: Record<Scenario, { raw: Record<string, number>; claimed: Record<string, number> }> = {
  approve: {
    raw: { total_liabilities: 3_300_000, total_equity: 10_000_000, current_assets: 21_000_000, current_liabilities: 10_000_000, on_time_payments: 48, total_payments: 50 },
    claimed: { debt_to_equity: 0.33, current_ratio: 2.1, payment_history_pct: 96 },
  },
  block: {
    raw: { total_liabilities: 5_430_000, total_equity: 1_000_000, current_assets: 800_000, current_liabilities: 1_000_000, on_time_payments: 62, total_payments: 100 },
    claimed: { debt_to_equity: 5.43, current_ratio: 0.8, payment_history_pct: 62 },
  },
};

// Scenario-faithful source/response text for the live deterministic grounding +
// automated-reasoning checks. The wording mirrors the scripted narrative so the
// live result CONFIRMS the story (response is faithful to the source) rather than
// altering it. These feed additive "verified live" badges only.
const GROUNDING_FIXTURES: Record<Scenario, { source: string; query: string; response: string }> = {
  approve: {
    source: 'Acme Corporation Ltd FY2025 accounts: revenue $60M, net income $8.5M, debt-to-equity 0.33, current ratio 2.1x, 96% on-time payments. Sanctions, PEP and adverse-media screens all clear.',
    query: 'Summarise the KYC financial and compliance risk for Acme Corporation Ltd.',
    response: 'Acme Corporation Ltd is low financial risk — debt-to-equity 0.33, current ratio 2.1x, strong payment history — and its sanctions and PEP screens are clear.',
  },
  block: {
    source: 'Omega Trading Ltd: £5M turnover claim against only 45 payments, debt-to-equity 5.43, 92% OFSI sanctions fuzzy match on its beneficial owner, and a Level-3 PEP director.',
    query: 'Summarise the KYC financial and compliance risk for Omega Trading Ltd.',
    response: 'Omega Trading Ltd is high risk — extreme leverage (debt-to-equity 5.43), a 92% OFSI sanctions match on its beneficial owner, and a Level-3 PEP director — enhanced due diligence required.',
  },
};

// --- Metric info for clickable dashboard dials ---
// Each dial is a COMPOSITE of several controls, not a single check. Numbers shown
// on the dials are illustrative (staged per step); the descriptions below reflect
// the real controls that would feed each signal.
const METRIC_INFO: Record<string, InfoItem> = {
  accuracy: {
    id: 'metric-accuracy',
    shortTooltip: 'Composite output-trust score',
    panelTitle: 'Accuracy',
    panelDescription: 'A composite measure of how trustworthy the agent output is — not a single check. It blends whether claims are grounded in the source documents, an independent AI judge scoring faithfulness and quality, and non-AI code that recomputes the underlying figures.',
    contributors: [
      'Bedrock Contextual Grounding — are claims supported by the source data?',
      'LLM-as-Judge (Claude) — independent faithfulness & quality score',
      'Deterministic Lambda validators — recompute ratios/figures, catch fabricated numbers',
    ],
    whyItMatters: 'Threshold: < 85% → escalate to human review. No single control is enough — grounding, an independent judge, and hard math together make accuracy difficult to fake.',
  },
  security: {
    id: 'metric-security',
    shortTooltip: 'Composite guardrail + authorization score',
    panelTitle: 'Security',
    panelDescription: 'A composite of the controls that keep the agent within safe bounds: content filtering in and out, external authorization on every action, and runtime isolation. It is not just the guardrail pass rate.',
    contributors: [
      'Bedrock Guardrails (input + output) — prompt injection, jailbreaks, PII, harmful content',
      'Verified Permissions (Cedar) — authorization / blast-radius limits on each action',
      'AgentCore session isolation & tool rate limits',
    ],
    whyItMatters: 'Threshold: < 90% → alert ops. Security is layered — guardrails catch content, Cedar caps authority; neither alone is sufficient.',
  },
  compliance: {
    id: 'metric-compliance',
    shortTooltip: 'Cedar policy pass rate (3-layer cascade)',
    panelTitle: 'Compliance',
    panelDescription: 'Pass rate across the 19 Cedar policies in Verified Permissions, evaluated as a three-layer cascade (Organization → Application → Request) with most-restrictive-wins. Reflects how often an action clears every layer without a FORBID or escalation.',
    contributors: [
      'Organization layer (ORG-001..006) — global hard blocks: amount, sanctions > 85, PEP >= 3, jurisdiction, residency, UBO depth',
      'Application layer (APP-001..006) — agent-type limits: tier ceilings, tool restrictions, risk >= 80',
      'Request layer (REQ-001..006) — per-invocation gates: tier/sanctions, PEP, business hours',
    ],
    whyItMatters: 'A FORBID at any layer blocks the action outright (e.g. ORG-003 sanctions > 85, ORG-004 PEP level >= 3). Most-restrictive-wins: a permit cannot override a forbid.',
  },
  product: {
    id: 'metric-product',
    shortTooltip: 'Composite credit + AML risk',
    panelTitle: 'Product Risk',
    panelDescription: 'A composite credit and financial-crime risk score for the customer. The agent synthesises it from credit standing, leverage ratios, sanctions/PEP screening and adverse media — and deterministic checks independently re-verify the figures.',
    contributors: [
      'AgentCore reasoning — composite risk synthesis',
      'Deterministic Lambda — independent ratio/threshold recomputation',
      'Sanctions / PEP / adverse-media screening',
    ],
    whyItMatters: 'Threshold: > 75 → Enhanced Due Diligence. A score >= 80 trips the APP-006 risk hard-block.',
  },
  legal: {
    id: 'metric-legal',
    shortTooltip: 'Regulatory defensibility score',
    panelTitle: 'Legal',
    panelDescription: 'How defensible the decision would be to a regulator — a function of how completely it is covered by policy controls and how complete the evidence trail is.',
    contributors: [
      'Cedar policy coverage vs required regulatory controls',
      'Evidence-pack completeness — artefacts retained per decision',
      'Immutable audit trail — AgentCore Evaluations + CloudWatch',
    ],
    whyItMatters: 'Threshold: < 80% → flag for legal review. Answers the question: could we defend this decision to a regulator?',
  },
};

// --- Additive "verified live" badge (same visual language as the Cedar badge) ---
// Appears ONLY when a real deterministic call succeeds; never replaces scripted text.
function LiveBadge({ text, tone = 'ok', title }: { text: string; tone?: 'ok' | 'deny'; title?: string }) {
  const color = tone === 'deny' ? '#ef4444' : '#10b981';
  const bg = tone === 'deny' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)';
  return (
    <span title={title} style={{ fontSize: '0.62rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', color, background: bg, border: `1px solid ${color}66`, display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} /> {text}
    </span>
  );
}

// --- Confidence Gauge (shows "—" for 0/unknown) ---
function ConfidenceGauge({ value, label, onClick }: { value: number; label: string; onClick?: () => void }) {
  const r = 40;
  const circ = Math.PI * r;
  const isUnknown = value === 0;
  const offset = isUnknown ? circ : circ - (value / 100) * circ;
  const color = isUnknown ? '#475569' : value >= 80 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div
      onClick={onClick}
      style={{ textAlign: 'center', cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.15s, box-shadow 0.15s', borderRadius: '8px', padding: '4px' }}
      onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'; } }}
      onMouseLeave={(e) => { if (onClick) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; } }}
    >
      <svg width="90" height="55" viewBox="0 0 100 60">
        <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" />
        <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${circ}`} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1.5s ease-out, stroke 0.5s' }} />
        <text x="50" y="50" textAnchor="middle" fontSize="14" fontWeight="700" fill={color}>
          {isUnknown ? '—' : `${value}%`}
        </text>
      </svg>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '-4px' }}>{label}</div>
    </div>
  );
}

// --- Token Spend Bar ---
function TokenSpendBar({ tokens, cost }: { tokens: number; cost: string }) {
  const pct = Math.min(100, (tokens / 5000) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', minWidth: '80px' }}>Token Spend:</span>
      <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: '3px', transition: 'width 0.8s ease-out' }} />
      </div>
      <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', minWidth: '100px' }}>{tokens.toLocaleString()} ({cost})</span>
    </div>
  );
}

// Governance Architecture image shown per stage.
// Intro (currentStep -1) → base.png · steps 1–5 (index 0–4) → 1.png · step 6 onward (index ≥5) → 2.png
function architectureImage(currentStep: number): string {
  const name = currentStep < 0 ? 'base.png' : currentStep < 5 ? '1.png' : '2.png';
  return `${import.meta.env.BASE_URL}${name}`;
}

// Builds the AVP is-authorized request for the current scenario, sent to the live
// cedar-proxy /evaluate. Attributes mirror the narrative so the live decision matches
// the story: Omega (block) = 92% sanctions, PEP L3, £2.5M; Acme (approve) = clean, £100k.
function buildCedarPayload(scenario: Scenario) {
  const block = scenario === 'block';
  const cust = block ? 'omega-trading-001' : 'acme-corp-001';
  return {
    principal: { entityType: 'AgentCore::Governance::Agent', entityId: 'credit-analyst' },
    action: { actionType: 'AgentCore::Governance::Action', actionId: 'ApproveApplication' },
    resource: { entityType: 'AgentCore::Governance::CustomerRecord', entityId: cust },
    context: { contextMap: { request_hour: { long: 12 } } },
    entities: { entityList: [
      {
        identifier: { entityType: 'AgentCore::Governance::Agent', entityId: 'credit-analyst' },
        attributes: { agent_id: { string: 'credit-analyst' }, agent_role: { string: 'credit' }, current_tier: { long: 2 }, deployment_region: { string: 'UK' }, model_id: { string: 'claude' }, max_credit_amount: { long: 1000000 }, jurisdiction_allowlist: { set: [{ string: 'UK' }] } },
        parents: [{ entityType: 'AgentCore::Governance::AgentGroup', entityId: 'AllAgents' }],
      },
      { identifier: { entityType: 'AgentCore::Governance::AgentGroup', entityId: 'AllAgents' }, attributes: {}, parents: [] },
      {
        identifier: { entityType: 'AgentCore::Governance::CustomerRecord', entityId: cust },
        attributes: {
          customer_id: { string: cust }, jurisdiction: { string: 'UK' }, incorporation_country: { string: 'GB' },
          risk_tier: { string: block ? 'HIGH' : 'LOW' }, risk_score: { long: block ? 81 : 22 },
          requested_facility_amount: { long: block ? 2500000 : 100000 }, currency: { string: 'GBP' },
          pep_level: { long: block ? 3 : 0 }, sanctions_fuzzy_match_score: { long: block ? 92 : 0 },
          matched_list: { string: block ? 'OFSI' : 'none' }, credit_score: { long: block ? 610 : 750 },
          years_in_business: { long: block ? 3 : 10 }, ubo_chain_depth: { long: block ? 3 : 1 }, data_residency_region: { string: 'UK' },
        },
        parents: [],
      },
    ] },
  };
}

// --- Main Component ---
export default function BasicModeView() {
  // currentStep === -1 is the intro ("Initial architecture, setup & configuration").
  // Steps 1–7 keep their 0-based indices (0–6) so HITL/escalation logic keyed to
  // currentStep === 5/6 is unaffected.
  const [currentStep, setCurrentStep] = useState(-1);
  const [scenario, setScenario] = useState<Scenario>('approve');
  const [hitlDecision, setHitlDecision] = useState<'approve' | 'reject' | null>(null);
  const [infoMetric, setInfoMetric] = useState<string | null>(null);
  const [liveCedar, setLiveCedar] = useState<AuthzResult | null>(null);
  const [liveGrounding, setLiveGrounding] = useState<GroundingResult | null>(null);
  const [liveAR, setLiveAR] = useState<ARResult | null>(null);
  const [liveRegistry, setLiveRegistry] = useState<RegistryAgent[] | null>(null);
  const [liveValidator, setLiveValidator] = useState<ValidatorResult | null>(null);
  const [hitlRecorded, setHitlRecorded] = useState(false);
  const [evalRecorded, setEvalRecorded] = useState(false);
  const [apiOffline, setApiOffline] = useState(false);
  // Which live controls did NOT answer, and why. Every api/* helper returns null on failure
  // so the page cannot break, which also means a failed control looks exactly like a healthy
  // one with nothing to show. Recording the reason here lets the telemetry panel at the
  // bottom say plainly that what is on screen is scripted, not verified.
  const [liveFailures, setLiveFailures] = useState<Partial<Record<LiveService, string>>>({});
  const escalationFiredRef = useRef(false);

  // Record the outcome of a live-verification call. Pass the resolved value: null/undefined
  // means the call did not succeed, and the reason the api helper recorded is picked up here.
  const noteLive = (service: LiveService, result: unknown): void => {
    const reason =
      result === null || result === undefined
        ? getLiveFailure(service) ?? 'the call did not return a result'
        : undefined;
    setLiveFailures((prev) => {
      if (reason) return prev[service] === reason ? prev : { ...prev, [service]: reason };
      if (!(service in prev)) return prev;
      const next = { ...prev };
      delete next[service];
      return next;
    });
  };

  // For calls made inline in this component (the HITL escalation), where no api/* helper
  // recorded a reason for us.
  const noteLiveFailure = (service: LiveService, reason: string): void =>
    setLiveFailures((prev) => (prev[service] === reason ? prev : { ...prev, [service]: reason }));
  const evalRecordedRef = useRef(false);

  useEffect(() => {
    if (scenario === 'block' && currentStep === 5 && !escalationFiredRef.current) {
      escalationFiredRef.current = true;
      // Read from runtime-config (same as api/cedar.ts + api/hitl.ts). Previously used
      // build-time VITE_ vars, which are undefined on the deployed sites → always "Offline".
      const hitlUrl = cfgEnv('hitl_api_url', import.meta.env.VITE_HITL_API_URL);
      const apiKey = cfgEnv('api_key', import.meta.env.VITE_API_KEY);
      const tenantId = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';
      if (hitlUrl) {
        fetch(`${hitlUrl}/api/v1/hitl/escalate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, ...(apiKey ? { 'x-api-key': apiKey } : {}) },
          body: JSON.stringify({ case_id: 'omega-trading-001', customer: 'Omega Trading Ltd', risk_score: 78, reason: 'sanctions_match', recommended_action: 'BLOCK' }),
        }).then((r) => {
          if (r.ok) { setApiOffline(false); setHitlRecorded(true); noteLive('hitl', true); }
          else { setApiOffline(true); noteLiveFailure('hitl', `HTTP ${r.status} from the HITL store`); }
        }).catch((err) => {
          setApiOffline(true);
          noteLiveFailure('hitl', `could not reach the HITL store — ${err instanceof Error ? err.message : 'network error'}`);
        });
      } else {
        setApiOffline(true);
        noteLiveFailure('hitl', 'not configured — "hitl_api_url" is missing from runtime-config.json');
      }
    }
    if (currentStep !== 5) {
      escalationFiredRef.current = false;
    }
  }, [currentStep, scenario]);

  // Live Cedar decision: once the assessment reaches the policy-decision stage, call the
  // real cedar-proxy. Result drives the "Verified live by Cedar" badge. Null (offline/CORS/
  // timeout) → no badge, staged values stand — the demo never breaks.
  useEffect(() => {
    let cancelled = false;
    if (currentStep >= 4) {
      evaluateAuthorization(buildCedarPayload(scenario)).then((r) => { if (!cancelled) { noteLive('cedar', r); setLiveCedar(r); } });
    } else {
      setLiveCedar(null);
    }
    return () => { cancelled = true; };
  }, [currentStep, scenario]);

  // Live Contextual Grounding (Bedrock Guardrails) — fires when the Specialist Assessment
  // step (id 4, index 3) is reached, the point where the 'grounding' control lights up.
  // Confirms the assessment text is faithful to the source; null → badge simply hidden.
  useEffect(() => {
    let cancelled = false;
    if (currentStep >= 3) {
      const g = GROUNDING_FIXTURES[scenario];
      checkGrounding(g.source, g.query, g.response).then((r) => { if (!cancelled) { noteLive('grounding', r); setLiveGrounding(r); } });
    } else {
      setLiveGrounding(null);
    }
    return () => { cancelled = true; };
  }, [currentStep, scenario]);

  // Live Deterministic Validator — fires at Specialist Assessment (id 4, index 3),
  // where "Lambda validator independently confirmed all figures" appears. Real Lambda
  // recompute from raw inputs; deterministic → matches the scripted ratios exactly.
  useEffect(() => {
    let cancelled = false;
    if (currentStep >= 3) {
      const f = VALIDATOR_FIXTURES[scenario];
      checkDeterministic(f.raw, f.claimed).then((r) => { if (!cancelled) { noteLive('validator', r); setLiveValidator(r); } });
    } else {
      setLiveValidator(null);
    }
    return () => { cancelled = true; };
  }, [currentStep, scenario]);

  // Live Automated Reasoning — fires at the Overall Assessment step (id 5, index 4),
  // where the 'automated-reasoning' control lights up. Deterministic; graceful fallback.
  useEffect(() => {
    let cancelled = false;
    if (currentStep >= 4) {
      const g = GROUNDING_FIXTURES[scenario];
      checkAutomatedReasoning(g.response, [g.source]).then((r) => { if (!cancelled) { noteLive('automated-reasoning', r); setLiveAR(r); } });
    } else {
      setLiveAR(null);
    }
    return () => { cancelled = true; };
  }, [currentStep, scenario]);

  // Record a REAL evaluation run — once the decision is known (Overall Assessment,
  // index >= 4), persist the genuinely-computed signals (Cedar verdict, grounding
  // score, AR verdict, deterministic checks) to the evaluation store. Fire-and-forget,
  // no display change — the scripted narrative/scores are untouched.
  useEffect(() => {
    if (currentStep >= 4 && !evalRecordedRef.current && liveCedar) {
      evalRecordedRef.current = true;
      const passed = liveValidator?.checks.filter((c) => c.passed).map((c) => c.name) ?? [];
      const failed = liveValidator?.checks.filter((c) => !c.passed).map((c) => c.name) ?? [];
      recordEvaluation({
        scenario: scenario === 'approve' ? 'acme-corp' : 'omega-trading',
        verdict: liveCedar.decision === 'ALLOW' ? 'APPROVE' : 'REJECT',
        confidence: liveGrounding?.grounding_score ?? 0,
        duration_ms: 0,
        checks_passed: passed,
        checks_failed: failed,
        grounding_score: liveGrounding?.grounding_score ?? 0,
        ar_verdict: liveAR?.verdict ?? 'UNKNOWN',
        model_id: 'claude-sonnet-4.5',
        agent_id: 'credit-analyst',
      }).then((ok) => { noteLive('evaluations', ok ? true : null); if (ok) setEvalRecorded(true); });
    }
    if (currentStep < 4) { evalRecordedRef.current = false; }
  }, [currentStep, scenario, liveCedar, liveGrounding, liveAR, liveValidator]);

  // Live Agent Registry — fires at Decision & Audit (id 7, index 6), where the 'registry'
  // control lights up. Confirms the accountable owner + earned autonomy tier are real.
  useEffect(() => {
    let cancelled = false;
    if (currentStep >= 6) {
      fetchAgentRegistry().then((r) => { if (!cancelled) { noteLive('registry', r); setLiveRegistry(r); } });
    } else {
      setLiveRegistry(null);
    }
    return () => { cancelled = true; };
  }, [currentStep]);

  const handleHitlDecision = async (decision: 'approve' | 'reject') => {
    setHitlDecision(decision);
    const hitlUrl = cfgEnv('hitl_api_url', import.meta.env.VITE_HITL_API_URL);
    const apiKey = cfgEnv('api_key', import.meta.env.VITE_API_KEY);
    const tenantId = cfgEnv('tenant_id', import.meta.env.VITE_TENANT_ID) || 'default';
    if (hitlUrl) {
      fetch(`${hitlUrl}/api/v1/hitl/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, ...(apiKey ? { 'x-api-key': apiKey } : {}) },
        body: JSON.stringify({ case_id: 'omega-trading-001', decision: decision.toUpperCase(), reviewer: 'presenter', reason: 'basic-mode-demo' }),
      }).then((r) => { if (r.ok) setHitlRecorded(true); }).catch(() => {});
    }
    setCurrentStep(6);
  };

  const isIntro = currentStep < 0;
  const step = BASIC_STEPS[currentStep];
  const riskValues = isIntro ? {} : (scenario === 'approve' ? step.riskUpdatesApprove : step.riskUpdatesBlock);
  const telemetry = isIntro ? [] : (scenario === 'approve' ? step.telemetryApprove : step.telemetryBlock);
  const tokenCount = (currentStep + 1) * 407;
  const costEstimate = `~£${(tokenCount * 0.000015).toFixed(3)}`;

  const hideNextButton = scenario === 'block' && currentStep === 5 && hitlDecision === null;
  const showHitlButtons = scenario === 'block' && currentStep === 5;

  const handleNext = () => { if (currentStep < BASIC_STEPS.length - 1) setCurrentStep(currentStep + 1); };
  const handleBack = () => { if (currentStep > -1) setCurrentStep(currentStep - 1); };
  const handleReplay = () => setCurrentStep(-1);
  const handleScenarioChange = (s: Scenario) => { setScenario(s); setCurrentStep(-1); setHitlDecision(null); setApiOffline(false); setHitlRecorded(false); setEvalRecorded(false); setInfoMetric(null); };

  // Workflow metrics (Accuracy, Security) and Customer metrics (Compliance, Product, Legal)
  const workflowDials = RISK_DIALS.filter(d => d.id === 'accuracy' || d.id === 'security');
  const customerDials = RISK_DIALS.filter(d => d.id === 'compliance' || d.id === 'product' || d.id === 'legal');
  const activeInfoItem = infoMetric ? METRIC_INFO[infoMetric] : null;
  const handleMetricClick = (id: string) => setInfoMetric(infoMetric === id ? null : id);
  const closeInfoPanel = () => setInfoMetric(null);

  // Live controls that were attempted and did not answer. Rendered in the telemetry panel so
  // an operator can tell verified figures from scripted ones. Sorted for a stable order.
  const failedLive = (Object.entries(liveFailures) as [LiveService, string][])
    .filter(([, reason]) => Boolean(reason))
    .sort(([a], [b]) => LIVE_SERVICE_LABELS[a].localeCompare(LIVE_SERVICE_LABELS[b]));

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px' }}>
      {/* Scenario Selector */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => handleScenarioChange('approve')} style={{ padding: '6px 16px', fontSize: '0.75rem', fontWeight: 600, borderRadius: '6px', border: '1px solid', borderColor: scenario === 'approve' ? '#10b981' : 'var(--border)', background: scenario === 'approve' ? 'rgba(16,185,129,0.12)' : 'transparent', color: scenario === 'approve' ? '#10b981' : 'var(--text-muted)', cursor: 'pointer' }}>✓ Acme Corp (APPROVE)</button>
        <button onClick={() => handleScenarioChange('block')} style={{ padding: '6px 16px', fontSize: '0.75rem', fontWeight: 600, borderRadius: '6px', border: '1px solid', borderColor: scenario === 'block' ? '#ef4444' : 'var(--border)', background: scenario === 'block' ? 'rgba(239,68,68,0.12)' : 'transparent', color: scenario === 'block' ? '#ef4444' : 'var(--text-muted)', cursor: 'pointer' }}>⚠ Omega Trading (BLOCK)</button>
      </div>

      {/* Step Bar — evenly spaced across full width; horizontal scroll on mobile */}
      <div style={{ overflowX: 'auto', padding: '12px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: '540px', gap: '12px' }}>
          {/* Intro step — initial architecture, setup & configuration */}
          <React.Fragment key="intro">
            <button onClick={() => setCurrentStep(-1)} title="Initial architecture, setup & configuration" style={{ flexShrink: 0, width: '40px', height: '40px', borderRadius: '50%', border: '2px solid', borderColor: -1 < currentStep ? '#10b981' : currentStep === -1 ? 'var(--accent)' : 'var(--border)', background: -1 < currentStep ? 'rgba(16,185,129,0.15)' : currentStep === -1 ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', transition: 'all 0.3s', boxShadow: currentStep === -1 ? '0 0 10px rgba(59,130,246,0.4)' : 'none' }}>
              {-1 < currentStep ? '✓' : '🏛️'}
            </button>
            <div style={{ flex: 1, height: '2px', minWidth: '12px', background: -1 < currentStep ? '#10b981' : 'var(--border)' }} />
          </React.Fragment>
          {BASIC_STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button onClick={() => setCurrentStep(i)} title={s.label} style={{ flexShrink: 0, width: '40px', height: '40px', borderRadius: '50%', border: '2px solid', borderColor: i < currentStep ? '#10b981' : i === currentStep ? 'var(--accent)' : 'var(--border)', background: i < currentStep ? 'rgba(16,185,129,0.15)' : i === currentStep ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', transition: 'all 0.3s', boxShadow: i === currentStep ? '0 0 10px rgba(59,130,246,0.4)' : 'none' }}>
                {i < currentStep ? '✓' : s.icon}
              </button>
              {i < BASIC_STEPS.length - 1 && <div style={{ flex: 1, height: '2px', minWidth: '12px', background: i < currentStep ? '#10b981' : 'var(--border)' }} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
        <button onClick={handleBack} disabled={currentStep === -1} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: currentStep === -1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: currentStep === -1 ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600, opacity: currentStep === -1 ? 0.4 : 1 }}>← Back</button>
        {!hideNextButton && (currentStep < BASIC_STEPS.length - 1 ? (
          <button onClick={handleNext} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, boxShadow: '0 2px 12px rgba(59,130,246,0.4)', animation: 'pulse 2s infinite' }}>Next →</button>
        ) : (
          <button onClick={handleReplay} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}>↺ Replay</button>
        ))}
      </div>

      {/* Agent Conversation */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '24px', marginBottom: '16px', border: '1px solid var(--border)' }}>
        {isIntro ? (
          <>
            <div style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Initial Architecture, Setup &amp; Configuration</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Before the assessment begins, this is the baseline governance architecture that is provisioned and
              configured.
            </div>
          </>
        ) : (
          <>
        <div style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Step {step.id}: {step.label}</div>
        {step.overview && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>{step.overview}</div>
        )}
        {step.agentPrompts && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>📊 Credit Analyst</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step.agentPrompts.creditAnalyst[scenario]}</div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>⚖️ Compliance Officer</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step.agentPrompts.complianceOfficer[scenario]}</div>
            </div>
          </div>
        )}
        {step.supervisorNote && (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px', border: '1px solid var(--border)', marginBottom: '16px' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>👑 Supervisor</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step.supervisorNote[scenario]}</div>
          </div>
        )}
        {showHitlButtons && (
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => handleHitlDecision('approve')} style={{ padding: '10px 20px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>✓ APPROVE (override)</button>
              <button onClick={() => handleHitlDecision('reject')} style={{ padding: '12px 24px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', border: '2px solid #ef4444', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}>⛔ REJECT/BLOCK (recommended)</button>
            </div>
            {apiOffline && (
              <div style={{ fontSize: '0.65rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '0.5rem' }}>●</span> Offline
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>

      {/* Governance Architecture — image swaps per stage: base → 1.png (steps 1–4) → 2.png (step 5+) */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Governance Architecture</div>
        <img src={architectureImage(currentStep)} alt="Governance architecture" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px' }} />
      </div>

      {/* Operational Dashboard + Telemetry — hidden on the intro step */}
      {!isIntro && (
        <>
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Operational Dashboard</div>
          {/* Additive live-verification cluster — each pill lights up only when a real
              deterministic call confirms the scripted control for that step. Scripted
              telemetry/dials/text are never altered. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {currentStep >= 3 && liveValidator && (
              <LiveBadge
                text={`✓ Deterministic recompute live — ${liveValidator.checked} ratio${liveValidator.checked === 1 ? '' : 's'}`}
                title={`Recomputed from raw inputs by a non-AI Lambda: ${Object.entries(liveValidator.recomputed).map(([k, v]) => `${k}=${v}`).join(' · ')} — verdict ${liveValidator.verdict}; claims ${liveValidator.mismatches.length ? 'MISMATCH ⚠' : 'match ✓'}`}
              />
            )}
            {currentStep >= 3 && liveGrounding && (
              <LiveBadge text="✓ Grounding verified live" title={`Contextual grounding ${Math.round((liveGrounding.grounding_score ?? 0) * 100)}% · relevance ${Math.round((liveGrounding.relevance_score ?? 0) * 100)}% (Bedrock Guardrails)`} />
            )}
            {currentStep >= 4 && liveAR && (
              <LiveBadge text={`✓ Automated Reasoning live — ${liveAR.checkedRules} rule${liveAR.checkedRules === 1 ? '' : 's'}`} title={`Automated Reasoning verdict: ${liveAR.verdict}`} />
            )}
            {currentStep >= 4 && liveCedar && (
              <LiveBadge
                tone={liveCedar.decision === 'ALLOW' ? 'ok' : 'deny'}
                title={liveCedar.reasons.length ? `Determining policies: ${liveCedar.reasons.join(', ')}` : 'DEFAULT permit — no forbid fired'}
                text={liveCedar.decision === 'ALLOW'
                  ? '✓ Verified live by Cedar — ALLOW'
                  : `⛔ Verified live by Cedar — DENY (${liveCedar.reasons.length} forbid${liveCedar.reasons.length === 1 ? '' : 's'})`}
              />
            )}
            {currentStep >= 5 && hitlRecorded && (
              <LiveBadge text="✓ HITL recorded live" title="Human-in-the-loop escalation/decision written to the governance store" />
            )}
            {currentStep >= 4 && evalRecorded && (
              <LiveBadge text="✓ Evaluation recorded live" title="Computed signals (Cedar verdict, grounding score, AR verdict, deterministic checks) persisted to the evaluation store" />
            )}
            {currentStep >= 6 && liveRegistry && liveRegistry.length > 0 && (() => {
              const a = liveRegistry.find(x => x.agent_id?.includes('credit')) ?? liveRegistry[0];
              return <LiveBadge text={`✓ Agent registry live — Tier ${a.tier}`} title={`Accountable owner: ${a.owner || 'n/a'} · escalation: ${a.escalation_to || 'n/a'}`} />;
            })()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {/* Workflow Metrics group */}
          <div style={{ flex: '1 1 200px', border: '1px dashed rgba(128,128,128,0.4)', borderRadius: '8px', padding: '12px' }} data-testid="basic-metric-group-workflow">
            <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.6, color: 'var(--text-muted)', marginBottom: '8px' }}>Workflow Metrics</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              {workflowDials.map(dial => (
                <ConfidenceGauge key={dial.id} value={riskValues[dial.id] || 0} label={dial.label} onClick={() => handleMetricClick(dial.id)} />
              ))}
            </div>
          </div>
          {/* Customer Metrics group */}
          <div style={{ flex: '1 1 300px', border: '1px dashed rgba(128,128,128,0.4)', borderRadius: '8px', padding: '12px' }} data-testid="basic-metric-group-customer">
            <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.6, color: 'var(--text-muted)', marginBottom: '8px' }}>Customer Metrics</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              {customerDials.map(dial => (
                <ConfidenceGauge key={dial.id} value={riskValues[dial.id] || 0} label={dial.label} onClick={() => handleMetricClick(dial.id)} />
              ))}
            </div>
          </div>
        </div>
        <TokenSpendBar tokens={tokenCount} cost={costEstimate} />
      </div>

      {/* Telemetry */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px 16px', border: '1px solid var(--border)' }}>
        {telemetry.map((t, i) => (
          <div key={i} style={{ fontSize: '0.65rem', color: t.startsWith('⚠') || t.startsWith('⛔') ? '#ef4444' : 'var(--text-secondary)', padding: '3px 0', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: t.includes('✓') ? '#10b981' : t.startsWith('⚠') || t.startsWith('⛔') ? '#ef4444' : 'var(--accent)' }}>›</span> {t}
          </div>
        ))}

        {/* Live-verification fallbacks. The controls above degrade to the scenario script when a
            call does not succeed; without this the page would still look fully verified. Not
            colour-only: the heading states it in words and carries a ⚠ glyph. */}
        {failedLive.length > 0 && (
          <div
            role="status"
            aria-live="polite"
            data-testid="basic-live-fallback-warning"
            style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}
          >
            <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
              <span aria-hidden="true">⚠</span>
              <span>Live verification unavailable — showing scripted content</span>
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '6px' }}>
              {failedLive.length === 1 ? 'This control did' : `These ${failedLive.length} controls did`} not answer, so the
              figures shown for {failedLive.length === 1 ? 'it' : 'them'} come from the scenario script rather than a live service call:
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px' }}>
              {failedLive.map(([service, reason]) => (
                <li key={service} style={{ fontSize: '0.62rem', color: '#f59e0b', padding: '2px 0', fontFamily: 'var(--font-mono, monospace)' }}>
                  <span style={{ fontWeight: 700 }}>{LIVE_SERVICE_LABELS[service]}</span>
                  <span style={{ color: 'var(--text-secondary)' }}> — {reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
        </>
      )}

      {/* Shared InfoPanel drawer (right side) — opens when a metric dial is clicked */}
      {activeInfoItem && <InfoPanel item={activeInfoItem} onClose={closeInfoPanel} />}

      <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.03); } }`}</style>
    </div>
  );
}
