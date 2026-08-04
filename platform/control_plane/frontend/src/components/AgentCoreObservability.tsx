import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { deploymentsApi } from '../api/client';
import type { Deployment } from '../types';

const AWS_REGION = import.meta.env.VITE_AWS_REGION || 'us-east-1';

function xrayUrl(region: string) {
  return `https://${region}.console.aws.amazon.com/xray/home?region=${region}#/transactionSearch`;
}

export default function AgentCoreObservability() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    deploymentsApi
      .list()
      .then((all) => {
        const traced = all.filter(
          (d) => d.template_id?.startsWith('foundry-') && d.status === 'deployed',
        );
        setDeployments(traced);
      })
      .catch(() => setDeployments([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(254,243,199,0.6) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(237,233,254,0.55) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(254,215,170,0.4) 0%, transparent 50%)',
          animation: 'gradientDrift 20s ease-in-out infinite',
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8 animate-fade-in">
          <Link
            to="/observability"
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium"
          >
            ← Back to Observability
          </Link>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">
            AgentCore Observability
          </h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Native AWS tracing for Bedrock AgentCore agents via X-Ray and CloudWatch. Enabled as an
            opt-in checkbox when deploying FSI Foundry use cases. No SDK changes. No extra infrastructure.
          </p>
        </div>

        <div className="space-y-6 animate-fade-in stagger-1">
          {/* What is it */}
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              What is AgentCore Observability
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Bedrock AgentCore automatically emits OpenTelemetry traces for every agent invocation.
              These spans are routed to two destinations with no configuration required:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
                <span>
                  <strong className="text-slate-800">X-Ray Transaction Search</strong> — end-to-end
                  distributed traces with sub-segment latency attribution across model calls, tool
                  invocations, and orchestration steps.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
                <span>
                  <strong className="text-slate-800">CloudWatch Logs (aws/spans)</strong> — structured
                  span records queryable via Logs Insights for cost, latency, and error analysis.
                </span>
              </li>
            </ul>
          </div>

          {/* How it works in FSI Foundry */}
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              How it works in FSI Foundry
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              AgentCore Observability is opt-in per deployment because some teams prefer to route
              telemetry to an external system (e.g. Langfuse) instead, and the AgentCore-native path
              costs additional CloudWatch + X-Ray ingest.
            </p>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
                Foundry deployments instrument the AgentCore runtime when you tick the{' '}
                <strong className="text-slate-800">Enable AgentCore Observability</strong> checkbox
                at deploy time.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
                Traces appear in X-Ray with an <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">agent_id</code> annotation matching
                your Bedrock AgentCore agent identifier.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
                Logs and traces are correlated via shared trace IDs — click a CloudWatch log entry
                to jump directly to the corresponding X-Ray trace.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
                IAM permissions are scoped automatically by the Foundry deployment role — no manual
                policy changes needed.
              </li>
            </ul>
          </div>

          {/* What you can see */}
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">What you can see</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: 'End-to-end agent traces', note: 'Full invocation graph from input to final output' },
                { label: 'Tool invocations', note: 'Every function call with inputs, outputs, and latency' },
                { label: 'Model latency', note: 'Time-to-first-token and total latency per model call' },
                { label: 'Errors and retries', note: 'Exception spans with stack context and retry counts' },
                { label: 'Cost via CW Logs Insights', note: 'Query token usage and estimated cost per run' },
                { label: 'Concurrent execution', note: 'Parallel tool calls visualised as sibling spans' },
              ].map(({ label, note }) => (
                <div
                  key={label}
                  className="flex items-start gap-3 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200/70"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
                  <div>
                    <span className="text-sm font-medium text-slate-800">{label}</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">{note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Status check */}
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Foundry deployments (some may have AgentCore Observability enabled at deploy time)</h2>
            {loading ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
                <p className="text-sm text-slate-500">Checking Foundry deployments...</p>
              </div>
            ) : deployments.length === 0 ? (
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-slate-700">No active Foundry deployments found</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Deploy an agent via{' '}
                    <Link to="/applications/fsi-foundry" className="text-amber-600 hover:text-amber-700 font-medium underline">
                      FSI Foundry
                    </Link>{' '}
                    to start tracing automatically.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-3xl font-bold text-amber-600">{deployments.length}</span>
                  <span className="text-sm text-slate-500">active Foundry deployment{deployments.length !== 1 ? 's' : ''} currently traced</span>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Deployment</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Region</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Template</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deployments.map((d) => (
                        <tr key={d.deployment_id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-800">{d.deployment_name}</td>
                          <td className="px-4 py-3 text-slate-500">{d.aws_region}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs">{d.template_id}</td>
                          <td className="px-4 py-3 text-right">
                            <a
                              href={xrayUrl(d.aws_region)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View in X-Ray
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Open in AWS + Docs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={xrayUrl(AWS_REGION)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Open X-Ray Transaction Search
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
            <a
              href="https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              AgentCore Observability Docs
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
