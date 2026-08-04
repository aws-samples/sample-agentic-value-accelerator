/**
 * DeniedTopicsBuilder — Visual drag-and-drop builder for denied topics with live testing
 */

import { useState, useRef } from 'react';

interface DeniedTopic {
  id: string;
  name: string;
  definition: string;
  examples: string[];
  severity: 'block' | 'warn' | 'log';
  enabled: boolean;
  testResults?: { matched: boolean; confidence: number }[];
}

interface Props {
  topics?: DeniedTopic[];
  onTopicsChange?: (topics: DeniedTopic[]) => void;
  onClose?: () => void;
}

const PRESET_TOPICS: Omit<DeniedTopic, 'id' | 'enabled' | 'testResults'>[] = [
  {
    name: 'Insider Trading',
    definition: 'Discussion of material non-public information that could affect trading decisions',
    examples: ['Before the merger announcement', 'I heard earnings will beat expectations', 'The CEO told me privately'],
    severity: 'block',
  },
  {
    name: 'Market Manipulation',
    definition: 'Strategies to artificially influence market prices or trading volumes',
    examples: ['Pump and dump strategy', 'How to coordinate buying', 'Spoof order techniques'],
    severity: 'block',
  },
  {
    name: 'Identity Fraud',
    definition: 'Assistance with creating false identities or deceiving verification processes',
    examples: ['Create a fake ID', 'Pass KYC with false documents', 'Hide my real identity'],
    severity: 'block',
  },
  {
    name: 'Money Laundering',
    definition: 'Techniques to obscure the source or destination of funds',
    examples: ['Structure transactions to avoid reporting', 'Hide the source of funds', 'Set up shell companies'],
    severity: 'block',
  },
  {
    name: 'Competitor Information',
    definition: 'Requests for confidential information about competitors',
    examples: ['What are competitor pricing strategies', 'Get me their customer list', 'Their internal roadmap'],
    severity: 'warn',
  },
  {
    name: 'Investment Advice',
    definition: 'Specific investment recommendations without proper disclaimers',
    examples: ['Should I buy this stock', 'What allocation do you recommend', 'Is this a good investment'],
    severity: 'warn',
  },
];

const TEST_PROMPTS = [
  "I heard the company is about to announce a merger. Should I buy stock now?",
  "What's your customer service policy for refunds?",
  "How can I structure my transactions to stay under the reporting threshold?",
  "Can you help me create documents to pass the verification process?",
  "What are the best mutual funds for retirement savings?",
  "Tell me about your competitor's pricing strategy",
];

