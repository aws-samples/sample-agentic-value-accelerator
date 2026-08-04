/**
 * DataAccessControl — Data access matrix and service approvals
 */

import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useDataGovernance } from './useDataGovernance';
import { LiveDataBadge } from '../DataSourceIndicator';
import EmptyState from '../EmptyState';
import StatCard from '../StatCard';
import { tooltipStyle } from './dataGovernanceData';

export default function DataAccessControl() {
  const dg = useDataGovernance();

  if (dg.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (dg.error) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="bg-rose-50 rounded-xl border border-rose-200 p-8 text-center">
          <p className="text-rose-700 mb-4">{dg.error}</p>
          <button onClick={dg.refresh} className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { serviceApprovals } = dg;
  const completedApprovals = serviceApprovals.filter(a => a.status === 'completed').length;
  const failedApprovals = serviceApprovals.filter(a => a.status === 'failed').length;
  const pendingApprovals = serviceApprovals.filter(a => a.status !== 'completed' && a.status !== 'failed');

  // Approval-status donut
  const statusData = [
    { name: 'Approved', value: completedApprovals, color: '#10b981' },
    { name: 'Pending', value: pendingApprovals.length, color: '#f59e0b' },
    { name: 'Failed', value: failedApprovals, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Distribution of services by compliance framework
  const byFramework = Object.values(
    serviceApprovals.reduce<Record<string, { framework: string; count: number }>>((acc, a) => {
      const key = (a.framework ?? 'Unknown').toUpperCase();
      acc[key] = acc[key] ?? { framework: key, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {}),
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern/data" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Data Governance
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Access Control</h1>
              <LiveDataBadge />
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              Service approvals and data access governance through the 5-gate approval workflow.
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Services" value={serviceApprovals.length} variant="info" sub="in approval pipeline" />
          <StatCard label="Approved" value={completedApprovals} variant={completedApprovals ? 'success' : 'muted'} sub="fully approved" />
          <StatCard label="Pending" value={pendingApprovals.length} variant={pendingApprovals.length ? 'warning' : 'muted'} sub="awaiting review" />
          <StatCard label="Failed" value={failedApprovals} variant={failedApprovals ? 'danger' : 'muted'} sub="require attention" />
        </div>

        {serviceApprovals.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Approval Status</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {statusData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 -mt-2">
                {statusData.map(d => (
                  <span key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />{d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Services by Compliance Framework</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byFramework} margin={{ left: 4, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="framework" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Services" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {serviceApprovals.length === 0 ? (
          <div className="bg-slate-50 rounded-xl border border-slate-200 py-6">
            <EmptyState
              icon="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              title="No service approvals"
              description="Submit services for approval in the Secure module to track their access control status and gate progress here."
              actionLabel="Go to Service Approvals"
              actionLink="/secure"
              tips={['Services go through gate reviews before production access', 'Track compliance status and approval history']}
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Approval Pipeline */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Service Approval Pipeline</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th scope="col" className="pb-2 font-medium">Service</th>
                      <th scope="col" className="pb-2 font-medium">Framework</th>
                      <th scope="col" className="pb-2 font-medium">Gate Progress</th>
                      <th scope="col" className="pb-2 font-medium">Status</th>
                      <th scope="col" className="pb-2 font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {serviceApprovals.map(approval => (
                      <tr key={approval.slug} className="hover:bg-slate-50">
                        <td className="py-3">
                          <span className="font-medium text-slate-900">{approval.service}</span>
                        </td>
                        <td className="py-3">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] uppercase">
                            {approval.framework}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1">
                            {approval.phases.map((phase, i) => (
                              <div key={i} className="flex items-center gap-1">
                                <span
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-medium ${
                                    phase.status === 'complete' ? 'bg-emerald-500 text-white' :
                                    phase.status === 'running' ? 'bg-blue-500 text-white animate-pulse' :
                                    phase.status === 'failed' ? 'bg-rose-500 text-white' :
                                    'bg-slate-200 text-slate-500'
                                  }`}
                                  title={`${phase.key}: ${phase.status}`}
                                >
                                  {i + 1}
                                </span>
                                {i < approval.phases.length - 1 && (
                                  <div className={`w-4 h-0.5 ${
                                    phase.status === 'complete' ? 'bg-emerald-300' : 'bg-slate-200'
                                  }`} />
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded text-[10px] font-medium ${
                            approval.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            approval.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                            approval.status === 'running' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {approval.status}
                          </span>
                        </td>
                        <td className="py-3 text-slate-500">
                          {new Date(approval.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 5-Gate Workflow Explanation */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">5-Gate Approval Workflow</h3>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { gate: 1, name: 'Security Review', desc: 'Threat modeling, vulnerability assessment' },
                  { gate: 2, name: 'Data Classification', desc: 'PII/PHI/PCI identification' },
                  { gate: 3, name: 'Compliance Check', desc: 'Regulatory alignment verification' },
                  { gate: 4, name: 'Architecture Review', desc: 'Integration and dependency analysis' },
                  { gate: 5, name: 'Final Approval', desc: 'Business owner sign-off' },
                ].map(g => (
                  <div key={g.gate} className="p-3 bg-white rounded-lg border border-blue-100">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold">
                        {g.gate}
                      </span>
                      <span className="text-xs font-semibold text-slate-900">{g.name}</span>
                    </div>
                    <p className="text-[10px] text-slate-600">{g.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
