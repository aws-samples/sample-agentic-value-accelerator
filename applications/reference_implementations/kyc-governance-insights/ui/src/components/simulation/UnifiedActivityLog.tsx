import { useState, useEffect, useRef } from 'react';
import type { SimStep, LogSeverity } from '../../types/simulation';

interface UnifiedActivityLogProps {
  steps: SimStep[];
  currentStep: number;
  isLoading: boolean;
  progressiveReveal?: boolean;
  apiElapsedSeconds?: number | null;
  dataSource?: 'live' | 'cached' | 'static';
  hitlPaused?: boolean;
  hitlDecisionSeconds?: number | null;
  scenarioStartTime?: number; // Date.now() when scenario was started — for dynamic timestamps
  scenario?: 'approve' | 'block';
}

const SEVERITY_COLORS: Record<LogSeverity, string> = {
  '': '#e0e0e0',
  's-ok': '#81c784',
  's-warn': '#ffd54f',
  's-err': '#e57373',
};

/** Control keywords to detect in log messages + their tooltip descriptions */
const CONTROL_TOOLTIPS: Record<string, string> = {
  'Gateway': 'External gate — blocks agent actions if policy violated',
  'Guardrails': 'Bedrock input/output filter — blocks PII, injection, denied topics',
  'Policy Engine': '3-layer cascade (Org→App→Request). Most restrictive wins.',
  'Automated Reasoning': 'Formal verification — mathematically proves claims are consistent',
  'Lambda Validator': 'Independent code recalculates every number. Agent can\'t mark its own homework.',
  'LLM-as-Judge': 'Separate model scores quality/faithfulness. Agent can\'t influence its judge.',
  'X-Ray': 'Distributed tracing — full audit trail of every action',
  'CloudTrail': 'Immutable audit log — tamper-proof record of all decisions',
  'Evaluations': 'Continuous scoring across 6 dimensions. Drift → auto-tighten.',
  'AgentCore': 'Managed container runtime for multi-agent orchestration',
  'DynamoDB': 'Session state store with TTL-based cleanup',
};

