import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  approvalPoliciesApi,
  approvalRequestsApi,
  type ApprovalPolicy,
  type ApprovalRequest,
  type ApprovalSummary,
  type ApprovalRequestCreate,
} from './api';

// Approval Queue lives under Operate — it's the live inbox operators watch,
// with SLAs and pager semantics. Sibling of Deployments / Observability.
// The rules that produce these requests live under Secure → Approval Policies.

type Filter = 'pending' | 'approved' | 'denied' | 'all';

export default function ApprovalQueueLanding() {
  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  const [counts, setCounts] = useState<ApprovalSummary | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [showSim, setShowSim] = useState(false);
  // Bulk-decision state — checkbox column + action bar. Reset on filter
  // change so a stale selection doesn't survive a tab switch and cause
  // an operator to bulk-approve rows they can no longer see.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  useEffect(() => { setSelected(new Set()); }, [filter]);

  const load = () => {
    setLoading(true);
    const req = filter === 'all' ? approvalRequestsApi.list() : approvalRequestsApi.list(filter);
    Promise.allSettled([req, approvalRequestsApi.counts()])
      .then(([lRes, cRes]) => {
        if (lRes.status === 'fulfilled') setRows(lRes.value.requests || []);
        if (cRes.status === 'fulfilled') setCounts(cRes.value);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [filter]);

  // Auto-refresh so late-arriving requests appear without a page reload —
  // Approval Queue is an operator surface people leave open.
  useEffect(() => {
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const decide = async (r: ApprovalRequest, outcome: 'approve' | 'deny') => {
    const verb = outcome === 'approve' ? 'Approve' : 'Deny';
    const comment = window.prompt(`${verb} request from ${r.requested_by}?\n\n${r.action} on ${r.resource_kind}:${r.resource_label}\n\nOptional comment:`);
    if (comment === null) return; // cancelled the prompt
    setDecidingId(r.request_id);
    try {
      if (outcome === 'approve') await approvalRequestsApi.approve(r.request_id, comment);
      else await approvalRequestsApi.deny(r.request_id, comment);
      load();
    } catch (e) { setErr(String(e)); }
    finally { setDecidingId(null); }
  };

  // Bulk selection helpers. `toggleRow` and `toggleAllPending` keep the
  // set updates immutable so React re-renders. Selection is restricted
  // to pending rows — approved/denied rows can't be re-decided, and
  // including them in a bulk call would just add to the `failed` array.
  const pendingRows = rows.filter((r) => r.status === 'pending');
  const allPendingSelected = pendingRows.length > 0 && pendingRows.every((r) => selected.has(r.request_id));
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllPending = () =>
    setSelected((prev) => {
      if (allPendingSelected) return new Set();
      const next = new Set(prev);
      pendingRows.forEach((r) => next.add(r.request_id));
      return next;
    });

  const batchDecide = async (outcome: 'approve' | 'deny') => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const verb = outcome === 'approve' ? 'Approve' : 'Deny';
    const comment = window.prompt(
      `${verb} ${ids.length} request${ids.length === 1 ? '' : 's'}?\n\nAll selected pending requests will receive the same decision.\n\nOptional comment (applied to every row):`,
    );
    if (comment === null) return;
    setBatchBusy(true);
    setErr('');
    try {
      const result = outcome === 'approve'
        ? await approvalRequestsApi.batchApprove(ids, comment)
        : await approvalRequestsApi.batchDeny(ids, comment);
      // Report partial failures inline so operators see what didn't
      // land — but still refresh the queue since the successful ones
      // did apply.
      if (result.failed.length > 0) {
        setErr(
          `${result.succeeded.length}/${result.attempted} ${outcome}d. ${result.failed.length} failed: ` +
            result.failed.slice(0, 5).map((f) => `${f.request_id.slice(0, 8)}… (${f.error})`).join('; ') +
            (result.failed.length > 5 ? '; …' : ''),
        );
      }
      setSelected(new Set());
      load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-6 py-8">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <Link to="/operate" className="hover:text-slate-700">Operate</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium">Approval Queue</span>
      </div>

      <div className="rounded-2xl p-8 mb-6 text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #059669 0%, #0891b2 55%, #4338ca 100%)' }}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full inline-block mb-3">
              Operate · Approval Queue · HITL
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Approval Queue</h1>
            <p className="text-white/85 text-sm max-w-2xl leading-relaxed">
              Live inbox of pending sign-offs. Requests appear here when a gated action matches an{' '}
              <Link to="/secure/approval-policies" className="underline hover:text-white">Approval Policy</Link>.
              Decide to approve, deny, or let them expire past SLA.
            </p>
            {counts && (
              <div className="flex flex-wrap gap-3 mt-4 text-xs">
                <StatChip label="Pending"   n={counts.pending}   tone="amber" />
                <StatChip label="Approved"  n={counts.approved}  tone="emerald" />
                <StatChip label="Denied"    n={counts.denied}    tone="rose" />
                <StatChip label="Expired"   n={counts.expired}   tone="slate" />
                <StatChip label="Cancelled" n={counts.cancelled} tone="slate" />
              </div>
            )}
          </div>
          <button onClick={() => setShowSim(true)}
            className="inline-flex items-center gap-2 bg-white text-emerald-700 hover:bg-white/95 px-5 py-2.5 rounded-lg font-medium text-sm shadow-md shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Simulate request
          </button>
        </div>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-3">{err}</div>}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {(['pending','approved','denied','all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              filter === f ? 'text-emerald-700 border-emerald-500' : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {counts && f !== 'all' && ` (${counts[f as keyof ApprovalSummary] || 0})`}
          </button>
        ))}
      </div>

      {showSim && (
        <SimulateForm onCancel={() => setShowSim(false)} onCreated={() => { setShowSim(false); load(); }} setErr={setErr} />
      )}

      {loading && <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>}

      {!loading && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center">
          <div className="text-slate-500 text-sm mb-4">
            {filter === 'pending' ? 'No pending requests. Nothing to approve right now.' : `No ${filter} requests.`}
          </div>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden">
          {/* Bulk action bar — hidden until the operator selects at least
              one row. Once shown, sticks to the top of the table so the
              actions stay reachable as they scroll through candidates. */}
          {selected.size > 0 && (
            <div className="border-b border-slate-100 bg-emerald-50/40 px-4 py-2.5 flex items-center gap-3">
              <span className="text-xs font-semibold text-emerald-800">
                {selected.size} selected
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-[11px] text-emerald-700 hover:underline"
              >
                Clear
              </button>
              <div className="flex-1" />
              <button
                onClick={() => batchDecide('approve')}
                disabled={batchBusy}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-3 py-1.5 rounded font-medium"
              >
                {batchBusy ? 'Working…' : `Approve ${selected.size}`}
              </button>
              <button
                onClick={() => batchDecide('deny')}
                disabled={batchBusy}
                className="text-xs bg-white hover:bg-red-50 disabled:bg-slate-100 text-red-700 border border-red-200 px-3 py-1.5 rounded font-medium"
              >
                Deny {selected.size}
              </button>
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {/* Checkbox column — the header checkbox selects/deselects
                    every PENDING row currently visible. Non-pending rows
                    aren't selectable (see toggleAllPending logic). */}
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all pending"
                    checked={allPendingSelected}
                    disabled={pendingRows.length === 0}
                    onChange={toggleAllPending}
                    className="w-4 h-4 accent-emerald-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  />
                </th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Request</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Requested by</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-28">Status</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-32">Opened</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-32">SLA</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RequestRow
                  key={r.request_id}
                  r={r}
                  decidingId={decidingId}
                  onDecide={decide}
                  selected={selected.has(r.request_id)}
                  onToggleSelect={() => toggleRow(r.request_id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, n, tone }: { label: string; n: number; tone: 'amber' | 'emerald' | 'rose' | 'slate' }) {
  const bg = tone === 'amber' ? 'bg-amber-400/20 text-amber-50'
    : tone === 'emerald' ? 'bg-emerald-400/20 text-emerald-50'
    : tone === 'rose' ? 'bg-rose-400/20 text-rose-50'
    : 'bg-white/15 text-white/80';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${bg}`}>
      <span className="font-bold">{n}</span>
      <span className="uppercase tracking-wider text-[10px]">{label}</span>
    </span>
  );
}

function RequestRow({
  r, decidingId, onDecide, selected, onToggleSelect,
}: {
  r: ApprovalRequest;
  decidingId: string | null;
  onDecide: (r: ApprovalRequest, outcome: 'approve' | 'deny') => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const busy = decidingId === r.request_id;
  // Only pending rows are selectable — approved/denied/expired rows
  // can't be re-decided, so surfacing a checkbox there would confuse.
  const canSelect = r.status === 'pending';
  const statusColor =
    r.status === 'pending'  ? 'text-amber-700 bg-amber-50'
    : r.status === 'approved' ? 'text-emerald-700 bg-emerald-50'
    : r.status === 'denied'   ? 'text-red-700 bg-red-50'
    : r.status === 'expired'  ? 'text-slate-600 bg-slate-100'
    : 'text-slate-600 bg-slate-100';

  // SLA color: red if already past expires_at, amber if <1h remaining, else slate.
  const now = Date.now();
  const exp = Date.parse(r.expires_at || '') || 0;
  const remainingMs = exp - now;
  const remaining = exp
    ? remainingMs <= 0
      ? 'expired'
      : remainingMs < 3600_000
        ? `${Math.round(remainingMs / 60_000)}m left`
        : `${Math.round(remainingMs / 3600_000)}h left`
    : '—';
  const slaTone = remainingMs <= 0 ? 'text-red-600' : remainingMs < 3600_000 ? 'text-amber-700' : 'text-slate-500';

  return (
    <tr
      className={`border-b border-slate-100 last:border-0 transition-colors ${
        selected ? 'bg-emerald-50/40' : 'hover:bg-emerald-50/40'
      }`}
    >
      <td className="w-10 px-3 py-2.5 align-top">
        <input
          type="checkbox"
          aria-label={canSelect ? `Select request ${r.request_id}` : 'Selection disabled — request is not pending'}
          checked={selected}
          disabled={!canSelect}
          onChange={onToggleSelect}
          className="w-4 h-4 accent-emerald-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="font-medium text-slate-800">
          <span className="font-mono text-xs text-slate-500">{r.action}</span> · {r.resource_kind}:{r.resource_label}
        </div>
        {r.policy_name && <div className="text-[11px] text-slate-500">via <span className="font-mono">{r.policy_name}</span></div>}
        {r.justification && <div className="text-[11px] text-slate-500 italic truncate max-w-md mt-0.5">{r.justification}</div>}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-700 truncate max-w-[12rem]">{r.requested_by}</td>
      <td className="px-4 py-2.5">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${statusColor}`}>{r.status}</span>
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{(r.created_at || '').replace('T', ' ').slice(0, 16)}</td>
      <td className={`px-4 py-2.5 text-xs ${slaTone}`}>{remaining}</td>
      <td className="px-4 py-2.5 text-right">
        {r.status === 'pending' ? (
          <div className="inline-flex items-center gap-2 justify-end">
            <button onClick={() => onDecide(r, 'approve')} disabled={busy}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-2.5 py-1 rounded font-medium">
              {busy ? '…' : 'Approve'}
            </button>
            <button onClick={() => onDecide(r, 'deny')} disabled={busy}
              className="text-xs bg-white hover:bg-red-50 disabled:bg-slate-100 text-red-700 border border-red-200 px-2.5 py-1 rounded font-medium">
              Deny
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400 italic">
            {r.decisions?.length > 0 ? `by ${r.decisions[r.decisions.length-1].by}` : '—'}
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Simulate — creates a request end-to-end, showing what a gated caller
// would produce. Prefills against an existing policy when possible.

function SimulateForm({
  onCancel, onCreated, setErr,
}: {
  onCancel: () => void;
  onCreated: () => void;
  setErr: (v: string) => void;
}) {
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([]);
  const [policyId, setPolicyId] = useState('');
  const [resourceKind, setResourceKind] = useState('application');
  const [resourceId, setResourceId] = useState('agent-safety');
  const [action, setAction] = useState('deploy');
  const [justification, setJustification] = useState('Simulated request from the Approval Queue landing.');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    approvalPoliciesApi.list().then((r) => setPolicies((r.policies || []).filter((p) => p.status === 'active'))).catch(() => setPolicies([]));
  }, []);

  const submit = async () => {
    setSubmitting(true);
    setErr('');
    try {
      const policy = policies.find((p) => p.policy_id === policyId);
      const payload: ApprovalRequestCreate = {
        resource_kind: resourceKind,
        resource_id: resourceId.trim() || resourceKind,
        resource_label: resourceId.trim(),
        action: action.trim() || 'deploy',
        justification: justification.trim() || undefined,
        policy_id: policy?.policy_id || undefined,
        policy_name: policy?.name || undefined,
        required_role: policy?.required_role || 'ADMIN',
        quorum: policy?.quorum || 1,
        sla_hours: policy?.sla_hours || 24,
      };
      await approvalRequestsApi.create(payload);
      onCreated();
    } catch (e) { setErr(String(e)); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Simulate an approval request</h2>
        <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
      </div>
      <p className="text-xs text-slate-500">
        For demo / testing. Real gated actions (deploy, delete, invoke) will create requests automatically once
        enforcement is wired.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Bind to policy (optional)</label>
          <select value={policyId} onChange={(e) => setPolicyId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40">
            <option value="">— none —</option>
            {policies.map((p) => <option key={p.policy_id} value={p.policy_id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Action verb</label>
          <input value={action} onChange={(e) => setAction(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Resource kind</label>
          <select value={resourceKind} onChange={(e) => setResourceKind(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40">
            {['application','harness','memory','mcp','a2a','identity'].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Resource ID / label</label>
          <input value={resourceId} onChange={(e) => setResourceId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-700 mb-1 block">Justification</label>
        <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={2}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
      </div>

      <div className="flex items-center justify-end border-t border-slate-100 pt-4">
        <button onClick={submit} disabled={submitting}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2 rounded-lg">
          {submitting ? 'Submitting…' : 'Open request'}
        </button>
      </div>
    </div>
  );
}
