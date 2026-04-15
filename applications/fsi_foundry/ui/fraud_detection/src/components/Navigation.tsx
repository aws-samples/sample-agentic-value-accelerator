import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

export default function Navigation({ config }: { config: RuntimeConfig }) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      className="border-b sticky top-0 z-50"
      style={{
        background: 'rgba(11, 15, 25, 0.7)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderColor: 'rgba(239, 68, 68, 0.08)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3 group">
            {/* Shield logo */}
            <div className="relative">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(59,130,246,0.1))',
                  border: '1px solid rgba(239,68,68,0.3)',
                  boxShadow: '0 0 15px rgba(239,68,68,0.2), inset 0 0 10px rgba(239,68,68,0.05)',
                }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#EF4444" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              {/* Glow ring */}
              <div
                className="absolute inset-[-2px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(135deg, var(--soc-red-bright), var(--soc-blue))',
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
                  background: 'linear-gradient(90deg, var(--soc-red-bright), var(--soc-amber))',
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
              { path: '/console', label: 'Fraud Ops Center' },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all relative"
                style={{
                  color: isActive(item.path) ? 'var(--soc-red-bright)' : 'var(--text-secondary)',
                }}
              >
                {isActive(item.path) && (
                  <div
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: 'rgba(239, 68, 68, 0.06)',
                      border: '1px solid rgba(239, 68, 68, 0.15)',
                      boxShadow: 'inset 0 0 20px rgba(239, 68, 68, 0.03)',
                    }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      {/* Bottom alert line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 10%, rgba(239,68,68,0.2) 30%, rgba(245,158,11,0.1) 70%, transparent 90%)',
        }}
      />
    </nav>
  );
}
