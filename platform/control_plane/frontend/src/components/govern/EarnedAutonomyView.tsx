/**
 * EarnedAutonomyView — "graduate agents out of human-in-the-loop" view.
 *
 * Rendered as a section inside Human Oversight (no own how-to guide — it lives
 * under the Human Oversight guide). Shows, for a fleet of agents: who has earned
 * a reduction in oversight (step up the L1→L4 scope ladder), who must stay
 * supervised, and who should step BACK down. Verdict pattern mirrors
 * DeploymentGate (ready / conditional / not_ready).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  generateGraduations, summarizeGraduations, OVERSIGHT_SHIFT,
  HIGH_ALIGNMENT, RUBBER_STAMP,
  type AgentGraduation, type GraduationVerdict,
} from './graduationData';
import { AGENT_SCOPE_META, LADDER_CITATIONS, type AgentScopeLevel } from './autonomyLadder';
import { governGraduationApi } from '../../api/client';
import StatCard from './StatCard';
import { rowButtonProps } from './a11y';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import ScoreDisclosure, { ScoreValue } from './ScoreDisclosure';
import { Icon } from './icons';

const verdictMeta: Record<GraduationVerdict, { label: string; badge: string; dot: string; ring: string }> = {
  ready:       { label: 'Ready to graduate', badge: 'bg-emerald-100 text-emerald-700', dot: '#10b981', ring: 'border-emerald-300' },
  conditional: { label: 'Conditional',       badge: 'bg-amber-100 text-amber-700',     dot: '#f59e0b', ring: 'border-amber-300' },
  not_ready:   { label: 'Not yet',           badge: 'bg-slate-100 text-slate-600',     dot: '#94a3b8', ring: 'border-slate-300' },
  // Distinct from "Not yet", which is a judgement that the agent fell short. This
  // is an absence of evidence, so it is deliberately neutral-toned rather than
  // negative — and it is dimmer than the others because it says nothing about the
  // agent at all.
  insufficient_evidence: { label: 'Not enough evidence', badge: 'bg-slate-100 text-slate-500', dot: '#cbd5e1', ring: 'border-slate-200' },
};

const statusMeta = {
  pass:    { icon: 'check', badge: 'bg-emerald-100 text-emerald-700', label: 'Met' },
  warning: { icon: 'exclamation-triangle', badge: 'bg-amber-100 text-amber-700', label: 'Advisory breach' },
  fail:    { icon: 'x-mark', badge: 'bg-rose-100 text-rose-700', label: 'Not met' },
  // UNKNOWN, not failed. A hollow circle rather than a cross, and slate rather than
  // rose: this criterion could not be evaluated, so it is excluded from the score
  // instead of counting against the agent.
  insufficient: { icon: 'circle', badge: 'bg-slate-100 text-slate-400', label: 'Not measured' },
} as const;

function LevelChip({ level }: { level: AgentScopeLevel }) {
  const m = AGENT_SCOPE_META[level];
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white" style={{ background: m.color }}>L{level} {m.name}</span>;
}

export default function EarnedAutonomyView() {
  const mockAgents = useMemo(() => generateGraduations(240), []);
  const [agents, setAgents] = useState<AgentGraduation[]>(mockAgents);
  const [source, setSource] = useState<'loading' | 'live' | 'demo'>('loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Backend-first with graceful mock fallback (mirrors auditLog / useAgentRegistry).
  useEffect(() => {
    let cancelled = false;
    governGraduationApi.list()
      .then((live) => {
        if (cancelled) return;
        if (live && live.length > 0) { setAgents(live as AgentGraduation[]); setSource('live'); }
        else { setSource('demo'); }  // backend up but empty — offer seeding
      })
      .catch(() => { if (!cancelled) setSource('demo'); });  // backend offline — mock
    return () => { cancelled = true; };
  }, []);

  const [actionMsg, setActionMsg] = useState<string | null>(null);

  async function handleSeed() {
    try {
      await governGraduationApi.seed();
      const live = await governGraduationApi.list();
      setAgents(live as AgentGraduation[]);
      setSource('live');
    } catch { /* backend unavailable — stay on mock */ }
  }

  // Promote is the headline action — persist the human grant, then refetch so the
  // board reflects the recomputed state. No-op on the mock roster (backend offline).
  async function handlePromote(agentId: string, probationDays?: number) {
    setActionMsg(null);
    try {
      await governGraduationApi.promote(agentId, probationDays);
      const live = await governGraduationApi.list();
      setAgents(live as AgentGraduation[]);
      setSource('live');
      setSelectedId(null);
      setActionMsg('Promotion recorded — the roster has been recomputed.');
    } catch {
      setActionMsg(source === 'live'
        ? 'Could not record the promotion — the backend rejected or is unreachable.'
        : 'Promotion is available once the live roster is seeded (demo data is read-only).');
    }
  }

  const summary = useMemo(() => summarizeGraduations(agents), [agents]);
  // Unscored agents sort LAST, not as 0: they are unmeasured, not the least ready.
  const byReadiness = (a: AgentGraduation, b: AgentGraduation) => {
    if (a.readiness === null && b.readiness === null) return 0;
    if (a.readiness === null) return 1;
    if (b.readiness === null) return -1;
    return b.readiness - a.readiness;
  };
  const stepDowns = useMemo(() => agents.filter(a => a.stepDown?.triggered).sort(byReadiness), [agents]);
  const ready = useMemo(() => agents.filter(a => a.verdict === 'ready' && !a.stepDown?.triggered).sort((a, b) => b.reviewerHoursPerMonth - a.reviewerHoursPerMonth), [agents]);
  const selected = selectedId ? agents.find(a => a.agentId === selectedId) ?? null : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Earned Autonomy</h3>
          {source === 'live' && <LiveDataBadge />}
          {source === 'demo' && (
            <span className="flex items-center gap-1.5">
              <MockDataBadge />
              <button onClick={handleSeed} className="text-[10px] text-blue-600 hover:text-blue-700 font-medium underline">Seed live roster →</button>
            </span>
          )}
          {source === 'loading' && <span className="text-[9px] text-slate-400">Loading...</span>}
        </div>
        <p className="text-[11px] text-slate-500 max-w-3xl">
          Graduate agents out of human-in-the-loop as fast as the evidence allows — and no faster. Every promotion is backed by track record, safety, and the human's own approval pattern. Aligned to the AWS Agentic AI Security Scoping Matrix's progressive-autonomy model, EU AI Act Art. 14, and the formal autonomy spectra of ISO/IEC 22989 and SAE J3016: as autonomy rises, oversight does not disappear — per-action approval steps down while monitoring and audit step up. The ratchet is bidirectional; oversight can always be earned back.
        </p>
      </div>

      {actionMsg && <div className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{actionMsg}</div>}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Ready to Graduate" value={summary.ready} variant="success" />
        <StatCard label="Conditional" value={summary.conditional} variant="warning" sub="with monitoring" />
        <StatCard label="Not Yet" value={summary.notReady} variant="muted" sub="criteria unmet" />
        {/* Separated from "Not Yet" deliberately. These agents were not judged and
            found wanting — nothing is known about them. Folding them into "Not Yet"
            made an instrumentation gap look like a fleet of underperforming agents. */}
        <StatCard label="Not Enough Evidence" value={summary.insufficientEvidence} variant="muted" sub="never assessed" />
        <StatCard label="Step-Down Advised" value={summary.stepDownRecommended} variant="danger" />
        <StatCard label="Reviewer Hrs / mo" value={summary.reclaimableHoursPerMonth.toLocaleString()} variant="info" sub="reclaimable if graduated" />
      </div>

      {/* What the strip above is and is not claiming. Without this line a reader
          cannot tell whether "N ready of 240" was measured across the whole fleet
          or across the fraction of it that could be scored at all. */}
      <div className="text-[10px] text-slate-500 bg-slate-50/60 rounded-lg px-3 py-2 border border-slate-100 flex flex-wrap gap-x-4 gap-y-1">
        <span>
          <span className="font-semibold text-slate-600">Mean readiness</span>{' '}
          {summary.meanReadinessScored === null
            ? 'not available — no agent could be scored'
            : `${summary.meanReadinessScored}/100`}
        </span>
        <span>
          <span className="font-semibold text-slate-600">Scored</span>{' '}
          {summary.total - summary.unscored} of {summary.total} agents
          {summary.unscored > 0 && ` (${summary.unscored} unscored, excluded from the mean rather than counted as 0)`}
        </span>
        <span>
          <span className="font-semibold text-slate-600">At L1–L2</span> {summary.pctAtLowAutonomy}% still gated by HITL
        </span>
      </div>

      {/* Human-Agreement as a Responsible-AI ALIGNMENT metric — fleet roll-up.
          Reframes the same signal the graduation rows use: not "higher is better",
          but how well the fleet is aligned with human judgement, with drift and
          rubber-stamp as the two failure modes. */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-semibold text-slate-900">Human–Agent Alignment</h4>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 uppercase tracking-wide">Responsible AI</span>
          <span className="text-[11px] text-slate-400">how often a human ratifies what the agent proposed</span>
        </div>
        <p className="text-[11px] text-slate-500 max-w-3xl mb-4">
          Human-agreement rate read as an <span className="font-medium text-slate-600">alignment</span> signal, not just a graduation gate. It measures agreement with the human reviewer (not ground truth — that's accuracy). It cuts both ways: sustained high, rising agreement means the agent tracks human judgement; a falling trend is an early misalignment/drift warning; near-perfect agreement can mean the review step is a rubber stamp adding latency, not safety.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Mean Agreement" value={`${summary.alignment.meanAgreement}%`} variant="info" sub="fleet average" />
          <StatCard label="Well Aligned" value={summary.alignment.wellAligned} variant="success" sub={`≥ ${HIGH_ALIGNMENT}%, stable`} />
          <StatCard label="Misalignment Watch" value={summary.alignment.misalignmentWatch} variant="danger" sub="agreement falling" />
          <StatCard label="Rubber-Stamp Watch" value={summary.alignment.rubberStampWatch} variant="warning" sub={`≥ ${RUBBER_STAMP}%, review adds little`} />
          <StatCard label="Trend ▲ Rising" value={summary.alignment.rising} variant="muted" />
          <StatCard label="Trend ▼ Falling" value={summary.alignment.falling} variant="muted" />
        </div>
        {/* Fleet agreement-trend distribution bar */}
        {summary.total > 0 && (
          <div className="mt-4">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
              <div className="bg-emerald-500" style={{ width: `${(summary.alignment.rising / summary.total) * 100}%` }} title={`${summary.alignment.rising} rising`} />
              <div className="bg-slate-300" style={{ width: `${(summary.alignment.flat / summary.total) * 100}%` }} title={`${summary.alignment.flat} flat`} />
              <div className="bg-rose-500" style={{ width: `${(summary.alignment.falling / summary.total) * 100}%` }} title={`${summary.alignment.falling} falling`} />
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Rising ({summary.alignment.rising})</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> Flat ({summary.alignment.flat})</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Falling ({summary.alignment.falling})</span>
            </div>
          </div>
        )}
      </div>

      {/* Step-down queue — management by exception, pinned first */}
      {stepDowns.length > 0 && (
        <div className="bg-rose-50/60 backdrop-blur-sm rounded-xl border border-rose-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-rose-100">
            <h4 className="text-sm font-semibold text-rose-800">Step-Down Recommended ({stepDowns.length})</h4>
            <p className="text-[10px] text-rose-600">Agents whose track record regressed — recommend pulling back to more oversight. Re-graduation available once the trigger clears.</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {stepDowns.slice(0, 8).map(a => (
                <tr key={a.agentId} {...rowButtonProps(() => setSelectedId(a.agentId), `View ${a.name}`)}
                  className="border-t border-rose-100 cursor-pointer hover:bg-rose-50 focus:outline-none focus:bg-rose-100/50">
                  <td className="py-2 px-5 font-medium text-slate-800">{a.name}</td>
                  <td className="py-2 px-2"><LevelChip level={a.currentLevel} /></td>
                  <td className="py-2 px-2 text-[11px] text-rose-700 font-medium">{a.stepDown.reason}</td>
                  <td className="py-2 px-5 text-right text-[11px] text-slate-400">{a.businessUnit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ready-to-graduate queue — the celebratory list */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h4 className="text-sm font-semibold text-slate-900">Ready to Graduate ({ready.length})</h4>
          <p className="text-[10px] text-slate-400">Earned a reduction in oversight, ranked by reviewer time reclaimable. Click for the evidence.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="py-2 px-5 text-left font-medium">Agent</th>
              <th scope="col" className="py-2 px-2 text-left font-medium">Current → Recommended</th>
              <th scope="col" className="py-2 px-2 text-center font-medium">Agreement</th>
              <th scope="col" className="py-2 px-2 text-center font-medium">Readiness</th>
              <th scope="col" className="py-2 px-3 text-right font-medium">Hrs/mo</th>
            </tr>
          </thead>
          <tbody>
            {ready.slice(0, 12).map(a => (
              <tr key={a.agentId} {...rowButtonProps(() => setSelectedId(a.agentId), `View ${a.name} graduation`)}
                className="border-t border-slate-100 cursor-pointer hover:bg-slate-50/60 focus:outline-none focus:bg-blue-50/50">
                <td className="py-2 px-5 font-medium text-slate-800">{a.name}<div className="text-[10px] text-slate-400">{a.businessUnit}</div></td>
                <td className="py-2 px-2"><span className="inline-flex items-center gap-1"><LevelChip level={a.currentLevel} /><span className="text-slate-300">→</span>{a.targetLevel && <LevelChip level={a.targetLevel} />}</span></td>
                <td className="py-2 px-2 text-center"><span className="font-semibold text-emerald-700">{a.agreementRate}%{a.agreementTrend === 'rising' ? ' ▲' : ''}</span></td>
                <td className="py-2 px-2 text-center">
                  {a.scoreProvenance
                    ? <ScoreValue value={a.readiness} provenance={a.scoreProvenance} />
                    : <span className="text-slate-400">&mdash;</span>}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-600">{a.reviewerHoursPerMonth}</td>
              </tr>
            ))}
            {ready.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-[11px] text-slate-400">No agents have met all graduation criteria yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Selected agent detail */}
      {selected && selected.targetLevel && (
        <div className={`bg-white/80 backdrop-blur-sm rounded-xl border-2 ${verdictMeta[selected.verdict].ring} p-5 shadow-sm`}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full mt-1" style={{ background: verdictMeta[selected.verdict].dot }} />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{selected.name}</h3>
                <p className="text-[11px] text-slate-500">{selected.summary}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <LevelChip level={selected.currentLevel} /><span className="text-slate-300 text-xs">→</span><LevelChip level={selected.targetLevel} />
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-xs font-bold px-3 py-1 rounded-lg inline-flex items-center gap-1 ${verdictMeta[selected.verdict].badge}`}>
                {selected.verdict === 'ready' ? <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.5} /> : selected.verdict === 'conditional' ? <Icon name="exclamation-triangle" className="w-3.5 h-3.5" strokeWidth={2} /> : null}{verdictMeta[selected.verdict].label}
              </span>
            </div>
          </div>

          {/* The score, with what it means and what it is made of. This replaced a
              bare "Readiness 86/100", which was ambiguous against the platform's
              riskScore - same 0-100 space, opposite polarity. */}
          {selected.scoreProvenance && (
            <div className="mb-4 pb-4 border-b border-slate-100">
              <ScoreDisclosure
                value={selected.readiness}
                provenance={selected.scoreProvenance}
                blockingFailures={selected.blockingFailures ?? []}
              />
            </div>
          )}

          {/* How oversight shifts on promotion — it transforms, it does not vanish.
              Grounded in AWS Agentic Scoping Matrix + EU AI Act Art. 14(3). */}
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-blue-50/60 rounded-lg p-3 border border-blue-100">
              <div className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide mb-1">Oversight relaxes</div>
              <div className="text-[11px] text-slate-600">{OVERSIGHT_SHIFT[selected.targetLevel].relaxes}</div>
            </div>
            <div className="bg-amber-50/60 rounded-lg p-3 border border-amber-100">
              <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1">Oversight intensifies</div>
              <div className="text-[11px] text-slate-600">{OVERSIGHT_SHIFT[selected.targetLevel].intensifies}</div>
            </div>
          </div>

          {/* Cross-framework anchors for the target level. */}
          <div className="mb-4 text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
            <span>Target L{selected.targetLevel} maps to:</span>
            <span><span className="text-slate-700 font-medium">ISO/IEC 22989</span> {LADDER_CITATIONS[selected.targetLevel].iso22989}</span>
            <span><span className="text-slate-700 font-medium">SAE J3016</span> {LADDER_CITATIONS[selected.targetLevel].saeJ3016}</span>
            <span><span className="text-slate-700 font-medium">NIST AI RMF</span> {LADDER_CITATIONS[selected.targetLevel].nistOversight.join(', ')}</span>
          </div>

          <div className="space-y-2">
            {selected.criteria.map((c) => {
              const sm = statusMeta[c.status] ?? statusMeta.insufficient;
              return (
                <div key={c.label} className={`flex items-start gap-3 rounded-lg p-3 border ${c.unknown ? 'bg-white border-dashed border-slate-200' : 'bg-slate-50 border-slate-100'}`}>
                  <span
                    className={`text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${sm.badge}`}
                    title={sm.label}
                  >
                    <Icon name={sm.icon} className="w-3 h-3" strokeWidth={2.5} />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-semibold ${c.unknown ? 'text-slate-500' : 'text-slate-800'}`}>
                        {c.label}
                        {c.blocking && c.status === 'fail' && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">blocking</span>}
                        {/* An unknown criterion is labelled as excluded from the score,
                            not just greyed out. Grey alone reads as "less important". */}
                        {c.unknown && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">not scored</span>}
                        {/* Weight makes it explicit why one unmet criterion moved the
                            score more than another. */}
                        {c.weight > 0 && (
                          <span className="ml-1.5 text-[9px] font-normal text-slate-400" title={`Carries ${Math.round(c.weight * 100)}% of the readiness score`}>
                            {Math.round(c.weight * 100)}% of score
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-slate-600 text-right flex-shrink-0">
                        <span className="text-slate-400">{c.requirement}</span> ·{' '}
                        <span className={c.unknown ? 'italic text-slate-400' : 'font-semibold'}>{c.value}</span>
                      </span>
                    </div>
                    {c.detail && <div className="text-[10px] text-slate-500 mt-0.5">{c.detail}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {selected.verdict === 'ready' && (
            <div className="mt-4 flex items-center gap-3 pt-3 border-t border-slate-100">
              <span className="text-[11px] text-slate-500">Next:</span>
              <button onClick={() => handlePromote(selected.agentId)} className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">Promote to {AGENT_SCOPE_META[selected.targetLevel].name} →</button>
              <button onClick={() => handlePromote(selected.agentId, 30)} className="text-[11px] text-slate-500 hover:text-slate-700">Promote with 30-day probation →</button>
            </div>
          )}
          {selected.verdict === 'not_ready' && (
            <div className="mt-4 text-[10px] text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-100">
              Not yet ready — one or more blocking criteria are unmet. Resolve them above to graduate. Oversight reduction is earned, not granted.
            </div>
          )}
          {/* Separate copy from not_ready. Telling an operator to "resolve the
              blocking criteria" is useless when the real problem is that no
              criteria could be evaluated — the action is to instrument the agent. */}
          {selected.verdict === 'insufficient_evidence' && (
            <div className="mt-4 text-[10px] text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-100">
              Not enough evidence — this says nothing about how the agent is performing. Its decisions are not being recorded in sufficient volume for any judgement to rest on. Route this agent's approvals through the Human Oversight workspace so its decisions land in the audit log, then readiness will begin to score.
            </div>
          )}
          <button onClick={() => setSelectedId(null)} className="mt-3 text-[10px] text-slate-400 hover:text-slate-600">Close</button>
        </div>
      )}

      <div className="text-[10px] text-slate-400 bg-slate-50/60 rounded-lg p-3 border border-slate-100">
        <span className="font-semibold text-slate-500">The rubber-stamp signal:</span> when a reviewer approves nearly everything an agent proposes (high agreement, flat/rising trend), the human step is adding latency, not safety — the strongest evidence to graduate. The ratchet is bidirectional: any incident, drift, or agreement decline auto-recommends stepping back down, with a safe degraded state (propose-only).
      </div>
    </div>
  );
}
