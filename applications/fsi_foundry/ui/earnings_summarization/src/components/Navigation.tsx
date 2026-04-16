import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

interface Props {
  config: RuntimeConfig;
}

export default function Navigation({ config }: Props) {
  const location = useLocation();

  const links = [
    { to: '/', label: 'Terminal' },
    { to: '/console', label: 'Analyze' },
  ];

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md"
      style={{ background: 'rgba(10,22,40,0.95)', borderBottom: '1px solid var(--terminal-border)' }}>
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-md flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #2563EB, #60A5FA)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-extrabold tracking-tight" style={{ color: 'var(--white)' }}>AVA</span>
            <span className="text-base font-semibold" style={{ color: 'var(--blue-400)' }}>Earnings</span>
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
                className={`px-4 py-1.5 rounded text-xs font-bold tracking-wider uppercase transition-all duration-200 ${
                  active
                    ? 'text-white'
                    : 'hover:text-white'
                }`}
                style={{
                  color: active ? 'white' : 'var(--gray-400)',
                  background: active ? 'linear-gradient(135deg, #2563EB, #3B82F6)' : undefined,
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Domain badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--green-500)', animation: 'pulseBlue 2s ease-in-out infinite' }} />
            <span className="text-xs font-bold tracking-wider uppercase"
              style={{ color: 'var(--green-400)', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              LIVE
            </span>
          </div>
          <span className="text-xs font-bold px-2 py-1 rounded"
            style={{
              background: 'rgba(37,99,235,0.15)',
              color: 'var(--blue-400)',
              border: '1px solid rgba(37,99,235,0.3)',
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            }}>
            {config.domain}
          </span>
        </div>
      </div>
      {/* Terminal accent line */}
      <div className="h-px" style={{ background: 'linear-gradient(90deg, #2563EB, #3B82F6, #60A5FA, #F97316)' }} />
    </nav>
  );
}
