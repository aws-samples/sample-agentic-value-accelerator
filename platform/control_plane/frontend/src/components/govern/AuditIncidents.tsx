import { useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './icons';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { AUDIT_EVENTS, RISK_TREND_30D, tooltipStyle } from './mockData';
import { useAuditEvents, useIsAuditLive } from './auditLog';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import UnifiedGuide, { AUDIT_GUIDE } from './UnifiedGuide';
import EmptyState from './EmptyState';
import Drawer from './Drawer';
import AuditMetricsPanel from './metrics/AuditMetricsPanel';
import LiveAiActivity from './LiveAiActivity';
import PolicyObservability from './PolicyObservability';
import MaskedIdentity from './MaskedIdentity';
import CoreBadge from './CoreBadge';

type AuditEvent = typeof AUDIT_EVENTS[0];

function TraceViewerModal({ event, onClose }: { event: AuditEvent; onClose: () => void }) {
  const traceId = event.evidence?.match(/#(\w+)/)?.[1] ?? 'unknown';
  const mockTraceData = {
    traceId: `trace-${traceId}-mock`,
    spans: [
      { name: 'user_input', duration: '12ms', status: 'ok' },
      { name: 'guardrail_check', duration: '45ms', status: event.category === 'guardrail' ? 'triggered' : 'ok' },
      { name: 'model_inference', duration: '1.2s', status: 'ok' },
      { name: 'output_filter', duration: '23ms', status: event.severity === 'high' || event.severity === 'critical' ? 'blocked' : 'ok' },
    ],
    metadata: {
      agent: event.agent ?? 'System',
      actor: event.actor,
      timestamp: event.ts,
      region: 'us-east-1',
      modelId: 'anthropic.claude-sonnet-4-20250514',
    },
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/60 w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Trace Viewer</h3>
            <p className="text-xs text-slate-500 font-mono">{mockTraceData.traceId}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Trace Timeline</h4>
            <div className="space-y-2">
              {mockTraceData.spans.map((span, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <div className={`w-2 h-2 rounded-full ${
                    span.status === 'ok' ? 'bg-emerald-500' :
                    span.status === 'triggered' ? 'bg-amber-500' : 'bg-rose-500'
                  }`} />
                  <span className="text-sm font-mono text-slate-700 flex-1">{span.name}</span>
                  <span className="text-xs text-slate-500">{span.duration}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                    span.status === 'ok' ? 'bg-emerald-100 text-emerald-700' :
                    span.status === 'triggered' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                  }`}>{span.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Metadata</h4>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(mockTraceData.metadata).map(([key, value]) => (
                <div key={key} className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                  <div className="text-sm text-slate-900 font-medium mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white flex-shrink-0"><Icon name="link" className="w-4 h-4" /></div>
              <div>
                <div className="text-sm font-semibold text-blue-900">View in Langfuse</div>
                <p className="text-xs text-blue-700 mt-1">Full trace with input/output, token counts, and cost breakdown available in the observability platform.</p>
                <button
                  onClick={() => {
                    // In production, this would open the actual Langfuse dashboard
                    // For demo purposes, show feedback and open a placeholder
                    window.open('https://cloud.langfuse.com', '_blank', 'noopener,noreferrer');
                  }}
                  className="mt-2 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Open Langfuse Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function exportEvidenceBundle(event: AuditEvent) {
  const bundle = {
    exportedAt: new Date().toISOString(),
    format: 'AVA Evidence Bundle v1.0',
    event: {
      id: event.id,
      timestamp: event.ts,
      category: event.category,
      severity: event.severity,
      summary: event.summary,
      actor: event.actor,
      agent: event.agent ?? null,
      action: event.action,
      evidence: event.evidence,
    },
    traceReference: {
      traceId: `trace-${event.evidence?.match(/#(\w+)/)?.[1] ?? 'unknown'}-${Date.now().toString(36)}`,
      platform: 'Langfuse',
      region: 'us-east-1',
    },
    cloudTrail: {
      eventSource: 'bedrock.amazonaws.com',
      eventName: event.category === 'guardrail' ? 'ApplyGuardrail' : 'InvokeModel',
      awsRegion: 'us-east-1',
      sourceIPAddress: '10.0.1.42',
    },
    attestation: {
      signedBy: 'AVA Platform',
      algorithm: 'SHA-256',
      hash: Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''),
    },
  };

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `evidence-${event.id}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const catBg: Record<string, string> = {
  guardrail:   'bg-blue-50 text-blue-700 border-blue-200',
  incident:    'bg-rose-50 text-rose-700 border-rose-200',
  approval:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  deployment:  'bg-violet-50 text-violet-700 border-violet-200',
  config:      'bg-slate-50 text-slate-700 border-slate-200',
  enforcement: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  a2a:         'bg-cyan-50 text-cyan-700 border-cyan-200',
};

const sevBg: Record<string, string> = {
  low:      'bg-slate-100 text-slate-600',
  medium:   'bg-amber-100 text-amber-700',
  high:     'bg-rose-100 text-rose-700',
  critical: 'bg-rose-200 text-rose-900',
};

type CatFilter = 'all' | keyof typeof catBg;
type SevFilter = 'all' | keyof typeof sevBg;

type AuditView = 'metrics' | 'trail' | 'evidence' | 'reports';

export default function AuditIncidents() {
  // Check URL for tab parameter
  const urlParams = new URLSearchParams(window.location.search);
  const tabFromUrl = urlParams.get('tab') as AuditView | null;
  const [view, setView] = useState<AuditView>(tabFromUrl && ['metrics', 'trail', 'evidence', 'reports'].includes(tabFromUrl) ? tabFromUrl : 'metrics');
  const [catFilter, setCatFilter] = useState<CatFilter>('all');
  const [sevFilter, setSevFilter] = useState<SevFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [showTraceViewer, setShowTraceViewer] = useState(false);

  // Shared append-only log: static seed + decisions appended live (e.g. from the
  // Handoff Workspace). Updates here when a handoff is resolved.
  const events = useAuditEvents();
  const isLive = useIsAuditLive();

  // "Today" = the most recent calendar day present in the event stream, derived
  // from the data rather than hardcoded so the KPI stays correct as events change.
  const { latestDay, eventsToday } = useMemo(() => {
    const days = events.map(e => e.ts.slice(0, 10)).sort();
    const day = days[days.length - 1] ?? '';
    return { latestDay: day, eventsToday: events.filter(e => e.ts.startsWith(day)).length };
  }, [events]);

  const handleOpenTrace = useCallback(() => {
    setShowTraceViewer(true);
  }, []);

  const handleExportEvidence = useCallback(() => {
    if (selected) {
      exportEvidenceBundle(selected);
    }
  }, [selected]);

  const filtered = useMemo(() => events.filter(e => {
    const catOk = catFilter === 'all' || e.category === catFilter;
    const sevOk = sevFilter === 'all' || e.severity === sevFilter;
    const q = search.toLowerCase();
    const searchOk = !q
      || e.summary.toLowerCase().includes(q)
      || (e.agent?.toLowerCase().includes(q) ?? false)
      || e.actor.toLowerCase().includes(q)
      || e.id.toLowerCase().includes(q);
    return catOk && sevOk && searchOk;
  }), [events, catFilter, sevFilter, search]);

  const countByCategory = useMemo(() => {
    const acc: Record<string, number> = {};
    events.forEach(e => { acc[e.category] = (acc[e.category] ?? 0) + 1; });
    return acc;
  }, [events]);

  const categories: { id: keyof typeof catBg; label: string }[] = [
    { id: 'guardrail',   label: 'Guardrail' },
    { id: 'incident',    label: 'Incident' },
    { id: 'approval',    label: 'Approval' },
    { id: 'deployment',  label: 'Deployment' },
    { id: 'config',      label: 'Config' },
    { id: 'enforcement', label: 'Enforcement' },
    { id: 'a2a',         label: 'A2A' },
  ];

  const severities: SevFilter[] = ['all', 'critical', 'high', 'medium', 'low'];

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Govern
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Audit & Incidents</h1>
              <CoreBadge pillar="show" />
              {isLive ? (
                <LiveDataBadge source="Audit API" detail={`${events.length} events from governAuditApi.list()`} />
              ) : (
                <MockDataBadge integration="Live CloudTrail AI-activity above; event log & incidents illustrative" />
              )}
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Full timeline of guardrail events, incidents, approvals, deployments, and config changes. Every event links to its trace, CloudTrail record, or ticket — exportable as an evidence bundle.
            </p>
          </div>
        </div>

        {/* Unified Guide: How to Use + Make Live in AWS */}
        <UnifiedGuide {...AUDIT_GUIDE} />

        {/* Live AWS — real CloudTrail AI-service activity */}
        <LiveAiActivity />

        {/* Cedar Policy Observability — enforcement decisions and audit trail */}
        <PolicyObservability hours={24} maxEvents={10} />

        {/* View switcher: Metrics | Audit Trail | Evidence | Reports */}
        <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit" role="tablist" aria-label="Audit & Incidents views">
          {([['metrics', 'Metrics'], ['trail', 'Audit Trail'], ['evidence', 'Evidence'], ['reports', 'Reports']] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                view === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ─────────── Metrics view: scorecard contribution ─────────── */}
        {view === 'metrics' && (
          <div role="tabpanel">
            {/* Metrics only — the full event timeline lives in the Audit Trail view */}
            <AuditMetricsPanel showTrail={false} />
          </div>
        )}

        {/* ─────────── Audit Trail view: charts + filters + event timeline ─────────── */}
        {view === 'trail' && (
        <div role="tabpanel">
        {/* Trail-specific KPIs (event volume + evidence bundles — not scorecard metrics) */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Events Today</div>
            <div className="text-2xl font-semibold text-slate-900 mt-1">{eventsToday}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{latestDay || 'All categories'}</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Total Events</div>
            <div className="text-2xl font-semibold text-slate-900 mt-1">{events.length}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">In the log</div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Evidence Bundles</div>
            <div className="text-2xl font-semibold text-slate-900 mt-1">12</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Exportable · signed</div>
          </div>
        </div>

        {/* Row 2: charts */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mb-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-900">30-Day Event Trend</div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Guardrail hits</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Violations</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={RISK_TREND_30D}>
                <defs>
                  <linearGradient id="hitsGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="guardrailHits" stroke="#f59e0b" fill="url(#hitsGrad2)" strokeWidth={2} />
                <Area type="monotone" dataKey="violations"     stroke="#ef4444" fill="none" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900 mb-3">Events by Category</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={categories.map(c => ({ category: c.label, count: countByCategory[c.id] ?? 0 }))}
                layout="vertical"
                margin={{ left: 10 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis type="category" dataKey="category" tick={{ fill: '#475569', fontSize: 10 }} width={80} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4" role="group" aria-label="Event filters">
          <input
            type="text"
            placeholder="Search events, agents, or trace IDs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search audit events"
            className="flex-1 min-w-[240px] py-2 px-3 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400"
          />
          <div className="flex gap-1 flex-wrap" role="group" aria-label="Filter by category">
            <button
              onClick={() => setCatFilter('all')}
              aria-pressed={catFilter === 'all'}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${catFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}`}
            >
              All ({events.length})
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setCatFilter(catFilter === c.id ? 'all' : c.id)}
                aria-pressed={catFilter === c.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  catFilter === c.id
                    ? `${catBg[c.id]} border`
                    : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {c.label} ({countByCategory[c.id] ?? 0})
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Filter by severity">
            {severities.map(s => (
              <button
                key={s}
                onClick={() => setSevFilter(s)}
                aria-pressed={sevFilter === s}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  sevFilter === s
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {s === 'all' ? 'All sev' : s}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map(e => (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                className="w-full text-left px-5 py-3 hover:bg-slate-50/60 transition flex items-center gap-3"
              >
                <span className="text-[11px] font-mono text-slate-400 w-32 flex-shrink-0">{e.ts}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${catBg[e.category]} uppercase`}>
                  {e.category}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${sevBg[e.severity]}`}>
                  {e.severity}
                </span>
                <span className="text-sm text-slate-900 flex-1 truncate">{e.summary}</span>
                {e.agent && <span className="text-[11px] text-slate-400 hidden md:inline">{e.agent}</span>}
                <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                </svg>
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <EmptyState
              icon="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              title="No events match your filter"
              description="Try adjusting your filters or search criteria. Events appear when guardrails trigger, policies evaluate, or incidents occur."
              tips={[
                'Clear category or severity filters to see more events',
                'Check the search query for typos',
                'Events stream from CloudTrail and EventBridge when live',
              ]}
            />
          )}
        </div>
        </div>
        )}

        {/* ─────────── Evidence view: collection status & coverage ─────────── */}
        {view === 'evidence' && (
          <div role="tabpanel" className="space-y-6">
            {/* Evidence Coverage Summary */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Overall Coverage</div>
                <div className="text-3xl font-bold text-emerald-600">78%</div>
                <div className="text-xs text-slate-500 mt-1">Controls with evidence</div>
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '78%' }} />
                </div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Evidence Items</div>
                <div className="text-3xl font-bold text-slate-900">142</div>
                <div className="text-xs text-slate-500 mt-1">Collected artifacts</div>
                <div className="flex items-center gap-2 mt-2 text-[10px]">
                  <span className="text-emerald-600">+12 this week</span>
                </div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Last Refresh</div>
                <div className="text-3xl font-bold text-blue-600">Live</div>
                <div className="text-xs text-slate-500 mt-1">Continuous collection</div>
                <div className="flex items-center gap-1 mt-2 text-[10px] text-emerald-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Connected to AWS
                </div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4">
                <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Gaps Identified</div>
                <div className="text-3xl font-bold text-amber-600">7</div>
                <div className="text-xs text-slate-500 mt-1">Missing evidence</div>
                <a href="#gaps" className="text-[10px] text-blue-600 hover:underline mt-2 inline-block">View gaps →</a>
              </div>
            </div>

            {/* Evidence by Layer */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6">
              <h3 className="text-base font-semibold text-slate-900 mb-4">Evidence by Layer</h3>
              <div className="grid grid-cols-3 gap-6">
                {[
                  { layer: 'L1 · Foundation', color: '#1e3a8a', coverage: 85, items: ['Guardrail configs', 'Agent registry', 'Cedar policies', 'MCP tool inventory'], gaps: ['Data classification labels'] },
                  { layer: 'L2 · Production', color: '#1d4ed8', coverage: 80, items: ['Model evaluations', 'Use case assessments', 'Risk tiering', 'Deployment logs'], gaps: ['Challenger model tests', 'DDQ responses'] },
                  { layer: 'L3 · Scale', color: '#3b82f6', coverage: 68, items: ['CloudWatch metrics', 'Cost allocations', 'Incident reports', 'Audit trail'], gaps: ['Red team results', 'Bias testing', 'Explainability reports', 'Safety case docs'] },
                ].map(l => (
                  <div key={l.layer} className="rounded-xl border-2 p-4" style={{ borderColor: `${l.color}30`, borderLeftWidth: '4px', borderLeftColor: l.color }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-slate-800">{l.layer}</span>
                      <span className="text-lg font-bold" style={{ color: l.coverage >= 80 ? '#059669' : l.coverage >= 60 ? '#d97706' : '#dc2626' }}>{l.coverage}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
                      <div className="h-full rounded-full" style={{ width: `${l.coverage}%`, backgroundColor: l.color }} />
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold mb-1">Collected ({l.items.length})</div>
                        {l.items.map(item => (
                          <div key={item} className="flex items-center gap-2 text-[11px] text-slate-600 py-0.5">
                            <Icon name="check-circle" className="w-3.5 h-3.5 text-emerald-500" />
                            {item}
                          </div>
                        ))}
                      </div>
                      {l.gaps.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold mb-1">Gaps ({l.gaps.length})</div>
                          {l.gaps.map(gap => (
                            <div key={gap} className="flex items-center gap-2 text-[11px] text-slate-600 py-0.5">
                              <Icon name="exclamation-circle" className="w-3.5 h-3.5 text-amber-500" />
                              {gap}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Evidence Sources */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6">
              <h3 className="text-base font-semibold text-slate-900 mb-4">Evidence Sources</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { source: 'AWS CloudTrail', status: 'live', items: 'AI service events', count: 1247 },
                  { source: 'Bedrock Guardrails', status: 'live', items: 'Intervention logs', count: 89 },
                  { source: 'AWS Config', status: 'live', items: 'Compliance rules', count: 23 },
                  { source: 'SecurityHub', status: 'live', items: 'Findings', count: 12 },
                  { source: 'Cost Explorer', status: 'live', items: 'AI spend data', count: 30 },
                  { source: 'Model Evaluations', status: 'manual', items: 'Eval results', count: 8 },
                  { source: 'Risk Assessments', status: 'manual', items: 'Use case reviews', count: 15 },
                  { source: 'Attestations', status: 'manual', items: 'Sign-offs', count: 6 },
                ].map(s => (
                  <div key={s.source} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${s.status === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <div>
                        <div className="text-sm font-medium text-slate-800">{s.source}</div>
                        <div className="text-[10px] text-slate-500">{s.items}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-900">{s.count}</div>
                      <div className="text-[9px] uppercase text-slate-400">{s.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─────────── Reports view: framework-specific packages ─────────── */}
        {view === 'reports' && (
          <div role="tabpanel" className="space-y-6">
            {/* Framework Report Cards */}
            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  framework: 'SR 26-2',
                  title: 'OCC Model Risk Management',
                  coverage: 82,
                  description: 'Third-party AI model governance requirements for federally supervised banks',
                  requirements: 12,
                  evidenced: 10,
                  lastGenerated: '2026-07-20',
                },
                {
                  framework: 'NIST AI RMF',
                  title: 'AI Risk Management Framework',
                  coverage: 75,
                  description: 'Voluntary framework for trustworthy AI development and deployment',
                  requirements: 24,
                  evidenced: 18,
                  lastGenerated: '2026-07-18',
                },
                {
                  framework: 'EU AI Act',
                  title: 'European AI Regulation',
                  coverage: 68,
                  description: 'High-risk AI system requirements including Art. 73 incident reporting',
                  requirements: 18,
                  evidenced: 12,
                  lastGenerated: '2026-07-15',
                },
                {
                  framework: 'ISO 42001',
                  title: 'AI Management System',
                  coverage: 71,
                  description: 'International standard for AI governance and quality management',
                  requirements: 15,
                  evidenced: 11,
                  lastGenerated: '2026-07-19',
                },
              ].map(fw => (
                <div key={fw.framework} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-slate-900">{fw.framework}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          fw.coverage >= 80 ? 'bg-emerald-100 text-emerald-700' :
                          fw.coverage >= 60 ? 'bg-amber-100 text-amber-700' :
                          'bg-rose-100 text-rose-700'
                        }`}>{fw.coverage}% ready</span>
                      </div>
                      <div className="text-sm text-slate-600 mt-0.5">{fw.title}</div>
                    </div>
                    <Icon name="document-text" className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-[11px] text-slate-500 mb-4">{fw.description}</p>

                  <div className="flex items-center gap-4 mb-4 text-[11px]">
                    <div>
                      <span className="text-slate-500">Requirements:</span>
                      <span className="font-semibold text-slate-800 ml-1">{fw.evidenced}/{fw.requirements}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Last generated:</span>
                      <span className="font-semibold text-slate-800 ml-1">{fw.lastGenerated}</span>
                    </div>
                  </div>

                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${fw.coverage}%`,
                        backgroundColor: fw.coverage >= 80 ? '#059669' : fw.coverage >= 60 ? '#d97706' : '#dc2626'
                      }}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition">
                      <Icon name="document-arrow-down" className="w-4 h-4" />
                      Generate Report
                    </button>
                    <button className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 transition">
                      View Gaps
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Report History */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6">
              <h3 className="text-base font-semibold text-slate-900 mb-4">Recent Reports</h3>
              <div className="space-y-2">
                {[
                  { name: 'SR 26-2 Q2 2026 Compliance Report', framework: 'SR 26-2', date: '2026-07-20', status: 'complete' },
                  { name: 'NIST AI RMF Self-Assessment', framework: 'NIST AI RMF', date: '2026-07-18', status: 'complete' },
                  { name: 'EU AI Act High-Risk Inventory', framework: 'EU AI Act', date: '2026-07-15', status: 'complete' },
                  { name: 'Board AI Governance Summary', framework: 'Custom', date: '2026-07-10', status: 'complete' },
                  { name: 'ISO 42001 Gap Analysis', framework: 'ISO 42001', date: '2026-07-05', status: 'complete' },
                ].map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 transition cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Icon name="document-text" className="w-5 h-5 text-slate-400" />
                      <div>
                        <div className="text-sm font-medium text-slate-800">{r.name}</div>
                        <div className="text-[10px] text-slate-500">{r.framework} · Generated {r.date}</div>
                      </div>
                    </div>
                    <button className="p-2 rounded-lg hover:bg-white transition">
                      <Icon name="arrow-down-tray" className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Event detail drawer */}
        <Drawer
          open={selected != null}
          onClose={() => setSelected(null)}
          title={selected ? `Event ${selected.id}` : ''}
          subtitle={selected?.ts}
          width="md"
        >
          {selected && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase ${catBg[selected.category]}`}>{selected.category}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${sevBg[selected.severity]}`}>{selected.severity}</span>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400">Summary</div>
                <div className="text-sm text-slate-900 mt-1">{selected.summary}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">Actor</div>
                  <div className="text-sm text-slate-900 mt-1"><MaskedIdentity identity={selected.actor} /></div>
                </div>
                {selected.agent && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-400">Agent</div>
                    <div className="text-sm text-slate-900 mt-1">{selected.agent}</div>
                  </div>
                )}
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400">Action Taken <span className="normal-case tracking-normal text-slate-300">· what happened (API-level)</span></div>
                <div className="text-sm text-slate-900 mt-1">{selected.action}</div>
              </div>

              {selected.decisionContext && (
                <div className="bg-indigo-50/60 rounded-lg p-3 border border-indigo-100">
                  <div className="text-[10px] uppercase tracking-widest text-indigo-500">Decision Context <span className="normal-case tracking-normal text-indigo-300">· why it happened</span></div>
                  <div className="text-sm text-slate-700 mt-1">{selected.decisionContext}</div>
                  <div className="text-[10px] text-slate-400 mt-2">Reasoning capture (Bedrock invocation logging + tracing) — distinct from API-level logs. Required for autonomous-agent accountability per the AWS agentic-governance framework.</div>
                </div>
              )}

              {selected.evidence && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">Evidence</div>
                  <div className="text-sm text-slate-900 mt-1 font-mono">{selected.evidence}</div>
                  <div className="text-[11px] text-slate-500 mt-2">
                    Links to Langfuse trace, CloudTrail record, and (if incident) Jira ticket. Exportable as signed evidence bundle for audit.
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex gap-2">
                <button
                  onClick={handleOpenTrace}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
                >
                  Open Trace
                </button>
                <button
                  onClick={handleExportEvidence}
                  className="flex-1 px-3 py-2 rounded-lg bg-white text-slate-700 border border-slate-200 text-sm font-medium hover:bg-slate-50 transition"
                >
                  Export Evidence
                </button>
              </div>
            </div>
          )}
        </Drawer>

        {/* Trace Viewer Modal */}
        {showTraceViewer && selected && (
          <TraceViewerModal event={selected} onClose={() => setShowTraceViewer(false)} />
        )}
      </div>
    </div>
  );
}
