/**
 * ShadowAI — Shadow AI detection & mitigation.
 *
 * Closes the AWS agentic-governance gap "Mitigating shadow AI": surface
 * ungoverned/unapproved AI assets, quantify governed-vs-shadow coverage, show
 * the detection sources feeding the signal, and offer a path to governance.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRelativeTime } from '@/lib/utils';
import {
  SHADOW_ASSETS,
  SHADOW_DETECTION_SOURCES,
  SHADOW_COVERAGE,
  type ShadowSeverity,
  type ShadowStatus,
  type ShadowAssetType,
} from './mockData';
import { MockDataBadge, LiveDataBadge } from './DataSourceIndicator';
import UnifiedGuide, { SHADOW_AI_GUIDE } from './UnifiedGuide';
import LiveAiCallers from './LiveAiCallers';
import {
  governDeveloperAiApi,
  type ShadowAiDetection,
  type GuardDutyAISeverity,
} from '../../api/client';
import { Icon } from './icons';
import { useGuardDutyAIFindings } from './useGuardDutyAIFindings';
import { useSecurityHubAIInventory, type DiscoveredAIAsset, type AIAssetType } from './useSecurityHubAIInventory';

const severityBg: Record<ShadowSeverity, string> = {
  critical: 'bg-rose-50 text-rose-700 border-rose-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-50 text-slate-600 border-slate-200',
};

const statusBg: Record<ShadowStatus, string> = {
  detected: 'bg-rose-100 text-rose-700',
  investigating: 'bg-amber-100 text-amber-700',
  onboarding: 'bg-blue-100 text-blue-700',
  remediated: 'bg-emerald-100 text-emerald-700',
  blocked: 'bg-slate-200 text-slate-700',
};

// Asset type icons — maps to the Icon component's icon names
const typeIconName: Record<ShadowAssetType | 'user', string> = {
  agent: 'cpu-chip',           // Agents
  model: 'cube',              // Models
  tool: 'wrench',             // Tools
  'mcp-server': 'server-stack', // MCP servers
  'api-key': 'lock-closed',   // API keys
  'coding-tool': 'code-bracket', // Coding tools
  user: 'user',               // Unapproved users
};

const STORAGE_KEY = 'ava_shadow_ai_dispositions';

// formatRelativeTime imported from @/lib/utils

/** Map API shadow detection data to component's ShadowAsset format */
function mapApiToAssets(data: ShadowAiDetection): Array<{
  id: string;
  name: string;
  type: ShadowAssetType | 'user';
  severity: ShadowSeverity;
  status: ShadowStatus;
  detectedVia: string;
  detectedDate: string;
  suspectedOwner: string;
  businessUnit: string;
  risk: string;
  recommendedAction: string;
}> {
  const assets: Array<{
    id: string;
    name: string;
    type: ShadowAssetType | 'user';
    severity: ShadowSeverity;
    status: ShadowStatus;
    detectedVia: string;
    detectedDate: string;
    suspectedOwner: string;
    businessUnit: string;
    risk: string;
    recommendedAction: string;
  }> = [];

  // Map unapproved users
  data.unapproved_users.forEach((user, i) => {
    assets.push({
      id: `api-user-${i}`,
      name: user.email,
      type: 'user' as const,
      severity: 'critical',
      status: 'detected',
      detectedVia: user.source,
      detectedDate: user.first_seen.split('T')[0],
      suspectedOwner: user.email.split('@')[0],
      businessUnit: 'Unknown',
      risk: `${user.tokens.toLocaleString()} tokens consumed via ${user.source}`,
      recommendedAction: user.recommended_action,
    });
  });

  // Map unknown tools
  data.unknown_tools.forEach((tool, i) => {
    assets.push({
      id: `api-tool-${i}`,
      name: tool.tool_name,
      type: 'tool',
      severity: 'high',
      status: 'detected',
      detectedVia: tool.evidence,
      detectedDate: tool.first_seen.split('T')[0],
      suspectedOwner: `${tool.users} user${tool.users !== 1 ? 's' : ''}`,
      businessUnit: 'Unknown',
      risk: `${tool.requests.toLocaleString()} requests from ${tool.users} user${tool.users !== 1 ? 's' : ''}`,
      recommendedAction: tool.recommended_action,
    });
  });

  // Map unapproved models
  data.unapproved_models.forEach((model, i) => {
    assets.push({
      id: `api-model-${i}`,
      name: model.model_id,
      type: 'model',
      severity: 'high',
      status: 'detected',
      detectedVia: model.evidence,
      detectedDate: new Date().toISOString().split('T')[0],
      suspectedOwner: `${model.users} user${model.users !== 1 ? 's' : ''}`,
      businessUnit: 'Unknown',
      risk: `$${model.cost.toFixed(2)} cost, ${model.requests.toLocaleString()} requests`,
      recommendedAction: model.recommended_action,
    });
  });

  return assets;
}

