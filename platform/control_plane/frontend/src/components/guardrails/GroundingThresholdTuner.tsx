/**
 * GroundingThresholdTuner — Interactive slider to tune grounding thresholds with live preview
 */

import { useState, useMemo } from 'react';
import { Icon } from '../govern/icons';

interface ExampleOutput {
  id: string;
  prompt: string;
  response: string;
  groundingScore: number;
  relevanceScore: number;
  sourceReference?: string;
  isHallucination: boolean;
}

interface Props {
  initialGroundingThreshold?: number;
  initialRelevanceThreshold?: number;
  onThresholdsChange?: (grounding: number, relevance: number) => void;
  onClose?: () => void;
}

const EXAMPLE_OUTPUTS: ExampleOutput[] = [
  {
    id: 'ex-001',
    prompt: 'What is our refund policy?',
    response: 'Our refund policy allows returns within 30 days of purchase. You can return items for a full refund if they are in original condition.',
    groundingScore: 0.95,
    relevanceScore: 0.92,
    sourceReference: 'refund_policy.md, line 12-15',
    isHallucination: false,
  },
  {
    id: 'ex-002',
    prompt: 'What are the interest rates?',
    response: 'Our current savings account interest rate is 4.5% APY, which is among the highest in the industry.',
    groundingScore: 0.88,
    relevanceScore: 0.85,
    sourceReference: 'rates_table.csv, row 3',
    isHallucination: false,
  },
  {
    id: 'ex-003',
    prompt: 'Can I open a joint account?',
    response: 'Yes, you can open a joint account. The process typically takes 24-48 hours and requires both parties to provide identification.',
    groundingScore: 0.72,
    relevanceScore: 0.78,
    sourceReference: 'account_types.md, partial match',
    isHallucination: false,
  },
  {
    id: 'ex-004',
    prompt: 'What happens if I miss a payment?',
    response: 'If you miss a payment, there is a $35 late fee applied immediately. After 30 days, we report to credit bureaus and your rate increases by 2%.',
    groundingScore: 0.65,
    relevanceScore: 0.70,
    sourceReference: 'No direct source found',
    isHallucination: true,
  },
  {
    id: 'ex-005',
    prompt: 'Do you offer cryptocurrency investments?',
    response: 'Yes, we now offer Bitcoin and Ethereum trading through our mobile app with zero commission on trades.',
    groundingScore: 0.45,
    relevanceScore: 0.40,
    isHallucination: true,
  },
  {
    id: 'ex-006',
    prompt: 'What is the minimum balance requirement?',
    response: 'There is no minimum balance requirement for our basic checking account, but premium accounts require $10,000.',
    groundingScore: 0.55,
    relevanceScore: 0.58,
    sourceReference: 'fee_schedule.pdf, partial',
    isHallucination: true,
  },
  {
    id: 'ex-007',
    prompt: 'How do I dispute a charge?',
    response: 'To dispute a charge, log into online banking and click "Dispute" next to the transaction. You have 60 days from the statement date.',
    groundingScore: 0.82,
    relevanceScore: 0.88,
    sourceReference: 'dispute_process.md, line 5-8',
    isHallucination: false,
  },
  {
    id: 'ex-008',
    prompt: 'What are the wire transfer fees?',
    response: 'Domestic wire transfers are $25 outgoing and free incoming. International wires are $45 outgoing.',
    groundingScore: 0.78,
    relevanceScore: 0.75,
    sourceReference: 'wire_fees.json',
    isHallucination: false,
  },
];

