/**
 * GovernPostureScore — Governance Posture Score display component
 *
 * Shows:
 * - Large circular gauge with overall score (0-100) and letter grade
 * - Color coding: green (A/B), yellow (C), orange (D), red (F)
 * - 6 dimension bars showing individual scores with weights
 * - Trend indicator (arrow up/down/flat)
 * - Top 3 recommendations with impact estimate
 * - Mini sparkline for 30-day history
 */

import { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, YAxis } from 'recharts';
import {
  governPostureScoreApi,
  type PostureScoreResponse,
  type PostureRecommendationsResponse,
  type PostureHistoryResponse,
  type PostureDimension,
  type PostureGrade,
  type PostureTrend,
  type UnscoredReason,
} from '../../api/client';
import { Icon, type IconName } from './icons';
import { LiveDataBadge, MockDataBadge } from './DataSourceIndicator';

/** Grade colors and labels. */
const GRADE_CONFIG: Record<PostureGrade, { color: string; bg: string; label: string }> = {
  A: { color: '#059669', bg: 'bg-emerald-500', label: 'Excellent' },
  B: { color: '#10B981', bg: 'bg-emerald-400', label: 'Good' },
  C: { color: '#F59E0B', bg: 'bg-amber-400', label: 'Fair' },
  D: { color: '#F97316', bg: 'bg-orange-500', label: 'Poor' },
  F: { color: '#EF4444', bg: 'bg-rose-500', label: 'Critical' },
};

/** Dimension icons and labels. */
const DIMENSION_CONFIG: Record<PostureDimension, { icon: IconName; label: string }> = {
  policy_coverage: { icon: 'shield-check', label: 'Policy Coverage' },
  killswitch_ready: { icon: 'bolt', label: 'Kill-Switch' },
  audit_completeness: { icon: 'clipboard-list', label: 'Audit' },
  incident_response: { icon: 'bell-alert', label: 'Incidents' },
  validation_coverage: { icon: 'check-badge', label: 'Validation' },
  detection_breadth: { icon: 'magnifying-glass', label: 'Detection' },
};

/**
 * Human label for a dimension key that arrives as a bare string (unmeasured_dimensions,
 * failed_dimensions). Falls back to the raw key rather than dropping it.
 */
function dimensionLabel(key: string): string {
  return DIMENSION_CONFIG[key as PostureDimension]?.label ?? key;
}

/**
 * Tooltip copy for a dimension that produced no score.
 *
 * `nothing_assessed` and `calculation_failed` are different facts and this used to assert
 * the first for both ("These assessed no items"). A dimension that reached its backing
 * store and found it empty is a governance gap to close; a dimension whose calculation
 * raised is a broken integration to fix, and nothing at all may be asserted about it.
 *
 * Neither one is inside the score: the service excludes every null-score dimension from
 * both the numerator and the denominator of the weighted mean and renormalises by
 * measured_weight. An earlier version substituted an invented score on the exception path
 * (incident_response 75.0 with a fabricated 10 items / 7 compliant, detection_breadth
 * 33.3) which then counted as measured weight, so measured_weight_pct: 50.0 was itself
 * false. That is fixed in govern_posture_score_service.py, which is why this copy can say
 * "excluded" rather than hedging.
 */
function unscoredTooltip(reason: UnscoredReason | null | undefined): string {
  if (reason === 'calculation_failed') {
    return 'Not scored - this dimension\'s calculation failed, so nothing about it was verified. '
      + 'It is excluded from the overall score rather than given a default value. '
      + 'This is a broken integration to fix, not a governance gap.';
  }
  if (reason === 'nothing_assessed') {
    return 'Not scored - this dimension reached its data source successfully and found no items '
      + 'to assess. A measured empty result, excluded from the overall score rather than '
      + 'given a default value.';
  }
  return 'Not scored - the backend did not say whether this dimension assessed nothing or '
    + 'failed to compute. Either way it is excluded from the overall score rather than '
    + 'given a default value.';
}

