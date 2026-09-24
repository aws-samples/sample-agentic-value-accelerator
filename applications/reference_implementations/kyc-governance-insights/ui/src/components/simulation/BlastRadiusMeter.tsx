import type { BlastLevel } from '../../types/simulation';

interface BlastRadiusMeterProps {
  level: BlastLevel;
  stepIndex?: number;
  totalSteps?: number;
}

const LEVEL_CONFIG: Record<BlastLevel, { color: string; width: string; label: string }> = {
  'bf-low': { color: '#36b37e', width: '20%', label: 'Low' },
  'bf-med': { color: '#ff991f', width: '50%', label: 'Medium' },
  'bf-high': { color: '#de350b', width: '75%', label: 'High' },
};

/**
 * Compute dynamic blast radius that shrinks red→green as steps progress.
 * Step 0: 90% (red — max potential, no controls active yet)
 * Step 6: 15% (green — all controls passed, minimal residual risk)
 */
function getDynamicBlast(stepIndex: number, totalSteps: number) {
  const progress = stepIndex / Math.max(totalSteps - 1, 1); // 0 to 1
  const width = Math.round(90 - progress * 75); // 90% → 15%

  // Color interpolates: red → amber → green
  let color: string;
  let label: string;
  if (progress < 0.3) {
    color = '#de350b'; label = 'High';
  } else if (progress < 0.7) {
    color = '#ff991f'; label = 'Medium';
  } else {
    color = '#36b37e'; label = 'Low';
  }

  return { width: `${width}%`, color, label };
}

export default function BlastRadiusMeter({ level, stepIndex, totalSteps }: BlastRadiusMeterProps) {
  // Use dynamic if step info provided, otherwise fall back to static level config
  const config = (stepIndex !== undefined && totalSteps !== undefined)
    ? getDynamicBlast(stepIndex, totalSteps)
    : LEVEL_CONFIG[level];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '4px',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Blast Radius
        </span>
        <span
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            color: config.color,
          }}
        >
          {config.label}
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: '7px',
          borderRadius: '4px',
          background: '#e8f5e9',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: config.width,
            height: '100%',
            borderRadius: '4px',
            background: config.color,
            transition: 'width 0.4s ease, background 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}
