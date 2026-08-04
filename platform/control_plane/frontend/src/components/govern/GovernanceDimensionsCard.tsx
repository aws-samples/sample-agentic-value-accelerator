/**
 * GovernanceDimensionsCard — Shows coverage across AWS's 6 agentic-AI governance dimensions.
 *
 * Surfaces the canonical control vocabulary from governanceDimensions.ts and maps
 * existing controls onto each dimension to show coverage gaps.
 */
import { useMemo } from 'react';
import { GOVERNANCE_DIMENSIONS } from './governanceDimensions';

interface DimensionCoverage {
  dimensionId: string;
  controlCount: number;
  coverageLevel: 'full' | 'partial' | 'none';
}

interface GovernanceDimensionsCardProps {
  guardrailsActive?: number;
  policiesActive?: number;
  auditEnabled?: boolean;
  identityConfigured?: boolean;
  compact?: boolean;
}

const coverageColor = {
  full: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  partial: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  none: { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-300' },
};

export default function GovernanceDimensionsCard({
  guardrailsActive = 0,
  policiesActive = 0,
  auditEnabled = true,
  identityConfigured = true,
  compact = false,
}: GovernanceDimensionsCardProps) {
  const coverage = useMemo<DimensionCoverage[]>(() => {
    return GOVERNANCE_DIMENSIONS.map(dim => {
      let controlCount = 0;
      let level: 'full' | 'partial' | 'none' = 'none';

      switch (dim.id) {
        case 'identity-context':
          controlCount = identityConfigured ? 1 : 0;
          level = identityConfigured ? 'full' : 'none';
          break;
        case 'data-memory-state':
          controlCount = guardrailsActive > 0 ? 1 : 0;
          level = guardrailsActive > 0 ? 'partial' : 'none';
          break;
        case 'audit-logging':
          controlCount = auditEnabled ? 2 : 0;
          level = auditEnabled ? 'full' : 'none';
          break;
        case 'agent-fm-controls':
          controlCount = guardrailsActive;
          level = guardrailsActive >= 3 ? 'full' : guardrailsActive > 0 ? 'partial' : 'none';
          break;
        case 'agency-boundaries':
          controlCount = policiesActive;
          level = policiesActive >= 2 ? 'full' : policiesActive > 0 ? 'partial' : 'none';
          break;
        case 'orchestration':
          controlCount = 1;
          level = 'partial';
          break;
      }

      return { dimensionId: dim.id, controlCount, coverageLevel: level };
    });
  }, [guardrailsActive, policiesActive, auditEnabled, identityConfigured]);

  const fullCount = coverage.filter(c => c.coverageLevel === 'full').length;
  const partialCount = coverage.filter(c => c.coverageLevel === 'partial').length;
  const noneCount = coverage.filter(c => c.coverageLevel === 'none').length;

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-xs">
        <span className="font-semibold text-slate-700">AWS Governance Dimensions</span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-emerald-700">{fullCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-amber-700">{partialCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-300" />
            <span className="text-slate-500">{noneCount}</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">AWS Governance Dimensions</h3>
          <p className="text-[10px] text-slate-400">
            Coverage across AWS's 6 critical dimensions for agentic AI security
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          {[
            { label: 'Full', color: coverageColor.full },
            { label: 'Partial', color: coverageColor.partial },
            { label: 'Gap', color: coverageColor.none },
          ].map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${color.dot}`} />
              <span className={color.text}>{label}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {GOVERNANCE_DIMENSIONS.map(dim => {
          const cov = coverage.find(c => c.dimensionId === dim.id)!;
          const color = coverageColor[cov.coverageLevel];

          return (
            <div
              key={dim.id}
              className={`rounded-lg p-3 ${color.bg} border border-transparent hover:border-slate-200 transition-colors`}
              title={dim.description}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-semibold ${color.text} truncate`}>
                    {dim.name}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">
                    {dim.services.slice(0, 2).join(', ')}
                    {dim.services.length > 2 && ` +${dim.services.length - 2}`}
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full ${color.dot} mt-1 flex-shrink-0`} />
              </div>
              {cov.controlCount > 0 && (
                <div className={`text-[10px] ${color.text} mt-1.5 font-medium`}>
                  {cov.controlCount} control{cov.controlCount !== 1 ? 's' : ''} active
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px]">
        <span className="text-slate-400">
          Based on AWS Agentic AI Security Scoping Matrix
        </span>
        <span className={`font-semibold ${fullCount >= 4 ? 'text-emerald-600' : fullCount >= 2 ? 'text-amber-600' : 'text-slate-500'}`}>
          {fullCount}/6 dimensions fully covered
        </span>
      </div>
    </div>
  );
}
