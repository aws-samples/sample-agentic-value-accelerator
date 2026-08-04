/**
 * HandoffWorkspace — interactive agent→human handoff queue for Human Oversight.
 *
 * A triage queue (left) + a review/decision panel (right). When an agent hands
 * off a decision the human sees:
 *  - HOW THE AGENT GOT HERE — a step-by-step work trace ("show its work");
 *  - whether the agent is READY — a definition-of-ready checklist (evidence cited,
 *    grounding passed, alternatives considered, policy identified). Not-ready
 *    handoffs are flagged so an under-researched decision isn't dumped on a human;
 *  - the AWS Scope-3 context payload (attempted / why uncertain / recommended);
 *  - the RIGHT INTERACTION TYPE — approval, choice, correction, clarification, or
 *    review — each with its own affordance, not a forced approve/deny;
 *  - what the agent has LEARNED about how this human likes to work.
 *
 * Anti-fatigue (OWASP Agentic T10): funnel stat, always-shown why-escalated,
 * advisory confidence, SLA timeout → deny/escalate (never silent auto-approve).
 * Maps to Bedrock RETURN_CONTROL / Step Functions waitForTaskToken. Demo state.
 */
import { useMemo, useState } from 'react';
import MaskedIdentity from './MaskedIdentity';
import {
  generateHandoffs, summarizeHandoffs, slaMinutesLeft, agreementHistory, REJECT_REASONS, INTERACTION_META,
  type HandoffItem, type HandoffDecision,
} from './handoffData';
import { AGENT_SCOPE_META } from './autonomyLadder';
import { appendAuditEvent } from './auditLog';
import StatCard from './StatCard';
import { Icon } from './icons';
import { rowButtonProps } from './a11y';
import { MockDataBadge } from './DataSourceIndicator';

// Stable, deterministic-ish id for an appended audit event (no Date.now in render path).
let auditSeq = 0;

const priorityMeta = {
  critical: { border: 'border-l-rose-500', chip: 'bg-rose-100 text-rose-700' },
  high:     { border: 'border-l-amber-500', chip: 'bg-amber-100 text-amber-700' },
  medium:   { border: 'border-l-blue-500',  chip: 'bg-blue-100 text-blue-700' },
} as const;

const interactionChip: Record<string, string> = {
  approval: 'bg-emerald-100 text-emerald-700',
  choice: 'bg-violet-100 text-violet-700',
  correction: 'bg-amber-100 text-amber-700',
  clarification: 'bg-indigo-100 text-indigo-700',
  review: 'bg-slate-100 text-slate-600',
};

function LevelChip({ level }: { level: 1 | 2 | 3 | 4 }) {
  const m = AGENT_SCOPE_META[level];
  return <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded text-white" style={{ background: m.color }}>L{level} {m.name}</span>;
}

/** Tiny inline sparkline for the agreement-rate trend (no chart lib needed). */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 64, h = 16, min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="inline-block align-middle" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function slaTone(left: number, total: number): string {
  const frac = left / total;
  if (left <= 0 || frac < 0.1) return 'text-rose-600 font-semibold';
  if (frac < 0.25) return 'text-amber-600 font-medium';
  return 'text-slate-500';
}

function fmtMins(m: number): string {
  if (m <= 0) return 'breached';
  if (m < 60) return `${m}m left`;
  return `${Math.floor(m / 60)}h ${m % 60}m left`;
}

