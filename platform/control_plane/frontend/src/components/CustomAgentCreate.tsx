import { useState } from 'react';
import { Link } from 'react-router-dom';

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'model', label: 'Model' },
  { id: 'tools', label: 'Tools' },
  { id: 'deploy', label: 'Deploy' },
];

const FRAMEWORKS = [
  { id: 'strands', label: 'Strands Agents', hint: 'AWS-native Python SDK — tight AgentCore integration' },
  { id: 'langgraph', label: 'LangGraph / LangChain', hint: 'Graph-based multi-step workflows with broad ecosystem' },
];

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', hint: 'Fast, balanced — good default' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', hint: 'Deepest reasoning — use for complex planning' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', hint: 'Lowest latency + cost — good for high-volume tools' },
];

const TOOL_OPTIONS = [
  { id: 'mcp', label: 'MCP tools' },
  { id: 'knowledge_base', label: 'Knowledge base (RAG)' },
  { id: 'code_interpreter', label: 'Code interpreter' },
  { id: 'web_search', label: 'Web search' },
  { id: 'http', label: 'HTTP / REST tool' },
];

interface FormData {
  name: string;
  description: string;
  domain: string;
  framework: string;
  model: string;
  system_prompt: string;
  tools: string[];
  guardrails: boolean;
  memory: boolean;
}

const EMPTY: FormData = {
  name: '',
  description: '',
  domain: '',
  framework: 'strands',
  model: 'claude-sonnet-4-6',
  system_prompt: '',
  tools: [],
  guardrails: true,
  memory: false,
};

export default function CustomAgentCreate() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [submitted, setSubmitted] = useState(false);

  const canAdvance = () => {
    if (step === 0) return form.name.trim() && form.description.trim();
    if (step === 1) return form.model && form.framework && form.system_prompt.trim();
    return true;
  };

  const toggleTool = (tool: string) => {
    setForm(f => ({
      ...f,
      tools: f.tools.includes(tool) ? f.tools.filter(t => t !== tool) : [...f.tools, tool],
    }));
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Configuration saved</h2>
        <p className="text-slate-500 text-sm mb-1">Your agent definition has been captured.</p>
        <p className="text-xs text-slate-400 mb-8">
          Deployment orchestration is coming soon — the control plane will provision this agent on Bedrock AgentCore once the backend routes are live.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => { setForm(EMPTY); setStep(0); setSubmitted(false); }}
            className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Create another
          </button>
          <Link to="/aaas/custom/my-agents" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            View My Agents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8 animate-fade-in">
          <Link to="/aaas/custom" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Custom Agents</Link>
          <div className="flex items-center gap-3 mt-3">
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Create an Agent</h1>
            <span className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full">AgentCore</span>
          </div>
          <p className="text-slate-500 mt-2 max-w-2xl">Configure a custom autonomous agent. Deployment provisions a Bedrock AgentCore runtime plus supporting infrastructure.</p>
        </div>

        <div className="flex items-center gap-2 mb-10">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 ${i <= step ? 'cursor-pointer' : 'cursor-default'}`} onClick={() => i < step && setStep(i)}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  i <= step ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  {i < step ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px w-6 ${i < step ? 'bg-blue-300' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        <div className="card">
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Basics</h2>
                <p className="text-sm text-slate-500">Give your agent a name and describe what it does.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Agent name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Credit Policy Reviewer"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">What does it do? <span className="text-red-500">*</span></label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="One or two sentences describing the agent's job."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Domain</label>
                <input
                  type="text"
                  value={form.domain}
                  onChange={e => setForm({ ...form, domain: e.target.value })}
                  placeholder="e.g. Lending, Compliance, Operations"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Model & Framework</h2>
                <p className="text-sm text-slate-500">Pick the foundation model and the SDK your agent runs on.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Framework <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {FRAMEWORKS.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setForm({ ...form, framework: f.id })}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        form.framework === f.id ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900">{f.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{f.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Model <span className="text-red-500">*</span></label>
                <div className="space-y-2">
                  {MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setForm({ ...form, model: m.id })}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        form.model === m.id ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900">{m.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{m.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">System prompt <span className="text-red-500">*</span></label>
                <textarea
                  value={form.system_prompt}
                  onChange={e => setForm({ ...form, system_prompt: e.target.value })}
                  rows={5}
                  placeholder="You are a..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 font-mono focus:outline-none focus:border-blue-400 transition-colors resize-none"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Tools & Memory</h2>
                <p className="text-sm text-slate-500">Pick the capabilities your agent needs.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tools</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {TOOL_OPTIONS.map(t => {
                    const active = form.tools.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTool(t.id)}
                        className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left ${
                          active ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${active ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                          {active && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm text-slate-700">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${form.guardrails ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200'}`}>
                  <input type="checkbox" checked={form.guardrails} onChange={e => setForm({ ...form, guardrails: e.target.checked })} className="mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Guardrails</div>
                    <div className="text-xs text-slate-500">Content filtering, PII detection, toxicity checks</div>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${form.memory ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200'}`}>
                  <input type="checkbox" checked={form.memory} onChange={e => setForm({ ...form, memory: e.target.checked })} className="mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Memory</div>
                    <div className="text-xs text-slate-500">Persist short- and long-term memory across sessions</div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Review &amp; Deploy</h2>
                <p className="text-sm text-slate-500">Review the configuration before deployment.</p>
              </div>
              <div className="space-y-3">
                <Row label="Name" value={form.name || '—'} />
                <Row label="Description" value={form.description || '—'} />
                <Row label="Domain" value={form.domain || '—'} />
                <Row label="Framework" value={FRAMEWORKS.find(f => f.id === form.framework)?.label || form.framework} />
                <Row label="Model" value={MODELS.find(m => m.id === form.model)?.label || form.model} />
                <Row label="Tools" value={form.tools.length ? form.tools.join(', ') : 'None'} />
                <Row label="Guardrails" value={form.guardrails ? 'Enabled' : 'Disabled'} />
                <Row label="Memory" value={form.memory ? 'Enabled' : 'Disabled'} />
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                Deploy orchestration is coming soon — the configuration will be saved now and automatically provisioned once the backend routes are live.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
            <button
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance()}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={() => setSubmitted(true)}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save configuration
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-2 border-b border-slate-100 last:border-b-0">
      <div className="w-32 text-xs font-medium text-slate-500 uppercase tracking-wide flex-shrink-0">{label}</div>
      <div className="text-sm text-slate-800 flex-1">{value}</div>
    </div>
  );
}
