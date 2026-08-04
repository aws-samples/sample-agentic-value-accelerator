import React from 'react';
import Drawer from './Drawer';
import { FRAMEWORK_DETAILS } from './mockData';
import { Icon } from './icons';

interface Props {
  frameworkKey: string | null;
  onClose: () => void;
}

const statusBg: Record<string, string> = {
  pass:          'bg-emerald-100 text-emerald-700',
  'in-progress': 'bg-amber-100 text-amber-700',
  fail:          'bg-rose-100 text-rose-700',
};

const statusIconName: Record<string, React.ReactNode> = {
  pass:          <Icon name="check" className="w-3 h-3" />,
  'in-progress': <span>·</span>,
  fail:          <Icon name="x-mark" className="w-3 h-3" />,
};

export default function FrameworkDrawer({ frameworkKey, onClose }: Props) {
  const detail = frameworkKey ? FRAMEWORK_DETAILS[frameworkKey] : null;

  const counts = detail ? detail.categories.flatMap(c => c.controls).reduce(
    (acc, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>,
  ) : null;

  return (
    <Drawer
      open={!!detail}
      onClose={onClose}
      title={detail?.name ?? ''}
      subtitle={detail?.summary}
      width="xl"
    >
      {detail && counts && (
        <div className="space-y-6">
          {/* Status summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-widest text-emerald-700">Passing</div>
              <div className="text-2xl font-semibold text-emerald-700 mt-1">{counts.pass ?? 0}</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-widest text-amber-700">In progress</div>
              <div className="text-2xl font-semibold text-amber-700 mt-1">{counts['in-progress'] ?? 0}</div>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-widest text-rose-700">Failing</div>
              <div className="text-2xl font-semibold text-rose-700 mt-1">{counts.fail ?? 0}</div>
            </div>
          </div>

          {detail.categories.map((cat) => (
            <div key={cat.name}>
              <div className="text-sm font-semibold text-slate-900 mb-2">{cat.name}</div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm divide-y divide-slate-100">
                {cat.controls.map((c) => (
                  <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 font-semibold ${statusBg[c.status]}`}>
                      {statusIconName[c.status]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-slate-400">{c.id}</span>
                        <span className="text-sm text-slate-900">{c.label}</span>
                      </div>
                      {c.evidence && (
                        <div className="text-[11px] text-slate-500 mt-0.5">Evidence: {c.evidence}</div>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${statusBg[c.status]}`}>
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
