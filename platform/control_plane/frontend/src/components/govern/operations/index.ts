// Operations Hub - Tab Components
export { default as OpsOverview } from './OpsOverview';
export { default as FleetHealth } from './FleetHealth';
export { default as IncidentManagement } from './IncidentManagement';
export { default as OnCallCenter } from './OnCallCenter';
export { default as ChangeManagement } from './ChangeManagement';
export { default as AlertCenter } from './AlertCenter';
export { default as SLACenter } from './SLACenter';
export { default as RunbookCenter } from './RunbookCenter';
export { default as CapacityPlanning } from './CapacityPlanning';
export { default as OpsCompliance } from './OpsCompliance';
export { default as AuditEvidence } from './AuditEvidence';
export { default as OpsMetrics } from './OpsMetrics';
export { default as ReportsCenter } from './ReportsCenter';
export { default as ControlTrends } from './ControlTrends';
export { default as AttestationWorkflow } from './AttestationWorkflow';
export { default as RemediationPlaybooks } from './RemediationPlaybooks';
export { default as AgentResourceInventory } from './AgentResourceInventory';
export { default as FrameworkReportsModule } from './FrameworkReportsModule';

// Live data hooks for Reports
export {
  useAgentResourceData,
  useFrameworkCompliance,
  useReportsDataSummary,
  type AgentResourceSummary,
  type GuardrailSummary,
  type FrameworkComplianceSummary,
  type ReportsDataSummary,
  type DataSourceInfo,
} from './useReportsLiveData';

// API Hooks for live data
export {
  // Fleet Health hooks
  useFleetStatus,
  useFleetAgents,
  useAgentDetail,
  // Incident hooks
  useIncidents,
  useIncidentDetail,
  useIncidentMutations,
  // Alert hooks
  useActiveAlerts,
  useAlertRules,
  useAlertMutations,
  // SLA hooks
  useSLAs,
  useSLABreaches,
  useSLACompliance,
  // On-Call hooks
  useOnCall,
  useEscalationPolicies,
  // Change Management hooks
  useChanges,
  usePendingApprovals,
  useChangeMutations,
  // Metrics hooks
  useOpsMetrics,
  useOpsTrends,
  // Capacity hooks
  useCapacityQuotas,
  useCapacityAlerts,
  // Composite hooks
  useOpsOverview,
  // Types
  type UseApiResult,
  type UseApiResultWithMutations,
  type FleetAgentFilters,
  type IncidentFilters,
  type AlertFilters,
  type ChangeFilters,
} from './useOperationsApi';
