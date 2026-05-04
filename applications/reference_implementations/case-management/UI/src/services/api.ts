// API service for fetching real transaction data
// Using CORS proxies since direct API access is blocked
import { getConfig } from '../config.js';

export type Decision = 'APPROVE' | 'STEP_UP_REVIEW' | 'HOLD_AND_CASE' | 'REJECT';

export interface ApiTransaction {
  decision: Decision;
  src: string;
  reason_tags: string[];
  dst: string;
  timestamp: string;
  amount: number;
  response: {
    // Key model features for context; see docs/fraud_features.md for details
    features: {
      amount: number;
      dst_sum_1h?: number;
      prior_pair_count: number;
      hour: number;
      src_cnt_1h: number;
      src_sum_1h: number;
      src_near_thr_1h: number;
      dow: number;
      dst_cnt_1h?: number;
      dst_distinct_src_1h?: number;
    };
    model_feature_order: string[];
    decision: string;
    reason_tags: string[];
    fraud_score: number;
  };
  sk: string;
  expire_ts: number;
  pk: string;
  fraud_score: number;
  request: {
    txn_id: string;
    geo: string;
    amount: number;
    dst: string;
    device_id: string;
    src: string;
    timestamp: string;
  };
}

export interface ApiResponse {
  statusCode: number;
  body: string;
}

// Transform API transaction to our internal format
export const transformApiTransaction = (apiTxn: ApiTransaction) => {
  const isFraud = apiTxn.decision === 'HOLD_AND_CASE' || apiTxn.decision === 'STEP_UP_REVIEW' || apiTxn.fraud_score > 0.5;
  const fraudScore = apiTxn.fraud_score; // Keep as decimal (0-1)

  // Map reason tags to fraud types
  const getFraudType = (reasonTags: string[]) => {
    if (reasonTags.includes('SMURFING') || reasonTags.includes('NEAR_REPORTING_THRESHOLD')) return 'money_laundering';
    if (reasonTags.includes('HIGH_VELOCITY')) return 'card_cloning';
    if (reasonTags.includes('FAN_IN_TO_DST')) return 'identity_theft';
    if (reasonTags.includes('TIME_ANOMALY')) return 'synthetic_identity';
    return 'account_takeover';
  };

  // Handle both nested request object and flat structure
  const txnId = (apiTxn as any).txn_id || apiTxn.request?.txn_id || apiTxn.pk;
  const geo = (apiTxn as any).geo || apiTxn.request?.geo || 'Unknown';
  const deviceId = (apiTxn as any).device_id || apiTxn.request?.device_id || 'Unknown';

  return {
    id: txnId,
    accountId: apiTxn.src,
    amount: Math.abs(apiTxn.amount), // Convert negative amounts to positive
    date: apiTxn.timestamp,
    type: 'debit' as const,
    description: `Transaction to ${apiTxn.dst}`,
    merchant: apiTxn.dst,
    isFraud,
    fraudType: isFraud ? getFraudType(apiTxn.reason_tags) : undefined,
    fraudScore,
    geo,
    deviceId,
    decision: apiTxn.decision,
    reasonTags: apiTxn.reason_tags,
  };
};

export const getDecisionPolicy = (decision: Decision) => {
  switch (decision) {
    case 'APPROVE':
      return {
        title: 'APPROVE',
        guidance: 'Execute normally. Log minimal telemetry. No customer friction.',
      };
    case 'STEP_UP_REVIEW':
      return {
        title: 'STEP_UP_REVIEW',
        guidance: 'Pause 5–10m. Send OTP/push/3DS. If pass → approve; else → hold/decline. Log outcome.',
      };
    case 'HOLD_AND_CASE':
      return {
        title: 'HOLD_AND_CASE',
        guidance: 'Hold funds. Create case with features/reason tags/context. Notify analysts. Decide later.',
      };
    case 'REJECT':
    default:
      return {
        title: 'REJECT',
        guidance: 'Decline per policy. Ensure rationale captured in logs/case if needed.',
      };
  }
};

