/**
 * ValidationPanelUI — Adversarial validation panel for harness governance.
 *
 * Inspired by Visa VVAH (Vulnerability Validation and Assessment Harness):
 * - Multi-persona validation with specialized reviewers
 * - Weighted scoring with critical gate logic
 * - Visual representation of validation criteria and verdicts
 *
 * Features:
 * - 3-column layout showing persona findings
 * - Weighted score visualization (bar chart)
 * - Critical gate indicators (red if failed, cannot proceed)
 * - Final verdict badge
 */

import { useState, useEffect, useMemo } from 'react';
import {
  governValidationApi,
  type ValidationPanel,
  type ValidationPersona,
  type PersonaVerdict,
  type ValidationTargetType,
  type ValidationPanelFindingRequest,
} from '../../api/client';
import { Icon, type IconName } from './icons';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERSONA_CONFIG: Record<ValidationPersona, { label: string; icon: IconName; color: string; bgColor: string; description: string }> = {
  security_architect: {
    label: 'Security Architect',
    icon: 'shield-check',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    description: 'Reviews architecture, threat model, and security patterns',
  },
  penetration_tester: {
    label: 'Penetration Tester',
    icon: 'bolt',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    description: 'Tests for exploitable vulnerabilities and attack vectors',
  },
  compliance_reviewer: {
    label: 'Compliance Reviewer',
    icon: 'clipboard',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    description: 'Verifies regulatory and policy compliance',
  },
  cross_repo_analyzer: {
    label: 'Cross-Repo Analyzer',
    icon: 'magnifying-glass',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    description: 'Analyzes impact across codebases and dependencies',
  },
};

const TARGET_TYPE_CONFIG: Record<ValidationTargetType, { label: string; icon: IconName }> = {
  harness_action: { label: 'Harness Action', icon: 'cpu-chip' },
  code_change: { label: 'Code Change', icon: 'document-text' },
  policy_change: { label: 'Policy Change', icon: 'shield-check' },
};

const VERDICT_CONFIG: Record<PersonaVerdict, { label: string; color: string; bgColor: string; icon: IconName }> = {
  approve: { label: 'Approve', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: 'check-circle' },
  reject: { label: 'Reject', color: 'text-rose-700', bgColor: 'bg-rose-100', icon: 'x-circle' },
  needs_review: { label: 'Needs Review', color: 'text-amber-700', bgColor: 'bg-amber-100', icon: 'exclamation-triangle' },
};

