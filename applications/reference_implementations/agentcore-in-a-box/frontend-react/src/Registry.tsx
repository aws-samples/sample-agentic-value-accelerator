/**
 * Registry — the AWS Agent Registry console (governed catalog of desk agents + MCP tools).
 *
 * Full-screen overlay. The point of the registry is GOVERNED DISCOVERY: an agent or tool isn't
 * publishable/searchable until it walks an approval lifecycle (DRAFT → PENDING_APPROVAL →
 * APPROVED), and only APPROVED records are returned by semantic search. This panel makes that
 * lifecycle legible:
 *   • a lifecycle rail with live counts, so you can see where every record sits;
 *   • record cards grouped by status, with the valid next actions inline;
 *   • curation (submit / approve / reject / deprecate) is admin-only and ENFORCED server-side on
 *     the verified cognito:groups — non-admins get a clear "read-only" affordance explaining that
 *     approval is a governance action, not a hidden button.
 *
 * Each curation action POSTs /registry/curate and re-lists from server truth (no optimistic lie).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookMarked, RefreshCw, Search, X, AlertTriangle, CheckCircle2, Send, Ban, Archive,
  Lock, FileText, Clock, ShieldCheck, Server, Bot, Boxes, ShieldQuestion, XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { Auth, AppConfig } from './auth';
import { registryApi, type RegistryRecord, type CurateAction, type Validation } from './registryApi';
import { cn } from './lib/cn';

// The governance lifecycle, in order. Search only returns APPROVED; everything else is a gate.
const LIFECYCLE: { status: string; label: string; Icon: LucideIcon; blurb: string }[] = [
  { status: 'DRAFT', label: 'Draft', Icon: FileText, blurb: 'Authored, not yet submitted' },
  { status: 'PENDING_APPROVAL', label: 'Pending', Icon: Clock, blurb: 'Awaiting admin review' },
  { status: 'APPROVED', label: 'Approved', Icon: CheckCircle2, blurb: 'Discoverable via search' },
];

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-secondary/70 text-muted-foreground',
  PENDING_APPROVAL: 'bg-warn/15 text-warn',
  APPROVED: 'bg-ok/15 text-ok',
  REJECTED: 'bg-destructive/12 text-destructive',
  DEPRECATED: 'bg-secondary/50 text-muted-foreground line-through',
  CREATING: 'bg-secondary/50 text-muted-foreground',
};

// Descriptor-type → icon + human label so a card reads as "what is this thing".
const DESCRIPTOR_META: Record<string, { Icon: LucideIcon; label: string }> = {
  MCP: { Icon: Server, label: 'MCP tool surface' },
  CUSTOM: { Icon: Bot, label: 'Desk agent' },
  A2A: { Icon: Bot, label: 'A2A agent' },
  'AG-UI': { Icon: Boxes, label: 'AG-UI app' },
  AGENT_SKILLS: { Icon: Boxes, label: 'Agent skills' },
  HTTP: { Icon: Server, label: 'HTTP API' },
};

// Which curation actions are valid from a given status (mirrors the service's lifecycle). `validate`
// (a read-only dry-run of the admission checks) is offered wherever `submit` is, so an author can
// pre-flight the auth-pattern gate before putting a record forward.
function actionsFor(status: string): CurateAction[] {
  switch (status) {
    case 'DRAFT': return ['validate', 'submit'];
    case 'PENDING_APPROVAL': return ['approve', 'reject'];
    case 'APPROVED': return ['deprecate'];
    case 'REJECTED': return ['validate', 'submit'];
    default: return [];
  }
}

const ACTION_META: Record<CurateAction, { label: string; Icon: LucideIcon; cls: string }> = {
  validate: { label: 'Validate', Icon: ShieldQuestion, cls: 'text-muted-foreground border-border bg-secondary hover:bg-accent' },
  submit: { label: 'Submit for approval', Icon: Send, cls: 'text-primary border-primary/40 bg-primary/8 hover:bg-primary/15' },
  approve: { label: 'Approve', Icon: CheckCircle2, cls: 'text-ok border-ok/40 bg-ok/8 hover:bg-ok/15' },
  reject: { label: 'Reject', Icon: Ban, cls: 'text-destructive border-destructive/40 bg-destructive/8 hover:bg-destructive/15' },
  deprecate: { label: 'Deprecate', Icon: Archive, cls: 'text-muted-foreground border-border bg-secondary hover:bg-accent' },
};

// The per-record admission-check verdict, rendered as a checklist. Shown after a validate/submit.
function ValidationPanel({ v }: { v: Validation }) {
  return (
    <div className={cn('mt-2.5 rounded-lg border p-2.5',
      v.ok ? 'border-ok/40 bg-ok/8' : 'border-destructive/40 bg-destructive/8')}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold">
        {v.ok ? <ShieldCheck size={13} className="text-ok" /> : <AlertTriangle size={13} className="text-destructive" />}
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        {v.ok ? 'Passes pre-onboarding validation' : 'Blocked — must follow the platform auth pattern'}
      </div>
      <ul className="flex flex-col gap-1">
        {v.checks.map((c) => (
          <li key={c.name} className="flex items-start gap-1.5 text-[11px]">
            {c.pass
              ? <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-ok" />
              : <XCircle size={12} className="mt-0.5 shrink-0 text-destructive" />}
            <span className={c.pass ? 'text-muted-foreground' : 'text-destructive'}>
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground"> — {c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Registry({
  auth, cfg, isAdmin, onClose, embedded = false,
}: {
  auth: Auth; cfg: AppConfig; isAdmin: boolean;
  /** Overlay-only: omitted when embedded as a control-panel section. */
  onClose?: () => void;
  /** Render inline inside the shell (drop the fixed overlay chrome + Close button). */
  embedded?: boolean;
}) {
  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  // Per-record admission-check verdict from the most recent validate/submit (keyed by record_id).
  const [validations, setValidations] = useState<Record<string, Validation>>({});
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [searchHits, setSearchHits] = useState<RegistryRecord[] | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>(''); // '' = all

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2800); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await registryApi.list(auth, cfg);
      setRecords(r.records || []);
      setNote(r.configured ? '' : (r.note || 'Registry not provisioned yet.'));
      setError(r.error ? `List degraded: ${r.error}` : '');
    } catch (e: any) {
      setError(e?.message || 'Failed to load registry');
    } finally {
      setLoading(false);
    }
  }, [auth, cfg]);

  useEffect(() => { load(); }, [load]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) { setSearchHits(null); return; }
    try {
      const r = await registryApi.search(auth, cfg, q);
      setSearchHits(r.results || []);
      if (r.error) flash(`Search: ${r.error}`);
    } catch (e: any) {
      flash(e?.message || 'Search failed');
    }
  }, [auth, cfg, query]);

  const curate = useCallback(async (rec: RegistryRecord, action: CurateAction) => {
    // Reject asks for a reason (recorded on the record via statusReason).
    let reason: string | undefined;
    if (action === 'reject') {
      const r = window.prompt(`Reject "${rec.name}" — reason (recorded on the record):`, '');
      if (r === null) return; // cancelled
      reason = r;
    }
    const bkey = `${rec.record_id}:${action}`;
    setBusy((b) => ({ ...b, [bkey]: true }));
    try {
      const res = await registryApi.curate(auth, cfg, rec.record_id, action, reason);
      // validate / submit carry the admission-check verdict — surface it inline on the card.
      if (res.validation) {
        setValidations((m) => ({ ...m, [rec.record_id]: res.validation! }));
      }
      if (action === 'validate') {
        flash(res.validation?.ok ? `${rec.name}: passes validation` : `${rec.name}: validation failed — see checks`);
        return; // read-only: no re-list
      }
      if (action === 'submit' && res.validation && !res.validation.ok) {
        // Hard gate blocked the submit (HTTP 422). The checklist is already shown; no state change.
        flash(`Submit blocked: ${rec.name} fails the auth-pattern gate`);
        return;
      }
      flash(`${ACTION_META[action].label} · ${rec.name} → ${res.status || 'done'}`);
      await load(); // re-list from server truth
    } catch (e: any) {
      flash(`Failed: ${e?.message || 'curate error'}`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[bkey]; return n; });
    }
  }, [auth, cfg, load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of records) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [records]);

  // What's on screen: search hits (if searching) else records filtered by the status chip.
  const shown = useMemo(() => {
    if (searchHits !== null) return searchHits;
    if (!filterStatus) return records;
    return records.filter((r) => r.status === filterStatus);
  }, [searchHits, records, filterStatus]);

  return (
    <div className={cn(
      'flex flex-col',
      embedded ? 'h-full' : 'fixed inset-0 z-[60] bg-background/95 backdrop-blur-md',
    )}>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
            <BookMarked size={17} />
          </span>
          <div className="min-w-0">
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[15px] font-bold tracking-tight">Agent Registry</div>
            {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
            <div className="text-[11px] text-muted-foreground">
              Governed catalog of desk agents &amp; MCP tools — records must be approved before they're discoverable
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:flex',
            isAdmin ? 'bg-primary/10 text-primary' : 'bg-secondary/70 text-muted-foreground')}>
            {isAdmin ? <ShieldCheck size={12} /> : <Lock size={12} />}
            {isAdmin ? 'Curator (admin)' : 'Read-only'}
          </span>
          <button onClick={load} title="Reload"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[12px] font-medium text-secondary-foreground transition-colors hover:bg-accent">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {!embedded && (
            <button onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[13px] font-medium text-secondary-foreground transition-colors hover:bg-accent">
              <X size={14} /> Close
            </button>
          )}
        </div>
      </div>

      {/* Lifecycle rail — the governance story, made visible. Click a stage to filter. */}
      <div className="shrink-0 border-b border-border bg-card/40 px-5 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-1">
          {LIFECYCLE.map((s, i) => {
            const n = counts[s.status] || 0;
            const activeFilter = filterStatus === s.status;
            return (
              <div key={s.status} className="flex flex-1 items-center gap-1">
                <button
                  onClick={() => { setSearchHits(null); setQuery(''); setFilterStatus(activeFilter ? '' : s.status); }}
                  className={cn(
                    'group flex flex-1 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                    activeFilter ? 'border-primary/50 bg-primary/8' : 'border-border bg-elevated/50 hover:bg-accent/50',
                  )}
                >
                  <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', STATUS_STYLE[s.status])}>
                    <s.Icon size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold">{s.label}</span>
                      <span className="tabular text-[12.5px] font-bold text-foreground">{n}</span>
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">{s.blurb}</span>
                  </span>
                </button>
                {i < LIFECYCLE.length - 1 && (
                  <span className="shrink-0 px-0.5 font-mono text-muted-foreground">→</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Search + non-admin explainer */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="Search approved records… (semantic + keyword)"
            className="w-80 rounded-lg border border-border bg-elevated py-1.5 pl-8 pr-3 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <button onClick={runSearch}
          className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-[12px] font-medium hover:bg-accent">Search</button>
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        {searchHits !== null && (
          <button onClick={() => { setSearchHits(null); setQuery(''); }}
            className="text-[11.5px] text-muted-foreground hover:text-foreground">clear search ({searchHits.length} hit{searchHits.length === 1 ? '' : 's'})</button>
        )}
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        {filterStatus && searchHits === null && (
          <button onClick={() => setFilterStatus('')}
            className="text-[11.5px] text-muted-foreground hover:text-foreground">clear filter ({filterStatus})</button>
        )}
        {!isAdmin && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock size={12} /> Approval is a governance action — curation requires the admin group.
          </span>
        )}
      </div>

      {toast && <div className="mx-5 mt-2 rounded-lg border border-primary/30 bg-primary/8 px-3 py-1.5 text-[12px] text-primary">{toast}</div>}
      {error && (
        <div className="mx-5 mt-2 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      {note && <div className="mx-5 mt-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[12px] text-muted-foreground">{note}</div>}

      {/* Records */}
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        {loading && !records.length ? (
          <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">Loading…</div>
        ) : !shown.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-[13px] text-muted-foreground">
            {searchHits !== null ? 'No matching approved records.'
              : filterStatus ? `No records in ${filterStatus}.`
              : 'No records.'}
          </div>
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-2.5">
            {searchHits !== null && (
              <p className="text-[11.5px] text-muted-foreground">
                Semantic search returns only <span className="font-semibold text-ok">APPROVED</span> records —
                proof the approval gate controls discoverability.
              </p>
            )}
            {shown.map((rec) => {
              const dm = DESCRIPTOR_META[rec.descriptor_type] || { Icon: Boxes, label: rec.descriptor_type };
              const actions = isAdmin ? actionsFor(rec.status) : [];
              return (
                <div key={rec.record_id} className="rounded-lg border border-border bg-card/60 p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <dm.Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold">{rec.name}</span>
                        <span className="rounded bg-secondary/70 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-muted-foreground">{dm.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">v{rec.version}</span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{rec.description}</div>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold', STATUS_STYLE[rec.status] || 'bg-secondary/60')}>
                      {rec.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Action row — admins get the valid next steps; non-admins get context. */}
                  <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2.5">
                    {isAdmin ? (
                      actions.length ? (
                        actions.map((a) => {
                          const meta = ACTION_META[a];
                          const bk = `${rec.record_id}:${a}`;
                          return (
                            <button key={a} onClick={() => curate(rec, a)} disabled={!!busy[bk]}
                              className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors disabled:opacity-50', meta.cls)}>
                              {busy[bk] ? <RefreshCw size={11} className="animate-spin" /> : <meta.Icon size={11} />} {meta.label}
                            </button>
                          );
                        })
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {rec.status === 'APPROVED' ? 'Live in the catalog — discoverable via search.'
                            : rec.status === 'DEPRECATED' ? 'Retired from the catalog.'
                            : 'No further action from this state.'}
                        </span>
                      )
                    ) : (
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {rec.status === 'APPROVED'
                          ? <><CheckCircle2 size={12} className="text-ok" /> Approved &amp; discoverable</>
                          : <><Lock size={12} /> {rec.status.replace('_', ' ').toLowerCase()} — an admin curates this record</>}
                      </span>
                    )}
                  </div>

                  {/* Pre-onboarding admission checks — shown after a validate/submit on this record. */}
                  {validations[rec.record_id] && <ValidationPanel v={validations[rec.record_id]} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
