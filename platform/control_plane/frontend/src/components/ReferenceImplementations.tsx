import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deploymentsApi } from '../api/client';
import type { Deployment } from '../types';
import { useUser } from '../contexts/UserContext';

export interface RefImplConfig {
  id: string;
  name: string;
  domain: string;
  description: string;
  status: string;
  color: string;
  features: string[];
  agents: string[];
  frameworks: { id: string; name: string }[];
  deployment_patterns: { id: string; name: string; description: string }[];
  parameters: { name: string; type: string; description: string; required: boolean; default?: string; input_type?: string; help_url?: string }[];
  tags: string[];
}

const IMPLEMENTATIONS: RefImplConfig[] = [
  {
    id: 'market-surveillance',
    name: 'Market Surveillance',
    domain: 'Capital Markets',
    description: 'AI-powered surveillance system for detecting and investigating suspicious trading patterns in Fixed Income markets using multi-agent orchestration on AWS Bedrock AgentCore.',
    status: 'Available',
    color: 'violet',
    features: ['Trade pattern detection', '29 decision tree rules', 'Audit-ready reports', 'Configuration-driven workflows', 'Cognito auth'],
    agents: ['Coordinator', 'Data Discovery', 'Enrichment', 'Rule Evaluation'],
    frameworks: [{ id: 'strands', name: 'Strands Agents SDK' }],
    deployment_patterns: [{ id: 'terraform', name: 'Terraform', description: 'Multi-module Terraform deployment (Foundations + App Infrastructure)' }],
    parameters: [],
    tags: ['surveillance', 'capital-markets', 'compliance', 'fixed-income', 'agentcore'],
  },
  {
    id: 'shopping-concierge-agent',
    name: 'Shopping Concierge Agent',
    domain: 'Agentic Payments',
    description: 'AI-powered concierge with shopping assistance, product search, cart management, and mock payment support. Built with Strands SDK, MCP tools, and AWS Bedrock AgentCore.',
    status: 'Available',
    color: 'blue',
    features: ['Product search & recommendations', 'Cart & payment', 'Conversation memory', 'Real-time streaming', 'Cognito auth'],
    agents: ['Shopping Assistant', 'Payment Agent'],
    frameworks: [{ id: 'strands', name: 'Strands Agents SDK' }],
    deployment_patterns: [{ id: 'cdk', name: 'AWS CDK', description: 'Multi-stack CDK deployment (Amplify + MCP Servers + Agent + Frontend)' }],
    parameters: [
      { name: 'serp_api_key', type: 'string', description: 'SERP API key for product search (optional)', required: false, default: '', input_type: 'password', help_url: 'https://serpapi.com/users/sign_up' },
    ],
    tags: ['shopping', 'payments', 'concierge', 'strands', 'mcp', 'amplify', 'agentcore'],
  },
];

