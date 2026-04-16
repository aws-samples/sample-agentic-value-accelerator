import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

export default function Navigation({ config }: { config: RuntimeConfig }) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      className="border-b sticky top-0 z-50"
      style={{
        background: 'rgba(250, 250, 249, 0.8)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3 group">
            {/* Logo */}
            <div className="relative">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(15,118,110,0.1), rgba(20,184,166,0.15))',
                  border: '1px solid rgba(15,118,110,0.2)',
                  boxShadow: '0 2px 8px rgba(15,118,110,0.1)',
                }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#0F766E" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              {/* Hover glow */}
              <div
                className="absolute inset-[-2px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(135deg, var(--teal-light), var(--amber))',
                  filter: 'blur(6px)',
                  zIndex: -1,
                }}
              />
            </div>
            <div>
              <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{config.use_case_name}</div>
              <div
                className="text-[10px] font-mono uppercase tracking-[0.3em]"
                style={{
                  background: 'linear-gradient(90deg, var(--teal), var(--teal-light))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                AVA
              </div>
            </div>
          </Link>

          <div className="flex items-center space-x-1">
            {[
              { path: '/', label: 'Home' },
              { path: '/console', label: 'Retention Dashboard' },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all relative"
                style={{
                  color: isActive(item.path) ? 'var(--teal)' : 'var(--text-secondary)',
                }}
              >
                {isActive(item.path) && (
                  <div
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: 'rgba(20, 184, 166, 0.06)',
                      border: '1px solid rgba(15, 118, 110, 0.15)',
                    }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 10%, rgba(20,184,166,0.15) 30%, rgba(245,158,11,0.1) 70%, transparent 90%)',
        }}
      />
    </nav>
  );
}
