// Evaluations.tsx — the live AgentCore Evaluations strip. Proves the evaluation loop is real:
//   1) HYDRATED (GET /evaluations): recent per-turn scores + trends from the online-eval config
//      (built-in evaluators + the custom GOVERNANCE judge — "did the agent respect access
//      controls / refuse restricted data"). The governance verdict is foregrounded.
//   2) ON-DEMAND (POST /evaluations/run): "Evaluate this turn" scores the active session NOW and
//      the returned per-evaluator scores + reasoning populate the panel immediately (they don't
//      wait on the continuous config's ingest latency).
//
// The strip is a compact readout; clicking it (or "expand") opens a detail panel with each
// evaluator's score, label and the judge's full reasoning — so the evaluation is legible, not
// a black box. Auth: /evaluations is Cognito-authorized (ID token). Never throws to the UI.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardCheck, ShieldCheck, ShieldAlert, ShieldQuestion, RefreshCw, Play,
  ChevronDown, ChevronUp, Loader2, X,
} from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import { cn } from './lib/cn';
import { renderMarkdown } from './lib/markdown';

// A normalized evaluator result — both the read-back (flat) and on-demand (nested under
// `result`) shapes fold into this so the panel renders one way.
type EvalScore = {
  evaluator: string;
  score?: number | string | null;
  label?: string;
  reasoning?: string;
  error?: string;
  source: 'live' | 'ondemand';
};
type EvalResult = {
  evaluator: string;
  score?: number | string | null;
  label?: string;
  reasoning?: string;
  session_id?: string;
  trace_id?: string;
};
type EvalResponse = {
  configured: boolean;
  governance_evaluator?: string;
  builtin_evaluators?: string[];
  results?: EvalResult[];
  note?: string;
};

