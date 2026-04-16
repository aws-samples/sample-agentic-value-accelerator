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
      style={{ background: 'rgba(41,37,36,0.97)', borderColor: '#57534E', boxShadow: '0 2px 16px rgba(0,0,0,0.2)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0284C7, #38BDF8)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold tracking-tight text-white">AVA</span>
            <span className="text-lg font-semibold" style={{ color: '#38BDF8' }}>Claims</span>
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
                    : 'text-stone-400 hover:text-white hover:bg-white/5'
                }`}
                style={active ? { background: 'linear-gradient(135deg, #0284C7, #38BDF8)' } : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Domain badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(2,132,199,0.15)', color: '#38BDF8' }}>
            {config.domain}
          </span>
        </div>
      </div>
      {/* Sky-coral-green gradient accent line */}
      <div className="h-0.5" style={{ background: 'linear-gradient(90deg, #0284C7, #38BDF8, #F97316, #16A34A)' }} />
    </nav>
  );
}
