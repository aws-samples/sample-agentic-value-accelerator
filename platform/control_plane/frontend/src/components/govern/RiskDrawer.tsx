import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Drawer from './Drawer';
import { USE_CASE_RISK_CATEGORIES } from './useGovernanceAggregator';
import { Icon } from './icons';
import { getRiskTierFromScore, getRiskTierColors } from './riskScoring';

interface Props {
  selection: { useCaseId: string; useCaseName: string; category: string; score: number } | null;
  onClose: () => void;
}

// Use the canonical 0-100 risk tiers from riskScoring.ts (Critical 75+, High 50+,
// Medium 25+, Low 0-24) rather than a bespoke threshold set, so the drawer agrees
// with the model registry and portfolio scoring.
const riskLevelColor = (score: number) => {
  const tier = getRiskTierFromScore(score);
  const colors = getRiskTierColors(tier);
  return { bg: colors.bg, text: colors.text, label: tier };
};

const categoryDescriptions: Record<string, { description: string; mitigations: string[] }> = {
  'Regulatory': {
    description: 'Risk of non-compliance with financial regulations, industry standards, or legal requirements.',
    mitigations: [
      'Implement regulatory compliance guardrails',
      'Enable audit logging for all AI decisions',
      'Document model governance and approval workflows',
      'Regular compliance assessments and reviews',
    ],
  },
  'Data Privacy': {
    description: 'Risk of exposing, mishandling, or leaking sensitive personal or business data.',
    mitigations: [
      'Enable PII detection and redaction guardrails',
      'Implement data classification and access controls',
      'Use data masking for sensitive fields',
      'Regular data privacy impact assessments',
    ],
  },
  'Ethical/Bias': {
    description: 'Risk of biased outputs, unfair treatment, or ethically problematic decisions.',
    mitigations: [
      'Implement bias detection monitoring',
      'Regular fairness audits across demographics',
      'Human-in-the-loop for high-stakes decisions',
      'Diverse training data and testing scenarios',
    ],
  },
  'Model Reliability': {
    description: 'Risk of hallucinations, incorrect outputs, or unreliable model behavior.',
    mitigations: [
      'Enable contextual grounding guardrails',
      'Implement output validation checks',
      'Set confidence thresholds for responses',
      'Regular model evaluation and testing',
    ],
  },
  'Autonomy Risk': {
    description: 'Risk from autonomous AI decisions without appropriate human oversight.',
    mitigations: [
      'Implement human-in-the-loop workflows',
      'Set action boundaries and approval gates',
      'Enable decision audit trails',
      'Define escalation paths for edge cases',
    ],
  },
};

export default function RiskDrawer({ selection, onClose }: Props) {
  const riskLevel = useMemo(() => {
    if (!selection) return null;
    return riskLevelColor(selection.score);
  }, [selection]);

  const categoryInfo = useMemo(() => {
    if (!selection) return null;
    return categoryDescriptions[selection.category] || {
      description: 'Risk assessment for this category.',
      mitigations: ['Review and implement appropriate controls'],
    };
  }, [selection]);

  return (
    <Drawer
      open={!!selection}
      onClose={onClose}
      title={selection ? `${selection.useCaseName}` : ''}
      subtitle={selection ? `${selection.category} Risk Assessment` : undefined}
      width="lg"
    >
      {selection && riskLevel && categoryInfo && (
        <div className="space-y-6">
          {/* Risk Score Summary */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500 mb-1">{selection.category} Risk Score</div>
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-bold text-slate-900">{selection.score}</span>
                  <span className="text-slate-400">/100</span>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${riskLevel.bg} ${riskLevel.text}`}>
                    {riskLevel.label} Risk
                  </span>
                </div>
              </div>
              <div className="w-24 h-24 relative">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke={selection.score >= 75 ? '#ef4444' : selection.score >= 50 ? '#f59e0b' : selection.score >= 25 ? '#84cc16' : '#10b981'}
                    strokeWidth="8"
                    strokeDasharray={`${(selection.score / 100) * 251.2} 251.2`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-semibold text-slate-700">{selection.score}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Category Description */}
          <div>
            <div className="text-sm font-semibold text-slate-900 mb-2">What This Means</div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800">{categoryInfo.description}</p>
            </div>
          </div>

          {/* Risk Factors */}
          <div>
            <div className="text-sm font-semibold text-slate-900 mb-2">Risk Factors by Category</div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm divide-y divide-slate-100">
              {USE_CASE_RISK_CATEGORIES.map((cat) => {
                const isActive = cat === selection.category;
                return (
                  <div key={cat} className={`px-4 py-3 ${isActive ? 'bg-slate-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${isActive ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
                        {cat}
                      </span>
                      {isActive && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${riskLevel.bg} ${riskLevel.text}`}>
                          {selection.score}/100
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recommended Mitigations */}
          <div>
            <div className="text-sm font-semibold text-slate-900 mb-2">Recommended Mitigations</div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm divide-y divide-slate-100">
              {categoryInfo.mitigations.map((m, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon name="check" className="w-3 h-3 text-emerald-600" />
                  </div>
                  <span className="text-sm text-slate-700">{m}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Link
              to={`/use-cases/${selection.useCaseId}`}
              className="flex-1 text-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              View Use Case Details
            </Link>
            <Link
              to="/secure/guardrails"
              className="flex-1 text-center px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
            >
              Configure Guardrails
            </Link>
          </div>
        </div>
      )}
    </Drawer>
  );
}
