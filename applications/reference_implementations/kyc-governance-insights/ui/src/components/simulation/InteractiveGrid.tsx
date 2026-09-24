import { useState, useMemo } from 'react';
import {
  riskControlMapping,
  controls,
  services,
} from '../../data/riskControlMapping';
import type { ControlItem, ServiceItem } from '../../data/riskControlMapping';

interface InteractiveGridProps {
  currentStep: number;
}

type HoveredType = 'risk' | 'control' | 'service';

/**
 * Compute which IDs should be highlighted given a hovered item.
 */
function getHighlightedIds(
  hoveredId: string,
  hoveredType: HoveredType
): { risks: Set<string>; controls: Set<string>; services: Set<string> } {
  const highlighted = { risks: new Set<string>(), controls: new Set<string>(), services: new Set<string>() };

  if (hoveredType === 'risk') {
    const link = riskControlMapping.find((l) => l.risk.id === hoveredId);
    if (link) {
      highlighted.risks.add(link.risk.id);
      link.controls.forEach((c) => highlighted.controls.add(c));
      link.services.forEach((s) => highlighted.services.add(s));
    }
  } else if (hoveredType === 'control') {
    // Find which risks this control mitigates and which services implement it
    for (const link of riskControlMapping) {
      if (link.controls.includes(hoveredId)) {
        highlighted.risks.add(link.risk.id);
        highlighted.controls.add(hoveredId);
        link.services.forEach((s) => highlighted.services.add(s));
      }
    }
  } else if (hoveredType === 'service') {
    // Find which controls this service provides and their linked risks
    for (const link of riskControlMapping) {
      if (link.services.includes(hoveredId)) {
        highlighted.risks.add(link.risk.id);
        highlighted.services.add(hoveredId);
        link.controls.forEach((c) => highlighted.controls.add(c));
      }
    }
  }

  return highlighted;
}

const natureBadge: Record<ControlItem['nature'], { label: string; color: string; bg: string }> = {
  deterministic: { label: '✓ Cannot bypass', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  probabilistic: { label: '⚠ Can fail', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  observability: { label: '📊 Observes', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
};

export default function InteractiveGrid({ currentStep }: InteractiveGridProps) {
  const [hoveredItem, setHoveredItem] = useState<{ id: string; type: HoveredType } | null>(null);

  const highlighted = useMemo(() => {
    if (!hoveredItem) return null;
    return getHighlightedIds(hoveredItem.id, hoveredItem.type);
  }, [hoveredItem]);

  /** Determine opacity/style for a given item */
  function getItemStyle(
    id: string,
    column: 'risk' | 'control' | 'service',
    isActiveAtStep: boolean
  ): React.CSSProperties {
    const base: React.CSSProperties = {
      transition: 'all 0.2s ease',
      borderRadius: '8px',
      padding: '8px 10px',
      border: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
      cursor: 'pointer',
    };

    if (highlighted) {
      const setForColumn =
        column === 'risk' ? highlighted.risks :
        column === 'control' ? highlighted.controls :
        highlighted.services;

      if (setForColumn.has(id)) {
        return {
          ...base,
          boxShadow: '0 0 12px rgba(59, 130, 246, 0.6)',
          borderColor: 'var(--accent)',
          opacity: 1,
          filter: 'none',
        };
      } else {
        return {
          ...base,
          opacity: 0.2,
          filter: 'grayscale(80%)',
        };
      }
    }

    // No hover — apply step-awareness dimming for risks
    if (column === 'risk' && !isActiveAtStep) {
      return { ...base, opacity: 0.5 };
    }

    return base;
  }

  // Build a set of risks active at the current step
  const activeRiskIds = useMemo(() => {
    const set = new Set<string>();
    for (const link of riskControlMapping) {
      if (link.activeAtSteps.includes(currentStep)) {
        set.add(link.risk.id);
      }
    }
    return set;
  }, [currentStep]);

  // Build sets of controls and services active at the current step
  const activeControlIds = useMemo(() => {
    const set = new Set<string>();
    for (const link of riskControlMapping) {
      if (link.activeAtSteps.includes(currentStep)) {
        link.controls.forEach((c) => set.add(c));
      }
    }
    return set;
  }, [currentStep]);

  const activeServiceIds = useMemo(() => {
    const set = new Set<string>();
    for (const link of riskControlMapping) {
      if (link.activeAtSteps.includes(currentStep)) {
        link.services.forEach((s) => set.add(s));
      }
    }
    return set;
  }, [currentStep]);

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px',
      }}
      onMouseLeave={() => setHoveredItem(null)}
    >
      {/* Grid header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '12px',
          marginBottom: '10px',
        }}
      >
        <ColumnHeader label="RISKS" />
        <ColumnHeader label="CONTROLS" />
        <ColumnHeader label="AWS SERVICES" />
      </div>

      {/* Grid body */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '12px',
          alignItems: 'start',
        }}
      >
        {/* RISKS column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {riskControlMapping.map((link) => {
            const { risk } = link;
            const isActive = activeRiskIds.has(risk.id);
            return (
              <div
                key={risk.id}
                style={getItemStyle(risk.id, 'risk', isActive)}
                onMouseEnter={() => setHoveredItem({ id: risk.id, type: 'risk' })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px' }}>{risk.icon}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {risk.label}
                  </span>
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {risk.description}
                </div>
              </div>
            );
          })}
        </div>

        {/* CONTROLS column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {controls.map((ctrl: ControlItem) => {
            const isActive = activeControlIds.has(ctrl.id);
            const badge = natureBadge[ctrl.nature];
            return (
              <div
                key={ctrl.id}
                style={getItemStyle(ctrl.id, 'control', isActive)}
                onMouseEnter={() => setHoveredItem({ id: ctrl.id, type: 'control' })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {ctrl.label}
                  </span>
                  <span
                    style={{
                      fontSize: '8px',
                      fontWeight: 700,
                      color: badge.color,
                      background: badge.bg,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {badge.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* SERVICES column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {services.map((svc: ServiceItem) => {
            const isActive = activeServiceIds.has(svc.id);
            return (
              <div
                key={svc.id}
                style={getItemStyle(svc.id, 'service', isActive)}
                onMouseEnter={() => setHoveredItem({ id: svc.id, type: 'service' })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px' }}>{svc.icon}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {svc.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ColumnHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: '9px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        color: 'var(--text-muted)',
        paddingBottom: '4px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {label}
    </div>
  );
}