export default function HandoffWorkspace() {
  const initial = useMemo(() => generateHandoffs(14), []);
  const [items, setItems] = useState<HandoffItem[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [scope, setScope] = useState<'queue' | 'awaiting' | 'resolved'>('queue');

  // Decision-panel local state
  const [editedDraft, setEditedDraft] = useState('');
  const [chosen, setChosen] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState<string>(REJECT_REASONS[0]);
  const [note, setNote] = useState('');
  const [question, setQuestion] = useState('');
  const [showTrace, setShowTrace] = useState(true);

  const summary = useMemo(() => summarizeHandoffs(items), [items]);

  const visible = useMemo(() => items.filter(it => {
    if (scope === 'queue') return it.status === 'pending';
    if (scope === 'awaiting') return it.status === 'awaiting-agent';
    return it.status === 'resolved';
  }).sort((a, b) => slaMinutesLeft(a) - slaMinutesLeft(b)), [items, scope]);

  const selected = selectedId ? items.find(i => i.id === selectedId) ?? null : null;

  function resetPanel() {
    setEditedDraft(''); setChosen(null); setNote(''); setQuestion(''); setRejectReason(REJECT_REASONS[0]);
  }
  function selectItem(id: string) { setSelectedId(id); resetPanel(); }

  function decide(it: HandoffItem, decision: HandoffDecision, reason: string) {
    setItems(prev => prev.map(x => x.id === it.id
      ? { ...x, status: 'resolved', decision, decidedBy: 'you@bank.example', decisionReason: reason }
      : x));
    // Close the loop: write the decision to the shared audit log with full
    // decision-context ("why"), so it appears in Audit & Incidents.
    const blocked = decision === 'reject' || decision === 'escalate';
    void appendAuditEvent({
      id: `ho-dec-${it.id}-${auditSeq++}`,
      ts: '2026-06-30 14:30',
      category: 'approval',
      severity: it.priority,
      // `agent` carries the CANONICAL agent id (the join key the earned-autonomy
      // graduation service queries by). The readable name lives in the summary.
      agent: it.agentId,
      actor: 'you@bank.example',
      summary: `${it.agentName}: ${INTERACTION_META[it.interactionType].label} — ${it.decisionNeeded}`,
      // `action` is the canonical decision verb (kebab-case) so agreement-rate
      // bucketing is stable: approve | approve-with-edit | reject | escalate |
      // take-over | choose | answer | acknowledge.
      action: decision,
      evidence: `handoff ${it.id}`,
      decisionContext: `Human ${decision.replace(/-/g, ' ')} via ${it.interactionType}. ${reason}. Escalated because: ${it.whyEscalated.toLowerCase()}. Agent agreement ${it.agreementRate}% (${it.agreementTrend}); readiness ${it.readiness.score}/100${blocked ? '; not approved as proposed' : ''}.`,
    });
    resetPanel();
    const next = visible.find(v => v.id !== it.id && v.status === 'pending');
    setSelectedId(next?.id ?? null);
  }

  function askAgent(it: HandoffItem, q: string) {
    setItems(prev => prev.map(x => x.id === it.id
      ? { ...x, status: 'awaiting-agent', conversation: [...x.conversation, { from: 'human', text: q, minsAgo: 0 }] }
      : x));
    setQuestion('');
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Action Queue — Agent Handoffs</h3>
          <MockDataBadge />
        </div>
        <p className="text-[11px] text-slate-500 max-w-3xl">
          Agents hand off decisions that exceed their authority or confidence — arriving with their work shown, a readiness check, and the right kind of interaction (approve, choose, correct, answer, or review). You decide without reinvestigating. Aligned to the AWS Scope-3 escalation principle and Bedrock return-of-control; confidence is advisory; only high-impact, low-confidence work reaches you.
        </p>
      </div>

      {/* KPI strip — anti-fatigue funnel + readiness */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="In Your Queue" value={summary.pending} variant="info" />
        <StatCard label="Critical" value={summary.critical} variant="danger" />
        <StatCard label="Due Soon" value={summary.dueSoon} variant="warning" sub="< 25% SLA left" />
        <StatCard label="Not Ready" value={summary.notReady} variant={summary.notReady ? 'warning' : 'muted'} sub="sent back to agent" />
        <StatCard label="Awaiting Agent" value={summary.awaitingAgent} sub="clarification sent" />
        <StatCard label="Auto-Resolved" value={summary.autoResolvedToday.toLocaleString()} variant="success" sub={`${summary.routedToHuman} routed to you`} />
      </div>

      {/* Scope toggle */}
      <div className="flex items-center gap-1 text-[11px]">
        {([['queue', 'Queue'], ['awaiting', 'Awaiting Agent'], ['resolved', 'Resolved']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setScope(k)}
            className={`px-3 py-1 rounded-full font-medium transition-colors ${scope === k ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* ── Queue (master) ── */}
        <div className="lg:col-span-2 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 text-[11px] font-semibold text-slate-600">
            {visible.length} {scope === 'queue' ? 'pending' : scope} {visible.length === 1 ? 'item' : 'items'}
          </div>
          <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
            {visible.length === 0 && (
              <div className="px-4 py-10 text-center text-[11px] text-slate-400">Nothing here — queue is clear.</div>
            )}
            {visible.map(it => {
              const pm = priorityMeta[it.priority];
              const left = slaMinutesLeft(it);
              const isSel = it.id === selectedId;
              return (
                <div key={it.id} {...rowButtonProps(() => selectItem(it.id), `Review ${it.decisionNeeded}`)}
                  className={`px-4 py-3 border-l-4 ${pm.border} cursor-pointer transition-colors focus:outline-none ${isSel ? 'bg-blue-50/60' : 'hover:bg-slate-50/70'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase ${pm.chip}`}>{it.priority}</span>
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${interactionChip[it.interactionType]}`}>{INTERACTION_META[it.interactionType].label}</span>
                      {!it.readiness.ready && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">not ready</span>}
                    </div>
                    <span className={`text-[10px] ${slaTone(left, it.slaMinutesTotal)}`}>{fmtMins(left)}</span>
                  </div>
                  <div className="text-[12px] font-medium text-slate-800 leading-snug">{it.decisionNeeded}</div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-slate-400">{it.agentName} · {it.businessUnit}</span>
                    <span className="text-[10px] text-slate-400">risk {it.riskScore} · conf {it.confidence.toFixed(2)}</span>
                  </div>
                  {it.status === 'awaiting-agent' && <div className="mt-1 text-[9px] text-indigo-600 font-medium">● awaiting agent reply</div>}
                  {it.status === 'resolved' && it.decision && <div className="mt-1 text-[9px] text-slate-500 font-medium capitalize">✓ {it.decision.replace(/-/g, ' ')}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Review / decision panel (detail) ── */}
        <div className="lg:col-span-3">
          {!selected ? (
            <div className="bg-white/80 rounded-xl border border-slate-200/60 p-10 text-center text-[12px] text-slate-400">
              Select an item from the queue to review.
            </div>
          ) : (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${interactionChip[selected.interactionType]}`}>{INTERACTION_META[selected.interactionType].label} · {INTERACTION_META[selected.interactionType].verb}</span>
                    <span className="text-[9px] text-slate-400">acting as {INTERACTION_META[selected.interactionType].role}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{selected.decisionNeeded}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <LevelChip level={selected.currentLevel} />
                    <span className="text-[10px] text-slate-400">{selected.agentName} · {selected.businessUnit}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-[11px] ${slaTone(slaMinutesLeft(selected), selected.slaMinutesTotal)}`}>{fmtMins(slaMinutesLeft(selected))}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">on timeout: {selected.timeoutAction === 'auto-approve' ? 'auto-approve (low-risk)' : selected.timeoutAction} → {selected.nextEscalation}</div>
                </div>
              </div>

              {/* Why escalated */}
              <div className="text-[11px] bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                <span className="font-semibold text-slate-600">Escalated because:</span> <span className="text-slate-600">{selected.whyEscalated}.</span>
                <span className="text-slate-400"> Confidence {selected.confidence.toFixed(2)} (advisory) · risk {selected.riskScore}.</span>
              </div>

              {/* Readiness — did the agent do its homework */}
              <div className={`rounded-lg border p-3 ${selected.readiness.ready ? 'border-emerald-100 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/50'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: selected.readiness.ready ? '#047857' : '#be123c' }}>
                    {selected.readiness.ready ? '✓ Handoff ready' : '⚠ Not ready — incomplete handoff'} · {selected.readiness.score}/100
                  </span>
                  {!selected.readiness.ready && (
                    <button onClick={() => askAgent(selected, 'Handoff incomplete — please complete the failed readiness checks before escalating.')}
                      className="text-[10px] font-medium text-rose-700 hover:text-rose-800">Send back to agent →</button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  {selected.readiness.checks.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px]">
                      <span className={c.met ? 'text-emerald-600' : c.blocking ? 'text-rose-600' : 'text-amber-500'}>{c.met ? '✓' : c.blocking ? '✕' : '!'}</span>
                      <span className={c.met ? 'text-slate-600' : 'text-slate-700 font-medium'}>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Show its work — how it got to the point it needs help */}
              <div>
                <button onClick={() => setShowTrace(s => !s)} className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700">
                  <Icon name={showTrace ? 'chevron-down' : 'chevron-right'} className="w-3 h-3" /> How the agent got here ({selected.workTrace.length} steps)
                </button>
                {showTrace && (
                  <ol className="mt-2 space-y-1.5 border-l border-slate-200 ml-1 pl-3">
                    {selected.workTrace.map((s, i) => (
                      <li key={i} className="relative">
                        <span className={`absolute -left-[1.05rem] top-1 w-2 h-2 rounded-full ${s.status === 'flag' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                        <div className="text-[11px] font-medium text-slate-700">{s.label}{s.status === 'flag' && <span className="ml-1 text-[9px] text-amber-600">⚑ uncertain</span>}</div>
                        <div className="text-[10px] text-slate-500">{s.detail}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* The 3-item handoff context payload */}
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">What the agent attempted</div>
                  <div className="text-[12px] text-slate-700 mt-1">{selected.attempted}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Why it's uncertain</div>
                  <div className="text-[12px] text-slate-700 mt-1">{selected.uncertainty}</div>
                </div>
              </div>

              {/* Evidence + policy */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Evidence gathered</div>
                  <ul className="space-y-0.5">{selected.evidence.map((e, i) => <li key={i} className="text-slate-600 flex items-center gap-1"><Icon name="document" className="w-3 h-3 text-slate-300" />{e}</li>)}</ul>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Relevant policy</div>
                  <div className="text-slate-600">{selected.policyRef}</div>
                </div>
              </div>

              {/* Learned preference — agent adapting to how this human works (emerging pattern) */}
              {selected.learnedPreference && (
                <div className="text-[10px] bg-violet-50/50 rounded-lg px-3 py-2 border border-violet-100/70 flex items-start gap-2">
                  <Icon name="sparkles" className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                  <div><span className="font-semibold text-violet-700">Learned your preference:</span> <span className="text-slate-600">{selected.learnedPreference}</span></div>
                </div>
              )}

              {/* Agreement / earned-autonomy tie-in (autonomy is human-granted) */}
              <div className="text-[10px] text-slate-400 bg-indigo-50/40 rounded-lg px-3 py-2 border border-indigo-100/60">
                <div className="flex items-center gap-2">
                  <span>You've approved <span className="font-semibold text-slate-600">{selected.agreementRate}%</span> of {selected.agentName}'s proposals</span>
                  <Sparkline data={agreementHistory(selected)} color={selected.agreementTrend === 'falling' ? '#e11d48' : '#6366f1'} />
                  <span className={selected.agreementTrend === 'falling' ? 'text-rose-500 font-medium' : 'text-slate-500'}>
                    {selected.agreementTrend === 'rising' ? '▲ rising' : selected.agreementTrend === 'falling' ? '▼ falling — oversight staying on' : 'flat'}
                  </span>
                </div>
                <div className="mt-1">Decisions here feed the agreement signal in <a href="/govern/agents?tab=human-oversight" className="text-indigo-600 hover:underline font-medium">Earned Autonomy</a> — autonomy is granted by you, never auto-claimed.</div>
              </div>

              {/* Conversation thread */}
              {selected.conversation.length > 0 && (
                <div className="space-y-1.5 border-t border-slate-100 pt-3">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Clarification thread</div>
                  {selected.conversation.map((m, i) => (
                    <div key={i} className={`text-[11px] rounded-lg px-2.5 py-1.5 max-w-[85%] ${m.from === 'human' ? 'bg-blue-50 ml-auto text-slate-700' : 'bg-slate-100 text-slate-700'}`}>
                      <span className="text-[9px] font-semibold uppercase text-slate-400 mr-1">{m.from}</span>{m.text}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Resolution, or interaction-type-aware action area ── */}
              {selected.status === 'resolved' ? (
                <div className="border-t border-slate-100 pt-3 text-[11px]">
                  <span className="font-semibold text-slate-700 capitalize">Decision: {selected.decision?.replace(/-/g, ' ')}</span>
                  <span className="text-slate-500"> by <MaskedIdentity identity={selected.decidedBy ?? ''} /></span>
                  {selected.decisionReason && <div className="text-slate-500 mt-1">Reason: {selected.decisionReason}</div>}
                  <div className="text-[10px] text-slate-400 mt-1">Logged to audit with reasoning (decision-context). Agent resumed via return-of-control; your choice updates its learned preferences.</div>
                </div>
              ) : (
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  {/* CHOICE — pick one of N options */}
                  {selected.interactionType === 'choice' && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Choose an option</div>
                      {selected.recommendedOptions.map((o, idx) => (
                        <label key={idx} className={`flex items-start gap-2 text-[11px] rounded-lg px-2.5 py-1.5 border cursor-pointer ${chosen === idx ? 'border-violet-300 bg-violet-50/60' : o.recommended ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-100 bg-slate-50/50'}`}>
                          <input type="radio" name="choice" checked={chosen === idx} onChange={() => setChosen(idx)} className="mt-0.5" />
                          <span>
                            <span className="font-medium text-slate-800">{o.label}{o.recommended && <span className="ml-1 text-[9px] text-emerald-700 font-bold">★ agent rec</span>}</span>
                            <span className="block text-slate-500">{o.rationale}</span>
                          </span>
                        </label>
                      ))}
                      <button disabled={chosen === null} onClick={() => decide(selected, 'choose', `Chose: ${selected.recommendedOptions[chosen!].label}${note ? ` — ${note}` : ''}`)}
                        className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40">Confirm choice</button>
                    </div>
                  )}

                  {/* CORRECTION — edit & validate the agent's draft */}
                  {selected.interactionType === 'correction' && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Edit the agent's draft, then send</div>
                      <textarea value={editedDraft || selected.draft || ''} onChange={e => setEditedDraft(e.target.value)} aria-label="Edit agent draft" className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 h-24" />
                      <div className="flex gap-2">
                        <button onClick={() => decide(selected, 'approve-with-edit', `Edited & sent${note ? ` — ${note}` : ''}`)}
                          className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700">Send edited</button>
                        <button onClick={() => decide(selected, 'approve', 'Sent as drafted')}
                          className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">Send as-is</button>
                        <button onClick={() => decide(selected, 'reject', `${rejectReason}${note ? ` — ${note}` : ''}`)}
                          className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700">Reject</button>
                      </div>
                    </div>
                  )}

                  {/* CLARIFICATION — the agent asks the human a question */}
                  {selected.interactionType === 'clarification' && selected.question && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">The agent is asking you</div>
                      <div className="text-[12px] text-slate-700 bg-indigo-50/50 rounded-lg px-3 py-2 border border-indigo-100">{selected.question}</div>
                      <div className="flex flex-wrap gap-2">
                        {(selected.suggestedAnswers ?? []).map((a, idx) => (
                          <button key={idx} onClick={() => decide(selected, 'answer', `Answered: ${a}`)}
                            className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{a}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* REVIEW — read & acknowledge */}
                  {selected.interactionType === 'review' && (
                    <button onClick={() => decide(selected, 'acknowledge', note || 'Reviewed & acknowledged')}
                      className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-800">Acknowledge</button>
                  )}

                  {/* APPROVAL — go / no-go (the default) */}
                  {selected.interactionType === 'approval' && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => decide(selected, 'approve', note || `Approved — ${selected.recommendedOptions.find(o => o.recommended)?.label ?? 'as proposed'}`)}
                        className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Approve</button>
                      <button onClick={() => decide(selected, 'reject', `${rejectReason}${note ? ` — ${note}` : ''}`)}
                        className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700">Reject</button>
                    </div>
                  )}

                  {/* Shared note + reject reason + secondary actions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="Reason / note (logged)"
                      aria-label="Decision note"
                      className="text-[11px] border border-slate-200 rounded px-2 py-1" />
                    <select value={rejectReason} onChange={e => setRejectReason(e.target.value)} aria-label="Rejection reason" className="text-[11px] border border-slate-200 rounded px-2 py-1">
                      {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => decide(selected, 'take-over', note || 'Human took over manually')}
                      className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">Take over</button>
                    <button onClick={() => decide(selected, 'escalate', note || 'Escalated to senior reviewer')}
                      className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">Escalate</button>
                  </div>

                  {/* Interactive: ask the agent a clarifying question */}
                  <div className="flex items-center gap-2 pt-1">
                    <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask the agent a clarifying question…"
                      aria-label="Clarifying question for agent"
                      className="flex-1 text-[11px] border border-slate-200 rounded px-2 py-1" />
                    <button disabled={!question.trim()} onClick={() => askAgent(selected, question.trim())}
                      className="text-[11px] font-medium px-3 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">Ask agent</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
