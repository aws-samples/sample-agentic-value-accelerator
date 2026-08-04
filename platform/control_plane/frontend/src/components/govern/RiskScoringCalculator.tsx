/**
 * RiskScoringCalculator — Interactive tool to score a model using the 4-dimension framework
 *
 * Dimensions:
 * 1. Use Case Criticality (0-25)
 * 2. Data Sensitivity (0-25)
 * 3. Autonomy Level (0-25)
 * 4. Model Complexity (0-25)
 *
 * See riskScoring.ts for full methodology documentation.
 */

import { useState, useMemo } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { Icon } from './icons';
import {
  RISK_SCORING_DIMENSIONS,
  RISK_TIER_CONFIG,
  getRiskTierFromScore,
  getRiskTierConfig,
  calculateResidualRiskScore,
  isResidualRiskAcceptable,
} from './riskScoring';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface Control {
  name: string;
  mitigation: number;
  active: boolean;
}

interface BedrockModel {
  id: string;
  name: string;
  provider: 'Anthropic' | 'Amazon';
  modelId: string;
  description: string;
  contextWindow: string;
  maxOutput: string;
  modalities: string[];
  useCase: string;
  modelCardUrl: string;
  suggestedScores?: Partial<Record<string, number>>;
}

const BEDROCK_MODELS: BedrockModel[] = [
  // Anthropic Models
  {
    id: 'claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'Anthropic',
    modelId: 'anthropic.claude-opus-4-20250514-v1:0',
    description: 'Most capable model for complex analysis, nuanced content, and agentic workflows with extended thinking.',
    contextWindow: '200K tokens',
    maxOutput: '32K tokens',
    modalities: ['Text', 'Vision', 'Tool Use', 'Extended Thinking'],
    useCase: 'Complex reasoning, code generation, agentic tasks, research',
    modelCardUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/model-card',
    suggestedScores: { 'model-complexity': 25, 'autonomy-level': 20 },
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    modelId: 'anthropic.claude-sonnet-4-20250514-v1:0',
    description: 'Balanced model offering strong performance with improved efficiency. Ideal for enterprise workloads.',
    contextWindow: '200K tokens',
    maxOutput: '16K tokens',
    modalities: ['Text', 'Vision', 'Tool Use'],
    useCase: 'Enterprise assistants, content generation, code review',
    modelCardUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/model-card',
    suggestedScores: { 'model-complexity': 15, 'autonomy-level': 15 },
  },
  {
    id: 'claude-haiku-3.5',
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    modelId: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    description: 'Fast, cost-effective model for high-volume tasks. Best latency-to-performance ratio.',
    contextWindow: '200K tokens',
    maxOutput: '8K tokens',
    modalities: ['Text', 'Vision', 'Tool Use'],
    useCase: 'Classification, extraction, high-volume processing, chatbots',
    modelCardUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/model-card',
    suggestedScores: { 'model-complexity': 10, 'autonomy-level': 10 },
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'Anthropic',
    modelId: 'anthropic.claude-3-opus-20240229-v1:0',
    description: 'Previous generation flagship model. Exceptional reasoning and analysis capabilities.',
    contextWindow: '200K tokens',
    maxOutput: '4K tokens',
    modalities: ['Text', 'Vision', 'Tool Use'],
    useCase: 'Complex analysis, strategic planning, research synthesis',
    modelCardUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/model-card',
    suggestedScores: { 'model-complexity': 20, 'autonomy-level': 15 },
  },
  {
    id: 'claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    provider: 'Anthropic',
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    description: 'Previous generation balanced model. Good for general-purpose enterprise applications.',
    contextWindow: '200K tokens',
    maxOutput: '4K tokens',
    modalities: ['Text', 'Vision', 'Tool Use'],
    useCase: 'Customer service, document processing, general assistants',
    modelCardUrl: 'https://docs.anthropic.com/en/docs/about-claude/models/model-card',
    suggestedScores: { 'model-complexity': 15, 'autonomy-level': 10 },
  },
  // Amazon Models
  {
    id: 'titan-text-premier',
    name: 'Amazon Titan Text Premier',
    provider: 'Amazon',
    modelId: 'amazon.titan-text-premier-v1:0',
    description: 'Amazon\'s most advanced text model with strong instruction following and RAG capabilities.',
    contextWindow: '32K tokens',
    maxOutput: '8K tokens',
    modalities: ['Text'],
    useCase: 'Enterprise Q&A, summarization, content generation',
    modelCardUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-titan-text-premier.html',
    suggestedScores: { 'model-complexity': 15, 'autonomy-level': 10 },
  },
  {
    id: 'titan-text-express',
    name: 'Amazon Titan Text Express',
    provider: 'Amazon',
    modelId: 'amazon.titan-text-express-v1',
    description: 'Fast and cost-effective text model for high-throughput workloads.',
    contextWindow: '8K tokens',
    maxOutput: '8K tokens',
    modalities: ['Text'],
    useCase: 'Chatbots, text generation, simple Q&A',
    modelCardUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-titan-text-express.html',
    suggestedScores: { 'model-complexity': 10, 'autonomy-level': 5 },
  },
  {
    id: 'titan-text-lite',
    name: 'Amazon Titan Text Lite',
    provider: 'Amazon',
    modelId: 'amazon.titan-text-lite-v1',
    description: 'Lightweight model optimized for simple tasks with minimal latency.',
    contextWindow: '4K tokens',
    maxOutput: '4K tokens',
    modalities: ['Text'],
    useCase: 'Classification, simple extraction, high-volume processing',
    modelCardUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-titan-text-lite.html',
    suggestedScores: { 'model-complexity': 5, 'autonomy-level': 5 },
  },
  {
    id: 'titan-embed-text-v2',
    name: 'Amazon Titan Text Embeddings V2',
    provider: 'Amazon',
    modelId: 'amazon.titan-embed-text-v2:0',
    description: 'State-of-the-art embedding model for semantic search and RAG applications.',
    contextWindow: '8K tokens',
    maxOutput: '1024 dimensions',
    modalities: ['Embeddings'],
    useCase: 'Semantic search, RAG, document similarity',
    modelCardUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-titan-embed-text.html',
    suggestedScores: { 'model-complexity': 5, 'autonomy-level': 5 },
  },
  {
    id: 'titan-image-generator',
    name: 'Amazon Titan Image Generator',
    provider: 'Amazon',
    modelId: 'amazon.titan-image-generator-v2:0',
    description: 'Generate realistic images from text prompts with built-in watermarking.',
    contextWindow: 'N/A',
    maxOutput: '1408x1408 px',
    modalities: ['Image Generation'],
    useCase: 'Marketing content, product visualization, creative design',
    modelCardUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-titan-image-generator.html',
    suggestedScores: { 'model-complexity': 15, 'autonomy-level': 10 },
  },
  {
    id: 'nova-pro',
    name: 'Amazon Nova Pro',
    provider: 'Amazon',
    modelId: 'amazon.nova-pro-v1:0',
    description: 'Highly capable multimodal model balancing accuracy, speed, and cost for a wide range of tasks.',
    contextWindow: '300K tokens',
    maxOutput: '5K tokens',
    modalities: ['Text', 'Vision', 'Video', 'Documents'],
    useCase: 'Complex reasoning, multimodal analysis, agentic workflows',
    modelCardUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-nova.html',
    suggestedScores: { 'model-complexity': 20, 'autonomy-level': 15 },
  },
  {
    id: 'nova-lite',
    name: 'Amazon Nova Lite',
    provider: 'Amazon',
    modelId: 'amazon.nova-lite-v1:0',
    description: 'Low-cost multimodal model for fast processing of image, video, and text inputs.',
    contextWindow: '300K tokens',
    maxOutput: '5K tokens',
    modalities: ['Text', 'Vision', 'Video', 'Documents'],
    useCase: 'Real-time analysis, content moderation, classification',
    modelCardUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-nova.html',
    suggestedScores: { 'model-complexity': 10, 'autonomy-level': 10 },
  },
  {
    id: 'nova-micro',
    name: 'Amazon Nova Micro',
    provider: 'Amazon',
    modelId: 'amazon.nova-micro-v1:0',
    description: 'Text-only model delivering lowest latency at very low cost.',
    contextWindow: '128K tokens',
    maxOutput: '5K tokens',
    modalities: ['Text'],
    useCase: 'High-volume text processing, chatbots, simple tasks',
    modelCardUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-nova.html',
    suggestedScores: { 'model-complexity': 5, 'autonomy-level': 5 },
  },
];

