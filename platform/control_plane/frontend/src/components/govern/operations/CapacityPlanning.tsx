/**
 * CapacityPlanning - Capacity and quota management for operations.
 *
 * Comprehensive capacity planning with:
 *  - KPI row for quota health metrics
 *  - Quota dashboard by service with sparklines
 *  - Capacity forecasting with what-if scenarios
 *  - Limit increase request management
 *  - Auto-scaling policy configuration
 *  - Cost vs capacity trade-off visualization
 *  - Proactive capacity alerts
 */

import { useState, useMemo, useEffect } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import StatCard from '../StatCard';
import { Icon, type IconName } from '../icons';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import { type QuotaMetric, type CapacityAlert } from './useOpsLiveData';
import {
  governCapacityApi,
  type ServiceQuota,
  type CapacityAlert as ApiCapacityAlert,
  type QuotaIncreaseResponse,
} from '../../../api/client';

// -----------------------------------------------------------------------------
// Types (QuotaMetric and CapacityAlert moved to useOpsLiveData.ts)
// -----------------------------------------------------------------------------

interface LimitRequest {
  id: string;
  service: string;
  quota: string;
  currentLimit: number;
  requestedLimit: number;
  status: 'Submitted' | 'Under Review' | 'Approved' | 'Denied';
  submittedDate: string;
  justification: string;
  businessCase: string;
}

interface ScalingPolicy {
  id: string;
  name: string;
  service: string;
  minCapacity: number;
  maxCapacity: number;
  desiredCapacity: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  cooldownSec: number;
  enabled: boolean;
}

type ServiceFilter = 'all' | 'bedrock' | 'lambda' | 'apigw' | 'dynamodb' | 'sagemaker';
type Tab = 'dashboard' | 'forecast' | 'requests' | 'scaling' | 'cost' | 'alerts';

// -----------------------------------------------------------------------------
// Mock Data
// -----------------------------------------------------------------------------

const QUOTA_METRICS: QuotaMetric[] = [
  // Bedrock
  {
    id: 'bedrock-claude-rpm',
    service: 'bedrock',
    name: 'Claude 3.5 Sonnet Invocations/min',
    current: 847,
    limit: 1000,
    unit: 'req/min',
    trend: [720, 745, 780, 810, 825, 840, 847],
    growthRate: 3.2,
    adjustable: true,
  },
  {
    id: 'bedrock-claude-tpm',
    service: 'bedrock',
    name: 'Claude 3.5 Tokens/min',
    current: 142000,
    limit: 200000,
    unit: 'tokens/min',
    trend: [120000, 125000, 130000, 135000, 138000, 140000, 142000],
    growthRate: 2.8,
    adjustable: true,
  },
  {
    id: 'bedrock-titan-rpm',
    service: 'bedrock',
    name: 'Titan Embeddings Invocations/min',
    current: 4200,
    limit: 5000,
    unit: 'req/min',
    trend: [3800, 3900, 4000, 4050, 4100, 4150, 4200],
    growthRate: 1.8,
    adjustable: true,
  },
  // Lambda
  {
    id: 'lambda-concurrent',
    service: 'lambda',
    name: 'Concurrent Executions',
    current: 920,
    limit: 1000,
    unit: 'executions',
    trend: [850, 870, 890, 900, 910, 915, 920],
    growthRate: 1.5,
    adjustable: true,
  },
  {
    id: 'lambda-duration',
    service: 'lambda',
    name: 'Max Function Duration',
    current: 12,
    limit: 15,
    unit: 'minutes',
    trend: [10, 10, 11, 11, 12, 12, 12],
    growthRate: 0.8,
    adjustable: false,
  },
  // API Gateway
  {
    id: 'apigw-rps',
    service: 'apigw',
    name: 'Requests/sec',
    current: 8500,
    limit: 10000,
    unit: 'req/sec',
    trend: [7200, 7500, 7800, 8000, 8200, 8400, 8500],
    growthRate: 2.5,
    adjustable: true,
  },
  {
    id: 'apigw-throttle',
    service: 'apigw',
    name: 'Throttle Limit',
    current: 4500,
    limit: 5000,
    unit: 'req/sec',
    trend: [4000, 4100, 4200, 4300, 4400, 4450, 4500],
    growthRate: 1.9,
    adjustable: true,
  },
  // DynamoDB
  {
    id: 'ddb-rcu',
    service: 'dynamodb',
    name: 'Read Capacity Units',
    current: 42000,
    limit: 80000,
    unit: 'RCU',
    trend: [38000, 39000, 40000, 41000, 41500, 41800, 42000],
    growthRate: 1.2,
    adjustable: true,
  },
  {
    id: 'ddb-wcu',
    service: 'dynamodb',
    name: 'Write Capacity Units',
    current: 18000,
    limit: 40000,
    unit: 'WCU',
    trend: [15000, 15500, 16000, 16500, 17000, 17500, 18000],
    growthRate: 2.1,
    adjustable: true,
  },
  // SageMaker
  {
    id: 'sm-endpoints',
    service: 'sagemaker',
    name: 'Inference Endpoints',
    current: 18,
    limit: 20,
    unit: 'endpoints',
    trend: [14, 15, 16, 16, 17, 17, 18],
    growthRate: 4.2,
    adjustable: true,
  },
  {
    id: 'sm-ml-instances',
    service: 'sagemaker',
    name: 'ml.g5.xlarge Instances',
    current: 45,
    limit: 50,
    unit: 'instances',
    trend: [38, 40, 42, 43, 44, 44, 45],
    growthRate: 2.8,
    adjustable: true,
  },
];

const LIMIT_REQUESTS: LimitRequest[] = [
  {
    id: 'req-001',
    service: 'Lambda',
    quota: 'Concurrent Executions',
    currentLimit: 1000,
    requestedLimit: 2000,
    status: 'Under Review',
    submittedDate: '2026-08-08',
    justification: 'Peak traffic expected during product launch',
    businessCase: 'Q3 marketing campaign will drive 3x normal traffic. Need headroom for burst capacity.',
  },
  {
    id: 'req-002',
    service: 'Bedrock',
    quota: 'Claude 3.5 Sonnet RPM',
    currentLimit: 1000,
    requestedLimit: 2000,
    status: 'Submitted',
    submittedDate: '2026-08-10',
    justification: 'Growing agent fleet requires higher throughput',
    businessCase: 'Agent usage has grown 45% MoM. Current limit will be reached in 3 weeks at current growth.',
  },
  {
    id: 'req-003',
    service: 'API Gateway',
    quota: 'Requests/sec',
    currentLimit: 10000,
    requestedLimit: 15000,
    status: 'Approved',
    submittedDate: '2026-08-01',
    justification: 'Traffic spikes causing 429 errors',
    businessCase: 'Customer-facing API experiencing peak hour throttling. Lost transactions estimated at $12K/day.',
  },
  {
    id: 'req-004',
    service: 'SageMaker',
    quota: 'ml.g5.xlarge Instances',
    currentLimit: 50,
    requestedLimit: 75,
    status: 'Denied',
    submittedDate: '2026-07-25',
    justification: 'Additional GPU capacity for fine-tuning',
    businessCase: 'Model fine-tuning queue backed up 4 days. Need additional GPU instances.',
  },
];

