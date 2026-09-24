import React, { useState, useMemo, useEffect } from 'react';
import { cedarPolicies, policyEvalTraces, categoryLabels, type PolicyCategory, type CedarPolicy, type PolicyEvalTrace } from '../../data/cedarPolicies';
import { highlightCedarDsl } from '../../utils/cedarHighlight';
import { useAudience } from '../../contexts/AudienceContext';
import SectionDescription from '../shared/SectionDescription';
import { evaluateAuthorization, type AuthzResult } from '../../api/cedar';

// Representative AVP is-authorized request (the Omega "block" case) sent to the
// real cedar-proxy /evaluate so the what-if panel shows a genuine decision from
// the live policy store — not just the local toggle heuristic. Attributes mirror
// the narrative (92% sanctions match, PEP L3, £2.5M facility) so the live result
// is a DENY. Null (offline/CORS/timeout) → no live line, local sim stands.
const WHATIF_CEDAR_PAYLOAD = {
  principal: { entityType: 'AgentCore::Governance::Agent', entityId: 'credit-analyst' },
  action: { actionType: 'AgentCore::Governance::Action', actionId: 'ApproveApplication' },
  resource: { entityType: 'AgentCore::Governance::CustomerRecord', entityId: 'omega-trading-001' },
  context: { contextMap: { request_hour: { long: 12 } } },
  entities: { entityList: [
    {
      identifier: { entityType: 'AgentCore::Governance::Agent', entityId: 'credit-analyst' },
      attributes: { agent_id: { string: 'credit-analyst' }, agent_role: { string: 'credit' }, current_tier: { long: 2 }, deployment_region: { string: 'UK' }, model_id: { string: 'claude' }, max_credit_amount: { long: 1000000 }, jurisdiction_allowlist: { set: [{ string: 'UK' }] } },
      parents: [{ entityType: 'AgentCore::Governance::AgentGroup', entityId: 'AllAgents' }],
    },
    { identifier: { entityType: 'AgentCore::Governance::AgentGroup', entityId: 'AllAgents' }, attributes: {}, parents: [] },
    {
      identifier: { entityType: 'AgentCore::Governance::CustomerRecord', entityId: 'omega-trading-001' },
      attributes: {
        customer_id: { string: 'omega-trading-001' }, jurisdiction: { string: 'UK' }, incorporation_country: { string: 'GB' },
        risk_tier: { string: 'HIGH' }, risk_score: { long: 81 }, requested_facility_amount: { long: 2500000 }, currency: { string: 'GBP' },
        pep_level: { long: 3 }, sanctions_fuzzy_match_score: { long: 92 }, matched_list: { string: 'OFSI' }, credit_score: { long: 610 },
        years_in_business: { long: 3 }, ubo_chain_depth: { long: 3 }, data_residency_region: { string: 'UK' },
      },
      parents: [],
    },
  ] },
};

const statusStyle: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Active' },
  shadow: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Shadow' },
  disabled: { bg: 'rgba(100,116,139,0.15)', color: '#64748b', label: 'Disabled' },
};

const evalColors: Record<string, string> = { ALLOW: '#10b981', DENY: '#ef4444', NOT_APPLICABLE: '#64748b' };

function CedarCode({ code }: { code: string }) {
  const tokens = highlightCedarDsl(code);
  return (
    <pre style={{ background: '#0d1117', borderRadius: '6px', padding: '12px', fontSize: '11px', fontFamily: 'var(--font-mono)', overflowX: 'auto', margin: '8px 0 0', lineHeight: 1.6 }}>
      <code>
        {tokens.map((t, i) => (
          <span key={i} className={t.className} style={tokenStyle(t.className)}>{t.text}</span>
        ))}
      </code>
    </pre>
  );
}

function tokenStyle(cls: string): React.CSSProperties {
  switch (cls) {
    case 'cedar-keyword': return { color: '#c792ea' };
    case 'cedar-entity': return { color: '#82aaff' };
    case 'cedar-action': return { color: '#c3e88d' };
    case 'cedar-operator': return { color: '#89ddff' };
    case 'cedar-literal': return { color: '#f78c6c' };
    case 'cedar-string': return { color: '#c3e88d' };
    case 'cedar-comment': return { color: '#546e7a', fontStyle: 'italic' };
    default: return { color: '#e0e0e0' };
  }
}

function PolicyCard({ policy, showCode, showRationale }: { policy: CedarPolicy; showCode: boolean; showRationale: boolean }) {
  const s = statusStyle[policy.status];
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{policy.name}</span>
        <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: s.bg, color: s.color }}>{s.label}</span>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{policy.description}</div>
      {showRationale && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{policy.businessRationale}</div>
      )}
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
        Last triggered: {new Date(policy.lastTriggered).toLocaleDateString()} | 30d count: {policy.triggerCount30d}
      </div>
      {showCode && <CedarCode code={policy.cedarDsl} />}
    </div>
  );
}