// Fetch transactions from API
export const fetchTransactions = async () => {
  const config = getConfig();
  // Always use the direct AWS endpoint
  const apiUrl = config.API_BASE_URL;

  const timeoutMs = (config.DEV_SETTINGS && config.DEV_SETTINGS.TIMEOUT) || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const endpoints: string[] = [];
  const useProxies = !config.DEV_SETTINGS || config.DEV_SETTINGS.USE_CORS_PROXY !== false;
  if (useProxies) {
    endpoints.push(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`,
      `https://thingproxy.freeboard.io/fetch/${apiUrl}`
    );
  }
  // Try direct last
  endpoints.push(apiUrl);

  const tryParseTransactions = (text: string): ApiTransaction[] | null => {
    try {
      const parsed: any = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && 'statusCode' in parsed && 'body' in parsed) {
        if (parsed.statusCode !== 200) return null;
        return JSON.parse(parsed.body) as ApiTransaction[];
      }
      if (Array.isArray(parsed)) return parsed as ApiTransaction[];
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).transactions)) {
        return (parsed as any).transactions as ApiTransaction[];
      }
      return null;
    } catch {
      return null;
    }
  };

  let lastErr: unknown = null;
  for (let i = 0; i < endpoints.length; i++) {
    try {
      const url = endpoints[i];
      // eslint-disable-next-line no-console
      console.log(`Fetching transactions from: ${url}`);
      const res = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      if (!text || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
        lastErr = new Error('Non-JSON response');
        continue;
      }
      const txns = tryParseTransactions(text);
      if (txns) {
        clearTimeout(timeoutId);
        // eslint-disable-next-line no-console
        console.log(`Fetched ${txns.length} transactions`);
        return txns.map(transformApiTransaction);
      }
      lastErr = new Error('Unrecognized response');
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  clearTimeout(timeoutId);
  throw new Error(`All CORS proxies failed. Last error: ${lastErr instanceof Error ? lastErr.message : 'Unknown error'}`);
};

// Fetch transaction statistics
export const fetchTransactionStats = async () => {
  try {
    const transactions = await fetchTransactions();
    
    const totalTransactions = transactions.length;
    const fraudTransactions = transactions.filter(t => t.isFraud).length;
    const fraudRate = totalTransactions > 0 ? (fraudTransactions / totalTransactions) * 100 : 0;
    
    // Count by decision type
    const decisionCounts = transactions.reduce((acc, txn) => {
      const decision = txn.decision || 'UNKNOWN';
      acc[decision] = (acc[decision] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Count high priority cases (HOLD_AND_CASE)
    const highPriorityCases = decisionCounts['HOLD_AND_CASE'] || 0;
    
    return {
      totalTransactions,
      fraudTransactions,
      fraudRate,
      highPriorityCases,
      decisionCounts,
    };
    
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching transaction stats:', error);
    // Return default stats when API fails
    return {
      totalTransactions: 0,
      fraudTransactions: 0,
      fraudRate: 0,
      highPriorityCases: 0,
      decisionCounts: {},
    };
  }
};

// Generate SARS report via AgentCore SAR Agent
// In production (Amplify): calls API Gateway → Lambda → DynamoDB
// In local dev: calls localhost:3001 proxy
export const generateSarsReport = async (transactions: any[], options?: { reporter?: string; notes?: string }) => {
  const config = getConfig();
  const sarApiBase = config.SAR_API_URL || 'http://localhost:3001';
  const transaction = transactions[0];

  const res = await fetch(`${sarApiBase}/api/sars-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      src: transaction?.accountId,
      transaction: {
        id: transaction?.id,
        accountId: transaction?.accountId,
        merchant: transaction?.merchant,
        amount: transaction?.amount,
        date: transaction?.date,
        decision: transaction?.decision,
        reasonTags: transaction?.reasonTags,
        fraudScore: transaction?.fraudScore,
        geo: transaction?.geo,
        deviceId: transaction?.deviceId,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`SAR Agent proxy returned ${res.status}`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'SAR report generation failed');
  }

  const agentText = typeof data.report === 'string' ? data.report : JSON.stringify(data.report, null, 2);

  // Return the agent's markdown narrative as the blob (readable text)
  return new Blob([agentText], { type: 'text/plain' });
};
