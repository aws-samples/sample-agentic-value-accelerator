import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deploymentsApi, frontierAgentsApi, type FrontierAgentCatalogEntry, type FrontierAgentParameter } from '../api/client';
import type { Deployment } from '../types';
import { useUser } from '../contexts/UserContext';
import LoadingSpinner from './LoadingSpinner';

const AGENT_ID = 'aws-devops';
const TEMPLATE_ID = `frontier-agents-${AGENT_ID}`;

type IacType = 'terraform' | 'cdk' | 'cloudformation';

const IAC_META: { id: IacType; label: string; description: string }[] = [
  { id: 'terraform', label: 'Terraform', description: 'HashiCorp Terraform with the AWSCC provider.' },
  { id: 'cdk', label: 'AWS CDK', description: 'TypeScript CDK constructs for AWS DevOps Agent.' },
  { id: 'cloudformation', label: 'CloudFormation', description: 'Native AWS CloudFormation YAML.' },
];

const REGIONS: { value: string; label: string }[] = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
];

export default function AwsDevOpsAgent() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [agent, setAgent] = useState<FrontierAgentCatalogEntry | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [iacType, setIacType] = useState<IacType>('terraform');
  const [region, setRegion] = useState('us-east-1');
  const [deployName, setDeployName] = useState('aws-devops-agent');
  const [params, setParams] = useState<Record<string, string>>({});

  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const [latestDeployment, setLatestDeployment] = useState<Deployment | null>(null);

  useEffect(() => {
    deploymentsApi
      .list()
      .then(deps => {
        const matches = deps.filter(d => d.template_id === TEMPLATE_ID && d.status === 'deployed');
        matches.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        setLatestDeployment(matches[0] || null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    frontierAgentsApi
      .getAgent(AGENT_ID)
      .then(a => {
        setAgent(a);
        const defaults: Record<string, string> = {};
        for (const p of [...a.parameters, ...a.advanced_parameters]) {
          if (p.default !== undefined) defaults[p.name] = String(p.default);
        }
        setParams(defaults);
        if (!a.supported_iac_types.includes(iacType) && a.supported_iac_types.length) {
          setIacType(a.supported_iac_types[0] as IacType);
        }
      })
      .catch(e => setLoadError(e?.message || 'Failed to load agent catalog'))
      .finally(() => setLoadingAgent(false));
  }, []);

  const supported = agent?.supported_iac_types || [];
  const comingSoon = agent?.coming_soon_iac_types || [];
  const canDeploy = !!user?.can_deploy && !!deployName && !!agent && supported.includes(iacType);

  const handleDeploy = async () => {
    if (!agent || !canDeploy) return;
    setDeploying(true);
    setDeployError(null);
    try {
      // Strip out any empty optional values so Terraform uses its defaults.
      const cleanedParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        if (v !== '' && v !== undefined) cleanedParams[k] = v;
      }
      const result = await frontierAgentsApi.deploy({
        deployment_name: deployName,
        agent_id: AGENT_ID,
        iac_type: iacType,
        aws_region: region,
        parameters: cleanedParams,
      });
      navigate(`/deployments/${result.deployment_id}`);
    } catch (e: any) {
      setDeployError(e?.message || 'Deployment failed');
      setDeploying(false);
    }
  };

  if (loadingAgent) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (loadError || !agent) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="card text-center py-12 max-w-md mx-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Couldn't load AWS DevOps Agent</h2>
          <p className="text-slate-500 mb-6">{loadError}</p>
          <Link to="/aaas/aws-agents" className="btn-primary">Back to AWS Frontier Agents</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(254,215,170,0.6) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(219,234,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(221,214,254,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-3xl mx-auto px-6 py-10">
        <Link to="/aaas/aws-agents" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Back to AWS Frontier Agents
        </Link>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3 mb-2">Deploy AWS DevOps Agent</h1>
        <p className="text-slate-500 mb-8">Configure and deploy the AWS DevOps Agent into this account via the control plane's CI/CD pipeline.</p>

        <div className="card mb-6">
          <div className="flex items-start justify-between mb-3 gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 mb-1.5">{agent.name}</h2>
              <p className="text-sm text-slate-500 leading-relaxed">{agent.description}</p>
            </div>
            <img src="/logos/aws-devops-agent.svg" alt="" className="w-12 h-12 rounded-lg shadow-sm ring-1 ring-slate-200/70 flex-shrink-0" />
          </div>
          <span className="inline-flex text-xs font-semibold px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
            {agent.status}
          </span>
        </div>

        {deployError && (
          <div className="card bg-red-50/80 border-red-200/60 mb-6">
            <p className="text-red-700 text-sm">{deployError}</p>
          </div>
        )}

        <div className="card space-y-6">
          <div>
            <label className="label">Deployment Name</label>
            <input
              type="text"
              value={deployName}
              onChange={e => setDeployName(e.target.value)}
              className="input-field"
              placeholder="aws-devops-agent"
            />
          </div>

          <div>
            <label className="label">Deployment Method</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {IAC_META.map(m => {
                const isSupported = supported.includes(m.id);
                const isComing = comingSoon.includes(m.id);
                const selected = iacType === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!isSupported}
                    onClick={() => isSupported && setIacType(m.id)}
                    className={`text-left rounded-xl border p-3 transition-all ${
                      selected && isSupported
                        ? 'border-blue-500 bg-blue-50/70'
                        : isSupported
                        ? 'border-slate-200 hover:border-slate-300 bg-white'
                        : 'border-slate-200/70 bg-slate-50 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-900">{m.label}</span>
                      {isComing && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">
                          Coming Soon
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 leading-snug">{m.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label">AWS Region</label>
            <select value={region} onChange={e => setRegion(e.target.value)} className="input-field">
              {REGIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {agent.parameters.map(p => (
            <ParamField key={p.name} param={p} value={params[p.name] ?? ''} onChange={v => setParams({ ...params, [p.name]: v })} />
          ))}

          {/*
            Cross-account monitoring (Part 2) is disabled until the CI/CD
            pipeline can assume a role in the secondary account. Keeping the
            collapsible Advanced section commented out — not deleted — so it's
            easy to re-enable once the pipeline gains cross-account plumbing.
            The matching advanced_parameters entries in frontier_agents.json
            are also stashed under $disabled_advanced_parameters.

            {agent.advanced_parameters.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors"
                >
                  <svg className={`w-4 h-4 transition-transform ${advancedOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Advanced: cross-account monitoring
                </button>
                {advancedOpen && (
                  <div className="mt-4 space-y-4">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Part 2 of the deploy. Leave empty for now to provision only the primary-account resources. Set these after your first apply, with a follow-up deploy, to add a source association from a secondary account.
                    </p>
                    {agent.advanced_parameters.map(p => (
                      <ParamField key={p.name} param={p} value={params[p.name] ?? ''} onChange={v => setParams({ ...params, [p.name]: v })} />
                    ))}
                  </div>
                )}
              </div>
            )}
          */}

          {latestDeployment && (() => {
            const operatorUrl = latestDeployment.outputs?.operator_app_url || latestDeployment.outputs?.operatorappurl || latestDeployment.outputs?.OperatorAppUrl;
            return (
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-emerald-700">
                    A deployment of this agent is already live.
                  </span>
                </div>
                <div className={`grid gap-2 ${operatorUrl ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <button
                    type="button"
                    onClick={() => navigate(`/deployments/${latestDeployment.deployment_id}`)}
                    className="btn-secondary text-sm py-2"
                  >
                    View Deployment
                  </button>
                  {operatorUrl && (
                    <button
                      type="button"
                      onClick={() => window.open(operatorUrl, '_blank')}
                      className="text-sm py-2 rounded-lg font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors inline-flex items-center justify-center gap-1.5"
                    >
                      Open Operator App
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          <button
            onClick={handleDeploy}
            disabled={!canDeploy || deploying}
            title={!user?.can_deploy ? 'You do not have permission to deploy' : ''}
            className="w-full btn-primary py-3.5 text-base disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {deploying ? (
              <><LoadingSpinner size="sm" /> Starting pipeline...</>
            ) : (
              <>
                {latestDeployment ? 'Redeploy via CI/CD Pipeline' : 'Deploy via CI/CD Pipeline'}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ParamField({ param, value, onChange }: { param: FrontierAgentParameter; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">
        {param.label} {param.required && <span className="text-rose-500">*</span>}
      </label>
      <input
        type="text"
        className="input-field"
        placeholder={param.default || ''}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {param.description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{param.description}</p>}
    </div>
  );
}
