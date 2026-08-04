/**
 * Shared data for Data Governance module
 *
 * Mock data for FSI-grade AI data governance demonstration.
 * In production, this would integrate with:
 * - AWS Glue Data Catalog
 * - AWS Lake Formation
 * - Amazon Macie
 * - SageMaker Catalog / OpenLineage
 */

export const tooltipStyle = {
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#f1f5f9',
  fontSize: '11px',
  borderRadius: '6px',
};

// ── AI Data Readiness Assessment ──
export const READINESS_DIMENSIONS = [
  {
    id: 'quality',
    name: 'Data Quality',
    score: 72,
    target: 90,
    weight: 0.20,
    status: 'at-risk' as const,
    description: 'Accuracy, completeness, consistency, and validity of data used in AI models',
    findings: [
      '3 datasets have >5% null rate in key fields',
      'Loan application data has 99.2% completeness',
      'Claims data has duplicate records (0.8%)'
    ],
    actions: [
      'Deploy Glue Data Quality rules on all AI-feeding datasets',
      'Set up automated anomaly detection for data drift',
      'Remediate duplicate records in claims pipeline'
    ]
  },
  {
    id: 'lineage',
    name: 'Data Lineage',
    score: 45,
    target: 85,
    weight: 0.15,
    status: 'not-met' as const,
    description: 'End-to-end traceability from source through transformation to AI model consumption',
    findings: [
      'Only 2 of 6 AI use cases have full lineage documented',
      'No automated lineage capture from ETL pipelines',
      'SageMaker Catalog not yet configured'
    ],
    actions: [
      'Enable SageMaker Catalog with OpenLineage integration',
      'Instrument Glue jobs with lineage metadata',
      'Map lineage for all 6 deployed use cases'
    ]
  },
  {
    id: 'freshness',
    name: 'Data Freshness',
    score: 68,
    target: 85,
    weight: 0.10,
    status: 'at-risk' as const,
    description: 'How current the data is relative to the AI use case requirements',
    findings: [
      'Loan data refreshed daily (meets SLA)',
      'Fraud data is near-real-time (meets SLA)',
      'Regulatory reference data is 45 days stale (exceeds 30-day SLA)'
    ],
    actions: [
      'Set up freshness monitoring with CloudWatch custom metrics',
      'Automate regulatory data refresh pipeline',
      'Define freshness SLAs per data domain'
    ]
  },
  {
    id: 'access',
    name: 'Access Control',
    score: 78,
    target: 90,
    weight: 0.15,
    status: 'at-risk' as const,
    description: 'Fine-grained access policies ensuring only authorized users and models can consume data',
    findings: [
      'Lake Formation policies cover 80% of AI datasets',
      'Column-level security on PII fields',
      '3 datasets still use broad IAM policies instead of Lake Formation'
    ],
    actions: [
      'Migrate remaining 3 datasets to Lake Formation',
      'Implement row-level security for multi-tenant data',
      'Audit all Bedrock model access to training data'
    ]
  },
  {
    id: 'classification',
    name: 'Data Classification',
    score: 85,
    target: 95,
    weight: 0.15,
    status: 'met' as const,
    description: 'Systematic classification of all data assets by sensitivity level and regulatory requirements',
    findings: [
      '27 data types classified across 5 sensitivity levels',
      'Macie scanning active on S3 buckets',
      'SageMaker Catalog restricted classification terms not yet configured'
    ],
    actions: [
      'Configure restricted classification terms in SageMaker Catalog',
      'Extend classification to streaming data sources',
      'Automate classification for new data assets'
    ]
  },
  {
    id: 'ownership',
    name: 'Data Ownership',
    score: 55,
    target: 85,
    weight: 0.10,
    status: 'not-met' as const,
    description: 'Clear domain ownership with defined stewards, SLAs, and accountability',
    findings: [
      'Only 3 of 6 data domains have assigned stewards',
      'No formal data product SLAs defined',
      'Cross-domain data sharing agreements incomplete'
    ],
    actions: [
      'Assign data stewards for Insurance, Contact Center, and Wealth domains',
      'Define data product SLAs (freshness, quality, availability)',
      'Establish cross-domain data sharing agreements'
    ]
  },
  {
    id: 'compliance',
    name: 'Regulatory Compliance',
    score: 82,
    target: 95,
    weight: 0.15,
    status: 'at-risk' as const,
    description: 'Data handling meets all regulatory requirements (GLBA, GDPR, CCPA, HIPAA, PCI DSS)',
    findings: [
      'GLBA compliance verified for lending data',
      'GDPR data residency controls in place',
      'HIPAA BAA coverage gaps for 2 vendor data sources'
    ],
    actions: [
      'Complete HIPAA BAA for remaining 2 vendors',
      'Implement automated GDPR data subject request pipeline',
      'Add PCI DSS scope validation for payment data in AI pipelines'
    ]
  },
];

export const READINESS_OVERALL = (() => {
  const weighted = READINESS_DIMENSIONS.reduce((s, d) => s + d.score * d.weight, 0);
  return Math.round(weighted);
})();

// ── Data Governance Maturity Self-Assessment ──
export const MATURITY_QUESTIONS = [
  {
    dimension: 'Data Quality',
    question: 'How do you manage data quality for AI workloads?',
    options: [
      { label: 'No formal quality checks', score: 1, level: 'Initial' },
      { label: 'Manual spot checks on key datasets', score: 2, level: 'Developing' },
      { label: 'Automated rules on most AI-feeding datasets', score: 3, level: 'Defined' },
      { label: 'Continuous monitoring with anomaly detection and auto-remediation', score: 4, level: 'Optimizing' },
    ]
  },
  {
    dimension: 'Data Lineage',
    question: 'Can you trace data from source to AI model inference?',
    options: [
      { label: 'No lineage tracking', score: 1, level: 'Initial' },
      { label: 'Documented for some datasets manually', score: 2, level: 'Developing' },
      { label: 'Automated lineage for most AI pipelines', score: 3, level: 'Defined' },
      { label: 'Full end-to-end lineage with impact analysis', score: 4, level: 'Optimizing' },
    ]
  },
  {
    dimension: 'Data Classification',
    question: 'How is sensitive data identified and classified?',
    options: [
      { label: 'No classification scheme', score: 1, level: 'Initial' },
      { label: 'Basic labels (public/internal/confidential)', score: 2, level: 'Developing' },
      { label: 'Multi-level classification with PII/PHI/PCI detection', score: 3, level: 'Defined' },
      { label: 'Automated classification with policy enforcement and audit', score: 4, level: 'Optimizing' },
    ]
  },
  {
    dimension: 'Access Control',
    question: 'How do you control who and what can access AI training/inference data?',
    options: [
      { label: 'Broad IAM policies, no fine-grained control', score: 1, level: 'Initial' },
      { label: 'Role-based access, some dataset-level controls', score: 2, level: 'Developing' },
      { label: 'Column/row-level security, Lake Formation policies', score: 3, level: 'Defined' },
      { label: 'Zero-trust with purpose-based access, full audit trail', score: 4, level: 'Optimizing' },
    ]
  },
  {
    dimension: 'Data Ownership',
    question: 'Are data domains owned with clear accountability?',
    options: [
      { label: 'No formal ownership or stewardship', score: 1, level: 'Initial' },
      { label: 'Some domains have informal owners', score: 2, level: 'Developing' },
      { label: 'All domains have stewards with defined SLAs', score: 3, level: 'Defined' },
      { label: 'Data products with published contracts, SLOs, and consumers', score: 4, level: 'Optimizing' },
    ]
  },
  {
    dimension: 'Regulatory Compliance',
    question: 'How do you ensure data handling meets regulatory requirements?',
    options: [
      { label: 'Reactive — address issues when found in audits', score: 1, level: 'Initial' },
      { label: 'Checklist-based compliance for major regulations', score: 2, level: 'Developing' },
      { label: 'Framework-aligned with continuous monitoring', score: 3, level: 'Defined' },
      { label: 'Automated compliance with evidence generation and gap remediation', score: 4, level: 'Optimizing' },
    ]
  },
  {
    dimension: 'AI-Specific Governance',
    question: 'Do you have AI-specific data governance controls?',
    options: [
      { label: 'No AI-specific data controls', score: 1, level: 'Initial' },
      { label: 'Basic guardrails (PII filtering) on some models', score: 2, level: 'Developing' },
      { label: 'Guardrails + grounding checks + drift monitoring on all models', score: 3, level: 'Defined' },
      { label: 'Full AI data lifecycle governance with hallucination detection, bias monitoring, and continuous evaluation', score: 4, level: 'Optimizing' },
    ]
  },
];

