import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getTemplates, deploymentsApi } from '../api/client';
import type { Template, DeploymentCreate as DeploymentCreateType } from '../types';
import LoadingSpinner from './LoadingSpinner';

export default function DeploymentCreate() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [form, setForm] = useState<DeploymentCreateType>({
    deployment_name: '', template_id: '', iac_type: '', framework_id: '',
    aws_region: '', parameters: {},
  });
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<{bucket: string, key: string} | null>(null);
  const navigate = useNavigate();

  useEffect(() => { if (step >= 1) getTemplates().then(setTemplates); }, [step]);

  const location = useLocation();
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  useEffect(() => {
    const state = location.state as { templateId?: string } | null;
    if (state?.templateId) {
      setPendingTemplateId(state.templateId);
      navigate(location.pathname, { replace: true, state: {} });
    }
    if (state?.templateId && step === 0) setStep(1);
  }, [location.state, templates]);
  useEffect(() => {
    if (pendingTemplateId && templates.length > 0) {
      const t = templates.find(t => t.id === pendingTemplateId);
      if (t) selectTemplate(t);
      setPendingTemplateId(null);
    }
  }, [pendingTemplateId, templates]);

  const selectTemplate = async (t: Template) => {
    setSelectedTemplate(t);
    const newForm = { ...form, template_id: t.id, iac_type: t.deployment_patterns?.[0]?.id || '' };

    // Pre-fill parameters from dependency outputs (e.g., Langfuse host/secret from foundation stack)
    if (t.dependencies && t.dependencies.length > 0) {
      try {
        const deps = await deploymentsApi.getTemplateDependencies(t.id);
        const depParams: Record<string, string> = {};
        for (const dep of deps) {
          if (dep.has_active_deployment && dep.outputs) {
            Object.entries(dep.outputs).forEach(([k, v]) => {
              if (v) depParams[k] = v;
            });
          }
        }
        newForm.parameters = { ...newForm.parameters, ...depParams };
      } catch { }
    }

    setForm(newForm);
    setStep(2);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await deploymentsApi.create(form);
      if (result.execution_arn) {
        navigate(`/deployments/${result.deployment_id}`);
        return;
      }
      setSuccessResult({ bucket: result.s3_bucket || '', key: result.s3_key || '' });
    } catch (e: any) {
      setError(e.message || 'Failed to create deployment');
    } finally {
      setSubmitting(false);
    }
  };

  if (successResult) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="max-w-2xl mx-auto px-6">
          <div className="card p-8 animate-fade-in-scale">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-semibold text-slate-900 mb-2">Deployment Successful!</h2>
                <p className="text-slate-500 mb-5">Your template has been packaged and delivered to S3.</p>
                <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl mb-6">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">S3 Location</div>
                  <div className="font-mono text-sm text-slate-800 break-all">s3://{successResult.bucket}/{successResult.key}</div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => navigate('/deployments')} className="btn-primary">View Deployments</button>
                  <button onClick={() => { setSuccessResult(null); setStep(0); setSelectedTemplate(null); setForm({deployment_name:'',template_id:'',iac_type:'',framework_id:'',aws_region:'',parameters:{}}); }} className="btn-secondary">Deploy Another</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="card text-center py-20 max-w-xl mx-6 animate-fade-in-scale">
          <div className="inline-block mb-6"><LoadingSpinner size="lg" /></div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Packaging and delivering...</h2>
          <p className="text-slate-500">Your template is being prepared and uploaded to S3</p>
        </div>
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
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-4xl font-semibold text-slate-900 tracking-tight mb-3">Create Deployment</h1>
          <p className="text-lg text-slate-500">Choose what to deploy and configure your application</p>
        </div>

        {/* Step 0: Choose deployment type */}
        {step === 0 && (
          <div className="max-w-3xl mx-auto animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">What would you like to deploy?</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <button onClick={() => navigate('/applications/fsi-foundry')}
                className="text-left p-6 border-2 border-slate-200 rounded-2xl hover:border-blue-400 hover:bg-blue-50/50 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-1 group-hover:text-blue-700 transition-colors">FSI Foundry Use Case</h3>
                <p className="text-sm text-slate-500">Deploy a multi-agent POC from 34 ready-to-deploy use cases across banking, risk, capital markets, and more.</p>
                <div className="mt-3 text-xs font-medium text-blue-600">Browse use cases →</div>
              </button>

              <button onClick={() => navigate('/applications/reference-implementations')}
                className="text-left p-6 border-2 border-slate-200 rounded-2xl hover:border-violet-400 hover:bg-violet-50/50 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-1 group-hover:text-violet-700 transition-colors">Reference Implementation</h3>
                <p className="text-sm text-slate-500">Deploy a complete end-to-end application with frontend, backend, and infrastructure.</p>
                <div className="mt-3 text-xs font-medium text-violet-600">Browse implementations →</div>
              </button>

              <button onClick={() => setStep(1)}
                className="text-left p-6 border-2 border-slate-200 rounded-2xl hover:border-teal-400 hover:bg-teal-50/50 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-1 group-hover:text-teal-700 transition-colors">Starter Template</h3>
                <p className="text-sm text-slate-500">Scaffold a new project from a template with agent code, IaC, and deployment scripts.</p>
                <div className="mt-3 text-xs font-medium text-teal-600">Select template →</div>
              </button>
            </div>
          </div>
        )}

        {step >= 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Panel */}
          <div className="lg:col-span-2">
            <div className="card">
              {/* Progress */}
              <div className="flex items-center mb-8 pb-6 border-b border-slate-100">
                {['Choose Type', 'Select Template', 'Configure & Deploy'].map((label, idx) => {
                  const num = idx + 1;
                  const isCurrent = step === idx;
                  const isComplete = step > idx;
                  return (
                    <div key={label} className="flex items-center flex-1">
                      <div className="flex items-center">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                          isComplete ? 'bg-blue-600 text-white ' :
                          isCurrent ? 'bg-blue-50 text-blue-700 border-2 border-blue-500' :
                          'bg-slate-100 text-slate-400'
                        }`}>{isComplete ? '✓' : num}</div>
                        <span className={`ml-3 text-sm font-semibold ${isCurrent ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
                      </div>
                      {idx < 2 && <div className={`h-0.5 flex-1 mx-4 rounded-full ${isComplete ? 'bg-blue-500' : 'bg-slate-200'}`} />}
                    </div>
                  );
                })}
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200/60 rounded-xl text-red-700 text-sm">{error}</div>
              )}

              {/* Step 1: Select Template */}
              {step === 1 && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-slate-900">Which template do you want to deploy?</h2>
                    <button onClick={() => setStep(0)} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">← Back</button>
                  </div>
                  <div className="space-y-3">
                    {templates.filter(t => t.type === 'usecase' || t.type === 'reference' || t.id === 'foundation-stack').map((t) => (
                      <button key={t.id} onClick={() => selectTemplate(t)}
                        className="w-full text-left p-5 border-2 rounded-2xl transition-all duration-200 group border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-base font-semibold mb-1 text-slate-900 group-hover:text-blue-700 transition-colors">{t.name}</h3>
                            <p className="text-sm text-slate-500">{t.description?.slice(0, 120)}...</p>
                            <div className="mt-2.5 flex gap-1.5">
                              {t.tags?.slice(0, 4).map((tag) => (
                                <span key={tag} className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-md">{tag}</span>
                              ))}
                            </div>
                          </div>
                          <svg className="w-5 h-5 text-slate-300 group-hover:text-blue-500 flex-shrink-0 ml-4 mt-1 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Configure */}
              {step === 2 && selectedTemplate && (
                <div>
                  <h2 className="text-xl font-bold text-slate-900 mb-6">Configure deployment</h2>
                  <div className="space-y-5">
                    <div>
                      <label className="label">Deployment Name *</label>
                      <input className="input-field" placeholder="my-agent-deployment"
                        value={form.deployment_name} onChange={(e) => { const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); setForm({ ...form, deployment_name: e.target.value, parameters: { ...form.parameters, project_name: sanitized } }); }} />
                    </div>

                    <div>
                      <label className="label">Deployment Type *</label>
                      <select className="input-field" value={form.iac_type}
                        onChange={(e) => setForm({ ...form, iac_type: e.target.value })}>
                        {selectedTemplate.deployment_patterns?.map((p) => (
                          <option key={p.id} value={p.id} disabled={(p as any).disabled}>
                            {p.name}{p.description ? ` — ${p.description}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {(selectedTemplate.frameworks?.length ?? 0) > 1 && (
                      <div>
                        <label className="label">Framework</label>
                        <select className="input-field" value={form.framework_id}
                          onChange={(e) => setForm({ ...form, framework_id: e.target.value })}>
                          <option value="">Default</option>
                          {selectedTemplate.frameworks?.map((f) => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="p-4 bg-blue-50/50 border border-blue-200/60 rounded-xl">
                      <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        How delivery works
                      </h4>
                      <p className="text-sm text-blue-800/80">
                        A new S3 bucket will be created automatically in this account with the packaged template.
                        You can then download the zip and run the IaC to provision resources.
                      </p>
                    </div>

                    <div>
                      <label className="label">AWS Region</label>
                      <select className="input-field" value={form.aws_region}
                        onChange={(e) => setForm({ ...form, aws_region: e.target.value, parameters: { ...form.parameters, aws_region: e.target.value } })}>
                        <option value="" disabled>Select a region</option>
                        {["us-west-2","us-east-1","us-east-2","us-west-1","eu-west-1","eu-central-1","ap-southeast-1","ap-northeast-1"].map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="label">Target Account ID (optional)</label>
                      <input className="input-field" placeholder="123456789012"
                        value={form.target_account_id || ''}
                        onChange={(e) => setForm({ ...form, target_account_id: e.target.value || undefined })} />
                      <p className="text-xs text-slate-400 mt-1.5">For cross-account deployments. Leave blank to deploy in the current account.</p>
                    </div>

                    <div>
                      <label className="label">Target Role ARN (optional)</label>
                      <input className="input-field" placeholder="arn:aws:iam::123456789012:role/fsi-deployment-role"
                        value={form.target_role_arn || ''}
                        onChange={(e) => setForm({ ...form, target_role_arn: e.target.value || undefined })} />
                      <p className="text-xs text-slate-400 mt-1.5">IAM role to assume for cross-account infrastructure provisioning.</p>
                    </div>

                    {selectedTemplate.parameters?.filter(p => !['project_name', 'aws_region', 'environment', 'tags', 'existing_vpc_id'].includes(p.name)).map((p) => (
                      <div key={p.name}>
                        <label className="label">
                          {p.description || p.name} {p.required && '*'}
                          {(p as any).help_url && (
                            <a href={(p as any).help_url} target="_blank" rel="noopener noreferrer"
                              className="ml-2 text-blue-600 hover:text-blue-800 underline font-medium text-xs">
                              Get one here &rarr;
                            </a>
                          )}
                        </label>
                        {(p as any).enum ? (
                          <select className="input-field"
                            value={form.parameters[p.name] ?? p.default ?? ''}
                            onChange={(e) => setForm({ ...form, parameters: { ...form.parameters, [p.name]: e.target.value } })}>
                            {(p as any).enum.map((v: string) => {
                              const labels: Record<string, string> = {
                                ecs: 'ECS Fargate (managed data stores)',
                                eks: 'EKS (managed data stores)',
                                eks_pods: 'EKS (all pods)',
                              };
                              return <option key={v} value={v}>{labels[v] || v}</option>;
                            })}
                          </select>
                        ) : (
                          <input className="input-field"
                            type={(p as any).input_type || 'text'}
                            placeholder={String(p.default ?? '')}
                            value={(p as any).input_type === 'password' ? (form.parameters[p.name] ?? '') : (form.parameters[p.name] ?? p.default ?? '')}
                            autoComplete={(p as any).input_type === 'password' ? 'new-password' : undefined}
                            onChange={(e) => setForm({ ...form, parameters: { ...form.parameters, [p.name]: e.target.value } })} />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between mt-8 pt-6 border-t border-slate-100">
                    <button onClick={() => setStep(1)} className="btn-secondary">← Back</button>
                    <button onClick={submit} className="btn-primary" disabled={!form.deployment_name || !form.aws_region || submitting}>
                      Deploy
                      <svg className="w-4 h-4 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Summary */}
          <div className="lg:col-span-1">
            <div className="card bg-slate-50/50 sticky top-20">
              <h3 className="text-base font-semibold text-slate-900 mb-4">Deployment Summary</h3>
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Template</div>
                  {selectedTemplate ? (
                    <div className="p-3 bg-white border border-slate-200/60 rounded-xl">
                      <div className="font-semibold text-slate-900">{selectedTemplate.name}</div>
                      <div className="text-xs text-slate-500 mt-1">v{selectedTemplate.version}</div>
                    </div>
                  ) : (
                    <div className="p-3 bg-white border border-dashed border-slate-300 rounded-xl text-sm text-slate-400">Not selected yet</div>
                  )}
                </div>
                {form.iac_type && (
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">IaC Type</div>
                    <div className="p-3 bg-white border border-slate-200/60 rounded-xl font-semibold text-slate-900">{form.iac_type}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Destination</div>
                  <div className="p-3 bg-blue-50/50 border border-blue-200/60 rounded-xl">
                    <div className="font-semibold text-slate-900 text-sm">Auto-created S3 bucket</div>
                    <div className="text-xs text-slate-500 mt-1">{form.aws_region} · Same account</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
