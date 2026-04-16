import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

export default function Navigation({ config }: { config: RuntimeConfig }) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      className="border-b sticky top-0 z-50"
      style={{
        background: 'rgba(3, 3, 8, 0.6)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderColor: 'rgba(0, 240, 255, 0.06)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3 group">
            {/* Neon logo */}
            <div className="relative">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,240,255,0.15), rgba(255,0,229,0.1))',
                  border: '1px solid rgba(0,240,255,0.3)',
                  boxShadow: '0 0 15px rgba(0,240,255,0.2), inset 0 0 10px rgba(0,240,255,0.05)',
                }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--neon-cyan)" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                </svg>
              </div>
              {/* Glow ring */}
              <div
                className="absolute inset-[-2px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-magenta))',
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
                  background: 'linear-gradient(90deg, var(--neon-cyan), var(--neon-magenta))',
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
              { path: '/console', label: 'Service Desk' },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all relative"
                style={{
                  color: isActive(item.path) ? 'var(--neon-cyan)' : 'var(--text-secondary)',
                }}
              >
                {isActive(item.path) && (
                  <div
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: 'rgba(0, 240, 255, 0.06)',
                      border: '1px solid rgba(0, 240, 255, 0.15)',
                      boxShadow: 'inset 0 0 20px rgba(0, 240, 255, 0.03)',
                    }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      {/* Bottom neon line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 10%, rgba(0,240,255,0.15) 30%, rgba(255,0,229,0.1) 70%, transparent 90%)',
        }}
      />
    </nav>
  );
}
