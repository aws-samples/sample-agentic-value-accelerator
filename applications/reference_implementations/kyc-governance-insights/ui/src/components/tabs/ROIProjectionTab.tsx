import React, { useState, useMemo } from 'react';
import { sliderConfigs, scenarioPresets, type SliderValues, calculateAnnualSavings, calculateComplianceAvoidance, calculateSpeedMultiplier, calculateNPV, calculateROI, calculatePaybackMonths, formatCurrency } from '../../data/roiProjectionData';
import SectionDescription from '../shared/SectionDescription';
import CollapsibleSection from '../shared/CollapsibleSection';

const defaults: SliderValues = { monthlyVolume: 25000, automationRate: 80, analystCost: 70, penaltyAvoidance: 15000000, discountRate: 10 };

export const ROIProjectionTab: React.FC = () => {
  const [values, setValues] = useState<SliderValues>(defaults);
  const [activePreset, setActivePreset] = useState<string>('balanced');

  const results = useMemo(() => ({
    savings: calculateAnnualSavings(values),
    avoidance: calculateComplianceAvoidance(values),
    speed: calculateSpeedMultiplier(values),
    npv: calculateNPV(values),
    roi: calculateROI(values),
    payback: calculatePaybackMonths(values),
  }), [values]);

  const handleSlider = (id: string, val: number) => {
    setValues(prev => ({ ...prev, [id]: val }));
    setActivePreset('custom');
  };

  const applyPreset = (presetId: string) => {
    const preset = scenarioPresets.find(p => p.id === presetId);
    if (!preset) return;
    setValues({
      monthlyVolume: preset.values.monthlyVolume,
      automationRate: preset.values.automationRate,
      analystCost: preset.values.analystCost,
      penaltyAvoidance: preset.values.penaltyAvoidance,
      discountRate: preset.values.discountRate,
    });
    setActivePreset(presetId);
  };

  return (
    <div data-testid="roi.container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionDescription text="Financial model: adjust volume, STP rate, analyst cost, and penalty risk to project 3-year ROI." />
      {/* Scenario Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {scenarioPresets.map(p => {
          const pv: SliderValues = { monthlyVolume: p.values.monthlyVolume, automationRate: p.values.automationRate, analystCost: p.values.analystCost, penaltyAvoidance: p.values.penaltyAvoidance, discountRate: p.values.discountRate };
          const pRoi = calculateROI(pv);
          const pPayback = calculatePaybackMonths(pv);
          const pNpv = calculateNPV(pv);
          const isActive = activePreset === p.id;
          return (
            <button key={p.id} onClick={() => applyPreset(p.id)} style={{
              padding: '16px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
              background: isActive ? 'rgba(59,130,246,0.1)' : 'var(--bg-card)',
              border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
            }}>
              <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{p.icon}</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{p.description}</div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '0.7rem' }}>
                <span style={{ color: '#10b981', fontWeight: 700 }}>{pRoi}% ROI</span>
                <span style={{ color: 'var(--text-secondary)' }}>{pPayback}mo payback</span>
                <span style={{ color: 'var(--text-secondary)' }}>{formatCurrency(pNpv)} NPV</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main layout: Sliders + Results */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Sliders */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Parameters</h3>
          {sliderConfigs.filter(s => !s.advanced).map(s => (
            <div key={s.id} style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.label}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {s.unit.startsWith('\u00A3') && s.id === 'penaltyAvoidance' ? formatCurrency(values[s.id as keyof SliderValues] as number) : `${(values[s.id as keyof SliderValues] as number).toLocaleString()}${s.unit.startsWith('%') ? '%' : ` ${s.unit}`}`}
                </span>
              </div>
              <input type="range" min={s.min} max={s.max} step={s.step} value={values[s.id as keyof SliderValues] as number}
                onChange={e => handleSlider(s.id, Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </div>
          ))}
          {/* Advanced */}
          {sliderConfigs.filter(s => s.advanced).map(s => (
            <div key={s.id} style={{ marginBottom: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.label}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{values[s.id as keyof SliderValues]}%</span>
              </div>
              <input type="range" min={s.min} max={s.max} step={s.step} value={values[s.id as keyof SliderValues] as number}
                onChange={e => handleSlider(s.id, Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </div>
          ))}
        </div>

        {/* Results Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <ResultCard label="Annual Cost Savings" value={formatCurrency(results.savings)} sub="From automation of manual review" color="#10b981" />
            <ResultCard label="Compliance Avoidance" value={formatCurrency(results.avoidance)} sub="Risk-weighted penalty avoidance" color="#3b82f6" />
            <ResultCard label="Speed Improvement" value={`${results.speed}\u00D7 faster`} sub="Decision cycle (days \u2192 hours)" color="#8b5cf6" />
            <ResultCard label="3-Year NPV" value={formatCurrency(results.npv)} sub={`At ${values.discountRate}% discount rate`} color="#f59e0b" />
          </div>
          <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>{results.roi}%</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>3-Year ROI | Payback: {results.payback} months</div>
          </div>
        </div>
      </div>

      {/* Before/After Comparison */}
      <CollapsibleSection title="Before vs After Governance" defaultCollapsed info="Side-by-side of key operational and risk measures pre- and post-governance (cost per decision, cycle time, compliance risk, STP, audit prep). The scenario ROI above is the headline; this is the detail behind it.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <ComparisonRow label="Cost per Decision" before="\u00A38.33" after="\u00A30.83" factor="10\u00D7 reduction" />
          <ComparisonRow label="Decision Cycle Time" before="12 days" after="2 hours" factor="6\u00D7 faster" />
          <ComparisonRow label="Compliance Risk (annual)" before="\u00A328.3M" after="\u00A35.7M" factor="5\u00D7 lower" />
          <ComparisonRow label="STP Rate" before="25%" after={`${values.automationRate}%`} factor={`${Math.round(values.automationRate / 25)}\u00D7 improvement`} />
          <ComparisonRow label="Audit Prep Time" before="530 hrs/yr" after="155 hrs/yr" factor="3.4\u00D7 faster" />
        </div>
      </CollapsibleSection>
    </div>
  );
};

function ResultCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '14px', borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{label}</div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>
    </div>
  );
}

function ComparisonRow({ label, before, after, factor }: { label: string; before: string; after: string; factor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flex: 1, minWidth: '140px' }}>{label}</span>
      <span style={{ fontSize: '0.7rem', color: '#ef4444', minWidth: '70px', textAlign: 'right' }}>{before}</span>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{'\u2192'}</span>
      <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600, minWidth: '70px' }}>{after}</span>
      <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59,130,246,0.1)' }}>{factor}</span>
    </div>
  );
}

export default ROIProjectionTab;
