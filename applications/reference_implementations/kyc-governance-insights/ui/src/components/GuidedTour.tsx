import { useState, useEffect } from 'react';

const TOUR_STEPS = [
  { title: 'Welcome', body: 'KYC Governance Console with real Bedrock inference (Claude Sonnet 4.5). Every tab demonstrates a different governance dimension.' },
  { title: 'Scenario Selector', body: 'Two paths: Acme Corp (clean → APPROVE) and Omega Trading (sanctions match → BLOCK). Same runtime, different customer data.' },
  { title: 'Live Mode', body: 'Toggle ON to hit real AgentCore backend with Claude Sonnet 4.5. OFF uses pre-scripted progressive reveal.' },
  { title: 'Progressive Reveal', body: 'Click Next to step through agent execution. Each step shows what happened — tool calls, policy checks, agent coordination.' },
  { title: 'Architecture Tab', body: 'Full governance controls diagram from the Scaling AI Safely presentation. Defence in Depth across three layers.' },
  { title: 'Governance Tab', body: 'Earned Autonomy tiers — agents prove their way to less supervision. 6 continuous evaluation dimensions.' },
  { title: 'Theme Toggle', body: 'Light mode (default) optimized for projectors. Click the moon/sun icon top-right to switch.' },
  { title: 'Advanced Dropdown', body: '8 synthetic customers with varied risk profiles (CUST002–CUST009). Hidden behind ▸ Advanced in the sidebar.' },
  { title: 'Presenter Mode', body: 'Add ?presenter=true to URL for the Talking Points crib sheet tab. Hidden from audience by default.' },
  { title: 'HITL Buttons', body: 'Approve/Reject buttons appear at Step 5 (block scenario) when risk threshold is exceeded. Real deliberation time captured.' },
];

export default function GuidedTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tour') === 'true') setActive(true);
  }, []);

  if (!active) return null;

  const current = TOUR_STEPS[step];

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
      onClick={() => setActive(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#1a2332', border: '1px solid #3b82f6', borderRadius: '12px', padding: '24px 28px', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
      >
        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Tour — {step + 1}/{TOUR_STEPS.length}
        </div>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 8px 0' }}>{current.title}</h3>
        <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6, margin: '0 0 16px 0' }}>{current.body}</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={() => setActive(false)} style={{ padding: '6px 12px', fontSize: '12px', background: 'transparent', border: '1px solid #2a3548', borderRadius: '6px', color: '#64748b', cursor: 'pointer' }}>
            Dismiss
          </button>
          {step < TOUR_STEPS.length - 1 ? (
            <button onClick={() => setStep(step + 1)} style={{ padding: '6px 12px', fontSize: '12px', background: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              Next →
            </button>
          ) : (
            <button onClick={() => setActive(false)} style={{ padding: '6px 12px', fontSize: '12px', background: '#10b981', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              Done ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
