import { useState, useEffect } from 'react';
import LoadingSpinner from '../LoadingSpinner';
import client from '../../api/client';

interface ModelInfo {
  model_id: string;
  display_name: string;
  provider: string;
  region: string;
  mode: string;
  status: string;
  input_cost_per_token: number;
  output_cost_per_token: number;
  max_input_tokens: number;
  max_output_tokens: number;
  spend_usd: number;
}

interface ModelsResponse {
  models: ModelInfo[];
  total_count: number;
}

const PROVIDER_STYLES: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  bedrock: {
    label: 'Bedrock',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  'bedrock-mantle': {
    label: 'Bedrock Mantle',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    dot: 'bg-purple-500',
  },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  active: {
    bg: 'bg-emerald-50 border border-emerald-200',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  inactive: {
    bg: 'bg-slate-50 border border-slate-200',
    text: 'text-slate-600',
    dot: 'bg-slate-400',
  },
};

function formatCost(costPerToken: number): string {
  if (costPerToken === 0) return '$0';
  // Show cost per 1M tokens for readability
  const perMillion = costPerToken * 1_000_000;
  if (perMillion < 0.01) return `$${perMillion.toFixed(4)}/1M`;
  if (perMillion < 1) return `$${perMillion.toFixed(3)}/1M`;
  return `$${perMillion.toFixed(2)}/1M`;
}

function formatTokenCount(count: number): string {
  if (count === 0) return '—';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(0)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return count.toString();
}

function formatSpend(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export default function ModelCatalog() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const fetchModels = async () => {
    setLoading(true);
    try {
      const response = await client.get<ModelsResponse>('/api/v1/gateway/models');
      setModels(response.data.models);
      setTotalCount(response.data.total_count);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load models. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const filteredModels = models
    .filter((m) => !providerFilter || m.provider === providerFilter)
    .filter((m) => !statusFilter || m.status === statusFilter)
    .filter(
      (m) =>
        !searchFilter ||
        m.display_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        m.model_id.toLowerCase().includes(searchFilter.toLowerCase())
    );

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      {/* Background gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        }}
      />
      <div className="relative max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10 animate-fade-in">
          <h1 className="text-4xl font-semibold text-slate-900 tracking-tight mb-3">
            Model Catalog
          </h1>
          <p className="text-lg text-slate-500">
            All configured LLM models available through the AI Gateway
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-10 animate-fade-in">
          <div className="card bg-blue-50/50 border-blue-200/60">
            <div className="text-3xl font-semibold text-blue-700">
              {models.filter((m) => m.provider === 'bedrock').length}
            </div>
            <div className="text-sm text-slate-500 mt-1">Bedrock Models</div>
          </div>
          <div className="card bg-purple-50/50 border-purple-200/60">
            <div className="text-3xl font-semibold text-purple-700">
              {models.filter((m) => m.provider === 'bedrock-mantle').length}
            </div>
            <div className="text-sm text-slate-500 mt-1">Mantle Models</div>
          </div>
          <div className="card bg-emerald-50/50 border-emerald-200/60">
            <div className="text-3xl font-semibold text-emerald-700">
              {models.filter((m) => m.status === 'active').length}
            </div>
            <div className="text-sm text-slate-500 mt-1">Active</div>
          </div>
          <div className="card bg-slate-50/50 border-slate-200/60">
            <div className="text-3xl font-semibold text-slate-700">
              {formatSpend(models.reduce((sum, m) => sum + m.spend_usd, 0))}
            </div>
            <div className="text-sm text-slate-500 mt-1">Total Spend</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between mb-8 animate-fade-in">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search models..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="input-field w-52 text-sm"
            />
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="input-field w-44 text-sm"
            >
              <option value="">All Providers</option>
              <option value="bedrock">Bedrock</option>
              <option value="bedrock-mantle">Bedrock Mantle</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field w-36 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="text-sm text-slate-500">
            {filteredModels.length} of {totalCount} models
          </div>
        </div>

        {error && (
          <div className="card bg-red-50 border-red-200 mb-6">
            <p className="text-red-700">{error}</p>
            <button
              onClick={fetchModels}
              className="mt-2 text-red-600 hover:text-red-700 underline font-medium text-sm"
            >
              Try again
            </button>
          </div>
        )}

        {/* Models Table */}
        {filteredModels.length === 0 ? (
          <div className="card text-center py-20 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
              <svg
                className="w-8 h-8 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-lg font-semibold text-slate-700 mb-2">No models found</p>
            <p className="text-sm text-slate-500">
              {models.length === 0
                ? 'No models are configured in the gateway yet.'
                : 'No models match your current filters.'}
            </p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden animate-fade-in">
            {/* Provider legend */}
            <div className="px-5 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center gap-5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-blue-500"></span>
                Bedrock Runtime
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-purple-500"></span>
                Bedrock Mantle
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Model
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Provider
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Region
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Context
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Input Cost
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Output Cost
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Spend
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredModels.map((model) => {
                    const providerStyle = PROVIDER_STYLES[model.provider] || PROVIDER_STYLES.bedrock;
                    const statusStyle = STATUS_STYLES[model.status] || STATUS_STYLES.active;

                    return (
                      <tr
                        key={model.model_id}
                        className="hover:bg-blue-50/40 transition-colors duration-150"
                      >
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900 text-sm">
                            {model.display_name}
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">
                            {model.model_id}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${providerStyle.bg} ${providerStyle.text}`}
                          >
                            <span
                              className={`w-2 h-2 rounded ${providerStyle.dot}`}
                            ></span>
                            {providerStyle.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-slate-600">
                          {model.region}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`}
                            />
                            {model.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-slate-600">
                          <span title="Max input tokens">
                            {formatTokenCount(model.max_input_tokens)}
                          </span>
                          <span className="text-slate-300 mx-1">/</span>
                          <span title="Max output tokens">
                            {formatTokenCount(model.max_output_tokens)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-slate-600 font-mono">
                          {formatCost(model.input_cost_per_token)}
                        </td>
                        <td className="px-5 py-3 text-sm text-slate-600 font-mono">
                          {formatCost(model.output_cost_per_token)}
                        </td>
                        <td className="px-5 py-3 text-sm text-right font-semibold text-slate-900">
                          {formatSpend(model.spend_usd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
