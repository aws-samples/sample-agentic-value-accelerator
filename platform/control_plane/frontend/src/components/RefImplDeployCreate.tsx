import { useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { deploymentsApi } from '../api/client';
import type { RefImplConfig } from './ReferenceImplementations';
import LoadingSpinner from './LoadingSpinner';

export default function RefImplDeployCreate() {
  const { implId } = useParams<{ implId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const impl = (location.state as { impl?: RefImplConfig } | null)?.impl;

  const [framework, setFramework] = useState(impl?.frameworks?.[0]?.id || '');
  const [iacType] = useState(impl?.deployment_patterns?.[0]?.id || '');
  const [region, setRegion] = useState('us-east-1');
  const [deployName, setDeployName] = useState(implId?.replace(/_/g, '-') || '');
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parameters, setParameters] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const p of impl?.parameters || []) {
      if (p.default !== undefined && p.default !== '') {
        defaults[p.name] = String(p.default);
      }
    }
    return defaults;
  });

  if (!impl) {
    // If navigated directly without state, redirect back
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="card text-center py-12 max-w-md mx-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Implementation not found</h2>
          <p className="text-slate-500 mb-6">Please select an implementation from the catalog.</p>
          <Link to="/applications/reference-implementations" className="btn-primary">Browse Implementations</Link>
        </div>
      </div>
    );
  }

  const handleDeploy = async () => {
    if (!deployName) return;
    setDeploying(true);
    setError(null);
    try {
      const result = await deploymentsApi.create({
        deployment_name: deployName,
        template_id: impl.id,
        iac_type: iacType,
        framework_id: framework,
        aws_region: region,
        parameters: {
          ...parameters,
          project_name: deployName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          aws_region: region,
        },
      });
      navigate(`/deployments/${result.deployment_id}`);
    } catch (e: any) {
      setError(e.message || 'Deployment failed');
      setDeploying(false);
    }
  };

  const extraParams = (impl.parameters || []).filter(
    p => !['project_name', 'aws_region', 'environment', 'tags', 'existing_vpc_id'].includes(p.name)
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      {/* Ombre gradient background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-3xl mx-auto px-6 py-10">
      <Link to="/applications/reference-implementations" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">&larr; Back to Reference Implementations</Link>
      <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3 mb-2">Deploy Reference Implementation</h1>
      <p className="text-slate-500 mb-8">Configure and deploy <span className="font-semibold text-slate-700">{impl.name}</span> via CI/CD pipeline.</p>

      <div className="card mb-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1.5">{impl.name}</h2>
        <p className="text-sm text-slate-500 mb-3 leading-relaxed">{impl.description}</p>
        <div className="flex flex-wrap gap-1.5">
          {impl.tags.map(tag => (
            <span key={tag} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg font-medium">{tag}</span>
          ))}
        </div>
      </div>

      {error && (
        <div className="card bg-red-50/80 border-red-200/60 mb-6">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="card space-y-6">
        <div>
          <label className="label">Deployment Name</label>
          <input type="text" value={deployName} onChange={e => setDeployName(e.target.value)}
            className="input-field" placeholder="my-deployment" />
        </div>

        {impl.frameworks.length > 1 && (
          <div>
            <label className="label">Framework</label>
            <select value={framework} onChange={e => setFramework(e.target.value)} className="input-field">
              {impl.frameworks.map(fw => (
                <option key={fw.id} value={fw.id}>{fw.name}</option>
              ))}
            </select>
          </div>
        )}

        {impl.deployment_patterns.length === 1 && (
          <div>
            <label className="label">Deployment Pattern</label>
            <div className="px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-sm text-slate-700 font-medium">
              {impl.deployment_patterns[0].name}
              {impl.deployment_patterns[0].description ? ` — ${impl.deployment_patterns[0].description}` : ''}
            </div>
          </div>
        )}

        {impl.deployment_patterns.length > 1 && (
          <div>
            <label className="label">Deployment Pattern</label>
            <select value={iacType} onChange={() => {}} className="input-field">
              {impl.deployment_patterns.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.description ? ` — ${p.description}` : ''}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">AWS Region</label>
          <select value={region} onChange={e => setRegion(e.target.value)} className="input-field">
            <option value="us-east-1">US East (N. Virginia)</option>
            <option value="us-east-2">US East (Ohio)</option>
            <option value="us-west-2">US West (Oregon)</option>
          </select>
        </div>

        {extraParams.map(p => (
          <div key={p.name}>
            <label className="label">
              {p.description || p.name} {p.required && '*'}
              {p.help_url && (
                <a href={p.help_url} target="_blank" rel="noopener noreferrer"
                  className="ml-2 text-blue-600 hover:text-blue-800 underline font-medium text-xs">
                  Get one here &rarr;
                </a>
              )}
            </label>
            <input
              className="input-field"
              type={p.input_type || 'text'}
              placeholder={String(p.default ?? '')}
              value={p.input_type === 'password' ? (parameters[p.name] ?? '') : (parameters[p.name] ?? p.default ?? '')}
              autoComplete={p.input_type === 'password' ? 'new-password' : undefined}
              onChange={e => setParameters({ ...parameters, [p.name]: e.target.value })}
            />
          </div>
        ))}

        <button onClick={handleDeploy} disabled={deploying || !deployName}
          className="w-full btn-primary py-3.5 text-base disabled:opacity-50 flex items-center justify-center gap-2">
          {deploying ? <><LoadingSpinner size="sm" /> Starting pipeline...</> : (
            <>
              Deploy via CI/CD Pipeline
              <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </>
          )}
        </button>
      </div>
      </div>
    </div>
  );
}
