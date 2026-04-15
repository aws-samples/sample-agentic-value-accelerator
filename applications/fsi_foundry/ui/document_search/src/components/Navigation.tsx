import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

export default function Navigation({ config }: Props) {
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/console', label: 'Search Console' },
  ];

  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: 'linear-gradient(135deg, #44200D, #5C2D0E, #44200D)',
        borderBottom: '1px solid rgba(217, 119, 6, 0.2)',
        boxShadow: '0 2px 12px rgba(68, 32, 13, 0.15)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 py-0 flex items-center justify-between h-16">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 no-underline group">
          {/* Book icon */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
            style={{
              background: 'linear-gradient(135deg, #D97706, #F59E0B)',
              boxShadow: '0 2px 8px rgba(217, 119, 6, 0.4)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFBF2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <line x1="9" y1="7" x2="17" y2="7" />
              <line x1="9" y1="11" x2="15" y2="11" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span
              className="text-lg font-bold tracking-wide leading-none"
              style={{
                background: 'linear-gradient(135deg, #F59E0B, #FCD34D)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              AVA
            </span>
            <span
              className="text-xs font-medium tracking-wider mt-0.5"
              style={{ color: 'rgba(253, 248, 240, 0.65)' }}
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
                  color: isActive ? '#FCD34D' : 'rgba(253, 248, 240, 0.7)',
                  background: isActive ? 'rgba(217, 119, 6, 0.15)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = '#FDF8F0';
                    e.currentTarget.style.background = 'rgba(217, 119, 6, 0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'rgba(253, 248, 240, 0.7)';
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
