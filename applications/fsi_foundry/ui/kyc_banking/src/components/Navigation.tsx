import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

export default function Navigation({ config }: { config: RuntimeConfig }) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="border-b" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="relative w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dim))' }}>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{config.use_case_name}</div>
              <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--accent)' }}>AVA</div>
            </div>
          </Link>

          <div className="flex items-center space-x-1">
            <Link
              to="/"
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: isActive('/') ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                color: isActive('/') ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              Home
            </Link>
            <Link
              to="/console"
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: isActive('/console') ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                color: isActive('/console') ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              KYC Console
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
