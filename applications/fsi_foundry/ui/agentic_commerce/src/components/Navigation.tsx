import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

export default function Navigation({ config }: Props) {
  const location = useLocation();

  const links = [
    { to: '/', label: 'Catalog' },
    { to: '/console', label: 'Process Order' },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-rose-100"
      style={{ boxShadow: '0 2px 16px rgba(225,29,72,0.06)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #E11D48, #FB7185)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--charcoal)' }}>AVA</span>
            <span className="text-lg font-semibold" style={{ color: 'var(--rose-600)' }}>Commerce</span>
          </div>
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-1">
          {links.map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  active
                    ? 'text-white'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
                style={active ? { background: 'linear-gradient(135deg, #E11D48, #FB7185)' } : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Domain badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: 'var(--rose-50)', color: 'var(--rose-600)' }}>
            {config.domain}
          </span>
        </div>
      </div>
      {/* Rose gradient accent line */}
      <div className="h-0.5" style={{ background: 'linear-gradient(90deg, #E11D48, #FB7185, #818CF8, #4F46E5)' }} />
    </nav>
  );
}