const DEFAULT_CONTROLS: Control[] = [
  // Security Controls
  { name: 'Output guardrails (PII/toxicity filtering)', mitigation: 12, active: false },
  { name: 'Input validation & prompt sanitization', mitigation: 8, active: false },
  { name: 'Prompt injection detection', mitigation: 9, active: false },
  { name: 'Data encryption at rest & in transit', mitigation: 6, active: false },
  { name: 'API authentication & authorization', mitigation: 5, active: false },

  // Oversight Controls
  { name: 'Human-in-the-loop review', mitigation: 10, active: false },
  { name: 'Multi-level approval workflow', mitigation: 7, active: false },
  { name: 'Escalation triggers for edge cases', mitigation: 5, active: false },
  { name: 'Executive override capability', mitigation: 4, active: false },

  // Operational Controls
  { name: 'Rate limiting & budget caps', mitigation: 5, active: false },
  { name: 'Circuit breaker / kill switch', mitigation: 8, active: false },
  { name: 'Graceful degradation & fallbacks', mitigation: 6, active: false },
  { name: 'Load balancing & redundancy', mitigation: 4, active: false },

  // Monitoring Controls
  { name: 'Continuous drift monitoring', mitigation: 6, active: false },
  { name: 'Real-time anomaly detection', mitigation: 7, active: false },
  { name: 'Performance SLA monitoring', mitigation: 4, active: false },
  { name: 'Cost & usage tracking', mitigation: 3, active: false },

  // Testing & Validation
  { name: 'Automated bias & fairness testing', mitigation: 7, active: false },
  { name: 'Red team / adversarial testing', mitigation: 8, active: false },
  { name: 'Regression testing suite', mitigation: 5, active: false },
  { name: 'A/B testing & canary deployments', mitigation: 4, active: false },

  // Compliance & Governance
  { name: 'Audit logging & evidence collection', mitigation: 4, active: false },
  { name: 'Model versioning & lineage tracking', mitigation: 5, active: false },
  { name: 'Regulatory attestation workflow', mitigation: 6, active: false },
  { name: 'Third-party model risk assessment', mitigation: 5, active: false },
];

