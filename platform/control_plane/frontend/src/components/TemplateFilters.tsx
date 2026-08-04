interface TemplateFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedFramework: string;
  onFrameworkChange: (framework: string) => void;
  categories: string[];
  frameworks: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  compute: 'Compute & Runtime',
  api: 'API & Access',
  auth: 'Authentication',
  memory: 'Memory & State',
  knowledge: 'Knowledge & RAG',
  observability: 'Observability',
  cicd: 'CI/CD',
  frontend: 'Frontend',
  events: 'Events & Integration',
  security: 'Security & Governance',
  networking: 'Networking',
  agent_scaffold: 'Agent Scaffolds',
  tools: 'Tools',
  integration: 'Integration',
  agent_pattern: 'Agent Patterns',
};

export default function TemplateFilters({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedFramework,
  onFrameworkChange,
  categories,
  frameworks,
}: TemplateFiltersProps) {
  const hasActiveFilters = searchQuery || selectedCategory || selectedFramework;

  const clearFilters = () => {
    onSearchChange('');
    onCategoryChange('');
    onFrameworkChange('');
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-slate-900">Filters</h2>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-blue-600 hover:text-blue-700 font-semibold transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Search</label>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search templates..."
              className="w-full py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm outline-none transition-all duration-150 focus:border-blue-400 pr-3.5"
              style={{ paddingLeft: '2.25rem' }}
            />
          </div>
        </div>

        <div>
          <label className="label">Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="input-field"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat] || cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Framework</label>
          <select
            value={selectedFramework}
            onChange={(e) => onFrameworkChange(e.target.value)}
            className="input-field"
          >
            <option value="">All Frameworks</option>
            {frameworks.map(framework => (
              <option key={framework} value={framework}>
                {framework === 'langgraph' ? 'LangGraph' : framework.charAt(0).toUpperCase() + framework.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
