import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

export default function Navigation({ config }: { config: RuntimeConfig }) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      className="border-b sticky top-0 z-50"
      style={{
        background: 'rgba(248, 250, 252, 0.85)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3 group">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
              }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <div>
              <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{config.use_case_name}</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.3em]" style={{ color: 'var(--blue)' }}>AVA</div>
            </div>
          </Link>

          <div className="flex items-center space-x-1">
            {[
              { path: '/', label: 'Home' },
              { path: '/console', label: 'Analytics Console' },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all relative"
                style={{
                  color: isActive(item.path) ? 'var(--blue)' : 'var(--text-secondary)',
                  background: isActive(item.path) ? 'rgba(37,99,235,0.06)' : 'transparent',
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