export const MATURITY_LEVELS = [
  { level: 'Initial', range: [1, 1.5] as [number, number], color: '#ef4444', desc: 'Ad-hoc, no formal processes. High risk of data issues affecting AI outputs.', actions: ['Establish data classification scheme', 'Assign data owners for AI-feeding datasets', 'Enable basic PII detection guardrails'] },
  { level: 'Developing', range: [1.5, 2.5] as [number, number], color: '#f59e0b', desc: 'Some processes exist but inconsistent. Gaps in coverage and automation.', actions: ['Deploy automated data quality rules', 'Implement access controls (Lake Formation)', 'Document data lineage for critical use cases'] },
  { level: 'Defined', range: [2.5, 3.5] as [number, number], color: '#3b82f6', desc: 'Structured governance with good coverage. Most AI workloads governed.', actions: ['Add continuous monitoring and alerting', 'Implement framework alignment (9 frameworks)', 'Automate compliance evidence generation'] },
  { level: 'Optimizing', range: [3.5, 4] as [number, number], color: '#10b981', desc: 'Continuous improvement, full automation, proactive governance.', actions: ['Enable predictive data quality (anomaly detection)', 'Implement data mesh / data products', 'Achieve certification (ISO 42001)'] },
];

// ── Data Domains ──
export const DATA_DOMAINS = [
  {
    id: 'lending',
    name: 'Consumer Lending',
    steward: 'J. Martinez',
    stewardTitle: 'VP Credit Risk',
    datasets: 12,
    models: 2,
    freshnessSLA: 'Daily',
    qualityScore: 94,
    accessPolicy: 'Lake Formation',
    classification: 'Restricted',
    useCases: ['UC-001 Loan Underwriting'],
    color: '#3b82f6',
    dataProducts: [
      { name: 'Loan Application Dataset', records: '2.8M', freshness: '< 24h', quality: 96, consumers: ['Nova Pro (UC-001)', 'Fair Lending Analysis'] },
      { name: 'Credit Bureau Scores', records: '1.2M', freshness: '< 24h', quality: 99, consumers: ['Nova Pro (UC-001)', 'Credit Scoring Model'] },
      { name: 'Adverse Action History', records: '45K', freshness: '< 48h', quality: 92, consumers: ['ECOA Reporting', 'Bias Monitoring'] },
    ]
  },
  {
    id: 'insurance',
    name: 'Insurance Operations',
    steward: 'Unassigned',
    stewardTitle: 'Needs Assignment',
    datasets: 8,
    models: 1,
    freshnessSLA: 'Daily',
    qualityScore: 88,
    accessPolicy: 'Lake Formation',
    classification: 'Highly Restricted',
    useCases: ['UC-002 Claims Processing'],
    color: '#10b981',
    dataProducts: [
      { name: 'Claims Dataset', records: '1.5M', freshness: '< 24h', quality: 91, consumers: ['Claude 3.7 (UC-002)'] },
      { name: 'Policy Holder Records', records: '800K', freshness: '< 48h', quality: 85, consumers: ['Underwriting Model'] },
    ]
  },
  {
    id: 'fraud',
    name: 'Fraud & BSA/AML',
    steward: 'BSA Officer',
    stewardTitle: 'VP Fraud Prevention',
    datasets: 15,
    models: 1,
    freshnessSLA: 'Near Real-Time',
    qualityScore: 96,
    accessPolicy: 'Lake Formation + Row-Level',
    classification: 'Restricted',
    useCases: ['UC-003 BSA/AML Monitoring'],
    color: '#ef4444',
    dataProducts: [
      { name: 'Transaction Stream', records: '89M', freshness: '< 5 min', quality: 98, consumers: ['Nova Pro (UC-003)', 'Pattern Detection'] },
      { name: 'SAR Filing History', records: '2.1K', freshness: '< 24h', quality: 99, consumers: ['SAR Generation', 'Regulatory Reporting'] },
      { name: 'OFAC Watchlist', records: '12K', freshness: '< 1h', quality: 100, consumers: ['Real-time Screening'] },
    ]
  },
  {
    id: 'contact',
    name: 'Contact Center',
    steward: 'Unassigned',
    stewardTitle: 'Needs Assignment',
    datasets: 6,
    models: 1,
    freshnessSLA: 'Real-Time',
    qualityScore: 82,
    accessPolicy: 'IAM (needs migration)',
    classification: 'Confidential',
    useCases: ['UC-004 Customer Chatbot'],
    color: '#f97316',
    dataProducts: [
      { name: 'Call Transcripts', records: '450K', freshness: 'Real-time', quality: 85, consumers: ['Contact Lens', 'Q in Connect'] },
      { name: 'Customer Interaction History', records: '2.1M', freshness: '< 24h', quality: 80, consumers: ['Agent Assist'] },
    ]
  },
  {
    id: 'wealth',
    name: 'Wealth Management',
    steward: 'Unassigned',
    stewardTitle: 'Needs Assignment',
    datasets: 5,
    models: 1,
    freshnessSLA: 'Daily',
    qualityScore: 90,
    accessPolicy: 'IAM (needs migration)',
    classification: 'Restricted',
    useCases: ['UC-005 Wealth Suitability'],
    color: '#f59e0b',
    dataProducts: [
      { name: 'Client Portfolio Data', records: '620K', freshness: '< 24h', quality: 92, consumers: ['Claude 3.7 (UC-005)'] },
      { name: 'Market Data Feed', records: 'Streaming', freshness: 'Real-time', quality: 95, consumers: ['Suitability Engine'] },
    ]
  },
  {
    id: 'regulatory',
    name: 'Regulatory & Compliance',
    steward: 'CCO',
    stewardTitle: 'Chief Compliance Officer',
    datasets: 10,
    models: 0,
    freshnessSLA: '30 Days',
    qualityScore: 75,
    accessPolicy: 'Lake Formation',
    classification: 'Internal',
    useCases: ['Regulatory Q&A Agent', 'Compliance Gap Agent'],
    color: '#8b5cf6',
    dataProducts: [
      { name: 'Regulatory Knowledge Base', records: '8.5K docs', freshness: '45 days (STALE)', quality: 70, consumers: ['Regulatory Q&A Agent (RAG)'] },
      { name: 'Framework Requirements', records: '230 objectives', freshness: '< 30 days', quality: 95, consumers: ['Compliance Gap Agent'] },
    ]
  },
];

