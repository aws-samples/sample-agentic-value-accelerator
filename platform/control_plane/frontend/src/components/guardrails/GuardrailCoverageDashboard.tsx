/**
 * GuardrailCoverageDashboard — Visual map of guardrail coverage across agents and apps
 * with integrated assignment management (merged from GuardrailAssignmentView)
 */

import { useState, useMemo } from 'react';
import { Icon } from '../govern/icons';
import type { IconName } from '../govern/icons';

interface Resource {
  id: string;
  name: string;
  type: 'agent' | 'application' | 'model' | 'endpoint';
  category: string;
  guardrailId?: string;
  guardrailName?: string;
  status: 'protected' | 'unprotected' | 'partial';
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  lastActivity?: string;
  invocations24h?: number;
  assignedAt?: string;
  assignedBy?: string;
}

interface Guardrail {
  id: string;
  name: string;
  version?: string;
}

interface CoverageStats {
  total: number;
  protected: number;
  partial: number;
  unprotected: number;
  byRisk: { critical: number; high: number; medium: number; low: number };
}

const MOCK_GUARDRAILS: Guardrail[] = [
  { id: 'gr-001', name: 'FSI Standard', version: 'v3' },
  { id: 'gr-002', name: 'Trading Compliance', version: 'v2' },
  { id: 'gr-003', name: 'Document Intelligence', version: 'v1' },
  { id: 'gr-004', name: 'Wealth Advisory', version: 'v1' },
  { id: 'gr-005', name: 'AWS Best Practice', version: 'v1' },
];

const MOCK_RESOURCES: Resource[] = [
  { id: 'agent-001', name: 'Customer Service Bot', type: 'agent', category: 'Customer Service', guardrailId: 'gr-001', guardrailName: 'FSI Standard', status: 'protected', riskLevel: 'high', lastActivity: '2024-06-08T15:30:00Z', invocations24h: 12500, assignedAt: '2024-06-01T10:30:00Z', assignedBy: 'alex.rivera@example.com' },
  { id: 'agent-002', name: 'Loan Advisor', type: 'agent', category: 'Lending', guardrailId: 'gr-001', guardrailName: 'FSI Standard', status: 'protected', riskLevel: 'critical', lastActivity: '2024-06-08T15:28:00Z', invocations24h: 3400, assignedAt: '2024-06-02T14:15:00Z', assignedBy: 'alex.rivera@example.com' },
  { id: 'agent-003', name: 'Trading Assistant', type: 'agent', category: 'Capital Markets', guardrailId: 'gr-002', guardrailName: 'Trading Compliance', status: 'protected', riskLevel: 'critical', lastActivity: '2024-06-08T15:25:00Z', invocations24h: 8900, assignedAt: '2024-06-03T09:00:00Z', assignedBy: 'admin@example.com' },
  { id: 'agent-004', name: 'Document Parser', type: 'agent', category: 'Operations', guardrailId: 'gr-003', guardrailName: 'Document Intelligence', status: 'partial', riskLevel: 'medium', lastActivity: '2024-06-08T14:00:00Z', invocations24h: 2100, assignedAt: '2024-06-04T16:45:00Z', assignedBy: 'admin@example.com' },
  { id: 'agent-005', name: 'Internal Q&A Bot', type: 'agent', category: 'Internal', status: 'unprotected', riskLevel: 'low', lastActivity: '2024-06-08T12:00:00Z', invocations24h: 450 },
  { id: 'agent-006', name: 'Compliance Checker', type: 'agent', category: 'Compliance', status: 'unprotected', riskLevel: 'high', lastActivity: '2024-06-08T15:00:00Z', invocations24h: 1800 },
  { id: 'app-001', name: 'Mobile Banking', type: 'application', category: 'Banking', guardrailId: 'gr-001', guardrailName: 'FSI Standard', status: 'protected', riskLevel: 'critical', lastActivity: '2024-06-08T15:30:00Z', invocations24h: 45000, assignedAt: '2024-06-01T08:00:00Z', assignedBy: 'alex.rivera@example.com' },
  { id: 'app-002', name: 'Wealth Portal', type: 'application', category: 'Wealth', guardrailId: 'gr-004', guardrailName: 'Wealth Advisory', status: 'protected', riskLevel: 'high', lastActivity: '2024-06-08T15:20:00Z', invocations24h: 8700, assignedAt: '2024-06-02T11:30:00Z', assignedBy: 'admin@example.com' },
  { id: 'app-003', name: 'Claims Portal', type: 'application', category: 'Insurance', status: 'unprotected', riskLevel: 'high', lastActivity: '2024-06-08T14:45:00Z', invocations24h: 3200 },
  { id: 'model-001', name: 'Claude 3.5 Sonnet', type: 'model', category: 'Foundation Model', guardrailId: 'gr-001', guardrailName: 'FSI Standard', status: 'protected', riskLevel: 'medium', invocations24h: 125000, assignedAt: '2024-05-28T10:00:00Z', assignedBy: 'alex.rivera@example.com' },
  { id: 'model-002', name: 'Custom Fine-tuned', type: 'model', category: 'Custom Model', status: 'unprotected', riskLevel: 'high', invocations24h: 8500 },
  { id: 'endpoint-001', name: 'prod-inference-api', type: 'endpoint', category: 'Production', guardrailId: 'gr-001', guardrailName: 'FSI Standard', status: 'protected', riskLevel: 'critical', invocations24h: 250000, assignedAt: '2024-05-25T09:00:00Z', assignedBy: 'admin@example.com' },
];

