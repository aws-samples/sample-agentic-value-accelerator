import { useNavigate } from 'react-router-dom';
import type { RuntimeConfig } from '../config';

const AGENT_COLORS = ['#0ea5e9', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444'];

export default function Home({ config }: { config: RuntimeConfig }) {
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-6 bg-sky-500/10 text-sky-400 border border-sky-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          {config.domain} &mdash; AI-Powered
        </div>

        <h1 className="text-5xl font-extrabold mb-4 tracking-tight" style={{ color: 'var(--text)' }}>
          {config.use_case_name}
        </h1>

        <p className="text-lg max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {config.description}
        </p>

        <div className="flex justify-center gap-3">
          <button
            onClick={() => navigate('/console')}
            className="px-6 py-3 rounded-xl font-semibold text-sm bg-sky-500 hover:bg-sky-400 text-white transition-colors"
          >
            Open Console
          </button>
          <button
            onClick={() => document.getElementById('agents')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-6 py-3 rounded-xl font-semibold text-sm border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
          >
            View Agents
          </button>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-12 mt-12">
          <div className="text-center">
            <div className="text-3xl font-bold text-sky-400">{config.agents.length}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">AI Agents</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-sky-400">{config.input_schema.type_options.length}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Assessment Types</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-sky-400">{config.input_schema.test_entities.length}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">Test Entities</div>
          </div>
        </div>
      </div>

      {/* Agents */}
      <div id="agents" className="mb-16">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-sky-400 mb-6 text-center">
          AI Agents
        </h2>
        <div className={`grid grid-cols-1 gap-5 ${config.agents.length <= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          {config.agents.map((agent, i) => {
            const color = AGENT_COLORS[i % AGENT_COLORS.length];
            return (
              <div
                key={agent.id}
                className="rounded-xl p-6 border transition-colors hover:border-slate-600"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                    style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
                  >
                    {agent.name.charAt(0)}
                  </div>
                  <h3 className="font-semibold" style={{ color: 'var(--text)' }}>{agent.name}</h3>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {agent.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Start */}
      <div className="text-center">
        <div
          className="inline-block rounded-xl p-6 border cursor-pointer transition-colors hover:border-sky-500/30"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          onClick={() => navigate('/console')}
        >
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>Try with a test entity</p>
          <div className="flex gap-2 justify-center">
            {config.input_schema.test_entities.map((id) => (
              <code
                key={id}
                className="px-3 py-1 rounded-lg text-xs font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20"
              >
                {id}
              </code>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
