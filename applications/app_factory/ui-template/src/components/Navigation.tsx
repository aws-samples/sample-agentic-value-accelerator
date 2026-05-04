import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

export default function Navigation({ config }: { config: RuntimeConfig }) {
  const location = useLocation();

  return (
    <nav className="sticky top-0 z-50 border-b" style={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(12px)', borderColor: 'var(--border)' }}>
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <span className="text-sky-400 text-sm font-bold">A</span>
          </div>
          <div>
            <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{config.use_case_name}</span>
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
              {config.domain}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              location.pathname === '/'
                ? 'bg-sky-500/10 text-sky-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Overview
          </Link>
          <Link
            to="/console"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              location.pathname === '/console'
                ? 'bg-sky-500/10 text-sky-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Console
          </Link>
        </div>
      </div>
    </nav>
  );
}
