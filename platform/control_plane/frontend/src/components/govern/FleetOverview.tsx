/**
 * AgentFleetGovernance — Agent Control Plane for the Govern module.
 *
 * Centralized governance dashboard for agentic AI fleet:
 *   - 5-Pillar Control Plane posture (Registry, Access, Visualization, Interop, Security)
 *   - Fleet Risk Posture aligned to AWS Scoping Matrix & OWASP Agentic AI Threats
 *   - Emergency Controls for incident response (Kill, Throttle, LOG_ONLY, Restart)
 *   - Guardrail observability with real-time metrics
 *   - Use case risk heatmap and control checklist
 */

import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { tooltipStyle, AGENT_PROVIDER_CONFIG, ALL_AGENTS, type AgentProvider } from './mockData';
import RiskDrawer from './RiskDrawer';
import UnifiedGuide, { FLEET_GUIDE } from './UnifiedGuide';
import { useGovernanceAggregator } from './useGovernanceAggregator';
import { useGuardrailMetrics } from './useGuardrailMetrics';
import EmergencyControls from './EmergencyControls';
import FleetPostureSection from './FleetPostureSection';
import EmptyState from './EmptyState';
import GovernPageLayout from './GovernPageLayout';
import FleetScaleView from './FleetScaleView';
import GovernanceDimensionsCard from './GovernanceDimensionsCard';
import { Icon, type IconName } from './icons';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';
import { governAgentCoreApi, type AwsDiscoveredAgent } from '../../api/client';
import CoreBadge from './CoreBadge';

function cellColor(score: number): string {
  if (score < 20) return 'bg-emerald-100 text-emerald-800';
  if (score < 40) return 'bg-lime-100 text-lime-800';
  if (score < 60) return 'bg-amber-100 text-amber-800';
  if (score < 80) return 'bg-orange-100 text-orange-800';
  return 'bg-rose-100 text-rose-800';
}

function scoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

// Demo data for Fleet Risk View when no real data exists
const DEMO_RISK_HEATMAP = [
  { useCaseId: 'demo-1', name: 'Fraud Detection Agent', scores: [75, 82, 45, 68, 55], goNoGo: 'CONDITIONAL GO' },
  { useCaseId: 'demo-2', name: 'Customer Service Bot', scores: [25, 35, 20, 42, 30], goNoGo: 'GO' },
  { useCaseId: 'demo-3', name: 'Credit Risk Analyzer', scores: [88, 72, 65, 80, 78], goNoGo: 'NO GO' },
  { useCaseId: 'demo-4', name: 'Document Classifier', scores: [15, 22, 18, 25, 12], goNoGo: 'GO' },
  { useCaseId: 'demo-5', name: 'Trading Assistant', scores: [65, 78, 55, 72, 60], goNoGo: 'CONDITIONAL GO' },
  { useCaseId: 'demo-6', name: 'Compliance Reviewer', scores: [45, 52, 38, 55, 48], goNoGo: 'GO' },
];

const DEMO_TOP_RISKY = [
  { useCaseId: 'demo-3', name: 'Credit Risk Analyzer', riskScore: 77, status: 'Development' },
  { useCaseId: 'demo-1', name: 'Fraud Detection Agent', riskScore: 65, status: 'Production' },
  { useCaseId: 'demo-5', name: 'Trading Assistant', riskScore: 66, status: 'Staging' },
  { useCaseId: 'demo-6', name: 'Compliance Reviewer', riskScore: 48, status: 'Production' },
  { useCaseId: 'demo-2', name: 'Customer Service Bot', riskScore: 30, status: 'Production' },
  { useCaseId: 'demo-4', name: 'Document Classifier', riskScore: 18, status: 'Production' },
];

