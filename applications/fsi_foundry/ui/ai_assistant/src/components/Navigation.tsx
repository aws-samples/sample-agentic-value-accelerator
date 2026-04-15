import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

export default function Navigation({ config }: Props) {
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'Workspace' },
    { path: '/console', label: 'New Task' },
  ];

  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: 'var(--white)',
        borderBottom: '2px solid rgba(124, 58, 237, 0.1)',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.03)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 py-0 flex items-center justify-between h-14">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 no-underline group">
          {/* Grid/Dashboard icon */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #7C3AED, #8B5CF6)',
              boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-lg font-bold tracking-tight"
              style={{ color: 'var(--black-near)' }}
            >
              AVA
            </span>
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--purple-600)' }}
            >
              {config.use_case_name}
            </span>
          </div>
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 no-underline"
                style={{
                  color: isActive ? 'var(--purple-700)' : 'var(--gray-500)',
                  background: isActive ? 'rgba(124, 58, 237, 0.06)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--gray-700)';
                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.03)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--gray-500)';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
