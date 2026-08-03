/**
 * LiveBedrockEvals — the LIVE-from-AWS section for the Safety Evals surface.
 *
 * Lists the account's real Bedrock evaluation jobs (bedrock:ListEvaluationJobs):
 * model + RAG evals, their status, task types, and models under test. This is
 * distinct from the published external safety benchmarks (HarmBench/WMDP/…) below
 * it — those measure different things and stay illustrative. Honest live badge;
 * graceful empty state when Bedrock is unavailable.
 */
import { useEffect, useState } from 'react';
import { governEvalsApi, type AwsEvaluationJobsResponse, type AwsEvalScoresResponse } from '../../../api/client';
import { LiveDataBadge } from '../DataSourceIndicator';
import StatCard from '../StatCard';
import { usePollingKey } from '../usePollingKey';
import LiveHeader from '../LiveHeader';

const statusBadge: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  inprogress: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-blue-100 text-blue-700',
  stopped: 'bg-slate-100 text-slate-600',
  failed: 'bg-rose-100 text-rose-700',
};

// Metrics where LOWER is safer — colour the bar by safety, not magnitude.
const LOWER_IS_SAFER = new Set(['Harmfulness', 'Stereotyping', 'Refusal']);
const shortMetric = (m: string) => m.replace(/^Builtin\./, '');

function scoreColor(metric: string, v: number): string {
  const good = LOWER_IS_SAFER.has(shortMetric(metric)) ? v <= 0.2 : v >= 0.7;
  const bad = LOWER_IS_SAFER.has(shortMetric(metric)) ? v >= 0.5 : v < 0.4;
  return good ? 'bg-emerald-500' : bad ? 'bg-rose-500' : 'bg-amber-500';
}

// Per-job score panel — lazy-fetches the real S3-parsed metric means on expand.
// Uses job name (not ARN) for the lookup to avoid exposing account IDs.
function JobScores({ jobName }: { jobName: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsEvalScoresResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    governEvalsApi.scores(jobName)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [jobName]);

  if (loading) return <div className="py-3 text-[11px] text-slate-400">Loading scores from S3…</div>;
  if (!data?.live || data.metrics.length === 0) {
    return <div className="py-3 text-[11px] text-slate-500">{data?.note ?? 'No parsed scores for this job.'}</div>;
  }
  return (
    <div className="py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold text-slate-700">Per-metric scores</span>
        <LiveDataBadge />
        <span className="text-[10px] text-slate-400">
          {data.records_scored.toLocaleString()} records{data.capped ? ' (capped)' : ''} · lower-is-safer metrics coloured by safety
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
        {data.metrics.map(m => (
          <div key={m.metric} className="flex items-center gap-2 text-[11px]">
            <span className="w-36 shrink-0 truncate text-slate-600" title={m.metric}>
              {shortMetric(m.metric)}
              {LOWER_IS_SAFER.has(shortMetric(m.metric)) && <span className="text-[8px] text-slate-400 ml-1">↓safer</span>}
            </span>
            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${scoreColor(m.metric, m.mean_score)}`} style={{ width: `${Math.max(3, m.mean_score * 100)}%` }} />
            </div>
            <span className="w-10 shrink-0 text-right tabular-nums font-medium text-slate-700">{m.mean_score.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LiveBedrockEvals() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AwsEvaluationJobsResponse | null>(null);
  const [openJob, setOpenJob] = useState<string | null>(null);
  const pollKey = usePollingKey(60_000);
  useEffect(() => {
    let cancelled = false;
    // Silent refetch on poll (don't reset to spinner) so the list updates in place.
    governEvalsApi.jobs(100)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pollKey]);

  const jobs = data?.jobs ?? [];
  const live = !!data?.live;

  return (
    <div className="mb-8 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm">
      <LiveHeader
        live={live}
        label="Live · Bedrock model evaluations"
        caption="real evaluation jobs run in your account (bedrock:ListEvaluationJobs)"
        autoRefresh
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Evaluation jobs" value={data ? data.total : '—'} variant="info" sub={live ? `${data!.model_evals} model · ${data!.rag_evals} RAG` : undefined} />
        <StatCard label="Completed" value={data ? data.completed : '—'} variant="success" />
        <StatCard label="In progress" value={data ? data.in_progress : '—'} variant={data && data.in_progress > 0 ? 'info' : 'muted'} />
        <StatCard label="Failed" value={data ? data.failed : '—'} variant={data && data.failed > 0 ? 'danger' : 'muted'} />
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Evaluation Jobs</h3>
          {live && <LiveDataBadge />}
          <span className="text-[11px] text-slate-400">most recent first · click a completed job for real per-metric scores</span>
        </div>
        {loading ? (
          <div className="h-24 flex items-center justify-center text-xs text-slate-400">Loading…</div>
        ) : jobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                  <th scope="col" className="font-medium pb-2">Job</th>
                  <th scope="col" className="font-medium pb-2">Type</th>
                  <th scope="col" className="font-medium pb-2">Task types</th>
                  <th scope="col" className="font-medium pb-2">Model</th>
                  <th scope="col" className="font-medium pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.slice(0, 12).map((j, i) => {
                  const completed = j.status.toLowerCase() === 'completed';
                  const isOpen = openJob === j.name;
                  return (
                  <>
                    <tr
                      key={j.name || i}
                      className={`${i > 0 ? 'border-t border-slate-100' : ''} ${completed ? 'cursor-pointer hover:bg-slate-50/60' : ''}`}
                      onClick={completed ? () => setOpenJob(isOpen ? null : j.name) : undefined}
                    >
                      <td className="py-2 pr-2 font-medium text-slate-800 max-w-[260px] truncate" title={j.name}>
                        {completed && <span className="text-slate-400 mr-1 inline-block w-2">{isOpen ? '▾' : '▸'}</span>}
                        {j.name}
                      </td>
                      <td className="py-2 pr-2 text-slate-500">{j.application_type.replace('Evaluation', ' Eval')}</td>
                      <td className="py-2 pr-2 text-slate-500">{[...new Set(j.task_types)].join(', ') || '—'}</td>
                      <td className="py-2 pr-2 text-slate-500">{j.models[0] ?? '—'}</td>
                      <td className="py-2 text-right">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge[j.status.toLowerCase()] ?? 'bg-slate-100 text-slate-600'}`}>{j.status}</span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-slate-100 bg-slate-50/30">
                        <td colSpan={5} className="px-2"><JobScores jobName={j.name} /></td>
                      </tr>
                    )}
                  </>
                  );
                })}
              </tbody>
            </table>
            {jobs.length > 12 && <div className="text-[11px] text-slate-400 mt-2">+{jobs.length - 12} more jobs</div>}
          </div>
        ) : (
          <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            <span className="text-amber-500 mt-0.5">●</span>
            <div>
              <div className="font-medium text-slate-600">No Bedrock evaluation jobs</div>
              <div className="text-[11px] mt-0.5">{data?.note ?? 'Run a model or RAG evaluation in the Bedrock console and it appears here.'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
