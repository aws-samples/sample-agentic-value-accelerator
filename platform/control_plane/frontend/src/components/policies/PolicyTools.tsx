/**
 * PolicyTools — Version history, comparison, import/export for Cedar policies.
 *
 * Similar to Guardrails Tools section:
 * - Version history with diff view
 * - Side-by-side policy comparison
 * - Import/Export (JSON, Cedar)
 */

import { useState } from 'react';

type ToolTab = 'history' | 'compare' | 'import-export';

interface PolicyVersion {
  id: string;
  version: number;
  timestamp: string;
  author: string;
  changes: string;
  status: 'active' | 'previous' | 'draft';
}

const POLICY_VERSIONS: PolicyVersion[] = [
  { id: 'v5', version: 5, timestamp: '2024-06-11 14:32', author: 'sarah.chen', changes: 'Added token budget limits', status: 'active' },
  { id: 'v4', version: 4, timestamp: '2024-06-09 09:15', author: 'alex.rivera', changes: 'Expanded S3 bucket allowlist', status: 'previous' },
  { id: 'v3', version: 3, timestamp: '2024-06-05 16:48', author: 'sarah.chen', changes: 'Added model tier restrictions', status: 'previous' },
  { id: 'v2', version: 2, timestamp: '2024-05-28 11:22', author: 'mike.johnson', changes: 'Initial production rules', status: 'previous' },
  { id: 'v1', version: 1, timestamp: '2024-05-15 10:00', author: 'alex.rivera', changes: 'Initial draft', status: 'previous' },
];

const SAMPLE_POLICIES_FOR_COMPARE = [
  { id: 'restricted-ops', name: 'Restricted Operations' },
  { id: 'cost-control', name: 'Cost Control' },
  { id: 'data-boundary', name: 'Data Boundary' },
  { id: 'audit-everything', name: 'Full Audit' },
];

const POLICY_CEDAR = {
  'restricted-ops': `// Restricted Operations Policy v5
// Last modified: 2024-06-11 by sarah.chen

// Deny dangerous tool execution
forbid (
  principal,
  action in [
    Action::"tools:bash_execute",
    Action::"tools:shell_command",
    Action::"tools:file_write",
    Action::"tools:file_delete"
  ],
  resource
);

// Deny external network egress
forbid (
  principal,
  action == Action::"network:egress",
  resource
) unless {
  resource.endpoint in principal.allowedEndpoints
};

// Token budget enforcement
forbid (
  principal,
  action == Action::"bedrock:InvokeModel",
  resource
) when {
  context.sessionTokens >= 100000
};`,

  'cost-control': `// Cost Control Policy v3
// Last modified: 2024-06-09 by alex.rivera

// Restrict premium model access
forbid (
  principal,
  action == Action::"bedrock:InvokeModel",
  resource in [
    Model::"claude-opus-4",
    Model::"claude-opus-4-0"
  ]
) unless {
  principal.costTier == "premium"
};

// Daily token limit
forbid (
  principal,
  action == Action::"bedrock:InvokeModel",
  resource
) when {
  context.dailyTokens >= 1000000
};`,

  'data-boundary': `// Data Boundary Policy v4
// Last modified: 2024-06-08 by sarah.chen

// S3 access restricted to allowed buckets
permit (
  principal,
  action in [
    Action::"s3:GetObject",
    Action::"s3:PutObject",
    Action::"s3:ListBucket"
  ],
  resource
) when {
  resource.bucket in principal.allowedBuckets
};

// Deny access to PII without clearance
forbid (
  principal,
  action,
  resource
) when {
  resource.classification == "PII" &&
  principal.piiClearance != true
};`,

  'audit-everything': `// Full Audit Policy v2
// Last modified: 2024-05-30 by mike.johnson

// Require trace context on all actions
forbid (
  principal,
  action,
  resource
) unless {
  context.traceId != "" &&
  context.spanId != ""
};

// Require logging enabled
forbid (
  principal,
  action,
  resource
) unless {
  context.loggingEnabled == true
};`,
};

const VERSION_DIFF = `@@ -12,6 +12,15 @@ forbid (
   resource
 );

+// Token budget enforcement
+forbid (
+  principal,
+  action == Action::"bedrock:InvokeModel",
+  resource
+) when {
+  context.sessionTokens >= 100000
+};
+
 // Deny external network egress
 forbid (`;