// ── Data Quality Rules ──
export const QUALITY_RULES = [
  { dataset: 'Loan Applications', rule: 'Completeness', field: 'credit_score', threshold: '>99%', actual: '99.2%', status: 'pass' as const, lastRun: '2h ago' },
  { dataset: 'Loan Applications', rule: 'Validity', field: 'loan_amount', threshold: '>0 AND <10M', actual: '100%', status: 'pass' as const, lastRun: '2h ago' },
  { dataset: 'Loan Applications', rule: 'Uniqueness', field: 'application_id', threshold: '100%', actual: '100%', status: 'pass' as const, lastRun: '2h ago' },
  { dataset: 'Claims Data', rule: 'Completeness', field: 'claim_type', threshold: '>98%', actual: '97.1%', status: 'fail' as const, lastRun: '4h ago' },
  { dataset: 'Claims Data', rule: 'Uniqueness', field: 'claim_id', threshold: '100%', actual: '99.2%', status: 'fail' as const, lastRun: '4h ago' },
  { dataset: 'Transaction Stream', rule: 'Timeliness', field: 'event_timestamp', threshold: '<5 min lag', actual: '2.3 min', status: 'pass' as const, lastRun: '1 min ago' },
  { dataset: 'Transaction Stream', rule: 'Completeness', field: 'amount', threshold: '>99.9%', actual: '99.98%', status: 'pass' as const, lastRun: '1 min ago' },
  { dataset: 'Customer Interactions', rule: 'Completeness', field: 'customer_id', threshold: '>95%', actual: '92.4%', status: 'fail' as const, lastRun: '6h ago' },
  { dataset: 'Regulatory KB', rule: 'Freshness', field: 'last_updated', threshold: '<30 days', actual: '45 days', status: 'fail' as const, lastRun: '24h ago' },
  { dataset: 'Credit Bureau', rule: 'Accuracy', field: 'score_range', threshold: '300-850', actual: '100%', status: 'pass' as const, lastRun: '12h ago' },
  { dataset: 'OFAC Watchlist', rule: 'Freshness', field: 'list_version', threshold: '<24h', actual: '< 1h', status: 'pass' as const, lastRun: '45 min ago' },
  { dataset: 'Portfolio Data', rule: 'Completeness', field: 'risk_profile', threshold: '>95%', actual: '96.8%', status: 'pass' as const, lastRun: '8h ago' },
];

// ── Data Lineage Flows ──
export const LINEAGE_FLOWS = [
  {
    useCase: 'Loan Underwriting (UC-001)',
    stages: [
      { name: 'Source', system: 'Core Banking (Fiserv)', data: 'Loan applications, customer profiles', format: 'API/JDBC', pii: true },
      { name: 'Ingest', system: 'AWS Glue ETL', data: 'Raw → S3 landing zone', format: 'Parquet', pii: true },
      { name: 'Transform', system: 'Glue + Step Functions', data: 'Clean, deduplicate, enrich with bureau data', format: 'Parquet', pii: true },
      { name: 'Classify', system: 'Macie + Guardrails', data: 'PII detected, sensitivity tagged', format: 'Tagged Parquet', pii: true },
      { name: 'Protect', system: 'Bedrock Guardrails', data: 'PII redacted/tokenized before model', format: 'Sanitized JSON', pii: false },
      { name: 'Serve', system: 'Bedrock (Nova Pro)', data: 'Model receives sanitized input', format: 'API', pii: false },
      { name: 'Decide', system: 'Application Logic', data: 'Decision + LIME/SHAP explanation', format: 'JSON', pii: false },
      { name: 'Audit', system: 'CloudTrail + S3', data: 'Full decision audit trail (7yr retention)', format: 'JSONL', pii: false },
    ]
  },
  {
    useCase: 'Claims Processing (UC-002)',
    stages: [
      { name: 'Source', system: 'Claims Management System', data: 'Claims, policy data, medical records', format: 'API', pii: true },
      { name: 'Ingest', system: 'AWS Glue ETL', data: 'Raw → S3 landing zone', format: 'Parquet', pii: true },
      { name: 'Transform', system: 'Glue + Lambda', data: 'Normalize, link to policy, extract key fields', format: 'Parquet', pii: true },
      { name: 'Classify', system: 'Macie + Comprehend Medical', data: 'PHI detected, HIPAA tagged', format: 'Tagged Parquet', pii: true },
      { name: 'Protect', system: 'Bedrock Guardrails', data: 'PHI redacted, Safe Harbor applied', format: 'Sanitized JSON', pii: false },
      { name: 'Serve', system: 'Bedrock (Claude 3.7)', data: 'Model receives sanitized claim', format: 'API', pii: false },
      { name: 'Decide', system: 'Application Logic', data: 'Adjudication decision + explanation', format: 'JSON', pii: false },
      { name: 'Audit', system: 'CloudTrail + S3', data: 'Full audit trail with HIPAA compliance', format: 'JSONL', pii: false },
    ]
  },
  {
    useCase: 'Fraud Detection (UC-003)',
    stages: [
      { name: 'Source', system: 'Transaction Processing', data: 'Real-time transaction stream', format: 'Kinesis', pii: true },
      { name: 'Ingest', system: 'Kinesis Data Streams', data: 'Sub-second ingestion', format: 'JSON', pii: true },
      { name: 'Transform', system: 'Lambda + Kinesis Analytics', data: 'Enrich with customer profile, velocity checks', format: 'JSON', pii: true },
      { name: 'Classify', system: 'Bedrock Guardrails', data: 'PCI data masked, account numbers tokenized', format: 'Masked JSON', pii: false },
      { name: 'Serve', system: 'Bedrock (Nova Pro)', data: 'Pattern analysis on sanitized data', format: 'API', pii: false },
      { name: 'Alert', system: 'SNS + EventBridge', data: 'SAR generation, alert routing', format: 'JSON', pii: false },
    ]
  },
];

