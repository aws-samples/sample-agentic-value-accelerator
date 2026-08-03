/**
 * DataGovernanceLanding — Hub for data governance sub-modules
 *
 * Tabs:
 * - Dashboard: KPIs, charts, metrics at a glance
 * - Tools: Core capabilities, Knowledge Architecture, Assessment modules
 * - Setup: Getting started guide, maturity assessment
 */

import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDataGovernance } from './useDataGovernance';
import { LiveDataBadge } from '../DataSourceIndicator';
import { SetupGuidanceCard } from '../SetupGuidanceCard';
import { governDataCatalogApi, type DataCatalogSummary } from '../../../api/client';
import { MATURITY_QUESTIONS, MATURITY_LEVELS, DATA_DOMAINS, QUALITY_RULES, AI_DATASETS, tooltipStyle } from './dataGovernanceData';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Icon, type IconName } from '../icons';
import KnowledgeSources from './KnowledgeSources';
import RagSecurityControls from './RagSecurityControls';
import CoreBadge from '../CoreBadge';

// ─────────────────────────── Constants ───────────────────────────

function sensitivityBucket(classification: string): string {
  const c = classification.toLowerCase();
  if (c.includes('phi')) return 'PHI';
  if (c.includes('pci')) return 'PCI';
  if (c.includes('pii')) return 'PII';
  if (c.includes('public') || c.includes('synthetic') || c.includes('no pii')) return 'Public / Synthetic';
  if (c.includes('regulatory') || c.includes('government')) return 'Regulatory';
  if (c.includes('confidential') || c.includes('restricted')) return 'Confidential / Restricted';
  return 'Other';
}

const SENSITIVITY_COLORS: Record<string, string> = {
  'PHI': '#ef4444', 'PCI': '#f59e0b', 'PII': '#8b5cf6',
  'Regulatory': '#3b82f6', 'Confidential / Restricted': '#0ea5e9',
  'Public / Synthetic': '#10b981', 'Other': '#94a3b8',
};

// Tab definitions matching FinOps style
type Tab = 'dashboard' | 'lineage' | 'quality' | 'knowledge' | 'assessment';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'lineage', label: 'Lineage' },
  { id: 'quality', label: 'Quality' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'assessment', label: 'Assessment' },
];

// Module definitions
const PRIMARY_MODULES: { id: string; path: string; label: string; description: string; icon: IconName; color: string }[] = [
  { id: 'agents', path: '/govern/data/agents', label: 'Agent Data Profiles', description: 'Data sources, guardrails, and protection status', icon: 'cpu-chip', color: 'indigo' },
  { id: 'lineage', path: '/govern/data/lineage', label: 'Data Lineage', description: 'Track data provenance and flow visualization', icon: 'link', color: 'blue' },
  { id: 'access', path: '/govern/data/access', label: 'Access Control', description: 'Service approvals and permission tracking', icon: 'finger-print', color: 'rose' },
  { id: 'quality', path: '/govern/data/quality', label: 'Data Quality', description: 'Quality rules and validation monitoring', icon: 'check-circle', color: 'emerald' },
];

const KNOWLEDGE_MODULES: { id: string; path: string; label: string; description: string; icon: IconName; color: string }[] = [
  { id: 'graphrag', path: '/govern/data/graphrag', label: 'GraphRAG', description: 'Knowledge graph-enhanced retrieval', icon: 'sparkles', color: 'purple' },
  { id: 'ontology', path: '/govern/data/ontology', label: 'Data Ontology', description: 'Semantic layer for AI agents', icon: 'circle-stack', color: 'indigo' },
  { id: 'taxonomy', path: '/govern/data/taxonomy', label: 'Data Taxonomy', description: 'Hierarchical classification schemas', icon: 'folder', color: 'emerald' },
  { id: 'glossary', path: '/govern/data/glossary', label: 'Business Glossary', description: 'Standardized terminology', icon: 'book-open', color: 'blue' },
];

const ASSESSMENT_MODULES: { id: string; path: string; label: string; description: string; icon: IconName; color: string }[] = [
  { id: 'readiness', path: '/govern/data/readiness', label: 'AI Readiness', description: '7-dimension assessment', icon: 'viewfinder-circle', color: 'cyan' },
  { id: 'maturity', path: '/govern/data/maturity', label: 'Maturity Journey', description: 'Improvement roadmap', icon: 'chart-line', color: 'amber' },
  { id: 'metadata', path: '/govern/data/metadata', label: 'Metadata Management', description: 'RAG metadata schemas', icon: 'tag', color: 'violet' },
];

