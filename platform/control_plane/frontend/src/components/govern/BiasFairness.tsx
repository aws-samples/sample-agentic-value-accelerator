/**
 * BiasFairness — the first-class "Bias & Fairness" tab for Model Management.
 *
 * Four model-scoped sections behind a sub-nav:
 *   1. LLM-native bias   — a LIVE Stereotyping/Toxicity signal pulled from the
 *                          account's Bedrock evaluation jobs, surrounded by
 *                          illustrative counterfactual-substitution / red-team probes.
 *   2. Decision fairness — disparate impact, demographic parity, equal opportunity
 *                          and equalized odds per protected attribute, with the
 *                          definition trade-offs spelled out.
 *   3. Proxy & intersectional — proxy-variable (redlining) detection and an
 *                          intersectional race×gender grid that surfaces disparity
 *                          hidden from single-axis checks.
 *   4. Regulatory + mitigation — findings mapped to ECOA/Reg-B, EEOC four-fifths,
 *                          NYC LL144, EU AI Act Art.10, SR 11-7, plus a before/after
 *                          bias-mitigation tracker.
 *
 * Honest live/illustrative split matching the rest of Govern: the LLM-native
 * number is real from Bedrock; the tabular fairness is illustrative but shaped
 * for a drop-in SageMaker Clarify wiring.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { governEvalsApi, governGuardrailsApi, type AwsGuardrailTelemetryResponse } from '../../api/client';
import {
  BIAS_FAIRNESS, BIAS_MODELS, LIVE_BIAS_METRICS,
  type FairStatus, type FairnessDefinition,
} from './biasFairnessData';
import LiveHeader from './LiveHeader';
import { usePollingKey } from './usePollingKey';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';

type Section = 'llm' | 'decision' | 'proxy' | 'regulatory';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'llm', label: 'LLM-Native Bias' },
  { id: 'decision', label: 'Decision Fairness' },
  { id: 'proxy', label: 'Proxy & Intersectional' },
  { id: 'regulatory', label: 'Regulatory & Mitigation' },
];

const card = 'bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm';
const heading = 'text-sm font-semibold text-slate-900';

const statusBadgeCls = (s: FairStatus) =>
  s === 'pass' ? 'bg-emerald-100 text-emerald-700' : s === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';
const statusLabel = (s: FairStatus) => (s === 'pass' ? 'Pass' : s === 'warning' ? 'Review' : 'Fail');
const barColor = (s: FairStatus) => (s === 'pass' ? '#10b981' : s === 'warning' ? '#f59e0b' : '#dc2626');
const shortMetric = (m: string) => m.replace(/^Builtin\./, '');

export default function BiasFairness({ modelId: propModelId }: { modelId?: string } = {}) {
  const [localModelId, setLocalModelId] = useState(BIAS_MODELS[0].id);
  const modelId = propModelId && BIAS_FAIRNESS[propModelId] ? propModelId : localModelId;
  const [section, setSection] = useState<Section>('llm');
  const data = BIAS_FAIRNESS[modelId];

  return (
    <div className="space-y-6">
      {/* Intro + cross-links */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Bias &amp; Fairness</h2>
          <p className="text-[11px] text-slate-500 max-w-2xl">
            LLM-native bias from live evaluations, formal decision-fairness across protected classes,
            proxy &amp; intersectional analysis, and regulatory mapping with a mitigation tracker.
            Feature attribution and adverse-action transparency live in{' '}
            <Link to="/govern/models?tab=explainability" className="text-blue-600 hover:text-blue-700 font-medium">Explainability →</Link>.
          </p>
        </div>
        {!propModelId && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Model
            <select
              value={modelId}
              onChange={e => setLocalModelId(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            >
              {BIAS_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Section sub-nav */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto" role="tablist">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              section === s.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'llm' && <LlmBiasSection data={data} />}
      {section === 'decision' && <DecisionFairnessSection data={data} />}
      {section === 'proxy' && <ProxyIntersectionalSection data={data} />}
      {section === 'regulatory' && <RegulatorySection data={data} />}
    </div>
  );
}

type Bundle = typeof BIAS_FAIRNESS[string];

/* ───────── 1. LLM-native bias (LIVE Stereotyping/Toxicity + illustrative probes) ───────── */

interface LiveBiasSignal {
  loading: boolean;
  live: boolean;
  metrics: { metric: string; mean: number }[];   // e.g. Stereotyping 0.03
  jobsScored: number;
  note?: string | null;
}

/** Pull the account's completed model-eval jobs and extract any bias-adjacent
 *  metric means (Stereotyping / Toxicity). Newest completed jobs first, capped. */
function useLiveBiasSignal(): LiveBiasSignal {
  const pollKey = usePollingKey(60_000);
  const [state, setState] = useState<LiveBiasSignal>({ loading: true, live: false, metrics: [], jobsScored: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const jobsResp = await governEvalsApi.jobs(100);
        const completed = jobsResp.jobs.filter(j =>
          j.status.toLowerCase() === 'completed' && j.application_type.toLowerCase().includes('model'));
        // Probe up to a few recent completed jobs for bias metrics in their scores.
        const acc = new Map<string, { sum: number; n: number }>();
        let scored = 0;
        for (const job of completed.slice(0, 6)) {
          try {
            // Use job name (not ARN) for lookup to avoid exposing account IDs.
            const s = await governEvalsApi.scores(job.name);
            if (!s.live || !s.metrics.length) continue;
            let hit = false;
            for (const m of s.metrics) {
              const short = shortMetric(m.metric);
              if ((LIVE_BIAS_METRICS as readonly string[]).includes(short)) {
                const b = acc.get(short) ?? { sum: 0, n: 0 };
                b.sum += m.mean_score; b.n += 1; acc.set(short, b);
                hit = true;
              }
            }
            if (hit) scored += 1;
          } catch { /* skip a job whose scores don't parse */ }
        }
        if (cancelled) return;
        const metrics = [...acc.entries()].map(([metric, b]) => ({ metric, mean: +(b.sum / b.n).toFixed(3) }));
        setState({
          loading: false,
          live: jobsResp.live && metrics.length > 0,
          metrics,
          jobsScored: scored,
          note: metrics.length ? null
            : (jobsResp.live
              ? 'No Stereotyping/Toxicity metric found in recent evaluation jobs — add a Trust & Safety metric set to an evaluation to light this up.'
              : jobsResp.note ?? 'Bedrock evaluations unavailable.'),
        });
      } catch {
        if (!cancelled) setState({ loading: false, live: false, metrics: [], jobsScored: 0, note: 'Bedrock evaluations unreachable.' });
      }
    })();
    return () => { cancelled = true; };
  }, [pollKey]);

  return state;
}

