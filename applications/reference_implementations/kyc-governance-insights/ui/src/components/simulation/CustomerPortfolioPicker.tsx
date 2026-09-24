import React, { useState } from 'react';
import portfolioData from '../../data/customerPortfolio.json';

interface Customer {
  customer_id: string;
  company_name: string;
  jurisdiction: string;
  sector: string;
  annual_revenue: string;
  expected_verdict: string;
  risk_signals: string[];
  beneficial_owners: Array<{ name: string; nationality: string; pep: boolean; ownership_pct: number }>;
  narrative: string;
}

const customers: Customer[] = (portfolioData as any).customers || [];

const verdictColor: Record<string, string> = {
  APPROVE: '#10b981',
  REJECT: '#ef4444',
  ESCALATE: '#f59e0b',
};

interface CustomerPortfolioPickerProps {
  selectedId: string;
  onSelect: (customer: Customer) => void;
}

export default function CustomerPortfolioPicker({ selectedId, onSelect }: CustomerPortfolioPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const selected = customers.find(c => c.customer_id === selectedId);

  return (
    <div style={{ marginTop: '8px' }}>
      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          fontSize: '0.65rem', padding: '4px 10px', borderRadius: '6px',
          border: '1px solid var(--border)', background: 'var(--bg-secondary)',
          color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 500,
        }}
      >
        {expanded ? '▾ Hide portfolio' : '▸ 18-customer portfolio'} ({customers.length} scenarios)
      </button>

      {/* Dropdown */}
      {expanded && (
        <div style={{ marginTop: '8px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border)', maxHeight: '240px', overflowY: 'auto', padding: '4px' }}>
          {customers.map(c => (
            <button
              key={c.customer_id}
              onClick={() => onSelect(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                padding: '8px 10px', borderRadius: '6px', border: 'none', textAlign: 'left',
                background: c.customer_id === selectedId ? 'rgba(59,130,246,0.1)' : 'transparent',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: verdictColor[c.expected_verdict] || '#64748b', flexShrink: 0 }} />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.company_name}
                </div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>
                  {c.jurisdiction} · {c.sector} · {c.annual_revenue}
                </div>
              </div>
              <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', flexShrink: 0 }}>{c.customer_id}</span>
            </button>
          ))}
        </div>
      )}

      {/* Selected customer info card */}
      {selected && expanded && (
        <div style={{ marginTop: '8px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px', fontSize: '0.65rem' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>{selected.company_name}</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: '6px' }}>
            {selected.jurisdiction} · {selected.sector} · Revenue: {selected.annual_revenue}
          </div>
          {/* Beneficial owners */}
          <div style={{ marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Owners: </span>
            {selected.beneficial_owners.map((o, i) => (
              <span key={i} style={{ color: 'var(--text-secondary)' }}>
                {o.name} ({o.nationality}, {o.ownership_pct}%){o.pep ? ' 🔴PEP' : ''}
                {i < selected.beneficial_owners.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </div>
          {/* Risk signals */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
            {selected.risk_signals.slice(0, 3).map((s, i) => (
              <span key={i} style={{ fontSize: '0.55rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                {s.length > 40 ? s.slice(0, 40) + '…' : s}
              </span>
            ))}
            {selected.risk_signals.length > 3 && (
              <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>+{selected.risk_signals.length - 3} more</span>
            )}
          </div>
          {/* Narrative */}
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>
            {selected.narrative}
          </div>
        </div>
      )}
    </div>
  );
}

export { customers, type Customer };