export default function PolicyTools() {
  const [activeTab, setActiveTab] = useState<ToolTab>('history');
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [leftPolicy, setLeftPolicy] = useState('restricted-ops');
  const [rightPolicy, setRightPolicy] = useState('cost-control');

  const tabs: { id: ToolTab; label: string }[] = [
    { id: 'history', label: 'Version History' },
    { id: 'compare', label: 'Compare Policies' },
    { id: 'import-export', label: 'Import / Export' },
  ];

  const toggleVersion = (id: string) => {
    if (selectedVersions.includes(id)) {
      setSelectedVersions(selectedVersions.filter(v => v !== id));
    } else if (selectedVersions.length < 2) {
      setSelectedVersions([...selectedVersions, id]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Version History */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Select policy: <span className="font-medium text-slate-800">Restricted Operations</span>
            </div>
            {selectedVersions.length === 2 && (
              <button
                onClick={() => window.alert(`Comparing versions: ${selectedVersions.join(' vs ')}`)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Compare Selected Versions
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-100">
              {POLICY_VERSIONS.map((version, index) => (
                <div
                  key={version.id}
                  className={`p-4 hover:bg-slate-50 transition-colors ${
                    selectedVersions.includes(version.id) ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedVersions.includes(version.id)}
                        onChange={() => toggleVersion(version.id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">Version {version.version}</span>
                          {version.status === 'active' && (
                            <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-600 mt-0.5">{version.changes}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          {version.timestamp} by {version.author}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => window.alert(`Viewing version ${version.version}`)}
                        className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        View
                      </button>
                      {version.status !== 'active' && (
                        <button
                          onClick={() => window.alert(`Restoring version ${version.version}`)}
                          className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Show diff from previous version */}
                  {index === 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="text-xs font-medium text-slate-500 mb-2">Changes from v{version.version - 1}:</div>
                      <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs overflow-x-auto font-mono">
                        <span className="text-slate-500">{VERSION_DIFF.split('\n').slice(0, 3).join('\n')}</span>
                        {'\n'}
                        <span className="text-emerald-400">{VERSION_DIFF.split('\n').slice(3, 12).join('\n')}</span>
                        {'\n'}
                        <span className="text-slate-500">{VERSION_DIFF.split('\n').slice(12).join('\n')}</span>
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Compare Policies */}
      {activeTab === 'compare' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Left Policy</label>
              <select
                value={leftPolicy}
                onChange={e => setLeftPolicy(e.target.value)}
                className="mt-1 w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                {SAMPLE_POLICIES_FOR_COMPARE.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="pt-6">
              <button
                onClick={() => {
                  const temp = leftPolicy;
                  setLeftPolicy(rightPolicy);
                  setRightPolicy(temp);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                ⇄
              </button>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Right Policy</label>
              <select
                value={rightPolicy}
                onChange={e => setRightPolicy(e.target.value)}
                className="mt-1 w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                {SAMPLE_POLICIES_FOR_COMPARE.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 bg-slate-50 border-b border-slate-200">
                <span className="font-medium text-slate-800">
                  {SAMPLE_POLICIES_FOR_COMPARE.find(p => p.id === leftPolicy)?.name}
                </span>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-700 overflow-x-auto max-h-[500px] overflow-y-auto">
                {POLICY_CEDAR[leftPolicy as keyof typeof POLICY_CEDAR]}
              </pre>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 bg-slate-50 border-b border-slate-200">
                <span className="font-medium text-slate-800">
                  {SAMPLE_POLICIES_FOR_COMPARE.find(p => p.id === rightPolicy)?.name}
                </span>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-700 overflow-x-auto max-h-[500px] overflow-y-auto">
                {POLICY_CEDAR[rightPolicy as keyof typeof POLICY_CEDAR]}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Import / Export */}
      {activeTab === 'import-export' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Import */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="text-lg font-semibold text-slate-900 mb-2">Import Policy</div>
            <p className="text-sm text-slate-600 mb-4">
              Import a Cedar policy from a file or paste the policy directly.
            </p>

            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer">
                <div className="text-3xl mb-2">📄</div>
                <div className="text-sm font-medium text-slate-700">Drop a .cedar or .json file here</div>
                <div className="text-xs text-slate-500 mt-1">or click to browse</div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">or</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500">Paste Cedar Policy</label>
                <textarea
                  rows={6}
                  placeholder="forbid ( principal, action, resource ) when { ... };"
                  className="mt-1 w-full p-3 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <button
                onClick={() => window.alert('Import functionality coming soon')}
                className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Import Policy
              </button>
            </div>
          </div>

          {/* Export */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="text-lg font-semibold text-slate-900 mb-2">Export Policy</div>
            <p className="text-sm text-slate-600 mb-4">
              Export policies for backup, sharing, or deployment to other environments.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500">Select Policy</label>
                <select className="mt-1 w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                  <option value="">All policies</option>
                  {SAMPLE_POLICIES_FOR_COMPARE.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500">Format</label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input type="radio" name="format" value="cedar" defaultChecked className="text-blue-600" />
                    <div>
                      <div className="text-sm font-medium text-slate-800">.cedar</div>
                      <div className="text-xs text-slate-500">Native Cedar format</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input type="radio" name="format" value="json" className="text-blue-600" />
                    <div>
                      <div className="text-sm font-medium text-slate-800">.json</div>
                      <div className="text-xs text-slate-500">With metadata</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500">Include</label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded border-slate-300 text-blue-600" />
                    <span className="text-sm text-slate-700">Version history</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded border-slate-300 text-blue-600" />
                    <span className="text-sm text-slate-700">Agent assignments</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded border-slate-300 text-blue-600" />
                    <span className="text-sm text-slate-700">Audit logs (last 30 days)</span>
                  </label>
                </div>
              </div>

              <button
                onClick={() => window.alert('Export functionality coming soon')}
                className="w-full py-2.5 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-900 transition-colors"
              >
                Download Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
