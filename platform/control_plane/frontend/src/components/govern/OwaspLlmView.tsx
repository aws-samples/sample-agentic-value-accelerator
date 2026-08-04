/**
 * OwaspLlmView — OWASP Top 10 for LLM Applications (2025) deep-dive view.
 *
 * A comprehensive security view for the OWASP GenAI Security Project's Top 10
 * risks for LLM applications. Features:
 * - Visual Top 10 ranking with severity indicators
 * - Attack surface diagram (input -> model -> output -> downstream)
 * - Guardrails coverage matrix (which Bedrock Guardrails address which risk)
 * - Per-risk deep dive with description, attack scenarios, mitigations, AWS services
 * - Overall security posture score with red/yellow/green status
 * - Link to OWASP GenAI Security Project
 */
import { useState, useMemo } from 'react';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { COMPLIANCE_CENTER_FRAMEWORKS, type ComplianceFramework } from './mockData';

// ─────────────────────────── OWASP LLM Risk Metadata ───────────────────────────
// Extended metadata for each OWASP LLM Top 10 risk (2025 edition)
interface OwaspLlmRisk {
  id: string;
  rank: number;
  name: string;
  shortName: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  attackScenarios: string[];
  mitigations: string[];
  awsServices: { service: string; how: string }[];
  attackSurfaceStage: ('input' | 'model' | 'output' | 'downstream')[];
  guardrailsFeature?: string;
}

