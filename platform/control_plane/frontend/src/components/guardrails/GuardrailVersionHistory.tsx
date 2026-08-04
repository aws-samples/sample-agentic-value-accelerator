/**
 * GuardrailVersionHistory — Show version changes over time for a guardrail
 */

import { useState } from 'react';

interface VersionEntry {
  version: string;
  createdAt: string;
  createdBy: string;
  status: 'active' | 'superseded' | 'draft';
  changes: ChangeItem[];
  notes?: string;
}

interface ChangeItem {
  type: 'added' | 'removed' | 'modified';
  category: string;
  description: string;
}

interface Props {
  guardrailId: string;
  guardrailName: string;
  onClose?: () => void;
  onRevert?: (version: string) => void;
}

const MOCK_VERSIONS: VersionEntry[] = [
  {
    version: 'v3',
    createdAt: '2024-06-08T14:30:00Z',
    createdBy: 'alex.rivera@example.com',
    status: 'active',
    changes: [
      { type: 'added', category: 'Denied Topics', description: 'Added "Insider Trading" topic with 3 examples' },
      { type: 'modified', category: 'Content Filter', description: 'Increased MISCONDUCT filter strength from MEDIUM to HIGH' },
    ],
    notes: 'Added trading compliance controls per regulatory review',
  },
  {
    version: 'v2',
    createdAt: '2024-06-05T10:15:00Z',
    createdBy: 'alex.rivera@example.com',
    status: 'superseded',
    changes: [
      { type: 'added', category: 'PII Detection', description: 'Added US_BANK_ACCOUNT_NUMBER with BLOCK action' },
      { type: 'added', category: 'PII Detection', description: 'Added US_BANK_ROUTING_NUMBER with BLOCK action' },
      { type: 'modified', category: 'Contextual Grounding', description: 'Enabled grounding with 0.8 threshold' },
    ],
    notes: 'Enhanced PII protection for banking data',
  },
  {
    version: 'v1',
    createdAt: '2024-06-01T09:00:00Z',
    createdBy: 'alex.rivera@example.com',
    status: 'superseded',
    changes: [
      { type: 'added', category: 'Content Filter', description: 'Initial content filters (HATE, INSULTS, SEXUAL, VIOLENCE)' },
      { type: 'added', category: 'PII Detection', description: 'Added SSN, CREDIT_CARD, EMAIL detection' },
      { type: 'added', category: 'Word Filter', description: 'Enabled profanity filter' },
    ],
    notes: 'Initial guardrail creation from FSI Standard template',
  },
];

export default function GuardrailVersionHistory({ guardrailName, onClose, onRevert }: Props) {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [compareVersion, setCompareVersion] = useState<string | null>(null);

  const versions = MOCK_VERSIONS;

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getChangeIcon = (type: string) => {
    switch (type) {
      case 'added': return { icon: '+', bg: 'bg-emerald-100', text: 'text-emerald-700' };
      case 'removed': return { icon: '−', bg: 'bg-red-100', text: 'text-red-700' };
      case 'modified': return { icon: '~', bg: 'bg-amber-100', text: 'text-amber-700' };
      default: return { icon: '•', bg: 'bg-slate-100', text: 'text-slate-700' };
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active': return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
      case 'superseded': return { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200' };
      case 'draft': return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
      default: return { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Version History</h2>
          <p className="text-sm text-slate-500 mt-1">{guardrailName} — {versions.length} versions</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowComparison(!showComparison)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              showComparison ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Compare Versions
          </button>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Comparison Mode Selector */}
      {showComparison && (
        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
          <p className="text-sm text-blue-800 mb-3">Select two versions to compare:</p>
          <div className="flex items-center gap-4">
            <select
              value={selectedVersion || ''}
              onChange={e => setSelectedVersion(e.target.value)}
              className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm"
            >
              <option value="">Select base version...</option>
              {versions.map(v => (
                <option key={v.version} value={v.version}>{v.version} ({formatDate(v.createdAt)})</option>
              ))}
            </select>
            <span className="text-sm text-blue-600">vs</span>
            <select
              value={compareVersion || ''}
              onChange={e => setCompareVersion(e.target.value)}
              className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm"
            >
              <option value="">Select compare version...</option>
              {versions.filter(v => v.version !== selectedVersion).map(v => (
                <option key={v.version} value={v.version}>{v.version} ({formatDate(v.createdAt)})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />

        <div className="space-y-4">
          {versions.map((version) => {
            const statusStyle = getStatusStyle(version.status);
            const isSelected = selectedVersion === version.version || compareVersion === version.version;

            return (
              <div
                key={version.version}
                className={`relative pl-10 ${isSelected ? 'bg-blue-50/50 -mx-4 px-4 py-3 rounded-xl border border-blue-200' : ''}`}
              >
                {/* Timeline dot */}
                <div className={`absolute left-2 w-5 h-5 rounded-full border-2 ${
                  version.status === 'active'
                    ? 'bg-emerald-500 border-emerald-300'
                    : 'bg-white border-slate-300'
                } flex items-center justify-center`}>
                  {version.status === 'active' && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>

                {/* Version Card */}
                <div className={`p-4 rounded-xl border ${statusStyle.border} bg-white`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-slate-900">{version.version}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusStyle.bg} ${statusStyle.text}`}>
                        {version.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {version.status !== 'active' && onRevert && (
                        <button
                          onClick={() => onRevert(version.version)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Revert to this
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                    <span>{formatDate(version.createdAt)}</span>
                    <span>•</span>
                    <span>{version.createdBy}</span>
                  </div>

                  {version.notes && (
                    <p className="text-sm text-slate-600 mb-3 italic">"{version.notes}"</p>
                  )}

                  {/* Changes */}
                  <div className="space-y-2">
                    {version.changes.map((change, j) => {
                      const changeStyle = getChangeIcon(change.type);
                      return (
                        <div key={j} className="flex items-start gap-2">
                          <span className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${changeStyle.bg} ${changeStyle.text}`}>
                            {changeStyle.icon}
                          </span>
                          <div className="flex-1">
                            <span className="text-xs font-medium text-slate-700">{change.category}:</span>
                            <span className="text-xs text-slate-600 ml-1">{change.description}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