const SCALING_POLICIES: ScalingPolicy[] = [
  {
    id: 'sp-001',
    name: 'Agent Lambda Scaling',
    service: 'Lambda',
    minCapacity: 50,
    maxCapacity: 500,
    desiredCapacity: 150,
    scaleUpThreshold: 70,
    scaleDownThreshold: 30,
    cooldownSec: 300,
    enabled: true,
  },
  {
    id: 'sp-002',
    name: 'DynamoDB Agent Sessions',
    service: 'DynamoDB',
    minCapacity: 5000,
    maxCapacity: 50000,
    desiredCapacity: 20000,
    scaleUpThreshold: 75,
    scaleDownThreshold: 25,
    cooldownSec: 60,
    enabled: true,
  },
  {
    id: 'sp-003',
    name: 'SageMaker Inference',
    service: 'SageMaker',
    minCapacity: 2,
    maxCapacity: 10,
    desiredCapacity: 4,
    scaleUpThreshold: 80,
    scaleDownThreshold: 40,
    cooldownSec: 600,
    enabled: true,
  },
  {
    id: 'sp-004',
    name: 'API Gateway Throttle',
    service: 'API Gateway',
    minCapacity: 1000,
    maxCapacity: 10000,
    desiredCapacity: 5000,
    scaleUpThreshold: 85,
    scaleDownThreshold: 35,
    cooldownSec: 120,
    enabled: false,
  },
];

const CAPACITY_ALERTS: CapacityAlert[] = [
  {
    id: 'alert-001',
    type: 'threshold',
    service: 'Lambda',
    quota: 'Concurrent Executions',
    message: 'Lambda concurrent executions at 92% of limit (920/1000)',
    severity: 'critical',
    triggeredAt: '2026-08-11T08:45:00Z',
    acknowledged: false,
  },
  {
    id: 'alert-002',
    type: 'projected',
    service: 'Bedrock',
    quota: 'Claude Invocations',
    message: 'Projected to hit limit in 18 days at current growth rate',
    severity: 'warning',
    triggeredAt: '2026-08-11T06:00:00Z',
    acknowledged: false,
  },
  {
    id: 'alert-003',
    type: 'threshold',
    service: 'SageMaker',
    quota: 'Inference Endpoints',
    message: 'SageMaker endpoints at 90% of limit (18/20)',
    severity: 'critical',
    triggeredAt: '2026-08-10T14:30:00Z',
    acknowledged: true,
  },
  {
    id: 'alert-004',
    type: 'projected',
    service: 'DynamoDB',
    quota: 'Read Capacity',
    message: 'RCU usage trending up 12% week over week',
    severity: 'info',
    triggeredAt: '2026-08-10T00:00:00Z',
    acknowledged: true,
  },
  {
    id: 'alert-005',
    type: 'anomaly',
    service: 'API Gateway',
    quota: 'Request Rate',
    message: 'Unusual spike in API requests detected (2x normal)',
    severity: 'warning',
    triggeredAt: '2026-08-11T03:15:00Z',
    acknowledged: false,
  },
];

// Generate forecast data
const generateForecastData = (growthMultiplier: number) => {
  const baseValue = 847; // Current Claude RPM
  const limit = 1000;
  return Array.from({ length: 30 }, (_, i) => {
    const dailyGrowth = 1 + (0.032 * growthMultiplier) / 7; // 3.2% weekly growth adjusted
    const projected = Math.round(baseValue * Math.pow(dailyGrowth, i));
    return {
      day: `Day ${i + 1}`,
      projected: Math.min(projected, limit * 1.2),
      limit,
    };
  });
};

// Cost vs Capacity data
const COST_CAPACITY_DATA = [
  { capacity: 500, onDemand: 2500, reserved: 1500, savings: 1000 },
  { capacity: 1000, onDemand: 5000, reserved: 2800, savings: 2200 },
  { capacity: 2000, onDemand: 10000, reserved: 5200, savings: 4800 },
  { capacity: 5000, onDemand: 25000, reserved: 12000, savings: 13000 },
  { capacity: 10000, onDemand: 50000, reserved: 22000, savings: 28000 },
];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const SERVICE_CONFIG: Record<string, { label: string; icon: IconName; color: string }> = {
  bedrock: { label: 'Bedrock', icon: 'sparkles', color: 'text-indigo-600' },
  lambda: { label: 'Lambda', icon: 'bolt', color: 'text-amber-600' },
  apigw: { label: 'API Gateway', icon: 'arrow-right-on-rectangle', color: 'text-emerald-600' },
  dynamodb: { label: 'DynamoDB', icon: 'circle-stack', color: 'text-blue-600' },
  sagemaker: { label: 'SageMaker', icon: 'cpu-chip', color: 'text-purple-600' },
};

// Map an AWS Service Quotas service_code to a known SERVICE_CONFIG key when possible.
const normalizeServiceCode = (code: string): string => {
  const c = (code || '').toLowerCase();
  if (c.includes('bedrock')) return 'bedrock';
  if (c.includes('lambda')) return 'lambda';
  if (c.includes('apigateway') || c === 'apigw' || c === 'execute-api') return 'apigw';
  if (c.includes('dynamodb')) return 'dynamodb';
  if (c.includes('sagemaker')) return 'sagemaker';
  return c || 'other';
};

// Safe lookup so live service codes we don't have dedicated styling for still render.
const getServiceConfig = (service: string): { label: string; icon: IconName; color: string } =>
  SERVICE_CONFIG[service] ?? {
    label: service.charAt(0).toUpperCase() + service.slice(1),
    icon: 'squares-2x2',
    color: 'text-slate-600',
  };

// Map a live AWS Service Quota into the QuotaMetric shape the dashboard renders.
// quotas() reports current usage + limit but not historical trend or growth, so
// `trend` is a flat placeholder and `growthRate` is null.
//
// It used to be 0, with the stated intent that "runway/forecast degrade to neutral values
// rather than fabricating a growth curve we do not have". The intent was right and 0
// defeated it twice: it rendered as a measured "+0%/wk", and because daysUntilHit returns
// Infinity for any growthRate <= 0, EVERY live quota was filtered out of the runway
// calculation - so the "Projected Runway" KPI fell through to its literal 90 for every live
// account and could never reach its own amber (<30) or red (<14) thresholds. null makes the
// absence explicit and propagates as "not measured" instead of as a neutral-looking number.
const mapServiceQuota = (q: ServiceQuota): QuotaMetric => ({
  id: `${q.service_code}-${q.quota_code}`,
  service: normalizeServiceCode(q.service_code),
  name: q.quota_name,
  current: q.usage,
  limit: q.value,
  unit: q.unit || 'units',
  trend: [q.usage, q.usage],
  growthRate: null,
  adjustable: q.adjustable,
  // Carried verbatim so a quota-increase request can name the quota exactly as AWS does.
  serviceCode: q.service_code,
  quotaCode: q.quota_code,
});

// Map a live capacity alert (Service Quotas + CloudWatch usage) into the local alert shape.
const mapApiAlert = (a: ApiCapacityAlert): CapacityAlert => ({
  id: `${a.service_code}-${a.quota_code}`,
  type: 'threshold',
  service: a.service_name,
  quota: a.quota_name,
  message:
    a.recommendation ||
    `${a.quota_name} at ${Math.round(a.usage_pct)}% of limit (${a.usage.toLocaleString()}/${a.value.toLocaleString()})`,
  severity: a.severity,
  triggeredAt: new Date().toISOString(),
  acknowledged: false,
});