export default function GroundingThresholdTuner({
  initialGroundingThreshold = 0.7,
  initialRelevanceThreshold = 0.7,
  onThresholdsChange,
  onClose,
}: Props) {
  const [groundingThreshold, setGroundingThreshold] = useState(initialGroundingThreshold);
  const [relevanceThreshold, setRelevanceThreshold] = useState(initialRelevanceThreshold);
  const [showOnlyBlocked, setShowOnlyBlocked] = useState(false);

  const results = useMemo(() => {
    return EXAMPLE_OUTPUTS.map(ex => ({
      ...ex,
      wouldBlock: ex.groundingScore < groundingThreshold || ex.relevanceScore < relevanceThreshold,
      blockReason: ex.groundingScore < groundingThreshold ? 'grounding' : ex.relevanceScore < relevanceThreshold ? 'relevance' : null,
    }));
  }, [groundingThreshold, relevanceThreshold]);

  const stats = useMemo(() => {
    const blocked = results.filter(r => r.wouldBlock);
    const passed = results.filter(r => !r.wouldBlock);
    const truePositives = blocked.filter(r => r.isHallucination).length;
    const falsePositives = blocked.filter(r => !r.isHallucination).length;
    const trueNegatives = passed.filter(r => !r.isHallucination).length;
    const falseNegatives = passed.filter(r => r.isHallucination).length;

    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      blocked: blocked.length,
      passed: passed.length,
      truePositives,
      falsePositives,
      trueNegatives,
      falseNegatives,
      precision,
      recall,
      f1,
    };
  }, [results]);

  const handleGroundingChange = (value: number) => {
    setGroundingThreshold(value);
    onThresholdsChange?.(value, relevanceThreshold);
  };

  const handleRelevanceChange = (value: number) => {
    setRelevanceThreshold(value);
    onThresholdsChange?.(groundingThreshold, value);
  };

  const getScoreColor = (score: number, threshold: number) => {
    if (score >= threshold) return 'text-emerald-600';
    if (score >= threshold - 0.1) return 'text-amber-600';
    return 'text-red-600';
  };

  const filteredResults = showOnlyBlocked ? results.filter(r => r.wouldBlock) : results;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Grounding Threshold Tuner</h2>
          <p className="text-sm text-slate-500 mt-1">Adjust thresholds and see real-time impact on example outputs</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Threshold Sliders */}
      <div className="grid grid-cols-2 gap-6 p-5 bg-white rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-slate-900">Grounding Threshold</label>
            <span className="text-lg font-bold text-blue-600">{(groundingThreshold * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={groundingThreshold * 100}
            onChange={e => handleGroundingChange(Number(e.target.value) / 100)}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>Permissive (0%)</span>
            <span>Strict (100%)</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Block responses where factual claims aren't supported by source documents
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-slate-900">Relevance Threshold</label>
            <span className="text-lg font-bold text-violet-600">{(relevanceThreshold * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={relevanceThreshold * 100}
            onChange={e => handleRelevanceChange(Number(e.target.value) / 100)}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>Permissive (0%)</span>
            <span>Strict (100%)</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Block responses that don't directly address the user's question
          </p>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Presets:</span>
        {[
          { name: 'Permissive', g: 0.5, r: 0.5 },
          { name: 'Balanced', g: 0.7, r: 0.7 },
          { name: 'Strict', g: 0.85, r: 0.85 },
          { name: 'Very Strict', g: 0.95, r: 0.9 },
        ].map(preset => (
          <button
            key={preset.name}
            onClick={() => {
              setGroundingThreshold(preset.g);
              setRelevanceThreshold(preset.r);
              onThresholdsChange?.(preset.g, preset.r);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              groundingThreshold === preset.g && relevanceThreshold === preset.r
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-6 gap-3">
        <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
          <div className="text-xl font-bold text-emerald-700">{stats.passed}</div>
          <div className="text-[10px] text-emerald-600">Passed</div>
        </div>
        <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-center">
          <div className="text-xl font-bold text-red-700">{stats.blocked}</div>
          <div className="text-[10px] text-red-600">Blocked</div>
        </div>
        <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
          <div className="text-xl font-bold text-emerald-700">{stats.truePositives}</div>
          <div className="text-[10px] text-emerald-600">True Pos</div>
        </div>
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
          <div className="text-xl font-bold text-amber-700">{stats.falsePositives}</div>
          <div className="text-[10px] text-amber-600">False Pos</div>
        </div>
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
          <div className="text-xl font-bold text-blue-700">{(stats.precision * 100).toFixed(0)}%</div>
          <div className="text-[10px] text-blue-600">Precision</div>
        </div>
        <div className="p-3 bg-violet-50 rounded-lg border border-violet-200 text-center">
          <div className="text-xl font-bold text-violet-700">{(stats.f1 * 100).toFixed(0)}%</div>
          <div className="text-[10px] text-violet-600">F1 Score</div>
        </div>
      </div>

      {/* Threshold Visualization */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Score Distribution</h3>
        <div className="relative h-8 bg-gradient-to-r from-red-200 via-amber-200 to-emerald-200 rounded-lg overflow-hidden">
          {/* Grounding threshold marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-blue-600 z-10"
            style={{ left: `${groundingThreshold * 100}%` }}
          >
            <div className="absolute -top-5 -translate-x-1/2 text-[9px] font-bold text-blue-600 whitespace-nowrap">
              G: {(groundingThreshold * 100).toFixed(0)}%
            </div>
          </div>
          {/* Example dots */}
          {EXAMPLE_OUTPUTS.map(ex => (
            <div
              key={ex.id}
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white ${
                ex.isHallucination ? 'bg-red-500' : 'bg-emerald-500'
              }`}
              style={{ left: `${ex.groundingScore * 100}%` }}
              title={`${ex.prompt.slice(0, 30)}... (${(ex.groundingScore * 100).toFixed(0)}%)`}
            />
          ))}
        </div>
        <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Accurate</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Hallucination</span>
        </div>
      </div>

      {/* Example Outputs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Example Outputs ({filteredResults.length})</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyBlocked}
              onChange={e => setShowOnlyBlocked(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600"
            />
            <span className="text-xs text-slate-600">Show blocked only</span>
          </label>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
          {filteredResults.map(ex => (
            <div
              key={ex.id}
              className={`p-4 rounded-xl border-2 transition-all ${
                ex.wouldBlock
                  ? 'border-red-300 bg-red-50'
                  : 'border-emerald-300 bg-emerald-50'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold flex items-center gap-1 ${ex.wouldBlock ? 'text-red-700' : 'text-emerald-700'}`}>
                    {ex.wouldBlock
                      ? <><Icon name="x-mark" className="w-3.5 h-3.5" /> BLOCKED</>
                      : <><Icon name="check" className="w-3.5 h-3.5" /> PASSED</>}
                  </span>
                  {ex.isHallucination && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-red-200 text-red-800 rounded font-bold">
                      HALLUCINATION
                    </span>
                  )}
                  {ex.wouldBlock && !ex.isHallucination && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded font-bold">
                      FALSE POSITIVE
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={getScoreColor(ex.groundingScore, groundingThreshold)}>
                    G: {(ex.groundingScore * 100).toFixed(0)}%
                  </span>
                  <span className={getScoreColor(ex.relevanceScore, relevanceThreshold)}>
                    R: {(ex.relevanceScore * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="mb-2">
                <p className="text-xs font-semibold text-slate-600">Q: {ex.prompt}</p>
              </div>
              <div className="p-2 bg-white/50 rounded-lg">
                <p className="text-xs text-slate-700">{ex.response}</p>
              </div>
              {ex.sourceReference && (
                <div className="mt-2 text-[10px] text-slate-500">
                  Source: <code className="bg-white/50 px-1 rounded">{ex.sourceReference}</code>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation */}
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <div>
            <h4 className="text-sm font-semibold text-blue-800">Tuning Recommendation</h4>
            <p className="text-xs text-blue-700 mt-1">
              {stats.falsePositives > 0 && stats.falseNegatives === 0 && (
                <>Your thresholds are blocking {stats.falsePositives} valid responses. Consider lowering thresholds for better user experience.</>
              )}
              {stats.falseNegatives > 0 && stats.falsePositives === 0 && (
                <>Your thresholds are allowing {stats.falseNegatives} hallucinations through. Consider raising thresholds for better accuracy.</>
              )}
              {stats.falsePositives > 0 && stats.falseNegatives > 0 && (
                <>You have both false positives ({stats.falsePositives}) and false negatives ({stats.falseNegatives}). Try adjusting both thresholds to find the optimal balance.</>
              )}
              {stats.falsePositives === 0 && stats.falseNegatives === 0 && (
                <>Your current thresholds achieve perfect classification on these examples. Test with more diverse prompts before deploying.</>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
