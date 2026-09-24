import type { BlastLevel, LogSeverity } from '../types/simulation';

/** An AI agent within the governance system */
export interface Agent {
  id: string;
  name: string;
  role: string;
  tier: 1 | 2 | 3 | 4;
  allowedTools: string[];
  prohibitedTools: string[];
  escalationPath: string[];
}

/** A policy rule in the 3-layer cascade */
export interface PolicyRule {
  id: string;
  layer: 'ORG' | 'APP' | 'REQ';
  description: string;
  triggerCondition: string;
  action: 'BLOCK' | 'ESCALATE' | 'ALLOW';
}

/** A risk entry for the risk register */
export interface RiskEntry {
  id: string;
  category: string;
  description: string;
  likelihood: 'low' | 'medium' | 'high' | 'critical';
  impact: 'low' | 'medium' | 'high' | 'critical';
  controls: string[];
  residualRisk: 'low' | 'medium' | 'high';
}

/** A governance control */
export interface Control {
  id: string;
  name: string;
  type: 'deterministic' | 'probabilistic' | 'observability';
  awsService: string;
  description: string;
}

/** Log entry for simulation */
export interface SimLogEntry {
  t: string;
  a: string;
  m: string;
  c: LogSeverity;
}

/** A simulation step */
export interface SimulationStep {
  icon: string;
  title: string;
  type: string;
  blast: BlastLevel;
  log: SimLogEntry[];
  risks: string[];
  ctrls: string[];
  insight: string;
}

/** A scenario (good path or bad path) */
export interface Scenario {
  id: string;
  label: string;
  customerName: string;
  customerId: string;
  outcome: 'APPROVE' | 'BLOCK' | 'ESCALATE';
  steps: SimulationStep[];
}

/** Complete use case configuration */
export interface UseCase {
  id: string;
  name: string;
  domain: string;
  description: string;
  agents: Agent[];
  policies: PolicyRule[];
  risks: RiskEntry[];
  controls: Control[];
  scenarios: {
    approve: Scenario;
    block: Scenario;
  };
  /** Step index where HITL pause occurs in block scenario (0-indexed) */
  hitlStepIndex: number;
}
