// TraceView.tsx — the "Execution Trace" panel. After a turn finishes, the App fetches
// GET /trace?session_id=…&start=…&end=… which reduces this turn's REAL CloudWatch
// Transaction-Search spans (the aws/spans log group, auto-instrumented by AgentCore
// Runtime + Strands via OpenTelemetry) into per-agent / per-tool / per-model timings.
// This is the authoritative timing source — the in-thread chips are client-observed; these
// numbers come straight from the runtime's own spans. Pure presentation; never throws.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GaugeCircle, Workflow, Wrench, Cpu, Boxes, Clock, Coins, ChevronDown, RefreshCw,
} from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import { cn } from './lib/cn';
import { usePersona } from './personaContext';
import type { PersonaDef } from './personas';

type TraceAgent = { name: string; count: number; duration_s: number; input_tokens: number; output_tokens: number };
type TraceTool = { tool: string; duration_s: number; status?: string };
type TraceModel = { model: string; duration_s: number; input_tokens: number; output_tokens: number };
type TracePrimitive = { name: string; count: number; duration_s: number };
type TraceSummary = {
  agents_invoked: number; tool_calls: number; handoffs: number; model_calls: number;
  total_tokens: number; input_tokens: number; output_tokens: number; wall_seconds: number;
};
export type TraceResponse = {
  session_id: string;
  found?: boolean;
  summary?: TraceSummary;
  agents?: TraceAgent[];
  tools?: TraceTool[];
  models?: TraceModel[];
  primitives?: TracePrimitive[];
  error?: string;
  source?: string;
};

// Map the runtime's gen_ai.agent.name → the swarm color token (matches SwarmFlow). Built from
// the ACTIVE persona's roster, keyed by DISPLAY NAME (the spans carry gen_ai.agent.name), so
// trace rows wear the same colors as the flow rails for whichever desk is running.
function agentColorFor(persona: PersonaDef): Record<string, string> {
  const map: Record<string, string> = { swarm: 'var(--primary)' };
  for (const a of Object.values(persona.agents)) map[a.name] = a.color;
  return map;
}