/** Live Bedrock guardrail intervention telemetry (auto-refreshing). */
function useLiveGuardrails() {
  const pollKey = usePollingKey(60_000);
  const [state, setState] = useState<{ loading: boolean; data: AwsGuardrailTelemetryResponse | null }>({ loading: true, data: null });
  useEffect(() => {
    let cancelled = false;
    governGuardrailsApi.telemetry(30)
      .then(d => { if (!cancelled) setState({ loading: false, data: d }); })
      .catch(() => { if (!cancelled) setState({ loading: false, data: null }); });
    return () => { cancelled = true; };
  }, [pollKey]);
  return state;
}

/** The live "what our guardrails actually blocked" panel. */
function LiveGuardrailPanel() {
  const { loading, data } = useLiveGuardrails();
  const live = !!data?.live;
  const maxPolicy = Math.max(...(data?.by_policy ?? []).map(p => p.interventions), 1);
  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
      <LiveHeader
        live={live}
        label="Live · Bedrock guardrail interventions"
        caption="what your account's guardrails actually blocked or redacted (CloudWatch AWS/Bedrock/Guardrails · last 30d)"
        autoRefresh
        right={live ? (
          <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{data!.guardrails_with_metrics}/{data!.total_guardrails} active</span>
        ) : undefined}
      />
      {loading ? (
        <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading guardrail telemetry…</div>
      ) : live ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="Guardrails" value={data!.total_guardrails} variant="info" sub={`${data!.guardrails_with_metrics} with traffic`} />
            <StatCard label="Invocations" value={data!.total_invocations.toLocaleString()} sub="last 30 days" />
            <StatCard label="Interventions" value={data!.total_interventions.toLocaleString()} variant="success" sub="blocked or redacted" />
            <StatCard label="Intervention rate" value={`${data!.intervention_rate_pct}%`} variant={data!.intervention_rate_pct >= 50 ? 'warning' : 'muted'} sub="of invocations" />
          </div>
          {/* Per-policy-type breakdown — the "what kind of harm" story */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-sm font-semibold text-slate-900">Interventions by policy</h4>
              <LiveDataBadge />
              <span className="text-[10px] text-slate-400">which guardrail policy caught it</span>
            </div>
            <div className="space-y-2">
              {data!.by_policy.map(p => (
                <div key={p.policy_type} className="flex items-center gap-3 text-[11px]">
                  <span className="w-40 shrink-0 font-medium text-slate-700" title={p.dimension}>{p.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(2, (p.interventions / maxPolicy) * 100)}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums font-semibold text-slate-700">{p.interventions.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-slate-400 mt-2">PII / sensitive-data redaction is the dominant intervention type in most FSI deployments — a direct fairness &amp; privacy control.</div>
          </div>
          {/* Per-guardrail rollup */}
          {data!.guardrails.some(g => g.has_metrics) && (
            <div className="mt-3 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-2">By guardrail</h4>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                    <th scope="col" className="font-medium pb-2">Guardrail</th>
                    <th scope="col" className="font-medium pb-2 text-right">Invocations</th>
                    <th scope="col" className="font-medium pb-2 text-right">Interventions</th>
                    <th scope="col" className="font-medium pb-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.guardrails.filter(g => g.has_metrics).map((g, i) => (
                    <tr key={g.guardrail_id} className={i > 0 ? 'border-t border-slate-100' : ''}>
                      <td className="py-1.5 pr-2 font-medium text-slate-800 max-w-[280px] truncate" title={g.description ?? g.name}>{g.name}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">{g.invocations.toLocaleString()}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">{g.interventions.toLocaleString()}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold text-slate-700">{g.intervention_rate_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5">●</span>
          <div>
            <div className="font-medium text-slate-600">No live guardrail telemetry</div>
            <div className="text-[11px] mt-0.5">{data?.note ?? 'Configure a Bedrock guardrail and route traffic through it to see interventions here.'}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function LlmBiasSection({ data }: { data: Bundle }) {
  const signal = useLiveBiasSignal();
  const worstProbe = useMemo(
    () => data.probes.reduce((w, p) => (p.divergenceRate > w.divergenceRate ? p : w), data.probes[0]),
    [data.probes],
  );

  return (
    <div className="space-y-6">
      {/* LIVE bias signal from Bedrock evals */}
      <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
        <LiveHeader
          live={signal.live}
          label="Live · Bedrock bias & safety metrics"
          caption="Stereotyping / Toxicity means from your account's model evaluations (lower is safer)"
          autoRefresh
          right={signal.live ? (
            <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{signal.jobsScored} job{signal.jobsScored === 1 ? '' : 's'} scored</span>
          ) : undefined}
        />
        {signal.loading ? (
          <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading bias metrics from evaluations…</div>
        ) : signal.live ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {signal.metrics.map(m => {
              const pct = Math.round(m.mean * 100);
              const good = m.mean <= 0.05;
              const warn = !good && m.mean <= 0.15;
              return (
                <div key={m.metric} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{m.metric}</span>
                    <LiveDataBadge />
                  </div>
                  <div className={`text-2xl font-bold tabular-nums ${good ? 'text-emerald-600' : warn ? 'text-amber-600' : 'text-rose-600'}`}>{m.mean.toFixed(3)}</div>
                  <div className="text-[10px] text-slate-400">mean · {good ? 'within tolerance' : warn ? 'review' : 'elevated'}</div>
                  <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(3, pct)}%`, backgroundColor: good ? '#10b981' : warn ? '#f59e0b' : '#dc2626' }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            <span className="text-amber-500 mt-0.5">●</span>
            <div>
              <div className="font-medium text-slate-600">No live bias metric yet</div>
              <div className="text-[11px] mt-0.5">{signal.note}</div>
            </div>
          </div>
        )}
      </div>

      {/* LIVE guardrail interventions — what the account's guardrails actually blocked */}
      <LiveGuardrailPanel />

      {/* Illustrative counterfactual-substitution / red-team probes */}
      <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50/60 via-white to-white p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-2 px-1 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Counterfactual bias probes · illustrative</span>
          <MockDataBadge integration="Red-team / counterfactual-substitution harness — swap only a protected term, measure answer divergence" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.probes.map(p => (
            <StatCard
              key={p.id}
              label={p.category}
              value={`${(p.divergenceRate * 100).toFixed(1)}%`}
              sub={`divergence · ${statusLabel(p.status)}`}
              variant={p.status === 'pass' ? 'success' : p.status === 'warning' ? 'warning' : 'danger'}
            />
          ))}
        </div>
        <div className="space-y-2">
          {data.probes.map(p => (
            <div key={p.id} className="bg-white rounded-lg p-3 border border-slate-200/70" style={{ borderLeft: `3px solid ${barColor(p.status)}` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-slate-800">{p.category}</span>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusBadgeCls(p.status)}`}>swap: {p.swappedDimension}</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500 mb-1">{p.template}</div>
              <div className="text-[10px] text-slate-500">{p.example}</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-slate-400 px-1">
          Worst divergence this run: <span className="font-medium text-slate-600">{worstProbe.category}</span> ({(worstProbe.divergenceRate * 100).toFixed(1)}%).
          A production wiring runs these templates through the model and scores answer divergence when only the protected term changes.
        </div>
      </div>
    </div>
  );
}

/* ───────── 2. Decision fairness (multiple definitions) ───────── */

function DefinitionPill({ def }: { def: FairnessDefinition }) {
  const display = def.kind === 'ratio' ? def.value.toFixed(2) : `${(def.value * 100).toFixed(1)}%`;
  const thr = def.kind === 'ratio' ? `≥${def.threshold}` : `≤${(def.threshold * 100).toFixed(0)}%`;
  return (
    <div className="bg-white rounded-lg p-2.5 border border-slate-200/70" style={{ borderLeft: `3px solid ${barColor(def.status)}` }} title={def.plainMeaning}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold text-slate-700">{def.label}</span>
        <span className={`text-[9px] font-bold px-1.5 rounded ${statusBadgeCls(def.status)}`}>{display}</span>
      </div>
      <div className="text-[8px] text-slate-400">{def.kind === 'ratio' ? 'ratio' : 'gap'} · target {thr}</div>
      <div className="text-[9px] text-slate-500 leading-snug mt-1">{def.plainMeaning}</div>
    </div>
  );
}

function DecisionFairnessSection({ data }: { data: Bundle }) {
  return (
    <div className="space-y-4">
      <div className="text-[11px] text-slate-500 px-1">
        Four formal fairness definitions per protected attribute. They can conflict — a model can satisfy demographic parity yet fail equalized odds —
        so the attribute badge reflects the <span className="font-medium text-slate-700">strictest failing</span> definition. Illustrative (shaped for SageMaker Clarify wiring).
      </div>
      {data.fairness.map((fa, idx) => {
        const maxRate = Math.max(...fa.subgroups.map(s => s.approvalRate));
        return (
          <div key={idx} className={card}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={heading}>{fa.attribute}</h3>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadgeCls(fa.status)}`}>{statusLabel(fa.status)}</span>
            </div>

            {/* Definitions row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              {fa.definitions.map(d => <DefinitionPill key={d.key} def={d} />)}
            </div>

            {/* Subgroup table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                  <th scope="col" className="py-2 px-3 text-left font-medium">Subgroup</th>
                  <th scope="col" className="py-2 px-3 text-left font-medium">Selection rate</th>
                  <th scope="col" className="py-2 px-3 text-center font-medium">TPR</th>
                  <th scope="col" className="py-2 px-3 text-center font-medium">FPR</th>
                  <th scope="col" className="py-2 px-3 text-center font-medium">Accuracy</th>
                  <th scope="col" className="py-2 px-3 text-right font-medium">n</th>
                </tr>
              </thead>
              <tbody>
                {fa.subgroups.map((s, i) => {
                  const isPriv = s.group === fa.privilegedGroup;
                  return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-2 px-3 font-medium text-slate-800">{s.group}{isPriv && <span className="ml-1 text-[9px] text-slate-400">(ref)</span>}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden max-w-[140px]">
                            <div className="h-full rounded-full" style={{ width: `${(s.approvalRate / maxRate) * 100}%`, backgroundColor: s.approvalRate / maxRate >= 0.8 ? '#10b981' : '#f59e0b' }} />
                          </div>
                          <span className="text-[11px] text-slate-600">{(s.approvalRate * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center text-[11px] text-slate-600">{(s.tpr * 100).toFixed(1)}%</td>
                      <td className="py-2 px-3 text-center text-[11px] text-slate-600">{(s.fpr * 100).toFixed(1)}%</td>
                      <td className="py-2 px-3 text-center text-[11px] text-slate-600">{(s.accuracy * 100).toFixed(1)}%</td>
                      <td className="py-2 px-3 text-right text-[11px] text-slate-400">{s.count.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-[10px] text-slate-500 mt-2">{fa.note}</div>
          </div>
        );
      })}
      <div className="text-[10px] text-slate-400 px-1">
        Findings flagged Review/Fail should be documented and escalated to fair-lending compliance — see{' '}
        <Link to="/govern/risk" className="text-blue-600 hover:text-blue-700">Risk Management</Link>.
      </div>
    </div>
  );
}

/* ───────── 3. Proxy & intersectional ───────── */

function ProxyIntersectionalSection({ data }: { data: Bundle }) {
  const grid = data.intersectional;
  const cellFor = (a: string, b: string) => grid.cells.find(c => c.groupA === a && c.groupB === b);
  return (
    <div className="space-y-4">
      {/* Proxy variables */}
      <div className={card}>
        <div className="flex items-center justify-between mb-1">
          <h3 className={heading}>Proxy Variables</h3>
          <span className="text-[10px] text-slate-400">correlation × decision influence = redlining risk</span>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">Features correlated with a protected class can encode bias even when the protected attribute itself is excluded from inputs.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="py-2 px-3 text-left font-medium">Feature</th>
              <th scope="col" className="py-2 px-3 text-left font-medium">Proxy for</th>
              <th scope="col" className="py-2 px-3 text-center font-medium">|Correlation|</th>
              <th scope="col" className="py-2 px-3 text-center font-medium">Decision influence</th>
              <th scope="col" className="py-2 px-3 text-center font-medium">Risk</th>
            </tr>
          </thead>
          <tbody>
            {data.proxies.map((p, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-2 px-3 font-medium text-slate-800">{p.feature}</td>
                <td className="py-2 px-3"><span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">{p.proxyFor}</span></td>
                <td className="py-2 px-3 text-center text-[11px] text-slate-600 tabular-nums">{p.correlation.toFixed(2)}</td>
                <td className="py-2 px-3 text-center text-[11px] text-slate-600 tabular-nums">{(p.influence * 100).toFixed(0)}%</td>
                <td className="py-2 px-3 text-center"><span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusBadgeCls(p.status)}`}>{statusLabel(p.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-[10px] text-slate-500 mt-2">{data.proxies[0]?.note}</div>
      </div>

      {/* Intersectional grid */}
      <div className={card}>
        <div className="flex items-center justify-between mb-1">
          <h3 className={heading}>Intersectional Fairness · {grid.attrA} × {grid.attrB}</h3>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${grid.hiddenDisparity ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {grid.hiddenDisparity ? 'Hidden disparity' : 'No hidden disparity'}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">Selection rate per combined subgroup (four-fifths ratio vs the best cell). Single-axis checks can pass while an intersection fails.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                <th scope="col" className="py-2 px-3 text-left font-medium">{grid.attrA} ↓ / {grid.attrB} →</th>
                {grid.groupsB.map(b => <th scope="col" key={b} className="py-2 px-3 text-center font-medium">{b}</th>)}
              </tr>
            </thead>
            <tbody>
              {grid.groupsA.map(a => (
                <tr key={a} className="border-t border-slate-100">
                  <td className="py-2 px-3 font-medium text-slate-800">{a}</td>
                  {grid.groupsB.map(b => {
                    const c = cellFor(a, b);
                    if (!c) return <td key={b} className="py-2 px-3 text-center text-slate-300">—</td>;
                    return (
                      <td key={b} className="py-2 px-3 text-center">
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${statusBadgeCls(c.status)}`}>{(c.approvalRate * 100).toFixed(1)}%</span>
                          <span className="text-[9px] text-slate-400 tabular-nums">ratio {c.disparityVsMax.toFixed(2)} · n {c.count}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-slate-500 mt-2">{grid.note}</div>
      </div>
    </div>
  );
}

/* ───────── 4. Regulatory mapping + mitigation ───────── */

function RegulatorySection({ data }: { data: Bundle }) {
  const stageBadge = (s: string) =>
    s === 'pre-processing' ? 'bg-blue-100 text-blue-700' : s === 'in-processing' ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700';
  const mitStatus = (s: string) =>
    s === 'applied' ? 'bg-emerald-100 text-emerald-700' : s === 'monitoring' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600';
  return (
    <div className="space-y-4">
      {/* Regulatory mapping */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className={heading}>Regulatory Mapping</h3>
          <span className="text-[10px] text-slate-400">bias findings mapped to obligations</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="py-2.5 px-5 text-left font-medium">Framework</th>
              <th scope="col" className="py-2.5 px-3 text-left font-medium">Citation</th>
              <th scope="col" className="py-2.5 px-3 text-left font-medium">Requirement</th>
              <th scope="col" className="py-2.5 px-3 text-center font-medium">Status</th>
              <th scope="col" className="py-2.5 px-5 text-left font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {data.regulatory.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-2.5 px-5 font-medium text-slate-800">{r.framework}</td>
                <td className="py-2.5 px-3 text-[11px] text-slate-500 font-mono">{r.citation}</td>
                <td className="py-2.5 px-3 text-[11px] text-slate-600 max-w-xs">{r.requirement}</td>
                <td className="py-2.5 px-3 text-center"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadgeCls(r.status)}`}>{statusLabel(r.status)}</span></td>
                <td className="py-2.5 px-5 text-[11px] text-slate-500 max-w-xs">{r.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 text-[10px] text-slate-400 border-t border-slate-100">
          Mapping is a governance aid, not legal advice. NYC LL144 requires an <em>independent</em> auditor sign-off; this surface produces the audit evidence pack.
        </div>
      </div>

      {/* Mitigation tracker */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={heading}>Bias Mitigation Tracker</h3>
          <MockDataBadge integration="Before/after debiasing — pre-, in-, and post-processing techniques with the accuracy trade-off" />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
              <th scope="col" className="py-2 px-3 text-left font-medium">Technique</th>
              <th scope="col" className="py-2 px-3 text-left font-medium">Stage</th>
              <th scope="col" className="py-2 px-3 text-left font-medium">Attribute</th>
              <th scope="col" className="py-2 px-3 text-center font-medium">DI before → after</th>
              <th scope="col" className="py-2 px-3 text-center font-medium">Accuracy Δ</th>
              <th scope="col" className="py-2 px-3 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.mitigations.map((m, i) => {
              const improved = m.afterDI > m.beforeDI;
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-2 px-3 font-medium text-slate-800">{m.technique}</td>
                  <td className="py-2 px-3"><span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${stageBadge(m.stage)}`}>{m.stage}</span></td>
                  <td className="py-2 px-3 text-[11px] text-slate-600">{m.attribute}</td>
                  <td className="py-2 px-3 text-center text-[11px] tabular-nums">
                    <span className="text-slate-500">{m.beforeDI.toFixed(2)}</span>
                    <span className="text-slate-300 mx-1">→</span>
                    <span className={improved ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>{m.afterDI.toFixed(2)}</span>
                  </td>
                  <td className={`py-2 px-3 text-center text-[11px] tabular-nums ${m.accuracyDelta < -0.01 ? 'text-amber-600' : 'text-slate-500'}`}>{(m.accuracyDelta * 100).toFixed(1)}%</td>
                  <td className="py-2 px-3 text-center"><span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${mitStatus(m.status)}`}>{m.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="text-[10px] text-slate-400 mt-2 px-1">
          Debiasing trades a small amount of accuracy for a large fairness gain. Each technique is versioned; post-processing (threshold adjustment) needs legal review under ECOA.
        </div>
      </div>
    </div>
  );
}
