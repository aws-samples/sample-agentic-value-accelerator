export interface UseCaseNode {
  id: string;
  label: string;
  healthScore: number;
  status: 'healthy' | 'warning' | 'critical';
  decisionsToday: number;
  alertCount: number;
}

export interface FleetAlert {
  id: string;
  useCase: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  timestamp: string;
}

export interface FleetKRI {
  label: string;
  value: string;
  trend: 'up' | 'down' | 'flat';
  color: string;
}

export const fleetUseCases: UseCaseNode[] = [
  { id: 'kyc', label: 'KYC Banking', healthScore: 94, status: 'healthy', decisionsToday: 1247, alertCount: 1 },
  { id: 'trade', label: 'Trade Surveillance', healthScore: 91, status: 'healthy', decisionsToday: 3892, alertCount: 0 },
  { id: 'claims', label: 'Claims Processing', healthScore: 88, status: 'warning', decisionsToday: 892, alertCount: 2 },
  { id: 'mortgage', label: 'Mortgage Underwriting', healthScore: 96, status: 'healthy', decisionsToday: 341, alertCount: 0 },
];

export const fleetAlerts: FleetAlert[] = [
  { id: 'a1', useCase: 'Claims', severity: 'warning', description: 'Confidence calibration drift detected (overconfident at 85-95% range)', timestamp: '2026-06-27T06:45:00Z' },
  { id: 'a2', useCase: 'KYC', severity: 'info', description: 'Token budget at 72% utilisation (normal range)', timestamp: '2026-06-27T06:30:00Z' },
  { id: 'a3', useCase: 'Claims', severity: 'warning', description: 'HITL queue depth increasing (4 pending, SLA 2h)', timestamp: '2026-06-27T05:15:00Z' },
];

export const fleetKRIs: FleetKRI[] = [
  { label: 'Total AI Decisions (24h)', value: '6,372', trend: 'up', color: '#3b82f6' },
  { label: 'Human Override Rate', value: '8.3%', trend: 'down', color: '#10b981' },
  { label: 'Policy Violation Rate', value: '0.02%', trend: 'flat', color: '#10b981' },
  { label: 'Avg Decision Latency', value: '2.8s', trend: 'down', color: '#10b981' },
  { label: 'Active Agents', value: '12', trend: 'flat', color: '#3b82f6' },
  { label: 'Autonomy Distribution', value: '8 supervised / 4 autonomous', trend: 'up', color: '#8b5cf6' },
  { label: 'Cost per Decision', value: '$0.42', trend: 'down', color: '#10b981' },
];

export const fleetAggregateScore = 92;