const colorClasses: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  emerald: { bg: 'from-emerald-50 to-green-50', border: 'border-emerald-200/60', text: 'text-emerald-800', iconBg: 'bg-emerald-500' },
  violet: { bg: 'from-violet-50 to-purple-50', border: 'border-violet-200/60', text: 'text-violet-800', iconBg: 'bg-violet-500' },
  purple: { bg: 'from-purple-50 to-fuchsia-50', border: 'border-purple-200/60', text: 'text-purple-800', iconBg: 'bg-purple-500' },
  cyan: { bg: 'from-cyan-50 to-blue-50', border: 'border-cyan-200/60', text: 'text-cyan-800', iconBg: 'bg-cyan-500' },
  blue: { bg: 'from-blue-50 to-indigo-50', border: 'border-blue-200/60', text: 'text-blue-800', iconBg: 'bg-blue-500' },
  amber: { bg: 'from-amber-50 to-yellow-50', border: 'border-amber-200/60', text: 'text-amber-800', iconBg: 'bg-amber-500' },
  indigo: { bg: 'from-indigo-50 to-violet-50', border: 'border-indigo-200/60', text: 'text-indigo-800', iconBg: 'bg-indigo-500' },
  rose: { bg: 'from-rose-50 to-pink-50', border: 'border-rose-200/60', text: 'text-rose-800', iconBg: 'bg-rose-500' },
};

// ─────────────────────────── Main Component ───────────────────────────

export default function DataGovernanceLanding() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('data-governance-tab');
    return (saved as Tab) || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('data-governance-tab', activeTab);
  }, [activeTab]);

  const dg = useDataGovernance();
  const [catalog, setCatalog] = useState<DataCatalogSummary | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    governDataCatalogApi.summary()
      .then(data => { if (!cancelled) setCatalog(data); })
      .catch(err => console.warn('Data catalog fetch failed:', err))
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Chart data computations
  const domainChartData = useMemo(() => {
    if (catalog?.catalog.live && catalog.catalog.domains.length > 0) {
      return catalog.catalog.domains.slice(0, 8).map(d => ({
        name: d.name.split('_')[0].substring(0, 12),
        datasets: d.table_count,
        isLive: true,
      }));
    }
    return DATA_DOMAINS.map(d => ({ name: d.name.split(' ')[0], datasets: d.datasets, isLive: false }));
  }, [catalog]);

  const sensitivityChartData = useMemo(() => {
    if (catalog?.sensitivity.live && catalog.sensitivity.sensitivity_breakdown.length > 0) {
      return catalog.sensitivity.sensitivity_breakdown.map(b => ({ name: b.category, value: b.count, color: b.color, isLive: true }));
    }
    const counts = AI_DATASETS.reduce<Record<string, number>>((acc, d) => {
      const k = sensitivityBucket(d.classification);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: SENSITIVITY_COLORS[name] ?? '#94a3b8', isLive: false }));
  }, [catalog]);

  const qualityChartData = useMemo(() => {
    if (catalog?.catalog.live && catalog.catalog.total_quality_rules > 0) {
      const pass = catalog.catalog.quality_rules_passing;
      const fail = catalog.catalog.total_quality_rules - pass;
      return { data: [{ name: 'Passing', value: pass, color: '#10b981' }, { name: 'Failing', value: fail, color: '#ef4444' }], total: catalog.catalog.total_quality_rules, passRate: Math.round((pass / catalog.catalog.total_quality_rules) * 100), isLive: true };
    }
    const pass = QUALITY_RULES.filter(r => r.status === 'pass').length;
    const fail = QUALITY_RULES.length - pass;
    return { data: [{ name: 'Passing', value: pass, color: '#10b981' }, { name: 'Failing', value: fail, color: '#ef4444' }], total: QUALITY_RULES.length, passRate: QUALITY_RULES.length ? Math.round((pass / QUALITY_RULES.length) * 100) : 0, isLive: false };
  }, [catalog]);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Govern
        </Link>

        {/* Header */}
        <div className="flex items-end justify-between mt-3 mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Data Governance</h1>
              <CoreBadge pillar="show" />
              <LiveDataBadge />
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Ensure your data is AI-ready with quality controls, lineage tracking, and access governance.
            </p>
          </div>
        </div>

        {/* Tab navigation - matches FinOps style */}
        <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit" role="tablist" aria-label="Data Governance sections">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'dashboard' && (
          <DashboardTab
            dg={dg}
            catalogLoading={catalogLoading}
            catalog={catalog}
            domainChartData={domainChartData}
            sensitivityChartData={sensitivityChartData}
            qualityChartData={qualityChartData}
          />
        )}

        {activeTab === 'lineage' && <LineageTab />}
        {activeTab === 'quality' && <QualityTab />}
        {activeTab === 'knowledge' && <KnowledgeTab />}
        {activeTab === 'assessment' && <AssessmentTab />}
      </div>
    </div>
  );
}