// Governance verdict tone. The judge emits COMPLIANT / VIOLATION / NOT_APPLICABLE; built-ins
// emit their own labels. NOT_APPLICABLE is a real, distinct state (this turn touched no
// restricted data) — it must read as neutral, NOT as a green "pass".
type Tone = 'ok' | 'violation' | 'neutral';
function toneOf(label?: string): Tone {
  const l = (label || '').toUpperCase();
  if (l.includes('VIOLATION') || l === 'HARMFUL' || l === 'STEREOTYPING' || l === 'FAIL') return 'violation';
  if (l.includes('NOT_APPLICABLE') || l === 'N/A' || l === 'NA' || l === '') return 'neutral';
  return 'ok';
}
function isViolation(label?: string): boolean {
  return toneOf(label) === 'violation';
}
function short(evaluatorId: string): string {
  return evaluatorId
    .replace(/^Builtin\./, '')
    .replace(/^arn:.*evaluator\//, '')
    .replace(/^agentcore_demo_governance_judge.*/i, 'Governance')
    .replace(/-[A-Za-z0-9]{8,}$/, ''); // drop the AWS resource suffix
}
// A built-in evaluator's label is inherently good/neutral (Helpfulness "Above And Beyond",
// etc.) — only the governance judge and safety evaluators have a "bad" pole.
function chipTone(r: EvalScore, isGov: boolean): Tone {
  if (r.error) return 'neutral';
  if (isGov) return toneOf(r.label);
  return isViolation(r.label) ? 'violation' : 'ok';
}

const TONE_CHIP: Record<Tone, string> = {
  ok: 'bg-ok/12 text-ok',
  violation: 'bg-destructive/12 text-destructive',
  neutral: 'bg-secondary/70 text-muted-foreground',
};

export function Evaluations({
  auth,
  cfg,
  sessionId,
  refreshKey,
  onActive,
}: {
  auth: Auth;
  cfg: AppConfig;
  sessionId: string;
  refreshKey: number;
  onActive?: (active: boolean) => void; // report real-score presence up to the stack rail
}) {
  const [ev, setEv] = useState<EvalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  // Governance evaluator id (from whichever response carried it) so we can foreground it.
  const [govId, setGovId] = useState('');
  // On-demand scores from the last /evaluations/run — take precedence over the read-back
  // because they're this turn's, computed now, not the continuous config's sampled backlog.
  const [ondemand, setOndemand] = useState<EvalScore[]>([]);
  const [spansEvaluated, setSpansEvaluated] = useState<number | null>(null);
  // The detail is a floating CONTEXT PANEL (overlays the chat, doesn't reflow it), so it
  // dismisses like one: click outside or Esc. The ref wraps the whole strip + panel.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ window: '1440' });
      if (sessionId) qs.set('session_id', sessionId);
      const resp = await fetch(`${cfg.API_URL}/evaluations?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${auth.getIdToken()}` },
      });
      if (resp.ok) {
        const body: EvalResponse = await resp.json();
        setEv(body);
        if (body.governance_evaluator) setGovId(body.governance_evaluator);
      }
    } catch {
      /* leave prior data */
    } finally {
      setLoading(false);
    }
  }, [auth, cfg, sessionId]);

  // Give CloudWatch a moment to ingest a finished turn before pulling scores.
  useEffect(() => {
    const t = setTimeout(hydrate, refreshKey === 0 ? 0 : 6000);
    return () => clearTimeout(t);
  }, [refreshKey, hydrate]);
  useEffect(() => {
    setEv(null);
    setMsg('');
    setOndemand([]);
    setSpansEvaluated(null);
  }, [sessionId]);

  const runNow = useCallback(async () => {
    if (!sessionId) {
      setMsg('No active session to evaluate.');
      return;
    }
    setRunning(true);
    setMsg('');
    try {
      const resp = await fetch(`${cfg.API_URL}/evaluations/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.getIdToken()}` },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        setMsg(body?.error || `Evaluate failed (${resp.status})`);
      } else if (body.configured === false) {
        setMsg(body.note || 'Evaluations not provisioned yet.');
      } else if (body.note && (!body.scores || !body.scores.length)) {
        // e.g. spans haven't landed in CloudWatch yet — surface the honest note.
        setMsg(body.note);
      } else {
        if (body.governance_evaluator) setGovId(body.governance_evaluator);
        setSpansEvaluated(typeof body.spans_evaluated === 'number' ? body.spans_evaluated : null);
        // Normalize the nested on-demand shape into flat EvalScores and foreground them.
        const norm: EvalScore[] = (body.scores || []).map((s: any) => {
          const r = s.result || {};
          return {
            evaluator: s.evaluator,
            score: r.score,
            label: r.label,
            reasoning: r.reasoning,
            error: s.error || r.error,
            source: 'ondemand' as const,
          };
        });
        setOndemand(norm);
        const scored = norm.filter((s) => !s.error).length;
        const errored = norm.length - scored;
        setMsg(
          errored === 0
            ? `Scored this turn · ${scored} evaluator${scored === 1 ? '' : 's'}`
            : `${scored} scored · ${errored} pending trace data`,
        );
        setOpen(true); // reveal the results — the whole point of clicking Evaluate
        hydrate();
      }
    } catch (e: any) {
      setMsg(e?.message || 'Evaluate failed');
    } finally {
      setRunning(false);
    }
  }, [auth, cfg, sessionId, hydrate]);

  // Merge on-demand (fresh, this turn) over the read-back (continuous config), keyed by
  // evaluator, so the panel shows one row per evaluator with the best signal available.
  const merged = useMemo<EvalScore[]>(() => {
    const byId = new Map<string, EvalScore>();
    for (const r of ev?.results || []) {
      byId.set(r.evaluator, {
        evaluator: r.evaluator,
        score: r.score,
        label: r.label,
        reasoning: r.reasoning,
        source: 'live',
      });
    }
    for (const r of ondemand) byId.set(r.evaluator, r); // on-demand wins
    return Array.from(byId.values());
  }, [ev, ondemand]);

  const gov = merged.find((r) => govId && r.evaluator === govId)
    || merged.find((r) => /governance/i.test(short(r.evaluator)));
  const others = merged.filter((r) => r !== gov);
  const hasAny = merged.length > 0;

  // Report to the stack rail whether Evaluations actually holds scores for THIS session —
  // so the rail lights the primitive only once a turn has been scored (continuous or
  // on-demand), never at rest. Keeps "exercised this session" honest.
  useEffect(() => {
    onActive?.(hasAny);
  }, [hasAny, onActive]);

  return (
    <div ref={wrapRef} className="relative z-30 border-b border-border bg-card/60 backdrop-blur">
      {/* Compact readout row */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-y-1 px-5 py-2">
        <button
          onClick={() => hasAny && setOpen((o) => !o)}
          disabled={!hasAny}
          title={hasAny ? 'Show evaluator detail + reasoning' : 'Run a turn, then Evaluate'}
          className="flex items-center gap-1.5 pr-3 disabled:cursor-default"
        >
          <ClipboardCheck size={13} className="text-primary" />
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <span className="field-key">Evaluations</span>
          {hasAny && (open ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />)}
        </button>

        {/* Governance verdict — the headline signal for a regulated FS desk. */}
        {gov ? (
          <button
            onClick={() => setOpen(true)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold transition-opacity hover:opacity-80',
              TONE_CHIP[toneOf(gov.label)],
            )}
            title={gov.reasoning || 'Governance judge verdict — click for reasoning'}
          >
            {toneOf(gov.label) === 'violation' ? <ShieldAlert size={13} />
              : toneOf(gov.label) === 'neutral' ? <ShieldQuestion size={13} />
              : <ShieldCheck size={13} />}
            Governance: {gov.label || '—'}
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {ev?.configured
              ? 'Governance judge scores every turn — click Evaluate for this one'
              : ev?.note || 'Online eval provisioning…'}
          </span>
        )}

        {/* Built-in evaluator score chips (most recent per evaluator). */}
        <div className="ml-3 flex flex-wrap items-center gap-1.5">
          {others.slice(0, 6).map((r, i) => (
            <button
              key={`${r.evaluator}-${i}`}
              onClick={() => setOpen(true)}
              className={cn(
                'tabular rounded-full px-2 py-0.5 text-[10.5px] transition-opacity hover:opacity-80',
                TONE_CHIP[chipTone(r, false)],
              )}
              title={r.reasoning || r.error || ''}
            >
              {short(r.evaluator)}: {r.error ? '⚠' : (r.label ?? r.score ?? '—')}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-[10.5px] text-muted-foreground">{msg}</span>}
          <button
            onClick={runNow}
            disabled={running || !sessionId}
            title="Evaluate this session's latest turn on demand"
            className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/8 px-2.5 py-1.5 text-[11.5px] font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Evaluate this turn
          </button>
          <button
            onClick={hydrate}
            title="Refresh evaluation scores"
            className="flex size-7 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Evaluator detail — a floating CONTEXT PANEL. It's absolutely positioned just below the
          strip so it OVERLAYS the chat (with its own scroll) instead of reflowing the column and
          squeezing the conversation. Dismiss: click-away, Esc, or the close button. */}
      {open && hasAny && (
        <div className="absolute inset-x-0 top-full z-30 px-5">
          <div className="mx-auto mt-1 max-w-5xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border bg-elevated/60 px-3.5 py-2">
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <span className="field-key">Evaluator detail</span>
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] text-muted-foreground">
                  {ondemand.length
                    ? `On-demand · ${spansEvaluated ?? '—'} span${spansEvaluated === 1 ? '' : 's'} · session ${sessionId.slice(0, 8)}…`
                    : 'Continuous online-eval (sampled) · scored automatically'}
                </span>
                <button
                  onClick={() => setOpen(false)}
                  title="Close (Esc)"
                  className="flex size-6 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
            <div className="max-h-[min(70vh,640px)] overflow-y-auto p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {gov && <EvaluatorCard r={gov} isGov />}
                {others.map((r, i) => <EvaluatorCard key={`${r.evaluator}-${i}`} r={r} />)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The judges return reasoning as ONE run-on paragraph with inline enumerations
// ("… 1. **Foo**: … 2. **Bar**: …"). Break each " N. " enumerator onto its own line so the
// shared renderer turns it into a real ordered list, and lift a leading "intro:" onto its own
// line. Guarded so decimals (3.62%, 35.0) and "$5M" are never split — the enumerator must be
// 1–2 digits preceded by whitespace, followed by ". " and a capital/`**`/backtick.
function tidyReasoning(s: string): string {
  return s
    .replace(/\s+(\d{1,2})\.\s+(?=[A-Z*`✅])/g, '\n$1. ')
    .replace(/^([^\n:]{0,80}:)\s+(?=\d+\.\s)/, '$1\n')
    .trim();
}

function EvaluatorCard({ r, isGov }: { r: EvalScore; isGov?: boolean }) {
  const tone = chipTone(r, !!isGov);
  return (
    <div
      className={cn(
        'rounded-md border bg-card/70 p-3',
        isGov ? 'border-primary/30 sm:col-span-2' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2">
        {isGov && (
          tone === 'violation' ? <ShieldAlert size={13} className="text-destructive" />
            : tone === 'neutral' ? <ShieldQuestion size={13} className="text-muted-foreground" />
            : <ShieldCheck size={13} className="text-ok" />
        )}
        <span className="text-[12px] font-semibold">{short(r.evaluator)}</span>
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        {isGov && <span className="field-key text-[9px]">Governance judge</span>}
        <span className={cn('ml-auto tabular rounded-full px-2 py-0.5 text-[10.5px] font-medium', TONE_CHIP[tone])}>
          {r.error ? 'pending' : (r.label ?? (r.score != null ? `score ${r.score}` : '—'))}
        </span>
      </div>
      {r.reasoning ? (
        <div
          className="prose-exec prose-eval mt-2 border-t border-border/60 pt-2 text-[11.5px] leading-relaxed text-muted-foreground"
          // nosemgrep: react-dangerouslysetinnerhtml -- renderMarkdown escapes HTML first (lib/markdown.ts), XSS-safe
          dangerouslySetInnerHTML={{ __html: renderMarkdown(tidyReasoning(r.reasoning)) }}
        />
      ) : r.error ? (
        <p className="mt-2 border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
          No score yet — {r.error.replace(/^[A-Za-z]+Error:\s*/, '')}. The continuous online-eval
          config scores this evaluator automatically from sampled traffic.
        </p>
      ) : (
        <p className="mt-2 text-[11px] italic text-muted-foreground">No reasoning returned.</p>
      )}
    </div>
  );
}
