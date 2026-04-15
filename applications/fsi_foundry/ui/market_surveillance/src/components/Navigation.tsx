import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

export default function Navigation({ config }: Props) {
  const location = useLocation();

  const links = [
    { to: '/', label: 'Surveillance Dashboard' },
    { to: '/console', label: 'Run Surveillance' },
  ];

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md border-b"
      style={{ background: 'rgba(9,9,11,0.92)', borderColor: 'var(--zinc-800)', boxShadow: '0 2px 16px rgba(0,0,0,0.4)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #164E63, #06B6D4)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--zinc-300)' }}>AVA</span>
            <span className="text-lg font-semibold" style={{ color: 'var(--cyan-400)' }}>Surveillance</span>
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
                    : 'hover:bg-zinc-800/60'
                }`}
                style={
                  active
                    ? { background: 'linear-gradient(135deg, #164E63, #06B6D4)', color: 'white' }
                    : { color: 'var(--zinc-500)' }
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
            style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan-400)', border: '1px solid rgba(6,182,212,0.2)' }}>
            {config.domain}
          </span>
        </div>
      </div>
      {/* Cyan/orange gradient accent line */}
      <div className="h-0.5" style={{ background: 'linear-gradient(90deg, #164E63, #06B6D4, #22D3EE, #F97316)' }} />
    </nav>
  );
}
