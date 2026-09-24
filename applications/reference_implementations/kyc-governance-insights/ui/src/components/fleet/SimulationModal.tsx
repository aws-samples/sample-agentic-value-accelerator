import { useEffect } from 'react';
import SimulationTab from '../SimulationTab';
import { TEST_IDS } from '../../test-ids';

interface SimulationModalProps {
  onClose: () => void;
}

export default function SimulationModal({ onClose }: SimulationModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      data-testid={TEST_IDS.fleet.simulationModal}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>
          🤖 Agent Decision Trace — KYC Governance Demo
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            color: '#fff',
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ✕ Close (Esc)
        </button>
      </div>
      {/* Simulation content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px', background: 'var(--bg-primary)' }}>
        <SimulationTab />
      </div>
    </div>
  );
}
