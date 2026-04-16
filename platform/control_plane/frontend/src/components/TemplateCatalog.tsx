import { useState, useEffect } from 'react';
import { getTemplates, getTemplateStats } from '../api/client';
import TemplateCard from './TemplateCard';
import TemplateFilters from './TemplateFilters';
import LoadingSpinner from './LoadingSpinner';
import type { Template, TemplateStats } from '../types';

export default function TemplateCatalog() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState<TemplateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatternType, setSelectedPatternType] = useState<string>('');
  const [selectedFramework, setSelectedFramework] = useState<string>('');

  useEffect(() => {
    loadTemplates();
    loadStats();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await getTemplates();
      setTemplates(data.filter((t: any) => t.type !== 'reference'));
      setError(null);
    } catch (err) {
      setError('Failed to load templates. Please try again.');
      console.error('Error loading templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await getTemplateStats();
      setStats(data);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const filteredTemplates = templates.filter(template => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.tags?.some(tag => tag.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }
    if (selectedPatternType && template.pattern_type !== selectedPatternType) return false;
    if (selectedFramework) {
      const hasFramework = template.frameworks?.some(f => f.id === selectedFramework);
      if (!hasFramework) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="card bg-red-50 border-red-200">
          <p className="text-red-700">{error}</p>
          <button onClick={loadTemplates} className="mt-4 text-red-600 hover:text-red-700 underline font-medium">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      {/* Ombre gradient background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <div className="space-y-8">
          {/* Header */}
          <div className="animate-fade-in">
            <a href="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Home</a>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">
              Templates
            </h1>
            <p className="text-slate-500 mt-2 max-w-2xl">
              Starter templates for building AI agent applications. Each includes agent code, IaC, deploy scripts, and configuration.
            </p>
          </div>

          {/* How it works */}
          <div className="card bg-teal-50/50 border-teal-200/60 animate-fade-in stagger-1">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" /></svg>
              </div>
              <div>
                <p className="text-sm text-teal-900 font-semibold">How Template deployment works</p>
                <p className="text-sm text-teal-700/80 mt-1">Templates are <strong>project scaffolds</strong> — they package agent code, IaC (Terraform/CDK/CloudFormation), and deploy scripts into a zip delivered to S3. You then run the included IaC to provision resources in your account. <a href="/docs/deployments" className="underline font-medium">Learn more →</a></p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="animate-fade-in stagger-1">
            <TemplateFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedPatternType={selectedPatternType}
              onPatternTypeChange={setSelectedPatternType}
              selectedFramework={selectedFramework}
              onFrameworkChange={setSelectedFramework}
              patternTypes={stats?.pattern_types || []}
              frameworks={stats?.frameworks || []}
            />
          </div>

          {/* Results count */}
          <div className="text-sm text-slate-500 animate-fade-in stagger-2">
            Showing <span className="font-semibold text-slate-900">{filteredTemplates.length}</span> of <span className="font-semibold text-slate-900">{templates.length}</span> templates
          </div>

          {/* Template grid */}
          {filteredTemplates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredTemplates.map((template, idx) => (
                <div key={template.id} className={`animate-fade-in stagger-${Math.min(idx + 1, 4)}`}>
                  <TemplateCard template={template} />
                </div>
              ))}
            </div>
          ) : (
            <div className="card text-center py-20 animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-slate-700 mb-2">No templates match your filters</p>
              <p className="text-sm text-slate-500 mb-6">Try adjusting your search or filter criteria</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedPatternType('');
                  setSelectedFramework('');
                }}
                className="btn-secondary"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