// ── Data Provenance Records ──
export const PROVENANCE_RECORDS = [
  { dataset: 'Loan Application Dataset', source: 'Core Banking (Fiserv)', sourceType: 'Internal System of Record', ingestionMethod: 'JDBC via Glue', hashAlgorithm: 'SHA-256', lastVerified: '2026-05-27', integrityStatus: 'Verified' as const, retentionPolicy: '7 years (SR 26-2)', encryptionAtRest: 'AES-256 (KMS)', encryptionInTransit: 'TLS 1.3' },
  { dataset: 'Credit Bureau Scores', source: 'Experian/Equifax/TransUnion', sourceType: 'Third-Party Vendor', ingestionMethod: 'SFTP → S3 → Glue', hashAlgorithm: 'SHA-256', lastVerified: '2026-05-27', integrityStatus: 'Verified' as const, retentionPolicy: '7 years (FCRA)', encryptionAtRest: 'AES-256 (KMS)', encryptionInTransit: 'TLS 1.3' },
  { dataset: 'Claims Dataset', source: 'Claims Management System', sourceType: 'Internal System of Record', ingestionMethod: 'API via Glue', hashAlgorithm: 'SHA-256', lastVerified: '2026-05-26', integrityStatus: 'Verified' as const, retentionPolicy: '10 years (NAIC)', encryptionAtRest: 'AES-256 (KMS)', encryptionInTransit: 'TLS 1.3' },
  { dataset: 'Transaction Stream', source: 'Core Banking + Card Network', sourceType: 'Internal + Third-Party', ingestionMethod: 'Kinesis Data Streams', hashAlgorithm: 'SHA-256 (per batch)', lastVerified: '2026-05-28', integrityStatus: 'Verified' as const, retentionPolicy: '5 years (BSA/AML)', encryptionAtRest: 'AES-256 (KMS)', encryptionInTransit: 'TLS 1.3' },
  { dataset: 'OFAC Watchlist', source: 'US Treasury / FinCEN', sourceType: 'Government Regulatory', ingestionMethod: 'API → S3 → Glue', hashAlgorithm: 'SHA-256', lastVerified: '2026-05-28', integrityStatus: 'Verified' as const, retentionPolicy: 'Current + 5 years', encryptionAtRest: 'AES-256 (KMS)', encryptionInTransit: 'TLS 1.3' },
  { dataset: 'Regulatory Knowledge Base', source: 'Federal Register, OCC, CFPB, NAIC', sourceType: 'Government Regulatory', ingestionMethod: 'Web scrape → S3 → Bedrock KB', hashAlgorithm: 'SHA-256', lastVerified: '2026-04-15', integrityStatus: 'Stale (45 days)' as const, retentionPolicy: 'Indefinite', encryptionAtRest: 'AES-256 (KMS)', encryptionInTransit: 'TLS 1.3' },
];

// ── AI Data Pipeline Stages ──
export const PIPELINE_STAGES = [
  { stage: 'Collect', desc: 'Ingest raw data from source systems', aws: 'Glue, Kinesis, DMS, AppFlow', controls: 'Source authentication, schema validation, ingestion logging', quality: 'Schema conformance check' },
  { stage: 'Store', desc: 'Land in secure, encrypted storage', aws: 'S3 (SSE-KMS), Lake Formation', controls: 'Encryption at rest, bucket policies, versioning, access logging', quality: 'Completeness check on landing' },
  { stage: 'Catalog', desc: 'Register in data catalog with metadata', aws: 'SageMaker Catalog, Glue Catalog', controls: 'Classification tags, ownership, sensitivity level, lineage link', quality: 'Metadata completeness' },
  { stage: 'Clean', desc: 'Transform, deduplicate, validate', aws: 'Glue ETL, Glue Data Quality', controls: 'Data quality rules, anomaly detection, null handling', quality: 'Quality score > threshold' },
  { stage: 'Classify', desc: 'Detect and tag sensitive data', aws: 'Macie, Comprehend, Guardrails', controls: 'PII/PHI/PCI detection, sensitivity tagging, HIPAA Safe Harbor', quality: 'Classification coverage > 95%' },
  { stage: 'Protect', desc: 'Redact, tokenize, or anonymize before AI', aws: 'Bedrock Guardrails, Lambda', controls: 'PII redaction, tokenization, generalization, data minimization', quality: 'Zero PII in model input' },
  { stage: 'Serve', desc: 'Deliver to AI model for inference', aws: 'Bedrock, SageMaker, Knowledge Bases', controls: 'Access control, rate limiting, input validation, guardrails', quality: 'Latency SLA, format validation' },
  { stage: 'Audit', desc: 'Log decision and evidence trail', aws: 'CloudTrail, S3, CloudWatch', controls: 'Immutable audit log, 7-year retention, integrity hashing', quality: 'Audit completeness 100%' },
];

// ── Access Control Matrix ──
export const ACCESS_MATRIX = [
  { role: 'Data Engineer', lending: 'Read/Write', insurance: 'Read/Write', fraud: 'Read', contact: 'Read/Write', wealth: 'Read', regulatory: 'Read', piiAccess: 'Masked', method: 'Lake Formation' },
  { role: 'Data Scientist', lending: 'Read', insurance: 'Read', fraud: 'Read', contact: 'Read', wealth: 'Read', regulatory: 'Read', piiAccess: 'Masked', method: 'Lake Formation' },
  { role: 'ML Engineer', lending: 'Read', insurance: 'Read', fraud: 'Read', contact: 'Read', wealth: 'Read', regulatory: 'Read', piiAccess: 'None', method: 'Lake Formation' },
  { role: 'Bedrock Model (Nova Pro)', lending: 'Read (sanitized)', insurance: 'None', fraud: 'Read (sanitized)', contact: 'Read (sanitized)', wealth: 'None', regulatory: 'Read', piiAccess: 'None (guardrails)', method: 'IAM + Guardrails' },
  { role: 'Bedrock Model (Claude 3.7)', lending: 'None', insurance: 'Read (sanitized)', fraud: 'None', contact: 'None', wealth: 'Read (sanitized)', regulatory: 'Read', piiAccess: 'None (guardrails)', method: 'IAM + Guardrails' },
  { role: 'Compliance Officer', lending: 'Read', insurance: 'Read', fraud: 'Read', contact: 'Read', wealth: 'Read', regulatory: 'Read/Write', piiAccess: 'Full (audited)', method: 'Lake Formation + MFA' },
  { role: 'Auditor (3rd Line)', lending: 'Read', insurance: 'Read', fraud: 'Read', contact: 'Read', wealth: 'Read', regulatory: 'Read', piiAccess: 'Full (audited)', method: 'Lake Formation + MFA' },
  { role: 'BSA Officer', lending: 'None', insurance: 'None', fraud: 'Read/Write', contact: 'None', wealth: 'None', regulatory: 'Read', piiAccess: 'Full (audited)', method: 'Lake Formation + MFA' },
];

