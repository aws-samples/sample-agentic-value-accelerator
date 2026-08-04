/**
 * RegexPatternBuilder — Build and test custom regex patterns for sensitive info detection
 */

import { useState, useMemo } from 'react';

interface PatternConfig {
  id: string;
  name: string;
  pattern: string;
  description?: string;
  action: 'BLOCK' | 'ANONYMIZE';
  testMatches?: string[];
}

interface Props {
  patterns?: PatternConfig[];
  onPatternsChange?: (patterns: PatternConfig[]) => void;
  onClose?: () => void;
}

const PRESET_PATTERNS: { name: string; pattern: string; description: string }[] = [
  { name: 'Internal Employee ID', pattern: 'EMP-\\d{6}', description: 'Matches EMP-123456 format' },
  { name: 'Internal Project Code', pattern: 'PRJ-[A-Z]{2}-\\d{4}', description: 'Matches PRJ-XX-0000 format' },
  { name: 'AWS Account ID', pattern: '\\d{12}', description: 'Matches 12-digit AWS account numbers' },
  { name: 'Internal IP Range', pattern: '10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}', description: 'Matches 10.x.x.x internal IPs' },
  { name: 'API Key Pattern', pattern: '[A-Za-z0-9]{32,}', description: 'Matches long alphanumeric keys' },
  { name: 'IBAN', pattern: '[A-Z]{2}\\d{2}[A-Z0-9]{11,30}', description: 'International bank account number' },
];

const TEST_SAMPLES = [
  'Please update employee EMP-123456 in the system',
  'The project code is PRJ-AB-2024',
  'AWS account 123456789012 needs access',
  'Connect to server at 10.50.100.25',
  'API key: AbCdEfGhIjKlMnOpQrStUvWxYz123456',
  'Transfer to IBAN GB82WEST12345698765432',
  'My SSN is 123-45-6789',
  'Contact support@example.com for help',
];

