import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { deploymentsApi } from '../api/client';
import type { Deployment } from '../types';
import StatusBadge from './StatusBadge';
import LoadingSpinner from './LoadingSpinner';

export default function DeploymentList() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'deployment_name' | 'status' | 'aws_region' | 'created_at'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: typeof sortKey }) => (
    <svg className={`w-3.5 h-3.5 inline ml-1 ${sortKey === col ? 'text-blue-500' : 'text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      {sortKey === col && sortDir === 'desc'
        ? <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        : <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />}
    </svg>
  );

  const REFIMPL_IDS = ['shopping-concierge-agent', 'market-surveillance', 'trade-surveillance', 'intelligent-document-processing'];
  const getDeploymentType = (templateId: string): 'template' | 'foundry' | 'refimpl' => {
    if (templateId.startsWith('foundry-')) return 'foundry';
    if (templateId.startsWith('refimpl-') || REFIMPL_IDS.includes(templateId)) return 'refimpl';
    return 'template';
  };

  const typeConfig = {
    template: { label: 'Template', color: 'bg-blue-500', textColor: 'text-blue-700', bgColor: 'bg-blue-50' },
    foundry:  { label: 'Foundry', color: 'bg-violet-500', textColor: 'text-violet-700', bgColor: 'bg-violet-50' },
    refimpl:  { label: 'Ref. Impl.', color: 'bg-amber-500', textColor: 'text-amber-700', bgColor: 'bg-amber-50' },
  };

  const fetchDeployments = async () => {
    setLoading(true);
    try {
      const data = await deploymentsApi.list(statusFilter || undefined);
      setDeployments(data);
      setError(null);
    } catch (e: any) {
      setError('Failed to load deployments. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDeployments(); }, [statusFilter]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      {/* Ombre gradient background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10 animate-fade-in">
          <h1 className="text-4xl font-semibold text-slate-900 tracking-tight mb-3">Deployments</h1>
          <p className="text-lg text-slate-500">Track and manage your deployed agent applications</p>
        </div>

        {/* App Deployments */}
        {(() => {
          const appDeployments = JSON.parse(localStorage.getItem('app_deployments') || '[]');
          if (appDeployments.length === 0) return null;
          return (
            <div className="card mb-8 animate-fade-in stagger-1">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Application Deployments</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Application</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Framework</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Region</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Status</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appDeployments.map((d: any) => (
                      <tr key={d.deployment_id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-900">{d.display_name || d.use_case_name}</td>
                        <td className="py-3 px-4 text-slate-600">{d.framework === 'langchain_langgraph' ? 'LangGraph' : 'Strands'}</td>
                        <td className="py-3 px-4 text-slate-600">{d.aws_region}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${
                            d.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                            d.status === 'failed' ? 'bg-red-50 text-red-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              d.status === 'active' ? 'bg-emerald-500' :
                              d.status === 'failed' ? 'bg-red-500' :
                              'bg-amber-500'
                            }`} />
                            {d.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{new Date(d.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Context banner */}
        <div className="card bg-blue-50/50 border-blue-200/60 mb-8 animate-fade-in stagger-1">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <p className="text-sm text-blue-900 font-semibold">How deployments work</p>
              <p className="text-sm text-blue-700/80 mt-1">Deployments are triggered from three sources, each with a different pipeline:</p>
              <div className="mt-2 space-y-1.5 text-sm text-blue-700/80">
                <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-sm bg-purple-500 mt-1.5 flex-shrink-0"></span><span><strong>Foundrys</strong> — Full CI/CD: provisions infra (ECR, IAM, S3) → builds Docker image → creates AgentCore Runtime. ~3 min.</span></div>
                <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-sm bg-blue-500 mt-1.5 flex-shrink-0"></span><span><strong>Templates</strong> — Packages scaffold to S3. You run the included IaC (Terraform/CDK/CFN) to provision resources.</span></div>
                <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-sm bg-amber-500 mt-1.5 flex-shrink-0"></span><span><strong>Ref. Implementations</strong> — Full-stack apps with their own deploy pipelines. Coming soon.</span></div>
              </div>
              <a href="/docs/deployments" className="text-xs text-blue-600 font-medium underline mt-2 inline-block">Learn more in Docs →</a>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-10 animate-fade-in stagger-1">
          {([
            { key: 'deployed', label: 'Deployed', match: ['deployed', 'delivered'], bg: 'bg-emerald-50', border: 'border-emerald-200/60', text: 'text-emerald-700' },
            { key: 'deploying', label: 'In Progress', match: ['deploying', 'validating', 'packaging', 'verifying', 'pending'], bg: 'bg-blue-50', border: 'border-blue-200/60', text: 'text-blue-700' },
            { key: 'failed', label: 'Failed', match: ['failed'], bg: 'bg-red-50', border: 'border-red-200/60', text: 'text-red-700' },
            { key: 'destroyed', label: 'Destroyed', match: ['destroyed', 'destroying'], bg: 'bg-slate-50', border: 'border-slate-200/60', text: 'text-slate-500' },
          ] as const).map((s) => {
            const count = deployments.filter(d => (s.match as readonly string[]).includes(d.status)).length;
            return (
              <div key={s.key} className={`card ${s.bg} ${s.border}`}>
                <div className={`text-3xl font-semibold ${s.text}`}>{count}</div>
                <div className="text-sm text-slate-500 mt-1">{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* Filters + Action */}
        <div className="flex items-center justify-between mb-8 mt-2 animate-fade-in stagger-2">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Filter by name..."
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="input-field w-44 text-sm"
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-40 text-sm">
              <option value="">All Statuses</option>
              {['pending','validating','packaging','deploying','verifying','deployed','failed','destroyed'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-field w-40 text-sm">
              <option value="">All Types</option>
              <option value="template">Template</option>
              <option value="foundry">Foundry</option>
              <option value="refimpl">Ref. Impl.</option>
            </select>
            <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className="input-field w-40 text-sm">
              <option value="">All Regions</option>
              {[...new Set(deployments.map(d => d.aws_region))].sort().map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button onClick={() => navigate('/deployments/create')} className="btn-primary">
            Create Deployment
            <svg className="w-4 h-4 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>

        {error && (
          <div className="card bg-red-50 border-red-200 mb-6">
            <p className="text-red-700">{error}</p>
            <button onClick={fetchDeployments} className="mt-2 text-red-600 hover:text-red-700 underline font-medium text-sm">
              Try again
            </button>
          </div>
        )}

        {/* Table */}
        {deployments.length === 0 ? (
          <div className="card text-center py-20 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-slate-700 mb-2">No deployments yet</p>
            <p className="text-sm text-slate-500 mb-6">Create your first deployment to get started</p>
            <button onClick={() => navigate('/deployments/create')} className="btn-primary">
              Create your first deployment
            </button>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden animate-fade-in stagger-3">
            {/* Type legend */}
            <div className="px-5 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center gap-5 text-xs text-slate-500">
              {Object.entries(typeConfig).map(([key, cfg]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded ${cfg.color}`}></span>
                  {cfg.label}
                </span>
              ))}
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th onClick={() => handleSort('deployment_name')} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none">Name<SortIcon col="deployment_name" /></th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <th onClick={() => handleSort('status')} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none">Status<SortIcon col="status" /></th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">S3 Bucket</th>
                  <th onClick={() => handleSort('aws_region')} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none">Region<SortIcon col="aws_region" /></th>
                  <th onClick={() => handleSort('created_at')} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none">Created<SortIcon col="created_at" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {deployments
                  .filter(d => !typeFilter || getDeploymentType(d.template_id) === typeFilter)
                  .filter(d => !nameFilter || d.deployment_name.toLowerCase().includes(nameFilter.toLowerCase()))
                  .filter(d => !regionFilter || d.aws_region === regionFilter)
                  .sort((a, b) => {
                    const aVal = a[sortKey] ?? '';
                    const bVal = b[sortKey] ?? '';
                    const cmp = String(aVal).localeCompare(String(bVal));
                    return sortDir === 'asc' ? cmp : -cmp;
                  })
                  .map((d) => {
                    const dtype = getDeploymentType(d.template_id);
                    const cfg = typeConfig[dtype];
                    return (
                      <tr key={d.deployment_id} onClick={() => navigate(`/deployments/${d.deployment_id}`)}
                        className="hover:bg-blue-50/40 cursor-pointer transition-colors duration-150">
                        <td className="px-5 py-3 font-medium text-slate-900 text-sm">{d.deployment_name}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.bgColor} ${cfg.textColor}`}>
                            <span className={`w-2 h-2 rounded ${cfg.color}`}></span>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                        <td className="px-5 py-3 text-xs text-slate-500 font-mono">{d.s3_bucket || "—"}</td>
                        <td className="px-5 py-3 text-xs text-slate-500">{d.aws_region}</td>
                        <td className="px-5 py-3 text-xs text-slate-500">{new Date(d.created_at).toLocaleString(undefined, { timeZoneName: "short" })}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
