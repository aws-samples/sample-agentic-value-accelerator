import { useState, useEffect } from 'react';
import { getTemplates, getTemplateStats } from '../api/client';
import TemplateCard from './TemplateCard';
import TemplateFilters from './TemplateFilters';
import TemplateDetailModal from './TemplateDetailModal';
import LoadingSpinner from './LoadingSpinner';
import type { Template, TemplateStats } from '../types';

export default function TemplateCatalog() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState<TemplateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tier toggle
  const [selectedTier, setSelectedTier] = useState<'starter' | 'infrastructure' | 'code'>('starter');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedFramework, setSelectedFramework] = useState('');

  // Drawer
  const [drawerTemplate, setDrawerTemplate] = useState<Template | null>(null);

  // Decision banner
  const [bannerOpen, setBannerOpen] = useState(true);

  useEffect(() => {
    loadTemplates();
    loadStats();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await getTemplates();
      setTemplates(data);
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

  // Derive available categories from templates in the selected tier
  const templatesInTier = templates.filter(t => (t.tier || 'starter') === selectedTier && !(t as any).hidden);
  const availableCategories = [...new Set(templatesInTier.map(t => t.category).filter(Boolean))] as string[];
  const availableFrameworks = [...new Set(
    templatesInTier.flatMap(t => t.frameworks_list || [])
  )];

  const filteredTemplates = templatesInTier.filter(template => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.tags?.some(tag => tag.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }
    if (selectedCategory && template.category !== selectedCategory) return false;
    if (selectedFramework) {
      const frameworkIds = template.frameworks_list || [];
      if (!frameworkIds.includes(selectedFramework)) return false;
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
            <a href="/applications" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Applications</a>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mt-3">
              Templates
            </h1>
            <p className="text-slate-500 mt-2 max-w-2xl">
              Starter templates and reusable modules for building AI agent applications on AWS.
            </p>
          </div>

          {/* Decision Banner */}
          {bannerOpen && (
            <div className="card bg-teal-50/50 border-teal-200/60 animate-fade-in stagger-1">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-teal-900 font-semibold">Starters · Infrastructure · Code Libraries</p>
                  <p className="text-sm text-teal-700/80 mt-1">
                    <strong>Starters</strong> are complete agent applications with both frameworks, IaC, and deploy scripts.{' '}
                    <strong>Infrastructure</strong> modules are Terraform/CDK for deploying AWS resources.{' '}
                    <strong>Code Libraries</strong> are Python modules you drop into your agent project.
                  </p>
                  <p className="text-sm text-teal-700/80 mt-2">
                    Looking for production use cases? Try <a href="/applications/fsi-foundry" className="underline font-medium">FSI Foundry</a> or <a href="/applications/reference-implementations" className="underline font-medium">Reference Implementations</a>.
                  </p>
                </div>
                <button onClick={() => setBannerOpen(false)} className="p-1 hover:bg-teal-100 rounded-lg transition-colors flex-shrink-0">
                  <svg className="w-4 h-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          )}

          {/* Segmented Control */}
          <div className="flex items-center gap-4 animate-fade-in stagger-1">
            <div className="inline-flex items-center gap-1 px-2 py-1.5 rounded-full bg-white/85 backdrop-blur-md border border-slate-200/60 shadow-sm">
              <button
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selectedTier === 'starter' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                onClick={() => setSelectedTier('starter')}
              >
                Starters
              </button>
              <button
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selectedTier === 'infrastructure' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                onClick={() => setSelectedTier('infrastructure')}
              >
                Infrastructure
              </button>
              <button
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selectedTier === 'code' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                onClick={() => setSelectedTier('code')}
              >
                Code Libraries
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="animate-fade-in stagger-1">
            <TemplateFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              selectedFramework={selectedFramework}
              onFrameworkChange={setSelectedFramework}
              categories={availableCategories.length > 0 ? availableCategories : Object.keys(stats?.categories || {})}
              frameworks={availableFrameworks.length > 0 ? availableFrameworks : (stats?.frameworks || [])}
            />
          </div>

          {/* Results count */}
          <div className="text-sm text-slate-500 animate-fade-in stagger-2">
            Showing <span className="font-semibold text-slate-900">{filteredTemplates.length}</span> {selectedTier === 'starter' ? 'starters' : selectedTier === 'infrastructure' ? 'infrastructure modules' : 'code libraries'}
          </div>

          {/* Template grid */}
          {filteredTemplates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredTemplates.map((template, idx) => (
                <div key={template.id} className={`animate-fade-in stagger-${Math.min(idx + 1, 4)}`}>
                  <TemplateCard
                    template={template}
                    onViewDetails={(t) => setDrawerTemplate(t)}
                  />
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
              <p className="text-lg font-semibold text-slate-700 mb-2">No {selectedTier === 'starter' ? 'starters' : selectedTier === 'infrastructure' ? 'infrastructure modules' : 'code libraries'} match your filters</p>
              <p className="text-sm text-slate-500 mb-6">Try adjusting your search or filter criteria</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('');
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

      {/* Detail Modal */}
      {drawerTemplate && (
        <TemplateDetailModal
          template={drawerTemplate}
          onClose={() => setDrawerTemplate(null)}
        />
      )}
    </div>
  );
}
