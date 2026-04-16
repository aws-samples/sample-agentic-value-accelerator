import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

export default function Navigation({ config }: { config: RuntimeConfig }) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      className="border-b sticky top-0 z-50"
      style={{
        background: 'rgba(5, 5, 5, 0.6)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderColor: 'rgba(0, 255, 65, 0.06)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="relative">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,255,65,0.15), rgba(255,176,0,0.1))',
                  border: '1px solid rgba(0,255,65,0.3)',
                  boxShadow: '0 0 15px rgba(0,255,65,0.2), inset 0 0 10px rgba(0,255,65,0.05)',
                }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#00FF41" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
                </svg>
              </div>
              <div
                className="absolute inset-[-2px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(135deg, var(--phosphor), var(--amber))',
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
                  background: 'linear-gradient(90deg, var(--phosphor), var(--amber))',
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
              { path: '/console', label: 'Migration Console' },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all relative"
                style={{
                  color: isActive(item.path) ? 'var(--phosphor)' : 'var(--text-secondary)',
                }}
              >
                {isActive(item.path) && (
                  <div
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: 'rgba(0, 255, 65, 0.06)',
                      border: '1px solid rgba(0, 255, 65, 0.15)',
                      boxShadow: 'inset 0 0 20px rgba(0, 255, 65, 0.03)',
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
          background: 'linear-gradient(90deg, transparent 10%, rgba(0,255,65,0.15) 30%, rgba(255,176,0,0.1) 70%, transparent 90%)',
        }}
      />
    </nav>
  );
}