// null when no limit is published for the quota. AWS returns 0/0 for quotas whose value is
// not applicable or not retrievable, and `Math.round((0 / 0) * 100)` is NaN - which reached
// the screen as "NaN% used" per card and "AVG HEADROOM NaN%" in the KPI row, under a
// Live (AWS Service Quotas) badge. The guard that already existed a few lines below only
// covered the empty-array case, not a zero limit.
const getUsagePercent = (current: number, limit: number): number | null =>
  limit > 0 ? Math.round((current / limit) * 100) : null;

const getStatusColor = (pct: number | null) => {
  if (pct === null) return { bg: 'bg-slate-300', text: 'text-slate-400', light: 'bg-slate-50' };
  if (pct >= 90) return { bg: 'bg-rose-500', text: 'text-rose-600', light: 'bg-rose-50' };
  if (pct >= 80) return { bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50' };
  if (pct >= 70) return { bg: 'bg-yellow-500', text: 'text-yellow-600', light: 'bg-yellow-50' };
  return { bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50' };
};

const REQUEST_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Submitted: { bg: 'bg-blue-100', text: 'text-blue-700' },
  'Under Review': { bg: 'bg-amber-100', text: 'text-amber-700' },
  Approved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  Denied: { bg: 'bg-rose-100', text: 'text-rose-700' },
};

const ALERT_SEVERITY_STYLES: Record<string, { bg: string; text: string; icon: IconName }> = {
  info: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'information-circle' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'exclamation-triangle' },
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', icon: 'exclamation-circle' },
};

const tooltipStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.96)',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  fontSize: '11px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
};

// Days until quota hit at current growth
// Returns null when the runway is not calculable: no growth history (growthRate null) or a
// flat/negative trend. Callers must render that as "not measured", not as a large number.
const daysUntilHit = (current: number, limit: number, growthRate: number | null): number | null => {
  // No published limit means no runway, NOT a saturated quota. `0 >= 0` used to return 0
  // here, so every 0/0 quota reported a zero-day runway and dragged the Projected Runway
  // KPI to "0d" in red for the whole account.
  if (limit <= 0) return null;
  if (current >= limit) return 0;
  if (growthRate === null || growthRate <= 0) return null;
  const weeklyGrowth = 1 + growthRate / 100;
  const daysNeeded = Math.log(limit / current) / Math.log(Math.pow(weeklyGrowth, 1 / 7));
  return Math.round(daysNeeded);
};

// -----------------------------------------------------------------------------
// Sparkline Component
// -----------------------------------------------------------------------------

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const height = 24;
  const width = 60;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Quota-increase outcomes
// -----------------------------------------------------------------------------

type OutcomeTone = 'success' | 'caution' | 'error' | 'info';

interface QuotaOutcome {
  tone: OutcomeTone;
  /** What happened, in our words. */
  title: string;
  /** Our framing of what the status means for the user. */
  detail: string;
  /** The backend's own message. Always rendered - it carries the specifics. */
  message: string;
  /** Degrade explanation. Additive and null for every AWS-produced status. */
  note?: string | null;
  caseId?: string | null;
  requestId?: string | null;
  /**
   * Whether pressing Submit again is safe.
   *
   * `unsafe` covers two different situations that share one rule: something was filed
   * (so a second press duplicates it), or it is unknown whether anything was filed (so a
   * second press might). In both cases the retry control is withdrawn rather than left
   * sitting there inviting a duplicate AWS Support case.
   */
  resubmit: 'safe' | 'unsafe';
  /** Shown in place of the Submit button when `resubmit` is `unsafe`. */
  resubmitBlockedReason?: string;
}

const OUTCOME_TONES: Record<
  OutcomeTone,
  { bg: string; border: string; text: string; icon: IconName; iconColor: string }
> = {
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', icon: 'check-circle', iconColor: 'text-emerald-500' },
  caution: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: 'exclamation-triangle', iconColor: 'text-amber-500' },
  error: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800', icon: 'x-circle', iconColor: 'text-rose-500' },
  info: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', icon: 'information-circle', iconColor: 'text-slate-400' },
};

/**
 * Classify a quota-increase response.
 *
 * The distinctions that matter, and why they are not collapsed:
 *  - `submitted` is not "done". AWS still has to approve it.
 *  - `denied` is an ANSWER: AWS judged the request and refused it.
 *  - `invalid` is OUR refusal: the request was rejected before submission, so AWS never saw
 *    it. The operator's input is what to change, which makes it a form-level problem rather
 *    than an outcome - styled as caution, not as the rejection `denied` is.
 *  - `error` is a NON-ANSWER: nothing was submitted at all. Reporting it as denied would
 *    tell the user AWS said no when AWS was never asked.
 *  - `pending` means a request was already open; the identifiers are the EXISTING one's.
 *
 * Three of those mean "no increase was filed" for three different reasons and are kept
 * apart on purpose. The default branch is deliberate, not defensive padding: the status set
 * has already changed once (`invalid` was split out of `denied`), so an unrecognised value
 * must read as unresolved rather than render blank.
 */
function describeQuotaOutcome(res: QuotaIncreaseResponse): QuotaOutcome {
  const common = {
    message: res.message,
    note: res.note ?? null,
    caseId: res.case_id ?? null,
    requestId: res.request_id ?? null,
  };

  switch (res.status) {
    case 'submitted':
      return {
        ...common,
        tone: 'success',
        title: 'Request submitted to AWS.',
        detail:
          'The limit has not changed yet - AWS still has to approve it. Track progress in the Service Quotas console, or in the support case if one was opened.',
        resubmit: 'unsafe',
        resubmitBlockedReason:
          'This request is with AWS. Submitting again would file a duplicate.',
      };
    case 'approved':
      return {
        ...common,
        tone: 'success',
        title: 'AWS has approved this increase.',
        detail: 'The usage figures here update on the next read of Service Quotas.',
        resubmit: 'unsafe',
        resubmitBlockedReason: 'The increase is already granted, so there is nothing to resend.',
      };
    case 'pending':
      return {
        ...common,
        tone: 'info',
        title: 'An increase for this quota is already open.',
        detail:
          'No new request was created. The identifiers below belong to the request already in flight, not to a new one.',
        resubmit: 'unsafe',
        resubmitBlockedReason:
          'A request for this quota is already open. Submitting again would duplicate it.',
      };
    case 'denied':
      return {
        ...common,
        tone: 'error',
        title: 'AWS refused this increase.',
        detail:
          'AWS judged the request and declined it, so no increase is in flight. Resending the same values will be refused again - the reason below is what has to change, and an AWS Support case is usually the next step.',
        resubmit: 'safe',
      };
    case 'invalid':
      // Our own pre-submission rejection. Deliberately not styled like `denied`: nobody at
      // AWS refused anything, and the fix is in the form rather than with AWS.
      return {
        ...common,
        tone: 'caution',
        title: 'Rejected before submitting - AWS never saw this request.',
        detail:
          'The values above are what to change. The figures in the message are read live from Service Quotas, so they are current.',
        resubmit: 'safe',
      };
    case 'error':
      return {
        ...common,
        tone: 'error',
        title: 'Nothing was submitted - AWS never answered.',
        detail:
          'The request did not reach a decision: permissions, throttling, a server fault, or an unreachable endpoint. This is not a refusal, so retrying is reasonable once the cause is fixed.',
        resubmit: 'safe',
      };
    default:
      return {
        ...common,
        tone: 'caution',
        title: `Unrecognised status "${res.status}" - treat this request as unresolved.`,
        detail:
          'This build does not have copy for that status, so it cannot say whether anything was filed. Check the Service Quotas console before retrying, rather than assuming either outcome.',
        resubmit: 'unsafe',
        resubmitBlockedReason:
          'It is not known whether anything was filed, so no retry is offered here. Check the Service Quotas console first.',
      };
  }
}

