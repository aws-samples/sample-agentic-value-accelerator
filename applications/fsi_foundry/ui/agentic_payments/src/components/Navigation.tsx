import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

export default function Navigation({ config }: Props) {
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'Dashboard' },
    { path: '/console', label: 'Process Payment' },
  ];

  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: 'var(--white)',
        borderBottom: '1px solid var(--border-color)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 no-underline">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--emerald-600), var(--emerald-500))',
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold" style={{ color: 'var(--slate-900)' }}>AVA</span>
            <span className="text-lg font-medium" style={{ color: 'var(--emerald-600)' }}>Payments</span>
          </div>
        </Link>

        {/* Navigation links */}
        <div className="flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className="px-4 py-2 rounded-lg text-sm font-medium no-underline transition-colors"
                style={{
                  color: isActive ? 'var(--emerald-600)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--emerald-50)' : 'transparent',
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Domain badge */}
        <div
          className="px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{
            background: 'var(--slate-100)',
            color: 'var(--text-secondary)',
          }}
        >
          {config.domain}
        </div>
      </div>
    </nav>
  );
}
