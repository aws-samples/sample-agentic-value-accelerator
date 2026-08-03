/**
 * agentThreatProfile — Derive OWASP Agentic threats applicable to a specific agent.
 *
 * Based on the agent's characteristics (autonomy scope, tools, data access, A2A
 * relationships, guardrail presence), computes which OWASP T1-T17 threats apply
 * and at what severity. This ties agents to specific threats for governance.
 */

import type { AgentRegistryEntry } from './mockData';
import { AGENTIC_RISK_CATEGORIES, type AgenticRiskCategory } from './risk/riskData';
import { CONTROLS, type ControlId } from './threatModelData';

export interface AgentThreat {
  threatId: AgenticRiskCategory;
  name: string;
  reason: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  mitigatingControls: ControlId[];
  mitigated: boolean;
}

export interface AgentThreatProfile {
  agentId: string;
  agentName: string;
  threats: AgentThreat[];
  riskScore: number;
  criticalCount: number;
  highCount: number;
  mitigatedCount: number;
}

const THREAT_NAMES: Record<AgenticRiskCategory, string> = {
  T1: 'Memory Poisoning',
  T2: 'Tool Misuse',
  T3: 'Privilege Compromise',
  T4: 'Resource Overload',
  T5: 'Cascading Hallucination',
  T6: 'Intent Breaking',
  T7: 'Goal/Task Hijacking',
  T8: 'Repudiation',
  T9: 'Identity Spoofing',
  T10: 'Human Attack',
  T11: 'Remote Code Execution',
  T12: 'Rogue Agents',
  T13: 'Inter-Agent Communication',
  T14: 'Excessive Delegation',
  T15: 'Security AI Evasion',
  T16: 'Protocol Abuse',
  T17: 'Supply Chain Poisoning',
};

