import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

export default function Navigation({ config }: Props) {
  const location = useLocation();

  const links = [
    { to: '/', label: 'Research Feed' },
    { to: '/console', label: 'Run Analysis' },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b"
      style={{ borderColor: 'var(--navy-100)', boxShadow: '0 2px 16px rgba(30,58,95,0.06)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0F2440, #1E3A5F)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 4-12" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--charcoal)' }}>AVA</span>
            <span className="text-lg heading-serif font-semibold" style={{ color: 'var(--navy-800)' }}>Research</span>
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
                style={active ? { background: 'linear-gradient(135deg, #0F2440, #1E3A5F)' } : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Domain badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: 'var(--navy-50)', color: 'var(--navy-800)' }}>
            {config.domain}
          </span>
        </div>
      </div>
      {/* Navy-terracotta gradient accent line */}
      <div className="h-0.5" style={{ background: 'linear-gradient(90deg, #0F2440, #1E3A5F, #4A7099, #C2410C)' }} />
    </nav>
  );
}
