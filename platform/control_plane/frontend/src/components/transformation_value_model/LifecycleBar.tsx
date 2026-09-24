// Catalog data-lifecycle controls: shows the current mode + provenance counts and
// offers reuse-or-start-from-scratch actions. Mutating actions confirm first and
// call POST /catalog/lifecycle; export downloads a re-importable document.

import { useState } from 'react';
import { catalogApi, type CatalogSeedStatus, type CatalogLifecycleMode } from '../../api/client';
import { catalogStore } from './store';

interface Props {
  status: CatalogSeedStatus | null;
  onOpenLibrary: () => void;
  onChanged: () => void; // reload after a lifecycle transition
}

const MODE_LABEL: Record<string, string> = {
  examples: 'Examples loaded',
  scratch: 'Empty (from scratch)',
  custom: 'Customized',
};

export default function LifecycleBar({ status, onOpenLibrary, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (mode: CatalogLifecycleMode, confirmMsg: string) => {
    if (!window.confirm(confirmMsg)) return;
    setBusy(mode);
    setNotice(null);
    try {
      await catalogStore.lifecycle(mode);
      onChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const exportCatalog = async () => {
    setBusy('export');
    setNotice(null);
    try {
      const doc = await catalogApi.exportCatalog('all');
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'catalog-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const totals = status?.totals;
  const mode = status?.mode ?? 'examples';

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[9px] font-bold text-indigo-600/80 bg-indigo-50 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
            Catalog data
          </span>
          <span className="text-sm font-medium text-slate-700">{MODE_LABEL[mode] ?? mode}</span>
          {totals && (
            <span className="text-xs text-slate-400">
              {totals.total} records · {totals.examples} example · {totals.user} yours
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenLibrary}
            disabled={!!busy}
            className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-md disabled:opacity-50"
          >
            + Add examples
          </button>
          <button
            onClick={() => run('reset-to-examples',
              'Reset the catalog to the shipped examples? This deletes all current records (including your own) and re-imports the examples.')}
            disabled={!!busy}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
          >
            {busy === 'reset-to-examples' ? 'Resetting…' : 'Reset to examples'}
          </button>
          <button
            onClick={() => run('start-from-scratch',
              'Empty the catalog to start from scratch? This deletes every record. It stays empty across restarts.')}
            disabled={!!busy}
            className="px-3 py-1.5 text-xs font-semibold text-red-600 rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-50"
          >
            {busy === 'start-from-scratch' ? 'Clearing…' : 'Start from scratch'}
          </button>
          <button
            onClick={exportCatalog}
            disabled={!!busy}
            className="px-3 py-1.5 text-xs font-semibold text-slate-500 rounded-lg border border-slate-200 hover:border-slate-300 disabled:opacity-50"
          >
            {busy === 'export' ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
      {notice && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">{notice}</div>
      )}
    </div>
  );
}