export default function ReferenceImplementations() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [search, setSearch] = useState('');
  const [deployments, setDeployments] = useState<Record<string, Deployment>>({});

  useEffect(() => {
    deploymentsApi.list().then(deps => {
      const map: Record<string, Deployment> = {};
      for (const d of deps) {
        if (d.status === 'deployed' && IMPLEMENTATIONS.some(impl => impl.id === d.template_id)) {
          if (!map[d.template_id] || d.updated_at > map[d.template_id].updated_at) map[d.template_id] = d;
        }
      }
      setDeployments(map);
    }).catch(() => {});
  }, []);

  const filtered = IMPLEMENTATIONS.filter(impl =>
    !search || impl.name.toLowerCase().includes(search.toLowerCase())
    || impl.description.toLowerCase().includes(search.toLowerCase())
    || impl.domain.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      {/* Ombre gradient background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-10">
      <div className="mb-8 animate-fade-in">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">&larr; Back to Home</Link>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">Reference Implementations</h1>
        <p className="text-slate-500 mt-2 max-w-2xl">End-to-end full-stack solutions for specific FSI use cases. Complete architectures with infrastructure, backend, and frontend.</p>
      </div>

      {/* How it works */}
      <div className="card bg-violet-50/50 border-violet-200/60 mb-6 animate-fade-in stagger-1">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m7.938-4.014A9.956 9.956 0 0112 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10c0-1.628-.388-3.165-1.076-4.524" /></svg>
          </div>
          <div>
            <p className="text-sm text-violet-900 font-semibold">How Reference Implementation deployment works</p>
            <p className="text-sm text-violet-700/80 mt-1">Reference implementations are <strong>complete full-stack applications</strong> with frontend UI, backend APIs, and infrastructure — each tailored to a specific FSI use case. They are deployed via CI/CD pipeline.</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-8 animate-fade-in stagger-1">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input type="text" placeholder="Search reference implementations..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full py-3 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm outline-none transition-all duration-150 focus:border-blue-400 pr-4"
          style={{ paddingLeft: '2.75rem' }} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in stagger-2">
        {filtered.map(impl => (
          <div key={impl.id} className="card hover:border-blue-200 transition-all flex flex-col group">
            <div className="flex items-center justify-between mb-4">
              <span className={`text-xs font-semibold px-3 py-1 rounded-lg ${
                impl.color === 'violet' ? 'bg-violet-50 text-violet-700 border border-violet-200' :
                impl.color === 'blue' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                'bg-teal-50 text-teal-700 border border-teal-200'
              }`}>
                {impl.domain}
              </span>
              <span className={`text-xs font-semibold px-3 py-1 rounded-lg ${
                impl.status === 'Available' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                'bg-slate-50 text-slate-500 border border-slate-200'
              }`}>{impl.status}</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-blue-700 transition-colors">{impl.name}</h3>
            <p className="text-sm text-slate-500 mb-5 flex-1 leading-relaxed">{impl.description}</p>

            <div className="mb-4">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Agents</h4>
              <div className="flex flex-wrap gap-1.5">
                {impl.agents.map(a => (
                  <span key={a} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg font-medium">{a}</span>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Features</h4>
              <div className="flex flex-wrap gap-1.5">
                {impl.features.map(f => (
                  <span key={f} className="text-xs px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg border border-slate-200">{f}</span>
                ))}
              </div>
            </div>

            {(() => {
              const dep = deployments[impl.id];
              if (!dep && impl.status === 'Available') {
                return (
                  <div className="flex gap-2.5 pt-4 border-t border-slate-100">
                    <button onClick={() => navigate('/docs/ref-impl')} className="btn-secondary text-xs flex-1 py-2">View Documentation</button>
                    <button
                      onClick={() => navigate(`/applications/reference-implementations/deploy/${impl.id}`, { state: { impl } })}
                      disabled={!user?.can_deploy}
                      title={!user?.can_deploy ? 'You do not have permission to deploy' : 'Deploy this reference implementation'}
                      className="text-xs flex-1 py-2 px-4 rounded-lg bg-blue-600 text-white font-medium text-center hover:bg-blue-700 transition-colors disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:hover:bg-slate-100">
                      Deploy
                    </button>
                  </div>
                );
              }
              if (!dep) {
                return (
                  <div className="flex gap-2.5 pt-4 border-t border-slate-100">
                    <button onClick={() => navigate('/docs/ref-impl')} className="btn-secondary text-xs flex-1 py-2">View Documentation</button>
                    <button disabled className="text-xs flex-1 py-2 px-4 rounded-lg bg-slate-100 text-slate-400 font-medium cursor-not-allowed">Coming Soon</button>
                  </div>
                );
              }
              const frontendUrl = dep.outputs?.ui_url || dep.outputs?.app_url || dep.outputs?.AmplifyUrl;
              const diff = Date.now() - new Date(dep.updated_at).getTime();
              const mins = Math.floor(diff / 60000);
              const deployedAgo = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
              return (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                    <span className="text-xs text-emerald-700 font-medium">Deployed {deployedAgo}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => navigate(`/deployments/${dep.deployment_id}`)} title="View latest successful deployment details"
                      className={`btn-secondary text-[11px] py-2 ${frontendUrl ? '' : 'col-span-2'}`}>
                      View Deployment
                    </button>
                    {frontendUrl ? (
                      <>
                        <button onClick={() => window.open(frontendUrl, '_blank')}
                          className="text-[11px] py-2 rounded-lg font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors inline-flex items-center justify-center gap-1.5">
                          Open App
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </button>
                        <button onClick={() => navigate('/docs/ref-impl')} className="btn-secondary text-[11px] py-2">View Documentation</button>
                        <button
                          onClick={() => navigate(`/applications/reference-implementations/deploy/${impl.id}`, { state: { impl } })}
                          disabled={!user?.can_deploy}
                          title={!user?.can_deploy ? 'You do not have permission to deploy' : 'Redeploy this reference implementation'}
                          className="btn-primary text-[11px] py-2">Redeploy</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => navigate('/docs/ref-impl')} className="btn-secondary text-[11px] py-2">View Documentation</button>
                        <button
                          onClick={() => navigate(`/applications/reference-implementations/deploy/${impl.id}`, { state: { impl } })}
                          disabled={!user?.can_deploy}
                          title={!user?.can_deploy ? 'You do not have permission to deploy' : 'Redeploy this reference implementation'}
                          className="btn-primary text-[11px] py-2">Redeploy</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-slate-400">No implementations matching "{search}"</div>
      )}
      </div>
    </div>
  );
}
