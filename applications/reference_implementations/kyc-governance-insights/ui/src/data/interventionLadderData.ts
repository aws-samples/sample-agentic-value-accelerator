export interface InterventionLevel {
  level: number;
  name: string;
  color: string;
  description: string;
}

export interface InterventionHistory {
  timestamp: string;
  level: number;
  trigger: string;
  duration: string;
  resolvedBy: string;
}

export const interventionLevels: InterventionLevel[] = [
  { level: 5, name: 'FULL STOP', color: '#dc2626', description: 'Agent terminated, all traffic rejected' },
  { level: 4, name: 'HUMAN ONLY', color: '#ea580c', description: 'All decisions require human approval' },
  { level: 3, name: 'CONSTRAIN', color: '#f59e0b', description: 'Reduce scope (fewer tools, simpler cases only)' },
  { level: 2, name: 'THROTTLE', color: '#eab308', description: 'Reduce throughput (50% → 25% → 10% of normal)' },
  { level: 1, name: 'MONITOR', color: '#10b981', description: 'Normal operation, enhanced logging' },
];

export const currentInterventionLevel = 1;

export const interventionHistory: InterventionHistory[] = [
  { timestamp: '2026-06-25T14:32:00Z', level: 3, trigger: 'Sanctions precision dropped below 85%', duration: '47 minutes', resolvedBy: 'Auto-resolved after eval score recovered to 91%' },
  { timestamp: '2026-06-20T09:15:00Z', level: 2, trigger: 'Latency SLA breach (p95 > 60s)', duration: '12 minutes', resolvedBy: 'Bedrock throttle lifted, latency normalized' },
  { timestamp: '2026-06-18T16:45:00Z', level: 4, trigger: 'GameDay exercise (planned)', duration: '15 minutes', resolvedBy: 'Exercise completed, restored to Level 1' },
];
