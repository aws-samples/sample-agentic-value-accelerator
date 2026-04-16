import { Link, useLocation } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useUser } from '../contexts/UserContext';

export default function Sidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { user: currentUser } = useUser();
  const [profileOpen, setProfileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [appsDropdownOpen, setAppsDropdownOpen] = useState(false);
  const [obsDropdownOpen, setObsDropdownOpen] = useState(false);
  const [appsPosition, setAppsPosition] = useState({ top: 0 });
  const [obsPosition, setObsPosition] = useState({ top: 0 });
  const profileRef = useRef<HTMLDivElement>(null);
  const appsRef = useRef<HTMLDivElement>(null);
  const obsRef = useRef<HTMLDivElement>(null);
  const appsIconRef = useRef<HTMLDivElement>(null);
  const obsIconRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => location.pathname === path;
  const isActivePrefix = (path: string) => location.pathname.startsWith(path);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (appsRef.current && !appsRef.current.contains(e.target as Node)) {
        setAppsDropdownOpen(false);
      }
      if (obsRef.current && !obsRef.current.contains(e.target as Node)) {
        setObsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (appsDropdownOpen && appsIconRef.current) {
      const rect = appsIconRef.current.getBoundingClientRect();
      setAppsPosition({ top: rect.top });
    }
  }, [appsDropdownOpen]);

  useEffect(() => {
    if (obsDropdownOpen && obsIconRef.current) {
      const rect = obsIconRef.current.getBoundingClientRect();
      setObsPosition({ top: rect.top });
    }
  }, [obsDropdownOpen]);


  const navLink = (to: string, label: string, icon: string, active: boolean) => (
    <Link to={to} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 group ${active ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/60 hover:shadow-sm'}`} title={isCollapsed ? label : ''}>
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

  const sectionHeader = (label: string, icon: string, activePrefix: string, onClick?: () => void, dropdownRef?: React.RefObject<HTMLDivElement | null>, iconRef?: React.RefObject<HTMLDivElement | null>) => {
    const isActiveSectionPrefix = isActivePrefix(activePrefix);
    const content = (
      <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isActiveSectionPrefix ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-700'} ${isCollapsed ? 'hover:scale-105 hover:bg-slate-100/60 cursor-pointer' : ''}`} title={isCollapsed ? label : ''}>
        <svg className={`w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110 ${isActiveSectionPrefix ? 'text-blue-600' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        {!isCollapsed && <span className="truncate">{label}</span>}
      </div>
    );

    if (isCollapsed && onClick) {
      return (
        <div className="relative group" ref={dropdownRef}>
          <div onClick={onClick} ref={iconRef}>
            {content}
          </div>
        </div>
      );
    }
    return content;
  };

  return (
    <>
    <aside className={`flex-shrink-0 h-screen sticky top-0 flex flex-col border-r border-slate-200/40 z-10 transition-all duration-300 relative ${isCollapsed ? 'w-16' : 'w-60'}`} style={{
      background: 'linear-gradient(180deg, rgba(239,246,255,0.95) 0%, rgba(238,242,255,0.9) 40%, rgba(245,243,255,0.9) 70%, rgba(252,244,255,0.85) 100%)',
    }}>
      {/* Collapse button - integrated into sidebar edge, moves down when collapsed */}
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
          {navLink('/accelerator-guide', 'Guidance', 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18', isActive('/accelerator-guide') || isActive('/strategy'))}
        </div>

        <div className="pt-2">
          {!isCollapsed && <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Build</div>}
          <div className="relative" ref={appsRef}>
            {sectionHeader('Applications', 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z', '/applications', isCollapsed ? () => setAppsDropdownOpen(!appsDropdownOpen) : undefined, appsRef, appsIconRef)}
            {!isCollapsed && (
              <div className="mt-0.5 space-y-0.5">
                {subLink('/applications/fsi-foundry', 'FSI Foundry', isActive('/applications/fsi-foundry'))}
                {subLink('/applications/reference-implementations', 'Reference Apps', isActive('/applications/reference-implementations'))}
                {subLink('/applications/templates', 'Templates', isActive('/applications/templates'))}
                {subLink('/applications/app-factory', 'App Factory', isActive('/applications/app-factory'))}
              </div>
            )}
          </div>
        </div>

        <div className="pt-2">
          {!isCollapsed && <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Secure</div>}
          {navLink('/secure/guardrails', 'Guardrails', 'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z', isActive('/secure/guardrails'))}
          {navLink('/secure/policy', 'Policy', 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z', isActive('/secure/policy'))}
        </div>

        <div className="pt-2">
          {!isCollapsed && <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Operate</div>}
          {navLink('/deployments', 'Deployments', 'M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7', isActivePrefix('/deployments'))}
          <div className="relative" ref={obsRef}>
            {sectionHeader('Observability', 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z', '/observability', isCollapsed ? () => setObsDropdownOpen(!obsDropdownOpen) : undefined, obsRef, obsIconRef)}
            {!isCollapsed && (
              <div className="mt-0.5 space-y-0.5">
                {subLink('/observability?tab=agent-safety', 'Agent Safety', location.pathname === '/observability' && location.search.includes('agent-safety'))}
                {subLink('/observability?tab=langfuse', 'Langfuse', location.search.includes('langfuse'))}
              </div>
            )}
          </div>
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

    {/* Horizontal expansion bars for collapsed sidebar */}
    {isCollapsed && appsDropdownOpen && (
      <div
        className="fixed left-16 z-30 rounded-r-xl border border-slate-200/40 shadow-lg transition-all duration-300 animate-slide-in-right"
        style={{
          top: `${appsPosition.top}px`,
          background: 'linear-gradient(90deg, rgba(239,246,255,0.98) 0%, rgba(238,242,255,0.95) 50%, rgba(245,243,255,0.95) 100%)',
          backdropFilter: 'blur(10px)',
        }}
        ref={appsRef}
      >
        <div className="flex items-center gap-1 px-3 py-2">
          <Link to="/applications/fsi-foundry" onClick={() => setAppsDropdownOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-blue-500 hover:text-white rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-md whitespace-nowrap">
            FSI Foundry
          </Link>
          <Link to="/applications/reference-implementations" onClick={() => setAppsDropdownOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-blue-500 hover:text-white rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-md whitespace-nowrap">
            Reference Apps
          </Link>
          <Link to="/applications/templates" onClick={() => setAppsDropdownOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-blue-500 hover:text-white rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-md whitespace-nowrap">
            Templates
          </Link>
          <Link to="/applications/app-factory" onClick={() => setAppsDropdownOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-blue-500 hover:text-white rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-md whitespace-nowrap">
            App Factory
          </Link>
        </div>
      </div>
    )}

    {isCollapsed && obsDropdownOpen && (
      <div
        className="fixed left-16 z-30 rounded-r-xl border border-slate-200/40 shadow-lg transition-all duration-300 animate-slide-in-right"
        style={{
          top: `${obsPosition.top}px`,
          background: 'linear-gradient(90deg, rgba(239,246,255,0.98) 0%, rgba(238,242,255,0.95) 50%, rgba(245,243,255,0.95) 100%)',
          backdropFilter: 'blur(10px)',
        }}
        ref={obsRef}
      >
        <div className="flex items-center gap-1 px-3 py-2">
          <Link to="/observability?tab=agent-safety" onClick={() => setObsDropdownOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-blue-500 hover:text-white rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-md whitespace-nowrap">
            Agent Safety
          </Link>
          <Link to="/observability?tab=langfuse" onClick={() => setObsDropdownOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-blue-500 hover:text-white rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-md whitespace-nowrap">
            Langfuse
          </Link>
        </div>
      </div>
    )}
    </>
  );
}
