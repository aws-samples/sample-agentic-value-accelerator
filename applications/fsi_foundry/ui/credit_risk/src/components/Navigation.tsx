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
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--bg-primary)" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
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
                background: isActive('/') ? 'rgba(0, 212, 170, 0.1)' : 'transparent',
                color: isActive('/') ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              Home
            </Link>
            <Link
              to="/console"
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: isActive('/console') ? 'rgba(0, 212, 170, 0.1)' : 'transparent',
                color: isActive('/console') ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              Agent Console
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