/**
 * A thrown request never produced a status, so it cannot be described with the same
 * vocabulary. The one thing worth getting right here is how much is actually known:
 * a rejection before the call and a fault during it have different implications for
 * whether anything reached AWS.
 */
function describeIncreaseFailure(e: unknown): QuotaOutcome {
  const err = e as { response?: { status?: number; data?: { detail?: unknown } } } | null;
  const status = typeof err?.response?.status === 'number' ? err.response.status : null;
  const detail =
    typeof err?.response?.data?.detail === 'string' ? err.response.data.detail : null;

  if (status === null) {
    return {
      tone: 'error',
      title: 'The request never left AVA.',
      detail:
        'This says nothing about whether the quota can be increased - only that the call did not complete.',
      message: 'AVA could not reach its own backend, so nothing was sent to AWS.',
      note: null,
      resubmit: 'safe',
    };
  }
  if (status === 401 || status === 403) {
    return {
      tone: 'error',
      title: 'You are not permitted to file quota increases.',
      detail: 'Filing an increase requires the Admin role. Nothing was submitted.',
      message: detail ?? 'The request was rejected by AVA before it reached AWS.',
      note: null,
      // Nothing was filed, so a retry is harmless - it will simply be refused again until
      // the role changes.
      resubmit: 'safe',
    };
  }
  if (status === 404) {
    return {
      tone: 'error',
      title: 'This backend has no quota-increase endpoint.',
      detail:
        'The running backend is older than this page expects. Nothing was submitted.',
      message: detail ?? 'The endpoint returned 404.',
      note: null,
      resubmit: 'safe',
    };
  }
  if (status === 422 || status === 400) {
    return {
      tone: 'caution',
      title: 'The request was rejected as invalid.',
      detail: 'Nothing was submitted. Correct the values below and try again.',
      message: detail ?? 'The backend rejected the request body.',
      note: null,
      resubmit: 'safe',
    };
  }
  if (status >= 500) {
    return {
      tone: 'error',
      title: `AVA's backend failed while handling the request (HTTP ${status}).`,
      detail:
        'It is not certain whether anything reached AWS. Check the Service Quotas console before retrying, rather than assuming nothing was filed.',
      message: detail ?? 'The backend returned a server error.',
      note: null,
      resubmit: 'unsafe',
      resubmitBlockedReason:
        'The request may have reached AWS before the failure. Check the Service Quotas console rather than risking a duplicate.',
    };
  }
  return {
    tone: 'error',
    title: `The request failed (HTTP ${status}).`,
    detail: 'Treat this as unresolved and check the Service Quotas console before retrying.',
    message: detail ?? 'No further detail was returned.',
    note: null,
    resubmit: 'unsafe',
    resubmitBlockedReason:
      'It is not known whether anything was filed. Check the Service Quotas console first.',
  };
}

