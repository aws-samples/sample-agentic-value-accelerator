import React, { useState, useMemo } from 'react';
import { capacityData } from '../../data/operationalKpiData';

export default function CapacityPlanning() {
  const [volumeMultiplier, setVolumeMultiplier] = useState(100); // 50-150 range (percentage of current)

  const projection = useMemo(() => {
    const newVolume = Math.round(capacityData.currentVolume * (volumeMultiplier / 100));
    const humanReviewed = Math.round(newVolume * ((100 - capacityData.stpRate) / 100));
    const requiredFTE = Math.ceil(humanReviewed / capacityData.casesPerAnalystPerDay);
    const fteChange = requiredFTE - capacityData.currentFTE;

    // Alternative 1: Improve STP to stay at current FTE
    const maxHumanAtCurrentFTE = capacityData.currentFTE * capacityData.casesPerAnalystPerDay;
    const requiredSTP = Math.round((1 - (maxHumanAtCurrentFTE / newVolume)) * 100);

    // Alternative 2: Reduce AHT to stay at current FTE
    const currentAHT = 4.2; // minutes from KPI data
    const requiredAHT = (maxHumanAtCurrentFTE / humanReviewed) * currentAHT;

    // Cost comparison
    const hiringCost = fteChange > 0 ? fteChange * capacityData.costPerFTE : 0;

    return {
      newVolume,
      humanReviewed,
      requiredFTE,
      fteChange,
      requiredSTP: Math.min(requiredSTP, 99),
      requiredAHT: Math.max(requiredAHT, 1.0),
      hiringCost,
      percentChange: volumeMultiplier - 100,
    };
  }, [volumeMultiplier]);

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '24px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Capacity Planning
        </h3>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Workforce projection with volume forecast
        </p>
      </div>

      {/* Current State */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '14px', border: '1px solid var(--border)', marginBottom: '20px' }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>Current State</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{capacityData.currentVolume.toLocaleString()}</div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>decisions/day</div>
          </div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{capacityData.stpRate}%</div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>automation (STP)</div>
          </div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{capacityData.humanReviewedPerDay}</div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>human-reviewed/day</div>
          </div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{capacityData.currentFTE} FTE</div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>at {capacityData.casesPerAnalystPerDay} cases/analyst/day</div>
          </div>
        </div>
      </div>

      {/* Volume Slider */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)' }}>Volume Forecast</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: projection.percentChange > 0 ? '#f59e0b' : projection.percentChange < 0 ? '#3b82f6' : 'var(--text-secondary)' }}>
            {projection.percentChange > 0 ? '+' : ''}{projection.percentChange}%
          </span>
        </div>
        <input
          type="range"
          min={50}
          max={150}
          value={volumeMultiplier}
          onChange={(e) => setVolumeMultiplier(Number(e.target.value))}
          style={{ width: '100%', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', color: 'var(--text-muted)' }}>
          <span>{Math.round(capacityData.currentVolume * 0.5).toLocaleString()}</span>
          <span>{capacityData.currentVolume.toLocaleString()}</span>
          <span>{Math.round(capacityData.currentVolume * 1.5).toLocaleString()}</span>
        </div>
      </div>

      {/* Projection Output */}
      {projection.percentChange !== 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '8px', padding: '14px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
            At {projection.percentChange > 0 ? '+' : ''}{projection.percentChange}% volume ({projection.newVolume.toLocaleString()} decisions/day):
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div>• Human-reviewed: <strong>{projection.humanReviewed}</strong> cases/day</div>
            <div>
              • Analysts required: <strong>{projection.requiredFTE} FTE</strong>
              {projection.fteChange !== 0 && (
                <span style={{ color: projection.fteChange > 0 ? '#ef4444' : '#10b981', fontWeight: 600, marginLeft: '6px' }}>
                  ({projection.fteChange > 0 ? '+' : ''}{projection.fteChange} from current)
                </span>
              )}
            </div>
            {projection.fteChange > 0 && (
              <>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                  <div style={{ fontSize: '0.63rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Alternatives to hiring:</div>
                  <div>• OR: Increase STP to <strong>{projection.requiredSTP}%</strong> → stay at {capacityData.currentFTE} FTE</div>
                  <div>• OR: Reduce AHT to <strong>{projection.requiredAHT.toFixed(1)} min</strong> → stay at {capacityData.currentFTE} FTE</div>
                </div>
                <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <div style={{ fontSize: '0.63rem', color: '#10b981', fontWeight: 600 }}>
                    💡 Recommendation: Invest in STP improvement rather than headcount — saves £{(projection.hiringCost / 1000).toFixed(0)}K/year vs hiring
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
