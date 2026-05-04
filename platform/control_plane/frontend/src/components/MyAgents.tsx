import { Link } from 'react-router-dom';

export default function MyAgents() {
  // Empty state for now — backend wiring comes next
  const agents: Array<{ id: string; name: string; status: string; framework: string; model: string; updated_at: string }> = [];

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8 animate-fade-in">
          <Link to="/aaas/custom" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Custom Agents</Link>
          <div className="flex items-center justify-between mt-3">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">My Agents</h1>
              <p className="text-slate-500 mt-2 max-w-2xl">Custom agents you&rsquo;ve created and deployed on Bedrock AgentCore.</p>
            </div>
            <Link to="/aaas/custom/create" className="btn-primary text-sm inline-flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create Agent
            </Link>
          </div>
        </div>

        {agents.length === 0 ? (
          <div className="card text-center py-16 animate-fade-in stagger-1">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-1">No custom agents yet</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
              Create your first agent to get started. You&rsquo;ll pick a model, attach tools, and deploy to a managed Bedrock AgentCore runtime.
            </p>
            <Link to="/aaas/custom/create" className="btn-primary text-sm inline-flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create your first agent
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map(a => (
              <div key={a.id} className="card">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold text-slate-900">{a.name}</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">{a.status}</span>
                </div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  <div>Framework: {a.framework}</div>
                  <div>Model: {a.model}</div>
                  <div>Updated: {a.updated_at}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
