import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

export default function Navigation({ config }: Props) {
  const { pathname } = useLocation();

  const links = [
    { to: '/', label: 'Dashboard' },
    { to: '/console', label: 'Analyze Lead' },
  ];

  return (
    <nav style={{ background: 'white', borderBottom: '1px solid #F3F4F6' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '4rem' }}>
          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', textDecoration: 'none' }}>
            {/* TrendingUp chart icon */}
            <div style={{
              width: '2.25rem',
              height: '2.25rem',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #D4A017, #F5C842)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(212, 160, 23, 0.25)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1.125rem', color: '#1F2937', letterSpacing: '-0.02em' }}>AVA</span>
              <span style={{ fontWeight: 600, fontSize: '1.125rem', color: '#D4A017' }}>{config.use_case_name}</span>
            </div>
          </Link>

          {/* Navigation links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {links.map((link) => {
              const isActive = pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? '#D4A017' : '#6B7280',
                    background: isActive ? '#FEF3C7' : 'transparent',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      {/* Gold accent line */}
      <div className="gold-accent-line" />
    </nav>
  );
}
