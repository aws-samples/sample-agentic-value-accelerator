import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

export default function Navigation({ config }: Props) {
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'Dashboard' },
    { path: '/console', label: 'Operations Console' },
  ];

  return (
    <nav
      style={{
        background: 'var(--navy)',
        borderBottom: '1px solid rgba(71, 85, 105, 0.3)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Bottom gradient accent line */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, var(--copper), var(--teal), var(--copper))',
          opacity: 0.6,
        }}
      />

      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between" style={{ height: '64px' }}>
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 no-underline">
          {/* Shield / Operations icon */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'linear-gradient(135deg, var(--copper), var(--copper-light))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
              AVA
            </span>
            <span style={{ color: 'var(--copper-light)', fontWeight: 600, fontSize: '0.95rem' }}>
              Operations
            </span>
            {/* Radar dot */}
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--teal-light)',
                display: 'inline-block',
                animation: 'dotPulse 2s ease-in-out infinite',
              }}
            />
          </div>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: isActive ? 'rgba(71, 85, 105, 0.2)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.background = 'rgba(71, 85, 105, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {link.label}
              </Link>
            );
          })}
          <span
            className="mono"
            style={{
              marginLeft: '0.75rem',
              padding: '0.25rem 0.6rem',
              borderRadius: 4,
              fontSize: '0.7rem',
              fontWeight: 600,
              background: 'rgba(13, 148, 136, 0.12)',
              color: 'var(--teal-light)',
              border: '1px solid rgba(13, 148, 136, 0.25)',
              letterSpacing: '0.05em',
            }}
          >
            {config.domain}
          </span>
        </div>
      </div>
    </nav>
  );
}
