import React, { useState, useRef, useCallback, useMemo } from 'react';
import { riskRegisterData, RISK_REGISTER_CATEGORIES } from '../../data/riskRegisterData';
import type { ControlEntry, RiskRow } from '../../data/riskRegisterData';
import { riskControlMapping, controls } from '../../data/riskControlMapping';
import DetailPanel from '../shared/DetailPanel';
import type { PanelItem } from '../shared/DetailPanel';
import SectionDescription from '../shared/SectionDescription';

function ExpLabel({ name }: { name: string }) {
  if (!name.includes('Automated Reasoning')) return <>{name}</>;
  return (
    <>
      {name}
      <span style={{ fontSize: '8px', color: '#ff9800', fontWeight: 700, verticalAlign: 'super', marginLeft: '2px' }}>EXP</span>
    </>
  );
}

const severityStyles: Record<string, { bg: string; color: string }> = {
  'sev-critical': { bg: '#fdecea', color: '#de350b' },
  'sev-high': { bg: '#fff0e0', color: '#e65100' },
  'sev-medium': { bg: '#fff8e1', color: '#f9a825' },
  'sev-low': { bg: '#e8f5e9', color: '#36b37e' },
};

/* --- InfoTooltip with 2s hover delay --- */
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setShow(true), 2000);
  }, []);

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  }, []);

  const handleClick = useCallback(() => {
    setShow((s) => !s);
  }, []);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: '4px' }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', cursor: 'help', opacity: 0.6 }}>?</span>
      {show && (
        <div
          style={{
            position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
            background: '#1a1a2e', color: '#e0e0e0', padding: '8px 10px', borderRadius: '6px',
            fontSize: '10px', lineHeight: '1.5', maxWidth: '240px', width: 'max-content',
            zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.2s ease', pointerEvents: 'none',
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

/* --- Control status badge --- */
function ControlStatusBadge({ status }: { status: ControlEntry['status'] }) {
  if (status === 'active') return <span style={{ fontSize: '10px' }}>✅</span>;
  if (status === 'experimental') return <span style={{ fontSize: '10px' }}>⚗️</span>;
  return <span style={{ fontSize: '10px' }}>🔜</span>;
}

/* --- Render a risk row --- */
function RiskRowComponent({ row, isExpanded, onToggle, onSelectRisk, onSelectControl }: { row: RiskRow; isExpanded: boolean; onToggle: () => void; onSelectRisk: (riskLabel: string) => void; onSelectControl: (controlName: string) => void }) {
  const sevStyle = severityStyles[row.severityClass] || { bg: '#e0e0e0', color: '#333' };
  const resStyle = severityStyles[row.residualClass] || { bg: '#e0e0e0', color: '#333' };
  const [hovered, setHovered] = useState(false);

  return (
    <React.Fragment>
      <tr
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'pointer', background: isExpanded ? 'var(--bg-secondary)' : 'transparent', transition: 'background 0.2s ease' }}
      >
        <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
          {row.id}
        </td>
        <td style={{ ...tdStyle, color: 'var(--text-primary)', maxWidth: '220px' }}>
          <span
            onClick={(e) => { e.stopPropagation(); onSelectRisk(row.risk); }}
            style={{ cursor: 'pointer', borderBottom: '1px dotted var(--text-muted)', transition: 'color 0.15s' }}
            onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.color = '#3b82f6'; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.color = ''; }}
          >{row.risk}</span>
          <InfoTooltip text={row.riskDescription} />
        </td>
        <td style={tdStyle}>{row.stage}</td>
        <td style={tdStyle}>
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: sevStyle.bg, color: sevStyle.color }}>
            {row.severity}
          </span>
        </td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {row.controls.length} controls {isExpanded ? '▾' : '▸'}
          </span>
        </td>
        <td style={tdStyle}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: resStyle.bg, color: resStyle.color }}>
              {row.residual}
            </span>
            {row.severityClass !== row.residualClass && (
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', opacity: 0.7 }}>
                {row.severity === 'Critical' && row.residual === 'Low' ? '▼▼▼' :
                 row.severity === 'Critical' && row.residual === 'Medium' ? '▼▼' :
                 row.severity === 'High' && row.residual === 'Low' ? '▼▼' :
                 '▼'}
              </span>
            )}
          </span>
        </td>
      </tr>
      {hovered && !isExpanded && (
        <tr onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
          <td colSpan={6} style={{ padding: '4px 10px 4px 40px', background: 'rgba(128,128,128,0.06)', borderBottom: 'none', textAlign: 'center' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', justifyContent: 'center' }}>
              {row.controls.map((ctrl, i) => (
                <span
                  key={i}
                  onClick={(e) => { e.stopPropagation(); onSelectControl(ctrl.name); }}
                  style={{
                    display: 'inline-block',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    fontWeight: 500,
                    background: 'rgba(59,130,246,0.08)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.2)'; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.08)'; }}
                >
                  <ExpLabel name={ctrl.name} />
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
      {isExpanded && (
        <tr>
          <td colSpan={6} style={{ padding: '8px 10px 12px 40px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
              {row.controls.map((ctrl, i) => (
                <span
                  key={i}
                  onClick={(e) => { e.stopPropagation(); onSelectControl(ctrl.name); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '4px 8px', borderRadius: '6px', fontSize: '10px',
                    background: 'var(--bg-card)',
                    opacity: ctrl.status === 'experimental' ? 0.5 : 1,
                    fontStyle: ctrl.status === 'experimental' ? 'italic' : 'normal',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 6px rgba(59,130,246,0.3)'; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                >
                  <ControlStatusBadge status={ctrl.status} />
                  <span style={{ color: 'var(--text-primary)' }}><ExpLabel name={ctrl.name} /></span>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>({ctrl.awsService})</span>
                  <InfoTooltip text={`${ctrl.name} — ${ctrl.awsService}`} />
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

export const RiskRegisterTab: React.FC = () => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set(RISK_REGISTER_CATEGORIES.map(c => c.key)));
  const [lowRiskExpanded, setLowRiskExpanded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PanelItem | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const controlLabelToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of controls) {
      map.set(c.label, c.id);
    }
    return map;
  }, []);

  const riskLabelToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const link of riskControlMapping) {
      map.set(link.risk.label, link.risk.id);
    }
    return map;
  }, []);

  const handleSelectControl = useCallback((controlName: string) => {
    const id = controlLabelToId.get(controlName);
    if (id) {
      setSelectedItem(prev => (prev?.id === id && prev.type === 'control') ? null : { id, type: 'control' });
    }
  }, [controlLabelToId]);

  const handleSelectRisk = useCallback((riskLabel: string) => {
    const id = riskLabelToId.get(riskLabel);
    if (id) {
      setSelectedItem(prev => (prev?.id === id && prev.type === 'risk') ? null : { id, type: 'risk' });
    }
  }, [riskLabelToId]);

  const { categorized, lowRisks } = useMemo(() => {
    const low: RiskRow[] = [];
    const grouped: Record<string, RiskRow[]> = {};
    for (const cat of RISK_REGISTER_CATEGORIES) {
      grouped[cat.key] = [];
    }
    for (const row of riskRegisterData) {
      if (row.severityClass === 'sev-low' || row.severityClass === 'sev-medium') {
        low.push(row);
      } else {
        const bucket = grouped[row.categoryKey];
        if (bucket) bucket.push(row);
        else grouped[row.categoryKey] = [row];
      }
    }
    return { categorized: grouped, lowRisks: low };
  }, []);

  function toggleCategory(key: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const totalRisks = riskRegisterData.length;
  const totalCategories = RISK_REGISTER_CATEGORIES.length;

  return (
    <div
      data-testid="risk-register.container"
      ref={tableRef}
      style={{
        background: 'var(--bg-card)',
        borderRadius: '12px',
        padding: '1.5rem',
        overflowX: 'auto',
      }}
    >
      <style>{`
        @keyframes slideInFromRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      <SectionDescription text="86 controls mapped to CRI, NIST, ISO 42001, EU AI Act, and FCA frameworks." />

      {/* Summary */}
      <div style={{ marginBottom: '1rem', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {totalRisks} risks identified across {totalCategories} categories.
        Each risk maps to 2–4 mitigating controls. Click a risk name or control pill for details.
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr>
            <th style={thStyle}>ID</th>
            <th style={thStyle}>Risk</th>
            <th style={thStyle}>Stage</th>
            <th style={thStyle}>Inherent</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Controls</th>
            <th style={thStyle}>Residual</th>
          </tr>
        </thead>
        <tbody>
          {RISK_REGISTER_CATEGORIES.map(cat => {
            const rows = categorized[cat.key] || [];
            const isExpanded = expandedCategories.has(cat.key);
            return (
              <React.Fragment key={cat.key}>
                {/* Category header row */}
                <tr
                  onClick={() => toggleCategory(cat.key)}
                  style={{ cursor: 'pointer', background: 'var(--bg-secondary)' }}
                >
                  <td colSpan={6} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '10px', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>&#9654;</span>
                      <span style={{ fontSize: '12px' }}>{cat.icon}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{cat.label}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>({rows.length})</span>
                    </div>
                  </td>
                </tr>
                {/* Risk rows within category */}
                {isExpanded && rows.map(row => (
                  <RiskRowComponent
                    key={row.id}
                    row={row}
                    isExpanded={expandedRow === row.id}
                    onToggle={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
                    onSelectRisk={handleSelectRisk}
                    onSelectControl={handleSelectControl}
                  />
                ))}
              </React.Fragment>
            );
          })}

          {/* Low Inherent Risk section */}
          {lowRisks.length > 0 && (
            <React.Fragment>
              <tr
                onClick={() => setLowRiskExpanded(!lowRiskExpanded)}
                style={{ cursor: 'pointer', background: 'var(--bg-secondary)' }}
              >
                <td colSpan={6} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', borderTop: '2px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', transition: 'transform 0.15s', transform: lowRiskExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>&#9654;</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>Low Inherent Risk</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>({lowRisks.length})</span>
                  </div>
                </td>
              </tr>
              {lowRiskExpanded && lowRisks.map(row => (
                <RiskRowComponent
                  key={row.id}
                  row={row}
                  isExpanded={expandedRow === row.id}
                  onToggle={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
                  onSelectRisk={handleSelectRisk}
                  onSelectControl={handleSelectControl}
                />
              ))}
            </React.Fragment>
          )}
        </tbody>
      </table>

      <DetailPanel selectedItem={selectedItem} onClose={() => setSelectedItem(null)} excludeRef={tableRef} />
    </div>
  );
};

const thStyle: React.CSSProperties = {
  padding: '10px',
  fontSize: '9px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border)',
  textAlign: 'left',
  background: 'var(--bg-secondary)',
};

const tdStyle: React.CSSProperties = {
  padding: '10px',
  fontSize: '11px',
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border)',
};

export default RiskRegisterTab;