export default function GuardrailCoverageDashboard() {
  const [resources, setResources] = useState<Resource[]>(MOCK_RESOURCES);
  const [availableGuardrails] = useState<Guardrail[]>(MOCK_GUARDRAILS);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'matrix' | 'by-guardrail'>('grid');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'risk' | 'activity' | 'name'>('risk');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [selectedGuardrailId, setSelectedGuardrailId] = useState<string>('');

  const stats: CoverageStats = useMemo(() => {
    const total = resources.length;
    const protected_ = resources.filter(r => r.status === 'protected').length;
    const partial = resources.filter(r => r.status === 'partial').length;
    const unprotected = resources.filter(r => r.status === 'unprotected').length;
    const byRisk = {
      critical: resources.filter(r => r.riskLevel === 'critical' && r.status !== 'protected').length,
      high: resources.filter(r => r.riskLevel === 'high' && r.status !== 'protected').length,
      medium: resources.filter(r => r.riskLevel === 'medium' && r.status !== 'protected').length,
      low: resources.filter(r => r.riskLevel === 'low' && r.status !== 'protected').length,
    };
    return { total, protected: protected_, partial, unprotected, byRisk };
  }, [resources]);

  const coveragePercent = Math.round((stats.protected / stats.total) * 100);

  const filteredResources = useMemo(() => {
    let filtered = resources;
    if (filterType !== 'all') filtered = filtered.filter(r => r.type === filterType);
    if (filterStatus !== 'all') filtered = filtered.filter(r => r.status === filterStatus);

    return filtered.sort((a, b) => {
      if (sortBy === 'risk') {
        const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
      }
      if (sortBy === 'activity') {
        return (b.invocations24h || 0) - (a.invocations24h || 0);
      }
      return a.name.localeCompare(b.name);
    });
  }, [resources, filterType, filterStatus, sortBy]);

  const groupedByType = useMemo(() => {
    const groups: Record<string, Resource[]> = {};
    filteredResources.forEach(r => {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    });
    return groups;
  }, [filteredResources]);

  const groupedByGuardrail = useMemo(() => {
    const groups: Record<string, Resource[]> = {};
    filteredResources.filter(r => r.guardrailId).forEach(r => {
      const key = r.guardrailId!;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [filteredResources]);

  const unprotectedResources = useMemo(() => {
    return resources.filter(r => r.status === 'unprotected');
  }, [resources]);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'protected': return { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300', icon: 'shield-check' as IconName };
      case 'partial': return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', icon: 'exclamation-triangle' as IconName };
      case 'unprotected': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', icon: 'bell-alert' as IconName };
      default: return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', icon: 'exclamation-triangle' as IconName };
    }
  };

  const getRiskStyle = (risk: string) => {
    switch (risk) {
      case 'critical': return { bg: 'bg-red-500', ring: 'ring-red-200' };
      case 'high': return { bg: 'bg-orange-500', ring: 'ring-orange-200' };
      case 'medium': return { bg: 'bg-amber-500', ring: 'ring-amber-200' };
      case 'low': return { bg: 'bg-emerald-500', ring: 'ring-emerald-200' };
      default: return { bg: 'bg-slate-400', ring: 'ring-slate-200' };
    }
  };

  const getTypeIcon = (type: string): IconName => {
    switch (type) {
      case 'agent': return 'cpu-chip';
      case 'application': return 'device-phone-mobile';
      case 'model': return 'brain';
      case 'endpoint': return 'plug';
      default: return 'archive-box';
    }
  };

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleAssign = () => {
    if (!selectedResource || !selectedGuardrailId) return;
    const guardrail = availableGuardrails.find(g => g.id === selectedGuardrailId);
    setResources(prev => prev.map(r =>
      r.id === selectedResource.id
        ? {
            ...r,
            guardrailId: selectedGuardrailId,
            guardrailName: guardrail?.name,
            status: 'protected' as const,
            assignedAt: new Date().toISOString(),
            assignedBy: 'current.user@example.com'
          }
        : r
    ));
    setShowAssignModal(false);
    setSelectedResource(null);
    setSelectedGuardrailId('');
  };

  const handleUnassign = (resourceId: string) => {
    setResources(prev => prev.map(r =>
      r.id === resourceId
        ? { ...r, guardrailId: undefined, guardrailName: undefined, status: 'unprotected' as const, assignedAt: undefined, assignedBy: undefined }
        : r
    ));
  };

  const openAssignModal = (resource?: Resource) => {
    setSelectedResource(resource || null);
    setSelectedGuardrailId('');
    setShowAssignModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Coverage & Assignments</h2>
          <p className="text-sm text-slate-500 mt-1">
            Visual map of guardrail protection • {stats.protected} protected • {stats.unprotected} unassigned
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openAssignModal()}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Assign Guardrail
          </button>
          {(['grid', 'list', 'matrix', 'by-guardrail'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {mode === 'by-guardrail' ? 'By Guardrail' : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Coverage Summary */}
      <div className="grid grid-cols-5 gap-4">
        {/* Coverage Gauge */}
        <div className="col-span-2 p-5 bg-white rounded-xl border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Overall Coverage</h3>
          <div className="relative w-32 h-32 mx-auto">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r="50" stroke="#e2e8f0" strokeWidth="12" fill="none" />
              <circle
                cx="64"
                cy="64"
                r="50"
                stroke={coveragePercent >= 80 ? '#10b981' : coveragePercent >= 50 ? '#f59e0b' : '#ef4444'}
                strokeWidth="12"
                fill="none"
                strokeDasharray={`${(coveragePercent / 100) * (2 * Math.PI * 50)} ${2 * Math.PI * 50}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-slate-900">{coveragePercent}%</span>
              <span className="text-xs text-slate-500">Protected</span>
            </div>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="p-5 bg-emerald-50 rounded-xl border border-emerald-200">
          <div className="text-3xl font-bold text-emerald-700">{stats.protected}</div>
          <div className="text-xs text-emerald-600 font-medium mt-1">Protected</div>
          <div className="text-[10px] text-emerald-500 mt-2">Full guardrail coverage</div>
        </div>
        <div className="p-5 bg-amber-50 rounded-xl border border-amber-200">
          <div className="text-3xl font-bold text-amber-700">{stats.partial}</div>
          <div className="text-xs text-amber-600 font-medium mt-1">Partial</div>
          <div className="text-[10px] text-amber-500 mt-2">Some controls missing</div>
        </div>
        <div className="p-5 bg-red-50 rounded-xl border border-red-200">
          <div className="text-3xl font-bold text-red-700">{stats.unprotected}</div>
          <div className="text-xs text-red-600 font-medium mt-1">Unprotected</div>
          <div className="text-[10px] text-red-500 mt-2">No guardrails assigned</div>
        </div>
      </div>

      {/* Risk Alert */}
      {(stats.byRisk.critical > 0 || stats.byRisk.high > 0) && (
        <div className="p-4 bg-red-50 rounded-xl border-2 border-red-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Icon name="bell-alert" className="w-6 h-6 text-red-600" />
              <div>
                <h3 className="text-sm font-semibold text-red-800">Unprotected High-Risk Resources</h3>
                <p className="text-xs text-red-700 mt-1">
                  {stats.byRisk.critical > 0 && <span className="font-bold">{stats.byRisk.critical} critical</span>}
                  {stats.byRisk.critical > 0 && stats.byRisk.high > 0 && ' and '}
                  {stats.byRisk.high > 0 && <span className="font-bold">{stats.byRisk.high} high-risk</span>}
                  {' '}resources without guardrail protection.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setFilterStatus('unprotected');
                setSortBy('risk');
              }}
              className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"
            >
              View & Assign
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
        >
          <option value="all">All Types</option>
          <option value="agent">Agents</option>
          <option value="application">Applications</option>
          <option value="model">Models</option>
          <option value="endpoint">Endpoints</option>
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
        >
          <option value="all">All Status</option>
          <option value="protected">Protected</option>
          <option value="partial">Partial</option>
          <option value="unprotected">Unprotected</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
        >
          <option value="risk">Sort by Risk</option>
          <option value="activity">Sort by Activity</option>
          <option value="name">Sort by Name</option>
        </select>
        <span className="text-xs text-slate-500 ml-auto">{filteredResources.length} resources</span>
      </div>

      {/* Resource Grid */}
      {viewMode === 'grid' && (
        <div className="space-y-6">
          {Object.entries(groupedByType).map(([type, items]) => (
            <div key={type}>
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Icon name={getTypeIcon(type)} className="w-4 h-4 text-slate-500" />
                {type.charAt(0).toUpperCase() + type.slice(1)}s ({items.length})
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {items.map(resource => {
                  const statusStyle = getStatusStyle(resource.status);
                  const riskStyle = getRiskStyle(resource.riskLevel);
                  return (
                    <div
                      key={resource.id}
                      className={`p-4 rounded-xl border-2 ${statusStyle.border} ${statusStyle.bg} transition-all hover:shadow-md`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${riskStyle.bg} ring-2 ${riskStyle.ring}`} />
                          <span className="text-xs font-medium text-slate-500">{resource.riskLevel}</span>
                        </div>
                        <Icon name={statusStyle.icon} className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-1">{resource.name}</h4>
                      <p className="text-[10px] text-slate-500 mb-2">{resource.category}</p>
                      {resource.guardrailName ? (
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] px-2 py-1 bg-white/50 rounded text-slate-600 flex items-center gap-1">
                            <Icon name="shield-check" className="w-3 h-3" /> {resource.guardrailName}
                          </div>
                          <button
                            onClick={() => handleUnassign(resource.id)}
                            className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-500"
                            title="Remove assignment"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => openAssignModal(resource)}
                          className="text-[10px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Assign Guardrail
                        </button>
                      )}
                      {resource.invocations24h && (
                        <div className="text-[10px] text-slate-400 mt-2">
                          {formatNumber(resource.invocations24h)} invocations/24h
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resource List */}
      {viewMode === 'list' && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 grid grid-cols-[40px_1fr_120px_150px_100px_80px_60px] gap-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            <span>Risk</span>
            <span>Resource</span>
            <span>Type</span>
            <span>Guardrail</span>
            <span>Status</span>
            <span>Activity</span>
            <span></span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredResources.map(resource => {
              const statusStyle = getStatusStyle(resource.status);
              const riskStyle = getRiskStyle(resource.riskLevel);
              return (
                <div key={resource.id} className="px-4 py-3 grid grid-cols-[40px_1fr_120px_150px_100px_80px_60px] gap-4 items-center hover:bg-slate-50">
                  <div className={`w-4 h-4 rounded-full ${riskStyle.bg}`} title={resource.riskLevel} />
                  <div>
                    <div className="text-sm font-medium text-slate-900">{resource.name}</div>
                    <div className="text-[10px] text-slate-500">{resource.category}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon name={getTypeIcon(resource.type)} className="w-4 h-4 text-slate-500" />
                    <span className="text-xs text-slate-600">{resource.type}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    {resource.guardrailName || <span className="text-slate-400">None</span>}
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-1 rounded ${statusStyle.bg} ${statusStyle.text}`}>
                    {resource.status}
                  </span>
                  <span className="text-xs text-slate-500">
                    {resource.invocations24h ? formatNumber(resource.invocations24h) : '-'}
                  </span>
                  <div className="flex items-center gap-1">
                    {resource.guardrailId ? (
                      <button
                        onClick={() => handleUnassign(resource.id)}
                        className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"
                        title="Remove assignment"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        onClick={() => openAssignModal(resource)}
                        className="p-1.5 hover:bg-blue-50 rounded text-slate-400 hover:text-blue-500"
                        title="Assign guardrail"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Matrix View */}
      {viewMode === 'matrix' && (
        <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Coverage Matrix</h3>
          <div className="grid grid-cols-5 gap-2">
            {filteredResources.map(resource => {
              const statusStyle = getStatusStyle(resource.status);
              const riskStyle = getRiskStyle(resource.riskLevel);
              return (
                <div
                  key={resource.id}
                  onClick={() => resource.status === 'unprotected' ? openAssignModal(resource) : undefined}
                  className={`p-2 rounded-lg ${statusStyle.bg} border ${statusStyle.border} ${resource.status === 'unprotected' ? 'cursor-pointer' : ''} hover:shadow-md transition-all`}
                  title={`${resource.name} (${resource.status})${resource.status === 'unprotected' ? ' - Click to assign' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Icon name={getTypeIcon(resource.type)} className="w-3.5 h-3.5 text-slate-500" />
                    <div className={`w-2 h-2 rounded-full ${riskStyle.bg}`} />
                  </div>
                  <div className="text-[10px] font-medium text-slate-700 truncate">{resource.name}</div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" /> Protected</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Partial</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300" /> Unprotected (click to assign)</span>
          </div>
        </div>
      )}

      {/* By Guardrail View */}
      {viewMode === 'by-guardrail' && (
        <div className="space-y-4">
          {Object.entries(groupedByGuardrail).map(([guardrailId, items]) => {
            const guardrail = availableGuardrails.find(g => g.id === guardrailId);
            return (
              <div key={guardrailId} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{guardrail?.name || guardrailId}</h3>
                      <p className="text-xs text-slate-500">{items.length} resource{items.length !== 1 ? 's' : ''} {guardrail?.version && `• ${guardrail.version}`}</p>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map(resource => {
                    const riskStyle = getRiskStyle(resource.riskLevel);
                    return (
                      <div key={resource.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <Icon name={getTypeIcon(resource.type)} className="w-5 h-5 text-slate-500" />
                          <div>
                            <div className="text-sm font-medium text-slate-900">{resource.name}</div>
                            <div className="text-xs text-slate-500">
                              {resource.type} • {resource.category}
                              {resource.assignedAt && ` • Assigned ${formatDate(resource.assignedAt)}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${riskStyle.bg}`} title={resource.riskLevel} />
                          <span className="text-xs text-slate-500">{resource.invocations24h ? formatNumber(resource.invocations24h) + '/day' : ''}</span>
                          <button
                            onClick={() => handleUnassign(resource.id)}
                            className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"
                            title="Remove assignment"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Unassigned Section */}
          {unprotectedResources.length > 0 && (
            <div className="border-2 border-dashed border-amber-300 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-amber-800">Unassigned Resources</h3>
                    <p className="text-xs text-amber-600">{unprotectedResources.length} resource{unprotectedResources.length !== 1 ? 's' : ''} without guardrails</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-amber-100">
                {unprotectedResources.map(resource => {
                  const riskStyle = getRiskStyle(resource.riskLevel);
                  return (
                    <div key={resource.id} className="px-4 py-3 flex items-center justify-between hover:bg-amber-50/50">
                      <div className="flex items-center gap-3">
                        <Icon name={getTypeIcon(resource.type)} className="w-5 h-5 text-slate-500" />
                        <div>
                          <div className="text-sm font-medium text-slate-900">{resource.name}</div>
                          <div className="text-xs text-slate-500">{resource.type} • {resource.category}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${riskStyle.bg}`} title={resource.riskLevel} />
                        <button
                          onClick={() => openAssignModal(resource)}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {selectedResource ? `Assign Guardrail to ${selectedResource.name}` : 'Create Assignment'}
            </h3>

            <div className="space-y-3">
              {!selectedResource && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Resource</label>
                  <select
                    value=""
                    onChange={e => {
                      const resource = resources.find(r => r.id === e.target.value);
                      setSelectedResource(resource || null);
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">Select resource...</option>
                    {unprotectedResources.map(r => (
                      <option key={r.id} value={r.id}>[{r.type}] {r.name} ({r.riskLevel} risk)</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Guardrail</label>
                <select
                  value={selectedGuardrailId}
                  onChange={e => setSelectedGuardrailId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="">Select guardrail...</option>
                  {availableGuardrails.map(g => (
                    <option key={g.id} value={g.id}>{g.name} {g.version && `(${g.version})`}</option>
                  ))}
                </select>
              </div>

              {selectedResource && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name={getTypeIcon(selectedResource.type)} className="w-5 h-5 text-slate-500" />
                    <span className="text-sm font-medium text-slate-900">{selectedResource.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className={`w-2 h-2 rounded-full ${getRiskStyle(selectedResource.riskLevel).bg}`} />
                    {selectedResource.riskLevel} risk • {selectedResource.category}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedResource(null);
                  setSelectedGuardrailId('');
                }}
                className="flex-1 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={!selectedResource || !selectedGuardrailId}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Assign Guardrail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
