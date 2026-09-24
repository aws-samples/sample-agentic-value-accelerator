/**
 * LlmMonitoringPatterns — Comprehensive guide to monitoring LLM outputs with CloudWatch
 *
 * Educational component that explains:
 * - Why traditional Model Monitor doesn't work for LLMs
 * - LLM-specific quality dimensions with CloudWatch metric names
 * - Implementation patterns (Guardrail-based, Lambda post-processor, Sampling, Anomaly)
 * - CloudWatch Dashboard template
 * - Alert runbook for each alarm type
 *
 * Embedded within ModelManagement.tsx under Operations > Patterns sub-tab.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-evaluation.html
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './icons';
import { LiveDataBadge } from './DataSourceIndicator';
import {
  governLlmQualityApi,
  type LlmMonitoringStatus,
  type LlmQualitySnapshot,
} from '../../api/client';

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────────────────────

type TabId = 'why' | 'dimensions' | 'patterns' | 'dashboard' | 'runbook';

interface TabDef {
  id: TabId;
  label: string;
  icon: IconName;
}

const TABS: TabDef[] = [
  { id: 'why', label: 'Why Not Model Monitor', icon: 'exclamation-triangle' },
  { id: 'dimensions', label: 'Quality Dimensions', icon: 'chart-bar' },
  { id: 'patterns', label: 'Implementation', icon: 'wrench-screwdriver' },
  { id: 'dashboard', label: 'Dashboard', icon: 'chart-line' },
  { id: 'runbook', label: 'Runbook', icon: 'clipboard-list' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Quality Dimension definitions
// ─────────────────────────────────────────────────────────────────────────────

interface QualityDimension {
  id: string;
  name: string;
  metricName: string;
  unit: string;
  source: string;
  thresholdExample: string;
  thresholdDirection: 'above' | 'below';
  description: string;
  icon: IconName;
}

const QUALITY_DIMENSIONS: QualityDimension[] = [
  {
    id: 'groundedness',
    name: 'Groundedness',
    metricName: 'llm/groundedness_score',
    unit: 'Percent',
    source: 'Bedrock Guardrails contextual grounding',
    thresholdExample: '>85%',
    thresholdDirection: 'above',
    description: 'How well responses are supported by provided context/documents',
    icon: 'map-pin',
  },
  {
    id: 'relevance',
    name: 'Relevance',
    metricName: 'llm/relevance_score',
    unit: 'Percent',
    source: 'LLM-as-judge or embedding similarity',
    thresholdExample: '>80%',
    thresholdDirection: 'above',
    description: 'How well the response addresses the user query',
    icon: 'viewfinder-circle',
  },
  {
    id: 'coherence',
    name: 'Coherence',
    metricName: 'llm/coherence_score',
    unit: 'Percent',
    source: 'LLM-as-judge',
    thresholdExample: '>90%',
    thresholdDirection: 'above',
    description: 'Logical structure and readability of responses',
    icon: 'document-text',
  },
  {
    id: 'harmfulness',
    name: 'Harmful Content Rate',
    metricName: 'llm/harmful_content_rate',
    unit: 'Count',
    source: 'Guardrail interventions',
    thresholdExample: '<1%',
    thresholdDirection: 'below',
    description: 'Rate of responses blocked for harmful content',
    icon: 'shield-exclamation',
  },
  {
    id: 'refusal',
    name: 'Refusal Rate',
    metricName: 'llm/refusal_rate',
    unit: 'Percent',
    source: 'Response classification',
    thresholdExample: '<5%',
    thresholdDirection: 'below',
    description: 'Too high indicates over-restrictive guardrails',
    icon: 'x-circle',
  },
  {
    id: 'latency',
    name: 'Latency P99',
    metricName: 'llm/latency_p99',
    unit: 'Milliseconds',
    source: 'Bedrock invocation logs',
    thresholdExample: '<5000ms',
    thresholdDirection: 'below',
    description: '99th percentile response time',
    icon: 'bolt',
  },
  {
    id: 'tokens',
    name: 'Token Efficiency',
    metricName: 'llm/tokens_per_response',
    unit: 'Count',
    source: 'Bedrock usage metrics',
    thresholdExample: 'varies',
    thresholdDirection: 'below',
    description: 'Average tokens per response (cost efficiency)',
    icon: 'currency-dollar',
  },
  {
    id: 'citation',
    name: 'Citation Accuracy',
    metricName: 'llm/citation_accuracy',
    unit: 'Percent',
    source: 'RAG evaluation',
    thresholdExample: '>95%',
    thresholdDirection: 'above',
    description: 'Accuracy of source citations in RAG responses',
    icon: 'document-check',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Code snippets
// ─────────────────────────────────────────────────────────────────────────────

const CODE_GUARDRAIL_METRICS = `# CloudWatch Metrics from Bedrock Guardrails are automatic
# Just enable guardrails and metrics appear:
# - aws/bedrock/guardrails/Invocations
# - aws/bedrock/guardrails/InterventionCount
# - aws/bedrock/guardrails/GroundingScore (if contextual grounding enabled)

# No code required — configure via Bedrock console or IaC`;

const CODE_LAMBDA_PROCESSOR = `import boto3
from datetime import datetime

cloudwatch = boto3.client('cloudwatch')

def publish_llm_metrics(response_id: str, metrics: dict):
    """Publish custom LLM quality metrics to CloudWatch."""
    cloudwatch.put_metric_data(
        Namespace='AVA/LLMQuality',
        MetricData=[
            {
                'MetricName': 'groundedness_score',
                'Value': metrics['groundedness'],
                'Unit': 'Percent',
                'Dimensions': [
                    {'Name': 'ModelId', 'Value': metrics['model_id']},
                    {'Name': 'UseCase', 'Value': metrics['use_case']},
                ],
                'Timestamp': datetime.utcnow(),
            },
            {
                'MetricName': 'relevance_score',
                'Value': metrics['relevance'],
                'Unit': 'Percent',
                'Dimensions': [
                    {'Name': 'ModelId', 'Value': metrics['model_id']},
                    {'Name': 'UseCase', 'Value': metrics['use_case']},
                ],
            },
            {
                'MetricName': 'coherence_score',
                'Value': metrics['coherence'],
                'Unit': 'Percent',
                'Dimensions': [
                    {'Name': 'ModelId', 'Value': metrics['model_id']},
                    {'Name': 'UseCase', 'Value': metrics['use_case']},
                ],
            },
        ]
    )`;

const CODE_SAMPLING_EVAL = `import random
import boto3
import json

bedrock = boto3.client('bedrock-runtime')

def should_evaluate(sample_rate: float = 0.02) -> bool:
    """Sample 1-5% of responses for evaluation (cost-efficient)."""
    return random.random() < sample_rate

def evaluate_response(prompt: str, response: str, context: str) -> dict | None:
    """Run LLM-as-judge evaluation on sampled responses."""
    if not should_evaluate():
        return None

    judge_prompt = f"""Rate this response on a scale of 0-100 for each dimension:

1. Groundedness: Is it supported by the context provided?
2. Relevance: Does it directly answer the question?
3. Coherence: Is it well-structured and logical?

Context: {context[:2000]}
Question: {prompt}
Response: {response}

Output JSON only: {{"groundedness": X, "relevance": Y, "coherence": Z}}"""

    # Call Claude for evaluation
    result = bedrock.invoke_model(
        modelId='anthropic.claude-3-haiku-20240307-v1:0',
        body=json.dumps({
            'anthropic_version': 'bedrock-2023-05-31',
            'max_tokens': 100,
            'messages': [{'role': 'user', 'content': judge_prompt}]
        })
    )

    scores = json.loads(json.loads(result['body'].read())['content'][0]['text'])

    # Publish to CloudWatch
    publish_llm_metrics(response_id, {
        'model_id': 'your-model-id',
        'use_case': 'your-use-case',
        **scores
    })

    return scores`;

const CODE_ANOMALY_ALARM = `# CloudFormation template for anomaly detection on LLM metrics
AWSTemplateFormatVersion: '2010-09-09'
Description: LLM Quality Monitoring Alarms

Resources:
  LlmGroundednessAnomaly:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: llm-groundedness-anomaly
      AlarmDescription: Detects unusual drops in groundedness scores
      ComparisonOperator: LessThanLowerThreshold
      EvaluationPeriods: 3
      Metrics:
        - Id: m1
          MetricStat:
            Metric:
              MetricName: groundedness_score
              Namespace: AVA/LLMQuality
            Period: 300
            Stat: Average
        - Id: ad1
          Expression: ANOMALY_DETECTION_BAND(m1, 2)
      ThresholdMetricId: ad1
      TreatMissingData: notBreaching
      ActionsEnabled: true
      AlarmActions:
        - !Ref AlertSnsTopic

  LlmRefusalRateAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: llm-refusal-rate-high
      AlarmDescription: Alert when refusal rate exceeds 5%
      MetricName: refusal_rate
      Namespace: AVA/LLMQuality
      Statistic: Average
      Period: 300
      EvaluationPeriods: 2
      Threshold: 5
      ComparisonOperator: GreaterThanThreshold
      ActionsEnabled: true
      AlarmActions:
        - !Ref AlertSnsTopic

  LlmLatencyP99Alarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: llm-latency-p99-high
      AlarmDescription: Alert when P99 latency exceeds 5 seconds
      MetricName: latency_p99
      Namespace: AVA/LLMQuality
      ExtendedStatistic: p99
      Period: 300
      EvaluationPeriods: 3
      Threshold: 5000
      ComparisonOperator: GreaterThanThreshold`;

const DASHBOARD_JSON = `{
  "widgets": [
    {
      "type": "metric",
      "x": 0, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "Groundedness Score Trend",
        "region": "\${AWS::Region}",
        "metrics": [
          ["AVA/LLMQuality", "groundedness_score", {"stat": "Average", "period": 300}]
        ],
        "view": "timeSeries",
        "annotations": {
          "horizontal": [{"value": 85, "label": "Target", "color": "#2ca02c"}]
        }
      }
    },
    {
      "type": "metric",
      "x": 12, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "Guardrail Interventions by Type",
        "region": "\${AWS::Region}",
        "metrics": [
          ["AWS/Bedrock", "GuardrailInterventionCount", "GuardrailId", "*", "PolicyType", "CONTENT_FILTER"],
          ["...", "PolicyType", "DENIED_TOPICS"],
          ["...", "PolicyType", "SENSITIVE_INFORMATION"],
          ["...", "PolicyType", "CONTEXTUAL_GROUNDING"]
        ],
        "view": "bar",
        "stacked": true
      }
    },
    {
      "type": "metric",
      "x": 0, "y": 6, "width": 8, "height": 6,
      "properties": {
        "title": "Latency Percentiles",
        "region": "\${AWS::Region}",
        "metrics": [
          ["AVA/LLMQuality", "latency_p99", {"stat": "p50", "label": "P50"}],
          ["...", {"stat": "p90", "label": "P90"}],
          ["...", {"stat": "p99", "label": "P99"}]
        ],
        "view": "timeSeries"
      }
    },
    {
      "type": "metric",
      "x": 8, "y": 6, "width": 8, "height": 6,
      "properties": {
        "title": "Token Usage by Model",
        "region": "\${AWS::Region}",
        "metrics": [
          ["AWS/Bedrock", "InputTokenCount", "ModelId", "*"],
          [".", "OutputTokenCount", ".", "."]
        ],
        "view": "pie"
      }
    },
    {
      "type": "metric",
      "x": 16, "y": 6, "width": 8, "height": 6,
      "properties": {
        "title": "Quality Scores with Anomaly Bands",
        "region": "\${AWS::Region}",
        "metrics": [
          ["AVA/LLMQuality", "groundedness_score", {"id": "m1"}],
          [{"expression": "ANOMALY_DETECTION_BAND(m1, 2)", "label": "Expected Range", "id": "ad1"}]
        ],
        "view": "timeSeries"
      }
    }
  ]
}`;

// ─────────────────────────────────────────────────────────────────────────────
// Runbook entries
// ─────────────────────────────────────────────────────────────────────────────

interface RunbookEntry {
  alarm: string;
  icon: IconName;
  severity: 'critical' | 'high' | 'medium' | 'low';
  symptoms: string[];
  causes: string[];
  actions: string[];
}

const RUNBOOK_ENTRIES: RunbookEntry[] = [
  {
    alarm: 'Low Groundedness Score',
    icon: 'map-pin',
    severity: 'high',
    symptoms: [
      'Responses contain factually incorrect statements',
      'Citations do not match source documents',
      'User complaints about hallucinated information',
    ],
    causes: [
      'RAG retrieval returning irrelevant documents',
      'Context window too small (relevant docs truncated)',
      'Model temperature too high',
      'Knowledge base not updated with latest data',
    ],
    actions: [
      'Check RAG retrieval logs for relevance scores',
      'Increase context window or implement better chunking',
      'Lower temperature (0.0-0.3 for factual tasks)',
      'Verify knowledge base sync status',
      'Enable Bedrock Guardrails contextual grounding',
    ],
  },
  {
    alarm: 'High Refusal Rate',
    icon: 'x-circle',
    severity: 'medium',
    symptoms: [
      'Users report "I cannot help with that" responses',
      'Legitimate queries being blocked',
      'Drop in successful task completion rate',
    ],
    causes: [
      'Guardrail content filters too aggressive',
      'Denied topics list too broad',
      'Prompt injection guard false positives',
      'Model safety training over-generalized',
    ],
    actions: [
      'Review guardrail intervention logs for patterns',
      'Adjust content filter thresholds (HIGH to MEDIUM)',
      'Refine denied topics to be more specific',
      'Add approved topic patterns to allowlist',
      'Test with sample prompts that were blocked',
    ],
  },
  {
    alarm: 'Latency P99 Spike',
    icon: 'bolt',
    severity: 'high',
    symptoms: [
      'User-facing timeout errors',
      'Increased queue depth',
      'SLA breaches',
    ],
    causes: [
      'Model capacity constraints (Bedrock provisioned throughput)',
      'Complex prompts with large context windows',
      'Downstream service latency (RAG retrieval)',
      'Regional service degradation',
    ],
    actions: [
      'Check Bedrock service health dashboard',
      'Review prompt sizes (reduce context if needed)',
      'Implement request timeouts and retries',
      'Consider provisioned throughput for consistent latency',
      'Add latency-based routing to fallback model',
    ],
  },
  {
    alarm: 'Anomaly Detected',
    icon: 'exclamation-triangle',
    severity: 'medium',
    symptoms: [
      'Metric deviation from historical baseline',
      'Sudden shift in quality patterns',
      'Unexpected behavior changes',
    ],
    causes: [
      'Recent prompt template changes',
      'Model version update',
      'Shift in user query patterns',
      'Data quality issues in knowledge base',
    ],
    actions: [
      'Compare current prompts to baseline version',
      'Check for recent deployments or config changes',
      'Analyze query distribution for anomalies',
      'Review model version in use',
      'Run A/B comparison with previous configuration',
    ],
  },
  {
    alarm: 'High Harmful Content Rate',
    icon: 'shield-exclamation',
    severity: 'critical',
    symptoms: [
      'Guardrail intervention spike',
      'Content filter triggers increasing',
      'User reports of inappropriate responses',
    ],
    causes: [
      'Prompt injection attack in progress',
      'Jailbreak attempts being partially successful',
      'Training data contamination',
      'Model safety alignment drift',
    ],
    actions: [
      'Enable enhanced prompt attack detection',
      'Review blocked response samples for patterns',
      'Temporarily increase guardrail strictness',
      'Implement rate limiting on suspicious users',
      'Escalate to security team if attack confirmed',
    ],
  },
];

const SEVERITY_STYLES = {
  critical: 'bg-rose-100 text-rose-700 border-rose-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
};

// ─────────────────────────────────────────────────────────────────────────────
// Code Block component with copy functionality
// ─────────────────────────────────────────────────────────────────────────────

interface CodeBlockProps {
  code: string;
  language: string;
  title?: string;
}

function CodeBlock({ code, language, title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg overflow-hidden border border-slate-200">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-100 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500">{language}</span>
          {title && <span className="text-xs text-slate-400">- {title}</span>}
        </div>
        <button
          onClick={copyCode}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors"
        >
          {copied ? (
            <>
              <Icon name="check" className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-600">Copied</span>
            </>
          ) : (
            <>
              <Icon name="clipboard" className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Flow Diagram
// ─────────────────────────────────────────────────────────────────────────────

function DataFlowDiagram() {
  return (
    <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200 p-6">
      <h4 className="text-sm font-semibold text-slate-900 mb-4">LLM Monitoring Data Flow</h4>
      <div className="flex items-center justify-between gap-2">
        {[
          { label: 'Request', icon: 'chat-bubble' as IconName, color: 'bg-blue-100 border-blue-200 text-blue-700' },
          { label: 'Bedrock', icon: 'cpu-chip' as IconName, color: 'bg-indigo-100 border-indigo-200 text-indigo-700' },
          { label: 'Guardrails', icon: 'shield-check' as IconName, color: 'bg-emerald-100 border-emerald-200 text-emerald-700' },
          { label: 'CloudWatch', icon: 'chart-bar' as IconName, color: 'bg-orange-100 border-orange-200 text-orange-700' },
          { label: 'Alarm', icon: 'bell-alert' as IconName, color: 'bg-rose-100 border-rose-200 text-rose-700' },
          { label: 'Action', icon: 'wrench' as IconName, color: 'bg-violet-100 border-violet-200 text-violet-700' },
        ].map((step, i, arr) => (
          <div key={step.label} className="flex items-center gap-2">
            <div className={`flex flex-col items-center p-3 rounded-lg border ${step.color}`}>
              <Icon name={step.icon} className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">{step.label}</span>
            </div>
            {i < arr.length - 1 && (
              <Icon name="arrow-right" className="w-5 h-5 text-slate-400 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-6 gap-2 text-[10px] text-slate-500">
        <div className="text-center">User/Agent sends prompt</div>
        <div className="text-center">Model inference</div>
        <div className="text-center">Content + grounding checks</div>
        <div className="text-center">Metrics + logs</div>
        <div className="text-center">Threshold / anomaly</div>
        <div className="text-center">SNS / Lambda / ticket</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function LlmMonitoringPatterns() {
  const [activeTab, setActiveTab] = useState<TabId>('why');
  const [dashboardCopied, setDashboardCopied] = useState(false);

  // Live data state
  const [status, setStatus] = useState<LlmMonitoringStatus | null>(null);
  const [metrics, setMetrics] = useState<LlmQualitySnapshot | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);

  // Fetch live data on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      governLlmQualityApi.status(),
      governLlmQualityApi.metrics(5),
    ])
      .then(([s, m]) => {
        if (!cancelled) {
          setStatus(s);
          setMetrics(m);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStatusLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const copyDashboard = async () => {
    await navigator.clipboard.writeText(DASHBOARD_JSON);
    setDashboardCopied(true);
    setTimeout(() => setDashboardCopied(false), 2000);
  };

  const handleDeployDashboard = async () => {
    setDeploying(true);
    try {
      await governLlmQualityApi.deployDashboard();
      const refreshedStatus = await governLlmQualityApi.status();
      setStatus(refreshedStatus);
    } catch (err) {
      console.error('Failed to deploy dashboard:', err);
    } finally {
      setDeploying(false);
    }
  };

  // Helper to check if a metric value is within threshold
  const isWithinThreshold = (dim: QualityDimension, value: number): boolean => {
    if (dim.thresholdDirection === 'above') {
      const threshold = parseFloat(dim.thresholdExample.replace(/[^0-9.]/g, ''));
      return value >= threshold;
    } else {
      const threshold = parseFloat(dim.thresholdExample.replace(/[^0-9.]/g, ''));
      return value <= threshold;
    }
  };

  // Get current value for a dimension from metrics
  const getCurrentValue = (dimId: string): number | null => {
    if (!metrics?.metrics) return null;
    const metric = metrics.metrics.find(m => m.dimension === dimId);
    return metric?.value ?? null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">LLM Monitoring Patterns</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Practical guidance on monitoring Bedrock outputs using CloudWatch custom metrics
          </p>
        </div>
      </div>

      {/* Cross-links */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Related:</span>
        <Link to="/secure/guardrails" className="text-blue-600 hover:text-blue-700 font-medium">Guardrails Config</Link>
        <Link to="/govern/safety" className="text-blue-600 hover:text-blue-700 font-medium">AI Safety</Link>
      </div>

      {/* Live Monitoring Status Banner */}
      <div className={`rounded-xl border p-4 ${
        statusLoading ? 'bg-slate-50 border-slate-200' :
        status?.custom_metrics_active ? 'bg-emerald-50 border-emerald-300' :
        status?.guardrail_monitoring_active ? 'bg-amber-50 border-amber-300' :
        'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {statusLoading ? (
              <div className="w-3 h-3 rounded-full bg-slate-300 animate-pulse" />
            ) : status?.custom_metrics_active ? (
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
            ) : status?.guardrail_monitoring_active ? (
              <div className="w-3 h-3 rounded-full bg-amber-500" />
            ) : (
              <div className="w-3 h-3 rounded-full bg-slate-300" />
            )}
            <div>
              <span className="text-sm font-semibold">
                {statusLoading ? 'Checking monitoring status...' :
                 status?.custom_metrics_active ? 'Full LLM Quality Monitoring Active' :
                 status?.guardrail_monitoring_active ? 'Basic Guardrail Monitoring Active' :
                 'No LLM Monitoring Configured'}
              </span>
              {status && !statusLoading && (
                <div className="text-xs text-slate-500 mt-0.5">
                  {status.active_alarms.length} alarms configured
                  {status.alarms_in_alarm.length > 0 && (
                    <span className="text-rose-600 ml-2">
                      - {status.alarms_in_alarm.length} in ALARM
                    </span>
                  )}
                  {status.dashboard_deployed && (
                    <span className="text-emerald-600 ml-2">- Dashboard deployed</span>
                  )}
                  {status.live && <LiveDataBadge source="CloudWatch" />}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {!statusLoading && !status?.dashboard_deployed && (
            <button
              onClick={handleDeployDashboard}
              disabled={deploying}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {deploying ? 'Deploying...' : 'Deploy Dashboard'}
            </button>
          )}
        </div>

        {/* Backend honest-degrade caveat. The counts above are only totals when the whole
            status was measured: DescribeAlarms caps at 100 records, and a failed
            DescribeAlarms or GetDashboard leaves a field unmeasured rather than zero. The
            note is where the backend says which, so dropping it turns a floor into a total.
            Same treatment as ModelMonitoring.tsx and HallucinationDetection.tsx. */}
        {!statusLoading && status?.note && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
            <Icon name="information-circle" className="w-4 h-4 mt-px shrink-0 text-amber-600" />
            <span>{status.note}</span>
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <div
        role="tablist"
        aria-label="LLM monitoring pattern sections"
        className="flex gap-1 p-1 bg-slate-100/80 rounded-xl overflow-x-auto"
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'why' && (
        <div role="tabpanel" id="panel-why" aria-label="Why Not Model Monitor" className="space-y-6">
          {/* Key insight callout */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-5">
            <div className="flex items-start gap-3">
              <Icon name="light-bulb" className="w-6 h-6 text-amber-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-amber-900">Key Insight</h3>
                <p className="text-sm text-amber-800 mt-1">
                  You cannot check "feature distribution" when every output is a novel sentence.
                  Traditional model monitoring assumes structured, tabular predictions — LLMs produce
                  unstructured, context-dependent, semantically-rich text.
                </p>
              </div>
            </div>
          </div>

          {/* Comparison table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">SageMaker Model Monitor vs. LLM Requirements</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                    <th scope="col" className="text-left py-2.5 px-4 font-medium">Model Monitor Concept</th>
                    <th scope="col" className="text-left py-2.5 px-4 font-medium">What It Checks</th>
                    <th scope="col" className="text-left py-2.5 px-4 font-medium">LLM Reality</th>
                    <th scope="col" className="text-center py-2.5 px-4 font-medium">Applies?</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      concept: 'Data Drift',
                      checks: 'Statistical distribution of input features over time',
                      reality: 'No fixed schema — prompts vary infinitely in structure and content',
                      applies: false,
                    },
                    {
                      concept: 'Feature Distribution',
                      checks: 'Min/max/mean/std of numeric columns',
                      reality: 'Text embeddings are high-dimensional; no meaningful statistics',
                      applies: false,
                    },
                    {
                      concept: 'Bias Drift',
                      checks: 'Protected attribute distribution in predictions',
                      reality: 'Bias manifests in semantic content, not feature columns',
                      applies: false,
                    },
                    {
                      concept: 'Model Quality',
                      checks: 'Accuracy, F1, RMSE against labeled test set',
                      reality: 'No single "correct" answer for most generative tasks',
                      applies: false,
                    },
                    {
                      concept: 'Data Quality',
                      checks: 'Missing values, type mismatches, outliers',
                      reality: 'Prompt quality is subjective; typos may be intentional',
                      applies: false,
                    },
                  ].map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-3 px-4 font-medium text-slate-900">{row.concept}</td>
                      <td className="py-3 px-4 text-slate-600">{row.checks}</td>
                      <td className="py-3 px-4 text-slate-600">{row.reality}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          row.applies ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {row.applies ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* What LLMs need instead */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">What LLMs Actually Need</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  title: 'Semantic Quality Evaluation',
                  desc: 'LLM-as-judge or human eval for groundedness, relevance, coherence',
                  icon: 'check-badge' as IconName,
                },
                {
                  title: 'Guardrail Intervention Monitoring',
                  desc: 'Track content filter, PII, topic block, and grounding failures',
                  icon: 'shield-check' as IconName,
                },
                {
                  title: 'Behavioral Anomaly Detection',
                  desc: 'Detect shifts in response patterns, not feature distributions',
                  icon: 'chart-line' as IconName,
                },
                {
                  title: 'Cost and Latency Tracking',
                  desc: 'Token usage, P50/P90/P99 latency, throughput per model',
                  icon: 'currency-dollar' as IconName,
                },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-4 bg-emerald-50/50 rounded-lg border border-emerald-200/60">
                  <Icon name={item.icon} className="w-5 h-5 text-emerald-600 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom line */}
          <div className="bg-blue-50/50 rounded-xl border border-blue-200 p-5">
            <div className="flex items-start gap-3">
              <Icon name="information-circle" className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-blue-900">Bottom Line</h4>
                <p className="text-xs text-blue-700 mt-1">
                  SageMaker Model Monitor is excellent for tabular ML models (fraud detection, credit scoring, churn prediction).
                  For LLMs, use <strong>Bedrock Guardrails</strong> for real-time content monitoring and
                  <strong> CloudWatch custom metrics</strong> for quality dimensions like groundedness and relevance.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'dimensions' && (
        <div role="tabpanel" id="panel-dimensions" aria-label="Quality Dimensions" className="space-y-6">
          {/* Metric cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {QUALITY_DIMENSIONS.map(dim => (
              <div
                key={dim.id}
                className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Icon name={dim.icon} className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{dim.name}</div>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide">CloudWatch Metric</div>
                    <code className="text-xs font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {dim.metricName}
                    </code>
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide">Unit</div>
                      <div className="text-xs text-slate-700">{dim.unit}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide">Target</div>
                      <div className={`text-xs font-semibold ${
                        dim.thresholdDirection === 'above' ? 'text-emerald-600' : 'text-amber-600'
                      }`}>
                        {dim.thresholdExample}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide">Source</div>
                    <div className="text-xs text-slate-600">{dim.source}</div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-3 pt-3 border-t border-slate-100">
                  {dim.description}
                </p>
                {/* Live value from CloudWatch */}
                {(() => {
                  const currentValue = getCurrentValue(dim.id);
                  if (currentValue === null) return null;
                  const withinThreshold = isWithinThreshold(dim, currentValue);
                  return (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          Current
                          {metrics?.live && <LiveDataBadge />}
                        </span>
                        <span className={`text-sm font-bold ${
                          withinThreshold ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {currentValue.toFixed(1)}{dim.unit === 'Percent' ? '%' : dim.unit === 'Milliseconds' ? 'ms' : ''}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          {/* Full table view */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Complete Metrics Reference</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50/50">
                    <th scope="col" className="text-left py-2.5 px-5 font-medium">Dimension</th>
                    <th scope="col" className="text-left py-2.5 px-3 font-medium">Metric Name</th>
                    <th scope="col" className="text-center py-2.5 px-3 font-medium">Unit</th>
                    <th scope="col" className="text-left py-2.5 px-3 font-medium">Source</th>
                    <th scope="col" className="text-center py-2.5 px-3 font-medium">Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {QUALITY_DIMENSIONS.map((dim, i) => (
                    <tr key={dim.id} className={i > 0 ? 'border-t border-slate-100' : ''}>
                      <td className="py-2.5 px-5">
                        <div className="flex items-center gap-2">
                          <Icon name={dim.icon} className="w-4 h-4 text-slate-400" />
                          <span className="font-medium text-slate-900">{dim.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <code className="text-xs font-mono text-indigo-600">{dim.metricName}</code>
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-600">{dim.unit}</td>
                      <td className="py-2.5 px-3 text-slate-600 text-xs">{dim.source}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-xs font-semibold ${
                          dim.thresholdDirection === 'above' ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          {dim.thresholdExample}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'patterns' && (
        <div role="tabpanel" id="panel-patterns" aria-label="Implementation Patterns" className="space-y-6">
          {/* Data flow diagram */}
          <DataFlowDiagram />

          {/* Pattern A: Guardrail-Based */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700">A</div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Guardrail-Based Monitoring (Zero-Code)</h3>
                <p className="text-xs text-slate-500">Automatic CloudWatch metrics from Bedrock Guardrails</p>
              </div>
              <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                Recommended Start
              </span>
            </div>
            <CodeBlock code={CODE_GUARDRAIL_METRICS} language="python" title="No code required" />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs font-semibold text-slate-700">Pros</div>
                <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                  <li>+ Zero code required</li>
                  <li>+ Real-time (sub-100ms)</li>
                  <li>+ Automatic intervention</li>
                </ul>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs font-semibold text-slate-700">Cons</div>
                <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                  <li>- Limited to guardrail metrics</li>
                  <li>- No custom dimensions</li>
                </ul>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs font-semibold text-slate-700">Best For</div>
                <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                  <li>Content safety monitoring</li>
                  <li>PII detection tracking</li>
                  <li>Grounding score alerts</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Pattern B: Lambda Post-Processor */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">B</div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Custom Metrics via Lambda Post-Processor</h3>
                <p className="text-xs text-slate-500">Publish custom quality metrics to CloudWatch</p>
              </div>
            </div>
            <CodeBlock code={CODE_LAMBDA_PROCESSOR} language="python" title="Lambda function" />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs font-semibold text-slate-700">Pros</div>
                <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                  <li>+ Full metric flexibility</li>
                  <li>+ Custom dimensions</li>
                  <li>+ Per-model tracking</li>
                </ul>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs font-semibold text-slate-700">Cons</div>
                <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                  <li>- Requires code/infra</li>
                  <li>- Adds latency (async OK)</li>
                </ul>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs font-semibold text-slate-700">Best For</div>
                <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                  <li>Custom quality scores</li>
                  <li>Business-specific metrics</li>
                  <li>Multi-dimension tracking</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Pattern C: Sampling-Based */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-sm font-bold text-violet-700">C</div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Sampling-Based Evaluation (Cost-Efficient)</h3>
                <p className="text-xs text-slate-500">Evaluate 1-5% of responses using LLM-as-judge</p>
              </div>
              <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded bg-violet-100 text-violet-700">
                Cost Optimized
              </span>
            </div>
            <CodeBlock code={CODE_SAMPLING_EVAL} language="python" title="Sampling evaluator" />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs font-semibold text-slate-700">Pros</div>
                <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                  <li>+ 95%+ cost savings</li>
                  <li>+ Statistically valid</li>
                  <li>+ Rich semantic eval</li>
                </ul>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs font-semibold text-slate-700">Cons</div>
                <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                  <li>- Not real-time</li>
                  <li>- May miss rare issues</li>
                </ul>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs font-semibold text-slate-700">Best For</div>
                <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                  <li>High-volume workloads</li>
                  <li>Quality trend tracking</li>
                  <li>Budget-conscious orgs</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Pattern D: Anomaly Detection */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-700">D</div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Anomaly Detection Alarms</h3>
                <p className="text-xs text-slate-500">CloudWatch ML-powered anomaly detection for quality metrics</p>
              </div>
            </div>
            <CodeBlock code={CODE_ANOMALY_ALARM} language="yaml" title="CloudFormation template" />
          </div>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div role="tabpanel" id="panel-dashboard" aria-label="Dashboard Template" className="space-y-6">
          {/* Preview description */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">CloudWatch Dashboard Template</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pre-built dashboard showing groundedness, interventions, latency, tokens, and anomaly bands
                </p>
              </div>
              <button
                onClick={copyDashboard}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  dashboardCopied
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {dashboardCopied ? (
                  <>
                    <Icon name="check" className="w-4 h-4" />
                    Copied to Clipboard
                  </>
                ) : (
                  <>
                    <Icon name="clipboard" className="w-4 h-4" />
                    Copy Dashboard JSON
                  </>
                )}
              </button>
            </div>

            {/* Dashboard preview mockup */}
            <div className="bg-slate-900 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Groundedness chart mockup */}
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 mb-2">Groundedness Score Trend</div>
                  <div className="h-24 flex items-end gap-1">
                    {[85, 87, 84, 88, 86, 89, 85, 87, 90, 88, 86, 84].map((v, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-emerald-500/80 rounded-t"
                        style={{ height: `${v - 70}%` }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[8px] text-slate-500 mt-1">
                    <span>12h ago</span>
                    <span>now</span>
                  </div>
                </div>
                {/* Intervention chart mockup */}
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 mb-2">Interventions by Type</div>
                  <div className="h-24 flex items-end gap-2 justify-center">
                    <div className="w-12 bg-rose-500/80 rounded-t" style={{ height: '60%' }}>
                      <div className="text-[8px] text-center text-white mt-1">Content</div>
                    </div>
                    <div className="w-12 bg-amber-500/80 rounded-t" style={{ height: '40%' }}>
                      <div className="text-[8px] text-center text-white mt-1">Topic</div>
                    </div>
                    <div className="w-12 bg-violet-500/80 rounded-t" style={{ height: '25%' }}>
                      <div className="text-[8px] text-center text-white mt-1">PII</div>
                    </div>
                    <div className="w-12 bg-blue-500/80 rounded-t" style={{ height: '15%' }}>
                      <div className="text-[8px] text-center text-white mt-1">Ground</div>
                    </div>
                  </div>
                </div>
                {/* Latency chart mockup */}
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 mb-2">Latency Percentiles</div>
                  <div className="h-16 relative">
                    <div className="absolute bottom-0 left-0 right-0 h-[30%] bg-emerald-500/30 rounded" />
                    <div className="absolute bottom-0 left-0 right-0 h-[50%] bg-amber-500/30 rounded" />
                    <div className="absolute bottom-0 left-0 right-0 h-[75%] bg-rose-500/30 rounded" />
                  </div>
                  <div className="flex justify-center gap-4 text-[8px] text-slate-400 mt-2">
                    <span><span className="text-emerald-400">P50</span> 1.2s</span>
                    <span><span className="text-amber-400">P90</span> 2.8s</span>
                    <span><span className="text-rose-400">P99</span> 4.1s</span>
                  </div>
                </div>
                {/* Token usage mockup */}
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 mb-2">Token Usage by Model</div>
                  <div className="h-16 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full border-8 border-indigo-500/60 relative">
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-300">
                        1.2M
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* JSON code block */}
          <CodeBlock code={DASHBOARD_JSON} language="json" title="CloudWatch Dashboard Source" />

          {/* Deploy Action Panel */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Deploy to CloudWatch</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {status?.dashboard_deployed
                    ? 'Dashboard is deployed and receiving metrics'
                    : 'Create this dashboard in your AWS account with one click'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {status?.dashboard_deployed ? (
                  <a
                    href={`https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=AVA-LLM-Quality`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                  >
                    <Icon name="arrow-top-right-on-square" className="w-4 h-4" />
                    Open in CloudWatch Console
                  </a>
                ) : (
                  <button
                    onClick={handleDeployDashboard}
                    disabled={deploying}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {deploying ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <Icon name="cloud-arrow-up" className="w-4 h-4" />
                        Deploy to CloudWatch
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            {status?.dashboard_deployed && (
              <div className="mt-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-emerald-700">Dashboard active - AVA-LLM-Quality</span>
                {status.live && <LiveDataBadge source="CloudWatch" />}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-blue-50/50 rounded-xl border border-blue-200 p-5">
            <div className="flex items-start gap-3">
              <Icon name="information-circle" className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-blue-900">Manual Deployment</h4>
                <p className="text-xs text-blue-600 mb-2">
                  If you prefer to deploy manually, follow these steps:
                </p>
                <ol className="text-xs text-blue-700 space-y-1.5 list-decimal list-inside">
                  <li>Copy the dashboard JSON above</li>
                  <li>Open CloudWatch Console - Dashboards - Create Dashboard</li>
                  <li>Choose "Source" view and paste the JSON</li>
                  <li>Replace <code className="bg-blue-100 px-1 rounded">${'${AWS::Region}'}</code> with your region</li>
                  <li>Adjust metric namespaces to match your configuration</li>
                  <li>Save the dashboard</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'runbook' && (
        <div role="tabpanel" id="panel-runbook" aria-label="Alert Runbook" className="space-y-6">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Alert Response Runbook</h3>
            <p className="text-xs text-slate-500">
              What to do when each alarm fires. Bookmark this page for on-call reference.
            </p>
          </div>

          {RUNBOOK_ENTRIES.map((entry, i) => (
            <div
              key={i}
              className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  entry.severity === 'critical' ? 'bg-rose-100' :
                  entry.severity === 'high' ? 'bg-orange-100' :
                  entry.severity === 'medium' ? 'bg-amber-100' : 'bg-blue-100'
                }`}>
                  <Icon name={entry.icon} className={`w-5 h-5 ${
                    entry.severity === 'critical' ? 'text-rose-600' :
                    entry.severity === 'high' ? 'text-orange-600' :
                    entry.severity === 'medium' ? 'text-amber-600' : 'text-blue-600'
                  }`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">{entry.alarm}</h4>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${SEVERITY_STYLES[entry.severity]}`}>
                      {entry.severity}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Symptoms */}
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Symptoms
                  </div>
                  <ul className="space-y-1.5">
                    {entry.symptoms.map((s, j) => (
                      <li key={j} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <Icon name="exclamation-circle" className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Causes */}
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Possible Causes
                  </div>
                  <ul className="space-y-1.5">
                    {entry.causes.map((c, j) => (
                      <li key={j} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <Icon name="magnifying-glass" className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Actions */}
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Response Actions
                  </div>
                  <ol className="space-y-1.5">
                    {entry.actions.map((a, j) => (
                      <li key={j} className="flex items-start gap-1.5 text-xs text-slate-700">
                        <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {j + 1}
                        </span>
                        {a}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          ))}

          {/* Escalation note */}
          <div className="bg-rose-50/50 rounded-xl border border-rose-200 p-5">
            <div className="flex items-start gap-3">
              <Icon name="bell-alert" className="w-5 h-5 text-rose-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-rose-900">Escalation Policy</h4>
                <p className="text-xs text-rose-700 mt-1">
                  <strong>Critical alarms:</strong> Page on-call immediately. Do not wait for multiple occurrences.
                  <br />
                  <strong>High alarms:</strong> Acknowledge within 15 minutes. Investigate within 1 hour.
                  <br />
                  <strong>Medium alarms:</strong> Investigate within business day. Track in incident ticket.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
