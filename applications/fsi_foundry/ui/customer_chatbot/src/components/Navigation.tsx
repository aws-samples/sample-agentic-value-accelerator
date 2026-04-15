import { Link, useLocation } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

export default function Navigation({ config: _config }: { config: RuntimeConfig }) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  // Suppress unused variable warning while keeping the prop signature
  void _config;

  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: 'rgba(250, 250, 249, 0.85)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid #E7E5E4',
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="relative">
              <div
                className="w-9 h-9 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(101,163,13,0.12), rgba(132,204,22,0.08))',
                  border: '1px solid rgba(101,163,13,0.2)',
                }}
              >
                {/* Chat bubble icon */}
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                </svg>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>AVA</span>
              <span className="text-base font-semibold" style={{ color: 'var(--sage)' }}>Chat</span>
            </div>
            {/* Online dot */}
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: 'var(--sage)',
                  boxShadow: '0 0 6px rgba(101, 163, 13, 0.4)',
                  animation: 'gentleBounce 2s ease-in-out infinite',
                }}
              />
              <span className="text-[10px] font-medium" style={{ color: 'var(--sage)' }}>Online</span>
            </div>
          </Link>

          {/* Nav links */}
          <div className="flex items-center space-x-2">
            {[
              { path: '/', label: 'Home' },
              { path: '/console', label: 'Start Chat' },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="px-5 py-2 rounded-full text-sm font-medium transition-all relative"
                style={{
                  color: isActive(item.path) ? '#FFFFFF' : 'var(--text-secondary)',
                  background: isActive(item.path)
                    ? 'linear-gradient(135deg, var(--sage), var(--sage-light))'
                    : 'transparent',
                  boxShadow: isActive(item.path)
                    ? '0 2px 8px rgba(101, 163, 13, 0.2)'
                    : 'none',
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
