/**
 * AdminConsole — the admin's fine-grained access-control surface.
 *
 * Only rendered for admins (members of the `admins` Cognito group); the backend independently
 * enforces that authority on every route, so this is a convenience gate, not the security
 * boundary. The admin sees:
 *   • Users × Tools + Users × Desks grids — toggle any user's grant for any governed tool or
 *     desk. A toggle POSTs /admin/grant, which (a) writes the entitlements table, (b) re-
 *     materializes the per-tool Cedar blocklist on the Gateway, and (c) pushes the change to
 *     the affected user's live UI. The change is enforced on that user's very next agent turn.
 *   • Agents × Credentials grid — toggle which OUTBOUND credential providers each agent
 *     workload may vend (the "grant/revoke to agents" half). Revoking a cred blocks its tools.
 *
 * Each cell shows the CURRENT effective state and flips optimistically, reverting on error.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, KeyRound, User, Bot, Check, X, RefreshCw, Search, Building2, Wrench, AlertTriangle, Inbox, Clock, Users, Timer,
  ScrollText, ShieldAlert, Info, GaugeCircle,
} from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import {
  entitlementsApi, allows, expiresAt, formatExpiresIn,
  type Catalog, type UserPrincipal, type AgentPrincipal, type Effective, type GrantKind,
} from './entitlements';
import { governanceApi, type AccessRequest, type AuditEvent, type AuditResponse, type AuditLens } from './governanceApi';
import { cn } from './lib/cn';
import { TraceView } from './TraceView';

type Tab = 'user-tools' | 'user-desks' | 'user-agents' | 'agent-creds' | 'requests' | 'audit';

// Audit-trail window presets (minutes) for the Access-history tab.
const AUDIT_WINDOWS: { label: string; minutes: number }[] = [
  { label: '1h', minutes: 60 },
  { label: '12h', minutes: 720 },
  { label: '24h', minutes: 1440 },
  { label: '7d', minutes: 7 * 24 * 60 },
];
type Busy = Record<string, boolean>; // `${principal}:${kind}:${key}` -> in-flight

// Just-in-time TTL presets for a grant/approval. `undefined` seconds = STANDING (no expiry).
const TTL_PRESETS: { label: string; seconds?: number }[] = [
  { label: 'Standing', seconds: undefined },
  { label: '1h', seconds: 3600 },
  { label: '8h', seconds: 8 * 3600 },
  { label: '7d', seconds: 7 * 24 * 3600 },
];

export function AdminConsole({
  auth, cfg, onClose, onPendingCount, embedded = false,
}: {
  auth: Auth; cfg: AppConfig;
  /** Overlay-only: omitted when embedded as a control-panel section. */
  onClose?: () => void;
  /** Reports the current pending-request count up to the shell so nav badges stay in sync. */
  onPendingCount?: (n: number) => void;
  /** Render inline inside the shell (drop the fixed overlay chrome + Close button). */
  embedded?: boolean;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [users, setUsers] = useState<UserPrincipal[]>([]);
  const [agents, setAgents] = useState<AgentPrincipal[]>([]);
  const [tab, setTab] = useState<Tab>('user-tools');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Busy>({});
  const [filter, setFilter] = useState('');
  const [toast, setToast] = useState('');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  // JIT time-boxing: the TTL applied to the NEXT grant toggle-ON in the grids (default Standing).
  // A revoke never carries a TTL. Applies to grant approvals too via the RequestsView picker.
  const [grantTtl, setGrantTtl] = useState<number | undefined>(undefined);

  const loadRequests = useCallback(async () => {
    try {
      const r = await governanceApi.adminRequests(auth, cfg, 'PENDING');
      setRequests(r.requests);
      onPendingCount?.(r.requests.length);
    } catch {
      /* non-fatal: the grids still work if the requests store is unreachable */
    }
  }, [auth, cfg, onPendingCount]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, princ] = await Promise.all([
        entitlementsApi.catalog(auth, cfg),
        entitlementsApi.principals(auth, cfg),
      ]);
      setCatalog(cat);
      setUsers(princ.users);
      setAgents(princ.agents);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
    loadRequests();
  }, [auth, cfg, loadRequests]);

  useEffect(() => { load(); }, [load]);

  // Decide (approve/deny) a request, then re-sync the pending list + affected user's grid row.
  const decide = useCallback(async (req: AccessRequest, action: 'approve' | 'deny') => {
    const bkey = `${req.requestId}:${action}`;
    setBusy((b) => ({ ...b, [bkey]: true }));
    try {
      // Approve: if the admin picked a non-Standing TTL in the grid picker, override with it;
      // otherwise let the backend honor the requester's asked-for ttlSeconds (or the JIT default).
      if (action === 'approve') await governanceApi.approve(auth, cfg, req.requestId, grantTtl ? { ttlSeconds: grantTtl } : undefined);
      else await governanceApi.deny(auth, cfg, req.requestId);
      setRequests((rs) => {
        const next = rs.filter((r) => r.requestId !== req.requestId);
        onPendingCount?.(next.length);
        return next;
      });
      flash(`${action === 'approve' ? 'Approved' : 'Denied'} ${req.label} · ${req.requesterEmail}`);
      if (action === 'approve') {
        // The grant changed this user's effective view — refresh the grids so the cell flips too.
        entitlementsApi.principals(auth, cfg).then((p) => { setUsers(p.users); setAgents(p.agents); }).catch(() => {});
      }
    } catch (e: any) {
      flash(`Failed: ${e?.message || 'decision error'}`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[bkey]; return n; });
    }
  }, [auth, cfg, onPendingCount, grantTtl]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const setEff = (principal: string, isAgent: boolean, eff: Effective) => {
    if (isAgent) setAgents((a) => a.map((x) => (x.principal === principal ? { ...x, entitlements: eff } : x)));
    else setUsers((u) => u.map((x) => (x.principal === principal ? { ...x, entitlements: eff } : x)));
  };

  const toggle = useCallback(async (
    principal: string, kind: GrantKind, key: string, next: boolean, isAgent: boolean, label: string,
  ) => {
    const bkey = `${principal}:${kind}:${key}`;
    setBusy((b) => ({ ...b, [bkey]: true }));
    try {
      // Time-box only on grant-ON; a revoke or a Standing selection carries no TTL.
      const ttl_seconds = next && grantTtl ? grantTtl : undefined;
      const res = await entitlementsApi.grant(auth, cfg, { principal, kind, key, value: next, label, ttl_seconds });
      setEff(principal, isAgent, res.entitlements);
      const blocked = res?.cedar?.blocked;
      const ttlNote = ttl_seconds ? ` · expires in ${TTL_PRESETS.find((t) => t.seconds === ttl_seconds)?.label || 'a while'}` : '';
      flash(
        `${next ? 'Granted' : 'Revoked'} ${key} · ${principal.replace(/^(user|agent)#/, '')}${ttlNote}` +
        (Array.isArray(blocked) && blocked.length ? ` · Cedar now blocks ${blocked.length} tool(s)` : ''),
      );
    } catch (e: any) {
      setError(e?.message || 'Grant failed');
      flash(`Failed: ${e?.message || 'grant error'}`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[bkey]; return n; });
    }
  }, [auth, cfg, grantTtl]);

  const filteredUsers = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return users;
    return users.filter((u) => u.email.toLowerCase().includes(f) || u.groups.join(' ').toLowerCase().includes(f));
  }, [users, filter]);

  const toolKeys = catalog ? Object.keys(catalog.tools) : [];
  const deskKeys = catalog ? Object.keys(catalog.desks) : [];
  const credKeys = catalog ? Object.keys(catalog.creds) : [];
  const agentKeys = catalog ? Object.keys(catalog.agents || {}) : [];

  return (
    <div className={cn(
      'flex flex-col',
      embedded ? 'h-full' : 'fixed inset-0 z-[60] bg-background/95 backdrop-blur-md',
    )}>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
            <ShieldCheck size={17} />
          </span>
          <div className="min-w-0">
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[15px] font-bold tracking-tight">Access Control</div>
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[11px] text-muted-foreground">
              AgentCore Identity · fine-grained grants enforced at runtime, Gateway (Cedar + interceptor) &amp; IAM
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[12px] font-medium text-secondary-foreground transition-colors hover:bg-accent"
            title="Reload"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {!embedded && (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[13px] font-medium text-secondary-foreground transition-colors hover:bg-accent"
            >
              <X size={14} /> Close
            </button>
          )}
        </div>
      </div>

      {/* Tabs + filter */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-2">
        <TabBtn active={tab === 'user-tools'} onClick={() => setTab('user-tools')} Icon={Wrench} label="Users × Tools" />
        <TabBtn active={tab === 'user-desks'} onClick={() => setTab('user-desks')} Icon={Building2} label="Users × Desks" />
        <TabBtn active={tab === 'user-agents'} onClick={() => setTab('user-agents')} Icon={Users} label="Users × Specialists" />
        <TabBtn active={tab === 'agent-creds'} onClick={() => setTab('agent-creds')} Icon={KeyRound} label="Agents × Credentials" />
        <TabBtn active={tab === 'requests'} onClick={() => setTab('requests')} Icon={Inbox} label="Requests" badge={requests.length} />
        <TabBtn active={tab === 'audit'} onClick={() => setTab('audit')} Icon={ScrollText} label="Access history" />
        {tab !== 'agent-creds' && tab !== 'requests' && tab !== 'audit' && (
          <div className="relative ml-auto">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter users…"
              className="w-56 rounded-lg border border-border bg-elevated py-1.5 pl-8 pr-3 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}
      </div>

      {/* JIT TTL picker — the duration the NEXT grant (or approval) is time-boxed to. Standing =
          no expiry (the classic behavior). Shown on every grant surface so time-boxing is a
          first-class, visible choice rather than a hidden default. */}
      {tab !== 'agent-creds' && tab !== 'audit' && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-secondary/20 px-5 py-1.5">
          <Timer size={13} className="text-muted-foreground" />
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <span className="text-[11px] font-medium text-muted-foreground">Grant duration</span>
          <div className="flex items-center gap-1">
            {TTL_PRESETS.map((t) => (
              <button
                key={t.label}
                onClick={() => setGrantTtl(t.seconds)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                  grantTtl === t.seconds
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <span className="ml-1 text-[10.5px] text-muted-foreground">
            {grantTtl ? 'time-boxed — auto-expires, then re-denied everywhere' : 'standing — until revoked'}
          </span>
        </div>
      )}

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        {tab === 'audit' ? (
          // Self-contained: the audit reader does its own /admin/audit fetch, so it renders
          // immediately without waiting on the principals/catalog load the grids need.
          <AuditView auth={auth} cfg={cfg} />
        ) : loading && !catalog ? (
          <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">Loading…</div>
        ) : !catalog ? null : tab === 'requests' ? (
          <RequestsView requests={requests} busy={busy} decide={decide} onRefresh={loadRequests} />
        ) : tab === 'agent-creds' ? (
          <CredGrid agents={agents} credKeys={credKeys} catalog={catalog} busy={busy} toggle={toggle} />
        ) : tab === 'user-agents' ? (
          <AgentGrid users={filteredUsers} agentKeys={agentKeys} catalog={catalog} busy={busy} toggle={toggle} />
        ) : (
          <UserGrid
            users={filteredUsers}
            kind={tab === 'user-tools' ? 'tools' : 'desks'}
            keys={tab === 'user-tools' ? toolKeys : deskKeys}
            catalog={catalog}
            busy={busy}
            toggle={toggle}
          />
        )}
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-2 text-[12.5px] shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, Icon, label, badge }: { active: boolean; onClick: () => void; Icon: any; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon size={14} /> {label}
      {!!badge && badge > 0 && (
        <span className={cn(
          'ml-0.5 flex min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-4',
          active ? 'bg-primary-foreground/25 text-primary-foreground' : 'bg-destructive text-destructive-foreground',
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}

/** Admin review of pending access requests: separation of duties — the requester is never the
 * approver. Approving runs the SAME grant path as the grid (real Cedar/IAM side-effects + the
 * live entitlements_changed push to the requester). */
function RequestsView({
  requests, busy, decide, onRefresh,
}: {
  requests: AccessRequest[]; busy: Busy;
  decide: (r: AccessRequest, action: 'approve' | 'deny') => void;
  onRefresh: () => void;
}) {
  const fmtAge = (ts: number) => {
    const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };
  if (!requests.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <Inbox size={26} />
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <div className="text-[14px] font-semibold text-foreground">No pending requests</div>
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <div className="max-w-md text-[12px]">
          When a user requests access to a desk or tool they lack, it appears here for your approval.
          Approving applies the real grant and notifies them live.
        </div>
        <button onClick={onRefresh} className="mt-1 flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[12px] font-medium hover:bg-accent">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
      <p className="text-[12px] text-muted-foreground">
        Pending access requests. Approving runs the same grant path as the grids — the requester's
        access updates live and every enforcement layer (runtime, Gateway Cedar, interceptor) reflects it on their next turn.
      </p>
      <div className="space-y-2">
        {requests.map((r) => {
          const approving = !!busy[`${r.requestId}:approve`];
          const denying = !!busy[`${r.requestId}:deny`];
          const inFlight = approving || denying;
          return (
            <div key={r.requestId} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <span className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-lg',
                r.kind === 'desks' ? 'bg-primary/15 text-primary' : r.kind === 'agents' ? 'bg-primary/15 text-primary' : 'bg-ok/15 text-ok',
              )}>
                {r.kind === 'desks' ? <Building2 size={16} /> : r.kind === 'agents' ? <Users size={16} /> : <Wrench size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="font-semibold">{r.requesterEmail}</span>
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  <span className="text-muted-foreground">requests</span>
                  <span className="rounded bg-elevated px-1.5 py-0.5 font-medium">{r.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {r.kind === 'desks' ? 'desk' : r.kind === 'agents' ? 'specialist' : 'tool'}
                  </span>
                  {r.ttlSeconds ? (
                    // nosemgrep: jsx-not-internationalized (single-locale demo)
                    <span className="flex items-center gap-0.5 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-warn"><Timer size={9} /> asks {Math.round(r.ttlSeconds / 3600)}h</span>
                  ) : null}
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
    </div>
  );
}

/** Access history — the READ side of governance. Reads the runtime's security-audit lines
 * (identity decisions, RBAC denials, tool/agent scoping, trade/vault access, break-glass) back
 * from CloudWatch Logs Insights via GET /admin/audit. This is the "who accessed what, when,
 * under which decision" trail that closes the loop on the grant/request surfaces: the grids show
 * the POLICY, this shows what the policy actually DID at runtime.
 *
 * Two lenses: 'security' (default) hides the high-volume identity_verified/tool_invoke allow-
 * stream so denials and privileged actions surface; 'all' shows every audited event. */
function AuditView({ auth, cfg }: { auth: Auth; cfg: AppConfig }) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [windowMin, setWindowMin] = useState(720);
  const [lens, setLens] = useState<AuditLens>('security');
  const [typeFilter, setTypeFilter] = useState<string>('');   // '' = all types in the lens

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await governanceApi.adminAudit(auth, cfg, { windowMinutes: windowMin, lens });
      setData(r);
      if (r.error) setErr(r.error);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load audit trail');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [auth, cfg, windowMin, lens]);

  useEffect(() => { load(); }, [load]);

  const events = data?.events || [];
  const shown = typeFilter ? events.filter((e) => e.type === typeFilter) : events;
  // Ordered summary chips: most-severe categories first, then by count.
  const summaryEntries = Object.entries(data?.summary || {}).sort((a, b) => b[1] - a[1]);

  const fmtWhen = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    const ago = s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
    return `${d.toLocaleString()} · ${ago} ago`;
  };

  return (
    <div className="space-y-4">
      {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
      <p className="text-[12px] text-muted-foreground">
        The runtime's live security-audit trail — read back from CloudWatch Logs Insights over the
        agent's log group. The grids define the policy; this is what the policy actually enforced:
        every identity decision, access denial, proactive tool/specialist scoping, and privileged
        (trade / vault / break-glass) action, newest first.
      </p>

      {/* Controls: window + lens + refresh */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Clock size={13} className="text-muted-foreground" />
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <span className="text-[11px] font-medium text-muted-foreground">Window</span>
          <div className="flex items-center gap-1">
            {AUDIT_WINDOWS.map((w) => (
              <button
                key={w.label}
                onClick={() => setWindowMin(w.minutes)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                  windowMin === w.minutes ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <span className="text-[11px] font-medium text-muted-foreground">Show</span>
          {(['security', 'all'] as AuditLens[]).map((l) => (
            <button
              key={l}
              onClick={() => setLens(l)}
              className={cn(
                'rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize transition-colors',
                lens === l ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent',
              )}
            >
              {l === 'security' ? 'security events' : 'everything'}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[12px] font-medium hover:bg-accent"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Summary chips — per-type counts in the window; click to filter, click again to clear. */}
      {summaryEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setTypeFilter('')}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              !typeFilter ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            All · {events.length}
          </button>
          {summaryEntries.map(([type, count]) => {
            const sev = events.find((e) => e.type === type)?.severity || 'info';
            const label = events.find((e) => e.type === type)?.label || type;
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  typeFilter === type ? sevRingCls(sev) : 'border-border bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                <SevDot sev={sev} /> {label} · {count}
              </button>
            );
          })}
        </div>
      )}

      {err && (
        <div className="flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">
          <AlertTriangle size={14} /> {err}
        </div>
      )}

      {/* Event timeline */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-12 text-[13px] text-muted-foreground">
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <RefreshCw size={14} className="mr-2 animate-spin" /> Querying CloudWatch…
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
          <ScrollText size={26} />
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <div className="text-[14px] font-semibold text-foreground">No audited events in this window</div>
          {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
          <div className="max-w-md text-[12px]">
            Widen the window, switch to “everything”, or drive some agent activity — denials, vault
            access, and identity decisions will appear here.
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {shown.map((ev, i) => (
            <AuditRow key={`${ev.ts}-${ev.type}-${i}`} ev={ev} when={fmtWhen(ev.ts)} auth={auth} cfg={cfg} />
          ))}
        </div>
      )}

      {data?.log_group && (
        // nosemgrep: jsx-not-internationalized (single-locale demo)
        <p className="pt-1 text-[10.5px] text-muted-foreground">
          Source: CloudWatch Logs Insights over <span className="font-mono">{data.log_group}</span>
        </p>
      )}
    </div>
  );
}

/** One audit event as a timeline row: severity rail, label, actor, relative time, and a compact
 * render of the event-specific detail fields (tool/desk/scope/withheld/reason…). When the event
 * carries a session id, it can expand to the turn's real CloudWatch execution trace in place —
 * closing the loop from "the policy stopped this here" to "here is everything that turn did". */
function AuditRow({ ev, when, auth, cfg }: { ev: AuditEvent; when: string; auth: Auth; cfg: AppConfig }) {
  const Icon = ev.severity === 'alert' ? ShieldAlert : ev.severity === 'warn' ? AlertTriangle : Info;
  const [traceOpen, setTraceOpen] = useState(false);
  const hasTrace = !!ev.session;
  return (
    <div className={cn('rounded-lg border px-3 py-2', sevRowCls(ev.severity))}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md', sevIconCls(ev.severity))}>
          <Icon size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
            <span className="font-semibold">{ev.label}</span>
            <span className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{ev.type}</span>
            {ev.actor_email || ev.actor_sub ? (
              <>
                {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                <span className="text-muted-foreground">·</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <User size={11} /> {ev.actor_email || shortSub(ev.actor_sub)}
                </span>
              </>
            ) : null}
          </div>
          {Object.keys(ev.detail).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(ev.detail).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1 rounded bg-elevated/70 px-1.5 py-0.5 text-[10.5px]">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium">{formatDetail(k, v)}</span>
                </span>
              ))}
            </div>
          )}
          {hasTrace && (
            <button
              onClick={() => setTraceOpen((v) => !v)}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:opacity-80"
            >
              <GaugeCircle size={12} /> {traceOpen ? 'Hide execution trace' : 'View execution trace'}
            </button>
          )}
        </div>
        <span className="shrink-0 whitespace-nowrap text-[10.5px] text-muted-foreground">{when}</span>
      </div>
      {hasTrace && traceOpen && (
        <div className="mt-2">
          {/* Scope the trace to THIS event's turn, not the whole conversation. session id is the
              thread id — shared by every turn — so without a window the reader rolls up the entire
              chat. The audit line is stamped at turn start (the guardrail/identity check runs before
              the swarm), so bound the window forward from ev.ts: start there (the backend's −30s pad
              absorbs span clock-skew) through ~90s later (covers a full sync turn; the backend adds a
              +30s pad). turnKey ties the fetch to this exact event. */}
          <TraceView
            auth={auth}
            cfg={cfg}
            sessionId={ev.session!}
            startMs={ev.ts * 1000}
            endMs={(ev.ts + 90) * 1000}
            turnKey={`audit-${ev.session}-${ev.ts}`}
          />
        </div>
      )}
    </div>
  );
}

// Detail values are already-safe (the runtime never logs secrets/inputs verbatim). Render a
// comma-list as chips-in-text for the withheld field; everything else as its string.
function formatDetail(key: string, v: any): string {
  if (v === null || v === undefined) return '—';
  const s = String(v);
  if (key === 'withheld' && s.includes(',')) return s.split(',').filter(Boolean).join(', ');
  return s;
}

function shortSub(sub: string): string {
  return sub ? `${sub.slice(0, 8)}…` : '';
}

// ── Severity styling helpers (shared by the summary chips + rows) ──────────────
function SevDot({ sev }: { sev: string }) {
  return <span className={cn('size-1.5 rounded-full', sev === 'alert' ? 'bg-destructive' : sev === 'warn' ? 'bg-warn' : 'bg-muted-foreground')} />;
}
function sevRowCls(sev: string): string {
  return sev === 'alert' ? 'border-destructive/30 bg-destructive/5'
    : sev === 'warn' ? 'border-warn/30 bg-warn/5'
    : 'border-border bg-card';
}
function sevIconCls(sev: string): string {
  return sev === 'alert' ? 'bg-destructive/15 text-destructive'
    : sev === 'warn' ? 'bg-warn/15 text-warn'
    : 'bg-secondary text-muted-foreground';
}
function sevRingCls(sev: string): string {
  return sev === 'alert' ? 'border-destructive/50 bg-destructive/10 text-destructive'
    : sev === 'warn' ? 'border-warn/50 bg-warn/10 text-warn'
    : 'border-primary bg-primary/10 text-primary';
}

/** A grant cell: shows current state, flips on click, spins while in-flight. When the grant is
 * time-boxed, a small amber clock badge marks it and the title shows the countdown. */
function Cell({
  granted, busy, onClick, sensitive, expiry,
}: { granted: boolean; busy: boolean; onClick: () => void; sensitive?: boolean; expiry?: number | null }) {
  const timeBoxed = granted && !!expiry;
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={
        granted
          ? (timeBoxed ? `Granted (${formatExpiresIn(expiry!)}) — click to revoke` : 'Granted — click to revoke')
          : 'Revoked — click to grant'
      }
      className={cn(
        'relative flex size-7 items-center justify-center rounded-md border transition-colors disabled:opacity-50',
        granted
          ? cn('border-ok/40 bg-ok/15 text-ok hover:bg-ok/25', sensitive && 'ring-1 ring-warn/40')
          : 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20',
      )}
    >
      {busy ? <RefreshCw size={13} className="animate-spin" /> : granted ? <Check size={14} /> : <X size={14} />}
      {timeBoxed && !busy && (
        <span className="absolute -right-1 -top-1 flex size-3 items-center justify-center rounded-full bg-warn text-warn-foreground" title={formatExpiresIn(expiry!)}>
          <Clock size={8} />
        </span>
      )}
    </button>
  );
}

function UserGrid({
  users, kind, keys, catalog, busy, toggle,
}: {
  users: UserPrincipal[]; kind: 'tools' | 'desks'; keys: string[];
  catalog: Catalog; busy: Busy; toggle: (p: string, k: GrantKind, key: string, next: boolean, isAgent: boolean, label: string) => void;
}) {
  const labelFor = (key: string) =>
    kind === 'tools' ? catalog.tools[key]?.label || key : catalog.desks[key]?.label || key;
  // Desks are always sensitive (cross-desk access = separation of duties); tools flagged in catalog.
  const sensitiveOf = (key: string) => kind === 'desks' || (kind === 'tools' && !!catalog.tools[key]?.sensitive);

  return (
    <div className="overflow-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-[12px]">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <th className="sticky left-0 z-20 min-w-[190px] border-b border-r border-border bg-card px-3 py-2 text-left font-semibold">
              User
            </th>
            {keys.map((k) => (
              <th key={k} className="border-b border-border px-2 py-2 text-center font-medium">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="whitespace-nowrap">{labelFor(k)}</span>
                  {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                  {sensitiveOf(k) && <span className="text-[9px] uppercase tracking-wide text-warn">sensitive</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.principal} className="odd:bg-elevated/40">
              <td className="sticky left-0 z-10 border-r border-border bg-card px-3 py-2">
                <div className="flex items-center gap-2">
                  {u.is_admin ? <ShieldCheck size={14} className="text-primary" /> : <User size={14} className="text-muted-foreground" />}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{u.email}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {u.is_admin ? 'admin — bypasses gating' : u.entitlements.managed ? 'managed' : 'unmanaged (all allowed)'}
                    </div>
                  </div>
                </div>
              </td>
              {keys.map((k) => {
                const granted = allows(u.entitlements, kind, k);
                const bkey = `${u.principal}:${kind}:${k}`;
                return (
                  <td key={k} className="px-2 py-2 text-center">
                    <div className="flex justify-center">
                      <Cell
                        granted={granted}
                        busy={!!busy[bkey]}
                        sensitive={sensitiveOf(k)}
                        expiry={expiresAt(u.entitlements, kind, k)}
                        onClick={() => toggle(u.principal, kind, k, !granted, false, u.email)}
                      />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CredGrid({
  agents, credKeys, catalog, busy, toggle,
}: {
  agents: AgentPrincipal[]; credKeys: string[]; catalog: Catalog; busy: Busy;
  toggle: (p: string, k: GrantKind, key: string, next: boolean, isAgent: boolean, label: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
      <p className="text-[12px] text-muted-foreground">
        Outbound credential grants for each agent workload (AgentCore Identity token vault). Revoking a
        provider blocks every tool that depends on it — the agent cannot obtain the token to call it.
      </p>
      <div className="overflow-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-[12px]">
          <thead className="bg-card">
            <tr>
              {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
              <th className="min-w-[220px] border-b border-r border-border px-3 py-2 text-left font-semibold">Agent workload</th>
              {credKeys.map((c) => (
                <th key={c} className="border-b border-border px-3 py-2 text-center font-medium">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="whitespace-nowrap">{catalog.creds[c]?.label || c}</span>
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{catalog.creds[c]?.flow}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.principal} className="odd:bg-elevated/40">
                <td className="border-r border-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Bot size={14} className="text-primary" />
                    <div className="min-w-0">
                      <div className="truncate font-medium font-mono">{a.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {a.entitlements.managed ? 'managed' : 'unmanaged (all allowed)'}
                      </div>
                    </div>
                  </div>
                </td>
                {credKeys.map((c) => {
                  const granted = allows(a.entitlements, 'creds', c);
                  const bkey = `${a.principal}:creds:${c}`;
                  const tools = catalog.creds[c]?.tools || [];
                  return (
                    <td key={c} className="px-3 py-2 text-center" title={`gates: ${tools.join(', ')}`}>
                      <div className="flex justify-center">
                        <Cell granted={granted} busy={!!busy[bkey]} onClick={() => toggle(a.principal, 'creds', c, !granted, true, a.name)} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Users × Specialists — the per-AGENT invocation grid. Grants are keyed by the compound
 * `desk::rosterKey`; columns are grouped by desk so the 36-specialist matrix stays legible. A
 * revoked specialist is pruned from the swarm/graph before it runs and can't be a handoff target.
 * The `agents` dimension is fail-open until first scoped (agents_managed), so an all-granted user
 * shows every cell green until the admin starts narrowing. */
function AgentGrid({
  users, agentKeys, catalog, busy, toggle,
}: {
  users: UserPrincipal[]; agentKeys: string[]; catalog: Catalog; busy: Busy;
  toggle: (p: string, k: GrantKind, key: string, next: boolean, isAgent: boolean, label: string) => void;
}) {
  // Group compound keys by desk, preserving catalog order.
  const byDesk = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const k of agentKeys) {
      const desk = catalog.agents[k]?.desk || 'other';
      (m[desk] ||= []).push(k);
    }
    return m;
  }, [agentKeys, catalog]);
  const deskLabel = (d: string) => catalog.desks[d]?.label || d;

  return (
    <div className="space-y-5">
      {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
      <p className="text-[12px] text-muted-foreground">
        Per-specialist invocation access, within each desk. Revoking a specialist prunes it from the
        agent roster before the swarm or graph runs — it is never instantiated and cannot be a
        hand-off target. The desk's Lead Coordinator and Committee are structural and always present.
      </p>
      {Object.entries(byDesk).map(([desk, keys]) => (
        <div key={desk} className="overflow-auto rounded-xl border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-3 py-1.5">
            <Building2 size={13} className="text-primary" />
            <span className="text-[12px] font-semibold">{deskLabel(desk)}</span>
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <span className="text-[10.5px] text-muted-foreground">{keys.length} specialists</span>
          </div>
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                <th className="sticky left-0 z-20 min-w-[190px] border-b border-r border-border bg-card px-3 py-2 text-left font-semibold">
                  User
                </th>
                {keys.map((k) => (
                  <th key={k} className="border-b border-border px-2 py-2 text-center font-medium">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="whitespace-nowrap">{catalog.agents[k]?.label || k}</span>
                      {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
                      {catalog.agents[k]?.sensitive && <span className="text-[9px] uppercase tracking-wide text-warn">sensitive</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.principal} className="odd:bg-elevated/40">
                  <td className="sticky left-0 z-10 border-r border-border bg-card px-3 py-2">
                    <div className="flex items-center gap-2">
                      {u.is_admin ? <ShieldCheck size={14} className="text-primary" /> : <User size={14} className="text-muted-foreground" />}
                      <div className="min-w-0">
                        <div className="truncate font-medium">{u.email}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {u.is_admin ? 'admin — bypasses gating' : u.entitlements.agents_managed ? 'scoped' : 'all specialists (unscoped)'}
                        </div>
                      </div>
                    </div>
                  </td>
                  {keys.map((k) => {
                    const granted = allows(u.entitlements, 'agents', k);
                    const bkey = `${u.principal}:agents:${k}`;
                    return (
                      <td key={k} className="px-2 py-2 text-center">
                        <div className="flex justify-center">
                          <Cell
                            granted={granted}
                            busy={!!busy[bkey]}
                            sensitive={!!catalog.agents[k]?.sensitive}
                            expiry={expiresAt(u.entitlements, 'agents', k)}
                            onClick={() => toggle(u.principal, 'agents', k, !granted, false, u.email)}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
