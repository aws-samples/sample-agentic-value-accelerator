import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AppUseCase, Deployment } from '../types';
import UseCaseDetailModal from './UseCaseDetailModal';
import { deploymentsApi } from '../api/client';
import { useUser } from '../contexts/UserContext';

const CATEGORIES: Record<string, { label: string; color: string; bg: string; iconBg: string }> = {
  B: { label: 'Banking', color: 'text-blue-700', bg: 'bg-blue-50', iconBg: 'from-blue-500 to-blue-600' },
  R: { label: 'Risk & Compliance', color: 'text-red-700', bg: 'bg-red-50', iconBg: 'from-red-500 to-red-600' },
  C: { label: 'Capital Markets', color: 'text-violet-700', bg: 'bg-violet-50', iconBg: 'from-violet-500 to-violet-600' },
  I: { label: 'Insurance', color: 'text-amber-700', bg: 'bg-amber-50', iconBg: 'from-amber-500 to-amber-600' },
  O: { label: 'Operations', color: 'text-teal-700', bg: 'bg-teal-50', iconBg: 'from-teal-500 to-teal-600' },
  M: { label: 'Modernization', color: 'text-slate-700', bg: 'bg-slate-100', iconBg: 'from-slate-500 to-slate-600' },
};

export default function FSIFoundryCatalog() {
  const [useCases, setUseCases] = useState<AppUseCase[]>([]);
  const [deployments, setDeployments] = useState<Record<string, Deployment[]>>({});
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AppUseCase | null>(null);
  const navigate = useNavigate();
  const { user } = useUser();

  useEffect(() => {
    fetch('/offerings.json').then(r => r.json()).then(d => setUseCases(d.use_cases || [])).catch(() => {});
    deploymentsApi.list().then(deps => {
      const map: Record<string, Deployment[]> = {};
      for (const d of deps) {
        if (d.status === 'deployed' && d.template_id?.startsWith('foundry-')) {
          const ucName = d.template_id.replace('foundry-', '');
          if (!map[ucName]) map[ucName] = [];
          // Keep only the latest deployment per framework
          const fwId = d.framework_id || 'unknown';
          const existing = map[ucName].findIndex(e => (e.framework_id || 'unknown') === fwId);
          if (existing >= 0) {
            if (d.updated_at > map[ucName][existing].updated_at) map[ucName][existing] = d;
          } else {
            map[ucName].push(d);
          }
        }
      }
      setDeployments(map);
    }).catch(() => {});
  }, []);

  const filtered = useCases.filter(uc => {
    const matchesFilter = filter === 'all' || uc.id[0] === filter;
    const matchesSearch = !search || uc.name.toLowerCase().includes(search.toLowerCase())
      || uc.description.toLowerCase().includes(search.toLowerCase())
      || uc.agents?.some(a => a.name.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const grouped = filtered.reduce((acc, uc) => {
    const prefix = uc.id[0];
    const cat = CATEGORIES[prefix] || { label: 'Other', color: 'text-slate-700', bg: 'bg-slate-100', iconBg: 'from-slate-500 to-slate-600' };
    (acc[prefix] = acc[prefix] || { ...cat, items: [] }).items.push(uc);
    return acc;
  }, {} as Record<string, { label: string; color: string; bg: string; iconBg: string; items: AppUseCase[] }>);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      {/* Ombre gradient background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-10">
      <div className="mb-8 animate-fade-in">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Home</Link>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">FSI Foundry</h1>
        <p className="text-slate-500 mt-2 max-w-2xl">Full-stack multi-agent POC implementations spanning banking, insurance, capital markets, and operations.</p>
      </div>

      {/* How it works */}
      <div className="card bg-blue-50/50 border-blue-200/60 mb-6 animate-fade-in stagger-1">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div>
            <p className="text-sm text-blue-900 font-semibold">How Foundry deployment works</p>
            <p className="text-sm text-blue-700/80 mt-1">Click <strong>Deploy</strong> on any use case → select framework and region → the CI/CD pipeline provisions all infrastructure, builds the backend agent runtime, deploys the frontend UI (if available), and makes both accessible end-to-end. You can test directly from the app, access the deployed frontend, or invoke via CLI. <a href="/docs/fsi-foundry" className="underline font-medium">Learn more →</a></p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6 animate-fade-in stagger-1">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input type="text" placeholder="Search use cases, agents, or descriptions..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full py-3 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm outline-none transition-all duration-150 focus:border-blue-400 pr-4"
          style={{ paddingLeft: '2.75rem' }} />
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 mb-8 animate-fade-in stagger-2">
        <button onClick={() => setFilter('all')}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700'}`}>
          All ({filtered.length})
        </button>
        {Object.entries(CATEGORIES).map(([key, { label, color }]) => {
          const count = useCases.filter(uc => uc.id[0] === key).length;
          if (!count) return null;
          return (
            <button key={key} onClick={() => setFilter(filter === key ? 'all' : key)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${filter === key ? 'bg-slate-800 text-white' : `bg-white ${color} border border-slate-200 hover:border-slate-300`}`}>
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {Object.entries(grouped).map(([key, group]) => group && (
        <div key={key} className="mb-10 animate-fade-in">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-7 h-7 rounded-lg ${group.bg} flex items-center justify-center`}>
              <span className={`text-xs font-semibold ${group.color}`}>{key}</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-800">{group.label}</h2>
            <span className="text-sm text-slate-400 font-medium">{group.items.length} use cases</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.items.map(uc => (
              <div key={uc.id} className="card hover:border-blue-200 transition-all flex flex-col group">
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-mono px-2.5 py-1 rounded-lg font-semibold ${group.bg} ${group.color}`}>{uc.id}</span>
                  <div className="flex gap-1">
                    {uc.supported_frameworks?.map(fw => (
                      <span key={fw} className="text-xs px-2 py-0.5 bg-slate-50 text-slate-500 rounded-md border border-slate-100">
                        {fw === 'langchain_langgraph' ? 'LangGraph' : fw === 'strands' ? 'Strands' : fw}
                      </span>
                    ))}
                  </div>
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-1.5 group-hover:text-blue-700 transition-colors">{uc.name}</h3>
                <p className="text-sm text-slate-500 mb-3 flex-1 leading-relaxed">{uc.description}</p>
                <div className="flex flex-wrap gap-1 mb-4">
                  {uc.agents?.map(a => (
                    <span key={a.id} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg font-medium">{a.name}</span>
                  ))}
                </div>
                {(() => {
                  const deps = deployments[uc.use_case_name];
                  if (!deps || deps.length === 0) {
                    return (
                      <div className="pt-3 border-t border-slate-100">
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => setSelected(uc)} className="btn-secondary text-xs py-2">View Details</button>
                          <button
                            onClick={() => navigate(`/applications/deploy/${uc.use_case_name}`)}
                            className="btn-primary text-xs py-2"
                            disabled={!user?.can_deploy}
                            title={!user?.can_deploy ? 'You do not have permission to deploy' : 'Deploy this use case'}
                          >
                            Deploy
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      {deps.map(dep => {
                        const fwLabel = dep.framework_id === 'langchain_langgraph' ? 'LangGraph' : dep.framework_id === 'strands' ? 'Strands' : dep.framework_id || 'Agent';
                        const fwColor = dep.framework_id === 'langchain_langgraph' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-amber-50 text-amber-700 border-amber-200';
                        const frontendUrl = dep.outputs?.ui_url || dep.outputs?.app_url || dep.outputs?.AmplifyUrl;
                        const diff = Date.now() - new Date(dep.updated_at).getTime();
                        const mins = Math.floor(diff / 60000);
                        const deployedAgo = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
                        return (
                          <div key={dep.deployment_id} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${fwColor}`}>{fwLabel}</span>
                              <span className="text-xs text-slate-400">{deployedAgo}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button onClick={() => navigate(`/deployments/${dep.deployment_id}`)}
                                className={`btn-secondary text-[11px] py-1.5 ${frontendUrl ? '' : 'col-span-2'}`}>
                                View Deployment
                              </button>
                              {frontendUrl && (
                                <button onClick={() => window.open(frontendUrl, '_blank')}
                                  className="text-[11px] py-1.5 rounded-lg font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors inline-flex items-center justify-center gap-1.5">
                                  Open App
                                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <button onClick={() => setSelected(uc)} className="btn-secondary text-[11px] py-2">View Details</button>
                        <button
                          onClick={() => navigate(`/applications/deploy/${uc.use_case_name}`)}
                          className="btn-primary text-[11px] py-2"
                          disabled={!user?.can_deploy}
                          title={!user?.can_deploy ? 'You do not have permission to deploy' : 'Deploy or redeploy this use case'}
                        >
                          {deps.length > 0 ? 'Deploy / Redeploy' : 'Deploy'}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          {search ? `No use cases matching "${search}"` : 'Loading use cases...'}
        </div>
      )}

      {selected && <UseCaseDetailModal useCase={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
