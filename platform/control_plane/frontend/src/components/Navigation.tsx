import { Link, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function Navigation() {
  const location = useLocation();
  const { signOut, changePassword, user } = useAuth();
  const [appsOpen, setAppsOpen] = useState(false);
  const [obsOpen, setObsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const obsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => location.pathname.startsWith(path);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAppsOpen(false);
      }
      if (obsRef.current && !obsRef.current.contains(e.target as Node)) {
        setObsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    setPwdLoading(true);
    try {
      await changePassword(oldPwd, newPwd);
      setPwdSuccess('Password changed successfully.');
      setOldPwd('');
      setNewPwd('');
      setTimeout(() => { setChangePwdOpen(false); setPwdSuccess(''); }, 1500);
    } catch (err: any) {
      setPwdError(err.message || 'Failed to change password');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <nav className="sticky top-0 z-40 bg-transparent backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-600">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-slate-900 leading-tight tracking-tight">Agentic Value Accelerator</div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            <Link to="/" className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 ${isActive('/') && location.pathname === '/' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-600 hover:text-white hover:bg-blue-500 hover:shadow-md'}`}>
              Home
            </Link>

            <Link to="/accelerator-guide" className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 ${isActive('/accelerator-guide') ? 'bg-blue-500 text-white shadow-md' : 'text-slate-600 hover:text-white hover:bg-blue-500 hover:shadow-md'}`}>
              Guidance
            </Link>

            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setAppsOpen(!appsOpen)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 inline-flex items-center gap-1.5 ${
                  isActive('/applications') ? 'bg-blue-500 text-white shadow-md' : 'text-slate-600 hover:text-white hover:bg-blue-500 hover:shadow-md'
                }`}
              >
                Applications
                <svg className={`w-3.5 h-3.5 transition-transform duration-150 ${appsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {appsOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-72 bg-white rounded-xl border border-slate-200 py-2 z-50 animate-fade-in-scale" style={{ animationDuration: '0.12s', boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
                  <Link to="/applications/fsi-foundry" onClick={() => setAppsOpen(false)}
                    className="flex items-center px-3 py-3 hover:bg-blue-500 hover:text-white hover:scale-105 transition-all duration-200 rounded-lg mx-1.5 hover:shadow-md group">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-50 mr-3 group-hover:bg-white transition-colors">
                      <svg className="w-4.5 h-4.5 text-blue-600 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800 group-hover:text-white transition-colors">FSI Foundry</div>
                      <div className="text-xs text-slate-400 group-hover:text-blue-100 transition-colors">34 multi-agent use cases</div>
                    </div>
                  </Link>
                  <Link to="/applications/app-factory" onClick={() => setAppsOpen(false)}
                    className="flex items-center px-3 py-3 hover:bg-blue-500 hover:text-white hover:scale-105 transition-all duration-200 rounded-lg mx-1.5 hover:shadow-md group">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-rose-50 mr-3 group-hover:bg-white transition-colors">
                      <svg className="w-4.5 h-4.5 text-rose-600 group-hover:text-rose-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 001.591 1.591L19 14.5m-9.25 0v5.25m4.5-5.25v5.25M3 21h18" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800 group-hover:text-white transition-colors">App Factory</div>
                      <div className="text-xs text-slate-400 group-hover:text-blue-100 transition-colors">Describe and generate new apps</div>
                    </div>
                  </Link>
                  <Link to="/applications/templates" onClick={() => setAppsOpen(false)}
                    className="flex items-center px-3 py-3 hover:bg-blue-500 hover:text-white hover:scale-105 transition-all duration-200 rounded-lg mx-1.5 hover:shadow-md group">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-50 mr-3 group-hover:bg-white transition-colors">
                      <svg className="w-4.5 h-4.5 text-amber-600 group-hover:text-amber-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800 group-hover:text-white transition-colors">Templates</div>
                      <div className="text-xs text-slate-400 group-hover:text-blue-100 transition-colors">Scaffolding for custom agents</div>
                    </div>
                  </Link>
                </div>
              )}
            </div>

            <div className="relative" ref={obsRef}>
              <button
                onClick={() => setObsOpen(!obsOpen)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 inline-flex items-center gap-1.5 ${
                  isActive('/observability') ? 'bg-blue-500 text-white shadow-md' : 'text-slate-600 hover:text-white hover:bg-blue-500 hover:shadow-md'
                }`}
              >
                Observability
                <svg className={`w-3.5 h-3.5 transition-transform duration-150 ${obsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {obsOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-72 bg-white rounded-xl border border-slate-200 py-2 z-50 animate-fade-in-scale" style={{ animationDuration: '0.12s', boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
                  <Link to="/observability?tab=agent-safety" onClick={() => setObsOpen(false)}
                    className="flex items-center px-3 py-3 hover:bg-blue-500 hover:text-white hover:scale-105 transition-all duration-200 rounded-lg mx-1.5 hover:shadow-md group">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 mr-3 group-hover:bg-white transition-colors">
                      <svg className="w-4.5 h-4.5 text-red-600 group-hover:text-red-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800 group-hover:text-white transition-colors">Agent Safety</div>
                      <div className="text-xs text-slate-400 group-hover:text-blue-100 transition-colors">Guardrails and anomaly detection</div>
                    </div>
                  </Link>
                  <Link to="/observability?tab=langfuse" onClick={() => setObsOpen(false)}
                    className="flex items-center px-3 py-3 hover:bg-blue-500 hover:text-white hover:scale-105 transition-all duration-200 rounded-lg mx-1.5 hover:shadow-md group">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-violet-50 mr-3 group-hover:bg-white transition-colors">
                      <svg className="w-4.5 h-4.5 text-violet-600 group-hover:text-violet-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-1.5M12 12.75l3 1.5M12 12.75V18" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800 group-hover:text-white transition-colors">Langfuse</div>
                      <div className="text-xs text-slate-400 group-hover:text-blue-100 transition-colors">Tracing, evaluation, and analytics</div>
                    </div>
                  </Link>
                </div>
              )}
            </div>
            <Link to="/deployments" className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 ${isActive('/deployments') ? 'bg-blue-500 text-white shadow-md' : 'text-slate-600 hover:text-white hover:bg-blue-500 hover:shadow-md'}`}>
              Deployments
            </Link>
            <Link to="/docs" className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 ${isActive('/docs') ? 'bg-blue-500 text-white shadow-md' : 'text-slate-600 hover:text-white hover:bg-blue-500 hover:shadow-md'}`}>
              Documentation
            </Link>
            {user && (
              <div className="relative ml-2" ref={profileRef}>
                <button onClick={() => setProfileOpen(!profileOpen)} className="w-9 h-9 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 transition-colors">
                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </button>
                {profileOpen && !changePwdOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl border border-slate-200 py-1.5 z-50" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
                    <button onClick={() => { setChangePwdOpen(true); setPwdError(''); setPwdSuccess(''); }} className="w-full flex items-center px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors gap-2.5">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                      Change Password
                    </button>
                    <button onClick={signOut} className="w-full flex items-center px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors gap-2.5">
                      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                )}
                {profileOpen && changePwdOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-72 bg-white rounded-xl border border-slate-200 p-4 z-50" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-slate-800">Change Password</span>
                      <button onClick={() => setChangePwdOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    {pwdError && <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{pwdError}</div>}
                    {pwdSuccess && <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">{pwdSuccess}</div>}
                    <form onSubmit={handleChangePassword} className="space-y-2.5">
                      <input type="password" placeholder="Current password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} required className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      <input type="password" placeholder="New password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      <button type="submit" disabled={pwdLoading} className="w-full py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {pwdLoading ? 'Updating...' : 'Update Password'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white">
          <div className="max-w-7xl mx-auto px-6 py-4 space-y-1">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/') && location.pathname === '/'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              Home
            </Link>

            <Link
              to="/accelerator-guide"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/accelerator-guide') ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              Guidance
            </Link>

            <div className="py-2">
              <div className="px-4 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">Applications</div>
              <Link
                to="/applications/fsi-foundry"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
              >
                FSI Foundry
              </Link>
              <Link
                to="/applications/app-factory"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
              >
                App Factory
              </Link>
              <Link
                to="/applications/templates"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Templates
              </Link>
            </div>

            <div className="py-2">
              <div className="px-4 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">Observability</div>
              <Link
                to="/observability?tab=agent-safety"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Agent Safety
              </Link>
              <Link
                to="/observability?tab=langfuse"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Langfuse
              </Link>
            </div>

            <Link
              to="/deployments"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/deployments') ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              Deployments
            </Link>

            <Link
              to="/docs"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/docs') ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              Documentation
            </Link>

            {user && (
              <div className="pt-4 border-t border-slate-100 space-y-1">
                <button
                  onClick={() => {
                    setChangePwdOpen(true);
                    setPwdError('');
                    setPwdSuccess('');
                  }}
                  className="w-full flex items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors gap-2"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  Change Password
                </button>
                <button
                  onClick={() => {
                    signOut();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors gap-2"
                >
                  <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>

          {/* Change password modal for mobile */}
          {changePwdOpen && (
            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-800">Change Password</span>
                <button onClick={() => setChangePwdOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {pwdError && (
                <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{pwdError}</div>
              )}
              {pwdSuccess && (
                <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">{pwdSuccess}</div>
              )}
              <form onSubmit={handleChangePassword} className="space-y-2.5">
                <input
                  type="password"
                  placeholder="Current password"
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                />
                <input
                  type="password"
                  placeholder="New password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                />
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="w-full py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {pwdLoading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
