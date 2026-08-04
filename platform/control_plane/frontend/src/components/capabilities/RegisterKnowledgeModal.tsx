import { useState, useEffect } from 'react';
import { knowledgeApi } from '../../api/client';
import type { GlueDatabase, AthenaWorkgroup } from '../../types';
import { Icon } from '../govern/icons';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface BedrockKB {
  id: string;
  name: string;
  description: string;
  status: string;
  updated_at: string;
}

export default function RegisterKnowledgeModal({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<'data_lake' | 'knowledge_base'>('data_lake');

  // Data Lake state
  const [databases, setDatabases] = useState<GlueDatabase[]>([]);
  const [workgroups, setWorkgroups] = useState<AthenaWorkgroup[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [loadingWorkgroups, setLoadingWorkgroups] = useState(false);
  const [selectedDatabases, setSelectedDatabases] = useState<string[]>([]);
  const [selectedWorkgroup, setSelectedWorkgroup] = useState('');

  // Knowledge Base state
  const [knowledgeBases, setKnowledgeBases] = useState<BedrockKB[]>([]);
  const [loadingKBs, setLoadingKBs] = useState(false);
  const [selectedKB, setSelectedKB] = useState<BedrockKB | null>(null);
  const [modelId, setModelId] = useState('us.anthropic.claude-sonnet-4-6');

  // Common state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (step === 2 && type === 'data_lake') {
      setLoadingDatabases(true);
      knowledgeApi.listDatabases().then(data => {
        setDatabases(data.databases);
        setLoadingDatabases(false);
      }).catch(() => setLoadingDatabases(false));

      setLoadingWorkgroups(true);
      knowledgeApi.listWorkgroups().then(data => {
        setWorkgroups(data.workgroups.filter(w => w.state === 'ENABLED'));
        setLoadingWorkgroups(false);
      }).catch(() => setLoadingWorkgroups(false));
    }

    if (step === 2 && type === 'knowledge_base') {
      setLoadingKBs(true);
      knowledgeApi.listKnowledgeBases().then(data => {
        setKnowledgeBases(data.knowledge_bases);
        setLoadingKBs(false);
      }).catch(() => setLoadingKBs(false));
    }
  }, [step, type]);

  const toggleDatabase = (name: string) => {
    setSelectedDatabases(prev =>
      prev.includes(name) ? prev.filter(d => d !== name) : [...prev, name]
    );
  };

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const config = type === 'data_lake'
        ? { databases: selectedDatabases, athena_workgroup: selectedWorkgroup }
        : { knowledge_base_id: selectedKB!.id, model_id: modelId };

      await knowledgeApi.register({ name, type, description, config });
      onCreated();
      handleClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Registration failed');
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setType('data_lake');
    setSelectedDatabases([]);
    setSelectedWorkgroup('');
    setSelectedKB(null);
    setModelId('us.anthropic.claude-sonnet-4-6');
    setName('');
    setDescription('');
    setError('');
    onClose();
  };

  const canProceedStep2 = type === 'data_lake'
    ? selectedDatabases.length > 0 && !!selectedWorkgroup
    : !!selectedKB;

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Register Knowledge</h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Step 1: Type Selection */}
          {step === 1 && (
            <div>
              <p className="text-sm text-slate-500 mb-4">Select the type of knowledge source to register.</p>

              <button
                onClick={() => setType('data_lake')}
                className={`w-full text-left p-4 border-2 rounded-xl mb-3 transition-colors ${type === 'data_lake' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <div className="flex items-center gap-3">
                  <Icon name="circle-stack" className="w-6 h-6 text-slate-500" />
                  <div>
                    <div className="font-semibold text-slate-900">Data Lake</div>
                    <div className="text-xs text-slate-500">Glue Catalog + Athena + S3 (Iceberg/Parquet)</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setType('knowledge_base')}
                className={`w-full text-left p-4 border-2 rounded-xl mb-3 transition-colors ${type === 'knowledge_base' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <div className="flex items-center gap-3">
                  <Icon name="book-open" className="w-6 h-6 text-slate-500" />
                  <div>
                    <div className="font-semibold text-slate-900">Knowledge Base</div>
                    <div className="text-xs text-slate-500">Bedrock Knowledge Base + Vector Search + RAG</div>
                  </div>
                </div>
              </button>

              <div className="mt-5 p-3 bg-slate-50 rounded-xl">
                {type === 'data_lake' ? (
                  <>
                    <p className="text-xs font-medium text-slate-700 mb-1">MCP Server: Data Lake MCP</p>
                    <p className="text-xs text-slate-500">Tools: list_databases, list_tables, describe_table, query</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium text-slate-700 mb-1">MCP Server: Knowledge Base MCP</p>
                    <p className="text-xs text-slate-500">Tools: retrieve, retrieve_and_generate, get_status, sync</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Configure — Data Lake */}
          {step === 2 && type === 'data_lake' && (
            <div>
              <p className="text-sm text-slate-500 mb-4">Select databases and workgroup to expose.</p>

              <label className="text-sm font-medium text-slate-700 block mb-2">Databases</label>
              {loadingDatabases ? (
                <div className="text-sm text-slate-400 py-3">Loading databases...</div>
              ) : (
                <div className="space-y-2 mb-5 max-h-48 overflow-y-auto">
                  {databases.map(db => (
                    <label key={db.name} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedDatabases.includes(db.name) ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <input
                        type="checkbox"
                        checked={selectedDatabases.includes(db.name)}
                        onChange={() => toggleDatabase(db.name)}
                        className="mt-0.5 rounded border-slate-300"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-900">{db.name}</div>
                        {db.description && <div className="text-xs text-slate-500">{db.description}</div>}
                        <div className="text-xs text-slate-400 mt-0.5">{db.tables.length} table{db.tables.length !== 1 ? 's' : ''}: {db.tables.map(t => t.name).join(', ')}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <label className="text-sm font-medium text-slate-700 block mb-2">Athena Workgroup</label>
              {loadingWorkgroups ? (
                <div className="text-sm text-slate-400 py-3">Loading workgroups...</div>
              ) : (
                <select
                  value={selectedWorkgroup}
                  onChange={e => setSelectedWorkgroup(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a workgroup...</option>
                  {workgroups.map(wg => (
                    <option key={wg.name} value={wg.name}>{wg.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Step 2: Configure — Knowledge Base */}
          {step === 2 && type === 'knowledge_base' && (
            <div>
              <p className="text-sm text-slate-500 mb-4">Select an existing Bedrock Knowledge Base and model for RAG.</p>

              <label className="text-sm font-medium text-slate-700 block mb-2">Knowledge Base</label>
              {loadingKBs ? (
                <div className="text-sm text-slate-400 py-3">Loading knowledge bases...</div>
              ) : (
                <div className="space-y-2 mb-5 max-h-48 overflow-y-auto">
                  {knowledgeBases.map(kb => (
                    <label key={kb.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedKB?.id === kb.id ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <input
                        type="radio"
                        name="kb"
                        checked={selectedKB?.id === kb.id}
                        onChange={() => setSelectedKB(kb)}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-900">{kb.name}</div>
                        {kb.description && <div className="text-xs text-slate-500">{kb.description}</div>}
                        <div className="text-xs text-slate-400 mt-0.5">ID: {kb.id} • {kb.status}</div>
                      </div>
                    </label>
                  ))}
                  {knowledgeBases.length === 0 && (
                    <div className="text-sm text-slate-400 py-3">No active knowledge bases found in this account.</div>
                  )}
                </div>
              )}

              <label className="text-sm font-medium text-slate-700 block mb-2">Model for RAG</label>
              <select
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="us.anthropic.claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="us.anthropic.claude-opus-4-7">Claude Opus 4.7</option>
                <option value="us.anthropic.claude-3-5-haiku-20241022-v1:0">Claude 3.5 Haiku</option>
                <option value="us.anthropic.claude-sonnet-4-20250514-v1:0">Claude Sonnet 4</option>
              </select>
              <p className="text-xs text-slate-400 mt-1">Used by the retrieve_and_generate tool for synthesized answers.</p>
            </div>
          )}

          {/* Step 3: Name & Create */}
          {step === 3 && (
            <div>
              <p className="text-sm text-slate-500 mb-4">Give your knowledge source a name.</p>

              <label className="text-sm font-medium text-slate-700 block mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={type === 'data_lake' ? 'e.g., Trading Data Lake' : 'e.g., FSI Knowledge Base'}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              />

              <label className="text-sm font-medium text-slate-700 block mb-2">Description (optional)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What data does this expose?"
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-5 resize-none"
              />

              {/* Summary */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-medium text-slate-700 mb-2">Summary</p>
                <div className="space-y-1 text-xs text-slate-600">
                  {type === 'data_lake' ? (
                    <>
                      <div>• Type: Data Lake</div>
                      <div>• Databases: {selectedDatabases.join(', ')}</div>
                      <div>• Workgroup: {selectedWorkgroup}</div>
                      <div>• Tools: list_databases, list_tables, describe_table, query</div>
                    </>
                  ) : (
                    <>
                      <div>• Type: Knowledge Base</div>
                      <div>• KB: {selectedKB?.name} ({selectedKB?.id})</div>
                      <div>• Model: {modelId}</div>
                      <div>• Tools: retrieve, retrieve_and_generate, get_status, sync</div>
                    </>
                  )}
                </div>
              </div>

              {error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <div>
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="text-sm text-slate-600 hover:text-slate-800">
                ← Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
              Cancel
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 2 && !canProceedStep2}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={!name.trim() || creating}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