const PANEL_VERDICT_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: IconName }> = {
  validated: { label: 'Validated', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: 'check-badge' },
  validation_failed: { label: 'Validation Failed', color: 'text-rose-700', bgColor: 'bg-rose-100', icon: 'x-circle' },
  needs_review: { label: 'Needs Review', color: 'text-amber-700', bgColor: 'bg-amber-100', icon: 'exclamation-triangle' },
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

interface ScoreBarProps {
  label: string;
  score: number | null;
  weight: number;
  isCritical: boolean;
  /** Records a real score for this criterion. Omit to render read-only. */
  onScore?: (score: number) => void;
  saving?: boolean;
}

/**
 * One criterion's score.
 *
 * `score === null` means NOBODY HAS ASSESSED IT. The backend used to paper over that
 * by writing the persona average into every unscored criterion, which produced panels
 * reading "Weighted Total 90.0%" and "Critical Gates: Passed" when not a single
 * criterion had been scored. That imputation is gone, so this component is now the
 * only way a score gets set - hence the input.
 */
function ScoreBar({ label, score, weight, isCritical, onScore, saving }: ScoreBarProps) {
  const displayScore = score ?? 0;
  const barColor = displayScore >= 70 ? 'bg-emerald-500' : displayScore >= 50 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="flex items-center gap-3">
      <div className="w-36 flex items-center gap-1.5">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        {isCritical && (
          <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1 rounded" title="Critical gate - must pass">
            GATE
          </span>
        )}
      </div>
      <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${displayScore}%` }}
        />
        {score === null && (
          <div className="absolute inset-0 flex items-center justify-center text-[9px] text-slate-500">
            Pending
          </div>
        )}
      </div>
      <div className="w-16 text-right text-xs font-semibold text-slate-700">
        {score !== null ? `${Math.round(score)}%` : <span className="text-slate-400">not scored</span>}
      </div>
      <div className="w-12 text-right text-[10px] text-slate-500">
        {(weight * 100).toFixed(0)}% wt
      </div>
      {onScore && (
        <ScoreInput current={score} saving={saving} onSubmit={onScore} label={label} />
      )}
    </div>
  );
}

/**
 * Records a real 0-100 score against one criterion.
 *
 * Deliberately requires an explicit value and an explicit commit: there is no default
 * and no pre-filled number, because a default IS an imputation and that is the defect
 * being fixed. An empty field stays `not scored`.
 */
function ScoreInput({
  current,
  saving,
  onSubmit,
  label,
}: {
  current: number | null;
  saving?: boolean;
  onSubmit: (score: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<string>('');

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === '' || Number.isNaN(n) || n < 0 || n > 100) return;
    onSubmit(Math.round(n));
    setDraft('');
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={100}
        value={draft}
        disabled={saving}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); }}
        placeholder={current !== null ? String(Math.round(current)) : '0-100'}
        aria-label={`Score for ${label}`}
        className="w-16 text-xs px-1.5 py-0.5 border border-slate-300 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-100"
      />
      <button
        onClick={commit}
        disabled={saving || draft.trim() === ''}
        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-white disabled:bg-slate-300 disabled:text-slate-500"
      >
        {saving ? '…' : 'Set'}
      </button>
    </div>
  );
}

interface PersonaCardProps {
  persona: ValidationPersona;
  finding?: {
    verdict: PersonaVerdict;
    confidence: number;
    findings: string[];
    recommendations: string[];
    submitted_at: string;
    submitted_by: string | null;
  };
  onSubmit?: (finding: ValidationPanelFindingRequest) => void;
  disabled?: boolean;
}

function PersonaCard({ persona, finding, onSubmit, disabled }: PersonaCardProps) {
  const config = PERSONA_CONFIG[persona];
  const [isEditing, setIsEditing] = useState(false);
  const [verdict, setVerdict] = useState<PersonaVerdict>(finding?.verdict || 'needs_review');
  const [confidence, setConfidence] = useState(finding?.confidence || 0.8);
  const [findingsText, setFindingsText] = useState(finding?.findings.join('\n') || '');
  const [recommendationsText, setRecommendationsText] = useState(finding?.recommendations.join('\n') || '');

  const handleSubmit = () => {
    if (onSubmit) {
      onSubmit({
        persona,
        verdict,
        confidence,
        findings: findingsText.split('\n').filter(Boolean),
        recommendations: recommendationsText.split('\n').filter(Boolean),
      });
    }
    setIsEditing(false);
  };

  return (
    <div className={`rounded-xl border border-slate-200 overflow-hidden ${finding ? 'bg-white' : 'bg-slate-50'}`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-3 ${config.bgColor}`}>
        <Icon name={config.icon} className={`w-5 h-5 ${config.color}`} />
        <div className="flex-1">
          <div className={`text-sm font-semibold ${config.color}`}>{config.label}</div>
          <div className="text-[10px] text-slate-600">{config.description}</div>
        </div>
        {finding && !isEditing && (
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${VERDICT_CONFIG[finding.verdict].bgColor}`}>
            <Icon name={VERDICT_CONFIG[finding.verdict].icon} className={`w-3.5 h-3.5 ${VERDICT_CONFIG[finding.verdict].color}`} />
            <span className={`text-[10px] font-semibold ${VERDICT_CONFIG[finding.verdict].color}`}>
              {VERDICT_CONFIG[finding.verdict].label}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {isEditing ? (
          <div className="space-y-3">
            {/* Verdict selector */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Verdict</label>
              <div className="flex gap-2">
                {(['approve', 'needs_review', 'reject'] as PersonaVerdict[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setVerdict(v)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      verdict === v
                        ? `${VERDICT_CONFIG[v].bgColor} ${VERDICT_CONFIG[v].color}`
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Icon name={VERDICT_CONFIG[v].icon} className="w-3.5 h-3.5" />
                    {VERDICT_CONFIG[v].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Confidence slider */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">
                Confidence: {(confidence * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={confidence * 100}
                onChange={e => setConfidence(parseInt(e.target.value, 10) / 100)}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Findings */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Findings (one per line)</label>
              <textarea
                value={findingsText}
                onChange={e => setFindingsText(e.target.value)}
                placeholder="Enter findings, one per line..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                rows={3}
              />
            </div>

            {/* Recommendations */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Recommendations (one per line)</label>
              <textarea
                value={recommendationsText}
                onChange={e => setRecommendationsText(e.target.value)}
                placeholder="Enter recommendations, one per line..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                rows={2}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                Submit Finding
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : finding ? (
          <div className="space-y-3">
            {/* Confidence */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Confidence:</span>
              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${finding.confidence * 100}%` }}
                />
              </div>
              <span className="font-semibold text-slate-700">{(finding.confidence * 100).toFixed(0)}%</span>
            </div>

            {/* Findings */}
            {finding.findings.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Findings</div>
                <ul className="space-y-1">
                  {finding.findings.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                      <span className="text-slate-400 mt-0.5">-</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {finding.recommendations.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Recommendations</div>
                <ul className="space-y-1">
                  {finding.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                      <Icon name="light-bulb" className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Edit button */}
            {!disabled && (
              <button
                onClick={() => setIsEditing(true)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-colors"
              >
                Update Finding
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="text-xs text-slate-400 mb-2">No finding submitted</div>
            {!disabled && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-colors"
              >
                Submit Finding
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface Props {
  panelId?: string;
  onClose?: () => void;
}

export default function ValidationPanelUI({ panelId, onClose }: Props) {
  const [panels, setPanels] = useState<ValidationPanel[]>([]);
  const [selectedPanel, setSelectedPanel] = useState<ValidationPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Create panel state
  const [showCreate, setShowCreate] = useState(false);
  const [createTargetType, setCreateTargetType] = useState<ValidationTargetType>('harness_action');
  const [createTargetId, setCreateTargetId] = useState('');
  const [createDescription, setCreateDescription] = useState('');

  // Fetch panels on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governValidationApi.listPanels()
      .then(data => {
        if (!cancelled) {
          setPanels(data);
          if (panelId) {
            const p = data.find(x => x.panel_id === panelId);
            if (p) setSelectedPanel(p);
          }
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load panels');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [panelId]);

  const handleCreatePanel = async () => {
    if (!createTargetId.trim()) return;
    try {
      const panel = await governValidationApi.createPanel({
        target_type: createTargetType,
        target_id: createTargetId.trim(),
        target_description: createDescription.trim() || undefined,
      });
      setPanels(prev => [panel, ...prev]);
      setSelectedPanel(panel);
      setShowCreate(false);
      setCreateTargetId('');
      setCreateDescription('');
      showToast('Validation panel created');
    } catch (err: any) {
      showToast(err.message || 'Failed to create panel');
    }
  };

  const handleSubmitFinding = async (finding: ValidationPanelFindingRequest) => {
    if (!selectedPanel) return;
    try {
      const updated = await governValidationApi.submitFinding(selectedPanel.panel_id, finding);
      setSelectedPanel(updated);
      setPanels(prev => prev.map(p => p.panel_id === updated.panel_id ? updated : p));
      showToast(`${PERSONA_CONFIG[finding.persona].label} finding submitted`);
    } catch (err: any) {
      showToast(err.message || 'Failed to submit finding');
    }
  };

  // Records a REAL score for one criterion. This is now the only way a criterion gets
  // a score: the backend no longer imputes the persona average into unscored criteria,
  // so without this the panel correctly refuses to validate.
  const [scoringCriterion, setScoringCriterion] = useState<string | null>(null);
  const handleScoreCriterion = async (criterionName: string, score: number) => {
    if (!selectedPanel) return;
    setScoringCriterion(criterionName);
    try {
      const updated = await governValidationApi.updateCriterionScore(
        selectedPanel.panel_id, criterionName, score,
      );
      setSelectedPanel(updated);
      setPanels(prev => prev.map(p => p.panel_id === updated.panel_id ? updated : p));
      showToast(`Scored ${criterionName.replace(/_/g, ' ')}: ${score}%`);
    } catch (err: any) {
      showToast(err.message || 'Failed to record score');
    } finally {
      setScoringCriterion(null);
    }
  };

  const handleFinalizePanel = async () => {
    if (!selectedPanel) return;
    try {
      const updated = await governValidationApi.finalizePanel(selectedPanel.panel_id);
      setSelectedPanel(updated);
      setPanels(prev => prev.map(p => p.panel_id === updated.panel_id ? updated : p));
      showToast(`Panel finalized: ${updated.final_verdict}`);
    } catch (err: any) {
      showToast(err.message || 'Failed to finalize panel');
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const isFinalized = selectedPanel?.finalized_at !== null;

  // Summary stats
  const stats = useMemo(() => {
    const total = panels.length;
    const finalized = panels.filter(p => p.finalized_at).length;
    const validated = panels.filter(p => p.final_verdict === 'validated').length;
    const failed = panels.filter(p => p.final_verdict === 'validation_failed').length;
    return { total, finalized, validated, failed };
  }, [panels]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-1/3" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-slate-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-rose-50 border border-rose-200">
        <div className="flex items-center gap-2 text-rose-700">
          <Icon name="exclamation-triangle" className="w-5 h-5" />
          <span className="font-medium">Error loading validation panels</span>
        </div>
        <p className="text-sm text-rose-600 mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Adversarial Validation Panel</h2>
          <p className="text-xs text-slate-500">
            Multi-persona security validation for harness governance (VVAH-inspired)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <Icon name="x-mark" className="w-5 h-5 text-slate-500" />
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            <Icon name="plus" className="w-4 h-4" />
            New Panel
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
          <div className="text-xs text-slate-500">Total Panels</div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <div className="text-2xl font-bold text-blue-600">{stats.finalized}</div>
          <div className="text-xs text-slate-500">Finalized</div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <div className="text-2xl font-bold text-emerald-600">{stats.validated}</div>
          <div className="text-xs text-slate-500">Validated</div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <div className="text-2xl font-bold text-rose-600">{stats.failed}</div>
          <div className="text-xs text-slate-500">Failed</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Validation Panels</div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {panels.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">
                No panels yet. Create one to start.
              </div>
            ) : (
              panels.map(panel => {
                const targetConfig = TARGET_TYPE_CONFIG[panel.target_type];
                const verdictConfig = panel.final_verdict ? PANEL_VERDICT_CONFIG[panel.final_verdict] : null;
                return (
                  <button
                    key={panel.panel_id}
                    onClick={() => setSelectedPanel(panel)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      selectedPanel?.panel_id === panel.panel_id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon name={targetConfig.icon} className="w-4 h-4 text-slate-500 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{panel.target_id}</div>
                        <div className="text-[10px] text-slate-500">{targetConfig.label}</div>
                      </div>
                      {verdictConfig && (
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${verdictConfig.bgColor} ${verdictConfig.color}`}>
                          <Icon name={verdictConfig.icon} className="w-3 h-3" />
                          {verdictConfig.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                      <span>{panel.persona_findings.length}/4 personas</span>
                      <span>-</span>
                      <span>{new Date(panel.updated_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Panel Detail */}
        <div className="lg:col-span-2">
          {selectedPanel ? (
            <div className="space-y-6">
              {/* Panel Header */}
              <div className="p-4 rounded-xl bg-white border border-slate-200">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon name={TARGET_TYPE_CONFIG[selectedPanel.target_type].icon} className="w-5 h-5 text-slate-600" />
                      <span className="text-sm font-semibold text-slate-900">{selectedPanel.target_id}</span>
                    </div>
                    {selectedPanel.target_description && (
                      <p className="text-xs text-slate-500 mt-1">{selectedPanel.target_description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                      <span>Created: {new Date(selectedPanel.created_at).toLocaleString()}</span>
                      {selectedPanel.finalized_at && (
                        <span>Finalized: {new Date(selectedPanel.finalized_at).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  {selectedPanel.final_verdict && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${PANEL_VERDICT_CONFIG[selectedPanel.final_verdict].bgColor}`}>
                      <Icon name={PANEL_VERDICT_CONFIG[selectedPanel.final_verdict].icon} className={`w-5 h-5 ${PANEL_VERDICT_CONFIG[selectedPanel.final_verdict].color}`} />
                      <div>
                        <div className={`text-sm font-bold ${PANEL_VERDICT_CONFIG[selectedPanel.final_verdict].color}`}>
                          {PANEL_VERDICT_CONFIG[selectedPanel.final_verdict].label}
                        </div>
                        {selectedPanel.weighted_score !== null && (
                          <div className="text-[10px] text-slate-600">
                            Score: {selectedPanel.weighted_score.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Weighted Score Visualization */}
              <div className="p-4 rounded-xl bg-white border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-slate-900">Validation Criteria (VVAH Weights)</div>
                  {selectedPanel.critical_gates_passed !== null && (
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold ${
                      selectedPanel.critical_gates_passed
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}>
                      <Icon name={selectedPanel.critical_gates_passed ? 'check-circle' : 'x-circle'} className="w-3.5 h-3.5" />
                      Critical Gates: {selectedPanel.critical_gates_passed ? 'Passed' : 'Failed'}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {selectedPanel.criteria.map(criterion => (
                    <ScoreBar
                      key={criterion.name}
                      label={criterion.label}
                      score={criterion.score}
                      weight={criterion.weight}
                      isCritical={criterion.is_critical}
                      saving={scoringCriterion === criterion.name}
                      onScore={selectedPanel.finalized_at ? undefined : (v) => handleScoreCriterion(criterion.name, v)}
                    />
                  ))}
                </div>
                {/* Weighted total, with the coverage it rests on. A score over 2 of 4
                    criteria is not the same claim as one over 4 of 4, and the previous
                    version rendered them identically. */}
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Weighted Total</span>
                    {selectedPanel.weighted_score !== null ? (
                      <span className={`text-lg font-bold ${
                        selectedPanel.weighted_score >= 70 ? 'text-emerald-600' :
                        selectedPanel.weighted_score >= 50 ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        {selectedPanel.weighted_score.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-slate-400">not scored</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {selectedPanel.scored_criteria ?? 0} of {selectedPanel.total_criteria ?? selectedPanel.criteria.length} criteria scored
                    {selectedPanel.weighted_score !== null && (selectedPanel.scored_criteria ?? 0) < (selectedPanel.total_criteria ?? selectedPanel.criteria.length) && (
                      <> &mdash; the score covers only those, and is not a whole-panel result</>
                    )}
                  </div>
                  {(selectedPanel.unscored_critical_criteria?.length ?? 0) > 0 && (
                    <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">
                      <span className="font-semibold">Cannot validate:</span>{' '}
                      {selectedPanel.unscored_critical_criteria!.join(', ').replace(/_/g, ' ')}{' '}
                      {selectedPanel.unscored_critical_criteria!.length === 1 ? 'is a critical gate that' : 'are critical gates that'}{' '}
                      nobody has scored. A critical gate cannot pass unassessed.
                    </div>
                  )}
                  {selectedPanel.persona_consensus_score != null && (
                    <div className="text-[10px] text-slate-500 mt-1.5">
                      Persona consensus {selectedPanel.persona_consensus_score.toFixed(0)}% &mdash; the reviewers&apos;
                      overall opinion, reported separately. It is not a measurement of any individual criterion.
                    </div>
                  )}
                </div>
              </div>

              {/* Persona Findings Grid */}
              <div>
                <div className="text-sm font-semibold text-slate-900 mb-3">Persona Findings</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(['security_architect', 'penetration_tester', 'compliance_reviewer', 'cross_repo_analyzer'] as ValidationPersona[]).map(persona => {
                    const finding = selectedPanel.persona_findings.find(f => f.persona === persona);
                    return (
                      <PersonaCard
                        key={persona}
                        persona={persona}
                        finding={finding}
                        onSubmit={handleSubmitFinding}
                        disabled={isFinalized}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Finalize Button */}
              {!isFinalized && selectedPanel.persona_findings.length > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={handleFinalizePanel}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                  >
                    <Icon name="check-badge" className="w-5 h-5" />
                    Finalize Verdict
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 rounded-xl bg-slate-50 border border-dashed border-slate-300">
              <div className="text-center">
                <Icon name="shield-check" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <div className="text-sm text-slate-500">Select a panel to view details</div>
                <div className="text-xs text-slate-400 mt-1">or create a new validation panel</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Panel Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Create Validation Panel</h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Target Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['harness_action', 'code_change', 'policy_change'] as ValidationTargetType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setCreateTargetType(type)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                        createTargetType === type
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Icon name={TARGET_TYPE_CONFIG[type].icon} className={`w-5 h-5 ${createTargetType === type ? 'text-blue-600' : 'text-slate-500'}`} />
                      <span className={`text-[10px] font-medium ${createTargetType === type ? 'text-blue-700' : 'text-slate-600'}`}>
                        {TARGET_TYPE_CONFIG[type].label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Target ID</label>
                <input
                  type="text"
                  value={createTargetId}
                  onChange={e => setCreateTargetId(e.target.value)}
                  placeholder="e.g., PR-1234, harness:claude-code/session-xyz"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Description (optional)</label>
                <textarea
                  value={createDescription}
                  onChange={e => setCreateDescription(e.target.value)}
                  placeholder="Brief description of what is being validated..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePanel}
                disabled={!createTargetId.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60] bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4">
          <Icon name="information-circle" className="w-5 h-5 text-blue-400" />
          <span className="text-sm">{toast}</span>
        </div>
      )}
    </div>
  );
}
