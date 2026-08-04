/**
 * GpaiModelCard - GPAI Model Transparency Card for EU AI Act Article 53
 *
 * Implements EU AI Act Article 53 transparency requirements for General-Purpose AI models.
 * Features structured model documentation covering:
 * - Model Identity (name, version, provider, release date)
 * - Intended Use (purposes, domains, limitations)
 * - Training Data Summary (data sources, size, preprocessing)
 * - Capabilities & Limitations
 * - Evaluation Results (benchmarks, safety evals)
 * - Compute Resources (training compute, carbon footprint estimate)
 * - Risk Mitigations (guardrails, safety measures)
 * - Known Issues & Biases
 *
 * Additional features:
 * - Completeness indicator (% of required fields filled)
 * - Export to PDF/structured format
 * - Comparison view across models
 * - Systemic risk assessment for GPAI with systemic risk (Art. 51)
 * - Link to full technical documentation
 */

import { useState, useMemo, useCallback } from 'react';
import { Icon, type IconName } from '../icons';
import { MockDataBadge } from '../DataSourceIndicator';

// ─────────────────────────── Types ───────────────────────────

type CompletionStatus = 'complete' | 'partial' | 'missing';
type RiskLevel = 'low' | 'medium' | 'high' | 'systemic';

interface ModelIdentity {
  name: string;
  version: string;
  provider: string;
  releaseDate: string;
  modelId: string;
  modelFamily: string;
  euDatabaseId?: string;
}

interface IntendedUse {
  purposes: string[];
  domains: string[];
  limitations: string[];
  prohibitedUses: string[];
}

interface TrainingDataSummary {
  sources: string[];
  size: string;
  preprocessing: string[];
  cutoffDate: string;
  languages: string[];
  personalDataHandling: string;
}

interface Capability {
  name: string;
  description: string;
  level: 'basic' | 'intermediate' | 'advanced';
}

interface Limitation {
  area: string;
  description: string;
  mitigationAdvice: string;
}

interface EvaluationResult {
  benchmark: string;
  score: string;
  date: string;
  methodology: string;
}

interface SafetyEvaluation {
  category: string;
  result: 'pass' | 'conditional' | 'fail';
  details: string;
  date: string;
}

interface ComputeResources {
  trainingCompute: string;
  trainingFlops: string;
  isSystemicRiskThreshold: boolean;
  carbonFootprint: string;
  energyConsumption: string;
  hardwareUsed: string;
}

interface RiskMitigation {
  risk: string;
  mitigation: string;
  status: 'implemented' | 'planned' | 'not-applicable';
}

interface KnownIssue {
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  mitigationStatus: string;
}

interface SystemicRiskAssessment {
  meetsThreshold: boolean;
  flopsEstimate: string;
  riskFactors: string[];
  additionalObligations: string[];
  adversarialEvaluations: { name: string; status: 'complete' | 'in-progress' | 'planned' }[];
  incidentReportingProcess: string;
}

interface GpaiModelData {
  identity: ModelIdentity;
  intendedUse: IntendedUse;
  trainingData: TrainingDataSummary;
  capabilities: Capability[];
  limitations: Limitation[];
  evaluations: EvaluationResult[];
  safetyEvaluations: SafetyEvaluation[];
  compute: ComputeResources;
  riskMitigations: RiskMitigation[];
  knownIssues: KnownIssue[];
  systemicRisk?: SystemicRiskAssessment;
  technicalDocUrl: string;
  lastUpdated: string;
}

interface CardSection {
  id: string;
  name: string;
  icon: IconName;
  description: string;
  euAiActRef: string;
  required: boolean;
}

// ─────────────────────────── Constants ───────────────────────────

const CARD_SECTIONS: CardSection[] = [
  { id: 'identity', name: 'Model Identity', icon: 'cpu-chip', description: 'Basic model identification and versioning', euAiActRef: 'Art. 53(1)(a)', required: true },
  { id: 'intended-use', name: 'Intended Use', icon: 'clipboard-list', description: 'Purposes, domains, and use limitations', euAiActRef: 'Art. 53(1)(a)', required: true },
  { id: 'training-data', name: 'Training Data Summary', icon: 'circle-stack', description: 'Data sources, size, and processing methodology', euAiActRef: 'Art. 53(1)(d)', required: true },
  { id: 'capabilities', name: 'Capabilities & Performance', icon: 'chart-bar', description: 'What the model can do and performance characteristics', euAiActRef: 'Art. 53(1)(b)', required: true },
  { id: 'limitations', name: 'Limitations', icon: 'exclamation-triangle', description: 'Known limitations and failure modes', euAiActRef: 'Art. 53(1)(b)', required: true },
  { id: 'evaluations', name: 'Evaluation Results', icon: 'beaker', description: 'Benchmark performance and safety evaluations', euAiActRef: 'Art. 53(1)(c)', required: true },
  { id: 'compute', name: 'Compute Resources', icon: 'bolt', description: 'Training compute and environmental impact', euAiActRef: 'Art. 53(1)(e)', required: true },
  { id: 'mitigations', name: 'Risk Mitigations', icon: 'shield-check', description: 'Safety measures and guardrails', euAiActRef: 'Art. 53(1)(b)', required: true },
  { id: 'issues', name: 'Known Issues & Biases', icon: 'scale', description: 'Documented biases and known issues', euAiActRef: 'Art. 53(1)(b)', required: true },
  { id: 'systemic', name: 'Systemic Risk Assessment', icon: 'exclamation-circle', description: 'Additional obligations for high-compute models', euAiActRef: 'Art. 51 & 55', required: false },
];

