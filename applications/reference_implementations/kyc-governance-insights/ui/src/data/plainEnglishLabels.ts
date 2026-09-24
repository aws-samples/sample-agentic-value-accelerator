/**
 * Plain-English label mapping for non-technical personas.
 * Used by SimulationTab to show human-readable descriptions
 * alongside (or instead of) technical labels.
 */

export interface PlainEnglishLabel {
  technical: string;
  plain: string;
  description: string;
  regulation?: string;
}

export const PLAIN_ENGLISH_RISKS: PlainEnglishLabel[] = [
  { technical: 'Hallucinated content', plain: 'AI Fabrication Risk', description: 'The AI might generate plausible-sounding information that is factually incorrect', regulation: 'PRA SS1/23 Principle 2 — Data Quality' },
  { technical: 'Prompt injection', plain: 'Document Manipulation Attack', description: 'Someone embedded hidden instructions in a document trying to trick the AI', regulation: 'NIST AI RMF — Secure & Resilient' },
  { technical: 'PII exposure', plain: 'Personal Data Leak Risk', description: 'Sensitive personal information might be exposed beyond authorized access', regulation: 'UK GDPR Article 32 — Security of Processing' },
  { technical: 'Synthetic identity', plain: 'Fake Identity Risk', description: 'An applicant may be using fabricated or stolen identity documents', regulation: 'MLR 2017 Regulation 28 — Customer Due Diligence' },
  { technical: 'Data poisoning', plain: 'Corrupted Training Data Risk', description: 'An adversary may have tampered with the data the AI learned from', regulation: 'ISO 42001 A.7.3 — Data for AI Systems' },
  { technical: 'Stale data', plain: 'Outdated Information Risk', description: 'The AI might be using information that is no longer current or accurate', regulation: 'PRA SS1/23 Principle 3 — Ongoing Monitoring' },
  { technical: 'Missed true positives', plain: 'Missed Detection Risk', description: 'The system might fail to flag a genuinely suspicious case', regulation: 'JMLSG Guidance Chapter 5 — Monitoring' },
  { technical: 'Data Exfiltration', plain: 'Unauthorized Data Extraction', description: 'An attempt to make the agent leak sensitive information outside approved channels', regulation: 'PRA SS1/23 Principle 5 — Third Party Dependencies' },
  { technical: 'Token Manipulation', plain: 'Cost/Resource Attack', description: 'An attempt to make the agent consume excessive resources or bypass spending limits' },
];

export const PLAIN_ENGLISH_CONTROLS: PlainEnglishLabel[] = [
  { technical: 'Bedrock Guardrails (input filter)', plain: 'Content Safety Filter (Incoming)', description: 'Blocks harmful, off-topic, or manipulative content before the agent processes it', regulation: 'EU AI Act Article 9 — Risk Management' },
  { technical: 'Guardrails output scan', plain: 'Content Safety Filter (Outgoing)', description: 'Ensures the agent response contains no PII, harmful content, or hallucinated facts', regulation: 'EU AI Act Article 15 — Accuracy & Robustness' },
  { technical: 'Automated Reasoning (formal proof)', plain: 'Mathematical Fact Verification', description: 'Proves with mathematical certainty that specific claims are grounded in source data (99% accuracy)', regulation: 'PRA SS1/23 Principle 2 — Model Validation' },
  { technical: 'Gateway Interceptors', plain: 'Action Interception Layer', description: 'Catches every agent action BEFORE it executes and applies policy rules', regulation: 'CRI Profile GV.OV-01 — Oversight' },
  { technical: 'Lambda (cannot hallucinate)', plain: 'Non-AI Code Verification', description: 'A separate non-AI system independently recalculates and confirms the result — it cannot "make things up"', regulation: 'PRA SS1/23 Principle 2 — Deterministic Validation' },
  { technical: 'IAM least privilege', plain: 'Minimum Permission Enforcement', description: 'Each component can only access the exact data and tools it needs — nothing more', regulation: 'ISO 42001 A.6.2 — Access Control' },
  { technical: 'X-Ray distributed tracing', plain: 'Full Decision Audit Trail', description: 'Every step is logged with timestamps, creating a complete replayable record for auditors', regulation: 'PRA SS1/23 Principle 6 — Record Keeping' },
  { technical: 'KMS + VPC isolation', plain: 'Encryption & Network Isolation', description: 'All data encrypted at rest and in transit, running in an isolated private network', regulation: 'ISO 42001 A.6.6 — Information Security' },
  { technical: 'Parallel deterministic match', plain: 'Independent Double-Check', description: 'A second system independently verifies the same result — like a co-pilot confirming the pilot' },
  { technical: 'Amazon Textract (deterministic OCR)', plain: 'Document Reading (Non-AI)', description: 'Reads text from documents using deterministic algorithms — not generative AI — providing ground truth' },
];

export function getPlainLabel(technical: string, type: 'risk' | 'control'): PlainEnglishLabel | null {
  const source = type === 'risk' ? PLAIN_ENGLISH_RISKS : PLAIN_ENGLISH_CONTROLS;
  return source.find(item => item.technical.toLowerCase() === technical.toLowerCase()) || null;
}
