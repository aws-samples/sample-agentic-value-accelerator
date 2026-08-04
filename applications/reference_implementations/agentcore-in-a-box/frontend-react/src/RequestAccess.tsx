/**
 * RequestAccess — the self-service half of the request → admin-approve workflow (NON-admins).
 *
 * Two entry points share ONE body (`RequestAccessBody`):
 *   • `RequestAccess` — a header button that opens the body in a small centered modal (legacy /
 *     compact placement, kept for back-compat).
 *   • `RequestAccessSection` — the body rendered inline as a full control-panel nav section.
 *
 * The body lists the desks, specialists (agents), and tools the caller currently lacks; the user
 * picks one, optionally asks for a time-box (TTL) + reason, and submits. The backend enforces
 * separation of duties (an admin must approve) and dedupes duplicate PENDING requests. An
 * already-PENDING item is shown as "requested" so the user can't spam the same ask.
 *
 * Two escape hatches on the selected item: a mandatory justification when the target is sensitive
 * (desks always are), and a cautionary break-glass emergency self-grant (short-TTL, audited,
 * admin-alerted) for when the approval loop is too slow to wait for.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, X, RefreshCw, Building2, Wrench, Users, Check, Clock, Send, Inbox, TriangleAlert, Waypoints } from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import { formatExpiresIn, type Effective } from './entitlements';
import { governanceApi, type AccessRequest, type RequestKind, type MyRequestsResponse } from './governanceApi';
import { cn } from './lib/cn';

interface Requestable {
  kind: RequestKind;
  key: string;
  label: string;
  /** For agents: the human desk label the specialist belongs to (shown as a small sublabel). */
  desk?: string;
  /** True for a tool reached THROUGH the governed AgentCore Gateway (a real MCP tool, Cedar-enforced
   * at the boundary) — as opposed to a runtime-only tool. Drives the "MCP" badge so a requester sees
   * they're asking to invoke a governed MCP, not just a local capability. */
  gateway?: boolean;
}

/** The optional time-box the requester can ask for. `value` undefined ⇒ let the admin decide. */
const TTL_OPTIONS: { label: string; value?: number }[] = [
  { label: 'Standard (admin decides)', value: undefined },
  { label: 'Today (8h)', value: 28800 },
  { label: 'This week (7d)', value: 604800 },
];

/** The shared request body: denied-list picker + reason + submit, with its own toast. Used both
 * inside the header modal and as the inline Requests section. */
