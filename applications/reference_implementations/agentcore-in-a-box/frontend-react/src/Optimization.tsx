/**
 * Optimization — the AgentCore Optimization console (admin-only).
 *
 * Shows the continuous-improvement loop: (1) generate a system-prompt RECOMMENDATION from real
 * traces scored against the governance evaluator; (2) the control/treatment configuration
 * BUNDLES that make an A/B variant available; (3) a START/STOP A/B experiment toggle.
 *
 * SAFETY VALVE (surfaced in the UI): the A/B split is OFF by default. While OFF, 100% of traffic
 * is control and the live request path is unchanged. Starting the experiment flips the runtime
 * OPT_EXPERIMENT_FLAG; new sessions split 50/50 by session-id hash, existing sessions keep their
 * arm. This is the one control that touches the live path, so it's explicit and admin-gated.
 */
import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, X, RefreshCw, Play, Pause, Sparkles, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import { optimizationApi, type OptState } from './optimizationApi';
import { cn } from './lib/cn';

export function Optimization({
  auth, cfg, onClose, embedded = false,
}: {
  auth: Auth; cfg: AppConfig;
  /** Overlay-only: omitted when embedded as a control-panel section. */
  onClose?: () => void;
  /** Render inline inside the shell (drop the fixed overlay chrome + Close button). */
  embedded?: boolean;
}) {
  const [state, setState] = useState<OptState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setState(await optimizationApi.state(auth, cfg));
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load optimization state');
    } finally {
      setLoading(false);
    }
  }, [auth, cfg]);

  useEffect(() => { load(); }, [load]);

  const recommend = useCallback(async () => {
    setBusy(true);
    try {
      const r = await optimizationApi.recommend(auth, cfg);
      flash(r.configured === false ? (r.note || 'Not provisioned') : `Recommendation started · ${r.recommendation_id || ''}`);
      await load();
    } catch (e: any) {
      flash(`Failed: ${e?.message || 'recommend error'}`);
    } finally {
      setBusy(false);
    }
  }, [auth, cfg, load]);

  const toggleExperiment = useCallback(async (action: 'start' | 'stop') => {
    setBusy(true);
    try {
      const r = await optimizationApi.experiment(auth, cfg, action);
      flash(r.note || `Experiment ${action === 'start' ? 'started' : 'stopped'}`);
      await load();
    } catch (e: any) {
      flash(`Failed: ${e?.message || 'experiment error'}`);
    } finally {
      setBusy(false);
    }
  }, [auth, cfg, load]);

  const active = state?.experiment?.active;

  return (
    <div className={cn(
      'flex flex-col',
      embedded ? 'h-full' : 'fixed inset-0 z-[60] bg-background/95 backdrop-blur-md',
    )}>
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
            <TrendingUp size={17} />
          </span>
          <div className="min-w-0">
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[15px] font-bold tracking-tight">Optimization</div>
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[11px] text-muted-foreground">
              Trace-driven prompt recommendations · configuration bundles · A/B with online-eval scoring
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} title="Reload"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[12px] font-medium hover:bg-accent">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {!embedded && (
            <button onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[13px] font-medium hover:bg-accent">
              <X size={14} /> Close
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {toast && <div className="rounded-lg border border-primary/30 bg-primary/8 px-3 py-1.5 text-[12px] text-primary">{toast}</div>}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {state?.note && <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[12px] text-muted-foreground">{state.note}</div>}

          {/* A/B experiment — the live-path control, with the safety valve explained. */}
          <div className="rounded-lg border border-border bg-card/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13.5px] font-semibold">A/B Experiment</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {active
                    ? 'RUNNING · new sessions split 50/50 control vs treatment by session-id hash'
                    : 'OFF · 100% control — live path is unchanged (safety valve)'}
                </div>
              </div>
              <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold',
                active ? 'bg-ok/15 text-ok' : 'bg-secondary/70 text-muted-foreground')}>
                <ShieldCheck size={13} /> {active ? 'ON' : 'OFF'}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {active ? (
                <button onClick={() => toggleExperiment('stop')} disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[12.5px] font-medium hover:bg-accent disabled:opacity-50">
                  <Pause size={13} /> Stop experiment
                </button>
              ) : (
                <button onClick={() => toggleExperiment('start')} disabled={busy || !state?.experiment?.treatment_bundle_id}
                  className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
                  title={state?.experiment?.treatment_bundle_id ? '' : 'No treatment bundle provisioned'}>
                  <Play size={13} /> Start A/B experiment
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded border border-border bg-secondary/30 px-2 py-1.5">
                {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                <div className="field-key">Control bundle</div>
                <div className="truncate font-mono text-[10.5px] text-muted-foreground">{state?.experiment?.control_bundle_id || '—'}</div>
              </div>
              <div className="rounded border border-border bg-secondary/30 px-2 py-1.5">
                {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                <div className="field-key">Treatment bundle</div>
                <div className="truncate font-mono text-[10.5px] text-muted-foreground">{state?.experiment?.treatment_bundle_id || '—'}</div>
              </div>
            </div>
          </div>

          {/* Recommendations — off the hot path; safe to run any time. */}
          <div className="rounded-lg border border-border bg-card/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                <div className="text-[13.5px] font-semibold">Prompt Recommendation</div>
                {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                <div className="text-[11.5px] text-muted-foreground">Analyze real traces vs the governance evaluator → improved system prompt</div>
              </div>
              <button onClick={recommend} disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/8 px-3 py-1.5 text-[12.5px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50">
                <Sparkles size={13} /> Generate
              </button>
            </div>
            {state?.recommendations && state.recommendations.length > 0 ? (
              <div className="mt-3 flex flex-col gap-1.5">
                {state.recommendations.map((r) => (
                  <div key={r.recommendation_id} className="flex items-center gap-2 rounded border border-border bg-secondary/30 px-2.5 py-1.5 text-[11.5px]">
                    <span className="flex-1 truncate">{r.name || r.recommendation_id}</span>
                    <span className="text-[10px] text-muted-foreground">{r.type}</span>
                    <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-[10px]">{r.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-[11.5px] text-muted-foreground">No recommendations yet.{state?.recommendations_error ? ` (${state.recommendations_error})` : ''}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
