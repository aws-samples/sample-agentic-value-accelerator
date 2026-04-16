import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

export default function Navigation({ config }: Props) {
  const location = useLocation();

  const links = [
    { to: '/', label: 'Wealth Dashboard' },
    { to: '/console', label: 'Advisory Console' },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b"
      style={{ borderColor: '#D1FAE5', boxShadow: '0 2px 16px rgba(6,78,59,0.06)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #064E3B, #059669)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--charcoal)' }}>AVA</span>
            <span className="text-lg font-semibold heading-serif" style={{ color: 'var(--forest-800)' }}>Wealth</span>
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
                style={active ? { background: 'linear-gradient(135deg, #064E3B, #059669)' } : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Domain badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: 'var(--forest-50)', color: 'var(--forest-800)' }}>
            {config.domain}
          </span>
        </div>
      </div>
      {/* Forest-to-gold gradient accent line */}
      <div className="h-0.5" style={{ background: 'linear-gradient(90deg, #064E3B, #065F46, #059669, #D4A017)' }} />
    </nav>
  );
}
