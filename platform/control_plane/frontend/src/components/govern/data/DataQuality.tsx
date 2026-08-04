/**
 * DataQuality — Data quality rules and monitoring (LIVE)
 *
 * Sources:
 * - Guardrail PII/filter coverage as content quality
 * - AWS Config compliance as infrastructure quality
 * - Glue Data Quality (if enabled)
 *
 * No user deployment required for basic metrics.
 */

import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { LiveDataBadge } from '../DataSourceIndicator';
import { useDataQuality } from './useDataQuality';
import { SetupGuidanceCard } from '../SetupGuidanceCard';
import GovernPageLayout from '../GovernPageLayout';

const tooltipStyle = { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px' };

export default function DataQuality() {
  const quality = useDataQuality();

  // Pass/fail donut
  const statusData = [
    { name: 'Passed', value: quality.passedRules, color: '#10b981' },
    { name: 'Failed', value: quality.failedRules, color: '#ef4444' },
  ];

  // Group rules by dimension
  const byDimension = quality.rules.reduce<Record<string, { dimension: string; pass: number; fail: number }>>((acc, r) => {
    const key = r.dimension;
    acc[key] = acc[key] ?? { dimension: key, pass: 0, fail: 0 };
    if (r.status === 'pass') acc[key].pass += 1;
    else acc[key].fail += 1;
    return acc;
  }, {});
  const dimensionData = Object.values(byDimension);

  return (
    <GovernPageLayout
      title="Data Quality"
      description="Quality rules computed from live AWS data sources."
      badge={
        <div className="flex items-center gap-2">
          <LiveDataBadge />
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
            {quality.liveSourcesCount} sources
          </span>
          {quality.hasGlueQuality && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
              GLUE DQ
            </span>
          )}
        </div>
      }
      backPath="/govern/data"
      backLabel="Data Governance"
    >
      {quality.loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm text-slate-500">Loading quality data...</span>
          </div>
        </div>
      ) : quality.error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
          <p className="text-sm text-rose-700">Error: {quality.error}</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-[10px] text-slate-500 uppercase font-medium">Rules Passed</div>
              <div className="text-2xl font-bold text-emerald-600">{quality.passedRules}</div>
              <div className="text-[10px] text-slate-400">of {quality.totalRules} total</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-[10px] text-slate-500 uppercase font-medium">Rules Failed</div>
              <div className={`text-2xl font-bold ${quality.failedRules > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {quality.failedRules}
              </div>
              <div className="text-[10px] text-slate-400">require attention</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-[10px] text-slate-500 uppercase font-medium">Pass Rate</div>
              <div className={`text-2xl font-bold ${
                quality.passRate >= 90 ? 'text-emerald-600' :
                quality.passRate >= 70 ? 'text-amber-600' :
                'text-rose-600'
              }`}>
                {quality.passRate}%
              </div>
              <div className="text-[10px] text-slate-400">overall quality</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-[10px] text-slate-500 uppercase font-medium">Live Sources</div>
              <div className="text-2xl font-bold text-blue-600">{quality.liveSourcesCount}</div>
              <div className="text-[10px] text-slate-400">AWS services</div>
            </div>
          </div>

          {/* Metrics cards */}
          {quality.metrics.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {quality.metrics.map(m => (
                <div key={m.label} className="bg-white rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500">{m.label}</span>
                    <span className={`w-2 h-2 rounded-full ${m.live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-lg font-bold ${
                      m.status === 'good' ? 'text-emerald-600' :
                      m.status === 'warning' ? 'text-amber-600' :
                      'text-rose-600'
                    }`}>
                      {m.value}
                    </span>
                    <span className="text-xs text-slate-400">/ {m.total} {m.unit}</span>
                  </div>
                  <div className="text-[9px] text-slate-400 mt-0.5">{m.source}</div>
                </div>
              ))}
            </div>
          )}

          {/* Charts */}
          {quality.totalRules > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 mb-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Rule Outcomes</h3>
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

              {dimensionData.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Rules by Quality Dimension</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dimensionData} margin={{ left: 4, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="dimension" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="pass" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} name="Pass" />
                      <Bar dataKey="fail" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} name="Fail" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Quality Rules Table */}
          {quality.rules.length > 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Quality Rules</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th scope="col" className="pb-2 font-medium">Rule</th>
                      <th scope="col" className="pb-2 font-medium">Source</th>
                      <th scope="col" className="pb-2 font-medium">Dimension</th>
                      <th scope="col" className="pb-2 font-medium">Dataset</th>
                      <th scope="col" className="pb-2 font-medium">Threshold</th>
                      <th scope="col" className="pb-2 font-medium">Actual</th>
                      <th scope="col" className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quality.rules.map(r => (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${r.live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <span className="font-medium text-slate-800">{r.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px] font-medium">
                            {r.source}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-600">{r.dimension}</td>
                        <td className="py-2.5 text-slate-600 max-w-[150px] truncate" title={r.dataset}>{r.dataset}</td>
                        <td className="py-2.5 text-slate-600 font-mono">{r.threshold}</td>
                        <td className="py-2.5 text-slate-800 font-mono font-medium">{r.actual}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                            r.status === 'pass' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center mb-6">
              <div className="text-slate-400 mb-3">No quality rules detected</div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Quality rules are derived from Bedrock Guardrails, AWS Config, and Glue Data Quality.
                Configure guardrails to see content quality metrics.
              </p>
            </div>
          )}

          {/* Glue Data Quality Setup */}
          {!quality.hasGlueQuality && (
            <SetupGuidanceCard
              guidance={{
                service: 'AWS Glue Data Quality',
                docs_url: 'https://docs.aws.amazon.com/glue/latest/dg/data-quality.html',
                title: 'Enable Glue Data Quality for comprehensive validation',
                description: 'Glue Data Quality provides automated data validation rules for your data lakes and warehouses.',
                steps: [
                  'Open Glue Studio and navigate to Data Quality',
                  'Create a ruleset: define rules like "ColumnValues \'age\' >= 0"',
                  'Attach to a Glue job or create a standalone evaluation',
                  'Schedule regular quality checks',
                ],
                benefits: [
                  'Automated data validation at scale',
                  'Pre-built rule types (completeness, uniqueness, validity)',
                  'Quality scores and trend tracking',
                  'Integration with Glue ETL pipelines',
                ],
              }}
            />
          )}

          {/* Data sources info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-xs text-blue-800">
              <strong>Live Data Quality</strong> is computed from {quality.liveSourcesCount} AWS sources:
              {' '}Bedrock Guardrails (PII/filter coverage), AWS Config (infrastructure compliance)
              {quality.hasGlueQuality ? ', and Glue Data Quality (data validation rules)' : ''}.
              {' '}No additional setup required for basic metrics.
            </p>
          </div>
        </>
      )}
    </GovernPageLayout>
  );
}
