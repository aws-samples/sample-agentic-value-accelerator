import { useState, useRef, useEffect } from 'react';
import type { TabConfig, TabId } from '../types/tabs';
import { TEST_IDS } from '../test-ids';

interface TabBarProps {
  tabs: TabConfig[];
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const isPresenter =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('presenter');

const tierOf = (t: TabConfig) => t.tier ?? 2;

export default function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen]);

  // Golden Rule: nothing is dropped — tier only controls placement.
  //  inline  = Tier 1 + Tier 2 (+ Tier 4 when ?presenter)
  //  "More"  = Tier 3 (one click away)
  //  hidden  = Tier 4 unless ?presenter (still routable programmatically)
  const inlineTabs = tabs.filter((t) => tierOf(t) <= 2 || (tierOf(t) === 4 && isPresenter));
  const moreTabs = tabs.filter((t) => tierOf(t) === 3);
  const activeInMore = moreTabs.some((t) => t.id === activeTab);

  const tabButton = (tab: TabConfig, active: boolean) => (
    <button
      key={tab.id}
      onClick={() => onTabChange(tab.id)}
      data-testid={TEST_IDS.nav.tab(tab.id)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-all cursor-pointer mx-0.5 shrink-0"
      style={{
        background: active ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        fontWeight: active ? 700 : 500,
      }}
      aria-current={active ? 'page' : undefined}
    >
      <span className="text-sm">{tab.icon}</span>
      <span>{tab.label}</span>
    </button>
  );

  return (
    <nav
      className="sticky top-0 z-[100] flex items-center border-b"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      data-testid={TEST_IDS.nav.tabBar}
    >
      {/* Branding */}
      <div
        className="flex items-center gap-2 px-4 py-2 shrink-0 border-r"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-lg" role="img" aria-label="shield">🛡️</span>
        <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
          KYC Console
        </span>
      </div>

      {/* Scrollable tabs */}
      <div className="flex items-center overflow-x-auto flex-1 px-1 pr-14">
        {inlineTabs.map((tab) => tabButton(tab, tab.id === activeTab))}

        {/* "More" grouping for Tier 3 depth */}
        {moreTabs.length > 0 && (
          <div ref={moreRef} style={{ position: 'relative' }} className="shrink-0 mx-0.5">
            <button
              onClick={() => setMoreOpen((o) => !o)}
              data-testid="nav.more"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-all cursor-pointer"
              style={{
                background: activeInMore ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: activeInMore ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: activeInMore ? 700 : 500,
              }}
            >
              <span className="text-sm">⋯</span>
              <span>More</span>
              <span style={{ fontSize: '9px' }}>{moreOpen ? '▲' : '▼'}</span>
            </button>
            {moreOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: '4px', minWidth: '200px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 200, padding: '4px',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', padding: '6px 10px 4px' }}>
                  Advanced / Depth
                </div>
                {moreTabs.map((tab) => {
                  const active = tab.id === activeTab;
                  return (
                    <button
                      key={tab.id}
                      role="menuitem"
                      onClick={() => { onTabChange(tab.id); setMoreOpen(false); }}
                      data-testid={TEST_IDS.nav.tab(tab.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer text-left"
                      style={{
                        background: active ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        fontWeight: active ? 700 : 500,
                        border: 'none',
                      }}
                    >
                      <span className="text-sm">{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