const OWASP_LLM_RISKS: OwaspLlmRisk[] = [
  {
    id: 'LLM01',
    rank: 1,
    name: 'Prompt Injection',
    shortName: 'Prompt Injection',
    severity: 'critical',
    description: 'Manipulation of LLM behavior through crafted inputs that override system instructions, either directly or via untrusted data sources (indirect injection).',
    attackScenarios: [
      'Attacker embeds malicious instructions in user input to override system prompt',
      'Malicious content in RAG documents manipulates model responses',
      'Cross-plugin attacks via tool-use chains that inject instructions',
    ],
    mitigations: [
      'Bedrock Guardrails PROMPT_ATTACK filter enabled',
      'Input validation and sanitization layer',
      'RAG source filtering and content screening',
      'Privilege separation between user and system instructions',
    ],
    awsServices: [
      { service: 'Bedrock Guardrails', how: 'PROMPT_ATTACK content filter detects injection attempts' },
      { service: 'Lambda@Edge', how: 'Input validation at API boundary' },
      { service: 'WAF', how: 'Request pattern filtering' },
    ],
    attackSurfaceStage: ['input'],
    guardrailsFeature: 'PROMPT_ATTACK',
  },
  {
    id: 'LLM02',
    rank: 2,
    name: 'Sensitive Information Disclosure',
    shortName: 'Info Disclosure',
    severity: 'critical',
    description: 'Unintended exposure of PII, credentials, proprietary data, or confidential information through model outputs or training data leakage.',
    attackScenarios: [
      'Model reveals PII from training data or context',
      'System prompt or internal configuration exposed in responses',
      'Credentials or API keys leaked through verbose error messages',
    ],
    mitigations: [
      'Bedrock Guardrails PII detection and redaction',
      'Output content filtering for sensitive patterns',
      'Data classification and access controls',
      'No secrets in system prompts (use Secrets Manager)',
    ],
    awsServices: [
      { service: 'Bedrock Guardrails', how: 'PII and sensitive info filters on input/output' },
      { service: 'Secrets Manager', how: 'Secure credential storage, never in prompts' },
      { service: 'Macie', how: 'Data classification and sensitive data discovery' },
    ],
    attackSurfaceStage: ['output'],
    guardrailsFeature: 'SENSITIVE_INFORMATION',
  },
  {
    id: 'LLM03',
    rank: 3,
    name: 'Supply Chain',
    shortName: 'Supply Chain',
    severity: 'high',
    description: 'Risks from compromised model providers, poisoned pre-trained models, vulnerable dependencies, or malicious plugins.',
    attackScenarios: [
      'Backdoored pre-trained model from untrusted source',
      'Compromised model weights with hidden triggers',
      'Malicious third-party plugin or tool integration',
    ],
    mitigations: [
      'Use only verified Bedrock foundation models',
      'Model provenance tracking and verification',
      'Dependency scanning (Snyk, Dependabot)',
      'Plugin/tool vetting and allowlisting',
    ],
    awsServices: [
      { service: 'Bedrock', how: 'Curated, verified foundation models only' },
      { service: 'CodeGuru', how: 'Dependency vulnerability scanning' },
      { service: 'Inspector', how: 'Container and code vulnerability detection' },
    ],
    attackSurfaceStage: ['model'],
  },
  {
    id: 'LLM04',
    rank: 4,
    name: 'Data and Model Poisoning',
    shortName: 'Poisoning',
    severity: 'high',
    description: 'Corruption of training data, fine-tuning datasets, or embeddings to introduce backdoors or degrade model behavior.',
    attackScenarios: [
      'Malicious data injected into fine-tuning datasets',
      'Poisoned embeddings in vector store for RAG',
      'Adversarial examples that trigger specific behaviors',
    ],
    mitigations: [
      'Training data provenance and lineage tracking',
      'Fine-tuning data review and validation',
      'Embedding ingestion validation',
      'Model behavior monitoring post-deployment',
    ],
    awsServices: [
      { service: 'SageMaker Data Wrangler', how: 'Data quality and validation pipelines' },
      { service: 'Glue Data Quality', how: 'Automated data quality checks' },
      { service: 'CloudTrail', how: 'Data access audit trail' },
    ],
    attackSurfaceStage: ['model'],
  },
  {
    id: 'LLM05',
    rank: 5,
    name: 'Improper Output Handling',
    shortName: 'Output Handling',
    severity: 'high',
    description: 'Failure to validate, sanitize, or encode LLM outputs before use in downstream systems, enabling XSS, SSRF, or code injection.',
    attackScenarios: [
      'LLM output rendered as HTML without sanitization (XSS)',
      'Model-generated URLs used for SSRF attacks',
      'Code suggestions executed without review',
    ],
    mitigations: [
      'Output encoding and sanitization',
      'Sandboxed execution for generated code',
      'URL validation and allowlisting',
      'Content Security Policy (CSP) headers',
    ],
    awsServices: [
      { service: 'Lambda', how: 'Sandboxed code execution environment' },
      { service: 'WAF', how: 'XSS and injection protection' },
      { service: 'CloudFront', how: 'CSP header enforcement' },
    ],
    attackSurfaceStage: ['output', 'downstream'],
  },
  {
    id: 'LLM06',
    rank: 6,
    name: 'Excessive Agency',
    shortName: 'Excessive Agency',
    severity: 'critical',
    description: 'LLM agents granted excessive permissions, autonomy, or capabilities that exceed task requirements, enabling unintended actions.',
    attackScenarios: [
      'Agent with write access modifies production data',
      'Autonomous agent triggers cascading actions without approval',
      'Tool-use agent accesses resources beyond its scope',
    ],
    mitigations: [
      'Least-privilege action scopes (Cedar policies)',
      'Human-in-the-loop for sensitive operations',
      'Action allowlists and rate limiting',
      'Autonomy ladder with escalation thresholds',
    ],
    awsServices: [
      { service: 'Verified Permissions', how: 'Cedar-based fine-grained authorization' },
      { service: 'Step Functions', how: 'Human approval workflows' },
      { service: 'IAM', how: 'Least-privilege roles for agent execution' },
    ],
    attackSurfaceStage: ['downstream'],
    guardrailsFeature: 'ACTION_GROUPS',
  },
  {
    id: 'LLM07',
    rank: 7,
    name: 'System Prompt Leakage',
    shortName: 'Prompt Leakage',
    severity: 'high',
    description: 'Exposure of system prompts containing business logic, security constraints, or sensitive instructions through extraction attacks.',
    attackScenarios: [
      'User tricks model into revealing its system prompt',
      'Iterative probing extracts confidential instructions',
      'Leaked prompts reveal security constraints to attackers',
    ],
    mitigations: [
      'No secrets or credentials in system prompts',
      'Prompt-leak detection and filtering',
      'Regular red-team testing for extraction',
      'Instruction hierarchy and privilege separation',
    ],
    awsServices: [
      { service: 'Bedrock Guardrails', how: 'Custom word filters for prompt content' },
      { service: 'Secrets Manager', how: 'Keep secrets out of prompts entirely' },
      { service: 'CloudWatch', how: 'Anomaly detection on prompt-like outputs' },
    ],
    attackSurfaceStage: ['input', 'output'],
    guardrailsFeature: 'WORD_POLICY',
  },
  {
    id: 'LLM08',
    rank: 8,
    name: 'Vector and Embedding Weaknesses',
    shortName: 'Vector/Embedding',
    severity: 'high',
    description: 'Vulnerabilities in vector databases and embedding stores including unauthorized access, data poisoning, and information leakage.',
    attackScenarios: [
      'Unauthorized access to vector store retrieves confidential documents',
      'Poisoned embeddings return malicious content in RAG',
      'Embedding inversion reveals original text content',
    ],
    mitigations: [
      'IAM and per-tenant partitioning on knowledge bases',
      'Embedding ingestion validation and scanning',
      'Access logging and anomaly detection',
      'Encryption at rest and in transit',
    ],
    awsServices: [
      { service: 'Bedrock Knowledge Bases', how: 'Managed RAG with IAM integration' },
      { service: 'OpenSearch Serverless', how: 'Fine-grained access control' },
      { service: 'KMS', how: 'Encryption for vector data at rest' },
    ],
    attackSurfaceStage: ['input', 'model'],
  },
  {
    id: 'LLM09',
    rank: 9,
    name: 'Misinformation',
    shortName: 'Misinformation',
    severity: 'high',
    description: 'Generation of false, misleading, or fabricated information (hallucinations) that users may trust and act upon.',
    attackScenarios: [
      'Model confidently provides incorrect financial advice',
      'Fabricated citations and references in research outputs',
      'Hallucinated facts in compliance or legal documents',
    ],
    mitigations: [
      'Bedrock Guardrails contextual grounding checks',
      'RAG grounding with verified sources',
      'Human review for high-stakes decisions',
      'Confidence scoring and uncertainty indicators',
    ],
    awsServices: [
      { service: 'Bedrock Guardrails', how: 'Contextual grounding policy for hallucination detection' },
      { service: 'Kendra', how: 'Enterprise search for grounded retrieval' },
      { service: 'Bedrock Knowledge Bases', how: 'Citation and source attribution' },
    ],
    attackSurfaceStage: ['output'],
    guardrailsFeature: 'CONTEXTUAL_GROUNDING',
  },
  {
    id: 'LLM10',
    rank: 10,
    name: 'Unbounded Consumption',
    shortName: 'Unbounded Consumption',
    severity: 'medium',
    description: 'Resource exhaustion through excessive token usage, API abuse, or denial-of-service attacks targeting LLM inference.',
    attackScenarios: [
      'Attacker sends large payloads to exhaust token quotas',
      'Recursive prompts cause runaway inference costs',
      'Bot traffic overwhelms API rate limits',
    ],
    mitigations: [
      'API Gateway rate limiting and throttling',
      'Token and cost quotas per user/tenant',
      'Budget alerts and circuit breakers',
      'Input length validation',
    ],
    awsServices: [
      { service: 'API Gateway', how: 'Rate limiting, throttling, quota management' },
      { service: 'Bedrock', how: 'Per-model token quotas' },
      { service: 'Budgets', how: 'Cost alerts and automated actions' },
      { service: 'Cost Explorer', how: 'Anomaly detection on AI spend' },
    ],
    attackSurfaceStage: ['input'],
  },
];

