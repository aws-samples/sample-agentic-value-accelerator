import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  approvalPoliciesApi,
  type ApprovalPolicy,
  type ApprovalPolicyReference,
  type ApprovalPolicyCreate,
} from './api';

// Approval Policies live under Secure — they're rules authored once, reviewed
// occasionally. Sibling of Guardrails / Policy. The live queue of pending
// requests they produce lives under Operate → Approval Queue.

// Fallback reference data used when /reference is unavailable (e.g. backend
// hasn't shipped the new route yet). Kept in-sync with the values in
// backend/api/routes/approval_policies.py at the time this file was authored;
// the backend still validates on submit so a drift here is caught server-side.
const FALLBACK_REFERENCE: ApprovalPolicyReference = {
  resource_kinds: ['application', 'harness', 'memory', 'mcp', 'a2a', 'identity', '*'],
  action_verbs:   ['deploy', 'delete', 'invoke', 'update', 'register', '*'],
  ava_roles:      ['ADMIN', 'OPERATOR'],
};

// Explicit display order for the AVA Default seeded policies. DDB scan
// returns rows in insertion-defined but unspecified order; users expect
// the eight bootstrap policies grouped by resource type (Agent → MCP →
// A2A → Skills → Custom Resource) followed by Application (deploy first
// because it auto-approves, then delete) and finally Identity. Anything
// not in this list (user-authored policies) falls after, alphabetically.
const AVA_DEFAULT_ORDER: string[] = [
  'AVA Default: Agent register requires OPERATOR',
  'AVA Default: MCP register requires OPERATOR',
  'AVA Default: A2A register requires OPERATOR',
  'AVA Default: Skills register requires OPERATOR',
  'AVA Default: Custom Resource register requires OPERATOR',
  'AVA Default: Application deploy auto-approves',
  'AVA Default: Application delete requires ADMIN',
  'AVA Default: Identity provider register requires ADMIN',
];

