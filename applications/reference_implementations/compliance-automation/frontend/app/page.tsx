'use client';

import { useState } from 'react';

interface Deadline {
  filing_type: string;
  entity: string;
  due_date: string;
  days_remaining: number;
  urgency: string;
  status: string;
  recommended_action: string;
}

interface MonitorResult {
  as_of_date: string;
  total_deadlines: number;
  at_risk: number;
  deadlines: Deadline[];
  escalations: string[];
  summary: string;
}

const urgencyColors: Record<string, string> = {
  overdue: 'bg-red-100 text-red-800 border-red-200',
  critical: 'bg-orange-100 text-orange-800 border-orange-200',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  on_track: 'bg-green-100 text-green-800 border-green-200',
};

const urgencyBadge: Record<string, string> = {
  overdue: 'bg-red-600 text-white',
  critical: 'bg-orange-500 text-white',
  warning: 'bg-yellow-500 text-white',
  on_track: 'bg-green-500 text-white',
};

export default function DeadlineDashboard() {
  const [result, setResult] = useState<MonitorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/deadlines', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Compliance Deadline Monitor</h2>
          <p className="text-gray-500 text-sm mt-1">Track regulatory filing deadlines and escalation status</p>
        </div>
        <button
          onClick={runCheck}
          disabled={loading}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {loading ? 'Checking...' : 'Run Deadline Check'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6">{error}</div>}

      {result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border p-4">
              <div className="text-sm text-gray-500">As Of</div>
              <div className="text-lg font-semibold">{result.as_of_date}</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-sm text-gray-500">Total Deadlines</div>
              <div className="text-2xl font-bold">{result.total_deadlines}</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-sm text-gray-500">At Risk</div>
              <div className="text-2xl font-bold text-red-600">{result.at_risk}</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-sm text-gray-500">On Track</div>
              <div className="text-2xl font-bold text-green-600">{result.total_deadlines - result.at_risk}</div>
            </div>
          </div>

          {/* Summary */}
          {result.summary && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-1">Executive Summary</h3>
              <p className="text-blue-800 text-sm">{result.summary}</p>
            </div>
          )}

          {/* Escalations */}
          {result.escalations?.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-orange-900 mb-2">Escalations Required</h3>
              <ul className="list-disc list-inside text-sm text-orange-800 space-y-1">
                {result.escalations.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {/* Deadline table */}
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Filing</th>
                  <th className="text-left px-4 py-3 font-medium">Entity</th>
                  <th className="text-left px-4 py-3 font-medium">Due Date</th>
                  <th className="text-left px-4 py-3 font-medium">Days</th>
                  <th className="text-left px-4 py-3 font-medium">Urgency</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.deadlines.map((d, i) => (
                  <tr key={i} className={urgencyColors[d.urgency] || ''}>
                    <td className="px-4 py-3 font-medium uppercase">{d.filing_type}</td>
                    <td className="px-4 py-3">{d.entity}</td>
                    <td className="px-4 py-3">{d.due_date}</td>
                    <td className="px-4 py-3 font-mono">{d.days_remaining}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${urgencyBadge[d.urgency] || ''}`}>
                        {d.urgency.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize">{d.status.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-xs">{d.recommended_action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Click &quot;Run Deadline Check&quot; to invoke the compliance monitoring agent</p>
        </div>
      )}
    </div>
  );
}