// ─────────────────────────── Guardrails Coverage Matrix ───────────────────────────
const GUARDRAILS_FEATURES = [
  { id: 'PROMPT_ATTACK', name: 'Prompt Attack', description: 'Detects prompt injection and jailbreak attempts' },
  { id: 'SENSITIVE_INFORMATION', name: 'PII/Sensitive', description: 'Filters PII and sensitive information' },
  { id: 'CONTENT_POLICY', name: 'Content Policy', description: 'Blocks harmful, hateful, or inappropriate content' },
  { id: 'WORD_POLICY', name: 'Word Policy', description: 'Custom word filters and denylists' },
  { id: 'CONTEXTUAL_GROUNDING', name: 'Grounding', description: 'Validates factual accuracy against sources' },
  { id: 'ACTION_GROUPS', name: 'Action Groups', description: 'Controls agent tool/action permissions' },
];

// Severity metadata
const severityMeta: Record<string, { badge: string; label: string }> = {
  critical: { badge: 'bg-rose-100 text-rose-700 border-rose-200', label: 'Critical' },
  high: { badge: 'bg-amber-100 text-amber-700 border-amber-200', label: 'High' },
  medium: { badge: 'bg-sky-100 text-sky-700 border-sky-200', label: 'Medium' },
};

const stageMeta: Record<string, { color: string; label: string }> = {
  input: { color: 'bg-blue-500', label: 'Input' },
  model: { color: 'bg-purple-500', label: 'Model' },
  output: { color: 'bg-amber-500', label: 'Output' },
  downstream: { color: 'bg-rose-500', label: 'Downstream' },
};

