import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { deploymentsApi } from '../api/client';
import type { Deployment } from '../types';

type TabId = 'agent-safety' | 'langfuse';

export default function Observability() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam === 'langfuse' ? 'langfuse' : 'agent-safety'
  );
  const [foundationDeployment, setFoundationDeployment] = useState<Deployment | null>(null);
  const [loadingFoundation, setLoadingFoundation] = useState(true);
  const [iframeError, setIframeError] = useState(false);

  useEffect(() => {
    if (tabParam === 'langfuse') setActiveTab('langfuse');
    else if (tabParam === 'agent-safety') setActiveTab('agent-safety');
  }, [tabParam]);

  useEffect(() => {
    const fetchFoundation = async () => {
      try {
        const deployments = await deploymentsApi.list(undefined, 'foundation-stack');
        const active = deployments.find(
          (d) => (d.status === 'deployed' || d.status === 'delivered') && d.outputs?.langfuse_host
        );
        setFoundationDeployment(active || null);
      } catch {
        setFoundationDeployment(null);
      } finally {
        setLoadingFoundation(false);
      }
    };
    fetchFoundation();
  }, []);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'agent-safety', label: 'Agent Safety' },
    { id: 'langfuse', label: 'Langfuse' },
  ];

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
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">Observability</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">Monitor, trace, and evaluate your deployed AI agents with integrated observability tools.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 animate-fade-in stagger-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Agent Safety Tab */}
        {activeTab === 'agent-safety' && (
          <div className="space-y-6 animate-fade-in">
            <div className="card">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">Agent Safety</h2>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4">
                    Monitor and enforce safety guardrails for your deployed AI agents. Agent Safety provides real-time detection of harmful outputs, policy violations, and anomalous agent behavior.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="card">
                <h3 className="text-base font-semibold text-slate-900 mb-3">Guardrail Monitoring</h3>
                <p className="text-sm text-slate-500 mb-4">Track guardrail triggers, blocked responses, and policy enforcement across all deployed agents.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                    Content filtering and toxicity detection
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                    PII detection and redaction
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                    Topic restrictions and denied topics
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                    Custom word filters and regex patterns
                  </li>
                </ul>
              </div>

              <div className="card">
                <h3 className="text-base font-semibold text-slate-900 mb-3">Anomaly Detection</h3>
                <p className="text-sm text-slate-500 mb-4">Identify unusual patterns in agent behavior, response quality, and operational metrics.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></span>
                    Response latency spikes and timeouts
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></span>
                    Error rate monitoring and alerting
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></span>
                    Cost and token usage tracking
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></span>
                    Agent hallucination detection
                  </li>
                </ul>
              </div>
            </div>

            <div className="card bg-slate-50/50 border-slate-200/60">
              <p className="text-sm text-slate-500">
                Agent Safety integration is coming soon. It will connect with Amazon Bedrock Guardrails to provide centralized safety monitoring across all deployed FSI Foundry use cases.
              </p>
            </div>
          </div>
        )}

        {/* Langfuse Tab */}
        {activeTab === 'langfuse' && (
          <div className="space-y-6 animate-fade-in">
            <div className="card">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-1.5M12 12.75l3 1.5M12 12.75V18" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">Langfuse</h2>
                  <p className="text-sm text-slate-500 leading-relaxed mb-4">
                    Open-source LLM observability platform for tracing, evaluating, and debugging your AI agent workflows. Provides end-to-end visibility into multi-agent orchestration.
                  </p>
                </div>
              </div>
            </div>

            {/* Langfuse Server Status */}
            {loadingFoundation ? (
              <div className="card">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin"></div>
                  <p className="text-sm text-slate-500">Checking for Langfuse deployment...</p>
                </div>
              </div>
            ) : foundationDeployment?.outputs?.langfuse_host ? (
              <>
                <div className="card border-violet-200 bg-violet-50/30">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-semibold text-slate-900">Langfuse Server</h3>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Active
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 truncate">{foundationDeployment.outputs.langfuse_host}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                          <span>Region: {foundationDeployment.aws_region}</span>
                          <span>Deployment: {foundationDeployment.deployment_name}</span>
                        </div>
                      </div>
                    </div>
                    <a
                      href={foundationDeployment.outputs.langfuse_host}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
                    >
                      Open in New Tab
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  </div>
                </div>

                {/* Embedded Langfuse Dashboard */}
                {!iframeError ? (
                  <div className="rounded-xl border border-violet-200 overflow-hidden bg-white" style={{ height: 'calc(100vh - 20rem)' }}>
                    <iframe
                      src={foundationDeployment.outputs.langfuse_host}
                      className="w-full h-full border-0"
                      title="Langfuse Dashboard"
                      onError={() => setIframeError(true)}
                      onLoad={(e) => {
                        // Detect X-Frame-Options block (iframe loads but shows blank/error)
                        try {
                          const iframe = e.target as HTMLIFrameElement;
                          // If we can't access contentWindow, it's likely blocked
                          if (iframe.contentWindow?.location.href === 'about:blank') {
                            setIframeError(true);
                          }
                        } catch {
                          // Cross-origin access denied means iframe loaded successfully
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="card border-amber-200 bg-amber-50/30">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-amber-900">Unable to embed Langfuse dashboard</p>
                        <p className="text-sm text-amber-700/80 mt-1">
                          The Langfuse server's security headers prevent embedding. Use the "Open in New Tab" button above to access the dashboard directly.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="card border-slate-200 bg-slate-50/50">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 mb-1">No Langfuse Server Detected</h3>
                    <p className="text-sm text-slate-500">
                      Deploy the <strong>Foundation Stack</strong> template to automatically provision a Langfuse instance. Once deployed, your Langfuse dashboard will appear here.
                    </p>
                    <Link
                      to="/deployments"
                      className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors"
                    >
                      Go to Deployments
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="card">
                <h3 className="text-base font-semibold text-slate-900 mb-3">Tracing</h3>
                <p className="text-sm text-slate-500 mb-4">Full execution traces for every agent invocation, including tool calls, LLM requests, and orchestration steps.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0"></span>
                    Multi-agent trace visualization
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0"></span>
                    Latency breakdown per step
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0"></span>
                    Input/output inspection
                  </li>
                </ul>
              </div>

              <div className="card">
                <h3 className="text-base font-semibold text-slate-900 mb-3">Evaluation</h3>
                <p className="text-sm text-slate-500 mb-4">Score and evaluate agent responses with automated and manual evaluation pipelines.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0"></span>
                    Custom scoring functions
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0"></span>
                    Human-in-the-loop review
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0"></span>
                    Regression testing
                  </li>
                </ul>
              </div>

              <div className="card">
                <h3 className="text-base font-semibold text-slate-900 mb-3">Analytics</h3>
                <p className="text-sm text-slate-500 mb-4">Dashboards for cost, quality, and performance metrics across all your deployed agents.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0"></span>
                    Token usage and cost tracking
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0"></span>
                    Quality score trends
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0"></span>
                    Model comparison
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