// ── AI Datasets Catalog ──
export const AI_DATASETS = [
  { name: 'Loan Application Dataset', domain: 'Consumer Lending', records: '2.8M', format: 'Parquet', storage: 'S3 (us-east-1)', sensitivity: 'Restricted', classification: 'PII (SSN, DOB, income)', consumers: ['Nova Pro (UC-001)', 'Fair Lending Analysis', 'Regression Testing'], lineage: 'Core Banking → Glue ETL → S3 → Guardrails → Bedrock', freshness: '< 24h', quality: 96, cataloged: true, awsCatalog: 'SageMaker Catalog', tags: ['lending', 'pii', 'production'] },
  { name: 'Credit Bureau Scores', domain: 'Consumer Lending', records: '1.2M', format: 'Parquet', storage: 'S3 (us-east-1)', sensitivity: 'Restricted', classification: 'PII (credit score, SSN ref)', consumers: ['Nova Pro (UC-001)', 'Credit Scoring Model'], lineage: 'Experian/Equifax → SFTP → S3 → Glue → Bedrock', freshness: '< 24h', quality: 99, cataloged: true, awsCatalog: 'SageMaker Catalog', tags: ['lending', 'third-party', 'production'] },
  { name: 'Claims Dataset', domain: 'Insurance Operations', records: '1.5M', format: 'Parquet', storage: 'S3 (us-east-1)', sensitivity: 'Highly Restricted', classification: 'PHI (diagnosis, medication)', consumers: ['Claude 3.7 (UC-002)'], lineage: 'Claims System → API → Glue → Comprehend Medical → S3 → Bedrock', freshness: '< 24h', quality: 91, cataloged: true, awsCatalog: 'SageMaker Catalog', tags: ['insurance', 'phi', 'hipaa', 'production'] },
  { name: 'Transaction Stream', domain: 'Fraud & BSA/AML', records: '89M/mo', format: 'JSON (streaming)', storage: 'Kinesis → S3', sensitivity: 'Restricted', classification: 'PCI (card numbers, account)', consumers: ['Nova Pro (UC-003)', 'Pattern Detection', 'OFAC Screening'], lineage: 'Core Banking + Card Network → Kinesis → Lambda → S3 → Bedrock', freshness: '< 5 min', quality: 98, cataloged: true, awsCatalog: 'SageMaker Catalog', tags: ['fraud', 'pci', 'real-time', 'production'] },
  { name: 'OFAC Watchlist', domain: 'Fraud & BSA/AML', records: '12K', format: 'JSON', storage: 'S3 (us-east-1)', sensitivity: 'Internal', classification: 'Government regulatory', consumers: ['Real-time Screening', 'Nova Pro (UC-003)'], lineage: 'US Treasury → API → S3 → Glue → Bedrock', freshness: '< 1h', quality: 100, cataloged: true, awsCatalog: 'Glue Catalog', tags: ['fraud', 'regulatory', 'production'] },
  { name: 'Call Transcripts', domain: 'Contact Center', records: '450K/mo', format: 'JSON (streaming)', storage: 'S3 (us-east-1)', sensitivity: 'Confidential', classification: 'PII (names, account refs)', consumers: ['Contact Lens', 'Q in Connect', 'Agent Assist'], lineage: 'Connect → Contact Lens → S3 → Bedrock', freshness: 'Real-time', quality: 85, cataloged: false, awsCatalog: 'Not cataloged', tags: ['contact-center', 'pii', 'production'] },
  { name: 'Client Portfolio Data', domain: 'Wealth Management', records: '620K', format: 'Parquet', storage: 'S3 (us-east-1)', sensitivity: 'Restricted', classification: 'PII (financial holdings)', consumers: ['Claude 3.7 (UC-005)'], lineage: 'Wealth Platform → API → Glue → S3 → Bedrock', freshness: '< 24h', quality: 92, cataloged: false, awsCatalog: 'Not cataloged', tags: ['wealth', 'pii', 'production'] },
  { name: 'Regulatory Knowledge Base', domain: 'Regulatory', records: '8.5K docs', format: 'PDF/HTML → Chunks', storage: 'S3 → Bedrock KB', sensitivity: 'Internal', classification: 'Public regulatory docs', consumers: ['Regulatory Q&A Agent (RAG)'], lineage: 'Federal Register/OCC/CFPB → Scrape → S3 → Bedrock KB', freshness: '45 days (STALE)', quality: 70, cataloged: true, awsCatalog: 'Glue Catalog', tags: ['regulatory', 'rag', 'stale'] },
  { name: 'Synthetic Loan Dataset', domain: 'Testing', records: '500', format: 'CSV', storage: 'S3 (us-east-1)', sensitivity: 'Public', classification: 'No PII (synthetic)', consumers: ['Regression Testing', 'Fair Lending Analysis', 'Model Evaluation'], lineage: 'Generated (Kaggle schema) → S3', freshness: 'Static', quality: 100, cataloged: true, awsCatalog: 'Glue Catalog', tags: ['testing', 'synthetic', 'no-pii'] },
];

