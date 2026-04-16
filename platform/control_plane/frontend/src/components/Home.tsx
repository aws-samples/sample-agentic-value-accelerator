import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col items-center justify-center overflow-hidden px-6 py-4">
      {/* Hero */}
      <div className="text-center animate-fade-in flex-shrink-0 mb-6">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-1.5" style={{ backgroundImage: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 40%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent', lineHeight: '1.15' }}>Agentic Value Accelerator</h1>
        <p className="text-sm md:text-base text-slate-500">From strategy to execution — build, deploy, and manage AI agents for financial services on AWS.</p>
      </div>

      {/* 2x2 Quadrant Grid */}
      <div className="grid grid-cols-5 gap-5 w-full max-w-6xl animate-fade-in stagger-1" style={{ gridTemplateRows: 'auto auto' }}>

        {/* ── Q1: PLAN ── */}
        <div className="col-span-2 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2.5 mb-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
            </div>
            <h2 className="text-lg font-bold tracking-tight" style={{ backgroundImage: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 40%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>Plan</h2>
          </div>
          <div onClick={() => navigate('/accelerator-guide')}
            className="group relative bg-white/70 backdrop-blur-sm rounded-xl home-card cursor-pointer flex-1 flex flex-col overflow-hidden">
            {/* Strategy hero image */}
            <div className="relative flex-1 overflow-hidden rounded-t-xl">
              <img src="/images/strategy-hero.png" alt="Strategy" className="absolute inset-0 w-full h-full object-cover" />
            </div>
            {/* Content */}
            <div className="p-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-semibold text-slate-900 group-hover:text-indigo-900 transition-colors">Guidance</h3>
                <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">8-step discovery framework to identify and prioritize agentic AI opportunities.</p>
            </div>
          </div>
        </div>

        {/* ── Q2: BUILD ── */}
        <div className="col-span-3 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2.5 mb-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg>
            </div>
            <h2 className="text-lg font-bold tracking-tight" style={{ backgroundImage: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 40%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>Build</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 flex-1">
            <div onClick={() => navigate('/applications/fsi-foundry')}
              className="group bg-white/70 backdrop-blur-sm rounded-xl home-card cursor-pointer flex flex-col overflow-hidden">
              <div className="h-16 relative bg-gradient-to-br from-blue-600 to-indigo-700 overflow-hidden flex-shrink-0">
                <img src="/images/foundry-hero.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-lighten" />
                <div className="absolute top-2.5 left-3">
                  <span className="text-[9px] font-bold text-white/90 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full">34 use cases</span>
                </div>
              </div>
              <div className="p-3.5 flex flex-col flex-1">
                <h3 className="text-base font-semibold text-slate-900 mb-0.5 group-hover:text-blue-900 transition-colors">FSI Foundry</h3>
                <p className="text-xs text-slate-500 leading-relaxed flex-1">Production-ready multi-agent systems across banking, risk, capital markets, insurance, and operations.</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['Banking', 'Risk', 'Markets', 'Insurance', 'Ops'].map(t => (
                    <span key={t} className="text-[8px] font-medium text-blue-500/80 bg-blue-50 px-1.5 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            </div>

            <div onClick={() => navigate('/applications/templates')}
              className="group bg-white/70 backdrop-blur-sm rounded-xl home-card cursor-pointer flex flex-col overflow-hidden">
              <div className="h-16 relative bg-gradient-to-br from-violet-600 to-purple-700 overflow-hidden flex-shrink-0">
                <img src="/images/refimpl-hero.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-lighten" />
                <div className="absolute top-2.5 left-3">
                  <span className="text-[9px] font-bold text-white/90 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full">8 templates</span>
                </div>
              </div>
              <div className="p-3.5 flex flex-col flex-1">
                <h3 className="text-base font-semibold text-slate-900 mb-0.5 group-hover:text-violet-900 transition-colors">Templates</h3>
                <p className="text-xs text-slate-500 leading-relaxed flex-1">Scaffold agent projects with Terraform, CDK, or CloudFormation — IaC, agent code, and deployment scripts included.</p>
                <div className="flex gap-1 mt-1.5">
                  {['Terraform', 'CDK', 'CFN'].map(t => (
                    <span key={t} className="text-[8px] font-medium text-violet-500/80 bg-violet-50 px-1.5 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            </div>

            <div onClick={() => navigate('/applications/app-factory')}
              className="col-span-2 group bg-white/70 backdrop-blur-sm rounded-xl home-card cursor-pointer p-3.5 flex flex-col">
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-slate-100 transition-colors">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 001.591 1.591L19 14.5" /></svg>
                </div>
                <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full uppercase">Soon</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-0.5 group-hover:text-slate-700 transition-colors">App Factory</h3>
              <p className="text-xs text-slate-500 leading-relaxed flex-1">Describe your use case in natural language and generate a complete agent application blueprint.</p>
            </div>
          </div>
        </div>

        {/* ── Q3: SECURE ── */}
        <div className="col-span-2 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2.5 mb-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
            </div>
            <h2 className="text-lg font-bold tracking-tight" style={{ backgroundImage: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 40%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>Secure</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 flex-1">
            <div onClick={() => navigate('/secure/guardrails')}
              className="group relative bg-white/70 backdrop-blur-sm rounded-xl home-card cursor-pointer p-4 flex flex-col overflow-hidden">
              <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, #f43f5e, transparent 70%)' }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center group-hover:bg-rose-100 transition-colors">
                  <svg className="w-4.5 h-4.5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                </div>
                <span className="text-[8px] font-bold text-rose-600/70 bg-rose-50 px-1.5 py-0.5 rounded-full">Coming Soon</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1 group-hover:text-rose-900 transition-colors">Guardrails</h3>
              <p className="text-sm text-slate-500 leading-relaxed flex-1">Content filtering, PII detection, and toxicity monitoring for deployed agents.</p>
            </div>
            <div onClick={() => navigate('/secure/policy')}
              className="group relative bg-white/70 backdrop-blur-sm rounded-xl home-card cursor-pointer p-4 flex flex-col overflow-hidden">
              <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, #ef4444, transparent 70%)' }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                  <svg className="w-4.5 h-4.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                </div>
                <span className="text-[8px] font-bold text-red-600/70 bg-red-50 px-1.5 py-0.5 rounded-full">Coming Soon</span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1 group-hover:text-red-900 transition-colors">Policy</h3>
              <p className="text-sm text-slate-500 leading-relaxed flex-1">Governance frameworks and compliance policy management.</p>
            </div>
          </div>
        </div>

        {/* ── Q4: OPERATE ── */}
        <div className="col-span-3 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2.5 mb-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3" /></svg>
            </div>
            <h2 className="text-lg font-bold tracking-tight" style={{ backgroundImage: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 40%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }}>Operate</h2>
          </div>
          <div className="grid grid-cols-3 gap-3 flex-1">
            <div onClick={() => navigate('/deployments')}
              className="group relative bg-white/70 backdrop-blur-sm rounded-xl home-card cursor-pointer p-3.5 flex flex-col overflow-hidden">
              <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, #10b981, transparent 70%)' }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7" /></svg>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[9px] font-medium text-emerald-600">Live</span>
                </div>
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1 group-hover:text-emerald-900 transition-colors">Deployments</h3>
              <p className="text-sm text-slate-500 leading-relaxed flex-1">CI/CD pipeline with build logs and visibility.</p>
            </div>

            <div onClick={() => navigate('/deployments')}
              className="group relative bg-white/70 backdrop-blur-sm rounded-xl home-card cursor-pointer p-3.5 flex flex-col overflow-hidden">
              <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, #f59e0b, transparent 70%)' }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
                  <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-amber-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1 group-hover:text-amber-900 transition-colors">Testing</h3>
              <p className="text-sm text-slate-500 leading-relaxed flex-1">CLI, script, custom, or from-app testing for Foundry use cases.</p>
            </div>

            <div onClick={() => navigate('/observability')}
              className="group relative bg-white/70 backdrop-blur-sm rounded-xl home-card cursor-pointer p-3.5 flex flex-col overflow-hidden">
              <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, #8b5cf6, transparent 70%)' }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center group-hover:bg-violet-100 transition-colors">
                  <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" /></svg>
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1 group-hover:text-violet-900 transition-colors">Observability</h3>
              <p className="text-sm text-slate-500 leading-relaxed flex-1">Langfuse tracing for monitoring and evaluation.</p>
            </div>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="text-center mt-8 flex-shrink-0">
        <p className="text-slate-400 text-[10px] flex items-center justify-center gap-1.5">
          Made with
          <svg className="w-3 h-3 text-red-400 animate-heartbeat" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 20 20">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
          </svg>
          by FSI PACE Prototyping Team
        </p>
      </div>
    </div>
  );
}
