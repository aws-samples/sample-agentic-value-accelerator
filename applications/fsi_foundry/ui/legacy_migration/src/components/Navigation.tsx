import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

export default function Navigation({ config }: { config: RuntimeConfig }) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      className="border-b sticky top-0 z-50"
      style={{
        background: 'rgba(10, 10, 10, 0.85)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="relative">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  boxShadow: '0 0 10px rgba(34,197,94,0.1)',
                }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--green-term)" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
              </div>
              <div
                className="absolute inset-[-2px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'var(--green-term)',
                  filter: 'blur(6px)',
                  zIndex: -1,
                  opacity: 0,
                }}
              />
            </div>
            <div>
              <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{config.use_case_name}</div>
              <div
                className="text-[10px] font-mono uppercase tracking-[0.3em]"
                style={{ color: 'var(--green-term)' }}
              >
                AVA
              </div>
            </div>
          </Link>

          <div className="flex items-center space-x-1">
            {[
              { path: '/', label: 'Home' },
              { path: '/console', label: 'Migration Console' },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all relative"
                style={{
                  color: isActive(item.path) ? 'var(--green-term)' : 'var(--text-secondary)',
                }}
              >
                {isActive(item.path) && (
                  <div
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: 'rgba(34, 197, 94, 0.06)',
                      border: '1px solid rgba(34, 197, 94, 0.15)',
                    }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 10%, rgba(34,197,94,0.15) 50%, transparent 90%)',
        }}
      />
    </nav>
  );
}