function TraceRow({ trace }: { trace: PolicyEvalTrace }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-primary)' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
          {open ? '\u25BE' : '\u25B8'} {trace.customer_id} — {trace.action}
        </span>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: trace.final_decision === 'ALLOW' ? '#10b981' : '#ef4444' }}>
          {trace.final_decision} ({trace.latency_ms}ms)
        </span>
      </button>
      {open && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {trace.policies_evaluated.map((pe) => {
            const pol = cedarPolicies.find(p => p.id === pe.policy_id);
            return (
              <div key={pe.policy_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', padding: '4px 8px', borderRadius: '4px', background: 'var(--bg-secondary)' }}>
                <span style={{ color: evalColors[pe.result], fontWeight: 600, minWidth: '45px' }}>
                  {pe.result === 'ALLOW' ? '\u2705' : pe.result === 'DENY' ? '\u274C' : '\u2B1C'} {pe.result}
                </span>
                <span style={{ color: 'var(--text-primary)', flex: 1 }}>{pol?.name || pe.policy_id}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>{pe.reason}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const CedarPolicyTab: React.FC = () => {
  const { mode } = useAudience();
  const [category, setCategory] = useState<PolicyCategory | 'all'>('all');
  const [disabledPolicies, setDisabledPolicies] = useState<Set<string>>(new Set());
  // Additive: a real decision from the live Cedar policy store for the what-if
  // panel. Never blocks or replaces the local toggle simulation below.
  const [liveCedar, setLiveCedar] = useState<AuthzResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    evaluateAuthorization(WHATIF_CEDAR_PAYLOAD).then((r) => { if (!cancelled) setLiveCedar(r); });
    return () => { cancelled = true; };
  }, []);

  const showCode = mode === 'Engineering';
  const showRationale = mode === 'Compliance' || mode === 'Executive';
  const showWhatIf = mode === 'Engineering' || mode === 'Compliance';

  const filtered = useMemo(() =>
    category === 'all' ? cedarPolicies : cedarPolicies.filter(p => p.category === category),
  [category]);

  const togglePolicy = (id: string) => {
    setDisabledPolicies(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const activeCount = cedarPolicies.filter(p => p.status === 'active').length;

  return (
    <div data-testid="governance.cedar-tab" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionDescription text="12 Cedar authorization policies in DSL — syntax-highlighted with enforcement status." />
      {/* Summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '1.5rem' }}>{'\uD83D\uDEE1\uFE0F'}</span>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {activeCount} active Cedar policies protecting KYC decisions
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            0 violations today | {policyEvalTraces.length} evaluations traced
          </div>
        </div>
      </div>

      {/* Category sub-nav */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {(['all', 'authorization', 'guardrails', 'data_access', 'action_limits'] as const).map(cat => (
          <button key={cat} onClick={() => setCategory(cat)}
            style={{
              padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer',
              background: category === cat ? 'rgba(59,130,246,0.2)' : 'var(--bg-secondary)',
              color: category === cat ? 'var(--accent)' : 'var(--text-muted)',
            }}>
            {cat === 'all' ? `All (${cedarPolicies.length})` : `${categoryLabels[cat]} (${cedarPolicies.filter(p => p.category === cat).length})`}
          </button>
        ))}
      </div>

      {/* Policy Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '12px' }}>
        {filtered.map(p => <PolicyCard key={p.id} policy={p} showCode={showCode} showRationale={showRationale} />)}
      </div>

      {/* Decision Traces */}
      <div>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Recent Evaluation Traces</h3>
        {policyEvalTraces.map(t => <TraceRow key={t.decision_id} trace={t} />)}
      </div>

      {/* What-If Panel */}
      {showWhatIf && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '0 0 12px' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>What-If Simulation</h3>
            <span
              title="These Cedar policies are the static, board-approved baseline held in the Verified Permissions policy store. They are versioned by governance change control — they do NOT track the Decision-Rules risk slider, which tunes the live policy-cascade thresholds in DynamoDB at request time."
              style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.35)', letterSpacing: '0.02em' }}
            >
              Board-Approved Baseline (static)
            </span>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>Toggle policies off to see computed impact on decision volume.</p>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
            These Cedar policies are the board-approved baseline in the Verified Permissions store, changed only through governance review. They are intentionally separate from the Decision-Rules risk slider, which adjusts the live <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem' }}>policy-cascade</code> thresholds in DynamoDB at request time — so a slider change is not reflected here.
          </p>
          {/* Additive live line — a genuine decision from the real Cedar policy store
              for the Omega high-risk case. Appears only when the live call succeeds;
              the local toggle simulation below is unaffected. */}
          {liveCedar && (
            <div
              title={liveCedar.reasons.length ? `Determining policies: ${liveCedar.reasons.join(', ')}` : 'DEFAULT permit — no forbid fired'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', margin: '0 0 12px',
                color: liveCedar.decision === 'ALLOW' ? '#10b981' : '#ef4444',
                background: liveCedar.decision === 'ALLOW' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${liveCedar.decision === 'ALLOW' ? '#10b98166' : '#ef444466'}` }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: liveCedar.decision === 'ALLOW' ? '#10b981' : '#ef4444' }} />
              {liveCedar.decision === 'ALLOW'
                ? 'Live Cedar (Omega high-risk case): ALLOW'
                : `Live Cedar (Omega high-risk case): DENY (${liveCedar.reasons.length} forbid${liveCedar.reasons.length === 1 ? '' : 's'})`}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cedarPolicies.filter(p => p.impactPercentage > 0 || p.impactIfRemoved.includes('CRITICAL')).map(p => {
              const isOff = disabledPolicies.has(p.id);
              const isCritical = p.impactIfRemoved.includes('CRITICAL');
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '6px', background: isOff ? (isCritical ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.08)') : 'var(--bg-secondary)' }}>
                  <button onClick={() => togglePolicy(p.id)} style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: isOff ? '#ef4444' : '#10b981', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: '2px', left: isOff ? '2px' : '18px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </button>
                  <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{p.name}</span>
                  {isOff && (
                    <span style={{ fontSize: '0.7rem', color: isCritical ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>
                      {p.impactIfRemoved}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CedarPolicyTab;