export default function DeniedTopicsBuilder({ topics: initialTopics, onTopicsChange, onClose }: Props) {
  const [topics, setTopics] = useState<DeniedTopic[]>(
    initialTopics || []
  );
  const [draggedTopic, setDraggedTopic] = useState<string | null>(null);
  const [editingTopic, setEditingTopic] = useState<DeniedTopic | null>(null);
  const [testPrompt, setTestPrompt] = useState('');
  const [testResults, setTestResults] = useState<{ topicId: string; matched: boolean; confidence: number }[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (topicId: string) => {
    setDraggedTopic(topicId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.add('border-blue-500', 'bg-blue-50');
    }
  };

  const handleDragLeave = () => {
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('border-blue-500', 'bg-blue-50');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('border-blue-500', 'bg-blue-50');
    }

    if (draggedTopic) {
      const preset = PRESET_TOPICS.find(p => p.name === draggedTopic);
      if (preset && !topics.find(t => t.name === preset.name)) {
        const newTopic: DeniedTopic = {
          id: `topic-${Date.now()}`,
          ...preset,
          enabled: true,
        };
        const updated = [...topics, newTopic];
        setTopics(updated);
        onTopicsChange?.(updated);
      }
    }
    setDraggedTopic(null);
  };

  const handleAddCustomTopic = () => {
    const newTopic: DeniedTopic = {
      id: `topic-${Date.now()}`,
      name: 'New Topic',
      definition: '',
      examples: [''],
      severity: 'warn',
      enabled: true,
    };
    setEditingTopic(newTopic);
  };

  const handleSaveTopic = () => {
    if (!editingTopic) return;

    if (topics.find(t => t.id === editingTopic.id)) {
      const updated = topics.map(t => t.id === editingTopic.id ? editingTopic : t);
      setTopics(updated);
      onTopicsChange?.(updated);
    } else {
      const updated = [...topics, editingTopic];
      setTopics(updated);
      onTopicsChange?.(updated);
    }
    setEditingTopic(null);
  };

  const handleRemoveTopic = (topicId: string) => {
    const updated = topics.filter(t => t.id !== topicId);
    setTopics(updated);
    onTopicsChange?.(updated);
  };

  const handleToggleTopic = (topicId: string) => {
    const updated = topics.map(t =>
      t.id === topicId ? { ...t, enabled: !t.enabled } : t
    );
    setTopics(updated);
    onTopicsChange?.(updated);
  };

  const runTest = async () => {
    if (!testPrompt.trim()) return;

    setIsTesting(true);
    setTestResults([]);

    await new Promise(resolve => setTimeout(resolve, 800));

    const results = topics.filter(t => t.enabled).map(topic => {
      const promptLower = testPrompt.toLowerCase();
      const definitionLower = topic.definition.toLowerCase();
      const examplesLower = topic.examples.map(e => e.toLowerCase());

      let matched = false;
      let confidence = 0;

      for (const example of examplesLower) {
        if (promptLower.includes(example.slice(0, 20))) {
          matched = true;
          confidence = 0.85 + Math.random() * 0.14;
          break;
        }
      }

      const keywords = definitionLower.split(' ').filter(w => w.length > 4);
      const matchedKeywords = keywords.filter(k => promptLower.includes(k));
      if (matchedKeywords.length >= 2) {
        matched = true;
        confidence = Math.max(confidence, 0.6 + (matchedKeywords.length / keywords.length) * 0.35);
      }

      return { topicId: topic.id, matched, confidence };
    });

    setTestResults(results);
    setIsTesting(false);
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'block': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
      case 'warn': return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' };
      case 'log': return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' };
      default: return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Denied Topics Builder</h2>
          <p className="text-sm text-slate-500 mt-1">Drag presets or create custom topics, then test with live prompts</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Preset Topics + Drop Zone */}
        <div className="space-y-4">
          {/* Preset Topics */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Preset Topics (drag to add)</h3>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_TOPICS.map(preset => {
                const isAdded = topics.some(t => t.name === preset.name);
                const style = getSeverityStyle(preset.severity);
                return (
                  <div
                    key={preset.name}
                    draggable={!isAdded}
                    onDragStart={() => handleDragStart(preset.name)}
                    className={`p-3 rounded-lg border cursor-grab transition-all ${
                      isAdded
                        ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
                        : `${style.bg} ${style.border} hover:shadow-md active:cursor-grabbing`
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-900">{preset.name}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                        {preset.severity.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 line-clamp-2">{preset.definition}</p>
                    {isAdded && <span className="text-[9px] text-slate-400 mt-1 block">Already added</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Drop Zone / Active Topics */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Active Topics ({topics.length})</h3>
              <button
                onClick={handleAddCustomTopic}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Custom
              </button>
            </div>

            <div
              ref={dropZoneRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`min-h-[200px] p-4 border-2 border-dashed rounded-xl transition-colors ${
                topics.length === 0 ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'
              }`}
            >
              {topics.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
                  <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <p className="text-sm">Drop topics here or add custom</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topics.map(topic => {
                    const style = getSeverityStyle(topic.severity);
                    const testResult = testResults.find(r => r.topicId === topic.id);
                    return (
                      <div
                        key={topic.id}
                        className={`p-3 rounded-lg border ${style.border} ${topic.enabled ? style.bg : 'bg-slate-50 opacity-60'}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={topic.enabled}
                              onChange={() => handleToggleTopic(topic.id)}
                              className="mt-1 w-4 h-4 rounded border-slate-300"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-900">{topic.name}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                                  {topic.severity.toUpperCase()}
                                </span>
                                {testResult && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                    testResult.matched
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-emerald-100 text-emerald-700'
                                  }`}>
                                    {testResult.matched
                                      ? `MATCHED ${(testResult.confidence * 100).toFixed(0)}%`
                                      : 'NO MATCH'
                                    }
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-1">{topic.definition}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingTopic(topic)}
                              className="p-1 hover:bg-white/50 rounded text-slate-400 hover:text-slate-600"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleRemoveTopic(topic.id)}
                              className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Testing Area */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Live Testing</h3>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Test Prompt</label>
            <textarea
              value={testPrompt}
              onChange={e => setTestPrompt(e.target.value)}
              placeholder="Enter a prompt to test against your topics..."
              className="w-full h-32 px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none"
            />
          </div>

          <div className="flex flex-wrap gap-1">
            {TEST_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => setTestPrompt(prompt)}
                className="text-[10px] px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 truncate max-w-[200px]"
              >
                {prompt.slice(0, 40)}...
              </button>
            ))}
          </div>

          <button
            onClick={runTest}
            disabled={isTesting || !testPrompt.trim() || topics.filter(t => t.enabled).length === 0}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isTesting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
                Test Against Topics
              </>
            )}
          </button>

          {testResults.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <h4 className="text-xs font-semibold text-slate-900 mb-3">Results</h4>
              <div className="space-y-2">
                {testResults.map(result => {
                  const topic = topics.find(t => t.id === result.topicId);
                  if (!topic) return null;
                  return (
                    <div
                      key={result.topicId}
                      className={`p-2 rounded-lg ${
                        result.matched ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-700">{topic.name}</span>
                        <span className={`text-[10px] font-bold ${result.matched ? 'text-red-600' : 'text-emerald-600'}`}>
                          {result.matched ? `TRIGGERED (${(result.confidence * 100).toFixed(0)}%)` : 'PASSED'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingTopic && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {topics.find(t => t.id === editingTopic.id) ? 'Edit Topic' : 'New Topic'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Topic Name</label>
                <input
                  type="text"
                  value={editingTopic.name}
                  onChange={e => setEditingTopic({ ...editingTopic, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Definition</label>
                <textarea
                  value={editingTopic.definition}
                  onChange={e => setEditingTopic({ ...editingTopic, definition: e.target.value })}
                  className="w-full h-20 px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none"
                  placeholder="Describe what this topic covers..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Examples (one per line)</label>
                <textarea
                  value={editingTopic.examples.join('\n')}
                  onChange={e => setEditingTopic({ ...editingTopic, examples: e.target.value.split('\n').filter(Boolean) })}
                  className="w-full h-24 px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none font-mono"
                  placeholder="Example phrase 1&#10;Example phrase 2&#10;Example phrase 3"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Action</label>
                <div className="flex gap-2">
                  {(['block', 'warn', 'log'] as const).map(sev => {
                    const style = getSeverityStyle(sev);
                    return (
                      <button
                        key={sev}
                        onClick={() => setEditingTopic({ ...editingTopic, severity: sev })}
                        className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                          editingTopic.severity === sev
                            ? `${style.bg} ${style.text} ${style.border}`
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {sev.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingTopic(null)}
                className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTopic}
                disabled={!editingTopic.name.trim() || !editingTopic.definition.trim()}
                className="flex-1 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Save Topic
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
