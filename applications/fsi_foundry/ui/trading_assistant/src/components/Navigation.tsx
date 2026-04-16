import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

export default function Navigation({ config }: Props) {
  const location = useLocation();

  const links = [
    { to: '/', label: 'Trading Desk' },
    { to: '/console', label: 'Run Analysis' },
  ];

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md border-b"
      style={{ background: 'rgba(11,17,32,0.92)', borderColor: 'var(--border-color)', boxShadow: '0 2px 16px rgba(0,0,0,0.3)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #22C55E, #16A34A)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 17 9 11 13 15 21 7" />
              <polyline points="14 7 21 7 21 14" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--white)' }}>AVA</span>
            <span className="text-lg font-semibold heading-terminal" style={{ color: '#4ADE80' }}>Trading</span>
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
                    : 'hover:bg-white/5'
                }`}
                style={
                  active
                    ? { background: 'linear-gradient(135deg, #22C55E, #16A34A)', color: 'white' }
                    : { color: 'var(--text-muted)' }
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Domain badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}>
            {config.domain}
          </span>
        </div>
      </div>
      {/* Green gradient accent line */}
      <div className="h-0.5" style={{ background: 'linear-gradient(90deg, #22C55E, #4ADE80, #86EFAC, #22C55E)' }} />
    </nav>
  );
}
