// Observability.tsx — the live observability strip that proves AgentCore Observability is
// real, not narrated. Two data sources:
//   1) LIVE (per-turn, from the event stream): active model, hand-off count, tool-call count.
//   2) HYDRATED (from GET /observability → CloudWatch GenAI Observability via Metrics
//      Insights): cumulative token usage (in/out), model latency (avg/max), per-model split.
// Plus a "View in CloudWatch" deep-link to the GenAI Observability console.
//
// Auth: the /observability route is Cognito-authorized, so we send the ID token (same as
// /policy/toggle). Never throws to the UI — a failed fetch leaves the live signals intact.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Activity, ExternalLink, Coins, Cpu, Timer, GitBranch, RefreshCw } from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import { cn } from './lib/cn';

type ObsMetrics = {
  tokens?: { input: number; output: number; total: number };
  model_invocations?: number;
  latency_seconds?: { avg: number; max: number };
  source?: string;
  error?: string;
};
type ObsResponse = {
  metrics?: ObsMetrics;
  per_model?: Array<{ model: string; total: number; error?: string }>;
  console_deeplink?: string;
  observability?: { platform?: string; instrumentation?: string; log_group?: string };
};

const MODEL_SHORT: Record<string, string> = {
  auto: 'Auto · Tiered',
  'opus-4-8': 'Opus 4.8',
  'sonnet-5': 'Sonnet 5',
  'sonnet-4-6': 'Sonnet 4.6',
  'nova-pro': 'Nova Pro',
  'llama4-maverick': 'Llama 4 Maverick',
  'gpt-oss-120b': 'GPT-OSS 120B',
};

/** Compact token count, consistent with the headline "203.2k" formatting. Sub-1000
 * counts stay exact; thousands collapse to "k" so the strip never shows a raw 6-digit
 * run-on like "189760↓". */
function compact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
}

function shortModel(id: string): string {
  if (MODEL_SHORT[id]) return MODEL_SHORT[id];
  // Bedrock id → friendly tail. Match the newer Sonnet 5 BEFORE the 4.x fallback.
  if (id.includes('opus')) return 'Opus 4.8';
  if (id.includes('sonnet-5') || id.includes('sonnet5')) return 'Sonnet 5';
  if (id.includes('sonnet')) return 'Sonnet 4.6';
  if (id.includes('nova')) return 'Nova Pro';
  if (id.includes('maverick')) return 'Llama 4 Maverick';
  if (id.includes('gpt-oss')) return 'GPT-OSS 120B';
  if (id.includes('haiku')) return 'Haiku 4.5';
  return id;
}