/** Render log message text with control keywords as hoverable chips */
function renderMessageWithTooltips(message: string, baseColor: string): React.ReactNode {
  const keywords = Object.keys(CONTROL_TOOLTIPS);
  // Sort by length descending to match longer phrases first
  const sortedKeywords = keywords.sort((a, b) => b.length - a.length);
  
  // Build regex that matches any keyword
  const pattern = new RegExp(`(${sortedKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  
  const parts = message.split(pattern);
  
  return parts.map((part, i) => {
    const tooltip = CONTROL_TOOLTIPS[part];
    if (tooltip) {
      return (
        <span
          key={i}
          title={tooltip}
          style={{
            color: '#64b5f6',
            borderBottom: '1px dotted #64b5f6',
            cursor: 'help',
            fontWeight: 600,
          }}
        >
          {part}
          {part === 'Automated Reasoning' && (
            <span style={{ fontSize: '8px', color: '#ff9800', fontWeight: 700, verticalAlign: 'super', marginLeft: '2px' }}>EXP</span>
          )}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Convert a static timestamp like "09:14:05" to a dynamic one based on scenario start time.
 * Calculates offset from the first entry's timestamp, then applies to scenarioStartTime.
 */
function dynamicTimestamp(staticTs: string, baseTs: string, startTime: number, hitlExtraSeconds?: number): string {
  const parseSeconds = (t: string): number => {
    const parts = t.split(':').map(Number);
    return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  };
  const offset = parseSeconds(staticTs) - parseSeconds(baseTs);
  const actualMs = startTime + (offset + (hitlExtraSeconds || 0)) * 1000;
  const d = new Date(actualMs);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const AGENT_COLORS: Record<string, string> = {
  'Orchestrator': '#64b5f6',
  'Supervisor': '#64b5f6',
  'AgentCore': '#64b5f6',
  'Guardrails': '#ce93d8',
  'Textract': '#4fc3f7',
  'Claude Sonnet 4.5': '#81c784',
  'DynamoDB': '#ffb74d',
  'Lambda Worker': '#4db6ac',
  'IAM': '#ff8a65',
  'X-Ray': '#f48fb1',
  'Doc Verification': '#4db6ac',
  'Doc Verification → Supervisor': '#4db6ac',
  'Doc Verification → Compliance Agent': '#4db6ac',
  'Compliance Agent': '#ce93d8',
  'Compliance Agent → Credit Agent': '#ce93d8',
  'Compliance Agent → Supervisor': '#ce93d8',
  'Credit Agent': '#81c784',
  'Credit Agent → Supervisor': '#81c784',
  'Supervisor → Analyst': '#64b5f6',
  'Gateway': '#ef5350',
  'World-Check': '#ef5350',
  'PEP Database': '#ef5350',
  'Media Search': '#ffab40',
  'Automated Reasoning': '#4fc3f7',
  'Lambda Validator': '#ffb74d',
  'LLM-as-Judge': '#4fc3f7',
  'Policy Engine': '#ef5350',
  'Org Policy': '#ef5350',
  'App Policy': '#81c784',
  'Request Policy': '#81c784',
  'HITL System': '#ffd54f',
  'System': '#90a4ae',
  'QA Sampler': '#90a4ae',
  'Decision': '#81c784',
  'CloudTrail': '#4fc3f7',
  'Evaluations': '#81c784',
  'Agent': '#64b5f6',
  'Alert': '#ef5350',
  'Analyst': '#ffd54f',
};

export default function UnifiedActivityLog({ steps, currentStep, isLoading, progressiveReveal = true, apiElapsedSeconds, dataSource = 'cached', hitlPaused = false, hitlDecisionSeconds = null, scenarioStartTime, scenario = 'approve' }: UnifiedActivityLogProps) {
  const shouldAnimate = isLoading || progressiveReveal;
  const [revealedSteps, setRevealedSteps] = useState(shouldAnimate ? 0 : steps.length);
  const [revealedEntries, setRevealedEntries] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef(Date.now());

  // Calculate max entries to reveal (cap within step 5 at "AWAITING" if HITL paused)
  const getMaxRevealEntries = (): number => {
    if (!hitlPaused) return steps.reduce((sum, s) => sum + s.log.length, 0);
    // Cap: show all entries through step 4, then only first 4 entries of step 5 (up to "AWAITING")
    let cap = 0;
    for (let i = 0; i < Math.min(5, steps.length); i++) {
      cap += steps[i].log.length; // steps 0-4 fully visible
    }
    // Step 5: show only first 4 entries (indices 0-3, stopping at "AWAITING HUMAN DECISION")
    if (steps.length > 5) {
      cap += Math.min(4, steps[5].log.length);
    }
    return cap;
  };
  const maxRevealEntries = getMaxRevealEntries();

  // Progressive reveal: reveal entries one by one on timer
  useEffect(() => {
    if (!shouldAnimate) {
      // Show all immediately
      setRevealedSteps(steps.length);
      setRevealedEntries(999);
      return;
    }

    // Reset for fresh reveal
    setRevealedSteps(1);
    setRevealedEntries(0);
    startTimeRef.current = Date.now();
    setElapsedSeconds(0);

    // Reveal one entry every 300ms (fast, snappy animation)
    const totalEntries = steps.reduce((sum, s) => sum + s.log.length, 0);
    let count = 0;

    const interval = setInterval(() => {
      count++;
      if (count > maxRevealEntries) {
        clearInterval(interval);
        return;
      }
      setRevealedEntries(count);

      // Calculate which step we're in based on entry count
      let entrySum = 0;
      for (let i = 0; i < steps.length; i++) {
        entrySum += steps[i].log.length;
        if (count >= entrySum && i + 1 < steps.length) {
          setRevealedSteps(i + 2);
        }
      }

      if (count >= totalEntries) {
        clearInterval(interval);
      }
    }, 300);

    return () => clearInterval(interval);
  }, [shouldAnimate, steps]);

  // Auto-scroll within the activity log container when step changes
  useEffect(() => {
    const ref = stepRefs.current[currentStep];
    if (ref && scrollRef.current) {
      // Scroll only within the log container, not the page
      const container = scrollRef.current;
      const refTop = ref.offsetTop - container.offsetTop;
      container.scrollTop = refTop;
    }
  }, [currentStep]);

  // Continue revealing after HITL decision (hitlPaused becomes false)
  useEffect(() => {
    if (hitlPaused) return; // still paused
    const totalEntries = steps.reduce((sum, s) => sum + s.log.length, 0);
    if (revealedEntries >= totalEntries) return; // already done
    if (revealedEntries === 0) return; // hasn't started yet

    // Resume revealing remaining entries
    let count = revealedEntries;
    const interval = setInterval(() => {
      count++;
      setRevealedEntries(count);
      let entrySum = 0;
      for (let i = 0; i < steps.length; i++) {
        entrySum += steps[i].log.length;
        if (count >= entrySum && i + 1 < steps.length) {
          setRevealedSteps(i + 2);
        }
      }
      if (count >= totalEntries) clearInterval(interval);
    }, 300);
    return () => clearInterval(interval);
  }, [hitlPaused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate elapsed from timestamp data for static scenarios
  const getDataElapsedSeconds = (): number => {
    if (steps.length === 0) return 0;
    const firstStep = steps[0];
    const lastStep = steps[steps.length - 1];
    if (firstStep.log.length === 0 || lastStep.log.length === 0) return 0;

    const firstTime = firstStep.log[0].t;
    const lastTime = lastStep.log[lastStep.log.length - 1].t;

    // Parse HH:MM:SS timestamps
    const parseTime = (t: string): number => {
      const parts = t.split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return 0;
    };

    const diff = parseTime(lastTime) - parseTime(firstTime);
    return diff > 0 ? diff : 0;
  };

  const dataElapsed = getDataElapsedSeconds();

  // Track elapsed time during reveal animation — stop when all entries revealed
  const totalEntries = steps.reduce((s, st) => s + st.log.length, 0);
  const isComplete = revealedEntries >= totalEntries;

  useEffect(() => {
    if (!shouldAnimate || isComplete) return;

    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
    return () => clearInterval(interval);
  }, [shouldAnimate, steps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Freeze elapsed time when complete
  useEffect(() => {
    if (isComplete && shouldAnimate) {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }
  }, [isComplete, shouldAnimate]);

  // Calculate which entries are visible based on progressive reveal
  const getVisibleEntryCount = (stepIndex: number): number => {
    if (!shouldAnimate || isComplete) {
      // Even when reveal is done, enforce HITL cap if paused
      if (hitlPaused && stepIndex === 5) {
        return Math.min(4, steps[stepIndex].log.length); // only show entries 0-3
      }
      return steps[stepIndex].log.length; // show all
    }

    let entriesBefore = 0;
    for (let i = 0; i < stepIndex; i++) {
      entriesBefore += steps[i].log.length;
    }
    const availableForThisStep = Math.max(0, revealedEntries - entriesBefore);
    let count = Math.min(availableForThisStep, steps[stepIndex].log.length);

    // Enforce HITL cap: step 5 shows max 4 entries while paused
    if (hitlPaused && stepIndex === 5) {
      count = Math.min(count, 4);
    }

    return count;
  };

  // Base timestamp from first entry (for computing offsets)
  const baseTs = steps.length > 0 && steps[0].log.length > 0 ? steps[0].log[0].t : '00:00:00';
  const startTime = scenarioStartTime || Date.now();

  // Determine if an entry is post-HITL (step 5, entry index >= 4 in Block scenario)
  const isPostHitlEntry = (stepIdx: number, entryIdx: number): boolean => {
    return stepIdx === 5 && entryIdx >= 4;
  };

  // Get display timestamp for an entry
  const getDisplayTimestamp = (stepIdx: number, entryIdx: number, staticTs: string): string => {
    if (!scenarioStartTime) return staticTs; // no dynamic timestamps if not set
    const extraSeconds = isPostHitlEntry(stepIdx, entryIdx) && hitlDecisionSeconds !== null
      ? hitlDecisionSeconds
      : 0;
    return dynamicTimestamp(staticTs, baseTs, startTime, extraSeconds);
  };

  return (
    <div
      ref={scrollRef}
      style={{
        background: '#1a1a2e',
        borderRadius: '10px',
        padding: '14px',
        marginBottom: '16px',
        fontFamily: 'var(--font-mono)',
        fontSize: '14px',
        maxHeight: '250px',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isComplete ? '#4caf50' : '#ffd54f',
              animation: isComplete ? 'none' : 'pulse-dot 1.5s ease-in-out infinite',
            }}
          />
          <span style={{ color: '#90a4ae', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {isComplete ? 'Agent Activity Log' : (isLoading ? 'Agent Processing…' : 'Revealing Activity…')}
          </span>
          {/* Data source badge */}
          {isComplete && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                marginLeft: '6px',
                background: dataSource === 'live' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 152, 0, 0.2)',
                color: dataSource === 'live' ? '#4caf50' : '#ff9800',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {dataSource === 'live' ? 'LIVE' : dataSource === 'cached' ? 'CACHED' : 'DEMO'}
            </span>
          )}
        </div>
        <span style={{ color: '#546e7a', fontSize: '12px' }}>
          {steps.length} steps • {steps.reduce((s, st) => s + st.log.length, 0)} events
        </span>
      </div>

      {/* Step groups */}
      {steps.map((step, stepIdx) => {
        if (stepIdx >= revealedSteps) return null;
        // Hide step 6 (final) while HITL decision pending
        if (hitlPaused && stepIdx >= 6) return null;
        const isActive = stepIdx === currentStep;
        const visibleCount = getVisibleEntryCount(stepIdx);

        return (
          <div
            key={stepIdx}
            ref={(el) => { stepRefs.current[stepIdx] = el; }}
            style={{
              marginBottom: '6px',
              borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              paddingLeft: '8px',
              transition: 'all 0.3s ease',
              background: isActive ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
              borderRadius: '4px',
              opacity: isActive ? 1 : 0.25,
              maxHeight: isActive ? '1000px' : '28px',
              overflow: 'hidden',
            }}
          >
            {/* Step header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 0',
                marginBottom: '2px',
              }}
            >
              <span style={{ fontSize: '12px' }}>{step.icon}</span>
              <span
                style={{
                  color: isActive ? '#64b5f6' : '#546e7a',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Step {stepIdx + 1}: {step.title}
              </span>
              <span style={{ color: '#3a4a5a', fontSize: '11px', fontStyle: 'italic' }}>
                — {step.type}
              </span>
            </div>

            {/* Log entries */}
            {step.log.slice(0, visibleCount).map((entry, entryIdx) => (
              <div
                key={entryIdx}
                style={{
                  display: 'flex',
                  gap: '6px',
                  padding: '2px 0',
                }}
              >
                <span style={{ color: '#546e7a', minWidth: '52px', flexShrink: 0 }}>
                  [{getDisplayTimestamp(stepIdx, entryIdx, entry.t)}]
                </span>
                <span
                  style={{
                    color: AGENT_COLORS[entry.a] || '#90a4ae',
                    minWidth: '110px',
                    flexShrink: 0,
                    fontWeight: 600,
                  }}
                >
                  {entry.a}
                </span>
                <span style={{ color: SEVERITY_COLORS[entry.c] || '#e0e0e0' }}>
                  {renderMessageWithTooltips(entry.m, SEVERITY_COLORS[entry.c] || '#e0e0e0')}
                </span>
              </div>
            ))}

            {/* Show revealing indicator for current step during animation */}
            {shouldAnimate && stepIdx === revealedSteps - 1 && visibleCount < step.log.length && (
              <div style={{ padding: '2px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#546e7a', minWidth: '52px' }}></span>
                <span
                  style={{
                    display: 'inline-block',
                    width: '5px',
                    height: '12px',
                    background: 'var(--accent)',
                    animation: 'blink 1s step-end infinite',
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Completion indicator — shown when all entries revealed OR user is on final step */}
      {(isComplete || currentStep === steps.length - 1) && (
        <div style={{ padding: '6px 0 2px', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#4caf50', fontSize: '11px' }}>✓</span>
          <span style={{ color: '#4caf50', fontSize: '12px', fontWeight: 600 }}>
            Assessment complete — Agent: {apiElapsedSeconds ?? dataElapsed}s
            {hitlDecisionSeconds !== null && ` | Human: ${hitlDecisionSeconds}s`}
          </span>
        </div>
      )}

      {/* Approve scenario summary */}
      {(isComplete || currentStep === steps.length - 1) && scenario === 'approve' && (
        <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(76,175,80,0.1)', border: '1px solid rgba(76,175,80,0.3)' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#66bb6a', lineHeight: 1.6 }}>
            ✓ ASSESSMENT: APPROVED — Acme Corporation Ltd passed all governance gates. Credit score 22/100 (low risk). All compliance checks clear. No sanctions matches. Recommended facility: $15M-$23M at Prime+75-100bps. No human intervention required.
          </span>
        </div>
      )}

      {/* Block scenario summary */}
      {(isComplete || currentStep === steps.length - 1) && scenario === 'block' && (
        <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(198,40,40,0.1)', border: '1px solid rgba(198,40,40,0.3)' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#ef5350', lineHeight: 1.6 }}>
            🚫 ASSESSMENT: REJECTED — Omega Trading Ltd blocked at policy gate. Sanctions fuzzy match (78% Levenshtein) on UBO Thornton. SAR referral initiated for MLRO review. Credit facility of £2.5M denied. Agent flagged in 28 seconds.
          </span>
        </div>
      )}

      {/* Comparison line */}
      <div style={{ borderTop: '1px solid rgba(128,128,128,0.3)', marginTop: '12px', paddingTop: '8px', textAlign: 'center' }}>
        <span style={{ fontSize: '11px', color: '#64748b' }}>
          {scenario === 'block'
            ? '\u23F1 AI-governed: ~28 seconds (flagged + blocked) | \uD83D\uDCCB Traditional: Analyst checks 2 of 4 lists. Misses fuzzy match. Does not connect nominee to Thornton. Approved in error. Discovered 3 months later in audit.'
            : '\u23F1 AI-governed: ~40 seconds  |  \uD83D\uDCCB Traditional manual KYC: 10-20 business days'}
        </span>
      </div>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
