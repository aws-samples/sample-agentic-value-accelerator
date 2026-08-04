/**
 * HallucinationDetection — Real-time hallucination detection and mitigation
 *
 * FSI/Enterprise-grade hallucination management:
 * - Real-time detection via Bedrock Guardrails contextual grounding
 * - Multi-method detection (faithfulness, citation, claim extraction)
 * - Configurable mitigation strategies (block, flag, escalate)
 * - Incident feed with per-response drill-down
 * - Integration with RAG evaluations for grounding metrics
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { Icon, type IconName } from './icons';
import { tooltipStyle } from './mockData';
import LiveHeader from './LiveHeader';
import { LiveDataBadge } from './DataSourceIndicator';
import { governGuardrailsApi, type AwsGuardrailSummary, type AwsGuardrailPolicyBreakdown } from '../../api/client';
import { usePollingKey } from './usePollingKey';
import { rowButtonProps } from './a11y';

// Detection method definitions
interface DetectionMethod {
  id: string;
  name: string;
  desc: string;
  icon: IconName;
  accuracy: number;
  latencyMs: number;
  enabled: boolean;
  awsService?: string;
}

const DETECTION_METHODS: DetectionMethod[] = [
  {
    id: 'automated-reasoning',
    name: 'Automated Reasoning',
    desc: 'Mathematical/formal verification using SMT-LIB logic — provable assurance, not probabilistic',
    icon: 'check-badge',
    accuracy: 99,
    latencyMs: 180,
    enabled: true,
    awsService: 'Bedrock Guardrails',
  },
  {
    id: 'contextual-grounding',
    name: 'Contextual Grounding',
    desc: 'Bedrock Guardrails grounding check verifies responses against source documents',
    icon: 'shield-check',
    accuracy: 94,
    latencyMs: 120,
    enabled: true,
    awsService: 'Bedrock Guardrails',
  },
  {
    id: 'llm-prompt-based',
    name: 'LLM Prompt-Based',
    desc: 'Few-shot prompted LLM scores context vs answer alignment (0=grounded, 1=hallucinated)',
    icon: 'chat-bubble',
    accuracy: 75,
    latencyMs: 2100,
    enabled: true,
    awsService: 'Bedrock Runtime',
  },
  {
    id: 'semantic-similarity',
    name: 'Semantic Similarity',
    desc: 'Titan Embeddings cosine similarity between context and answer — hallucination = 1-similarity',
    icon: 'arrows-pointing-in',
    accuracy: 48,
    latencyMs: 350,
    enabled: false,
    awsService: 'Bedrock Embeddings',
  },
  {
    id: 'bert-stochastic',
    name: 'BERT Stochastic Checker',
    desc: 'Generate N samples, compute BERT scores — low consistency indicates hallucination',
    icon: 'sparkles',
    accuracy: 76,
    latencyMs: 4500,
    enabled: false,
  },
  {
    id: 'token-similarity',
    name: 'Token Intersection',
    desc: 'Fast pre-filter using BLEU/token overlap — filters obvious hallucinations before LLM check',
    icon: 'magnifying-glass',
    accuracy: 47,
    latencyMs: 15,
    enabled: true,
  },
];

// Mitigation strategy definitions
interface MitigationStrategy {
  id: string;
  name: string;
  desc: string;
  icon: IconName;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: string;
  enabled: boolean;
}

const MITIGATION_STRATEGIES: MitigationStrategy[] = [
  {
    id: 'block',
    name: 'Block Response',
    desc: 'Prevent hallucinated response from reaching user; return error or fallback',
    icon: 'x-circle',
    severity: 'critical',
    action: 'Response blocked, user shown grounding failure message',
    enabled: true,
  },
  {
    id: 'flag-review',
    name: 'Flag for Review',
    desc: 'Allow response but flag for human review in audit queue',
    icon: 'flag',
    severity: 'medium',
    action: 'Response delivered with audit flag, queued for review',
    enabled: true,
  },
  {
    id: 'add-disclaimer',
    name: 'Add Disclaimer',
    desc: 'Append uncertainty disclaimer to responses with low grounding scores',
    icon: 'exclamation-triangle',
    severity: 'low',
    action: 'Response includes "This information may not be fully verified" notice',
    enabled: true,
  },
  {
    id: 'escalate-human',
    name: 'Escalate to Human',
    desc: 'Route to human agent for high-stakes domains (financial advice, medical)',
    icon: 'user-circle',
    severity: 'high',
    action: 'Response held, routed to SME queue for verification',
    enabled: false,
  },
];

// Threshold configuration
interface ThresholdConfig {
  groundingScore: number;    // 0-1, below this triggers mitigation
  faithfulnessScore: number; // 0-1, below this triggers mitigation
  citationCoverage: number;  // 0-1, minimum citation support required
  confidenceThreshold: number; // model confidence below this flags review
}

const DEFAULT_THRESHOLDS: ThresholdConfig = {
  groundingScore: 0.75,
  faithfulnessScore: 0.85,
  citationCoverage: 0.70,
  confidenceThreshold: 0.80,
};

// Mock incident data for demonstration
interface HallucinationIncident {
  id: string;
  timestamp: string;
  model: string;
  query: string;
  response: string;
  groundingScore: number;
  faithfulnessScore: number;
  detectionMethod: string;
  mitigation: string;
  claims: { text: string; verified: boolean; source?: string }[];
  status: 'blocked' | 'flagged' | 'escalated' | 'resolved';
}

// Deterministic noise for mock data
const noise = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const MOCK_INCIDENTS: HallucinationIncident[] = [
  {
    id: 'hal-001',
    timestamp: '2026-07-15 14:23:18',
    model: 'Claude Sonnet 4.5',
    query: 'What is the maximum loan-to-value ratio for commercial real estate under Basel IV?',
    response: 'Under Basel IV, the maximum LTV ratio for commercial real estate is 65%, reduced from the previous 70% threshold...',
    groundingScore: 0.42,
    faithfulnessScore: 0.38,
    detectionMethod: 'contextual-grounding',
    mitigation: 'block',
    claims: [
      { text: 'Basel IV sets max LTV at 65%', verified: false },
      { text: 'Previous threshold was 70%', verified: false },
    ],
    status: 'blocked',
  },
  {
    id: 'hal-002',
    timestamp: '2026-07-15 13:45:02',
    model: 'Nova Pro',
    query: 'What are the SR 26-2 requirements for AI model documentation?',
    response: 'SR 26-2 requires comprehensive model documentation including...',
    groundingScore: 0.68,
    faithfulnessScore: 0.72,
    detectionMethod: 'faithfulness-eval',
    mitigation: 'flag-review',
    claims: [
      { text: 'SR 26-2 requires model documentation', verified: true, source: 'sr-26-2-section-4.pdf' },
      { text: 'Documentation must include training data sources', verified: true, source: 'sr-26-2-appendix-b.pdf' },
      { text: 'Annual recertification is required', verified: false },
    ],
    status: 'flagged',
  },
  {
    id: 'hal-003',
    timestamp: '2026-07-15 11:12:44',
    model: 'Claude Haiku 4.5',
    query: 'What penalties apply for GDPR violations involving AI systems?',
    response: 'GDPR penalties for AI systems can reach up to €50 million or 6% of global revenue...',
    groundingScore: 0.31,
    faithfulnessScore: 0.29,
    detectionMethod: 'citation-verification',
    mitigation: 'block',
    claims: [
      { text: 'Max fine is €50 million', verified: false },
      { text: 'Penalty is 6% of revenue', verified: false },
    ],
    status: 'blocked',
  },
  {
    id: 'hal-004',
    timestamp: '2026-07-15 09:58:33',
    model: 'Claude Sonnet 4.5',
    query: 'How should we configure guardrails for PHI data?',
    response: 'For PHI data, configure guardrails with PII filters for all 18 HIPAA Safe Harbor identifiers...',
    groundingScore: 0.91,
    faithfulnessScore: 0.94,
    detectionMethod: 'contextual-grounding',
    mitigation: 'add-disclaimer',
    claims: [
      { text: 'HIPAA Safe Harbor has 18 identifiers', verified: true, source: 'hipaa-164-514.pdf' },
      { text: 'PII filters should block these identifiers', verified: true, source: 'bedrock-guardrails-guide.pdf' },
    ],
    status: 'resolved',
  },
];

// Generate trend data
const generateTrendData = () => {
  return Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    detected: Math.floor(noise(i * 7 + 1) * 8 + 2),
    blocked: Math.floor(noise(i * 7 + 2) * 5 + 1),
    flagged: Math.floor(noise(i * 7 + 3) * 3),
  }));
};

const SEVERITY_COLORS = {
  low: 'bg-blue-100 text-blue-700 border-blue-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  critical: 'bg-rose-100 text-rose-700 border-rose-200',
};

const STATUS_STYLES = {
  blocked: 'bg-rose-100 text-rose-700',
  flagged: 'bg-amber-100 text-amber-700',
  escalated: 'bg-orange-100 text-orange-700',
  resolved: 'bg-emerald-100 text-emerald-700',
};

const PIE_COLORS = ['#ef4444', '#f59e0b', '#f97316', '#10b981'];

export default function HallucinationDetection() {
  const [thresholds, setThresholds] = useState<ThresholdConfig>(DEFAULT_THRESHOLDS);
  const [methods, setMethods] = useState<DetectionMethod[]>(DETECTION_METHODS);
  const [strategies, setStrategies] = useState<MitigationStrategy[]>(MITIGATION_STRATEGIES);
  const [selectedIncident, setSelectedIncident] = useState<HallucinationIncident | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'incidents' | 'config'>('overview');

  // Live guardrails data (for grounding check stats)
  const pollKey = usePollingKey(60_000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardrailsData, setGuardrailsData] = useState<{
    total: number;
    total_interventions: number;
    grounding_failures: number;
    content_filter: number;
    pii_filter: number;
    topic_filter: number;
    word_filter: number;
    other_interventions: number;
    live: boolean;
    source: string;
    note?: string | null;
    guardrails: AwsGuardrailSummary[];
    by_policy: AwsGuardrailPolicyBreakdown[];
    window_days: number;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    governGuardrailsApi.telemetry(30)
      .then(d => {
        // Extract per-policy interventions from by_policy breakdown
        const byPolicy = d.by_policy ?? [];
        const getCount = (keywords: string[]) =>
          byPolicy.find(p =>
            keywords.some(k => p.policy_type?.toLowerCase().includes(k) || p.label?.toLowerCase().includes(k))
          )?.interventions ?? 0;

        const groundingCount = getCount(['grounding']);
        const contentCount = getCount(['content']);
        const piiCount = getCount(['pii', 'sensitive']);
        const topicCount = getCount(['topic', 'denied']);
        const wordCount = getCount(['word', 'profanity']);
        const summed = groundingCount + contentCount + piiCount + topicCount + wordCount;
        const otherCount = Math.max(0, (d.total_interventions ?? 0) - summed);

        setGuardrailsData({
          total: d.total_invocations ?? 0,
          total_interventions: d.total_interventions ?? 0,
          grounding_failures: groundingCount,
          content_filter: contentCount,
          pii_filter: piiCount,
          topic_filter: topicCount,
          word_filter: wordCount,
          other_interventions: otherCount,
          live: d.live ?? false,
          source: d.source ?? 'unknown',
          note: d.note,
          guardrails: d.guardrails ?? [],
          by_policy: byPolicy,
          window_days: d.window_days ?? 30,
        });
      })
      .catch(e => {
        setError(e?.message || 'Failed to load guardrail telemetry');
        setGuardrailsData(null);
      })
      .finally(() => setLoading(false));
  }, [pollKey]);

  const trendData = useMemo(() => generateTrendData(), []);

  // Summary stats
  const stats = useMemo(() => {
    const total = MOCK_INCIDENTS.length;
    const blocked = MOCK_INCIDENTS.filter(i => i.status === 'blocked').length;
    const flagged = MOCK_INCIDENTS.filter(i => i.status === 'flagged').length;
    const avgGrounding = MOCK_INCIDENTS.reduce((s, i) => s + i.groundingScore, 0) / total;
    return { total, blocked, flagged, avgGrounding };
  }, []);

  const toggleMethod = (id: string) => {
    setMethods(ms => ms.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
  };

  const toggleStrategy = (id: string) => {
    setStrategies(ss => ss.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const pieData = [
    { name: 'Blocked', value: stats.blocked },
    { name: 'Flagged', value: stats.flagged },
    { name: 'Escalated', value: MOCK_INCIDENTS.filter(i => i.status === 'escalated').length },
    { name: 'Resolved', value: MOCK_INCIDENTS.filter(i => i.status === 'resolved').length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Hallucination Detection & Mitigation</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time detection, configurable thresholds, and automated mitigation for ungrounded responses
          </p>
        </div>
        <div role="tablist" aria-label="Hallucination detection sections" className="flex gap-1 p-1 bg-slate-100/80 rounded-xl">
          {(['overview', 'incidents', 'config'] as const).map(tab => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`tabpanel-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab === 'overview' ? 'Overview' : tab === 'incidents' ? 'Incidents' : 'Configuration'}
            </button>
          ))}
        </div>
      </div>

      {/* Cross-links to related modules */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Related:</span>
        <Link to="/govern/models?tab=evaluations" className="text-blue-600 hover:text-blue-700 font-medium">RAG Evaluations →</Link>
        <Link to="/govern/safety/incidents" className="text-blue-600 hover:text-blue-700 font-medium">Incident Management →</Link>
        <Link to="/govern/risk" className="text-blue-600 hover:text-blue-700 font-medium">Risk Register →</Link>
        <Link to="/secure/guardrails" className="text-blue-600 hover:text-blue-700 font-medium">Guardrails Config →</Link>
      </div>

      {activeTab === 'overview' && (
        <div role="tabpanel" id="tabpanel-overview" aria-label="Overview">
          {/* Live Grounding Stats */}
          <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/50 via-white to-white p-4 shadow-sm mb-6">
            <LiveHeader
              live={guardrailsData?.live ?? false}
              label="Live · Bedrock Guardrails Telemetry"
              caption={guardrailsData?.source ? `source: ${guardrailsData.source}` : 'ApplyGuardrail CloudWatch metrics'}
              autoRefresh
            />
            {error && (
              <div className="mb-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                <Icon name="exclamation-triangle" className="w-4 h-4 inline mr-1.5" />
                {error}
              </div>
            )}
            {guardrailsData?.note && (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <Icon name="information-circle" className="w-4 h-4 inline mr-1.5" />
                {guardrailsData.note}
              </div>
            )}
            {loading && !guardrailsData && (
              <div className="h-24 flex items-center justify-center text-sm text-slate-400">
                <Icon name="arrow-path" className="w-4 h-4 mr-2 animate-spin" />
                Loading guardrails telemetry...
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
                <div className="flex items-center gap-1.5">
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">
                    {guardrailsData ? guardrailsData.total.toLocaleString() : '—'}
                  </div>
                  {guardrailsData?.live && <LiveDataBadge />}
                </div>
                <div className="text-xs text-slate-500">Total invocations</div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
                <div className="text-2xl font-bold text-amber-600 tabular-nums">
                  {guardrailsData ? guardrailsData.total_interventions.toLocaleString() : '—'}
                </div>
                <div className="text-xs text-slate-500">Total interventions</div>
              </div>
              <div className={`bg-white/80 backdrop-blur-sm rounded-xl border p-4 ${guardrailsData?.grounding_failures ? 'border-rose-200' : 'border-slate-200/60'}`}>
                <div className="text-2xl font-bold text-rose-600 tabular-nums">
                  {guardrailsData ? guardrailsData.grounding_failures.toLocaleString() : '—'}
                </div>
                <div className="text-xs text-slate-500">Grounding failures</div>
                {guardrailsData && guardrailsData.grounding_failures === 0 && guardrailsData.total_interventions > 0 && (
                  <div className="text-[9px] text-slate-400 mt-1">No grounding policy configured</div>
                )}
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
                <div className="text-2xl font-bold text-blue-600 tabular-nums">
                  {guardrailsData ? guardrailsData.content_filter.toLocaleString() : '—'}
                </div>
                <div className="text-xs text-slate-500">Content filter</div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4">
                <div className="text-2xl font-bold text-violet-600 tabular-nums">
                  {guardrailsData ? guardrailsData.pii_filter.toLocaleString() : '—'}
                </div>
                <div className="text-xs text-slate-500">PII/Sensitive</div>
              </div>
            </div>

            {/* Intervention rate summary */}
            {guardrailsData && guardrailsData.total > 0 && (
              <div className="mt-3 px-3 py-2 bg-slate-50 rounded-lg flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                <span className="text-slate-500">
                  Intervention rate: <span className={`font-semibold ${guardrailsData.total_interventions / guardrailsData.total > 0.1 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {((guardrailsData.total_interventions / guardrailsData.total) * 100).toFixed(1)}%
                  </span>
                </span>
                {guardrailsData.grounding_failures > 0 && (
                  <span className="text-slate-500">
                    Grounding failures: <span className="font-semibold text-rose-600">
                      {((guardrailsData.grounding_failures / guardrailsData.total) * 100).toFixed(2)}%
                    </span>
                  </span>
                )}
                {guardrailsData.topic_filter > 0 && (
                  <span className="text-slate-500">
                    Topic/Denied: <span className="font-semibold text-orange-600">{guardrailsData.topic_filter.toLocaleString()}</span>
                  </span>
                )}
                {guardrailsData.word_filter > 0 && (
                  <span className="text-slate-500">
                    Word filter: <span className="font-semibold text-slate-600">{guardrailsData.word_filter.toLocaleString()}</span>
                  </span>
                )}
                {guardrailsData.other_interventions > 0 && (
                  <span className="text-slate-500">
                    Other: <span className="font-semibold text-slate-600">{guardrailsData.other_interventions.toLocaleString()}</span>
                  </span>
                )}
                <span className="text-slate-400 ml-auto">Window: {guardrailsData.window_days}d</span>
              </div>
            )}

            {/* Per-policy breakdown table */}
            {guardrailsData && guardrailsData.by_policy && guardrailsData.by_policy.length > 0 && (
              <div className="mt-4 bg-white/80 rounded-xl border border-slate-200/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-semibold text-slate-700">Interventions by Policy Type</div>
                  <span className="text-[10px] text-slate-400">includes direct ApplyGuardrail API calls</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {guardrailsData.by_policy.map((p, i) => (
                    <div key={i} className={`p-3 rounded-lg border ${p.interventions > 0 ? 'bg-rose-50/50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className={`text-lg font-bold tabular-nums ${p.interventions > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {p.interventions.toLocaleString()}
                      </div>
                      <div className="text-[11px] font-medium text-slate-700">{p.label}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5 truncate" title={p.dimension}>{p.dimension}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-guardrail breakdown */}
            {guardrailsData && guardrailsData.guardrails && guardrailsData.guardrails.length > 0 && (
              <div className="mt-4 bg-white/80 rounded-xl border border-slate-200/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-semibold text-slate-700">Interventions by Guardrail</div>
                  <span className="text-[10px] text-slate-400">{guardrailsData.guardrails.length} guardrail(s) configured</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-slate-400 uppercase tracking-wide">
                        <th scope="col" className="text-left py-2 font-medium">Guardrail</th>
                        <th scope="col" className="text-right py-2 font-medium">Invocations</th>
                        <th scope="col" className="text-right py-2 font-medium">Interventions</th>
                        <th scope="col" className="text-right py-2 font-medium">Rate</th>
                        <th scope="col" className="text-left py-2 pl-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guardrailsData.guardrails.slice(0, 10).map((g, i) => (
                        <tr key={g.guardrail_id} className={i > 0 ? 'border-t border-slate-100' : ''}>
                          <td className="py-2">
                            <div className="font-medium text-slate-800">{g.name}</div>
                            <div className="text-[10px] text-slate-400">{g.guardrail_id} · v{g.version}</div>
                          </td>
                          <td className="py-2 text-right tabular-nums text-slate-600">{g.invocations.toLocaleString()}</td>
                          <td className={`py-2 text-right tabular-nums font-semibold ${g.interventions > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                            {g.interventions.toLocaleString()}
                          </td>
                          <td className={`py-2 text-right tabular-nums ${g.intervention_rate_pct > 5 ? 'text-rose-600' : g.intervention_rate_pct > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {g.intervention_rate_pct.toFixed(1)}%
                          </td>
                          <td className="py-2 pl-3">
                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                              g.status === 'READY' ? 'bg-emerald-100 text-emerald-700' :
                              g.status === 'CREATING' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {g.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {guardrailsData.guardrails.length > 10 && (
                    <div className="text-[10px] text-slate-400 mt-2">+{guardrailsData.guardrails.length - 10} more guardrails</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Illustrative Incidents Section */}
          <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="information-circle" className="w-5 h-5 text-amber-600" />
              <span className="text-sm font-semibold text-amber-900">Illustrative Examples</span>
              <span className="text-xs text-amber-600">(Demo data — real blocked responses require CloudWatch Logs integration)</span>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200/60 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="exclamation-triangle" className="w-5 h-5 text-amber-500" />
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Detected (24h)</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
                <div className="text-xs text-slate-400 mt-1">demo incidents</div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200/60 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="x-circle" className="w-5 h-5 text-rose-500" />
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Blocked</span>
                </div>
                <div className="text-2xl font-bold text-rose-600">{stats.blocked}</div>
                <div className="text-xs text-slate-400 mt-1">responses prevented</div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200/60 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="flag" className="w-5 h-5 text-amber-500" />
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Flagged</span>
                </div>
                <div className="text-2xl font-bold text-amber-600">{stats.flagged}</div>
                <div className="text-xs text-slate-400 mt-1">pending review</div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200/60 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="check-circle" className="w-5 h-5 text-emerald-500" />
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Avg Grounding</span>
                </div>
                <div className={`text-2xl font-bold ${stats.avgGrounding >= 0.75 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {(stats.avgGrounding * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-slate-400 mt-1">across demo incidents</div>
              </div>
            </div>
          </div>

          {/* Recent Blocked/Flagged Responses - Critical Detail (Illustrative) */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-rose-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon name="x-circle" className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-semibold text-slate-900">Recent Blocked & Flagged Responses</h3>
              </div>
              <button
                onClick={() => setActiveTab('incidents')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                View all incidents →
              </button>
            </div>
            <div className="space-y-4">
              {MOCK_INCIDENTS.filter(i => i.status === 'blocked' || i.status === 'flagged').slice(0, 3).map(incident => (
                <div key={incident.id} className={`p-4 rounded-lg border ${incident.status === 'blocked' ? 'bg-rose-50/50 border-rose-200' : 'bg-amber-50/50 border-amber-200'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${STATUS_STYLES[incident.status]}`}>
                        {incident.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-500">{incident.timestamp}</span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs font-medium text-slate-700">{incident.model}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-500">Grounding: <span className={`font-semibold ${incident.groundingScore >= 0.75 ? 'text-emerald-600' : incident.groundingScore >= 0.5 ? 'text-amber-600' : 'text-rose-600'}`}>{(incident.groundingScore * 100).toFixed(0)}%</span></span>
                      <span className="text-slate-500">Faithfulness: <span className={`font-semibold ${incident.faithfulnessScore >= 0.85 ? 'text-emerald-600' : incident.faithfulnessScore >= 0.5 ? 'text-amber-600' : 'text-rose-600'}`}>{(incident.faithfulnessScore * 100).toFixed(0)}%</span></span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">User Query</div>
                      <p className="text-sm text-slate-700 bg-white/80 p-2 rounded border border-slate-200">{incident.query}</p>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Blocked Response</div>
                      <p className="text-sm text-slate-700 bg-white/80 p-2 rounded border border-rose-200 line-clamp-2">{incident.response}</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-200/60 pt-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Unverified Claims Detected</div>
                    <div className="flex flex-wrap gap-2">
                      {incident.claims.filter(c => !c.verified).map((claim, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-rose-100 rounded text-xs text-rose-700">
                          <Icon name="x-circle" className="w-3 h-3" />
                          <span>{claim.text}</span>
                        </div>
                      ))}
                      {incident.claims.filter(c => c.verified).length > 0 && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-100 rounded text-xs text-emerald-700">
                          <Icon name="check-circle" className="w-3 h-3" />
                          <span>{incident.claims.filter(c => c.verified).length} verified claim(s)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-200/60 text-[10px] text-slate-500">
                    <span>Detection: <span className="font-medium text-slate-600">{DETECTION_METHODS.find(m => m.id === incident.detectionMethod)?.name ?? incident.detectionMethod}</span></span>
                    <span>Mitigation: <span className="font-medium text-slate-600">{MITIGATION_STRATEGIES.find(s => s.id === incident.mitigation)?.name ?? incident.mitigation}</span></span>
                    <span>ID: <span className="font-mono text-slate-600">{incident.id}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Trend Chart */}
            <div className="col-span-2 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">24-Hour Detection Trend</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 10 }} interval={3} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="detected" name="Detected" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="blocked" name="Blocked" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="flagged" name="Flagged" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Outcome Distribution */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Mitigation Outcomes</h3>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detection Methods */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Detection Methods</h3>
              <span className="text-[10px] text-slate-400">Combine token pre-filter → automated reasoning → LLM fallback for best cost/accuracy</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {methods.map(method => (
                <div
                  key={method.id}
                  className={`p-4 rounded-lg border transition-all ${
                    method.enabled
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-slate-200 bg-slate-50/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon name={method.icon} className={`w-5 h-5 ${method.enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span className="text-sm font-semibold text-slate-900">{method.name}</span>
                    </div>
                    <button
                      role="switch"
                      aria-checked={method.enabled}
                      aria-label={`Toggle ${method.name}`}
                      onClick={() => toggleMethod(method.id)}
                      className={`w-10 h-5 rounded-full transition-colors ${
                        method.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        method.enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">{method.desc}</p>
                  <div className="flex items-center gap-4 text-[10px]">
                    <span className="text-slate-400">Accuracy: <span className="font-semibold text-slate-600">{method.accuracy}%</span></span>
                    <span className="text-slate-400">Latency: <span className="font-semibold text-slate-600">{method.latencyMs}ms</span></span>
                    {method.awsService && (
                      <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[9px]">
                        {method.awsService}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'incidents' && (
        <div role="tabpanel" id="tabpanel-incidents" aria-label="Incidents" className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Recent Hallucination Incidents</h3>
            <p className="text-xs text-slate-500 mt-0.5">Click an incident for claim-level analysis</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                <th scope="col" className="text-left py-2.5 px-5 font-medium">Time</th>
                <th scope="col" className="text-left py-2.5 px-3 font-medium">Model</th>
                <th scope="col" className="text-left py-2.5 px-3 font-medium">Query</th>
                <th scope="col" className="text-center py-2.5 px-3 font-medium">Grounding</th>
                <th scope="col" className="text-center py-2.5 px-3 font-medium">Detection</th>
                <th scope="col" className="text-center py-2.5 px-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_INCIDENTS.map(incident => (
                <tr
                  key={incident.id}
                  {...rowButtonProps(
                    () => setSelectedIncident(selectedIncident?.id === incident.id ? null : incident),
                    `${selectedIncident?.id === incident.id ? 'Hide' : 'View'} details for incident ${incident.id}`
                  )}
                  className={`border-t border-slate-100 hover:bg-slate-50/60 cursor-pointer transition-colors focus:outline-none focus:bg-blue-50/50 ${
                    selectedIncident?.id === incident.id ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <td className="py-2.5 px-5 text-slate-500 text-xs">{incident.timestamp}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-900">{incident.model}</td>
                  <td className="py-2.5 px-3 text-slate-600 max-w-[300px] truncate" title={incident.query}>
                    {incident.query}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`font-semibold tabular-nums ${
                      incident.groundingScore >= 0.75 ? 'text-emerald-600' :
                      incident.groundingScore >= 0.5 ? 'text-amber-600' : 'text-rose-600'
                    }`}>
                      {(incident.groundingScore * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center text-xs text-slate-500">
                    {DETECTION_METHODS.find(m => m.id === incident.detectionMethod)?.name ?? incident.detectionMethod}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${STATUS_STYLES[incident.status]}`}>
                      {incident.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Expanded Incident Detail */}
          {selectedIncident && (
            <div className="border-t border-slate-200 p-5 bg-slate-50/50">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-slate-900">Incident Detail: {selectedIncident.id}</h4>
                <button onClick={() => setSelectedIncident(null)} className="text-slate-400 hover:text-slate-600">
                  <Icon name="x-mark" className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Query</div>
                  <p className="text-sm text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
                    {selectedIncident.query}
                  </p>
                  <div className="text-xs text-slate-500 uppercase tracking-wide mt-4 mb-2">Response (Hallucinated)</div>
                  <p className="text-sm text-slate-700 bg-rose-50 p-3 rounded-lg border border-rose-200">
                    {selectedIncident.response}
                  </p>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Claim-Level Analysis</div>
                  <div className="space-y-2">
                    {selectedIncident.claims.map((claim, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-lg border ${
                          claim.verified
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-rose-50 border-rose-200'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon
                            name={claim.verified ? 'check-circle' : 'x-circle'}
                            className={`w-4 h-4 mt-0.5 ${claim.verified ? 'text-emerald-600' : 'text-rose-600'}`}
                          />
                          <div>
                            <p className="text-sm text-slate-700">{claim.text}</p>
                            {claim.source ? (
                              <p className="text-[10px] text-slate-500 mt-1">Source: {claim.source}</p>
                            ) : (
                              <p className="text-[10px] text-rose-600 mt-1">No supporting source found</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-500 uppercase">Grounding Score</div>
                      <div className={`text-xl font-bold ${
                        selectedIncident.groundingScore >= 0.75 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {(selectedIncident.groundingScore * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="p-3 bg-white rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-500 uppercase">Faithfulness Score</div>
                      <div className={`text-xl font-bold ${
                        selectedIncident.faithfulnessScore >= 0.85 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {(selectedIncident.faithfulnessScore * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'config' && (
        <div role="tabpanel" id="tabpanel-config" aria-label="Configuration" className="space-y-6">
          {/* Thresholds */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Detection Thresholds</h3>
            <p className="text-xs text-slate-500 mb-4">
              Responses below these thresholds trigger mitigation actions
            </p>
            <div className="grid grid-cols-2 gap-6">
              {Object.entries(thresholds).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-xs text-slate-600 mb-2">
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={value * 100}
                      onChange={e => setThresholds(t => ({ ...t, [key]: parseInt(e.target.value) / 100 }))}
                      className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="w-12 text-sm font-semibold text-slate-700 tabular-nums">
                      {(value * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mitigation Strategies */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Mitigation Strategies</h3>
            <div className="space-y-3">
              {strategies.map(strategy => (
                <div
                  key={strategy.id}
                  className={`p-4 rounded-lg border transition-all ${
                    strategy.enabled
                      ? 'border-slate-200 bg-white'
                      : 'border-slate-100 bg-slate-50/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon name={strategy.icon} className={`w-5 h-5 ${strategy.enabled ? 'text-slate-700' : 'text-slate-400'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{strategy.name}</span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[strategy.severity]}`}>
                            {strategy.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{strategy.desc}</p>
                        <p className="text-[10px] text-slate-400 mt-1">Action: {strategy.action}</p>
                      </div>
                    </div>
                    <button
                      role="switch"
                      aria-checked={strategy.enabled}
                      aria-label={`Toggle ${strategy.name}`}
                      onClick={() => toggleStrategy(strategy.id)}
                      className={`w-10 h-5 rounded-full transition-colors ${
                        strategy.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        strategy.enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Integration Info */}
          <div className="bg-blue-50/50 rounded-xl border border-blue-200 p-5">
            <div className="flex items-start gap-3">
              <Icon name="information-circle" className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-blue-900">AWS Bedrock Hallucination Detection</h4>
                <p className="text-xs text-blue-700 mt-1">
                  <strong>Automated Reasoning checks</strong> (GA Aug 2025) provide up to 99% verification accuracy using
                  mathematical/formal logic (SMT-LIB) — provable assurance, not probabilistic. Configure via Bedrock Guardrails
                  with policy documents up to 100 pages. Combine with <code className="bg-blue-100 px-1 rounded">contextualGrounding</code> for
                  real-time RAG grounding checks. For cost-effective pre-filtering, use token similarity before LLM-based detection.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <a
                    href="https://aws.amazon.com/blogs/aws/minimize-ai-hallucinations-and-deliver-up-to-99-verification-accuracy-with-automated-reasoning-checks-now-available/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Automated Reasoning →
                  </a>
                  <a
                    href="https://aws.amazon.com/blogs/machine-learning/detect-hallucinations-for-rag-based-systems/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    RAG Detection Patterns →
                  </a>
                  <a
                    href="https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-contextual-grounding.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Grounding Docs →
                  </a>
                  <a
                    href="https://docs.aws.amazon.com/bedrock/latest/userguide/evaluation-kb.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    RAG Evaluation Docs →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
