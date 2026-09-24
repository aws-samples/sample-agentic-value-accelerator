/**
 * RiskAssessmentWorkflow - Interactive 5-domain risk assessment modal
 *
 * Implements the DDQ MVP step3_risk_assessment framework with:
 * - Financial (25%), Operational (20%), Compliance (20%), Reputation (15%), Cyber (20%)
 * - Live weighted score calculation
 * - AI-suggested scores with justification
 * - Assessment history and recommendations
 */

import { useState, useMemo } from 'react';
import { Icon, type IconName } from '../icons';
import { getRiskTierConfig } from '../riskScoring';

// ============================================================================
// Types
// ============================================================================

type AssessmentType = 'initial' | 'annual' | 'triggered';
type Recommendation = 'approve' | 'conditional' | 'block';

interface DomainScore {
  score: number;
  aiSuggested: number;
  justification: string;
  factors: string[];
}

interface DomainScores {
  financial: DomainScore;
  operational: DomainScore;
  compliance: DomainScore;
  reputation: DomainScore;
  cyber: DomainScore;
}

export interface AssessmentResult {
  vendorId: string;
  vendorName: string;
  assessmentType: AssessmentType;
  assessorName: string;
  domainScores: DomainScores;
  weightedScore: number;
  previousScore: number;
  recommendation: Recommendation;
  keyConcerns: string[];
  assessedAt: string;
}

interface RiskAssessmentWorkflowProps {
  vendorId: string;
  vendorName: string;
  previousScore: number;
  onClose: () => void;
  onSubmit: (assessment: AssessmentResult) => void;
}

// ============================================================================
// Domain Configuration
// ============================================================================

interface DomainConfig {
  key: keyof DomainScores;
  label: string;
  icon: IconName;
  weight: number;
  weightLabel: string;
  factors: string[];
}

const DOMAIN_CONFIG: DomainConfig[] = [
  {
    key: 'financial',
    label: 'Financial',
    icon: 'currency-dollar',
    weight: 0.25,
    weightLabel: '25%',
    factors: [
      'Financial stability and viability',
      'Revenue concentration risk',
      'Insurance and liability coverage',
      'Pricing transparency',
      'Contract terms and SLA guarantees',
    ],
  },
  {
    key: 'operational',
    label: 'Operational',
    icon: 'cog',
    weight: 0.20,
    weightLabel: '20%',
    factors: [
      'Service availability (SLA/uptime)',
      'Disaster recovery capabilities',
      'Change management process',
      'Capacity and scalability',
      'Incident response readiness',
    ],
  },
  {
    key: 'compliance',
    label: 'Compliance',
    icon: 'scale',
    weight: 0.20,
    weightLabel: '20%',
    factors: [
      'Regulatory certifications (SOC2, ISO)',
      'Data residency requirements',
      'Privacy policy adequacy',
      'AI/ML governance maturity',
      'Audit trail and reporting',
    ],
  },
  {
    key: 'reputation',
    label: 'Reputation',
    icon: 'megaphone',
    weight: 0.15,
    weightLabel: '15%',
    factors: [
      'Market standing and longevity',
      'Public incidents or breaches',
      'Customer references',
      'Industry analyst ratings',
      'ESG and ethical AI stance',
    ],
  },
  {
    key: 'cyber',
    label: 'Cyber',
    icon: 'shield-check',
    weight: 0.20,
    weightLabel: '20%',
    factors: [
      'Security certifications',
      'Penetration testing frequency',
      'Data encryption (transit/rest)',
      'Access control maturity',
      'Vulnerability management',
    ],
  },
];

const DOMAIN_WEIGHTS = {
  financial: 0.25,
  operational: 0.20,
  compliance: 0.20,
  reputation: 0.15,
  cyber: 0.20,
};

// ============================================================================
// Helper Functions
// ============================================================================

function getScoreColor(score: number): string {
  if (score <= 25) return 'text-emerald-600';
  if (score <= 50) return 'text-amber-600';
  if (score <= 75) return 'text-orange-600';
  return 'text-rose-600';
}

function getSliderGradient(): string {
  return 'linear-gradient(to right, #10b981 0%, #10b981 25%, #f59e0b 25%, #f59e0b 50%, #f97316 50%, #f97316 75%, #e11d48 75%, #e11d48 100%)';
}

