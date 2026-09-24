// /use-cases hub — unifies the Reference Catalog and Use Case Prioritization as
// two halves of one concept: the catalog describes a use case and its
// relationships, data, and technology; prioritization evaluates it. Tabs switch
// between them; the existing prioritization behavior is preserved intact.

import { lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Prioritization from './Prioritization';
import CatalogView from './transformation_value_model/CatalogView';

// The Relationship Map pulls in React Flow + dagre; load it only when its tab is
// opened so those libraries stay out of the initial bundle.
const CatalogGraphView = lazy(() => import('./transformation_value_model/graph/CatalogGraphView'));

type Tab = 'catalog' | 'prioritize' | 'map';

export default function UseCasesHub() {
  const [params, setParams] = useSearchParams();
  // The active tab is derived from the URL, so a deep link (?tab=prioritize,
  // ?tab=map, or ?record=<id>) selects the right tab with no effect-driven sync.
  const tabParam = params.get('tab');
  const tab: Tab = tabParam === 'prioritize' || params.has('record')
    ? 'prioritize'
    : tabParam === 'map'
      ? 'map'
      : 'catalog';

  const selectTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    if (t !== 'prioritize') next.delete('record');
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 20% 50%, rgba(219,234,254,0.8) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 80% 40%, rgba(221,214,254,0.6) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 50% 80%, rgba(252,231,243,0.5) 0%, transparent 50%)',
        animation: 'gradientDrift 20s ease-in-out infinite',
      }} />

      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <div className="mb-6 animate-fade-in">
          <Link to="/plan" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">← Back to Plan</Link>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Use Cases</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Browse the reference catalog of reusable transformation concepts, then score and rank
            candidates. The catalog <span className="font-medium text-slate-600">describes</span> a use case
            and its data, technology, and value; prioritization <span className="font-medium text-slate-600">evaluates</span> it.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-6 bg-white/70 backdrop-blur rounded-full border border-slate-200 p-1 w-fit">
          {([['catalog', 'Reference Catalog'], ['prioritize', 'Prioritize'], ['map', 'Relationship Map']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => selectTab(t)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                tab === t
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'catalog' && <CatalogView />}
        {tab === 'prioritize' && <Prioritization embedded />}
        {tab === 'map' && (
          <Suspense fallback={<div className="text-sm text-slate-400 py-16 text-center">Loading map…</div>}>
            <CatalogGraphView />
          </Suspense>
        )}
      </div>
    </div>
  );
}
