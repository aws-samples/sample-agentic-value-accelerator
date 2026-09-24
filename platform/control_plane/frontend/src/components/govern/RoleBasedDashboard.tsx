/**
 * RoleBasedDashboard — Role-specific governance views
 *
 * Similar to Microsoft Agent365's role-specific oversight feature.
 * Provides different dashboard views for different stakeholder personas.
 */

import { useState, createContext, useContext, type ReactNode } from 'react';
import { Icon } from './icons';

// ─── Role Definitions ────────────────────────────────────────────────────────

export type GovernanceRole =
  | 'executive'
  | 'security-leader'
  | 'compliance-officer'
  | 'finops-leader'
  | 'platform-engineer'
  | 'all';

interface RoleConfig {
  id: GovernanceRole;
  label: string;
  description: string;
  icon: string;
  color: string;
  priorityMetrics: string[];
  focusAreas: string[];
}

export const GOVERNANCE_ROLES: Record<GovernanceRole, RoleConfig> = {
  all: {
    id: 'all',
    label: 'All Views',
    description: 'Complete governance dashboard with all metrics',
    icon: 'squares-2x2',
    color: '#6366f1',
    priorityMetrics: ['all'],
    focusAreas: ['all'],
  },
  executive: {
    id: 'executive',
    label: 'Executive',
    description: 'Business impact, ROI, and strategic risk overview',
    icon: 'presentation-chart-line',
    color: '#8b5cf6',
    priorityMetrics: ['trustScore', 'roi', 'businessValue', 'strategicRisk'],
    focusAreas: ['Command Center', 'FinOps ROI', 'Risk Overview'],
  },
  'security-leader': {
    id: 'security-leader',
    label: 'Security Leader',
    description: 'Threat posture, vulnerabilities, and security incidents',
    icon: 'shield-check',
    color: '#ef4444',
    priorityMetrics: ['threats', 'vulnerabilities', 'incidents', 'shadowAI'],
    focusAreas: ['AI Safety', 'Shadow AI', 'Audit & Incidents', 'Path Jailing'],
  },
  'compliance-officer': {
    id: 'compliance-officer',
    label: 'Compliance Officer',
    description: 'Regulatory frameworks, attestations, and audit evidence',
    icon: 'clipboard-document-check',
    color: '#10b981',
    priorityMetrics: ['complianceScore', 'frameworkCoverage', 'attestations', 'gaps'],
    focusAreas: ['Compliance Center', 'Audit & Incidents', 'Data Governance'],
  },
  'finops-leader': {
    id: 'finops-leader',
    label: 'FinOps Leader',
    description: 'Cost management, budgets, and optimization opportunities',
    icon: 'currency-dollar',
    color: '#f59e0b',
    priorityMetrics: ['totalSpend', 'budgetVariance', 'costPerAgent', 'savings'],
    focusAreas: ['FinOps Dashboard', 'Cost Anomalies', 'Optimization'],
  },
  'platform-engineer': {
    id: 'platform-engineer',
    label: 'Platform Engineer',
    description: 'Agent health, performance metrics, and operational status',
    icon: 'server-stack',
    color: '#3b82f6',
    priorityMetrics: ['agentHealth', 'latency', 'errorRate', 'invocations'],
    focusAreas: ['Agent Registry', 'Fleet Overview', 'Model Management'],
  },
};

// ─── Context for Role-Based Filtering ────────────────────────────────────────

interface RoleContextValue {
  currentRole: GovernanceRole;
  setRole: (role: GovernanceRole) => void;
  roleConfig: RoleConfig;
  isMetricPriority: (metricId: string) => boolean;
  isFocusArea: (areaName: string) => boolean;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function useGovernanceRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    return {
      currentRole: 'all' as GovernanceRole,
      setRole: () => {},
      roleConfig: GOVERNANCE_ROLES.all,
      isMetricPriority: () => true,
      isFocusArea: () => true,
    };
  }
  return ctx;
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [currentRole, setCurrentRole] = useState<GovernanceRole>(() => {
    const saved = localStorage.getItem('govern-role');
    return (saved as GovernanceRole) || 'all';
  });

  const setRole = (role: GovernanceRole) => {
    setCurrentRole(role);
    localStorage.setItem('govern-role', role);
  };

  const roleConfig = GOVERNANCE_ROLES[currentRole];

  const isMetricPriority = (metricId: string) => {
    if (currentRole === 'all') return true;
    return roleConfig.priorityMetrics.includes(metricId) || roleConfig.priorityMetrics.includes('all');
  };

  const isFocusArea = (areaName: string) => {
    if (currentRole === 'all') return true;
    return roleConfig.focusAreas.some(fa =>
      areaName.toLowerCase().includes(fa.toLowerCase()) || fa === 'all'
    );
  };

  return (
    <RoleContext.Provider value={{ currentRole, setRole, roleConfig, isMetricPriority, isFocusArea }}>
      {children}
    </RoleContext.Provider>
  );
}

