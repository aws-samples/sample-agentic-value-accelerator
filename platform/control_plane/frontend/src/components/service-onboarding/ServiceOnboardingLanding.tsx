import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { serviceApprovalApi } from '../../api/client';
import type {
  AwsService,
  ServiceApprovalFramework,
  ServiceApprovalPhaseState,
  ServiceApprovalRun,
  ServiceApprovalRunCreate,
  ServiceApprovalTestingMode,
} from '../../types';

const PHASE_DEFINITIONS: { key: string; label: string; phaseDir: string }[] = [
  { key: 'assess', label: 'Assess', phaseDir: '01-assess' },
  { key: 'research', label: 'Research', phaseDir: '02-research' },
  { key: 'validate', label: 'Validate', phaseDir: '03-validate' },
  { key: 'map', label: 'Map', phaseDir: '04-map' },
  { key: 'generate', label: 'Generate', phaseDir: '05-generate' },
  { key: 'test', label: 'Test', phaseDir: '06-test' },
  { key: 'summarize', label: 'Summarize', phaseDir: '07-summarize' },
  { key: 'evidence', label: 'Evidence', phaseDir: '08-evidence' },
];

function statusIcon(status: ServiceApprovalPhaseState['status']) {
  switch (status) {
    case 'complete':
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      );
    case 'running':
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 animate-pulse">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 60" />
          </svg>
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      );
    default:
      return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px]">·</span>;
  }
}

function defaultPhases(): ServiceApprovalPhaseState[] {
  return PHASE_DEFINITIONS.map(({ key, label }) => ({
    key,
    label,
    status: 'pending',
    file_count: 0,
  }));
}

function mergePhases(run: ServiceApprovalRun | null): ServiceApprovalPhaseState[] {
  const map = new Map<string, ServiceApprovalPhaseState>();
  defaultPhases().forEach(p => map.set(p.key, p));
  run?.phases?.forEach(p => map.set(p.key, { ...map.get(p.key)!, ...p }));
  return PHASE_DEFINITIONS.map(d => map.get(d.key)!);
}

