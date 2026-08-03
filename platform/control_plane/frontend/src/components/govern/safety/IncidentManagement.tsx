/**
 * IncidentManagement — the AI-incident LIFECYCLE surface for the Safety module.
 *
 * Tracks incidents through detect → triage → mitigate → resolve → report, plus
 * near-miss capture (the leading indicator). Surfaces the EU AI Act Article 73
 * serious-incident reporting clocks (2/10/15-day statutory deadlines, in force
 * 2026-08-02).
 *
 * This is the LIFECYCLE view. The append-only audit log (/govern/audit) is the
 * immutable evidence trail this draws from — evidence, not lifecycle.
 *
 * Data flow: Fetches live incident events from governAuditApi.list('incident'),
 * then supplements with static mock incidents for demo completeness.
 */
import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import GovernPageLayout from '../GovernPageLayout';
import { LiveDataBadge, MockDataBadge } from '../DataSourceIndicator';
import StatCard from '../StatCard';
import { Icon } from '../icons';
import { governAuditApi, type GovernAuditEvent } from '../../../api/client';
import {
  INCIDENTS,
  INCIDENT_FIXTURE_TODAY,
  computeIncidentCounts,
  CATEGORY_LABELS,
  STATUS_LABELS,
  SEVERITY_LABELS,
  type Incident,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentCategory,
  type ReportClockDays,
} from './incidentData';

const tooltipStyle = {
  background: 'rgba(255,255,255,0.98)', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 12, color: '#0f172a', boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
};

const severityBadge: Record<IncidentSeverity, string> = {
  critical: 'bg-rose-100 text-rose-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  'near-miss': 'bg-sky-100 text-sky-700',
};

const statusBadge: Record<IncidentStatus, string> = {
  detected: 'bg-rose-100 text-rose-700',
  triaging: 'bg-amber-100 text-amber-700',
  mitigating: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  reported: 'bg-violet-100 text-violet-700',
};

const categoryColor: Record<IncidentCategory, string> = {
  'harmful-output': '#ef4444',
  'pii-exposure': '#f97316',
  'prompt-injection': '#8b5cf6',
  hallucination: '#f59e0b',
  availability: '#0ea5e9',
  bias: '#14b8a6',
};

/** EU Art. 73 clock → badge styling; sooner clocks are more urgent. */
const clockBadge: Record<Exclude<ReportClockDays, null>, string> = {
  2: 'bg-rose-100 text-rose-700 border-rose-300',
  10: 'bg-orange-100 text-orange-700 border-orange-300',
  15: 'bg-amber-100 text-amber-700 border-amber-300',
};

/**
 * Map a GovernAuditEvent (category: 'incident') to the Incident display format.
 * Live audit events provide timestamp, severity, summary, actor, and evidence;
 * we synthesize default values for lifecycle fields not tracked in the audit log.
 */
function auditEventToIncident(event: GovernAuditEvent): Incident {
  // Map audit severity to incident severity
  const severityMap: Record<string, IncidentSeverity> = {
    critical: 'critical',
    high: 'high',
    medium: 'medium',
    low: 'near-miss',
  };
  const severity = severityMap[event.severity] ?? 'medium';

  // Infer category from summary keywords (best-effort)
  let category: IncidentCategory = 'availability';
  const lowerSummary = event.summary.toLowerCase();
  if (lowerSummary.includes('pii') || lowerSummary.includes('personal') || lowerSummary.includes('data leak')) {
    category = 'pii-exposure';
  } else if (lowerSummary.includes('injection') || lowerSummary.includes('jailbreak')) {
    category = 'prompt-injection';
  } else if (lowerSummary.includes('hallucin') || lowerSummary.includes('fabricat')) {
    category = 'hallucination';
  } else if (lowerSummary.includes('harm') || lowerSummary.includes('unsafe')) {
    category = 'harmful-output';
  } else if (lowerSummary.includes('bias') || lowerSummary.includes('fair')) {
    category = 'bias';
  }

  // Parse timestamp to ISO date
  const detectedAt = event.ts.includes(' ')
    ? event.ts.split(' ')[0]
    : event.ts.split('T')[0];

  return {
    id: event.id,
    title: event.summary.length > 60 ? event.summary.slice(0, 57) + '...' : event.summary,
    severity,
    category,
    status: 'detected', // Live events start in detected state
    affected: event.agent || 'Unknown agent',
    detectedAt,
    reportable: severity === 'critical' || severity === 'high',
    reportClockDays: severity === 'critical' ? 2 : severity === 'high' ? 15 : null,
    reportDeadline: 'n/a', // Would need to calculate from detectedAt + clock
    summary: event.summary,
    remediation: event.action || 'Under investigation',
  };
}

