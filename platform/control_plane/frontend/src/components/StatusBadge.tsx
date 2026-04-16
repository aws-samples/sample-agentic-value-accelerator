import type { DeploymentStatus } from '../types';

const STATUS_STYLES: Partial<Record<DeploymentStatus, string>> = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  validating: 'bg-amber-50 text-amber-700 border border-amber-200',
  packaging: 'bg-amber-50 text-amber-700 border border-amber-200',
  deploying: 'bg-blue-50 text-blue-700 border border-blue-200',
  verifying: 'bg-blue-50 text-blue-700 border border-blue-200',
  deployed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  destroying: 'bg-orange-50 text-orange-700 border border-orange-200',
  destroyed: 'bg-slate-50 text-slate-600 border border-slate-200',
  packaged: 'bg-blue-50 text-blue-700 border border-blue-200',
  delivered: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  failed: 'bg-red-50 text-red-700 border border-red-200',
  rolled_back: 'bg-red-50 text-red-700 border border-red-200',
};

const STATUS_DOTS: Partial<Record<DeploymentStatus, string>> = {
  pending: 'bg-amber-500',
  validating: 'bg-amber-500',
  packaging: 'bg-amber-500',
  deploying: 'bg-blue-500',
  verifying: 'bg-blue-500',
  deployed: 'bg-emerald-500',
  destroying: 'bg-orange-500',
  destroyed: 'bg-slate-400',
  packaged: 'bg-blue-500',
  delivered: 'bg-emerald-500',
  failed: 'bg-red-500',
  rolled_back: 'bg-red-500',
};

export default function StatusBadge({ status }: { status: DeploymentStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] || 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[status] || 'bg-slate-400'}`} />
      {status}
    </span>
  );
}
