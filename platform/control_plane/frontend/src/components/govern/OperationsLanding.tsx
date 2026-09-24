/**
 * OperationsLanding - GRC & Ops Hub for AI Agent Platform
 *
 * Unified command center for:
 * - SRE/Platform Engineering teams (fleet health, incidents, alerts, on-call)
 * - GRC teams (compliance evidence, audit trails, policy enforcement)
 * - Leadership (executive overview, metrics, trends)
 *
 * 12 tabs covering the full operational lifecycle.
 */

import { useState, Suspense, lazy } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Icon } from './icons';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import CoreBadge from './CoreBadge';

// Lazy load tab components for performance
const OpsOverview = lazy(() => import('./operations/OpsOverview'));
const FleetHealth = lazy(() => import('./operations/FleetHealth'));
const IncidentManagement = lazy(() => import('./operations/IncidentManagement'));
const OnCallCenter = lazy(() => import('./operations/OnCallCenter'));
const ChangeManagement = lazy(() => import('./operations/ChangeManagement'));
const AlertCenter = lazy(() => import('./operations/AlertCenter'));
const SLACenter = lazy(() => import('./operations/SLACenter'));
const RunbookCenter = lazy(() => import('./operations/RunbookCenter'));
const ServiceMap = lazy(() => import('./operations/ServiceMap'));
const CapacityPlanning = lazy(() => import('./operations/CapacityPlanning'));
const OpsCompliance = lazy(() => import('./operations/OpsCompliance'));
const AuditEvidence = lazy(() => import('./operations/AuditEvidence'));
const OpsMetrics = lazy(() => import('./operations/OpsMetrics'));
// Investigation Queue is re-homed here from the standalone /govern/investigations
// route so all ops/GRC workflows live under one hub. Rendered with embedded so it
// drops its own page header and fits as a tab.
const InvestigationQueue = lazy(() => import('./InvestigationQueue'));

type Tab =
  | 'overview'
  | 'fleet'
  | 'incidents'
  | 'oncall'
  | 'changes'
  | 'alerts'
  | 'sla'
  | 'runbooks'
  | 'service-map'
  | 'capacity'
  | 'compliance'
  | 'evidence'
  | 'investigations'
  | 'metrics';

interface TabConfig {
  id: Tab;
  label: string;
  icon: string;
  group: 'ops' | 'grc';
}

const TABS: TabConfig[] = [
  // Operations
  { id: 'overview', label: 'Overview', icon: 'squares-2x2', group: 'ops' },
  { id: 'fleet', label: 'Fleet Health', icon: 'server-stack', group: 'ops' },
  { id: 'incidents', label: 'Incidents', icon: 'fire', group: 'ops' },
  { id: 'oncall', label: 'On-Call', icon: 'phone', group: 'ops' },
  { id: 'changes', label: 'Changes', icon: 'arrow-path', group: 'ops' },
  { id: 'alerts', label: 'Alerts', icon: 'bell-alert', group: 'ops' },
  { id: 'sla', label: 'SLAs', icon: 'clipboard-document-check', group: 'ops' },
  { id: 'runbooks', label: 'Runbooks', icon: 'book-open', group: 'ops' },
  { id: 'service-map', label: 'Traces (X-Ray)', icon: 'share', group: 'ops' },
  { id: 'capacity', label: 'Capacity', icon: 'chart-bar', group: 'ops' },
  // GRC
  { id: 'compliance', label: 'Compliance', icon: 'shield-check', group: 'grc' },
  { id: 'evidence', label: 'Evidence', icon: 'document-text', group: 'grc' },
  { id: 'investigations', label: 'Investigations', icon: 'magnifying-glass', group: 'grc' },
  { id: 'metrics', label: 'Metrics', icon: 'presentation-chart-line', group: 'grc' },
];

function TabSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-200 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-slate-200 rounded-xl" />
        <div className="h-64 bg-slate-200 rounded-xl" />
      </div>
    </div>
  );
}

export default function OperationsLanding() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'overview'
  );
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isLive] = useState(false); // Will be true when connected to live APIs

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Refresh actually remounts the active tab (via the keyed wrapper below) so its
  // data hooks re-run, then stamps the time. Previously this only bumped a clock
  // without refetching anything, which implied data had refreshed when it had not.
  const handleRefresh = () => {
    setRefreshNonce((n) => n + 1);
    setLastRefresh(new Date());
  };

  const opsTabs = TABS.filter((t) => t.group === 'ops');
  const grcTabs = TABS.filter((t) => t.group === 'grc');

  return (
    <div className="min-h-[calc(100dvh-4rem)]">
      {/* Header */}
      <div className="border-b border-slate-200/60 bg-white/60 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Link
                to="/govern"
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Icon name="arrow-left" className="w-4 h-4" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-slate-900">
                    Operations
                  </h1>
                  <CoreBadge pillar="see" compact />
                  {isLive ? (
                    <LiveDataBadge />
                  ) : (
                    <MockDataBadge integration="Connect CloudWatch, PagerDuty, ServiceNow" />
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">
                  Operational command center for AI — live fleet health, CloudWatch alerts, Service Quotas capacity, and runbooks across the estate.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                Last refresh: {lastRefresh.toLocaleTimeString()}
              </span>
              <button
                type="button"
                onClick={handleRefresh}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                title="Refresh — reloads the active tab's data"
              >
                <Icon name="arrow-path" className="w-4 h-4" />
              </button>
              <div className="h-6 w-px bg-slate-200" />
              <button
                type="button"
                disabled
                title="Emergency stop is a planned control and is not yet wired to a backend"
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-rose-50 text-rose-700 rounded-lg opacity-50 cursor-not-allowed"
              >
                <Icon name="exclamation-triangle" className="w-3.5 h-3.5" />
                Emergency Stop
              </button>
            </div>
          </div>

          {/* Tabs - grouped by Ops / GRC */}
          <div className="flex items-center gap-6">
            {/* Ops tabs */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-2">
                Ops
              </span>
              {opsTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
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

            <div className="h-6 w-px bg-slate-200" />

            {/* GRC tabs */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-2">
                GRC
              </span>
              {grcTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-emerald-600 text-emerald-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Icon name={tab.icon as any} className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <Suspense fallback={<TabSkeleton />}>
          {/* Keyed by refreshNonce so an explicit Refresh remounts the active tab
              and re-runs its data hooks (a real refetch, not just a clock bump). */}
          <div key={`${activeTab}-${refreshNonce}`}>
            {activeTab === 'overview' && <OpsOverview />}
            {activeTab === 'fleet' && <FleetHealth />}
            {activeTab === 'incidents' && <IncidentManagement />}
            {activeTab === 'oncall' && <OnCallCenter />}
            {activeTab === 'changes' && <ChangeManagement />}
            {activeTab === 'alerts' && <AlertCenter />}
            {activeTab === 'sla' && <SLACenter />}
            {activeTab === 'runbooks' && <RunbookCenter />}
            {activeTab === 'service-map' && <ServiceMap />}
            {activeTab === 'capacity' && <CapacityPlanning />}
            {activeTab === 'compliance' && <OpsCompliance />}
            {activeTab === 'evidence' && <AuditEvidence />}
            {activeTab === 'investigations' && <InvestigationQueue embedded />}
            {activeTab === 'metrics' && <OpsMetrics />}
          </div>
        </Suspense>
      </div>
    </div>
  );
}
