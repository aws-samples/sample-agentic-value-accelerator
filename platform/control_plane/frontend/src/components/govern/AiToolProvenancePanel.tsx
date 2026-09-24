/**
 * AiToolProvenancePanel — defence in depth for agentic coding.
 *
 * Answers two questions per observed caller/tool pair, from evidence only:
 *   • where the call went    — Bedrock, a vendor public API, or unknown
 *   • how the tool installed — managed, an AWS-managed runtime, self-installed, or an
 *                              unseen host (the last is a visibility gap, not a finding)
 *
 * WHY THIS PANEL IS BUILT AROUND ITS OWN LIMITS
 *
 * Every AI-tool detector in this platform only sees tools that already talk to AWS. A CLI
 * pointed at api.anthropic.com produces no CloudTrail event and no metric, so it is absent
 * from these counts entirely — not counted as `unknown`, absent. A reader who does not know
 * that will read "0 public API" as "nobody bypassed Bedrock".
 *
 * So the coverage block is not a footnote here; it is rendered before the findings, and the
 * blind spots come from the backend as prose and are printed verbatim. `pct` may be null
 * (no denominator) which renders as "no denominator", never as 0%.
 *
 * Nothing here can see a laptop off the corporate network. The panel says so rather than
 * implying coverage it does not have.
 */
import { useEffect, useState } from 'react';
import {
  governDeveloperAiApi,
  type AiToolProvenanceResponse,
  type AiToolProvenanceRecord,
  type CoverageRatio,
  type CallPath,
  type InstallProvenance,
  type ToolClass,
} from '../../api/client';
import { Icon } from './icons';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';

/** Display metadata per call path. `unknown` is neutral, NOT a warning — it is unmeasured. */
const CALL_PATH_META: Record<CallPath, { label: string; chip: string; hint: string }> = {
  bedrock: {
    label: 'Bedrock',
    chip: 'bg-emerald-100 text-emerald-700',
    hint: 'Proven in-account by a CloudTrail Bedrock event — logged, guardrail-eligible, billed to you',
  },
  public_api: {
    label: 'Vendor API',
    chip: 'bg-rose-100 text-rose-700',
    hint: 'Proven by a DNS match on a provider domain — this traffic left AWS and is outside your guardrails',
  },
  unknown: {
    label: 'Unknown path',
    chip: 'bg-slate-100 text-slate-600',
    hint: 'No Bedrock event and no DNS evidence. Unmeasured, not a violation',
  },
};

/** Display metadata per install provenance. */
const INSTALL_META: Record<InstallProvenance, { label: string; chip: string; hint: string }> = {
  managed: {
    label: 'Managed',
    chip: 'bg-emerald-100 text-emerald-700',
    hint: 'Host is under endpoint management; where package inventory exists, the tool is in it',
  },
  managed_runtime: {
    label: 'AWS runtime',
    chip: 'bg-emerald-100 text-emerald-700',
    hint: 'Serverless execution environment (Lambda, Fargate, AgentCore) — provisioned by AWS from a deployment package, so there is no endpoint to enrol and nothing hand-installed',
  },
  self_installed: {
    label: 'Self-installed',
    chip: 'bg-amber-100 text-amber-700',
    hint: 'The host inventory was read and this tool is absent from it — hand-installed',
  },
  unknown_host: {
    label: 'Unseen host',
    chip: 'bg-slate-100 text-slate-600',
    hint: 'The call came from a host with no endpoint coverage. Not the same as self-installed',
  },
};

const TOOL_CLASS_META: Record<ToolClass, { label: string; chip: string; hint: string }> = {
  coding_tool: {
    label: 'Coding tool',
    chip: 'bg-indigo-100 text-indigo-700',
    hint: 'An identified AI coding assistant',
  },
  sdk_caller: {
    label: 'SDK / workload',
    chip: 'bg-sky-100 text-sky-700',
    hint: 'A generic SDK user agent — a deployed application, not shadow developer tooling',
  },
  unidentified: {
    label: 'Unidentified',
    chip: 'bg-slate-100 text-slate-600',
    hint: 'User agent matched no known tool or SDK. Reported as-is, never guessed',
  },
};

