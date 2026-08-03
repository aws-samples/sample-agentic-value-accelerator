import { Link, useLocation } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useUser } from '../contexts/UserContext';

type SectionKey = 'plan' | 'apps' | 'aaas' | 'capabilities' | 'secure' | 'observability' | 'govern';

export default function Sidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { user: currentUser } = useUser();
  const [profileOpen, setProfileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Collapsible state (expanded sidebar) — persisted to localStorage
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>(() => {
    try {
      const raw = localStorage.getItem('sidebar.expanded');
      if (raw) return { plan: true, apps: true, aaas: true, capabilities: true, secure: true, observability: true, govern: true, ...JSON.parse(raw) };
    } catch { /* noop */ }
    return { plan: true, apps: true, aaas: true, capabilities: true, secure: true, observability: true, govern: true };
  });
  useEffect(() => {
    try { localStorage.setItem('sidebar.expanded', JSON.stringify(expanded)); } catch { /* noop */ }
  }, [expanded]);

  // Flyout state for collapsed sidebar
  const [flyout, setFlyout] = useState<SectionKey | null>(null);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);
  const iconRefs = useRef<Record<SectionKey, HTMLDivElement | null>>({ plan: null, apps: null, aaas: null, capabilities: null, secure: null, observability: null, govern: null });
  const flyoutRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => location.pathname === path;
  const isActivePrefix = (path: string) => location.pathname.startsWith(path);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        setFlyout(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openFlyout = (key: SectionKey) => {
    const el = iconRefs.current[key];
    if (el) setFlyoutTop(el.getBoundingClientRect().top);
    setFlyout(flyout === key ? null : key);
  };

  const toggleSection = (key: SectionKey) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const navLink = (to: string, label: string, icon: string, active: boolean) => (
    <Link
      to={to}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 group ${active ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/60 hover:shadow-sm'}`}
      title={isCollapsed ? label : ''}
    >
      <svg className={`w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110 ${active ? 'text-blue-600' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      {!isCollapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  const subLink = (to: string, label: string, active: boolean) => (
    !isCollapsed && (
      <Link to={to} className={`block pl-9 pr-3 py-1.5 rounded-lg text-sm transition-all duration-200 hover:translate-x-1 ${active ? 'text-blue-700 font-medium bg-blue-50/60' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100/40'}`}>
        {label}
      </Link>
    )
  );

  const sectionHeader = (
    key: SectionKey,
    label: string,
    icon: string,
    activePrefix: string,
    linkTo: string
  ) => {
    const isActiveSection = isActivePrefix(activePrefix);
    const isExpanded = expanded[key];

    if (isCollapsed) {
      return (
        <div className="relative group">
          <div
            ref={(el) => { iconRefs.current[key] = el; }}
            onClick={() => openFlyout(key)}
            className={`flex items-center justify-center px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 hover:scale-105 ${isActiveSection ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-700 hover:bg-slate-100/60'}`}
            title={label}
          >
            <svg className={`w-4 h-4 ${isActiveSection ? 'text-blue-600' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex items-center rounded-lg transition-all duration-200 ${isActiveSection ? 'bg-blue-50 shadow-sm' : 'hover:bg-slate-100/60'}`}>
        <Link
          to={linkTo}
          className={`flex items-center gap-2.5 flex-1 min-w-0 px-3 py-2 text-sm font-medium transition-colors ${isActiveSection ? 'text-blue-700' : 'text-slate-700 hover:text-slate-900'}`}
        >
          <svg className={`w-4 h-4 flex-shrink-0 ${isActiveSection ? 'text-blue-600' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
          <span className="truncate">{label}</span>
        </Link>
        <button
          onClick={(e) => { e.preventDefault(); toggleSection(key); }}
          className="p-1.5 mr-1 rounded-md hover:bg-slate-200/60 transition-colors"
          aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
        >
          <svg className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  };

  // Flyout items per section (collapsed sidebar)
  const flyoutItems: Record<SectionKey, { to: string; label: string }[]> = {
    plan: [
      { to: '/maturity-assessment', label: 'Maturity Assessment' },
      { to: '/operating-model', label: 'Operating Model' },
      { to: '/use-cases', label: 'Use Cases' },
      { to: '/business-cases', label: 'Business Cases' },
      { to: '/organization-design', label: 'Organization Design' },
    ],
    apps: [
      { to: '/applications/fsi-foundry', label: 'FSI Foundry' },
      { to: '/applications/reference-implementations', label: 'Reference Apps' },
      { to: '/applications/templates', label: 'Templates' },
      { to: '/applications/app-factory', label: 'App Factory' },
      { to: '/applications/my-apps', label: 'My Apps' },
    ],
    aaas: [
      { to: '/aaas/aws-agents', label: 'AWS Frontier Agents' },
      { to: '/aaas/custom', label: 'Custom Agents' },
    ],
    capabilities: [
      { to: '/capabilities/tools', label: 'Tools' },
      { to: '/capabilities/knowledge', label: 'Knowledge' },
      { to: '/capabilities/prompts', label: 'Prompts' },
    ],
    secure: [
      { to: '/secure/guardrails', label: 'Guardrails' },
      { to: '/secure/policy', label: 'Policy' },
      { to: '/secure/llm-gateway', label: 'LLM Gateway' },
    ],
    observability: [
      { to: '/observability/langfuse', label: 'Langfuse' },
      { to: '/observability/agentcore', label: 'AgentCore' },
      { to: '/prompt-optimization', label: 'Prompt Optimization' },
    ],
    govern: [
      // Overview & Framework
      { to: '/govern/command-center', label: 'Command Center' },
      { to: '/govern/trust-stack', label: 'Trust Stack' },
      // Inventory & Assets
      { to: '/govern/fleet', label: 'Agentic Fleet' },
      { to: '/govern/agents', label: 'Agent Registry' },
      { to: '/govern/dev-tools', label: 'Agentic Coding' },
      { to: '/govern/multi-cloud', label: 'Multi-Cloud' },
      // Resources
      { to: '/govern/models', label: 'Model Management' },
      { to: '/govern/data', label: 'Data Governance' },
      // Risk & Compliance
      { to: '/govern/risk', label: 'Risk Management' },
      { to: '/govern/shadow-ai', label: 'Shadow AI' },
      { to: '/govern/safety', label: 'AI Safety' },
      { to: '/govern/compliance', label: 'Compliance' },
      // Operations
      { to: '/govern/finops', label: 'Cost & FinOps' },
      { to: '/govern/audit', label: 'Audit & Incidents' },
    ],
  };

  return (
    <>
      <aside className={`flex-shrink-0 h-screen sticky top-0 flex flex-col border-r border-slate-200/40 z-10 transition-all duration-300 relative ${isCollapsed ? 'w-16' : 'w-60'}`} style={{
        background: 'linear-gradient(180deg, rgba(239,246,255,0.95) 0%, rgba(238,242,255,0.9) 40%, rgba(245,243,255,0.9) 70%, rgba(252,244,255,0.85) 100%)',
      }}>
        {/* Collapse button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`absolute z-20 h-10 flex items-center justify-center group border-l border-slate-200/40 transition-all duration-300 ${isCollapsed ? 'top-20 -right-6 rounded-r-lg shadow-md' : 'top-5 right-0'}`}
          style={{
            width: '32px',
            background: isCollapsed
              ? 'linear-gradient(90deg, rgba(239,246,255,0.95) 0%, rgba(239,246,255,1) 100%)'
              : 'linear-gradient(90deg, rgba(229,239,255,0.5) 0%, rgba(239,246,255,0.95) 100%)',
            borderTopLeftRadius: isCollapsed ? '0' : '8px',
            borderBottomLeftRadius: isCollapsed ? '0' : '8px',
          }}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg className={`w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-all duration-300 ${isCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Logo */}
        <div className={`px-5 py-5 border-b border-slate-100 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-600">
              <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            {!isCollapsed && <div className="text-sm font-semibold text-slate-900 leading-tight tracking-tight">AVA</div>}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navLink('/', 'Home', 'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25', isActive('/'))}

          <div className="pt-2">
            {!isCollapsed && <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Plan</div>}
            {sectionHeader('plan', 'Plan', 'M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z', '/plan', '/plan')}
            {!isCollapsed && expanded.plan && (
              <div className="mt-0.5 space-y-0.5">
                {subLink('/maturity-assessment', 'Maturity Assessment', isActive('/maturity-assessment'))}
                {subLink('/operating-model', 'Operating Model', isActive('/operating-model'))}
                {subLink('/use-cases', 'Use Cases', isActive('/use-cases'))}
                {subLink('/business-cases', 'Business Cases', isActive('/business-cases'))}
                {subLink('/organization-design', 'Organization Design', isActive('/organization-design'))}
              </div>
            )}
          </div>

          <div className="pt-2">
            {!isCollapsed && <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Build</div>}

            {sectionHeader('apps', 'Applications', 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z', '/applications', '/applications')}
            {!isCollapsed && expanded.apps && (
              <div className="mt-0.5 space-y-0.5">
                {subLink('/applications/fsi-foundry', 'FSI Foundry', isActive('/applications/fsi-foundry'))}
                {subLink('/applications/reference-implementations', 'Reference Apps', isActive('/applications/reference-implementations'))}
                {subLink('/applications/templates', 'App Templates', isActive('/applications/templates'))}
                {subLink('/applications/app-factory', 'App Factory', isActive('/applications/app-factory'))}
                {subLink('/applications/my-apps', 'My Apps', isActive('/applications/my-apps'))}
              </div>
            )}

            <div className="mt-1">
              {sectionHeader('aaas', 'Agent-as-a-Service', 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.624L16.5 21.75l-.398-1.126a3.375 3.375 0 00-2.1-2.1L12.75 18.25l1.252-.398a3.375 3.375 0 002.1-2.1L16.5 14.75l.398 1.126a3.375 3.375 0 002.1 2.1l1.252.398-1.252.398a3.375 3.375 0 00-2.1 2.1z', '/aaas', '/aaas')}
              {!isCollapsed && expanded.aaas && (
                <div className="mt-0.5 space-y-0.5">
                  {subLink('/aaas/aws-agents', 'AWS Frontier Agents', isActivePrefix('/aaas/aws-agents'))}
                  {subLink('/aaas/custom', 'Custom Agents', isActivePrefix('/aaas/custom'))}
                </div>
              )}
            </div>

            <div className="mt-1">
              {sectionHeader('capabilities', 'Capabilities', 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085', '/capabilities', '/capabilities')}
              {!isCollapsed && expanded.capabilities && (
                <div className="mt-0.5 space-y-0.5">
                  {subLink('/capabilities/tools', 'Tools', isActivePrefix('/capabilities/tools'))}
                  {subLink('/capabilities/knowledge', 'Knowledge', isActivePrefix('/capabilities/knowledge'))}
                  {subLink('/capabilities/prompts', 'Prompts', isActivePrefix('/capabilities/prompts'))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-2">
            {!isCollapsed && <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Secure</div>}
            {sectionHeader('secure', 'Secure', 'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z', '/secure', '/secure')}
            {!isCollapsed && expanded.secure && (
              <div className="mt-0.5 space-y-0.5">
                {subLink('/secure/guardrails', 'Guardrails', isActivePrefix('/secure/guardrails'))}
                {subLink('/secure/policy', 'Policy', isActivePrefix('/secure/policy'))}
                {subLink('/secure/llm-gateway', 'LLM Gateway', isActivePrefix('/secure/llm-gateway'))}
              </div>
            )}
          </div>

          <div className="pt-2">
            {!isCollapsed && <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Operate</div>}
            {sectionHeader('observability', 'Observability', 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z', '/observability', '/observability')}
            {!isCollapsed && expanded.observability && (
              <div className="mt-0.5 space-y-0.5">
                {subLink('/observability/langfuse', 'Langfuse', isActive('/observability/langfuse'))}
                {subLink('/observability/agentcore', 'AgentCore', isActive('/observability/agentcore'))}
              </div>
            )}
            {navLink('/deployments', 'Deployments', 'M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7', isActivePrefix('/deployments'))}
          </div>

          <div className="pt-2">
            {!isCollapsed && <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Govern</div>}
            {sectionHeader('govern', 'Govern', 'M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z', '/govern', '/govern')}
            {!isCollapsed && expanded.govern && (
              <div className="mt-0.5 space-y-0.5">
                {/* Overview & Framework */}
                {subLink('/govern/command-center', 'Command Center', isActivePrefix('/govern/command-center'))}
                {subLink('/govern/trust-stack', 'Trust Stack', isActivePrefix('/govern/trust-stack'))}
                {/* Inventory & Assets */}
                {subLink('/govern/fleet', 'Agentic Fleet', isActivePrefix('/govern/fleet'))}
                {subLink('/govern/agents', 'Agent Registry', isActivePrefix('/govern/agents'))}
                {subLink('/govern/dev-tools', 'Agentic Coding', isActivePrefix('/govern/dev-tools'))}
                {subLink('/govern/multi-cloud', 'Multi-Cloud', isActivePrefix('/govern/multi-cloud'))}
                {/* Resources */}
                {subLink('/govern/models', 'Model Management', isActivePrefix('/govern/models'))}
                {subLink('/govern/data', 'Data Governance', isActivePrefix('/govern/data'))}
                {/* Risk & Compliance */}
                {subLink('/govern/risk', 'Risk Management', isActivePrefix('/govern/risk'))}
                {subLink('/govern/shadow-ai', 'Shadow AI', isActivePrefix('/govern/shadow-ai'))}
                {subLink('/govern/prompt-governance', 'Prompt Governance', isActivePrefix('/govern/prompt-governance'))}
                {subLink('/govern/safety', 'AI Safety', isActivePrefix('/govern/safety'))}
                {subLink('/govern/compliance', 'Compliance', isActivePrefix('/govern/compliance'))}
                {/* Operations */}
                {subLink('/govern/finops', 'Cost & FinOps', isActivePrefix('/govern/finops'))}
                {subLink('/govern/audit', 'Audit & Incidents', isActivePrefix('/govern/audit'))}
              </div>
            )}
          </div>

          <div className="pt-2">
            {!isCollapsed && <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Resources</div>}
            {navLink('/docs', 'Documentation', 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25', isActivePrefix('/docs'))}
          </div>
        </nav>

        {/* User section */}
        {user && (
          <div className="border-t border-slate-100 px-3 py-3" ref={profileRef}>
            <button onClick={() => setProfileOpen(!profileOpen)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100/60 transition-all duration-200 hover:scale-105 ${isCollapsed ? 'justify-center' : ''}`} title={isCollapsed ? 'Account' : ''}>
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              {!isCollapsed && <span className="text-sm text-slate-600 truncate flex-1 text-left">Account</span>}
            </button>

            {profileOpen && (
              <div className="mt-1 bg-white rounded-xl border border-slate-200 py-1.5 shadow-lg">
                {currentUser && (
                  <div className="px-4 py-2 border-b border-slate-100">
                    <div className="text-xs font-semibold text-slate-900">{currentUser.email}</div>
                    <div className="text-xs text-slate-500 capitalize mt-0.5">Role: {currentUser.role}</div>
                  </div>
                )}
                <button onClick={signOut}
                  className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 gap-2.5">
                  <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Flyout for collapsed sidebar */}
      {isCollapsed && flyout && (
        <div
          ref={flyoutRef}
          className="fixed left-16 z-30 rounded-r-xl border border-slate-200/40 shadow-lg transition-all duration-300 animate-slide-in-right"
          style={{
            top: `${flyoutTop}px`,
            background: 'linear-gradient(90deg, rgba(239,246,255,0.98) 0%, rgba(238,242,255,0.95) 50%, rgba(245,243,255,0.95) 100%)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div className="flex items-center gap-1 px-3 py-2">
            {flyoutItems[flyout].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setFlyout(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-blue-500 hover:text-white rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-md whitespace-nowrap"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
