import React, { useState, type ReactNode } from 'react';
import InfoTooltip from './InfoTooltip';

interface CollapsibleSectionProps {
  title: string;
  /** Optional ℹ️ tooltip text shown next to the title (info-panel "cheat-code"). */
  info?: string;
  /** Tier 2+ sections should pass defaultCollapsed so landing shows Tier 1 first. */
  defaultCollapsed?: boolean;
  /** Optional short summary shown on the header row when collapsed (e.g. a headline number). */
  collapsedHint?: string;
  children: ReactNode;
}

/**
 * A titled panel that collapses to a single header row. Used to demote Tier 2+
 * sections so a landing view shows Tier 1 content full-size and everything else
 * as an expand-on-demand header. Nothing is removed — only collapsed by default.
 */
export default function CollapsibleSection({
  title,
  info,
  defaultCollapsed = false,
  collapsedHint,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(!defaultCollapsed);

  return (
    <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          padding: '12px 16px', color: 'var(--text-primary)',
        }}
      >
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ▶
        </span>
        <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>{title}</span>
        {info && <InfoTooltip text={info} />}
        {!open && collapsedHint && (
          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            {collapsedHint}
          </span>
        )}
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </section>
  );
}