export default function RegexPatternBuilder({ patterns: initialPatterns, onPatternsChange, onClose }: Props) {
  const [patterns, setPatterns] = useState<PatternConfig[]>(initialPatterns || []);
  const [editingPattern, setEditingPattern] = useState<Partial<PatternConfig> | null>(null);
  const [testText, setTestText] = useState('');
  const [testResults, setTestResults] = useState<{ pattern: string; matches: string[] }[]>([]);
  const [patternError, setPatternError] = useState<string | null>(null);

  const validatePattern = (pattern: string): boolean => {
    try {
      new RegExp(pattern);
      setPatternError(null);
      return true;
    } catch (e) {
      setPatternError('Invalid regex pattern');
      return false;
    }
  };

  const handleAddPattern = () => {
    if (!editingPattern?.name || !editingPattern?.pattern) return;
    if (!validatePattern(editingPattern.pattern)) return;

    const newPattern: PatternConfig = {
      id: editingPattern.id || `pat-${Date.now()}`,
      name: editingPattern.name,
      pattern: editingPattern.pattern,
      description: editingPattern.description,
      action: editingPattern.action || 'ANONYMIZE',
    };

    const updated = editingPattern.id
      ? patterns.map(p => p.id === editingPattern.id ? newPattern : p)
      : [...patterns, newPattern];

    setPatterns(updated);
    onPatternsChange?.(updated);
    setEditingPattern(null);
  };

  const handleRemovePattern = (id: string) => {
    const updated = patterns.filter(p => p.id !== id);
    setPatterns(updated);
    onPatternsChange?.(updated);
  };

  const runTest = () => {
    const text = testText || TEST_SAMPLES.join('\n');
    const results: { pattern: string; matches: string[] }[] = [];

    patterns.forEach(p => {
      try {
        const regex = new RegExp(p.pattern, 'g');
        const matches = text.match(regex) || [];
        results.push({ pattern: p.name, matches });
      } catch {
        results.push({ pattern: p.name, matches: [] });
      }
    });

    setTestResults(results);
  };

  const highlightedText = useMemo(() => {
    const text = testText || TEST_SAMPLES.join('\n');
    let highlighted = text;

    patterns.forEach(p => {
      try {
        const regex = new RegExp(`(${p.pattern})`, 'g');
        highlighted = highlighted.replace(regex, '<mark class="bg-yellow-200 px-0.5 rounded">$1</mark>');
      } catch {
        // Invalid regex, skip
      }
    });

    return highlighted;
  }, [testText, patterns]);

  const applyPreset = (preset: { name: string; pattern: string; description: string }) => {
    setEditingPattern({
      name: preset.name,
      pattern: preset.pattern,
      description: preset.description,
      action: 'ANONYMIZE',
    });
    validatePattern(preset.pattern);
  };

  const getActionStyle = (action: string) => {
    return action === 'BLOCK'
      ? { bg: 'bg-red-100', text: 'text-red-700' }
      : { bg: 'bg-amber-100', text: 'text-amber-700' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Regex Pattern Builder</h2>
          <p className="text-sm text-slate-500 mt-1">Create custom patterns to detect sensitive information</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Current Patterns */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Custom Patterns ({patterns.length})</h3>
          <button
            onClick={() => setEditingPattern({ action: 'ANONYMIZE' })}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Pattern
          </button>
        </div>

        {patterns.length === 0 && !editingPattern && (
          <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200">
            <svg className="w-8 h-8 mx-auto text-slate-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <p className="text-sm text-slate-600">No custom patterns yet</p>
            <p className="text-xs text-slate-400 mt-1">Add patterns to detect organization-specific sensitive data</p>
          </div>
        )}

        {patterns.map(p => {
          const style = getActionStyle(p.action);
          return (
            <div key={p.id} className="p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">{p.name}</h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                      {p.action}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-xs text-slate-500 mt-1">{p.description}</p>
                  )}
                  <code className="inline-block mt-2 px-2 py-1 bg-slate-100 rounded text-xs font-mono text-slate-700">
                    {p.pattern}
                  </code>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingPattern(p)}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleRemovePattern(p.id)}
                    className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Pattern Form */}
      {editingPattern && (
        <div className="p-4 border-2 border-dashed border-blue-200 rounded-xl bg-blue-50/50 space-y-4">
          <h4 className="text-sm font-semibold text-slate-900">
            {editingPattern.id ? 'Edit Pattern' : 'New Pattern'}
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
              <input
                type="text"
                value={editingPattern.name || ''}
                onChange={e => setEditingPattern({ ...editingPattern, name: e.target.value })}
                placeholder="e.g., Internal Employee ID"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Action</label>
              <select
                value={editingPattern.action || 'ANONYMIZE'}
                onChange={e => setEditingPattern({ ...editingPattern, action: e.target.value as 'BLOCK' | 'ANONYMIZE' })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                <option value="ANONYMIZE">ANONYMIZE - Replace with placeholder</option>
                <option value="BLOCK">BLOCK - Reject entirely</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Regex Pattern</label>
            <input
              type="text"
              value={editingPattern.pattern || ''}
              onChange={e => {
                setEditingPattern({ ...editingPattern, pattern: e.target.value });
                if (e.target.value) validatePattern(e.target.value);
              }}
              placeholder="e.g., EMP-\d{6}"
              className={`w-full px-3 py-2 text-sm font-mono border rounded-lg ${
                patternError ? 'border-red-300 bg-red-50' : 'border-slate-200'
              }`}
            />
            {patternError && (
              <p className="text-xs text-red-600 mt-1">{patternError}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description (optional)</label>
            <input
              type="text"
              value={editingPattern.description || ''}
              onChange={e => setEditingPattern({ ...editingPattern, description: e.target.value })}
              placeholder="Brief description of what this pattern matches"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          {/* Preset Buttons */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Quick Presets</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_PATTERNS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => applyPreset(preset)}
                  className="px-2 py-1 text-[10px] bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setEditingPattern(null);
                setPatternError(null);
              }}
              className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleAddPattern}
              disabled={!editingPattern.name || !editingPattern.pattern || !!patternError}
              className="flex-1 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {editingPattern.id ? 'Update' : 'Add'} Pattern
            </button>
          </div>
        </div>
      )}

      {/* Test Section */}
      {patterns.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Test Patterns</h3>

          <div>
            <textarea
              value={testText}
              onChange={e => setTestText(e.target.value)}
              placeholder={TEST_SAMPLES.join('\n')}
              className="w-full h-32 px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Leave empty to use sample test data
            </p>
          </div>

          <button
            onClick={runTest}
            className="w-full py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
          >
            Run Test
          </button>

          {testResults.length > 0 && (
            <div className="space-y-3">
              {/* Highlighted Preview */}
              <div className="p-3 bg-white border border-slate-200 rounded-lg">
                <label className="block text-xs font-medium text-slate-600 mb-2">Preview (matches highlighted)</label>
                <div
                  className="text-sm text-slate-700 whitespace-pre-wrap font-mono"
                  dangerouslySetInnerHTML={{ __html: highlightedText }}
                />
              </div>

              {/* Match Results */}
              <div className="space-y-2">
                {testResults.map((result, i) => (
                  <div key={i} className={`p-3 rounded-lg border ${
                    result.matches.length > 0
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200 bg-slate-50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">{result.pattern}</span>
                      <span className={`text-xs font-bold ${
                        result.matches.length > 0 ? 'text-emerald-600' : 'text-slate-400'
                      }`}>
                        {result.matches.length} match{result.matches.length !== 1 ? 'es' : ''}
                      </span>
                    </div>
                    {result.matches.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {result.matches.map((match, j) => (
                          <code key={j} className="px-1.5 py-0.5 bg-white text-[10px] font-mono rounded border border-emerald-200">
                            {match}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tips */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <h4 className="text-xs font-semibold text-amber-800 mb-2">Regex Tips</h4>
        <ul className="text-[10px] text-amber-700 space-y-1">
          <li><code className="bg-amber-100 px-1 rounded">\d</code> matches any digit (0-9)</li>
          <li><code className="bg-amber-100 px-1 rounded">\w</code> matches word characters (a-z, A-Z, 0-9, _)</li>
          <li><code className="bg-amber-100 px-1 rounded">{'{n}'}</code> matches exactly n times</li>
          <li><code className="bg-amber-100 px-1 rounded">{'{n,m}'}</code> matches between n and m times</li>
          <li><code className="bg-amber-100 px-1 rounded">[A-Z]</code> matches uppercase letters</li>
          <li>Use <code className="bg-amber-100 px-1 rounded">\\</code> to escape special characters like <code className="bg-amber-100 px-1 rounded">.</code></li>
        </ul>
      </div>
    </div>
  );
}
