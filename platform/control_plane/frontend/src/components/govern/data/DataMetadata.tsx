/**
 * DataMetadata — RAG metadata schemas and extraction statistics
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { MockDataBadge } from '../DataSourceIndicator';
import UnifiedGuide, { DATA_METADATA_GUIDE } from '../UnifiedGuide';
import { METADATA_SCHEMAS, METADATA_EXTRACTION_STATS, tooltipStyle } from './dataGovernanceData';
import StatCard from '../StatCard';

export default function DataMetadata() {
  const [selectedSchema, setSelectedSchema] = useState(METADATA_SCHEMAS[0]?.id ?? null);
  const schema = METADATA_SCHEMAS.find(s => s.id === selectedSchema);

  // Derived metrics from METADATA_EXTRACTION_STATS + METADATA_SCHEMAS
  const noMetadata = Math.max(0, METADATA_EXTRACTION_STATS.totalDocuments - METADATA_EXTRACTION_STATS.withMetadata);
  const totalAttributes = METADATA_SCHEMAS.reduce((sum, s) => sum + s.attributes.length, 0);
  const filterableAttributes = METADATA_SCHEMAS.reduce(
    (sum, s) => sum + s.attributes.filter(a => a.filterable).length,
    0,
  );

  // Donut: how documents got their metadata (auto vs manual vs none)
  const extractionData = [
    { name: 'Auto-Extracted', value: METADATA_EXTRACTION_STATS.autoExtracted, color: '#10b981' },
    { name: 'Manually Tagged', value: METADATA_EXTRACTION_STATS.manuallyTagged, color: '#8b5cf6' },
    { name: 'No Metadata', value: noMetadata, color: '#ef4444' },
  ];

  // Bar: attributes per schema, split by required vs optional
  const schemaAttrData = METADATA_SCHEMAS.map(s => ({
    name: s.name,
    required: s.attributes.filter(a => a.required).length,
    optional: s.attributes.filter(a => !a.required).length,
  }));

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern/data" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Data Governance
        </Link>

        <div className="flex items-end justify-between mt-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Metadata Management</h1>
              <MockDataBadge integration="Amazon Bedrock Knowledge Bases" />
            </div>
            <p className="text-slate-500 mt-1 max-w-2xl">
              RAG metadata schemas for knowledge base ingestion, with extraction statistics and filter templates.
            </p>
          </div>
        </div>

        {/* Make This Live in AWS */}
        <UnifiedGuide {...DATA_METADATA_GUIDE} />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Schemas Cataloged" value={METADATA_SCHEMAS.length} variant="info" sub={`${totalAttributes} attributes • ${filterableAttributes} filterable`} />
          <StatCard label="Documents Processed" value={METADATA_EXTRACTION_STATS.totalDocuments.toLocaleString()} variant="default" sub="total indexed" />
          <StatCard label="Extraction Coverage" value={`${METADATA_EXTRACTION_STATS.coveragePercent}%`} variant={METADATA_EXTRACTION_STATS.coveragePercent >= 90 ? 'success' : 'warning'} sub={`${METADATA_EXTRACTION_STATS.withMetadata.toLocaleString()} with metadata`} />
          <StatCard label="Avg Attributes" value={METADATA_EXTRACTION_STATS.avgAttributesPerDoc} variant="muted" sub="per document" />
        </div>

        {/* Charts: extraction-method donut + attributes per schema */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Metadata Coverage</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={extractionData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {extractionData.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-4 -mt-2">
              {extractionData.map(d => (
                <span key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />{d.name} ({d.value.toLocaleString()})
                </span>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Attributes by Schema</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={schemaAttrData} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="required" stackId="a" fill="#8b5cf6" name="Required" />
                <Bar dataKey="optional" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Optional" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-[280px_1fr] gap-6">
          {/* Schema selector */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Metadata Schemas</h3>
            <div className="space-y-2">
              {METADATA_SCHEMAS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSchema(s.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedSchema === s.id
                      ? 'bg-violet-100 border border-violet-300'
                      : 'bg-slate-50 border border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900">{s.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                      {s.attributes.length} attrs
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{s.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Schema details */}
          {schema && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-900">{schema.name} Schema</h3>
                  <span className="text-[10px] px-2 py-1 bg-violet-100 text-violet-700 rounded">
                    {schema.datasetCount} datasets
                  </span>
                </div>
                <p className="text-xs text-slate-600 mb-4">{schema.description}</p>

                <h4 className="text-xs font-semibold text-slate-700 mb-2">Attributes</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th scope="col" className="pb-2 font-medium">Name</th>
                        <th scope="col" className="pb-2 font-medium">Type</th>
                        <th scope="col" className="pb-2 font-medium">Required</th>
                        <th scope="col" className="pb-2 font-medium">Filterable</th>
                        <th scope="col" className="pb-2 font-medium">Examples</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {schema.attributes.map(attr => (
                        <tr key={attr.name} className="hover:bg-slate-50">
                          <td className="py-2 font-mono text-slate-900">{attr.name}</td>
                          <td className="py-2">
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">{attr.type}</span>
                          </td>
                          <td className="py-2">
                            {attr.required && <span className="text-emerald-600">Yes</span>}
                          </td>
                          <td className="py-2">
                            {attr.filterable && <span className="text-violet-600">Yes</span>}
                          </td>
                          <td className="py-2 text-slate-500 text-[10px]">{attr.examples.slice(0, 3).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h4 className="text-xs font-semibold text-slate-700 mb-3">Pre-built RAG Filters</h4>
                  <div className="space-y-2">
                    {schema.ragFilters.map((f, i) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-900">{f.name}</span>
                        </div>
                        <div className="font-mono text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded mb-1">
                          {f.filter}
                        </div>
                        <div className="text-[10px] text-slate-500">{f.description}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h4 className="text-xs font-semibold text-slate-700 mb-3">Filter Usage Stats</h4>
                  <div className="space-y-2">
                    {METADATA_EXTRACTION_STATS.filterUsage.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                        <span className="font-mono text-[10px] text-slate-600">{f.filter}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">{f.usageCount.toLocaleString()} uses</span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                            {f.successRate}% success
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent extractions */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Recent Metadata Extractions</h4>
                <div className="space-y-2">
                  {METADATA_EXTRACTION_STATS.recentExtractions.map((ext, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <span className="text-xs font-medium text-slate-900">{ext.document}</span>
                        <span className="ml-2 text-[10px] text-slate-500">
                          {ext.attributes} attributes extracted
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-500">
                          Confidence: <span className="font-semibold text-emerald-600">{(ext.confidence * 100).toFixed(0)}%</span>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(ext.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