interface OwaspLlmViewProps {
  embedded?: boolean;
  onNavigateToProgram?: () => void;
}

export default function OwaspLlmView({ embedded = false, onNavigateToProgram }: OwaspLlmViewProps = {}) {
  const [expandedRisk, setExpandedRisk] = useState<string | null>(null);

  // Get OWASP LLM framework data from mockData
  const owaspFramework = useMemo(() => {
    return COMPLIANCE_CENTER_FRAMEWORKS.find(fw => fw.id === 'owasp-llm-top10') as ComplianceFramework | undefined;
  }, []);

  // Compute status for each OWASP risk based on control data
  const riskStatuses = useMemo(() => {
    if (!owaspFramework) return {};
    const statuses: Record<string, { status: string; controls: number; passed: number }> = {};

    owaspFramework.categories.forEach(cat => {
      // Extract LLM ID from category name (e.g., "LLM01:2025 Prompt Injection" -> "LLM01")
      const match = cat.name.match(/^(LLM\d{2})/);
      if (match) {
        const llmId = match[1];
        const controls = cat.controls.length;
        const passed = cat.controls.filter(c => c.status === 'pass').length;
        const inProgress = cat.controls.filter(c => c.status === 'in-progress').length;

        let status = 'not-started';
        if (passed === controls) status = 'pass';
        else if (passed + inProgress > 0) status = 'in-progress';
        else if (cat.controls.some(c => c.status === 'fail')) status = 'fail';

        statuses[llmId] = { status, controls, passed };
      }
    });
    return statuses;
  }, [owaspFramework]);

  // Compute overall security posture
  const posture = useMemo(() => {
    if (!owaspFramework) return { score: 0, passed: 0, inProgress: 0, gaps: 0, total: 0 };
    const controls = owaspFramework.categories.flatMap(c => c.controls);
    const total = controls.length;
    const passed = controls.filter(c => c.status === 'pass').length;
    const inProgress = controls.filter(c => c.status === 'in-progress').length;
    const gaps = controls.filter(c => c.status === 'fail').length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;
    return { score, passed, inProgress, gaps, total };
  }, [owaspFramework]);

  // Get controls for a specific risk
  const getControlsForRisk = (riskId: string) => {
    if (!owaspFramework) return [];
    const category = owaspFramework.categories.find(c => c.name.startsWith(riskId));
    return category?.controls || [];
  };

  const body = (
    <div className="space-y-6">
      {/* OWASP GenAI Project Link */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-slate-500">
          Based on the{' '}
          <a
            href="https://genai.owasp.org/llm-top-10/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 underline"
          >
            OWASP Top 10 for LLM Applications (2025)
          </a>
          {' '}from the OWASP GenAI Security Project.
        </div>
        <div className="text-[10px] text-slate-400">
          Last audit: {owaspFramework?.lastAudit || 'N/A'} | Next: {owaspFramework?.nextAudit || 'N/A'}
        </div>
      </div>

      {/* Program Builder Link */}
      {onNavigateToProgram && (
        <div className="flex items-center justify-between bg-violet-50 rounded-xl border border-violet-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-violet-600 text-sm">📋</span>
            <span className="text-sm text-violet-800">Track OWASP LLM Top 10 controls in your governance program</span>
          </div>
          <button
            onClick={onNavigateToProgram}
            className="text-xs font-medium px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            Add to Program →
          </button>
        </div>
      )}

      {/* Overall Security Posture */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Security Posture"
          value={`${posture.score}%`}
          variant={posture.score >= 80 ? 'success' : posture.score >= 60 ? 'warning' : 'danger'}
          sub="OWASP LLM coverage"
        />
        <StatCard label="Controls" value={posture.total} />
        <StatCard label="Covered" value={posture.passed} variant="success" />
        <StatCard label="In Progress" value={posture.inProgress} variant="warning" />
        <StatCard label="Gaps" value={posture.gaps} variant={posture.gaps > 0 ? 'danger' : 'muted'} />
      </div>

      {/* Attack Surface Diagram */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="text-sm font-semibold text-slate-900 mb-4">Attack Surface Diagram</div>
        <div className="relative">
          {/* Flow diagram */}
          <div className="flex items-center justify-between gap-2 mb-6">
            {(['input', 'model', 'output', 'downstream'] as const).map((stage, idx) => (
              <div key={stage} className="flex items-center flex-1">
                <div className="flex-1">
                  <div className={`${stageMeta[stage].color} text-white text-[11px] font-semibold px-3 py-2 rounded-lg text-center`}>
                    {stageMeta[stage].label}
                  </div>
                  <div className="text-[9px] text-slate-400 text-center mt-1">
                    {stage === 'input' && 'User prompts, RAG data'}
                    {stage === 'model' && 'LLM inference'}
                    {stage === 'output' && 'Generated responses'}
                    {stage === 'downstream' && 'Tools, actions, APIs'}
                  </div>
                </div>
                {idx < 3 && (
                  <div className="w-8 h-px bg-slate-300 mx-1 flex-shrink-0">
                    <div className="w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent border-l-slate-300 float-right -mt-1.5" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Attack vectors by stage */}
          <div className="grid grid-cols-4 gap-2 text-[9px]">
            {(['input', 'model', 'output', 'downstream'] as const).map(stage => {
              const risksAtStage = OWASP_LLM_RISKS.filter(r => r.attackSurfaceStage.includes(stage));
              return (
                <div key={stage} className="space-y-1">
                  {risksAtStage.map(risk => {
                    const rs = riskStatuses[risk.id];
                    return (
                      <div
                        key={risk.id}
                        className={`px-2 py-1 rounded border ${
                          rs?.status === 'pass' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                          rs?.status === 'in-progress' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                          'bg-rose-50 border-rose-200 text-rose-700'
                        }`}
                      >
                        <span className="font-semibold">{risk.id}</span> {risk.shortName}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top 10 Ranking */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">OWASP LLM Top 10 (2025)</div>
          <div className="flex items-center gap-3 text-[9px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Covered</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> In Progress</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Gap</span>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {OWASP_LLM_RISKS.map(risk => {
            const rs = riskStatuses[risk.id];
            const isExpanded = expandedRisk === risk.id;
            const controls = getControlsForRisk(risk.id);

            return (
              <div key={risk.id} className="group">
                <button
                  onClick={() => setExpandedRisk(isExpanded ? null : risk.id)}
                  className="w-full px-5 py-3 flex items-center gap-4 hover:bg-slate-50/50 transition-colors text-left"
                >
                  {/* Rank badge */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                    risk.severity === 'critical' ? 'bg-rose-600 text-white' :
                    risk.severity === 'high' ? 'bg-amber-500 text-white' :
                    'bg-sky-500 text-white'
                  }`}>
                    {risk.rank}
                  </div>

                  {/* Risk info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-slate-800">{risk.id}:2025</span>
                      <span className="text-[12px] text-slate-700">{risk.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border ${severityMeta[risk.severity].badge}`}>
                        {severityMeta[risk.severity].label}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{risk.description}</div>
                  </div>

                  {/* Attack stages */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {risk.attackSurfaceStage.map(stage => (
                      <span
                        key={stage}
                        className={`w-2 h-2 rounded-full ${stageMeta[stage].color}`}
                        title={stageMeta[stage].label}
                      />
                    ))}
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[9px] px-2 py-1 rounded ${
                      rs?.status === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                      rs?.status === 'in-progress' ? 'bg-amber-100 text-amber-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {rs?.passed || 0}/{rs?.controls || 0} controls
                    </span>
                    <svg
                      className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 pb-4 bg-slate-50/50 border-t border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                      {/* Attack Scenarios */}
                      <div>
                        <div className="text-[11px] font-semibold text-slate-700 mb-2">Attack Scenarios</div>
                        <ul className="space-y-1">
                          {risk.attackScenarios.map((scenario, i) => (
                            <li key={i} className="text-[10px] text-slate-600 flex items-start gap-2">
                              <span className="text-rose-500 mt-0.5">!</span>
                              {scenario}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Mitigations */}
                      <div>
                        <div className="text-[11px] font-semibold text-slate-700 mb-2">Mitigations in Place</div>
                        <ul className="space-y-1">
                          {risk.mitigations.map((mitigation, i) => (
                            <li key={i} className="text-[10px] text-slate-600 flex items-start gap-2">
                              <span className="text-emerald-500 mt-0.5">+</span>
                              {mitigation}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* AWS Services */}
                      <div>
                        <div className="text-[11px] font-semibold text-slate-700 mb-2">AWS Services Providing Protection</div>
                        <div className="space-y-1.5">
                          {risk.awsServices.map((svc, i) => (
                            <div key={i} className="text-[10px]">
                              <span className="font-medium text-slate-700">{svc.service}</span>
                              <span className="text-slate-400"> — {svc.how}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Control Status */}
                      <div>
                        <div className="text-[11px] font-semibold text-slate-700 mb-2">Control Status</div>
                        <div className="space-y-1.5">
                          {controls.map(ctrl => (
                            <div key={ctrl.id} className="flex items-center gap-2 text-[10px]">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                ctrl.status === 'pass' ? 'bg-emerald-500' :
                                ctrl.status === 'in-progress' ? 'bg-amber-500' :
                                'bg-rose-500'
                              }`} />
                              <span className="text-slate-600">{ctrl.label}</span>
                              {ctrl.evidence && (
                                <span className="text-slate-400 truncate">({ctrl.evidence})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Guardrails Coverage Matrix */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
        <div className="text-sm font-semibold text-slate-900 mb-4">Bedrock Guardrails Coverage Matrix</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-2 text-slate-600 font-semibold">OWASP Risk</th>
                {GUARDRAILS_FEATURES.map(gf => (
                  <th key={gf.id} className="text-center py-2 px-2 text-slate-600 font-semibold" title={gf.description}>
                    {gf.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {OWASP_LLM_RISKS.map(risk => (
                <tr key={risk.id} className="hover:bg-slate-50/50">
                  <td className="py-2 px-2">
                    <span className="font-semibold text-slate-700">{risk.id}</span>
                    <span className="text-slate-500 ml-1">{risk.shortName}</span>
                  </td>
                  {GUARDRAILS_FEATURES.map(gf => {
                    const isAddressed = risk.guardrailsFeature === gf.id;
                    const isPartial = (
                      (gf.id === 'CONTENT_POLICY' && ['LLM01', 'LLM09'].includes(risk.id)) ||
                      (gf.id === 'WORD_POLICY' && ['LLM02', 'LLM07'].includes(risk.id))
                    );
                    return (
                      <td key={gf.id} className="text-center py-2 px-2">
                        {isAddressed ? (
                          <span className="inline-flex w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 items-center justify-center font-bold">+</span>
                        ) : isPartial ? (
                          <span className="inline-flex w-5 h-5 rounded-full bg-amber-100 text-amber-600 items-center justify-center font-bold">~</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-4 mt-3 text-[9px] text-slate-500">
          <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-[10px]">+</span> Primary coverage</span>
          <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-[10px]">~</span> Partial/complementary</span>
          <span className="flex items-center gap-1"><span className="text-slate-300">-</span> Not directly addressed</span>
        </div>
      </div>

      {/* Risk-by-Severity Summary */}
      <div className="grid grid-cols-3 gap-4">
        {(['critical', 'high', 'medium'] as const).map(severity => {
          const risksAtSeverity = OWASP_LLM_RISKS.filter(r => r.severity === severity);
          const covered = risksAtSeverity.filter(r => riskStatuses[r.id]?.status === 'pass').length;
          return (
            <div key={severity} className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm p-4 ${
              severity === 'critical' ? 'border-rose-200' :
              severity === 'high' ? 'border-amber-200' :
              'border-sky-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[11px] font-semibold ${
                  severity === 'critical' ? 'text-rose-700' :
                  severity === 'high' ? 'text-amber-700' :
                  'text-sky-700'
                }`}>
                  {severity.charAt(0).toUpperCase() + severity.slice(1)} Severity
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${severityMeta[severity].badge}`}>
                  {risksAtSeverity.length} risks
                </span>
              </div>
              <div className="space-y-1">
                {risksAtSeverity.map(risk => {
                  const rs = riskStatuses[risk.id];
                  return (
                    <div key={risk.id} className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-600">{risk.id}: {risk.shortName}</span>
                      <span className={`w-2 h-2 rounded-full ${
                        rs?.status === 'pass' ? 'bg-emerald-500' :
                        rs?.status === 'in-progress' ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                {covered}/{risksAtSeverity.length} fully covered
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (embedded) return body;
  return (
    <GovernPageLayout
      title="OWASP LLM Top 10"
      description="The 2025 OWASP Top 10 security risks for LLM applications (LLM01-LLM10:2025) with attack surface mapping, Bedrock Guardrails coverage, and control status."
      badge={<MockDataBadge integration="OWASP LLM mapping — control-plane backend" />}
    >
      {body}
    </GovernPageLayout>
  );
}
