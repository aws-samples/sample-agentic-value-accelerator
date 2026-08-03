/**
 * GuardrailAssignmentView — View and manage guardrail-to-resource assignments
 */

import { useState, useMemo } from 'react';
import { Icon } from '../govern/icons';
import type { IconName } from '../govern/icons';

interface Assignment {
  id: string;
  guardrailId: string;
  guardrailName: string;
  resourceType: 'agent' | 'model' | 'application' | 'endpoint';
  resourceId: string;
  resourceName: string;
  assignedAt: string;
  assignedBy: string;
  status: 'active' | 'pending' | 'error';
}

interface Guardrail {
  id: string;
  name: string;
  version?: string;
}

interface Resource {
  id: string;
  name: string;
  type: 'agent' | 'model' | 'application' | 'endpoint';
}

interface Props {
  guardrails?: Guardrail[];
  resources?: Resource[];
  assignments?: Assignment[];
  onAssign?: (guardrailId: string, resourceId: string, resourceType: string) => void;
  onUnassign?: (assignmentId: string) => void;
  onClose?: () => void;
}

const MOCK_GUARDRAILS: Guardrail[] = [
  { id: 'gr-001', name: 'FSI Standard', version: 'v3' },
  { id: 'gr-002', name: 'AWS Best Practice', version: 'v1' },
  { id: 'gr-003', name: 'Retail Banking Support', version: 'v2' },
];

const MOCK_RESOURCES: Resource[] = [
  { id: 'agent-001', name: 'Customer Service Bot', type: 'agent' },
  { id: 'agent-002', name: 'Loan Advisor', type: 'agent' },
  { id: 'agent-003', name: 'Fraud Detection Agent', type: 'agent' },
  { id: 'model-001', name: 'Claude 3.5 Sonnet', type: 'model' },
  { id: 'model-002', name: 'Claude 3.5 Haiku', type: 'model' },
  { id: 'app-001', name: 'Mobile Banking App', type: 'application' },
  { id: 'app-002', name: 'Internal Portal', type: 'application' },
  { id: 'endpoint-001', name: 'prod-inference-api', type: 'endpoint' },
];

const MOCK_ASSIGNMENTS: Assignment[] = [
  {
    id: 'assign-001',
    guardrailId: 'gr-001',
    guardrailName: 'FSI Standard',
    resourceType: 'agent',
    resourceId: 'agent-001',
    resourceName: 'Customer Service Bot',
    assignedAt: '2024-06-08T10:30:00Z',
    assignedBy: 'alex.rivera@example.com',
    status: 'active',
  },
  {
    id: 'assign-002',
    guardrailId: 'gr-001',
    guardrailName: 'FSI Standard',
    resourceType: 'agent',
    resourceId: 'agent-002',
    resourceName: 'Loan Advisor',
    assignedAt: '2024-06-07T14:15:00Z',
    assignedBy: 'alex.rivera@example.com',
    status: 'active',
  },
  {
    id: 'assign-003',
    guardrailId: 'gr-002',
    guardrailName: 'AWS Best Practice',
    resourceType: 'model',
    resourceId: 'model-001',
    resourceName: 'Claude 3.5 Sonnet',
    assignedAt: '2024-06-06T09:00:00Z',
    assignedBy: 'alex.rivera@example.com',
    status: 'active',
  },
  {
    id: 'assign-004',
    guardrailId: 'gr-003',
    guardrailName: 'Retail Banking Support',
    resourceType: 'application',
    resourceId: 'app-001',
    resourceName: 'Mobile Banking App',
    assignedAt: '2024-06-05T16:45:00Z',
    assignedBy: 'admin@example.com',
    status: 'pending',
  },
];

