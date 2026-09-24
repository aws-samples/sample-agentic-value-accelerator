/**
 * PathJailEditor - Rule management UI for harness path security
 *
 * Provides a comprehensive interface for managing path jailing rules that
 * prevent unauthorized file access by AI harnesses. Features:
 * - Current rules display with enable/disable toggles
 * - Add new rule form with pattern testing
 * - Default blocked patterns section (read-only)
 * - Recent violations panel
 * - Pattern testing tool
 * - Harness-specific overrides
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import GovernPageLayout from './GovernPageLayout';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import StatCard from './StatCard';
import { Icon } from './icons';
import Drawer from './Drawer';
import { DataSourceInfo, getPageDataSources } from './DataSourceInfo';

// ---------------------------------------------------------------------------
// Types matching backend models
// ---------------------------------------------------------------------------

type PatternType = 'glob' | 'regex' | 'exact';
type RuleScope = 'global' | 'harness';
type ViolationType = 'traversal_attack' | 'symlink_escape' | 'absolute_outside' | 'blocked_pattern' | 'not_allowed';

interface PathJailRule {
  id: string;
  pattern: string;
  pattern_type: PatternType;
  description: string;
  scope: RuleScope;
  harness_types: string[];
  enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at?: string;
}

interface PathJailRulesResponse {
  rules: PathJailRule[];
  total: number;
  default_count: number;
  custom_count: number;
  live?: boolean;
}

interface PathJailViolation {
  id: string;
  timestamp: string;
  path: string;
  harness_type: string;
  user_identity: string;
  violation_type: ViolationType;
  matched_rule_id?: string;
  matched_pattern?: string;
  details: string;
}

interface PathTestResult {
  path: string;
  would_be_blocked: boolean;
  matching_rules: PathJailRule[];
  reason: string;
}

interface PatternTestResult {
  path: string;
  pattern: string;
  pattern_type: PatternType;
  matched: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function fetchRules(includeDisabled = false): Promise<PathJailRulesResponse> {
  const resp = await fetch(`${API_URL}/api/v1/govern/path-jail/rules?include_disabled=${includeDisabled}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error('Failed to fetch rules');
  return resp.json();
}

async function createRule(rule: Omit<PathJailRule, 'id' | 'is_default' | 'created_at' | 'updated_at'>): Promise<PathJailRule> {
  const resp = await fetch(`${API_URL}/api/v1/govern/path-jail/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  if (!resp.ok) throw new Error('Failed to create rule');
  return resp.json();
}

async function updateRule(ruleId: string, update: Partial<PathJailRule>): Promise<PathJailRule> {
  const resp = await fetch(`${API_URL}/api/v1/govern/path-jail/rules/${ruleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!resp.ok) throw new Error('Failed to update rule');
  return resp.json();
}

async function deleteRule(ruleId: string): Promise<void> {
  const resp = await fetch(`${API_URL}/api/v1/govern/path-jail/rules/${ruleId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error('Failed to delete rule');
}

async function runPathTest(path: string, harnessType?: string): Promise<PathTestResult> {
  const resp = await fetch(`${API_URL}/api/v1/govern/path-jail/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, harness_type: harnessType }),
  });
  if (!resp.ok) throw new Error('Failed to test path');
  return resp.json();
}

async function runPatternTest(
  path: string,
  pattern: string,
  patternType: PatternType,
): Promise<PatternTestResult> {
  const resp = await fetch(`${API_URL}/api/v1/govern/path-jail/test-pattern`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, pattern, pattern_type: patternType }),
  });
  if (!resp.ok) throw new Error('Failed to test pattern');
  return resp.json();
}

async function fetchViolations(limit = 10): Promise<{ violations: PathJailViolation[]; total: number }> {
  const resp = await fetch(`${API_URL}/api/v1/govern/path-jail/violations?limit=${limit}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error('Failed to fetch violations');
  return resp.json();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HARNESS_TYPES = [
  'claude-code',
  'kiro-ide',
  'kiro-cli',
  'mcp-server',
  'bedrock-agent',
  'codex-cli',
  'opencode',
  'cursor',
  'copilot',
];

const PATTERN_TYPE_CONFIG: Record<PatternType, { label: string; description: string; example: string }> = {
  glob: {
    label: 'Glob',
    description: 'Shell-style wildcards (* and **)',
    example: '**/secrets/**',
  },
  regex: {
    label: 'Regex',
    description: 'Regular expression pattern',
    example: '.*\\.env(\\..*)?$',
  },
  exact: {
    label: 'Exact',
    description: 'Exact path match',
    example: '/etc/passwd',
  },
};

const VIOLATION_TYPE_CONFIG: Record<ViolationType, { label: string; color: string; bgColor: string }> = {
  traversal_attack: { label: 'Traversal Attack', color: 'text-rose-700', bgColor: 'bg-rose-100' },
  symlink_escape: { label: 'Symlink Escape', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  absolute_outside: { label: 'Outside Jail', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  blocked_pattern: { label: 'Blocked Pattern', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  not_allowed: { label: 'Not Allowed', color: 'text-slate-700', bgColor: 'bg-slate-100' },
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function formatRelativeTime(ts: string): string {
  const now = new Date();
  const date = new Date(ts);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PatternTypeBadge({ type }: { type: PatternType }) {
  const config = PATTERN_TYPE_CONFIG[type];
  const colors: Record<PatternType, string> = {
    glob: 'bg-blue-100 text-blue-700',
    regex: 'bg-purple-100 text-purple-700',
    exact: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${colors[type]}`} title={config.description}>
      {config.label}
    </span>
  );
}

function ScopeBadge({ scope, harnessTypes }: { scope: RuleScope; harnessTypes: string[] }) {
  if (scope === 'global') {
    return (
      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
        Global
      </span>
    );
  }
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700"
      title={harnessTypes.join(', ')}
    >
      {harnessTypes.length} harness{harnessTypes.length !== 1 ? 'es' : ''}
    </span>
  );
}

function RuleRow({
  rule,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: PathJailRule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className={`border-b border-slate-100 ${!rule.enabled ? 'opacity-50' : ''} ${rule.is_default ? 'bg-slate-50/50' : ''}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono text-slate-700 max-w-[300px] truncate" title={rule.pattern}>
            {rule.pattern}
          </code>
          {rule.is_default && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
              Built-in
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate" title={rule.description}>
        {rule.description || '-'}
      </td>
      <td className="px-4 py-3">
        <PatternTypeBadge type={rule.pattern_type} />
      </td>
      <td className="px-4 py-3">
        <ScopeBadge scope={rule.scope} harnessTypes={rule.harness_types} />
      </td>
      <td className="px-4 py-3 text-[11px] text-slate-400">
        {formatRelativeTime(rule.created_at)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              rule.enabled ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
            title={rule.enabled ? 'Disable rule' : 'Enable rule'}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                rule.enabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
          {!rule.is_default && (
            <>
              <button
                onClick={onEdit}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                title="Edit rule"
              >
                <Icon name="cog" className="w-4 h-4" />
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition"
                title="Delete rule"
              >
                <Icon name="x-mark" className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function ViolationCard({ violation }: { violation: PathJailViolation }) {
  const config = VIOLATION_TYPE_CONFIG[violation.violation_type];
  return (
    <div className="p-4 rounded-lg border border-slate-200/60 bg-white/80 hover:shadow-sm transition">
      <div className="flex items-start justify-between mb-2">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${config.bgColor} ${config.color}`}>
          {config.label}
        </span>
        <span className="text-[10px] text-slate-400">{formatRelativeTime(violation.timestamp)}</span>
      </div>
      <code className="block text-xs font-mono text-slate-700 bg-rose-50 px-2 py-1 rounded mb-2 truncate" title={violation.path}>
        {violation.path}
      </code>
      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <Icon name="code-bracket" className="w-3.5 h-3.5" />
          {violation.harness_type}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="user" className="w-3.5 h-3.5" />
          {violation.user_identity}
        </span>
      </div>
      {violation.matched_pattern && (
        <div className="mt-2 text-[10px] text-slate-400">
          Matched: <code className="bg-slate-100 px-1 rounded">{violation.matched_pattern}</code>
        </div>
      )}
    </div>
  );
}

function PatternTestTool() {
  const [testPath, setTestPath] = useState('');
  const [harnessType, setHarnessType] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<PathTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = useCallback(async () => {
    if (!testPath.trim()) return;
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const res = await runPathTest(testPath, harnessType);
      setResult(res);
    } catch {
      // No verdict is shown when the service cannot be reached. This branch used to
      // synthesize one from `testPath.includes('.env') || testPath.includes('secret')` and
      // render it in the same green "Would be ALLOWED" panel as a real answer - so with the
      // backend down, every path outside those two substrings was reported as safe. That is
      // the reassuring answer to the only question this tool exists to answer, presented
      // indistinguishably from a measurement. An unreachable rule engine means the verdict
      // is unknown, and unknown is what the operator has to be told.
      setError('Could not reach the path jail service, so there is no verdict for this path. Retry once it is reachable.');
    } finally {
      setTesting(false);
    }
  }, [testPath, harnessType]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <Icon name="beaker" className="w-4 h-4 text-slate-400" />
        Pattern Testing Tool
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Test Path</label>
          <input
            type="text"
            value={testPath}
            onChange={(e) => setTestPath(e.target.value)}
            placeholder="e.g., config/.env.production"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Harness Type (optional)</label>
          <select
            value={harnessType || ''}
            onChange={(e) => setHarnessType(e.target.value || undefined)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-white"
          >
            <option value="">Any harness</option>
            {HARNESS_TYPES.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleTest}
          disabled={!testPath.trim() || testing}
          className="w-full px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {testing ? 'Testing...' : 'Test Path'}
        </button>

        {error && (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="exclamation-triangle" className="w-5 h-5 text-amber-600" />
              <span className="font-semibold text-amber-800">No verdict available</span>
            </div>
            <p className="text-xs text-slate-600">{error}</p>
          </div>
        )}

        {result && (
          <div className={`p-4 rounded-lg ${result.would_be_blocked ? 'bg-rose-50 border border-rose-200' : 'bg-emerald-50 border border-emerald-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.would_be_blocked ? (
                <>
                  <Icon name="no-symbol" className="w-5 h-5 text-rose-600" />
                  <span className="font-semibold text-rose-700">Would be BLOCKED</span>
                </>
              ) : (
                <>
                  <Icon name="check-circle" className="w-5 h-5 text-emerald-600" />
                  <span className="font-semibold text-emerald-700">Would be ALLOWED</span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-600">{result.reason}</p>
            {result.matching_rules.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Matching Rules:</div>
                {result.matching_rules.map((r) => (
                  <div key={r.id} className="text-xs text-slate-700 flex items-center gap-2">
                    <code className="bg-white/60 px-1.5 py-0.5 rounded font-mono">{r.pattern}</code>
                    <span className="text-slate-400">-</span>
                    <span className="text-slate-500">{r.description || 'No description'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AddRuleForm({
  onSave,
  onCancel,
  existingRule,
}: {
  onSave: (rule: Omit<PathJailRule, 'id' | 'is_default' | 'created_at' | 'updated_at'>) => void;
  onCancel: () => void;
  existingRule?: PathJailRule;
}) {
  const [pattern, setPattern] = useState(existingRule?.pattern || '');
  const [patternType, setPatternType] = useState<PatternType>(existingRule?.pattern_type || 'glob');
  const [description, setDescription] = useState(existingRule?.description || '');
  const [scope, setScope] = useState<RuleScope>(existingRule?.scope || 'global');
  const [harnessTypes, setHarnessTypes] = useState<string[]>(existingRule?.harness_types || []);
  const [enabled, setEnabled] = useState(existingRule?.enabled ?? true);
  const [testResult, setTestResult] = useState<PatternTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testPathValue, setTestPathValue] = useState('');

  const handleTestPattern = useCallback(async () => {
    if (!testPathValue.trim() || !pattern.trim()) return;
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      // POST /test-pattern rather than a local approximation. The rule being previewed is
      // not saved yet, which is why this cannot use POST /test - but it is not a reason to
      // reimplement matching in the browser. The previous local check was
      // `path.includes(pattern.replace(/\*/g, ''))`, which is substring containment, not
      // glob or regex matching: it called `**/.env` a match for `notes-env.md`, ignored
      // `pattern_type` entirely so every regex rule was previewed as a glob, and could not
      // represent `?` or a path-segment boundary at all.
      const res = await runPatternTest(testPathValue, pattern, patternType);
      setTestResult(res);
    } catch {
      setTestError('Could not reach the path jail service, so this pattern was not evaluated.');
    } finally {
      setTesting(false);
    }
  }, [testPathValue, pattern, patternType]);

  const handleSubmit = () => {
    if (!pattern.trim()) return;
    onSave({
      pattern: pattern.trim(),
      pattern_type: patternType,
      description: description.trim(),
      scope,
      harness_types: scope === 'harness' ? harnessTypes : [],
      enabled,
    });
  };

  return (
    <div className="space-y-5">
      {/* Pattern */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Pattern <span className="text-rose-500">*</span>
        </label>
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={PATTERN_TYPE_CONFIG[patternType].example}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
        <p className="text-[11px] text-slate-400 mt-1">
          {PATTERN_TYPE_CONFIG[patternType].description}. Example: <code className="bg-slate-100 px-1 rounded">{PATTERN_TYPE_CONFIG[patternType].example}</code>
        </p>
      </div>

      {/* Pattern Type */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Pattern Type</label>
        <div className="flex gap-2">
          {(['glob', 'regex', 'exact'] as PatternType[]).map((type) => (
            <button
              key={type}
              onClick={() => setPatternType(type)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                patternType === type
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {PATTERN_TYPE_CONFIG[type].label}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g., Block Terraform state files"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </div>

      {/* Scope */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Scope</label>
        <div className="flex gap-2">
          <button
            onClick={() => setScope('global')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
              scope === 'global'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Global (all harnesses)
          </button>
          <button
            onClick={() => setScope('harness')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
              scope === 'harness'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Specific harnesses
          </button>
        </div>
      </div>

      {/* Harness Types (if scope is harness) */}
      {scope === 'harness' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Harness Types</label>
          <div className="flex flex-wrap gap-2">
            {HARNESS_TYPES.map((h) => (
              <button
                key={h}
                onClick={() => {
                  if (harnessTypes.includes(h)) {
                    setHarnessTypes(harnessTypes.filter((t) => t !== h));
                  } else {
                    setHarnessTypes([...harnessTypes, h]);
                  }
                }}
                className={`px-2 py-1 text-[11px] font-medium rounded border transition ${
                  harnessTypes.includes(h)
                    ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Enabled toggle */}
      <div className="flex items-center justify-between py-2">
        <span className="text-sm font-medium text-slate-700">Enable rule immediately</span>
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Test Pattern */}
      <div className="border-t border-slate-100 pt-4">
        <label className="block text-sm font-medium text-slate-700 mb-1">Test Pattern</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={testPathValue}
            onChange={(e) => setTestPathValue(e.target.value)}
            placeholder="Enter a sample path to test"
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <button
            onClick={handleTestPattern}
            disabled={!testPathValue.trim() || !pattern.trim() || testing}
            className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {testing ? 'Testing...' : 'Test'}
          </button>
        </div>
        {testResult && (
          <div className={`mt-2 p-3 rounded-lg text-xs ${testResult.matched ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {testResult.reason}
          </div>
        )}
        {testError && (
          <div className="mt-2 p-3 rounded-lg text-xs bg-amber-50 text-amber-800">{testError}</div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">
          Checks this pattern only. Traversal and absolute paths are refused before any rule
          is consulted - use the Test Tool tab to see the full verdict for a path.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-slate-100">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!pattern.trim()}
          className="flex-1 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {existingRule ? 'Update Rule' : 'Create Rule'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type TabId = 'rules' | 'defaults' | 'violations' | 'test' | 'overrides';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'rules', label: 'Custom Rules', icon: 'shield-check' },
  { id: 'defaults', label: 'Default Patterns', icon: 'lock-closed' },
  { id: 'violations', label: 'Recent Violations', icon: 'exclamation-triangle' },
  { id: 'test', label: 'Test Tool', icon: 'beaker' },
  { id: 'overrides', label: 'Harness Overrides', icon: 'code-bracket' },
];

export default function PathJailEditor() {
  const [activeTab, setActiveTab] = useState<TabId>('rules');
  const [rulesData, setRulesData] = useState<PathJailRulesResponse | null>(null);
  const [violations, setViolations] = useState<PathJailViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editingRule, setEditingRule] = useState<PathJailRule | null>(null);
  const [selectedHarness, setSelectedHarness] = useState<string>(HARNESS_TYPES[0]);
  // Surfaces a failed toggle / delete / save. All three used to `catch {}` with a comment
  // saying the user would see no change - but "no change" is indistinguishable from "the
  // rule was already in that state", so an operator who disabled a rule and saw it stay
  // enabled had no way to tell a rejected request from a stale render.
  const [actionError, setActionError] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [rulesResp, violationsResp] = await Promise.all([
          fetchRules(true),
          fetchViolations(10),
        ]);
        setRulesData(rulesResp);
        setViolations(violationsResp.violations);
        // Honesty gate: only claim "Live" when the backend reports a genuine
        // liveness flag. The path-jail API currently serves static in-memory
        // rules/violations with no `.live` field, so this stays false and the
        // MockDataBadge renders until the data is truly live.
        setIsLive(rulesResp.live === true);
      } catch {
        // Fallback to no data - component will show empty state
        setIsLive(false);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Derived data
  const customRules = useMemo(() => rulesData?.rules.filter((r) => !r.is_default) || [], [rulesData]);
  const defaultRules = useMemo(() => rulesData?.rules.filter((r) => r.is_default) || [], [rulesData]);
  const harnessRules = useMemo(() => {
    if (!rulesData) return [];
    return rulesData.rules.filter((r) =>
      r.enabled && (r.scope === 'global' || (r.scope === 'harness' && r.harness_types.includes(selectedHarness)))
    );
  }, [rulesData, selectedHarness]);

  // Handlers
  const handleToggleRule = useCallback(async (rule: PathJailRule) => {
    setActionError(null);
    try {
      const updated = await updateRule(rule.id, { enabled: !rule.enabled });
      setRulesData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rules: prev.rules.map((r) => (r.id === updated.id ? updated : r)),
        };
      });
    } catch {
      setActionError(
        `Could not ${rule.enabled ? 'disable' : 'enable'} "${rule.pattern}". It is still ${rule.enabled ? 'enabled' : 'disabled'}.`,
      );
    }
  }, []);

  const handleDeleteRule = useCallback(async (rule: PathJailRule) => {
    if (!confirm(`Delete rule "${rule.pattern}"?`)) return;
    setActionError(null);
    try {
      await deleteRule(rule.id);
      setRulesData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rules: prev.rules.filter((r) => r.id !== rule.id),
          custom_count: prev.custom_count - 1,
          total: prev.total - 1,
        };
      });
    } catch {
      setActionError(`Could not delete "${rule.pattern}". The rule is still in effect.`);
    }
  }, []);

  const handleSaveRule = useCallback(async (ruleData: Omit<PathJailRule, 'id' | 'is_default' | 'created_at' | 'updated_at'>) => {
    setActionError(null);
    try {
      if (editingRule) {
        const updated = await updateRule(editingRule.id, ruleData);
        setRulesData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            rules: prev.rules.map((r) => (r.id === updated.id ? updated : r)),
          };
        });
      } else {
        const created = await createRule(ruleData);
        setRulesData((prev) => {
          if (!prev) return { rules: [created], total: 1, default_count: 0, custom_count: 1 };
          return {
            ...prev,
            rules: [...prev.rules, created],
            custom_count: prev.custom_count + 1,
            total: prev.total + 1,
          };
        });
      }
      setShowAddDrawer(false);
      setEditingRule(null);
    } catch {
      // The drawer deliberately stays open: closing it would look like the rule was saved.
      setActionError(
        `Could not ${editingRule ? 'update' : 'create'} the rule for "${ruleData.pattern}". Nothing was saved.`,
      );
    }
  }, [editingRule]);

  // Stats
  const totalRules = rulesData?.total || 0;
  const enabledRules = rulesData?.rules.filter((r) => r.enabled).length || 0;
  const violationCount = violations.length;
  const blockedToday = violations.filter((v) => {
    const today = new Date().toISOString().slice(0, 10);
    return v.timestamp.startsWith(today);
  }).length;

  return (
    <GovernPageLayout
      title="Path Jail Rule Editor"
      description="Manage path jailing rules that prevent unauthorized file access by AI harnesses."
      backPath="/govern/dev-tools"
      backLabel="Developer AI"
      badge={
        isLive ? (
          <LiveDataBadge source="Path Jail API" detail={`${totalRules} rules`} />
        ) : (
          <MockDataBadge integration="Path Jail API (backend required)" />
        )
      }
      actions={
        <button
          onClick={() => {
            setEditingRule(null);
            setShowAddDrawer(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition"
        >
          <Icon name="plus" className="w-4 h-4" />
          Add Rule
        </button>
      }
    >
      <div className="space-y-6">
        {actionError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200">
            <Icon name="exclamation-triangle" className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <p className="text-xs text-rose-800 flex-1">{actionError}</p>
            <button
              onClick={() => setActionError(null)}
              className="text-[11px] text-rose-600 hover:text-rose-800 font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Rules" value={totalRules} sub={`${rulesData?.default_count || 0} default, ${rulesData?.custom_count || 0} custom`} />
          <StatCard label="Enabled Rules" value={enabledRules} variant={enabledRules > 0 ? 'success' : 'muted'} />
          <StatCard label="Recent Violations" value={violationCount} variant={violationCount > 0 ? 'warning' : 'muted'} />
          <StatCard label="Blocked Today" value={blockedToday} variant={blockedToday > 0 ? 'danger' : 'success'} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab.id
                  ? 'text-slate-900 border-slate-900'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              <Icon name={tab.icon as any} className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="bg-white/80 rounded-xl border border-slate-200/60 shadow-sm p-8 text-center text-sm text-slate-400 animate-pulse">
            Loading path jail data...
          </div>
        ) : (
          <>
            {/* Custom Rules Tab */}
            {activeTab === 'rules' && (
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                {customRules.length === 0 ? (
                  <div className="p-8 text-center">
                    <Icon name="shield-check" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <div className="text-sm font-semibold text-slate-800 mb-1">No custom rules yet</div>
                    <p className="text-[11px] text-slate-500 max-w-md mx-auto mb-4">
                      Custom rules let you block additional paths beyond the built-in defaults.
                    </p>
                    <button
                      onClick={() => {
                        setEditingRule(null);
                        setShowAddDrawer(true);
                      }}
                      className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition"
                    >
                      Add Your First Rule
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/50">
                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Pattern</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Scope</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Created</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customRules.map((rule) => (
                        <RuleRow
                          key={rule.id}
                          rule={rule}
                          onToggle={() => handleToggleRule(rule)}
                          onEdit={() => {
                            setEditingRule(rule);
                            setShowAddDrawer(true);
                          }}
                          onDelete={() => handleDeleteRule(rule)}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Default Patterns Tab */}
            {activeTab === 'defaults' && (
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-900">Built-in Blocked Patterns</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    These patterns are built into the path jail. They can be disabled but not deleted.
                  </p>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50">
                      <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Pattern</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Scope</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Created</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Enabled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {defaultRules.map((rule) => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        onToggle={() => handleToggleRule(rule)}
                        onEdit={() => {}} // Default rules can't be edited
                        onDelete={() => {}} // Default rules can't be deleted
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recent Violations Tab */}
            {activeTab === 'violations' && (
              <div className="space-y-4">
                {violations.length === 0 ? (
                  <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-8 text-center">
                    <Icon name="check-circle" className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
                    <div className="text-sm font-semibold text-slate-800 mb-1">No recent violations</div>
                    <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                      Path jail is working correctly. No unauthorized access attempts have been recorded recently.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {violations.map((v) => (
                      <ViolationCard key={v.id} violation={v} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Test Tool Tab */}
            {activeTab === 'test' && (
              <div className="max-w-xl">
                <PatternTestTool />
              </div>
            )}

            {/* Harness Overrides Tab */}
            {activeTab === 'overrides' && (
              <div className="space-y-4">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {HARNESS_TYPES.map((h) => (
                    <button
                      key={h}
                      onClick={() => setSelectedHarness(h)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition ${
                        selectedHarness === h
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>

                <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-900">Rules for {selectedHarness}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Showing {harnessRules.length} active rules (global + harness-specific)
                    </p>
                  </div>
                  {harnessRules.length === 0 ? (
                    <div className="p-8 text-center">
                      <Icon name="shield-check" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <div className="text-sm font-semibold text-slate-800 mb-1">No active rules</div>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                        This harness has no path restrictions enabled.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/50">
                          <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Pattern</th>
                          <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                          <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                          <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Scope</th>
                        </tr>
                      </thead>
                      <tbody>
                        {harnessRules.map((rule) => (
                          <tr key={rule.id} className={`border-b border-slate-100 ${rule.is_default ? 'bg-slate-50/50' : ''}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono text-slate-700 max-w-[300px] truncate">
                                  {rule.pattern}
                                </code>
                                {rule.is_default && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
                                    Built-in
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">
                              {rule.description || '-'}
                            </td>
                            <td className="px-4 py-3">
                              <PatternTypeBadge type={rule.pattern_type} />
                            </td>
                            <td className="px-4 py-3">
                              <ScopeBadge scope={rule.scope} harnessTypes={rule.harness_types} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Add/Edit Rule Drawer */}
        <Drawer
          open={showAddDrawer}
          onClose={() => {
            setShowAddDrawer(false);
            setEditingRule(null);
          }}
          title={editingRule ? 'Edit Rule' : 'Add Path Jail Rule'}
          subtitle={editingRule ? `Editing ${editingRule.pattern}` : 'Create a new rule to block paths'}
          width="md"
        >
          <AddRuleForm
            existingRule={editingRule || undefined}
            onSave={handleSaveRule}
            onCancel={() => {
              setShowAddDrawer(false);
              setEditingRule(null);
            }}
          />
        </Drawer>

        {/* Data Source Info Panel */}
        <DataSourceInfo
          pageId="path-jail"
          pageTitle="Path Jailing Rule Editor"
          sources={getPageDataSources('path-jail')}
        />
      </div>
    </GovernPageLayout>
  );
}
