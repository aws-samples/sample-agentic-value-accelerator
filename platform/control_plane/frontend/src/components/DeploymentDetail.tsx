import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { deploymentsApi } from '../api/client';
import type { Deployment, DeploymentStatus, AppUseCase } from '../types';
import StatusBadge from './StatusBadge';
import LoadingSpinner from './LoadingSpinner';
import PipelineProgress from './PipelineProgress';
import PipelineVisualization from './PipelineVisualization';
import LogsViewer from './LogsViewer';
import TestDeploymentDrawer from './TestDeploymentDrawer';

const TERMINAL_STATUSES: DeploymentStatus[] = ['deployed', 'destroyed', 'failed', 'rolled_back', 'delivered'];

export default function DeploymentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [logsOpen, setLogsOpen] = useState(false);
  const [destroying, setDestroying] = useState(false);
  const [destroyError, setDestroyError] = useState<string | null>(null);
  const [redeploying, setRedeploying] = useState(false);
  const [redeployError, setRedeployError] = useState<string | null>(null);
  const [testDrawerOpen, setTestDrawerOpen] = useState(false);
  const [useCase, setUseCase] = useState<AppUseCase | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    deploymentsApi.get(id).then(setDeployment).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  // Load use case metadata from offerings.json for foundry deployments
  useEffect(() => {
    if (!deployment?.template_id?.startsWith('foundry-')) return;
    const useCaseName = deployment.template_id.replace('foundry-', '');
    fetch('/offerings.json')
      .then((r) => r.json())
      .then((data) => {
        const match = data.use_cases?.find((uc: AppUseCase) => uc.use_case_name === useCaseName);
        if (match) setUseCase(match);
      })
      .catch(() => {});
  }, [deployment?.template_id]);

  const pollStatus = useCallback(async () => {
    if (!id) return;
    try {
      const statusResp = await deploymentsApi.getDeploymentStatus(id);
      setDeployment(prev => prev ? {
        ...prev,
        status: statusResp.status,
        status_history: statusResp.status_history,
        outputs: statusResp.outputs,
        failed_stage: statusResp.failed_stage,
        error_message: statusResp.error_message,
        build_id: statusResp.build_id,
      } : prev);
    } catch { }
  }, [id]);

  useEffect(() => {
    if (!deployment) return;
    if (TERMINAL_STATUSES.includes(deployment.status)) return;
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [deployment?.status, pollStatus]);

  const handleDestroy = async () => {
    if (!id) return;
    setDestroying(true);
    setDestroyError(null);
    try {
      const updated = await deploymentsApi.destroyDeployment(id);
      setDeployment(prev => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      setDestroyError(e.message || 'Failed to initiate destroy');
    } finally {
      setDestroying(false);
    }
  };

  const handleRedeploy = async () => {
    if (!id) return;
    setRedeploying(true);
    setRedeployError(null);
    try {
      const updated = await deploymentsApi.redeployDeployment(id);
      setDeployment(prev => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      setRedeployError(e.message || 'Failed to initiate redeploy');
    } finally {
      setRedeploying(false);
    }
  };

  const isPipelineDeployment = deployment?.execution_arn != null;
  const showPipelineProgress = isPipelineDeployment && deployment != null;

  if (loading) return <div className="flex justify-center items-center py-20"><LoadingSpinner /></div>;
  if (!deployment) return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
      <div className="card text-center py-16 max-w-md">
        <p className="text-lg font-semibold text-slate-700 mb-4">Deployment not found</p>
        <button onClick={() => navigate('/deployments')} className="btn-secondary">← Back to Deployments</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      {/* Ombre gradient background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <button onClick={() => navigate('/deployments')} className="text-sm text-blue-600 hover:text-blue-700 font-semibold mb-4 inline-flex items-center gap-1 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
            Back to Deployments
          </button>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">{deployment.deployment_name}</h1>
            <StatusBadge status={deployment.status} />
            {deployment.status === 'deployed' && (
              <div className="flex items-center gap-2 ml-auto">
                {(deployment.outputs?.ui_url || deployment.outputs?.app_url || deployment.outputs?.AmplifyUrl) && (
                  <button
                    onClick={() => window.open(deployment.outputs?.ui_url || deployment.outputs?.app_url || deployment.outputs?.AmplifyUrl, '_blank')}
                    className="inline-flex items-center gap-1.5 text-sm py-2 px-4 rounded-lg font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                  >
                    Open App
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </button>
                )}
                {deployment.template_id?.startsWith('foundry-') && (
                <button
                  onClick={() => setTestDrawerOpen(true)}
                  className="inline-flex items-center gap-1.5 text-sm py-2 px-4 rounded-lg font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Test Deployment
                </button>
                )}
              </div>
            )}
          </div>
          <p className="text-slate-500 mt-2">Deployed from <span className="font-semibold text-slate-700">{deployment.template_id}</span></p>
        </div>

        {/* Pipeline Progress */}
        {showPipelineProgress && (
          <div className="card mb-6 animate-fade-in">
            <h3 className="text-base font-semibold text-slate-900 mb-4">Pipeline Progress</h3>
            <PipelineProgress status={deployment.status} failedStage={deployment.failed_stage} />
          </div>
        )}

        {/* Error Details Panel */}
        {deployment.status === 'failed' && deployment.error_message && (
          <div className="card bg-red-50/80 border-red-200/60 mb-6 animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-900 mb-1">Deployment Failed</h3>
                {deployment.failed_stage && (
                  <p className="text-xs text-red-700 mb-2">Failed at stage: <span className="font-semibold">{deployment.failed_stage}</span></p>
                )}
                <p className="text-sm text-red-800">{deployment.error_message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Deployment Outputs Panel */}
        {deployment.status === 'deployed' && deployment.outputs && Object.keys(deployment.outputs).length > 0 && (
          <div className="card bg-emerald-50/50 border-emerald-200/60 mb-6 animate-fade-in">
            <h3 className="text-base font-semibold text-emerald-900 mb-4 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              Deployment Outputs
            </h3>

            {deployment.outputs.deployment_instructions && (
              <div className="mb-4 p-4 bg-white border border-emerald-200/60 rounded-xl">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Deployment Instructions</div>
                <div className="font-mono text-sm text-slate-900 space-y-1">
                  {deployment.outputs.deployment_instructions.split('\n').map((line, i) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <div key={i} className="h-2" />;
                    if (trimmed.startsWith('==='))
                      return <div key={i} className="text-emerald-700 font-bold text-base mt-2">{trimmed.replace(/=/g, '').trim()}</div>;
                    if (trimmed.includes(':') && !trimmed.startsWith('aws ') && !trimmed.startsWith('--') && !trimmed.startsWith('USE_CASE'))
                      return (
                        <div key={i} className="flex gap-2">
                          <span className="text-slate-500 whitespace-nowrap">{trimmed.split(':')[0].trim()}:</span>
                          <span className="text-slate-900 break-all">{trimmed.split(':').slice(1).join(':').trim()}</span>
                        </div>
                      );
                    if (trimmed.startsWith('aws ') || trimmed.startsWith('--') || trimmed.startsWith('USE_CASE'))
                      return <div key={i} className="pl-4 text-blue-700 bg-blue-50 rounded-lg px-3 py-0.5">{trimmed}</div>;
                    if (trimmed.match(/^\d\./))
                      return <div key={i} className="font-semibold text-slate-800 mt-3">{trimmed}</div>;
                    return <div key={i} className="text-slate-700">{trimmed}</div>;
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {Object.entries(deployment.outputs)
                .filter(([key]) => key !== 'deployment_instructions')
                .map(([key, value]) => (
                <div key={key} className="p-3 bg-white border border-emerald-200/60 rounded-xl">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{key}</div>
                  <div className="text-sm font-mono text-slate-900 break-all">{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {destroyError && (
          <div className="card bg-red-50 border-red-200 mb-6 animate-fade-in">
            <p className="text-red-700">{destroyError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left - Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Configuration */}
            <div className="card animate-fade-in stagger-1">
              <h3 className="text-base font-semibold text-slate-900 mb-4">Configuration</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['Template', deployment.template_id],
                  ['IaC Type', deployment.iac_type],
                  ['Framework', deployment.framework_id || '—'],
                  ['AWS Account', deployment.aws_account],
                  ['Region', deployment.aws_region],
                  ['Created by', deployment.created_by],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</div>
                    <div className="text-sm font-medium text-slate-900">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* S3 Location */}
            {deployment.s3_key && (
              <div className="card animate-fade-in stagger-2">
                <h3 className="text-base font-semibold text-slate-900 mb-4">S3 Location</h3>
                <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl font-mono text-sm break-all text-slate-700">
                  s3://{deployment.s3_bucket}/{deployment.s3_key}
                </div>
              </div>
            )}

            {/* Status History */}
            <div className="card animate-fade-in stagger-3">
              <h3 className="text-base font-semibold text-slate-900 mb-4">Status History</h3>
              {showPipelineProgress ? (
                <PipelineVisualization
                  status={deployment.status}
                  statusHistory={deployment.status_history}
                  failedStage={deployment.failed_stage}
                  buildId={deployment.build_id}
                />
              ) : (
                <div className="border-l-2 border-slate-200 ml-3">
                  {deployment.status_history.map((entry, i) => (
                    <div key={i} className="ml-6 mb-4 relative">
                      <div className="absolute -left-[1.9rem] w-3 h-3 bg-blue-500 rounded-full border-2 border-white"></div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={entry.status as any} />
                        <span className="text-sm text-slate-500">{new Date(entry.timestamp).toLocaleString(undefined, { timeZoneName: "short" })}</span>
                      </div>
                      {entry.message && <p className="text-sm text-slate-500 mt-1">{entry.message}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right - Quick Info */}
          <div className="lg:col-span-1">
            <div className="card bg-slate-50/50 sticky top-20 animate-fade-in stagger-1">
              <h3 className="text-base font-semibold text-slate-900 mb-4">Quick Info</h3>
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Status</div>
                  <StatusBadge status={deployment.status} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Created</div>
                  <div className="text-sm text-slate-900">{new Date(deployment.created_at).toLocaleString(undefined, { timeZoneName: "short" })}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Last Updated</div>
                  <div className="text-sm text-slate-900">{new Date(deployment.updated_at).toLocaleString(undefined, { timeZoneName: "short" })}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Deployment ID</div>
                  <div className="text-xs text-slate-500 font-mono break-all bg-white px-3 py-2 rounded-lg border border-slate-200/60">{deployment.deployment_id}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-slate-200 space-y-3">
                {isPipelineDeployment && (
                  <button
                    onClick={() => setLogsOpen(true)}
                    className="w-full btn-secondary text-sm py-2.5 justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View Logs
                  </button>
                )}
                {(deployment.status === 'deployed' || deployment.status === 'failed') && (
                  <button
                    onClick={handleRedeploy}
                    disabled={redeploying}
                    className="w-full text-sm font-semibold px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {redeploying ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    {redeploying ? 'Redeploying...' : 'Redeploy'}
                  </button>
                )}
                {redeployError && (
                  <p className="text-xs text-red-600 mt-1">{redeployError}</p>
                )}
                {(deployment.status === 'deployed' || deployment.status === 'failed') && (
                  <button
                    onClick={handleDestroy}
                    disabled={destroying}
                    className="w-full text-sm font-semibold px-4 py-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {destroying ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                    {destroying ? 'Destroying...' : 'Destroy'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {id && <LogsViewer deploymentId={id} isOpen={logsOpen} onClose={() => setLogsOpen(false)} />}
      {testDrawerOpen && (
        <TestDeploymentDrawer
          deployment={deployment}
          useCase={useCase}
          onClose={() => setTestDrawerOpen(false)}
        />
      )}
    </div>
  );
}