/** Trend icons. */
const TREND_CONFIG: Record<PostureTrend, { icon: IconName; color: string; label: string }> = {
  improving: { icon: 'arrow-trending-up', color: 'text-emerald-500', label: 'Improving' },
  stable: { icon: 'arrow-right', color: 'text-slate-400', label: 'Stable' },
  degrading: { icon: 'arrow-down', color: 'text-rose-500', label: 'Degrading' },
};

/** Circular gauge showing score and grade. */
function ScoreGauge({ score, grade }: { score: number; grade: PostureGrade }) {
  const gradeConfig = GRADE_CONFIG[grade];
  const percentage = Math.min(100, Math.max(0, score));
  const circumference = 2 * Math.PI * 54; // radius = 54
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-36 h-36">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
        {/* Background circle */}
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="8"
        />
        {/* Progress circle */}
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke={gradeConfig.color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold"
          style={{ color: gradeConfig.color }}
        >
          {Math.round(score)}
        </span>
        <span
          className="text-xl font-semibold -mt-1"
          style={{ color: gradeConfig.color }}
        >
          {grade}
        </span>
        <span className="text-[10px] text-slate-500 mt-0.5">{gradeConfig.label}</span>
      </div>
    </div>
  );
}

/** Single dimension bar. */
function DimensionBar({
  dimension,
  score,
  weight,
  unscoredReason,
}: {
  dimension: PostureDimension;
  /** null when the dimension produced no score — rendered as "not scored", never as 0. */
  score: number | null;
  weight: number;
  /** Why score is null. Set whenever score is null; see unscoredTooltip. */
  unscoredReason?: UnscoredReason | null;
}) {
  const config = DIMENSION_CONFIG[dimension];
  const unscored = score === null;
  const percentage = unscored ? 0 : Math.min(100, Math.max(0, score));

  // Colour based on score. An unscored dimension gets neutral slate: a rose bar at 0 would
  // read as a measured total failure, which is the opposite of "we did not measure this".
  let barColor = 'bg-emerald-500';
  if (unscored) barColor = 'bg-slate-200';
  else if (score < 60) barColor = 'bg-rose-500';
  else if (score < 70) barColor = 'bg-orange-500';
  else if (score < 80) barColor = 'bg-amber-400';

  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon name={config.icon} className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <span className="w-16 truncate text-slate-600" title={config.label}>
        {config.label}
      </span>
      <div
        className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"
        title={unscored ? unscoredTooltip(unscoredReason) : undefined}
      >
        <div
          className={`h-full ${barColor} transition-all duration-500`}
          style={{ width: unscored ? '100%' : `${percentage}%`, opacity: unscored ? 0.5 : 1 }}
        />
      </div>
      {/* Same tooltip on the value, so hovering the placeholder explains it too. */}
      <span
        className={`w-10 text-right font-medium ${unscored ? 'text-slate-400' : 'text-slate-600'}`}
        title={unscored ? unscoredTooltip(unscoredReason) : undefined}
      >
        {unscored ? '—' : Math.round(score)}
      </span>
      <span className="w-8 text-right text-slate-400 text-[10px]">
        {Math.round(weight * 100)}%
      </span>
    </div>
  );
}

