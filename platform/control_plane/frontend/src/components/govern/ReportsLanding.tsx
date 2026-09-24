/**
 * ReportsLanding - Enterprise GRC Reports & Assessments Hub
 *
 * Standalone top-level module for:
 * - Agent Control Assessments (multi-agent, design + operating effectiveness)
 * - Framework Compliance Reports (SR 26-2, NIST AI RMF, EU AI Act)
 * - Evidence Management (chain of custody, integrity verification)
 * - Attestation Workflows (multi-level sign-off)
 * - Trend Analysis (historical effectiveness)
 * - Remediation Playbooks
 *
 * This is NOT buried under Audit Trail - it's a first-class GRC capability.
 */

import { useState, Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './icons';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import CoreBadge from './CoreBadge';
import { useReportsDataSummary } from './operations/useReportsLiveData';

// Lazy load the heavy components
const ReportsCenter = lazy(() => import('./operations/ReportsCenter'));
const AttestationWorkflow = lazy(() => import('./operations/AttestationWorkflow'));
const ControlTrends = lazy(() => import('./operations/ControlTrends'));
const RemediationPlaybooks = lazy(() => import('./operations/RemediationPlaybooks'));
const AgentResourceInventory = lazy(() => import('./operations/AgentResourceInventory'));
const FrameworkReportsModule = lazy(() => import('./operations/FrameworkReportsModule'));
const ReportsOverview = lazy(() => import('./operations/ReportsOverview'));

type ReportTab = 'overview' | 'assessments' | 'inventory' | 'attestation' | 'trends' | 'playbooks' | 'framework';

interface TabConfig {
  id: ReportTab;
  label: string;
  icon: string;
  description: string;
}

const TABS: TabConfig[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: 'squares-2x2',
    description: 'Estate-wide compliance posture and what needs attention',
  },
  {
    id: 'assessments',
    label: 'Control Assessments',
    icon: 'shield-check',
    description: 'Multi-agent control design & operating effectiveness',
  },
  {
    id: 'inventory',
    label: 'Resource Inventory',
    icon: 'cube-transparent',
    description: 'Full agent resource & control mapping',
  },
  {
    id: 'attestation',
    label: 'Attestation',
    icon: 'check-badge',
    description: 'Sign-off workflows & approval chains',
  },
  {
    id: 'trends',
    label: 'Trends & History',
    icon: 'chart-bar',
    description: 'Historical effectiveness analysis',
  },
  {
    id: 'playbooks',
    label: 'Remediation Playbooks',
    icon: 'book-open',
    description: 'Step-by-step remediation guides',
  },
  {
    id: 'framework',
    label: 'Framework Reports',
    icon: 'clipboard-document-list',
    description: 'SR 26-2, NIST AI RMF, EU AI Act, ISO 42001',
  },
];

function TabSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 bg-slate-200 rounded w-48" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-200 rounded-xl" />
        ))}
      </div>
      <div className="h-96 bg-slate-200 rounded-xl" />
    </div>
  );
}