// ── Compliance Scorecard ──
export const COMPLIANCE_FRAMEWORKS = [
  {
    id: 'sr-26-2',
    name: 'SR 26-2 (Fed Reserve)',
    description: 'Model Risk Management Guidance for AI/ML',
    status: 'partial' as const,
    score: 78,
    controls: 18,
    implemented: 14,
    requirements: [
      { id: 'SR-1', name: 'Model Inventory', status: 'met' as const, evidence: 'SageMaker Model Registry', gap: null },
      { id: 'SR-2', name: 'Model Documentation', status: 'met' as const, evidence: 'Model Cards in Catalog', gap: null },
      { id: 'SR-3', name: 'Data Lineage', status: 'partial' as const, evidence: 'OpenLineage (partial)', gap: '4 use cases missing lineage' },
      { id: 'SR-4', name: 'Validation Testing', status: 'met' as const, evidence: 'Automated eval pipelines', gap: null },
      { id: 'SR-5', name: 'Ongoing Monitoring', status: 'partial' as const, evidence: 'CloudWatch + SageMaker', gap: 'Drift detection not automated' },
      { id: 'SR-6', name: 'Audit Trail', status: 'met' as const, evidence: 'CloudTrail + S3 (7yr)', gap: null },
    ]
  },
  {
    id: 'osfi-e23',
    name: 'OSFI E-23 (Canada)',
    description: 'Model Risk Management (effective May 1, 2027)',
    status: 'partial' as const,
    score: 72,
    controls: 15,
    implemented: 11,
    requirements: [
      { id: 'E23-1', name: 'Data Governance Framework', status: 'met' as const, evidence: 'This platform', gap: null },
      { id: 'E23-2', name: 'Third-Party Risk', status: 'partial' as const, evidence: 'Vendor assessments', gap: '2 vendors pending review' },
      { id: 'E23-3', name: 'Data Quality Controls', status: 'met' as const, evidence: 'Glue Data Quality', gap: null },
      { id: 'E23-4', name: 'Change Management', status: 'partial' as const, evidence: 'CI/CD pipelines', gap: 'Model change approval workflow' },
    ]
  },
  {
    id: 'eu-ai-act',
    name: 'EU AI Act',
    description: 'Risk-based AI Regulation',
    status: 'partial' as const,
    score: 65,
    controls: 22,
    implemented: 14,
    requirements: [
      { id: 'EU-1', name: 'Risk Classification', status: 'met' as const, evidence: 'Use case risk tiers', gap: null },
      { id: 'EU-2', name: 'Human Oversight', status: 'met' as const, evidence: 'HITL for high-risk', gap: null },
      { id: 'EU-3', name: 'Transparency', status: 'partial' as const, evidence: 'Explanations available', gap: 'User disclosure pending' },
      { id: 'EU-4', name: 'Data Quality', status: 'met' as const, evidence: 'Quality framework', gap: null },
      { id: 'EU-5', name: 'Technical Documentation', status: 'partial' as const, evidence: 'Model cards', gap: 'Training data docs incomplete' },
      { id: 'EU-6', name: 'Bias Testing', status: 'partial' as const, evidence: 'SageMaker Clarify', gap: 'Not all models tested' },
    ]
  },
  {
    id: 'nist-ai-rmf',
    name: 'NIST AI RMF',
    description: 'AI Risk Management Framework',
    status: 'partial' as const,
    score: 70,
    controls: 20,
    implemented: 14,
    requirements: [
      { id: 'NIST-1', name: 'Govern', status: 'met' as const, evidence: 'AI governance board', gap: null },
      { id: 'NIST-2', name: 'Map', status: 'met' as const, evidence: 'Use case inventory', gap: null },
      { id: 'NIST-3', name: 'Measure', status: 'partial' as const, evidence: 'Eval pipelines', gap: 'Fairness metrics incomplete' },
      { id: 'NIST-4', name: 'Manage', status: 'partial' as const, evidence: 'Controls in place', gap: 'Incident response plan pending' },
    ]
  },
  {
    id: 'hipaa',
    name: 'HIPAA',
    description: 'Health Insurance Portability and Accountability Act',
    status: 'partial' as const,
    score: 85,
    controls: 12,
    implemented: 10,
    requirements: [
      { id: 'HIPAA-1', name: 'PHI Safeguards', status: 'met' as const, evidence: 'Bedrock Guardrails', gap: null },
      { id: 'HIPAA-2', name: 'BAA Coverage', status: 'partial' as const, evidence: 'AWS BAA in place', gap: '2 vendor BAAs pending' },
      { id: 'HIPAA-3', name: 'Audit Controls', status: 'met' as const, evidence: 'CloudTrail logging', gap: null },
      { id: 'HIPAA-4', name: 'Access Controls', status: 'met' as const, evidence: 'Lake Formation', gap: null },
    ]
  },
  {
    id: 'pci-dss',
    name: 'PCI DSS 4.0',
    description: 'Payment Card Industry Data Security Standard',
    status: 'met' as const,
    score: 92,
    controls: 12,
    implemented: 11,
    requirements: [
      { id: 'PCI-1', name: 'Cardholder Data Protection', status: 'met' as const, evidence: 'Tokenization + Guardrails', gap: null },
      { id: 'PCI-2', name: 'Encryption', status: 'met' as const, evidence: 'AES-256 (KMS)', gap: null },
      { id: 'PCI-3', name: 'Access Control', status: 'met' as const, evidence: 'Lake Formation + MFA', gap: null },
      { id: 'PCI-4', name: 'Monitoring', status: 'partial' as const, evidence: 'CloudWatch', gap: 'Real-time alerting enhancement' },
    ]
  },
];

// ── AI Cost Attribution ──
export const AI_COST_DATA = {
  totalMonthly: 47250,
  breakdown: [
    { category: 'Bedrock Inference', amount: 28500, percentage: 60, trend: '+5%', color: '#3b82f6' },
    { category: 'Data Storage (S3)', amount: 8200, percentage: 17, trend: '+2%', color: '#10b981' },
    { category: 'ETL Processing (Glue)', amount: 5100, percentage: 11, trend: '-3%', color: '#f59e0b' },
    { category: 'Knowledge Bases', amount: 3200, percentage: 7, trend: '+12%', color: '#8b5cf6' },
    { category: 'Guardrails', amount: 2250, percentage: 5, trend: '+8%', color: '#ef4444' },
  ],
  byUseCase: [
    { useCase: 'UC-001 Loan Underwriting', inference: 12400, storage: 2800, etl: 1500, guardrails: 800, total: 17500, trend: '+3%' },
    { useCase: 'UC-002 Claims Processing', inference: 8200, storage: 1900, etl: 1200, guardrails: 650, total: 11950, trend: '+7%' },
    { useCase: 'UC-003 BSA/AML Monitoring', inference: 5100, storage: 2100, etl: 1800, guardrails: 500, total: 9500, trend: '+2%' },
    { useCase: 'UC-004 Customer Chatbot', inference: 1800, storage: 800, etl: 400, guardrails: 200, total: 3200, trend: '+15%' },
    { useCase: 'UC-005 Wealth Suitability', inference: 1000, storage: 600, etl: 200, guardrails: 100, total: 1900, trend: '+4%' },
  ],
  byDataset: [
    { dataset: 'Transaction Stream', storage: 2800, etl: 1200, scans: 450, monthly: 4450 },
    { dataset: 'Loan Application Dataset', storage: 1200, etl: 800, scans: 320, monthly: 2320 },
    { dataset: 'Claims Dataset', storage: 900, etl: 600, scans: 280, monthly: 1780 },
    { dataset: 'Regulatory Knowledge Base', storage: 400, etl: 100, scans: 1200, monthly: 1700 },
    { dataset: 'Credit Bureau Scores', storage: 600, etl: 400, scans: 150, monthly: 1150 },
  ],
};

