import React from 'react';
import { overviewStats, techStackCards, useCaseCards } from '../../data/overviewData';
import type { TabId } from '../../types/tabs';
import type { ScenarioId } from '../../types/simulation';
import TokenomySection from './TokenomySection';
import AgentConstellation from '../constellation/AgentConstellation';
import { useMetrics } from '../../hooks/useMetrics';
import { StatusBadge } from '../shared/StatusBadge';
import { Sparkline } from '../shared/Sparkline';
import { formatTimeAgo } from '../../utils/timeAgo';
import SectionDescription from '../shared/SectionDescription';

interface OverviewTabProps {
  onNavigate: (tab: TabId, scenario?: ScenarioId) => void;
}

const colorMap: Record<string, string> = {
  'mv-green': '#36b37e',
  'mv-blue': '#0052CC',
  'mv-red': '#de350b',
  'mv-orange': '#ff991f',
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ onNavigate }) => {
  const metrics = useMetrics();

  return (
    <div data-testid="overview.container" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      {/* Metrics status indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
        <StatusBadge variant={metrics.status === 'live' ? 'live' : metrics.status === 'stale' ? 'cached' : 'simulated'} />
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Updated {formatTimeAgo(metrics.lastUpdated)}</span>
      </div>

      {/* Stale warning */}
      {metrics.status === 'stale' && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '6px 12px', fontSize: '0.75rem', color: '#f59e0b' }}>
          \u26A0\uFE0F Metrics data is stale \u2014 last update {formatTimeAgo(metrics.lastUpdated)}
        </div>
      )}
      {/* Hero Section */}
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Know Your Customer Assessment
        </h1>
        <p
          style={{
            fontSize: '1rem',
            color: 'var(--text-secondary)',
            marginTop: '0.75rem',
            maxWidth: '600px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Multi-agent AI governance demo — Defence in Depth with Earned Autonomy
        </p>
      </div>

      {/* Agent Constellation */}
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 1rem' }}>Multi-Agent Constellation</h2>
        <SectionDescription text="The six specialised agents that collaborate on each KYC decision — click any node for details." />
        <AgentConstellation />
      </div>

      {/* Stats Row — R4: subtle bg, no borders. Q2: clickable navigates to Governance */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
        }}
      >
        {overviewStats.map((stat) => (
          <div
            key={stat.label}
            onClick={() => onNavigate('governance')}
            style={{
              background: 'var(--bg-card)',
              borderRadius: '12px',
              padding: '1.5rem',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title="Click to see full metrics in Governance tab"
          >
            <div
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: colorMap[stat.colorClass] || 'var(--text-primary)',
              }}
            >
              {stat.value}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Tech Stack Grid */}
      <div>
        <h2
          style={{
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '1rem',
          }}
        >
          Technology Stack
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
          }}
        >
          {techStackCards.map((card) => (
            <div
              key={card.name}
              style={{
                background: 'var(--bg-card)',
                borderRadius: '12px',
                padding: '1.5rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-muted)',
                  marginBottom: '0.25rem',
                }}
              >
                {card.label}
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {card.url ? (
                  <a href={card.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-primary)', textDecoration: 'none', borderBottom: '1px dotted var(--text-muted)' }}>
                    {card.name}
                  </a>
                ) : card.name}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {card.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Use Case Cards */}
      <div>
        <h2
          style={{
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '1rem',
          }}
        >
          What This Demo Shows
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
          }}
        >
          {useCaseCards.map((card) => (
            <div
              key={card.title}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '1.5rem',
              }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: card.iconColor }}>
                {card.icon}
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {card.title}
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  marginTop: '0.25rem',
                  lineHeight: 1.5,
                }}
              >
                {card.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tokenomy & Cost Governance */}
      <TokenomySection metrics={metrics.current} />

      {/* Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', padding: '1rem 0' }}>
        <button
          className="btn-primary"
          onClick={() => onNavigate('simulation', 'approve')}
        >
          Run Simulation (Approve)
        </button>
        <button
          className="btn-secondary"
          style={{ borderColor: '#ef4444', color: '#ef4444' }}
          onClick={() => onNavigate('simulation', 'block')}
        >
          Run High-Risk (Block)
        </button>
      </div>
    </div>
  );
};

export default OverviewTab;