export default function GuardrailAssignmentView({
  guardrails,
  resources,
  assignments,
  onAssign,
  onUnassign,
  onClose,
}: Props) {
  const [viewMode, setViewMode] = useState<'by-guardrail' | 'by-resource'>('by-guardrail');
  const [filterType, setFilterType] = useState<string>('all');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedGuardrail, setSelectedGuardrail] = useState<string>('');
  const [selectedResource, setSelectedResource] = useState<string>('');

  const availableGuardrails = guardrails || MOCK_GUARDRAILS;
  const availableResources = resources || MOCK_RESOURCES;
  const currentAssignments = assignments || MOCK_ASSIGNMENTS;

  const filteredAssignments = useMemo(() => {
    if (filterType === 'all') return currentAssignments;
    return currentAssignments.filter(a => a.resourceType === filterType);
  }, [currentAssignments, filterType]);

  const groupedByGuardrail = useMemo(() => {
    const groups: Record<string, Assignment[]> = {};
    filteredAssignments.forEach(a => {
      if (!groups[a.guardrailId]) groups[a.guardrailId] = [];
      groups[a.guardrailId].push(a);
    });
    return groups;
  }, [filteredAssignments]);

  const groupedByResource = useMemo(() => {
    const groups: Record<string, Assignment[]> = {};
    filteredAssignments.forEach(a => {
      if (!groups[a.resourceId]) groups[a.resourceId] = [];
      groups[a.resourceId].push(a);
    });
    return groups;
  }, [filteredAssignments]);

  const unassignedResources = useMemo(() => {
    const assignedIds = new Set(currentAssignments.map(a => a.resourceId));
    return availableResources.filter(r => !assignedIds.has(r.id));
  }, [availableResources, currentAssignments]);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getResourceIcon = (type: string): IconName => {
    switch (type) {
      case 'agent': return 'cpu-chip';
      case 'model': return 'brain';
      case 'application': return 'device-phone-mobile';
      case 'endpoint': return 'plug';
      default: return 'archive-box';
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active': return { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' };
      case 'pending': return { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' };
      case 'error': return { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' };
      default: return { bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-400' };
    }
  };

  const handleAssign = () => {
    if (!selectedGuardrail || !selectedResource) return;
    const resource = availableResources.find(r => r.id === selectedResource);
    onAssign?.(selectedGuardrail, selectedResource, resource?.type || 'agent');
    setShowAssignModal(false);
    setSelectedGuardrail('');
    setSelectedResource('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Guardrail Assignments</h2>
          <p className="text-sm text-slate-500 mt-1">
            {currentAssignments.length} assignments • {unassignedResources.length} unassigned resources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAssignModal(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Assignment
          </button>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* View Mode & Filters */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setViewMode('by-guardrail')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'by-guardrail' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            By Guardrail
          </button>
          <button
            onClick={() => setViewMode('by-resource')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'by-resource' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            By Resource
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Filter:</span>
          {['all', 'agent', 'model', 'application', 'endpoint'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                filterType === type
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {type === 'all' ? 'All' : <Icon name={getResourceIcon(type)} className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      </div>

      {/* Assignment List */}
      {viewMode === 'by-guardrail' ? (
        <div className="space-y-4">
          {Object.entries(groupedByGuardrail).map(([guardrailId, assigns]) => {
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
                      <p className="text-xs text-slate-500">{assigns.length} resource{assigns.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {assigns.map(a => {
                    const status = getStatusStyle(a.status);
                    return (
                      <div key={a.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <Icon name={getResourceIcon(a.resourceType)} className="w-5 h-5 text-slate-500" />
                          <div>
                            <div className="text-sm font-medium text-slate-900">{a.resourceName}</div>
                            <div className="text-xs text-slate-500">{a.resourceType} • Assigned {formatDate(a.assignedAt)}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${status.bg} ${status.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                            {a.status}
                          </span>
                          {onUnassign && (
                            <button
                              onClick={() => onUnassign(a.id)}
                              className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"
                              title="Remove assignment"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByResource).map(([resourceId, assigns]) => {
            const resource = availableResources.find(r => r.id === resourceId);
            return (
              <div key={resourceId} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon name={getResourceIcon(resource?.type || 'agent')} className="w-5 h-5 text-slate-500" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{resource?.name || resourceId}</h3>
                      <p className="text-xs text-slate-500">{resource?.type} • {assigns.length} guardrail{assigns.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {assigns.map(a => {
                    const status = getStatusStyle(a.status);
                    return (
                      <div key={a.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-900">{a.guardrailName}</div>
                            <div className="text-xs text-slate-500">Assigned {formatDate(a.assignedAt)}</div>
                          </div>
                        </div>
                        <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${status.bg} ${status.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                          {a.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned Resources Warning */}
      {unassignedResources.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h4 className="text-sm font-semibold text-amber-800">Unprotected Resources</h4>
              <p className="text-xs text-amber-700 mt-1">
                {unassignedResources.length} resource{unassignedResources.length !== 1 ? 's' : ''} without guardrails:
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {unassignedResources.slice(0, 5).map(r => (
                  <span key={r.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded text-xs text-slate-700 border border-amber-200">
                    <Icon name={getResourceIcon(r.type)} className="w-3.5 h-3.5 text-slate-500" /> {r.name}
                  </span>
                ))}
                {unassignedResources.length > 5 && (
                  <span className="text-xs text-amber-600">+{unassignedResources.length - 5} more</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Create Assignment</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Guardrail</label>
                <select
                  value={selectedGuardrail}
                  onChange={e => setSelectedGuardrail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="">Select guardrail...</option>
                  {availableGuardrails.map(g => (
                    <option key={g.id} value={g.id}>{g.name} {g.version && `(${g.version})`}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Resource</label>
                <select
                  value={selectedResource}
                  onChange={e => setSelectedResource(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="">Select resource...</option>
                  {availableResources.map(r => (
                    <option key={r.id} value={r.id}>[{r.type}] {r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={!selectedGuardrail || !selectedResource}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Create Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