// ── Metadata Management for RAG ──
export const METADATA_SCHEMAS = [
  {
    id: 'regulatory-docs',
    name: 'Regulatory Documents',
    description: 'Metadata schema for regulatory knowledge base (RAG)',
    datasetCount: 3,
    attributes: [
      { name: 'source_agency', type: 'string', required: true, filterable: true, examples: ['OCC', 'CFPB', 'Fed Reserve', 'NAIC'] },
      { name: 'document_type', type: 'enum', required: true, filterable: true, examples: ['Guidance', 'Rule', 'Bulletin', 'FAQ'] },
      { name: 'effective_date', type: 'date', required: true, filterable: true, examples: ['2024-01-15', '2025-06-01'] },
      { name: 'topic_tags', type: 'array[string]', required: false, filterable: true, examples: ['fair-lending', 'bsa-aml', 'model-risk'] },
      { name: 'jurisdiction', type: 'enum', required: true, filterable: true, examples: ['Federal', 'State', 'International'] },
      { name: 'supersedes', type: 'string', required: false, filterable: false, examples: ['SR-11-7', 'OCC-2000-16'] },
    ],
    ragFilters: [
      { name: 'By Agency', filter: 'source_agency equals "OCC"', description: 'Filter to OCC guidance only' },
      { name: 'Recent Rules', filter: 'effective_date >= 2024-01-01', description: 'Rules effective since 2024' },
      { name: 'BSA/AML Topic', filter: 'topic_tags contains "bsa-aml"', description: 'BSA/AML related documents' },
    ]
  },
  {
    id: 'loan-applications',
    name: 'Loan Applications',
    description: 'Metadata schema for lending AI use cases',
    datasetCount: 2,
    attributes: [
      { name: 'loan_type', type: 'enum', required: true, filterable: true, examples: ['Mortgage', 'Auto', 'Personal', 'HELOC'] },
      { name: 'application_date', type: 'date', required: true, filterable: true, examples: ['2025-05-01'] },
      { name: 'risk_tier', type: 'enum', required: true, filterable: true, examples: ['Prime', 'Near-Prime', 'Subprime'] },
      { name: 'state', type: 'string', required: true, filterable: true, examples: ['CA', 'NY', 'TX', 'FL'] },
      { name: 'channel', type: 'enum', required: false, filterable: true, examples: ['Branch', 'Online', 'Mobile', 'Partner'] },
      { name: 'decision_status', type: 'enum', required: true, filterable: true, examples: ['Approved', 'Declined', 'Pending', 'Withdrawn'] },
    ],
    ragFilters: [
      { name: 'By Loan Type', filter: 'loan_type equals "Mortgage"', description: 'Mortgage applications only' },
      { name: 'High Risk', filter: 'risk_tier equals "Subprime"', description: 'Subprime tier applications' },
      { name: 'California', filter: 'state equals "CA"', description: 'California applications' },
    ]
  },
  {
    id: 'claims-data',
    name: 'Insurance Claims',
    description: 'Metadata schema for claims processing AI',
    datasetCount: 2,
    attributes: [
      { name: 'claim_type', type: 'enum', required: true, filterable: true, examples: ['Auto', 'Property', 'Health', 'Life'] },
      { name: 'filed_date', type: 'date', required: true, filterable: true, examples: ['2025-05-15'] },
      { name: 'claim_amount', type: 'number', required: true, filterable: true, examples: ['5000', '25000', '100000'] },
      { name: 'status', type: 'enum', required: true, filterable: true, examples: ['Open', 'Under Review', 'Approved', 'Denied', 'Closed'] },
      { name: 'complexity_score', type: 'number', required: false, filterable: true, examples: ['1', '2', '3', '4', '5'] },
      { name: 'requires_medical_review', type: 'boolean', required: false, filterable: true, examples: ['true', 'false'] },
    ],
    ragFilters: [
      { name: 'High Value', filter: 'claim_amount >= 50000', description: 'Claims over $50K' },
      { name: 'Medical Review', filter: 'requires_medical_review equals true', description: 'Claims needing medical review' },
      { name: 'Open Claims', filter: 'status equals "Open"', description: 'Currently open claims' },
    ]
  },
];

export const METADATA_EXTRACTION_STATS = {
  totalDocuments: 12500,
  withMetadata: 11200,
  coveragePercent: 89.6,
  autoExtracted: 8400,
  manuallyTagged: 2800,
  avgAttributesPerDoc: 5.2,
  filterUsage: [
    { filter: 'source_agency', usageCount: 3420, successRate: 94 },
    { filter: 'effective_date', usageCount: 2180, successRate: 91 },
    { filter: 'topic_tags', usageCount: 1850, successRate: 88 },
    { filter: 'loan_type', usageCount: 1620, successRate: 96 },
    { filter: 'claim_type', usageCount: 980, successRate: 93 },
  ],
  recentExtractions: [
    { document: 'OCC Bulletin 2025-12', attributes: 6, confidence: 0.95, timestamp: '2026-05-28T10:30:00Z' },
    { document: 'CFPB Fair Lending Guide', attributes: 5, confidence: 0.92, timestamp: '2026-05-28T09:15:00Z' },
    { document: 'Fed Reserve SR 26-2 Update', attributes: 7, confidence: 0.98, timestamp: '2026-05-27T16:45:00Z' },
    { document: 'NAIC Model Bulletin on Use of AI (2023)', attributes: 4, confidence: 0.89, timestamp: '2026-05-27T14:20:00Z' },
  ],
};

// ── Responsible AI Metrics ──
export const RESPONSIBLE_AI_METRICS = {
  fairnessScore: 82,
  biasDetection: {
    modelsScanned: 6,
    issuesFound: 2,
    mitigated: 1,
    details: [
      { model: 'Nova Pro (UC-001)', metric: 'Demographic Parity', status: 'pass' as const, value: 0.92, threshold: 0.8 },
      { model: 'Nova Pro (UC-001)', metric: 'Equalized Odds', status: 'pass' as const, value: 0.88, threshold: 0.8 },
      { model: 'Claude 3.7 (UC-002)', metric: 'Demographic Parity', status: 'warning' as const, value: 0.78, threshold: 0.8 },
      { model: 'Nova Pro (UC-003)', metric: 'Equal Opportunity', status: 'pass' as const, value: 0.91, threshold: 0.8 },
    ]
  },
  explainability: {
    modelsWithExplanations: 5,
    totalModels: 6,
    methods: ['SHAP', 'LIME', 'Integrated Gradients'],
  },
  driftMonitoring: {
    monitored: 4,
    driftDetected: 1,
    alerts: [
      { model: 'UC-001 Loan Underwriting', type: 'Feature Drift', severity: 'low' as const, detected: '2026-05-26', feature: 'debt_to_income_ratio' },
    ]
  },
};

