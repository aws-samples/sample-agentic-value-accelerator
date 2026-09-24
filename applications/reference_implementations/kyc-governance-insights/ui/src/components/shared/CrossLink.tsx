import React from 'react';

interface CrossLinkProps {
  label: string;
  onClick: () => void;
}

export default function CrossLink({ label, onClick }: CrossLinkProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '0.7rem',
        color: 'var(--accent)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 0',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => { (e.target as HTMLElement).style.textDecoration = 'underline'; }}
      onMouseLeave={(e) => { (e.target as HTMLElement).style.textDecoration = 'none'; }}
    >
      {label} →
    </button>
  );
}