export function RequestAccessBody({
  auth, cfg, effective,
}: {
  auth: Auth; cfg: AppConfig; effective: Effective | null;
}) {
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState<MyRequestsResponse['catalog'] | null>(null);
  const [mine, setMine] = useState<AccessRequest[]>([]);
  const [breakGlassTtl, setBreakGlassTtl] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<Requestable | null>(null);
  const [ttlSeconds, setTtlSeconds] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2800); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await governanceApi.myRequests(auth, cfg);
      setCatalog(r.catalog);
      setMine(r.requests);
      setBreakGlassTtl(r.break_glass_ttl);
    } catch (e: any) {
      flash(e?.message || 'Failed to load requestable access');
    } finally {
      setLoading(false);
    }
  }, [auth, cfg]);

  useEffect(() => { load(); }, [load]);

  // A key is denied when the caller is managed and lacks the grant (unmanaged = fail-open). Order:
  // desks first, then specialists (agents), then tools — matches the admin grids' dimension order.
  const denied = useMemo<Requestable[]>(() => {
    if (!catalog || !effective || !effective.managed) return [];
    const out: Requestable[] = [];
    for (const [key, def] of Object.entries(catalog.desks)) {
      if (!effective.desks?.[key]) out.push({ kind: 'desks', key, label: def.label });
    }
    // The agents dimension has its own fail-open flag: only offer specialists once it's scoped.
    if (effective.agents_managed) {
      for (const [key, def] of Object.entries(catalog.agents)) {
        if (!effective.agents?.[key]) out.push({ kind: 'agents', key, label: def.label, desk: def.desk });
      }
    }
    for (const [key, def] of Object.entries(catalog.tools)) {
      if (!effective.tools?.[key]) out.push({ kind: 'tools', key, label: def.label, gateway: !!def.gateway_action });
    }
    return out;
  }, [catalog, effective]);

  // Sensitive targets require a justification: desks always, tools/agents per their catalog flag.
  const isSensitive = useCallback((sel: Requestable): boolean => {
    if (sel.kind === 'desks') return true;
    if (sel.kind === 'agents') return !!catalog?.agents[sel.key]?.sensitive;
    return !!catalog?.tools[sel.key]?.sensitive;
  }, [catalog]);

  const pendingKeys = useMemo(
    () => new Set(mine.filter((r) => r.status === 'PENDING').map((r) => `${r.kind}:${r.key}`)),
    [mine],
  );
  // Best-effort expiry lookup for the caller's own requests/grants, keyed like pendingKeys.
  const expiryByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of mine) {
      if (typeof r.expiresAt === 'number' && r.expiresAt > 0) m.set(`${r.kind}:${r.key}`, r.expiresAt);
    }
    return m;
  }, [mine]);

  // Reset the per-selection asks (TTL + reason) whenever the picked item changes.
  const pick = useCallback((d: Requestable | null) => {
    setSelected(d);
    setTtlSeconds(undefined);
    setReason('');
  }, []);

  const selSensitive = selected ? isSensitive(selected) : false;
  const reasonMissing = selSensitive && !reason.trim();
  const bgMinutes = Math.max(1, Math.round((breakGlassTtl ?? 900) / 60));

  const submit = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await governanceApi.createRequest(auth, cfg, { kind: selected.kind, key: selected.key, reason: reason.trim(), ttlSeconds });
      flash(res.deduped ? `Already requested ${selected.label} — awaiting approval.` : `Requested ${selected.label} — an admin will review it.`);
      pick(null);
      load();
    } catch (e: any) {
      flash(e?.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  }, [auth, cfg, selected, reason, ttlSeconds, load, pick]);

  // Break-glass: audited emergency self-grant. Reason is mandatory; success auto-expires shortly.
  const breakGlass = useCallback(async () => {
    if (!selected) return;
    if (!reason.trim()) { flash('Break-glass needs a reason — it goes straight into the audit log.'); return; }
    setBusy(true);
    try {
      await governanceApi.breakGlass(auth, cfg, { kind: selected.kind, key: selected.key, reason: reason.trim() });
      flash(`Emergency access to ${selected.label} granted for ${bgMinutes} minutes — this was logged and admins were alerted.`);
      pick(null);
      load();
    } catch (e: any) {
      flash(e?.message || 'Break-glass failed');
    } finally {
      setBusy(false);
    }
  }, [auth, cfg, selected, reason, bgMinutes, load, pick]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        {loading ? (
          <div className="py-8 text-center text-[13px] text-muted-foreground">Loading…</div>
        ) : denied.length === 0 ? (
          // nosemgrep: jsx-not-internationalized (single-locale demo)
          <div className="py-8 text-center text-[13px] text-muted-foreground">
            You already have access to every desk, specialist, and tool. Nothing to request.
          </div>
        ) : (
          <>
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <p className="mb-3 text-[12px] text-muted-foreground">
              Pick a desk, specialist, or tool you don't currently have. An administrator reviews and
              approves — you'll be notified live when it's granted.
            </p>
            <div className="space-y-1.5">
              {denied.map((d) => {
                const isPending = pendingKeys.has(`${d.kind}:${d.key}`);
                const isSel = selected?.kind === d.kind && selected?.key === d.key;
                const exp = expiryByKey.get(`${d.kind}:${d.key}`);
                const isMcp = d.kind === 'tools' && d.gateway;
                // nosemgrep: jsx-not-internationalized (single-locale demo)
                const kindLabel = d.kind === 'desks' ? 'desk' : d.kind === 'agents' ? 'specialist' : isMcp ? 'MCP tool' : 'tool';
                return (
                  <button
                    key={`${d.kind}:${d.key}`}
                    onClick={() => !isPending && pick(isSel ? null : d)}
                    disabled={isPending}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors',
                      isPending ? 'cursor-default border-border bg-elevated/50 text-muted-foreground'
                        : isSel ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                    )}
                  >
                    <span className={cn(
                      'flex size-6 items-center justify-center rounded-md',
                      isMcp ? 'bg-primary/15 text-primary' : d.kind === 'tools' ? 'bg-ok/15 text-ok' : 'bg-primary/15 text-primary',
                    )}>
                      {d.kind === 'desks' ? <Building2 size={13} /> : d.kind === 'agents' ? <Users size={13} /> : isMcp ? <Waypoints size={13} /> : <Wrench size={13} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{d.label}</span>
                        {isMcp && (
                          // nosemgrep: jsx-not-internationalized (single-locale demo)
                          <span className="shrink-0 rounded bg-primary/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">MCP</span>
                        )}
                      </span>
                      {d.kind === 'agents' && d.desk ? (
                        // nosemgrep: jsx-not-internationalized (single-locale demo)
                        <span className="block truncate text-[10.5px] text-muted-foreground">{d.desk} desk</span>
                      ) : isMcp ? (
                        // nosemgrep: jsx-not-internationalized (single-locale demo)
                        <span className="block truncate text-[10.5px] text-muted-foreground">Invoked through the governed Gateway</span>
                      ) : null}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{kindLabel}</span>
                    {isPending ? (
                      // nosemgrep: jsx-not-internationalized (single-locale demo)
                      <span className="flex items-center gap-1 text-[10.5px] text-warn">
                        <Clock size={11} /> pending{exp ? <span className="text-muted-foreground">· {formatExpiresIn(exp)}</span> : null}
                      </span>
                    ) : exp ? (
                      // nosemgrep: jsx-not-internationalized (single-locale demo)
                      <span className="text-[10.5px] text-muted-foreground">{formatExpiresIn(exp)}</span>
                    ) : isSel ? (
                      <Check size={15} className="text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="mt-4 space-y-3">
                {/* TTL ask — how long the requester needs it (admin can still override on approve). */}
                <div className="space-y-1.5">
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  <label className="field-key">How long do you need it?</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TTL_OPTIONS.map((opt) => {
                      const active = ttlSeconds === opt.value;
                      return (
                        <button
                          key={opt.label}
                          onClick={() => setTtlSeconds(opt.value)}
                          className={cn(
                            'rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                            active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary hover:bg-accent',
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  <label className="field-key">{selSensitive ? 'Justification (required)' : 'Reason (optional)'}</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value.slice(0, 2000))}
                    rows={3}
                    placeholder={`Why do you need ${selected.label}?`}
                    className={cn(
                      'w-full resize-none rounded-lg border bg-elevated px-3 py-2 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-ring',
                      reasonMissing ? 'border-warn/60' : 'border-border',
                    )}
                  />
                  {selSensitive && (
                    // nosemgrep: jsx-not-internationalized (single-locale demo)
                    <p className="text-[11px] text-muted-foreground">
                      {selected.kind === 'desks' ? 'Desk access' : 'This target is sensitive and'} requires a justification before it can be requested.
                    </p>
                  )}
                </div>

                {/* Break-glass — cautionary, audited emergency self-grant, separated from Submit. */}
                <div className="mt-1 space-y-1.5 border-t border-border pt-3">
                  <button
                    onClick={breakGlass}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-3 py-1.5 text-[12.5px] font-semibold text-warn transition-colors hover:bg-warn/20 disabled:opacity-50"
                  >
                    {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                    <TriangleAlert size={13} /> Break-glass — grant {selected.label} now
                  </button>
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  <p className="text-[11px] text-muted-foreground">
                    Audited emergency self-grant that auto-expires in {bgMinutes} minutes. Requires a
                    reason; admins are alerted immediately.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
        <button onClick={load} className="mr-auto flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[12px] font-medium hover:bg-accent">
          <RefreshCw size={12} /> Refresh
        </button>
        <button
          onClick={submit}
          disabled={!selected || busy || reasonMissing}
          title={reasonMissing ? 'A justification is required for this sensitive target' : undefined}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />} Submit request
        </button>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-2 text-[12.5px] shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}

/** The full control-panel Requests SECTION (inline, headered) — non-admin self-service. */
export function RequestAccessSection({
  auth, cfg, effective,
}: {
  auth: Auth; cfg: AppConfig; effective: Effective | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-5 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
          <Inbox size={17} />
        </span>
        <div className="min-w-0">
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <div className="text-[15px] font-bold tracking-tight">Request Access</div>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <div className="text-[11px] text-muted-foreground">
            Ask an administrator for a desk, specialist, or tool you don't have — separation of duties: you request, they approve
          </div>
        </div>
      </div>
      <RequestAccessBody auth={auth} cfg={cfg} effective={effective} />
    </div>
  );
}

/** The compact header-button variant: a trigger that opens the body in a centered modal. */
export function RequestAccess({
  auth, cfg, effective,
}: {
  auth: Auth; cfg: AppConfig; effective: Effective | null;
}) {
  const [open, setOpen] = useState(false);
  // Nothing to offer if the caller is unmanaged (fail-open → already has everything).
  if (!(effective?.managed ?? false)) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Request access to a desk, specialist, or tool you don't have"
        className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-[12.5px] font-medium text-secondary-foreground transition-colors hover:bg-accent"
      >
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <KeyRound size={14} /> <span className="hidden sm:inline">Request access</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary"><KeyRound size={15} /></span>
                {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                <div className="text-[14px] font-bold">Request access</div>
              </div>
              <button onClick={() => setOpen(false)} className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[12px] hover:bg-accent">
                <X size={13} /> Close
              </button>
            </div>
            <RequestAccessBody auth={auth} cfg={cfg} effective={effective} />
          </div>
        </div>
      )}
    </>
  );
}