// ── Data Governance Maturity Roadmap ──
export const MATURITY_ROADMAP = {
  phases: [
    {
      id: 'initial',
      name: 'Initial → Developing',
      timeline: 'Q2-Q3 2026',
      targetScore: 2.0,
      color: '#f59e0b',
      description: 'Establish foundational data governance controls for AI workloads',
      tasks: [
        { task: 'Implement data classification scheme (5 levels)', owner: 'Data Governance Lead', status: 'in-progress' as const, effort: 'Medium' },
        { task: 'Deploy Glue Data Quality rules on top 5 AI datasets', owner: 'Data Engineers', status: 'in-progress' as const, effort: 'High' },
        { task: 'Enable Macie PII scanning on all S3 AI buckets', owner: 'Security', status: 'done' as const, effort: 'Low' },
        { task: 'Assign data stewards for 3 priority domains', owner: 'Data Governance Lead', status: 'not-started' as const, effort: 'Medium' },
        { task: 'Configure Bedrock Guardrails PII filtering', owner: 'ML Engineers', status: 'done' as const, effort: 'Medium' },
        { task: 'Set up basic lineage tracking (manual)', owner: 'Data Engineers', status: 'in-progress' as const, effort: 'Medium' },
        { task: 'Migrate 3 datasets from IAM to Lake Formation', owner: 'Platform Eng', status: 'not-started' as const, effort: 'High' },
        { task: 'Create data governance policy document', owner: 'Compliance', status: 'done' as const, effort: 'Low' },
      ]
    },
    {
      id: 'defined',
      name: 'Developing → Defined',
      timeline: 'Q4 2026 - Q1 2027',
      targetScore: 3.0,
      color: '#3b82f6',
      description: 'Structured governance with automation and good coverage',
      tasks: [
        { task: 'Enable SageMaker Catalog with OpenLineage', owner: 'ML Platform', status: 'not-started' as const, effort: 'High' },
        { task: 'Automated data quality monitoring with alerting', owner: 'Data Engineers', status: 'not-started' as const, effort: 'Medium' },
        { task: 'Implement row/column-level security (Lake Formation)', owner: 'Platform Eng', status: 'not-started' as const, effort: 'High' },
        { task: 'Complete steward assignment for all 6 domains', owner: 'Data Governance Lead', status: 'not-started' as const, effort: 'Medium' },
        { task: 'Define data product SLAs (freshness, quality)', owner: 'Domain Stewards', status: 'not-started' as const, effort: 'Medium' },
        { task: 'Automate GDPR data subject request pipeline', owner: 'Privacy Team', status: 'not-started' as const, effort: 'High' },
        { task: 'Deploy drift detection for all production models', owner: 'ML Engineers', status: 'not-started' as const, effort: 'Medium' },
        { task: 'Achieve 95% tag coverage on AI datasets', owner: 'Data Engineers', status: 'not-started' as const, effort: 'Low' },
      ]
    },
    {
      id: 'optimizing',
      name: 'Defined → Optimizing',
      timeline: 'Q2 2027+',
      targetScore: 4.0,
      color: '#10b981',
      description: 'Continuous improvement, full automation, proactive governance',
      tasks: [
        { task: 'Implement data mesh / data products architecture', owner: 'Platform Eng', status: 'not-started' as const, effort: 'High' },
        { task: 'ML-based anomaly detection for data quality', owner: 'Data Science', status: 'not-started' as const, effort: 'High' },
        { task: 'Self-service data catalog with consumption tracking', owner: 'ML Platform', status: 'not-started' as const, effort: 'High' },
        { task: 'Automated compliance evidence generation', owner: 'GRC Team', status: 'not-started' as const, effort: 'Medium' },
        { task: 'Purpose-based access control (zero trust)', owner: 'Security', status: 'not-started' as const, effort: 'High' },
        { task: 'Real-time lineage with impact analysis', owner: 'Data Engineers', status: 'not-started' as const, effort: 'High' },
        { task: 'Achieve ISO 42001 AI Management certification', owner: 'Compliance', status: 'not-started' as const, effort: 'High' },
        { task: 'Data Governance CoE established', owner: 'CDO', status: 'not-started' as const, effort: 'Medium' },
      ]
    }
  ],
  gaps: [
    { gap: 'Missing data stewards for 3 domains', domain: 'Data Ownership', severity: 'high' as const, remediation: 'Assign stewards from Insurance, Contact Center, Wealth BUs', effort: 'Low', owner: 'Data Governance Lead' },
    { gap: 'No automated lineage capture', domain: 'Data Lineage', severity: 'high' as const, remediation: 'Enable SageMaker Catalog with OpenLineage integration', effort: 'High', owner: 'ML Platform' },
    { gap: 'Regulatory KB 45 days stale', domain: 'Data Freshness', severity: 'medium' as const, remediation: 'Automate regulatory data refresh pipeline', effort: 'Medium', owner: 'Data Engineers' },
    { gap: '3 datasets on IAM not Lake Formation', domain: 'Access Control', severity: 'medium' as const, remediation: 'Migrate Contact Center, Wealth, and Regulatory datasets', effort: 'High', owner: 'Platform Eng' },
    { gap: 'HIPAA BAA gaps for 2 vendors', domain: 'Compliance', severity: 'high' as const, remediation: 'Complete BAA for Comprehend Medical data vendor', effort: 'Low', owner: 'Legal/Procurement' },
    { gap: 'Drift detection not automated', domain: 'Data Quality', severity: 'medium' as const, remediation: 'Deploy SageMaker Model Monitor for all production models', effort: 'Medium', owner: 'ML Engineers' },
  ],
  awsServices: [
    { domain: 'Data Quality', services: 'Glue Data Quality, Deequ', description: 'Automated quality rules and validation', status: 'partial' as const },
    { domain: 'Data Lineage', services: 'SageMaker Catalog, OpenLineage', description: 'End-to-end data and model lineage', status: 'not-started' as const },
    { domain: 'Classification', services: 'Macie, Comprehend, Guardrails', description: 'PII/PHI/PCI detection and tagging', status: 'active' as const },
    { domain: 'Access Control', services: 'Lake Formation, IAM', description: 'Fine-grained row/column security', status: 'partial' as const },
    { domain: 'Cataloging', services: 'Glue Catalog, SageMaker Catalog', description: 'Metadata management and discovery', status: 'active' as const },
    { domain: 'Protection', services: 'Bedrock Guardrails, KMS', description: 'PII redaction and encryption', status: 'active' as const },
    { domain: 'Audit', services: 'CloudTrail, S3 Access Logs', description: 'Comprehensive audit trail', status: 'active' as const },
    { domain: 'Monitoring', services: 'CloudWatch, SageMaker Monitor', description: 'Quality and drift monitoring', status: 'partial' as const },
  ],
  raci: [
    { activity: 'Define data classification scheme', responsible: 'Data Governance Lead', accountable: 'CDO', consulted: 'Security, Legal', informed: 'All BUs' },
    { activity: 'Implement quality rules', responsible: 'Data Engineers', accountable: 'Data Governance Lead', consulted: 'Domain Stewards', informed: 'ML Engineers' },
    { activity: 'Assign domain stewards', responsible: 'BU VPs', accountable: 'CDO', consulted: 'Data Governance Lead', informed: 'Data Engineers' },
    { activity: 'Configure Bedrock Guardrails', responsible: 'ML Engineers', accountable: 'ML Platform Lead', consulted: 'Security', informed: 'Compliance' },
    { activity: 'Manage Lake Formation policies', responsible: 'Platform Eng', accountable: 'Security Lead', consulted: 'Domain Stewards', informed: 'Data Scientists' },
    { activity: 'Monitor data drift', responsible: 'ML Engineers', accountable: 'ML Platform Lead', consulted: 'Data Scientists', informed: 'BU Cost Owners' },
    { activity: 'Regulatory compliance mapping', responsible: 'Compliance', accountable: 'CCO', consulted: 'Legal, Security', informed: 'All BUs' },
    { activity: 'Data subject requests (GDPR/CCPA)', responsible: 'Privacy Team', accountable: 'DPO', consulted: 'Legal, Data Engineers', informed: 'Customer Service' },
  ],
};
