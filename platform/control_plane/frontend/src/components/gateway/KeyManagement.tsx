/**
 * KeyManagement — Virtual key management page for the AI Gateway.
 *
 * Lists all virtual keys with use_case, budget, spend-to-date, rate limits,
 * and status. Provides create, revoke, and modify actions with confirmation
 * dialogs. Write operations are protected behind the operator role.
 *
 * Task: 13.3
 * Requirements: 12.3, 12.4, 12.6
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../../contexts/UserContext';
import ConfirmDialog from '../ConfirmDialog';
import LoadingSpinner from '../LoadingSpinner';
import client from '../../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VirtualKey {
  key_alias: string;
  use_case: string;
  team: string;
  max_budget: number;
  spend: number;
  models: string[];
  rpm_limit: number | null;
  tpm_limit: number | null;
  created_at: string | null;
  token: string | null;
}

interface CreateKeyForm {
  use_case: string;
  team: string;
  models: string;
  max_budget: number;
  budget_duration: string;
  rpm_limit: number;
  tpm_limit: number;
}

interface UpdateBudgetForm {
  max_budget: number;
  budget_duration: string;
  rpm_limit: number;
  tpm_limit: number;
}

// ---------------------------------------------------------------------------
// Helper: Determine key status
// ---------------------------------------------------------------------------

function getKeyStatus(key: VirtualKey): 'active' | 'exceeded' | 'revoked' {
  if (key.max_budget > 0 && key.spend >= key.max_budget) return 'exceeded';
  return 'active';
}

function StatusBadge({ status }: { status: 'active' | 'exceeded' | 'revoked' }) {
  const styles = {
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    exceeded: 'bg-red-50 text-red-700 ring-red-600/20',
    revoked: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  };
  const labels = { active: 'Active', exceeded: 'Budget Exceeded', revoked: 'Revoked' };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}>
      <span className={`mr-1 h-1.5 w-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500' : status === 'exceeded' ? 'bg-red-500' : 'bg-slate-400'}`} />
      {labels[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Budget utilization bar
// ---------------------------------------------------------------------------

function BudgetBar({ spend, budget }: { spend: number; budget: number }) {
  if (budget <= 0) return <span className="text-xs text-slate-400">No budget set</span>;
  const pct = Math.min((spend / budget) * 100, 100);
  const color = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 whitespace-nowrap">{pct.toFixed(0)}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function KeyManagement() {
  const { user } = useUser();
  const isOperator = user?.role === 'operator' || user?.role === 'admin';

  const [keys, setKeys] = useState<VirtualKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create key state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateKeyForm>({
    use_case: '',
    team: '',
    models: '',
    max_budget: 500,
    budget_duration: 'monthly',
    rpm_limit: 100,
    tpm_limit: 100000,
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);

  // Available models for multi-select
  const [availableModels, setAvailableModels] = useState<{ model_id: string; display_name: string }[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [modelsDropdownOpen, setModelsDropdownOpen] = useState(false);

  // Revoke key state
  const [revokeTarget, setRevokeTarget] = useState<VirtualKey | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  // Update budget state
  const [editTarget, setEditTarget] = useState<VirtualKey | null>(null);
  const [editForm, setEditForm] = useState<UpdateBudgetForm>({
    max_budget: 0,
    budget_duration: 'monthly',
    rpm_limit: 100,
    tpm_limit: 100000,
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  // Notification
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await client.get<VirtualKey[]>('/api/v1/gateway/keys');
      setKeys(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load virtual keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Fetch available models when create modal opens
  useEffect(() => {
    if (showCreateModal && availableModels.length === 0) {
      client.get<{ models: { model_id: string; display_name: string }[]; total_count: number }>('/api/v1/gateway/models')
        .then((res) => setAvailableModels(res.data.models))
        .catch(() => {}); // silently fail — user can still type manually
    }
  }, [showCreateModal, availableModels.length]);

  // ---------------------------------------------------------------------------
  // Create Key
  // ---------------------------------------------------------------------------

  const handleCreateSubmit = () => {
    setShowCreateConfirm(true);
  };

  const confirmCreate = async () => {
    setShowCreateConfirm(false);
    setCreateLoading(true);
    setCreateError(null);
    try {
      const models = selectedModels.length > 0
        ? selectedModels
        : createForm.models.split(',').map((m) => m.trim()).filter(Boolean);
      await client.post('/api/v1/gateway/keys', {
        use_case: createForm.use_case,
        team: createForm.team,
        models,
        max_budget: createForm.max_budget,
        budget_duration: createForm.budget_duration,
        rpm_limit: createForm.rpm_limit,
        tpm_limit: createForm.tpm_limit,
      });
      setNotification({ message: `Key created for "${createForm.use_case}"`, type: 'success' });
      setShowCreateModal(false);
      setCreateForm({ use_case: '', team: '', models: '', max_budget: 500, budget_duration: 'monthly', rpm_limit: 100, tpm_limit: 100000 });
      setSelectedModels([]);
      fetchKeys();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create key');
    } finally {
      setCreateLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Revoke Key
  // ---------------------------------------------------------------------------

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeLoading(true);
    try {
      await client.delete(`/api/v1/gateway/keys/${revokeTarget.use_case}`);
      setNotification({ message: `Key for "${revokeTarget.use_case}" revoked`, type: 'success' });
      setRevokeTarget(null);
      fetchKeys();
    } catch (err: any) {
      setNotification({ message: err.message || 'Failed to revoke key', type: 'error' });
      setRevokeTarget(null);
    } finally {
      setRevokeLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Update Budget
  // ---------------------------------------------------------------------------

  const openEditModal = (key: VirtualKey) => {
    setEditTarget(key);
    setEditForm({
      max_budget: key.max_budget,
      budget_duration: 'monthly',
      rpm_limit: key.rpm_limit ?? 100,
      tpm_limit: key.tpm_limit ?? 100000,
    });
    setEditError(null);
  };

  const handleEditSubmit = () => {
    setShowEditConfirm(true);
  };

  const confirmEdit = async () => {
    if (!editTarget) return;
    setShowEditConfirm(false);
    setEditLoading(true);
    setEditError(null);
    try {
      await client.patch(`/api/v1/gateway/keys/${editTarget.use_case}/budget`, {
        max_budget: editForm.max_budget,
        budget_duration: editForm.budget_duration,
        rpm_limit: editForm.rpm_limit,
        tpm_limit: editForm.tpm_limit,
      });
      setNotification({ message: `Budget updated for "${editTarget.use_case}"`, type: 'success' });
      setEditTarget(null);
      fetchKeys();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update budget');
    } finally {
      setEditLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <div className="mb-3">
          <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
            ← Back to Governance
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Virtual Key Management</h1>
            <p className="text-slate-500 mt-1">
              Manage virtual keys for the AI Gateway. Each key scopes a use case to specific models with budget and rate limits.
            </p>
          </div>
          {isOperator && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create Key
            </button>
          )}
        </div>

        {/* Notification banner */}
        {notification && (
          <div className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {notification.message}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700 font-medium">{error}</p>
            <button onClick={fetchKeys} className="mt-3 text-sm text-red-600 hover:text-red-800 underline">
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && keys.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
            <h3 className="text-lg font-semibold text-slate-700 mb-1">No virtual keys</h3>
            <p className="text-sm text-slate-500">
              {isOperator
                ? 'Create a virtual key to scope model access and budgets for a use case.'
                : 'No virtual keys have been created yet. Ask an operator to create one.'}
            </p>
          </div>
        )}

        {/* Keys table */}
        {!loading && !error && keys.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Use Case</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Team</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Budget</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-40">Utilization</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Rate Limits</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                    {isOperator && <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {keys.map((key) => {
                    const status = getKeyStatus(key);
                    return (
                      <tr key={key.key_alias || key.use_case} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{key.use_case}</div>
                          {key.key_alias && (
                            <div className="text-xs text-slate-400 mt-0.5 font-mono">{key.key_alias}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{key.team}</td>
                        <td className="px-4 py-3">
                          <div className="text-slate-900 font-medium">${key.spend.toFixed(2)} <span className="text-slate-400 font-normal">/ ${key.max_budget.toFixed(2)}</span></div>
                        </td>
                        <td className="px-4 py-3 w-40">
                          <BudgetBar spend={key.spend} budget={key.max_budget} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-slate-600">
                            {key.rpm_limit && <span className="mr-2">{key.rpm_limit} RPM</span>}
                            {key.tpm_limit && <span>{(key.tpm_limit / 1000).toFixed(0)}k TPM</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={status} /></td>
                        {isOperator && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditModal(key)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                title="Edit budget"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                              </button>
                              <button
                                onClick={() => setRevokeTarget(key)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Revoke key"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Create Key Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-slate-900 mb-4">Create Virtual Key</h2>
                {createError && (
                  <div className="mb-4 bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 border border-red-200">
                    {createError}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Use Case</label>
                    <input
                      type="text"
                      value={createForm.use_case}
                      onChange={(e) => setCreateForm({ ...createForm, use_case: e.target.value })}
                      placeholder="e.g., kyc_banking"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Team</label>
                    <input
                      type="text"
                      value={createForm.team}
                      onChange={(e) => setCreateForm({ ...createForm, team: e.target.value })}
                      placeholder="e.g., fsi-compliance"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Models</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setModelsDropdownOpen(!modelsDropdownOpen)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent flex items-center justify-between"
                      >
                        <span className={selectedModels.length === 0 ? 'text-slate-400' : 'text-slate-900'}>
                          {selectedModels.length === 0
                            ? 'Select models...'
                            : `${selectedModels.length} model${selectedModels.length > 1 ? 's' : ''} selected`}
                        </span>
                        <svg className={`w-4 h-4 text-slate-400 transition-transform ${modelsDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                      {modelsDropdownOpen && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {availableModels.map((m) => (
                            <label
                              key={m.model_id}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={selectedModels.includes(m.model_id)}
                                onChange={() => {
                                  setSelectedModels((prev) =>
                                    prev.includes(m.model_id)
                                      ? prev.filter((id) => id !== m.model_id)
                                      : [...prev, m.model_id]
                                  );
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-slate-700">{m.display_name}</span>
                              <span className="text-slate-400 text-xs ml-auto">{m.model_id}</span>
                            </label>
                          ))}
                          {availableModels.length === 0 && (
                            <div className="px-3 py-2 text-sm text-slate-400">Loading models...</div>
                          )}
                        </div>
                      )}
                    </div>
                    {selectedModels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedModels.map((id) => {
                          const model = availableModels.find((m) => m.model_id === id);
                          return (
                            <span key={id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-1 rounded-md">
                              {model?.display_name || id}
                              <button
                                type="button"
                                onClick={() => setSelectedModels((prev) => prev.filter((m) => m !== id))}
                                className="text-indigo-400 hover:text-indigo-600"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Budget (USD)</label>
                      <input
                        type="number"
                        min={1}
                        value={createForm.max_budget}
                        onChange={(e) => setCreateForm({ ...createForm, max_budget: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Budget Period</label>
                      <select
                        value={createForm.budget_duration}
                        onChange={(e) => setCreateForm({ ...createForm, budget_duration: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="daily">Daily</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">RPM Limit</label>
                      <input
                        type="number"
                        min={1}
                        value={createForm.rpm_limit}
                        onChange={(e) => setCreateForm({ ...createForm, rpm_limit: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">TPM Limit</label>
                      <input
                        type="number"
                        min={1}
                        value={createForm.tpm_limit}
                        onChange={(e) => setCreateForm({ ...createForm, tpm_limit: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateSubmit}
                  disabled={createLoading || !createForm.use_case || !createForm.team || selectedModels.length === 0}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createLoading ? 'Creating...' : 'Create Key'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Budget Modal */}
        {editTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-slate-900 mb-1">Modify Key Budget</h2>
                <p className="text-sm text-slate-500 mb-4">Updating budget for <span className="font-medium text-slate-700">{editTarget.use_case}</span></p>
                {editError && (
                  <div className="mb-4 bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 border border-red-200">
                    {editError}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Budget (USD)</label>
                    <input
                      type="number"
                      min={1}
                      value={editForm.max_budget}
                      onChange={(e) => setEditForm({ ...editForm, max_budget: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">RPM Limit</label>
                      <input
                        type="number"
                        min={1}
                        value={editForm.rpm_limit}
                        onChange={(e) => setEditForm({ ...editForm, rpm_limit: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">TPM Limit</label>
                      <input
                        type="number"
                        min={1}
                        value={editForm.tpm_limit}
                        onChange={(e) => setEditForm({ ...editForm, tpm_limit: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <button
                  onClick={() => setEditTarget(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSubmit}
                  disabled={editLoading || editForm.max_budget <= 0}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editLoading ? 'Updating...' : 'Update Budget'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Revoke Confirmation Dialog */}
        <ConfirmDialog
          open={!!revokeTarget}
          title="Revoke Virtual Key"
          message={`Are you sure you want to revoke the key for "${revokeTarget?.use_case}"? This will immediately block all API requests using this key and cannot be undone.`}
          confirmText={revokeLoading ? 'Revoking...' : 'Revoke Key'}
          cancelText="Cancel"
          variant="danger"
          onConfirm={confirmRevoke}
          onCancel={() => setRevokeTarget(null)}
        />

        {/* Create Confirmation Dialog */}
        <ConfirmDialog
          open={showCreateConfirm}
          title="Confirm Key Creation"
          message={`Create a virtual key for "${createForm.use_case}" (team: ${createForm.team}) with a $${createForm.max_budget}/month budget?`}
          confirmText="Create"
          cancelText="Cancel"
          variant="info"
          onConfirm={confirmCreate}
          onCancel={() => setShowCreateConfirm(false)}
        />

        {/* Edit Confirmation Dialog */}
        <ConfirmDialog
          open={showEditConfirm}
          title="Confirm Budget Update"
          message={`Update the budget for "${editTarget?.use_case}" to $${editForm.max_budget}/month with ${editForm.rpm_limit} RPM and ${(editForm.tpm_limit / 1000).toFixed(0)}k TPM limits?`}
          confirmText="Update"
          cancelText="Cancel"
          variant="warning"
          onConfirm={confirmEdit}
          onCancel={() => setShowEditConfirm(false)}
        />
      </div>
    </div>
  );
}