function getSliderThumbPosition(score: number): string {
  if (score <= 25) return 'bg-emerald-500';
  if (score <= 50) return 'bg-amber-500';
  if (score <= 75) return 'bg-orange-500';
  return 'bg-rose-500';
}

function calculateWeightedScore(scores: DomainScores): number {
  return Math.round(
    scores.financial.score * DOMAIN_WEIGHTS.financial +
    scores.operational.score * DOMAIN_WEIGHTS.operational +
    scores.compliance.score * DOMAIN_WEIGHTS.compliance +
    scores.reputation.score * DOMAIN_WEIGHTS.reputation +
    scores.cyber.score * DOMAIN_WEIGHTS.cyber
  );
}

function getRecommendation(score: number): Recommendation {
  if (score <= 35) return 'approve';
  if (score <= 60) return 'conditional';
  return 'block';
}

function getRecommendationConfig(rec: Recommendation) {
  const configs: Record<Recommendation, { label: string; bg: string; text: string; border: string; icon: IconName; description: string }> = {
    approve: {
      label: 'Approve',
      bg: 'bg-emerald-100',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      icon: 'check-circle',
      description: 'Vendor meets risk tolerance thresholds',
    },
    conditional: {
      label: 'Conditional Approval',
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      border: 'border-amber-200',
      icon: 'exclamation-triangle',
      description: 'Approve with enhanced monitoring and mitigations',
    },
    block: {
      label: 'Block',
      bg: 'bg-rose-100',
      text: 'text-rose-700',
      border: 'border-rose-200',
      icon: 'x-circle',
      description: 'Risk exceeds acceptable thresholds',
    },
  };
  return configs[rec];
}

// ============================================================================
// Component
// ============================================================================