export default function ReportsLanding() {
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  // Live cross-source summary (AgentCore, Guardrails, Deployments, Compliance,
  // Security, Risk, Fleet) — the header badge and strip reflect real source status.
  const { summary, loading: summaryLoading } = useReportsDataSummary();
  const liveSourceCount = summary.dataSources.filter(s => s.status === 'live').length;
  const totalSourceCount = summary.dataSources.length;

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-[1600px] mx-auto px-6 py-8">
        {/* Header */}
        <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Govern
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
                Reports & Assessments
              </h1>
              <CoreBadge pillar="show" />
              {summaryLoading ? null : liveSourceCount > 0
                ? <LiveDataBadge source={`${liveSourceCount}/${totalSourceCount} live sources`} detail="AgentCore, Guardrails, Deployments, Compliance, Security, Risk, Fleet" />
                : <MockDataBadge integration="Connect GRC, ITSM, and Audit systems" />}
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Assessment and attestation, board-ready — control assessments, attestation workflows, and audit-grade compliance reports.
            </p>
            {!summaryLoading && liveSourceCount > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
                {/* Deliberately NOT "N live agents". `summary.liveAgents` equals
                    `summary.totalAgents` by construction - every row the hook builds hardcodes
                    `isLive: true` - so "36 live agents" claimed a measurement that was really
                    just a row count, and would have kept claiming it if a seeded source were
                    ever added. The provenance is already carried honestly by the
                    LiveDataBadge above ("N/M live sources"); these two are plain inventory
                    counts and are labelled as such. See ReportsDataSummary.liveAgents. */}
                <span><span className="font-semibold text-slate-700">{summary.totalAgents}</span> agents</span>
                <span><span className="font-semibold text-slate-700">{summary.totalGuardrails}</span> guardrails</span>
                {/* This percentage is a pass rate over ASSESSED controls, not coverage of
                    the estate, so it must carry its denominator here. Unqualified it read
                    "100% avg compliance" beside "36 live agents" while 257 of 281 controls
                    had never been looked at - the single most misleading number on the page.
                    A 0/em-dash means nothing is attested yet, not that every control failed. */}
                {summary.assessedControls > 0 ? (
                  <span
                    title={
                      `${summary.avgCompliancePct}% of the ${summary.assessedControls} assessed controls pass. ` +
                      `${summary.totalControls - summary.assessedControls} of ${summary.totalControls} controls ` +
                      `are not assessed and are excluded from this rate` +
                      (summary.autoDetectedControls > 0
                        ? `. ${summary.autoDetectedControls} of the ${summary.assessedControls} were set by auto-detection, not human attestation.`
                        : '.')
                    }
                  >
                    <span className="font-semibold text-slate-700">{summary.avgCompliancePct}%</span>{' '}
                    of {summary.assessedControls} assessed controls pass
                    <span className="text-slate-400">
                      {' '}({summary.assessedControls} of {summary.totalControls} assessed
                      {summary.autoDetectedControls > 0
                        ? `, ${summary.autoDetectedControls} auto-detected`
                        : ''})
                    </span>
                  </span>
                ) : (
                  <span>
                    <span className="font-semibold text-slate-700">—</span> compliance
                    {' '}(0 of {summary.totalControls} controls assessed)
                  </span>
                )}
                {/* Named precisely: this is Security Hub findings PLUS risk-register entries
                    (useReportsLiveData:584), NOT failing compliance controls. Sitting
                    unqualified beside the compliance figure, "447 findings" read as 447
                    control failures, which contradicted the Overview's failing-control count. */}
                <span
                  title="Security Hub findings plus risk-register entries. These are not compliance control failures — the Overview tab reports those separately."
                >
                  <span className="font-semibold text-slate-700">{summary.totalFindings}</span> security &amp; risk findings ({summary.criticalFindings} critical)
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              <Icon name="cog-6-tooth" className="w-4 h-4" />
              Settings
            </button>
            {/* Deliberately de-emphasised rather than removed: it competed visually with the
                per-tab "Export Report" button, which is the one that actually works. Kept
                visible so the planned capability is discoverable, styled as unavailable. */}
            <button
              type="button"
              disabled
              title="Export Package would bundle every tab's report into one archive. Not yet available — use Export Report within a tab."
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-400 bg-white border border-dashed border-slate-300 rounded-lg cursor-not-allowed"
            >
              <Icon name="document-arrow-down" className="w-4 h-4" />
              Export Package
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">Planned</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 mb-6">
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon name={tab.icon as any} className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <Suspense fallback={<TabSkeleton />}>
          {activeTab === 'overview' && <ReportsOverview onNavigate={setActiveTab} />}
          {activeTab === 'assessments' && <ReportsCenter />}
          {activeTab === 'inventory' && <AgentResourceInventory />}
          {activeTab === 'attestation' && <AttestationWorkflow />}
          {activeTab === 'trends' && <ControlTrends />}
          {activeTab === 'playbooks' && <RemediationPlaybooks />}
          {activeTab === 'framework' && <FrameworkReportsModule />}
        </Suspense>
      </div>
    </div>
  );
}
