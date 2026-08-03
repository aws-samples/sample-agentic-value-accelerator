/**
 * RiskIssues — Findings and remediation tracking
 */

import { useState } from 'react';
import { ISSUES, RISKS, CONTROLS, type Issue } from './riskData';
import { Icon, type IconName } from '../icons';
import { usePersistedState } from '../usePersistedState';
import { rowButtonProps } from '../a11y';

export default function RiskIssues() {
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [issues, setIssues] = usePersistedState<Issue[]>('risk_issues', ISSUES);
  const [toast, setToast] = useState<string | null>(null);

  const updateIssueStatus = (id: string, status: Issue['status'], message: string) => {
    setIssues(prev => prev.map(i => (i.id === id ? { ...i, status } : i)));
    setToast(message);
    setTimeout(() => setToast(null), 2800);
  };

  const statuses = ['all', 'open', 'in-progress', 'remediated', 'closed'];
  const severities = ['all', 'critical', 'high', 'medium', 'low'];

  const filteredIssues = issues.filter(issue => {
    const matchesStatus = filterStatus === 'all' || issue.status === filterStatus;
    const matchesSeverity = filterSeverity === 'all' || issue.severity === filterSeverity;
    return matchesStatus && matchesSeverity;
  });

  const selectedData = selectedIssue ? issues.find(i => i.id === selectedIssue) : null;

  const getSeverityColor = (severity: Issue['severity']) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'low': return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getStatusColor = (status: Issue['status']) => {
    switch (status) {
      case 'open': return 'bg-red-50 text-red-700 border-red-200';
      case 'in-progress': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'remediated': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'closed': return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const openIssues = issues.filter(i => i.status === 'open').length;
  const inProgressIssues = issues.filter(i => i.status === 'in-progress').length;
  const overdueIssues = issues.filter(i => {
    if (i.status === 'remediated' || i.status === 'closed') return false;
    return new Date(i.dueDate) < new Date();
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Risk Issues & Findings</h3>
          <p className="text-xs text-slate-500 mt-1">Track findings, remediation plans, and risk acceptances</p>
        </div>
        <button
          onClick={() => {
            setToast('Opening issue form — enter finding details to log');
            setTimeout(() => setToast(null), 2800);
          }}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          + Log Issue
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
          <div className="text-2xl font-bold text-slate-900">{ISSUES.length}</div>
          <div className="text-xs text-slate-500 mt-1">Total Issues</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-red-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-red-600">{openIssues}</div>
          <div className="text-xs text-slate-500 mt-1">Open</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-amber-600">{inProgressIssues}</div>
          <div className="text-xs text-slate-500 mt-1">In Progress</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-orange-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-orange-600">{overdueIssues}</div>
          <div className="text-xs text-slate-500 mt-1">Overdue</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          aria-label="Filter by status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {statuses.map(status => (
            <option key={status} value={status}>
              {status === 'all' ? 'All Statuses' : status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by severity"
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="px-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {severities.map(sev => (
            <option key={sev} value={sev}>
              {sev === 'all' ? 'All Severities' : sev.charAt(0).toUpperCase() + sev.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Issues Table */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Issue</th>
              <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Severity</th>
              <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Status</th>
              <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Related Risk</th>
              <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Owner</th>
              <th scope="col" className="text-left text-[10px] font-semibold text-slate-500 uppercase px-4 py-3">Due Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredIssues.map(issue => {
              const relatedRisk = RISKS.find(r => r.id === issue.riskId);
              const isOverdue = (issue.status === 'open' || issue.status === 'in-progress') && new Date(issue.dueDate) < new Date();
              return (
                <tr
                  key={issue.id}
                  {...rowButtonProps(
                    () => setSelectedIssue(selectedIssue === issue.id ? null : issue.id),
                    `View issue ${issue.id}: ${issue.title}`
                  )}
                  className={`border-b border-slate-100 cursor-pointer transition-colors focus:outline-none focus:bg-blue-50/50 ${
                    selectedIssue === issue.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-mono text-[10px] text-slate-400">{issue.id}</div>
                    <div className="text-sm font-medium text-slate-900">{issue.title}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded border capitalize ${getSeverityColor(issue.severity)}`}>
                      {issue.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded border capitalize ${getStatusColor(issue.status)}`}>
                      {issue.status.replace('-', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-slate-600">{relatedRisk?.id || '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{issue.owner}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                      {issue.dueDate}
                      {isOverdue && <span className="ml-1 text-[9px]">OVERDUE</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Issue Detail Panel */}
      {selectedData && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs text-slate-400">{selectedData.id}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${getSeverityColor(selectedData.severity)}`}>
                  {selectedData.severity}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${getStatusColor(selectedData.status)}`}>
                  {selectedData.status.replace('-', ' ')}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{selectedData.title}</h3>
            </div>
            <button onClick={() => setSelectedIssue(null)} className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-sm text-slate-600 mb-4">{selectedData.description}</p>

          {/* Metadata */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase">Source</div>
              <div className="text-sm font-medium text-slate-900 capitalize">{selectedData.source.replace('-', ' ')}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase">Owner</div>
              <div className="text-sm font-medium text-slate-900">{selectedData.owner}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase">Identified</div>
              <div className="text-sm font-medium text-slate-900">{selectedData.dateIdentified}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase">Due Date</div>
              <div className={`text-sm font-medium ${
                (selectedData.status === 'open' || selectedData.status === 'in-progress') && new Date(selectedData.dueDate) < new Date()
                  ? 'text-red-600'
                  : 'text-slate-900'
              }`}>
                {selectedData.dueDate}
              </div>
            </div>
          </div>

          {/* Remediation Plan */}
          {selectedData.remediation && (
            <div className="mb-6">
              <div className="text-sm font-semibold text-slate-900 mb-2">Remediation Plan</div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-700">{selectedData.remediation}</p>
              </div>
            </div>
          )}

          {/* Related Risk */}
          {selectedData.riskId && (
            <div className="mb-6">
              <div className="text-sm font-semibold text-slate-900 mb-2">Related Risk</div>
              {(() => {
                const risk = RISKS.find(r => r.id === selectedData.riskId);
                if (!risk) return null;
                return (
                  <div className="p-4 bg-slate-50 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-mono text-[10px] text-slate-400 mr-2">{risk.id}</span>
                      <span className="text-sm text-slate-900">{risk.title}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-xs text-slate-500">Inherent</div>
                        <div className="text-sm font-semibold text-slate-900">{risk.inherentScore}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-500">Residual</div>
                        <div className={`text-sm font-semibold ${
                          risk.residualScore >= 15 ? 'text-red-600' :
                          risk.residualScore >= 10 ? 'text-amber-600' :
                          'text-emerald-600'
                        }`}>
                          {risk.residualScore}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Related Control */}
          {selectedData.controlId && (
            <div>
              <div className="text-sm font-semibold text-slate-900 mb-2">Related Control</div>
              {(() => {
                const control = CONTROLS.find(c => c.id === selectedData.controlId);
                if (!control) return null;
                return (
                  <div className="p-4 bg-slate-50 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-mono text-[10px] text-slate-400 mr-2">{control.id}</span>
                      <span className="text-sm text-slate-900">{control.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded capitalize ${
                        control.type === 'preventive' ? 'bg-blue-100 text-blue-700' :
                        control.type === 'detective' ? 'bg-purple-100 text-purple-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {control.type}
                      </span>
                      <span className="text-sm font-medium text-slate-600 capitalize">{control.effectiveness}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-200">
            {selectedData.status === 'open' && (
              <button
                onClick={() => updateIssueStatus(selectedData.id, 'in-progress', `Remediation started on ${selectedData.id}`)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Start Remediation
              </button>
            )}
            {selectedData.status === 'in-progress' && (
              <button
                onClick={() => updateIssueStatus(selectedData.id, 'remediated', `${selectedData.id} marked remediated`)}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Mark Remediated
              </button>
            )}
            {(selectedData.status === 'open' || selectedData.status === 'in-progress') && (
              <button
                onClick={() => updateIssueStatus(selectedData.id, 'closed', `Risk acceptance recorded for ${selectedData.id}`)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Request Risk Acceptance
              </button>
            )}
            {selectedData.status === 'remediated' && (
              <button
                onClick={() => updateIssueStatus(selectedData.id, 'open', `${selectedData.id} reopened`)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Reopen Issue
              </button>
            )}
          </div>
        </div>
      )}

      {/* Issue Sources */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Issue Sources</h3>
        <div className="grid grid-cols-4 gap-4">
          {[
            { source: 'Risk Assessment', desc: 'Findings from formal risk assessments', icon: 'clipboard-list' as IconName },
            { source: 'Audit', desc: 'Internal or external audit findings', icon: 'viewfinder-circle' as IconName },
            { source: 'Incident', desc: 'Post-incident findings', icon: 'exclamation-triangle' as IconName },
            { source: 'Self-Identified', desc: 'Proactively discovered issues', icon: 'light-bulb' as IconName },
          ].map(item => (
            <div key={item.source} className="p-4 border border-slate-200 rounded-lg">
              <Icon name={item.icon} className="w-5 h-5 mb-2 text-slate-500" />
              <div className="text-sm font-semibold text-slate-900 mb-1">{item.source}</div>
              <div className="text-xs text-slate-600">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 bg-slate-800 text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