/**
 * One coverage ratio.
 *
 * `pct === null` means the denominator is zero, and it renders as "no denominator" rather
 * than 0%. Those are opposite readings: 0% is a control that is failing, no denominator is
 * nothing to control. Note the `=== null` test — `pct` of 0 is a real measured zero and
 * must not be swallowed by a falsy check.
 */
function CoverageStat({ ratio }: { ratio: CoverageRatio }) {
  const measured = ratio.pct !== null;
  const tone = !measured
    ? 'text-slate-400'
    : ratio.complete
      ? 'text-emerald-600'
      : ratio.pct === 0
        ? 'text-rose-600'
        : 'text-amber-600';

  return (
    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{ratio.label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-lg font-bold tabular-nums ${tone}`}>
          {measured ? `${ratio.pct}%` : '—'}
        </span>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {ratio.covered} / {ratio.total} {ratio.unit}
        </span>
      </div>
      {!measured && (
        <div className="text-[10px] text-slate-400 mt-0.5">
          No denominator — nothing of this kind was found to measure
        </div>
      )}
      {ratio.note && <div className="text-[10px] text-slate-500 mt-1 leading-snug">{ratio.note}</div>}
    </div>
  );
}

function Chip({ label, chip, hint }: { label: string; chip: string; hint: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${chip}`} title={hint}>
      {label}
    </span>
  );
}

