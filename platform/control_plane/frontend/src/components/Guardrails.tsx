import { Link } from 'react-router-dom';

export default function Guardrails() {
  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8 animate-fade-in">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">&larr; Back to Home</Link>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">Guardrails</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">Content filtering, PII detection, toxicity monitoring, and safety controls for AI agents in production.</p>
        </div>

        <div className="card bg-rose-50/50 border-rose-200/60 mb-6 animate-fade-in stagger-1">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
            </div>
            <div>
              <p className="text-sm text-rose-900 font-semibold">Coming Soon</p>
              <p className="text-sm text-rose-700/80 mt-1">Guardrails management is under active development. This module will provide centralized configuration for content filtering, PII detection and redaction, toxicity monitoring, and custom safety rules across all deployed agents.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-fade-in stagger-2">
          <div className="card">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Content Filtering</h3>
            <p className="text-sm text-slate-500">Topic boundaries, harmful content detection, and input/output filtering for agent conversations.</p>
          </div>
          <div className="card">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">PII Detection & Redaction</h3>
            <p className="text-sm text-slate-500">Automatic detection and masking of personally identifiable information in agent interactions.</p>
          </div>
          <div className="card">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Toxicity Monitoring</h3>
            <p className="text-sm text-slate-500">Real-time detection and alerting for toxic, biased, or inappropriate content in agent responses.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
