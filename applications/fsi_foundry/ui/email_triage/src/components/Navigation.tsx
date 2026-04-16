import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

export default function Navigation({ config }: { config: RuntimeConfig }) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      className="border-b sticky top-0 z-50"
      style={{
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3 group">
            {/* Envelope logo */}
            <div className="relative">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                  background: 'var(--blue-50)',
                  border: '1px solid var(--blue-200)',
                }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--blue-500)" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
            </div>
            <div>
              <div className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>{config.use_case_name}</div>
              <div
                className="text-[10px] font-mono uppercase tracking-[0.3em]"
                style={{ color: 'var(--blue-500)' }}
              >
                AVA
              </div>
            </div>
          </Link>

          <div className="flex items-center space-x-1">
            {[
              { path: '/', label: 'Home' },
              { path: '/console', label: 'Inbox Manager' },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all relative"
                style={{
                  color: isActive(item.path) ? 'var(--blue-600)' : 'var(--text-secondary)',
                  background: isActive(item.path) ? 'var(--blue-50)' : 'transparent',
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 10%, var(--blue-200) 50%, transparent 90%)',
        }}
      />
    </nav>
  );
}