export default function RiskScoringCalculator({ isOpen, onClose }: Props) {
  const [modelName, setModelName] = useState('');
  const [selectedBedrockModel, setSelectedBedrockModel] = useState<BedrockModel | null>(null);
  const [dimensionScores, setDimensionScores] = useState<Record<string, number>>({});
  const [controls, setControls] = useState<Control[]>(DEFAULT_CONTROLS);
  const [activeTab, setActiveTab] = useState<'scoring' | 'controls' | 'results'>('scoring');

  const handleBedrockModelSelect = (modelId: string) => {
    const model = BEDROCK_MODELS.find(m => m.id === modelId);
    if (model) {
      setSelectedBedrockModel(model);
      setModelName(model.name);
      // Apply suggested scores if available
      if (model.suggestedScores) {
        const validScores: Record<string, number> = {};
        for (const [key, value] of Object.entries(model.suggestedScores)) {
          if (value !== undefined) {
            validScores[key] = value;
          }
        }
        setDimensionScores(prev => ({
          ...prev,
          ...validScores,
        }));
      }
    } else {
      setSelectedBedrockModel(null);
    }
  };

  const inherentScore = useMemo(() => {
    return Object.values(dimensionScores).reduce((sum, score) => sum + score, 0);
  }, [dimensionScores]);

  const activeControls = useMemo(() => {
    return controls.filter(c => c.active).map(c => ({ mitigation: c.mitigation, status: 'active' as const }));
  }, [controls]);

  const residualScore = useMemo(() => {
    return calculateResidualRiskScore(inherentScore, activeControls);
  }, [inherentScore, activeControls]);

  const inherentTier = getRiskTierFromScore(inherentScore);
  const residualTier = getRiskTierFromScore(residualScore);
  const inherentConfig = getRiskTierConfig(inherentScore);
  const residualConfig = getRiskTierConfig(residualScore);

  const isAcceptable = isResidualRiskAcceptable(inherentTier, residualTier);
  const totalMitigation = controls.filter(c => c.active).reduce((sum, c) => sum + c.mitigation, 0);
  const reductionPct = inherentScore > 0 ? Math.round(((inherentScore - residualScore) / inherentScore) * 100) : 0;

  const radarData = RISK_SCORING_DIMENSIONS.map(dim => ({
    dimension: dim.name.split(' ')[0],
    score: dimensionScores[dim.id] || 0,
    max: dim.maxPoints,
  }));

  const allDimensionsScored = RISK_SCORING_DIMENSIONS.every(dim => dimensionScores[dim.id] !== undefined);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-violet-50 to-purple-50">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Risk Scoring Calculator</h2>
            <p className="text-sm text-slate-500">Score a new model using the 4-dimension risk framework</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Close">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div role="tablist" aria-label="Risk scoring steps" className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          {([
            { id: 'scoring', label: '1. Score Dimensions', icon: 'chart-bar' },
            { id: 'controls', label: '2. Apply Controls', icon: 'shield-check' },
            { id: 'results', label: '3. View Results', icon: 'clipboard-list' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-white shadow-sm text-slate-900 border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon name={tab.icon} className="w-4 h-4" />
              {tab.label}
            </button>
          ))}

          {/* Bedrock Model Selector */}
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Bedrock Model:</span>
              <select
                value={selectedBedrockModel?.id || ''}
                onChange={e => handleBedrockModelSelect(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
              >
                <option value="">Select a model...</option>
                <optgroup label="Anthropic">
                  {BEDROCK_MODELS.filter(m => m.provider === 'Anthropic').map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Amazon">
                  {BEDROCK_MODELS.filter(m => m.provider === 'Amazon').map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <span className="text-xs text-slate-400">or</span>
            <input
              type="text"
              value={selectedBedrockModel ? '' : modelName}
              onChange={e => {
                setModelName(e.target.value);
                setSelectedBedrockModel(null);
              }}
              placeholder="Custom model name..."
              disabled={!!selectedBedrockModel}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-40 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Scoring Tab */}
          {activeTab === 'scoring' && (
            <div className="space-y-6">
              {/* Model Card Display */}
              {selectedBedrockModel && (
                <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${
                        selectedBedrockModel.provider === 'Anthropic' ? 'bg-orange-100' : 'bg-amber-100'
                      }`}>
                        {selectedBedrockModel.provider === 'Anthropic'
                          ? <Icon name="brain" className="w-6 h-6" />
                          : <Icon name="cloud" className="w-6 h-6" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-slate-900">{selectedBedrockModel.name}</h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                            selectedBedrockModel.provider === 'Anthropic'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {selectedBedrockModel.provider}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">{selectedBedrockModel.description}</p>
                        <div className="flex flex-wrap gap-3 mt-3">
                          <div className="text-xs">
                            <span className="text-slate-500">Context:</span>{' '}
                            <span className="font-medium text-slate-700">{selectedBedrockModel.contextWindow}</span>
                          </div>
                          <div className="text-xs">
                            <span className="text-slate-500">Output:</span>{' '}
                            <span className="font-medium text-slate-700">{selectedBedrockModel.maxOutput}</span>
                          </div>
                          <div className="text-xs">
                            <span className="text-slate-500">Model ID:</span>{' '}
                            <code className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{selectedBedrockModel.modelId}</code>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {selectedBedrockModel.modalities.map(mod => (
                            <span key={mod} className="text-[10px] px-2 py-0.5 bg-white border border-slate-200 rounded-full text-slate-600">
                              {mod}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <a
                      href={selectedBedrockModel.modelCardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      View Model Card
                    </a>
                  </div>
                  {selectedBedrockModel.suggestedScores && (
                    <div className="mt-3 pt-3 border-t border-indigo-100 flex items-center gap-2">
                      <span className="text-xs text-indigo-600 flex items-center gap-1"><Icon name="light-bulb" className="w-3.5 h-3.5 flex-shrink-0" /> Pre-filled suggested scores for Model Complexity and Autonomy based on model capabilities.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                {selectedBedrockModel
                  ? `Score the remaining dimensions for ${selectedBedrockModel.name}. Some dimensions have been pre-filled based on model characteristics.`
                  : 'Score each dimension based on the model\'s characteristics. The inherent risk score is the sum of all dimensions (max 100).'
                }
              </div>

              <div className="grid grid-cols-2 gap-6">
                {RISK_SCORING_DIMENSIONS.map(dim => (
                  <div key={dim.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">{dim.name}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{dim.description}</p>
                      </div>
                      <span className="text-lg font-bold text-violet-600">
                        {dimensionScores[dim.id] ?? '—'}/{dim.maxPoints}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {dim.levels.map(level => (
                        <button
                          key={level.points}
                          onClick={() => setDimensionScores(prev => ({ ...prev, [dim.id]: level.points }))}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                            dimensionScores[dim.id] === level.points
                              ? 'bg-violet-100 border-2 border-violet-500 text-violet-900'
                              : 'bg-slate-50 border border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{level.label}</span>
                            <span className="text-violet-600 font-bold">{level.points} pts</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{level.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Inherent Score Summary */}
              <div className="bg-white rounded-xl border-2 p-4" style={{ borderColor: inherentConfig.color }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-500">Inherent Risk Score</div>
                    <div className="text-4xl font-bold" style={{ color: inherentConfig.color }}>
                      {inherentScore}/100
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-500">Risk Tier</div>
                    <span
                      className="text-xl font-bold px-4 py-2 rounded-lg inline-block mt-1"
                      style={{ backgroundColor: `${inherentConfig.color}20`, color: inherentConfig.color }}
                    >
                      {inherentTier}
                    </span>
                  </div>
                  <div className="text-right max-w-xs">
                    <div className="text-xs text-slate-600">{inherentConfig.description}</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Revalidation: every {inherentConfig.revalidationDays} days
                      {inherentConfig.hitlRequired && ' · HITL required'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Controls Tab */}
          {activeTab === 'controls' && (
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-800">
                Select controls to apply. Each control reduces the inherent risk score by its mitigation value.
                Active controls reduce inherent score of <strong>{inherentScore}</strong> to residual score of <strong>{residualScore}</strong>.
              </div>

              {/* Control Categories */}
              {([
                { title: 'Security Controls', icon: 'lock-closed', start: 0, end: 5 },
                { title: 'Oversight Controls', icon: 'eye', start: 5, end: 9 },
                { title: 'Operational Controls', icon: 'cog', start: 9, end: 13 },
                { title: 'Monitoring Controls', icon: 'chart-bar', start: 13, end: 17 },
                { title: 'Testing & Validation', icon: 'beaker', start: 17, end: 21 },
                { title: 'Compliance & Governance', icon: 'clipboard-list', start: 21, end: 25 },
              ] as const).map(category => (
                <div key={category.title}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name={category.icon} className="w-4 h-4 text-slate-500" />
                    <h4 className="text-sm font-semibold text-slate-700">{category.title}</h4>
                    <span className="text-xs text-slate-400">
                      ({controls.slice(category.start, category.end).filter(c => c.active).length}/{category.end - category.start} active)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                    {controls.slice(category.start, category.end).map((control, i) => {
                      const actualIndex = category.start + i;
                      return (
                        <button
                          key={actualIndex}
                          onClick={() => {
                            const newControls = [...controls];
                            newControls[actualIndex] = { ...control, active: !control.active };
                            setControls(newControls);
                          }}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            control.active
                              ? 'bg-emerald-50 border-emerald-500'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <span className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center mt-0.5 ${
                                control.active ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                              }`}>
                                {control.active ? <Icon name="check" className="w-3 h-3" /> : null}
                              </span>
                              <span className={`text-xs font-medium leading-tight ${control.active ? 'text-emerald-900' : 'text-slate-700'}`}>
                                {control.name}
                              </span>
                            </div>
                            <span className={`text-xs font-bold flex-shrink-0 ${control.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                              -{control.mitigation}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Risk Reduction Summary */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold" style={{ color: inherentConfig.color }}>{inherentScore}</div>
                      <div className="text-[10px] text-slate-500">Inherent</div>
                    </div>
                    <div className="text-slate-300 text-2xl">→</div>
                    <div className="text-center">
                      <div className="text-2xl font-bold" style={{ color: residualConfig.color }}>{residualScore}</div>
                      <div className="text-[10px] text-slate-500">Residual</div>
                    </div>
                  </div>
                  <div className="text-center px-4 py-2 bg-emerald-50 rounded-lg">
                    <div className="text-2xl font-bold text-emerald-600">{reductionPct}%</div>
                    <div className="text-[10px] text-emerald-700">Risk Reduction</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-500">Total Mitigation</div>
                    <div className="text-xl font-bold text-emerald-600">-{totalMitigation} points</div>
                    <div className="text-[10px] text-slate-500">{controls.filter(c => c.active).length} controls active</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Results Tab */}
          {activeTab === 'results' && (
            <div className="space-y-6">
              {/* Model Summary Header */}
              {selectedBedrockModel && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${
                      selectedBedrockModel.provider === 'Anthropic' ? 'bg-orange-100' : 'bg-amber-100'
                    }`}>
                      {selectedBedrockModel.provider === 'Anthropic' ? '🧠' : '☁️'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-900">{selectedBedrockModel.name}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                          selectedBedrockModel.provider === 'Anthropic'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {selectedBedrockModel.provider}
                        </span>
                      </div>
                      <code className="text-[10px] text-slate-500 font-mono">{selectedBedrockModel.modelId}</code>
                    </div>
                  </div>
                  <a
                    href={selectedBedrockModel.modelCardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Official Model Card
                  </a>
                </div>
              )}

              {/* Acceptance Status */}
              <div className={`rounded-xl border-2 p-5 ${
                isAcceptable ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    isAcceptable ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                  }`}>
                    {isAcceptable
                      ? <Icon name="check" className="w-8 h-8" strokeWidth={2.5} />
                      : <Icon name="x-mark" className="w-8 h-8" strokeWidth={2.5} />}
                  </div>
                  <div>
                    <h3 className={`text-xl font-bold ${isAcceptable ? 'text-emerald-800' : 'text-rose-800'}`}>
                      {modelName || 'Model'}: {isAcceptable ? 'Risk Acceptable for Deployment' : 'Risk NOT Acceptable'}
                    </h3>
                    <p className={`text-sm ${isAcceptable ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {isAcceptable
                        ? `Residual risk of ${residualTier} meets acceptance criteria for ${inherentTier} inherent risk.`
                        : `${inherentTier} inherent risk requires reduction to Medium or Low. Current residual: ${residualTier}.`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Radar Chart */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Dimension Breakdown</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fill: '#64748b', fontSize: 10 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 25]} tick={{ fill: '#64748b', fontSize: 9 }} />
                      <Radar name="Score" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Risk Summary */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Risk Summary</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-600">Inherent Risk</span>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold" style={{ color: inherentConfig.color }}>{inherentScore}</span>
                        <span className="text-xs px-2 py-1 rounded font-semibold" style={{ backgroundColor: `${inherentConfig.color}20`, color: inherentConfig.color }}>
                          {inherentTier}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-600">Residual Risk</span>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold" style={{ color: residualConfig.color }}>{residualScore}</span>
                        <span className="text-xs px-2 py-1 rounded font-semibold" style={{ backgroundColor: `${residualConfig.color}20`, color: residualConfig.color }}>
                          {residualTier}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                      <span className="text-sm text-emerald-700">Risk Reduction</span>
                      <span className="text-lg font-bold text-emerald-600">{reductionPct}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Governance Requirements */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Governance Requirements for {residualTier} Risk</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-slate-900">{residualConfig.revalidationDays}</div>
                    <div className="text-xs text-slate-500">Days between revalidations</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg text-center">
                    <div className={`text-2xl font-bold ${residualConfig.hitlRequired ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {residualConfig.hitlRequired ? 'Yes' : 'No'}
                    </div>
                    <div className="text-xs text-slate-500">Human oversight required</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg text-center">
                    <div className="text-lg font-bold text-blue-600">{residualConfig.euAiActClassification}</div>
                    <div className="text-xs text-slate-500">EU AI Act classification</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-slate-900">{controls.filter(c => c.active).length}</div>
                    <div className="text-xs text-slate-500">Active controls</div>
                  </div>
                </div>
              </div>

              {/* Tier Reference */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Risk Tier Reference</h4>
                <div className="grid grid-cols-4 gap-3">
                  {RISK_TIER_CONFIG.map(tier => (
                    <div
                      key={tier.tier}
                      className={`p-3 rounded-lg border-2 ${
                        tier.tier === residualTier ? 'ring-2 ring-offset-2' : ''
                      }`}
                      style={{
                        borderColor: tier.color,
                        backgroundColor: `${tier.color}10`,
                        ...(tier.tier === residualTier ? { ringColor: tier.color } : {}),
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold" style={{ color: tier.color }}>{tier.tier}</span>
                        <span className="text-xs text-slate-500">{tier.minScore}-{tier.maxScore}</span>
                      </div>
                      <div className="text-[10px] text-slate-600">{tier.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">Progress:</span>
            <span className={allDimensionsScored ? 'text-emerald-600 font-medium' : 'text-amber-600'}>
              {Object.keys(dimensionScores).length}/4 dimensions scored
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-600">{controls.filter(c => c.active).length} controls active</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setDimensionScores({});
                setControls(DEFAULT_CONTROLS);
                setModelName('');
                setSelectedBedrockModel(null);
                setActiveTab('scoring');
              }}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
