import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

export default function Navigation({ config }: { config: RuntimeConfig }) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--sky-500), var(--sky-600))',
                boxShadow: '0 2px 8px rgba(14, 165, 233, 0.25)',
              }}
            >
              {/* Headset icon */}
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#FFFFFF" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <span className="text-base font-bold" style={{ color: 'var(--slate-800)' }}>AVA </span>
              <span className="text-base font-bold" style={{ color: 'var(--sky-500)' }}>Support</span>
              <div className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                {config.domain}
              </div>
            </div>
          </Link>

          {/* Nav links */}
          <div className="flex items-center space-x-1">
            {[
              { path: '/', label: 'Dashboard' },
              { path: '/console', label: 'Submit Ticket' },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all relative"
                style={{
                  color: isActive(item.path) ? 'var(--sky-600)' : 'var(--text-secondary)',
                  background: isActive(item.path) ? 'var(--sky-50)' : 'transparent',
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {/* Sky blue accent bottom border */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{
          background: 'linear-gradient(90deg, transparent 5%, var(--sky-400) 30%, var(--sky-500) 50%, var(--sky-400) 70%, transparent 95%)',
          opacity: 0.5,
        }}
      />
    </nav>
  );
}
