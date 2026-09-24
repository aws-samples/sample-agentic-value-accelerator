import React, { useState } from 'react';
import type { ScenarioId } from '../../types/simulation';
import { CUSTOMER_PROFILES } from '../../data/customers/profiles';
import CustomerPortfolioPicker, { type Customer } from './CustomerPortfolioPicker';

interface ScenarioSelectorProps {
  active: ScenarioId;
  onSelect: (scenario: ScenarioId) => void;
  liveMode: boolean;
  onToggleLive: () => void;
  customerId?: string;
  onCustomerChange?: (customerId: string) => void;
}

const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({
  active,
  onSelect,
  liveMode,
  onToggleLive,
  customerId,
  onCustomerChange,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={() => onSelect('approve')}
          style={{
            padding: '5px 10px',
            fontSize: '10px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            border: '1px solid',
            borderColor: active === 'approve' ? 'var(--approve)' : 'var(--border)',
            borderRadius: '6px',
            background: active === 'approve' ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-secondary)',
            color: active === 'approve' ? 'var(--approve)' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          ✓ Acme Corp (APPROVE)
        </button>

        <button
          onClick={() => onSelect('block')}
          style={{
            padding: '5px 10px',
            fontSize: '10px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            border: '1px solid',
            borderColor: active === 'block' ? 'var(--reject)' : 'var(--border)',
            borderRadius: '6px',
            background: active === 'block' ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-secondary)',
            color: active === 'block' ? 'var(--reject)' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          ⚠ Omega Trading (BLOCK)
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '10px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={liveMode}
            onChange={onToggleLive}
            style={{ accentColor: 'var(--accent)', width: '12px', height: '12px' }}
          />
          Live mode
        </label>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '9px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px 4px',
            opacity: 0.6,
          }}
        >
          {showAdvanced ? '▾ Advanced' : '▸ Advanced'}
        </button>
      </div>

      {showAdvanced && onCustomerChange && (
        <select
          value={customerId || ''}
          onChange={(e) => onCustomerChange(e.target.value)}
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-sans)',
            padding: '4px 6px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            width: '100%',
          }}
        >
          <option value="">Default (scenario-based)</option>
          {CUSTOMER_PROFILES.map(p => (
            <option key={p.customer_id} value={p.customer_id}>
              {p.customer_id} — {p.short} ({p.decision})
            </option>
          ))}
        </select>
      )}

      {/* 18-Customer Portfolio Picker */}
      <CustomerPortfolioPicker
        selectedId={customerId || 'CUST-009'}
        onSelect={(customer: Customer) => {
          if (onCustomerChange) onCustomerChange(customer.customer_id);
          // Map expected_verdict to scenario type
          if (customer.expected_verdict === 'APPROVE') {
            onSelect('approve');
          } else {
            onSelect('block');
          }
        }}
      />
    </div>
  );
};

export default ScenarioSelector;
