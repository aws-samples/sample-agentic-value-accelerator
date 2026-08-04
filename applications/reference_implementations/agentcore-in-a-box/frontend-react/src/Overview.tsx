/**
 * Overview — the admin control-panel landing. The "control panel, not chatbot" home base.
 *
 * Aggregates the LIVE state of the governance + ops planes into a scannable dashboard:
 *   • Pending access requests  (governanceApi.adminRequests) — with an inline approve/deny list
 *     that runs the SAME real grant path as Access Control (separation of duties preserved).
 *   • Kill-switches engaged     (governanceApi.graph → global_blocks: Cedar-forbidden tools /
 *     IAM-denied creds) + principal counts (users / agents, managed vs. unmanaged).
 *   • Registry lifecycle        (registryApi.list → DRAFT / PENDING / APPROVED counts).
 *   • A/B experiment            (optimizationApi.state → ON/OFF, the one live-path control).
 *
 * Every source is fetched with Promise.allSettled so one unprovisioned/cold service can't blank
 * the page — each card degrades to its own empty/error state. Quick-nav tiles jump to the deep
 * section. The pending count is kept in sync with the shell's live WS badge via `pendingCount`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, RefreshCw, Inbox, Ban, Users, BookMarked, TrendingUp, ShieldCheck,
  Building2, Wrench, Check, X, Clock, ChevronRight, type LucideIcon,
} from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import { governanceApi, type AccessRequest, type GraphResponse } from './governanceApi';
import { registryApi } from './registryApi';
import { optimizationApi, type OptState } from './optimizationApi';
import { cn } from './lib/cn';
import type { SectionId } from './sections';

interface Aggregate {
  graph?: GraphResponse;
  registryCounts?: Record<string, number>;
  opt?: OptState;
}

export function Overview({
  auth, cfg, pendingCount, onNavigate, onPendingCountChange,
}: {
  auth: Auth;
  cfg: AppConfig;
  /** Live pending-request count from the shell (WS-driven), so the headline card stays in sync. */
  pendingCount: number;
  onNavigate: (section: SectionId) => void;
  /** Report the freshly-loaded pending count up so the shell badge reconciles on Overview load. */
  onPendingCountChange?: (n: number) => void;
}) {
  const [agg, setAgg] = useState<Aggregate>({});
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2800); };

  const load = useCallback(async () => {
    setLoading(true);
    const [reqR, graphR, regR, optR] = await Promise.allSettled([
      governanceApi.adminRequests(auth, cfg, 'PENDING'),
      governanceApi.graph(auth, cfg),
      registryApi.list(auth, cfg),
      optimizationApi.state(auth, cfg),
    ]);
    const next: Aggregate = {};
    if (reqR.status === 'fulfilled') {
      setRequests(reqR.value.requests);
      onPendingCountChange?.(reqR.value.requests.length);
    }
    if (graphR.status === 'fulfilled') next.graph = graphR.value;
    if (regR.status === 'fulfilled') {
      const c: Record<string, number> = {};
      for (const r of regR.value.records || []) c[r.status] = (c[r.status] || 0) + 1;
      next.registryCounts = c;
    }
    if (optR.status === 'fulfilled') next.opt = optR.value;
    setAgg(next);
    setLoading(false);
  }, [auth, cfg, onPendingCountChange]);

  useEffect(() => { load(); }, [load]);

  // Approve/deny inline — the same real grant path Access Control uses.
  const decide = useCallback(async (req: AccessRequest, action: 'approve' | 'deny') => {
    const bkey = `${req.requestId}:${action}`;
    setBusy((b) => ({ ...b, [bkey]: true }));
    try {
      if (action === 'approve') await governanceApi.approve(auth, cfg, req.requestId);
      else await governanceApi.deny(auth, cfg, req.requestId);
      setRequests((rs) => {
        const nextList = rs.filter((r) => r.requestId !== req.requestId);
        onPendingCountChange?.(nextList.length);
        return nextList;
      });
      flash(`${action === 'approve' ? 'Approved' : 'Denied'} ${req.label} · ${req.requesterEmail}`);
    } catch (e: any) {
      flash(`Failed: ${e?.message || 'decision error'}`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[bkey]; return n; });
    }
  }, [auth, cfg, onPendingCountChange]);

  // ── Derived headline metrics ──
  const graph = agg.graph;
  const killSwitches = (graph?.global_blocks.tools.length || 0) + (graph?.global_blocks.creds.length || 0);
  const userCount = graph?.users.length ?? null;
  const agentCount = graph?.agents.length ?? null;
  const managedUsers = useMemo(
    () => graph?.users.filter((u) => u.entitlements.managed).length ?? null,
    [graph],
  );
  const reg = agg.registryCounts;
  const approvedRecords = reg?.APPROVED ?? null;
  const pendingRecords = reg?.PENDING_APPROVAL ?? null;
  const abActive = agg.opt?.experiment?.active;

  // Prefer the live shell count; fall back to the loaded list length.
  const pending = pendingCount || requests.length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
            <LayoutDashboard size={17} />
          </span>
          <div className="min-w-0">
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[15px] font-bold tracking-tight">Control Panel</div>
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[11px] text-muted-foreground">
              Live governance &amp; ops posture across the AgentCore platform — every figure read from a real service
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
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              Icon={Inbox} label="Pending requests" value={pending}
              tone={pending > 0 ? 'warn' : 'ok'}
              sub={pending > 0 ? 'awaiting your decision' : 'none awaiting'}
              onClick={() => onNavigate('access')}
            />
            <StatCard
              Icon={Ban} label="Kill-switches engaged" value={killSwitches}
              tone={killSwitches > 0 ? 'destructive' : 'ok'}
              sub={killSwitches > 0 ? 'Cedar/IAM blocks live · manage' : 'no global blocks · open'}
              onClick={() => onNavigate('killswitch')}
            />
            <StatCard
              Icon={Users} label="Managed users" value={managedUsers == null ? '—' : managedUsers}
              tone="neutral"
              sub={userCount != null ? `${userCount} total · ${agentCount ?? '—'} agents` : 'graph unavailable'}
              onClick={() => onNavigate('graph')}
            />
            <StatCard
              Icon={TrendingUp} label="A/B experiment"
              value={agg.opt == null ? '—' : abActive ? 'ON' : 'OFF'}
              tone={abActive ? 'warn' : 'ok'}
              sub={agg.opt == null ? 'optimization unavailable' : abActive ? '50/50 live split' : '100% control (safe)'}
              onClick={() => onNavigate('optimize')}
            />
          </div>

          {/* Pending requests — inline approve/deny (separation of duties). */}
          <section className="panel-elevated overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-4 py-2.5">
              <Inbox size={14} className="text-primary" />
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <span className="field-key text-foreground">Pending access requests</span>
              {pending > 0 && (
                <span className="ml-1 flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-5 text-destructive-foreground">
                  {pending}
                </span>
              )}
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <button
                onClick={() => onNavigate('access')}
                className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Open Access Control <ChevronRight size={12} />
              </button>
            </div>
            <div className="p-4">
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              {loading ? (
                <div className="py-6 text-center text-[12px] text-muted-foreground">Loading…</div>
              ) : requests.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-6 text-center text-muted-foreground">
                  <ShieldCheck size={22} className="text-ok" />
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  <div className="text-[13px] font-semibold text-foreground">No pending requests</div>
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  <div className="max-w-md text-[11.5px]">
                    When a user requests a desk or tool they lack, it lands here. Approving runs the real
                    grant and notifies them live.
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {requests.map((r) => {
                    const approving = !!busy[`${r.requestId}:approve`];
                    const denying = !!busy[`${r.requestId}:deny`];
                    const inFlight = approving || denying;
                    return (
                      <div key={r.requestId} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                        <span className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-lg',
                          r.kind === 'desks' ? 'bg-primary/15 text-primary' : 'bg-ok/15 text-ok',
                        )}>
                          {r.kind === 'desks' ? <Building2 size={16} /> : <Wrench size={16} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[13px]">
                            <span className="font-semibold">{r.requesterEmail}</span>
                            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                            <span className="text-muted-foreground">requests</span>
                            <span className="rounded bg-elevated px-1.5 py-0.5 font-medium">{r.label}</span>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.kind === 'desks' ? 'desk' : 'tool'}</span>
                          </div>
                          {r.reason && <div className="mt-0.5 truncate text-[11.5px] italic text-muted-foreground">“{r.reason}”</div>}
                          <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-muted-foreground"><Clock size={10} /> {fmtAge(r.createdAt)}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => decide(r, 'deny')}
                            disabled={inFlight}
                            className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                          >
                            {denying ? <RefreshCw size={13} className="animate-spin" /> : <X size={13} />} Deny
                          </button>
                          <button
                            onClick={() => decide(r, 'approve')}
                            disabled={inFlight}
                            className="flex items-center gap-1.5 rounded-lg border border-ok/40 bg-ok/15 px-3 py-1.5 text-[12px] font-medium text-ok transition-colors hover:bg-ok/25 disabled:opacity-50"
                          >
                            {approving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />} Approve
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Quick-nav tiles into the deep operator surfaces. */}
          <section>
            <div className="mb-2.5 flex items-center gap-2">
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <span className="field-key">Operator surfaces</span>
              <span className="rule-fade flex-1" />
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <NavTile Icon={ShieldCheck} title="Access Control" onClick={() => onNavigate('access')}
                sub="Grant/revoke users & agents · 4-layer enforcement" />
              <NavTile Icon={LayoutDashboard} title="Governance Graph" onClick={() => onNavigate('graph')}
                sub={killSwitches > 0 ? `${killSwitches} kill-switch${killSwitches === 1 ? '' : 'es'} engaged` : 'who can reach what'} tone={killSwitches > 0 ? 'destructive' : undefined} />
              <NavTile Icon={BookMarked} title="Registry" onClick={() => onNavigate('registry')}
                sub={approvedRecords != null ? `${approvedRecords} approved · ${pendingRecords ?? 0} pending` : 'governed agent/tool catalog'} />
              <NavTile Icon={TrendingUp} title="Optimize" onClick={() => onNavigate('optimize')}
                sub={agg.opt == null ? 'recommendations · A/B' : abActive ? 'A/B RUNNING' : 'A/B off · recommendations'} tone={abActive ? 'warn' : undefined} />
            </div>
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

type Tone = 'ok' | 'warn' | 'destructive' | 'neutral';
const TONE_CLS: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  destructive: 'text-destructive',
  neutral: 'text-foreground',
};

function StatCard({
  Icon, label, value, sub, tone = 'neutral', onClick,
}: {
  Icon: LucideIcon; label: string; value: number | string; sub?: string; tone?: Tone; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="panel-elevated tile-interactive group flex flex-col gap-1 p-3.5 text-left"
    >
      <div className="flex items-center gap-2">
        <span className={cn('flex size-7 items-center justify-center rounded-md bg-secondary', TONE_CLS[tone])}>
          <Icon size={14} />
        </span>
        <span className="field-key">{label}</span>
      </div>
      <div className={cn('tabular text-[26px] font-extrabold leading-none tracking-tight', TONE_CLS[tone])}>{value}</div>
      {sub && <div className="text-[10.5px] text-muted-foreground">{sub}</div>}
    </button>
  );
}

function NavTile({
  Icon, title, sub, tone, onClick,
}: {
  Icon: LucideIcon; title: string; sub: string; tone?: Tone; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="panel-elevated tile-interactive group flex items-center gap-3 p-3.5 text-left">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{title}</div>
        <div className={cn('truncate text-[11px]', tone ? TONE_CLS[tone] : 'text-muted-foreground')}>{sub}</div>
      </div>
      <ChevronRight size={15} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function fmtAge(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
