import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { applicationsApi, codecommitApi, type CodeCommitRepo } from '../api/client';
import type { AppUseCase } from '../types';
import LoadingSpinner from './LoadingSpinner';

type DeploySource = 's3' | 'codecommit';

export default function AppDeployCreate() {
  const { useCaseId } = useParams<{ useCaseId: string }>();
  const navigate = useNavigate();
  const [useCase, setUseCase] = useState<AppUseCase | null>(null);
  const [source, setSource] = useState<DeploySource>('s3');
  const [framework, setFramework] = useState('langchain_langgraph');
  const [region, setRegion] = useState('us-east-1');
  const [deployName, setDeployName] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CodeCommit state
  const [repos, setRepos] = useState<CodeCommitRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [branch, setBranch] = useState<string>('main');

  useEffect(() => {
    fetch('/offerings.json').then(r => r.json()).then(data => {
      const uc = data.use_cases?.find((u: AppUseCase) => u.use_case_name === useCaseId);
      if (uc) {
        setUseCase(uc);
        setFramework(uc.supported_frameworks?.[0] || 'langchain_langgraph');
        setDeployName(uc.use_case_name.replace(/_/g, '-'));
      }
    }).catch(() => {});
  }, [useCaseId]);

  // Load CodeCommit repos lazily when user switches to Git tab
  useEffect(() => {
    if (source !== 'codecommit' || repos.length > 0 || reposLoading) return;
    setReposLoading(true);
    setReposError(null);
    codecommitApi.listRepositories()
      .then(all => {
        setRepos(all);
        // Auto-select repo that matches this use case, if present
        const match = all.find(r =>
          r.template_id === useCaseId ||
          r.template_id === useCaseId?.replace(/_/g, '-') ||
          r.template_id.replace(/-/g, '_') === useCaseId
        );
        if (match) {
          setSelectedRepo(match.repository_name);
          setBranch(match.default_branch || 'main');
        }
      })
      .catch(e => setReposError(e.message || 'Failed to load repositories'))
      .finally(() => setReposLoading(false));
  }, [source, useCaseId, repos.length, reposLoading]);

  const handleDeploy = async () => {
    if (!useCase || !deployName) return;
    setDeploying(true);
    setError(null);
    try {
      let result;
      if (source === 'codecommit') {
        if (!selectedRepo) {
          setError('Please select a CodeCommit repository');
          setDeploying(false);
          return;
        }
        result = await applicationsApi.deployFoundryFromGit({
          deployment_name: deployName,
          codecommit_repo: selectedRepo,
          codecommit_branch: branch || 'main',
          use_case_name: useCase.use_case_name,
          framework,
          deployment_pattern: 'agentcore',
          aws_region: region,
        });
      } else {
        result = await applicationsApi.deployFoundry({
          deployment_name: deployName,
          use_case_name: useCase.use_case_name,
          framework,
          deployment_pattern: 'agentcore',
          aws_region: region,
        });
      }
      navigate(`/deployments/${result.deployment_id}`);
    } catch (e: any) {
      setError(e.message || 'Deployment failed');
      setDeploying(false);
    }
  };

  if (!useCase) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;

  const selectedRepoObj = repos.find(r => r.repository_name === selectedRepo);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      {/* Ombre gradient background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-3xl mx-auto px-6 py-10">
      <Link to="/applications/fsi-foundry" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to FSI Foundry</Link>
      <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3 mb-2">Deploy Application</h1>
      <p className="text-slate-500 mb-8">Configure and deploy <span className="font-semibold text-slate-700">{useCase.name}</span> via CI/CD pipeline.</p>

      <div className="card mb-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1.5">{useCase.name}</h2>
        <p className="text-sm text-slate-500 mb-3 leading-relaxed">{useCase.description}</p>
        <div className="flex flex-wrap gap-1.5">
          {useCase.agents?.map(a => (
            <span key={a.id} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg font-medium">{a.name}</span>
          ))}
        </div>
      </div>

      {/* Deployment Source Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setSource('s3')}
          className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
            source === 's3'
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <div className="font-semibold mb-0.5">Quick Deploy</div>
          <div className="text-xs text-slate-500">Package from catalog (S3)</div>
        </button>
        <button
          type="button"
          onClick={() => setSource('codecommit')}
          className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
            source === 'codecommit'
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <div className="font-semibold mb-0.5">Deploy from Git</div>
          <div className="text-xs text-slate-500">Clone from CodeCommit (customizable)</div>
        </button>
      </div>

      {error && (
        <div className="card bg-red-50/80 border-red-200/60 mb-6">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="card space-y-6">
        {source === 'codecommit' && (
          <div>
            <label className="label">CodeCommit Repository</label>
            {reposLoading ? (
              <div className="text-sm text-slate-500 flex items-center gap-2"><LoadingSpinner size="sm" /> Loading repositories...</div>
            ) : reposError ? (
              <div className="text-sm text-red-600">{reposError}</div>
            ) : repos.length === 0 ? (
              <div className="text-sm text-slate-500">
                No pre-seeded repositories found. Run <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">./seed-codecommit.sh init</code> from <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">platform/control_plane/infrastructure/scripts/</code>.
              </div>
            ) : (
              <>
                <select value={selectedRepo} onChange={e => {
                  setSelectedRepo(e.target.value);
                  const r = repos.find(x => x.repository_name === e.target.value);
                  if (r) setBranch(r.default_branch || 'main');
                }} className="input-field">
                  <option value="">-- Select repository --</option>
                  {repos.map(r => (
                    <option key={r.repository_name} value={r.repository_name}>
                      {r.repository_name} ({r.source})
                    </option>
                  ))}
                </select>
                {selectedRepoObj && (
                  <div className="mt-2 text-xs text-slate-500">
                    <div className="font-mono break-all">{selectedRepoObj.clone_url_http}</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {source === 'codecommit' && selectedRepo && (
          <div>
            <label className="label">Branch</label>
            <input type="text" value={branch} onChange={e => setBranch(e.target.value)}
              className="input-field" placeholder="main" />
          </div>
        )}

        <div>
          <label className="label">Deployment Name</label>
          <input type="text" value={deployName} onChange={e => setDeployName(e.target.value)}
            className="input-field" placeholder="my-deployment" />
        </div>

        <div>
          <label className="label">Framework</label>
          <select value={framework} onChange={e => setFramework(e.target.value)} className="input-field">
            {useCase.supported_frameworks?.map(fw => (
              <option key={fw} value={fw}>{fw === 'langchain_langgraph' ? 'LangChain + LangGraph' : 'Strands Agents SDK'}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Deployment Pattern</label>
          <div className="px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-sm text-slate-700 font-medium">
            Amazon Bedrock AgentCore
          </div>
        </div>

        <div>
          <label className="label">AWS Region</label>
          <select value={region} onChange={e => setRegion(e.target.value)} className="input-field">
            <option value="us-east-1">US East (N. Virginia)</option>
            <option value="us-east-2">US East (Ohio)</option>
            <option value="us-west-2">US West (Oregon)</option>
          </select>
        </div>

        <button
          onClick={handleDeploy}
          disabled={deploying || !deployName || (source === 'codecommit' && !selectedRepo)}
          className="w-full btn-primary py-3.5 text-base disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {deploying ? <><LoadingSpinner size="sm" /> Starting pipeline...</> : (
            <>
              {source === 'codecommit' ? 'Deploy from Git' : 'Deploy via CI/CD Pipeline'}
              <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </>
          )}
        </button>
      </div>
      </div>
    </div>
  );
}
