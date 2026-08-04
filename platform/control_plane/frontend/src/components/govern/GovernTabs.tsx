/**
 * GovernTabs — Reusable tabbed interface component for the Govern module.
 *
 * Provides consistent tab styling, accessibility, and optional keyboard navigation
 * across all Govern pages (RiskManagement, ModelManagement, ComplianceCenter, AgentRegistry, etc.)
 *
 * Features:
 * - Consistent visual style (rounded, hover effects, active highlight)
 * - Full ARIA support for accessibility
 * - Optional keyboard navigation (arrow keys, Home/End)
 * - Optional count badges on tabs
 * - Optional icon support
 */

import type { ReactNode, KeyboardEvent } from 'react';
import { useCallback } from 'react';

export interface GovernTab {
  /** Unique identifier for the tab */
  id: string;
  /** Display label */
  label: string;
  /** Optional count to show as badge */
  count?: number;
  /** Optional custom badge element (takes precedence over count) */
  badge?: ReactNode;
  /** Optional icon element to show before label */
  icon?: ReactNode;
  /** Optional description (for tooltip or future use) */
  description?: string;
}

export interface GovernTabsProps {
  /** Array of tab definitions */
  tabs: GovernTab[];
  /** Currently active tab id */
  activeTab: string;
  /** Callback when tab changes */
  onTabChange: (tabId: string) => void;
  /** Accessible label for the tab list */
  ariaLabel?: string;
  /** Enable keyboard navigation (arrow keys, Home/End) */
  enableKeyboardNav?: boolean;
  /** Optional className to add to the container */
  className?: string;
  /** Tab panel ID prefix for aria-controls (default: 'tabpanel') */
  tabPanelPrefix?: string;
}

/**
 * GovernTabs - A reusable tab navigation component with consistent styling
 *
 * @example Basic usage
 * ```tsx
 * const TABS = [
 *   { id: 'dashboard', label: 'Dashboard' },
 *   { id: 'register', label: 'Risk Register' },
 * ];
 *
 * <GovernTabs
 *   tabs={TABS}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 *   ariaLabel="Risk Management sections"
 * />
 * ```
 *
 * @example With counts and keyboard navigation
 * ```tsx
 * const TABS = [
 *   { id: 'agents', label: 'Agents', count: 12 },
 *   { id: 'tools', label: 'Tools', count: 24 },
 * ];
 *
 * <GovernTabs
 *   tabs={TABS}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 *   enableKeyboardNav
 * />
 * ```
 *
 * @example With icons
 * ```tsx
 * const TABS = [
 *   { id: 'frameworks', label: 'Framework Checklists', icon: <Icon name="document-check" /> },
 *   { id: 'program', label: 'Governance Program', icon: <Icon name="wrench-screwdriver" /> },
 * ];
 *
 * <GovernTabs
 *   tabs={TABS}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 * />
 * ```
 */
export default function GovernTabs({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel = 'Section tabs',
  enableKeyboardNav = false,
  className = '',
  tabPanelPrefix = 'tabpanel',
}: GovernTabsProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (!enableKeyboardNav) return;

      const tabIds = tabs.map(t => t.id);
      const currentIndex = tabIds.indexOf(activeTab);

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          onTabChange(tabIds[(currentIndex + 1) % tabIds.length]);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onTabChange(tabIds[(currentIndex - 1 + tabIds.length) % tabIds.length]);
          break;
        case 'Home':
          e.preventDefault();
          onTabChange(tabIds[0]);
          break;
        case 'End':
          e.preventDefault();
          onTabChange(tabIds[tabIds.length - 1]);
          break;
      }
    },
    [tabs, activeTab, onTabChange, enableKeyboardNav]
  );

  return (
    <div
      className={`flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`${tabPanelPrefix}-${tab.id}`}
            tabIndex={enableKeyboardNav ? (isActive ? 0 : -1) : undefined}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={enableKeyboardNav ? handleKeyDown : undefined}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              isActive
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
            {tab.label}
            {tab.badge !== undefined ? (
              tab.badge
            ) : tab.count !== undefined ? (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-slate-200/60 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * GovernTabPanel — Optional wrapper for tab panel content with proper ARIA attributes.
 *
 * @example
 * ```tsx
 * <GovernTabPanel id="dashboard" activeTab={activeTab}>
 *   <DashboardContent />
 * </GovernTabPanel>
 * ```
 */
export function GovernTabPanel({
  id,
  activeTab,
  children,
  className = '',
  tabPanelPrefix = 'tabpanel',
}: {
  id: string;
  activeTab: string;
  children: ReactNode;
  className?: string;
  tabPanelPrefix?: string;
}) {
  if (activeTab !== id) return null;

  return (
    <div
      id={`${tabPanelPrefix}-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
