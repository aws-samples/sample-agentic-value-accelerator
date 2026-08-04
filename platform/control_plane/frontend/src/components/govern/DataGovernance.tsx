/**
 * DataGovernance — AI-Ready Data Governance Hub
 *
 * Integrates REAL data from AVA platform:
 * - Agent deployments and their data configurations
 * - Guardrail PII/PHI/PCI protection status
 * - Real-time data protection events
 * - Use case data readiness scores
 * - Maturity assessments for data dimension
 * - Service approvals for access control
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { useDataGovernance } from './data/useDataGovernance';
import type { DataLineageNode } from './data/useDataGovernance';
import UnifiedGuide, { DATA_GOVERNANCE_GUIDE } from './UnifiedGuide';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import EmptyState from './EmptyState';
import {
  READINESS_DIMENSIONS, MATURITY_QUESTIONS, MATURITY_LEVELS,
  METADATA_SCHEMAS, METADATA_EXTRACTION_STATS,
  QUALITY_RULES, RESPONSIBLE_AI_METRICS, MATURITY_ROADMAP,
} from './data/dataGovernanceData';

type Tab = 'overview' | 'maturity' | 'readiness' | 'quality' | 'metadata' | 'lineage' | 'agents' | 'access';

// `live` reflects whether the tab is backed by the useDataGovernance hook (real
// AVA APIs) or by demo data. Overview/Readiness/Lineage/Agents/Access draw from
// the hook; Maturity/Quality/Metadata are still illustrative demo data.
const TABS: { id: Tab; label: string; description: string; live: boolean }[] = [
  { id: 'overview', label: 'Overview', description: 'Data governance summary', live: true },
  { id: 'maturity', label: 'Maturity Journey', description: 'Interactive assessment & roadmap', live: false },
  { id: 'quality', label: 'Data Quality', description: 'Quality rules & monitoring', live: false },
  { id: 'metadata', label: 'Metadata', description: 'RAG metadata schemas', live: false },
  { id: 'readiness', label: 'AI Readiness', description: '7-dimension assessment', live: true },
  { id: 'lineage', label: 'Lineage', description: 'Data provenance', live: true },
  { id: 'agents', label: 'Agent Data', description: 'Agent data profiles', live: true },
  { id: 'access', label: 'Access Control', description: 'Access matrix', live: true },
];

const RELATED_MODULES = [
  { label: 'Compliance Center', path: '/govern/compliance', description: 'Full regulatory checklists & evidence' },
  { label: 'Cost & FinOps', path: '/govern/finops', description: 'AI spend tracking & optimization' },
  { label: 'Audit & Incidents', path: '/govern/audit', description: 'Event logs & incident management' },
];

export default function DataGovernance() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const dg = useDataGovernance();

  const { summary, readinessMetrics } = dg;

  // Calculate data protection coverage percentage
  const protectionCoverage = summary.totalAgents > 0
    ? Math.round((summary.agentsWithGuardrails / summary.totalAgents) * 100)
    : 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Govern
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Data Governance</h1>
              <LiveDataBadge />
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Trace data from source to agent inference. See what data each agent consumes, how it's protected, and the full audit trail.
            </p>
          </div>
        </div>

        <UnifiedGuide {...DATA_GOVERNANCE_GUIDE} />

        {/* Hero KPIs — always visible */}
        {dg.loading ? (
          <div className="flex items-center justify-center h-24 mb-6">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Agents Protected', value: summary.agentsWithGuardrails, sub: `of ${summary.totalAgents} deployed`, tone: summary.agentsWithGuardrails > 0 ? 'text-emerald-600' : 'text-slate-400' },
              { label: 'Guardrails Active', value: summary.activeGuardrails, sub: `${summary.totalGuardrails} total configured`, tone: summary.activeGuardrails > 0 ? 'text-emerald-600' : 'text-amber-600' },
              { label: 'PII Types Protected', value: summary.uniquePiiTypes.length, sub: summary.uniquePiiTypes.slice(0, 2).join(', ') + (summary.uniquePiiTypes.length > 2 ? '…' : '') || 'none configured', tone: summary.uniquePiiTypes.length > 0 ? 'text-violet-600' : 'text-slate-400' },
              { label: 'Events (24h)', value: summary.last24hEvents.total, sub: `${summary.last24hEvents.blocked} blocked · ${summary.last24hEvents.anonymized} anonymized`, tone: summary.last24hEvents.blocked > 0 ? 'text-amber-600' : 'text-slate-600' },
              { label: 'Data Readiness', value: `${readinessMetrics.overallScore}%`, sub: '7-dimension assessment', tone: readinessMetrics.overallScore >= 70 ? 'text-emerald-600' : readinessMetrics.overallScore >= 40 ? 'text-amber-600' : 'text-rose-600' },
            ].map(k => (
              <div key={k.label} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{k.label}</div>
                <div className={`text-2xl font-semibold mt-1 ${k.tone}`}>{k.value}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{k.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Data Protection Coverage — visual bar like ShadowAI's coverage section */}
        {!dg.loading && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">Data Protection Coverage</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">LIVE</span>
              </div>
              <span className={`text-sm font-bold ${protectionCoverage >= 80 ? 'text-emerald-600' : protectionCoverage >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                {protectionCoverage}% coverage
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mb-4">
              Agents with active guardrails protecting PII, PHI, PCI, and harmful content. Coverage increases as you configure guardrails for each deployed agent.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: 'Guardrail Coverage', protected: summary.agentsWithGuardrails, total: summary.totalAgents, icon: '🛡️' },
                { label: 'PII Detection', protected: summary.uniquePiiTypes.length, total: 10, icon: '👤', unit: 'types' },
                { label: 'Content Filters', protected: summary.activeGuardrails, total: summary.totalGuardrails || 1, icon: '🚫' },
                { label: 'Use Case Readiness', protected: Math.round(readinessMetrics.overallScore / 20), total: 5, icon: '📊', unit: 'level' },
              ].map(c => {
                const pct = c.total > 0 ? Math.round((c.protected / c.total) * 100) : 0;
                return (
                  <div key={c.label} className="border border-slate-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-700">{c.icon} {c.label}</span>
                      <span className={`text-xs font-bold ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      <div className="h-full bg-slate-200" style={{ width: `${100 - pct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] mt-1.5">
                      <span className="text-emerald-600">{c.protected} {c.unit || 'protected'}</span>
                      <span className="text-slate-400">{c.total} {c.unit || 'total'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* How Data Protection Works — explainer pipeline */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-slate-900">How Data Protection Works</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">BEDROCK GUARDRAILS</span>
          </div>
          <div className="text-[11px] text-slate-500 mb-4">
            Every agent request flows through configured guardrails. PII is detected and masked before reaching the model. Harmful content is blocked. All events are logged for audit.
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            {[
              { label: 'Agent Request', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
              { label: 'PII Detection (Comprehend)', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
              { label: 'Content Filters', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
              { label: 'Bedrock Model', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { label: 'Audit Log', tone: 'bg-slate-100 text-slate-600 border-slate-200' },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg border font-medium ${step.tone}`}>{step.label}</span>
                {i < arr.length - 1 && <span className="text-slate-300">→</span>}
              </div>
            ))}
          </div>
          {summary.uniquePiiTypes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[10px] text-slate-500 mb-2">Protected PII types:</div>
              <div className="flex flex-wrap gap-1.5">
                {summary.uniquePiiTypes.map(pii => (
                  <span key={pii} className="text-[10px] px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">{pii}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent Activity Preview — quick glance at what's happening */}
        {!dg.loading && dg.recentDataEvents.length > 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-900">Recent Protection Events</span>
              <button
                onClick={() => setActiveTab('overview')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                View all →
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {dg.recentDataEvents.slice(0, 3).map((event, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    event.action === 'block' ? 'bg-rose-100' :
                    event.action === 'anonymize' ? 'bg-amber-100' :
                    'bg-emerald-100'
                  }`}>
                    {event.action === 'block' ? (
                      <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : event.action === 'anonymize' ? (
                      <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-900 truncate">{event.guardrailName}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                        event.action === 'block' ? 'bg-rose-100 text-rose-700' :
                        event.action === 'anonymize' ? 'bg-amber-100 text-amber-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {event.action}
                      </span>
                      <span className="text-[10px] text-slate-400">{event.filterType}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab navigation — for detailed exploration */}
        <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit" role="tablist" aria-label="Data Governance sections">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {tab.label}
              {tab.live ? (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Live data from AVA" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 border border-dashed border-amber-500" title="Demo data — integration required" />
              )}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && <OverviewTab dg={dg} />}
        {activeTab === 'maturity' && <MaturityJourneyTab />}
        {activeTab === 'quality' && <QualityTab />}
        {activeTab === 'metadata' && <MetadataTab />}
        {activeTab === 'readiness' && <ReadinessTab dg={dg} />}
        {activeTab === 'lineage' && <LineageTab dg={dg} />}
        {activeTab === 'agents' && <AgentsTab dg={dg} />}
        {activeTab === 'access' && <AccessTab dg={dg} />}

        {/* Related Modules - links to dedicated governance modules */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <h3 className="text-sm font-medium text-slate-500 mb-3">Related Governance Modules</h3>
          <div className="flex gap-3">
            {RELATED_MODULES.map(mod => (
              <Link
                key={mod.path}
                to={mod.path}
                className="flex-1 p-4 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm hover:border-blue-300 hover:shadow-sm transition-all group"
              >
                <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-600">{mod.label}</div>
                <div className="text-xs text-slate-500 mt-1">{mod.description}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Overview Tab ───────────────────────────

function OverviewTab({ dg }: { dg: ReturnType<typeof useDataGovernance> }) {
  const [maturityAnswers, setMaturityAnswers] = useState<Record<number, number>>({});

  if (dg.loading) return <LoadingState />;
  if (dg.error) return <ErrorState message={dg.error} onRetry={dg.refresh} />;

  const { summary, readinessMetrics } = dg;

  const maturityAnswered = Object.keys(maturityAnswers).length;
  const maturityTotal = MATURITY_QUESTIONS.length;
  const avgScore = maturityAnswered > 0 ? Object.values(maturityAnswers).reduce((s, v) => s + v, 0) / maturityAnswered : 0;
  const maturityLevel = MATURITY_LEVELS.find(l => avgScore >= l.range[0] && avgScore <= l.range[1]) || MATURITY_LEVELS[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 gap-4">
        <KpiCard
          label="Agents Deployed"
          value={summary.totalAgents}
          subtext={`${summary.agentsWithGuardrails} with guardrails`}
          color="blue"
        />
        <KpiCard
          label="Guardrails Active"
          value={summary.activeGuardrails}
          subtext={`of ${summary.totalGuardrails} total`}
          color="emerald"
        />
        <KpiCard
          label="PII Types Protected"
          value={summary.uniquePiiTypes.length}
          subtext={summary.uniquePiiTypes.slice(0, 3).join(', ') + (summary.uniquePiiTypes.length > 3 ? '...' : '')}
          color="violet"
        />
        <KpiCard
          label="Events (24h)"
          value={summary.last24hEvents.total}
          subtext={`${summary.last24hEvents.blocked} blocked, ${summary.last24hEvents.anonymized} anonymized`}
          color="amber"
        />
        <KpiCard
          label="AI Data Readiness"
          value={`${readinessMetrics.overallScore}%`}
          subtext="7-dimension score"
          color="cyan"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Agent Data Protection Status</h3>
            <LiveDataBadge />
          </div>

          {dg.agentProfiles.length === 0 ? (
            <EmptyState
              icon="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              title="No agents deployed"
              description="Deploy agents from the Build module to see their data protection configurations here."
              actionLabel="Browse Applications"
              actionLink="/applications"
              tips={['Guardrail status and PII detection will appear once agents are deployed']}
              compact
            />
          ) : (
            <div className="space-y-3">
              {dg.agentProfiles.slice(0, 5).map(agent => (
                <div key={agent.deploymentId} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium text-slate-900">{agent.deploymentName}</span>
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                        agent.status === 'deployed' ? 'bg-emerald-100 text-emerald-700' :
                        agent.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {agent.status}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">{agent.awsRegion}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-slate-500">Guardrails:</span>
                    <span className="text-emerald-600 font-medium">{agent.guardrails.length} active</span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-500">PII:</span>
                    <span className="text-violet-600 font-medium">
                      {agent.dataProtectionSummary.piiEntitiesProtected.length} types
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Recent Data Protection Events</h3>
            <LiveDataBadge />
          </div>

          {dg.recentDataEvents.length === 0 ? (
            <EmptyState
              icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              title="No protection events"
              description="When guardrails detect PII, block harmful content, or anonymize data, events will appear here."
              actionLabel="Configure Guardrails"
              actionLink="/secure/guardrails"
              tips={['Enable PII detection guardrails to start capturing events']}
              compact
            />
          ) : (
            <div className="space-y-2">
              {dg.recentDataEvents.slice(0, 6).map((event, i) => (
                <div key={i} className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-lg">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    event.action === 'block' ? 'bg-rose-100' :
                    event.action === 'anonymize' ? 'bg-amber-100' :
                    'bg-emerald-100'
                  }`}>
                    {event.action === 'block' ? (
                      <svg className="w-3 h-3 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : event.action === 'anonymize' ? (
                      <svg className="w-3 h-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-900">{event.guardrailName}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                        event.action === 'block' ? 'bg-rose-100 text-rose-700' :
                        event.action === 'anonymize' ? 'bg-amber-100 text-amber-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {event.action}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">{event.filterType}</div>
                  </div>
                  <span className="text-[9px] text-slate-400 flex-shrink-0">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Use Case Data Requirements</h3>
          <LiveDataBadge />
        </div>

        {dg.useCaseRequirements.length === 0 ? (
          <EmptyState
            icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            title="No use cases defined"
            description="Create use cases in the Plan module to track their data readiness and requirements here."
            actionLabel="Create Use Case"
            actionLink="/use-cases"
            tips={['Use cases help you track AI initiatives with data governance requirements']}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th scope="col" className="pb-2 font-medium">Use Case</th>
                  <th scope="col" className="pb-2 font-medium">Domain</th>
                  <th scope="col" className="pb-2 font-medium">Status</th>
                  <th scope="col" className="pb-2 font-medium">Data Readiness</th>
                  <th scope="col" className="pb-2 font-medium">Business Owner</th>
                  <th scope="col" className="pb-2 font-medium">Technical Owner</th>
                </tr>
              </thead>
              <tbody>
                {dg.useCaseRequirements.slice(0, 8).map(uc => (
                  <tr key={uc.useCaseId} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 font-medium text-slate-900">{uc.useCaseName}</td>
                    <td className="py-2 text-slate-600">{uc.businessDomain}</td>
                    <td className="py-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                        uc.status === 'Production' ? 'bg-emerald-100 text-emerald-700' :
                        uc.status === 'Pilot' ? 'bg-blue-100 text-blue-700' :
                        uc.status === 'Active' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {uc.status}
                      </span>
                    </td>
                    <td className="py-2">
                      {uc.dataReadinessScore !== undefined ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full">
                            <div
                              className={`h-1.5 rounded-full ${
                                uc.dataReadinessScore >= 4 ? 'bg-emerald-500' :
                                uc.dataReadinessScore >= 3 ? 'bg-amber-500' :
                                'bg-rose-500'
                              }`}
                              style={{ width: `${(uc.dataReadinessScore / 5) * 100}%` }}
                            />
                          </div>
                          <span className="text-slate-600">{uc.dataReadinessScore}/5</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Not assessed</span>
                      )}
                    </td>
                    <td className="py-2 text-slate-600">{uc.businessOwner || '-'}</td>
                    <td className="py-2 text-slate-600">{uc.technicalOwner || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Data Governance Maturity Self-Assessment */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Data Governance Maturity Self-Assessment</h3>
            <p className="text-xs text-slate-500 mt-0.5">Quick assessment across {MATURITY_QUESTIONS.length} key dimensions</p>
          </div>
          <div className="flex items-center gap-2">
            {maturityAnswered > 0 && (
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                avgScore >= 3.5 ? 'bg-emerald-100 text-emerald-700' :
                avgScore >= 2.5 ? 'bg-blue-100 text-blue-700' :
                avgScore >= 1.5 ? 'bg-amber-100 text-amber-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {avgScore.toFixed(1)}/4.0 — {maturityLevel.level}
              </span>
            )}
            <span className="text-xs text-slate-400">{maturityAnswered}/{maturityTotal} answered</span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {MATURITY_QUESTIONS.map((q, qi) => (
            <div
              key={qi}
              className="p-3 bg-white rounded-lg border border-slate-200/60 shadow-sm"
              style={{
                borderLeft: `3px solid ${
                  maturityAnswers[qi]
                    ? maturityAnswers[qi] >= 3 ? '#10b981' : maturityAnswers[qi] >= 2 ? '#f59e0b' : '#ef4444'
                    : '#e2e8f0'
                }`
              }}
            >
              <div className="text-[10px] font-semibold text-slate-900 mb-1">{q.dimension}</div>
              <div className="text-[9px] text-slate-600 mb-2">{q.question}</div>
              <div className="space-y-1">
                {q.options.map((opt, oi) => (
                  <button
                    key={oi}
                    onClick={() => setMaturityAnswers(prev => ({ ...prev, [qi]: opt.score }))}
                    className={`w-full text-left px-2 py-1.5 text-[9px] rounded transition-colors ${
                      maturityAnswers[qi] === opt.score
                        ? 'bg-cyan-100 border border-cyan-500 text-slate-900'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {maturityAnswered === maturityTotal && (
          <div
            className="mt-4 p-4 bg-white rounded-xl border shadow-sm"
            style={{ borderColor: `${maturityLevel.color}40` }}
          >
            <div className="grid grid-cols-[120px_1fr] gap-4">
              <div className="text-center">
                <div className="text-4xl font-bold" style={{ color: maturityLevel.color }}>
                  {avgScore.toFixed(1)}
                </div>
                <div className="text-xs font-semibold" style={{ color: maturityLevel.color }}>
                  {maturityLevel.level}
                </div>
                <div className="text-[9px] text-slate-500 mt-1">of 4.0</div>
              </div>
              <div>
                <p className="text-xs text-slate-700 mb-2">{maturityLevel.desc}</p>
                <div className="text-[10px] text-cyan-700 font-semibold mb-1">Priority Actions:</div>
                {maturityLevel.actions.map((a, i) => (
                  <div key={i} className="text-[10px] text-slate-600 mb-0.5 pl-2">• {a}</div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Agents Tab ───────────────────────────

function AgentsTab({ dg }: { dg: ReturnType<typeof useDataGovernance> }) {
  if (dg.loading) return <LoadingState />;
  if (dg.error) return <ErrorState message={dg.error} onRetry={dg.refresh} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Data profiles for {dg.agentProfiles.length} deployed agents showing data sources and protection status.
        </p>
        <LiveDataBadge />
      </div>

      {dg.agentProfiles.length === 0 ? (
        <EmptyState
          icon="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          title="No Agents Deployed"
          description="Deploy agents from the Build module to see their data governance profiles here."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {dg.agentProfiles.map(agent => (
            <div key={agent.deploymentId} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">{agent.deploymentName}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{agent.templateId}</p>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded font-medium ${
                  agent.status === 'deployed' ? 'bg-emerald-100 text-emerald-700' :
                  agent.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {agent.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-[10px] text-slate-500 mb-1">AWS Account</div>
                  <div className="text-xs font-mono text-slate-700">{agent.awsAccount}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 mb-1">Region</div>
                  <div className="text-xs text-slate-700">{agent.awsRegion}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 mb-1">Created By</div>
                  <div className="text-xs text-slate-700">{agent.createdBy}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 mb-1">Created</div>
                  <div className="text-xs text-slate-700">{new Date(agent.createdAt).toLocaleDateString()}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[10px] font-semibold text-slate-600 mb-2">Data Protection</div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-slate-500">Guardrails:</span>
                    <span className="text-emerald-600 font-medium">{agent.guardrails.length}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-slate-500">PII Types:</span>
                    <span className="text-violet-600 font-medium">
                      {agent.dataProtectionSummary.piiEntitiesProtected.join(', ') || 'None configured'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-slate-500">Content Filters:</span>
                    <span className="text-blue-600 font-medium">
                      {agent.dataProtectionSummary.contentFiltersActive.length || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────── Readiness Tab (LIVE + Detailed Assessment) ───────────────────────────

function ReadinessTab({ dg }: { dg: ReturnType<typeof useDataGovernance> }) {
  const [maturityAnswers, setMaturityAnswers] = useState<Record<number, number>>({});
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);

  if (dg.loading) return <LoadingState />;
  if (dg.error) return <ErrorState message={dg.error} onRetry={dg.refresh} />;

  const { readinessMetrics } = dg;

  const maturityAnswered = Object.keys(maturityAnswers).length;
  const maturityTotal = MATURITY_QUESTIONS.length;
  const avgScore = maturityAnswered > 0 ? Object.values(maturityAnswers).reduce((s, v) => s + v, 0) / maturityAnswered : 0;
  const maturityLevel = MATURITY_LEVELS.find(l => avgScore >= l.range[0] && avgScore <= l.range[1]) || MATURITY_LEVELS[0];

  const met = READINESS_DIMENSIONS.filter(d => d.status === 'met').length;
  const atRisk = READINESS_DIMENSIONS.filter(d => d.status === 'at-risk').length;
  const notMet = READINESS_DIMENSIONS.filter(d => d.status === 'not-met').length;
  const readinessOverall = Math.round(READINESS_DIMENSIONS.reduce((s, d) => s + d.score * d.weight, 0));

  return (
    <div className="space-y-6">
      {/* Hero banner - light theme */}
      <div className="p-5 rounded-xl bg-gradient-to-br from-cyan-50/80 to-blue-50/80 border border-cyan-200/60 backdrop-blur-sm shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-cyan-800">AI Data Readiness Assessment</h3>
              <LiveDataBadge />
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Is your data AI-ready? Score across {readinessMetrics.dimensions.length} dimensions computed from live platform data.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
              readinessMetrics.overallScore >= 80 ? 'bg-emerald-100 text-emerald-700' :
              readinessMetrics.overallScore >= 60 ? 'bg-amber-100 text-amber-700' :
              'bg-rose-100 text-rose-700'
            }`}>
              {readinessMetrics.overallScore}/100
            </span>
            <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-medium">{met} met</span>
            <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs font-medium">{atRisk} at-risk</span>
            <span className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs font-medium">{notMet} not met</span>
          </div>
        </div>
      </div>

      {/* Overall Score + Dimension Breakdown - light theme */}
      <div className="grid grid-cols-[200px_1fr] gap-4">
        {/* Overall score card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center border-t-4 border-t-cyan-500">
          <div className="text-xs text-slate-500">Overall Readiness</div>
          <div className={`text-5xl font-bold ${
            readinessMetrics.overallScore >= 80 ? 'text-emerald-600' :
            readinessMetrics.overallScore >= 60 ? 'text-amber-600' :
            'text-rose-600'
          }`}>
            {readinessMetrics.overallScore}
          </div>
          <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${
            readinessMetrics.overallScore >= 80 ? 'bg-emerald-100 text-emerald-700' :
            readinessMetrics.overallScore >= 60 ? 'bg-amber-100 text-amber-700' :
            'bg-rose-100 text-rose-700'
          }`}>
            {readinessMetrics.overallScore >= 80 ? 'AI-Ready' : readinessMetrics.overallScore >= 60 ? 'Partially Ready' : 'Not Ready'}
          </span>
          <div className="mt-4 text-left">
            <div className="text-[10px] text-slate-500 mb-1">3 questions you must answer:</div>
            <div className="text-[10px] text-blue-600">1. Where did this data originate?</div>
            <div className="text-[10px] text-blue-600">2. How was it transformed?</div>
            <div className="text-[10px] text-blue-600">3. Is it fit for this AI use case?</div>
          </div>
        </div>

        {/* Dimension Breakdown - light theme */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Readiness Dimensions (Live)</h3>
          <div className="space-y-3">
            {readinessMetrics.dimensions.map((dim, i) => (
              <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-4 p-3 cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpandedDimension(expandedDimension === dim.name ? null : dim.name)}
                >
                  <div className="w-36 text-sm font-medium text-slate-700">{dim.name}</div>
                  <div className="flex-1">
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          dim.score >= 4 ? 'bg-emerald-500' :
                          dim.score >= 3 ? 'bg-amber-500' :
                          dim.score >= 2 ? 'bg-orange-500' :
                          'bg-rose-500'
                        }`}
                        style={{ width: `${(dim.score / dim.maxScore) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-12 text-right text-sm font-semibold text-slate-900">
                    {dim.score}/{dim.maxScore}
                  </div>
                  <div className="w-48 text-xs text-slate-500 truncate" title={dim.sources.join(' • ')}>
                    {dim.sources[0]}
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${expandedDimension === dim.name ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                {expandedDimension === dim.name && (
                  <div className="px-4 pb-4 bg-slate-50 border-t border-slate-200">
                    <div className="text-xs text-slate-600 mt-3">
                      <strong className="text-slate-700">Data Sources:</strong> {dim.sources.join(' • ')}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-2">
                      This score is computed from live AVA platform data. Improve by adding more guardrails, completing maturity assessments, or scoring use cases.
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Use Case Readiness - light theme */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Use Case Data Readiness</h3>
        {readinessMetrics.useCaseReadiness.length === 0 ? (
          <EmptyState
            icon="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
            title="No readiness scores"
            description="Score your use cases in the Plan module to see data readiness ratings here."
            actionLabel="Score Use Cases"
            actionLink="/use-cases"
            compact
          />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {readinessMetrics.useCaseReadiness.map(uc => (
              <div key={uc.useCaseId} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-900 truncate">{uc.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    uc.status === 'Production' ? 'bg-emerald-100 text-emerald-700' :
                    uc.status === 'Pilot' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {uc.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full">
                    <div
                      className={`h-1.5 rounded-full ${
                        uc.dataReadiness >= 4 ? 'bg-emerald-500' :
                        uc.dataReadiness >= 3 ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`}
                      style={{ width: `${(uc.dataReadiness / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{uc.dataReadiness}/5</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Maturity Assessment Link - light theme */}
      {readinessMetrics.maturityDataScore !== null && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-blue-900">Maturity Assessment Data Dimension</h4>
              <p className="text-xs text-blue-700 mt-1">
                Assessment completion: {Math.round(readinessMetrics.assessmentCompletion)}%
              </p>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {readinessMetrics.maturityDataScore.toFixed(1)}/5
            </div>
          </div>
        </div>
      )}

      {/* Detailed Assessment Section - expanded by default, light theme with dark chart area */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">Detailed AI Readiness Assessment</span>
                  <MockDataBadge />
                </div>
                <div className="text-[10px] text-slate-500">
                  7-dimension analysis with radar charts, findings, and recommended actions
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-medium">{met} met</span>
              <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs font-medium">{atRisk} at-risk</span>
              <span className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs font-medium">{notMet} not met</span>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Charts Row - light theme */}
          <div className="grid grid-cols-[200px_1fr_1fr] gap-4">
            {/* Overall score card */}
            <div className="bg-white rounded-xl p-4 text-center border border-slate-200/60 shadow-sm">
              <div className="text-xs text-slate-500">Overall Readiness</div>
              <div className={`text-5xl font-bold ${
                readinessOverall >= 80 ? 'text-emerald-600' :
                readinessOverall >= 60 ? 'text-amber-600' :
                'text-rose-600'
              }`}>
                {readinessOverall}
              </div>
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${
                readinessOverall >= 80 ? 'bg-emerald-100 text-emerald-700' :
                readinessOverall >= 60 ? 'bg-amber-100 text-amber-700' :
                'bg-rose-100 text-rose-700'
              }`}>
                {readinessOverall >= 80 ? 'AI-Ready' : readinessOverall >= 60 ? 'Partially Ready' : 'Not Ready'}
              </span>
              <div className="mt-4 text-left">
                <div className="text-[10px] text-slate-500 mb-1">3 questions you must answer:</div>
                <div className="text-[10px] text-cyan-700">1. Where did this data originate?</div>
                <div className="text-[10px] text-cyan-700">2. How was it transformed?</div>
                <div className="text-[10px] text-cyan-700">3. Is it fit for this AI use case?</div>
              </div>
            </div>

            {/* Radar chart */}
            <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Readiness Radar</h4>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={READINESS_DIMENSIONS.map(d => ({
                  dimension: d.name.split(' ').slice(-1)[0],
                  score: d.score,
                  target: d.target,
                }))}>
                  <PolarGrid stroke="#cbd5e1" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fill: '#475569', fontSize: 9 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#475569', fontSize: 9 }} />
                  <Radar name="Current" dataKey="score" stroke="#0891b2" fill="#0891b2" fillOpacity={0.3} />
                  <Radar name="Target" dataKey="target" stroke="#d97706" fill="none" strokeDasharray="5 5" />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Bar chart */}
            <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Dimension Scores</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={READINESS_DIMENSIONS.map(d => ({
                    name: d.name.split(' ').slice(-1)[0],
                    score: d.score,
                    target: d.target,
                  }))}
                  layout="vertical"
                  margin={{ left: 70, right: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#475569', fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#475569', fontSize: 9 }} width={65} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                  <Bar dataKey="score" name="Current" radius={[0, 4, 4, 0]}>
                    {READINESS_DIMENSIONS.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.score >= d.target ? '#10b981' : d.score >= d.target * 0.7 ? '#f59e0b' : '#ef4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Dimension detail cards */}
          <div className="grid grid-cols-2 gap-4">
              {READINESS_DIMENSIONS.map((d) => (
                <div
                  key={d.id}
                  className={`bg-white rounded-xl border p-4 border-l-4 ${
                    d.score >= d.target ? 'border-l-emerald-500' :
                    d.score >= d.target * 0.7 ? 'border-l-amber-500' :
                    'border-l-rose-500'
                  } border-slate-200`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-slate-900">{d.name}</h4>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${
                        d.score >= d.target ? 'text-emerald-600' : 'text-amber-600'
                      }`}>
                        {d.score}
                      </span>
                      <span className="text-xs text-slate-500">/ {d.target}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                        d.status === 'met' ? 'bg-emerald-100 text-emerald-700' :
                        d.status === 'at-risk' ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {d.status}
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-2 bg-slate-200 rounded-full mb-3">
                    <div
                      className={`h-2 rounded-full ${
                        d.score >= d.target ? 'bg-emerald-500' :
                        d.score >= d.target * 0.7 ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`}
                      style={{ width: `${d.score}%` }}
                    />
                  </div>

                  <p className="text-xs text-slate-600 mb-3">{d.description}</p>

                  <div className="text-[10px] text-slate-500 mb-1 font-medium">Findings:</div>
                  {d.findings.map((f, i) => (
                    <div key={i} className="text-[10px] text-slate-600 mb-0.5 pl-2">• {f}</div>
                  ))}

                  <div className="text-[10px] text-cyan-700 mt-2 mb-1 font-medium">Priority actions:</div>
                  {d.actions.slice(0, 2).map((a, i) => (
                    <div key={i} className="text-[10px] text-emerald-700 mb-0.5 pl-2">• {a}</div>
                  ))}
                </div>
              ))}
          </div>

          {/* Maturity Self-Assessment */}
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-4">Data Governance Maturity Self-Assessment</h4>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {MATURITY_QUESTIONS.map((q, qi) => (
                  <div
                    key={qi}
                    className="p-3 bg-white rounded-lg border border-slate-200/60 shadow-sm"
                    style={{
                      borderLeft: `3px solid ${
                        maturityAnswers[qi]
                          ? maturityAnswers[qi] >= 3 ? '#10b981' : maturityAnswers[qi] >= 2 ? '#f59e0b' : '#ef4444'
                          : '#e2e8f0'
                      }`
                    }}
                  >
                    <div className="text-[10px] font-semibold text-slate-900 mb-1">{q.dimension}</div>
                    <div className="text-[9px] text-slate-600 mb-2">{q.question}</div>
                    <div className="space-y-1">
                      {q.options.map((opt, oi) => (
                        <button
                          key={oi}
                          onClick={() => setMaturityAnswers(prev => ({ ...prev, [qi]: opt.score }))}
                          className={`w-full text-left px-2 py-1.5 text-[9px] rounded transition-colors ${
                            maturityAnswers[qi] === opt.score
                              ? 'bg-cyan-100 border border-cyan-500 text-slate-900'
                              : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {maturityAnswered === maturityTotal && (
                <div
                  className="mt-4 p-4 bg-white rounded-xl border shadow-sm"
                  style={{ borderColor: `${maturityLevel.color}40` }}
                >
                  <div className="grid grid-cols-[120px_1fr] gap-4">
                    <div className="text-center">
                      <div className="text-4xl font-bold" style={{ color: maturityLevel.color }}>
                        {avgScore.toFixed(1)}
                      </div>
                      <div className="text-xs font-semibold" style={{ color: maturityLevel.color }}>
                        {maturityLevel.level}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-1">of 4.0</div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-700 mb-2">{maturityLevel.desc}</p>
                      <div className="text-[10px] text-cyan-700 font-semibold mb-1">Priority Actions:</div>
                      {maturityLevel.actions.map((a, i) => (
                        <div key={i} className="text-[10px] text-slate-600 mb-0.5 pl-2">• {a}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
          </div>

          {/* Guidance callout */}
          <div className="p-4 bg-cyan-50/80 border border-cyan-200/60 rounded-xl shadow-sm">
            <p className="text-xs text-cyan-800">
              <strong>AI Data Readiness</strong> is assessed across 7 weighted dimensions. Target: 85+ overall to be considered "AI-Ready".
              Current gaps: <strong>Data Lineage (45/85)</strong> and <strong>Data Ownership (55/85)</strong> are the biggest blockers.
              AWS services: SageMaker Catalog for lineage and classification, Glue Data Quality for automated validation, Lake Formation for fine-grained access control.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Lineage Tab (LIVE) ───────────────────────────

const NODE_COLORS: Record<DataLineageNode['type'], { bg: string; border: string; text: string }> = {
  source: { bg: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-700' },
  transform: { bg: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-700' },
  agent: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700' },
  guardrail: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700' },
  output: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700' },
};

function LineageTab({ dg }: { dg: ReturnType<typeof useDataGovernance> }) {
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);

  if (dg.loading) return <LoadingState />;
  if (dg.error) return <ErrorState message={dg.error} onRetry={dg.refresh} />;

  const { lineageFlows } = dg;
  const activeFlow = selectedFlow
    ? lineageFlows.find(f => f.agentId === selectedFlow)
    : lineageFlows[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Data lineage flows showing how data moves from sources through agents to outputs.
        </p>
        <LiveDataBadge />
      </div>

      {lineageFlows.length === 0 ? (
        <EmptyState
          icon="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
          title="No Data Lineage Available"
          description="Deploy agents to see data lineage flows. Lineage shows how data moves from sources through processing to outputs."
        />
      ) : (
        <>
          {/* Flow selector */}
          <div className="flex gap-2 flex-wrap">
            {lineageFlows.map(flow => (
              <button
                key={flow.agentId}
                onClick={() => setSelectedFlow(flow.agentId)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeFlow?.agentId === flow.agentId
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {flow.agentName}
                {flow.protectionStatus.hasGuardrails && (
                  <span className="ml-1.5 w-1.5 h-1.5 inline-block rounded-full bg-emerald-400" />
                )}
              </button>
            ))}
          </div>

          {/* Flow visualization */}
          {activeFlow && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{activeFlow.agentName}</h3>
                  <p className="text-xs text-slate-500">{activeFlow.templateId}</p>
                </div>
                <div className="flex items-center gap-2">
                  {activeFlow.protectionStatus.hasGuardrails && (
                    <span className="text-[10px] px-2 py-1 bg-emerald-100 text-emerald-700 rounded font-medium">
                      Guardrails Active
                    </span>
                  )}
                  {activeFlow.protectionStatus.piiProtected && (
                    <span className="text-[10px] px-2 py-1 bg-violet-100 text-violet-700 rounded font-medium">
                      PII Protected
                    </span>
                  )}
                </div>
              </div>

              {/* Horizontal flow */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {activeFlow.nodes.map((node, i) => (
                  <div key={node.id} className="flex items-center">
                    <LineageNode node={node} />
                    {i < activeFlow.nodes.length - 1 && (
                      <svg className="w-6 h-6 text-slate-300 flex-shrink-0 mx-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-200">
                {Object.entries(NODE_COLORS).map(([type, colors]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <span className={`w-3 h-3 rounded ${colors.bg} border ${colors.border}`} />
                    <span className="text-[10px] text-slate-600 capitalize">{type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LineageNode({ node }: { node: DataLineageNode }) {
  const colors = NODE_COLORS[node.type];

  return (
    <div className={`min-w-[160px] p-3 rounded-lg border-2 ${colors.bg} ${colors.border}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[10px] font-bold uppercase ${colors.text}`}>{node.type}</span>
        <span className={`w-2 h-2 rounded-full ${
          node.status === 'active' ? 'bg-emerald-500' :
          node.status === 'error' ? 'bg-rose-500' :
          'bg-amber-500'
        }`} />
      </div>
      <div className="text-xs font-semibold text-slate-900 mb-0.5">{node.label}</div>
      <div className="text-[10px] text-slate-500 truncate">{node.details}</div>
    </div>
  );
}

// ─────────────────────────── Access Tab (LIVE) ───────────────────────────

function AccessTab({ dg }: { dg: ReturnType<typeof useDataGovernance> }) {
  if (dg.loading) return <LoadingState />;
  if (dg.error) return <ErrorState message={dg.error} onRetry={dg.refresh} />;

  const { accessEntries, pendingApprovals } = dg;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Resource ownership and access control for deployments, guardrails, and services.
        </p>
        <LiveDataBadge />
      </div>

      {/* Pending Approvals */}
      {pendingApprovals.filter(a => a.status === 'pending' || a.status === 'running').length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <h3 className="text-sm font-semibold text-amber-900 mb-3">Pending Service Approvals</h3>
          <div className="space-y-2">
            {pendingApprovals
              .filter(a => a.status === 'pending' || a.status === 'running')
              .map(approval => (
                <div key={approval.slug} className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-100">
                  <div>
                    <span className="text-sm font-medium text-slate-900">{approval.service}</span>
                    <span className="ml-2 text-xs text-slate-500">{approval.framework.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">
                      Requested by {approval.requestedBy}
                    </span>
                    <span className={`text-[10px] px-2 py-1 rounded font-medium ${
                      approval.status === 'running' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {approval.status}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Access Control Matrix */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-900">Resource Access Matrix</h3>
        </div>

        {accessEntries.length === 0 ? (
          <EmptyState
            icon="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            title="No resources found"
            description="Deploy agents or create guardrails to see the access control matrix with principals and permissions."
            actionLabel="Browse Applications"
            actionLink="/applications"
            tips={['Deployed resources will show their access levels and owners']}
          />
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600">
                <th scope="col" className="px-4 py-3 font-medium">Resource</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium">Owner</th>
                <th scope="col" className="px-4 py-3 font-medium">Access Level</th>
                <th scope="col" className="px-4 py-3 font-medium">AWS Account</th>
                <th scope="col" className="px-4 py-3 font-medium">Region</th>
                <th scope="col" className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {accessEntries.slice(0, 20).map((entry, i) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{entry.resourceName}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[9px] px-2 py-1 rounded font-medium ${
                      entry.resourceType === 'deployment' ? 'bg-blue-100 text-blue-700' :
                      entry.resourceType === 'guardrail' ? 'bg-emerald-100 text-emerald-700' :
                      entry.resourceType === 'service' ? 'bg-violet-100 text-violet-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {entry.resourceType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{entry.owner}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[9px] px-2 py-1 rounded font-medium ${
                      entry.accessLevel === 'admin' ? 'bg-rose-100 text-rose-700' :
                      entry.accessLevel === 'write' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {entry.accessLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{entry.awsAccount}</td>
                  <td className="px-4 py-3 text-slate-500">{entry.awsRegion}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Service Approval History */}
      {pendingApprovals.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Service Approval History</h3>
          <div className="space-y-2">
            {pendingApprovals.map(approval => (
              <div key={approval.slug} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-900">{approval.service}</span>
                  <span className="text-xs text-slate-500">{approval.framework.toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-1">
                    {approval.phases.slice(0, 4).map((phase, i) => (
                      <span
                        key={i}
                        className={`w-2 h-2 rounded-full ${
                          phase.status === 'complete' ? 'bg-emerald-500' :
                          phase.status === 'running' ? 'bg-blue-500' :
                          phase.status === 'failed' ? 'bg-rose-500' :
                          'bg-slate-300'
                        }`}
                        title={`${phase.key}: ${phase.status}`}
                      />
                    ))}
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded font-medium ${
                    approval.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                    approval.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                    approval.status === 'running' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {approval.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Maturity Journey Tab ───────────────────────────

type MaturitySubTab = 'assessment' | 'gaps' | 'roadmap' | 'aws' | 'raci';

function MaturityJourneyTab() {
  const [subTab, setSubTab] = useState<MaturitySubTab>('assessment');
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const dimensionScores = MATURITY_QUESTIONS.map(q => ({
    dimension: q.dimension,
    score: answers[q.dimension] ?? 0,
    answered: q.dimension in answers,
  }));

  const answeredCount = Object.keys(answers).length;
  const avgScore = answeredCount > 0
    ? dimensionScores.reduce((s, d) => s + d.score, 0) / answeredCount
    : 0;

  const currentLevel = MATURITY_LEVELS.find(l => avgScore >= l.range[0] && avgScore <= l.range[1])
    ?? MATURITY_LEVELS[0];

  const highGaps = MATURITY_ROADMAP.gaps.filter(g => g.severity === 'high').length;
  const activeServices = MATURITY_ROADMAP.awsServices.filter(s => s.status === 'active').length;

  const radarData = MATURITY_QUESTIONS.map(q => ({
    dimension: q.dimension.split(' ').slice(0, 2).join(' '),
    score: answers[q.dimension] ?? 0,
    target: 3,
  }));

  const SUB_TABS = [
    { id: 'assessment' as const, label: 'Self-Assessment' },
    { id: 'gaps' as const, label: 'Gap Analysis' },
    { id: 'roadmap' as const, label: 'Roadmap' },
    { id: 'aws' as const, label: 'AWS Services' },
    { id: 'raci' as const, label: 'RACI Matrix' },
  ];

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-gradient-to-r from-slate-50/80 to-blue-50/80 rounded-xl border border-blue-200/60 backdrop-blur-sm shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Data Governance Maturity Journey</h2>
            <p className="text-sm text-slate-600 mt-1">
              Initial → Developing → Defined → Optimizing maturity model with AWS implementation guidance.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
              avgScore >= 3.5 ? 'bg-emerald-100 text-emerald-700' :
              avgScore >= 2.5 ? 'bg-blue-100 text-blue-700' :
              avgScore >= 1.5 ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              {answeredCount > 0 ? `${avgScore.toFixed(1)}/4.0` : 'Not Started'} {answeredCount > 0 && `(${currentLevel.level})`}
            </span>
            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
              {answeredCount}/{MATURITY_QUESTIONS.length} answered
            </span>
            <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded text-xs font-medium">
              {highGaps} high-severity gaps
            </span>
          </div>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl w-fit">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              subTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Assessment Sub-Tab */}
      {subTab === 'assessment' && (
        <div className="space-y-6">
          {/* Score summary cards */}
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center border-t-4 border-t-blue-500">
              <div className="text-2xl font-bold text-blue-600">{avgScore.toFixed(1)}/4.0</div>
              <div className="text-xs text-slate-500">Overall Score</div>
              <span className={`mt-2 inline-block px-2 py-0.5 rounded text-xs font-medium ${
                avgScore >= 3.5 ? 'bg-emerald-100 text-emerald-700' :
                avgScore >= 2.5 ? 'bg-blue-100 text-blue-700' :
                avgScore >= 1.5 ? 'bg-amber-100 text-amber-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {currentLevel.level}
              </span>
            </div>
            {MATURITY_LEVELS.map((level, i) => {
              const count = dimensionScores.filter(d => d.answered && d.score >= level.range[0] && d.score <= level.range[1]).length;
              return (
                <div key={i} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center">
                  <div className="text-2xl font-bold" style={{ color: level.color }}>{count}</div>
                  <div className="text-xs text-slate-500">Dimensions at {level.level}</div>
                </div>
              );
            })}
          </div>

          {/* Radar and bar charts */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Maturity Radar</h3>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#cbd5e1" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 4]} tick={{ fill: '#64748b', fontSize: 10 }} />
                  <Radar name="Current" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  <Radar name="Target" dataKey="target" stroke="#f59e0b" fill="none" strokeDasharray="5 5" />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Dimension Scores</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dimensionScores.map(d => ({ name: d.dimension.split(' ').slice(0, 2).join(' '), score: d.score }))} layout="vertical" margin={{ left: 100, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 4]} tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} width={95} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="score" name="Score" radius={[0, 4, 4, 0]}>
                    {dimensionScores.map((d, i) => (
                      <Cell key={i} fill={d.score >= 3.5 ? '#10b981' : d.score >= 2.5 ? '#3b82f6' : d.score >= 1.5 ? '#f59e0b' : '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Assessment Questions */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Self-Assessment Questionnaire</h3>
              <MockDataBadge />
            </div>
            <div className="space-y-4">
              {MATURITY_QUESTIONS.map((q, qi) => (
                <div key={qi} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">{q.dimension}</span>
                    {answers[q.dimension] && (
                      <span className={`text-xs px-2 py-1 rounded font-medium ${
                        answers[q.dimension] >= 3.5 ? 'bg-emerald-100 text-emerald-700' :
                        answers[q.dimension] >= 2.5 ? 'bg-blue-100 text-blue-700' :
                        answers[q.dimension] >= 1.5 ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        Score: {answers[q.dimension]}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 mb-3">{q.question}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {q.options.map((opt, oi) => (
                      <button
                        key={oi}
                        onClick={() => setAnswers(prev => ({ ...prev, [q.dimension]: opt.score }))}
                        className={`p-3 rounded-lg border text-left text-xs transition-all ${
                          answers[q.dimension] === opt.score
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            opt.level === 'Optimizing' ? 'bg-emerald-100 text-emerald-700' :
                            opt.level === 'Defined' ? 'bg-blue-100 text-blue-700' :
                            opt.level === 'Developing' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {opt.level}
                          </span>
                          <span className="text-[10px] text-slate-400">Score: {opt.score}</span>
                        </div>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Current level recommendations */}
          {answeredCount > 0 && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5" style={{ borderTopColor: currentLevel.color, borderTopWidth: '4px' }}>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Current Level: {currentLevel.level}</h3>
              <p className="text-sm text-slate-600 mb-4">{currentLevel.desc}</p>
              <div className="text-xs font-semibold text-slate-700 mb-2">Recommended Actions:</div>
              <ul className="space-y-1">
                {currentLevel.actions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="text-blue-500 mt-0.5">→</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Gap Analysis Sub-Tab */}
      {subTab === 'gaps' && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            {MATURITY_ROADMAP.gaps.length} gaps identified across {new Set(MATURITY_ROADMAP.gaps.map(g => g.domain)).size} domains. {highGaps} are high severity and should be addressed in the next quarter.
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">Gap Analysis with Remediation</h3>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-600">
                  <th scope="col" className="px-4 py-3 font-medium">Gap</th>
                  <th scope="col" className="px-4 py-3 font-medium">Domain</th>
                  <th scope="col" className="px-4 py-3 font-medium">Severity</th>
                  <th scope="col" className="px-4 py-3 font-medium">Remediation</th>
                  <th scope="col" className="px-4 py-3 font-medium">Effort</th>
                  <th scope="col" className="px-4 py-3 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody>
                {MATURITY_ROADMAP.gaps.map((g, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 max-w-[200px]">{g.gap}</td>
                    <td className="px-4 py-3 text-slate-600">{g.domain}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[9px] px-2 py-1 rounded font-medium ${
                        g.severity === 'high' ? 'bg-rose-100 text-rose-700' :
                        g.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {g.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[300px]">{g.remediation}</td>
                    <td className="px-4 py-3">
                      <span className="text-[9px] px-2 py-1 rounded bg-slate-100 text-slate-600">{g.effort}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{g.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Roadmap Sub-Tab */}
      {subTab === 'roadmap' && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-6">
            {MATURITY_ROADMAP.phases.map((phase, i) => (
              <div key={i} className="bg-white rounded-xl border-2 p-5" style={{ borderColor: phase.color }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold" style={{ color: phase.color }}>{phase.name}</h3>
                  <span className="text-xs text-slate-500">{phase.timeline}</span>
                </div>
                <p className="text-xs text-slate-600 mb-3">{phase.description}</p>
                <div className="text-xs text-slate-400 mb-3">Target: {phase.targetScore.toFixed(1)}/4.0</div>
                <div className="space-y-2">
                  {phase.tasks.map((item, j) => (
                    <div key={j} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-medium mt-0.5 ${
                        item.status === 'done' ? 'bg-emerald-100 text-emerald-700' :
                        item.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {item.status === 'done' ? 'Done' : item.status === 'in-progress' ? 'Active' : 'Planned'}
                      </span>
                      <div className="flex-1">
                        <div>{item.task}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{item.owner} · {item.effort} effort</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AWS Services Sub-Tab */}
      {subTab === 'aws' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            AWS services for implementing each data governance domain. {activeServices} of {MATURITY_ROADMAP.awsServices.length} domains have active implementations.
          </div>
          <div className="grid grid-cols-2 gap-4">
            {MATURITY_ROADMAP.awsServices.map((svc, i) => (
              <div key={i} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-900">{svc.domain}</h4>
                  <span className={`text-[9px] px-2 py-1 rounded font-medium ${
                    svc.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                    svc.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {svc.status === 'active' ? 'Active' : svc.status === 'partial' ? 'Partial' : 'Not Started'}
                  </span>
                </div>
                <div className="text-xs text-blue-600 font-medium mb-1">{svc.services}</div>
                <p className="text-xs text-slate-600">{svc.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RACI Sub-Tab */}
      {subTab === 'raci' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            RACI matrix for data governance activities. <strong>R</strong> = Responsible (does the work), <strong>A</strong> = Accountable (owns the outcome), <strong>C</strong> = Consulted (provides input), <strong>I</strong> = Informed (kept in the loop).
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">Data Governance RACI Matrix</h3>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th scope="col" className="px-4 py-3 font-medium text-slate-600">Activity</th>
                  <th scope="col" className="px-4 py-3 font-medium text-blue-600">Responsible</th>
                  <th scope="col" className="px-4 py-3 font-medium text-rose-600">Accountable</th>
                  <th scope="col" className="px-4 py-3 font-medium text-amber-600">Consulted</th>
                  <th scope="col" className="px-4 py-3 font-medium text-slate-500">Informed</th>
                </tr>
              </thead>
              <tbody>
                {MATURITY_ROADMAP.raci.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.activity}</td>
                    <td className="px-4 py-3 text-blue-700">{r.responsible}</td>
                    <td className="px-4 py-3 text-rose-700">{r.accountable}</td>
                    <td className="px-4 py-3 text-amber-700">{r.consulted}</td>
                    <td className="px-4 py-3 text-slate-500">{r.informed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Key Roles */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Key Roles</h3>
            <div className="grid grid-cols-4 gap-4">
              {[
                { role: 'Chief Data Officer', desc: 'Accountable for overall data governance strategy, maturity roadmap, and alignment with business objectives.', color: '#3b82f6' },
                { role: 'Data Governance Lead', desc: 'Responsible for day-to-day governance operations, policy enforcement, steward coordination, and quality metrics.', color: '#10b981' },
                { role: 'Domain Stewards', desc: 'Own data quality, freshness SLAs, and access policies within their assigned business domain.', color: '#f59e0b' },
                { role: 'ML Platform Team', desc: 'Implements technical controls: lineage, cataloging, guardrails, and drift monitoring for AI workloads.', color: '#8b5cf6' },
              ].map((r, i) => (
                <div key={i} className="p-4 rounded-lg border" style={{ borderColor: r.color }}>
                  <div className="text-sm font-semibold mb-2" style={{ color: r.color }}>{r.role}</div>
                  <p className="text-xs text-slate-600">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Data Quality Tab ───────────────────────────

function QualityTab() {
  const passed = QUALITY_RULES.filter(r => r.status === 'pass').length;
  const failed = QUALITY_RULES.filter(r => r.status === 'fail').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Automated data quality rules monitoring across all AI-feeding datasets.
        </p>
        <MockDataBadge />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center border-t-4 border-t-blue-500">
          <div className="text-2xl font-bold text-blue-600">{QUALITY_RULES.length}</div>
          <div className="text-xs text-slate-500">Total Rules</div>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{passed}</div>
          <div className="text-xs text-emerald-600">Passing</div>
        </div>
        <div className="bg-rose-50 rounded-xl border border-rose-200 p-4 text-center">
          <div className="text-2xl font-bold text-rose-600">{failed}</div>
          <div className="text-xs text-rose-600">Failing</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-slate-700">{Math.round((passed / QUALITY_RULES.length) * 100)}%</div>
          <div className="text-xs text-slate-500">Pass Rate</div>
        </div>
      </div>

      {/* Responsible AI Metrics */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Responsible AI Metrics</h3>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Fairness Score</div>
            <div className="text-xl font-bold text-blue-600">{RESPONSIBLE_AI_METRICS.fairnessScore}%</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Models Scanned</div>
            <div className="text-xl font-bold text-slate-700">{RESPONSIBLE_AI_METRICS.biasDetection.modelsScanned}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Bias Issues</div>
            <div className="text-xl font-bold text-amber-600">{RESPONSIBLE_AI_METRICS.biasDetection.issuesFound}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Drift Alerts</div>
            <div className="text-xl font-bold text-rose-600">{RESPONSIBLE_AI_METRICS.driftMonitoring.driftDetected}</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th scope="col" className="pb-2 font-medium">Model</th>
                <th scope="col" className="pb-2 font-medium">Metric</th>
                <th scope="col" className="pb-2 font-medium">Value</th>
                <th scope="col" className="pb-2 font-medium">Threshold</th>
                <th scope="col" className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {RESPONSIBLE_AI_METRICS.biasDetection.details.map((d, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-medium text-slate-900">{d.model}</td>
                  <td className="py-2 text-slate-600">{d.metric}</td>
                  <td className="py-2 font-mono text-slate-700">{d.value.toFixed(2)}</td>
                  <td className="py-2 font-mono text-slate-500">{d.threshold}</td>
                  <td className="py-2">
                    <span className={`text-[9px] px-2 py-1 rounded font-medium ${
                      d.status === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                      d.status === 'warning' ? 'bg-amber-100 text-amber-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {d.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quality rules table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-900">Data Quality Rules</h3>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-left text-slate-600">
              <th scope="col" className="px-4 py-3 font-medium">Dataset</th>
              <th scope="col" className="px-4 py-3 font-medium">Rule</th>
              <th scope="col" className="px-4 py-3 font-medium">Field</th>
              <th scope="col" className="px-4 py-3 font-medium">Threshold</th>
              <th scope="col" className="px-4 py-3 font-medium">Actual</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Last Run</th>
            </tr>
          </thead>
          <tbody>
            {QUALITY_RULES.map((rule, i) => (
              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{rule.dataset}</td>
                <td className="px-4 py-3 text-slate-600">{rule.rule}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-slate-600">{rule.field}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{rule.threshold}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-slate-700">{rule.actual}</td>
                <td className="px-4 py-3">
                  <span className={`text-[9px] px-2 py-1 rounded font-semibold ${
                    rule.status === 'pass' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {rule.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{rule.lastRun}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ─────────────────────────── Metadata Tab ───────────────────────────

function MetadataTab() {
  const [selectedSchema, setSelectedSchema] = useState(METADATA_SCHEMAS[0].id);
  const schema = METADATA_SCHEMAS.find(s => s.id === selectedSchema) || METADATA_SCHEMAS[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Metadata schemas for RAG applications with intelligent filtering support.
        </p>
        <MockDataBadge />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center border-t-4 border-t-blue-500">
          <div className="text-2xl font-bold text-blue-600">{METADATA_EXTRACTION_STATS.totalDocuments.toLocaleString()}</div>
          <div className="text-xs text-slate-500">Total Documents</div>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{METADATA_EXTRACTION_STATS.coveragePercent}%</div>
          <div className="text-xs text-emerald-600">Metadata Coverage</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-slate-700">{METADATA_EXTRACTION_STATS.autoExtracted.toLocaleString()}</div>
          <div className="text-xs text-slate-500">Auto-Extracted</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-slate-700">{METADATA_EXTRACTION_STATS.avgAttributesPerDoc}</div>
          <div className="text-xs text-slate-500">Avg Attributes/Doc</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-violet-600">{METADATA_SCHEMAS.length}</div>
          <div className="text-xs text-slate-500">Schemas</div>
        </div>
      </div>

      {/* Schema selector */}
      <div className="flex gap-2">
        {METADATA_SCHEMAS.map(s => (
          <button
            key={s.id}
            onClick={() => setSelectedSchema(s.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedSchema === s.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Schema detail */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">{schema.name}</h3>
          <p className="text-xs text-slate-500 mb-4">{schema.description}</p>

          <h4 className="text-xs font-semibold text-slate-700 mb-2">Metadata Attributes</h4>
          <div className="space-y-2">
            {schema.attributes.map((attr, i) => (
              <div key={i} className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-slate-900">{attr.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">{attr.type}</span>
                    {attr.required && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded">required</span>
                    )}
                    {attr.filterable && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">filterable</span>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-slate-500">
                  Examples: {attr.examples.slice(0, 3).join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <h4 className="text-xs font-semibold text-slate-700 mb-3">Pre-built RAG Filters</h4>
            <div className="space-y-2">
              {schema.ragFilters.map((f, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-900">{f.name}</span>
                  </div>
                  <div className="font-mono text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded mb-1">
                    {f.filter}
                  </div>
                  <div className="text-[10px] text-slate-500">{f.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <h4 className="text-xs font-semibold text-slate-700 mb-3">Filter Usage Stats</h4>
            <div className="space-y-2">
              {METADATA_EXTRACTION_STATS.filterUsage.slice(0, 4).map((f, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-slate-600">{f.filter}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{f.usageCount.toLocaleString()} uses</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                      {f.successRate}% success
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent extractions */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <h4 className="text-sm font-semibold text-slate-900 mb-3">Recent Metadata Extractions</h4>
        <div className="space-y-2">
          {METADATA_EXTRACTION_STATS.recentExtractions.map((ext, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <span className="text-xs font-medium text-slate-900">{ext.document}</span>
                <span className="ml-2 text-[10px] text-slate-500">
                  {ext.attributes} attributes extracted
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500">
                  Confidence: <span className="font-semibold text-emerald-600">{(ext.confidence * 100).toFixed(0)}%</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  {new Date(ext.timestamp).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────── Shared Components ───────────────────────────

function KpiCard({ label, value, subtext, color }: {
  label: string;
  value: string | number;
  subtext: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: 'border-t-blue-500 text-blue-600',
    emerald: 'border-t-emerald-500 text-emerald-600',
    violet: 'border-t-violet-500 text-violet-600',
    amber: 'border-t-amber-500 text-amber-600',
    cyan: 'border-t-cyan-500 text-cyan-600',
  };

  return (
    <div className={`bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 border-t-4 ${colors[color]?.split(' ')[0] || 'border-t-slate-500'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Live data" />
      </div>
      <div className={`text-2xl font-bold ${colors[color]?.split(' ')[1] || 'text-slate-900'}`}>{value}</div>
      <div className="text-[10px] text-slate-500 truncate">{subtext}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-rose-50 rounded-xl border border-rose-200 p-8 text-center">
      <p className="text-rose-700 mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700"
      >
        Retry
      </button>
    </div>
  );
}
