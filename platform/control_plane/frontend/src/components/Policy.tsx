import { Link } from 'react-router-dom';

export default function Policy() {
  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8 animate-fade-in">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">&larr; Back to Home</Link>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">Policy</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">Governance frameworks, compliance policy management, and regulatory controls for AI agent deployments.</p>
        </div>

        <div className="card bg-red-50/50 border-red-200/60 mb-6 animate-fade-in stagger-1">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
            </div>
            <div>
              <p className="text-sm text-red-900 font-semibold">Coming Soon</p>
              <p className="text-sm text-red-700/80 mt-1">Policy management is under active development. This module will provide centralized governance for agent permissions, data access policies, regulatory compliance rules, and audit trails.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-fade-in stagger-2">
          <div className="card">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" /></svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Governance Frameworks</h3>
            <p className="text-sm text-slate-500">Define and enforce organizational standards for AI agent behavior, data handling, and decision-making boundaries.</p>
          </div>
          <div className="card">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Compliance Rules</h3>
            <p className="text-sm text-slate-500">Configurable compliance policies aligned with FSI regulations (SOX, GDPR, CCPA, MiFID II, Basel III).</p>
          </div>
          <div className="card">
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.888L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Audit Trail</h3>
            <p className="text-sm text-slate-500">Complete audit logging of agent actions, policy decisions, and compliance events for regulatory reporting.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
