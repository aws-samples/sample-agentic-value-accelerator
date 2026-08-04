/**
 * ConformanceView — ISO/IEC 42001 AIMS conformance record, in the UI.
 *
 * The "show me your AI management system" artifact regulated buyers and ISO
 * auditors ask for: persisted clause controls (Cl. 4-10) with status/evidence/
 * owner, EDITABLE as the AIMS matures — status changes persist to the backend
 * and the conformance % recomputes server-side. Backend-first with honest
 * empty/offline states; builds a starter ISO 42001 catalog on demand.
 */
import { useEffect, useRef, useState } from 'react';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import {
  governConformanceApi, DEFAULT_ISO42001_CATEGORIES,
  type ConformanceRecord, type ConformanceCategory,
} from '../../api/client';

const STATUSES = ['pass', 'in-progress', 'fail', 'not-started', 'not-applicable'] as const;
const statusMeta: Record<string, { label: string; badge: string }> = {
  pass: { label: 'Conformant', badge: 'bg-emerald-100 text-emerald-700' },
  'in-progress': { label: 'In Progress', badge: 'bg-amber-100 text-amber-700' },
  fail: { label: 'Gap', badge: 'bg-rose-100 text-rose-700' },
  'not-started': { label: 'Not Started', badge: 'bg-slate-100 text-slate-500' },
  'not-applicable': { label: 'N/A', badge: 'bg-slate-100 text-slate-400' },
};

export default function ConformanceView({ embedded = false }: { embedded?: boolean } = {}) {
  const [record, setRecord] = useState<ConformanceRecord | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'offline'>('loading');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const mounted = useRef(true);
  // Monotonic sequence so a slower earlier save can't overwrite a newer one.
  const saveSeq = useRef(0);

  useEffect(() => {
    mounted.current = true;
    governConformanceApi.list()
      .then(list => {
        if (!mounted.current) return;
        if (list && list.length > 0) { setRecord(list[0]); setState('ready'); }
        else setState('empty');
      })
      // A fetch failure here is almost always "table not provisioned yet"
      // (backend reachable) — show the empty state with the build action, which
      // surfaces any true backend failure itself. Keeps the surface useful.
      .catch(() => { if (mounted.current) setState('empty'); });
    return () => { mounted.current = false; };
  }, []);

  async function createDefault() {
    setBusy(true);
    try {
      const r = await governConformanceApi.create('FSI AI Management System — ISO/IEC 42001', DEFAULT_ISO42001_CATEGORIES);
      if (mounted.current) { setRecord(r); setState('ready'); }
    } catch { if (mounted.current) setState('offline'); }
    finally { if (mounted.current) setBusy(false); }
  }

  // Edit a control's status -> persist -> server recomputes conformance %.
  async function setStatus(catIdx: number, ctrlIdx: number, status: string) {
    if (!record) return;
    const prev = record;  // authoritative snapshot to roll back to on failure
    const categories: ConformanceCategory[] = record.categories.map((cat, i) =>
      i !== catIdx ? cat : { ...cat, controls: cat.controls.map((c, j) => j !== ctrlIdx ? c : { ...c, status }) });
    const seq = ++saveSeq.current;
    setSaveError(null);
    setRecord({ ...record, categories });  // optimistic
    try {
      const updated = await governConformanceApi.update(record.conformance_id, categories);
      // Ignore a stale response: a newer edit has already been issued.
      if (mounted.current && seq === saveSeq.current) setRecord(updated);  // authoritative (recomputed %)
    } catch {
      // The optimistic value was never persisted — roll back and tell the user.
      if (mounted.current && seq === saveSeq.current) {
        setRecord(prev);
        setSaveError('Could not save the status change — reverted. Check the backend connection.');
      }
    }
  }

  const c = record?.computed;

  const body = (
      <div className="space-y-6">
        {state === 'loading' && (
          <div className="bg-white/80 rounded-xl border border-slate-200/60 shadow-sm p-6 text-center text-[12px] text-slate-400 animate-pulse">
            Loading conformance record…
          </div>
        )}

        {state === 'offline' && (
          <div className="text-[12px] text-amber-700 bg-amber-50/70 rounded-xl border border-amber-200 px-5 py-4">
            Backend unreachable or the conformance table isn't provisioned. This surface is backend-driven; start the control-plane backend (and its DynamoDB table) to load or create a record.
          </div>
        )}

        {state === 'empty' && (
          <div className="bg-white/80 rounded-xl border border-slate-200/60 shadow-sm p-6 text-center">
            <div className="text-sm font-semibold text-slate-800 mb-1">No conformance record yet</div>
            <p className="text-[11px] text-slate-500 mb-3 max-w-md mx-auto">Create a starter ISO/IEC 42001 record (Clauses 4-9) to begin tracking AIMS conformance.</p>
            <button disabled={busy} onClick={createDefault} className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50">Build ISO 42001 catalog</button>
          </div>
        )}

        {state === 'ready' && record && (
          <>
            <div>
              <div className="text-sm font-semibold text-slate-900">{record.name}</div>
              <div className="text-[10px] text-slate-400">{record.standard}{record.next_audit ? ` · next audit ${record.next_audit}` : ''}</div>
            </div>

            {saveError && <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{saveError}</div>}

            {c && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Controls" value={c.total_controls} />
                <StatCard label="Conformant" value={c.passed} variant="success" />
                <StatCard label="In Progress" value={c.in_progress} variant="warning" />
                <StatCard label="Gaps" value={c.failed} variant={c.failed ? 'danger' : 'muted'} />
                <StatCard label="Conformance" value={`${c.conformance_pct}%`} variant="info" sub="excl. N/A" />
              </div>
            )}

            {record.categories.map((cat, ci) => (
              <div key={cat.name} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-900">{cat.name}</div>
                <div className="divide-y divide-slate-100">
                  {cat.controls.map((ctrl, cj) => (
                    <div key={ctrl.id} className="px-5 py-3 flex items-center gap-3">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusMeta[ctrl.status]?.badge ?? statusMeta['not-started'].badge}`}>{statusMeta[ctrl.status]?.label ?? ctrl.status}</span>
                      <div className="flex-1">
                        <div className="text-[11px] font-semibold text-slate-800">{ctrl.section} · {ctrl.label}</div>
                        {ctrl.owner && <div className="text-[10px] text-slate-400">owner: {ctrl.owner}</div>}
                      </div>
                      <select value={ctrl.status} onChange={e => setStatus(ci, cj, e.target.value)}
                        aria-label={`Status for ${ctrl.label}`}
                        className="text-[10px] border border-slate-200 rounded px-2 py-1 text-slate-600">
                        {STATUSES.map(s => <option key={s} value={s}>{statusMeta[s].label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[10px] text-slate-400">Change a control's status — it persists to the backend and the conformance % recomputes server-side.</p>
          </>
        )}
      </div>
  );

  if (embedded) return body;
  return (
    <GovernPageLayout
      title="ISO 42001 Conformance"
      description="The AI Management System (AIMS) conformance record ISO auditors and regulated buyers ask for — clause controls with status, evidence, and owner, editable as the AIMS matures. Persisted; conformance % recomputes server-side."
      badge={<MockDataBadge integration="Conformance record — control-plane backend (DynamoDB)" />}
    >
      {body}
    </GovernPageLayout>
  );
}