function QuotaOutcomePanel({ outcome }: { outcome: QuotaOutcome }) {
  const tone = OUTCOME_TONES[outcome.tone];
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg border ${tone.bg} ${tone.border}`}>
      <Icon name={tone.icon} className={`w-4 h-4 flex-shrink-0 mt-0.5 ${tone.iconColor}`} />
      <div className="min-w-0 space-y-1">
        <div className={`text-xs font-medium ${tone.text}`}>{outcome.title}</div>
        <p className="text-[11px] text-slate-700">{outcome.message}</p>
        <p className="text-[11px] text-slate-500">{outcome.detail}</p>
        {/* Additive: null for every AWS-produced status, so it simply does not render. */}
        {outcome.note && <p className="text-[11px] text-slate-500 italic">{outcome.note}</p>}
        {(outcome.caseId || outcome.requestId) && (
          <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[10px] text-slate-500 font-mono">
            {outcome.caseId && <span>Support case: {outcome.caseId}</span>}
            {outcome.requestId && <span>Request: {outcome.requestId}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function CapacityPlanning() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all');
  const [growthScenario, setGrowthScenario] = useState(1); // 0.5x to 2x
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedQuota, setSelectedQuota] = useState<QuotaMetric | null>(null);

  // Form state for new request
  const [requestedLimit, setRequestedLimit] = useState('');
  const [justification, setJustification] = useState('');
  const [businessCase, setBusinessCase] = useState('');
  // Submitting opens a real AWS Support case, so it takes an explicit acknowledgement.
  const [acknowledgedRealRequest, setAcknowledgedRealRequest] = useState(false);
  const [submittingIncrease, setSubmittingIncrease] = useState(false);
  const [increaseOutcome, setIncreaseOutcome] = useState<QuotaOutcome | null>(null);

  // Live data — AWS Service Quotas (usage) + CloudWatch-derived alerts, fetched
  // directly. Gating is driven by each response's `.live` flag (not array length),
  // so a live-but-empty account shows an honest empty state instead of mock data.
  const [liveQuotas, setLiveQuotas] = useState<QuotaMetric[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<CapacityAlert[]>([]);
  const [isQuotasLive, setIsQuotasLive] = useState(false);
  const [isAlertsLive, setIsAlertsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Local (demo) state so alert acknowledgement and scaling-policy toggles work in
  // the mock mode used when the live APIs are unavailable / report not-live.
  const [localAlerts, setLocalAlerts] = useState<CapacityAlert[]>(CAPACITY_ALERTS);
  const [localPolicies, setLocalPolicies] = useState<ScalingPolicy[]>(SCALING_POLICIES);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      const [quotasRes, alertsRes] = await Promise.all([
        governCapacityApi.quotas().catch(() => null),
        governCapacityApi.alerts().catch(() => null),
      ]);
      if (cancelled) return;

      if (quotasRes?.live) {
        setLiveQuotas(quotasRes.quotas.map(mapServiceQuota));
        setIsQuotasLive(true);
      } else {
        setIsQuotasLive(false);
      }

      if (alertsRes?.live) {
        setLiveAlerts(alertsRes.alerts.map(mapApiAlert));
        setIsAlertsLive(true);
      } else {
        setIsAlertsLive(false);
      }

      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Use live data when the API reports it is live; otherwise fall back to mock/local.
  // When live-and-empty we intentionally show the (empty) live result, not the mock.
  const quotaMetrics = isQuotasLive ? liveQuotas : QUOTA_METRICS;
  const capacityAlerts = isAlertsLive ? liveAlerts : localAlerts;
  const isLive = isQuotasLive || isAlertsLive;

  const handleAcknowledge = (id: string) => {
    // No backend acknowledge endpoint exists yet, so ack is client-side in both modes.
    if (isAlertsLive) {
      setLiveAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
    } else {
      setLocalAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
    }
  };

  const togglePolicy = (id: string) => {
    setLocalPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)));
  };

  // KPI calculations
  const kpis = useMemo(() => {
    const atRisk = quotaMetrics.filter((q) => (getUsagePercent(q.current, q.limit) ?? -1) >= 80).length;
    const critical = quotaMetrics.filter((q) => (getUsagePercent(q.current, q.limit) ?? -1) >= 90).length;
    // null when there are no quotas to average (a live-but-empty quotas response
    // would otherwise divide by zero and render "~NaN%").
    // Average only over quotas that actually publish a limit, and divide by that same
    // count - a quota with no limit has no headroom to average in either direction.
    const headrooms = quotaMetrics
      .map((q) => getUsagePercent(q.current, q.limit))
      .filter((pct): pct is number => pct !== null)
      .map((pct) => 100 - pct);
    const avgHeadroom =
      headrooms.length > 0
        ? Math.round(headrooms.reduce((sum, h) => sum + h, 0) / headrooms.length)
        : null;
    // LIMIT_REQUESTS is entirely seeded - there is no live source for quota-increase
    // request history (servicequotas:ListRequestedServiceQuotaChangeHistory is not wired,
    // and requesting an increase is a write we do not make). Counting those rows produced a
    // hard "2" in a KPI row sitting under the "Live (AWS Service Quotas)" badge, which reads
    // as two real pending AWS requests. null when the page is claiming live data.
    const pendingRequests = isLive
      ? null
      : LIMIT_REQUESTS.filter((r) => r.status === 'Submitted' || r.status === 'Under Review').length;

    // Projected runway: days until first quota hits limit
    // null when no quota has a calculable runway - previously this fell through to a
    // literal 90, which was the value shown for every live account.
    const runways = quotaMetrics
      .map((q) => daysUntilHit(q.current, q.limit, q.growthRate))
      .filter((d): d is number => d !== null);
    const projectedRunway = runways.length > 0 ? Math.min(...runways) : null;

    // Illustrative only: these quotas mix rate limits (req/min, tokens/min) with
    // provisioned capacity (RCU/WCU, instances), so unused headroom has no single
    // billable rate. The previous `* 24 * 30` multiplier treated per-minute rate
    // limits as hourly-billed resources, producing a meaningless figure. This is a
    // rough directional number, surfaced with an "illustrative only" label.
    const unusedCost = Math.round(
      quotaMetrics.reduce((sum, q) => {
        const unused = q.limit - q.current;
        const costPerUnit = q.service === 'bedrock' ? 0.01 : q.service === 'lambda' ? 0.001 : 0.005;
        return sum + unused * costPerUnit;
      }, 0)
    );

    return { atRisk, critical, avgHeadroom, pendingRequests, projectedRunway, unusedCost };
  }, [quotaMetrics]);

  // Filtered quotas
  const filteredQuotas = useMemo(() => {
    if (serviceFilter === 'all') return quotaMetrics;
    return quotaMetrics.filter((q) => q.service === serviceFilter);
  }, [serviceFilter, quotaMetrics]);

  // Group quotas by service
  const quotasByService = useMemo(() => {
    const grouped: Record<string, QuotaMetric[]> = {};
    filteredQuotas.forEach((q) => {
      if (!grouped[q.service]) grouped[q.service] = [];
      grouped[q.service].push(q);
    });
    return grouped;
  }, [filteredQuotas]);

  // Forecast data based on growth scenario
  const forecastData = useMemo(() => generateForecastData(growthScenario), [growthScenario]);

  const handleRequestIncrease = (quota: QuotaMetric) => {
    setSelectedQuota(quota);
    setRequestedLimit(String(Math.ceil(quota.limit * 1.5)));
    setJustification('');
    setBusinessCase('');
    setAcknowledgedRealRequest(false);
    setIncreaseOutcome(null);
    setShowRequestModal(true);
  };

  const desiredValue = Number(requestedLimit);
  const hasQuotaCodes = Boolean(selectedQuota?.serviceCode && selectedQuota?.quotaCode);

  // Reasons WE refuse before asking AWS. Kept separate from the response statuses on
  // purpose: these are things the user can change, not a decision anyone has made.
  const preflightBlock: string | null = (() => {
    if (!selectedQuota) return 'Select the quota this request is for.';
    if (!hasQuotaCodes)
      return 'This quota is seeded demo data - it carries no AWS service or quota code, so there is nothing to file a request against.';
    if (!selectedQuota.adjustable)
      return 'AWS reports this quota as not adjustable, so an increase cannot be requested for it.';
    if (!Number.isFinite(desiredValue) || desiredValue <= 0)
      return 'Enter the limit you want as a positive number.';
    if (desiredValue <= selectedQuota.limit)
      return `The requested limit must be above the current limit of ${selectedQuota.limit.toLocaleString()}.`;
    if (!justification.trim()) return 'A justification is required.';
    if (!acknowledgedRealRequest)
      return 'Confirm you understand this files a real request with AWS.';
    return null;
  })();

  const handleSubmitIncrease = async () => {
    // Re-checked rather than trusting the disabled attribute.
    if (!selectedQuota?.serviceCode || !selectedQuota.quotaCode || preflightBlock) return;
    setSubmittingIncrease(true);
    setIncreaseOutcome(null);
    try {
      const res = await governCapacityApi.requestIncrease({
        service_code: selectedQuota.serviceCode,
        quota_code: selectedQuota.quotaCode,
        desired_value: desiredValue,
        // RequestServiceQuotaIncrease has no justification field, so this text never
        // reaches AWS - it is recorded control-plane side only. The business case is
        // folded in so it lands in that record instead of being silently dropped.
        reason: businessCase.trim()
          ? `${justification.trim()}\n\nBusiness case: ${businessCase.trim()}`
          : justification.trim(),
      });
      setIncreaseOutcome(describeQuotaOutcome(res));
    } catch (e) {
      setIncreaseOutcome(describeIncreaseFailure(e));
    } finally {
      setSubmittingIncrease(false);
    }
  };

  // Active (unacknowledged) alerts
  const activeAlerts = capacityAlerts.filter((a) => !a.acknowledged);

  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'dashboard', label: 'Quota Dashboard', icon: 'squares-2x2' },
    { id: 'forecast', label: 'Forecasting', icon: 'chart-line' },
    { id: 'requests', label: 'Limit Requests', icon: 'clipboard-document-list' },
    { id: 'scaling', label: 'Scaling Policies', icon: 'arrow-trending-up' },
    { id: 'cost', label: 'Cost vs Capacity', icon: 'banknotes' },
    { id: 'alerts', label: 'Alerts', icon: 'bell-alert' },
  ];

  return (
    <div className="space-y-6">
      {/* Data Source Badge */}
      <div className="flex justify-end">
        {isLive ? <LiveDataBadge source="AWS Service Quotas" /> : <MockDataBadge integration="AWS Service Quotas / CloudWatch" />}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Icon name="spinner" className="w-6 h-6 text-indigo-600 animate-spin" />
          <span className="ml-2 text-sm text-slate-600">Loading capacity data...</span>
        </div>
      )}

      {!isLoading && (
      <>
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Quotas At Risk"
          value={kpis.atRisk}
          sub=">80% usage"
          variant={kpis.atRisk > 0 ? 'warning' : 'success'}
          icon={<Icon name="exclamation-triangle" className="w-5 h-5 text-amber-500" />}
        />
        <StatCard
          label="Quotas Critical"
          value={kpis.critical}
          sub=">90% usage"
          variant={kpis.critical > 0 ? 'danger' : 'success'}
          icon={<Icon name="exclamation-circle" className="w-5 h-5 text-rose-500" />}
        />
        <StatCard
          label="Avg Headroom"
          value={kpis.avgHeadroom === null ? '—' : `${kpis.avgHeadroom}%`}
          sub={kpis.avgHeadroom === null ? 'no quotas reported' : 'across key quotas'}
          variant={kpis.avgHeadroom !== null && kpis.avgHeadroom < 20 ? 'warning' : 'default'}
          icon={<Icon name="chart-bar" className="w-5 h-5 text-blue-500" />}
        />
        <StatCard
          label="Pending Requests"
          value={kpis.pendingRequests === null ? '—' : kpis.pendingRequests}
          sub={kpis.pendingRequests === null ? 'request tracking not connected' : 'limit increases'}
          variant={kpis.pendingRequests === null ? 'default' : 'info'}
          icon={<Icon name="clock" className="w-5 h-5 text-indigo-500" />}
        />
        <StatCard
          label="Projected Runway"
          value={kpis.projectedRunway === null ? '—' : `${kpis.projectedRunway}d`}
          sub={kpis.projectedRunway === null ? 'growth history not available' : 'until first quota hit'}
          variant={kpis.projectedRunway === null ? 'default' : kpis.projectedRunway < 14 ? 'danger' : kpis.projectedRunway < 30 ? 'warning' : 'default'}
          icon={<Icon name="calendar" className="w-5 h-5 text-slate-500" />}
        />
        <StatCard
          label="Unused Capacity"
          value={`~$${kpis.unusedCost.toLocaleString()}`}
          sub="illustrative only"
          variant="muted"
          icon={<Icon name="currency-dollar" className="w-5 h-5 text-slate-400" />}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-lg text-[11px] overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon name={tab.icon} className="w-3.5 h-3.5" />
            {tab.label}
            {/* The red pill reads as live alerting. capacityAlerts falls back to the seeded
                CAPACITY_ALERTS when the alerts API is not live, so gate the alarm colour on
                isAlertsLive and render a neutral, labelled count otherwise. */}
            {tab.id === 'alerts' && activeAlerts.length > 0 && (
              isAlertsLive ? (
                <span className="ml-1 px-1.5 py-0.5 bg-rose-500 text-white text-[9px] rounded-full">
                  {activeAlerts.length}
                </span>
              ) : (
                <span
                  className="ml-1 px-1.5 py-0.5 bg-slate-200 text-slate-500 text-[9px] rounded-full border border-dashed border-slate-400"
                  title="Illustrative alerts — the capacity alerts API is not live, so this count comes from seeded examples, not from your account."
                >
                  {activeAlerts.length}
                </span>
              )
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          {/* Service Filter */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100/80 rounded-lg text-[11px] w-fit">
            <button
              onClick={() => setServiceFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                serviceFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              All Services
            </button>
            {Object.entries(SERVICE_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setServiceFilter(key as ServiceFilter)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-all ${
                  serviceFilter === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon name={cfg.icon} className={`w-3.5 h-3.5 ${cfg.color}`} />
                {cfg.label}
              </button>
            ))}
          </div>

          {/* Quota Cards by Service */}
          {Object.keys(quotasByService).length === 0 ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-8 shadow-sm text-center">
              <Icon name="squares-2x2" className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-700 mb-1">No quotas to display</h3>
              <p className="text-[11px] text-slate-500">
                {isLive
                  ? 'AWS Service Quotas returned no AI-relevant quotas for this account and region.'
                  : 'No quotas match the current filter.'}
              </p>
            </div>
          ) : (
            Object.entries(quotasByService).map(([service, quotas]) => {
            const cfg = getServiceConfig(service);
            return (
              <div key={service} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Icon name={cfg.icon} className={`w-5 h-5 ${cfg.color}`} />
                  <h3 className="text-sm font-semibold text-slate-900">{cfg.label}</h3>
                  <span className="text-[10px] text-slate-400">
                    {quotas.length} quota{quotas.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {quotas.map((q) => {
                    const pct = getUsagePercent(q.current, q.limit);
                    const status = getStatusColor(pct);
                    const runway = daysUntilHit(q.current, q.limit, q.growthRate);
                    return (
                      <div
                        key={q.id}
                        className={`border rounded-lg p-4 ${
                          (pct ?? -1) >= 90 ? 'border-rose-200 bg-rose-50/30' :
                          (pct ?? -1) >= 80 ? 'border-amber-200 bg-amber-50/30' :
                          'border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="text-xs font-medium text-slate-700 leading-tight max-w-[200px]">
                            {q.name}
                          </div>
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${status.light} ${status.text}`}
                          >
                            {/* 'OK' would be a claim about a quota whose limit AWS never published. */}
                            {pct === null ? 'NO LIMIT' : pct >= 90 ? 'CRITICAL' : pct >= 80 ? 'AT RISK' : pct >= 70 ? 'WATCH' : 'OK'}
                          </span>
                        </div>

                        {/* Usage stats */}
                        <div className="flex items-end justify-between mb-2">
                          <div>
                            <div className="text-lg font-bold text-slate-900 tabular-nums">
                              {q.current.toLocaleString()}
                              <span className="text-sm font-normal text-slate-400">
                                {' '}/ {q.limit.toLocaleString()}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500">{q.unit}</div>
                          </div>
                          <Sparkline
                            data={q.trend}
                            color={pct === null ? '#cbd5e1' : pct >= 90 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981'}
                          />
                        </div>

                        {/* Progress bar */}
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-2">
                          <div
                            className={`h-full rounded-full ${status.bg}`}
                            style={{ width: `${pct === null ? 0 : Math.min(pct, 100)}%` }}
                          />
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={`font-semibold tabular-nums ${status.text}`} title={pct === null ? 'AWS publishes no limit for this quota, so usage cannot be expressed as a percentage.' : undefined}>
                            {pct === null ? 'no limit published' : `${pct}% used`}
                          </span>
                          <span className="text-slate-400" title={q.growthRate === null ? 'No usage history is available for this quota, so no growth rate can be calculated.' : undefined}>
                            {q.growthRate === null ? 'growth n/a' : `+${q.growthRate}%/wk`}
                          </span>
                          {runway !== null && runway < 60 && (
                            <span className={runway < 14 ? 'text-rose-600' : 'text-amber-600'}>
                              {runway}d runway
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        {q.adjustable && (pct ?? -1) >= 70 && (
                          <button
                            onClick={() => handleRequestIncrease(q)}
                            className="mt-3 w-full py-1.5 text-[10px] font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            Request Increase
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
          )}
        </div>
      )}

      {activeTab === 'forecast' && (
        <div className="space-y-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Capacity Forecasting</h3>
                <p className="text-[11px] text-slate-500">
                  Projection shows when quotas will be hit at current growth rate
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500">Growth Scenario:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={growthScenario}
                    onChange={(e) => setGrowthScenario(parseFloat(e.target.value))}
                    className="w-24 accent-indigo-600"
                  />
                  <span className="text-xs font-medium text-slate-700 w-10">{growthScenario}x</span>
                </div>
              </div>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="projectedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 10 }} interval={4} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={50} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <ReferenceLine y={1000} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Limit', fill: '#ef4444', fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="projected"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#projectedGrad)"
                    name="Projected Usage"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Recommendations */}
            <div className="mt-4 p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-semibold text-slate-700 mb-2">Recommended Actions</div>
              <div className="space-y-2 text-[11px]">
                <div className="flex items-start gap-2">
                  <Icon name="exclamation-circle" className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">
                    <strong className="text-slate-700">Claude RPM:</strong> Request 50% increase now - will hit limit in {Math.round(18 / growthScenario)} days
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">
                    <strong className="text-slate-700">Lambda Concurrent:</strong> Consider scaling policy adjustment - at 92% capacity
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Icon name="information-circle" className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">
                    <strong className="text-slate-700">SageMaker Endpoints:</strong> Plan capacity review - approaching 90% utilization
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="space-y-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Limit Increase Requests</h3>
                <p className="text-[11px] text-slate-500">
                  Track pending and historical quota increase requests
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedQuota(null);
                  setRequestedLimit('');
                  setJustification('');
                  setBusinessCase('');
                  // Both must be cleared or the previous request's outcome panel and ticked
                  // confirmation carry over into a form that has not been submitted.
                  setAcknowledgedRealRequest(false);
                  setIncreaseOutcome(null);
                  setShowRequestModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                New Request
              </button>
            </div>

            {/* Requests Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left border-b border-slate-100">
                    <th className="font-medium pb-2">Service</th>
                    <th className="font-medium pb-2">Quota</th>
                    <th className="font-medium pb-2 text-right">Current</th>
                    <th className="font-medium pb-2 text-right">Requested</th>
                    <th className="font-medium pb-2">Status</th>
                    <th className="font-medium pb-2">Submitted</th>
                    <th className="font-medium pb-2">Justification</th>
                  </tr>
                </thead>
                <tbody>
                  {LIMIT_REQUESTS.map((req) => {
                    const statusStyle = REQUEST_STATUS_STYLES[req.status];
                    return (
                      <tr key={req.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-2.5 font-medium text-slate-700">{req.service}</td>
                        <td className="py-2.5 text-slate-600">{req.quota}</td>
                        <td className="py-2.5 text-right tabular-nums text-slate-700">
                          {req.currentLimit.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-indigo-600 font-medium">
                          {req.requestedLimit.toLocaleString()}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusStyle.bg} ${statusStyle.text}`}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-500">{req.submittedDate}</td>
                        <td className="py-2.5 text-slate-600 max-w-[200px] truncate" title={req.justification}>
                          {req.justification}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'scaling' && (
        <div className="space-y-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Auto-Scaling Policies</h3>
                <p className="text-[11px] text-slate-500">
                  Configure scaling behavior for agents and services
                </p>
              </div>
              <button
                type="button"
                disabled
                title="Policy authoring is not available yet"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                Add Policy
              </button>
            </div>

            <div className="space-y-3">
              {localPolicies.map((policy) => (
                <div
                  key={policy.id}
                  className={`border rounded-lg p-4 ${
                    policy.enabled ? 'border-slate-200' : 'border-slate-100 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{policy.name}</span>
                      <span className="text-[10px] text-slate-500">{policy.service}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={policy.enabled}
                        onChange={() => togglePolicy(policy.id)}
                        aria-label={`Toggle ${policy.name}`}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-[11px]">
                    <div>
                      <div className="text-slate-400 uppercase tracking-wide text-[9px]">Min</div>
                      <div className="text-slate-700 font-medium tabular-nums">{policy.minCapacity.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 uppercase tracking-wide text-[9px]">Max</div>
                      <div className="text-slate-700 font-medium tabular-nums">{policy.maxCapacity.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 uppercase tracking-wide text-[9px]">Desired</div>
                      <div className="text-indigo-600 font-semibold tabular-nums">{policy.desiredCapacity.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 uppercase tracking-wide text-[9px]">Scale Up</div>
                      <div className="text-slate-700 font-medium">{policy.scaleUpThreshold}% util</div>
                    </div>
                    <div>
                      <div className="text-slate-400 uppercase tracking-wide text-[9px]">Scale Down</div>
                      <div className="text-slate-700 font-medium">{policy.scaleDownThreshold}% util</div>
                    </div>
                    <div>
                      <div className="text-slate-400 uppercase tracking-wide text-[9px]">Cooldown</div>
                      <div className="text-slate-700 font-medium">{policy.cooldownSec}s</div>
                    </div>
                  </div>

                  {/* Visual capacity indicator */}
                  <div className="mt-3">
                    <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="absolute h-full bg-indigo-500"
                        style={{
                          left: `${(policy.minCapacity / policy.maxCapacity) * 100}%`,
                          width: `${((policy.desiredCapacity - policy.minCapacity) / policy.maxCapacity) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] text-slate-400">
                      <span>0</span>
                      <span>{policy.maxCapacity.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'cost' && (
        <div className="space-y-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Cost vs Capacity Trade-offs</h3>
                <p className="text-[11px] text-slate-500">
                  Compare on-demand vs reserved capacity costs
                </p>
              </div>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={COST_CAPACITY_DATA} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="capacity"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickFormatter={(v) => `${v / 1000}K`}
                    label={{ value: 'Capacity', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 10 }}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickFormatter={(v) => `$${v / 1000}K`}
                    width={50}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${(v ?? 0).toLocaleString()}`} />
                  <Line
                    type="monotone"
                    dataKey="onDemand"
                    stroke="#ef4444"
                    strokeWidth={2}
                    name="On-Demand"
                    dot={{ r: 4, fill: '#ef4444' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="reserved"
                    stroke="#10b981"
                    strokeWidth={2}
                    name="Reserved"
                    dot={{ r: 4, fill: '#10b981' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Recommendations */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <div className="text-[11px] font-semibold text-emerald-700 mb-1">Reserved Capacity</div>
                <div className="text-lg font-bold text-emerald-800">Up to 56%</div>
                <div className="text-[10px] text-emerald-600">savings vs on-demand</div>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-[11px] font-semibold text-blue-700 mb-1">Optimal Commitment</div>
                <div className="text-lg font-bold text-blue-800">70-80%</div>
                <div className="text-[10px] text-blue-600">of baseline capacity</div>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <div className="text-[11px] font-semibold text-amber-700 mb-1">Burst Buffer</div>
                <div className="text-lg font-bold text-amber-800">20-30%</div>
                <div className="text-[10px] text-amber-600">keep on-demand for spikes</div>
              </div>
            </div>

            {/* Recommendations list */}
            <div className="mt-4 p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-xs font-semibold text-slate-700">Cost Optimization Recommendations</div>
                <MockDataBadge integration="Cost Explorer + Compute Optimizer" />
              </div>
              <div className="space-y-2 text-[11px]">
                <div className="flex items-start gap-2">
                  <Icon name="check-circle" className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">
                    Convert 70% of Bedrock throughput to Provisioned - projected savings: $4,200/mo
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Icon name="check-circle" className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">
                    Use Savings Plans for Lambda - projected savings: $1,800/mo
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Icon name="information-circle" className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">
                    DynamoDB on-demand mode optimal for current variable workload
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {/* Alert Rules */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Alert Rules</h3>
                <p className="text-[11px] text-slate-500">
                  Configure when to alert on quota usage
                </p>
              </div>
              <button
                type="button"
                disabled
                title="Alert-rule authoring is not available yet"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                Add Rule
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-rose-200 rounded-lg p-3 bg-rose-50/30">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="exclamation-circle" className="w-4 h-4 text-rose-500" />
                  <span className="text-xs font-semibold text-rose-700">Critical Alert</span>
                </div>
                <div className="text-[11px] text-slate-600">
                  Alert when usage exceeds <strong>90%</strong> of limit
                </div>
              </div>
              <div className="border border-amber-200 rounded-lg p-3 bg-amber-50/30">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-semibold text-amber-700">Warning Alert</span>
                </div>
                <div className="text-[11px] text-slate-600">
                  Alert when usage exceeds <strong>80%</strong> of limit
                </div>
              </div>
              <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/30">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="information-circle" className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-semibold text-blue-700">Projected Alert</span>
                </div>
                <div className="text-[11px] text-slate-600">
                  Alert when projected to hit limit in <strong>30 days</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Active Alerts */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Active Alerts</h3>
                <p className="text-[11px] text-slate-500">
                  {activeAlerts.length} unacknowledged alert{activeAlerts.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {capacityAlerts.map((alert) => {
                const style = ALERT_SEVERITY_STYLES[alert.severity];
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${style.bg} ${
                      alert.acknowledged ? 'opacity-60' : ''
                    } ${
                      alert.severity === 'critical' ? 'border-rose-200' :
                      alert.severity === 'warning' ? 'border-amber-200' : 'border-blue-200'
                    }`}
                  >
                    <Icon name={style.icon} className={`w-5 h-5 ${style.text} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-800">{alert.service}</span>
                        <span className="text-[10px] text-slate-500">{alert.quota}</span>
                        {alert.acknowledged && (
                          <span className="text-[9px] text-slate-400 ml-auto">Acknowledged</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">{alert.message}</p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
                        <span>{new Date(alert.triggeredAt).toLocaleString()}</span>
                        <span className="text-slate-300">|</span>
                        <span className="capitalize">{alert.type}</span>
                      </div>
                    </div>
                    {!alert.acknowledged && (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="text-[10px] font-medium text-slate-600 hover:text-slate-800 px-2 py-1 border border-slate-200 rounded hover:bg-white transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Request Increase Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Request Limit Increase</h3>
              <button
                onClick={() => setShowRequestModal(false)}
                disabled={submittingIncrease}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name="x-mark" className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              {/* Reached from "New Request", which opens the modal with nothing selected.
                  Without a picker that form could never be submitted. */}
              {!selectedQuota && (
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Quota</label>
                  <select
                    value=""
                    onChange={(e) => {
                      const q = quotaMetrics.find((m) => m.id === e.target.value);
                      if (!q) return;
                      setSelectedQuota(q);
                      setRequestedLimit(String(Math.ceil(q.limit * 1.5)));
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select a quota...</option>
                    {quotaMetrics.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                        {!q.serviceCode || !q.quotaCode
                          ? ' (seeded — cannot be filed)'
                          : !q.adjustable
                            ? ' (not adjustable)'
                            : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedQuota && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Selected Quota</div>
                  <div className="text-sm font-medium text-slate-900">{selectedQuota.name}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Current: {selectedQuota.current.toLocaleString()} / {selectedQuota.limit.toLocaleString()} ({getUsagePercent(selectedQuota.current, selectedQuota.limit) ?? '—'}%)
                  </div>
                  {hasQuotaCodes ? (
                    <div className="text-[10px] text-slate-400 font-mono mt-1">
                      {selectedQuota.serviceCode} / {selectedQuota.quotaCode}
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-700 mt-1.5">
                      Seeded demo quota — it has no AWS service or quota code, so nothing can be
                      filed against it.
                    </div>
                  )}
                  {hasQuotaCodes && !selectedQuota.adjustable && (
                    <div className="text-[11px] text-amber-700 mt-1.5">
                      AWS reports this quota as not adjustable through Service Quotas. An increase
                      cannot be requested for it here.
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs text-slate-500 mb-1 block">Requested Limit</label>
                <input
                  type="number"
                  value={requestedLimit}
                  onChange={(e) => setRequestedLimit(e.target.value)}
                  disabled={submittingIncrease}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                  placeholder="Enter requested limit"
                />
                {selectedQuota && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Service Quotas only processes increases, so this must be above the current
                    limit of {selectedQuota.limit.toLocaleString()}.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">Justification</label>
                <input
                  type="text"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  disabled={submittingIncrease}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                  placeholder="Brief reason for increase"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">Business Case</label>
                <textarea
                  value={businessCase}
                  onChange={(e) => setBusinessCase(e.target.value)}
                  disabled={submittingIncrease}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                  rows={4}
                  placeholder="Explain the business impact and need for this increase..."
                />
              </div>

              {/* What submitting does, and what AWS will and will not receive. */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-[11px]">
                  <p className="text-amber-800 font-medium">
                    Submitting files a real request with AWS Service Quotas, which may open an AWS
                    Support case.
                  </p>
                  <p className="text-slate-600">
                    The justification and business case are recorded in AVA only. The AWS API has
                    no field for them, so they are not sent — whoever reviews this at AWS will see
                    the requested value and nothing else.
                  </p>
                </div>
              </div>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledgedRealRequest}
                  onChange={(e) => setAcknowledgedRealRequest(e.target.checked)}
                  disabled={submittingIncrease}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-[11px] text-slate-700">
                  I understand this files a real quota-increase request with AWS.
                </span>
              </label>

              {increaseOutcome && <QuotaOutcomePanel outcome={increaseOutcome} />}
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowRequestModal(false)}
                disabled={submittingIncrease}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {increaseOutcome ? 'Done' : 'Close'}
              </button>
              {/* Withdrawn rather than disabled once a second press could duplicate a real
                  AWS request, or once it is unknown whether one was filed. */}
              {increaseOutcome?.resubmit === 'unsafe' ? (
                <p className="flex-1 py-2 text-[11px] text-slate-500 self-center">
                  {increaseOutcome.resubmitBlockedReason}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitIncrease}
                  disabled={submittingIncrease || preflightBlock !== null}
                  title={preflightBlock ?? 'Send this request to AWS Service Quotas'}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    submittingIncrease || preflightBlock !== null
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {submittingIncrease
                    ? 'Submitting...'
                    : increaseOutcome
                      ? 'Submit Again'
                      : 'Submit Request'}
                </button>
              )}
            </div>

            {/* The reason the control is unavailable, stated rather than left to a tooltip. */}
            {preflightBlock && increaseOutcome?.resubmit !== 'unsafe' && (
              <p className="mt-2 text-[11px] text-slate-500">{preflightBlock}</p>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
