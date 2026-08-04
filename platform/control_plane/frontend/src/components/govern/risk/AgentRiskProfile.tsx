/**
 * AgentRiskProfile — Agent-specific risk assessment for agentic AI systems
 *
 * Captures risk factors unique to autonomous agents:
 * - Tool Access: What tools can the agent invoke? What's the blast radius?
 * - Data Scope: What data can the agent access? PII exposure surface?
 * - Autonomy Level: Can it act without human approval? Override decisions?
 * - Scope Boundaries: Can it exceed intended authority?
 * - Multi-Agent Chains: How do failures propagate across agent orchestration?
 */

import { useState, useMemo } from 'react';
import { getRiskScoreBadge, getRiskScoreTextColor } from '../riskScoring';
import { scopeColor, scopeName, type AgentScopeLevel } from '../autonomyLadder';

interface AgentProfile {
  id: string;
  name: string;
  owner: string;
  status: 'active' | 'staging' | 'development';
  toolAccess: ToolAccess[];
  dataAccess: DataAccess[];
  autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous' | 'fully-autonomous';
  scopeBoundaries: ScopeBoundary[];
  chainParticipation: ChainParticipation[];
  overallRisk: number;
  lastAssessed: string;
}

interface ToolAccess {
  tool: string;
  category: 'read' | 'write' | 'execute' | 'admin';
  criticalityScore: number;
  blastRadius: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

interface DataAccess {
  dataSource: string;
  accessType: 'read' | 'read-write';
  containsPII: boolean;
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
  recordCount: string;
}

interface ScopeBoundary {
  boundary: string;
  enforced: boolean;
  mechanism: string;
}

interface ChainParticipation {
  chainName: string;
  role: 'initiator' | 'processor' | 'validator' | 'terminator';
  upstreamAgents: string[];
  downstreamAgents: string[];
  failureImpact: 'isolated' | 'partial-cascade' | 'full-cascade';
}

// Risk-multiplier bands, keyed to the canonical autonomy ladder (autonomyLadder.ts).
// `scopeLevel` ties each band to AGENT_SCOPE_META; colors are derived from canonical
// (no local hex). Two bands intentionally share L3 (Supervised) as distinct sub-modes
// with different risk weights. The "supervised/approves-every-action" band maps to L2
// (Prescribed Agency), resolving the old "Supervised" name+color collision.
const AUTONOMY_LEVELS: Array<{
  id: 'supervised' | 'semi-autonomous' | 'autonomous' | 'fully-autonomous';
  label: string;
  scopeLevel: AgentScopeLevel;
  description: string;
  riskMultiplier: number;
  color: string;
}> = [
  { id: 'supervised', label: 'Supervised', scopeLevel: 2, description: 'Human approves every action', riskMultiplier: 1.0, color: scopeColor(2) },
  { id: 'semi-autonomous', label: 'Semi-Autonomous', scopeLevel: 3, description: 'Human approves high-risk actions', riskMultiplier: 1.5, color: scopeColor(3) },
  { id: 'autonomous', label: 'Autonomous', scopeLevel: 3, description: 'Acts independently within bounds', riskMultiplier: 2.0, color: scopeColor(3) },
  { id: 'fully-autonomous', label: 'Fully Autonomous', scopeLevel: 4, description: 'No human oversight required', riskMultiplier: 3.0, color: scopeColor(4) },
];

const BLAST_RADIUS_COLORS = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

const MOCK_AGENTS: AgentProfile[] = [
  {
    id: 'agent-001',
    name: 'Customer Service Agent',
    owner: 'CX Team',
    status: 'active',
    autonomyLevel: 'semi-autonomous',
    overallRisk: 45,
    lastAssessed: '2026-06-10',
    toolAccess: [
      { tool: 'CRM Lookup', category: 'read', criticalityScore: 30, blastRadius: 'low', description: 'Read customer records' },
      { tool: 'Ticket Creation', category: 'write', criticalityScore: 40, blastRadius: 'medium', description: 'Create support tickets' },
      { tool: 'Refund Processing', category: 'execute', criticalityScore: 75, blastRadius: 'high', description: 'Issue refunds up to $500' },
    ],
    dataAccess: [
      { dataSource: 'Customer Database', accessType: 'read', containsPII: true, classification: 'confidential', recordCount: '2.4M' },
      { dataSource: 'Order History', accessType: 'read', containsPII: true, classification: 'internal', recordCount: '8.1M' },
    ],
    scopeBoundaries: [
      { boundary: 'Refund limit $500', enforced: true, mechanism: 'Guardrail policy' },
      { boundary: 'No account deletion', enforced: true, mechanism: 'IAM permission' },
      { boundary: 'Business hours only', enforced: false, mechanism: 'Scheduled policy' },
    ],
    chainParticipation: [
      { chainName: 'Support Escalation', role: 'initiator', upstreamAgents: [], downstreamAgents: ['Escalation Agent'], failureImpact: 'isolated' },
    ],
  },
  {
    id: 'agent-002',
    name: 'Trading Compliance Agent',
    owner: 'Risk Management',
    status: 'active',
    autonomyLevel: 'autonomous',
    overallRisk: 78,
    lastAssessed: '2026-06-12',
    toolAccess: [
      { tool: 'Trade Surveillance', category: 'read', criticalityScore: 60, blastRadius: 'medium', description: 'Monitor trading activity' },
      { tool: 'Alert Generation', category: 'write', criticalityScore: 50, blastRadius: 'medium', description: 'Create compliance alerts' },
      { tool: 'Trade Halt', category: 'execute', criticalityScore: 95, blastRadius: 'critical', description: 'Suspend trading accounts' },
      { tool: 'Regulatory Reporting', category: 'execute', criticalityScore: 85, blastRadius: 'high', description: 'Submit to regulators' },
    ],
    dataAccess: [
      { dataSource: 'Trading Systems', accessType: 'read', containsPII: true, classification: 'restricted', recordCount: '45M' },
      { dataSource: 'Client Accounts', accessType: 'read-write', containsPII: true, classification: 'restricted', recordCount: '1.2M' },
      { dataSource: 'Market Data', accessType: 'read', containsPII: false, classification: 'internal', recordCount: '∞' },
    ],
    scopeBoundaries: [
      { boundary: 'Cannot execute trades', enforced: true, mechanism: 'IAM permission' },
      { boundary: 'Halt requires 2FA confirm', enforced: true, mechanism: 'Guardrail approval' },
      { boundary: 'Max alert rate 100/hr', enforced: true, mechanism: 'Rate limiter' },
    ],
    chainParticipation: [
      { chainName: 'Compliance Pipeline', role: 'processor', upstreamAgents: ['Data Aggregator'], downstreamAgents: ['Report Generator', 'Notification Agent'], failureImpact: 'partial-cascade' },
    ],
  },
  {
    id: 'agent-003',
    name: 'DevOps Deployment Agent',
    owner: 'Platform Engineering',
    status: 'staging',
    autonomyLevel: 'fully-autonomous',
    overallRisk: 92,
    lastAssessed: '2026-06-14',
    toolAccess: [
      { tool: 'Git Operations', category: 'write', criticalityScore: 70, blastRadius: 'high', description: 'Push code, create branches' },
      { tool: 'CI/CD Pipeline', category: 'execute', criticalityScore: 85, blastRadius: 'critical', description: 'Trigger deployments' },
      { tool: 'Infrastructure Provisioning', category: 'admin', criticalityScore: 95, blastRadius: 'critical', description: 'Create/destroy resources' },
      { tool: 'Secret Management', category: 'read', criticalityScore: 90, blastRadius: 'critical', description: 'Access deployment secrets' },
    ],
    dataAccess: [
      { dataSource: 'Source Code Repos', accessType: 'read-write', containsPII: false, classification: 'confidential', recordCount: '450 repos' },
      { dataSource: 'Secrets Vault', accessType: 'read', containsPII: false, classification: 'restricted', recordCount: '2.3K secrets' },
      { dataSource: 'Infrastructure State', accessType: 'read-write', containsPII: false, classification: 'restricted', recordCount: '1.8K resources' },
    ],
    scopeBoundaries: [
      { boundary: 'Production requires approval', enforced: true, mechanism: 'Deployment gate' },
      { boundary: 'No database migrations', enforced: false, mechanism: 'Policy (pending)' },
      { boundary: 'Rollback on failure', enforced: true, mechanism: 'Pipeline config' },
    ],
    chainParticipation: [
      { chainName: 'CI/CD Orchestration', role: 'terminator', upstreamAgents: ['Code Review Agent', 'Security Scanner', 'Test Agent'], downstreamAgents: [], failureImpact: 'full-cascade' },
    ],
  },
];

export default function AgentRiskProfile() {
  const [selectedAgent, setSelectedAgent] = useState<AgentProfile | null>(MOCK_AGENTS[0]);
  const [expandedSection, setExpandedSection] = useState<string | null>('tools');

  const agentCount = useMemo(() => ({
    total: MOCK_AGENTS.length,
    active: MOCK_AGENTS.filter(a => a.status === 'active').length,
    highRisk: MOCK_AGENTS.filter(a => a.overallRisk >= 50).length,
    autonomous: MOCK_AGENTS.filter(a => a.autonomyLevel === 'autonomous' || a.autonomyLevel === 'fully-autonomous').length,
  }), []);

  const calculateToolRisk = (tools: ToolAccess[]) => {
    if (tools.length === 0) return 0;
    const weights = { read: 1, write: 2, execute: 3, admin: 4 };
    const blastWeights = { low: 1, medium: 2, high: 3, critical: 4 };
    return Math.round(
      tools.reduce((sum, t) => sum + (t.criticalityScore * weights[t.category] * blastWeights[t.blastRadius]) / 16, 0) / tools.length
    );
  };

  const calculateDataRisk = (data: DataAccess[]) => {
    if (data.length === 0) return 0;
    const classWeights = { public: 1, internal: 2, confidential: 3, restricted: 4 };
    return Math.round(
      data.reduce((sum, d) => {
        let score = classWeights[d.classification] * 20;
        if (d.containsPII) score *= 1.5;
        if (d.accessType === 'read-write') score *= 1.3;
        return sum + score;
      }, 0) / data.length
    );
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-slate-900">{agentCount.total}</div>
          <div className="text-xs text-slate-500">Total Agents Profiled</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-emerald-600">{agentCount.active}</div>
          <div className="text-xs text-slate-500">Active in Production</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-red-600">{agentCount.highRisk}</div>
          <div className="text-xs text-slate-500">High+ Risk (50+)</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
          <div className="text-2xl font-bold text-amber-600">{agentCount.autonomous}</div>
          <div className="text-xs text-slate-500">Autonomous+</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent List */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Agent Inventory</h3>
          <div className="space-y-2">
            {MOCK_AGENTS.map(agent => {
              const autonomy = AUTONOMY_LEVELS.find(a => a.id === agent.autonomyLevel);
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedAgent?.id === agent.id
                      ? 'border-indigo-300 bg-indigo-50/50 ring-2 ring-indigo-100'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-900 text-sm">{agent.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRiskScoreBadge(agent.overallRisk)}`}>
                      {agent.overallRisk}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className={`w-2 h-2 rounded-full ${agent.status === 'active' ? 'bg-emerald-500' : agent.status === 'staging' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                    <span className="capitalize">{agent.status}</span>
                    <span className="text-slate-300">•</span>
                    <span style={{ color: autonomy?.color }}>{autonomy?.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Agent Detail */}
        {selectedAgent && (
          <div className="lg:col-span-2 space-y-4">
            {/* Agent Header */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{selectedAgent.name}</h2>
                  <p className="text-sm text-slate-500">{selectedAgent.owner} • Last assessed {selectedAgent.lastAssessed}</p>
                </div>
                <div className="text-right">
                  <div className={`text-3xl font-bold ${getRiskScoreTextColor(selectedAgent.overallRisk)}`}>
                    {selectedAgent.overallRisk}
                  </div>
                  <div className="text-xs text-slate-500">Overall Risk Score</div>
                </div>
              </div>

              {/* Autonomy Level */}
              <div className="mb-4">
                <div className="text-xs font-medium text-slate-500 mb-2">Autonomy Level</div>
                <div className="flex gap-1">
                  {AUTONOMY_LEVELS.map(level => {
                    const isActive = level.id === selectedAgent.autonomyLevel;
                    return (
                      <div
                        key={level.id}
                        className={`flex-1 p-2 rounded-lg text-center transition-all ${
                          isActive ? 'ring-2' : 'opacity-40'
                        }`}
                        style={{
                          backgroundColor: isActive ? `${level.color}15` : '#f8fafc',
                          borderColor: level.color,
                          boxShadow: isActive ? `0 0 0 2px ${level.color}` : 'none',
                        }}
                      >
                        <div className="text-xs font-semibold" style={{ color: isActive ? level.color : '#94a3b8' }}>
                          {level.label}
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5">L{level.scopeLevel} · {scopeName(level.scopeLevel)}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{level.riskMultiplier}x</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Risk Breakdown */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-slate-900">{calculateToolRisk(selectedAgent.toolAccess)}</div>
                  <div className="text-[10px] text-slate-500">Tool Risk</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-slate-900">{calculateDataRisk(selectedAgent.dataAccess)}</div>
                  <div className="text-[10px] text-slate-500">Data Risk</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-slate-900">
                    {selectedAgent.chainParticipation.some(c => c.failureImpact === 'full-cascade') ? 'High' :
                     selectedAgent.chainParticipation.some(c => c.failureImpact === 'partial-cascade') ? 'Med' : 'Low'}
                  </div>
                  <div className="text-[10px] text-slate-500">Chain Risk</div>
                </div>
              </div>
            </div>

            {/* Tool Access */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden">
              <button
                onClick={() => toggleSection('tools')}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔧</span>
                  <span className="font-medium text-slate-900">Tool Access</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {selectedAgent.toolAccess.length} tools
                  </span>
                </div>
                <svg className={`w-5 h-5 text-slate-400 transition-transform ${expandedSection === 'tools' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSection === 'tools' && (
                <div className="px-4 pb-4">
                  <div className="space-y-2">
                    {selectedAgent.toolAccess.map((tool, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-slate-900">{tool.tool}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                              tool.category === 'admin' ? 'bg-red-100 text-red-700' :
                              tool.category === 'execute' ? 'bg-orange-100 text-orange-700' :
                              tool.category === 'write' ? 'bg-amber-100 text-amber-700' :
                              'bg-emerald-100 text-emerald-700'
                            }`}>
                              {tool.category}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{tool.description}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-700">{tool.criticalityScore}</div>
                          <div className="text-[10px] font-medium" style={{ color: BLAST_RADIUS_COLORS[tool.blastRadius] }}>
                            {tool.blastRadius} blast
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Data Access */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden">
              <button
                onClick={() => toggleSection('data')}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🗄️</span>
                  <span className="font-medium text-slate-900">Data Access</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {selectedAgent.dataAccess.length} sources
                  </span>
                  {selectedAgent.dataAccess.some(d => d.containsPII) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                      PII Access
                    </span>
                  )}
                </div>
                <svg className={`w-5 h-5 text-slate-400 transition-transform ${expandedSection === 'data' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSection === 'data' && (
                <div className="px-4 pb-4">
                  <div className="space-y-2">
                    {selectedAgent.dataAccess.map((data, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-slate-900">{data.dataSource}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                              data.classification === 'restricted' ? 'bg-red-100 text-red-700' :
                              data.classification === 'confidential' ? 'bg-orange-100 text-orange-700' :
                              data.classification === 'internal' ? 'bg-amber-100 text-amber-700' :
                              'bg-emerald-100 text-emerald-700'
                            }`}>
                              {data.classification}
                            </span>
                            {data.containsPII && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                                PII
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{data.accessType} • {data.recordCount} records</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Scope Boundaries */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden">
              <button
                onClick={() => toggleSection('scope')}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🛡️</span>
                  <span className="font-medium text-slate-900">Scope Boundaries</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {selectedAgent.scopeBoundaries.filter(b => b.enforced).length}/{selectedAgent.scopeBoundaries.length} enforced
                  </span>
                </div>
                <svg className={`w-5 h-5 text-slate-400 transition-transform ${expandedSection === 'scope' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSection === 'scope' && (
                <div className="px-4 pb-4">
                  <div className="space-y-2">
                    {selectedAgent.scopeBoundaries.map((boundary, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          boundary.enforced ? 'bg-emerald-100' : 'bg-amber-100'
                        }`}>
                          {boundary.enforced ? (
                            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-sm text-slate-900">{boundary.boundary}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{boundary.mechanism}</div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          boundary.enforced ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {boundary.enforced ? 'Enforced' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Chain Participation */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 overflow-hidden">
              <button
                onClick={() => toggleSection('chains')}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔗</span>
                  <span className="font-medium text-slate-900">Multi-Agent Chains</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {selectedAgent.chainParticipation.length} chains
                  </span>
                </div>
                <svg className={`w-5 h-5 text-slate-400 transition-transform ${expandedSection === 'chains' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSection === 'chains' && (
                <div className="px-4 pb-4">
                  <div className="space-y-3">
                    {selectedAgent.chainParticipation.map((chain, i) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-slate-900">{chain.chainName}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${
                              chain.role === 'initiator' ? 'bg-blue-100 text-blue-700' :
                              chain.role === 'terminator' ? 'bg-violet-100 text-violet-700' :
                              chain.role === 'validator' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-slate-200 text-slate-700'
                            }`}>
                              {chain.role}
                            </span>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            chain.failureImpact === 'full-cascade' ? 'bg-red-100 text-red-700' :
                            chain.failureImpact === 'partial-cascade' ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {chain.failureImpact.replace('-', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          {chain.upstreamAgents.length > 0 && (
                            <span>← {chain.upstreamAgents.join(', ')}</span>
                          )}
                          {chain.upstreamAgents.length > 0 && chain.downstreamAgents.length > 0 && (
                            <span className="text-slate-300">|</span>
                          )}
                          {chain.downstreamAgents.length > 0 && (
                            <span>{chain.downstreamAgents.join(', ')} →</span>
                          )}
                          {chain.upstreamAgents.length === 0 && chain.downstreamAgents.length === 0 && (
                            <span className="text-slate-400 italic">Standalone in chain</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