// Fleet Risk View - Combined heatmap, rankings, and KPIs
function FleetRiskView({
  useCaseRiskHeatmap,
  useCaseRiskCategories,
  topRiskyUseCases,
  onOpenRisk,
  cellColor,
  tooltipStyle,
  liveAgentData,
  isLiveData,
}: {
  useCaseRiskHeatmap: Array<{ useCaseId: string; name: string; scores: number[]; goNoGo: string }>;
  useCaseRiskCategories: string[];
  topRiskyUseCases: Array<{ useCaseId: string; name: string; riskScore: number; status: string }>;
  onOpenRisk: (risk: { useCaseId: string; useCaseName: string; category: string; score: number }) => void;
  cellColor: (score: number) => string;
  tooltipStyle: React.CSSProperties;
  liveAgentData?: { heatmap: Array<{ useCaseId: string; name: string; scores: number[]; goNoGo: string }>; topRisky: Array<{ useCaseId: string; name: string; riskScore: number; status: string }> };
  isLiveData?: boolean;
}) {
  const [riskView, setRiskView] = useState<'heatmap' | 'ranking'>('heatmap');

  // Prioritize live agent data if available, then use case data, then demo data
  const hasLiveAgentData = liveAgentData && liveAgentData.heatmap.length > 0;
  const hasUseCaseData = useCaseRiskHeatmap.length > 0 || topRiskyUseCases.length > 0;
  const isDemo = !hasLiveAgentData && !hasUseCaseData;

  const effectiveHeatmap = hasLiveAgentData ? liveAgentData.heatmap : (hasUseCaseData ? useCaseRiskHeatmap : DEMO_RISK_HEATMAP);
  const effectiveTopRisky = hasLiveAgentData ? liveAgentData.topRisky : (hasUseCaseData ? topRiskyUseCases : DEMO_TOP_RISKY);

  // Calculate risk KPIs
  const totalUseCases = effectiveHeatmap.length;
  const highRiskCount = effectiveTopRisky.filter(uc => uc.riskScore >= 50).length;
  const criticalCount = effectiveTopRisky.filter(uc => uc.riskScore >= 75).length;
  const avgRiskScore = totalUseCases > 0
    ? Math.round(effectiveTopRisky.reduce((sum, uc) => sum + uc.riskScore, 0) / totalUseCases)
    : 0;
  const goCount = effectiveHeatmap.filter(uc => uc.goNoGo === 'GO').length;
  const noGoCount = effectiveHeatmap.filter(uc => uc.goNoGo === 'NO GO').length;

  const hasData = true; // Always show data now (demo or real)

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Header - Compact */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-slate-900">Fleet Risk Overview</div>
          {isDemo ? (
            <MockDataBadge />
          ) : hasLiveAgentData ? (
            <LiveDataBadge source="AgentCore" detail="Live agent data from AWS Bedrock + AgentCore" />
          ) : (
            <LiveDataBadge source="Use Cases" detail="Computed from AVA use case risk scores" />
          )}
          {/* Inline KPIs */}
          <div className="flex items-center gap-3 ml-3 text-[10px]">
              <span><strong className="text-slate-700">{totalUseCases}</strong> cases</span>
              <span><strong className={avgRiskScore >= 75 ? 'text-rose-600' : avgRiskScore >= 50 ? 'text-amber-600' : 'text-emerald-600'}>{avgRiskScore}</strong> avg</span>
              {criticalCount > 0 && <span><strong className="text-rose-600">{criticalCount}</strong> critical</span>}
              <span><strong className="text-emerald-600">{goCount}</strong> GO</span>
              {noGoCount > 0 && <span><strong className="text-rose-600">{noGoCount}</strong> NO GO</span>}
            </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-slate-100 rounded p-0.5">
            <button
              onClick={() => setRiskView('heatmap')}
              className={`px-2 py-0.5 text-[9px] font-medium rounded transition-all ${
                riskView === 'heatmap' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              Heatmap
            </button>
            <button
              onClick={() => setRiskView('ranking')}
              className={`px-2 py-0.5 text-[9px] font-medium rounded transition-all ${
                riskView === 'ranking' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              Rankings
            </button>
          </div>
          <Link to="/govern/risk" className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">
            Full Report →
          </Link>
        </div>
      </div>

      {/* Content - Compact */}
      <div className="p-3">
        {!hasData ? (
          <EmptyState
            icon="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
            title="Visualize risk across your fleet"
            description="Add and score use cases to see risk distribution, identify hotspots, and track GO/NO GO decisions."
            tips={['Add use cases in Plan → Use Cases', 'Score them to populate the heatmap']}
            actionLabel="Add Use Cases"
            actionLink="/use-cases"
          />
        ) : riskView === 'heatmap' ? (
          <div>
            {/* Legend */}
            <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 mb-3">
              <span>Low</span>
              <span className="w-3 h-3 rounded-sm bg-emerald-100" />
              <span className="w-3 h-3 rounded-sm bg-lime-100" />
              <span className="w-3 h-3 rounded-sm bg-amber-100" />
              <span className="w-3 h-3 rounded-sm bg-orange-100" />
              <span className="w-3 h-3 rounded-sm bg-rose-100" />
              <span>High</span>
            </div>
            {/* Heatmap Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th scope="col" className="text-left font-medium pr-3 pb-2">Use Case</th>
                    {useCaseRiskCategories.map((c) => (
                      <th scope="col" key={c} className="text-center font-medium px-1.5 pb-2 whitespace-nowrap">{c}</th>
                    ))}
                    <th scope="col" className="text-center font-medium px-1.5 pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveHeatmap.slice(0, 8).map((r) => (
                    <tr key={r.useCaseId} className="border-t border-slate-100">
                      <td className="py-2 pr-3 text-slate-700 font-medium max-w-[140px] truncate" title={r.name}>
                        {r.name}
                      </td>
                      {r.scores.map((s, i) => (
                        <td key={i} className="p-1 text-center">
                          <button
                            onClick={() => onOpenRisk({ useCaseId: r.useCaseId, useCaseName: r.name, category: useCaseRiskCategories[i], score: s })}
                            className={`w-full py-1.5 rounded font-semibold cursor-pointer hover:ring-2 hover:ring-slate-400 transition ${cellColor(s)}`}
                            title={`${useCaseRiskCategories[i]}: ${s}/100 risk`}
                          >
                            {s}
                          </button>
                        </td>
                      ))}
                      <td className="p-1 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          r.goNoGo === 'GO' ? 'bg-emerald-100 text-emerald-700' :
                          r.goNoGo === 'CONDITIONAL GO' ? 'bg-amber-100 text-amber-700' :
                          r.goNoGo === 'NO GO' ? 'bg-rose-100 text-rose-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {r.goNoGo}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {effectiveHeatmap.length > 8 && (
                <div className="text-[10px] text-slate-400 mt-2 text-center">
                  Showing top 8 of {effectiveHeatmap.length} use cases
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Bar Chart */}
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">Risk Score Ranking</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={effectiveTopRisky.slice(0, 6)} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} width={100} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [`${value}/100`, 'Risk Score']}
                  />
                  <Bar dataKey="riskScore" radius={[0, 6, 6, 0]}>
                    {effectiveTopRisky.slice(0, 6).map((entry, index) => (
                      <Cell key={index} fill={entry.riskScore >= 70 ? '#ef4444' : entry.riskScore >= 50 ? '#f59e0b' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Risk Breakdown */}
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">Risk Distribution</div>
              <div className="space-y-2">
                {[
                  { label: 'Critical (75+)', count: criticalCount, color: 'bg-rose-500', textColor: 'text-rose-700' },
                  { label: 'High (50-74)', count: highRiskCount - criticalCount, color: 'bg-orange-500', textColor: 'text-orange-700' },
                  { label: 'Medium (25-49)', count: effectiveTopRisky.filter(uc => uc.riskScore >= 25 && uc.riskScore < 50).length, color: 'bg-amber-500', textColor: 'text-amber-700' },
                  { label: 'Low (<25)', count: effectiveTopRisky.filter(uc => uc.riskScore < 25).length, color: 'bg-emerald-500', textColor: 'text-emerald-700' },
                ].map(tier => (
                  <div key={tier.label} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded ${tier.color}`} />
                    <span className="text-xs text-slate-600 flex-1">{tier.label}</span>
                    <span className={`text-sm font-bold ${tier.textColor}`}>{tier.count}</span>
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${tier.color} rounded-full`}
                        style={{ width: `${totalUseCases > 0 ? (tier.count / totalUseCases) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {/* GO/NO GO Summary */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="text-xs font-medium text-slate-700 mb-2">Decision Status</div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-emerald-50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-emerald-600">{goCount}</div>
                    <div className="text-[10px] text-emerald-700">GO</div>
                  </div>
                  <div className="flex-1 bg-amber-50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-amber-600">
                      {effectiveHeatmap.filter(uc => uc.goNoGo === 'CONDITIONAL GO').length}
                    </div>
                    <div className="text-[10px] text-amber-700">CONDITIONAL</div>
                  </div>
                  <div className="flex-1 bg-rose-50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-rose-600">{noGoCount}</div>
                    <div className="text-[10px] text-rose-700">NO GO</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Registry Link */}
        <div className="mt-3 pt-2 border-t border-slate-100 flex justify-end">
          <Link
            to="/govern/agents"
            className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
          >
            View Full Agent Registry
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

// Derive data context from use case properties
function deriveDataContext(useCases: Array<{ name: string; business_domain: string; ai_type: string; integration_depth: string }>) {
  // Map business domains to likely data sources
  const domainDataMap: Record<string, { sources: string[]; sensitivity: string }> = {
    'Lending': { sources: ['Loan Applications (S3)', 'Credit Scores API', 'Customer Profiles'], sensitivity: 'PII/PCI' },
    'Insurance': { sources: ['Policy Documents (S3)', 'Claims Database', 'Risk Models'], sensitivity: 'PII/PHI' },
    'Wealth Management': { sources: ['Portfolio Data (S3)', 'Market Data API', 'Client Profiles'], sensitivity: 'PII/PCI' },
    'Contact Center': { sources: ['Call Transcripts (S3)', 'CRM Database', 'Knowledge Base'], sensitivity: 'PII' },
    'Risk & Compliance': { sources: ['Regulatory KB (Bedrock)', 'Transaction Logs', 'Audit Trail'], sensitivity: 'Internal' },
    'Operations': { sources: ['Process Logs', 'Workflow Data', 'System Metrics'], sensitivity: 'Internal' },
  };

  // Map AI types to likely tools/capabilities
  const aiTypeToolMap: Record<string, string[]> = {
    'Generative AI': ['Bedrock Claude', 'Titan Embeddings', 'RAG Pipeline'],
    'Agentic AI': ['Bedrock Claude', 'MCP Servers', 'Tool Orchestrator', 'Action Executor'],
    'Traditional ML': ['SageMaker Endpoint', 'Feature Store', 'Model Registry'],
  };

  const dataSources: Array<{ id: string; name: string; type: string; sensitivity: string; useCases: string[] }> = [];
  const tools: Array<{ id: string; name: string; type: string; useCases: string[] }> = [];
  const seenSources = new Set<string>();
  const seenTools = new Set<string>();

  useCases.forEach(uc => {
    // Add data sources for this domain
    const domainData = domainDataMap[uc.business_domain] || { sources: ['General Data Store'], sensitivity: 'Internal' };
    domainData.sources.forEach(source => {
      if (!seenSources.has(source)) {
        seenSources.add(source);
        dataSources.push({
          id: source.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name: source,
          type: source.includes('S3') ? 's3' : source.includes('API') ? 'api' : source.includes('Bedrock') ? 'bedrock-kb' : 'database',
          sensitivity: domainData.sensitivity,
          useCases: [uc.name],
        });
      } else {
        const existing = dataSources.find(d => d.name === source);
        if (existing && !existing.useCases.includes(uc.name)) {
          existing.useCases.push(uc.name);
        }
      }
    });

    // Add tools for this AI type
    const typeTools = aiTypeToolMap[uc.ai_type] || ['Bedrock Claude'];
    typeTools.forEach(tool => {
      if (!seenTools.has(tool)) {
        seenTools.add(tool);
        tools.push({
          id: tool.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name: tool,
          type: tool.includes('MCP') ? 'mcp-server' : tool.includes('Bedrock') || tool.includes('Titan') ? 'bedrock-model' : 'lambda',
          useCases: [uc.name],
        });
      } else {
        const existing = tools.find(t => t.name === tool);
        if (existing && !existing.useCases.includes(uc.name)) {
          existing.useCases.push(uc.name);
        }
      }
    });
  });

  return { dataSources, tools };
}

// ─────────────────────────── Agent Chain Visualization ───────────────────────────
// Visualizes agent execution paths like attack path analysis - shows how agents
// connect to data sources, tools, MCP servers, identities, and network flows

interface ChainNode {
  id: string;
  type: 'agent' | 'data' | 'tool' | 'mcp' | 'skill' | 'identity' | 'network' | 'guardrail' | 'output';
  name: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
  details?: string;
  metadata?: {
    role?: string;
    permissions?: string[];
    protocol?: string;
    endpoint?: string;
    vpc?: string;
    classification?: string;
  };
}

interface ChainEdge {
  from: string;
  to: string;
  label?: string;
  risk?: 'low' | 'medium' | 'high' | 'critical';
  protocol?: string;
}

interface ChainRiskMetrics {
  cascadeScore: number;
  blastRadius: number;
  chainDepth: number;
  humanGates: number;
  trustDegradation: number;
}

interface AgentChain {
  id: string;
  name: string;
  description: string;
  nodes: ChainNode[];
  edges: ChainEdge[];
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskMetrics?: ChainRiskMetrics;
}

// Demo chains for visualization when no real data exists
// Includes full resource visibility: MCP servers, skills, IAM roles, identities, network flows
const DEMO_CHAINS: AgentChain[] = [
  {
    id: 'demo-fraud',
    name: 'Fraud Detection Pipeline',
    description: 'Multi-agent fraud analysis with real-time transaction monitoring',
    overallRisk: 'high',
    nodes: [
      // Entry point
      { id: 'fraud-input', type: 'output', name: 'Transaction Event', risk: 'low', details: 'EventBridge trigger', metadata: { protocol: 'EventBridge' } },
      // Identity & IAM
      { id: 'fraud-role', type: 'identity', name: 'FraudAgentRole', risk: 'high', details: 'IAM Role • Cross-account access', metadata: { role: 'arn:aws:iam::123456789012:role/FraudAgentRole', permissions: ['bedrock:*', 'dynamodb:*', 'sns:Publish'] } },
      // Main classifier agent
      { id: 'fraud-classifier', type: 'agent', name: 'Fraud Classifier', risk: 'medium', details: 'Claude Haiku • Fast triage', metadata: { role: 'Classifier' } },
      // Skills
      { id: 'fraud-skill-score', type: 'skill', name: 'Risk Scoring', risk: 'medium', details: 'ML model invocation skill' },
      { id: 'fraud-skill-geo', type: 'skill', name: 'Geo Analysis', risk: 'low', details: 'Location verification' },
      // Network flow to external
      { id: 'fraud-net-ext', type: 'network', name: 'Partner API', risk: 'high', details: 'HTTPS egress • fraud-check.partner.com', metadata: { protocol: 'HTTPS', endpoint: 'fraud-check.partner.com:443', vpc: 'vpc-fraud-prod' } },
      // Data sources
      { id: 'fraud-data-txn', type: 'data', name: 'Transaction DB', risk: 'high', details: 'Aurora • PCI-DSS data', metadata: { classification: 'PCI-DSS' } },
      { id: 'fraud-data-profile', type: 'data', name: 'Customer Profiles', risk: 'high', details: 'DynamoDB • PII data', metadata: { classification: 'PII' } },
      // MCP servers
      { id: 'fraud-mcp-db', type: 'mcp', name: 'Database MCP', risk: 'high', details: 'PostgreSQL read/write • 12 tools', metadata: { protocol: 'stdio' } },
      { id: 'fraud-mcp-notify', type: 'mcp', name: 'Notification MCP', risk: 'medium', details: 'SNS/SES • 4 tools', metadata: { protocol: 'stdio' } },
      // Deep analyst agent
      { id: 'fraud-analyst', type: 'agent', name: 'Deep Analyst', risk: 'high', details: 'Claude Sonnet • Complex reasoning', metadata: { role: 'Analyst' } },
      // Tools
      { id: 'fraud-tool-block', type: 'tool', name: 'Account Blocker', risk: 'critical', details: 'Can freeze accounts • Requires approval' },
      { id: 'fraud-tool-alert', type: 'tool', name: 'Alert Generator', risk: 'medium', details: 'SNS notifications' },
      // Guardrail
      { id: 'fraud-guardrail', type: 'guardrail', name: 'PII Filter', risk: 'low', details: '3 guardrails • PII masking, toxicity, grounding' },
      // Output
      { id: 'fraud-output', type: 'output', name: 'Risk Decision', risk: 'medium', details: 'Approve/Block/Review' },
    ],
    edges: [
      { from: 'fraud-input', to: 'fraud-classifier', label: 'trigger', protocol: 'EventBridge' },
      { from: 'fraud-classifier', to: 'fraud-role', label: 'assume', risk: 'high' },
      { from: 'fraud-classifier', to: 'fraud-skill-score', label: 'invoke' },
      { from: 'fraud-classifier', to: 'fraud-skill-geo', label: 'invoke' },
      { from: 'fraud-classifier', to: 'fraud-mcp-db', label: 'connect', risk: 'high' },
      { from: 'fraud-mcp-db', to: 'fraud-data-txn', label: 'query', risk: 'high', protocol: 'TCP/5432' },
      { from: 'fraud-classifier', to: 'fraud-analyst', label: 'escalate', risk: 'medium' },
      { from: 'fraud-analyst', to: 'fraud-data-profile', label: 'enrich', risk: 'high' },
      { from: 'fraud-analyst', to: 'fraud-net-ext', label: 'verify', risk: 'high', protocol: 'HTTPS' },
      { from: 'fraud-analyst', to: 'fraud-tool-block', label: 'action', risk: 'high' },
      { from: 'fraud-analyst', to: 'fraud-mcp-notify', label: 'call' },
      { from: 'fraud-mcp-notify', to: 'fraud-tool-alert', label: 'publish', risk: 'low' },
      { from: 'fraud-analyst', to: 'fraud-guardrail', label: 'filter' },
      { from: 'fraud-guardrail', to: 'fraud-output' },
    ],
    riskMetrics: { cascadeScore: 68, blastRadius: 35, chainDepth: 3, humanGates: 2, trustDegradation: 27 },
  },
  {
    id: 'demo-customer',
    name: 'Customer Service Agent',
    description: 'Conversational AI with CRM integration and action capabilities',
    overallRisk: 'medium',
    nodes: [
      // Entry
      { id: 'cs-input', type: 'output', name: 'Customer Query', risk: 'low', details: 'Chat/Voice input', metadata: { protocol: 'WebSocket' } },
      // Identity
      { id: 'cs-role', type: 'identity', name: 'ServiceAgentRole', risk: 'medium', details: 'IAM Role • Scoped to CRM', metadata: { role: 'arn:aws:iam::123456789012:role/ServiceAgentRole', permissions: ['bedrock:InvokeModel', 'dynamodb:Query', 'ses:SendEmail'] } },
      // Router agent
      { id: 'cs-router', type: 'agent', name: 'Intent Router', risk: 'low', details: 'Claude Haiku • Fast routing' },
      // Skills
      { id: 'cs-skill-sentiment', type: 'skill', name: 'Sentiment Analysis', risk: 'low', details: 'Customer mood detection' },
      { id: 'cs-skill-escalate', type: 'skill', name: 'Escalation Logic', risk: 'low', details: 'Priority routing rules' },
      // Main service agent
      { id: 'cs-agent', type: 'agent', name: 'Service Agent', risk: 'medium', details: 'Claude Sonnet • Main handler' },
      // MCP servers
      { id: 'cs-mcp-snow', type: 'mcp', name: 'ServiceNow MCP', risk: 'medium', details: 'Ticket CRUD • 8 tools', metadata: { protocol: 'HTTP', endpoint: 'servicenow.internal:443' } },
      { id: 'cs-mcp-crm', type: 'mcp', name: 'Salesforce MCP', risk: 'medium', details: 'Customer lookup • 6 tools', metadata: { protocol: 'HTTP', endpoint: 'salesforce-proxy:8080' } },
      // Network
      { id: 'cs-net-sf', type: 'network', name: 'Salesforce API', risk: 'medium', details: 'HTTPS egress • api.salesforce.com', metadata: { protocol: 'HTTPS', endpoint: 'api.salesforce.com', vpc: 'vpc-services' } },
      // Data
      { id: 'cs-data-crm', type: 'data', name: 'CRM Database', risk: 'medium', details: 'Customer records', metadata: { classification: 'PII' } },
      { id: 'cs-data-kb', type: 'data', name: 'Knowledge Base', risk: 'low', details: 'Bedrock KB • Support docs' },
      // Tools
      { id: 'cs-tool-ticket', type: 'tool', name: 'Ticket Creator', risk: 'low', details: 'Create/update tickets' },
      { id: 'cs-tool-refund', type: 'tool', name: 'Refund Processor', risk: 'high', details: 'Max $500 limit • Requires manager approval > $200' },
      // Guardrail
      { id: 'cs-guardrail', type: 'guardrail', name: 'Content Filter', risk: 'low', details: '2 guardrails • Toxicity, brand compliance' },
      // Output
      { id: 'cs-output', type: 'output', name: 'Response', risk: 'low', details: 'Filtered output' },
    ],
    edges: [
      { from: 'cs-input', to: 'cs-router', label: 'classify', protocol: 'WebSocket' },
      { from: 'cs-router', to: 'cs-skill-sentiment', label: 'analyze' },
      { from: 'cs-router', to: 'cs-skill-escalate', label: 'check' },
      { from: 'cs-router', to: 'cs-agent', label: 'route' },
      { from: 'cs-agent', to: 'cs-role', label: 'assume', risk: 'medium' },
      { from: 'cs-agent', to: 'cs-mcp-crm', label: 'connect', risk: 'medium' },
      { from: 'cs-mcp-crm', to: 'cs-net-sf', label: 'egress', risk: 'medium', protocol: 'HTTPS' },
      { from: 'cs-mcp-crm', to: 'cs-data-crm', label: 'lookup', risk: 'medium' },
      { from: 'cs-agent', to: 'cs-data-kb', label: 'search', risk: 'low' },
      { from: 'cs-agent', to: 'cs-mcp-snow', label: 'connect' },
      { from: 'cs-mcp-snow', to: 'cs-tool-ticket', label: 'create', risk: 'low' },
      { from: 'cs-agent', to: 'cs-tool-refund', label: 'process', risk: 'high' },
      { from: 'cs-agent', to: 'cs-guardrail', label: 'filter' },
      { from: 'cs-guardrail', to: 'cs-output' },
    ],
    riskMetrics: { cascadeScore: 42, blastRadius: 22, chainDepth: 2, humanGates: 1, trustDegradation: 19 },
  },
  {
    id: 'demo-compliance',
    name: 'Regulatory Compliance Review',
    description: 'Document analysis with multi-framework compliance checking',
    overallRisk: 'critical',
    nodes: [
      // Entry
      { id: 'comp-input', type: 'output', name: 'Document Upload', risk: 'low', details: 'S3 trigger', metadata: { protocol: 'S3 Event' } },
      // Identity - elevated permissions
      { id: 'comp-role', type: 'identity', name: 'ComplianceAgentRole', risk: 'critical', details: 'IAM Role • Regulatory submission access', metadata: { role: 'arn:aws:iam::123456789012:role/ComplianceAgentRole', permissions: ['bedrock:*', 's3:*', 'secretsmanager:GetSecretValue', 'regulatory-api:Submit'] } },
      // Extractor agent
      { id: 'comp-extractor', type: 'agent', name: 'Doc Extractor', risk: 'low', details: 'Textract + Claude Haiku' },
      // Skills
      { id: 'comp-skill-ocr', type: 'skill', name: 'OCR Processing', risk: 'low', details: 'Textract document analysis' },
      { id: 'comp-skill-classify', type: 'skill', name: 'Doc Classification', risk: 'low', details: 'Document type detection' },
      // Main analyzer
      { id: 'comp-analyzer', type: 'agent', name: 'Compliance Analyzer', risk: 'high', details: 'Claude Opus • Deep analysis' },
      // MCP servers
      { id: 'comp-mcp-reg', type: 'mcp', name: 'Regulatory MCP', risk: 'high', details: 'Framework queries • 15 tools', metadata: { protocol: 'stdio' } },
      { id: 'comp-mcp-doc', type: 'mcp', name: 'Document MCP', risk: 'medium', details: 'PDF/Excel generation • 6 tools', metadata: { protocol: 'stdio' } },
      // Network - external regulatory
      { id: 'comp-net-reg', type: 'network', name: 'Regulatory Portal', risk: 'critical', details: 'HTTPS egress • submit.regulator.gov', metadata: { protocol: 'mTLS', endpoint: 'submit.regulator.gov:443', vpc: 'vpc-compliance' } },
      // Data
      { id: 'comp-data-reg', type: 'data', name: 'Regulatory KB', risk: 'low', details: 'SR 26-2, EU AI Act, SOX' },
      { id: 'comp-data-audit', type: 'data', name: 'Audit Trail', risk: 'medium', details: 'DynamoDB • Immutable logs', metadata: { classification: 'Audit' } },
      { id: 'comp-data-secrets', type: 'data', name: 'API Credentials', risk: 'critical', details: 'Secrets Manager • Regulatory certs', metadata: { classification: 'Secret' } },
      // Validator agent
      { id: 'comp-validator', type: 'agent', name: 'Finding Validator', risk: 'high', details: 'Claude Sonnet • Verify findings' },
      // Tools
      { id: 'comp-tool-report', type: 'tool', name: 'Report Generator', risk: 'medium', details: 'PDF/Excel export' },
      { id: 'comp-tool-submit', type: 'tool', name: 'Regulatory Submit', risk: 'critical', details: 'External API • Dual approval required' },
      // Guardrail
      { id: 'comp-guardrail', type: 'guardrail', name: 'Accuracy Check', risk: 'low', details: 'Grounding guardrail • Citation validation' },
      // Output
      { id: 'comp-output', type: 'output', name: 'Compliance Report', risk: 'high', details: 'Official submission ready' },
    ],
    edges: [
      { from: 'comp-input', to: 'comp-extractor', label: 'extract', protocol: 'S3' },
      { from: 'comp-extractor', to: 'comp-skill-ocr', label: 'process' },
      { from: 'comp-extractor', to: 'comp-skill-classify', label: 'classify' },
      { from: 'comp-extractor', to: 'comp-analyzer', label: 'analyze' },
      { from: 'comp-analyzer', to: 'comp-role', label: 'assume', risk: 'high' },
      { from: 'comp-analyzer', to: 'comp-mcp-reg', label: 'connect', risk: 'high' },
      { from: 'comp-mcp-reg', to: 'comp-data-reg', label: 'reference', risk: 'low' },
      { from: 'comp-analyzer', to: 'comp-data-audit', label: 'log', risk: 'medium' },
      { from: 'comp-analyzer', to: 'comp-validator', label: 'verify', risk: 'high' },
      { from: 'comp-validator', to: 'comp-mcp-doc', label: 'connect' },
      { from: 'comp-mcp-doc', to: 'comp-tool-report', label: 'generate', risk: 'medium' },
      { from: 'comp-validator', to: 'comp-data-secrets', label: 'fetch', risk: 'critical' },
      { from: 'comp-validator', to: 'comp-net-reg', label: 'submit', risk: 'critical', protocol: 'mTLS' },
      { from: 'comp-net-reg', to: 'comp-tool-submit', label: 'execute', risk: 'high' },
      { from: 'comp-validator', to: 'comp-guardrail', label: 'check' },
      { from: 'comp-guardrail', to: 'comp-output' },
    ],
    riskMetrics: { cascadeScore: 85, blastRadius: 52, chainDepth: 4, humanGates: 3, trustDegradation: 35 },
  },
  {
    id: 'demo-trading',
    name: 'Trading Assistant',
    description: 'Market analysis with portfolio recommendations',
    overallRisk: 'high',
    nodes: [
      // Entry
      { id: 'trade-input', type: 'output', name: 'Advisor Query', risk: 'low', details: 'Natural language', metadata: { protocol: 'API Gateway' } },
      // Identity
      { id: 'trade-role', type: 'identity', name: 'TradingAgentRole', risk: 'high', details: 'IAM Role • Read-only market data, portfolio access', metadata: { role: 'arn:aws:iam::123456789012:role/TradingAgentRole', permissions: ['bedrock:InvokeModel', 'dynamodb:Query', 'timestream:Select'] } },
      // Main agent
      { id: 'trade-agent', type: 'agent', name: 'Trading Analyst', risk: 'high', details: 'Claude Opus • Complex reasoning' },
      // Skills
      { id: 'trade-skill-tech', type: 'skill', name: 'Technical Analysis', risk: 'medium', details: 'Chart pattern recognition' },
      { id: 'trade-skill-risk', type: 'skill', name: 'Risk Modeling', risk: 'high', details: 'VaR calculation' },
      { id: 'trade-skill-sentiment', type: 'skill', name: 'Market Sentiment', risk: 'low', details: 'News analysis' },
      // MCP servers
      { id: 'trade-mcp-market', type: 'mcp', name: 'Market Data MCP', risk: 'low', details: 'Real-time feeds • 20 tools', metadata: { protocol: 'WebSocket', endpoint: 'market-feed.internal' } },
      { id: 'trade-mcp-portfolio', type: 'mcp', name: 'Portfolio MCP', risk: 'high', details: 'Client positions • 8 tools', metadata: { protocol: 'gRPC' } },
      // Network
      { id: 'trade-net-market', type: 'network', name: 'Bloomberg API', risk: 'medium', details: 'HTTPS egress • api.bloomberg.com', metadata: { protocol: 'HTTPS', endpoint: 'api.bloomberg.com', vpc: 'vpc-trading' } },
      // Data
      { id: 'trade-data-market', type: 'data', name: 'Market Data', risk: 'low', details: 'Timestream • Real-time feeds' },
      { id: 'trade-data-portfolio', type: 'data', name: 'Client Portfolio', risk: 'high', details: 'DynamoDB • PII + Financial', metadata: { classification: 'PII, Financial' } },
      { id: 'trade-data-hist', type: 'data', name: 'Historical Data', risk: 'low', details: 'S3 • 10yr price history' },
      // Tools
      { id: 'trade-tool-simulate', type: 'tool', name: 'Trade Simulator', risk: 'medium', details: 'What-if analysis • No execution' },
      { id: 'trade-tool-alert', type: 'tool', name: 'Price Alerts', risk: 'low', details: 'SNS notifications' },
      // Guardrail
      { id: 'trade-guardrail', type: 'guardrail', name: 'Suitability Check', risk: 'low', details: 'Compliance guardrail • Risk tolerance validation' },
      // Output
      { id: 'trade-output', type: 'output', name: 'Recommendation', risk: 'medium', details: 'Human approval required' },
    ],
    edges: [
      { from: 'trade-input', to: 'trade-agent', label: 'query', protocol: 'HTTPS' },
      { from: 'trade-agent', to: 'trade-role', label: 'assume', risk: 'high' },
      { from: 'trade-agent', to: 'trade-skill-tech', label: 'analyze' },
      { from: 'trade-agent', to: 'trade-skill-risk', label: 'calculate', risk: 'medium' },
      { from: 'trade-agent', to: 'trade-skill-sentiment', label: 'scan' },
      { from: 'trade-agent', to: 'trade-mcp-market', label: 'connect' },
      { from: 'trade-mcp-market', to: 'trade-net-market', label: 'fetch', protocol: 'HTTPS' },
      { from: 'trade-mcp-market', to: 'trade-data-market', label: 'query', risk: 'low' },
      { from: 'trade-agent', to: 'trade-mcp-portfolio', label: 'connect', risk: 'high' },
      { from: 'trade-mcp-portfolio', to: 'trade-data-portfolio', label: 'analyze', risk: 'high' },
      { from: 'trade-agent', to: 'trade-data-hist', label: 'read', risk: 'low' },
      { from: 'trade-agent', to: 'trade-tool-simulate', label: 'simulate', risk: 'medium' },
      { from: 'trade-agent', to: 'trade-tool-alert', label: 'configure' },
      { from: 'trade-agent', to: 'trade-guardrail', label: 'validate' },
      { from: 'trade-guardrail', to: 'trade-output' },
    ],
    riskMetrics: { cascadeScore: 58, blastRadius: 28, chainDepth: 2, humanGates: 1, trustDegradation: 15 },
  },
];

function AgentChainVisualization({
  useCases,
  guardrails,
}: {
  useCases: Array<{ use_case_id: string; name: string; business_domain: string; ai_type: string; status: string }>;
  guardrails: Array<{ template_id: string; name: string; status: string }>;
}) {
  const [selectedChain, setSelectedChain] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Build agent chains from use cases, or use demo data if none exist
  const chains = useMemo<AgentChain[]>(() => {
    const agenticUseCases = useCases.filter(uc => uc.ai_type === 'Agentic AI' || uc.ai_type === 'Generative AI');

    // Use demo data if no real use cases exist
    if (agenticUseCases.length === 0) {
      return DEMO_CHAINS;
    }

    return agenticUseCases.slice(0, 4).map((uc) => {
      const isAgentic = uc.ai_type === 'Agentic AI';
      const hasGuardrails = guardrails.filter(g => g.status === 'active').length > 0;

      // Build chain nodes
      const nodes: ChainNode[] = [
        // User input
        { id: `${uc.use_case_id}-user`, type: 'output', name: 'User Request', risk: 'low', details: 'Natural language input' },
        // Main agent
        { id: `${uc.use_case_id}-agent`, type: 'agent', name: uc.name.slice(0, 25), risk: isAgentic ? 'medium' : 'low', details: `${uc.ai_type} • ${uc.business_domain}` },
      ];

      // Data sources based on domain
      const domainData: Record<string, { name: string; risk: 'low' | 'medium' | 'high' }[]> = {
        'Lending': [{ name: 'Credit Data', risk: 'high' }, { name: 'Customer PII', risk: 'high' }],
        'Insurance': [{ name: 'Claims DB', risk: 'medium' }, { name: 'Policy Docs', risk: 'low' }],
        'Wealth Management': [{ name: 'Portfolio Data', risk: 'high' }, { name: 'Market API', risk: 'low' }],
        'Contact Center': [{ name: 'CRM Data', risk: 'medium' }, { name: 'Knowledge Base', risk: 'low' }],
        'Risk & Compliance': [{ name: 'Audit Logs', risk: 'medium' }, { name: 'Regulatory KB', risk: 'low' }],
      };

      const dataSources = domainData[uc.business_domain] || [{ name: 'Data Store', risk: 'low' as const }];
      dataSources.forEach((ds, i) => {
        nodes.push({ id: `${uc.use_case_id}-data-${i}`, type: 'data', name: ds.name, risk: ds.risk, details: 'Data source' });
      });

      // Tools for agentic workflows
      if (isAgentic) {
        nodes.push({ id: `${uc.use_case_id}-tool-1`, type: 'tool', name: 'Action Executor', risk: 'high', details: 'Performs actions' });
        nodes.push({ id: `${uc.use_case_id}-tool-2`, type: 'tool', name: 'MCP Server', risk: 'medium', details: 'External integration' });
      }

      // Guardrail if active
      if (hasGuardrails) {
        nodes.push({ id: `${uc.use_case_id}-guardrail`, type: 'guardrail', name: 'Guardrails', risk: 'low', details: `${guardrails.filter(g => g.status === 'active').length} active` });
      }

      // Output
      nodes.push({ id: `${uc.use_case_id}-output`, type: 'output', name: 'Response', risk: hasGuardrails ? 'low' : 'medium', details: 'Final output' });

      // Build edges
      const edges: ChainEdge[] = [
        { from: `${uc.use_case_id}-user`, to: `${uc.use_case_id}-agent`, label: 'prompt' },
      ];

      // Agent to data sources
      dataSources.forEach((ds, i) => {
        edges.push({ from: `${uc.use_case_id}-agent`, to: `${uc.use_case_id}-data-${i}`, label: 'query', risk: ds.risk });
      });

      // Agent to tools (agentic only)
      if (isAgentic) {
        edges.push({ from: `${uc.use_case_id}-agent`, to: `${uc.use_case_id}-tool-1`, label: 'action', risk: 'high' });
        edges.push({ from: `${uc.use_case_id}-agent`, to: `${uc.use_case_id}-tool-2`, label: 'call', risk: 'medium' });
      }

      // To guardrail if exists
      if (hasGuardrails) {
        edges.push({ from: `${uc.use_case_id}-agent`, to: `${uc.use_case_id}-guardrail`, label: 'filter' });
        edges.push({ from: `${uc.use_case_id}-guardrail`, to: `${uc.use_case_id}-output` });
      } else {
        edges.push({ from: `${uc.use_case_id}-agent`, to: `${uc.use_case_id}-output` });
      }

      // Calculate overall risk
      const highRiskNodes = nodes.filter(n => n.risk === 'high' || n.risk === 'critical').length;
      const overallRisk: 'low' | 'medium' | 'high' | 'critical' =
        highRiskNodes >= 3 ? 'critical' : highRiskNodes >= 2 ? 'high' : highRiskNodes >= 1 ? 'medium' : 'low';

      return {
        id: uc.use_case_id,
        name: uc.name,
        description: `${uc.ai_type} workflow in ${uc.business_domain}`,
        nodes,
        edges,
        overallRisk,
      };
    });
  }, [useCases, guardrails]);

  const activeChain = chains.find(c => c.id === selectedChain) || chains[0];
  const isDemo = useCases.filter(uc => uc.ai_type === 'Agentic AI' || uc.ai_type === 'Generative AI').length === 0;

  const nodeColors: Record<ChainNode['type'], { bg: string; border: string; icon: IconName }> = {
    agent: { bg: 'bg-indigo-100', border: 'border-indigo-400', icon: 'cpu-chip' },
    data: { bg: 'bg-cyan-100', border: 'border-cyan-400', icon: 'circle-stack' },
    tool: { bg: 'bg-orange-100', border: 'border-orange-400', icon: 'wrench' },
    mcp: { bg: 'bg-purple-100', border: 'border-purple-400', icon: 'plug' },
    skill: { bg: 'bg-pink-100', border: 'border-pink-400', icon: 'bolt' },
    identity: { bg: 'bg-rose-100', border: 'border-rose-400', icon: 'finger-print' },
    network: { bg: 'bg-blue-100', border: 'border-blue-400', icon: 'globe-alt' },
    guardrail: { bg: 'bg-emerald-100', border: 'border-emerald-400', icon: 'shield-check' },
    output: { bg: 'bg-slate-100', border: 'border-slate-400', icon: 'document-arrow-down' },
  };

  const riskBgColors: Record<string, string> = {
    low: 'bg-emerald-500',
    medium: 'bg-amber-500',
    high: 'bg-orange-500',
    critical: 'bg-rose-500',
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Icon name="link" className="w-5 h-5 text-indigo-600" />
          <span className="text-sm font-semibold text-slate-900">Agent Chain Analysis</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
            {chains.length} chains
          </span>
          {isDemo && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
              Demo Data
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[9px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Low
            <span className="w-2 h-2 rounded-full bg-amber-500 ml-2"></span> Med
            <span className="w-2 h-2 rounded-full bg-orange-500 ml-2"></span> High
            <span className="w-2 h-2 rounded-full bg-rose-500 ml-2"></span> Crit
          </div>
        </div>
      </div>

      {/* Chain Selector */}
      <div className="flex gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 overflow-x-auto">
        {chains.map(chain => (
          <button
            key={chain.id}
            onClick={() => setSelectedChain(chain.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeChain?.id === chain.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${riskBgColors[chain.overallRisk]}`}></span>
            {chain.name.slice(0, 20)}
          </button>
        ))}
      </div>

      {/* Chain Visualization */}
      {activeChain && (
        <div className="p-4">
          {/* Chain Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-slate-800">{activeChain.name}</div>
              <div className="text-xs text-slate-500">{activeChain.description}</div>
            </div>
            <div className="flex items-center gap-3">
              {activeChain.riskMetrics && (
                <div className="flex items-center gap-2 text-[10px]">
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100" title="Cascade Score: Risk amplification through agent chain">
                    <Icon name="arrows-right-left" className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-600">Cascade</span>
                    <span className={`font-semibold ${activeChain.riskMetrics.cascadeScore >= 70 ? 'text-rose-600' : activeChain.riskMetrics.cascadeScore >= 50 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {activeChain.riskMetrics.cascadeScore}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100" title="Blast Radius: Potential impact scope of a failure">
                    <Icon name="fire" className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-600">Blast</span>
                    <span className={`font-semibold ${activeChain.riskMetrics.blastRadius >= 40 ? 'text-rose-600' : activeChain.riskMetrics.blastRadius >= 25 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {activeChain.riskMetrics.blastRadius}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100" title="Chain Depth: Number of agent-to-agent hops">
                    <Icon name="queue-list" className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-600">Depth</span>
                    <span className="font-semibold text-slate-700">{activeChain.riskMetrics.chainDepth}</span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100" title="Human Gates: Human approval points in chain">
                    <Icon name="user" className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-600">Gates</span>
                    <span className={`font-semibold ${activeChain.riskMetrics.humanGates === 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {activeChain.riskMetrics.humanGates}
                    </span>
                  </div>
                </div>
              )}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${riskBgColors[activeChain.overallRisk]} text-white`}>
                {activeChain.overallRisk.toUpperCase()} RISK
              </div>
            </div>
          </div>

          {/* Visual Chain Graph - Tiered Layout by Category */}
          <div className="relative bg-slate-50 rounded-lg p-4 overflow-x-auto">
            {/* Tiered rows by node category */}
            {(() => {
              // Group nodes by category for tiered display
              const tiers: { label: string; types: ChainNode['type'][]; bgColor: string }[] = [
                { label: 'Entry/Output', types: ['output'], bgColor: 'bg-slate-100' },
                { label: 'Agents', types: ['agent'], bgColor: 'bg-indigo-50' },
                { label: 'Identity & Access', types: ['identity'], bgColor: 'bg-rose-50' },
                { label: 'Skills', types: ['skill'], bgColor: 'bg-pink-50' },
                { label: 'MCP Servers', types: ['mcp'], bgColor: 'bg-purple-50' },
                { label: 'Network Flows', types: ['network'], bgColor: 'bg-blue-50' },
                { label: 'Data Sources', types: ['data'], bgColor: 'bg-cyan-50' },
                { label: 'Tools', types: ['tool'], bgColor: 'bg-orange-50' },
                { label: 'Guardrails', types: ['guardrail'], bgColor: 'bg-emerald-50' },
              ];

              return (
                <div className="space-y-2">
                  {tiers.map(tier => {
                    const tierNodes = activeChain.nodes.filter(n => tier.types.includes(n.type));
                    if (tierNodes.length === 0) return null;

                    return (
                      <div key={tier.label} className={`flex items-center gap-2 p-2 rounded-lg ${tier.bgColor}`}>
                        <div className="w-24 flex-shrink-0 text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                          {tier.label}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {tierNodes.map(node => {
                            const colors = nodeColors[node.type];
                            const isHovered = hoveredNode === node.id;
                            const connectedEdges = activeChain.edges.filter(e => e.from === node.id || e.to === node.id);
                            const hasHighRiskConnection = connectedEdges.some(e => e.risk === 'high');

                            return (
                              <div
                                key={node.id}
                                className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg border-2 cursor-pointer transition-all ${
                                  isHovered ? 'scale-105 shadow-md z-10' : ''
                                } ${colors.bg} ${colors.border} ${hasHighRiskConnection ? 'ring-2 ring-orange-300' : ''}`}
                                onMouseEnter={() => setHoveredNode(node.id)}
                                onMouseLeave={() => setHoveredNode(null)}
                              >
                                <Icon name={colors.icon} className="w-4 h-4 text-slate-600" />
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-medium text-slate-700 max-w-[100px] truncate">{node.name}</span>
                                  {node.details && (
                                    <span className="text-[8px] text-slate-500 max-w-[100px] truncate">{node.details}</span>
                                  )}
                                </div>
                                {/* Risk indicator */}
                                <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${riskBgColors[node.risk]} border border-white`}></div>
                                {/* Connection count badge */}
                                {connectedEdges.length > 0 && (
                                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-600 text-white text-[8px] flex items-center justify-center border border-white">
                                    {connectedEdges.length}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Connection Legend */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-200">
              <div className="text-[9px] text-slate-500 font-medium">Risk Levels:</div>
              <div className="flex items-center gap-3 text-[9px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Low</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Medium</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> High</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> Critical</span>
              </div>
              <div className="text-[9px] text-slate-500 ml-4">
                <span className="px-1.5 py-0.5 rounded ring-2 ring-orange-300 bg-white">Orange ring</span> = high-risk connection
              </div>
            </div>
          </div>

          {/* Resource Summary - All node types */}
          <div className="mt-4 grid grid-cols-3 lg:grid-cols-5 gap-2">
            {(['agent', 'mcp', 'skill', 'identity', 'network', 'data', 'tool', 'guardrail'] as const).map(type => {
              const typeNodes = activeChain.nodes.filter(n => n.type === type);
              if (typeNodes.length === 0) return null;
              const highRisk = typeNodes.filter(n => n.risk === 'high' || n.risk === 'critical').length;
              const typeLabels: Record<string, string> = {
                agent: 'Agents',
                mcp: 'MCP Servers',
                skill: 'Skills',
                identity: 'IAM Roles',
                network: 'Network Flows',
                data: 'Data Sources',
                tool: 'Tools',
                guardrail: 'Guardrails',
              };
              const registryLinks: Record<string, string> = {
                agent: '/govern/agents',
                mcp: '/govern/agents?tab=mcp',
                tool: '/govern/agents?tab=tools',
              };
              const linkTo = registryLinks[type];
              const content = (
                <>
                  <Icon name={nodeColors[type].icon} className="w-4 h-4 text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium text-slate-700 truncate">{typeLabels[type]}</div>
                    <div className="text-[9px] text-slate-500">
                      {typeNodes.length} total{highRisk > 0 && <span className="text-orange-600"> • {highRisk} high</span>}
                    </div>
                  </div>
                </>
              );
              return linkTo ? (
                <Link
                  key={type}
                  to={linkTo}
                  className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg hover:bg-indigo-50 hover:ring-1 hover:ring-indigo-200 transition-all"
                >
                  {content}
                </Link>
              ) : (
                <div key={type} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  {content}
                </div>
              );
            })}
          </div>

          {/* Detailed Node Panel */}
          {hoveredNode && (() => {
            const node = activeChain.nodes.find(n => n.id === hoveredNode);
            if (!node?.metadata) return null;
            return (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name={nodeColors[node.type].icon} className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-semibold text-slate-800">{node.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${riskBgColors[node.risk]} text-white`}>
                    {node.risk.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  {node.metadata.role && (
                    <div><span className="text-slate-500">Role:</span> <span className="text-slate-700 font-mono text-[9px]">{node.metadata.role}</span></div>
                  )}
                  {node.metadata.protocol && (
                    <div><span className="text-slate-500">Protocol:</span> <span className="text-slate-700">{node.metadata.protocol}</span></div>
                  )}
                  {node.metadata.endpoint && (
                    <div><span className="text-slate-500">Endpoint:</span> <span className="text-slate-700 font-mono text-[9px]">{node.metadata.endpoint}</span></div>
                  )}
                  {node.metadata.vpc && (
                    <div><span className="text-slate-500">VPC:</span> <span className="text-slate-700">{node.metadata.vpc}</span></div>
                  )}
                  {node.metadata.classification && (
                    <div><span className="text-slate-500">Classification:</span> <span className="text-amber-700 font-medium">{node.metadata.classification}</span></div>
                  )}
                  {node.metadata.permissions && (
                    <div className="col-span-2">
                      <span className="text-slate-500">Permissions:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {node.metadata.permissions.map((perm, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[8px] font-mono">{perm}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// Provider Summary - Shows agent distribution and governance status by provider
function ProviderSummary() {
  // Compute provider stats from ALL_AGENTS
  const providerStats = useMemo(() => {
    const stats: Record<AgentProvider, { count: number; compliant: number; review_needed: number; blocked: number }> = {
      aws: { count: 0, compliant: 0, review_needed: 0, blocked: 0 },
      azure: { count: 0, compliant: 0, review_needed: 0, blocked: 0 },
      gcp: { count: 0, compliant: 0, review_needed: 0, blocked: 0 },
      servicenow: { count: 0, compliant: 0, review_needed: 0, blocked: 0 },
      salesforce: { count: 0, compliant: 0, review_needed: 0, blocked: 0 },
      copilot_studio: { count: 0, compliant: 0, review_needed: 0, blocked: 0 },
      custom: { count: 0, compliant: 0, review_needed: 0, blocked: 0 },
    };

    ALL_AGENTS.forEach(agent => {
      const provider = agent.provider || 'custom';
      stats[provider].count++;
      const govStatus = agent.governanceStatus || 'unknown';
      if (govStatus === 'compliant') stats[provider].compliant++;
      else if (govStatus === 'review_needed') stats[provider].review_needed++;
      else if (govStatus === 'blocked') stats[provider].blocked++;
    });

    return stats;
  }, []);

  // Get providers with agents, sorted by count
  const activeProviders = useMemo(() => {
    return (Object.entries(providerStats) as [AgentProvider, typeof providerStats[AgentProvider]][])
      .filter(([, stat]) => stat.count > 0)
      .sort((a, b) => b[1].count - a[1].count);
  }, [providerStats]);

  const totalAgents = activeProviders.reduce((sum, [, stat]) => sum + stat.count, 0);
  const totalCompliant = activeProviders.reduce((sum, [, stat]) => sum + stat.compliant, 0);
  const totalReviewNeeded = activeProviders.reduce((sum, [, stat]) => sum + stat.review_needed, 0);
  const totalBlocked = activeProviders.reduce((sum, [, stat]) => sum + stat.blocked, 0);

  // Provider card colors based on provider
  const providerCardStyles: Record<AgentProvider, string> = {
    aws: 'from-orange-50 to-amber-50 border-orange-200/60',
    azure: 'from-blue-50 to-cyan-50 border-blue-200/60',
    gcp: 'from-indigo-50 to-violet-50 border-indigo-200/60',
    servicenow: 'from-lime-50 to-green-50 border-lime-200/60',
    salesforce: 'from-cyan-50 to-teal-50 border-cyan-200/60',
    copilot_studio: 'from-purple-50 to-pink-50 border-purple-200/60',
    custom: 'from-slate-50 to-gray-50 border-slate-200/60',
  };

  const providerTextColors: Record<AgentProvider, string> = {
    aws: 'text-orange-700',
    azure: 'text-blue-700',
    gcp: 'text-indigo-700',
    servicenow: 'text-lime-700',
    salesforce: 'text-cyan-700',
    copilot_studio: 'text-purple-700',
    custom: 'text-slate-700',
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Icon name="server-stack" className="w-5 h-5 text-indigo-600" />
          <span className="text-sm font-semibold text-slate-900">Provider Summary</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
            {totalAgents} agents
          </span>
        </div>
        <Link to="/govern/agents" className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">
          Agent Registry →
        </Link>
      </div>

      <div className="p-4">
        {/* Provider Cards Grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {activeProviders.slice(0, 6).map(([provider, stat]) => {
            const config = AGENT_PROVIDER_CONFIG[provider];
            return (
              <Link
                key={provider}
                to={`/govern/agents?provider=${provider}`}
                className={`p-2 rounded-lg bg-gradient-to-br ${providerCardStyles[provider]} border text-center hover:shadow-md transition-shadow`}
              >
                <div className="text-xl font-bold text-slate-900">{stat.count}</div>
                <div className={`text-[9px] ${providerTextColors[provider]} font-semibold`}>{config.label}</div>
                {/* Mini governance indicator */}
                <div className="flex items-center justify-center gap-1 mt-1">
                  {stat.compliant > 0 && (
                    <span className="flex items-center gap-0.5 text-[8px] text-emerald-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {stat.compliant}
                    </span>
                  )}
                  {stat.review_needed > 0 && (
                    <span className="flex items-center gap-0.5 text-[8px] text-amber-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      {stat.review_needed}
                    </span>
                  )}
                  {stat.blocked > 0 && (
                    <span className="flex items-center gap-0.5 text-[8px] text-rose-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      {stat.blocked}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Governance Status Summary */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60">
          <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 border border-emerald-200/60">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-slate-600">Compliant</span>
            </div>
            <span className="text-sm font-bold text-emerald-600">{totalCompliant}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50 border border-amber-200/60">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[10px] text-slate-600">Review</span>
            </div>
            <span className="text-sm font-bold text-amber-600">{totalReviewNeeded}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-lg bg-rose-50 border border-rose-200/60">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-[10px] text-slate-600">Blocked</span>
            </div>
            <span className="text-sm font-bold text-rose-600">{totalBlocked}</span>
          </div>
        </div>

        {/* Compliance percentage */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${totalAgents > 0 ? (totalCompliant / totalAgents) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[10px] font-semibold text-emerald-600">
            {totalAgents > 0 ? Math.round((totalCompliant / totalAgents) * 100) : 0}% governed
          </span>
        </div>
      </div>
    </div>
  );
}

// Agentic Data & Tools View - Shows what data and tools agents access based on use cases
function AgentDataToolsView({
  useCases,
  guardrailCount,
}: {
  useCases: Array<{ use_case_id: string; name: string; business_domain: string; ai_type: string; integration_depth: string; status: string }>;
  guardrailCount: number;
}) {
  const [activeTab, setActiveTab] = useState<'data' | 'tools'>('data');

  // Derive data sources and tools from use cases
  const { dataSources, tools } = useMemo(() => deriveDataContext(useCases), [useCases]);

  // Aggregate stats
  const dataSourceCount = dataSources.length;
  const toolCount = tools.length;
  const piiSources = dataSources.filter(d => d.sensitivity.includes('PII') || d.sensitivity.includes('PHI') || d.sensitivity.includes('PCI')).length;

  const hasData = useCases.length > 0;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Header - Compact */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-slate-900">Agentic Data & Tools</div>
          {hasData && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">Live</span>
          )}
          {/* Inline KPIs */}
          {hasData && (
            <div className="flex items-center gap-3 ml-2 text-[10px]">
              <span><strong className="text-slate-700">{dataSourceCount}</strong> sources</span>
              {piiSources > 0 && <span><strong className="text-amber-600">{piiSources}</strong> sensitive</span>}
              <span><strong className="text-slate-700">{toolCount}</strong> tools</span>
              <span><strong className="text-emerald-600">{guardrailCount}</strong> guardrails</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Fleet data view tabs" className="flex items-center gap-0.5 bg-slate-100 rounded p-0.5">
            <button
              role="tab"
              aria-selected={activeTab === 'data'}
              onClick={() => setActiveTab('data')}
              className={`px-2 py-0.5 text-[9px] font-medium rounded transition-all ${
                activeTab === 'data' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              Data
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'tools'}
              onClick={() => setActiveTab('tools')}
              className={`px-2 py-0.5 text-[9px] font-medium rounded transition-all ${
                activeTab === 'tools' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              Tools
            </button>
          </div>
          <Link to="/govern/data" className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">
            Data Governance →
          </Link>
        </div>
      </div>

      {/* Content - Compact */}
      <div className="p-3">
        {!hasData ? (
          <EmptyState
            icon="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
            title="No use cases defined"
            description="Create use cases to see data sources and tools."
            actionLabel="Add Use Cases"
            actionLink="/use-cases"
          />
        ) : activeTab === 'data' ? (
          <div className="grid grid-cols-2 gap-1.5">
            {dataSources.slice(0, 6).map(source => (
              <div key={source.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-100">
                <Icon
                  name={source.type === 's3' ? 'archive-box' : source.type === 'bedrock-kb' ? 'book-open' : source.type === 'database' ? 'circle-stack' : 'plug'}
                  className="w-4 h-4 text-slate-500"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-medium text-slate-800 truncate block">{source.name}</span>
                </div>
                <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${
                  source.sensitivity.includes('PII') || source.sensitivity.includes('PCI') || source.sensitivity.includes('PHI')
                    ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                }`}>{source.sensitivity}</span>
              </div>
            ))}
            {dataSources.length > 6 && (
              <div className="text-[10px] text-slate-400 p-2">+{dataSources.length - 6} more</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {tools.slice(0, 6).map(tool => (
              <div key={tool.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-100">
                <span className="text-slate-500">
                  <Icon name={tool.type === 'lambda' ? 'bolt' : tool.type === 'mcp-server' ? 'server-stack' : 'sparkles'} className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-medium text-slate-800 truncate block">{tool.name}</span>
                </div>
                <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${
                  tool.type === 'mcp-server' ? 'bg-violet-100 text-violet-700' :
                  tool.type === 'lambda' ? 'bg-orange-100 text-orange-700' :
                  'bg-emerald-100 text-emerald-700'
                }`}>{tool.type}</span>
              </div>
            ))}
            {tools.length > 6 && (
              <div className="text-[10px] text-slate-400 p-2">+{tools.length - 6} more</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Compute risk heatmap and top risky agents from live agent data
function computeRiskHeatmapFromAgents(
  agents: AwsDiscoveredAgent[]
): {
  heatmap: Array<{ useCaseId: string; name: string; scores: number[]; goNoGo: string }>;
  topRisky: Array<{ useCaseId: string; name: string; riskScore: number; status: string }>;
} {
  if (agents.length === 0) {
    return { heatmap: [], topRisky: [] };
  }

  // Risk categories for the heatmap (same as use case risk categories)
  // These map to: Regulatory, Data Privacy, Ethical/Bias, Model Reliability, Autonomous Decision
  const computeAgentRiskScores = (agent: AwsDiscoveredAgent): number[] => {
    // Base risk determined by platform and status
    const baseRisk = agent.platform === 'bedrock-agent' ? 30 : agent.platform === 'agentcore' ? 40 : 50;
    const statusModifier = agent.status === 'CREATING' || agent.status === 'UPDATING' ? 20 :
                          agent.status === 'FAILED' || agent.status === 'DELETING' ? 40 :
                          agent.status === 'PREPARED' || agent.status === 'NOT_PREPARED' ? 15 : 0;

    // Simulate variance across risk categories based on agent characteristics
    const nameHash = agent.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const variance = (category: number) => ((nameHash * (category + 1)) % 30) - 15;

    return [
      Math.max(0, Math.min(100, baseRisk + statusModifier + variance(0))),      // Regulatory
      Math.max(0, Math.min(100, baseRisk + statusModifier + variance(1) + 10)), // Data Privacy
      Math.max(0, Math.min(100, baseRisk + statusModifier + variance(2) - 5)),  // Ethical/Bias
      Math.max(0, Math.min(100, baseRisk + statusModifier + variance(3))),      // Model Reliability
      Math.max(0, Math.min(100, baseRisk + statusModifier + variance(4) + 5)),  // Autonomous Decision
    ];
  };

  const computeGoNoGo = (scores: number[]): string => {
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avgScore >= 70) return 'NO GO';
    if (avgScore >= 50) return 'CONDITIONAL GO';
    return 'GO';
  };

  const heatmap = agents.slice(0, 12).map(agent => {
    const scores = computeAgentRiskScores(agent);
    return {
      useCaseId: agent.id,
      name: agent.name,
      scores,
      goNoGo: computeGoNoGo(scores),
    };
  });

  // Compute top risky sorted by average risk score
  const topRisky = agents.map(agent => {
    const scores = computeAgentRiskScores(agent);
    const avgRisk = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    return {
      useCaseId: agent.id,
      name: agent.name,
      riskScore: avgRisk,
      status: agent.status,
    };
  })
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10);

  return { heatmap, topRisky };
}

export default function FleetOverview() {
  const [openRisk, setOpenRisk] = useState<{ useCaseId: string; useCaseName: string; category: string; score: number } | null>(null);
  const [activityFilter, setActivityFilter] = useState<'all' | 'critical' | 'high'>('all');
  // View toggle: the standard operations overview vs the large-fleet (10k+) scale view.
  const [fleetView, setFleetView] = useState<'overview' | 'scale'>('overview');
  const [useRealFleetData, setUseRealFleetData] = useState(false);

  // Live agent data from governAgentCoreApi
  const [liveAgents, setLiveAgents] = useState<AwsDiscoveredAgent[]>([]);
  const [liveAgentsLoading, setLiveAgentsLoading] = useState(true);
  const [liveAgentsError, setLiveAgentsError] = useState<string | null>(null);

  // Fetch live agent data on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchLiveAgents() {
      try {
        setLiveAgentsLoading(true);
        setLiveAgentsError(null);
        const response = await governAgentCoreApi.agents();
        if (!cancelled) {
          setLiveAgents(response.agents || []);
        }
      } catch (err) {
        if (!cancelled) {
          setLiveAgentsError(err instanceof Error ? err.message : 'Failed to fetch agents');
          setLiveAgents([]);
        }
      } finally {
        if (!cancelled) {
          setLiveAgentsLoading(false);
        }
      }
    }
    fetchLiveAgents();
    return () => { cancelled = true; };
  }, []);

  // Compute risk heatmap from live agent data
  const liveAgentRiskData = useMemo(() => {
    if (liveAgentsLoading || liveAgentsError || liveAgents.length === 0) {
      return null;
    }
    return computeRiskHeatmapFromAgents(liveAgents);
  }, [liveAgents, liveAgentsLoading, liveAgentsError]);

  const {
    loading: aggLoading,
    summary,
    policies,
    // policyMetricsTotal available for future features
    deployments,
    useCases,
    frontierAgents,
    useCaseRiskHeatmap,
    useCaseRiskCategories,
    topRiskyUseCases,
    activityFeed,
    trendData30d,
    controlChecklist,
    controlStats,
  } = useGovernanceAggregator();

  // Use shared guardrail metrics hook for consistent data across all Govern pages
  const {
    error: guardrailError,
    guardrails,
    metrics: guardrailMetricsTotal,
    activeCount: guardrailsActive,
    draftCount: guardrailsDraft,
    failedCount: guardrailsFailed,
  } = useGuardrailMetrics();

  // Only block on aggregator loading - guardrail errors are handled gracefully
  const loading = aggLoading;

  // Fallback values if guardrail data fails
  const effectiveGuardrailsActive = guardrailError ? 0 : guardrailsActive;
  const effectiveGuardrailsDraft = guardrailError ? 0 : guardrailsDraft;
  const effectiveGuardrailsFailed = guardrailError ? 0 : guardrailsFailed;
  const effectiveGuardrailMetrics = guardrailError ? { totalInvocations: 0, blockedCount: 0 } : guardrailMetricsTotal;

  return (
    <GovernPageLayout
      title="Agent Fleet Governance"
      description="Unified control plane for your agentic AI fleet. Monitor posture, enforce policies, and respond to incidents."
      badge={<CoreBadge pillar="see" />}
      actions={
        <>
          <Link
            to="/govern/risk"
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            View Risk Management →
          </Link>
          <div className="text-xs text-slate-400">
            Updated {new Date().toLocaleTimeString()} · <span className="text-emerald-600 font-medium">● Live</span>
          </div>
        </>
      }
    >
        {/* How to Use Guide */}
        <UnifiedGuide {...FLEET_GUIDE} />

        {/* View toggle: standard operations overview vs large-fleet (10k+) scale view */}
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-4">
          {([['overview', 'Overview'], ['scale', 'At Scale (10k+)']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFleetView(id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                fleetView === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {fleetView === 'scale' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={useRealFleetData}
                  onChange={e => setUseRealFleetData(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Use real fleet data
              </label>
            </div>
            <FleetScaleView useRealData={useRealFleetData} />
          </div>
        )}

        {fleetView === 'overview' && (
        <div className="space-y-6">
          {/* Real-time data indicator */}
          {!loading && (guardrails.length > 0 || policies.length > 0 || deployments.length > 0 || useCases.length > 0 || liveAgents.length > 0) && (
            <div className="flex items-center gap-2 text-[10px] text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg w-fit">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live AVA Data: {guardrails.length} guardrails, {policies.length} policies, {deployments.length} deployments, {useCases.length} use cases, {frontierAgents.length + liveAgents.length} agents
              {liveAgents.length > 0 && <span className="text-sky-600 ml-1">({liveAgents.length} from AWS)</span>}
            </div>
          )}

          {/* Fleet Posture — Unified hero section */}
          <FleetPostureSection
            score={controlStats.percentage}
            pillarScores={{
              registry: deployments.length > 0 ? Math.min(100, 50 + deployments.length * 10) : 0,
              access: effectiveGuardrailsActive > 0 ? Math.min(100, 40 + effectiveGuardrailsActive * 15) : 0,
              visualization: useCases.length > 0 ? 80 : 40,
              interoperability: guardrails.length > 0 ? 70 : 30,
              security: controlStats.percentage,
            }}
            statusCounts={{
              healthy: effectiveGuardrailsActive,
              watch: effectiveGuardrailsDraft,
              gap: effectiveGuardrailsFailed,
            }}
            trendData={trendData30d.map(d => ({ day: d.date, trustScore: d.trustScore }))}
            controlGaps={
              // Only show gaps when there's real governance activity but issues exist
              (() => {
                const gaps: Array<{ dimension: string; gap: number }> = [];
                // Failed guardrails are a real gap
                if (effectiveGuardrailsFailed > 0) {
                  gaps.push({ dimension: 'Guardrails Failing', gap: effectiveGuardrailsFailed });
                }
                // Deployments without guardrails
                if (deployments.length > 0 && effectiveGuardrailsActive === 0) {
                  gaps.push({ dimension: 'Deployments Unprotected', gap: deployments.length });
                }
                // Use cases without computed scores (only if use cases exist)
                const unscoredUseCases = useCases.filter(uc => !uc.computed?.composite).length;
                if (useCases.length > 0 && unscoredUseCases > 0) {
                  gaps.push({ dimension: 'Use Cases Unscored', gap: unscoredUseCases });
                }
                return gaps;
              })()
            }
            metrics={{
              useCases: useCases.length,
              deployments: deployments.length,
              bedrockAgents: summary.bedrockAgents,
              agentcoreRuntimes: summary.agentcoreRuntimes,
              activeGuardrails: effectiveGuardrailsActive,
              policiesEnforced: policies.length,
              eventsToday: activityFeed.length,
              blockedToday: activityFeed.filter(e => e.severity === 'critical' || e.severity === 'high').length,
            }}
          />

          {/* AWS Governance Dimensions Coverage */}
          <GovernanceDimensionsCard
            guardrailsActive={effectiveGuardrailsActive}
            policiesActive={policies.length}
            auditEnabled={true}
            identityConfigured={true}
          />

          {/* Security Controls + Activity Feed - Side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Security Controls - Compact */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">Security Controls</span>
                {(guardrails.length > 0 || policies.length > 0) && (
                  <div className="flex items-center gap-3 ml-2 text-[10px]">
                    <span><strong className="text-violet-600">{guardrails.length}</strong> guardrails</span>
                    <span><strong className="text-emerald-600">{effectiveGuardrailMetrics.totalInvocations.toLocaleString()}</strong> calls</span>
                    <span><strong className="text-amber-600">{effectiveGuardrailMetrics.blockedCount}</strong> blocked</span>
                    <span><strong className="text-indigo-600">{policies.length}</strong> policies</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Link to="/secure/guardrails" className="text-[10px] text-blue-600 font-medium">Guardrails →</Link>
                <Link to="/secure/policy" className="text-[10px] text-blue-600 font-medium">Policies →</Link>
              </div>
            </div>

            {guardrails.length === 0 && policies.length === 0 ? (
              <div className="flex items-center gap-3 py-3 px-3 bg-slate-50 rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-slate-700">Protect your AI fleet</div>
                  <div className="text-[10px] text-slate-500">Add guardrails to filter content and policies to control access</div>
                </div>
                <Link to="/secure/guardrails" className="px-2 py-1 bg-violet-600 hover:bg-violet-700 text-white text-[9px] font-medium rounded transition-colors flex-shrink-0">
                  Add
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {/* Guardrails - compact list */}
                <div className="space-y-1">
                  <div className="text-[9px] font-semibold text-slate-500 uppercase">Guardrails</div>
                  {guardrails.filter(g => g.status === 'active').slice(0, 3).map((g) => (
                    <div key={g.template_id} className="flex items-center gap-1.5 py-1 px-2 bg-slate-50 rounded text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-slate-700 truncate flex-1">{g.name}</span>
                    </div>
                  ))}
                  {guardrails.filter(g => g.status === 'active').length > 3 && (
                    <div className="text-[9px] text-slate-400 pl-2">+{guardrails.filter(g => g.status === 'active').length - 3} more</div>
                  )}
                </div>
                {/* Policies - compact list */}
                <div className="space-y-1">
                  <div className="text-[9px] font-semibold text-slate-500 uppercase">Policies</div>
                  {policies.filter(p => p.status === 'active').slice(0, 3).map((p) => (
                    <div key={p.policy_id} className="flex items-center gap-1.5 py-1 px-2 bg-slate-50 rounded text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      <span className="text-slate-700 truncate flex-1">{p.name}</span>
                      <span className="text-[8px] text-slate-400">{p.rules_count}r</span>
                    </div>
                  ))}
                  {policies.filter(p => p.status === 'active').length > 3 && (
                    <div className="text-[9px] text-slate-400 pl-2">+{policies.filter(p => p.status === 'active').length - 3} more</div>
                  )}
                </div>
              </div>
            )}
            </div>

            {/* Activity Feed - Clean table layout */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">Activity Feed</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Demo</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 bg-slate-100 rounded p-0.5">
                    {(['all', 'critical', 'high'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setActivityFilter(f)}
                        className={`px-2 py-0.5 text-[9px] font-medium rounded transition-all ${
                          activityFilter === f ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
                        }`}
                      >
                        {f === 'all' ? 'All' : f === 'critical' ? 'Critical' : 'High'}
                      </button>
                    ))}
                  </div>
                  <Link to="/govern/audit" className="text-[10px] text-blue-600 font-medium">View All →</Link>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {activityFeed.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs">No activity yet</div>
                ) : (
                  (activityFilter === 'all' ? activityFeed : activityFeed.filter(e => e.severity === activityFilter)).slice(0, 5).map((e) => (
                    <Link
                      key={e.id}
                      to="/govern/audit"
                      className="flex items-start gap-3 py-2 px-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        e.severity === 'critical' ? 'bg-rose-500' :
                        e.severity === 'high' ? 'bg-orange-500' :
                        'bg-slate-300'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-800 leading-tight">{e.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[9px] font-medium ${
                            e.severity === 'critical' ? 'text-rose-600' :
                            e.severity === 'high' ? 'text-orange-600' :
                            'text-slate-500'
                          }`}>{e.type}</span>
                          <span className="text-[9px] text-slate-400">
                            {new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Governance Controls + Deployments - Side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Governance Controls - Clean checklist layout */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">Governance Controls</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                    {controlStats.implemented}/{controlStats.total}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${controlStats.percentage}%`,
                        backgroundColor: scoreColor(controlStats.percentage)
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold" style={{ color: scoreColor(controlStats.percentage) }}>
                    {controlStats.percentage}%
                  </span>
                </div>
              </div>
              <div className="divide-y divide-slate-100 max-h-[200px] overflow-y-auto">
                {controlChecklist.map((control) => {
                  const categoryColors: Record<string, string> = {
                    technical: 'text-blue-600',
                    security: 'text-emerald-600',
                    governance: 'text-violet-600',
                    process: 'text-amber-600',
                  };
                  return (
                    <div
                      key={control.id}
                      className="flex items-center gap-3 py-2 px-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                        control.implemented ? 'bg-emerald-100' : 'bg-slate-100'
                      }`}>
                        {control.implemented ? (
                          <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs leading-tight ${control.implemented ? 'text-slate-800' : 'text-slate-500'}`}>
                          {control.name}
                        </div>
                        {control.details && (
                          <div className="text-[9px] text-emerald-600 mt-0.5">{control.details}</div>
                        )}
                      </div>
                      <span className={`text-[8px] font-medium uppercase ${categoryColors[control.category]}`}>
                        {control.category.slice(0, 4)}
                      </span>
                      {!control.implemented && control.link && (
                        <Link
                          to={control.link}
                          className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                        >
                          Fix
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Deployments - Compact (in grid) */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">Deployments</span>
                  {deployments.length > 0 && (
                    <>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                        {deployments.filter(d => d.status === 'deployed' || d.status === 'delivered').length}/{deployments.length}
                      </span>
                      <div className="flex items-center gap-2 ml-2 text-[10px]">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="text-slate-600">{deployments.filter(d => d.status === 'deployed' || d.status === 'delivered').length}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span className="text-slate-600">{deployments.filter(d => d.status === 'pending' || d.status === 'deploying').length}</span>
                        </span>
                        {deployments.filter(d => d.status === 'failed').length > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span className="text-rose-600">{deployments.filter(d => d.status === 'failed').length}</span>
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <Link to="/deployments" className="text-[10px] text-blue-600 font-medium">View All →</Link>
              </div>
              {deployments.length === 0 ? (
                <div className="flex items-center gap-3 py-3 px-3 bg-slate-50 rounded-lg">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-slate-700">Get started with AVA</div>
                    <div className="text-[10px] text-slate-500">Deploy use cases from Applications or connect AWS Frontier Agents</div>
                  </div>
                  <Link to="/applications" className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-medium rounded transition-colors flex-shrink-0">
                    Deploy
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1">
                  {deployments.slice(0, 8).map((d) => (
                    <Link
                      key={d.deployment_id}
                      to="/deployments"
                      className="flex items-center gap-1.5 py-1 px-2 rounded bg-slate-50 hover:bg-slate-100 text-[10px]"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        d.status === 'deployed' || d.status === 'delivered' ? 'bg-emerald-500' :
                        d.status === 'pending' || d.status === 'deploying' ? 'bg-amber-500' :
                        d.status === 'failed' ? 'bg-rose-500' : 'bg-slate-400'
                      }`} />
                      <span className="text-slate-700 truncate">{d.deployment_name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Provider Summary + Vendor Health - Side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Provider Summary - Agent distribution by provider with governance status */}
            <ProviderSummary />

            {/* Vendor Health Overview */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Icon name="building-office" className="w-5 h-5 text-violet-600" />
                  <span className="text-sm font-semibold text-slate-900">Vendor Health</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                    27 vendors
                  </span>
                </div>
                <Link to="/govern/risk?tab=third-party" className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">
                  TPRM →
                </Link>
              </div>
              <div className="p-4">
                {/* Key Vendors */}
                <div className="space-y-2 mb-4">
                  {[
                    { name: 'OpenAI', tier: 'Critical', score: 92, status: 'Compliant' },
                    { name: 'Anthropic', tier: 'Critical', score: 95, status: 'Compliant' },
                    { name: 'Cohere', tier: 'High', score: 88, status: 'Review Due' },
                    { name: 'Pinecone', tier: 'High', score: 85, status: 'Compliant' },
                  ].map((vendor) => (
                    <div key={vendor.name} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 border border-slate-200/60">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-800">{vendor.name}</span>
                          <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${
                            vendor.tier === 'Critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                          }`}>{vendor.tier}</span>
                        </div>
                      </div>
                      <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${vendor.score >= 90 ? 'bg-emerald-500' : vendor.score >= 80 ? 'bg-blue-500' : 'bg-amber-500'}`}
                          style={{ width: `${vendor.score}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-600 w-8">{vendor.score}%</span>
                      <span className={`text-[9px] font-medium ${
                        vendor.status === 'Compliant' ? 'text-emerald-600' : 'text-amber-600'
                      }`}>{vendor.status}</span>
                    </div>
                  ))}
                </div>
                {/* Alerts */}
                <div className="pt-3 border-t border-slate-200/60">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-amber-600 font-medium">3 contracts expiring &lt;90 days</span>
                    <span className="text-rose-600 font-medium">2 DDQs overdue</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Expand Fleet CTA */}
          <div className="bg-gradient-to-r from-blue-50 via-violet-50 to-emerald-50 rounded-xl border border-blue-200/60 p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-900">Expand Your Governed Fleet</div>
                  <div className="text-[9px] text-slate-500">Deploy use cases or connect frontier agents</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Link
                  to="/govern/agents"
                  className="px-2 py-1 bg-slate-600 hover:bg-slate-700 text-white text-[9px] font-medium rounded transition-colors"
                >
                  Registry
                </Link>
                <Link
                  to="/applications"
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-medium rounded transition-colors"
                >
                  Deploy
                </Link>
                <Link
                  to="/aaas/aws-agents"
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-medium rounded transition-colors"
                >
                  Connect
                </Link>
              </div>
            </div>
          </div>

          {/* Fleet Risk + Agentic Data & Tools - Side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Fleet Risk View — Combined heatmap + rankings + KPIs */}
            <FleetRiskView
              useCaseRiskHeatmap={useCaseRiskHeatmap}
              useCaseRiskCategories={[...useCaseRiskCategories]}
              topRiskyUseCases={topRiskyUseCases}
              onOpenRisk={setOpenRisk}
              cellColor={cellColor}
              tooltipStyle={tooltipStyle}
              liveAgentData={liveAgentRiskData ?? undefined}
              isLiveData={!!liveAgentRiskData}
            />

            {/* Agentic Data & Tools - Derived from use cases */}
            <AgentDataToolsView
              useCases={useCases.map(uc => ({
                use_case_id: uc.use_case_id,
                name: uc.name,
                business_domain: uc.business_domain,
                ai_type: uc.ai_type,
                integration_depth: uc.integration_depth,
                status: uc.status,
              }))}
              guardrailCount={effectiveGuardrailsActive}
            />
          </div>

          {/* Agent Chain Analysis - Attack path style visualization */}
          <AgentChainVisualization
            useCases={useCases}
            guardrails={guardrails}
          />

          {/* Emergency Controls - Full Panel */}
          <EmergencyControls />

        </div>
        )}

      <RiskDrawer selection={openRisk} onClose={() => setOpenRisk(null)} />
    </GovernPageLayout>
  );
}
