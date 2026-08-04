import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import Drawer from './Drawer';
import { MODELS, MODEL_DETAILS, tooltipStyle, AI_GOVERNANCE_GATES } from './mockData';
import { Icon } from './icons';

const READINESS_DIMENSIONS = [
  { key: 'compliance', label: 'Compliance', fullMark: 100 },
  { key: 'evaluation', label: 'Evaluation', fullMark: 100 },
  { key: 'deployment', label: 'Deployment', fullMark: 100 },
  { key: 'monitoring', label: 'Monitoring', fullMark: 100 },
  { key: 'documentation', label: 'Documentation', fullMark: 100 },
];

const revalidationStatusColors: Record<string, { bg: string; text: string; border: string }> = {
  'current': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'due-soon': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  'overdue': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

const riskTierColors: Record<string, { bg: string; text: string; border: string }> = {
  'Critical': { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  'High': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  'Medium': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  'Low': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
};

const controlStatusStyle: Record<string, string> = {
  'active': 'bg-emerald-100 text-emerald-700',
  'planned': 'bg-amber-100 text-amber-700',
  'not-started': 'bg-slate-100 text-slate-500',
};

interface Props {
  modelId: string | null;
  onClose: () => void;
}

const tierBg: Record<string, string> = {
  'Tier 1': 'bg-rose-50 text-rose-700 ring-rose-200',
  'Tier 2': 'bg-amber-50 text-amber-700 ring-amber-200',
  'Tier 3': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

const stepStatusBg: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-700',
  pending:  'bg-amber-100 text-amber-700',
  'n/a':    'bg-slate-100 text-slate-500',
};

export default function ModelDrawer({ modelId, onClose }: Props) {
  const model = modelId ? MODELS.find(m => m.id === modelId) : null;
  const detail = modelId ? MODEL_DETAILS[modelId] : null;

  return (
    <Drawer
      open={!!model && !!detail}
      onClose={onClose}
      title={model?.name ?? ''}
      subtitle={model ? `${model.provider} · ${model.owner} · ${model.tier}` : undefined}
      width="xl"
    >
      {model && detail && (
        <div className="space-y-5">
          {/* Consolidated Model Overview Table */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {/* Row 1: Core Identity */}
                <tr className="bg-slate-50/50">
                  <td className="px-3 py-2 text-slate-500 font-medium w-28">Provider</td>
                  <td className="px-3 py-2 text-slate-900">{model.provider}</td>
                  <td className="px-3 py-2 text-slate-500 font-medium w-28">Owner</td>
                  <td className="px-3 py-2 text-slate-900">{model.owner}</td>
                </tr>
                {/* Row 2: Classification */}
                <tr>
                  <td className="px-3 py-2 text-slate-500 font-medium">Tier</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${tierBg[model.tier]}`}>{model.tier}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 font-medium">Status</td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{model.status}</span>
                  </td>
                </tr>
                {/* Row 3: Risk */}
                {detail.riskProfile && (
                  <tr className="bg-slate-50/50">
                    <td className="px-3 py-2 text-slate-500 font-medium">Inherent Risk</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${riskTierColors[detail.riskProfile.inherentRisk].bg} ${riskTierColors[detail.riskProfile.inherentRisk].text}`}>
                        {detail.riskProfile.inherentRisk} ({detail.riskProfile.inherentScore})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 font-medium">Residual Risk</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${riskTierColors[detail.riskProfile.residualRisk].bg} ${riskTierColors[detail.riskProfile.residualRisk].text}`}>
                        {detail.riskProfile.residualRisk} ({detail.riskProfile.residualScore})
                      </span>
                      <span className="text-[10px] text-emerald-600 ml-2">
                        ↓{Math.round(((detail.riskProfile.inherentScore - detail.riskProfile.residualScore) / detail.riskProfile.inherentScore) * 100)}%
                      </span>
                    </td>
                  </tr>
                )}
                {/* Row 4: Performance */}
                <tr>
                  <td className="px-3 py-2 text-slate-500 font-medium">Eval Score</td>
                  <td className="px-3 py-2">
                    <span className="text-sm font-bold text-emerald-600">{model.evalScore}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 font-medium">Use Cases</td>
                  <td className="px-3 py-2 text-slate-900 font-semibold">{model.useCases}</td>
                </tr>
                {/* Row 5: Cost & Pricing */}
                <tr className="bg-slate-50/50">
                  <td className="px-3 py-2 text-slate-500 font-medium">Monthly Cost</td>
                  <td className="px-3 py-2 text-slate-900 font-semibold">${model.monthlyCost.toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-500 font-medium">Pricing</td>
                  <td className="px-3 py-2 text-slate-600">${detail.pricing.input}/1K in · ${detail.pricing.output}/1K out</td>
                </tr>
                {/* Row 6: Validation Dates */}
                <tr>
                  <td className="px-3 py-2 text-slate-500 font-medium">Last Validated</td>
                  <td className="px-3 py-2 text-slate-900">{model.lastValidated || '—'}</td>
                  <td className="px-3 py-2 text-slate-500 font-medium">Next Due</td>
                  <td className="px-3 py-2">
                    {detail.revalidation ? (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${revalidationStatusColors[detail.revalidation.status].bg} ${revalidationStatusColors[detail.revalidation.status].text}`}>
                        {detail.revalidation.nextDue}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
                {/* Row 7: Technical Specs */}
                <tr className="bg-slate-50/50">
                  <td className="px-3 py-2 text-slate-500 font-medium">Context</td>
                  <td className="px-3 py-2 text-slate-900">{detail.contextWindow}</td>
                  <td className="px-3 py-2 text-slate-500 font-medium">EU AI Act</td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] font-medium text-slate-700">{detail.attestation.euAiAct.classification}</span>
                    {detail.attestation.euAiAct.documented && <Icon name="check" className="w-3 h-3 text-emerald-500 ml-1 inline-block" />}
                  </td>
                </tr>
                {/* Row 8: Readiness & Compliance Summary */}
                {detail.readiness && (
                  <tr>
                    <td className="px-3 py-2 text-slate-500 font-medium">Readiness</td>
                    <td className="px-3 py-2">
                      <span className={`text-sm font-bold ${
                        Object.values(detail.readiness).reduce((a, b) => a + b, 0) / 5 >= 80 ? 'text-emerald-600' :
                        Object.values(detail.readiness).reduce((a, b) => a + b, 0) / 5 >= 60 ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        {Math.round(Object.values(detail.readiness).reduce((a, b) => a + b, 0) / 5)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 font-medium">Attestation</td>
                    <td className="px-3 py-2">
                      <span className={detail.attestation.sr26_2.attested ? 'text-emerald-600' : 'text-amber-600'}>
                        SR 26-2 {detail.attestation.sr26_2.attested ? <Icon name="check" className="w-3 h-3 inline-block" /> : <Icon name="circle" className="w-3 h-3 inline-block" />}
                      </span>
                      <span className={`ml-2 ${detail.attestation.modelCard.complete ? 'text-emerald-600' : 'text-amber-600'}`}>
                        Card {detail.attestation.modelCard.complete ? <Icon name="check" className="w-3 h-3 inline-block" /> : <Icon name="circle" className="w-3 h-3 inline-block" />}
                      </span>
                    </td>
                  </tr>
                )}
                {/* Row 9: MRM Compliance Mini */}
                {detail.mrmCompliance && (
                  <tr className="bg-slate-50/50">
                    <td className="px-3 py-2 text-slate-500 font-medium">MRM Compliance</td>
                    <td colSpan={3} className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        {detail.mrmCompliance.slice(0, 5).map((fw, i) => {
                          const pass = fw.controls.filter(c => c.status === 'pass').length;
                          const total = fw.controls.filter(c => c.status !== 'not-applicable').length;
                          const pct = total > 0 ? Math.round((pass / total) * 100) : 0;
                          const hasGaps = fw.controls.some(c => c.status === 'fail');
                          const shortName = fw.framework.includes('SR 26-2') ? 'SR' :
                                           fw.framework.includes('OSFI') ? 'OSFI' :
                                           fw.framework.includes('NIST') ? 'NIST' :
                                           fw.framework.includes('AWS') ? 'AWS' : 'EU';
                          return (
                            <div key={i} className="flex items-center gap-1" title={fw.framework}>
                              <span className="text-[10px] text-slate-500">{shortName}</span>
                              <span className={`text-[10px] font-bold ${hasGaps ? 'text-rose-600' : pct === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {pct}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">{detail.description}</p>

          {/* Compact Readiness Radar + Risk Controls Side by Side */}
          {detail.readiness && detail.riskProfile && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-3">
                <div className="text-xs font-semibold text-slate-900 mb-2">Model 360 Readiness</div>
                <ResponsiveContainer width="100%" height={140}>
                  <RadarChart data={READINESS_DIMENSIONS.map(d => ({
                    dimension: d.label,
                    value: detail.readiness[d.key as keyof typeof detail.readiness],
                    fullMark: 100,
                  }))}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fill: '#64748b', fontSize: 9 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 8 }} />
                    <Radar name="Readiness" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-3">
                <div className="text-xs font-semibold text-slate-900 mb-2">Mitigating Controls</div>
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                  {detail.riskProfile.controls.map((ctrl, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${controlStatusStyle[ctrl.status]}`}>
                        {ctrl.status === 'active' ? <Icon name="check" className="w-2.5 h-2.5" /> : ctrl.status === 'planned' ? <Icon name="circle-half" className="w-2.5 h-2.5" /> : <Icon name="circle" className="w-2.5 h-2.5" />}
                      </span>
                      <span className="text-[10px] text-slate-700 flex-1 truncate">{ctrl.name}</span>
                      {ctrl.status === 'active' && ctrl.mitigation > 0 && (
                        <span className="text-[9px] font-semibold text-emerald-600">-{ctrl.mitigation}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Evaluation & Drift Charts - Side by Side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-3">
              <div className="text-xs font-semibold text-slate-900 mb-2">Evaluation History</div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={detail.evalHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="safety"  stroke="#10b981" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="quality" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="latency" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-3 mt-1">
                <span className="text-[9px] text-emerald-600">● Safety</span>
                <span className="text-[9px] text-blue-600">● Quality</span>
                <span className="text-[9px] text-amber-600">● Latency</span>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-3">
              <div className="text-xs font-semibold text-slate-900 mb-2">Drift Signals (6-week)</div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={detail.driftSignals}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                  <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar yAxisId="left"  dataKey="quality"       fill="#3b82f6" name="Quality" />
                  <Bar yAxisId="right" dataKey="hallucination" fill="#ef4444" name="Hallucination %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Governance Approval Pipeline */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-900">AI Governance Approval Pipeline</div>
              <div className="text-[10px] text-slate-500">
                {detail.approvalChain.filter(a => a.status === 'approved').length}/{detail.approvalChain.filter(a => a.status !== 'n/a').length} gates complete
              </div>
            </div>

            {/* Pipeline progress bar */}
            <div className="flex gap-1 mb-3">
              {detail.approvalChain.filter(a => a.status !== 'n/a').map((a, i) => {
                const isAIGov = a.approver === 'AI Governance';
                return (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${
                      a.status === 'approved' ? (isAIGov ? 'bg-violet-500' : 'bg-emerald-500') :
                      a.status === 'pending' ? 'bg-amber-400' : 'bg-slate-200'
                    }`}
                    title={`${a.step}: ${a.status}`}
                  />
                );
              })}
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm divide-y divide-slate-100">
              {detail.approvalChain.map((a, i) => {
                const gateInfo = AI_GOVERNANCE_GATES.find(g => g.gate === a.step);
                const isAIGov = a.approver === 'AI Governance';
                return (
                  <div key={i} className={`px-4 py-3 ${a.status === 'n/a' ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isAIGov && (
                          <div className="w-5 h-5 rounded bg-violet-100 flex items-center justify-center">
                            <span className="text-[10px] text-violet-600">AI</span>
                          </div>
                        )}
                        <div>
                          <div className="text-sm text-slate-900 font-medium">{a.step}</div>
                          <div className="text-[11px] text-slate-500">
                            {a.approver}
                            {gateInfo && <span className="text-slate-400"> · SLA: {gateInfo.sla}</span>}
                            {a.date && <span className="text-slate-400"> · {a.date}</span>}
                          </div>
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${stepStatusBg[a.status]}`}>
                        {a.status}
                      </span>
                    </div>
                    {gateInfo && a.status !== 'n/a' && (
                      <div className="mt-2 pl-7 flex flex-wrap gap-1">
                        {gateInfo.checks.slice(0, 4).map((check, j) => (
                          <span key={j} className={`text-[9px] px-1.5 py-0.5 rounded ${
                            a.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                            a.status === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'
                          }`}>
                            {a.status === 'approved' && <Icon name="check" className="w-2.5 h-2.5 inline-block mr-0.5" />}{check.check.split('(')[0].trim()}
                          </span>
                        ))}
                        {gateInfo.checks.length > 4 && (
                          <span className="text-[9px] text-slate-400">+{gateInfo.checks.length - 4} more</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lifecycle Evidence - Compact Horizontal */}
          {detail.lifecycleEvidence && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-3">
              <div className="text-xs font-semibold text-slate-900 mb-2">Lifecycle Evidence</div>
              <div className="flex items-center gap-2">
                {detail.lifecycleEvidence.map((stage, i) => {
                  const collected = stage.artifacts.filter(a => a.status === 'collected').length;
                  const total = stage.artifacts.filter(a => a.status !== 'not-required').length;
                  const complete = collected === total && total > 0;
                  return (
                    <div key={i} className="flex-1 text-center" title={stage.artifacts.map(a => `${a.name}: ${a.status}`).join('\n')}>
                      <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-bold ${
                        complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {complete ? <Icon name="check" className="w-4 h-4" /> : `${collected}/${total}`}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-1">{stage.stage}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* OSFI E-23 Inventory - Collapsible Summary */}
          {detail.osfiInventory && (
            <details className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
              <summary className="px-3 py-2 cursor-pointer flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900">OSFI E-23 Inventory</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">17 fields</span>
                </div>
                <span className="text-[10px] text-slate-400">Click to expand</span>
              </summary>
              <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div><span className="text-slate-400">Owner:</span> {detail.osfiInventory.modelOwner}</div>
                  <div><span className="text-slate-400">Developer:</span> {detail.osfiInventory.modelDeveloper}</div>
                  <div>
                    <span className="text-slate-400">Risk:</span>{' '}
                    <span className={`font-semibold ${riskTierColors[detail.osfiInventory.riskRating].text}`}>{detail.osfiInventory.riskRating}</span>
                  </div>
                  <div><span className="text-slate-400">Dev Date:</span> {detail.osfiInventory.developmentDate}</div>
                  <div><span className="text-slate-400">Impl Date:</span> {detail.osfiInventory.implementationDate}</div>
                  <div><span className="text-slate-400">Last Valid:</span> {detail.osfiInventory.lastValidationDate}</div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <div className="text-[10px] text-slate-400 mb-1">Regulatory Scope</div>
                  <div className="flex flex-wrap gap-1">
                    {detail.osfiInventory.regulatoryScope.map((reg, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">{reg}</span>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          )}

          {/* MRM Override Tracker - Compact */}
          {detail.overrides && detail.overrides.length > 0 && (
            <details className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
              <summary className="px-3 py-2 cursor-pointer flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900">Override & Exception Log</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                    {detail.overrides.filter(o => o.status === 'active').length} active
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">{detail.overrides.length} total</span>
              </summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {detail.overrides.map((override, i) => (
                  <div key={i} className={`px-3 py-2 ${override.status === 'expired' ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                          override.type === 'policy-exception' ? 'bg-rose-100 text-rose-700' :
                          override.type === 'control-bypass' ? 'bg-orange-100 text-orange-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {override.type.split('-')[0]}
                        </span>
                        <span className="text-[10px] text-slate-700 truncate">{override.description}</span>
                      </div>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                        override.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {override.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Decommissioning Workflow - Compact */}
          {detail.decommissioning && (
            <div className="bg-gradient-to-br from-rose-50 to-amber-50 rounded-xl border border-rose-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-900">Decommissioning</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  detail.decommissioning.status === 'complete' ? 'bg-slate-100 text-slate-500' :
                  detail.decommissioning.status === 'assessment' ? 'bg-amber-100 text-amber-700' :
                  detail.decommissioning.status === 'migration' ? 'bg-blue-100 text-blue-700' :
                  'bg-violet-100 text-violet-700'
                }`}>
                  {detail.decommissioning.status.replace('-', ' ').toUpperCase()}
                </span>
              </div>
              {/* Progress Steps */}
              <div className="flex items-center gap-1 mb-2">
                {['assessment', 'migration', 'archival', 'complete'].map((stage, i) => {
                  const stageOrder = ['not-started', 'assessment', 'migration', 'archival', 'complete'];
                  const currentIdx = stageOrder.indexOf(detail.decommissioning!.status);
                  const stageIdx = stageOrder.indexOf(stage);
                  const isComplete = stageIdx < currentIdx;
                  const isCurrent = stage === detail.decommissioning!.status;
                  return (
                    <div key={i} className="flex items-center flex-1">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isComplete ? 'bg-emerald-500 text-white' :
                        isCurrent ? 'bg-amber-500 text-white' :
                        'bg-slate-200 text-slate-500'
                      }`}>
                        {isComplete ? <Icon name="check" className="w-3 h-3" /> : i + 1}
                      </div>
                      {i < 3 && <div className={`flex-1 h-0.5 mx-1 ${isComplete ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                    </div>
                  );
                })}
              </div>
              {/* Key Info Row */}
              <div className="flex items-center gap-3 text-[10px]">
                {detail.decommissioning.replacementModelId && (
                  <span>
                    <span className="text-slate-500">Replacement:</span>{' '}
                    <span className="font-medium text-blue-700">
                      {MODELS.find(m => m.id === detail.decommissioning!.replacementModelId)?.name || detail.decommissioning.replacementModelId}
                    </span>
                  </span>
                )}
                <span className="text-slate-500">
                  {detail.decommissioning.dependentUseCases.filter(uc => uc.migrationStatus === 'complete').length}/
                  {detail.decommissioning.dependentUseCases.length} use cases migrated
                </span>
                <span className="text-slate-500">
                  {detail.decommissioning.approvals.filter(a => a.status === 'approved').length}/
                  {detail.decommissioning.approvals.length} approvals
                </span>
              </div>
            </div>
          )}

          {/* Use cases - Compact */}
          <details className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm" open>
            <summary className="px-3 py-2 cursor-pointer flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900">Use Cases</span>
              <span className="text-[10px] text-slate-500">{detail.useCasesList.length} total</span>
            </summary>
            <div className="divide-y divide-slate-100 border-t border-slate-100 max-h-32 overflow-y-auto">
              {detail.useCasesList.map((u, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-slate-900 truncate">{u.name}</span>
                    <span className="text-[9px] text-slate-400 shrink-0">{u.owner}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{u.invocations.toLocaleString()}/mo</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </Drawer>
  );
}