/** Bucket counts with every key present, so a zero `unknown` is visible rather than absent. */
function BucketRow<T extends string>({
  title, counts, meta,
}: { title: string; counts: Record<string, number>; meta: Record<T, { label: string; chip: string; hint: string }> }) {
  const keys = Object.keys(meta) as T[];
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{title}</div>
      <div className="flex flex-wrap gap-2">
        {keys.map(key => {
          const m = meta[key];
          // Absent key renders 0 deliberately: every bucket is always shown, because a
          // missing `unknown` reads as "no unknowns" — the opposite of an absent measurement.
          const count = counts[key] ?? 0;
          return (
            <div
              key={key}
              className={`px-2.5 py-1.5 rounded-lg border ${count > 0 ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}`}
              title={m.hint}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold tabular-nums ${count > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                  {count}
                </span>
                <span className="text-[11px] text-slate-600">{m.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProvenanceRow({ rec }: { rec: AiToolProvenanceRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={rec.needs_attention ? 'bg-amber-50/40' : undefined}>
      <div className="flex items-center justify-between px-4 py-3 hover:bg-white transition-colors">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-7 h-7 rounded bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 flex-shrink-0">
            {rec.icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-900">{rec.tool}</span>
              {rec.version && <span className="text-[10px] font-mono text-slate-400">{rec.version}</span>}
              <Chip {...TOOL_CLASS_META[rec.tool_class]} />
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {rec.principal}
              {rec.host_id
                ? ` · ${rec.host_id}`
                : rec.exec_env
                  // A serverless caller has no host by design. Saying "host not identified"
                  // here would read as a visibility gap where there is none.
                  ? ` · ${rec.exec_env}`
                  : ' · host not identified'}
              {` · ${rec.requests} call${rec.requests === 1 ? '' : 's'}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Chip {...CALL_PATH_META[rec.call_path]} />
          <Chip {...INSTALL_META[rec.install_provenance]} />
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            aria-expanded={open}
          >
            {open ? 'Hide' : 'Evidence'}
          </button>
        </div>
      </div>
      {open && (
        // Every classification states what earned it. A provenance verdict without its
        // evidence is an assertion, and this module's whole point is not making those.
        <div className="px-4 pb-3 pt-1 bg-white/70 border-t border-slate-100">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
            <div>
              <dt className="text-slate-500">Tool identity</dt>
              <dd className="text-slate-700">{rec.tool_evidence}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Call path</dt>
              <dd className="text-slate-700">{rec.call_path_evidence}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Host attribution</dt>
              <dd className="text-slate-700">{rec.host_evidence}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Install source</dt>
              <dd className="text-slate-700">{rec.install_evidence}</dd>
            </div>
            {rec.user_agent && (
              <div className="md:col-span-2">
                <dt className="text-slate-500">User agent</dt>
                <dd className="font-mono text-[10px] text-slate-600 break-all">{rec.user_agent}</dd>
              </div>
            )}
            {rec.models.length > 0 && (
              <div className="md:col-span-2">
                <dt className="text-slate-500">Models invoked</dt>
                <dd className="text-slate-700">{rec.models.join(', ')}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

export default function AiToolProvenancePanel({ days = 7 }: { days?: number }) {
  const [data, setData] = useState<AiToolProvenanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governDeveloperAiApi
      .aiToolProvenance(days)
      .then(d => { if (!cancelled) { setData(d); setError(null); } })
      .catch(() => { if (!cancelled) { setData(null); setError('Provenance API unavailable'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const coverage = data?.coverage ?? null;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="finger-print" className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-slate-900">AI Tool Provenance</span>
            {data?.live ? <LiveDataBadge source="CloudTrail + SSM" /> : data ? <MockDataBadge /> : null}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Where each observed AI call went, and how the tool got onto its host. Both classifications
            carry an explicit unknown — an unknown here is a gap in visibility, not a clean result.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Window</div>
          <div className="text-sm font-semibold text-slate-700">{data?.window_days ?? days} days</div>
        </div>
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center text-sm text-slate-400">
          <Icon name="arrow-path" className="w-4 h-4 mr-2 animate-spin" />
          Reading CloudTrail and endpoint inventory…
        </div>
      ) : error || !data ? (
        <div className="flex items-start gap-2 text-[12px] text-slate-600 bg-slate-50 rounded-lg px-4 py-3">
          <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span>{error ?? 'No provenance data returned.'}</span>
        </div>
      ) : (
        <>
          {/* Coverage FIRST. The counts below are unreadable without it: zero findings from
              zero visibility and zero findings from full visibility are the same number. */}
          {coverage && (
            <div className="mb-4">
              <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-2">
                How much of the estate this covers
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <CoverageStat ratio={coverage.endpoint} />
                <CoverageStat ratio={coverage.dns} />
                <CoverageStat ratio={coverage.call_path} />
                <CoverageStat ratio={coverage.package_inventory} />
              </div>
              {coverage.blind_spots.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon name="eye-slash" className="w-3.5 h-3.5 text-amber-700" />
                    <span className="text-[11px] font-semibold text-amber-900 uppercase tracking-wide">
                      What this cannot tell you
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {coverage.blind_spots.map((spot, i) => (
                      <li key={i} className="text-[11px] text-amber-900/90 leading-snug flex gap-2">
                        <span className="text-amber-600 flex-shrink-0">•</span>
                        <span>{spot}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <BucketRow title="Call path" counts={data.by_call_path} meta={CALL_PATH_META} />
            <BucketRow title="Install source" counts={data.by_install_provenance} meta={INSTALL_META} />
            <BucketRow title="Caller type" counts={data.by_tool_class} meta={TOOL_CLASS_META} />
          </div>

          <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-semibold text-slate-700">
                Observed callers ({data.total_records})
              </span>
              <span className="text-[10px] text-slate-500">
                {data.coding_tool_count} identified coding tool{data.coding_tool_count === 1 ? '' : 's'} ·{' '}
                {data.needs_attention_count} needing attention · {data.calls_observed} calls
              </span>
            </div>
            <div className="divide-y divide-slate-200 max-h-96 overflow-y-auto">
              {data.records.length > 0 ? (
                data.records.map((rec, i) => <ProvenanceRow key={i} rec={rec} />)
              ) : (
                // Never render this as an all-clear. With no DNS logging, the tools that
                // matter most would not appear here at all.
                <div className="px-4 py-6 text-center text-[12px] text-slate-500">
                  No AI calls observed in the last {data.window_days} days.
                  {coverage && coverage.dns.covered === 0 && (
                    <span className="block mt-1 text-amber-700">
                      This is not an all-clear: with no DNS query logging, a tool calling a vendor
                      API would produce no record here.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {data.note && (
            <p className="text-[11px] text-slate-500 mt-3 leading-snug">
              <span className="font-semibold text-slate-600">Source:</span> {data.source} — {data.note}
            </p>
          )}
        </>
      )}
    </div>
  );
}