export function deriveAgentThreatProfile(agent: AgentRegistryEntry): AgentThreatProfile {
  const threats: AgentThreat[] = [];
  const hasGuardrail = !!agent.guardrailId;
  const hasCedarPolicy = true; // Assume Cedar is always available in this platform
  const scope = agent.scopeLevel;
  const hasTools = agent.tools.length > 0;
  const hasA2A = agent.invokesAgents.length > 0;
  const handlesPii = agent.dataAccess.some(d =>
    d.toLowerCase().includes('pii') ||
    d.toLowerCase().includes('customer') ||
    d.toLowerCase().includes('identity')
  );
  const isProd = agent.status === 'production';

  // T1: Memory Poisoning — agents with persistent memory or RAG
  if (agent.dataAccess.some(d => d.toLowerCase().includes('knowledge') || d.toLowerCase().includes('memory'))) {
    threats.push({
      threatId: 'T1',
      name: THREAT_NAMES.T1,
      reason: 'Agent accesses knowledge bases that could be poisoned',
      severity: isProd ? 'high' : 'medium',
      mitigatingControls: ['guardrails', 'audit-log'],
      mitigated: hasGuardrail,
    });
  }

  // T2: Tool Misuse — any agent with tools
  if (hasTools) {
    const highRiskTools = agent.tools.length > 3;
    threats.push({
      threatId: 'T2',
      name: THREAT_NAMES.T2,
      reason: `Agent has ${agent.tools.length} authorized tools`,
      severity: highRiskTools ? 'high' : 'medium',
      mitigatingControls: ['cedar-policy', 'autonomy-gate', 'hitl'],
      mitigated: hasCedarPolicy && scope <= 2,
    });
  }

  // T3: Privilege Compromise — agents with high autonomy + sensitive data
  if (scope >= 3 && handlesPii) {
    threats.push({
      threatId: 'T3',
      name: THREAT_NAMES.T3,
      reason: `L${scope} autonomy with access to sensitive data`,
      severity: scope === 4 ? 'critical' : 'high',
      mitigatingControls: ['cedar-policy', 'identity', 'audit-log'],
      mitigated: hasCedarPolicy,
    });
  }

  // T4: Resource Overload — any production agent
  if (isProd) {
    threats.push({
      threatId: 'T4',
      name: THREAT_NAMES.T4,
      reason: 'Production agent could be targeted for DoS',
      severity: agent.metrics.invocations30d > 10000 ? 'high' : 'medium',
      mitigatingControls: ['autonomy-gate', 'kill-switch'],
      mitigated: true, // Rate limits assumed
    });
  }

  // T5: Cascading Hallucination — agents without grounding
  if (scope >= 3 && !hasGuardrail) {
    threats.push({
      threatId: 'T5',
      name: THREAT_NAMES.T5,
      reason: 'High-autonomy agent without guardrail grounding',
      severity: 'high',
      mitigatingControls: ['guardrails', 'hitl'],
      mitigated: false,
    });
  }

  // T6: Intent Breaking — agents accepting external input
  if (scope >= 2) {
    threats.push({
      threatId: 'T6',
      name: THREAT_NAMES.T6,
      reason: 'Agent could receive adversarial prompts',
      severity: hasGuardrail ? 'low' : 'high',
      mitigatingControls: ['guardrails', 'autonomy-gate'],
      mitigated: hasGuardrail,
    });
  }

  // T9: Identity Spoofing — agents with A2A or high autonomy
  if (hasA2A || scope >= 3) {
    threats.push({
      threatId: 'T9',
      name: THREAT_NAMES.T9,
      reason: hasA2A ? 'Agent participates in A2A communication' : 'High-autonomy agent',
      severity: hasA2A ? 'high' : 'medium',
      mitigatingControls: ['identity', 'audit-log'],
      mitigated: true, // Identity system assumed
    });
  }

  // T12-T14: Multi-agent threats — only if A2A enabled
  if (hasA2A) {
    threats.push({
      threatId: 'T12',
      name: THREAT_NAMES.T12,
      reason: `Can invoke ${agent.invokesAgents.length} other agents`,
      severity: agent.invokesAgents.length > 2 ? 'high' : 'medium',
      mitigatingControls: ['a2a-ceiling', 'identity'],
      mitigated: true, // A2A ceiling assumed
    });

    threats.push({
      threatId: 'T13',
      name: THREAT_NAMES.T13,
      reason: 'Inter-agent communication could be exploited',
      severity: 'medium',
      mitigatingControls: ['a2a-ceiling', 'audit-log', 'kill-switch'],
      mitigated: true,
    });

    if (scope >= 3) {
      threats.push({
        threatId: 'T14',
        name: THREAT_NAMES.T14,
        reason: 'High-autonomy agent may over-delegate',
        severity: scope === 4 ? 'high' : 'medium',
        mitigatingControls: ['a2a-ceiling', 'hitl'],
        mitigated: scope <= 3,
      });
    }
  }

  // T11: RCE — agents with code execution capability
  if (agent.tools.some(t => t.includes('execute') || t.includes('code'))) {
    threats.push({
      threatId: 'T11',
      name: THREAT_NAMES.T11,
      reason: 'Agent has code execution capabilities',
      severity: 'critical',
      mitigatingControls: ['sandbox', 'hitl'],
      mitigated: false, // Sandbox not fully built
    });
  }

  // Calculate summary stats
  const severityScore = { critical: 4, high: 3, medium: 2, low: 1 };
  const riskScore = threats.reduce((sum, t) => sum + (t.mitigated ? 0 : severityScore[t.severity]), 0);
  const criticalCount = threats.filter(t => t.severity === 'critical' && !t.mitigated).length;
  const highCount = threats.filter(t => t.severity === 'high' && !t.mitigated).length;
  const mitigatedCount = threats.filter(t => t.mitigated).length;

  return {
    agentId: agent.id,
    agentName: agent.name,
    threats: threats.sort((a, b) => severityScore[b.severity] - severityScore[a.severity]),
    riskScore,
    criticalCount,
    highCount,
    mitigatedCount,
  };
}

export { THREAT_NAMES, CONTROLS };