const SHORT_MODEL: Record<string, string> = {
  'us.anthropic.claude-opus-4-8': 'Opus 4.8',
  'us.anthropic.claude-sonnet-5': 'Sonnet 5',
  'us.anthropic.claude-sonnet-4-6': 'Sonnet 4.6',
};
function shortModel(id: string): string {
  if (SHORT_MODEL[id]) return SHORT_MODEL[id];
  if (id.includes('opus')) return 'Opus 4.8';
  // Match the newer Sonnet 5 BEFORE the 4.x fallback so tiered runs label correctly.
  if (id.includes('sonnet-5') || id.includes('sonnet5')) return 'Sonnet 5';
  if (id.includes('sonnet')) return 'Sonnet 4.6';
  if (id.includes('haiku')) return 'Haiku 4.5';
  return id.replace(/^us\.anthropic\.claude-/, '').replace(/-/g, ' ');
}
function dur(s: number): string {
  if (!Number.isFinite(s)) return '—';
  if (s < 1) return `${Math.round(s * 1000)}ms`;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
}
function compactTok(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
}
/** "1 agent" / "2 agents" — count with a correctly-pluralized noun. */
function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** A horizontal duration bar, sized as a fraction of the slowest row in its group. */
function DurBar({ s, max, color }: { s: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(3, Math.round((s / max) * 100)) : 0;
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function Metric({ Icon, label, value }: { Icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-secondary/50 px-2 py-1">
      <Icon size={12} className="text-muted-foreground" />
      <span className="tabular text-[12px] font-semibold text-foreground">{value}</span>
      <span className="field-key text-[9px]">{label}</span>
    </div>
  );
}

export function TraceView({
  auth,
  cfg,
  sessionId,
  startMs,
  endMs,
  turnKey,
}: {
  auth: Auth;
  cfg: AppConfig;
  sessionId: string;
  startMs?: number;
  endMs?: number;
  turnKey: string; // changes when the underlying turn changes → triggers (re)fetch
}) {
  const { persona } = usePersona();
  const AGENT_COLOR = useMemo(() => agentColorFor(persona), [persona]);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<TraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [tries, setTries] = useState(0);
  const fetchedFor = useRef<string>('');

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ session_id: sessionId });
      if (startMs) qs.set('start', String(Math.floor(startMs / 1000)));
      if (endMs) qs.set('end', String(Math.ceil(endMs / 1000)));
      const resp = await fetch(`${cfg.API_URL}/trace?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${auth.getIdToken()}` },
      });
      if (resp.ok) setData(await resp.json());
    } catch {
      /* leave prior data; the live chips already showed timing */
    } finally {
      setLoading(false);
    }
  }

  // Spans take a few seconds to land in Transaction Search after a turn finishes, and the
  // very first poll often returns nothing. Open lazily: fetch when the panel is first
  // expanded, and auto-retry a couple of times if the trace isn't ingested yet.
  useEffect(() => {
    if (!open) return;
    if (fetchedFor.current !== turnKey) {
      fetchedFor.current = turnKey;
      setData(null);
      setTries(0);
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, turnKey]);

  useEffect(() => {
    if (!open || loading) return;
    if (data && !data.found && tries < 3) {
      const t = setTimeout(() => {
        setTries((n) => n + 1);
        void load();
      }, 3500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, open, loading, tries]);

  const sum = data?.summary;
  const agents = data?.agents || [];
  const tools = data?.tools || [];
  const models = data?.models || [];
  const primitives = data?.primitives || [];
  const maxAgent = Math.max(0, ...agents.map((a) => a.duration_s));
  const maxTool = Math.max(0, ...tools.map((t) => t.duration_s));
  const maxModel = Math.max(0, ...models.map((m) => m.duration_s));

  return (
    <div className="rounded-lg border border-border bg-secondary/20">
      {/* Header / toggle. */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <GaugeCircle size={13} className="text-primary" />
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <span className="field-key text-[10px]">Execution Trace</span>
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <span className="text-[10px] text-muted-foreground">CloudWatch spans</span>
        {sum && (
          <span className="tabular ml-1 hidden text-[10.5px] text-muted-foreground sm:inline">
            {plural(sum.agents_invoked, 'agent')} · {plural(sum.tool_calls, 'tool')} ·{' '}
            {plural(sum.handoffs, 'hand-off')} · {dur(sum.wall_seconds)}
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn('ml-auto text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2.5">
          {/* Summary metrics — the count roll-up the PM asked for. */}
          {sum && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Metric Icon={Clock} label="wall" value={dur(sum.wall_seconds)} />
              <Metric Icon={Workflow} label="agents" value={String(sum.agents_invoked)} />
              <Metric Icon={Wrench} label="tools" value={String(sum.tool_calls)} />
              <Metric Icon={Workflow} label="hand-offs" value={String(sum.handoffs)} />
              <Metric Icon={Cpu} label="model calls" value={String(sum.model_calls)} />
              <Metric Icon={Coins} label="tokens" value={compactTok(sum.total_tokens)} />
            </div>
          )}

          {/* Loading / empty states. */}
          {loading && !data && (
            <div className="flex items-center gap-2 py-2 text-[12px] text-muted-foreground">
              <RefreshCw size={12} className="animate-spin" /> Pulling spans from CloudWatch…
            </div>
          )}
          {data && !data.found && !loading && (
            <div className="flex items-center justify-between py-1.5 text-[11.5px] text-muted-foreground">
              <span>
                {tries < 3 ? 'Spans still landing in Transaction Search…' : 'No spans found for this turn yet.'}
              </span>
              <button
                onClick={() => { setTries(0); void load(); }}
                className="inline-flex items-center gap-1 text-primary hover:opacity-80"
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Retry
              </button>
            </div>
          )}

          {/* Per-agent execution time — the headline "time per agent". */}
          {agents.length > 0 && (
            <Section title="By agent">
              {agents.map((a) => {
                const color = AGENT_COLOR[a.name] || 'var(--primary)';
                return (
                  <Row
                    key={a.name}
                    color={color}
                    label={a.name}
                    note={`${a.count} call${a.count > 1 ? 's' : ''} · ${compactTok(a.input_tokens)}↓ ${compactTok(a.output_tokens)}↑`}
                    value={dur(a.duration_s)}
                  >
                    <DurBar s={a.duration_s} max={maxAgent} color={color} />
                  </Row>
                );
              })}
            </Section>
          )}

          {/* Per-tool durations. */}
          {tools.length > 0 && (
            <Section title="By tool">
              {tools.map((t, i) => (
                <Row
                  key={`${t.tool}-${i}`}
                  color="var(--ok)"
                  label={t.tool}
                  note={t.status || undefined}
                  value={dur(t.duration_s)}
                >
                  <DurBar s={t.duration_s} max={maxTool} color="var(--ok)" />
                </Row>
              ))}
            </Section>
          )}

          {/* Per model-call latency + tokens. */}
          {models.length > 0 && (
            <Section title={`Model calls (${models.length})`}>
              {models.map((m, i) => (
                <Row
                  key={i}
                  color="var(--agent-analytics)"
                  label={shortModel(m.model)}
                  note={`${compactTok(m.input_tokens)}↓ ${compactTok(m.output_tokens)}↑`}
                  value={dur(m.duration_s)}
                >
                  <DurBar s={m.duration_s} max={maxModel} color="var(--agent-analytics)" />
                </Row>
              ))}
            </Section>
          )}

          {/* AgentCore primitive timings (Code Interpreter / Memory). */}
          {primitives.length > 0 && (
            <Section title="AgentCore primitives">
              <div className="flex flex-wrap gap-1.5">
                {primitives.map((p) => (
                  <span
                    key={p.name}
                    className="tabular inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-[10.5px] text-muted-foreground"
                    title={`${p.count} call${p.count > 1 ? 's' : ''}`}
                  >
                    <Boxes size={10} />
                    {p.name} · {dur(p.duration_s)}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          {data?.source && (
            <p className="mt-2.5 text-[9.5px] text-muted-foreground/70">
              Source: {data.source}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="field-key mb-1.5 text-[9px] text-muted-foreground/70">{title}</div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Row({
  color,
  label,
  note,
  value,
  children,
}: {
  color: string;
  label: string;
  note?: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11.5px] font-medium text-foreground">{label}</span>
          <span className="tabular shrink-0 font-mono text-[11px] text-muted-foreground">{value}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          {note && <span className="tabular shrink-0 text-[9.5px] text-muted-foreground/80">{note}</span>}
        </div>
      </div>
    </div>
  );
}