export default function ApprovalPoliciesLanding() {
  const [rows, setRows] = useState<ApprovalPolicy[]>([]);
  const [ref, setRef] = useState<ApprovalPolicyReference | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ApprovalPolicy | null>(null);

  const sortForDisplay = (policies: ApprovalPolicy[]): ApprovalPolicy[] => {
    const rank = (name: string) => {
      const idx = AVA_DEFAULT_ORDER.indexOf(name);
      return idx === -1 ? AVA_DEFAULT_ORDER.length : idx;
    };
    return [...policies].sort((a, b) => {
      const ra = rank(a.name);
      const rb = rank(b.name);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  };

  const load = () => {
    setLoading(true);
    Promise.allSettled([approvalPoliciesApi.list(), approvalPoliciesApi.reference()])
      .then(([lRes, rRes]) => {
        if (lRes.status === 'fulfilled') setRows(sortForDisplay(lRes.value.policies || []));
        if (rRes.status === 'fulfilled') setRef(rRes.value);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (p: ApprovalPolicy) => { setEditing(p); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const toggleStatus = async (p: ApprovalPolicy) => {
    try {
      const next = p.status === 'active' ? 'disabled' : 'active';
      await approvalPoliciesApi.update(p.policy_id, { status: next });
      load();
    } catch (e) { setErr(String(e)); }
  };

  const remove = async (p: ApprovalPolicy) => {
    if (!window.confirm(`Delete approval policy "${p.name}"?\n\nAny in-flight requests already opened by this policy remain in the queue.`)) return;
    try { await approvalPoliciesApi.remove(p.policy_id); load(); }
    catch (e) { setErr(String(e)); }
  };

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-6 py-8">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <Link to="/secure" className="hover:text-slate-700">Secure</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium">Approval Policies</span>
      </div>

      <div className="rounded-2xl p-8 mb-6 text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #b45309 0%, #dc2626 60%, #7c3aed 100%)' }}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest bg-white/15 px-2 py-0.5 rounded-full inline-block mb-3">
              Secure · Approval Policies · HITL
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Approval Policies</h1>
            <p className="text-white/85 text-sm max-w-2xl leading-relaxed">
              Human-in-the-loop rules for sensitive actions. Declare which resource + action
              combinations require sign-off, from whom, and by when. Requests appear in the{' '}
              <Link to="/operate/approvals" className="underline hover:text-white">Approval Queue</Link> for on-call operators.
            </p>
          </div>
          {!showForm && (
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 bg-white text-amber-700 hover:bg-white/95 px-5 py-2.5 rounded-lg font-medium text-sm shadow-md shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              New policy
            </button>
          )}
        </div>
      </div>

      {/* Enforcement scope — narrow but real. Updated as more action
          handlers get wired into the policy engine. */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-xs text-emerald-900 mb-4 flex items-start gap-2">
        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <strong>Live enforcement</strong> for MCP Servers, A2A Agents, and Identity Providers — registration
          matching an active policy routes through Operate → Approval Queue.
          <span className="text-emerald-800/80">
            {' '}Harness, Memory, and Application actions aren&apos;t consulting the engine yet — coming as more
            routes wire in. Use the queue&apos;s <em>Simulate request</em> button to see the end-to-end flow.
          </span>
        </div>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-3">{err}</div>}

      {/* Render the form as soon as showForm is true. Previously we gated on
          `ref` too — if /reference 500s or returns null, clicking Create
          rendered nothing (blank white below the hero). Fall back to a
          hardcoded reference set so the form is always usable; the backend
          re-validates on submit anyway. */}
      {showForm && (
        <PolicyForm
          reference={ref || FALLBACK_REFERENCE}
          initial={editing}
          onCancel={closeForm}
          onSaved={() => { closeForm(); load(); }}
          setErr={setErr}
        />
      )}

      {loading && <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>}

      {!loading && rows.length === 0 && !showForm && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center">
          <div className="text-slate-500 text-sm mb-4">No approval policies yet.</div>
          <button onClick={openCreate} className="text-xs bg-amber-600 text-white hover:bg-amber-700 px-3 py-1.5 rounded-lg font-medium">
            Create your first policy
          </button>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Name</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Resource</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Action</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2">Approver</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">Quorum</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">SLA</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-24">Status</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2 w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const active = p.status === 'active';
                return (
                  <tr key={p.policy_id} className="border-b border-slate-100 last:border-0 hover:bg-amber-50/40 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      <div>{p.name}</div>
                      {p.description && <div className="text-[11px] text-slate-500 truncate max-w-md">{p.description}</div>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 truncate max-w-[14rem]">
                      {p.resource_kind}:{p.resource_pattern}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p.action_pattern}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        {p.required_role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-700">{p.quorum}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-700">{p.sla_hours}h</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => toggleStatus(p)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          active ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                        }`}>
                        {active ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(p)} className="text-xs text-amber-700 hover:underline">Edit</button>
                        <span className="text-slate-200">·</span>
                        <button onClick={() => remove(p)} className="text-xs text-red-600 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Form ───────────────────────────────────────────────────────────────

function PolicyForm({
  reference, initial, onCancel, onSaved, setErr,
}: {
  reference: ApprovalPolicyReference;
  initial: ApprovalPolicy | null;
  onCancel: () => void;
  onSaved: () => void;
  setErr: (v: string) => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [resourceKind, setResourceKind] = useState(initial?.resource_kind || 'application');
  const [resourcePattern, setResourcePattern] = useState(initial?.resource_pattern || '*');
  const [actionPattern, setActionPattern] = useState(initial?.action_pattern || 'deploy');
  const [requiredRole, setRequiredRole] = useState(initial?.required_role || 'ADMIN');
  const [quorum, setQuorum] = useState(initial?.quorum || 1);
  const [slaHours, setSlaHours] = useState(initial?.sla_hours || 24);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setErr('');
    try {
      const payload: ApprovalPolicyCreate = {
        name: name.trim(),
        description: description.trim() || undefined,
        resource_kind: resourceKind,
        resource_pattern: resourcePattern.trim() || '*',
        action_pattern: actionPattern.trim() || '*',
        required_role: requiredRole,
        quorum,
        sla_hours: slaHours,
      };
      if (isEdit && initial) {
        await approvalPoliciesApi.update(initial.policy_id, payload);
      } else {
        await approvalPoliciesApi.create(payload);
      }
      onSaved();
    } catch (e) { setErr(String(e)); }
    finally { setSubmitting(false); }
  };

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm space-y-5 mb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {isEdit ? `Edit policy · ${initial?.name}` : 'New approval policy'}
        </h2>
        <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Require ADMIN sign-off for prod deploys"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
        </Field>
        <Field label="Description (optional)">
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Resource kind">
          <select value={resourceKind} onChange={(e) => setResourceKind(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40">
            {reference.resource_kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Resource pattern" hint="Glob (e.g. 'agent-safety' or 'prod-*' or '*')">
          <input value={resourcePattern} onChange={(e) => setResourcePattern(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
        </Field>
        <Field label="Action">
          <select value={actionPattern} onChange={(e) => setActionPattern(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40">
            {reference.action_verbs.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Required role">
          <select value={requiredRole} onChange={(e) => setRequiredRole(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40">
            {reference.ava_roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Quorum" hint="Approvals required (v1 flips on first vote)">
          <input type="number" min={1} max={5} value={quorum}
            onChange={(e) => setQuorum(Math.max(1, Math.min(5, parseInt(e.target.value || '1', 10))))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
        </Field>
        <Field label="SLA (hours)" hint="Auto-expire pending requests after this many hours">
          <input type="number" min={1} max={168} value={slaHours}
            onChange={(e) => setSlaHours(Math.max(1, Math.min(168, parseInt(e.target.value || '24', 10))))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
        </Field>
      </div>

      <div className="flex items-center justify-end border-t border-slate-100 pt-4">
        <button onClick={submit} disabled={!canSubmit}
          className="bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2 rounded-lg">
          {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save changes' : 'Create policy')}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 mb-1 block">{label}</label>
      {children}
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}