/** Mini sparkline for history. */
function HistorySparkline({ data }: { data: { timestamp: string; score: number }[] }) {
  const chartData = useMemo(() => {
    return data.slice(-30).map(entry => ({
      score: entry.score,
    }));
  }, [data]);

  if (chartData.length < 2) {
    return (
      <div className="flex items-center justify-center h-12 text-xs text-slate-400">
        Not enough history
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={chartData}>
        <YAxis domain={[0, 100]} hide />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#3B82F6"
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Recommendation card. */
function RecommendationCard({
  action,
  dimension,
  impact,
  effort,
  priority,
}: {
  action: string;
  dimension: PostureDimension;
  impact: number;
  effort: string;
  priority: number;
}) {
  const dimConfig = DIMENSION_CONFIG[dimension];

  const effortColor = {
    low: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-rose-100 text-rose-700',
  }[effort] || 'bg-slate-100 text-slate-700';

  return (
    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors">
      <div className="flex items-start gap-2">
        <div className="p-1.5 bg-white rounded border border-slate-200">
          <Icon name={dimConfig.icon} className="w-3.5 h-3.5 text-slate-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-700 font-medium leading-tight">{action}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] font-medium text-emerald-600">
              +{impact.toFixed(1)} pts
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${effortColor}`}>
              {effort}
            </span>
          </div>
        </div>
        <span className="text-[10px] text-slate-400 font-medium">#{priority}</span>
      </div>
    </div>
  );
}

/** Main Posture Score component. */
export default function GovernPostureScore() {
  const [scoreData, setScoreData] = useState<PostureScoreResponse | null>(null);
  const [recommendations, setRecommendations] = useState<PostureRecommendationsResponse | null>(null);
  const [history, setHistory] = useState<PostureHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setLoading(true);
        const [scoreResp, recsResp, histResp] = await Promise.all([
          governPostureScoreApi.score(),
          governPostureScoreApi.recommendations(),
          governPostureScoreApi.history(30),
        ]);

        if (!cancelled) {
          setScoreData(scoreResp);
          setRecommendations(recsResp);
          setHistory(histResp);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch posture score:', err);
          setError('Failed to load posture score');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-6 bg-slate-200 rounded" />
          <div className="h-5 w-48 bg-slate-200 rounded" />
        </div>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-36 h-36 bg-slate-100 rounded-full mx-auto md:mx-0" />
          <div className="flex-1 space-y-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-4 bg-slate-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !scoreData) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-rose-200/60 shadow-sm p-6">
        <div className="flex items-center gap-2 text-rose-600">
          <Icon name="exclamation-circle" className="w-5 h-5" />
          <span className="text-sm font-medium">{error || 'Unable to load posture score'}</span>
        </div>
      </div>
    );
  }

  const trendConfig = TREND_CONFIG[scoreData.trend];
  const historyData = history?.entries.map(e => ({
    timestamp: e.timestamp,
    score: e.overall_score,
  })) || [];

  // Split the excluded dimensions the way the backend does. failed_dimensions is a subset
  // of unmeasured_dimensions; whatever remains reached its data source and found nothing.
  // The coverage tooltip used to assert "These assessed no items" for the whole union,
  // which is the wrong fact for the failed half and prescribes the wrong fix: a raised
  // calculation is a broken integration, an empty one is a governance gap.
  const failedDimensions = scoreData.failed_dimensions ?? [];
  const nothingAssessedDimensions = scoreData.unmeasured_dimensions.filter(
    d => !failedDimensions.includes(d),
  );
  const coverageTooltip = [
    failedDimensions.length > 0
      && `Failed to compute (nothing verified, broken integration to fix): `
        + `${failedDimensions.map(dimensionLabel).join(', ')}.`,
    nothingAssessedDimensions.length > 0
      && `Assessed no items (measured empty result, governance gap to close): `
        + `${nothingAssessedDimensions.map(dimensionLabel).join(', ')}.`,
    scoreData.unmeasured_dimensions.length > 0
      && 'Both kinds are excluded from the overall score rather than given a default value, '
        + 'and the score is renormalised over the remaining weight.',
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Icon name="shield-check" className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Governance Posture Score</h3>
            <p className="text-xs text-slate-500">Overall health of your AI fleet governance</p>
          </div>
        </div>
        {scoreData.live ? (
          <LiveDataBadge source={scoreData.source} />
        ) : (
          <MockDataBadge integration={scoreData.source} />
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Gauge + Trend */}
        <div className="flex flex-col items-center lg:items-start gap-3">
          <ScoreGauge score={scoreData.overall_score} grade={scoreData.grade} />

          {/* Coverage sits with the grade, not buried in a note. The grade is a weighted mean
              over MEASURED dimensions only, so a D at 50% coverage is a different statement
              from a D at 100% — and previously the unmeasured half was filled with arbitrary
              midpoints, which is what made the difference invisible. */}
          {scoreData.measured_weight_pct < 100 && (
            <div
              className="flex items-start gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg max-w-[220px]"
              title={coverageTooltip}
            >
              <Icon name="information-circle" className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-px" />
              <span className="text-[10px] text-amber-800 leading-snug">
                Graded on {Math.round(scoreData.measured_weight_pct)}% of the model
                {scoreData.unmeasured_dimensions.length > 0 && (
                  <> — {scoreData.unmeasured_dimensions.length} dimension
                    {scoreData.unmeasured_dimensions.length === 1 ? '' : 's'} not scored</>
                )}
              </span>
            </div>
          )}

          {/* Trend indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg">
            <Icon name={trendConfig.icon} className={`w-4 h-4 ${trendConfig.color}`} />
            <span className="text-xs text-slate-600">
              {trendConfig.label}
              {scoreData.trend_delta !== 0 && (
                <span className={scoreData.trend_delta > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {' '}({scoreData.trend_delta > 0 ? '+' : ''}{scoreData.trend_delta.toFixed(1)})
                </span>
              )}
            </span>
          </div>

          {/* Mini sparkline */}
          <div className="w-full max-w-[160px]">
            <div className="text-[10px] text-slate-400 mb-1">30-day trend</div>
            <HistorySparkline data={historyData} />
          </div>
        </div>

        {/* Middle: Dimension bars */}
        <div className="flex-1 space-y-2.5">
          <div className="text-xs font-medium text-slate-500 mb-3">Dimension Breakdown</div>
          {scoreData.dimensions.map(dim => (
            <DimensionBar
              key={dim.dimension}
              dimension={dim.dimension}
              score={dim.score}
              weight={dim.weight}
              unscoredReason={dim.unscored_reason}
            />
          ))}
        </div>

        {/* Right: Top recommendations */}
        <div className="lg:w-72">
          <div className="text-xs font-medium text-slate-500 mb-3">Top Recommendations</div>
          <div className="space-y-2">
            {recommendations?.recommendations.slice(0, 3).map((rec, idx) => (
              <RecommendationCard
                key={idx}
                action={rec.action}
                dimension={rec.dimension}
                impact={rec.overall_impact}
                effort={rec.effort}
                priority={rec.priority}
              />
            ))}
            {(!recommendations || recommendations.recommendations.length === 0) && (
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
                <Icon name="check-circle" className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                <p className="text-xs text-emerald-700 font-medium">All looking good!</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer with calculation time and the backend's caveats.
          The note used to render only when cached_at was set, so on a fresh calculation the
          backend's own caveat list - which is where "N of 6 dimensions FAILED to compute"
          and the live-vs-seeded weight split are stated - never reached the screen at all.
          A note that reaches the payload and not the screen is the same defect as not
          sending one, so the note now renders on its own condition. */}
      {(scoreData.cached_at || scoreData.note) && (
        <div className="mt-4 pt-4 border-t border-slate-100 text-[10px] text-slate-400 text-right">
          Last calculated: {new Date(scoreData.calculated_at).toLocaleString()}
          {scoreData.note && ` | ${scoreData.note}`}
        </div>
      )}
    </div>
  );
}

/** Compact version for embedding in dashboards. */
export function PostureScoreCompact() {
  const [scoreData, setScoreData] = useState<PostureScoreResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    governPostureScoreApi.score()
      .then(data => { if (!cancelled) setScoreData(data); })
      .catch(err => console.error('Failed to fetch posture score:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading || !scoreData) {
    return (
      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg animate-pulse">
        <div className="w-12 h-12 bg-slate-200 rounded-full" />
        <div className="space-y-1">
          <div className="h-4 w-20 bg-slate-200 rounded" />
          <div className="h-3 w-16 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  const gradeConfig = GRADE_CONFIG[scoreData.grade];
  const trendConfig = TREND_CONFIG[scoreData.trend];

  return (
    <div className="flex items-center gap-4 p-4 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60">
      {/* Mini gauge */}
      <div className="relative w-14 h-14">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke={gradeConfig.color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${scoreData.overall_score}, 100`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold" style={{ color: gradeConfig.color }}>
            {scoreData.grade}
          </span>
        </div>
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-slate-900">
            {Math.round(scoreData.overall_score)}
          </span>
          <span className="text-sm text-slate-500">/100</span>
          <Icon name={trendConfig.icon} className={`w-4 h-4 ${trendConfig.color}`} />
        </div>
        <div className="text-xs text-slate-500">Governance Posture</div>
      </div>
    </div>
  );
}