export default function RiskAssessmentWorkflow({
  vendorId,
  vendorName,
  previousScore,
  onClose,
  onSubmit,
}: RiskAssessmentWorkflowProps) {
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('annual');
  const [assessorName, setAssessorName] = useState('');

  // Domains start unset (neutral 0); the assessor scores each one manually.
  // There are no pre-filled or AI-derived defaults. `aiSuggested` is retained
  // only for the exported AssessmentResult schema and is not surfaced in the UI.
  const [domainScores, setDomainScores] = useState<DomainScores>({
    financial: { score: 0, aiSuggested: 0, justification: '', factors: [] },
    operational: { score: 0, aiSuggested: 0, justification: '', factors: [] },
    compliance: { score: 0, aiSuggested: 0, justification: '', factors: [] },
    reputation: { score: 0, aiSuggested: 0, justification: '', factors: [] },
    cyber: { score: 0, aiSuggested: 0, justification: '', factors: [] },
  });

  const weightedScore = useMemo(() => calculateWeightedScore(domainScores), [domainScores]);
  const recommendation = useMemo(() => getRecommendation(weightedScore), [weightedScore]);
  const tierConfig = useMemo(() => getRiskTierConfig(weightedScore), [weightedScore]);
  const scoreChange = weightedScore - previousScore;

  // Compute key concerns based on high-scoring domains
  const keyConcerns = useMemo(() => {
    const concerns: string[] = [];
    DOMAIN_CONFIG.forEach(domain => {
      const score = domainScores[domain.key].score;
      if (score >= 60) {
        concerns.push(`High ${domain.label.toLowerCase()} risk (${score})`);
      }
    });
    return concerns;
  }, [domainScores]);

  const updateDomainScore = (key: keyof DomainScores, field: keyof DomainScore, value: number | string | string[]) => {
    setDomainScores(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const toggleFactor = (domainKey: keyof DomainScores, factor: string) => {
    const current = domainScores[domainKey].factors;
    const updated = current.includes(factor)
      ? current.filter(f => f !== factor)
      : [...current, factor];
    updateDomainScore(domainKey, 'factors', updated);
  };

  const handleSubmit = () => {
    const result: AssessmentResult = {
      vendorId,
      vendorName,
      assessmentType,
      assessorName: assessorName || 'Anonymous',
      domainScores,
      weightedScore,
      previousScore,
      recommendation,
      keyConcerns,
      assessedAt: new Date().toISOString(),
    };
    onSubmit(result);
  };

  const recConfig = getRecommendationConfig(recommendation);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto py-8">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-700 to-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Icon name="chart-bar" className="w-5 h-5" />
                5-Domain Risk Assessment
              </h2>
              <p className="text-sm text-slate-300 mt-0.5">{vendorName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Close assessment"
            >
              <Icon name="x-mark" className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Assessment metadata */}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-300">Assessment Type:</label>
              <select
                value={assessmentType}
                onChange={e => setAssessmentType(e.target.value as AssessmentType)}
                className="text-xs bg-white/10 border border-white/20 text-white rounded px-2 py-1"
              >
                <option value="initial" className="text-slate-900">Initial</option>
                <option value="annual" className="text-slate-900">Annual Review</option>
                <option value="triggered" className="text-slate-900">Triggered Reassessment</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-300">Assessor:</label>
              <input
                type="text"
                value={assessorName}
                onChange={e => setAssessorName(e.target.value)}
                placeholder="Enter your name"
                className="text-xs bg-white/10 border border-white/20 text-white placeholder-slate-400 rounded px-2 py-1 w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">Previous Score:</span>
              <span className={`text-sm font-semibold ${getScoreColor(previousScore)}`}>
                {previousScore}
              </span>
            </div>
          </div>
        </div>

        {/* Body - Two columns */}
        <div className="flex flex-col lg:flex-row">
          {/* Left: Domain Assessment Form */}
          <div className="flex-1 p-6 space-y-6 border-r border-slate-200 max-h-[600px] overflow-y-auto">
            <div className="text-xs text-slate-500 mb-2">
              Adjust scores for each domain. Lower scores indicate lower risk.
            </div>

            {DOMAIN_CONFIG.map(domain => {
              const domainData = domainScores[domain.key];
              return (
                <div key={domain.key} className="bg-slate-50 rounded-lg p-4">
                  {/* Domain header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Icon name={domain.icon} className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-medium text-slate-800">{domain.label}</span>
                      <span className="text-xs text-slate-400">({domain.weightLabel})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold ${getScoreColor(domainData.score)}`}>
                        {domainData.score}
                      </span>
                    </div>
                  </div>

                  {/* Score slider */}
                  <div className="mb-4">
                    <div
                      className="relative h-2 rounded-full overflow-hidden mb-1"
                      style={{ background: getSliderGradient() }}
                    >
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow ${getSliderThumbPosition(domainData.score)}`}
                        style={{ left: `calc(${domainData.score}% - 8px)` }}
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={domainData.score}
                      onChange={e => updateDomainScore(domain.key, 'score', parseInt(e.target.value))}
                      className="w-full h-2 opacity-0 cursor-pointer absolute"
                      style={{ marginTop: '-12px' }}
                      aria-label={`${domain.label} risk score`}
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>0 - Low Risk</span>
                      <span>100 - High Risk</span>
                    </div>
                  </div>

                  {/* Justification */}
                  <div className="mb-3">
                    <label className="text-[10px] text-slate-500 mb-1 block">Justification</label>
                    <textarea
                      value={domainData.justification}
                      onChange={e => updateDomainScore(domain.key, 'justification', e.target.value)}
                      placeholder="Explain the score rationale..."
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 resize-none h-16"
                    />
                  </div>

                  {/* Key factors checklist */}
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1.5 block">Key Factors Considered</label>
                    <div className="grid grid-cols-1 gap-1">
                      {domain.factors.map(factor => (
                        <label
                          key={factor}
                          className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer hover:text-slate-800"
                        >
                          <input
                            type="checkbox"
                            checked={domainData.factors.includes(factor)}
                            onChange={() => toggleFactor(domain.key, factor)}
                            className="w-3 h-3 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {factor}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Summary Panel */}
          <div className="w-full lg:w-80 p-6 bg-slate-50">
            {/* Weighted Score Calculator */}
            <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
              <h3 className="text-xs font-semibold text-slate-700 mb-3">Weighted Score Calculator</h3>
              <div className="space-y-2 text-[11px] text-slate-600 mb-3">
                {DOMAIN_CONFIG.map(domain => (
                  <div key={domain.key} className="flex justify-between">
                    <span>{domain.label} x {domain.weightLabel}</span>
                    <span className="font-medium">
                      {Math.round(domainScores[domain.key].score * domain.weight)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                <span className="text-xs font-medium text-slate-700">Weighted Total</span>
                <span className={`text-2xl font-bold ${getScoreColor(weightedScore)}`}>
                  {weightedScore}
                </span>
              </div>

              {/* Formula display */}
              <div className="mt-2 text-[10px] text-slate-400 bg-slate-50 rounded p-2 font-mono">
                ({domainScores.financial.score}x0.25) + ({domainScores.operational.score}x0.20) + ({domainScores.compliance.score}x0.20) + ({domainScores.reputation.score}x0.15) + ({domainScores.cyber.score}x0.20) = {weightedScore}
              </div>
            </div>

            {/* Score Comparison */}
            <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
              <h3 className="text-xs font-semibold text-slate-700 mb-3">Score Comparison</h3>
              <div className="flex items-center justify-between mb-2">
                <div className="text-center">
                  <div className="text-[10px] text-slate-500 mb-1">Previous</div>
                  <div className={`text-xl font-bold ${getScoreColor(previousScore)}`}>
                    {previousScore}
                  </div>
                </div>
                <div className="flex-1 mx-4 flex items-center justify-center">
                  <Icon
                    name={scoreChange > 0 ? 'arrow-trending-up' : scoreChange < 0 ? 'arrow-down' : 'arrow-right'}
                    className={`w-6 h-6 ${
                      scoreChange > 0 ? 'text-rose-500' : scoreChange < 0 ? 'text-emerald-500' : 'text-slate-400'
                    }`}
                  />
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-slate-500 mb-1">Current</div>
                  <div className={`text-xl font-bold ${getScoreColor(weightedScore)}`}>
                    {weightedScore}
                  </div>
                </div>
              </div>
              <div className={`text-center text-xs font-medium ${
                scoreChange > 0 ? 'text-rose-600' : scoreChange < 0 ? 'text-emerald-600' : 'text-slate-500'
              }`}>
                {scoreChange > 0 ? `+${scoreChange} (Risk Increased)` :
                 scoreChange < 0 ? `${scoreChange} (Risk Decreased)` :
                 'No Change'}
              </div>

              {/* Risk tier badge */}
              <div className="mt-3 flex justify-center">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${tierConfig.bgColor} ${tierConfig.textColor}`}>
                  {tierConfig.tier} Risk
                </span>
              </div>
            </div>

            {/* Assessment Summary */}
            <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
              <h3 className="text-xs font-semibold text-slate-700 mb-3">Assessment Summary</h3>

              {/* Recommendation */}
              <div className={`rounded-lg p-3 border ${recConfig.border} ${recConfig.bg} mb-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon name={recConfig.icon} className={`w-4 h-4 ${recConfig.text}`} />
                  <span className={`text-sm font-semibold ${recConfig.text}`}>
                    {recConfig.label}
                  </span>
                </div>
                <p className="text-[10px] text-slate-600">{recConfig.description}</p>
              </div>

              {/* Key Concerns */}
              {keyConcerns.length > 0 && (
                <div>
                  <div className="text-[10px] font-medium text-slate-600 mb-1.5">Key Concerns</div>
                  <ul className="space-y-1">
                    {keyConcerns.map((concern, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-[10px] text-rose-600">
                        <Icon name="exclamation-triangle" className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        {concern}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {keyConcerns.length === 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                  <Icon name="check-circle" className="w-3 h-3" />
                  No critical concerns identified
                </div>
              )}
            </div>

            {/* Assessment History Link — planned, not yet wired up */}
            <button
              type="button"
              disabled
              title="Assessment history is planned but not yet available in this demo build"
              className="w-full text-xs text-slate-400 flex items-center justify-center gap-1 mb-4 cursor-not-allowed opacity-60"
            >
              <Icon name="arrow-path" className="w-3.5 h-3.5" />
              View Assessment History
              <span className="text-[10px]">(demo)</span>
            </button>

            {/* Action buttons */}
            <div className="space-y-2">
              <button
                onClick={handleSubmit}
                className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                <Icon name="check" className="w-4 h-4" />
                Submit Assessment
              </button>
              <button
                type="button"
                disabled
                title="Draft saving is planned but not yet available in this demo build"
                className="w-full px-4 py-2 border border-slate-200 text-slate-400 text-sm font-medium rounded-lg flex items-center justify-center gap-2 cursor-not-allowed opacity-60"
              >
                <Icon name="document" className="w-4 h-4" />
                Save Draft
                <span className="text-[10px] font-normal">(demo)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
