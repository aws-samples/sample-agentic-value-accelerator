import { Link } from 'react-router-dom';

interface Action {
  id: string;
  path: string;
  name: string;
  description: string;
  category: string;
  categoryColor: 'blue' | 'teal';
  status: 'Coming Soon';
  features: string[];
  techStack: string[];
  cta: string;
}

const ACTIONS: Action[] = [
  {
    id: 'create',
    path: '/aaas/custom/create',
    name: 'Create an Agent',
    description: 'Build a custom autonomous agent on Bedrock AgentCore. Configure a model, system prompt, tools, memory, and guardrails in a 4-step wizard — then deploy to a managed runtime.',
    category: 'Design & Deploy',
    categoryColor: 'blue',
    status: 'Coming Soon',
    features: ['Model selection', 'Tool attachment', 'Memory & guardrails', 'Managed runtime'],
    techStack: ['AgentCore', 'Strands', 'LangGraph', 'Claude Sonnet 4.6', 'Claude Opus 4.7', 'Claude Haiku 4.5'],
    cta: 'Coming Soon',
  },
  {
    id: 'my-agents',
    path: '/aaas/custom/my-agents',
    name: 'My Agents',
    description: 'View, test, and manage the custom agents you\'ve deployed. Track status, inspect invocation logs, review metrics, and roll back versions from a single dashboard.',
    category: 'Manage & Monitor',
    categoryColor: 'teal',
    status: 'Coming Soon',
    features: ['Agent status', 'Invocation logs', 'Version rollback', 'Metrics dashboard'],
    techStack: ['CloudWatch', 'Langfuse', 'AgentCore Runtime'],
    cta: 'Coming Soon',
  },
];

const CATEGORY_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
};

export default function CustomAgentsCatalog() {
  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8 animate-fade-in">
          <Link to="/aaas" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Agent-as-a-Service</Link>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">Custom Agents</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Design, deploy, and operate your own autonomous agents on Bedrock AgentCore. Bring your domain expertise — we&rsquo;ll handle the runtime, observability, and guardrails.
          </p>
        </div>

        {/* How it works */}
        <div className="card bg-blue-50/50 border-blue-200/60 mb-8 animate-fade-in stagger-1">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-blue-900 font-semibold">How Custom Agents work</p>
              <p className="text-sm text-blue-700/80 mt-1">
                Use <strong>Create an Agent</strong> to configure a new agent end-to-end in a 4-step wizard (basics → model → tools → deploy). Once deployed, track it in <strong>My Agents</strong> alongside your other runtimes. Agents run on managed Bedrock AgentCore with Langfuse observability.
              </p>
            </div>
          </div>
        </div>

        {/* Action grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in stagger-2">
          {ACTIONS.map(action => (
            <div key={action.id} className="card hover:border-blue-200 transition-all flex flex-col group">
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs font-semibold px-3 py-1 rounded-lg border ${CATEGORY_STYLES[action.categoryColor]}`}>
                  {action.category}
                </span>
                <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
                  {action.status}
                </span>
              </div>

              <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-blue-700 transition-colors">{action.name}</h3>
              <p className="text-sm text-slate-500 mb-5 flex-1 leading-relaxed">{action.description}</p>

              <div className="mb-4">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Features</h4>
                <div className="flex flex-wrap gap-1.5">
                  {action.features.map(f => (
                    <span key={f} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg font-medium">{f}</span>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Stack</h4>
                <div className="flex flex-wrap gap-1.5">
                  {action.techStack.map(t => (
                    <span key={t} className="text-xs px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg border border-slate-200">{t}</span>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button
                  disabled
                  className="w-full text-sm py-2 rounded-lg font-medium bg-slate-100 text-slate-400 cursor-not-allowed"
                >
                  {action.cta}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
