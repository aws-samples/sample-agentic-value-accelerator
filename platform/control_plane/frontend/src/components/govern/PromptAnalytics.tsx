/**
 * PromptAnalytics — Long-term model input/output analysis.
 *
 * Combines:
 * - LIVE DATA from governGuardrailsApi.telemetry() and governInvocationSafetyApi.telemetry()
 * - DEMO data showing what's possible with an extended pipeline:
 *   - Bedrock Invocation Logging → S3 → Athena
 *   - Comprehend for topic/entity extraction
 *   - Bedrock (LLM-as-judge) for quality scoring
 *   - Aggregated metrics in DynamoDB/Timestream
 *
 * Live metrics show real guardrail interventions and invocation patterns.
 * Demo sections show additional analytics that require the full pipeline.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import { Icon, type IconName } from './icons';
import {
  governGuardrailsApi,
  governInvocationSafetyApi,
  type AwsGuardrailTelemetryResponse,
  type AwsInvocationSafetyResponse,
} from '../../api/client';
import { usePollingKey } from './usePollingKey';

// ─────────────────────────── Types ───────────────────────────

interface TopicTrend {
  topic: string;
  category: string;
  thisWeek: number;
  lastWeek: number;
  change: number;
  avgTokens: number;
  riskLevel: 'low' | 'medium' | 'high';
}

interface QualityMetric {
  date: string;
  groundingScore: number;
  hallucinationRate: number;
  relevanceScore: number;
  factualAccuracy: number;
}

interface ComplianceTrend {
  week: string;
  pii: number;
  injection: number;
  toxicity: number;
  offTopic: number;
  total: number;
}

interface UserRiskProfile {
  userId: string;
  userName: string;
  department: string;
  totalPrompts: number;
  violations: number;
  violationRate: number;
  riskScore: number;
  topViolationType: string;
  lastActivity: string;
}

interface CostByTopic {
  topic: string;
  spend: number;
  prompts: number;
  avgCostPerPrompt: number;
  trend: 'up' | 'down' | 'stable';
}

interface SensitiveDataFlow {
  dataType: string;
  occurrences: number;
  blocked: number;
  anonymized: number;
  allowed: number;
  topSources: string[];
}

interface AnalyzedPrompt {
  id: string;
  timestamp: string;
  user: string;
  application: string;
  promptPreview: string;
  responsePreview: string;
  analysis: {
    topic: string;
    intent: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    complexity: 'simple' | 'moderate' | 'complex';
    groundingScore: number;
    factualClaims: number;
    verifiedClaims: number;
    entities: { type: string; value: string; sensitive: boolean }[];
    qualityScore: number;
    riskFlags: string[];
  };
}

// ─────────────────────────── Mock Data ───────────────────────────

const MOCK_TOPIC_TRENDS: TopicTrend[] = [
  { topic: 'Customer Support', category: 'Operations', thisWeek: 2847, lastWeek: 2654, change: 7.3, avgTokens: 1240, riskLevel: 'low' },
  { topic: 'Code Generation', category: 'Engineering', thisWeek: 1923, lastWeek: 1876, change: 2.5, avgTokens: 2100, riskLevel: 'low' },
  { topic: 'Document Analysis', category: 'Legal', thisWeek: 1456, lastWeek: 1234, change: 18.0, avgTokens: 3400, riskLevel: 'medium' },
  { topic: 'Financial Analysis', category: 'Finance', thisWeek: 987, lastWeek: 1102, change: -10.4, avgTokens: 2800, riskLevel: 'high' },
  { topic: 'Market Research', category: 'Strategy', thisWeek: 743, lastWeek: 698, change: 6.4, avgTokens: 1890, riskLevel: 'medium' },
  { topic: 'HR Queries', category: 'HR', thisWeek: 521, lastWeek: 487, change: 7.0, avgTokens: 890, riskLevel: 'medium' },
  { topic: 'Data Extraction', category: 'Analytics', thisWeek: 412, lastWeek: 356, change: 15.7, avgTokens: 1560, riskLevel: 'low' },
  { topic: 'Creative Writing', category: 'Marketing', thisWeek: 298, lastWeek: 312, change: -4.5, avgTokens: 2340, riskLevel: 'low' },
];

const MOCK_QUALITY_METRICS: QualityMetric[] = [
  { date: '2026-06-01', groundingScore: 0.82, hallucinationRate: 0.08, relevanceScore: 0.91, factualAccuracy: 0.87 },
  { date: '2026-06-08', groundingScore: 0.84, hallucinationRate: 0.07, relevanceScore: 0.89, factualAccuracy: 0.88 },
  { date: '2026-06-15', groundingScore: 0.81, hallucinationRate: 0.09, relevanceScore: 0.90, factualAccuracy: 0.85 },
  { date: '2026-06-22', groundingScore: 0.85, hallucinationRate: 0.06, relevanceScore: 0.92, factualAccuracy: 0.89 },
  { date: '2026-06-29', groundingScore: 0.86, hallucinationRate: 0.05, relevanceScore: 0.91, factualAccuracy: 0.90 },
  { date: '2026-07-06', groundingScore: 0.88, hallucinationRate: 0.04, relevanceScore: 0.93, factualAccuracy: 0.91 },
  { date: '2026-07-13', groundingScore: 0.87, hallucinationRate: 0.05, relevanceScore: 0.92, factualAccuracy: 0.90 },
  { date: '2026-07-20', groundingScore: 0.89, hallucinationRate: 0.04, relevanceScore: 0.94, factualAccuracy: 0.92 },
];

const MOCK_COMPLIANCE_TRENDS: ComplianceTrend[] = [
  { week: 'Jun 1', pii: 23, injection: 8, toxicity: 3, offTopic: 12, total: 46 },
  { week: 'Jun 8', pii: 19, injection: 12, toxicity: 2, offTopic: 15, total: 48 },
  { week: 'Jun 15', pii: 27, injection: 6, toxicity: 4, offTopic: 11, total: 48 },
  { week: 'Jun 22', pii: 18, injection: 9, toxicity: 1, offTopic: 8, total: 36 },
  { week: 'Jun 29', pii: 15, injection: 7, toxicity: 2, offTopic: 9, total: 33 },
  { week: 'Jul 6', pii: 12, injection: 5, toxicity: 1, offTopic: 7, total: 25 },
  { week: 'Jul 13', pii: 14, injection: 4, toxicity: 0, offTopic: 6, total: 24 },
  { week: 'Jul 20', pii: 11, injection: 3, toxicity: 1, offTopic: 5, total: 20 },
];

const MOCK_USER_RISK: UserRiskProfile[] = [
  { userId: 'u-001', userName: 'john.smith@company.com', department: 'Engineering', totalPrompts: 1234, violations: 45, violationRate: 3.6, riskScore: 72, topViolationType: 'PII Exposure', lastActivity: '2026-07-21T14:32:00Z' },
  { userId: 'u-002', userName: 'alice.jones@company.com', department: 'Finance', totalPrompts: 876, violations: 28, violationRate: 3.2, riskScore: 65, topViolationType: 'Off-Topic', lastActivity: '2026-07-21T13:45:00Z' },
  { userId: 'u-003', userName: 'bob.wilson@company.com', department: 'Sales', totalPrompts: 2341, violations: 52, violationRate: 2.2, riskScore: 48, topViolationType: 'Injection Attempt', lastActivity: '2026-07-21T15:12:00Z' },
  { userId: 'u-004', userName: 'carol.chen@company.com', department: 'Legal', totalPrompts: 567, violations: 8, violationRate: 1.4, riskScore: 32, topViolationType: 'PII Exposure', lastActivity: '2026-07-21T11:20:00Z' },
  { userId: 'u-005', userName: 'david.kumar@company.com', department: 'HR', totalPrompts: 432, violations: 15, violationRate: 3.5, riskScore: 58, topViolationType: 'Sensitive Data', lastActivity: '2026-07-20T16:45:00Z' },
];

const MOCK_COST_BY_TOPIC: CostByTopic[] = [
  { topic: 'Document Analysis', spend: 4523.50, prompts: 1456, avgCostPerPrompt: 3.11, trend: 'up' },
  { topic: 'Code Generation', spend: 3847.20, prompts: 1923, avgCostPerPrompt: 2.00, trend: 'stable' },
  { topic: 'Customer Support', spend: 2134.80, prompts: 2847, avgCostPerPrompt: 0.75, trend: 'down' },
  { topic: 'Financial Analysis', spend: 1965.40, prompts: 987, avgCostPerPrompt: 1.99, trend: 'down' },
  { topic: 'Market Research', spend: 1456.30, prompts: 743, avgCostPerPrompt: 1.96, trend: 'up' },
];

const MOCK_SENSITIVE_DATA: SensitiveDataFlow[] = [
  { dataType: 'Personal Names', occurrences: 3456, blocked: 234, anonymized: 2890, allowed: 332, topSources: ['Customer Support', 'HR Queries'] },
  { dataType: 'Email Addresses', occurrences: 2134, blocked: 156, anonymized: 1823, allowed: 155, topSources: ['Customer Support', 'Sales'] },
  { dataType: 'Phone Numbers', occurrences: 987, blocked: 87, anonymized: 845, allowed: 55, topSources: ['Customer Support'] },
  { dataType: 'SSN/Tax ID', occurrences: 234, blocked: 234, anonymized: 0, allowed: 0, topSources: ['HR Queries', 'Finance'] },
  { dataType: 'Credit Card', occurrences: 156, blocked: 156, anonymized: 0, allowed: 0, topSources: ['Customer Support'] },
  { dataType: 'AWS Credentials', occurrences: 45, blocked: 45, anonymized: 0, allowed: 0, topSources: ['Code Generation', 'DevOps'] },
];

const MOCK_ANALYZED_PROMPTS: AnalyzedPrompt[] = [
  {
    id: 'ap-001',
    timestamp: '2026-07-21T14:32:00Z',
    user: 'alice.chen@company.com',
    application: 'customer-support-agent',
    promptPreview: 'Customer John Smith (account #12345) is asking about their recent order status. They mentioned they haven\'t received shipping confirmation...',
    responsePreview: 'I can help you check on that order. Based on the account information, Order #ORD-78901 was shipped on July 19th via FedEx...',
    analysis: {
      topic: 'Customer Support',
      intent: 'Order Status Inquiry',
      sentiment: 'neutral',
      complexity: 'simple',
      groundingScore: 0.92,
      factualClaims: 3,
      verifiedClaims: 3,
      entities: [
        { type: 'PERSON', value: 'John Smith', sensitive: true },
        { type: 'ACCOUNT_NUMBER', value: '12345', sensitive: true },
        { type: 'ORDER_NUMBER', value: 'ORD-78901', sensitive: false },
      ],
      qualityScore: 94,
      riskFlags: [],
    },
  },
  {
    id: 'ap-002',
    timestamp: '2026-07-21T13:45:00Z',
    user: 'bob.kumar@company.com',
    application: 'research-agent',
    promptPreview: 'Analyze our Q2 financial performance and compare it to Goldman Sachs projections for the sector...',
    responsePreview: 'Based on the Q2 financial data, revenue grew 12% year-over-year to $45.2M. According to Goldman Sachs\' sector analysis published in June...',
    analysis: {
      topic: 'Financial Analysis',
      intent: 'Performance Comparison',
      sentiment: 'positive',
      complexity: 'complex',
      groundingScore: 0.68,
      factualClaims: 5,
      verifiedClaims: 3,
      entities: [
        { type: 'ORGANIZATION', value: 'Goldman Sachs', sensitive: false },
        { type: 'MONEY', value: '$45.2M', sensitive: true },
        { type: 'PERCENTAGE', value: '12%', sensitive: false },
      ],
      qualityScore: 72,
      riskFlags: ['Unverified external citation', 'Financial data exposure'],
    },
  },
  {
    id: 'ap-003',
    timestamp: '2026-07-21T12:15:00Z',
    user: 'carol.smith@company.com',
    application: 'code-assistant',
    promptPreview: 'Help me debug this Python function that processes user authentication with OAuth2...',
    responsePreview: 'I can see a few issues with your OAuth2 implementation. First, you\'re not properly validating the token expiry...',
    analysis: {
      topic: 'Code Generation',
      intent: 'Debugging Assistance',
      sentiment: 'neutral',
      complexity: 'moderate',
      groundingScore: 0.95,
      factualClaims: 4,
      verifiedClaims: 4,
      entities: [
        { type: 'TECHNOLOGY', value: 'OAuth2', sensitive: false },
        { type: 'LANGUAGE', value: 'Python', sensitive: false },
      ],
      qualityScore: 96,
      riskFlags: [],
    },
  },
];

// ─────────────────────────── Sub-Components ───────────────────────────

function ArchitectureDiagram() {
  const stages = [
    { id: 'ingest', label: 'Ingest', desc: 'Bedrock Invocation Logs', icon: 'archive-box' as IconName, color: 'bg-blue-100 border-blue-300 text-blue-700' },
    { id: 'store', label: 'Store', desc: 'S3 + Glue Catalog', icon: 'circle-stack' as IconName, color: 'bg-emerald-100 border-emerald-300 text-emerald-700' },
    { id: 'process', label: 'Process', desc: 'Lambda + Comprehend', icon: 'cpu-chip' as IconName, color: 'bg-violet-100 border-violet-300 text-violet-700' },
    { id: 'analyze', label: 'Analyze', desc: 'Athena + Bedrock', icon: 'magnifying-glass' as IconName, color: 'bg-amber-100 border-amber-300 text-amber-700' },
    { id: 'aggregate', label: 'Aggregate', desc: 'DynamoDB/Timestream', icon: 'chart-bar' as IconName, color: 'bg-rose-100 border-rose-300 text-rose-700' },
  ];

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="cloud" className="w-5 h-5 text-blue-500" />
          <span className="text-sm font-semibold text-slate-800">AWS Analytics Pipeline</span>
          <MockDataBadge integration="S3 → Glue → Athena → Lambda" />
        </div>
        <Link to="/govern/prompt-governance" className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">
          View Live Data →
        </Link>
      </div>

      <div className="flex items-center justify-between">
        {stages.map((stage, i) => (
          <div key={stage.id} className="flex items-center">
            <div className={`rounded-lg border-2 ${stage.color} p-3 text-center min-w-[100px]`}>
              <div className="flex justify-center mb-1">
                <Icon name={stage.icon} className="w-5 h-5" />
              </div>
              <div className="text-[10px] font-semibold">{stage.label}</div>
              <div className="text-[9px] opacity-70">{stage.desc}</div>
            </div>
            {i < stages.length - 1 && (
              <Icon name="arrow-right" className="w-4 h-4 text-slate-300 mx-2" />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
        <div className="text-[10px] text-blue-700">
          <span className="font-semibold">Integration Path:</span> Enable Bedrock Model Invocation Logging → Configure S3 destination →
          Create Glue crawler for schema discovery → Schedule Athena queries for aggregation →
          Optional: Add Lambda for Comprehend entity extraction and Bedrock quality scoring
        </div>
      </div>
    </div>
  );
}

function TopicDistribution({ topics }: { topics: TopicTrend[] }) {
  const maxPrompts = Math.max(...topics.map(t => t.thisWeek));

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="tag" className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">Topic Distribution</span>
        </div>
        <span className="text-[10px] text-slate-400">Last 7 days</span>
      </div>

      <div className="space-y-2">
        {topics.map(topic => (
          <div key={topic.topic} className="flex items-center gap-3">
            <div className="w-32 text-[11px] font-medium text-slate-700 truncate">{topic.topic}</div>
            <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden relative">
              <div
                className={`h-full rounded-full ${
                  topic.riskLevel === 'high' ? 'bg-rose-400' :
                  topic.riskLevel === 'medium' ? 'bg-amber-400' : 'bg-blue-400'
                }`}
                style={{ width: `${(topic.thisWeek / maxPrompts) * 100}%` }}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-medium text-slate-600">
                {topic.thisWeek.toLocaleString()}
              </span>
            </div>
            <div className={`w-14 text-right text-[10px] font-medium ${
              topic.change > 0 ? 'text-emerald-600' : topic.change < 0 ? 'text-rose-600' : 'text-slate-500'
            }`}>
              {topic.change > 0 ? '+' : ''}{topic.change.toFixed(1)}%
            </div>
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${
              topic.riskLevel === 'high' ? 'bg-rose-100 text-rose-700' :
              topic.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {topic.riskLevel}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500">
        <span className="font-medium">Analysis:</span> Comprehend topic modeling + custom classification model trained on your domain
      </div>
    </div>
  );
}

function QualityTrends({ metrics }: { metrics: QualityMetric[] }) {
  const latest = metrics[metrics.length - 1];
  const previous = metrics[metrics.length - 2];

  const metricCards = [
    { key: 'groundingScore', label: 'Grounding', value: latest.groundingScore, prev: previous.groundingScore, good: 'high' },
    { key: 'hallucinationRate', label: 'Hallucination', value: latest.hallucinationRate, prev: previous.hallucinationRate, good: 'low' },
    { key: 'relevanceScore', label: 'Relevance', value: latest.relevanceScore, prev: previous.relevanceScore, good: 'high' },
    { key: 'factualAccuracy', label: 'Factual Accuracy', value: latest.factualAccuracy, prev: previous.factualAccuracy, good: 'high' },
  ];

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="chart-bar" className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">Quality Score Trends</span>
        </div>
        <span className="text-[10px] text-slate-400">8-week trend</span>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {metricCards.map(m => {
          const change = ((m.value - m.prev) / m.prev * 100);
          const isGood = m.good === 'high' ? change >= 0 : change <= 0;
          return (
            <div key={m.key} className="bg-slate-50 rounded-lg p-3 text-center">
              <div className={`text-xl font-bold ${
                m.good === 'high' ? (m.value >= 0.85 ? 'text-emerald-600' : m.value >= 0.7 ? 'text-amber-600' : 'text-rose-600') :
                (m.value <= 0.05 ? 'text-emerald-600' : m.value <= 0.1 ? 'text-amber-600' : 'text-rose-600')
              }`}>
                {m.good === 'low' ? `${(m.value * 100).toFixed(1)}%` : `${(m.value * 100).toFixed(0)}%`}
              </div>
              <div className="text-[10px] text-slate-500">{m.label}</div>
              <div className={`text-[9px] ${isGood ? 'text-emerald-600' : 'text-rose-600'}`}>
                {change >= 0 ? '+' : ''}{change.toFixed(1)}% vs last week
              </div>
            </div>
          );
        })}
      </div>

      {/* Mini trend chart */}
      <div className="h-20 flex items-end gap-1">
        {metrics.map((m, i) => (
          <div key={m.date} className="flex-1 flex flex-col items-center">
            <div className="w-full bg-emerald-200 rounded-t" style={{ height: `${m.groundingScore * 80}%` }} />
            {i % 2 === 0 && (
              <div className="text-[8px] text-slate-400 mt-1">{new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500">
        <span className="font-medium">Scoring:</span> Bedrock (Claude) as judge for grounding, relevance, and factual accuracy. Sampled at 5% of traffic.
      </div>
    </div>
  );
}

function ComplianceTrendChart({ trends }: { trends: ComplianceTrend[] }) {
  const maxTotal = Math.max(...trends.map(t => t.total));

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="shield-check" className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">Compliance Violations Trend</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[9px]"><span className="w-2 h-2 rounded bg-purple-400" /> PII</span>
          <span className="flex items-center gap-1 text-[9px]"><span className="w-2 h-2 rounded bg-rose-400" /> Injection</span>
          <span className="flex items-center gap-1 text-[9px]"><span className="w-2 h-2 rounded bg-amber-400" /> Toxicity</span>
          <span className="flex items-center gap-1 text-[9px]"><span className="w-2 h-2 rounded bg-slate-400" /> Off-Topic</span>
        </div>
      </div>

      <div className="h-32 flex items-end gap-2">
        {trends.map(t => (
          <div key={t.week} className="flex-1 flex flex-col items-center">
            <div className="w-full flex flex-col-reverse" style={{ height: `${(t.total / maxTotal) * 100}%`, minHeight: '8px' }}>
              <div className="w-full bg-purple-400 rounded-b" style={{ height: `${(t.pii / t.total) * 100}%` }} />
              <div className="w-full bg-rose-400" style={{ height: `${(t.injection / t.total) * 100}%` }} />
              <div className="w-full bg-amber-400" style={{ height: `${(t.toxicity / t.total) * 100}%` }} />
              <div className="w-full bg-slate-400 rounded-t" style={{ height: `${(t.offTopic / t.total) * 100}%` }} />
            </div>
            <div className="text-[9px] text-slate-400 mt-1">{t.week}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-[11px] text-slate-600">
          <span className="font-semibold text-emerald-600">↓ 57%</span> reduction in violations over 8 weeks
        </div>
        <button className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">
          Export Report →
        </button>
      </div>
    </div>
  );
}

function UserRiskTable({ users }: { users: UserRiskProfile[] }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="users" className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">User Risk Profiles</span>
        </div>
        <span className="text-[10px] text-slate-400">Sorted by risk score</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
              <th className="font-medium pb-2">User</th>
              <th className="font-medium pb-2">Department</th>
              <th className="font-medium pb-2 text-right">Prompts</th>
              <th className="font-medium pb-2 text-right">Violations</th>
              <th className="font-medium pb-2 text-right">Rate</th>
              <th className="font-medium pb-2 text-right">Risk Score</th>
              <th className="font-medium pb-2">Top Issue</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.userId} className={i > 0 ? 'border-t border-slate-50' : ''}>
                <td className="py-2 pr-2 font-medium text-slate-800">{u.userName}</td>
                <td className="py-2 pr-2 text-slate-500">{u.department}</td>
                <td className="py-2 pr-2 text-right text-slate-600">{u.totalPrompts.toLocaleString()}</td>
                <td className="py-2 pr-2 text-right text-slate-600">{u.violations}</td>
                <td className="py-2 pr-2 text-right">
                  <span className={u.violationRate > 3 ? 'text-rose-600 font-medium' : 'text-slate-600'}>
                    {u.violationRate.toFixed(1)}%
                  </span>
                </td>
                <td className="py-2 pr-2 text-right">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                    u.riskScore >= 60 ? 'bg-rose-100 text-rose-700' :
                    u.riskScore >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {u.riskScore}
                  </span>
                </td>
                <td className="py-2 text-slate-500">{u.topViolationType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500">
        <span className="font-medium">Risk Score:</span> Weighted composite of violation rate, violation severity, and recency. Threshold alerts at 60+.
      </div>
    </div>
  );
}

function CostByTopicChart({ costs }: { costs: CostByTopic[] }) {
  const totalSpend = costs.reduce((sum, c) => sum + c.spend, 0);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="currency-dollar" className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">Cost by Topic</span>
        </div>
        <span className="text-lg font-bold text-slate-800">${totalSpend.toLocaleString()}</span>
      </div>

      <div className="space-y-2">
        {costs.map(c => (
          <div key={c.topic} className="flex items-center gap-3">
            <div className="w-32 text-[11px] font-medium text-slate-700">{c.topic}</div>
            <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(c.spend / totalSpend) * 100}%` }} />
            </div>
            <div className="w-20 text-right text-[11px] font-medium text-slate-700">${c.spend.toLocaleString()}</div>
            <div className="w-16 text-right text-[10px] text-slate-500">${c.avgCostPerPrompt.toFixed(2)}/req</div>
            <Icon
              name={c.trend === 'up' ? 'arrow-trending-up' : c.trend === 'down' ? 'arrow-down' : 'arrow-right'}
              className={`w-3 h-3 ${c.trend === 'up' ? 'text-rose-500' : c.trend === 'down' ? 'text-emerald-500' : 'text-slate-400'}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SensitiveDataFlowChart({ flows }: { flows: SensitiveDataFlow[] }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="lock-closed" className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">Sensitive Data Flow</span>
        </div>
        <div className="flex items-center gap-2 text-[9px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-400" /> Blocked</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-400" /> Anonymized</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-400" /> Allowed</span>
        </div>
      </div>

      <div className="space-y-2">
        {flows.map(f => (
          <div key={f.dataType} className="flex items-center gap-3">
            <div className="w-28 text-[11px] font-medium text-slate-700">{f.dataType}</div>
            <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden flex">
              <div className="h-full bg-rose-400" style={{ width: `${(f.blocked / f.occurrences) * 100}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${(f.anonymized / f.occurrences) * 100}%` }} />
              <div className="h-full bg-emerald-400" style={{ width: `${(f.allowed / f.occurrences) * 100}%` }} />
            </div>
            <div className="w-16 text-right text-[10px] text-slate-500">{f.occurrences.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500">
        <span className="font-medium">Detection:</span> Bedrock PII filters + Comprehend entity recognition + custom regex patterns
      </div>
    </div>
  );
}

function AnalyzedPromptCard({ prompt }: { prompt: AnalyzedPrompt }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            prompt.analysis.qualityScore >= 90 ? 'bg-emerald-100 text-emerald-600' :
            prompt.analysis.qualityScore >= 70 ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
          }`}>
            <span className="text-sm font-bold">{prompt.analysis.qualityScore}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-medium text-slate-800">{prompt.user}</span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500">{prompt.application}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{prompt.analysis.topic}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{prompt.analysis.intent}</span>
            </div>
            <div className="text-xs text-slate-600 truncate">{prompt.promptPreview}</div>
          </div>

          <div className="flex items-center gap-2">
            {prompt.analysis.riskFlags.length > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                {prompt.analysis.riskFlags.length} flags
              </span>
            )}
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Prompt</div>
              <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 font-mono">{prompt.promptPreview}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Response</div>
              <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 font-mono">{prompt.responsePreview}</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-slate-800">{(prompt.analysis.groundingScore * 100).toFixed(0)}%</div>
              <div className="text-[9px] text-slate-500">Grounding</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-slate-800">{prompt.analysis.verifiedClaims}/{prompt.analysis.factualClaims}</div>
              <div className="text-[9px] text-slate-500">Claims Verified</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className={`text-lg font-bold ${
                prompt.analysis.sentiment === 'positive' ? 'text-emerald-600' :
                prompt.analysis.sentiment === 'negative' ? 'text-rose-600' : 'text-slate-600'
              }`}>
                {prompt.analysis.sentiment}
              </div>
              <div className="text-[9px] text-slate-500">Sentiment</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-slate-800">{prompt.analysis.complexity}</div>
              <div className="text-[9px] text-slate-500">Complexity</div>
            </div>
          </div>

          {prompt.analysis.entities.length > 0 && (
            <div className="mb-4">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Entities Detected</div>
              <div className="flex flex-wrap gap-1">
                {prompt.analysis.entities.map((e, i) => (
                  <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${
                    e.sensitive ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {e.type}: {e.value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {prompt.analysis.riskFlags.length > 0 && (
            <div className="bg-rose-50 rounded-lg p-3 border border-rose-200">
              <div className="text-[10px] font-semibold text-rose-700 mb-1">Risk Flags</div>
              <div className="space-y-1">
                {prompt.analysis.riskFlags.map((flag, i) => (
                  <div key={i} className="text-[11px] text-rose-600 flex items-center gap-1">
                    <Icon name="exclamation-triangle" className="w-3 h-3" />
                    {flag}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Live Stats Panel ───────────────────────────

function LiveStatsPanel() {
  const [guardrailData, setGuardrailData] = useState<AwsGuardrailTelemetryResponse | null>(null);
  const [invocationData, setInvocationData] = useState<AwsInvocationSafetyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const pollKey = usePollingKey(60_000);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      governGuardrailsApi.telemetry(30).catch(() => null),
      governInvocationSafetyApi.telemetry(7).catch(() => null),
    ]).then(([gr, inv]) => {
      if (!cancelled) {
        setGuardrailData(gr);
        setInvocationData(inv);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [pollKey]);

  const live = guardrailData?.live || invocationData?.live;

  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5 mb-6">
        <div className="h-20 flex items-center justify-center text-xs text-slate-400">Loading live metrics...</div>
      </div>
    );
  }

  if (!guardrailData && !invocationData) {
    return null;
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="signal" className="w-5 h-5 text-emerald-500" />
          <span className="text-sm font-semibold text-slate-800">Live AWS Metrics</span>
          {live ? <LiveDataBadge /> : <MockDataBadge />}
        </div>
        <div className="text-[10px] text-slate-400">
          Auto-refreshes every 60s
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Guardrail Metrics */}
        {guardrailData && (
          <>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <Icon name="shield-check" className="w-4 h-4 text-slate-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-slate-800">{guardrailData.total_guardrails}</div>
              <div className="text-[10px] text-slate-500">Guardrails</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <Icon name="bolt" className="w-4 h-4 text-slate-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-slate-800">{formatNum(guardrailData.total_invocations)}</div>
              <div className="text-[10px] text-slate-500">Invocations (30d)</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500 mx-auto mb-1" />
              <div className={`text-lg font-bold ${guardrailData.total_interventions > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                {formatNum(guardrailData.total_interventions)}
              </div>
              <div className="text-[10px] text-slate-500">Interventions</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <Icon name="chart-bar" className="w-4 h-4 text-slate-400 mx-auto mb-1" />
              <div className={`text-lg font-bold ${guardrailData.intervention_rate_pct > 5 ? 'text-rose-600' : 'text-slate-800'}`}>
                {guardrailData.intervention_rate_pct.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-500">Block Rate</div>
            </div>
          </>
        )}

        {/* Invocation Metrics */}
        {invocationData && (
          <>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <Icon name="cpu-chip" className="w-4 h-4 text-slate-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-slate-800">{formatNum(invocationData.total_calls)}</div>
              <div className="text-[10px] text-slate-500">API Calls (7d)</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <Icon name="arrow-right" className="w-4 h-4 text-slate-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-slate-800">{formatNum(invocationData.input_tokens)}</div>
              <div className="text-[10px] text-slate-500">Input Tokens</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <Icon name="arrow-down" className="w-4 h-4 text-slate-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-slate-800">{formatNum(invocationData.output_tokens)}</div>
              <div className="text-[10px] text-slate-500">Output Tokens</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <Icon name="lock-closed" className="w-4 h-4 text-slate-400 mx-auto mb-1" />
              <div className={`text-lg font-bold ${invocationData.guardrail_intervened > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {formatNum(invocationData.guardrail_intervened)}
              </div>
              <div className="text-[10px] text-slate-500">Blocked</div>
            </div>
          </>
        )}
      </div>

      {/* Policy breakdown from live data */}
      {guardrailData && guardrailData.by_policy.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-[11px] font-semibold text-slate-700 mb-2">Live Interventions by Policy Type</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {guardrailData.by_policy.map(p => (
              <div key={p.policy_type} className="bg-slate-50 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">{p.label}</div>
                <div className="text-lg font-semibold text-slate-800">{p.interventions.toLocaleString()}</div>
                <div className="text-[9px] text-slate-400">{p.dimension}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily trend from live data */}
      {invocationData && invocationData.trend.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-[11px] font-semibold text-slate-700 mb-2">7-Day Invocation Trend (Live)</div>
          <div className="flex items-end gap-1 h-16">
            {invocationData.trend.map((d, i) => {
              const maxCalls = Math.max(...invocationData.trend.map(t => t.calls), 1);
              const height = (d.calls / maxCalls * 100);
              const interventionHeight = d.calls > 0 ? (d.guardrail_intervened / d.calls * height) : 0;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center">
                  <div className="w-full bg-blue-100 rounded-t relative" style={{ height: `${height}%`, minHeight: '4px' }}>
                    {interventionHeight > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-amber-400 rounded-t" style={{ height: `${interventionHeight}%` }} />
                    )}
                  </div>
                  {i % 2 === 0 && (
                    <div className="text-[8px] text-slate-400 mt-1">{new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[9px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-200" /> Calls</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-400" /> Guardrail blocked</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ─────────────────────────── Main Component ───────────────────────────

export default function PromptAnalytics() {
  const [activeTab, setActiveTab] = useState<'overview' | 'quality' | 'compliance' | 'users' | 'cost' | 'samples'>('overview');

  return (
    <div className="space-y-6">
      {/* Live Stats from AWS APIs */}
      <LiveStatsPanel />

      {/* Architecture Diagram */}
      <ArchitectureDiagram />

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg w-fit">
        {[
          { key: 'overview', label: 'Overview', icon: 'squares-2x2' as IconName },
          { key: 'quality', label: 'Quality', icon: 'chart-bar' as IconName },
          { key: 'compliance', label: 'Compliance', icon: 'shield-check' as IconName },
          { key: 'users', label: 'Users', icon: 'users' as IconName },
          { key: 'cost', label: 'Cost', icon: 'currency-dollar' as IconName },
          { key: 'samples', label: 'Samples', icon: 'clipboard-list' as IconName },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon name={tab.icon} className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopicDistribution topics={MOCK_TOPIC_TRENDS} />
          <QualityTrends metrics={MOCK_QUALITY_METRICS} />
          <ComplianceTrendChart trends={MOCK_COMPLIANCE_TRENDS} />
          <SensitiveDataFlowChart flows={MOCK_SENSITIVE_DATA} />
        </div>
      )}

      {activeTab === 'quality' && (
        <div className="space-y-6">
          <QualityTrends metrics={MOCK_QUALITY_METRICS} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopicDistribution topics={MOCK_TOPIC_TRENDS} />
            <SensitiveDataFlowChart flows={MOCK_SENSITIVE_DATA} />
          </div>
        </div>
      )}

      {activeTab === 'compliance' && (
        <div className="space-y-6">
          <ComplianceTrendChart trends={MOCK_COMPLIANCE_TRENDS} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UserRiskTable users={MOCK_USER_RISK} />
            <SensitiveDataFlowChart flows={MOCK_SENSITIVE_DATA} />
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-6">
          <UserRiskTable users={MOCK_USER_RISK} />
          <TopicDistribution topics={MOCK_TOPIC_TRENDS} />
        </div>
      )}

      {activeTab === 'cost' && (
        <div className="space-y-6">
          <CostByTopicChart costs={MOCK_COST_BY_TOPIC} />
          <TopicDistribution topics={MOCK_TOPIC_TRENDS} />
        </div>
      )}

      {activeTab === 'samples' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="magnifying-glass" className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-800">Analyzed Prompt Samples</span>
            </div>
            <span className="text-[10px] text-slate-400">Sampled at 5% for deep analysis</span>
          </div>
          {MOCK_ANALYZED_PROMPTS.map(prompt => (
            <AnalyzedPromptCard key={prompt.id} prompt={prompt} />
          ))}
        </div>
      )}

      {/* Integration Guide */}
      <div className="bg-gradient-to-r from-violet-50 to-blue-50 rounded-xl border border-violet-200 p-5">
        <div className="flex items-start gap-3">
          <Icon name="light-bulb" className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-violet-800 mb-2">Building This Pipeline</div>
            <div className="text-xs text-violet-700 space-y-1">
              <div><span className="font-medium">1. Enable Logging:</span> Bedrock Console → Settings → Model invocation logging → S3 destination</div>
              <div><span className="font-medium">2. Schema Discovery:</span> Create Glue crawler pointing to S3 bucket for automatic schema detection</div>
              <div><span className="font-medium">3. Scheduled Aggregation:</span> Athena scheduled queries for daily/weekly rollups</div>
              <div><span className="font-medium">4. Topic Classification:</span> Lambda + Comprehend for entity extraction and topic modeling</div>
              <div><span className="font-medium">5. Quality Scoring:</span> Lambda + Bedrock (Claude) as judge on sampled traffic (cost: ~$0.01/sample)</div>
              <div><span className="font-medium">6. Storage:</span> DynamoDB for aggregated metrics, Timestream for time-series trends</div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html" target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-600 hover:text-violet-700 font-medium">
                AWS Docs: Invocation Logging ↗
              </a>
              <Link to="/govern/prompt-governance" className="text-[10px] text-violet-600 hover:text-violet-700 font-medium">
                View Live Telemetry →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
