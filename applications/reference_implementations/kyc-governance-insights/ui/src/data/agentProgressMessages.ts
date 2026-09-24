/**
 * Simulated progress messages that reflect what the KYC agents are actually doing.
 * Displayed during the live API polling phase to keep the audience engaged.
 * Each message appears at the specified delay (cumulative seconds from start).
 */
export interface ProgressMessage {
  delay: number; // seconds from start
  agent: string;
  message: string;
}

export const AGENT_PROGRESS_MESSAGES: ProgressMessage[] = [
  { delay: 1, agent: 'Orchestrator', message: 'KYC assessment initiated. Spinning up AgentCore container...' },
  { delay: 3, agent: 'AgentCore', message: 'Container ready. Initializing Credit Analyst + Compliance Officer agents.' },
  { delay: 5, agent: 'Credit Analyst', message: 'Retrieving financial data from S3 (profile + transactions)...' },
  { delay: 8, agent: 'Credit Analyst', message: 'Analysing D/E ratio, current ratio, profit margins...' },
  { delay: 11, agent: 'Credit Analyst', message: 'Evaluating payment history (50 invoices, 24-month window)...' },
  { delay: 14, agent: 'Credit Analyst', message: 'Computing credit risk score using weighted factors...' },
  { delay: 16, agent: 'Compliance Officer', message: 'Querying sanctions databases via World-Check (OFAC, UN, EU, UK HMT)...' },
  { delay: 19, agent: 'Compliance Officer', message: 'PEP screening all beneficial owners (3 UBOs)...' },
  { delay: 22, agent: 'Compliance Officer', message: 'Running adverse media check across news sources...' },
  { delay: 25, agent: 'Compliance Officer', message: 'Geographic risk assessment — evaluating jurisdictions...' },
  { delay: 28, agent: 'Compliance Officer', message: 'AML transaction pattern analysis (12-month lookback)...' },
  { delay: 31, agent: 'Lambda Validator', message: 'Independent recalculation — verifying all numeric claims...' },
  { delay: 34, agent: 'LLM-as-Judge', message: 'Quality gate — checking for bias, completeness, accuracy...' },
  { delay: 37, agent: 'Synthesizer', message: 'Generating structured recommendation from agent findings...' },
  { delay: 40, agent: 'Policy Engine', message: 'Evaluating 3-layer policy (org → app → request)...' },
  { delay: 43, agent: 'System', message: 'Finalizing assessment. Writing to DynamoDB...' },
  { delay: 46, agent: 'System', message: 'Assessment complete. Returning structured result.' },
];