// ─── Role Switcher Component ─────────────────────────────────────────────────

interface RoleSwitcherProps {
  compact?: boolean;
}

export function RoleSwitcher({ compact = false }: RoleSwitcherProps) {
  const { currentRole, setRole, roleConfig } = useGovernanceRole();
  const [isOpen, setIsOpen] = useState(false);

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
          style={{
            backgroundColor: `${roleConfig.color}10`,
            borderColor: `${roleConfig.color}30`,
            color: roleConfig.color,
          }}
        >
          <Icon name={roleConfig.icon as any} className="w-4 h-4" />
          {roleConfig.label}
          <Icon name="chevron-down" className="w-3 h-3" />
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-white rounded-lg shadow-xl border border-slate-200 py-1">
              {Object.values(GOVERNANCE_ROLES).map(role => (
                <button
                  key={role.id}
                  onClick={() => { setRole(role.id); setIsOpen(false); }}
                  className={`w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors ${
                    currentRole === role.id ? 'bg-slate-50' : ''
                  }`}
                >
                  <Icon
                    name={role.icon as any}
                    className="w-5 h-5 mt-0.5"
                    style={{ color: role.color }}
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-900">{role.label}</div>
                    <div className="text-xs text-slate-500">{role.description}</div>
                  </div>
                  {currentRole === role.id && (
                    <Icon name="check" className="w-4 h-4 ml-auto text-emerald-500" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Dashboard View</h3>
          <p className="text-xs text-slate-500">Select your role to see prioritized metrics</p>
        </div>
        <span
          className="text-xs font-medium px-2 py-1 rounded-full"
          style={{ backgroundColor: `${roleConfig.color}15`, color: roleConfig.color }}
        >
          {roleConfig.label} View
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {Object.values(GOVERNANCE_ROLES).map(role => (
          <button
            key={role.id}
            onClick={() => setRole(role.id)}
            className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
              currentRole === role.id
                ? 'border-2 shadow-sm'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
            style={currentRole === role.id ? {
              borderColor: role.color,
              backgroundColor: `${role.color}08`,
            } : {}}
          >
            <Icon
              name={role.icon as any}
              className="w-5 h-5"
              style={{ color: currentRole === role.id ? role.color : '#64748b' }}
            />
            <span className={`text-xs font-medium ${
              currentRole === role.id ? '' : 'text-slate-600'
            }`} style={currentRole === role.id ? { color: role.color } : {}}>
              {role.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Role-Filtered Content Component ─────────────────────────────────────────

interface RoleFilteredProps {
  focusArea: string;
  children: ReactNode;
  hiddenWhenFiltered?: boolean;
}

export function RoleFiltered({ focusArea, children, hiddenWhenFiltered = false }: RoleFilteredProps) {
  const { isFocusArea } = useGovernanceRole();

  if (!isFocusArea(focusArea)) {
    if (hiddenWhenFiltered) return null;
    return (
      <div className="opacity-40 grayscale pointer-events-none">
        {children}
      </div>
    );
  }

  return <>{children}</>;
}

// ─── Role-Based KPI Highlight ────────────────────────────────────────────────

interface RoleKPIProps {
  metricId: string;
  children: ReactNode;
}

export function RoleKPI({ metricId, children }: RoleKPIProps) {
  const { isMetricPriority, roleConfig } = useGovernanceRole();
  const isPriority = isMetricPriority(metricId);

  return (
    // `ringColor` is not a valid CSS property (no-op at runtime); the ring
    // renders via the Tailwind `ring-2` class with its default ring color.
    <div className={`relative ${isPriority ? 'ring-2 ring-offset-2 rounded-xl' : ''}`}>
      {isPriority && (
        <span
          className="absolute -top-2 -right-2 text-[8px] font-bold px-1.5 py-0.5 rounded-full text-white"
          style={{ backgroundColor: roleConfig.color }}
        >
          PRIORITY
        </span>
      )}
      {children}
    </div>
  );
}

export default RoleSwitcher;
