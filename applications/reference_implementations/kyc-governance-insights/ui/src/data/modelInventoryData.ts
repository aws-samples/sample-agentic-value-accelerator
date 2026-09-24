// =============================================================================
// modelInventoryData.ts — Iteration 23: AI Model Inventory / Register
// EU AI Act Annex VIII–compliant registry of AI models in the KYC Banking system
// =============================================================================

export type RiskTier = 'High' | 'Limited' | 'Minimal';
export type ValidationStatus = 'validated' | 'expiring' | 'overdue';

export interface PerformanceMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  reasoningQuality?: number; // 0-100 for LLMs
  latencyP50Ms?: number;
  latencyP99Ms?: number;
}

export interface ModelEntry {
  id: string;
  name: string;
  version: string;
  provider: string;
  riskTier: RiskTier;
  purpose: string;
  dataInputs: string[];
  outputType: string;
  downstreamConsumers: string[];
  lastValidated: Date;
  validationCadence: number; // days
  capabilities: string;
  limitations: string;
  trainingDataDescription: string;
  biasAssessmentDate: Date;
  biasAssessmentResult: string;
  performanceMetrics: PerformanceMetrics;
  regulatoryReferences: string[];
}

// --- Dynamic date calculations ---
const now = new Date();
const daysMs = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * daysMs);
}

// --- Utility functions ---

export function computeValidationStatus(model: ModelEntry): ValidationStatus {
  const nextDue = new Date(model.lastValidated.getTime() + model.validationCadence * daysMs);
  const daysRemaining = (nextDue.getTime() - now.getTime()) / daysMs;
  if (daysRemaining < 0) return 'overdue';
  if (daysRemaining <= 60) return 'expiring';
  return 'validated';
}

export function getNextValidationDate(model: ModelEntry): Date {
  return new Date(model.lastValidated.getTime() + model.validationCadence * daysMs);
}

export function getDaysUntilValidation(model: ModelEntry): number {
  const nextDue = getNextValidationDate(model);
  return Math.round((nextDue.getTime() - now.getTime()) / daysMs);
}

// --- Model Inventory Data ---

