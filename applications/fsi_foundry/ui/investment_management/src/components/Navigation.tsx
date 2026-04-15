import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

export default function Navigation({ config }: Props) {
  const location = useLocation();

  const links = [
    { to: '/', label: 'Dashboard' },
    { to: '/console', label: 'Run Assessment' },
  ];

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md border-b"
      style={{ background: 'rgba(15,23,42,0.97)', borderColor: 'var(--slate-700)', boxShadow: '0 2px 16px rgba(0,0,0,0.2)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0D9488, #14B8A6)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <rect x="7" y="10" width="3" height="8" rx="1" />
              <rect x="12" y="6" width="3" height="12" rx="1" />
              <rect x="17" y="3" width="3" height="15" rx="1" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold tracking-tight text-white">AVA</span>
            <span className="text-lg font-semibold" style={{ color: 'var(--teal-400)' }}>Portfolio</span>
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
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
                style={active ? { background: 'linear-gradient(135deg, #0D9488, #14B8A6)' } : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Domain badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(13,148,136,0.15)', color: 'var(--teal-400)' }}>
            {config.domain}
          </span>
        </div>
      </div>
      {/* Teal-violet gradient accent line */}
      <div className="h-0.5" style={{ background: 'linear-gradient(90deg, #0D9488, #14B8A6, #7C3AED, #F59E0B)' }} />
    </nav>
  );
}
