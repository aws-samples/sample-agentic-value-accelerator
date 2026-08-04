/**
 * RiskControls — Control library with risk mappings and framework associations
 * Supports adding, editing, and deleting controls
 */

import { useState, useId } from 'react';
import { CONTROLS as INITIAL_CONTROLS, RISKS, RISK_CATEGORIES, type Control, type RiskCategory } from './riskData';
import { GOVERNANCE_FRAMEWORK_NAMES } from '../mockData';
import { usePersistedState } from '../usePersistedState';
import { rowButtonProps } from '../a11y';

const CONTROL_TYPES = ['preventive', 'detective', 'corrective'] as const;
const CONTROL_STATUS = ['implemented', 'partial', 'planned', 'not-implemented'] as const;
const EFFECTIVENESS_LEVELS = ['high', 'medium', 'low'] as const;
// Single source of truth — shared with ComplianceCenter via mockData.
const COMMON_FRAMEWORKS = GOVERNANCE_FRAMEWORK_NAMES;

type ControlFormDrawerProps = {
  control: Control | null;
  onSave: (control: Control) => void;
  onClose: () => void;
  existingIds: string[];
  allRisks: typeof RISKS;
};

function ControlFormDrawer({ control, onSave, onClose, existingIds, allRisks }: ControlFormDrawerProps) {
  const isEditing = control !== null;
  const [form, setForm] = useState<Control>(
    control ?? {
      id: '',
      name: '',
      description: '',
      type: 'preventive',
      category: 'operational',
      status: 'planned',
      effectiveness: 'medium',
      owner: '',
      evidence: '',
      evidenceLink: '',
      lastTested: '',
      riskIds: [],
      frameworks: [],
    }
  );
  const [newFramework, setNewFramework] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fid = useId();

  const generateId = () => {
    const maxNum = existingIds
      .map(id => parseInt(id.replace('CTL-', ''), 10))
      .filter(n => !isNaN(n))
      .reduce((max, n) => Math.max(max, n), 0);
    return `CTL-${String(maxNum + 1).padStart(3, '0')}`;
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.description.trim()) errs.description = 'Description is required';
    if (!form.owner.trim()) errs.owner = 'Owner is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const id = isEditing ? form.id : generateId();
    onSave({ ...form, id });
  };

  const toggleRisk = (riskId: string) => {
    setForm(prev => ({
      ...prev,
      riskIds: prev.riskIds.includes(riskId)
        ? prev.riskIds.filter(r => r !== riskId)
        : [...prev.riskIds, riskId],
    }));
  };

  const toggleFramework = (fw: string) => {
    setForm(prev => ({
      ...prev,
      frameworks: prev.frameworks.includes(fw)
        ? prev.frameworks.filter(f => f !== fw)
        : [...prev.frameworks, fw],
    }));
  };

  const addCustomFramework = () => {
    if (newFramework.trim() && !form.frameworks.includes(newFramework.trim())) {
      setForm(prev => ({ ...prev, frameworks: [...prev.frameworks, newFramework.trim()] }));
      setNewFramework('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEditing ? 'Edit Control' : 'Add New Control'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label htmlFor={`${fid}-name`} className="block text-sm font-medium text-slate-700 mb-1">Control Name *</label>
            <input
              id={`${fid}-name`}
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? 'border-red-300' : 'border-slate-200'}`}
              placeholder="e.g., PII detection and redaction"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Description */}
          <div>
            <label htmlFor={`${fid}-description`} className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
            <textarea
              id={`${fid}-description`}
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.description ? 'border-red-300' : 'border-slate-200'}`}
              placeholder="Describe what this control does and how it mitigates risk"
            />
            {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
          </div>

          {/* Type & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${fid}-type`} className="block text-sm font-medium text-slate-700 mb-1">Control Type *</label>
              <select
                id={`${fid}-type`}
                value={form.type}
                onChange={e => setForm(prev => ({ ...prev, type: e.target.value as Control['type'] }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CONTROL_TYPES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${fid}-category`} className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
              <select
                id={`${fid}-category`}
                value={form.category}
                onChange={e => setForm(prev => ({ ...prev, category: e.target.value as RiskCategory }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {RISK_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status & Effectiveness */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${fid}-status`} className="block text-sm font-medium text-slate-700 mb-1">Status *</label>
              <select
                id={`${fid}-status`}
                value={form.status}
                onChange={e => setForm(prev => ({ ...prev, status: e.target.value as Control['status'] }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CONTROL_STATUS.map(s => (
                  <option key={s} value={s}>{s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${fid}-effectiveness`} className="block text-sm font-medium text-slate-700 mb-1">Effectiveness *</label>
              <select
                id={`${fid}-effectiveness`}
                value={form.effectiveness}
                onChange={e => setForm(prev => ({ ...prev, effectiveness: e.target.value as Control['effectiveness'] }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {EFFECTIVENESS_LEVELS.map(e => (
                  <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Owner */}
          <div>
            <label htmlFor={`${fid}-owner`} className="block text-sm font-medium text-slate-700 mb-1">Owner *</label>
            <input
              id={`${fid}-owner`}
              type="text"
              value={form.owner}
              onChange={e => setForm(prev => ({ ...prev, owner: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.owner ? 'border-red-300' : 'border-slate-200'}`}
              placeholder="e.g., RAI Council, Security Team"
            />
            {errors.owner && <p className="text-xs text-red-500 mt-1">{errors.owner}</p>}
          </div>

          {/* Evidence */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${fid}-evidence`} className="block text-sm font-medium text-slate-700 mb-1">Evidence</label>
              <input
                id={`${fid}-evidence`}
                type="text"
                value={form.evidence ?? ''}
                onChange={e => setForm(prev => ({ ...prev, evidence: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Audit report Q1 2026"
              />
            </div>
            <div>
              <label htmlFor={`${fid}-evidenceLink`} className="block text-sm font-medium text-slate-700 mb-1">Evidence Link</label>
              <input
                id={`${fid}-evidenceLink`}
                type="text"
                value={form.evidenceLink ?? ''}
                onChange={e => setForm(prev => ({ ...prev, evidenceLink: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="URL to documentation"
              />
            </div>
          </div>

          {/* Last Tested */}
          <div>
            <label htmlFor={`${fid}-lastTested`} className="block text-sm font-medium text-slate-700 mb-1">Last Tested</label>
            <input
              id={`${fid}-lastTested`}
              type="date"
              value={form.lastTested ?? ''}
              onChange={e => setForm(prev => ({ ...prev, lastTested: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Frameworks */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Regulatory Frameworks</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {COMMON_FRAMEWORKS.map(fw => (
                <button
                  key={fw}
                  type="button"
                  onClick={() => toggleFramework(fw)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                    form.frameworks.includes(fw)
                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {fw}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="Add custom regulatory framework"
                value={newFramework}
                onChange={e => setNewFramework(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomFramework())}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add custom framework"
              />
              <button
                type="button"
                onClick={addCustomFramework}
                className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
              >
                Add
              </button>
            </div>
            {form.frameworks.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.frameworks.filter(f => !COMMON_FRAMEWORKS.includes(f)).map(fw => (
                  <span key={fw} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">
                    {fw}
                    <button onClick={() => toggleFramework(fw)} className="text-slate-400 hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Risks Mitigated */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Risks Mitigated</label>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {allRisks.map(risk => (
                <label
                  key={risk.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.riskIds.includes(risk.id)}
                    onChange={() => toggleRisk(risk.id)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-[10px] text-slate-400 mr-2">{risk.id}</span>
                    <span className="text-sm text-slate-900">{risk.title}</span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    risk.inherentScore >= 15 ? 'bg-red-100 text-red-700' :
                    risk.inherentScore >= 10 ? 'bg-amber-100 text-amber-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {risk.inherentScore}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            {isEditing ? 'Save Changes' : 'Add Control'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RiskControls() {
  const [controls, setControls] = usePersistedState<Control[]>('risk_controls', INITIAL_CONTROLS);
  const [selectedControl, setSelectedControl] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterFramework, setFilterFramework] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editingControl, setEditingControl] = useState<Control | null>(null);

  const controlTypes = ['all', ...new Set(controls.map(c => c.type))];
  const frameworks = ['all', ...new Set(controls.flatMap(c => c.frameworks))];

  const filteredControls = controls.filter(control => {
    const matchesType = filterType === 'all' || control.type === filterType;
    const matchesFramework = filterFramework === 'all' || control.frameworks.includes(filterFramework);
    const matchesSearch = searchTerm === '' ||
      control.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      control.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesFramework && matchesSearch;
  });

  const selectedData = selectedControl ? controls.find(c => c.id === selectedControl) : null;

  const handleAddControl = (control: Control) => {
    setControls(prev => [...prev, control]);
    setShowAddDrawer(false);
  };

  const handleEditControl = (control: Control) => {
    setControls(prev => prev.map(c => c.id === control.id ? control : c));
    setEditingControl(null);
    setSelectedControl(control.id);
  };

  const handleDeleteControl = (controlId: string) => {
    if (window.confirm('Are you sure you want to delete this control?')) {
      setControls(prev => prev.filter(c => c.id !== controlId));
      if (selectedControl === controlId) setSelectedControl(null);
    }
  };

  const getEffectivenessColor = (eff: Control['effectiveness']) => {
    if (eff === 'high') return 'text-emerald-600 bg-emerald-50';
    if (eff === 'medium') return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const getEffectivenessPercent = (eff: Control['effectiveness']) => {
    if (eff === 'high') return 90;
    if (eff === 'medium') return 60;
    return 30;
  };

  const getTypeIcon = (type: Control['type']) => {
    switch (type) {
      case 'preventive':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        );
      case 'detective':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        );
      case 'corrective':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Drawer */}
      {(showAddDrawer || editingControl) && (
        <ControlFormDrawer
          control={editingControl}
          onSave={editingControl ? handleEditControl : handleAddControl}
          onClose={() => { setShowAddDrawer(false); setEditingControl(null); }}
          existingIds={controls.map(c => c.id)}
          allRisks={RISKS}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Control Library</h3>
          <p className="text-xs text-slate-500 mt-1">Preventive, detective, and corrective controls mapped to risks</p>
        </div>
        <button
          onClick={() => setShowAddDrawer(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          + Add Control
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            aria-label="Search controls"
            placeholder="Search controls..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          aria-label="Filter by control type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {controlTypes.map(type => (
            <option key={type} value={type}>{type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}</option>
          ))}
        </select>
        <select
          aria-label="Filter by framework"
          value={filterFramework}
          onChange={(e) => setFilterFramework(e.target.value)}
          className="px-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {frameworks.map(fw => (
            <option key={fw} value={fw}>{fw === 'all' ? 'All Frameworks' : fw}</option>
          ))}
        </select>
      </div>

      {/* Control Type Summary */}
      <div className="grid grid-cols-3 gap-4">
        {(['preventive', 'detective', 'corrective'] as const).map(type => {
          const typeControls = controls.filter(c => c.type === type);
          const highEff = typeControls.filter(c => c.effectiveness === 'high').length;
          return (
            <div key={type} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${
                  type === 'preventive' ? 'bg-blue-100 text-blue-600' :
                  type === 'detective' ? 'bg-purple-100 text-purple-600' :
                  'bg-amber-100 text-amber-600'
                }`}>
                  {getTypeIcon(type)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 capitalize">{type}</div>
                  <div className="text-xs text-slate-500">{typeControls.length} controls</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">High Effectiveness</span>
                <span className="text-sm font-semibold text-emerald-600">
                  {highEff}/{typeControls.length}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredControls.map(control => {
          const mitigatedRisks = RISKS.filter(r => control.riskIds.includes(r.id));
          return (
            <div
              key={control.id}
              {...rowButtonProps(
                () => setSelectedControl(selectedControl === control.id ? null : control.id),
                `View control ${control.id}: ${control.name}`
              )}
              className={`bg-white/80 backdrop-blur-sm rounded-xl border p-4 shadow-sm cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                selectedControl === control.id
                  ? 'border-blue-300 ring-2 ring-blue-500'
                  : 'border-slate-200/60 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-400">{control.id}</span>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded capitalize ${
                    control.type === 'preventive' ? 'bg-blue-100 text-blue-700' :
                    control.type === 'detective' ? 'bg-purple-100 text-purple-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {control.type}
                  </span>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${getEffectivenessColor(control.effectiveness)}`}>
                  {control.effectiveness}
                </span>
              </div>

              <h4 className="text-sm font-semibold text-slate-900 mb-1">{control.name}</h4>
              <p className="text-xs text-slate-600 mb-3 line-clamp-2">{control.description}</p>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Mitigates:</span>
                  <span className="font-medium text-slate-700">{mitigatedRisks.length} risks</span>
                </div>
                <div className="flex gap-1">
                  {control.frameworks.slice(0, 2).map(fw => (
                    <span key={fw} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px]">
                      {fw}
                    </span>
                  ))}
                  {control.frameworks.length > 2 && (
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px]">
                      +{control.frameworks.length - 2}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Control Detail Panel */}
      {selectedData && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs text-slate-400">{selectedData.id}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${
                  selectedData.type === 'preventive' ? 'bg-blue-100 text-blue-700' :
                  selectedData.type === 'detective' ? 'bg-purple-100 text-purple-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {selectedData.type}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{selectedData.name}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); setEditingControl(selectedData); }}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                Edit
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteControl(selectedData.id); }}
                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                Delete
              </button>
              <button onClick={() => setSelectedControl(null)} className="text-slate-400 hover:text-slate-600 ml-2" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <p className="text-sm text-slate-600 mb-4">{selectedData.description}</p>

          {/* Effectiveness */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-900">Control Effectiveness</span>
              <span className={`text-sm font-semibold px-2 py-0.5 rounded capitalize ${getEffectivenessColor(selectedData.effectiveness)}`}>
                {selectedData.effectiveness}
              </span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  selectedData.effectiveness === 'high' ? 'bg-emerald-500' :
                  selectedData.effectiveness === 'medium' ? 'bg-amber-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${getEffectivenessPercent(selectedData.effectiveness)}%` }}
              />
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase">Owner</div>
              <div className="text-sm font-medium text-slate-900">{selectedData.owner}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase">Status</div>
              <div className="text-sm font-medium text-slate-900 capitalize">{selectedData.status.replace('-', ' ')}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase">Last Tested</div>
              <div className="text-sm font-medium text-slate-900">{selectedData.lastTested || 'Not tested'}</div>
            </div>
          </div>

          {/* Evidence */}
          {(selectedData.evidence || selectedData.evidenceLink) && (
            <div className="mb-6">
              <div className="text-sm font-semibold text-slate-900 mb-2">Evidence</div>
              <div className="p-3 bg-slate-50 rounded-lg">
                {selectedData.evidence && <div className="text-sm text-slate-700">{selectedData.evidence}</div>}
                {selectedData.evidenceLink && (
                  <a href={selectedData.evidenceLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                    {selectedData.evidenceLink}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Frameworks */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-slate-900 mb-2">Regulatory Frameworks</div>
            <div className="flex flex-wrap gap-2">
              {selectedData.frameworks.length > 0 ? selectedData.frameworks.map(fw => (
                <span key={fw} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                  {fw}
                </span>
              )) : (
                <span className="text-xs text-slate-500">No frameworks mapped</span>
              )}
            </div>
          </div>

          {/* Mitigated Risks */}
          <div>
            <div className="text-sm font-semibold text-slate-900 mb-3">Risks Mitigated by This Control</div>
            <div className="space-y-2">
              {RISKS.filter(r => selectedData.riskIds.includes(r.id)).length > 0 ? (
                RISKS.filter(r => selectedData.riskIds.includes(r.id)).map(risk => (
                  <div key={risk.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <span className="font-mono text-[10px] text-slate-400 mr-2">{risk.id}</span>
                      <span className="text-sm text-slate-900">{risk.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Residual:</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        risk.residualScore >= 15 ? 'bg-red-100 text-red-700' :
                        risk.residualScore >= 10 ? 'bg-amber-100 text-amber-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {risk.residualScore}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 p-3 bg-slate-50 rounded-lg">No risks mapped to this control</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Control Types Legend */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Control Types</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 border border-blue-200 bg-blue-50/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-blue-100 text-blue-600 rounded">
                {getTypeIcon('preventive')}
              </div>
              <span className="text-sm font-semibold text-blue-700">Preventive</span>
            </div>
            <p className="text-xs text-slate-600">Stop risks from materializing. Applied before an event occurs.</p>
          </div>
          <div className="p-4 border border-purple-200 bg-purple-50/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-purple-100 text-purple-600 rounded">
                {getTypeIcon('detective')}
              </div>
              <span className="text-sm font-semibold text-purple-700">Detective</span>
            </div>
            <p className="text-xs text-slate-600">Identify risks that have occurred. Monitor and alert on issues.</p>
          </div>
          <div className="p-4 border border-amber-200 bg-amber-50/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-amber-100 text-amber-600 rounded">
                {getTypeIcon('corrective')}
              </div>
              <span className="text-sm font-semibold text-amber-700">Corrective</span>
            </div>
            <p className="text-xs text-slate-600">Remediate issues after detection. Fix and recover from incidents.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