export default function IncidentManagement() {
  const [liveIncidents, setLiveIncidents] = useState<Incident[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch live incident events from the audit API
  useEffect(() => {
    let mounted = true;
    async function fetchIncidents() {
      try {
        const events = await governAuditApi.list('incident');
        if (!mounted) return;
        const mapped = events.map(auditEventToIncident);
        setLiveIncidents(mapped);
        setIsLive(events.length > 0);
      } catch {
        // Backend offline — fall back to mock only
        if (mounted) setIsLive(false);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void fetchIncidents();
    return () => { mounted = false; };
  }, []);

  // Combine live incidents with mock fallback (dedupe by id)
  const allIncidents = useMemo(() => {
    const liveIds = new Set(liveIncidents.map(i => i.id));
    const mockOnly = INCIDENTS.filter(i => !liveIds.has(i.id));
    return [...liveIncidents, ...mockOnly];
  }, [liveIncidents]);

  const counts = useMemo(() => computeIncidentCounts(allIncidents, INCIDENT_FIXTURE_TODAY), [allIncidents]);

  const categoryData = useMemo(
    () =>
      (Object.keys(counts.byCategory) as IncidentCategory[])
        .map(c => ({ id: c, name: CATEGORY_LABELS[c], value: counts.byCategory[c] }))
        .filter(d => d.value > 0),
    [counts.byCategory],
  );

  // Track which incident IDs came from live data
  const liveIncidentIds = useMemo(() => new Set(liveIncidents.map(i => i.id)), [liveIncidents]);

  return (
    <GovernPageLayout
      title="Incident Management"
      description="The AI-incident lifecycle — detect, triage, mitigate, resolve, report — plus near-miss capture and EU AI Act Article 73 serious-incident reporting clocks. Distinct from the append-only audit log, which is the evidence trail this draws from."
      badge={
        isLive ? (
          <LiveDataBadge source="Audit Log" detail={`${liveIncidents.length} live incident events from governAuditApi`} />
        ) : (
          <MockDataBadge integration="CoSAI IR Framework · EU AI Act Art. 73 · AIID/OECD" />
        )
      }
      backPath="/govern/safety"
      backLabel="AI Safety"
    >
      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Open incidents"
          value={loading ? '...' : counts.open}
          variant={counts.open ? 'danger' : 'success'}
          sub={isLive ? `${liveIncidents.length} from audit log` : 'not yet resolved'}
        />
        <StatCard label="Near-misses" value={loading ? '...' : counts.nearMisses} variant="info" sub="leading indicator" />
        <StatCard
          label="Reportable (Art. 73)"
          value={loading ? '...' : counts.reportable}
          variant={counts.approachingDeadline ? 'warning' : counts.reportable ? 'info' : 'muted'}
          sub={counts.approachingDeadline ? `${counts.approachingDeadline} deadline soon` : 'EU serious-incident'}
        />
        <StatCard label="Resolved" value={loading ? '...' : counts.resolved + counts.reported} variant="success" sub="closed out" />
      </div>

      {/* EU AI Act Article 73 reporting clocks callout */}
      <div className="bg-white rounded-xl border border-amber-200 overflow-hidden mb-6">
        <div className="flex items-center gap-2 px-5 py-3 bg-amber-50/70 border-b border-amber-200">
          <Icon name="clipboard-list" className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-amber-900">EU AI Act Article 73 — serious-incident reporting clocks</h2>
          <span className="ml-auto text-[10px] text-amber-700 font-medium">in force 2026-08-02</span>
        </div>
        <div className="px-5 py-4">
          <p className="text-[12px] text-slate-600 leading-relaxed mb-3 max-w-3xl">
            For high-risk AI systems, providers must report a <span className="font-medium text-slate-800">serious incident</span> to
            the relevant market-surveillance authority without undue delay, and no later than the statutory deadline. The clock that
            applies depends on the incident's nature:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
              <div className="text-2xl font-semibold text-rose-700">2 days</div>
              <div className="text-[11px] text-slate-600 mt-1">Widespread infringement, or serious-and-irreversible disruption of critical infrastructure.</div>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3">
              <div className="text-2xl font-semibold text-orange-700">10 days</div>
              <div className="text-[11px] text-slate-600 mt-1">Where the serious incident resulted in a person's death.</div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="text-2xl font-semibold text-amber-700">15 days</div>
              <div className="text-[11px] text-slate-600 mt-1">General serious incident — the default reporting clock.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Incidents table + category chart */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mb-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Incident lifecycle</h3>
              <p className="text-[11px] text-slate-500">
                {loading ? 'Loading...' : `${counts.total} tracked · ${counts.nearMisses} near-misses`}
                {isLive && <span className="text-emerald-600 ml-1">· {liveIncidents.length} live</span>}
              </p>
            </div>
            {isLive && (
              <span className="inline-flex items-center gap-1 text-[9px] px-2 py-1 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live audit data
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 text-[10px] text-slate-500 uppercase tracking-wide">
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Incident</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Severity</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Category</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Art. 73</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allIncidents.map(inc => (
                  <tr key={inc.id} className="hover:bg-slate-50/60 align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{inc.title}</span>
                        {liveIncidentIds.has(inc.id) && (
                          <span className="inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
                            <span className="w-1 h-1 rounded-full bg-emerald-500" />
                            live
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">{inc.id} · {inc.affected}</div>
                      <div className="text-[10px] text-slate-500 max-w-md mt-0.5">{inc.summary}</div>
                      <div className="text-[10px] text-slate-400 max-w-md mt-1">
                        <span className="font-medium text-slate-500">Remediation:</span> {inc.remediation}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${severityBadge[inc.severity]}`}>
                        {SEVERITY_LABELS[inc.severity]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-600 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: categoryColor[inc.category] }} />
                        {CATEGORY_LABELS[inc.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${statusBadge[inc.status]}`}>
                        {STATUS_LABELS[inc.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {inc.reportable && inc.reportClockDays !== null ? (
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${clockBadge[inc.reportClockDays]}`}>
                          {inc.reportClockDays}-day clock
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">not reportable</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-600 whitespace-nowrap font-mono">
                      {inc.reportDeadline === 'n/a' ? <span className="text-slate-300">—</span> : inc.reportDeadline}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Incidents by category</h3>
          <p className="text-[11px] text-slate-500 mb-3">AIID/OECD-style taxonomy</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 10, fill: '#475569' }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {categoryData.map(d => (
                  <Cell key={d.id} fill={categoryColor[d.id]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Response Playbooks CTA */}
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl border border-indigo-200 p-4 flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Icon name="clipboard-list" className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-indigo-900">Incident Response Playbooks</div>
            <div className="text-[11px] text-indigo-700 max-w-lg">
              SSM-backed runbook templates for AI incidents: agent quarantine, guardrail escalation, model rollback, PII exposure, prompt injection containment. Includes Art. 73 deadline tracking.
            </div>
          </div>
        </div>
        <Link
          to="/govern/safety/playbooks"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition flex items-center gap-2"
        >
          <Icon name="arrow-right" className="w-4 h-4" />
          Open Playbooks
        </Link>
      </div>

      {/* Explainer: lifecycle vs. audit trail */}
      <div className="bg-blue-50/60 rounded-xl border border-blue-100 p-4 flex items-start gap-3">
        <Icon name="information-circle" className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-[12px] text-blue-900 leading-relaxed">
          <span className="font-semibold">Lifecycle, not evidence.</span> This surface tracks the <span className="font-medium">incident lifecycle</span> —
          how an AI incident is detected, triaged, mitigated, resolved, and (where EU AI Act Art. 73 applies) reported — grounded in the
          CoSAI AI Incident Response Framework and the AIID/OECD incident taxonomy. The append-only{' '}
          <Link to="/govern/audit" className="font-medium underline decoration-blue-300 hover:text-blue-700">audit &amp; incidents log</Link>{' '}
          is the immutable evidence trail this draws from — it records what happened; this manages what to do about it.
          {isLive ? (
            <span className="ml-1">
              Incidents marked <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 mx-0.5"><span className="w-1 h-1 rounded-full bg-emerald-500" />live</span>
              are derived from the real audit log; others are illustrative fixtures.
            </span>
          ) : (
            <span className="ml-1">Incident records here are illustrative; the audit log they reference is real.</span>
          )}
        </div>
      </div>
    </GovernPageLayout>
  );
}
