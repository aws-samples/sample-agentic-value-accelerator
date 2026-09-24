export interface AgentNode {
  id: string;
  name: string;
  role: string;
  description: string;
  status: 'active' | 'idle' | 'alert' | 'disabled';
  healthScore: number;
  decisionsHandled: number;
  lastActive: string;
  cedarPolicies: number;
  autonomyLevel: number;
  color: string;
}

export interface AgentEdge {
  from: string;
  to: string;
  type: 'control' | 'data' | 'governance';
  label: string;
  active: boolean;
}

export const agents: AgentNode[] = [
  { id: 'orchestrator', name: 'Orchestrator', role: 'Routes work, manages sequence', description: 'Coordinates the multi-agent pipeline. Determines which agent handles each step. Manages sequencing, retries, and escalation routing.', status: 'active', healthScore: 99, decisionsHandled: 1247, lastActive: '2026-06-27T07:53:00Z', cedarPolicies: 3, autonomyLevel: 3, color: '#6366f1' },
  { id: 'credit-analyst', name: 'Credit Analyst', role: 'Financial analysis, risk scoring', description: 'Analyses financial data, calculates risk scores, and produces credit assessments using Claude Sonnet 4.5 with deterministic Lambda validation.', status: 'active', healthScore: 94, decisionsHandled: 1247, lastActive: '2026-06-27T07:53:00Z', cedarPolicies: 4, autonomyLevel: 2, color: '#06b6d4' },
  { id: 'compliance-officer', name: 'Compliance Officer', role: 'Sanctions/PEP screening, regulatory checks', description: 'Screens sanctions/PEP lists, verifies regulatory compliance, and escalates to human reviewers when thresholds are breached.', status: 'active', healthScore: 96, decisionsHandled: 1247, lastActive: '2026-06-27T07:53:00Z', cedarPolicies: 5, autonomyLevel: 2, color: '#0ea5e9' },
  { id: 'governance', name: 'Governance', role: 'Real-time output evaluation', description: 'Evaluates every agent output against Cedar policies. Cannot be bypassed — external deterministic enforcement.', status: 'active', healthScore: 100, decisionsHandled: 2494, lastActive: '2026-06-27T07:53:00Z', cedarPolicies: 12, autonomyLevel: 4, color: '#10b981' },
  { id: 'audit', name: 'Audit Agent', role: 'Continuous compliance monitoring', description: 'Generates 7-section evidence packs, scores completeness, maintains immutable audit trail for regulatory inspection.', status: 'idle', healthScore: 97, decisionsHandled: 89, lastActive: '2026-06-27T06:00:00Z', cedarPolicies: 2, autonomyLevel: 3, color: '#f59e0b' },
  { id: 'qa-research', name: 'QA Research', role: 'Qualitative spot-checking', description: '5-dimension rubric scoring. Catches cases that pass automated evals but fail on reasoning quality.', status: 'idle', healthScore: 92, decisionsHandled: 23, lastActive: '2026-06-27T04:00:00Z', cedarPolicies: 2, autonomyLevel: 2, color: '#ec4899' },
];

export const edges: AgentEdge[] = [
  { from: 'orchestrator', to: 'credit-analyst', type: 'control', label: 'Routes financial analysis', active: true },
  { from: 'orchestrator', to: 'compliance-officer', type: 'control', label: 'Routes compliance checks', active: true },
  { from: 'credit-analyst', to: 'governance', type: 'governance', label: 'Policy checks on outputs', active: true },
  { from: 'compliance-officer', to: 'governance', type: 'governance', label: 'Screening validation', active: true },
  { from: 'governance', to: 'orchestrator', type: 'data', label: 'Allow/Deny signals', active: true },
  { from: 'orchestrator', to: 'audit', type: 'control', label: 'Triggers evidence packs', active: false },
  { from: 'credit-analyst', to: 'qa-research', type: 'data', label: 'Sample decisions for review', active: false },
  { from: 'qa-research', to: 'governance', type: 'data', label: 'Quality scores', active: false },
];