// Mock GPAI models from the organization's registry
const GPAI_MODELS_REGISTRY: { id: string; name: string; provider: string; isFoundation: boolean; hasCard: boolean; cardStatus: 'complete' | 'partial' | 'missing'; isSystemicRisk: boolean }[] = [
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'Anthropic', isFoundation: true, hasCard: true, cardStatus: 'complete', isSystemicRisk: false },
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', provider: 'Anthropic', isFoundation: true, hasCard: true, cardStatus: 'complete', isSystemicRisk: true },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'Anthropic', isFoundation: true, hasCard: true, cardStatus: 'partial', isSystemicRisk: false },
  { id: 'nova-pro', name: 'Amazon Nova Pro', provider: 'Amazon', isFoundation: true, hasCard: true, cardStatus: 'complete', isSystemicRisk: false },
  { id: 'nova-lite', name: 'Amazon Nova Lite', provider: 'Amazon', isFoundation: true, hasCard: false, cardStatus: 'missing', isSystemicRisk: false },
  { id: 'titan-embed', name: 'Amazon Titan Embeddings', provider: 'Amazon', isFoundation: true, hasCard: true, cardStatus: 'partial', isSystemicRisk: false },
];

// Mock data for a sample GPAI model card
const SAMPLE_MODEL_DATA: GpaiModelData = {
  identity: {
    name: 'Claude Sonnet 4.5',
    version: '4.5.2',
    provider: 'Anthropic',
    releaseDate: '2026-02-15',
    modelId: 'claude-sonnet-4-5',
    modelFamily: 'Claude',
    euDatabaseId: 'GPAI-EU-2026-0842',
  },
  intendedUse: {
    purposes: [
      'Text generation and completion',
      'Question answering',
      'Code generation and review',
      'Document summarization',
      'Conversational AI applications',
    ],
    domains: [
      'Financial services',
      'Healthcare (non-diagnostic)',
      'Customer service',
      'Software development',
      'Research assistance',
    ],
    limitations: [
      'Not for autonomous decision-making affecting fundamental rights',
      'Not for real-time trading without human oversight',
      'Not for medical diagnosis or treatment recommendations',
      'Requires human oversight for high-stakes decisions',
    ],
    prohibitedUses: [
      'Social scoring systems',
      'Manipulation of human behavior',
      'Real-time biometric identification for law enforcement',
      'Exploitation of vulnerable groups',
    ],
  },
  trainingData: {
    sources: [
      'Licensed web content',
      'Public domain books and literature',
      'Open-source code repositories',
      'Scientific publications (with licensing)',
      'Curated conversational datasets',
    ],
    size: '~2.5 trillion tokens',
    preprocessing: [
      'Deduplication and quality filtering',
      'PII detection and removal',
      'Harmful content filtering',
      'Format normalization',
      'Language identification',
    ],
    cutoffDate: '2025-09-01',
    languages: ['English (primary)', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', '+40 others'],
    personalDataHandling: 'Training data processed under legitimate interest; PII systematically detected and removed during preprocessing.',
  },
  capabilities: [
    { name: 'Natural Language Understanding', description: 'Comprehension of complex text across domains', level: 'advanced' },
    { name: 'Code Generation', description: 'Generation of functional code in 50+ programming languages', level: 'advanced' },
    { name: 'Reasoning', description: 'Multi-step logical reasoning and problem solving', level: 'advanced' },
    { name: 'Multilingual Support', description: 'Understanding and generation in 40+ languages', level: 'intermediate' },
    { name: 'Summarization', description: 'Distillation of long documents into concise summaries', level: 'advanced' },
  ],
  limitations: [
    { area: 'Factual Accuracy', description: 'May generate plausible-sounding but incorrect information', mitigationAdvice: 'Verify factual claims through authoritative sources' },
    { area: 'Mathematical Computation', description: 'Limited precision in complex calculations', mitigationAdvice: 'Use dedicated calculation tools for precise math' },
    { area: 'Real-time Information', description: 'Knowledge cutoff limits current event awareness', mitigationAdvice: 'Provide relevant context or use retrieval augmentation' },
    { area: 'Long Context Coherence', description: 'May lose coherence in very long conversations', mitigationAdvice: 'Periodically summarize context in long interactions' },
  ],
  evaluations: [
    { benchmark: 'MMLU', score: '89.2%', date: '2026-01-15', methodology: 'Zero-shot evaluation on held-out test set' },
    { benchmark: 'HumanEval', score: '92.1%', date: '2026-01-15', methodology: 'Pass@1 code generation accuracy' },
    { benchmark: 'GSM8K', score: '95.8%', date: '2026-01-15', methodology: 'Chain-of-thought prompting' },
    { benchmark: 'TruthfulQA', score: '78.4%', date: '2026-01-15', methodology: 'Truthfulness and informativeness scoring' },
    { benchmark: 'HellaSwag', score: '96.2%', date: '2026-01-15', methodology: 'Commonsense reasoning evaluation' },
  ],
  safetyEvaluations: [
    { category: 'Harmful Content Generation', result: 'pass', details: 'Constitutional AI training reduces harmful outputs by 97%', date: '2026-01-20' },
    { category: 'Bias (Gender)', result: 'conditional', details: 'Some residual bias in occupational stereotypes; mitigated by post-processing', date: '2026-01-20' },
    { category: 'Bias (Race/Ethnicity)', result: 'pass', details: 'Within acceptable thresholds per NIST AI RMF guidelines', date: '2026-01-20' },
    { category: 'Prompt Injection Resistance', result: 'conditional', details: 'Robust to common attacks; advanced attacks require guardrails', date: '2026-01-20' },
    { category: 'Privacy Leakage', result: 'pass', details: 'PII detection in training prevents memorization of personal data', date: '2026-01-20' },
  ],
  compute: {
    trainingCompute: '8.5 x 10^24 FLOPs',
    trainingFlops: '8.5e24',
    isSystemicRiskThreshold: false,
    carbonFootprint: '~420 tonnes CO2 equivalent',
    energyConsumption: '~2.1 GWh',
    hardwareUsed: 'NVIDIA H100 GPUs (proprietary cluster)',
  },
  riskMitigations: [
    { risk: 'Harmful content generation', mitigation: 'Constitutional AI training + output filtering', status: 'implemented' },
    { risk: 'PII exposure', mitigation: 'PII detection guardrails (Bedrock)', status: 'implemented' },
    { risk: 'Prompt injection', mitigation: 'Input validation + content filtering guardrails', status: 'implemented' },
    { risk: 'Bias amplification', mitigation: 'Bias testing + fairness constraints', status: 'implemented' },
    { risk: 'Hallucination', mitigation: 'Contextual grounding checks', status: 'implemented' },
    { risk: 'Misuse for disinformation', mitigation: 'Use case monitoring + audit logging', status: 'planned' },
  ],
  knownIssues: [
    { category: 'Sycophancy', description: 'May overly agree with user assertions', severity: 'medium', mitigationStatus: 'Active research; partially addressed in v4.5' },
    { category: 'Occupational Stereotypes', description: 'Residual bias in gender-occupation associations', severity: 'medium', mitigationStatus: 'Post-processing filter available' },
    { category: 'Instruction Following', description: 'May over-index on explicit instructions vs. implicit intent', severity: 'low', mitigationStatus: 'Documented; user guidance provided' },
  ],
  technicalDocUrl: 'https://docs.anthropic.com/claude/model-card',
  lastUpdated: '2026-05-15',
};

const SAMPLE_SYSTEMIC_RISK: SystemicRiskAssessment = {
  meetsThreshold: true,
  flopsEstimate: '1.2 x 10^26 FLOPs',
  riskFactors: [
    'Training compute exceeds 10^25 FLOPs threshold',
    'Widespread downstream deployment potential',
    'Multi-capability general-purpose system',
  ],
  additionalObligations: [
    'Model evaluation against adversarial attacks',
    'Systemic risk assessment',
    'Serious incident reporting to AI Office',
    'Adequate cybersecurity protection',
  ],
  adversarialEvaluations: [
    { name: 'CBRN risk assessment', status: 'complete' },
    { name: 'Autonomous capability evaluation', status: 'complete' },
    { name: 'Cybersecurity vulnerability testing', status: 'complete' },
    { name: 'Persuasion/manipulation testing', status: 'in-progress' },
  ],
  incidentReportingProcess: 'Dedicated incident response team with 72-hour notification to EU AI Office for serious incidents.',
};

// ─────────────────────────── Helper Functions ───────────────────────────

function calculateCompleteness(data: GpaiModelData): { percentage: number; sectionStatus: Record<string, CompletionStatus> } {
  const sectionStatus: Record<string, CompletionStatus> = {};

  // Check each section
  sectionStatus['identity'] = data.identity.name && data.identity.provider ? 'complete' : data.identity.name ? 'partial' : 'missing';
  sectionStatus['intended-use'] = data.intendedUse.purposes.length > 0 && data.intendedUse.limitations.length > 0 ? 'complete' : data.intendedUse.purposes.length > 0 ? 'partial' : 'missing';
  sectionStatus['training-data'] = data.trainingData.sources.length > 0 && data.trainingData.size ? 'complete' : data.trainingData.sources.length > 0 ? 'partial' : 'missing';
  sectionStatus['capabilities'] = data.capabilities.length >= 3 ? 'complete' : data.capabilities.length > 0 ? 'partial' : 'missing';
  sectionStatus['limitations'] = data.limitations.length >= 2 ? 'complete' : data.limitations.length > 0 ? 'partial' : 'missing';
  sectionStatus['evaluations'] = data.evaluations.length >= 3 && data.safetyEvaluations.length > 0 ? 'complete' : data.evaluations.length > 0 ? 'partial' : 'missing';
  sectionStatus['compute'] = data.compute.trainingCompute && data.compute.carbonFootprint ? 'complete' : data.compute.trainingCompute ? 'partial' : 'missing';
  sectionStatus['mitigations'] = data.riskMitigations.length >= 3 ? 'complete' : data.riskMitigations.length > 0 ? 'partial' : 'missing';
  sectionStatus['issues'] = data.knownIssues.length > 0 ? 'complete' : 'missing';
  sectionStatus['systemic'] = data.systemicRisk ? (data.systemicRisk.adversarialEvaluations.length >= 3 ? 'complete' : 'partial') : 'missing';

  const requiredSections = CARD_SECTIONS.filter(s => s.required);
  const completeSections = requiredSections.filter(s => sectionStatus[s.id] === 'complete').length;
  const partialSections = requiredSections.filter(s => sectionStatus[s.id] === 'partial').length;

  const percentage = Math.round(((completeSections + partialSections * 0.5) / requiredSections.length) * 100);

  return { percentage, sectionStatus };
}

// ─────────────────────────── Component ───────────────────────────

interface GpaiModelCardProps {
  embedded?: boolean;
  initialModelId?: string;
  onClose?: () => void;
  onViewFullCard?: (modelId: string) => void;
}

export default function GpaiModelCard({ embedded = false, initialModelId, onClose, onViewFullCard }: GpaiModelCardProps) {
  const [selectedModel, setSelectedModel] = useState<string | null>(initialModelId || null);
  const [activeSection, setActiveSection] = useState<string>('identity');
  const [compareMode, setCompareMode] = useState(false);
  const [compareModel, setCompareModel] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Get model data (mock)
  const modelData = useMemo(() => {
    if (!selectedModel) return null;
    // In production, this would fetch from API
    if (selectedModel === 'claude-opus-4-7') {
      return { ...SAMPLE_MODEL_DATA, identity: { ...SAMPLE_MODEL_DATA.identity, name: 'Claude Opus 4.7', version: '4.7.1', modelId: 'claude-opus-4-7' }, systemicRisk: SAMPLE_SYSTEMIC_RISK };
    }
    return SAMPLE_MODEL_DATA;
  }, [selectedModel]);

  const completeness = useMemo(() => {
    if (!modelData) return { percentage: 0, sectionStatus: {} as Record<string, CompletionStatus> };
    return calculateCompleteness(modelData);
  }, [modelData]);

  // Toast helper
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Export to PDF (mock)
  const exportToPdf = useCallback(() => {
    if (!modelData) return;

    let report = `GPAI MODEL TRANSPARENCY CARD\n`;
    report += `EU AI Act Article 53 Compliance Document\n`;
    report += `${'='.repeat(60)}\n\n`;
    report += `Model: ${modelData.identity.name} (v${modelData.identity.version})\n`;
    report += `Provider: ${modelData.identity.provider}\n`;
    report += `Release Date: ${modelData.identity.releaseDate}\n`;
    report += `EU Database ID: ${modelData.identity.euDatabaseId || 'Pending registration'}\n`;
    report += `Completeness: ${completeness.percentage}%\n`;
    report += `Last Updated: ${modelData.lastUpdated}\n\n`;

    report += `${'─'.repeat(60)}\n`;
    report += `INTENDED USE\n`;
    report += `${'─'.repeat(60)}\n`;
    report += `Purposes:\n${modelData.intendedUse.purposes.map(p => `  - ${p}`).join('\n')}\n\n`;
    report += `Domains:\n${modelData.intendedUse.domains.map(d => `  - ${d}`).join('\n')}\n\n`;
    report += `Limitations:\n${modelData.intendedUse.limitations.map(l => `  - ${l}`).join('\n')}\n\n`;
    report += `Prohibited Uses:\n${modelData.intendedUse.prohibitedUses.map(p => `  - ${p}`).join('\n')}\n\n`;

    report += `${'─'.repeat(60)}\n`;
    report += `TRAINING DATA SUMMARY\n`;
    report += `${'─'.repeat(60)}\n`;
    report += `Size: ${modelData.trainingData.size}\n`;
    report += `Cutoff Date: ${modelData.trainingData.cutoffDate}\n`;
    report += `Sources:\n${modelData.trainingData.sources.map(s => `  - ${s}`).join('\n')}\n\n`;

    report += `${'─'.repeat(60)}\n`;
    report += `COMPUTE RESOURCES\n`;
    report += `${'─'.repeat(60)}\n`;
    report += `Training Compute: ${modelData.compute.trainingCompute}\n`;
    report += `Carbon Footprint: ${modelData.compute.carbonFootprint}\n`;
    report += `Energy Consumption: ${modelData.compute.energyConsumption}\n`;
    report += `Systemic Risk Threshold: ${modelData.compute.isSystemicRiskThreshold ? 'YES (>10^25 FLOPs)' : 'No'}\n\n`;

    if (modelData.systemicRisk) {
      report += `${'─'.repeat(60)}\n`;
      report += `SYSTEMIC RISK ASSESSMENT (Art. 51 & 55)\n`;
      report += `${'─'.repeat(60)}\n`;
      report += `Meets Threshold: ${modelData.systemicRisk.meetsThreshold ? 'YES' : 'No'}\n`;
      report += `FLOPs Estimate: ${modelData.systemicRisk.flopsEstimate}\n`;
      report += `Additional Obligations:\n${modelData.systemicRisk.additionalObligations.map(o => `  - ${o}`).join('\n')}\n\n`;
    }

    report += `\nGenerated: ${new Date().toISOString()}\n`;
    report += `Technical Documentation: ${modelData.technicalDocUrl}\n`;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GPAI_Model_Card_${modelData.identity.modelId}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Model card exported (PDF generation mock - exported as text)', 'info');
  }, [modelData, completeness, showToast]);

  // Export to JSON
  const exportToJson = useCallback(() => {
    if (!modelData) return;
    const blob = new Blob([JSON.stringify(modelData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GPAI_Model_Card_${modelData.identity.modelId}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Model card exported as JSON', 'success');
  }, [modelData, showToast]);

  // ─────────────────────────── Model Selection View ───────────────────────────

  if (!selectedModel) {
    return (
      <div className={embedded ? '' : 'p-6'}>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Icon name="document-text" className="w-5 h-5 text-amber-600" strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">GPAI Model Transparency Cards</h2>
                <p className="text-sm text-slate-500">EU AI Act Article 53 - Select a foundation model</p>
              </div>
            </div>
            <MockDataBadge integration="GPAI Model Registry (Bedrock + governance DB)" />
          </div>

          <div className="p-5">
            {/* Explanation Card */}
            <div className="mb-6 p-4 rounded-xl bg-blue-50/50 border border-blue-200">
              <div className="flex items-start gap-3">
                <Icon name="information-circle" className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-blue-800 mb-1">EU AI Act Article 53 Requirements</div>
                  <div className="text-xs text-blue-700 space-y-1">
                    <p>
                      Providers of General-Purpose AI (GPAI) models must maintain transparency documentation including:
                    </p>
                    <ul className="list-disc list-inside ml-2 space-y-0.5">
                      <li>Model identity, capabilities, and intended purpose</li>
                      <li>Training data summary (types, sources, methodology)</li>
                      <li>Evaluation results and known limitations</li>
                      <li>Compute resources and environmental impact</li>
                      <li>Risk mitigations and safety measures</li>
                    </ul>
                    <p className="pt-1 font-medium">
                      Models exceeding 10^25 FLOPs have additional obligations under Article 51 (systemic risk).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* GPAI Models List */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon name="cpu-chip" className="w-4 h-4 text-slate-600" />
                  <span className="text-sm font-semibold text-slate-800">Foundation Models in Registry</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Complete
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Partial
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                    Missing
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {GPAI_MODELS_REGISTRY.map(model => (
                  <button
                    key={model.id}
                    onClick={() => model.hasCard ? setSelectedModel(model.id) : showToast('Model card not yet available', 'info')}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left group ${
                      model.hasCard
                        ? 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'
                        : 'border-slate-200 bg-slate-50/50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          model.cardStatus === 'complete' ? 'bg-emerald-500' :
                          model.cardStatus === 'partial' ? 'bg-amber-400' :
                          'bg-slate-300'
                        }`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold ${model.hasCard ? 'text-slate-800 group-hover:text-amber-700' : 'text-slate-500'}`}>
                              {model.name}
                            </span>
                            {model.isSystemicRisk && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                SYSTEMIC RISK
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{model.provider}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {model.hasCard ? (
                          <span className={`text-[10px] font-medium px-2 py-1 rounded ${
                            model.cardStatus === 'complete' ? 'bg-emerald-100 text-emerald-700' :
                            model.cardStatus === 'partial' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {model.cardStatus === 'complete' ? 'Card Complete' :
                             model.cardStatus === 'partial' ? 'Card Partial' : 'Card Missing'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium px-2 py-1 rounded bg-slate-100 text-slate-500">
                            Awaiting Card
                          </span>
                        )}
                        {model.hasCard && <Icon name="chevron-right" className="w-4 h-4 text-slate-400 group-hover:text-amber-600" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100">
              <div className="text-center p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="text-xl font-bold text-emerald-600">
                  {GPAI_MODELS_REGISTRY.filter(m => m.cardStatus === 'complete').length}
                </div>
                <div className="text-[10px] text-emerald-700">Cards Complete</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="text-xl font-bold text-amber-600">
                  {GPAI_MODELS_REGISTRY.filter(m => m.cardStatus === 'partial').length}
                </div>
                <div className="text-[10px] text-amber-700">Cards Partial</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-rose-50 border border-rose-200">
                <div className="text-xl font-bold text-rose-600">
                  {GPAI_MODELS_REGISTRY.filter(m => m.isSystemicRisk).length}
                </div>
                <div className="text-[10px] text-rose-700">Systemic Risk Models</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────── Model Card Detail View ───────────────────────────

  if (!modelData) {
    return <div className="text-center py-8 text-slate-500">Loading model data...</div>;
  }

  const currentSection = CARD_SECTIONS.find(s => s.id === activeSection);

  return (
    <div className={embedded ? '' : 'p-6'}>
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Icon name="document-text" className="w-5 h-5 text-amber-600" strokeWidth={2} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">{modelData.identity.name}</h2>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                    EU AI Act Art. 53
                  </span>
                  {modelData.systemicRisk && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">
                      SYSTEMIC RISK
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500">v{modelData.identity.version} | {modelData.identity.provider}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedModel(null)}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Back to List
              </button>
              {onClose && (
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                  <Icon name="x-mark" className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Completeness Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">Card Completeness</span>
              <span className={`text-xs font-semibold ${
                completeness.percentage >= 80 ? 'text-emerald-600' :
                completeness.percentage >= 50 ? 'text-amber-600' :
                'text-rose-600'
              }`}>
                {completeness.percentage}%
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  completeness.percentage >= 80 ? 'bg-emerald-500' :
                  completeness.percentage >= 50 ? 'bg-amber-500' :
                  'bg-rose-500'
                }`}
                style={{ width: `${completeness.percentage}%` }}
              />
            </div>
          </div>

          {/* Section Tabs */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {CARD_SECTIONS.map(section => {
              const status = completeness.sectionStatus[section.id];
              const isActive = activeSection === section.id;
              const isSystemic = section.id === 'systemic';

              if (isSystemic && !modelData.systemicRisk) return null;

              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-300 ring-offset-1'
                      : status === 'complete'
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : status === 'partial'
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  <Icon name={section.icon} className="w-3 h-3" />
                  {section.name}
                  {status === 'complete' && <Icon name="check" className="w-2.5 h-2.5 text-emerald-600" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="p-5">
          {currentSection && (
            <div className="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 mb-1">
                <Icon name={currentSection.icon} className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-semibold text-slate-800">{currentSection.name}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{currentSection.euAiActRef}</span>
              </div>
              <p className="text-xs text-slate-500">{currentSection.description}</p>
            </div>
          )}

          {/* Section Content */}
          {activeSection === 'identity' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Model Name</div>
                  <div className="text-sm font-semibold text-slate-800 mt-1">{modelData.identity.name}</div>
                </div>
                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Version</div>
                  <div className="text-sm font-semibold text-slate-800 mt-1">{modelData.identity.version}</div>
                </div>
                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Provider</div>
                  <div className="text-sm font-semibold text-slate-800 mt-1">{modelData.identity.provider}</div>
                </div>
                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Release Date</div>
                  <div className="text-sm font-semibold text-slate-800 mt-1">{modelData.identity.releaseDate}</div>
                </div>
                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Model Family</div>
                  <div className="text-sm font-semibold text-slate-800 mt-1">{modelData.identity.modelFamily}</div>
                </div>
                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">EU Database ID</div>
                  <div className="text-sm font-semibold text-slate-800 mt-1">{modelData.identity.euDatabaseId || 'Pending'}</div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'intended-use' && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">Intended Purposes</div>
                <div className="flex flex-wrap gap-2">
                  {modelData.intendedUse.purposes.map((purpose, idx) => (
                    <span key={idx} className="text-xs px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {purpose}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">Supported Domains</div>
                <div className="flex flex-wrap gap-2">
                  {modelData.intendedUse.domains.map((domain, idx) => (
                    <span key={idx} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                      {domain}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">Use Limitations</div>
                <ul className="space-y-1.5">
                  {modelData.intendedUse.limitations.map((limitation, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-amber-700">
                      <Icon name="exclamation-triangle" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      {limitation}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                <div className="text-xs font-semibold text-rose-800 mb-2">Prohibited Uses</div>
                <ul className="space-y-1.5">
                  {modelData.intendedUse.prohibitedUses.map((use, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-rose-700">
                      <Icon name="no-symbol" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      {use}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeSection === 'training-data' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Dataset Size</div>
                  <div className="text-lg font-bold text-slate-800 mt-1">{modelData.trainingData.size}</div>
                </div>
                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Knowledge Cutoff</div>
                  <div className="text-lg font-bold text-slate-800 mt-1">{modelData.trainingData.cutoffDate}</div>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">Data Sources</div>
                <div className="flex flex-wrap gap-2">
                  {modelData.trainingData.sources.map((source, idx) => (
                    <span key={idx} className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                      {source}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">Languages</div>
                <div className="flex flex-wrap gap-2">
                  {modelData.trainingData.languages.map((lang, idx) => (
                    <span key={idx} className="text-xs px-2 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200">
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">Preprocessing Steps</div>
                <ol className="space-y-1.5">
                  {modelData.trainingData.preprocessing.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                        {idx + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <div className="text-xs font-semibold text-blue-800 mb-1">Personal Data Handling</div>
                <p className="text-xs text-blue-700">{modelData.trainingData.personalDataHandling}</p>
              </div>
            </div>
          )}

          {activeSection === 'capabilities' && (
            <div className="space-y-3">
              {modelData.capabilities.map((cap, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-white border border-slate-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-slate-800">{cap.name}</span>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                      cap.level === 'advanced' ? 'bg-emerald-100 text-emerald-700' :
                      cap.level === 'intermediate' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {cap.level}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{cap.description}</p>
                </div>
              ))}
            </div>
          )}

          {activeSection === 'limitations' && (
            <div className="space-y-3">
              {modelData.limitations.map((lim, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="text-xs font-semibold text-amber-800 mb-1">{lim.area}</div>
                  <p className="text-xs text-amber-700 mb-2">{lim.description}</p>
                  <div className="flex items-start gap-2 text-xs text-slate-600 bg-white/50 p-2 rounded">
                    <Icon name="light-bulb" className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-500" />
                    <span><strong>Mitigation:</strong> {lim.mitigationAdvice}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSection === 'evaluations' && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-3">Benchmark Results</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Benchmark</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-700">Score</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Methodology</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {modelData.evaluations.map((eval_, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-medium text-slate-800">{eval_.benchmark}</td>
                          <td className="px-3 py-2 text-center font-bold text-emerald-600">{eval_.score}</td>
                          <td className="px-3 py-2 text-slate-500">{eval_.date}</td>
                          <td className="px-3 py-2 text-slate-500">{eval_.methodology}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-3">Safety Evaluations</div>
                <div className="space-y-2">
                  {modelData.safetyEvaluations.map((eval_, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-200">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        eval_.result === 'pass' ? 'bg-emerald-100' :
                        eval_.result === 'conditional' ? 'bg-amber-100' :
                        'bg-rose-100'
                      }`}>
                        {eval_.result === 'pass' ? (
                          <Icon name="check" className="w-3.5 h-3.5 text-emerald-600" />
                        ) : eval_.result === 'conditional' ? (
                          <Icon name="exclamation-triangle" className="w-3.5 h-3.5 text-amber-600" />
                        ) : (
                          <Icon name="x-mark" className="w-3.5 h-3.5 text-rose-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-800">{eval_.category}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                            eval_.result === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                            eval_.result === 'conditional' ? 'bg-amber-100 text-amber-700' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {eval_.result === 'pass' ? 'Pass' : eval_.result === 'conditional' ? 'Conditional' : 'Fail'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{eval_.details}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'compute' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-violet-50 border border-violet-200">
                  <div className="text-[10px] text-violet-600 uppercase tracking-wide">Training Compute</div>
                  <div className="text-lg font-bold text-violet-800 mt-1">{modelData.compute.trainingCompute}</div>
                </div>
                <div className={`p-4 rounded-lg border ${
                  modelData.compute.isSystemicRiskThreshold
                    ? 'bg-rose-50 border-rose-200'
                    : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <div className={`text-[10px] uppercase tracking-wide ${
                    modelData.compute.isSystemicRiskThreshold ? 'text-rose-600' : 'text-emerald-600'
                  }`}>
                    Systemic Risk Threshold
                  </div>
                  <div className={`text-lg font-bold mt-1 ${
                    modelData.compute.isSystemicRiskThreshold ? 'text-rose-800' : 'text-emerald-800'
                  }`}>
                    {modelData.compute.isSystemicRiskThreshold ? 'Exceeds' : 'Below'}
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5">&gt;10^25 FLOPs threshold</div>
                </div>
                <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="text-[10px] text-blue-600 uppercase tracking-wide">Hardware</div>
                  <div className="text-sm font-semibold text-blue-800 mt-1">{modelData.compute.hardwareUsed}</div>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs font-semibold text-slate-700 mb-3">Environmental Impact</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Carbon Footprint</div>
                    <div className="text-sm font-semibold text-slate-800">{modelData.compute.carbonFootprint}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Energy Consumption</div>
                    <div className="text-sm font-semibold text-slate-800">{modelData.compute.energyConsumption}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'mitigations' && (
            <div className="space-y-2">
              {modelData.riskMitigations.map((mit, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-200">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    mit.status === 'implemented' ? 'bg-emerald-100' :
                    mit.status === 'planned' ? 'bg-amber-100' :
                    'bg-slate-100'
                  }`}>
                    {mit.status === 'implemented' ? (
                      <Icon name="check" className="w-3.5 h-3.5 text-emerald-600" />
                    ) : mit.status === 'planned' ? (
                      <Icon name="calendar" className="w-3.5 h-3.5 text-amber-600" />
                    ) : (
                      <Icon name="circle" className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800">{mit.risk}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        mit.status === 'implemented' ? 'bg-emerald-100 text-emerald-700' :
                        mit.status === 'planned' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {mit.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{mit.mitigation}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSection === 'issues' && (
            <div className="space-y-3">
              {modelData.knownIssues.map((issue, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${
                  issue.severity === 'high' ? 'bg-rose-50 border-rose-200' :
                  issue.severity === 'medium' ? 'bg-amber-50 border-amber-200' :
                  'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold ${
                      issue.severity === 'high' ? 'text-rose-800' :
                      issue.severity === 'medium' ? 'text-amber-800' :
                      'text-slate-700'
                    }`}>
                      {issue.category}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                      issue.severity === 'high' ? 'bg-rose-100 text-rose-700' :
                      issue.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {issue.severity} severity
                    </span>
                  </div>
                  <p className={`text-xs mb-2 ${
                    issue.severity === 'high' ? 'text-rose-700' :
                    issue.severity === 'medium' ? 'text-amber-700' :
                    'text-slate-600'
                  }`}>
                    {issue.description}
                  </p>
                  <div className="text-[10px] text-slate-500">
                    <strong>Status:</strong> {issue.mitigationStatus}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSection === 'systemic' && modelData.systemicRisk && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-rose-50 border border-rose-200">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="exclamation-circle" className="w-5 h-5 text-rose-600" />
                  <span className="text-sm font-semibold text-rose-800">Systemic Risk GPAI (Art. 51 & 55)</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-[10px] text-rose-600 uppercase">FLOPs Estimate</div>
                    <div className="text-lg font-bold text-rose-800">{modelData.systemicRisk.flopsEstimate}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-rose-600 uppercase">Threshold Status</div>
                    <div className="text-lg font-bold text-rose-800">
                      {modelData.systemicRisk.meetsThreshold ? 'Exceeds 10^25 FLOPs' : 'Below Threshold'}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-rose-700 mb-2">Risk Factors:</div>
                <ul className="space-y-1 mb-4">
                  {modelData.systemicRisk.riskFactors.map((factor, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-rose-700">
                      <Icon name="exclamation-triangle" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 mb-3">Additional Obligations (Art. 55)</div>
                <div className="space-y-2">
                  {modelData.systemicRisk.additionalObligations.map((obligation, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <Icon name="clipboard-document-check" className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-slate-700">{obligation}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 mb-3">Adversarial Evaluations</div>
                <div className="space-y-2">
                  {modelData.systemicRisk.adversarialEvaluations.map((eval_, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                      <span className="text-xs text-slate-700">{eval_.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        eval_.status === 'complete' ? 'bg-emerald-100 text-emerald-700' :
                        eval_.status === 'in-progress' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {eval_.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <div className="text-xs font-semibold text-blue-800 mb-1">Incident Reporting Process</div>
                <p className="text-xs text-blue-700">{modelData.systemicRisk.incidentReportingProcess}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-500">Last Updated: {modelData.lastUpdated}</span>
            {modelData.technicalDocUrl && (
              <a
                href={modelData.technicalDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
                Technical Documentation
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportToJson}
              className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1"
            >
              <Icon name="code-bracket" className="w-3.5 h-3.5" />
              Export JSON
            </button>
            <button
              onClick={exportToPdf}
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-xs font-medium text-white hover:bg-amber-700 transition-colors flex items-center gap-1"
            >
              <Icon name="document-arrow-down" className="w-3.5 h-3.5" />
              Export Report
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 transition-all ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' :
          toast.type === 'error' ? 'bg-rose-500 text-white' :
          'bg-slate-800 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
