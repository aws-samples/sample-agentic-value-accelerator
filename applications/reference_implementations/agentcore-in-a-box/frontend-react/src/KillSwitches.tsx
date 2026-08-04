/**
 * KillSwitches — the platform emergency cutoff for the governed Gateway.
 *
 * A first-class admin surface (its own nav item), NOT a modal or a hidden panel. Each Gateway-fronted
 * MCP tool is a breaker: one tap writes a GLOBAL Cedar `forbid` at the Gateway boundary, so the tool is
 * refused for EVERYONE instantly — no need to revoke it user-by-user, and it holds even if the runtime
 * were bypassed (the Gateway itself denies the action). Releasing restores the per-user grants underneath.
 *
 * Distinct from Access Control (per-user grant/revoke): this is the "cut the whole line" backstop. The
 * page reads the live governance graph, shows which tools are reachable vs. killed, and toggles the
 * forced overlay via governanceApi.globalBlock — the same real path the runtime enforces against.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban, RefreshCw, Power, PowerOff, ShieldAlert, Waypoints, Check,
} from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import { governanceApi, type GraphResponse } from './governanceApi';
import { cn } from './lib/cn';

export function KillSwitches({ auth, cfg }: { auth: Auth; cfg: AppConfig }) {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2800); };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setGraph(await governanceApi.graph(auth, cfg));
    } catch (e: any) {
      setError(e?.message || 'Could not load the governance graph.');
    } finally {
      setLoading(false);
    }
  }, [auth, cfg]);

  useEffect(() => { load(); }, [load]);

  // The Gateway-fronted MCP tools an admin can cut: catalog tools with a Cedar gateway_action.
  const mcpTools = useMemo(() => {
    const tools = graph?.catalog.tools || {};
    return Object.entries(tools)
      .filter(([, def]) => !!def.gateway_action)
      .map(([key, def]) => ({ key, label: def.label, sensitive: def.sensitive, action: def.gateway_action }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [graph]);

  const blockedTools = useMemo(() => new Set(graph?.global_blocks.tools || []), [graph]);
  const forcedTools = useMemo(() => new Set(graph?.forced_blocks?.tools || []), [graph]);
  const killedCount = mcpTools.filter((t) => blockedTools.has(t.key)).length;

  // Engage/release a global block on one MCP tool. Optimistically reconcile from the server's
  // forced set + Cedar backstop so the breaker flips instantly, then settles on the real state.
  const toggle = useCallback(async (tool: string, engage: boolean) => {
    setBusy((b) => ({ ...b, [tool]: true }));
    try {
      const r = await governanceApi.globalBlock(auth, cfg, { kind: 'tools', key: tool, engaged: engage });
      setGraph((g) => g ? ({
        ...g,
        global_blocks: r.backstop?.blocked
          ? { ...g.global_blocks, tools: r.backstop.blocked }
          : g.global_blocks,
        forced_blocks: r.forced_blocks,
      }) : g);
      flash(`${engage ? 'Kill-switch engaged' : 'Released'} · ${tool}`);
    } catch (e: any) {
      flash(`Failed: ${e?.message || 'kill-switch error'}`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[tool]; return n; });
    }
  }, [auth, cfg]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex size-8 items-center justify-center rounded-lg bg-destructive/15 text-destructive ring-1 ring-destructive/25">
            <Ban size={17} />
          </span>
          <div className="min-w-0">
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[15px] font-bold tracking-tight">Kill Switches</div>
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[11px] text-muted-foreground">
              One tap disables an MCP tool for everyone at the Gateway — a global Cedar forbid, enforced even if the runtime is bypassed
            </div>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[12px] font-medium text-secondary-foreground transition-colors hover:bg-accent"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {/* Status strip — the whole point, read at a glance. */}
          <div className={cn(
            'flex items-center gap-4 rounded-2xl border px-5 py-4',
            killedCount > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-ok/30 bg-ok/5',
          )}>
            <span className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-xl',
              killedCount > 0 ? 'bg-destructive/15 text-destructive' : 'bg-ok/12 text-ok',
            )}>
              {killedCount > 0 ? <PowerOff size={24} /> : <ShieldAlert size={24} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold tracking-tight">
                {killedCount > 0
                  ? `${killedCount} MCP tool${killedCount === 1 ? '' : 's'} killed`
                  : 'All MCP tools reachable'}
              </div>
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <div className="text-[11.5px] text-muted-foreground">
                {killedCount > 0
                  ? 'A killed tool is refused for every user right now — the Gateway denies the action before it reaches the runtime.'
                  : 'Flip a breaker below to cut a tool off from everyone instantly, without revoking it user-by-user.'}
              </div>
            </div>
            <div className={cn(
              'tabular shrink-0 text-[34px] font-extrabold leading-none tracking-tight',
              killedCount > 0 ? 'text-destructive' : 'text-ok',
            )}>
              {killedCount}
            </div>
          </div>

          {/* Breaker list. */}
          <section className="panel-elevated overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-4 py-2.5">
              <Waypoints size={14} className="text-primary" />
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <span className="field-key text-foreground">Gateway MCP tools</span>
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <span className="text-[11px] text-muted-foreground">· each is a real Cedar action at the governed boundary</span>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="py-8 text-center text-[12px] text-muted-foreground">Loading tools…</div>
              ) : error ? (
                <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                  <ShieldAlert size={22} className="text-destructive" />
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  <div className="text-[13px] font-semibold text-foreground">Couldn’t load tools</div>
                  <div className="max-w-md text-[11.5px] text-muted-foreground">{error}</div>
                </div>
              ) : mcpTools.length === 0 ? (
                <div className="py-8 text-center text-[12px] text-muted-foreground">
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  No Gateway-fronted MCP tools in the catalog.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {mcpTools.map((t) => {
                    const blocked = blockedTools.has(t.key);
                    const forced = forcedTools.has(t.key);
                    // A block can emerge because NO user holds the tool (derived), vs. an admin
                    // engaging the switch (forced). Only forced blocks are releasable here — a
                    // derived block is really a per-user state, managed in Access Control.
                    const derivedOnly = blocked && !forced;
                    const b = !!busy[t.key];
                    return (
                      <div key={t.key} className={cn(
                        'flex items-center gap-3.5 rounded-xl border px-4 py-3 transition-colors',
                        blocked ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card',
                      )}>
                        <span className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-xl',
                          blocked ? 'bg-destructive/15 text-destructive' : 'bg-ok/12 text-ok',
                        )}>
                          {blocked ? <PowerOff size={18} /> : <Power size={18} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                            {t.label}
                            {t.sensitive && (
                              <span className="rounded bg-warn/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warn">sensitive</span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {t.action && (
                              <span className="truncate font-mono text-[10px] text-muted-foreground/80" title={t.action}>{t.action}</span>
                            )}
                            <span className={cn(
                              'text-[10.5px] font-medium',
                              blocked ? 'text-destructive' : 'text-ok',
                            )}>
                              {blocked
                                ? derivedOnly ? '· blocked — no user holds it' : '· killed for everyone'
                                : '· reachable'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => toggle(t.key, !blocked)}
                          disabled={b || derivedOnly}
                          title={derivedOnly ? 'This block emerged from per-user revocation — manage it in Access Control' : blocked ? 'Restore per-user access' : 'Cut this tool off for everyone'}
                          className={cn(
                            'flex min-w-[92px] items-center justify-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                            blocked
                              ? 'border-ok/40 bg-ok/10 text-ok hover:bg-ok/20'
                              : 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20',
                          )}
                        >
                          {b
                            ? <RefreshCw size={14} className="animate-spin" />
                            : blocked ? <><Check size={14} /> Release</> : <><PowerOff size={14} /> Kill</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* How it works — the narrative a technical buyer wants next to the control. */}
          <section className="rounded-xl border border-border bg-secondary/20 px-4 py-3.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <ShieldAlert size={13} className="text-muted-foreground" />
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <span className="field-key">How the cutoff works</span>
            </div>
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Killing a tool writes a scoped <span className="font-mono text-foreground">forbid</span> into the platform’s
              Cedar policy and re-materializes it at the Gateway. The block is enforced at the boundary — the Gateway
              refuses the action before it ever reaches the agent runtime — so it holds even against a caller who bypasses
              the app. It’s global (every user, every desk) and reversible in one tap; releasing hands control back to the
              per-user grants in Access Control.
            </p>
          </section>
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-2 text-[12.5px] shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