// ─────────────────────────── GuardDuty AI Protection Card ───────────────────────────

const GUARDDUTY_SEVERITY_STYLES: Record<GuardDutyAISeverity, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  HIGH: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  MEDIUM: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  LOW: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
};

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  prompt_injection: { label: 'Prompt Injection', icon: 'syringe' },
  data_exfiltration: { label: 'Data Exfiltration', icon: 'document-arrow-down' },
  model_abuse: { label: 'Model Abuse', icon: 'exclamation-triangle' },
  credential_access: { label: 'Credential Access', icon: 'lock-closed' },
  unauthorized_access: { label: 'Unauthorized Access', icon: 'shield-exclamation' },
  anomalous_behavior: { label: 'Anomalous Behavior', icon: 'signal' },
};

function GuardDutyAIProtectionCard() {
  const { findings, summary, loading, isLive, error, refresh } = useGuardDutyAIFindings(10);
  const [expanded, setExpanded] = useState(false);

  const hasFindings = summary.total > 0;
  const hasCriticalOrHigh = summary.critical > 0 || summary.high > 0;

  return (
    <div className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm mb-6 ${
      hasCriticalOrHigh ? 'border-rose-200' : 'border-slate-200/60'
    }`}>
      {/* Header */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              hasCriticalOrHigh ? 'bg-rose-100' : 'bg-indigo-100'
            }`}>
              <Icon name="shield-exclamation" className={`w-5 h-5 ${
                hasCriticalOrHigh ? 'text-rose-600' : 'text-indigo-600'
              }`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">GuardDuty AI Protection</span>
                {isLive ? (
                  <LiveDataBadge source="GuardDuty" detail="Live AI-related threat findings from Amazon GuardDuty" />
                ) : (
                  <MockDataBadge integration="Enable GuardDuty AI Protection for live threat detection" />
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                AI-focused threat detection: prompt injection, data exfiltration, model abuse, and anomalous AI usage patterns.
              </p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Refresh findings"
          >
            <Icon name={loading ? 'spinner' : 'arrow-path'} className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Severity counts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((severity) => {
            const count = summary[severity.toLowerCase() as 'critical' | 'high' | 'medium' | 'low'];
            const styles = GUARDDUTY_SEVERITY_STYLES[severity];
            return (
              <div key={severity} className={`rounded-lg p-2 border ${styles.border} ${styles.bg}`}>
                <div className={`text-lg font-bold ${styles.text}`}>{count}</div>
                <div className={`text-[10px] font-medium ${styles.text} opacity-80`}>{severity}</div>
              </div>
            );
          })}
        </div>

        {/* Category breakdown (compact) */}
        {hasFindings && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {Object.entries(summary.byCategory).map(([category, count]) => {
              const meta = CATEGORY_LABELS[category] || { label: category, icon: 'exclamation-circle' };
              return (
                <span key={category} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-100">
                  <Icon name={meta.icon as any} className="w-3 h-3" />
                  {meta.label}: {count}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent findings list */}
      {hasFindings && (
        <div className="p-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            <span>Recent AI Threat Findings ({findings.length})</span>
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} className="w-4 h-4" />
          </button>

          {expanded && (
            <div className="space-y-2 mt-2">
              {findings.slice(0, 5).map((finding) => {
                const styles = GUARDDUTY_SEVERITY_STYLES[finding.severity];
                const categoryMeta = CATEGORY_LABELS[finding.ai_category] || { label: finding.ai_category, icon: 'exclamation-circle' };
                return (
                  <div key={finding.id} className={`border-l-2 ${styles.border} bg-slate-50/50 rounded-r-lg p-3`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${styles.bg} ${styles.text}`}>
                            {finding.severity}
                          </span>
                          <span className="text-[10px] text-slate-400">{formatRelativeTime(finding.created_at)}</span>
                        </div>
                        <div className="text-xs font-medium text-slate-800 mt-1 line-clamp-1">{finding.title}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{finding.description}</div>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Icon name={categoryMeta.icon as any} className="w-3 h-3" />
                            {categoryMeta.label}
                          </span>
                          <span>{finding.service}</span>
                          <span>{finding.region}</span>
                          <span className="text-slate-300">|</span>
                          <span>Confidence: {finding.confidence}%</span>
                        </div>
                      </div>
                      {finding.investigate_url && (
                        <a
                          href={finding.investigate_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 px-2 py-1 text-[10px] font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors"
                        >
                          Investigate
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}

              {findings.length > 5 && (
                <div className="text-center text-[11px] text-slate-400 py-2">
                  + {findings.length - 5} more findings
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasFindings && !loading && (
        <div className="p-5 text-center">
          <Icon name="shield-check" className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <div className="text-sm font-medium text-slate-600">No AI Threat Findings</div>
          <div className="text-[11px] text-slate-400 mt-1">
            GuardDuty AI Protection is monitoring for AI-related threats
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-3 mx-5 mb-5 bg-rose-50 rounded-lg border border-rose-200">
          <div className="text-[11px] text-rose-700">{error}</div>
        </div>
      )}

      {/* Footer link */}
      <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 rounded-b-xl">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-slate-400">
            Detects threats targeting: Bedrock, SageMaker, AI agents, and ML workloads
          </div>
          <a
            href="https://console.aws.amazon.com/guardduty/home"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            Open GuardDuty Console
            <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Security Hub Discovery Card ───────────────────────────

const ASSET_TYPE_ICONS: Record<AIAssetType, string> = {
  'bedrock-model': 'cube',
  'bedrock-agent': 'cpu-chip',
  'bedrock-guardrail': 'shield-check',
  'bedrock-kb': 'book-open',
  'sagemaker-endpoint': 'server-stack',
};

const ASSET_TYPE_LABELS: Record<AIAssetType, string> = {
  'bedrock-model': 'Bedrock Models',
  'bedrock-agent': 'Agents',
  'bedrock-guardrail': 'Guardrails',
  'bedrock-kb': 'Knowledge Bases',
  'sagemaker-endpoint': 'SageMaker Endpoints',
};

const RISK_STYLES: Record<DiscoveredAIAsset['riskLevel'], { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
};

function SecurityHubDiscoveryCard() {
  const {
    discoveredAssets,
    summary,
    loading,
    isLive,
    refresh,
  } = useSecurityHubAIInventory(60_000);

  const [expanded, setExpanded] = useState(false);
  const [registeringIds, setRegisteringIds] = useState<Set<string>>(new Set());

  // Derive values from hook results
  const assets = discoveredAssets ?? [];
  const unregisteredAssets = assets.filter(a => a.registrationStatus === 'unregistered');
  const byType = summary?.byType ?? {};
  const totalDiscovered = summary?.total ?? 0;
  const unregisteredCount = summary?.unregisteredCount ?? 0;
  const registeredCount = summary?.registeredCount ?? 0;
  const criticalRiskCount = assets.filter(a => a.highestSeverity === 'CRITICAL').length;
  const highRiskCount = assets.filter(a => a.highestSeverity === 'HIGH').length;

  const hasUnregistered = unregisteredCount > 0;
  const hasCriticalOrHigh = criticalRiskCount > 0 || highRiskCount > 0;

  // Handle register action (mock - would integrate with agent registry)
  const handleRegister = (asset: DiscoveredAIAsset) => {
    setRegisteringIds(prev => new Set(prev).add(asset.id));
    // Simulate registration - in real implementation this would call the agent registry API
    setTimeout(() => {
      setRegisteringIds(prev => {
        const next = new Set(prev);
        next.delete(asset.id);
        return next;
      });
      // Show success feedback - the asset would be moved to registered in real implementation
    }, 1500);
  };

  return (
    <div className={`bg-white/80 backdrop-blur-sm rounded-xl border shadow-sm mb-6 ${
      hasCriticalOrHigh && hasUnregistered ? 'border-amber-200' : 'border-slate-200/60'
    }`}>
      {/* Header */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              hasCriticalOrHigh && hasUnregistered ? 'bg-amber-100' : 'bg-blue-100'
            }`}>
              <Icon name="rectangle-stack" className={`w-5 h-5 ${
                hasCriticalOrHigh && hasUnregistered ? 'text-amber-600' : 'text-blue-600'
              }`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">Security Hub AI Discovery</span>
                {isLive ? (
                  <LiveDataBadge source="Security Hub" detail="Live AI asset discovery from AWS Security Hub" />
                ) : (
                  <MockDataBadge integration="Enable Security Hub for live AI asset discovery" />
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Discover AI assets (Bedrock models, agents, guardrails, knowledge bases, SageMaker endpoints) and identify unregistered shadow AI.
              </p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Refresh discovery"
          >
            <Icon name={loading ? 'spinner' : 'arrow-path'} className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <div className="rounded-lg p-2 border border-slate-200 bg-slate-50">
            <div className="text-lg font-bold text-slate-800">{totalDiscovered}</div>
            <div className="text-[10px] font-medium text-slate-500">DISCOVERED</div>
          </div>
          <div className={`rounded-lg p-2 border ${hasUnregistered ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className={`text-lg font-bold ${hasUnregistered ? 'text-amber-700' : 'text-emerald-700'}`}>{unregisteredCount}</div>
            <div className={`text-[10px] font-medium ${hasUnregistered ? 'text-amber-600' : 'text-emerald-600'}`}>UNREGISTERED</div>
          </div>
          <div className="rounded-lg p-2 border border-emerald-200 bg-emerald-50">
            <div className="text-lg font-bold text-emerald-700">{registeredCount}</div>
            <div className="text-[10px] font-medium text-emerald-600">REGISTERED</div>
          </div>
          <div className={`rounded-lg p-2 border ${criticalRiskCount > 0 ? 'border-rose-200 bg-rose-50' : highRiskCount > 0 ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-slate-50'}`}>
            <div className={`text-lg font-bold ${criticalRiskCount > 0 ? 'text-rose-700' : highRiskCount > 0 ? 'text-orange-700' : 'text-slate-600'}`}>
              {criticalRiskCount + highRiskCount}
            </div>
            <div className={`text-[10px] font-medium ${criticalRiskCount > 0 ? 'text-rose-600' : highRiskCount > 0 ? 'text-orange-600' : 'text-slate-500'}`}>HIGH RISK</div>
          </div>
        </div>

        {/* Type breakdown */}
        {byType.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {byType.map((typeInfo) => (
              <span key={typeInfo.type} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-100">
                <Icon name={typeInfo.icon as any} className="w-3 h-3" />
                {typeInfo.label}: {typeInfo.total}
                {typeInfo.unregistered > 0 && (
                  <span className="text-amber-600">({typeInfo.unregistered} shadow)</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Unregistered assets list */}
      {hasUnregistered && (
        <div className="p-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            <span>Unregistered AI Assets ({unregisteredCount}) - Potential Shadow AI</span>
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} className="w-4 h-4" />
          </button>

          {expanded && (
            <div className="space-y-2 mt-2">
              {unregisteredAssets.slice(0, 5).map((asset) => {
                const riskStyles = RISK_STYLES[asset.riskLevel];
                const isRegistering = registeringIds.has(asset.id);
                return (
                  <div key={asset.id} className={`border-l-2 ${riskStyles.border} bg-slate-50/50 rounded-r-lg p-3`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon name={ASSET_TYPE_ICONS[asset.type] as any} className="w-4 h-4 text-slate-500" />
                          <span className="text-xs font-medium text-slate-800 truncate">{asset.name}</span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${riskStyles.bg} ${riskStyles.text}`}>
                            {asset.riskLevel.toUpperCase()}
                          </span>
                          <span className="text-[10px] text-slate-400">{formatRelativeTime(asset.lastSeen)}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 truncate">{asset.resourceArn}</div>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                          <span>{ASSET_TYPE_LABELS[asset.type]}</span>
                          <span>{asset.region}</span>
                          {asset.securityFindingCount > 0 && (
                            <span className="text-amber-600">{asset.securityFindingCount} finding{asset.securityFindingCount !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleRegister(asset)}
                          disabled={isRegistering}
                          className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${
                            isRegistering
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'text-white bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {isRegistering ? (
                            <span className="flex items-center gap-1">
                              <Icon name="spinner" className="w-3 h-3 animate-spin" />
                              Registering
                            </span>
                          ) : (
                            'Register'
                          )}
                        </button>
                        <a
                          href={asset.consoleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                          title="View in AWS Console"
                        >
                          <Icon name="arrow-top-right-on-square" className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}

              {unregisteredAssets.length > 5 && (
                <div className="text-center text-[11px] text-slate-400 py-2">
                  + {unregisteredAssets.length - 5} more unregistered assets
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state for unregistered */}
      {!hasUnregistered && !loading && (
        <div className="p-5 text-center">
          <Icon name="check-circle" className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <div className="text-sm font-medium text-slate-600">All AI Assets Registered</div>
          <div className="text-[11px] text-slate-400 mt-1">
            No unregistered AI assets detected in Security Hub
          </div>
        </div>
      )}

      {/* Footer link */}
      <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 rounded-b-xl">
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-slate-400">
            Discovers: Bedrock Models, Agents, Guardrails, Knowledge Bases, SageMaker Endpoints
          </div>
          <a
            href="https://console.aws.amazon.com/securityhub/home"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            Open Security Hub Console
            <Icon name="arrow-top-right-on-square" className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ShadowAI() {
  const [severityFilter, setSeverityFilter] = useState<'all' | ShadowSeverity>('all');
  const [apiData, setApiData] = useState<ShadowAiDetection | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [apiSource, setApiSource] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Track mounted state for safe async updates
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch shadow AI data from API
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    governDeveloperAiApi.usage()
      .then(response => {
        if (!cancelled && response.shadow_ai) {
          setApiData(response.shadow_ai);
          setIsLive(response.live);
          setApiSource(response.source);
        }
      })
      .catch(() => {
        // API unavailable — will use mock data as fallback
        if (!cancelled) {
          setApiData(null);
          setIsLive(false);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // User dispositions (Onboard → onboarding, Block → blocked) persisted across sessions,
  // keyed by asset id and layered over the detected baseline.
  const [dispositions, setDispositions] = useState<Record<string, ShadowStatus>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'info' } | null>(null);

  const setDisposition = (id: string, status: ShadowStatus, message: string) => {
    setDispositions(prev => {
      const next = { ...prev, [id]: status };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* non-fatal */ }
      return next;
    });
    setToast({ message, tone: status === 'blocked' ? 'info' : 'success' });
    setTimeout(() => {
      if (mountedRef.current) {
        setToast(null);
      }
    }, 3200);
  };

  // Determine if we have live API data with actual findings
  const hasApiFindings = apiData && (
    apiData.unapproved_users.length > 0 ||
    apiData.unknown_tools.length > 0 ||
    apiData.unapproved_models.length > 0
  );

  // Base assets — use API data if available with findings, otherwise use mock
  const baseAssets = useMemo(() => {
    if (hasApiFindings && apiData) {
      return mapApiToAssets(apiData);
    }
    return SHADOW_ASSETS;
  }, [hasApiFindings, apiData]);

  // Effective assets = baseline detections with any user disposition applied.
  const assets = useMemo(
    () => baseAssets.map(a => (dispositions[a.id] ? { ...a, status: dispositions[a.id] } : a)),
    [baseAssets, dispositions],
  );

  const filtered = useMemo(() => assets.filter(a =>
    severityFilter === 'all' || a.severity === severityFilter
  ), [assets, severityFilter]);

  // KPIs — recompute from effective state so dispositions move the numbers.
  const totalShadow = assets.length;
  const critical = assets.filter(a => a.severity === 'critical').length;
  const unresolved = assets.filter(a => a.status === 'detected' || a.status === 'investigating').length;
  const inOnboarding = assets.filter(a => a.status === 'onboarding').length;

  // Coverage rollup — onboarded/blocked assets are no longer "shadow", so coverage rises.
  const resolvedByType = useMemo(() => {
    const counts: Partial<Record<ShadowAssetType, number>> = {};
    assets.forEach(a => {
      if (a.status === 'onboarding' || a.status === 'remediated' || a.status === 'blocked') {
        counts[a.type] = (counts[a.type] ?? 0) + 1;
      }
    });
    return counts;
  }, [assets]);

  const coverageRows = useMemo(() => SHADOW_COVERAGE.map(c => {
    const resolved = Math.min(resolvedByType[c.type] ?? 0, c.shadow);
    return { ...c, governed: c.governed + resolved, shadow: c.shadow - resolved };
  }), [resolvedByType]);

  const totalGoverned = coverageRows.reduce((s, c) => s + c.governed, 0);
  const totalDiscovered = coverageRows.reduce((s, c) => s + c.governed + c.shadow, 0);
  const coveragePct = Math.round((totalGoverned / totalDiscovered) * 100);

  return (
    <div className="min-h-[calc(100vh-4rem)] relative">
      <div className="relative max-w-7xl mx-auto px-6 py-10">
        <Link to="/govern" className="text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium">
          ← Govern
        </Link>

        {/* Hero Card */}
        <div className="mt-3 mb-6 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Shadow AI Detection</h1>
                  {hasApiFindings && isLive ? (
                    <LiveDataBadge source={apiSource} detail="Live shadow AI detection from Developer AI API" />
                  ) : (
                    <MockDataBadge integration="Live CloudTrail AI-caller signal below; asset list & coverage illustrative" />
                  )}
                </div>
                <p className="text-slate-500 mt-1 max-w-2xl text-sm">
                  Discover ungoverned AI assets before they become incidents. Track governed-vs-shadow coverage and route discovered assets onto the governed path.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link to="/govern/prompt-governance" className="text-xs text-violet-600 hover:text-violet-700 font-medium">
                Prompt Governance →
              </Link>
              <Link to="/govern/agents" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                Agent Registry →
              </Link>
            </div>
          </div>
        </div>

        {/* Unified Guide — How to Use + Make Live in AWS */}
        <UnifiedGuide {...SHADOW_AI_GUIDE} />

        {/* Prompt Governance Quick Link */}
        <Link
          to="/govern/prompt-governance"
          className="block mb-6 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200 p-4 hover:border-violet-300 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-violet-800">Prompt Governance</div>
                <div className="text-xs text-violet-600">Analyze prompts for PII, secrets, policy violations, grounding, and reasoning traces</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">3 flagged</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-semibold">1 blocked</span>
              <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Shadow Assets', value: totalShadow, sub: 'discovered ungoverned', tone: 'text-slate-900' },
            { label: 'Critical', value: critical, sub: 'immediate action', tone: critical > 0 ? 'text-rose-600' : 'text-emerald-600' },
            { label: 'Unresolved', value: unresolved, sub: 'detected / investigating', tone: unresolved > 0 ? 'text-amber-600' : 'text-emerald-600' },
            { label: 'In Onboarding', value: inOnboarding, sub: 'joining governed path', tone: 'text-blue-600' },
            { label: 'Governance Coverage', value: `${coveragePct}%`, sub: `${totalGoverned}/${totalDiscovered} assets`, tone: coveragePct >= 85 ? 'text-emerald-600' : 'text-amber-600' },
          ].map(k => (
            <div key={k.label} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{k.label}</div>
              <div className={`text-2xl font-semibold mt-1 ${k.tone}`}>{k.value}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* GuardDuty AI Protection — AWS threat detection for AI workloads */}
        <GuardDutyAIProtectionCard />

        {/* Security Hub AI Discovery — discover AI assets and identify shadow AI */}
        <SecurityHubDiscoveryCard />

        {/* Shadow AI Cost Estimate - shown when live API data is available */}
        {apiData && apiData.shadow_cost_estimate > 0 && (
          <div className="bg-gradient-to-r from-rose-50 to-orange-50 rounded-xl border border-rose-200 p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
                  <Icon name="currency-dollar" className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-rose-800">Estimated Shadow AI Cost</div>
                  <div className="text-xs text-rose-600">
                    Ungoverned usage consuming ${apiData.shadow_cost_estimate.toFixed(2)} — {apiData.total_shadow_events.toLocaleString()} events detected
                  </div>
                </div>
              </div>
              <div className="text-2xl font-bold text-rose-700">${apiData.shadow_cost_estimate.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* Coverage by type */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
          <div className="text-sm font-semibold text-slate-900 mb-1">Governed vs Shadow Coverage</div>
          <div className="text-[11px] text-slate-500 mb-4">
            Governed counts come live from the <Link to="/govern/agents" className="text-blue-600 hover:text-blue-700 font-medium">Agent Registry</Link> — onboarding a shadow asset moves it onto the governed side here.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {coverageRows.map(c => {
              const total = c.governed + c.shadow;
              const pct = Math.round((c.governed / total) * 100);
              return (
                <div key={c.type} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-700">{c.label}</span>
                    <span className={`text-xs font-bold ${pct >= 85 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>{pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    <div className="h-full bg-rose-400" style={{ width: `${100 - pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] mt-1.5">
                    <span className="text-emerald-600">{c.governed} governed</span>
                    <span className="text-rose-500">{c.shadow} shadow</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* How detection works — explainer */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-slate-900">How Detection Works in AWS</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">AWS-NATIVE PIPELINE</span>
          </div>
          <div className="text-[11px] text-slate-500 mb-4">
            Discovery is a data pipeline, not magic: AWS logs and scanners emit signals → EventBridge correlates them against the Agent Registry → unmatched assets surface here as findings.
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            {[
              { label: 'CloudTrail · VPC Flow · Macie · Config', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
              { label: 'EventBridge correlation', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
              { label: 'Diff vs Agent Registry', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
              { label: 'Shadow findings', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg border font-medium ${step.tone}`}>{step.label}</span>
                {i < arr.length - 1 && <span className="text-slate-300">→</span>}
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-amber-700 bg-amber-50/60 -mx-2 px-2 py-2 rounded">
            <span className="font-semibold">Coverage limit:</span> AWS-native signals catch AWS-mediated AI (Bedrock, SageMaker, in-VPC workloads). Consumer tools, browser extensions, and fully off-AWS SaaS require an external CASB/EDR integration.
          </div>
        </div>

        {/* Detection sources */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-sm mb-6">
          <div className="text-sm font-semibold text-slate-900 mb-1">Detection Sources</div>
          <div className="text-[11px] text-slate-500 mb-4">Signals feeding shadow AI discovery, with the AWS services behind each.</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SHADOW_DETECTION_SOURCES.map(s => (
              <div key={s.name} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800">{s.name}</span>
                    {!s.native && <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">EXTERNAL</span>}
                  </div>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${
                    s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : s.status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                  }`}>{s.status}</span>
                </div>
                <div className="text-[10px] text-slate-500 leading-relaxed">{s.description}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {s.awsServices.map(svc => (
                    <span key={svc} className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${s.native ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{svc}</span>
                  ))}
                </div>
                <div className="text-[10px] text-slate-400 mt-2">{s.findings30d} findings / 30d</div>
              </div>
            ))}
          </div>
        </div>

        {/* Live AWS — real AI callers from CloudTrail, cross-referenced vs the registry */}
        <LiveAiCallers />

        {/* Detected assets */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-slate-900">Detected Shadow Assets</div>
          <div className="flex gap-1">
            {(['all', 'critical', 'high', 'medium', 'low'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
                  severityFilter === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {filtered.map(a => {
            const resolved = a.status === 'onboarding' || a.status === 'blocked' || a.status === 'remediated';
            const borderTone = a.severity === 'critical' ? 'border-l-rose-400' : a.severity === 'high' ? 'border-l-orange-400' : a.severity === 'medium' ? 'border-l-amber-400' : 'border-l-slate-300';
            return (
            <div key={a.id} className={`bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 border-l-4 ${borderTone} shadow-sm p-4 ${resolved ? 'opacity-75' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Icon name={typeIconName[a.type as keyof typeof typeIconName] || 'exclamation-circle'} className="w-5 h-5 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{a.name}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${severityBg[a.severity]}`}>{a.severity}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${statusBg[a.status]}`}>{a.status}</span>
                    <span className="text-[10px] text-slate-400 capitalize">{a.type.replace('-', ' ')}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5">{a.risk}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
                    <span>Owner: <span className="text-slate-700">{a.suspectedOwner}</span></span>
                    <span>BU: <span className="text-slate-700">{a.businessUnit}</span></span>
                    <span>Via: <span className="text-slate-700">{a.detectedVia}</span></span>
                    <span>Detected: <span className="text-slate-700">{a.detectedDate}</span></span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide">Recommended:</span>
                    <span className="text-xs text-slate-700">{a.recommendedAction}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  {resolved ? (
                    <>
                      <span className="px-3 py-1.5 text-[11px] font-medium text-center text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg capitalize">
                        {a.status === 'blocked' ? 'Blocked' : 'On governed path'}
                      </span>
                      <button
                        onClick={() => setDisposition(a.id, 'investigating', `Reopened "${a.name}" for triage`)}
                        className="px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-700 rounded-lg transition-colors"
                      >
                        Undo
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setDisposition(a.id, 'onboarding', `"${a.name}" routed to governed onboarding`)}
                        className="px-3 py-1.5 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                      >
                        Onboard
                      </button>
                      <button
                        onClick={() => setDisposition(a.id, 'blocked', `"${a.name}" blocked pending review`)}
                        className="px-3 py-1.5 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        Block
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* Path to governance CTA */}
        <div className="bg-gradient-to-r from-indigo-50 via-violet-50 to-blue-50 rounded-xl border border-indigo-200/60 p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900 mb-1">Make the Governed Path the Easy Path</div>
          <div className="text-[11px] text-slate-500 mb-4">Shadow AI thrives when governance is slower than going around it. Reduce friction with self-service onboarding and clear value.</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link to="/secure" className="block p-3 bg-white/70 rounded-lg border border-slate-200/60 hover:border-indigo-300 transition-colors">
              <div className="text-xs font-semibold text-indigo-700">Self-Service Onboarding →</div>
              <div className="text-[11px] text-slate-500 mt-1">Responsive approval workflow so teams choose the governed path.</div>
            </Link>
            <Link to="/govern/agents" className="block p-3 bg-white/70 rounded-lg border border-slate-200/60 hover:border-indigo-300 transition-colors">
              <div className="text-xs font-semibold text-indigo-700">Register in Agent Registry →</div>
              <div className="text-[11px] text-slate-500 mt-1">Bring discovered agents under capability & permission governance.</div>
            </Link>
            <Link to="/govern/compliance" className="block p-3 bg-white/70 rounded-lg border border-slate-200/60 hover:border-indigo-300 transition-colors">
              <div className="text-xs font-semibold text-indigo-700">Acceptable Use Policy →</div>
              <div className="text-[11px] text-slate-500 mt-1">Educate teams on permitted AI and shadow-AI prohibitions.</div>
            </Link>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 ${
            toast.tone === 'success' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white'
          }`}
          role="alert"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