// Inline readout separated from its neighbors by a hairline divider (command-console
// telemetry strip). The leading divider is suppressed on the first item via `first`.
function Stat({
  Icon,
  label,
  value,
  sub,
  first,
}: {
  Icon: typeof Coins;
  label: string;
  value: string;
  sub?: ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 py-0.5 pl-3 pr-1',
        !first && 'border-l border-border',
      )}
    >
      <Icon size={13} className="text-muted-foreground" />
      <div className="leading-tight">
        <div className="field-key text-[9.5px]">{label}</div>
        <div className="tabular text-[12.5px] font-semibold text-foreground">
          {value}
          {sub && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

export function Observability({
  auth,
  cfg,
  model,
  sessionId,
  handoffCount,
  toolCount,
  busy,
  refreshKey,
  onActive,
}: {
  auth: Auth;
  cfg: AppConfig;
  model: string;
  sessionId: string;
  handoffCount: number;
  toolCount: number;
  busy?: boolean;
  refreshKey: number; // bump to re-hydrate (e.g. after a turn finishes)
  onActive?: (active: boolean) => void; // report real-telemetry presence up to the stack rail
}) {
  const [obs, setObs] = useState<ObsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Metrics are scoped to the active conversation (session_id) so the strip reflects
  // THIS session's usage, not an account-wide window. The backend rolls these up from
  // the same CloudWatch spans the Execution Trace uses, so the two always agree.
  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ window: '1440' });
      if (sessionId) qs.set('session_id', sessionId);
      const resp = await fetch(`${cfg.API_URL}/observability?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${auth.getIdToken()}` },
      });
      if (resp.ok) setObs(await resp.json());
    } catch {
      /* leave prior data; live signals still render */
    } finally {
      setLoading(false);
    }
  }, [auth, cfg, sessionId]);

  // Re-hydrate when a turn completes (refreshKey changes) — gives CloudWatch a moment to
  // ingest, then pulls fresh totals. Also hydrate once on mount and when the session
  // switches (so resuming an old conversation shows ITS usage, not the prior one's).
  useEffect(() => {
    const t = setTimeout(hydrate, refreshKey === 0 ? 0 : 4000);
    return () => clearTimeout(t);
  }, [refreshKey, hydrate]);
  useEffect(() => {
    setObs(null); // clear stale numbers immediately on session switch
  }, [sessionId]);

  const m = obs?.metrics;
  const tokens = m?.tokens;
  const lat = m?.latency_seconds;
  const deeplink = obs?.console_deeplink;

  // Report to the stack rail whether Observability has REAL session telemetry to show —
  // i.e. this session has produced spans (tokens or model calls). Live tool/hand-off counts
  // also count, so the rail lights the moment a turn does anything, not just once CloudWatch
  // has ingested. This keeps "exercised this session" literally true: dark until there's data.
  const hasTelemetry =
    (tokens?.total ?? 0) > 0 ||
    (m?.model_invocations ?? 0) > 0 ||
    handoffCount > 0 ||
    toolCount > 0;
  useEffect(() => {
    onActive?.(hasTelemetry);
  }, [hasTelemetry, onActive]);

  return (
    <div className="border-b border-border bg-card/60 px-5 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-y-1">
        <span className="flex items-center gap-1.5 pr-3">
          <Activity size={13} className={busy ? 'text-ok animate-pulse-dot' : 'text-primary'} />
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <span className="field-key">Observability</span>
        </span>

        {/* Inline readouts, hairline-divided (no gap so the dividers sit flush). All
            usage figures are scoped to the active session. */}
        <div className="flex flex-wrap items-center">
          <Stat Icon={Cpu} label="Model" value={shortModel(model)} first />
          <Stat
            Icon={Coins}
            label="Session tokens"
            value={tokens ? `${(tokens.total / 1000).toFixed(1)}k` : '—'}
            sub={
              tokens ? (
                <>
                  <span className="text-muted-foreground" title={`${tokens.input.toLocaleString()} input tokens`}>
                    {compact(tokens.input)}↓
                  </span>{' '}
                  <span className="text-primary" title={`${tokens.output.toLocaleString()} output tokens`}>
                    {compact(tokens.output)}↑
                  </span>
                </>
              ) : undefined
            }
          />
          <Stat
            Icon={Timer}
            label="Model latency"
            value={lat && lat.avg ? `${lat.avg.toFixed(2)}s` : '—'}
            sub={lat && lat.max ? `max ${lat.max.toFixed(1)}s` : undefined}
          />
          <Stat
            Icon={GitBranch}
            label="Hand-offs"
            value={String(handoffCount)}
            sub={`${toolCount} tool${toolCount === 1 ? '' : 's'}`}
          />
          {m?.model_invocations != null && (
            <Stat Icon={Activity} label="Model calls" value={String(m.model_invocations)} />
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={hydrate}
            title="Refresh CloudWatch metrics"
            className="flex size-7 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          {deeplink && (
            <a
              href={deeplink}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-[11.5px] font-medium text-secondary-foreground transition-colors hover:bg-accent"
            >
              <ExternalLink size={12} />
              View in CloudWatch
            </a>
          )}
        </div>
      </div>

      {/* Per-model token split — proves multi-model usage with real numbers. */}
      {obs?.per_model && obs.per_model.length > 0 && !obs.per_model[0].error && (
        <div className="mx-auto mt-1.5 flex max-w-5xl flex-wrap items-center gap-2 pl-1">
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <span className="text-[10px] text-muted-foreground">Per-model tokens:</span>
          {obs.per_model.map((pm) => (
            <span key={pm.model} className="tabular rounded-full bg-secondary/60 px-2 py-0.5 text-[10.5px] text-muted-foreground">
              {shortModel(pm.model)} · {(pm.total / 1000).toFixed(1)}k
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