export default function ServiceOnboardingLanding() {
  const { slug: slugParam } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const [service, setService] = useState('amazonbedrockagentcore');
  const [framework, setFramework] = useState<ServiceApprovalFramework>('ccmv4');
  const [testingMode] = useState<ServiceApprovalTestingMode>('skip');

  // AWS service catalog (from sar-slugs.json) and combobox state
  const [awsServices, setAwsServices] = useState<AwsService[]>([]);
  const [serviceQuery, setServiceQuery] = useState('');
  const [serviceOpen, setServiceOpen] = useState(false);
  const serviceBoxRef = useRef<HTMLDivElement>(null);

  const [run, setRun] = useState<ServiceApprovalRun | null>(null);
  const [previousRuns, setPreviousRuns] = useState<ServiceApprovalRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const handleDeleteRun = async (slug: string) => {
    if (!window.confirm(`Delete run "${slug}"? This removes all generated artifacts.`)) {
      return;
    }
    setDeletingSlug(slug);
    try {
      await serviceApprovalApi.delete(slug);
      setPreviousRuns(prev => prev.filter(r => r.slug !== slug));
      // If the user is currently viewing this run, kick them back to the landing page.
      if (slugParam === slug) {
        navigate('/secure/service-onboarding');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete run');
    } finally {
      setDeletingSlug(null);
    }
  };

  const phases = useMemo(() => mergePhases(run), [run]);

  // Sort runs newest-first by created_at; falls back to slug compare so a
  // missing/identical timestamp keeps a stable order.
  const sortedPreviousRuns = useMemo(() => {
    return [...previousRuns].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      if (tb !== ta) return tb - ta;
      return b.slug.localeCompare(a.slug);
    });
  }, [previousRuns]);

  // Load previous runs on mount
  useEffect(() => {
    let cancelled = false;
    serviceApprovalApi.list().then(rs => { if (!cancelled) setPreviousRuns(rs); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // Load the AWS service catalog once
  useEffect(() => {
    let cancelled = false;
    serviceApprovalApi.listAwsServices()
      .then(list => { if (!cancelled) setAwsServices(list); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // Close the service dropdown on outside click
  useEffect(() => {
    if (!serviceOpen) return;
    const handler = (e: MouseEvent) => {
      if (serviceBoxRef.current && !serviceBoxRef.current.contains(e.target as Node)) {
        setServiceOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [serviceOpen]);

  // Keep query in sync with the picked slug
  const selectedService = useMemo(
    () => awsServices.find(s => s.slug === service) ?? null,
    [awsServices, service]
  );

  const filteredServices = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    if (!q) return awsServices.slice(0, 100);
    return awsServices
      .filter(s => s.label.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q))
      .slice(0, 100);
  }, [awsServices, serviceQuery]);

  // Load active run from URL slug
  useEffect(() => {
    if (!slugParam) { setRun(null); return; }
    let cancelled = false;
    serviceApprovalApi.get(slugParam)
      .then(r => { if (!cancelled) setRun(r); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [slugParam]);

  // Poll while running
  useEffect(() => {
    if (!run || (run.status !== 'running' && run.status !== 'pending')) {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const fresh = await serviceApprovalApi.get(run.slug);
        setRun(fresh);
        if (fresh.status === 'completed' || fresh.status === 'failed' || fresh.status === 'cancelled') {
          if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
          // refresh list
          serviceApprovalApi.list().then(setPreviousRuns).catch(() => undefined);
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [run?.slug, run?.status]);

  const handleRun = async () => {
    setError(null);
    setSubmitting(true);
    const payload: ServiceApprovalRunCreate = {
      service: service.trim(),
      framework,
      testing_mode: testingMode,
    };
    if (!payload.service) { setError('Service name is required.'); setSubmitting(false); return; }
    try {
      const created = await serviceApprovalApi.create(payload);
      setRun(created);
      navigate(`/secure/service-onboarding/runs/${created.slug}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!run) return;
    try {
      const updated = await serviceApprovalApi.cancel(run.slug);
      setRun(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const isRunning = run?.status === 'running' || run?.status === 'pending';
  const isComplete = run?.status === 'completed';
  const formDisabled = !!run; // form is read-only once a run is loaded

  const approvalReportPath = run?.approval_report_path;

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8 animate-fade-in">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">&larr; Back to Home</Link>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">Service Onboarding</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Generate AWS security controls and compliant IaC for any AWS service.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-700 animate-fade-in">
            {error}
          </div>
        )}

        {/* Intake form */}
        <div className={`card animate-fade-in stagger-1 relative ${serviceOpen ? 'z-40' : ''}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">Run a new approval</h2>
            {run && (
              <Link to="/secure/service-onboarding" className="text-xs text-blue-600 hover:underline">+ Start a new run</Link>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div ref={serviceBoxRef} className={`relative ${serviceOpen ? 'z-50' : ''}`}>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">AWS service</label>
              {formDisabled ? (
                <input
                  type="text"
                  value={run?.service ?? ''}
                  disabled
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { setServiceOpen(true); setServiceQuery(''); }}
                    disabled={submitting}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 hover:border-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <span className="truncate">
                      {selectedService ? selectedService.label : <span className="text-slate-400">Select an AWS service…</span>}
                    </span>
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </button>

                  {serviceOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden">
                      <div className="p-2 border-b border-slate-100 bg-slate-50">
                        <input
                          autoFocus
                          type="text"
                          value={serviceQuery}
                          onChange={(e) => setServiceQuery(e.target.value)}
                          placeholder="Search 467 AWS services…"
                          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <ul className="max-h-72 overflow-y-auto">
                        {filteredServices.length === 0 ? (
                          <li className="px-3 py-2 text-xs text-slate-400">No matches.</li>
                        ) : (
                          filteredServices.map(s => {
                            const active = s.slug === service;
                            return (
                              <li key={s.slug}>
                                <button
                                  type="button"
                                  onClick={() => { setService(s.slug); setServiceOpen(false); }}
                                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-blue-50 ${active ? 'bg-blue-50/60 text-blue-700 font-medium' : 'text-slate-700'}`}
                                >
                                  <span className="truncate">{s.label}</span>
                                </button>
                              </li>
                            );
                          })
                        )}
                      </ul>
                      {awsServices.length > filteredServices.length && (
                        <div className="px-3 py-1.5 text-[11px] text-slate-400 bg-slate-50 border-t border-slate-100">
                          Showing first {filteredServices.length} of {awsServices.length} matches — refine to see more.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Framework</label>
              <select
                value={run?.framework ?? framework}
                onChange={(e) => setFramework(e.target.value as ServiceApprovalFramework)}
                disabled={formDisabled || submitting}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="ccmv4">CCMv4 (Cloud Controls Matrix v4)</option>
                <option value="nist">NIST SP 800-53</option>
                <option value="cis">CIS Benchmarks</option>
                <option value="iso">ISO/IEC 27001</option>
              </select>
            </div>

          </div>

          <div className="flex items-center gap-3">
            {!run && (
              <button
                type="button"
                onClick={handleRun}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 transition-colors"
              >
                {submitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 60" /></svg>
                    Starting…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                    </svg>
                    Run Pipeline
                  </>
                )}
              </button>
            )}

            {isRunning && (
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                Cancel
              </button>
            )}

            {run && (
              <span className="ml-auto text-xs text-slate-500">
                Slug: <span className="font-mono text-slate-700">{run.slug}</span> · status:{' '}
                <span className={
                  run.status === 'completed' ? 'text-emerald-600 font-semibold' :
                  run.status === 'failed' ? 'text-red-600 font-semibold' :
                  run.status === 'cancelled' ? 'text-slate-500 font-semibold' :
                  'text-blue-600 font-semibold'
                }>{run.status}</span>
              </span>
            )}
          </div>
        </div>

        {/* Progress */}
        {run && (
          <div className="card mt-6 animate-fade-in stagger-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">Pipeline progress</h2>
              {isComplete && (
                <div className="flex items-center gap-2">
                  {approvalReportPath && (
                    <Link
                      to={`/secure/service-onboarding/runs/${run.slug}/files/07-summarize?file=${encodeURIComponent(approvalReportPath)}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                      View Approval Report &rarr;
                    </Link>
                  )}
                  <a
                    href={serviceApprovalApi.downloadAllUrl(run.slug)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                    Download All (.zip)
                  </a>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200/60">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2 w-1/3">Phase</th>
                    <th className="text-left px-4 py-2 w-32">Status</th>
                    <th className="text-left px-4 py-2 w-24">Files</th>
                    <th className="text-right px-4 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {phases.map((p, idx) => {
                    const def = PHASE_DEFINITIONS[idx];
                    const canView = p.status === 'complete' || p.status === 'running' || p.file_count > 0;
                    return (
                      <tr key={p.key} className={p.status === 'running' ? 'bg-blue-50/30' : 'hover:bg-slate-50/40'}>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{p.label}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {statusIcon(p.status)}
                            <span className="text-xs text-slate-500 capitalize">{p.status}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 tabular-nums">{p.file_count > 0 ? p.file_count : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2.5 text-right">
                          {canView ? (
                            <Link
                              to={`/secure/service-onboarding/runs/${run.slug}/files/${def.phaseDir}`}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                            >
                              View &rarr;
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {run.status === 'failed' && run.error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-700 font-mono">
                {run.error}
              </div>
            )}
          </div>
        )}

        {/* Previous runs */}
        {sortedPreviousRuns.length > 0 && (
          <div className="card mt-6 animate-fade-in stagger-3">
            <h2 className="text-base font-semibold text-slate-900 mb-3">Previous runs</h2>
            <div className="overflow-hidden rounded-lg border border-slate-200/60">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2">Slug</th>
                    <th className="text-left px-4 py-2">Service</th>
                    <th className="text-left px-4 py-2">Framework</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Created</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedPreviousRuns.map(r => (
                    <tr key={r.slug} className="hover:bg-slate-50/40">
                      <td className="px-4 py-2 font-mono text-xs text-slate-700">{r.slug}</td>
                      <td className="px-4 py-2 text-slate-900">{r.service}</td>
                      <td className="px-4 py-2 text-slate-500 uppercase text-xs">{r.framework}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-semibold ${
                          r.status === 'completed' ? 'text-emerald-600' :
                          r.status === 'failed' ? 'text-red-600' :
                          r.status === 'cancelled' ? 'text-slate-500' :
                          'text-blue-600'
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <Link
                          to={`/secure/service-onboarding/runs/${r.slug}`}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                        >
                          Open &rarr;
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteRun(r.slug)}
                          disabled={deletingSlug === r.slug}
                          className="ml-4 text-xs font-semibold text-red-600 hover:text-red-800 disabled:text-slate-400 disabled:cursor-not-allowed"
                        >
                          {deletingSlug === r.slug ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