export const modelInventory: ModelEntry[] = [
  {
    id: 'model-claude-sonnet',
    name: 'Claude Sonnet',
    version: '4.5',
    provider: 'AWS Bedrock',
    riskTier: 'High',
    purpose: 'Sanctions reasoning, adverse media analysis, compliance narrative generation',
    dataInputs: [
      'Customer identity documents (structured)',
      'Sanctions database query results',
      'PEP screening results',
      'Adverse media search results',
      'Previous KYC assessment history',
    ],
    outputType: 'Structured JSON: risk assessment, sanctions determination, compliance narrative',
    downstreamConsumers: ['Cedar Policy Engine', 'Bedrock Guardrail', 'KYC Decision API', 'SAR Generator'],
    lastValidated: daysAgo(16),
    validationCadence: 180, // 6 months
    capabilities: 'Advanced reasoning for complex sanctions scenarios. Multi-hop deduction across related entities. Regulatory narrative generation meeting FCA reporting standards.',
    limitations: 'Cannot access real-time sanctions lists directly (relies on tool calls). May hallucinate entity relationships not supported by source documents. Requires guardrail grounding check on output.',
    trainingDataDescription: 'Anthropic general pre-training corpus (public internet data to early 2025). No customer-specific fine-tuning. Prompt engineering only.',
    biasAssessmentDate: daysAgo(30),
    biasAssessmentResult: 'Pass — no statistically significant bias detected across protected characteristics (ethnicity, nationality, gender) in sanctions screening decisions. Sample: 2,000 synthetic cases.',
    performanceMetrics: {
      reasoningQuality: 94,
      accuracy: 97.2,
      precision: 96.8,
      recall: 97.6,
      latencyP50Ms: 1800,
      latencyP99Ms: 4200,
    },
    regulatoryReferences: [
      'EU AI Act Art. 6 (High-risk classification — Annex III §5(b) creditworthiness)',
      'PRA SS1/23 Principle 1 (model identification)',
      'FCA SYSC 6.1 (systems and controls)',
      'ISO 42001:2023 §6.1 (risk assessment)',
    ],
  },
  {
    id: 'model-nova-pro',
    name: 'Nova Pro',
    version: '1.0',
    provider: 'AWS Bedrock',
    riskTier: 'Limited',
    purpose: 'Risk classification and credit scoring',
    dataInputs: [
      'Financial statements (balance sheet, P&L)',
      'Payment history records',
      'Company registration data',
      'Industry classification codes',
    ],
    outputType: 'Structured JSON: risk_score (0-100), risk_tier (LOW/MEDIUM/HIGH), confidence interval',
    downstreamConsumers: ['Cedar Policy Engine (threshold evaluation)', 'KYC Report Generator'],
    lastValidated: daysAgo(30),
    validationCadence: 90, // quarterly
    capabilities: 'Fast numerical risk scoring with explainable factor weights. Consistent scoring across similar entity profiles. Low latency suitable for real-time decisioning.',
    limitations: 'Limited reasoning depth — cannot explain complex multi-factor interactions. Trained on UK/EU financial data; may underperform on non-standard corporate structures.',
    trainingDataDescription: 'AWS proprietary pre-training. No customer data fine-tuning. Risk scoring via structured prompt with financial data injection.',
    biasAssessmentDate: daysAgo(45),
    biasAssessmentResult: 'Partial — geographic bias detected (Caribbean jurisdictions score 8% higher risk on average). Mitigation: Cedar policy adjustment for jurisdiction weighting. Re-assessment scheduled.',
    performanceMetrics: {
      accuracy: 91.4,
      precision: 89.2,
      recall: 93.8,
      f1: 91.5,
      latencyP50Ms: 340,
      latencyP99Ms: 820,
    },
    regulatoryReferences: [
      'EU AI Act Art. 52 (Limited risk — transparency obligations)',
      'PRA SS1/23 Principle 3 (model performance monitoring)',
      'FCA COBS 2.1 (acting in client\'s best interests)',
    ],
  },
  {
    id: 'model-claude-haiku',
    name: 'Claude Haiku',
    version: '3.5',
    provider: 'AWS Bedrock',
    riskTier: 'Minimal',
    purpose: 'Document triage and routing',
    dataInputs: [
      'Uploaded document metadata (filename, type, size)',
      'First 500 tokens of document text',
      'Customer case context (ID, assessment type)',
    ],
    outputType: 'Structured JSON: document_category, routing_destination, confidence_score',
    downstreamConsumers: ['Document Management System', 'Case Routing Engine'],
    lastValidated: daysAgo(24),
    validationCadence: 365, // annual
    capabilities: 'Ultra-fast document classification (sub-200ms). High accuracy on standard UK financial document types (passports, utility bills, company filings, bank statements).',
    limitations: 'Cannot read scanned/image documents (requires OCR preprocessing). Limited to English-language documents. Classification only — no content extraction.',
    trainingDataDescription: 'Anthropic general pre-training corpus. No fine-tuning. Classification via few-shot prompt with 12 document type examples.',
    biasAssessmentDate: daysAgo(60),
    biasAssessmentResult: 'Pass — no bias detected in document routing decisions. All document types routed with equal priority regardless of customer demographics.',
    performanceMetrics: {
      accuracy: 98.7,
      precision: 98.1,
      recall: 99.2,
      f1: 98.6,
      latencyP50Ms: 120,
      latencyP99Ms: 280,
    },
    regulatoryReferences: [
      'EU AI Act Art. 52 (Minimal risk — no specific obligations)',
      'PRA SS1/23 Principle 1 (model inventory)',
    ],
  },
];

// --- Summary for fleet/executive view ---

export function getModelInventorySummary() {
  const statuses = modelInventory.map(m => ({
    model: m,
    status: computeValidationStatus(m),
  }));

  return {
    total: modelInventory.length,
    validated: statuses.filter(s => s.status === 'validated').length,
    expiring: statuses.filter(s => s.status === 'expiring').length,
    overdue: statuses.filter(s => s.status === 'overdue').length,
    highRisk: modelInventory.filter(m => m.riskTier === 'High').length,
  };
}
