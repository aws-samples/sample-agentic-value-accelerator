/**
 * DataLineage — Data Provenance & Lineage Visualization (LIVE)
 *
 * Shows data flows from live AWS sources:
 * - CloudTrail AI callers (who initiated)
 * - Invocation logs (what models, how many calls)
 * - Guardrails (protection applied)
 * - Deployments (agent configs)
 *
 * Visualizes: Caller → Agent → Guardrail → Model → Response
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LiveDataBadge } from '../DataSourceIndicator';
import { useDataLineage, type LineageNode } from './useDataLineage';
import { Icon, type IconName } from '../icons';

const NODE_COLORS: Record<string, { bg: string; border: string; icon: IconName }> = {
  caller: { bg: 'bg-blue-50', border: 'border-blue-300', icon: 'finger-print' },
  agent: { bg: 'bg-indigo-50', border: 'border-indigo-300', icon: 'cpu-chip' },
  guardrail: { bg: 'bg-emerald-50', border: 'border-emerald-300', icon: 'shield-check' },
  model: { bg: 'bg-violet-50', border: 'border-violet-300', icon: 'sparkles' },
  output: { bg: 'bg-slate-50', border: 'border-slate-300', icon: 'document-arrow-down' },
};

function LineageNodeCard({ node }: { node: LineageNode }) {
  const colors = NODE_COLORS[node.type] || NODE_COLORS.output;
  return (
    <div className={`${colors.bg} border ${colors.border} rounded-lg p-3 min-w-[140px]`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon name={colors.icon} className="w-4 h-4 text-slate-600" />
        <span className="text-xs font-semibold text-slate-700 capitalize">{node.type}</span>
        {node.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Live data" />}
      </div>
      <div className="text-sm font-medium text-slate-900 truncate" title={node.label}>{node.label}</div>
      <div className="text-[10px] text-slate-500 truncate" title={node.detail}>{node.detail}</div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center px-1">
      <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>
    </div>
  );
}

export default function DataLineage() {
  const lineage = useDataLineage();
  const [selectedFlowIdx, setSelectedFlowIdx] = useState(0);

  const selectedFlow = lineage.flows[selectedFlowIdx];

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern/data" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Data Governance
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Data Lineage</h1>
              <LiveDataBadge />
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                {lineage.liveSourcesCount} sources
              </span>
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Data flow visualization from CloudTrail, invocation logs, and guardrails.
            </p>
          </div>
          <button
            onClick={lineage.refresh}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {lineage.loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-sm text-slate-500">Loading lineage data...</span>
            </div>
          </div>
        ) : lineage.error ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
            <p className="text-sm text-rose-700">Error: {lineage.error}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="text-[10px] text-slate-500 uppercase">Data Flows</div>
                <div className="text-xl font-bold text-slate-900">{lineage.stats.totalFlows}</div>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="text-[10px] text-slate-500 uppercase">Invocations</div>
                <div className="text-xl font-bold text-blue-600">{lineage.stats.totalInvocations.toLocaleString()}</div>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="text-[10px] text-slate-500 uppercase">Protected</div>
                <div className="text-xl font-bold text-emerald-600">{lineage.stats.protectedFlows}</div>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="text-[10px] text-slate-500 uppercase">Unprotected</div>
                <div className={`text-xl font-bold ${lineage.stats.unprotectedFlows > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                  {lineage.stats.unprotectedFlows}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="text-[10px] text-slate-500 uppercase">Callers</div>
                <div className="text-xl font-bold text-indigo-600">{lineage.stats.callers}</div>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="text-[10px] text-slate-500 uppercase">Models</div>
                <div className="text-xl font-bold text-violet-600">{lineage.stats.models}</div>
              </div>
            </div>

            {/* Flow selector */}
            {lineage.flows.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-900">Data Flows</h3>
                  <div className="flex items-center gap-2">
                    {lineage.flows.map((flow, idx) => (
                      <button
                        key={flow.id}
                        onClick={() => setSelectedFlowIdx(idx)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          idx === selectedFlowIdx
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Flow {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedFlow && (
                  <>
                    {/* Flow header */}
                    <div className="flex items-center justify-between mb-4 p-3 bg-slate-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{selectedFlow.name}</div>
                        <div className="text-xs text-slate-500">{selectedFlow.description}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-[10px] font-medium inline-flex items-center gap-1 ${
                          selectedFlow.hasGuardrail
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          <Icon name={selectedFlow.hasGuardrail ? 'shield-check' : 'exclamation-triangle'} className="w-3 h-3" />
                          {selectedFlow.hasGuardrail ? 'Protected' : 'Unprotected'}
                        </span>
                        <span className="text-xs text-slate-500">
                          {selectedFlow.totalInvocations.toLocaleString()} invocations
                        </span>
                      </div>
                    </div>

                    {/* Flow visualization */}
                    <div className="flex items-center justify-center gap-1 overflow-x-auto py-4">
                      {selectedFlow.nodes.map((node, idx) => (
                        <div key={node.id} className="flex items-center">
                          <LineageNodeCard node={node} />
                          {idx < selectedFlow.nodes.length - 1 && <FlowArrow />}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* All flows table */}
            {lineage.flows.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">All Data Flows</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th scope="col" className="pb-2 font-medium">Flow</th>
                        <th scope="col" className="pb-2 font-medium">Stages</th>
                        <th scope="col" className="pb-2 font-medium">Invocations</th>
                        <th scope="col" className="pb-2 font-medium">Protection</th>
                        <th scope="col" className="pb-2 font-medium">Last Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineage.flows.map((flow, idx) => (
                        <tr
                          key={flow.id}
                          className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${
                            idx === selectedFlowIdx ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => setSelectedFlowIdx(idx)}
                        >
                          <td className="py-2.5">
                            <div className="font-medium text-slate-800">{flow.name}</div>
                            <div className="text-[10px] text-slate-500">{flow.description}</div>
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-1">
                              {flow.nodes.map(n => (
                                <span
                                  key={n.id}
                                  title={`${n.type}: ${n.label}`}
                                >
                                  <Icon name={NODE_COLORS[n.type]?.icon || 'cube'} className="w-4 h-4 text-slate-600" />
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 font-mono text-slate-700">
                            {flow.totalInvocations.toLocaleString()}
                          </td>
                          <td className="py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                              flow.hasGuardrail
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {flow.hasGuardrail ? 'Protected' : 'Unprotected'}
                            </span>
                          </td>
                          <td className="py-2.5 text-slate-500">{flow.lastActivity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {lineage.flows.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                <div className="text-slate-400 text-lg mb-2">No data flows detected</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Data lineage is built from CloudTrail AI caller logs, Bedrock invocations, and guardrail configurations.
                  Make Bedrock API calls to see data flows appear here.
                </p>
              </div>
            )}

            {/* Info */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-xs text-blue-800">
                <strong>Live Data Lineage</strong> shows the path data takes through your AI system:
                Caller (who initiated) → Agent (if deployed) → Guardrail (protection) → Model (inference) → Response.
                Built from CloudTrail, invocation logs, and guardrail configs. No additional setup required.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