// ─────────────────────────── Dashboard Tab ───────────────────────────

interface DashboardTabProps {
  dg: ReturnType<typeof useDataGovernance>;
  catalogLoading: boolean;
  catalog: DataCatalogSummary | null;
  domainChartData: { name: string; datasets: number; isLive: boolean }[];
  sensitivityChartData: { name: string; value: number; color: string; isLive: boolean }[];
  qualityChartData: { data: { name: string; value: number; color: string }[]; total: number; passRate: number; isLive: boolean };
}

function DashboardTab({ dg, catalogLoading, catalog, domainChartData, sensitivityChartData, qualityChartData }: DashboardTabProps) {
  return (
    <div className="space-y-6">
      {/* Hero KPIs */}
      {dg.loading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : !dg.error && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Guardrails Active', value: dg.summary.activeGuardrails, sub: `${dg.summary.totalGuardrails} total configured`, tone: dg.summary.activeGuardrails > 0 ? 'text-emerald-600' : 'text-amber-600' },
            { label: 'PII Types Protected', value: dg.summary.uniquePiiTypes.length, sub: dg.summary.uniquePiiTypes.slice(0, 3).join(', ') + (dg.summary.uniquePiiTypes.length > 3 ? '…' : '') || 'none configured', tone: dg.summary.uniquePiiTypes.length > 0 ? 'text-violet-600' : 'text-slate-400' },
            { label: 'Deployments', value: dg.summary.totalAgents, sub: dg.summary.agentsWithGuardrails > 0 ? `${dg.summary.agentsWithGuardrails} with guardrails` : 'no guardrail params', tone: dg.summary.totalAgents > 0 ? 'text-blue-600' : 'text-slate-400' },
            { label: 'Events (24h)', value: dg.summary.last24hEvents.total, sub: `${dg.summary.last24hEvents.blocked} blocked · ${dg.summary.last24hEvents.anonymized} anonymized`, tone: dg.summary.last24hEvents.blocked > 0 ? 'text-amber-600' : 'text-slate-600' },
            { label: 'Data Readiness', value: `${dg.readinessMetrics.overallScore}%`, sub: '7-dimension assessment', tone: dg.readinessMetrics.overallScore >= 70 ? 'text-emerald-600' : dg.readinessMetrics.overallScore >= 40 ? 'text-amber-600' : 'text-rose-600' },
          ].map(k => (
            <div key={k.label} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{k.label}</div>
              <div className={`text-2xl font-semibold mt-1 ${k.tone}`}>{k.value}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Readiness Radar + Quality by Domain */}
      {!dg.loading && !dg.error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">AI-Readiness by Dimension</h3>
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={dg.readinessMetrics.dimensions.map(d => ({ dimension: d.name, score: Math.round((d.score / d.maxScore) * 100) }))} outerRadius="70%">
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: '#64748b', fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.35} />
                <Tooltip contentStyle={tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Data Quality by Domain</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={DATA_DOMAINS.map(d => ({ name: d.name, quality: d.qualityScore }))} layout="vertical" margin={{ left: 20, right: 12 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#475569', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="quality" radius={[0, 4, 4, 0]} name="Quality Score">
                  {DATA_DOMAINS.map((d, i) => (
                    <Cell key={i} fill={d.qualityScore >= 90 ? '#10b981' : d.qualityScore >= 75 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Data Catalog, Sensitivity, Quality Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Data Catalog */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Data Catalog</h3>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${domainChartData[0]?.isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {domainChartData[0]?.isLive ? 'GLUE' : 'SAMPLE'}
            </span>
          </div>
          {catalogLoading ? (
            <div className="flex items-center justify-center h-[200px]">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : catalog?.catalog.setup_guidance && !catalog.catalog.live ? (
            <SetupGuidanceCard guidance={catalog.catalog.setup_guidance} compact />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={domainChartData} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={40} />
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="datasets" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Tables" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Data Sensitivity */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Data Sensitivity</h3>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${sensitivityChartData[0]?.isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {sensitivityChartData[0]?.isLive ? 'MACIE' : 'SAMPLE'}
            </span>
          </div>
          {catalogLoading ? (
            <div className="flex items-center justify-center h-[160px]">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : catalog?.sensitivity.setup_guidance && !catalog.sensitivity.live ? (
            <SetupGuidanceCard guidance={catalog.sensitivity.setup_guidance} compact />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={sensitivityChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {sensitivityChartData.map(d => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
                {sensitivityChartData.map(d => (
                  <span key={d.name} className="flex items-center gap-1 text-[10px] text-slate-600">
                    <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />{d.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Quality Rules */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Quality Rules</h3>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${qualityChartData.isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {qualityChartData.isLive ? 'GLUE DQ' : 'SAMPLE'}
            </span>
          </div>
          {catalogLoading ? (
            <div className="flex items-center justify-center h-[160px]">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : qualityChartData.total === 0 ? (
            <div className="flex flex-col items-center justify-center h-[160px] text-center">
              <div className="text-slate-400 text-sm mb-2">No quality rules</div>
              <a href="https://docs.aws.amazon.com/glue/latest/dg/data-quality.html" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700">
                Set up Glue Data Quality →
              </a>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={qualityChartData.data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {qualityChartData.data.map(d => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-center text-[11px] text-slate-500 mt-1">
                {qualityChartData.passRate}% of {qualityChartData.total} rules passing
              </div>
            </>
          )}
        </div>
      </div>

      {/* Data Protection Coverage */}
      {!dg.loading && !dg.error && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">Data Protection Coverage</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">LIVE</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mb-4">
            Agents with active guardrails protecting PII, PHI, PCI, and harmful content.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: 'Guardrail Coverage', protected: dg.summary.agentsWithGuardrails, total: dg.summary.totalAgents || dg.summary.agentsWithGuardrails, icon: 'shield-check' as IconName, unit: 'agents' },
              { label: 'PII Detection', protected: Math.min(dg.summary.uniquePiiTypes.length, 10), total: 10, icon: 'finger-print' as IconName, unit: 'types', actualCount: dg.summary.uniquePiiTypes.length },
              { label: 'Active Guardrails', protected: dg.summary.activeGuardrails, total: dg.summary.totalGuardrails || dg.summary.activeGuardrails, icon: 'shield' as IconName, unit: 'guardrails' },
              { label: 'Use Case Readiness', protected: Math.round(dg.readinessMetrics.overallScore / 20), total: 5, icon: 'chart-bar' as IconName, unit: 'level' },
            ].map(c => {
              const pct = c.total > 0 ? Math.min(100, Math.round((c.protected / c.total) * 100)) : 0;
              return (
                <div key={c.label} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-700 flex items-center gap-1.5"><Icon name={c.icon} className="w-3.5 h-3.5" />{c.label}</span>
                    <span className={`text-xs font-bold ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] mt-1.5">
                    <span className="text-emerald-600">{'actualCount' in c && c.actualCount !== c.protected ? c.actualCount : c.protected} {c.unit}</span>
                    <span className="text-slate-400">{c.total} {c.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Events */}
      {!dg.loading && dg.recentDataEvents.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-900">Recent Protection Events</span>
            <Link to="/govern/audit" className="text-xs text-blue-600 hover:text-blue-700 font-medium">View all →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {dg.recentDataEvents.slice(0, 3).map((event, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${event.action === 'block' ? 'bg-rose-100' : event.action === 'anonymize' ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                  <Icon name={event.action === 'block' ? 'no-symbol' : event.action === 'anonymize' ? 'lock-closed' : 'check-circle'} className={`w-4 h-4 ${event.action === 'block' ? 'text-rose-600' : event.action === 'anonymize' ? 'text-amber-600' : 'text-emerald-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-900 truncate">{event.guardrailName}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${event.action === 'block' ? 'bg-rose-100 text-rose-700' : event.action === 'anonymize' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
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
    </div>
  );
}

// ─────────────────────────── Lineage Tab ───────────────────────────

function LineageTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ModuleCard mod={PRIMARY_MODULES.find(m => m.id === 'lineage')!} />
        <ModuleCard mod={PRIMARY_MODULES.find(m => m.id === 'agents')!} />
      </div>
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <p className="text-xs text-blue-800">
          <strong>Data Lineage</strong> tracks how data flows through your AI systems — from source through processing to output.
          View caller origins, guardrail checkpoints, model inference, and response paths.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────── Quality Tab ───────────────────────────

function QualityTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ModuleCard mod={PRIMARY_MODULES.find(m => m.id === 'quality')!} />
        <ModuleCard mod={PRIMARY_MODULES.find(m => m.id === 'access')!} />
      </div>
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <p className="text-xs text-blue-800">
          <strong>Data Quality</strong> monitors validation rules from Bedrock Guardrails, AWS Config, and Glue Data Quality.
          Track pass rates, identify failing rules, and ensure data meets quality thresholds.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────── Knowledge Tab ───────────────────────────

function KnowledgeTab() {
  return (
    <div className="space-y-6">
      {/* Knowledge Sources from Operate Module */}
      <KnowledgeSources />

      {/* RAG Security Controls */}
      <div className="pt-4 border-t border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">RAG Security</h3>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-medium">OWASP LLM08</span>
        </div>
        <RagSecurityControls />
      </div>

      {/* Knowledge Architecture Modules */}
      <div className="pt-4 border-t border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Knowledge Architecture</h3>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">Semantic Layer</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {KNOWLEDGE_MODULES.map(mod => (
            <ModuleCard key={mod.id} mod={mod} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Assessment Tab ───────────────────────────

function AssessmentTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ASSESSMENT_MODULES.map(mod => (
          <ModuleCard key={mod.id} mod={mod} />
        ))}
      </div>
      <MaturityAssessment />
      <div className="pt-4 border-t border-slate-200">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-500">Related:</span>
          <Link to="/govern/compliance" className="text-xs px-3 py-1.5 bg-slate-100 rounded-lg hover:bg-blue-100 hover:text-blue-700 transition-colors">Compliance Center</Link>
          <Link to="/govern/finops" className="text-xs px-3 py-1.5 bg-slate-100 rounded-lg hover:bg-blue-100 hover:text-blue-700 transition-colors">Cost & FinOps</Link>
          <Link to="/govern/audit" className="text-xs px-3 py-1.5 bg-slate-100 rounded-lg hover:bg-blue-100 hover:text-blue-700 transition-colors">Audit & Incidents</Link>
        </div>
      </div>
    </div>
  );
}

function ModuleCard({ mod }: { mod: { id: string; path: string; label: string; description: string; icon: IconName; color: string } }) {
  const colors = colorClasses[mod.color] || colorClasses.blue;
  return (
    <Link
      to={mod.path}
      className={`bg-white/80 backdrop-blur-sm rounded-xl border ${colors.border} shadow-sm p-4 hover:shadow-md transition-shadow group`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-lg ${colors.iconBg} flex items-center justify-center text-white shadow-sm flex-shrink-0`}>
          <Icon name={mod.icon} className="w-5 h-5" />
        </div>
        <div>
          <div className={`text-sm font-semibold ${colors.text} group-hover:underline`}>{mod.label}</div>
        </div>
      </div>
      <p className="text-xs text-slate-600">{mod.description}</p>
    </Link>
  );
}

// ─────────────────────────── Setup Tab ───────────────────────────

function SetupTab() {
  return (
    <div className="space-y-6">
      {/* Maturity Assessment */}
      <MaturityAssessment />

      {/* How Data Protection Works */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-slate-900">How Data Protection Works</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">BEDROCK GUARDRAILS</span>
        </div>
        <div className="text-[11px] text-slate-500 mb-4">
          Every agent request flows through configured guardrails. PII is detected and masked before reaching the model. Harmful content is blocked. All events are logged for audit.
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {[
            { label: 'Agent Request', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
            { label: 'PII Detection', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
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
      </div>

      {/* Getting Started Links */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Getting Started</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mb-2">1</div>
            <div className="text-sm font-medium text-slate-800 mb-1">Configure Guardrails</div>
            <p className="text-xs text-slate-500 mb-2">Set up Bedrock Guardrails to protect AI inputs/outputs with PII detection and content filters.</p>
            <Link to="/secure/guardrails" className="text-xs text-blue-600 hover:text-blue-700 font-medium">Open Guardrails →</Link>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mb-2">2</div>
            <div className="text-sm font-medium text-slate-800 mb-1">Assess Readiness</div>
            <p className="text-xs text-slate-500 mb-2">Run the 7-dimension AI readiness assessment to identify gaps in your data governance posture.</p>
            <Link to="/govern/data/readiness" className="text-xs text-blue-600 hover:text-blue-700 font-medium">Start Assessment →</Link>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mb-2">3</div>
            <div className="text-sm font-medium text-slate-800 mb-1">Review Data Flows</div>
            <p className="text-xs text-slate-500 mb-2">Visualize how data moves through your AI systems with lineage tracking and protection status.</p>
            <Link to="/govern/data/lineage" className="text-xs text-blue-600 hover:text-blue-700 font-medium">View Lineage →</Link>
          </div>
        </div>
      </div>

      {/* AWS Services */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <p className="text-xs text-blue-800">
          <strong>AWS Services Used:</strong> Bedrock Guardrails (PII/content protection), CloudTrail (AI caller tracking),
          CloudWatch (invocation logs), AWS Config (compliance), Security Hub (findings). Optional: Glue Data Catalog,
          Glue Data Quality, Amazon Macie, Neptune Analytics.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────── Maturity Assessment ───────────────────────────

function MaturityAssessment() {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [expanded, setExpanded] = useState(false);

  const answered = Object.keys(answers).length;
  const total = MATURITY_QUESTIONS.length;
  const avgScore = answered > 0 ? Object.values(answers).reduce((s, v) => s + v, 0) / answered : 0;
  const maturityLevel = useMemo(() =>
    MATURITY_LEVELS.find(l => avgScore >= l.range[0] && avgScore <= l.range[1]) || MATURITY_LEVELS[0],
  [avgScore]);

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="text-left">
            <span className="text-sm font-semibold text-slate-800">Data Governance Maturity Self-Assessment</span>
            {answered === total && (
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded font-semibold text-white" style={{ backgroundColor: maturityLevel.color }}>
                {maturityLevel.level}
              </span>
            )}
            <div className="text-xs text-slate-500">{expanded ? 'Click to collapse' : 'Click to expand and assess your governance maturity'}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{answered}/{total} answered</span>
          <div className="w-20 h-1.5 bg-slate-200 rounded-full">
            <div className="h-1.5 bg-blue-500 rounded-full transition-all" style={{ width: `${(answered / total) * 100}%` }} />
          </div>
          <svg className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-200">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-3">
            {MATURITY_QUESTIONS.map((q, qi) => (
              <div
                key={qi}
                className="p-3 bg-slate-50 rounded-lg"
                style={{ borderLeft: `3px solid ${answers[qi] ? answers[qi] >= 3 ? '#10b981' : answers[qi] >= 2 ? '#f59e0b' : '#ef4444' : '#cbd5e1'}` }}
              >
                <div className="text-[11px] font-semibold text-slate-800 mb-1">{q.dimension}</div>
                <div className="text-[10px] text-slate-600 mb-2">{q.question}</div>
                <div className="space-y-1">
                  {q.options.map((opt, oi) => (
                    <button
                      key={oi}
                      onClick={() => setAnswers(prev => ({ ...prev, [qi]: opt.score }))}
                      className={`w-full text-left px-2 py-1.5 text-[10px] rounded transition-colors ${
                        answers[qi] === opt.score ? 'bg-blue-100 border border-blue-400 text-slate-800' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {answered === total && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg border" style={{ borderColor: `${maturityLevel.color}40` }}>
              <div className="grid grid-cols-[120px_1fr] gap-4">
                <div className="text-center">
                  <div className="text-4xl font-bold" style={{ color: maturityLevel.color }}>{avgScore.toFixed(1)}</div>
                  <div className="text-xs font-semibold" style={{ color: maturityLevel.color }}>{maturityLevel.level}</div>
                  <div className="text-[10px] text-slate-500 mt-1">of 4.0</div>
                </div>
                <div>
                  <p className="text-sm text-slate-700 mb-2">{maturityLevel.desc}</p>
                  <div className="text-xs text-blue-600 font-semibold mb-1">Priority Actions:</div>
                  {maturityLevel.actions.map((a, i) => (
                    <div key={i} className="text-xs text-slate-600 mb-0.5 pl-2">• {a}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
